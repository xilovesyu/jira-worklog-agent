import { loadConfig } from '../config.mjs'
import { getJiraApi, testConnection, getCustomFields } from '../jiraClient.mjs'
import { getTodayDate, getDateRange } from '../utils.mjs'
import { callLlm, buildActivityAnalysisPrompt, isLlmAvailable } from './llmEngine.mjs'

/**
 * Activity Analyzer for AI time recording
 * Analyzes Jira changelog to understand user's work activity
 */

/**
 * Get user's Jira activity for a specific date
 * Searches for tickets user has interacted with and extracts changelog
 *
 * @param {string} dateStr - Target date (YYYY-MM-DD), defaults to today
 * @returns {object} - Map of ticket key -> activities
 */
export async function getJiraActivity(dateStr = null) {
  const date = dateStr || getTodayDate()
  const api = getJiraApi()

  try {
    // Get current user info
    const myselfResponse = await api.get('/rest/api/2/myself')
    const currentUserKey = myselfResponse.data.key
    const currentUserAccountId = myselfResponse.data.accountId
    const currentUserDisplayName = myselfResponse.data.displayName

    // Calculate date range: last 7 days
    const dateRange = getDateRange(date, 7)

    // JQL: Find tickets user has recently interacted with
    // - Tickets assigned to user (current or past)
    // - Tickets user created
    // - Tickets user commented on
    const jql = `
      updated >= '${dateRange.start}'
      AND (assignee was currentUser()
           OR assignee = currentUser()
           OR reporter = currentUser())
      ORDER BY updated DESC
    `.trim().replace(/\s+/g, ' ')

    const response = await api.get('/rest/api/2/search', {
      params: {
        jql: jql,
        fields: 'summary,status',
        expand: 'changelog',
        maxResults: 50
      }
    })

    const issues = response.data.issues || []
    const activities = {}

    // For each issue, extract user's actions from changelog
    for (const issue of issues) {
      const issueKey = issue.key
      const changelog = issue.changelog

      if (changelog && changelog.histories) {
        // Filter changelog for current user's actions
        const userActions = extractUserActions(
          changelog.histories,
          currentUserKey,
          currentUserAccountId,
          dateRange.start,
          date
        )

        if (userActions.length > 0) {
          activities[issueKey] = {
            summary: issue.fields.summary,
            status: issue.fields.status?.name,
            actions: userActions
          }
        }
      }
    }

    return {
      activities,
      user: {
        key: currentUserKey,
        accountId: currentUserAccountId,
        displayName: currentUserDisplayName
      }
    }
  } catch (err) {
    console.error('Error getting Jira activity:', err.response?.status, err.response?.data || err.message)
    return { activities: {}, user: null }
  }
}

/**
 * Extract user's actions from Jira changelog
 *
 * @param {Array} histories - Changelog histories array
 * @param {string} userKey - User's key (Jira Server)
 * @param {string} userAccountId - User's accountId (Jira Cloud)
 * @param {string} startDate - Start date filter
 * @param {string} endDate - End date filter
 * @returns {Array} - List of user actions with time and action type
 */
export function extractUserActions(histories, userKey, userAccountId, startDate, endDate) {
  const userActions = []

  for (const history of histories) {
    const author = history.author

    // Check if action was made by current user
    const isCurrentUser = author?.key === userKey || author?.accountId === userAccountId

    if (!isCurrentUser) continue

    // Check if action is within date range
    const actionDate = history.created?.substring(0, 10)
    if (!actionDate) continue

    if (actionDate < startDate || actionDate > endDate) continue

    // Parse action items
    const actions = []
    for (const item of (history.items || [])) {
      const actionType = getActionType(item)
      actions.push({
        type: actionType,
        field: item.field,
        from: item.fromString,
        to: item.toString
      })
    }

    if (actions.length > 0) {
      userActions.push({
        time: history.created,
        actions
      })
    }
  }

  // Sort by time descending
  userActions.sort((a, b) => new Date(b.time) - new Date(a.time))

  return userActions
}

/**
 * Determine action type from changelog item
 */
function getActionType(item) {
  const field = item.field?.toLowerCase()

  if (field === 'status') {
    return 'status_change'
  } else if (field === 'assignee') {
    return 'assignee_change'
  } else if (field === 'comment') {
    return 'comment'
  } else if (field === 'priority') {
    return 'priority_change'
  } else if (field === 'description' || field === 'summary') {
    return 'field_update'
  } else if (field === 'labels') {
    return 'label_update'
  } else {
    return 'other_update'
  }
}

/**
 * Analyze ticket activity with LLM
 * Returns work intensity and estimated hours
 *
 * @param {string} ticketKey - Ticket key
 * @param {object} ticketActivity - Activity data for this ticket
 * @returns {object} - LLM analysis result
 */
export async function analyzeActivityWithLlm(ticketKey, ticketActivity) {
  if (!isLlmAvailable()) {
    return fallbackActivityAnalysis(ticketActivity)
  }

  const prompt = buildActivityAnalysisPrompt(ticketKey, ticketActivity.actions)

  const result = await callLlm(prompt, { callType: 'activity_analysis' })

  if (!result) {
    return fallbackActivityAnalysis(ticketActivity)
  }

  return {
    work_intensity: result.work_intensity || 'medium',
    estimated_hours: result.estimated_hours || 2,
    work_summary: result.work_summary || '用户在ticket上有活动',
    llm_used: true
  }
}

/**
 * Fallback activity analysis when LLM is unavailable
 * Uses simple rules based on action count and types
 */
function fallbackActivityAnalysis(ticketActivity) {
  const actions = ticketActivity.actions || []
  const actionCount = actions.length

  // Determine work intensity based on action count and types
  let intensity = 'low'
  let estimatedHours = 1

  // Check for strong indicators
  let hasStatusChange = false
  let hasComment = false

  for (const action of actions) {
    for (const item of (action.actions || [])) {
      if (item.type === 'status_change') hasStatusChange = true
      if (item.type === 'comment') hasComment = true
    }
  }

  // Calculate intensity
  if (actionCount >= 3 || hasStatusChange) {
    intensity = 'high'
    estimatedHours = 4
  } else if (actionCount >= 2 || hasComment) {
    intensity = 'medium'
    estimatedHours = 2
  } else if (actionCount >= 1) {
    intensity = 'low'
    estimatedHours = 1
  }

  return {
    work_intensity: intensity,
    estimated_hours: estimatedHours,
    work_summary: `用户在ticket上进行了${actionCount}次操作`,
    llm_used: false
  }
}

/**
 * Get action summary text for display
 */
export function getActionSummary(action) {
  const summaries = []

  for (const item of (action.actions || [])) {
    switch (item.type) {
      case 'status_change':
        summaries.push(`状态变更: ${item.from} → ${item.to}`)
        break
      case 'assignee_change':
        summaries.push(`分配变更: ${item.from} → ${item.to}`)
        break
      case 'comment':
        summaries.push('添加评论')
        break
      case 'priority_change':
        summaries.push(`优先级变更: ${item.from} → ${item.to}`)
        break
      case 'field_update':
        summaries.push(`更新${item.field}`)
        break
      default:
        summaries.push(`更新${item.field}`)
    }
  }

  return summaries.join(', ')
}