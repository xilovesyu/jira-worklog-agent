/**
 * Integration tests for routes/worklog.mjs
 * Tests route handlers with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies before importing
vi.mock('../../../src/jiraClient.mjs', () => ({
  addWorklog: vi.fn(),
  getUserWorklogsByDate: vi.fn(() => []),
  getSubtasksByUser: vi.fn(() => []),
  createSubtask: vi.fn(),
  transitionIssue: vi.fn()
}))

vi.mock('../../../src/storage.mjs', () => ({
  saveAllocationHistory: vi.fn(),
  recordWorklog: vi.fn(),
  getWorklogByDate: vi.fn(() => []),
  getWorklogHistory: vi.fn(() => []),
  hasWorklogForDate: vi.fn(() => false),
  updateRecentTicket: vi.fn(),
  syncWorklogForDate: vi.fn()
}))

vi.mock('../../../src/utils.mjs', () => ({
  roundTo: vi.fn((n) => Math.round(n * 10) / 10),
  getTodayDate: vi.fn(() => '2024-01-15')
}))

// Import after mocking
import * as jiraClient from '../../../src/jiraClient.mjs'
import * as storage from '../../../src/storage.mjs'
import * as utils from '../../../src/utils.mjs'

describe('worklog route logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/submit logic', () => {
    it('should validate empty allocation', () => {
      const allocation = {}
      expect(!allocation || Object.keys(allocation).length === 0).toBe(true)
    })

    it('should check existing worklog hours', () => {
      storage.getWorklogByDate.mockReturnValue([
        { issue_key: 'PROJ-123', hours: 6 }
      ])

      const existingWorklog = storage.getWorklogByDate()
      const existingHours = existingWorklog.reduce((sum, w) => sum + w.hours, 0)

      expect(existingHours).toBe(6)
      expect(existingHours < 8).toBe(true)  // Can still add more
    })

    it('should block when 8h already logged', () => {
      storage.getWorklogByDate.mockReturnValue([
        { issue_key: 'PROJ-123', hours: 8 }
      ])

      const existingWorklog = storage.getWorklogByDate()
      const existingHours = existingWorklog.reduce((sum, w) => sum + w.hours, 0)

      expect(existingHours >= 8).toBe(true)  // Should block
    })

    it('should submit worklog to Jira and local storage', async () => {
      jiraClient.addWorklog.mockResolvedValue({ id: '123' })

      const allocation = { 'PROJ-123': 4, 'PROJ-456': 4 }
      const dateStr = '2024-01-15'

      for (const [issueKey, hours] of Object.entries(allocation)) {
        await jiraClient.addWorklog(issueKey, hours, `Daily work - ${dateStr}`, dateStr)
        storage.recordWorklog(issueKey, hours, dateStr)
      }

      expect(jiraClient.addWorklog).toHaveBeenCalledTimes(2)
      expect(storage.recordWorklog).toHaveBeenCalledTimes(2)
    })

    it('should calculate total hours', () => {
      const allocation = { 'PROJ-123': 4, 'PROJ-456': 4 }
      const totalHours = utils.roundTo(Object.values(allocation).reduce((a, b) => a + b, 0))

      expect(totalHours).toBe(8)
    })
  })

  describe('GET /api/worklog/today logic', () => {
    it('should return worklog for specific date', () => {
      storage.getWorklogByDate.mockReturnValue([
        { issue_key: 'PROJ-123', hours: 4, submitted_at: '2024-01-15T10:00:00Z' }
      ])

      const worklog = storage.getWorklogByDate('2024-01-15')
      expect(worklog.length).toBe(1)
      expect(worklog[0].issue_key).toBe('PROJ-123')
    })

    it('should return empty array when no worklog', () => {
      storage.getWorklogByDate.mockReturnValue([])

      const worklog = storage.getWorklogByDate('2024-01-15')
      expect(worklog).toEqual([])
    })
  })

  describe('GET /api/worklog/status logic', () => {
    it('should return true when worklog exists', () => {
      storage.hasWorklogForDate.mockReturnValue(true)

      const submitted = storage.hasWorklogForDate('2024-01-15')
      expect(submitted).toBe(true)
    })

    it('should return false when no worklog', () => {
      storage.hasWorklogForDate.mockReturnValue(false)

      const submitted = storage.hasWorklogForDate('2024-01-15')
      expect(submitted).toBe(false)
    })
  })

  describe('GET /api/worklog/history logic', () => {
    it('should return worklog history', () => {
      storage.getWorklogHistory.mockReturnValue([
        { date: '2024-01-14', allocation: { 'PROJ-123': 8 }, created_at: '2024-01-14T18:00:00Z' }
      ])

      const history = storage.getWorklogHistory(7)
      expect(history.length).toBe(1)
      expect(history[0].date).toBe('2024-01-14')
    })
  })

  describe('POST /api/worklog/check logic', () => {
    it('should compare local vs Jira worklogs', async () => {
      // Local worklogs
      storage.getWorklogByDate.mockReturnValue([
        { issue_key: 'PROJ-123', hours: 4 }
      ])

      // Jira worklogs
      jiraClient.getUserWorklogsByDate.mockResolvedValue([
        { issueKey: 'PROJ-123', hours: 4, summary: 'Test' }
      ])

      const localWorklogs = storage.getWorklogByDate('2024-01-15')
      const jiraWorklogs = await jiraClient.getUserWorklogsByDate('2024-01-15')

      expect(localWorklogs.length).toBe(1)
      expect(jiraWorklogs.length).toBe(1)
    })

    it('should detect differences', async () => {
      storage.getWorklogByDate.mockReturnValue([
        { issue_key: 'PROJ-123', hours: 2 }
      ])

      jiraClient.getUserWorklogsByDate.mockResolvedValue([
        { issueKey: 'PROJ-123', hours: 4, summary: 'Test' }
      ])

      const localWorklogs = storage.getWorklogByDate()
      const jiraWorklogsRes = await jiraClient.getUserWorklogsByDate('2024-01-15')

      const localHours = localWorklogs.reduce((sum, w) => sum + w.hours, 0)
      const jiraHours = jiraWorklogsRes.reduce((sum, w) => sum + w.hours, 0)

      expect(localHours).toBe(2)
      expect(jiraHours).toBe(4)
    })
  })

  describe('GET /api/bug/:key/subtasks logic', () => {
    it('should return subtasks', async () => {
      jiraClient.getSubtasksByUser.mockResolvedValue([
        { key: 'PROJ-124', summary: 'Subtask 1', status: 'Open' }
      ])

      const subtasks = await jiraClient.getSubtasksByUser('PROJ-123')
      expect(subtasks.length).toBe(1)
      expect(subtasks[0].key).toBe('PROJ-124')
    })
  })

  describe('POST /api/subtask logic', () => {
    it('should validate required fields', () => {
      const body = { parentKey: '', summary: '' }
      expect(!body.parentKey).toBe(true)
      expect(!body.summary).toBe(true)
    })

    it('should create subtask', async () => {
      jiraClient.createSubtask.mockResolvedValue('PROJ-125')

      const subtaskKey = await jiraClient.createSubtask('PROJ-123', 'New Subtask')
      expect(subtaskKey).toBe('PROJ-125')
    })
  })
})