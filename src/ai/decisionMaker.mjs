import { getYesterdayAllocation, getAllocationRatio, hasAllocationHistory } from '../storage.mjs'
import { callLlm, buildDecisionPrompt, isLlmAvailable, getLlmConfig } from './llmEngine.mjs'

/**
 * Decision Maker for AI time recording
 * Handles LLM decision-making and fallback logic
 */

/**
 * Make decision with LLM (or fallback to rules)
 */
export async function makeDecisionWithLlm(evidenceSummary, filteredTickets) {
  // Get target hours (补充到8小时)
  const targetHours = evidenceSummary.targetHours || 8

  if (!isLlmAvailable()) {
    return fallbackToRules(filteredTickets, evidenceSummary, targetHours)
  }

  const prompt = buildDecisionPrompt(evidenceSummary)

  const result = await callLlm(prompt, { callType: 'decision' })

  if (!result) {
    return fallbackToRules(filteredTickets, evidenceSummary, targetHours)
  }

  // Validate and normalize LLM response
  const recommendation = result.recommendation || {}
  const tickets = recommendation.tickets || filteredTickets.slice(0, 3).map(t => t.key)
  const allocation = recommendation.allocation || {}

  // Post-process: filter out Bug parent tasks when they have subtasks
  const filteredTicketsResult = filterBugParentTasks(tickets, allocation, filteredTickets)

  // Ensure total hours = targetHours (normalize allocation)
  const normalizedAllocation = normalizeAllocation(filteredTicketsResult.allocation, filteredTicketsResult.tickets, targetHours)

  return {
    recommendation: {
      tickets: filteredTicketsResult.tickets,
      allocation: normalizedAllocation,
      total_hours: targetHours
    },
    reasoning: result.reasoning || {},
    explanation: result.explanation || generateFallbackExplanation(filteredTickets, normalizedAllocation),
    confidence_level: result.confidence_level || 'medium',
    llm_used: true
  }
}

/**
 * Filter Bug parent tasks and redistribute their hours to subtasks
 */
export function filterBugParentTasks(recommendedKeys, allocation, allTickets) {
  // Build a map of Bug parentKey -> subtasks
  const bugParentToSubtasks = new Map()

  for (const ticket of allTickets) {
    if (ticket.isSubtask && ticket.parentKey && ticket.parentTypeName === 'Bug') {
      if (!bugParentToSubtasks.has(ticket.parentKey)) {
        bugParentToSubtasks.set(ticket.parentKey, [])
      }
      bugParentToSubtasks.get(ticket.parentKey).push(ticket.key)
    }
  }

  // Also check for Bug tickets that are not subtasks (they might be parents)
  for (const ticket of allTickets) {
    if (ticket.typeName === 'Bug' && !ticket.isSubtask) {
      // Find all subtasks of this Bug
      const bugSubtasks = allTickets.filter(t => t.parentKey === ticket.key && t.isSubtask)
      if (bugSubtasks.length > 0 && !bugParentToSubtasks.has(ticket.key)) {
        bugParentToSubtasks.set(ticket.key, bugSubtasks.map(t => t.key))
      }
    }
  }

  const filteredKeys = []
  const filteredAllocation = { ...allocation }
  let hoursToRedistribute = 0

  for (const key of recommendedKeys) {
    const subtasks = bugParentToSubtasks.get(key)

    if (subtasks) {
      // This is a Bug parent - check if any of its subtasks are recommended
      const recommendedSubtasks = subtasks.filter(subKey => recommendedKeys.includes(subKey))

      if (recommendedSubtasks.length > 0) {
        // Skip the Bug parent, redistribute its hours to subtasks
        const bugHours = allocation[key] || 0
        console.log(`⚠️  Filtering out Bug parent ${key} (${bugHours}h) - has subtasks: ${recommendedSubtasks.join(', ')}`)

        // Redistribute hours equally among recommended subtasks
        const hoursPerSubtask = bugHours / recommendedSubtasks.length
        for (const subKey of recommendedSubtasks) {
          filteredAllocation[subKey] = (filteredAllocation[subKey] || 0) + hoursPerSubtask
        }

        // Remove Bug parent from allocation
        delete filteredAllocation[key]
        hoursToRedistribute += bugHours
        continue
      }
    }

    filteredKeys.push(key)
  }

  return {
    tickets: filteredKeys,
    allocation: filteredAllocation
  }
}

/**
 * Fallback to rules-based decision when LLM unavailable
 */
export function fallbackToRules(filteredTickets, evidenceSummary, targetHours = 8) {
  // Select top 3-5 tickets based on confidence
  const selectedTickets = filteredTickets.slice(0, Math.min(filteredTickets.length, 5))

  // Use existing allocator logic
  const ticketKeys = selectedTickets.map(t => t.key)
  const hasHistory = hasAllocationHistory(ticketKeys)

  let allocation
  if (hasHistory) {
    // Use historical ratios
    const ratios = getAllocationRatio(ticketKeys)
    allocation = {}
    let total = 0
    for (const key of ticketKeys) {
      const ratio = ratios[key] || (1 / ticketKeys.length)
      allocation[key] = Math.round(ratio * targetHours * 10) / 10
      total += allocation[key]
    }
    // Normalize to exactly targetHours
    if (total !== targetHours) {
      const firstKey = ticketKeys[0]
      allocation[firstKey] = Math.round((allocation[firstKey] + (targetHours - total)) * 10) / 10
    }
  } else {
    // Equal distribution
    const hoursPerTicket = Math.round((targetHours / ticketKeys.length) * 10) / 10
    allocation = {}
    for (const key of ticketKeys) {
      allocation[key] = hoursPerTicket
    }
    // Adjust first ticket for rounding
    const total = Object.values(allocation).reduce((a, b) => a + b, 0)
    if (total !== targetHours) {
      allocation[ticketKeys[0]] = Math.round((allocation[ticketKeys[0]] + (targetHours - total)) * 10) / 10
    }
  }

  // Filter out Bug parent tasks if they have subtasks in the selection
  const filteredResult = filterBugParentTasks(ticketKeys, allocation, filteredTickets)

  // Normalize allocation after filtering
  const normalizedAllocation = normalizeAllocation(filteredResult.allocation, filteredResult.tickets, targetHours)

  // Calculate confidence level based on top ticket confidence
  const topConfidence = filteredTickets[0]?.confidence || 0
  let confidenceLevel = 'low'
  if (topConfidence >= 80) confidenceLevel = 'high'
  else if (topConfidence >= 60) confidenceLevel = 'medium'

  return {
    recommendation: {
      tickets: filteredResult.tickets,
      allocation: normalizedAllocation,
      total_hours: targetHours
    },
    reasoning: generateFallbackReasoning(selectedTickets),
    explanation: generateFallbackExplanation(selectedTickets, normalizedAllocation),
    confidence_level: confidenceLevel,
    llm_used: false
  }
}

/**
 * Fallback recommendation when entire system fails
 */
export function fallbackRecommendation(date) {
  // Try to use yesterday's allocation
  const yesterday = getYesterdayAllocation()

  if (yesterday && Object.keys(yesterday).length > 0) {
    return {
      enabled: true,
      tickets: Object.keys(yesterday).map(key => ({
        key,
        summary: '',
        confidence: 50,
        confidenceLevel: 'medium',
        llm_reason: '基于昨天的记录'
      })),
      recommendation: {
        tickets: Object.keys(yesterday),
        allocation: yesterday,
        total_hours: Object.values(yesterday).reduce((a, b) => a + b, 0)
      },
      explanation: '系统异常，使用昨天的记录作为参考',
      confidence_level: 'low',
      llm_used: false,
      fallback: true
    }
  }

  return {
    enabled: true,
    tickets: [],
    recommendation: null,
    explanation: '无法生成推荐，请手动选择ticket',
    confidence_level: 'low',
    llm_used: false,
    fallback: true
  }
}

/**
 * Normalize allocation to total target hours
 */
function normalizeAllocation(allocation, tickets, targetHours = 8) {
  // If allocation is empty, create equal distribution
  if (!allocation || Object.keys(allocation).length === 0) {
    const hoursPerTicket = Math.round((targetHours / tickets.length) * 10) / 10
    allocation = {}
    for (const key of tickets) {
      allocation[key] = hoursPerTicket
    }
  }

  // Calculate current total
  const total = Object.values(allocation).reduce((a, b) => a + b, 0)

  // Normalize to targetHours
  if (total !== targetHours && total > 0) {
    const factor = targetHours / total
    const normalized = {}
    for (const [key, hours] of Object.entries(allocation)) {
      normalized[key] = Math.round(hours * factor * 10) / 10
    }
    // Ensure exactly targetHours
    const newTotal = Object.values(normalized).reduce((a, b) => a + b, 0)
    if (newTotal !== targetHours) {
      const firstKey = Object.keys(normalized)[0]
      normalized[firstKey] = Math.round((normalized[firstKey] + (targetHours - newTotal)) * 10) / 10
    }
    return normalized
  }

  return allocation
}

/**
 * Generate fallback reasoning text
 */
function generateFallbackReasoning(tickets) {
  const reasoning = {}

  for (const ticket of tickets) {
    const reasons = []

    if (ticket.useCount > 0) {
      reasons.push(`历史使用${ticket.useCount}次`)
    }
    if (ticket.activities?.length > 0) {
      reasons.push(`有${ticket.activities.length}次Jira操作`)
    }
    if (ticket.commits?.length > 0) {
      reasons.push(`有${ticket.commits.length}个Git提交`)
    }

    reasoning[ticket.key] = reasons.length > 0
      ? reasons.join('，') + '，置信度' + ticket.confidence
      : `置信度${ticket.confidence}`
  }

  return reasoning
}

/**
 * Generate fallback explanation text
 */
function generateFallbackExplanation(tickets, allocation) {
  if (tickets.length === 0) {
    return '没有足够的工作证据生成推荐'
  }

  const topTicket = tickets[0]
  const topHours = allocation[topTicket.key] || 0

  const parts = []
  parts.push(`推荐记录${tickets.length}个ticket`)

  if (topTicket.useCount > 0) {
    parts.push(`基于历史使用记录(${topTicket.useCount}次)`)
  }
  if (topTicket.activities?.length > 0) {
    parts.push(`和Jira活动(${topTicket.activities.length}次操作)`)
  }

  parts.push(`，${topTicket.key}记录${topHours}小时`)

  return parts.join('')
}

/**
 * Get LLM provider info for response
 */
export function getLlmProviderInfo() {
  return getLlmConfig().provider
}