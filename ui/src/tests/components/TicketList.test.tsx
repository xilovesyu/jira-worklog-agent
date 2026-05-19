/**
 * Tests for TicketList component
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TicketList from '../../components/TicketList'
import type { Ticket } from '../../types'

// Mock tickets data
const mockTickets: Ticket[] = [
  {
    key: 'PROJ-1',
    summary: 'First Ticket',
    status: 'Open',
    description: 'Description for first ticket'
  },
  {
    key: 'PROJ-2',
    summary: 'Second Ticket',
    status: 'In Progress',
    isSubtask: true,
    parentKey: 'PROJ-PARENT',
    parentSummary: 'Parent Ticket'
  },
  {
    key: 'PROJ-3',
    summary: 'Third Ticket',
    status: 'Done'
  }
]

describe('TicketList', () => {
  describe('basic rendering', () => {
    it('should render all tickets', () => {
      render(
        <TicketList
          tickets={mockTickets}
          selected={[]}
          onToggle={vi.fn()}
        />
      )

      expect(screen.getByText('PROJ-1')).toBeInTheDocument()
      expect(screen.getByText('PROJ-2')).toBeInTheDocument()
      expect(screen.getByText('PROJ-3')).toBeInTheDocument()
    })

    it('should show "No tickets found" when empty', () => {
      render(
        <TicketList
          tickets={[]}
          selected={[]}
          onToggle={vi.fn()}
        />
      )

      expect(screen.getByText('No tickets found')).toBeInTheDocument()
    })

    it('should display ticket summary and status', () => {
      render(
        <TicketList
          tickets={[mockTickets[0]]}
          selected={[]}
          onToggle={vi.fn()}
        />
      )

      expect(screen.getByText('First Ticket')).toBeInTheDocument()
      expect(screen.getByText('Open')).toBeInTheDocument()
    })
  })

  describe('selection', () => {
    it('should call onToggle when ticket row clicked', () => {
      const onToggle = vi.fn()
      render(
        <TicketList
          tickets={[mockTickets[0]]}
          selected={[]}
          onToggle={onToggle}
        />
      )

      fireEvent.click(screen.getByText('First Ticket'))
      expect(onToggle).toHaveBeenCalledWith('PROJ-1')
    })

    it('should call onToggle when checkbox clicked', () => {
      const onToggle = vi.fn()
      render(
        <TicketList
          tickets={[mockTickets[0]]}
          selected={[]}
          onToggle={onToggle}
        />
      )

      const checkbox = screen.getByRole('checkbox')
      fireEvent.click(checkbox)
      expect(onToggle).toHaveBeenCalledWith('PROJ-1')
    })

    it('should show checkbox as checked when selected', () => {
      render(
        <TicketList
          tickets={[mockTickets[0]]}
          selected={['PROJ-1']}
          onToggle={vi.fn()}
        />
      )

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toBeChecked()
    })

    it('should show checkbox as unchecked when not selected', () => {
      render(
        <TicketList
          tickets={[mockTickets[0]]}
          selected={[]}
          onToggle={vi.fn()}
        />
      )

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).not.toBeChecked()
    })
  })

  describe('display only mode', () => {
    it('should show hours badge instead of checkbox in displayOnly mode', () => {
      const ticketsWithHours = [{ ...mockTickets[0], hours: 4 }]
      render(
        <TicketList
          tickets={ticketsWithHours}
          selected={[]}
          onToggle={vi.fn()}
          displayOnly={true}
        />
      )

      expect(screen.getByText('4h')).toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('should not call onToggle in displayOnly mode when clicking row', () => {
      const onToggle = vi.fn()
      const ticketsWithHours = [{ ...mockTickets[0], hours: 4 }]
      render(
        <TicketList
          tickets={ticketsWithHours}
          selected={[]}
          onToggle={onToggle}
          displayOnly={true}
        />
      )

      fireEvent.click(screen.getByText('First Ticket'))
      expect(onToggle).not.toHaveBeenCalled()
    })
  })

  describe('expandable content', () => {
    it('should show toggle button for tickets with description', () => {
      render(
        <TicketList
          tickets={[mockTickets[0]]}
          selected={[]}
          onToggle={vi.fn()}
        />
      )

      // The button has title "展开自身内容" but accessible name is just "▶"
      const toggleBtn = screen.getByTitle('展开自身内容')
      expect(toggleBtn).toBeInTheDocument()
    })

    it('should expand content when toggle button clicked', () => {
      render(
        <TicketList
          tickets={[mockTickets[0]]}
          selected={[]}
          onToggle={vi.fn()}
        />
      )

      const toggleBtn = screen.getByTitle('展开自身内容')
      fireEvent.click(toggleBtn)

      expect(screen.getByText('Description for first ticket')).toBeInTheDocument()
    })

    it('should not show toggle button for tickets without description', () => {
      render(
        <TicketList
          tickets={[mockTickets[2]]}  // No description
          selected={[]}
          onToggle={vi.fn()}
        />
      )

      expect(screen.queryByTitle('展开自身内容')).not.toBeInTheDocument()
    })
  })

  describe('subtask parent info', () => {
    it('should show parent section for subtasks', () => {
      render(
        <TicketList
          tickets={[mockTickets[1]]}
          selected={[]}
          onToggle={vi.fn()}
        />
      )

      expect(screen.getByText('父任务:')).toBeInTheDocument()
      expect(screen.getByText('PROJ-PARENT')).toBeInTheDocument()
      // Use getAllByText since 'Parent Ticket' appears multiple times
      expect(screen.getAllByText('Parent Ticket').length).toBeGreaterThan(0)
    })
  })
})