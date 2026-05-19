import { saveAiDecision, saveTicketEvidence, getAiConfig, getYesterdayAllocation } from '../storage.mjs'
import { getTodayDate, getYesterdayDate } from '../utils.mjs'
import { getLlmConfig } from './llmEngine.mjs'
import { aggregateEvidence } from './confidenceCalculator.mjs'
import { batchGetTicketDetails } from '../jiraClient.mjs'
import { collectEvidence, enrichTicketsWithEvidence, prepareEvidenceSummary } from './evidenceCollector.mjs'
import { makeDecisionWithLlm, filterBugParentTasks, fallbackRecommendation, getLlmProviderInfo } from './decisionMaker.mjs'

/**
 * Decision Engine for AI time recording
 * Orchestrates evidence collection and LLM decision-making
 */

/**
 * Generate AI recommendation for a specific date
 *
 * @param {string} dateStr - Target date (YYYY-MM-DD), defaults to today
 * @returns {object} - AI recommendation with tickets, allocation, explanation
 */
export async function generateAiRecommendation(dateStr = null) {
  const date = dateStr || getTodayDate()
  const aiConfig = getAiConfig()

  // Check if AI is enabled
  if (aiConfig.automation_level === 'none') {
    return {
      enabled: false,
      message: 'AI automation is disabled'
    }
  }

  try {
    // Step 1: Collect all evidence
    const evidence = await collectEvidence(date)

    // Step 2: Aggregate evidence per ticket (this gives us candidate keys)
    const aggregatedEvidence = aggregateEvidence(evidence)

    // Step 3: Get ticket keys from aggregated evidence (optimized: only fetch what has evidence)
    const candidateKeys = Array.from(aggregatedEvidence.keys())

    if (candidateKeys.length === 0) {
      return {
        enabled: true,
        tickets: [],
        recommendation: null,
        explanation: '没有找到足够的工作证据来生成推荐',
        confidence_level: 'low',
        llm_used: false
      }
    }

    // Step 4: Batch fetch ticket details (much faster than searchMyTickets)
    const ticketDetails = await batchGetTicketDetails(candidateKeys)

    // Step 5: Combine details with aggregated evidence
    const enrichedTickets = enrichTicketsWithEvidence(ticketDetails, aggregatedEvidence)

    // Step 6: Prepare evidence summary for LLM
    const evidenceSummary = prepareEvidenceSummary(enrichedTickets, evidence)

    // Step 7: Call LLM for decision (or use fallback)
    const decision = await makeDecisionWithLlm(evidenceSummary, enrichedTickets)

    // Step 8: Save decision to history
    const decisionId = saveAiDecision({
      date,
      decision_type: 'recommendation',
      confidence_level: decision.confidence_level,
      tickets_selected: decision.recommendation?.tickets || [],
      allocation: decision.recommendation?.allocation || {},
      llm_reasoning: decision.reasoning || {},
      llm_explanation: decision.explanation || '',
      executed: false
    })

    // Save evidence for each ticket
    for (const ticket of enrichedTickets) {
      for (const source of ticket.sources || []) {
        saveTicketEvidence({
          issue_key: ticket.key,
          date,
          evidence_type: source,
          evidence_weight: ticket.confidence / 100,
          evidence_source: { confidence: ticket.confidence, sources: ticket.sources }
        })
      }
    }

    return {
      enabled: true,
      id: decisionId,
      tickets: enrichedTickets.map(t => ({
        key: t.key,
        summary: t.summary,
        status: t.status || 'Unknown',
        description: t.description || null,
        typeName: t.typeName || 'Unknown',
        isSubtask: t.isSubtask || false,
        parentKey: t.parentKey || null,
        parentSummary: t.parentSummary || '',
        parentDescription: t.parentDescription || null,
        parentTypeName: t.parentTypeName || null,
        confidence: t.confidence,
        confidenceLevel: t.confidenceLevel,
        llm_reason: decision.reasoning?.[t.key] || '',
        // User's own activity actions (for sorting in UI)
        activityActions: t.activityActions || []
      })),
      recommendation: decision.recommendation,
      explanation: decision.explanation,
      confidence_level: decision.confidence_level,
      llm_used: decision.llm_used,
      llm_provider: getLlmProviderInfo(),
      // Already logged worklog for this date
      existingWorklog: evidence.existingWorklog || [],
      existingTotalHours: (evidence.existingWorklog || []).reduce((sum, w) => sum + (w.hours || 0), 0)
    }
  } catch (err) {
    console.error('Error generating AI recommendation:', err)

    // Return fallback recommendation
    return fallbackRecommendation(date)
  }
}

/**
 * Execute AI recommendation (submit worklog)
 */
export async function executeAiRecommendation(recommendation, dateStr = null) {
  const date = dateStr || getTodayDate()
  const allocation = recommendation.recommendation?.allocation || {}

  if (!allocation || Object.keys(allocation).length === 0) {
    throw new Error('No allocation to submit')
  }

  // Import addWorklog dynamically to avoid circular dependency
  const { addWorklog } = await import('../jiraClient.mjs')

  const results = []

  for (const [issueKey, hours] of Object.entries(allocation)) {
    try {
      const worklog = await addWorklog(
        issueKey,
        hours,
        recommendation.explanation || 'AI推荐',
        date
      )

      results.push({
        issueKey,
        hours,
        success: true,
        worklogId: worklog.id
      })
    } catch (err) {
      results.push({
        issueKey,
        hours,
        success: false,
        error: err.message
      })
    }
  }

  // Mark decision as executed if all successful
  if (recommendation.id && results.every(r => r.success)) {
    const { markDecisionExecuted } = await import('../storage.mjs')
    markDecisionExecuted(recommendation.id)
  }

  return {
    success: results.every(r => r.success),
    results,
    totalHours: Object.values(allocation).reduce((a, b) => a + b, 0)
  }
}

// Re-export for backward compatibility
export { filterBugParentTasks } from './decisionMaker.mjs'
export { getYesterdayAllocation } from '../storage.mjs'