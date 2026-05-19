import initSqlJs from 'sql.js'
import path from 'path'
import fs from 'fs'
import { getTodayDate, getYesterdayDate, getDateDaysAgo } from './utils.mjs'
import { wasmBinary } from './wasmEmbed.mjs'
import { getUserDataDir, getProgramDir } from './paths.mjs'
import { DEFAULT_CONFIG } from './config.mjs'

// Allow overriding data directory for testing
let testDataDir = null

/**
 * Set a custom data directory for testing purposes
 * @param dir - Custom directory path, or null to reset to default
 */
export function setTestDataDir(dir) {
  testDataDir = dir
}

/**
 * Get the current data directory (test or default)
 */
function getDataDir() {
  return testDataDir || path.join(getUserDataDir(), 'data')
}

let DB_FILE = null // Will be set on init

// Export data directory getter for other modules
export { getDataDir, getUserDataDir }

let db = null
let SQL = null

/**
 * Parse sql.js result to array of objects
 * @param result - sql.js exec() result array
 */
function parseDbResult(result) {
  if (result.length === 0 || result[0].values.length === 0) return []
  const columns = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    columns.forEach((col, i) => obj[col] = row[i])
    return obj
  })
}

/**
 * Initialize database and create tables
 */
export async function initDatabase() {
  // Get dynamic data directory (may be set for testing)
  const dataDir = getDataDir()
  DB_FILE = path.join(dataDir, 'worklog.db')

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  // Initialize sql.js
  // In pkg mode: wasm is embedded via static import
  // In dev mode: fallback to file if wasmEmbed.mjs doesn't exist
  let sqlJsConfig = {}

  if (process.pkg && wasmBinary) {
    // Use embedded wasm binary
    sqlJsConfig = { wasmBinary }
    console.log('📦 Using embedded wasm binary')
  } else if (process.pkg) {
    // Fallback: load from exe directory
    const wasmPath = path.join(path.dirname(process.execPath), 'sql-wasm.wasm')
    if (fs.existsSync(wasmPath)) {
      sqlJsConfig = {
        locateFile: file => file.endsWith('.wasm') ? wasmPath : file
      }
      console.log('📦 Using wasm from exe directory')
    } else {
      throw new Error('sql-wasm.wasm not found. Please copy it to exe directory.')
    }
  } else {
    // Dev mode: load from node_modules or use embedded
    if (wasmBinary) {
      sqlJsConfig = { wasmBinary }
      console.log('📦 Using embedded wasm binary')
    } else {
      const wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
      sqlJsConfig = {
        locateFile: file => file.endsWith('.wasm') ? wasmPath : file
      }
    }
  }

  SQL = await initSqlJs(sqlJsConfig)

  // Load existing database or create new one
  if (fs.existsSync(DB_FILE)) {
    const buffer = fs.readFileSync(DB_FILE)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS worklog_history (
      id INTEGER PRIMARY KEY,
      issue_key TEXT,
      date TEXT,
      hours REAL,
      submitted_at TEXT,
      UNIQUE(issue_key, date)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS recent_tickets (
      issue_key TEXT PRIMARY KEY,
      summary TEXT,
      status TEXT,
      last_used TEXT,
      use_count INTEGER DEFAULT 1
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS allocation_history (
      id INTEGER PRIMARY KEY,
      date TEXT,
      allocation TEXT,
      created_at TEXT
    )
  `)

  // AI configuration table
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_config (
      id INTEGER PRIMARY KEY,
      automation_level TEXT DEFAULT 'semi',
      confidence_threshold INTEGER DEFAULT 85,
      auto_submit_time TEXT DEFAULT '17:30',
      notify_before_submit INTEGER DEFAULT 1,
      updated_at TEXT
    )
  `)

  // LLM call log for cost tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS llm_call_log (
      id INTEGER PRIMARY KEY,
      date TEXT,
      call_type TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost_usd REAL,
      cached INTEGER DEFAULT 0,
      model TEXT,
      created_at TEXT
    )
  `)

  // Evidence records per ticket per date
  db.run(`
    CREATE TABLE IF NOT EXISTS ticket_evidence (
      id INTEGER PRIMARY KEY,
      issue_key TEXT,
      date TEXT,
      evidence_type TEXT,
      evidence_weight REAL,
      evidence_source TEXT,
      created_at TEXT,
      UNIQUE(issue_key, date, evidence_type)
    )
  `)

  // AI decision history with LLM output
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_decision_history (
      id INTEGER PRIMARY KEY,
      date TEXT,
      decision_type TEXT,
      confidence_level TEXT,
      tickets_selected TEXT,
      allocation TEXT,
      llm_reasoning TEXT,
      llm_explanation TEXT,
      executed INTEGER DEFAULT 0,
      user_override INTEGER DEFAULT 0,
      created_at TEXT
    )
  `)

  // Insert default AI config if not exists
  const existingConfig = db.exec('SELECT id FROM ai_config LIMIT 1')
  if (existingConfig.length === 0 || existingConfig[0].values.length === 0) {
    const now = new Date().toISOString()
    db.run(`
      INSERT INTO ai_config (automation_level, confidence_threshold, updated_at)
      VALUES ('semi', 85, ?)
    `, [now])
  }

  // Save to disk
  saveDatabase()

  console.log('Database initialized at', DB_FILE)
}

/**
 * Save database to disk
 */
function saveDatabase() {
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_FILE, buffer)
}

/**
 * Check if worklog already submitted for a specific date (defaults to today)
 */
export function hasWorklogForDate(dateStr = null) {
  const date = dateStr || getTodayDate()
  const result = db.exec('SELECT COUNT(*) as count FROM worklog_history WHERE date = ?', [date])
  if (result.length === 0 || result[0].values.length === 0) return false
  return result[0].values[0][0] > 0
}

/**
 * Check if worklog already submitted for today (backward compatibility)
 */
export function hasWorklogForToday() {
  return hasWorklogForDate()
}

/**
 * Record a worklog submission
 * @param issueKey - Jira issue key
 * @param hours - Hours spent
 * @param dateStr - Optional date string (YYYY-MM-DD), defaults to today
 */
export function recordWorklog(issueKey, hours, dateStr = null) {
  const date = dateStr || getTodayDate()
  const now = new Date().toISOString()

  db.run(`
    INSERT OR REPLACE INTO worklog_history (issue_key, date, hours, submitted_at)
    VALUES (?, ?, ?, ?)
  `, [issueKey, date, hours, now])

  // Update recent tickets
  updateRecentTicket(issueKey, '', '')

  saveDatabase()
}

/**
 * Delete a worklog record
 * @param issueKey - Jira issue key
 * @param dateStr - Optional date string (YYYY-MM-DD), defaults to today
 */
export function deleteWorklogRecord(issueKey, dateStr = null) {
  const date = dateStr || getTodayDate()

  db.run(`
    DELETE FROM worklog_history WHERE issue_key = ? AND date = ?
  `, [issueKey, date])

  saveDatabase()
}

/**
 * Delete all worklog records for a date
 * @param dateStr - Optional date string (YYYY-MM-DD), defaults to today
 */
export function deleteWorklogForDate(dateStr = null) {
  const date = dateStr || getTodayDate()

  db.run(`
    DELETE FROM worklog_history WHERE date = ?
  `, [date])

  // Also delete allocation history for this date
  db.run(`
    DELETE FROM allocation_history WHERE date = ?
  `, [date])

  saveDatabase()
}

/**
 * Sync worklog records for a date with actual Jira worklogs
 * @param jiraWorklogs - Array of { issueKey, hours } from Jira
 * @param dateStr - Optional date string (YYYY-MM-DD), defaults to today
 */
export function syncWorklogForDate(jiraWorklogs, dateStr = null) {
  const date = dateStr || getTodayDate()

  // Delete existing records for this date
  db.run(`DELETE FROM worklog_history WHERE date = ?`, [date])

  // Insert new records from Jira
  const now = new Date().toISOString()
  for (const w of jiraWorklogs) {
    if (w.hours > 0) {
      db.run(`
        INSERT INTO worklog_history (issue_key, date, hours, submitted_at)
        VALUES (?, ?, ?, ?)
      `, [w.issueKey, date, w.hours, now])

      updateRecentTicket(w.issueKey, '', '')
    }
  }

  // Update allocation history
  const allocation = {}
  for (const w of jiraWorklogs) {
    if (w.hours > 0) {
      allocation[w.issueKey] = w.hours
    }
  }

  if (Object.keys(allocation).length > 0) {
    // Delete old allocation and insert new one
    db.run(`DELETE FROM allocation_history WHERE date = ?`, [date])
    db.run(`
      INSERT INTO allocation_history (date, allocation, created_at)
      VALUES (?, ?, ?)
    `, [date, JSON.stringify(allocation), now])
  } else {
    // No worklogs - delete allocation history
    db.run(`DELETE FROM allocation_history WHERE date = ?`, [date])
  }

  saveDatabase()
}

/**
 * Get recent tickets from history
 */
export function getRecentTickets(days = 7) {
  const start = getDateDaysAgo(days)

  const result = db.exec(`
    SELECT issue_key, summary, status, last_used, use_count
    FROM recent_tickets
    WHERE last_used >= ?
    ORDER BY use_count DESC, last_used DESC
    LIMIT 20
  `, [start])

  return parseDbResult(result)
}

/**
 * Update recent ticket cache
 */
export function updateRecentTicket(issueKey, summary, status) {
  const now = new Date().toISOString()

  // Check if exists
  const existing = db.exec('SELECT use_count FROM recent_tickets WHERE issue_key = ?', [issueKey])

  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run(`
      UPDATE recent_tickets
      SET summary = ?, status = ?, last_used = ?, use_count = use_count + 1
      WHERE issue_key = ?
    `, [summary, status, now, issueKey])
  } else {
    db.run(`
      INSERT INTO recent_tickets (issue_key, summary, status, last_used, use_count)
      VALUES (?, ?, ?, ?, 1)
    `, [issueKey, summary, status, now])
  }

  saveDatabase()
}

/**
 * Get yesterday's allocation
 */
export function getYesterdayAllocation() {
  const yesterday = getYesterdayDate()

  const result = db.exec(`
    SELECT allocation FROM allocation_history WHERE date = ?
    ORDER BY created_at DESC LIMIT 1
  `, [yesterday])

  if (result.length === 0 || result[0].values.length === 0) return null

  const allocationStr = result[0].values[0][0]
  if (allocationStr) {
    return JSON.parse(allocationStr)
  }
  return null
}

/**
 * Save allocation history
 * @param allocation - Allocation object { ticketKey: hours }
 * @param dateStr - Optional date string (YYYY-MM-DD), defaults to today
 * @param replace - If true, delete existing allocation for this date before inserting
 */
export function saveAllocationHistory(allocation, dateStr = null, replace = false) {
  const date = dateStr || getTodayDate()
  const now = new Date().toISOString()

  // If replace mode, delete existing allocation history for this date
  if (replace) {
    db.run(`DELETE FROM allocation_history WHERE date = ?`, [date])
  }

  db.run(`
    INSERT INTO allocation_history (date, allocation, created_at)
    VALUES (?, ?, ?)
  `, [date, JSON.stringify(allocation), now])

  // Update recent tickets for all used tickets
  for (const key of Object.keys(allocation)) {
    updateRecentTicket(key, '', '')
  }

  saveDatabase()
}

/**
 * Get allocation ratio from history
 */
export function getAllocationRatio(issueKeys) {
  // Get last 7 days of allocation history
  const start = getDateDaysAgo(7)

  const result = db.exec(`
    SELECT allocation FROM allocation_history
    WHERE date >= ?
    ORDER BY date DESC LIMIT 7
  `, [start])

  if (result.length === 0) return null

  // Aggregate hours for each ticket
  const totals = {}
  let grandTotal = 0

  for (const row of result[0].values) {
    const allocation = JSON.parse(row[0])
    for (const [key, hours] of Object.entries(allocation)) {
      totals[key] = (totals[key] || 0) + hours
      grandTotal += hours
    }
  }

  // Calculate ratios for requested keys
  const ratios = {}
  for (const key of issueKeys) {
    ratios[key] = totals[key] ? totals[key] / grandTotal : 1 / issueKeys.length
  }

  return ratios
}

/**
 * Check if allocation history exists for given tickets
 */
export function hasAllocationHistory(issueKeys) {
  const start = getDateDaysAgo(7)

  const result = db.exec(`
    SELECT allocation FROM allocation_history WHERE date >= ? LIMIT 1
  `, [start])

  if (result.length === 0) return false

  // Check if any of the keys were used before
  for (const row of result[0].values) {
    const allocation = JSON.parse(row[0])
    for (const key of issueKeys) {
      if (allocation[key]) return true
    }
  }

  return false
}

/**
 * Get worklog details for a specific date (defaults to today)
 */
export function getWorklogByDate(dateStr = null) {
  const date = dateStr || getTodayDate()

  const result = db.exec(`
    SELECT issue_key, hours, submitted_at FROM worklog_history WHERE date = ?
    ORDER BY submitted_at
  `, [date])

  if (result.length === 0 || result[0].values.length === 0) return []

  return result[0].values.map(row => ({
    issue_key: row[0],
    hours: row[1],
    submitted_at: row[2]
  }))
}

/**
 * Get today's worklog details (backward compatibility)
 */
export function getTodayWorklog() {
  return getWorklogByDate()
}

/**
 * Get worklog history for a date range
 */
export function getWorklogHistory(days = 7) {
  const start = getDateDaysAgo(days)

  const result = db.exec(`
    SELECT date, allocation, created_at FROM allocation_history
    WHERE date >= ?
    ORDER BY date DESC
  `, [start])

  if (result.length === 0 || result[0].values.length === 0) return []

  return result[0].values.map(row => ({
    date: row[0],
    allocation: JSON.parse(row[1]),
    created_at: row[2]
  }))
}

// ========== AI Configuration ==========

/**
 * Get AI configuration
 */
/**
 * Get AI automation config (LLM config is in config.yaml/.env)
 * Only returns automation-related settings
 */
export function getAiConfig() {
  const result = db.exec(`
    SELECT automation_level, confidence_threshold, auto_submit_time, notify_before_submit
    FROM ai_config LIMIT 1
  `)

  if (result.length === 0 || result[0].values.length === 0) {
    return { ...DEFAULT_CONFIG.ai }
  }

  const row = result[0].values[0]
  return {
    automation_level: row[0],
    confidence_threshold: row[1],
    auto_submit_time: row[2],
    notify_before_submit: row[3] === 1
  }
}

/**
 * Save AI automation config
 */
export function saveAiConfig(config) {
  const now = new Date().toISOString()

  db.run(`
    UPDATE ai_config SET
      automation_level = ?,
      confidence_threshold = ?,
      auto_submit_time = ?,
      notify_before_submit = ?,
      updated_at = ?
  `, [
    config.automation_level || DEFAULT_CONFIG.ai.automation_level,
    config.confidence_threshold || DEFAULT_CONFIG.ai.confidence_threshold,
    config.auto_submit_time || DEFAULT_CONFIG.ai.auto_submit_time,
    config.notify_before_submit ? 1 : 0,
    now
  ])

  saveDatabase()
}

// ========== LLM Call Logging ==========

/**
 * Log an LLM API call for cost tracking
 */
export function logLlmCall(callData) {
  const now = new Date().toISOString()
  const date = callData.date || getTodayDate()

  db.run(`
    INSERT INTO llm_call_log (date, call_type, input_tokens, output_tokens, cost_usd, cached, model, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    date,
    callData.call_type,
    callData.input_tokens || 0,
    callData.output_tokens || 0,
    callData.cost_usd || 0,
    callData.cached ? 1 : 0,
    callData.model || '',
    now
  ])

  saveDatabase()
}

/**
 * Get LLM cost statistics for a date range
 */
export function getLlmCostStats(days = 30) {
  const start = getDateDaysAgo(days)

  const result = db.exec(`
    SELECT date, call_type, input_tokens, output_tokens, cost_usd, cached, model, created_at
    FROM llm_call_log
    WHERE date >= ?
    ORDER BY date DESC
  `, [start])

  if (result.length === 0 || result[0].values.length === 0) {
    return {
      total_calls: 0,
      total_tokens: 0,
      total_cost_usd: 0,
      daily_stats: []
    }
  }

  const calls = result[0].values.map(row => ({
    date: row[0],
    call_type: row[1],
    input_tokens: row[2],
    output_tokens: row[3],
    cost_usd: row[4],
    cached: row[5] === 1,
    model: row[6],
    created_at: row[7]
  }))

  // Aggregate stats
  const total_calls = calls.length
  const total_tokens = calls.reduce((sum, c) => sum + c.input_tokens + c.output_tokens, 0)
  const total_cost_usd = calls.reduce((sum, c) => sum + c.cost_usd, 0)

  // Daily stats
  const dailyMap = {}
  for (const call of calls) {
    if (!dailyMap[call.date]) {
      dailyMap[call.date] = { date: call.date, calls: 0, cost: 0 }
    }
    dailyMap[call.date].calls++
    dailyMap[call.date].cost += call.cost_usd
  }

  return {
    total_calls,
    total_tokens,
    total_cost_usd,
    daily_stats: Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date))
  }
}

// ========== Ticket Evidence ==========

/**
 * Save evidence for a ticket
 */
export function saveTicketEvidence(evidence) {
  const now = new Date().toISOString()
  const date = evidence.date || getTodayDate()

  db.run(`
    INSERT OR REPLACE INTO ticket_evidence (issue_key, date, evidence_type, evidence_weight, evidence_source, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    evidence.issue_key,
    date,
    evidence.evidence_type,
    evidence.evidence_weight || 1.0,
    JSON.stringify(evidence.evidence_source || {}),
    now
  ])

  saveDatabase()
}

/**
 * Get all evidence for a specific date
 */
export function getTicketEvidenceByDate(dateStr = null) {
  const date = dateStr || getTodayDate()

  const result = db.exec(`
    SELECT issue_key, evidence_type, evidence_weight, evidence_source, created_at
    FROM ticket_evidence WHERE date = ?
    ORDER BY evidence_weight DESC
  `, [date])

  if (result.length === 0 || result[0].values.length === 0) return []

  return result[0].values.map(row => ({
    issue_key: row[0],
    evidence_type: row[1],
    evidence_weight: row[2],
    evidence_source: JSON.parse(row[3]),
    created_at: row[4]
  }))
}

// ========== AI Decision History ==========

/**
 * Save an AI decision with LLM output
 */
export function saveAiDecision(decision) {
  const now = new Date().toISOString()
  const date = decision.date || getTodayDate()

  db.run(`
    INSERT INTO ai_decision_history (date, decision_type, confidence_level, tickets_selected, allocation, llm_reasoning, llm_explanation, executed, user_override, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    date,
    decision.decision_type || 'recommendation',
    decision.confidence_level || 'medium',
    JSON.stringify(decision.tickets_selected || []),
    JSON.stringify(decision.allocation || {}),
    JSON.stringify(decision.llm_reasoning || {}),
    decision.llm_explanation || '',
    decision.executed ? 1 : 0,
    decision.user_override ? 1 : 0,
    now
  ])

  saveDatabase()

  // Return the inserted ID
  const idResult = db.exec('SELECT last_insert_rowid()')
  return idResult[0].values[0][0]
}

/**
 * Get AI decision for a specific date
 */
export function getAiDecisionByDate(dateStr = null) {
  const date = dateStr || getTodayDate()

  const result = db.exec(`
    SELECT id, decision_type, confidence_level, tickets_selected, allocation, llm_reasoning, llm_explanation, executed, user_override, created_at
    FROM ai_decision_history WHERE date = ?
    ORDER BY created_at DESC LIMIT 1
  `, [date])

  if (result.length === 0 || result[0].values.length === 0) return null

  const row = result[0].values[0]
  return {
    id: row[0],
    decision_type: row[1],
    confidence_level: row[2],
    tickets_selected: JSON.parse(row[3]),
    allocation: JSON.parse(row[4]),
    llm_reasoning: JSON.parse(row[5]),
    llm_explanation: row[6],
    executed: row[7] === 1,
    user_override: row[8] === 1,
    created_at: row[9]
  }
}

/**
 * Get AI decision history for a date range
 */
export function getAiDecisionHistory(days = 30) {
  const start = getDateDaysAgo(days)

  const result = db.exec(`
    SELECT id, date, decision_type, confidence_level, tickets_selected, allocation, llm_explanation, executed, user_override, created_at
    FROM ai_decision_history
    WHERE date >= ?
    ORDER BY date DESC, created_at DESC
  `, [start])

  if (result.length === 0 || result[0].values.length === 0) return []

  return result[0].values.map(row => ({
    id: row[0],
    date: row[1],
    decision_type: row[2],
    confidence_level: row[3],
    tickets_selected: JSON.parse(row[4]),
    allocation: JSON.parse(row[5]),
    llm_explanation: row[6],
    executed: row[7] === 1,
    user_override: row[8] === 1,
    created_at: row[9]
  }))
}

/**
 * Mark a decision as executed
 */
export function markDecisionExecuted(id) {
  db.run('UPDATE ai_decision_history SET executed = 1 WHERE id = ?', [id])
  saveDatabase()
}

/**
 * Mark a decision as user override
 */
export function markDecisionOverride(id, overrideAllocation) {
  db.run(`
    UPDATE ai_decision_history SET user_override = 1, allocation = ? WHERE id = ?
  `, [JSON.stringify(overrideAllocation), id])
  saveDatabase()
}