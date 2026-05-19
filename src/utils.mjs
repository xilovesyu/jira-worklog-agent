// Utility functions
import { loadConfig } from './config.mjs'

/**
 * Standard timezone offsets mapping
 * Note: These don't handle DST automatically - use 'local' for accurate DST
 */
const TIMEZONE_OFFSETS = {
  'Asia/Shanghai': '+0800',
  'Asia/Hong_Kong': '+0800',
  'Asia/Tokyo': '+0900',
  'America/Los_Angeles': '-0700',  // PDT (approximate)
  'America/New_York': '-0400',     // EDT (approximate)
  'Europe/London': '+0100',        // BST (approximate)
  'UTC': '+0000',
}

/**
 * Format date to YYYY-MM-DD string
 * @param date - Date object to format
 */
function formatDateYYYYMMDD(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get timezone offset string for a specific date
 * Returns offset in format "+0800" or "-0700"
 * @param dateStr - Optional date string (YYYY-MM-DD), defaults to today
 */
export function getTimezoneOffset(dateStr = null) {
  const config = loadConfig()
  const tz = config.timezone || 'local'

  if (tz === 'local') {
    // Use system timezone
    const date = dateStr ? new Date(dateStr + 'T12:00:00') : new Date()
    const offset = -date.getTimezoneOffset() // getTimezoneOffset returns opposite sign
    const hours = Math.floor(Math.abs(offset) / 60)
    const mins = Math.abs(offset) % 60
    const sign = offset >= 0 ? '+' : '-'
    return `${sign}${String(hours).padStart(2, '0')}${String(mins).padStart(2, '0')}`
  }

  return TIMEZONE_OFFSETS[tz] || '+0000'
}

/**
 * Get Jira server timezone offset
 * Used for matching worklog dates with Jira server dates
 */
export function getJiraTimezoneOffset() {
  const config = loadConfig()
  const jiraTz = config.jira?.server_timezone || 'America/Los_Angeles'

  return TIMEZONE_OFFSETS[jiraTz] || '-0700'
}

/**
 * Check if today is a workday (Mon-Fri)
 */
export function isWorkday() {
  const day = new Date().getDay()
  return day >= 1 && day <= 5
}

/**
 * Get today's date in YYYY-MM-DD format using local timezone
 */
export function getTodayDate() {
  return formatDateYYYYMMDD(new Date())
}

/**
 * Get a past date in YYYY-MM-DD format using local timezone
 * @param daysAgo - Number of days in the past (e.g., 7 for 7 days ago)
 */
export function getDateDaysAgo(daysAgo) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return formatDateYYYYMMDD(date)
}

/**
 * Get yesterday's date in YYYY-MM-DD format using local timezone
 */
export function getYesterdayDate() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return formatDateYYYYMMDD(yesterday)
}

/**
 * Get today's start time in Jira format with correct timezone
 * e.g., "2026-05-06T09:00:00.000+0800" (uses configured timezone)
 */
export function getTodayStartTime() {
  const today = getTodayDate()
  const offset = getTimezoneOffset(today)
  return `${today}T09:00:00.000${offset}`
}

/**
 * Get start time for a specific date in Jira format
 * e.g., "2026-05-06T09:00:00.000+0800" (uses configured timezone)
 */
export function getDateStartTime(dateStr) {
  const offset = getTimezoneOffset(dateStr)
  return `${dateStr}T09:00:00.000${offset}`
}

/**
 * Get start time for Jira worklog submission (uses Jira server timezone)
 * This ensures the worklog appears on the correct date in Jira UI
 * @param dateStr - Date string (YYYY-MM-DD)
 */
export function getDateStartTimeForJira(dateStr) {
  // Use Jira server timezone to ensure correct date in Jira UI
  const offset = getJiraTimezoneOffset()
  return `${dateStr}T09:00:00.000${offset}`
}

/**
 * Get today's start time for Jira worklog submission
 */
export function getTodayStartTimeForJira() {
  const today = getTodayDate()
  return getDateStartTimeForJira(today)
}

/**
 * Round number to specified decimal places
 */
export function roundTo(num, decimals = 1) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

/**
 * Format hours for display
 */
export function formatHours(hours) {
  return `${roundTo(hours)}h`
}

/**
 * Calculate date range: [date - 7 days, date]
 * Returns { start, end } in YYYY-MM-DD format
 */
export function getDateRange(dateStr, daysBack = 7) {
  const end = dateStr || getTodayDate()
  const endDate = new Date(end)
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - daysBack)

  return {
    start: formatDateYYYYMMDD(startDate),
    end: end
  }
}