/**
 * Smart Selector - Pre-select tickets based on history
 * Tickets are already sorted by user's last action time in jiraClient
 */

/**
 * Get recommended tickets with pre-selection
 * Returns tickets in the order received (sorted by user's last action time)
 * Pre-selects top tickets based on usage history
 */
export function getRecommendedTickets(allTickets, recentTickets) {
  if (!allTickets || allTickets.length === 0) {
    return { tickets: [], preSelected: [] }
  }

  // Tickets are already sorted by userLastAction in jiraClient
  // Just return them as-is
  const tickets = allTickets

  // Pre-select: prioritize tickets with user history (use_count)
  // But maintain the order by userLastAction
  const ticketsWithHistory = tickets.filter(t =>
    recentTickets.some(r => r.issue_key === t.key)
  )
  const ticketsWithoutHistory = tickets.filter(t =>
    !recentTickets.some(r => r.issue_key === t.key)
  )

  // Pre-select top 3 from tickets with history first, then from others
  const preSelectedCount = Math.min(3, tickets.length)
  const preSelected = []

  // Add from history first (up to 3)
  for (const t of ticketsWithHistory) {
    if (preSelected.length < preSelectedCount) {
      preSelected.push(t.key)
    }
  }

  // Fill remaining from non-history
  for (const t of ticketsWithoutHistory) {
    if (preSelected.length < preSelectedCount) {
      preSelected.push(t.key)
    }
  }

  return {
    tickets,
    preSelected
  }
}

/**
 * Check if a ticket was recently used
 */
export function isRecentlyUsed(issueKey, recentTickets) {
  return recentTickets.some(r => r.issue_key === issueKey)
}

/**
 * Get usage count for a ticket
 */
export function getUsageCount(issueKey, recentTickets) {
  const found = recentTickets.find(r => r.issue_key === issueKey)
  return found ? found.use_count : 0
}