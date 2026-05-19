/**
 * Unit tests for smartSelector.mjs
 * Tests ticket pre-selection logic
 */

import { describe, it, expect } from 'vitest'
import { getRecommendedTickets, isRecentlyUsed, getUsageCount } from '../../src/smartSelector.mjs'

describe('smartSelector', () => {
  describe('getRecommendedTickets', () => {
    it('should return empty for empty input', () => {
      expect(getRecommendedTickets([], [])).toEqual({ tickets: [], preSelected: [] })
      expect(getRecommendedTickets(null, [])).toEqual({ tickets: [], preSelected: [] })
    })

    it('should pre-select tickets with history first', () => {
      const tickets = [
        { key: 'PROJ-1' },
        { key: 'PROJ-2' },
        { key: 'PROJ-3' },
        { key: 'PROJ-4' }
      ]
      const recentTickets = [
        { issue_key: 'PROJ-1', use_count: 5 },
        { issue_key: 'PROJ-2', use_count: 3 }
      ]

      const result = getRecommendedTickets(tickets, recentTickets)
      expect(result.preSelected).toContain('PROJ-1')
      expect(result.preSelected).toContain('PROJ-2')
      expect(result.preSelected.length).toBeLessThanOrEqual(3)
    })

    it('should pre-select up to 3 tickets', () => {
      const tickets = [
        { key: 'PROJ-1' },
        { key: 'PROJ-2' },
        { key: 'PROJ-3' },
        { key: 'PROJ-4' }
      ]
      const recentTickets = []

      const result = getRecommendedTickets(tickets, recentTickets)
      expect(result.preSelected.length).toBe(3)
    })
  })

  describe('isRecentlyUsed', () => {
    it('should return true if ticket is in recent list', () => {
      const recentTickets = [{ issue_key: 'PROJ-1' }]
      expect(isRecentlyUsed('PROJ-1', recentTickets)).toBe(true)
      expect(isRecentlyUsed('PROJ-2', recentTickets)).toBe(false)
    })
  })

  describe('getUsageCount', () => {
    it('should return usage count for ticket', () => {
      const recentTickets = [{ issue_key: 'PROJ-1', use_count: 5 }]
      expect(getUsageCount('PROJ-1', recentTickets)).toBe(5)
      expect(getUsageCount('PROJ-2', recentTickets)).toBe(0)
    })
  })
})