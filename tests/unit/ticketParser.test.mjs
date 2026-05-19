/**
 * Unit tests for ticketParser.mjs
 * Tests ADF parsing and ticket extraction
 */

import { describe, it, expect } from 'vitest'
import { extractTextFromADF, extractBacklogArea, parseTicket } from '../../src/ticketParser.mjs'

describe('ticketParser', () => {
  describe('extractTextFromADF', () => {
    it('should return empty string for null/undefined input', () => {
      expect(extractTextFromADF(null)).toBe('')
      expect(extractTextFromADF(undefined)).toBe('')
      expect(extractTextFromADF({})).toBe('')
    })

    it('should extract text from simple paragraph', () => {
      const adf = {
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello World' }]
          }
        ]
      }
      expect(extractTextFromADF(adf)).toBe('Hello World')
    })

    it('should handle nested paragraphs', () => {
      const adf = {
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Line 1' },
              { type: 'text', text: 'Line 2' }
            ]
          }
        ]
      }
      expect(extractTextFromADF(adf)).toContain('Line 1')
      expect(extractTextFromADF(adf)).toContain('Line 2')
    })
  })

  describe('extractBacklogArea', () => {
    it('should return empty for null/undefined', () => {
      expect(extractBacklogArea(null)).toBe('')
      expect(extractBacklogArea(undefined)).toBe('')
    })

    it('should extract string value directly', () => {
      expect(extractBacklogArea('Backend')).toBe('Backend')
    })

    it('should extract from object with value property', () => {
      expect(extractBacklogArea({ value: 'Frontend' })).toBe('Frontend')
    })

    it('should extract from object with name property', () => {
      expect(extractBacklogArea({ name: 'API' })).toBe('API')
    })

    it('should join array values', () => {
      expect(extractBacklogArea([{ value: 'A' }, { value: 'B' }])).toBe('A, B')
    })
  })

  describe('parseTicket', () => {
    it('should parse basic issue', () => {
      const issue = {
        key: 'PROJ-123',
        fields: {
          summary: 'Test Issue',
          status: { name: 'In Progress' },
          priority: { name: 'High' },
          project: { key: 'PROJ', name: 'Project' },
          issuetype: { name: 'Task' }
        }
      }

      const result = parseTicket(issue)
      expect(result.key).toBe('PROJ-123')
      expect(result.summary).toBe('Test Issue')
      expect(result.status).toBe('In Progress')
      expect(result.isSubtask).toBe(false)
    })

    it('should identify subtask', () => {
      const issue = {
        key: 'PROJ-123',
        fields: {
          summary: 'Subtask',
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          project: { key: 'PROJ', name: 'Project' },
          issuetype: { name: 'Sub-task' },
          parent: { key: 'PROJ-100' }
        }
      }

      const result = parseTicket(issue)
      expect(result.isSubtask).toBe(true)
      expect(result.parentKey).toBe('PROJ-100')
    })
  })
})