import { getRecentTickets } from '../storage.mjs'
import { getTodayDate, getYesterdayDate } from '../utils.mjs'

/**
 * Confidence Calculator for AI time recording
 * Pre-filters tickets to reduce LLM token consumption
 * Only tickets with confidence >= threshold (default 30) are sent to LLM
 */

/**
 * Calculate confidence score for a ticket based on evidence
 * Score ranges from 0-100
 *
 * Evidence weights:
 * - History: 40% (usage count, last used date)
 * - Activity: 30% (Jira changelog actions)
 * - Git: 10% (commits referencing ticket)
 *
 * @param {object} ticket - Ticket object with key, summary, etc.
 * @param {object} evidence - Evidence object { history, activity, commits }
 * @returns {number} - Confidence score 0-100
 */
export function calculateConfidence(ticket, evidence = {}) {
  let score = 0

  // History score (40%)
  score += calculateHistoryScore(ticket, evidence.history)

  // Activity score (30%)
  score += calculateActivityScore(ticket, evidence.activity)

  // Git score (10%) - Phase 2 placeholder
  score += calculateGitScore(evidence.commits)

  return Math.min(score, 100)
}

/**
 * Calculate history-based confidence score
 * Based on usage count and last used date
 */
export function calculateHistoryScore(ticket, historyData = null) {
  let score = 0

  // Use provided history data or try to get from recent tickets
  const history = historyData || getRecentTickets(7)

  // Find this ticket in history
  const ticketHistory = history.find(h => h.issue_key === ticket.key)

  if (!ticketHistory) {
    return 0
  }

  // Usage count score (max 30)
  const useCount = ticketHistory.use_count || 0
  const useCountScore = Math.min(useCount * 2, 30)

  // Last used bonus (max 10)
  let lastUsedBonus = 0
  const today = getTodayDate()
  const yesterday = getYesterdayDate()

  if (ticketHistory.last_used) {
    const lastUsedDate = ticketHistory.last_used.substring(0, 10)

    if (lastUsedDate === today) {
      lastUsedBonus = 10  // Used today
    } else if (lastUsedDate === yesterday) {
      lastUsedBonus = 7   // Used yesterday
    } else {
      // Calculate days since last use
      const daysSince = Math.floor(
        (new Date(today) - new Date(lastUsedDate)) / (1000 * 60 * 60 * 24)
      )
      if (daysSince <= 3) {
        lastUsedBonus = 5
      } else if (daysSince <= 7) {
        lastUsedBonus = 3
      }
    }
  }

  score = Math.min(useCountScore + lastUsedBonus, 40)

  return score
}

/**
 * Calculate activity-based confidence score
 * Based on Jira changelog actions (status changes, comments, updates)
 */
export function calculateActivityScore(ticket, activityData = null) {
  if (!activityData) {
    return 0
  }

  let score = 0

  // Activity for this specific ticket
  const ticketActivity = activityData[ticket.key]

  if (!ticketActivity) {
    return 0
  }

  // Action count score (max 25)
  const actionCount = ticketActivity.actions?.length || 0
  const actionScore = Math.min(actionCount * 5, 25)

  // Type bonus (max 5)
  let typeBonus = 0

  // Check action types
  for (const action of (ticketActivity.actions || [])) {
    for (const item of (action.actions || [])) {
      if (item.type === 'status_change') {
        // Status change is strong evidence
        typeBonus = Math.max(typeBonus, 5)
      } else if (item.type === 'comment') {
        // Comment is medium evidence
        typeBonus = Math.max(typeBonus, 3)
      }
    }
  }

  score = Math.min(actionScore + typeBonus, 30)

  return score
}

/**
 * Calculate Git-based confidence score
 * Based on commits referencing this ticket
 */
export function calculateGitScore(commitsData = null) {
  if (!commitsData || commitsData.length === 0) {
    return 0
  }

  const commitCount = commitsData.length

  // Commit count score (max 15)
  if (commitCount <= 2) {
    return 5
  } else if (commitCount <= 5) {
    return 10
  } else {
    return 15
  }
}

/**
 * Filter tickets by confidence threshold
 * Returns tickets with confidence >= threshold
 *
 * @param {Array} tickets - List of tickets
 * @param {object} evidence - Evidence object for all tickets
 * @param {number} threshold - Minimum confidence (default 30)
 * @returns {Array} - Filtered tickets with confidence scores
 */
export function filterByConfidence(tickets, evidence, threshold = 30) {
  const scoredTickets = []

  for (const ticket of tickets) {
    // Get evidence for this specific ticket
    const ticketEvidence = {
      history: evidence.history,
      activity: evidence.activity,
      commits: evidence.commits?.filter(c => c.ticketKey === ticket.key)
    }

    const confidence = calculateConfidence(ticket, ticketEvidence)

    if (confidence >= threshold) {
      scoredTickets.push({
        ...ticket,
        confidence,
        confidenceLevel: getConfidenceLevel(confidence)
      })
    }
  }

  // Sort by confidence descending
  scoredTickets.sort((a, b) => b.confidence - a.confidence)

  return scoredTickets
}

/**
 * Get confidence level label based on score
 */
export function getConfidenceLevel(score) {
  if (score >= 80) {
    return 'high'
  } else if (score >= 60) {
    return 'medium'
  } else if (score >= 30) {
    return 'low'
  } else {
    return 'very-low'
  }
}

/**
 * Get confidence badge emoji based on level
 */
export function getConfidenceBadge(level) {
  switch (level) {
    case 'high':
      return '⭐'
    case 'medium':
      return ''
    case 'low':
      return '⚠️'
    default:
      return ''
  }
}

/**
 * Calculate aggregate evidence for all tickets
 * Combines history, activity, and git data
 *
 * @param {object} rawEvidence - Raw evidence { history, activity, commits }
 * @returns {Map} - Map of ticket key -> aggregated evidence
 */
export function aggregateEvidence(rawEvidence) {
  const allTickets = new Map()

  // Git commits -> extract ticket keys
  if (rawEvidence.commits) {
    for (const commit of rawEvidence.commits) {
      const ticketKey = commit.ticketKey
      if (ticketKey) {
        if (!allTickets.has(ticketKey)) {
          allTickets.set(ticketKey, {
            key: ticketKey,
            sources: ['git'],
            commits: [commit],
            confidence: 0
          })
        } else {
          const existing = allTickets.get(ticketKey)
          existing.commits.push(commit)
          if (!existing.sources.includes('git')) {
            existing.sources.push('git')
          }
        }
      }
    }
  }

  // Jira activity -> directly use ticket keys
  if (rawEvidence.activity) {
    for (const [key, activities] of Object.entries(rawEvidence.activity)) {
      if (allTickets.has(key)) {
        const existing = allTickets.get(key)
        existing.activities = activities
        if (!existing.sources.includes('jira')) {
          existing.sources.push('jira')
        }
      } else {
        allTickets.set(key, {
          key,
          sources: ['jira'],
          activities,
          confidence: 0
        })
      }
    }
  }

  // History -> add historical data
  if (rawEvidence.history) {
    for (const hist of rawEvidence.history) {
      const key = hist.issue_key
      if (allTickets.has(key)) {
        const existing = allTickets.get(key)
        existing.history = hist
        existing.useCount = hist.use_count
        existing.lastUsed = hist.last_used
        if (!existing.sources.includes('history')) {
          existing.sources.push('history')
        }
      }
      // Note: tickets only in history but not in git/activity
      // will have low confidence and may be filtered out
    }
  }

  // Calculate confidence for each ticket
  for (const [key, ticketData] of allTickets) {
    const ticketEvidence = {
      history: rawEvidence.history,
      activity: rawEvidence.activity,
      commits: ticketData.commits
    }
    // Create a minimal ticket object for confidence calculation
    const ticket = { key }
    ticketData.confidence = calculateConfidence(ticket, ticketEvidence)
    ticketData.confidenceLevel = getConfidenceLevel(ticketData.confidence)
  }

  return allTickets
}

/**
 * Get days since last use for a ticket
 */
export function getDaysSinceLastUse(ticket, history) {
  const ticketHistory = history.find(h => h.issue_key === ticket.key)
  if (!ticketHistory || !ticketHistory.last_used) {
    return Infinity  // Never used
  }

  const lastUsedDate = ticketHistory.last_used.substring(0, 10)
  const today = getTodayDate()

  return Math.floor(
    (new Date(today) - new Date(lastUsedDate)) / (1000 * 60 * 60 * 24)
  )
}