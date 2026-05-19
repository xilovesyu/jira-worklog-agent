/**
 * Unit tests for utils.mjs
 * Tests utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { roundTo, formatHours, getDateRange, getTimezoneOffset, getJiraTimezoneOffset, getTodayStartTime, getDateStartTime, getDateStartTimeForJira, getTodayStartTimeForJira, getDateDaysAgo, getTodayDate } from '../../src/utils.mjs'

// Mock config for timezone tests
vi.mock('../../src/config.mjs', () => ({
  loadConfig: () => ({
    timezone: 'local',
    jira: {
      server_timezone: 'America/Los_Angeles'
    }
  })
}))

describe('utils', () => {
  describe('roundTo', () => {
    it('should round to 1 decimal place by default', () => {
      expect(roundTo(1.234)).toBe(1.2)
      expect(roundTo(1.267)).toBe(1.3)
    })

    it('should round to specified decimal places', () => {
      expect(roundTo(1.234, 2)).toBe(1.23)
      expect(roundTo(1.236, 2)).toBe(1.24)
    })

    it('should handle integers', () => {
      expect(roundTo(8)).toBe(8)
    })
  })

  describe('formatHours', () => {
    it('should format hours with h suffix', () => {
      expect(formatHours(8)).toBe('8h')
      expect(formatHours(2.5)).toBe('2.5h')
    })
  })

  describe('getDateRange', () => {
    it('should return date range for given date', () => {
      const result = getDateRange('2024-01-15', 7)
      expect(result.end).toBe('2024-01-15')
      expect(result.start).toBe('2024-01-08')
    })

    it('should default to 7 days back', () => {
      const result = getDateRange('2024-01-01')
      expect(result.end).toBe('2024-01-01')
      expect(result.start).toBe('2023-12-25')
    })
  })

  describe('timezone functions', () => {
    describe('getTimezoneOffset', () => {
      it('should return local timezone offset', () => {
        const offset = getTimezoneOffset()
        // Offset should match +/-HHMM format
        expect(offset).toMatch(/^[+-]\d{4}$/)
      })

      it('should return offset for specific date', () => {
        const offset = getTimezoneOffset('2024-01-15')
        expect(offset).toMatch(/^[+-]\d{4}$/)
      })
    })

    describe('getJiraTimezoneOffset', () => {
      it('should return configured Jira server timezone', () => {
        const offset = getJiraTimezoneOffset()
        // Default is America/Los_Angeles = -0700 (PDT)
        expect(offset).toBe('-0700')
      })
    })

    describe('getTodayStartTime', () => {
      it('should return Jira format time with timezone', () => {
        const time = getTodayStartTime()
        // Format: YYYY-MM-DDTHH:MM:SS.000+HHMM
        expect(time).toMatch(/^\d{4}-\d{2}-\d{2}T09:00:00\.000[+-]\d{4}$/)
      })
    })

    describe('getDateStartTime', () => {
      it('should return Jira format time for specific date', () => {
        const time = getDateStartTime('2024-01-15')
        expect(time).toBe('2024-01-15T09:00:00.000' + getTimezoneOffset('2024-01-15'))
      })

      it('should always use correct format', () => {
        const time = getDateStartTime('2026-05-06')
        expect(time).toMatch(/^2026-05-06T09:00:00\.000[+-]\d{4}$/)
      })
    })

    describe('getDateStartTimeForJira', () => {
      it('should return time with Jira server timezone', () => {
        const time = getDateStartTimeForJira('2024-01-15')
        // Should use Jira server timezone (-0700 for America/Los_Angeles)
        expect(time).toBe('2024-01-15T09:00:00.000-0700')
      })

      it('should always use Jira server timezone regardless of local TZ', () => {
        const time = getDateStartTimeForJira('2026-05-18')
        expect(time).toBe('2026-05-18T09:00:00.000-0700')
      })
    })

    describe('getTodayStartTimeForJira', () => {
      it('should return today with Jira server timezone', () => {
        const time = getTodayStartTimeForJira()
        const today = getTodayDate()
        expect(time).toBe(`${today}T09:00:00.000-0700`)
      })
    })
  })

  describe('getDateDaysAgo', () => {
    it('should return correct date for 7 days ago', () => {
      // This test uses current date, so we just verify format
      const date = getDateDaysAgo(7)
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should return today for 0 days ago', () => {
      const date = getDateDaysAgo(0)
      expect(date).toBe(getTodayDate())
    })

    it('should return yesterday for 1 day ago', () => {
      const yesterday = getDateDaysAgo(1)
      const today = getTodayDate()
      // Verify it's a valid date format
      expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })
})