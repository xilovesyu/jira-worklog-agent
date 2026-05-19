/**
 * Tests for TimeAllocator component
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TimeAllocator from '../../components/TimeAllocator'
import { DEFAULT_JIRA_URL } from '../../api/queries'
import type { Allocation } from '../../types'

describe('TimeAllocator', () => {
  describe('basic rendering', () => {
    it('should show message when no allocation', () => {
      render(<TimeAllocator allocation={{}} />)

      expect(screen.getByText('请先选择 tickets')).toBeInTheDocument()
    })

    it('should render allocation items', () => {
      const allocation: Allocation = {
        'PROJ-1': 4,
        'PROJ-2': 2.5
      }
      render(<TimeAllocator allocation={allocation} />)

      expect(screen.getByText('PROJ-1')).toBeInTheDocument()
      expect(screen.getByText('4h')).toBeInTheDocument()
      expect(screen.getByText('PROJ-2')).toBeInTheDocument()
      expect(screen.getByText('2.5h')).toBeInTheDocument()
    })

    it('should show total hours', () => {
      const allocation: Allocation = {
        'PROJ-1': 4,
        'PROJ-2': 4
      }
      render(<TimeAllocator allocation={allocation} />)

      expect(screen.getByText('总计: 8h')).toBeInTheDocument()
    })

    it('should calculate total correctly with decimals', () => {
      const allocation: Allocation = {
        'PROJ-1': 2.7,
        'PROJ-2': 5.3
      }
      render(<TimeAllocator allocation={allocation} />)

      expect(screen.getByText('总计: 8h')).toBeInTheDocument()
    })
  })

  describe('Jira links', () => {
    it('should create correct Jira links with default server', () => {
      const allocation: Allocation = { 'PROJ-123': 8 }
      render(<TimeAllocator allocation={allocation} />)

      const link = screen.getByRole('link', { name: 'PROJ-123' })
      expect(link).toHaveAttribute('href', `${DEFAULT_JIRA_URL}browse/PROJ-123`)
      expect(link).toHaveAttribute('target', '_blank')
    })

    it('should create correct Jira links with custom server', () => {
      const allocation: Allocation = { 'PROJ-123': 8 }
      render(<TimeAllocator allocation={allocation} jiraServer="https://custom.jira.com/" />)

      const link = screen.getByRole('link', { name: 'PROJ-123' })
      expect(link).toHaveAttribute('href', 'https://custom.jira.com/browse/PROJ-123')
    })
  })

  describe('recalculate button', () => {
    it('should show recalculate button when onRecalculate provided', () => {
      const allocation: Allocation = { 'PROJ-1': 8 }
      render(<TimeAllocator allocation={allocation} onRecalculate={vi.fn()} />)

      expect(screen.getByRole('button', { name: '🔄 重分' })).toBeInTheDocument()
    })

    it('should not show recalculate button when onRecalculate not provided', () => {
      const allocation: Allocation = { 'PROJ-1': 8 }
      render(<TimeAllocator allocation={allocation} />)

      expect(screen.queryByRole('button', { name: '🔄 重分' })).not.toBeInTheDocument()
    })

    it('should call onRecalculate when button clicked', () => {
      const onRecalculate = vi.fn()
      const allocation: Allocation = { 'PROJ-1': 8 }
      render(<TimeAllocator allocation={allocation} onRecalculate={onRecalculate} />)

      fireEvent.click(screen.getByRole('button', { name: '🔄 重分' }))
      expect(onRecalculate).toHaveBeenCalled()
    })
  })
})