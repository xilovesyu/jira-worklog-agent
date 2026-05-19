import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import CalendarSection from '../components/CalendarSection'
import SubmittedView from '../components/SubmittedView'
import SupplementSection from '../components/SupplementSection'
import BugWorklogModal from '../components/BugWorklogModal'
import { AiRecommendationPanel } from '../components/AiRecommendationPanel'
// Commented imports - now integrated into AiRecommendationPanel
// import FiltersSection from '../components/FiltersSection'
// import TicketList from '../components/TicketList'
// import TimeAllocator from '../components/TimeAllocator'
// import QuickActions from '../components/QuickActions'
// import TicketSearch from '../components/TicketSearch'
import {
  useTickets,
  useWorklog,
  useWorklogHistory,
  useJiraServer,
  useSubmitWorklog,
  useCheckWorklog,
  useSearchTicket,
  useSubmittedTickets,
  useCreateSubtask,
  useTransitionIssue,
  useAiRecommendation,
  useSubmitAiRecommendation,
  DEFAULT_JIRA_URL,
} from '../api/queries'
import { dateToStr, formatDate, safeDate, calculateAllocation, extractFilteredProjects, extractFilteredBacklogAreas } from '../utils/helpers'
import type { Allocation, Ticket } from '../types'

function LogPage() {
  // Calendar state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const safeSelectedDate = safeDate(selectedDate)
  const selectedDateStr = dateToStr(selectedDate)

  // Selection & allocation state (local UI state)
  const [selected, setSelected] = useState<string[]>([])
  // allocation is kept for handleAiEdit/handleSkip, but not directly used elsewhere
  const [_allocation, setAllocation] = useState<Allocation>({})
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [selectedBacklogAreas, setSelectedBacklogAreas] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [addedTickets, setAddedTickets] = useState<Ticket[]>([])

  // Track if preSelected has been initialized (prevent re-init when user clears selection)
  const preSelectedInitializedRef = useRef(false)

  // Bug worklog modal state
  const [showBugModal, setShowBugModal] = useState(false)
  const [pendingBugs, setPendingBugs] = useState<Ticket[]>([])
  const [pendingAllocation, setPendingAllocation] = useState<Allocation>({})

  // React Query hooks
  const ticketsQuery = useTickets(selectedDateStr)
  const worklogQuery = useWorklog(selectedDateStr)
  const historyQuery = useWorklogHistory(30)
  const jiraServerQuery = useJiraServer()
  const submitMutation = useSubmitWorklog()
  const checkMutation = useCheckWorklog()
  const searchMutation = useSearchTicket()
  const createSubtaskMutation = useCreateSubtask()
  const transitionMutation = useTransitionIssue()

  // AI hooks
  const aiRecommendationQuery = useAiRecommendation(selectedDateStr)
  const aiSubmitMutation = useSubmitAiRecommendation()

  // AI state
  const [showAiPanel, setShowAiPanel] = useState(true)
  const [aiApproved, setAiApproved] = useState(false)

  // Derived state from queries
  const jiraServer = jiraServerQuery.data || DEFAULT_JIRA_URL
  const ticketsData = ticketsQuery.data
  const worklogData = worklogQuery.data
  const allTickets = ticketsData?.tickets || []
  const filters = ticketsData?.filters || { projects: [], backlogAreas: [], types: [] }
  const existingWorklog = worklogData?.worklog || []
  const existingHours = existingWorklog.reduce((sum, w) => sum + (w?.hours || 0), 0)
  const isSubmitted = worklogData?.submitted && existingHours > 0
  const isFullySubmitted = existingHours >= 8
  const isSupplementMode = isSubmitted && existingHours < 8
  const targetHours = isSupplementMode ? 8 - existingHours : 8

  // Calendar days with records
  const daysWithRecords = useMemo(() => {
    const set = new Set<string>()
    for (const entry of historyQuery.data?.history || []) {
      if (entry?.date) set.add(entry.date)
    }
    if (worklogData?.submitted) set.add(dateToStr(new Date()))
    return set
  }, [historyQuery.data, worklogData?.submitted])

  // Submitted tickets with full details (fetched from Jira)
  const submittedTicketsQuery = useSubmittedTickets(existingWorklog, selectedDateStr)
  const submittedTickets = submittedTicketsQuery.data || []

  // === Commented: filteredTickets (now managed by AI panel) ===
  // Filtered tickets (combine API tickets with manually added ones)
  /*
  const filteredTickets = useMemo(() => {
    // Combine allTickets from API with addedTickets from manual search
    const combinedTickets = [...allTickets]
    for (const added of addedTickets) {
      if (!combinedTickets.some(t => t.key === added.key)) {
        combinedTickets.push(added)
      }
    }

    return combinedTickets.filter(ticket => {
      if (selectedProjects.length > 0 && !selectedProjects.includes(ticket.projectKey || '')) return false
      if (selectedBacklogAreas.length > 0 && ticket.backlogArea && !selectedBacklogAreas.includes(ticket.backlogArea)) return false
      if (selectedTypes.length > 0 && !selectedTypes.includes(ticket.typeName || '')) return true
      return true
    })
  }, [allTickets, addedTickets, selectedProjects, selectedBacklogAreas, selectedTypes])
  */

  // Initialize selection from preSelected when data loads (only once)
  useMemo(() => {
    if (!preSelectedInitializedRef.current && !ticketsQuery.isLoading && ticketsData?.preSelected && ticketsData.preSelected.length > 0 && selected.length === 0) {
      const preSelected = ticketsData.preSelected
      setSelected(preSelected)
      setAllocation(calculateAllocation(preSelected, 8))

      // Set default filters
      const filteredProjects = extractFilteredProjects(filters.projects)
      const filteredAreas = extractFilteredBacklogAreas(filters.backlogAreas)
      const allTypes = (filters.types || []).map(t => t?.name).filter(Boolean)

      setSelectedProjects(filteredProjects)
      setSelectedBacklogAreas(filteredAreas)
      setSelectedTypes(allTypes)

      // Mark as initialized to prevent re-init when user clears selection
      preSelectedInitializedRef.current = true
    }
  }, [ticketsQuery.isLoading, ticketsData, selected.length, filters])

  // Reset initialization flag and clear added tickets when date changes
  useEffect(() => {
    preSelectedInitializedRef.current = false
    setAddedTickets([])
  }, [selectedDateStr])

  // === Commented: handleToggle (now managed by AI panel) ===
  /*
  // Handlers
  const handleToggle = useCallback((ticketKey: string) => {
    const newSelected = selected.includes(ticketKey)
      ? selected.filter(k => k !== ticketKey)
      : [...selected, ticketKey]
    setSelected(newSelected)
    setAllocation(calculateAllocation(newSelected, targetHours))
  }, [selected, targetHours])

  // Check if selected tickets contain Bugs (not subtasks)
  const selectedBugs = useMemo(() => {
    return allTickets.filter(ticket =>
      selected.includes(ticket.key) &&
      ticket.typeName === 'Bug' &&
      !ticket.isSubtask
    )
  }, [allTickets, selected])

  const handleSubmit = useCallback(() => {
    if (selected.length === 0) return
    const total = Object.values(allocation).reduce((a, b) => a + b, 0)
    if (total <= 0) return

    // Check if there are Bugs in selection
    if (selectedBugs.length > 0) {
      setPendingBugs(selectedBugs)
      setPendingAllocation(allocation)
      setShowBugModal(true)
      return
    }

    // No Bugs, submit directly
    submitMutation.mutate(
      { allocation, date: selectedDateStr, append: isSupplementMode },
      { onSuccess: () => setSelected([]) }
    )
  }, [selected, selectedBugs, allocation, selectedDateStr, isSupplementMode, submitMutation])
  */

  // Handle Bug modal confirmation
  const handleBugModalConfirm = useCallback(async (choices: Record<string, { target: string; hours: number; closeAfter?: boolean; parentKey?: string; summary?: string }>) => {
    const newAllocation: Allocation = {}
    const failedBugs: string[] = []

    // Build final allocation based on choices
    for (const [bugKey, choice] of Object.entries(choices)) {
      if (choice.target === 'new') {
        // Create new subtask
        try {
          const subtaskKey = await createSubtaskMutation.mutateAsync({
            parentKey: choice.parentKey || bugKey,
            summary: choice.summary || '[UI Dev] bug fix'
          })
          newAllocation[subtaskKey] = choice.hours
          // Auto close if requested
          if (choice.closeAfter) {
            await transitionMutation.mutateAsync({
              issueKey: subtaskKey,
              status: 'Closed'
            })
          }
        } catch (err) {
          // Don't fallback to parent - skip this bug and show error later
          console.error(`Failed to create subtask for ${bugKey}:`, err)
          failedBugs.push(bugKey)
        }
      } else {
        newAllocation[choice.target] = choice.hours
      }
    }

    // Add non-Bug tickets to allocation
    for (const [key, hours] of Object.entries(pendingAllocation)) {
      if (!choices[key]) {
        newAllocation[key] = hours
      }
    }

    setShowBugModal(false)
    setPendingBugs([])
    setPendingAllocation({})

    // Show error if any subtask creation failed
    if (failedBugs.length > 0) {
      alert(`⚠️ 创建 subtask 失败: ${failedBugs.join(', ')}\n这些 ticket 的工作时间未记录。请手动选择其他方式记录。`)
    }

    // Only submit if there's something to submit
    if (Object.keys(newAllocation).length > 0) {
      submitMutation.mutate(
        { allocation: newAllocation, date: selectedDateStr, append: isSupplementMode },
        { onSuccess: () => setSelected([]) }
      )
    } else if (failedBugs.length > 0) {
      // Nothing to submit but failures occurred - reset selection
      setSelected([])
      setAllocation({})
    }
  }, [pendingAllocation, selectedDateStr, isSupplementMode, submitMutation])

  const handleBugModalCancel = useCallback(() => {
    setShowBugModal(false)
    setPendingBugs([])
    setPendingAllocation({})
    // 同时清除当前选择
    setSelected([])
    setAllocation({})
  }, [])

  const handleSameAsYesterday = useCallback(() => {
    const yesterday = ticketsData?.yesterday
    if (!yesterday || Object.keys(yesterday).length === 0) return

    submitMutation.mutate(
      { allocation: yesterday, date: selectedDateStr, append: isSupplementMode }
    )
  }, [ticketsData?.yesterday, selectedDateStr, isSupplementMode, submitMutation])

  const handleCheck = useCallback(async () => {
    try {
      // First check differences
      const checkResult = await checkMutation.mutateAsync({ date: selectedDateStr, sync: false })

      if (checkResult.differences?.length > 0) {
        // Show detailed differences
        const diffMessages = checkResult.differences.map(d => {
          if (d.action === 'deleted') return `${d.issueKey}: Jira中已删除 (本地 ${d.localHours}h)`
          if (d.action === 'added') return `${d.issueKey}: Jira中新增 ${d.jiraHours}h)`
          if (d.action === 'reduced') return `${d.issueKey}: Jira中减少了 (本地 ${d.localHours}h → Jira ${d.jiraHours}h)`
          if (d.action === 'increased') return `${d.issueKey}: Jira中增加了 (本地 ${d.localHours}h → Jira ${d.jiraHours}h)`
          return `${d.issueKey}: 时间已更新 (本地 ${d.localHours}h → Jira ${d.jiraHours}h)`
        }).join('\n')

        // Perform sync
        const syncResult = await checkMutation.mutateAsync({ date: selectedDateStr, sync: true })

        // Show result
        alert(`🔄 已同步工作记录:\n${diffMessages}\n\n更新后总计: ${syncResult.jiraTotal}h`)
      } else {
        alert(`✅ 工作记录一致，共 ${checkResult.jiraTotal}h`)
      }
    } catch (err) {
      console.error(err)
    }
  }, [selectedDateStr, checkMutation])

  const handleSkip = useCallback(() => {
    const nextDate = new Date(selectedDate)
    nextDate.setDate(nextDate.getDate() + 1)
    setSelectedDate(nextDate)
    setSelected([])
    setAllocation({})
  }, [selectedDate])

  // === Commented: handleClearSelection (now managed by AI panel) ===
  /*
  const handleClearSelection = useCallback(() => {
    setSelected([])
    setAllocation({})
  }, [])
  */

  // AI handlers
  const handleAiApprove = useCallback((allocation: Allocation) => {
    const recommendation = aiRecommendationQuery.data
    if (!recommendation || !allocation || Object.keys(allocation).length === 0) return

    // Check if AI recommendation contains Bugs (use typeName from recommendation)
    const aiBugs = recommendation.tickets.filter(t =>
      t.typeName === 'Bug' && !t.isSubtask && Object.keys(allocation).includes(t.key)
    )

    if (aiBugs.length > 0) {
      // Show bug modal for AI bugs
      setPendingBugs(aiBugs.map(t => ({
        key: t.key,
        summary: t.summary,
        status: t.status,
        typeName: t.typeName,
        isSubtask: t.isSubtask,
        parentKey: t.parentKey,
        parentSummary: t.parentSummary || '',
      } as Ticket)))
      setPendingAllocation(allocation)
      setShowBugModal(true)
      return
    }

    aiSubmitMutation.mutate(
      {
        allocation,
        date: selectedDateStr,
        decisionId: recommendation.id,
      },
      {
        onSuccess: () => {
          setAiApproved(true)
          setShowAiPanel(false)
        },
      }
    )
  }, [aiRecommendationQuery.data, aiSubmitMutation, selectedDateStr])

  const handleAddTicket = useCallback(async (input: string) => {
    try {
      const ticket = await searchMutation.mutateAsync(input)

      // Add to allTickets if not exists
      if (!allTickets.some(t => t.key === ticket.key)) {
        // Auto-select filters for this ticket
        if (ticket.projectKey && !selectedProjects.includes(ticket.projectKey)) {
          setSelectedProjects([...selectedProjects, ticket.projectKey])
        }
        if (ticket.backlogArea && !selectedBacklogAreas.includes(ticket.backlogArea)) {
          setSelectedBacklogAreas([...selectedBacklogAreas, ticket.backlogArea])
        }
        if (ticket.typeName && !selectedTypes.includes(ticket.typeName)) {
          setSelectedTypes([...selectedTypes, ticket.typeName])
        }

        // Add to addedTickets so it shows in the list
        setAddedTickets(prev => {
          if (!prev.some(t => t.key === ticket.key)) {
            return [...prev, ticket]
          }
          return prev
        })
      }

      // Select the ticket
      const newSelected = selected.includes(ticket.key) ? selected : [...selected, ticket.key]
      setSelected(newSelected)
      setAllocation(calculateAllocation(newSelected, targetHours))
    } catch (err) {
      console.error(err)
    }
  }, [allTickets, addedTickets, selected, selectedProjects, selectedBacklogAreas, selectedTypes, targetHours, searchMutation])

  // === Commented: newAllocationTotal (now managed by AI panel) ===
  // const newAllocationTotal = Object.values(allocation).reduce((a, b) => a + b, 0)

  const isLoading = ticketsQuery.isLoading || worklogQuery.isLoading
  const isSubmitting = submitMutation.isPending || checkMutation.isPending || aiSubmitMutation.isPending
  const isChecking = checkMutation.isPending
  const aiRecommendation = aiRecommendationQuery.data

  // Only show AI panel if not fully submitted (<8h) and (AI loading or AI enabled and not approved yet)
  const shouldShowAiPanel = showAiPanel && !isFullySubmitted && !aiApproved && (aiRecommendationQuery.isLoading || aiRecommendation?.enabled)

  // Loading state with calendar visible
  if (isLoading) {
    return (
      <>
        <CalendarSection
          selectedDate={safeSelectedDate}
          daysWithRecords={daysWithRecords}
          onDateChange={setSelectedDate}
          dateToStr={dateToStr}
        />
        <div className="loading">Loading...</div>
      </>
    )
  }

  // Error state
  if (ticketsQuery.error || worklogQuery.error) {
    return (
      <>
        <CalendarSection
          selectedDate={safeSelectedDate}
          daysWithRecords={daysWithRecords}
          onDateChange={setSelectedDate}
          dateToStr={dateToStr}
        />
        <div className="error-page">
          <h2>❌ Error</h2>
          <p>{(ticketsQuery.error || worklogQuery.error)?.message || 'Failed to load data'}</p>
          <button onClick={() => ticketsQuery.refetch()}>Retry</button>
        </div>
      </>
    )
  }

  // Fully submitted (>= 8h)
  if (isFullySubmitted) {
    return (
      <>
        <CalendarSection
          selectedDate={safeSelectedDate}
          daysWithRecords={daysWithRecords}
          onDateChange={setSelectedDate}
          dateToStr={dateToStr}
        />
        {submittedTicketsQuery.isLoading ? (
          <div className="already-submitted">
            <h2>✅ {formatDate(selectedDate)} 已提交</h2>
            <div className="total-hours-display">
              总计: <span className="hours-value">{Math.round(existingHours * 10) / 10}h</span>
            </div>
            <div className="loading-tickets">加载 ticket 详情...</div>
            <section className="actions-section">
              <button
                className="btn-check"
                onClick={handleCheck}
                disabled={isSubmitting}
              >
                {isSubmitting ? '检查中...' : '🔍 检查同步'}
              </button>
              <button
                className="btn-skip"
                onClick={handleSkip}
                disabled={isSubmitting}
              >
                ⏭️ 下一日
              </button>
            </section>
          </div>
        ) : (
          <SubmittedView
            submittedTickets={submittedTickets}
            submittedHours={existingHours}
            selectedDate={selectedDate}
            jiraServer={jiraServer}
            submitting={isSubmitting}
            formatDate={formatDate}
            onCheck={handleCheck}
            onSkip={handleSkip}
          />
        )}
      </>
    )
  }

  // Normal or supplement mode
  return (
    <>
      <CalendarSection
        selectedDate={safeSelectedDate}
        daysWithRecords={daysWithRecords}
        onDateChange={setSelectedDate}
        dateToStr={dateToStr}
      />

      <header className="page-header">
        <h1>⏰ {isSupplementMode ? '补充工作时间' : '记录工作时间'}</h1>
        <span className="selected-date">{formatDate(selectedDate)}</span>
      </header>

      <SupplementSection
        submittedTickets={submittedTickets}
        submittedHours={existingHours}
        targetHours={targetHours}
        jiraServer={jiraServer}
      />

      {/* AI Recommendation Panel - Extended with all features */}
      {shouldShowAiPanel && (
        <section className="ai-section">
          <AiRecommendationPanel
            date={selectedDateStr}
            recommendation={aiRecommendation}
            filters={filters}
            allTickets={allTickets}
            addedTickets={addedTickets}
            selectedProjects={selectedProjects}
            selectedBacklogAreas={selectedBacklogAreas}
            selectedTypes={selectedTypes}
            onProjectsChange={setSelectedProjects}
            onBacklogAreasChange={setSelectedBacklogAreas}
            onTypesChange={setSelectedTypes}
            onApprove={handleAiApprove}
            onAddTicket={handleAddTicket}
            onSameAsYesterday={handleSameAsYesterday}
            onCheck={handleCheck}
            hasYesterday={!!ticketsData?.yesterday && Object.keys(ticketsData?.yesterday || {}).length > 0}
            loading={aiRecommendationQuery.isLoading}
            submitting={isSubmitting}
            checking={isChecking}
            jiraServer={jiraServer}
            targetHours={targetHours}
            existingHours={existingHours}
          />
        </section>
      )}

      {/* === Original manual features (commented - now integrated into AI panel) ===
      <FiltersSection
        filters={filters}
        selectedProjects={selectedProjects}
        selectedBacklogAreas={selectedBacklogAreas}
        selectedTypes={selectedTypes}
        onProjectsChange={setSelectedProjects}
        onBacklogAreasChange={setSelectedBacklogAreas}
        onTypesChange={setSelectedTypes}
      />

      <section className="search-section">
        <TicketSearch onAdd={handleAddTicket} disabled={isSubmitting} />
      </section>

      <section className="tickets-section">
        <h3>选择 tickets ({filteredTickets.length}/{allTickets.length})：</h3>
        <TicketList
          tickets={filteredTickets}
          selected={selected}
          onToggle={handleToggle}
          jiraServer={jiraServer}
        />
      </section>

      <section className="allocation-section">
        <h3>时间分配：</h3>
        <TimeAllocator
          allocation={allocation}
          jiraServer={jiraServer}
          onRecalculate={() => setAllocation(calculateAllocation(selected, targetHours))}
        />
        {isSupplementMode && (
          <div className="allocation-total">
            补充后总计: <span className="hours-value">{Math.round((existingHours + newAllocationTotal) * 10) / 10}h</span>
          </div>
        )}
      </section>

      <section className="actions-section">
        <QuickActions
          onSubmit={handleSubmit}
          onSameAsYesterday={handleSameAsYesterday}
          onCheck={handleCheck}
          onSkip={handleSkip}
          onClearSelection={handleClearSelection}
          hasYesterday={!!ticketsData?.yesterday && Object.keys(ticketsData?.yesterday || {}).length > 0}
          disabled={selected.length === 0 || isSubmitting}
          submitting={isSubmitting}
          totalHours={isSupplementMode ? existingHours + newAllocationTotal : newAllocationTotal}
          hasSelection={selected.length > 0}
        />
      </section>
      === End commented section === */}

      <BugWorklogModal
        isOpen={showBugModal}
        bugs={pendingBugs}
        allocation={pendingAllocation}
        onConfirm={handleBugModalConfirm}
        onCancel={handleBugModalCancel}
      />
    </>
  )
}

export default LogPage