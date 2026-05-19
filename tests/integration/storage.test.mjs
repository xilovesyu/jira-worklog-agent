/**
 * Integration tests for storage.mjs
 * Uses in-memory test database to avoid writing to real database
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Create a temporary test directory
const TEST_DIR = path.join(os.tmpdir(), 'jira-worklog-test-' + Date.now())

// Mock utils to provide consistent dates for testing
vi.mock('../../src/utils.mjs', () => ({
  getTodayDate: vi.fn(() => '2024-01-15'),
  getYesterdayDate: vi.fn(() => '2024-01-14'),
  getDateDaysAgo: vi.fn((days) => {
    // Simple mock: return a date N days before 2024-01-15
    const baseDate = new Date('2024-01-15')
    baseDate.setDate(baseDate.getDate() - days)
    return baseDate.toISOString().split('T')[0]
  })
}))

// Mock wasmEmbed - not needed for tests
vi.mock('../../src/wasmEmbed.mjs', () => ({
  wasmBinary: null
}))

// Import after mocking
import * as storage from '../../src/storage.mjs'

describe('storage', () => {
  // Initialize database with test directory before all tests
  beforeAll(async () => {
    // Set test data directory before initializing
    storage.setTestDataDir(TEST_DIR)
    await storage.initDatabase()
  })

  // Clean up test directory after all tests
  afterAll(() => {
    // Reset test data dir
    storage.setTestDataDir(null)

    // Remove test directory if exists
    if (fs.existsSync(TEST_DIR)) {
      try {
        fs.rmSync(TEST_DIR, { recursive: true, force: true })
      } catch (e) {
        // Ignore cleanup errors on Windows
      }
    }
  })

  describe('worklog operations', () => {
    it('should record and retrieve worklog', async () => {
      storage.recordWorklog('PROJ-WORKLOG-1', 4, '2024-01-15')
      const worklog = storage.getWorklogByDate('2024-01-15')
      expect(worklog.length).toBeGreaterThanOrEqual(1)
      const found = worklog.find(w => w.issue_key === 'PROJ-WORKLOG-1')
      expect(found).toBeDefined()
      expect(found.hours).toBe(4)
    })

    it('should check if worklog exists for date', async () => {
      storage.recordWorklog('PROJ-WORKLOG-2', 8, '2024-01-16')
      expect(storage.hasWorklogForDate('2024-01-16')).toBe(true)
      expect(storage.hasWorklogForDate('2099-12-31')).toBe(false)  // Future date should be empty
    })

    it('should delete worklog record', async () => {
      storage.recordWorklog('PROJ-WORKLOG-3', 4, '2024-01-17')
      expect(storage.hasWorklogForDate('2024-01-17')).toBe(true)
      storage.deleteWorklogRecord('PROJ-WORKLOG-3', '2024-01-17')
      expect(storage.hasWorklogForDate('2024-01-17')).toBe(false)
    })
  })

  describe('recent tickets operations', () => {
    it('should update recent ticket', async () => {
      storage.updateRecentTicket('TEST-RECENT-1', 'Test Issue', 'In Progress')
      const recent = storage.getRecentTickets(30)
      const found = recent.find(r => r.issue_key === 'TEST-RECENT-1')
      expect(found).toBeDefined()
    })

    it('should increment use count on repeated updates', async () => {
      storage.updateRecentTicket('TEST-RECENT-2', 'Test', 'Open')
      storage.updateRecentTicket('TEST-RECENT-2', 'Test', 'In Progress')
      const recent = storage.getRecentTickets(30)
      const found = recent.find(r => r.issue_key === 'TEST-RECENT-2')
      expect(found.use_count).toBeGreaterThanOrEqual(2)
    })
  })

  describe('allocation history operations', () => {
    it('should save allocation history', async () => {
      // Use today's date
      const today = new Date().toISOString().split('T')[0]

      const allocation = { 'PROJ-ALLOC-TEST': 4, 'PROJ-ALLOC-TEST2': 4 }
      storage.saveAllocationHistory(allocation, today)

      // Verify by retrieving history
      const history = storage.getWorklogHistory(1)  // Get 1 day
      const found = history.find(h => h.date === today && h.allocation['PROJ-ALLOC-TEST'])
      expect(found).toBeDefined()
    })

    it('should return null for non-existent allocation', async () => {
      // Yesterday is mocked to 2024-01-14
      storage.deleteWorklogForDate('2024-01-14')
      const allocation = storage.getYesterdayAllocation()
      // Should be null if no allocation saved for that date
      expect(allocation).toBeNull()
    })

    it('should get yesterday allocation when exists', async () => {
      storage.saveAllocationHistory({ 'PROJ-YESTERDAY': 8 }, '2024-01-14')
      const allocation = storage.getYesterdayAllocation()
      expect(allocation).toEqual({ 'PROJ-YESTERDAY': 8 })
    })
  })

  describe('sync operations', () => {
    it('should sync worklogs from Jira data', async () => {
      const testDate = '2024-01-19'
      const jiraWorklogs = [
        { issueKey: 'PROJ-SYNC-1', hours: 4 },
        { issueKey: 'PROJ-SYNC-2', hours: 4 }
      ]
      storage.syncWorklogForDate(jiraWorklogs, testDate)

      const worklog = storage.getWorklogByDate(testDate)
      expect(worklog.length).toBe(2)
      expect(worklog.find(w => w.issue_key === 'PROJ-SYNC-1')?.hours).toBe(4)
    })

    it('should replace existing worklogs on sync', async () => {
      const testDate = '2024-01-20'
      storage.recordWorklog('PROJ-OLD', 2, testDate)
      storage.syncWorklogForDate([{ issueKey: 'PROJ-NEW', hours: 8 }], testDate)

      const worklog = storage.getWorklogByDate(testDate)
      expect(worklog.length).toBe(1)
      expect(worklog[0].issue_key).toBe('PROJ-NEW')
    })
  })
})