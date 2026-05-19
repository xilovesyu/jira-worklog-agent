import { useState } from 'react'
import type { Ticket } from '../types'
import { DEFAULT_JIRA_URL } from '../api/queries'

interface Props {
  tickets: Ticket[]
  selected: string[]
  onToggle: (ticketKey: string) => void
  jiraServer?: string
  displayOnly?: boolean  // When true, shows hours only (no checkbox)
  editableHours?: boolean  // When true, shows checkbox + editable hours input
  allocation?: Record<string, number>  // Hours allocation for each ticket
  onHoursChange?: (ticketKey: string, hours: number) => void  // Callback when hours change
}

function TicketList({ tickets, selected, onToggle, jiraServer, displayOnly, editableHours, allocation, onHoursChange }: Props) {
  if (tickets.length === 0) {
    return <div className="no-tickets">No tickets found</div>
  }

  return (
    <div className="ticket-list">
      {tickets.map(ticket => (
        <TicketItem
          key={ticket.key}
          ticket={ticket}
          isSelected={selected.includes(ticket.key)}
          onToggle={onToggle}
          jiraServer={jiraServer}
          displayOnly={displayOnly}
          editableHours={editableHours}
          hours={allocation?.[ticket.key] || ticket.hours || 0}
          onHoursChange={onHoursChange}
        />
      ))}
    </div>
  )
}

function TicketItem({
  ticket,
  isSelected,
  onToggle,
  jiraServer,
  displayOnly,
  editableHours,
  hours,
  onHoursChange
}: {
  ticket: Ticket
  isSelected: boolean
  onToggle: (key: string) => void
  jiraServer?: string
  displayOnly?: boolean
  editableHours?: boolean
  hours: number
  onHoursChange?: (key: string, hours: number) => void
}) {
  // 自身内容展开状态
  const [contentExpanded, setContentExpanded] = useState(false)
  // 父任务区块展开状态（默认展开）
  const [parentExpanded, setParentExpanded] = useState(true)
  // 小时编辑模式状态
  const [isEditingHours, setIsEditingHours] = useState(false)

  const getJiraUrl = (key: string) => `${jiraServer || DEFAULT_JIRA_URL}browse/${key}`

  // 是否有内容可展开
  const hasContent = !!ticket.description
  const hasParentContent = ticket.isSubtask && ticket.parentKey

  // Handle hours input change
  const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0
    const clampedValue = Math.max(0.5, Math.min(8, value))
    onHoursChange?.(ticket.key, clampedValue)
  }

  // Handle blur - exit edit mode
  const handleHoursBlur = () => {
    setIsEditingHours(false)
  }

  // Handle click on badge - enter edit mode
  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditingHours(true)
  }

  return (
    <div
      className={`ticket-item ${isSelected || displayOnly ? 'selected' : ''} ${ticket.isSubtask ? 'subtask' : ''} ${displayOnly ? 'display-only' : ''} ${editableHours ? 'editable-hours' : ''}`}
    >
      {/* 主行：折叠按钮(左) + checkbox/hours + ticket key + summary + status */}
      <div className="ticket-row" onClick={() => !displayOnly && !editableHours && onToggle(ticket.key)}>
        <span className="toggle-column">
          {hasContent ? (
            <button
              className="toggle-btn"
              onClick={(e) => { e.stopPropagation(); setContentExpanded(!contentExpanded) }}
              title="展开自身内容"
            >
              {contentExpanded ? '▼' : '▶'}
            </button>
          ) : (
            <span className="toggle-placeholder"></span>
          )}
        </span>

        {/* Selection + Hours column */}
        {displayOnly ? (
          // Display only mode: just show hours badge
          <span className="hours-badge">{hours}h</span>
        ) : editableHours ? (
          // Editable hours mode: checkbox + hours (badge or input)
          <>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => { e.stopPropagation(); onToggle(ticket.key) }}
            />
            {isSelected && (
              isEditingHours ? (
                // Edit mode: input with h suffix
                <div className="hours-edit-wrapper" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    className="hours-input-editing"
                    value={hours}
                    min={0.5}
                    max={8}
                    step={0.5}
                    onChange={handleHoursChange}
                    onBlur={handleHoursBlur}
                    autoFocus
                  />
                  <span className="hours-suffix">h</span>
                </div>
              ) : (
                // Display mode: badge, click to edit
                <span
                  className="hours-badge-editable"
                  onClick={handleBadgeClick}
                >
                  {hours}h
                </span>
              )
            )}
          </>
        ) : (
          // Normal mode: just checkbox
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(ticket.key)}
          />
        )}

        <a href={getJiraUrl(ticket.key)} target="_blank" rel="noopener noreferrer" className="ticket-key">
          {ticket.key}
        </a>
        <span className="ticket-summary">{ticket.summary}</span>
        <span className="ticket-status">{ticket.status}</span>
      </div>

      {/* 子任务：父任务区块（独立折叠，默认展开） */}
      {hasParentContent && (
        <div className="parent-section">
          <div className="parent-header" onClick={() => setParentExpanded(!parentExpanded)}>
            <span className="toggle-column">
              <button className="toggle-btn parent-toggle-btn" onClick={(e) => { e.stopPropagation(); setParentExpanded(!parentExpanded) }}>
                {parentExpanded ? '▼' : '▶'}
              </button>
            </span>
            <span className="parent-label">父任务:</span>
            <a href={getJiraUrl(ticket.parentKey!)} target="_blank" rel="noopener noreferrer" className="parent-key-link">
              {ticket.parentKey}
            </a>
            <span className="parent-summary">{ticket.parentSummary}</span>
          </div>
          {parentExpanded && (
            <div className="parent-content">
              <div className="content-row">
                <span className="content-label">标题:</span>
                <span className="content-value">{ticket.parentSummary}</span>
              </div>
              {ticket.parentDescription && (
                <div className="content-row">
                  <span className="content-label">内容:</span>
                  <pre className="content-text">{ticket.parentDescription}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 自身内容展开 */}
      {contentExpanded && hasContent && (
        <div className="ticket-content">
          <div className="content-row">
            <span className="content-label">内容:</span>
            <pre className="content-text">{ticket.description}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default TicketList