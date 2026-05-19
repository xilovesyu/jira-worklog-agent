/**
 * Tests for MultiSelectDropdown component
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MultiSelectDropdown from '../../components/MultiSelectDropdown'

describe('MultiSelectDropdown', () => {
  const mockOptions = [
    { name: 'Option 1', key: 'opt1' },
    { name: 'Option 2', key: 'opt2' },
    { name: 'Option 3', key: 'opt3' }
  ]

  const defaultProps = {
    label: '项目',
    options: mockOptions,
    selected: [],
    onChange: vi.fn()
  }

  describe('basic rendering', () => {
    it('should render with label', () => {
      render(<MultiSelectDropdown {...defaultProps} />)

      expect(screen.getByText('全部 项目')).toBeInTheDocument()
    })

    it('should show count when partially selected', () => {
      render(<MultiSelectDropdown {...defaultProps} selected={['opt1']} />)

      expect(screen.getByText('1 个 项目')).toBeInTheDocument()
    })

    it('should show full label when all selected', () => {
      render(<MultiSelectDropdown {...defaultProps} selected={['opt1', 'opt2', 'opt3']} />)

      expect(screen.getByText('全部 项目')).toBeInTheDocument()
    })
  })

  describe('dropdown interaction', () => {
    it('should open dropdown when trigger clicked', () => {
      render(<MultiSelectDropdown {...defaultProps} />)

      const trigger = screen.getByRole('button', { name: /全部 项目/ })
      fireEvent.click(trigger)

      expect(screen.getByText('全选')).toBeInTheDocument()
      expect(screen.getByText('Option 1')).toBeInTheDocument()
    })

    it('should close dropdown when clicking outside', () => {
      render(
        <div>
          <MultiSelectDropdown {...defaultProps} />
          <div data-testid="outside">Outside</div>
        </div>
      )

      const trigger = screen.getByRole('button', { name: /全部 项目/ })
      fireEvent.click(trigger)
      expect(screen.getByText('Option 1')).toBeInTheDocument()

      fireEvent.mouseDown(screen.getByTestId('outside'))
      expect(screen.queryByText('Option 1')).not.toBeInTheDocument()
    })
  })

  describe('option selection', () => {
    it('should call onChange when option clicked', () => {
      const onChange = vi.fn()
      // Default valueKey is 'name', so onChange will use option.name
      render(<MultiSelectDropdown {...defaultProps} onChange={onChange} />)

      const trigger = screen.getByRole('button', { name: /全部 项目/ })
      fireEvent.click(trigger)

      fireEvent.click(screen.getByText('Option 1'))
      expect(onChange).toHaveBeenCalledWith(['Option 1'])
    })

    it('should toggle selection when clicking selected option', () => {
      const onChange = vi.fn()
      // Use valueKey='key' for this test since we're using key-based selection
      render(<MultiSelectDropdown {...defaultProps} valueKey="key" selected={['opt1', 'opt2']} onChange={onChange} />)

      const trigger = screen.getByRole('button', { name: /2 个 项目/ })
      fireEvent.click(trigger)

      fireEvent.click(screen.getByText('Option 1'))
      expect(onChange).toHaveBeenCalledWith(['opt2'])
    })

    it('should show checkbox as checked for selected options', () => {
      // Use valueKey='name' to match selection
      render(<MultiSelectDropdown {...defaultProps} valueKey="name" selected={['Option 1']} />)

      const trigger = screen.getByRole('button', { name: /1 个 项目/ })
      fireEvent.click(trigger)

      const option = screen.getByText('Option 1').closest('.multi-select-option')!
      expect(option).toHaveClass('selected')
    })
  })

  describe('select all', () => {
    it('should select all when "全选" clicked', () => {
      const onChange = vi.fn()
      // Default valueKey is 'name'
      render(<MultiSelectDropdown {...defaultProps} onChange={onChange} />)

      const trigger = screen.getByRole('button', { name: /全部 项目/ })
      fireEvent.click(trigger)

      fireEvent.click(screen.getByText('全选'))
      expect(onChange).toHaveBeenCalledWith(['Option 1', 'Option 2', 'Option 3'])
    })

    it('should deselect all when "取消全选" clicked', () => {
      const onChange = vi.fn()
      render(<MultiSelectDropdown {...defaultProps} valueKey="name" selected={['Option 1', 'Option 2', 'Option 3']} onChange={onChange} />)

      const trigger = screen.getByRole('button', { name: /全部 项目/ })
      fireEvent.click(trigger)

      fireEvent.click(screen.getByText('取消全选'))
      expect(onChange).toHaveBeenCalledWith([])
    })

    it('should show "取消全选" when all selected', () => {
      render(<MultiSelectDropdown {...defaultProps} selected={['opt1', 'opt2', 'opt3']} />)

      const trigger = screen.getByRole('button', { name: /全部 项目/ })
      fireEvent.click(trigger)

      expect(screen.getByText('取消全选')).toBeInTheDocument()
    })
  })

  describe('valueKey option', () => {
    it('should use key as value when valueKey is "key"', () => {
      const onChange = vi.fn()
      render(<MultiSelectDropdown {...defaultProps} valueKey="key" onChange={onChange} />)

      const trigger = screen.getByRole('button', { name: /全部 项目/ })
      fireEvent.click(trigger)

      fireEvent.click(screen.getByText('Option 1'))
      expect(onChange).toHaveBeenCalledWith(['opt1'])
    })

    it('should use name as value when valueKey is "name"', () => {
      const onChange = vi.fn()
      render(<MultiSelectDropdown {...defaultProps} valueKey="name" onChange={onChange} />)

      const trigger = screen.getByRole('button', { name: /全部 项目/ })
      fireEvent.click(trigger)

      fireEvent.click(screen.getByText('Option 1'))
      expect(onChange).toHaveBeenCalledWith(['Option 1'])
    })
  })

  describe('subtask styling', () => {
    it('should apply subtask class for subtask options', () => {
      const optionsWithSubtask = [
        { name: 'Task', key: 'task1' },
        { name: 'Subtask', key: 'sub1', isSubtask: true }
      ]
      render(<MultiSelectDropdown {...defaultProps} options={optionsWithSubtask} />)

      const trigger = screen.getByRole('button', { name: /全部 项目/ })
      fireEvent.click(trigger)

      const subtaskOption = screen.getByText('Subtask').parentElement!
      expect(subtaskOption).toHaveClass('subtask')
    })
  })
})