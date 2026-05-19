/**
 * Integration tests for jiraClient.mjs
 * Mocks axios HTTP requests to Jira API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create a mock API instance
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn()
}

// Mock axios.create to return our mock
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockApi)
  }
}))

// Mock config to provide test credentials
vi.mock('../../src/config.mjs', () => ({
  loadConfig: vi.fn(() => ({
    jira: {
      server: 'https://test.atlassian.net',
      api_token: 'test-token'
    }
  }))
}))

// Mock utils
vi.mock('../../src/utils.mjs', () => ({
  getTodayStartTime: vi.fn(() => '2024-01-15T09:00:00.000+0800'),
  getDateStartTime: vi.fn((date) => `${date}T09:00:00.000+0800`),
  getTodayStartTimeForJira: vi.fn(() => '2024-01-15T09:00:00.000-0700'),
  getDateStartTimeForJira: vi.fn((date) => `${date}T09:00:00.000-0700`),
  getTodayDate: vi.fn(() => '2024-01-15'),
  getDateRange: vi.fn((date, days) => ({ start: '2024-01-08', end: date || '2024-01-15' }))
}))

// Mock ticketParser
vi.mock('../../src/ticketParser.mjs', () => ({
  extractTextFromADF: vi.fn((adf) => adf?.content?.[0]?.content?.[0]?.text || ''),
  extractBacklogArea: vi.fn((field) => field?.value || field || ''),
  parseTicket: vi.fn((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary,
    status: issue.fields?.status?.name
  })),
  batchFetchParentDetails: vi.fn(() => {}),
  fetchParentDetails: vi.fn(() => null)
}))

// Import after mocking
import {
  testConnection,
  getCustomFields,
  addWorklog,
  getTicket,
  getIssueWorklogsByDate
} from '../../src/jiraClient.mjs'

describe('jiraClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('testConnection', () => {
    it('should return user data on successful connection', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { displayName: 'Test User', accountId: '12345' }
      })

      const result = await testConnection()
      expect(result.displayName).toBe('Test User')
      expect(mockApi.get).toHaveBeenCalledWith('/rest/api/2/myself')
    })

    it('should throw error on failed connection', async () => {
      mockApi.get.mockRejectedValueOnce({
        response: { status: 401, data: { errorMessages: ['Unauthorized'] } },
        message: 'Unauthorized'
      })

      await expect(testConnection()).rejects.toThrow()
    })
  })

  describe('getCustomFields', () => {
    it('should find Backlog Area field', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: [
          { id: 'customfield_10001', name: 'Backlog Area' },
          { id: 'customfield_10002', name: 'Other Field' }
        ]
      })

      const result = await getCustomFields()
      expect(result.backlogAreaId).toBe('customfield_10001')
      expect(result.backlogAreaName).toBe('Backlog Area')
    })

    it('should handle field not found', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: [{ id: 'customfield_10002', name: 'Other Field' }]
      })

      const result = await getCustomFields()
      expect(result.backlogAreaId).toBeNull()
    })

    it('should handle API error gracefully', async () => {
      mockApi.get.mockRejectedValueOnce({
        response: { status: 500 }
      })

      const result = await getCustomFields()
      expect(result.backlogAreaId).toBeNull()
    })
  })

  describe('addWorklog', () => {
    it('should add worklog to ticket', async () => {
      mockApi.post.mockResolvedValueOnce({
        data: { id: '12345', timeSpent: '4h' }
      })

      const result = await addWorklog('PROJ-123', 4, 'Test work')
      expect(result.id).toBe('12345')
      expect(mockApi.post).toHaveBeenCalledWith(
        '/rest/api/2/issue/PROJ-123/worklog',
        expect.objectContaining({
          timeSpent: '4h',
          comment: 'Test work'
        })
      )
    })
  })

  describe('getTicket', () => {
    it('should return ticket details', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: {
          key: 'PROJ-123',
          fields: {
            summary: 'Test Issue',
            status: { name: 'In Progress' }
          }
        }
      })

      const result = await getTicket('PROJ-123')
      expect(result.key).toBe('PROJ-123')
      expect(result.summary).toBe('Test Issue')
      expect(result.status).toBe('In Progress')
    })
  })

  describe('getIssueWorklogsByDate', () => {
    it('should return worklogs for specific date', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: {
          worklogs: [
            {
              id: '1',
              started: '2024-01-15T09:00:00.000+0800',
              timeSpentSeconds: 14400,  // 4 hours
              comment: 'Test'
            },
            {
              id: '2',
              started: '2024-01-14T09:00:00.000+0800',  // Different date
              timeSpentSeconds: 28800,
              comment: 'Other day'
            }
          ]
        }
      })

      const result = await getIssueWorklogsByDate('PROJ-123', '2024-01-15')
      expect(result.length).toBe(1)
      expect(result[0].hours).toBe(4)
    })

    it('should return empty array on error', async () => {
      mockApi.get.mockRejectedValueOnce({
        response: { status: 404 }
      })

      const result = await getIssueWorklogsByDate('PROJ-999', '2024-01-15')
      expect(result).toEqual([])
    })
  })
})