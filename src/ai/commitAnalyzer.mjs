/**
 * Commit Analyzer for AI time recording
 * Phase 1: Placeholder returning empty commits
 * Phase 2: Git integration for collecting and analyzing commits
 */

import { callLlm, buildCommitAnalysisPrompt, isLlmAvailable } from './llmEngine.mjs'

/**
 * Get today's git commits (Phase 1: placeholder)
 *
 * Phase 2 will implement:
 * - git log --since="midnight" --author="${getUserEmail()}"
 * - Parse commit message for ticket key pattern [A-Z]+-\d+
 * - Extract commit metadata (message, files, timestamp)
 *
 * @returns {Array} - List of commits (empty in Phase 1)
 */
export async function getTodayCommits() {
  // Phase 1: Return empty array
  // Phase 2 will implement actual git collection
  return []
}

/**
 * Get commits for a specific date (Phase 1: placeholder)
 *
 * @param {string} dateStr - Target date
 * @returns {Array} - List of commits (empty in Phase 1)
 */
export async function getCommitsByDate(dateStr) {
  // Phase 1: Return empty array
  return []
}

/**
 * Extract ticket key from commit message
 * Pattern: [A-Z]+-\d+ (e.g., PROJ-123, CAP-456)
 *
 * @param {string} message - Commit message
 * @param {string} pattern - Regex pattern for ticket key (default: [A-Z]+-\d+)
 * @returns {string|null} - Extracted ticket key or null
 */
export function extractTicketKey(message, pattern = '[A-Z]+-\\d+') {
  if (!message) return null

  const regex = new RegExp(pattern)
  const match = message.match(regex)

  return match ? match[0] : null
}

/**
 * Analyze commits with LLM
 * Returns matched tickets and allocation suggestions
 *
 * @param {Array} commits - List of commits with ticketKey
 * @param {Array} candidates - Candidate tickets to match against
 * @returns {object} - LLM analysis result
 */
export async function analyzeCommitsWithLlm(commits, candidates) {
  if (!commits || commits.length === 0) {
    return {
      matched_tickets: [],
      allocation: {},
      summary: '无Git提交数据',
      llm_used: false
    }
  }

  if (!isLlmAvailable()) {
    return fallbackCommitAnalysis(commits, candidates)
  }

  const prompt = buildCommitAnalysisPrompt(commits, candidates)

  const result = await callLlm(prompt, { callType: 'commit_analysis' })

  if (!result) {
    return fallbackCommitAnalysis(commits, candidates)
  }

  return {
    matched_tickets: result.matched_tickets || [],
    allocation: result.allocation || {},
    summary: result.summary || '基于Git提交分析',
    llm_used: true
  }
}

/**
 * Fallback commit analysis when LLM is unavailable
 * Uses simple pattern matching based on ticket keys in commits
 */
function fallbackCommitAnalysis(commits, candidates) {
  if (!commits || commits.length === 0) {
    return {
      matched_tickets: [],
      allocation: {},
      summary: '无Git提交数据',
      llm_used: false
    }
  }

  // Group commits by ticket key
  const ticketCommits = new Map()

  for (const commit of commits) {
    const ticketKey = commit.ticketKey
    if (ticketKey) {
      if (!ticketCommits.has(ticketKey)) {
        ticketCommits.set(ticketKey, [])
      }
      ticketCommits.get(ticketKey).push(commit)
    }
  }

  // Build matched tickets with confidence based on commit count
  const matchedTickets = []
  const allocation = {}

  for (const [key, commitList] of ticketCommits) {
    // Find candidate ticket for summary
    const candidate = candidates.find(c => c.key === key)

    // Confidence based on commit count (more commits = higher confidence)
    const commitCount = commitList.length
    let confidence = 50
    if (commitCount >= 3) confidence = 85
    else if (commitCount >= 2) confidence = 70

    matchedTickets.push({
      key: key,
      confidence: confidence,
      reason: `有${commitCount}个Git提交引用此ticket`,
      summary: candidate?.summary || ''
    })

    // Simple allocation: more commits = more hours
    const hours = Math.min(commitCount * 2, 6)
    allocation[key] = hours
  }

  return {
    matched_tickets: matchedTickets.sort((a, b) => b.confidence - a.confidence),
    allocation,
    summary: `基于${commits.length}个Git提交分析`,
    llm_used: false
  }
}

/**
 * Parse git log output into structured commits
 * Format: %H|%s|%ai (hash|subject|author date ISO)
 *
 * @param {string} output - Raw git log output
 * @param {string} pattern - Ticket key pattern
 * @returns {Array} - List of parsed commits
 */
export function parseCommits(output, pattern = '[A-Z]+-\\d+') {
  if (!output) return []

  const lines = output.split('\n')
  const commits = []
  let currentCommit = null

  for (const line of lines) {
    // Commit header line: hash|message|timestamp
    if (line.includes('|')) {
      const [hash, message, timestamp] = line.split('|')

      currentCommit = {
        hash: hash.trim(),
        message: message.trim(),
        timestamp: timestamp.trim(),
        ticketKey: extractTicketKey(message, pattern),
        files: []
      }

      commits.push(currentCommit)
    } else if (line.trim() && currentCommit) {
      // File name line
      currentCommit.files.push(line.trim())
    }
  }

  // Filter to only commits with ticket keys
  return commits.filter(c => c.ticketKey)
}

/**
 * Get git configuration (Phase 2)
 * Returns author email and repository path
 *
 * @returns {object} - Git config { authorEmail, repoPath }
 */
export async function getGitConfig() {
  // Phase 2 will implement git config parsing
  return {
    authorEmail: '',
    repoPath: ''
  }
}