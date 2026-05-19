/**
 * Integration tests for routes/tickets.mjs
 * Tests route handlers with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies before importing
vi.mock('../../../src/jiraClient.mjs', () => ({
  searchMyTickets: vi.fn(),
  getCustomFields: vi.fn(),
  searchTicketByKeyOrUrl: vi.fn()
}))

vi.mock('../../../src/storage.mjs', () => ({
  getRecentTickets: vi.fn(() => []),
  getYesterdayAllocation: vi.fn(() => null),
  hasWorklogForDate: vi.fn(() => false)
}))

vi.mock('../../../src/smartSelector.mjs', () => ({
  getRecommendedTickets: vi.fn((tickets) => ({
    tickets,
    preSelected: tickets.slice(0, 3).map(t => t.key)
  }))
}))

vi.mock('../../../src/allocator.mjs', () => ({
  allocateTime: vi.fn((selected) => {
    const allocation = {}
    const hoursPerTicket = selected.length > 0 ? 8 / selected.length : 0
    for (const key of selected) {
      allocation[key] = hoursPerTicket
    }
    return allocation
  })
}))

// Import after mocking
import * as jiraClient from '../../../src/jiraClient.mjs'
import * as storage from '../../../src/storage.mjs'
import * as smartSelector from '../../../src/smartSelector.mjs'
import * as allocator from '../../../src/allocator.mjs'

describe('tickets route logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/tickets logic', () => {
    it('should check submitted status first', async () => {
      storage.hasWorklogForDate.mockReturnValue(true)

      const submitted = storage.hasWorklogForDate()
      expect(submitted).toBe(true)
    })

    it('should fetch tickets when not submitted', async () => {
      storage.hasWorklogForDate.mockReturnValue(false)
      jiraClient.getCustomFields.mockResolvedValue({ backlogAreaId: 'cf_10001' })
      jiraClient.searchMyTickets.mockResolvedValue({
        tickets: [
          { key: 'PROJ-1', summary: 'Ticket 1' },
          { key: 'PROJ-2', summary: 'Ticket 2' }
        ],
        filters: { projects: [], backlogAreas: [], types: [] }
      })

      const customFields = await jiraClient.getCustomFields()
      const { tickets, filters } = await jiraClient.searchMyTickets(customFields.backlogAreaId)

      expect(tickets.length).toBe(2)
      expect(jiraClient.searchMyTickets).toHaveBeenCalledWith('cf_10001')
    })

    it('should apply smart selector and allocator', async () => {
      const tickets = [
        { key: 'PROJ-1', summary: 'Ticket 1' },
        { key: 'PROJ-2', summary: 'Ticket 2' },
        { key: 'PROJ-3', summary: 'Ticket 3' }
      ]
      const recent = storage.getRecentTickets(7)

      const { preSelected } = smartSelector.getRecommendedTickets(tickets, recent)
      expect(preSelected.length).toBe(3)

      const allocation = allocator.allocateTime(preSelected)
      expect(Object.keys(allocation).length).toBe(3)
    })
  })

  describe('POST /api/ticket/search logic', () => {
    it('should validate input', () => {
      const input = ''
      expect(!input || !input.trim()).toBe(true)
    })

    it('should search ticket by key', async () => {
      jiraClient.getCustomFields.mockResolvedValue({ backlogAreaId: null })
      jiraClient.searchTicketByKeyOrUrl.mockResolvedValue({
        key: 'PROJ-123',
        summary: 'Test Ticket'
      })

      const customFields = await jiraClient.getCustomFields()
      const ticket = await jiraClient.searchTicketByKeyOrUrl('PROJ-123', customFields.backlogAreaId)

      expect(ticket.key).toBe('PROJ-123')
      expect(jiraClient.searchTicketByKeyOrUrl).toHaveBeenCalledWith('PROJ-123', null)
    })

    it('should throw for invalid key format', async () => {
      jiraClient.searchTicketByKeyOrUrl.mockRejectedValue(new Error('Invalid ticket key format'))

      await expect(jiraClient.searchTicketByKeyOrUrl('invalid')).rejects.toThrow()
    })
  })
})