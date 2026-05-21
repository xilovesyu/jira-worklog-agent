import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import TicketList from './TicketList'
import FiltersSection from './FiltersSection'
import TicketSearch from './TicketSearch'
import type { AiRecommendation, Ticket, Allocation, Filters } from '../types'

interface Props {
  date: string // Date string to reset state on date change
  recommendation: AiRecommendation | null | undefined
  filters: Filters
  allTickets: Ticket[] // All available tickets for filtering
  addedTickets: Ticket[] // Tickets added via search
  newlyAddedKey?: string | null // Key of newly added ticket to auto-select
  onNewlyAddedKeyConsumed?: () => void // Callback to reset newlyAddedKey after consumption
  selectedProjects: string[]
  selectedBacklogAreas: string[]
  selectedTypes: string[]
  onProjectsChange: (projects: string[]) => void
  onBacklogAreasChange: (areas: string[]) => void
  onTypesChange: (types: string[]) => void
  onApprove: (allocation: Allocation) => void
  onAddTicket: (input: string) => void
  onSameAsYesterday?: () => void
  onCheck?: () => void
  hasYesterday?: boolean
  loading: boolean
  submitting: boolean
  checking?: boolean
  jiraServer: string
  targetHours: number
  existingHours?: number
}

/**
 * AI Recommendation Panel - Extended version
 * Dynamic partition: selected tickets / available tickets
 */
export function AiRecommendationPanel({
  date,
  recommendation,
  filters,
  allTickets,
  addedTickets,
  newlyAddedKey,
  onNewlyAddedKeyConsumed,
  selectedProjects,
  selectedBacklogAreas,
  selectedTypes,
  onProjectsChange,
  onBacklogAreasChange,
  onTypesChange,
  onApprove,
  onAddTicket,
  onSameAsYesterday,
  onCheck,
  hasYesterday,
  loading,
  submitting,
  checking,
  jiraServer,
  targetHours,
  existingHours = 0,
}: Props) {
  // ===== ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS =====

  // Use existingTotalHours from AI recommendation if available and NOT loading
  // During loading, recommendation may be stale placeholder data from previous date
  const aiExistingHours = !loading
    ? (recommendation?.existingTotalHours ?? existingHours ?? 0)
    : (existingHours ?? 0)

  // Calculate target hours based on actual existing hours (supplement mode: 8 - existing)
  const effectiveTargetHours = aiExistingHours > 0 && aiExistingHours < 8 ? 8 - aiExistingHours : targetHours

  // Local state for editable allocation
  const [editedAllocation, setEditedAllocation] = useState<Allocation | null>(null)
  // Local state for selected tickets
  const [selectedKeys, setSelectedKeys] = useState<string[] | null>(null)
  // State for expanding available tickets
  const [showAvailable, setShowAvailable] = useState(false)

  // Ref to track if we've initialized for the current date (prevents race conditions)
  const initializedDateRef = useRef<string | null>(null)
  // Track previous date to detect date changes
  const prevDateRef = useRef<string>(date)

  // Combined effect: reset on date change + initialize from recommendation
  // This avoids race conditions between separate reset and init effects
  useEffect(() => {
    // Check if date changed
    const dateChanged = prevDateRef.current !== date

    if (dateChanged) {
      // Reset state when date changes
      initializedDateRef.current = null
      setEditedAllocation(null)
      setSelectedKeys(null)
      setShowAvailable(false)
      prevDateRef.current = date
    }

    // Initialize from AI recommendation if conditions met
    const rec = recommendation?.recommendation
    const canInitialize = !loading
      && rec?.allocation
      && initializedDateRef.current !== date
      && editedAllocation === null

    if (canInitialize && rec) {
      const allocation = rec.allocation
      const keys = Object.keys(allocation).filter(k => allocation[k] > 0)
      setEditedAllocation(allocation)
      setSelectedKeys(keys)
      // Mark as initialized for this date
      initializedDateRef.current = date
    }
  }, [date, recommendation?.recommendation, editedAllocation, loading])

  // Auto-select newly added ticket (from handleAddTicket)
  useEffect(() => {
    if (newlyAddedKey && selectedKeys && !selectedKeys.includes(newlyAddedKey)) {
      setSelectedKeys([...selectedKeys, newlyAddedKey])
      setEditedAllocation(prev => ({
        ...prev,
        [newlyAddedKey]: 1
      }))
      // Reset newlyAddedKey in parent after consumption
      onNewlyAddedKeyConsumed?.()
    }
  }, [newlyAddedKey, selectedKeys, onNewlyAddedKeyConsumed])

  // Current allocation to use
  const currentAllocation = editedAllocation || recommendation?.recommendation?.allocation || {}

  // Calculate total hours from current allocation
  const totalHours = useMemo(() => {
    return selectedKeys?.reduce((sum, key) => sum + (currentAllocation[key] || 0), 0) || 0
  }, [currentAllocation, selectedKeys])

  // AI original allocation (for marking AI recommended tickets)
  const aiAllocation = recommendation?.recommendation?.allocation || {}
  const aiAllocatedKeys = useMemo(() => {
    return new Set(Object.keys(aiAllocation).filter(k => aiAllocation[k] > 0))
  }, [aiAllocation])

  // Filtered tickets from allTickets + addedTickets (using selected filters)
  const filteredTickets: Ticket[] = useMemo(() => {
    // Combine allTickets with addedTickets
    const combined = [...allTickets]
    for (const added of addedTickets) {
      if (!combined.some(t => t.key === added.key)) {
        combined.push(added)
      }
    }

    // Filter by selected filters
    return combined.filter(ticket => {
      if (selectedProjects.length > 0 && !selectedProjects.includes(ticket.projectKey || '')) return false
      if (selectedBacklogAreas.length > 0 && ticket.backlogArea && !selectedBacklogAreas.includes(ticket.backlogArea)) return false
      if (selectedTypes.length > 0 && !selectedTypes.includes(ticket.typeName || '')) return false
      return true
    })
  }, [allTickets, addedTickets, selectedProjects, selectedBacklogAreas, selectedTypes])

  // Merge all ticket sources into a unified map
  const allAvailableTickets: Ticket[] = useMemo(() => {
    if (!recommendation?.tickets) return filteredTickets

    const merged = new Map<string, Ticket>()

    // 1. AI analyzed tickets (with full details including activityActions)
    for (const t of recommendation.tickets) {
      merged.set(t.key, {
        key: t.key,
        summary: t.summary,
        status: t.status || 'Unknown',
        description: t.description || undefined,
        isSubtask: t.isSubtask || false,
        parentKey: t.parentKey || undefined,
        parentSummary: t.parentSummary || undefined,
        parentDescription: t.parentDescription || undefined,
        typeName: t.typeName || undefined,
        projectKey: t.projectKey || undefined,
        backlogArea: t.backlogArea || undefined,
        // User's own activity actions (for sorting)
        activityActions: t.activityActions || [],
      })
    }

    // 2. Filtered tickets (add any not in AI list)
    for (const t of filteredTickets) {
      if (!merged.has(t.key)) {
        merged.set(t.key, t)
      }
    }

    return Array.from(merged.values())
  }, [recommendation?.tickets, filteredTickets])

  // Apply filters to allAvailableTickets (only affects display sections, not tags)
  const filteredAllTickets: Ticket[] = useMemo(() => {
    return allAvailableTickets.filter(ticket => {
      if (selectedProjects.length > 0 && !selectedProjects.includes(ticket.projectKey || '')) return false
      if (selectedBacklogAreas.length > 0 && ticket.backlogArea && !selectedBacklogAreas.includes(ticket.backlogArea)) return false
      if (selectedTypes.length > 0 && !selectedTypes.includes(ticket.typeName || '')) return false
      return true
    })
  }, [allAvailableTickets, selectedProjects, selectedBacklogAreas, selectedTypes])

  // Build filters dynamically from available tickets (in case filters prop is empty)
  const dynamicFilters: Filters = useMemo(() => {
    // Use provided filters if available
    if (filters.projects?.length > 0) {
      return filters
    }

    // Otherwise build from allAvailableTickets and allTickets
    const combined = [...allAvailableTickets, ...allTickets]
    const projectsMap = new Map<string, { key: string; name: string }>()
    const backlogAreasSet = new Set<string>()
    const typesMap = new Map<string, { name: string; isSubtask?: boolean }>()

    for (const t of combined) {
      if (t.projectKey) {
        const existing = projectsMap.get(t.projectKey)
        if (!existing) {
          // Try to get project name from allTickets
          const ticketWithName = allTickets.find(at => at.projectKey === t.projectKey && at.projectName)
          projectsMap.set(t.projectKey, {
            key: t.projectKey,
            name: ticketWithName?.projectName || t.projectKey
          })
        }
      }
      if (t.backlogArea) {
        backlogAreasSet.add(t.backlogArea)
      }
      if (t.typeName) {
        if (!typesMap.has(t.typeName)) {
          typesMap.set(t.typeName, {
            name: t.typeName,
            isSubtask: t.isSubtask
          })
        }
      }
    }

    return {
      projects: Array.from(projectsMap.values()),
      backlogAreas: Array.from(backlogAreasSet),
      types: Array.from(typesMap.values())
    }
  }, [filters, allAvailableTickets, allTickets])

  // ALL selected tickets (for tags display - NOT filtered)
  const allSelectedTickets: Ticket[] = useMemo(() => {
    return allAvailableTickets
      .filter(t => selectedKeys?.includes(t.key))
      .map(t => ({
        ...t,
        hours: currentAllocation[t.key] || 0,
        isAiRecommended: aiAllocatedKeys.has(t.key),
      }))
  }, [allAvailableTickets, selectedKeys, currentAllocation, aiAllocatedKeys])

  // SELECTED tickets (filtered - for display section)
  const selectedTickets: Ticket[] = useMemo(() => {
    return filteredAllTickets
      .filter(t => selectedKeys?.includes(t.key))
      .map(t => ({
        ...t,
        hours: currentAllocation[t.key] || 0,
        isAiRecommended: aiAllocatedKeys.has(t.key),
      }))
  }, [filteredAllTickets, selectedKeys, currentAllocation, aiAllocatedKeys])

  // Helper: get latest activity time from a ticket (user's own actions only)
  const getLatestActivityTime = useCallback((ticket: Ticket): string | null => {
    const actions = ticket.activityActions || []
    if (actions.length === 0) return null
    // actions are already sorted descending by time in backend
    return actions[0]?.time || null
  }, [])

  // AVAILABLE tickets (filtered - not selected) - sorted by user's own activity time
  const availableTickets: Ticket[] = useMemo(() => {
    const available = filteredAllTickets.filter(t => !selectedKeys?.includes(t.key))

    // Sort by user's most recent activity time (descending)
    // activityActions only contains user's own actions (filtered in backend)
    return available.sort((a, b) => {
      const aTime = getLatestActivityTime(a)
      const bTime = getLatestActivityTime(b)

      // Has activity > no activity
      if (!aTime && !bTime) return 0
      if (!aTime) return 1   // a has no activity, put after
      if (!bTime) return -1  // b has no activity, put after

      // Both have activity, compare times (newest first)
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
  }, [filteredAllTickets, selectedKeys, getLatestActivityTime])

  const hasAvailable = availableTickets.length > 0

  // Handle ticket selection toggle
  const handleToggle = useCallback((ticketKey: string) => {
    if (!selectedKeys) return

    if (selectedKeys.includes(ticketKey)) {
      // Remove from selection
      setSelectedKeys(selectedKeys.filter(k => k !== ticketKey))
      setEditedAllocation(prev => {
        if (!prev) return prev
        const newAlloc = { ...prev }
        delete newAlloc[ticketKey]
        return newAlloc
      })
    } else {
      // Add to selection with default 1h
      setSelectedKeys([...selectedKeys, ticketKey])
      setEditedAllocation(prev => ({
        ...prev,
        [ticketKey]: 1
      }))
    }
  }, [selectedKeys])

  // Handle hours change
  const handleHoursChange = useCallback((ticketKey: string, hours: number) => {
    setEditedAllocation(prev => ({
      ...prev,
      [ticketKey]: hours
    }))
  }, [])

  // Get overall confidence level display
  const getOverallConfidence = useCallback((level: string) => {
    const percentage = level === 'high' ? '75-100' : level === 'medium' ? '50-74' : '25-49'
    return `${percentage}/100`
  }, [])

  // Handle approve - pass current allocation
  const handleApprove = useCallback(() => {
    onApprove(currentAllocation)
  }, [onApprove, currentAllocation])

  // Hours warning - use effective target hours (calculated from AI data)
  const hoursWarning = totalHours !== effectiveTargetHours
  const finalTotal = aiExistingHours + totalHours

  // ===== NOW WE CAN DO EARLY RETURNS =====

  // Handle loading state
  if (loading) {
    return (
      <div className="ai-panel loading">
        <div className="ai-header">
          <span className="ai-icon">🤖</span>
          <span className="ai-title">AI推荐</span>
        </div>
        <div className="ai-loading">正在分析工作证据...</div>
      </div>
    )
  }

  // Handle disabled/empty state
  if (!recommendation || !recommendation.enabled) {
    return null
  }

  // Handle no recommendation state
  if (!recommendation.tickets || recommendation.tickets.length === 0) {
    return (
      <div className="ai-panel empty">
        <div className="ai-header">
          <span className="ai-icon">🤖</span>
          <span className="ai-title">AI推荐</span>
        </div>
        <div className="ai-empty-message">
          {recommendation.message || '没有找到足够的工作证据来生成推荐'}
        </div>
      </div>
    )
  }

  // ===== RENDER =====

  return (
    <div className="ai-panel extended">
      <div className="ai-header">
        <span className="ai-icon">🤖</span>
        <span className="ai-title">AI推荐</span>
        {recommendation.llm_used && (
          <span className="llm-badge">{recommendation.llm_provider || 'LLM'}</span>
        )}
        <span className={`ai-total-hours ${hoursWarning ? 'warning' : ''}`}>
          {totalHours}h {hoursWarning && `(目标: ${effectiveTargetHours}h)`}
        </span>
      </div>

      {/* Existing worklog section - show already logged hours (only when not loading to avoid stale placeholder data) */}
      {!loading && recommendation.existingWorklog && recommendation.existingWorklog.length > 0 && (
        <div className="ai-existing-section">
          <div className="existing-header">
            <span className="existing-label">已记录 ({recommendation.existingTotalHours || 0}h)</span>
          </div>
          <div className="existing-list">
            {recommendation.existingWorklog.map(w => (
              <span key={w.issue_key} className="existing-item" title={w.summary || ''}>
                <a
                  href={`${jiraServer}browse/${w.issue_key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="existing-key"
                >
                  {w.issue_key}
                </a>
                <span className="existing-hours">{w.hours}h</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters section - before tickets */}
      <div className="ai-filters-section">
        <FiltersSection
          filters={dynamicFilters}
          selectedProjects={selectedProjects}
          selectedBacklogAreas={selectedBacklogAreas}
          selectedTypes={selectedTypes}
          onProjectsChange={onProjectsChange}
          onBacklogAreasChange={onBacklogAreasChange}
          onTypesChange={onTypesChange}
        />
      </div>

      {/* Search section - before tickets */}
      <div className="ai-search-section">
        <TicketSearch onAdd={onAddTicket} disabled={submitting} />
      </div>

      {/* Selected tickets section */}
      <div className="ai-selected-section">
        <div className="ai-section-header">
          <span className="section-label">已选择 ({selectedTickets.length})</span>
        </div>
        {selectedTickets.length > 0 ? (
          <TicketList
            tickets={selectedTickets}
            selected={selectedKeys || []}
            onToggle={handleToggle}
            jiraServer={jiraServer}
            editableHours={true}
            allocation={currentAllocation}
            onHoursChange={handleHoursChange}
          />
        ) : (
          <div className="ai-no-selection">暂无选择，从可选区勾选添加</div>
        )}
      </div>

      {/* Available tickets section (collapsible) */}
      {hasAvailable && (
        <div className="ai-available-section">
          <button
            className="ai-available-toggle"
            onClick={() => setShowAvailable(!showAvailable)}
          >
            <span className="toggle-icon">{showAvailable ? '▼' : '▶'}</span>
            <span className="toggle-label">可选 ({availableTickets.length})</span>
          </button>
          {showAvailable && (
            <div className="ai-available-content">
              <TicketList
                tickets={availableTickets}
                selected={selectedKeys || []}
                onToggle={handleToggle}
                jiraServer={jiraServer}
                editableHours={true}
                allocation={currentAllocation}
                onHoursChange={handleHoursChange}
              />
            </div>
          )}
        </div>
      )}

      {/* AI explanation */}
      {recommendation.explanation && (
        <div className="ai-explanation">{recommendation.explanation}</div>
      )}

      {/* Confidence indicator */}
      <div className="ai-meta">
        <span className="ai-confidence-label">置信度: {getOverallConfidence(recommendation.confidence_level)}</span>
        {editedAllocation && JSON.stringify(editedAllocation) !== JSON.stringify(recommendation.recommendation?.allocation) && (
          <span className="ai-modified-badge">已修改</span>
        )}
      </div>

      {/* Total hours display with selected tags */}
      <div className="ai-total-display">
        <span className="total-label">总计:</span>
        <span className={`total-value ${finalTotal >= 8 ? 'ok' : 'low'}`}>
          {Math.round(finalTotal * 10) / 10}h
        </span>
        {aiExistingHours > 0 && (
          <span className="total-detail">(已有 {aiExistingHours}h + 新增 {totalHours}h)</span>
        )}
        {/* Selected ticket tags (shows ALL selected, not filtered) */}
        {allSelectedTickets.length > 0 && (
          <div className="ai-selected-tags">
            {allSelectedTickets.map(t => (
              <span
                key={t.key}
                className="ai-tag"
                title={`${t.summary} - ${t.hours}h`}
              >
                <span className="tag-key">{t.key}</span>
                <span className="tag-hours">{t.hours}h</span>
                <button
                  className="tag-remove"
                  onClick={() => handleToggle(t.key)}
                  title="取消选择"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="ai-actions">
        <button
          className="ai-btn approve"
          onClick={handleApprove}
          disabled={submitting || selectedKeys?.length === 0 || totalHours === 0}
        >
          {submitting ? '提交中...' : '✓ 提交'}
        </button>
        {hasYesterday && onSameAsYesterday && (
          <button className="ai-btn yesterday" onClick={onSameAsYesterday} disabled={submitting}>
            同昨天
          </button>
        )}
        {onCheck && (
          <button className="ai-btn check" onClick={onCheck} disabled={submitting || checking}>
            {checking ? '检查中...' : '🔍 检查同步'}
          </button>
        )}
      </div>
    </div>
  )
}