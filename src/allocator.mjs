import { roundTo } from './utils.mjs'

/**
 * Allocate 8 hours across selected tickets
 */
export function allocateTime(selectedTickets, history = null) {
  if (!selectedTickets || selectedTickets.length === 0) {
    return {}
  }

  const totalHours = 8

  // Single ticket - all 8 hours
  if (selectedTickets.length === 1) {
    return { [selectedTickets[0]]: totalHours }
  }

  // Try to use historical allocation ratio
  if (history && history.hasAllocationHistory && history.hasAllocationHistory(selectedTickets)) {
    return allocateByHistory(selectedTickets, history)
  }

  // Default: equal distribution
  return allocateEvenly(selectedTickets, totalHours)
}

/**
 * Allocate based on historical ratios
 */
function allocateByHistory(selectedTickets, history) {
  const ratios = history.getAllocationRatio(selectedTickets)
  const allocation = {}

  // Calculate hours from ratios and round
  for (const key of selectedTickets) {
    const ratio = ratios[key] || (1 / selectedTickets.length)
    allocation[key] = roundTo(ratio * 8)
  }

  // Adjust if total != 8 (due to rounding)
  adjustTotal(allocation, 8, selectedTickets)

  return allocation
}

/**
 * Allocate evenly across tickets
 */
function allocateEvenly(selectedTickets, totalHours) {
  const hoursPerTicket = roundTo(totalHours / selectedTickets.length)
  const allocation = {}

  for (const key of selectedTickets) {
    allocation[key] = hoursPerTicket
  }

  // Adjust for rounding (ensure sum = 8)
  adjustTotal(allocation, totalHours, selectedTickets)

  return allocation
}

/**
 * Adjust allocation to ensure total matches target
 */
function adjustTotal(allocation, targetHours, selectedTickets) {
  const sum = roundTo(Object.values(allocation).reduce((a, b) => a + b, 0))
  const diff = roundTo(targetHours - sum)

  if (diff !== 0 && selectedTickets.length > 0) {
    // Adjust the first ticket to make total exact
    allocation[selectedTickets[0]] = roundTo(allocation[selectedTickets[0]] + diff)
  }
}