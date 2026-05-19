/**
 * Tests for QuickActions component
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuickActions from '../../components/QuickActions'

describe('QuickActions', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onSameAsYesterday: vi.fn(),
    onCheck: vi.fn(),
    onSkip: vi.fn(),
    onClearSelection: vi.fn(),
    hasYesterday: false,
    disabled: false,
    submitting: false,
    totalHours: 8,
    hasSelection: false
  }

  describe('submit button', () => {
    it('should render submit button', () => {
      render(<QuickActions {...defaultProps} />)

      expect(screen.getByRole('button', { name: '✅ 确认提交' })).toBeInTheDocument()
    })

    it('should show "提交中..." when submitting', () => {
      render(<QuickActions {...defaultProps} submitting={true} />)

      expect(screen.getByRole('button', { name: '提交中...' })).toBeInTheDocument()
    })

    it('should call onSubmit when clicked', () => {
      const onSubmit = vi.fn()
      render(<QuickActions {...defaultProps} onSubmit={onSubmit} />)

      fireEvent.click(screen.getByRole('button', { name: '✅ 确认提交' }))
      expect(onSubmit).toHaveBeenCalled()
    })

    it('should be disabled when not 8 hours', () => {
      render(<QuickActions {...defaultProps} totalHours={6} />)

      const btn = screen.getByRole('button', { name: '✅ 确认提交' })
      expect(btn).toBeDisabled()
    })

    it('should be disabled when submitting', () => {
      render(<QuickActions {...defaultProps} submitting={true} />)

      const btn = screen.getByRole('button', { name: '提交中...' })
      expect(btn).toBeDisabled()
    })

    it('should be enabled when exactly 8 hours', () => {
      render(<QuickActions {...defaultProps} totalHours={8} />)

      const btn = screen.getByRole('button', { name: '✅ 确认提交' })
      expect(btn).not.toBeDisabled()
    })
  })

  describe('hours warning', () => {
    it('should show warning when total is not 8 hours', () => {
      render(<QuickActions {...defaultProps} totalHours={6} />)

      expect(screen.getByText('总时间需为 8h (当前: 6h)')).toBeInTheDocument()
    })

    it('should not show warning when total is 8 hours', () => {
      render(<QuickActions {...defaultProps} totalHours={8} />)

      expect(screen.queryByText(/总时间需为 8h/)).not.toBeInTheDocument()
    })

    it('should not show warning when total is 0', () => {
      render(<QuickActions {...defaultProps} totalHours={0} />)

      expect(screen.queryByText(/总时间需为 8h/)).not.toBeInTheDocument()
    })

    it('should show correct current hours in warning', () => {
      render(<QuickActions {...defaultProps} totalHours={7.5} />)

      expect(screen.getByText('总时间需为 8h (当前: 7.5h)')).toBeInTheDocument()
    })
  })

  describe('same as yesterday button', () => {
    it('should show button when hasYesterday is true', () => {
      render(<QuickActions {...defaultProps} hasYesterday={true} />)

      expect(screen.getByRole('button', { name: '📋 同昨天' })).toBeInTheDocument()
    })

    it('should not show button when hasYesterday is false', () => {
      render(<QuickActions {...defaultProps} hasYesterday={false} />)

      expect(screen.queryByRole('button', { name: '📋 同昨天' })).not.toBeInTheDocument()
    })

    it('should call onSameAsYesterday when clicked', () => {
      const onSameAsYesterday = vi.fn()
      render(<QuickActions {...defaultProps} hasYesterday={true} onSameAsYesterday={onSameAsYesterday} />)

      fireEvent.click(screen.getByRole('button', { name: '📋 同昨天' }))
      expect(onSameAsYesterday).toHaveBeenCalled()
    })

    it('should be disabled when submitting', () => {
      render(<QuickActions {...defaultProps} hasYesterday={true} submitting={true} />)

      const btn = screen.getByRole('button', { name: '📋 同昨天' })
      expect(btn).toBeDisabled()
    })
  })

  describe('clear selection button', () => {
    it('should show button when hasSelection is true', () => {
      render(<QuickActions {...defaultProps} hasSelection={true} />)

      expect(screen.getByRole('button', { name: '🗑️ 取消选择' })).toBeInTheDocument()
    })

    it('should not show button when hasSelection is false', () => {
      render(<QuickActions {...defaultProps} hasSelection={false} />)

      expect(screen.queryByRole('button', { name: '🗑️ 取消选择' })).not.toBeInTheDocument()
    })

    it('should call onClearSelection when clicked', () => {
      const onClearSelection = vi.fn()
      render(<QuickActions {...defaultProps} hasSelection={true} onClearSelection={onClearSelection} />)

      fireEvent.click(screen.getByRole('button', { name: '🗑️ 取消选择' }))
      expect(onClearSelection).toHaveBeenCalled()
    })
  })

  describe('check and skip buttons', () => {
    it('should render check button', () => {
      render(<QuickActions {...defaultProps} />)

      expect(screen.getByRole('button', { name: '🔍 检查' })).toBeInTheDocument()
    })

    it('should render skip button', () => {
      render(<QuickActions {...defaultProps} />)

      expect(screen.getByRole('button', { name: '⏭️ 跳过' })).toBeInTheDocument()
    })

    it('should call onCheck when clicked', () => {
      const onCheck = vi.fn()
      render(<QuickActions {...defaultProps} onCheck={onCheck} />)

      fireEvent.click(screen.getByRole('button', { name: '🔍 检查' }))
      expect(onCheck).toHaveBeenCalled()
    })

    it('should call onSkip when clicked', () => {
      const onSkip = vi.fn()
      render(<QuickActions {...defaultProps} onSkip={onSkip} />)

      fireEvent.click(screen.getByRole('button', { name: '⏭️ 跳过' }))
      expect(onSkip).toHaveBeenCalled()
    })

    it('should be disabled when submitting', () => {
      render(<QuickActions {...defaultProps} submitting={true} />)

      expect(screen.getByRole('button', { name: '🔍 检查' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '⏭️ 跳过' })).toBeDisabled()
    })
  })
})