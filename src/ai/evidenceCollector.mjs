import { getRecentTickets, getYesterdayAllocation } from '../storage.mjs'
import { getTodayDate } from '../utils.mjs'
import { getJiraActivity } from './activityAnalyzer.mjs'
import { getTodayCommits } from './commitAnalyzer.mjs'
import { getUserWorklogsByDate } from '../jiraClient.mjs'

/**
 * Evidence Collector for AI time recording
 * Collects and processes evidence from multiple sources
 */

/**
 * Collect all evidence sources
 */
export async function collectEvidence(date) {
  // Run collectors in parallel with Promise.allSettled
  // Each collector can fail independently without affecting others
  const results = await Promise.allSettled([
    getJiraActivity(date),           // Jira changelog activity
    getTodayCommits(),               // Git commits (Phase 1: empty)
    Promise.resolve(getRecentTickets(7)), // History from SQLite
    Promise.resolve(getYesterdayAllocation()), // Yesterday's allocation
    getUserWorklogsByDate(date)      // Existing worklog for this date
  ])

  // Extract results, handling failures
  const jiraActivityResult = results[0]
  const commitsResult = results[1]
  const historyResult = results[2]
  const yesterdayResult = results[3]
  const existingWorklogResult = results[4]

  return {
    // Jira activity
    activity: jiraActivityResult.status === 'fulfilled'
      ? jiraActivityResult.value?.activities || {}
      : {},
    activityUser: jiraActivityResult.status === 'fulfilled'
      ? jiraActivityResult.value?.user || null
      : null,

    // Git commits (Phase 1: empty)
    commits: commitsResult.status === 'fulfilled'
      ? commitsResult.value || []
      : [],

    // History
    history: historyResult.status === 'fulfilled'
      ? historyResult.value || []
      : [],

    // Yesterday's allocation
    yesterday: yesterdayResult.status === 'fulfilled'
      ? yesterdayResult.value || null
      : null,

    // Existing worklog for this date
    existingWorklog: existingWorklogResult.status === 'fulfilled'
      ? existingWorklogResult.value || []
      : []
  }
}

/**
 * Enrich ticket details with aggregated evidence
 * Simplified: only processes tickets that already have evidence
 */
export function enrichTicketsWithEvidence(ticketDetails, aggregatedEvidence) {
  return ticketDetails.map(ticket => {
    const ticketEvidence = aggregatedEvidence.get(ticket.key)

    // activities is { summary, status, actions: [...] }, pass the whole object
    // but also extract actions array for convenience
    const activitiesObj = ticketEvidence?.activities
    const activityActions = activitiesObj?.actions || []

    return {
      ...ticket,
      sources: ticketEvidence?.sources || [],
      confidence: ticketEvidence?.confidence || 0,
      confidenceLevel: ticketEvidence?.confidenceLevel || 'very-low',
      useCount: ticketEvidence?.useCount,
      lastUsed: ticketEvidence?.lastUsed,
      activities: activitiesObj,  // Full object { summary, status, actions }
      activityActions: activityActions,  // Just the actions array
      commits: ticketEvidence?.commits
    }
  })
}

/**
 * Prepare evidence summary for LLM input
 * Pass raw data with timestamps - AI will determine priority based on its rules
 */
export function prepareEvidenceSummary(filteredTickets, evidence) {
  const today = getTodayDate()

  const summary = {
    today: today,

    tickets: filteredTickets.map(t => {
      // Include detailed activity timestamps
      // activityActions is the actions array from activities.actions
      const activityDetails = (t.activityActions || []).map(act => ({
        time: act.time,  // e.g. "2026-05-15T09:06:00.000+0000"
        date: act.time?.substring(0, 10),  // e.g. "2026-05-15"
        isToday: act.time?.substring(0, 10) === today,
        actions: (act.actions || []).map(a => ({
          type: a.type,
          field: a.field,
          from: a.from,
          to: a.to
        }))
      }))

      return {
        key: t.key,
        summary: t.summary,
        status: t.status || 'Unknown',
        assignee: t.assignee || 'Unknown',
        isAssignedToMe: t.isAssignedToMe || false,
        typeName: t.typeName || 'Unknown',
        isSubtask: t.isSubtask || false,
        parentKey: t.parentKey || null,
        parentTypeName: t.parentTypeName || null,
        useCount: t.useCount || 0,
        lastUsed: t.lastUsed || null,
        activityCount: (t.activityActions || []).length,
        activityTodayCount: activityDetails.filter(a => a.isToday).length,
        activityDetails: activityDetails,  // Full details with timestamps
        commitCount: t.commits?.length || 0,
        confidence: t.confidence,
        sources: t.sources
      }
    }),

    history: {
      topTickets: (evidence.history || []).slice(0, 5).map(h => ({
        key: h.issue_key,
        useCount: h.use_count,
        lastUsed: h.last_used?.substring(0, 10)
      }))
    },
    yesterday: evidence.yesterday || null,

    // Already logged worklog for this date
    existingWorklog: (evidence.existingWorklog || []).map(w => ({
      key: w.issueKey,
      summary: w.summary || '',
      hours: w.hours,
      comment: w.comment || ''
    })),
    existingTotalHours: (evidence.existingWorklog || []).reduce((sum, w) => sum + (w.hours || 0), 0),

    // Target hours to recommend (补充到8小时)
    targetHours: Math.max(0, 8 - (evidence.existingWorklog || []).reduce((sum, w) => sum + (w.hours || 0), 0))
  }

  // Add activity highlights with timestamps
  if (evidence.activity && Object.keys(evidence.activity).length > 0) {
    summary.activityHighlights = []
    for (const [key, act] of Object.entries(evidence.activity)) {
      // act is { summary, status, actions: [...] }
      const actions = act.actions || []
      if (actions.length > 0) {
        // Include all actions with timestamps
        const allActions = actions.map(action => ({
          time: action.time,
          date: action.time?.substring(0, 10),
          isToday: action.time?.substring(0, 10) === today,
          actionTypes: (action.actions || []).map(a => a.type)
        }))

        summary.activityHighlights.push({
          key,
          actionCount: actions.length,
          todayActionCount: allActions.filter(a => a.isToday).length,
          actions: allActions  // Full details with timestamps
        })
      }
    }
  }

  return summary
}