import { useState, useEffect } from 'react'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import TicketList from '../components/TicketList'
import { api, DEFAULT_JIRA_URL } from '../api/queries'
import type { SubmittedTicket } from '../types'

function HistoryPage() {
  const [loading, setLoading] = useState(true)
  const [jiraServer, setJiraServer] = useState<string>(DEFAULT_JIRA_URL)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [recordsByDate, setRecordsByDate] = useState<Map<string, SubmittedTicket[]>>(new Map())
  const [hoursByDate, setHoursByDate] = useState<Map<string, number>>(new Map())
  const [daysWithRecords, setDaysWithRecords] = useState<Set<string>>(new Set())
  const [checking, setChecking] = useState(false)

  // Safe date setter - ensures date is always valid
  const handleDateChange = (value: Date | [Date | null, Date | null] | null) => {
    if (!value) {
      setSelectedDate(new Date())
      return
    }
    // Handle single date or date range
    if (Array.isArray(value)) {
      const newDate = value[0]
      if (!newDate || isNaN(newDate.getTime())) {
        setSelectedDate(new Date())
        return
      }
      setSelectedDate(newDate)
    } else {
      if (isNaN(value.getTime())) {
        setSelectedDate(new Date())
        return
      }
      setSelectedDate(value)
    }
  }

  // Ensure Calendar always receives a valid date
  const safeSelectedDate = selectedDate && !isNaN(selectedDate.getTime()) ? selectedDate : new Date()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const server = await api.getJiraServer()
      setJiraServer(server || DEFAULT_JIRA_URL)

      // Get today's worklog first
      const now = new Date()
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const todayWorklog = await api.getWorklog(todayStr)

      // Get history
      const historyData = await api.getWorklogHistory(30)
      const newRecordsByDate = new Map<string, SubmittedTicket[]>()
      const newHoursByDate = new Map<string, number>()
      const newDaysWithRecords = new Set<string>()

      // Process today's worklog
      const todayWorklogList = todayWorklog?.worklog || []
      if (todayWorklog?.submitted && todayWorklogList.length > 0) {
        const tickets: SubmittedTicket[] = []
        for (const w of todayWorklogList) {
          try {
            const ticket = await api.searchTicket(w?.issue_key || '')
            tickets.push({ ...ticket, hours: w?.hours || 0 })
          } catch {
            tickets.push({ key: w?.issue_key || '', summary: '', status: '', hours: w?.hours || 0 })
          }
        }
        newRecordsByDate.set(todayStr, tickets)
        newHoursByDate.set(todayStr, todayWorklogList.reduce((sum, w) => sum + (w?.hours || 0), 0))
        newDaysWithRecords.add(todayStr)
      }

      // Process history
      const history = historyData?.history || []
      for (const entry of history) {
        if (!entry?.date) continue
        if (entry.date === todayStr && todayWorklog?.submitted) continue // Skip today if already processed

        const tickets: SubmittedTicket[] = []
        const allocation = entry?.allocation || {}
        for (const [key, hours] of Object.entries(allocation)) {
          try {
            const ticket = await api.searchTicket(key)
            tickets.push({ ...ticket, hours: hours as number })
          } catch {
            tickets.push({ key, summary: '', status: '', hours: hours as number })
          }
        }
        newRecordsByDate.set(entry.date, tickets)
        newHoursByDate.set(entry.date, Object.values(allocation).reduce((a: number, b) => a + (b as number), 0))
        newDaysWithRecords.add(entry.date)
      }

      setRecordsByDate(newRecordsByDate)
      setHoursByDate(newHoursByDate)
      setDaysWithRecords(newDaysWithRecords)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: Date) => {
    // Validate date before formatting
    if (!date || isNaN(date.getTime())) {
      return '未知日期'
    }
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  }

  // Use local date instead of UTC to avoid timezone issues
  const dateToStr = (date: Date) => {
    // Validate date before converting
    if (!date || isNaN(date.getTime())) {
      return ''
    }
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const selectedDateStr = dateToStr(selectedDate)
  const selectedTickets = recordsByDate.get(selectedDateStr) || []
  const selectedHours = hoursByDate.get(selectedDateStr) || 0

  // Check worklog with Jira
  const handleCheck = async () => {
    try {
      setChecking(true)
      // First check without syncing to show differences
      const checkResult = await api.checkWorklog(selectedDateStr, false)

      if (checkResult.differences.length > 0) {
        const diffMessages = checkResult.differences.map(d => {
          if (d.action === 'deleted') {
            return `${d.issueKey}: Jira中已删除 (本地 ${d.localHours}h)`
          } else if (d.action === 'added') {
            return `${d.issueKey}: Jira中新增 ${d.jiraHours}h`
          } else if (d.action === 'reduced') {
            return `${d.issueKey}: Jira中减少了 (本地 ${d.localHours}h → Jira ${d.jiraHours}h)`
          } else if (d.action === 'increased') {
            return `${d.issueKey}: Jira中增加了 (本地 ${d.localHours}h → Jira ${d.jiraHours}h)`
          } else {
            return `${d.issueKey}: 时间已更新 (本地 ${d.localHours}h → Jira ${d.jiraHours}h)`
          }
        }).join('\n')

        // Auto-sync and get updated data
        const syncResult = await api.checkWorklog(selectedDateStr, true)

        // Build submitted tickets from returned worklog
        const tickets: SubmittedTicket[] = []
        for (const w of (syncResult.worklog || [])) {
          try {
            const ticket = await api.searchTicket(w.issue_key)
            tickets.push({ ...ticket, hours: w.hours })
          } catch {
            tickets.push({ key: w.issue_key, summary: w.summary || '', status: '', hours: w.hours })
          }
        }

        // Update local state
        if (syncResult.jiraTotal > 0) {
          setRecordsByDate(prev => {
            const newMap = new Map(prev || [])
            newMap.set(selectedDateStr, tickets)
            return newMap
          })
          setHoursByDate(prev => {
            const newMap = new Map(prev || [])
            newMap.set(selectedDateStr, syncResult.jiraTotal)
            return newMap
          })
          setDaysWithRecords(prev => new Set(prev || []).add(selectedDateStr))
        } else {
          setRecordsByDate(prev => {
            const newMap = new Map(prev || [])
            newMap.delete(selectedDateStr)
            return newMap
          })
          setHoursByDate(prev => {
            const newMap = new Map(prev || [])
            newMap.delete(selectedDateStr)
            return newMap
          })
          setDaysWithRecords(prev => {
            const newSet = new Set(prev || [])
            newSet.delete(selectedDateStr)
            return newSet
          })
        }

        alert(`🔄 已同步工作记录:\n${diffMessages}\n\n更新后总计: ${syncResult.jiraTotal}h`)
      } else {
        alert(`✅ 工作记录一致，共 ${checkResult.jiraTotal}h`)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to check worklog')
      console.error(err)
    } finally {
      setChecking(false)
    }
  }

  if (loading) {
    return <div className="loading">Loading history...</div>
  }

  return (
    <>
      <header className="page-header">
        <h1>📅 历史记录</h1>
      </header>

      {/* Calendar */}
      <section className="calendar-section">
        <Calendar
          onChange={handleDateChange}
          value={safeSelectedDate}
          tileClassName={({ date }) => {
            if (!date || isNaN(date.getTime())) return ''
            const dateStr = dateToStr(date)
            if (!dateStr) return ''
            if ((daysWithRecords || new Set()).has(dateStr)) {
              return 'has-record'
            }
            return ''
          }}
          tileContent={({ date }) => {
            if (!date || isNaN(date.getTime())) return null
            const dateStr = dateToStr(date)
            if (!dateStr) return null
            if ((daysWithRecords || new Set()).has(dateStr)) {
              const hours = (hoursByDate || new Map()).get(dateStr) || 0
              return <div className="tile-hours">{Math.round(hours)}h</div>
            }
            return null
          }}
        />
      </section>

      {/* Selected date details */}
      <section className="selected-date-section">
        <div className="selected-date-header">
          <h3>{formatDate(selectedDate)}</h3>
          {(daysWithRecords || new Set()).has(selectedDateStr) && (
            <>
              <span className="total-hours-display">
                总计: <span className="hours-value">{Math.round(selectedHours * 10) / 10}h</span>
              </span>
              <button
                className="btn-check"
                onClick={handleCheck}
                disabled={checking}
                style={{ marginLeft: '12px' }}
              >
                {checking ? '检查中...' : '🔍 检查同步'}
              </button>
            </>
          )}
        </div>

        {(daysWithRecords || new Set()).has(selectedDateStr) && (selectedTickets || []).length > 0 ? (
          <TicketList
            tickets={selectedTickets || []}
            selected={[]}
            onToggle={() => {}}
            jiraServer={jiraServer}
            displayOnly={true}
          />
        ) : (
          <div className="no-record">
            <p>该日暂无记录</p>
          </div>
        )}
      </section>
    </>
  )
}

export default HistoryPage