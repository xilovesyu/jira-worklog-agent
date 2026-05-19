/**
 * Unit tests for allocator.mjs
 * Tests time allocation algorithms
 */

import { describe, it, expect } from 'vitest'
import { allocateTime } from '../../src/allocator.mjs'

describe('allocateTime', () => {
  describe('basic allocation', () => {
    it('should return empty object for empty input', () => {
      expect(allocateTime([])).toEqual({})
      expect(allocateTime(null)).toEqual({})
      expect(allocateTime(undefined)).toEqual({})
    })

    it('should allocate all 8 hours to single ticket', () => {
      const result = allocateTime(['PROJ-1'])
      expect(result).toEqual({ 'PROJ-1': 8 })
    })

    it('should distribute evenly across multiple tickets', () => {
      const result = allocateTime(['PROJ-1', 'PROJ-2'])
      expect(result['PROJ-1']).toBe(4)
      expect(result['PROJ-2']).toBe(4)
      expect(Object.values(result).reduce((a, b) => a + b)).toBe(8)
    })

    it('should distribute evenly across 3 tickets', () => {
      const result = allocateTime(['PROJ-1', 'PROJ-2', 'PROJ-3'])
      const total = Object.values(result).reduce((a, b) => a + b)
      expect(total).toBe(8)
    })
  })
})