import { addWorklog, getUserWorklogsByDate, getSubtasksByUser, createSubtask, transitionIssue } from '../jiraClient.mjs'
import { saveAllocationHistory, recordWorklog, getWorklogByDate, getWorklogHistory, hasWorklogForDate, updateRecentTicket, syncWorklogForDate } from '../storage.mjs'
import { roundTo, getTodayDate } from '../utils.mjs'

/**
 * Register worklog-related routes
 */
export function registerWorklogRoutes(app) {
  // POST /api/submit - Submit worklog (supports append mode)
  app.post('/api/submit', async (req, res) => {
    try {
      const { allocation, date, append } = req.body

      if (!allocation || Object.keys(allocation).length === 0) {
        return res.status(400).json({ error: 'No allocation provided' })
      }

      const dateStr = date || null

      // Check if already submitted for this date
      const existingWorklog = getWorklogByDate(dateStr)
      const existingHours = existingWorklog.reduce((sum, w) => sum + w.hours, 0)

      // Only block if already submitted 8h or more, and not in append mode
      if (existingHours >= 8 && !append) {
        return res.status(400).json({ error: `Already submitted 8h for ${dateStr || 'today'}` })
      }

      // Submit worklog to Jira for each ticket
      const workDate = dateStr || new Date().toISOString().split('T')[0]
      for (const [issueKey, hours] of Object.entries(allocation)) {
        await addWorklog(issueKey, hours, `Daily work - ${workDate}`, dateStr)
        recordWorklog(issueKey, hours, dateStr)
      }

      // Save allocation history
      if (append) {
        const existingAllocation = {}
        for (const w of existingWorklog) {
          existingAllocation[w.issue_key] = w.hours
        }
        for (const [key, hours] of Object.entries(allocation)) {
          existingAllocation[key] = (existingAllocation[key] || 0) + hours
        }
        saveAllocationHistory(existingAllocation, dateStr, true)
      } else {
        saveAllocationHistory(allocation, dateStr)
      }

      const totalHours = roundTo(Object.values(allocation).reduce((a, b) => a + b, 0))

      res.json({
        success: true,
        message: `已记录 ${totalHours}h 工作时间`,
        allocation,
        date: workDate,
        appended: append
      })
    } catch (err) {
      console.error('Error submitting worklog:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/worklog/today - Get today's submitted worklog
  app.get('/api/worklog/today', async (req, res) => {
    try {
      const dateStr = req.query.date || null
      const worklog = getWorklogByDate(dateStr)
      res.json({ worklog, submitted: worklog.length > 0 })
    } catch (err) {
      console.error('Error getting worklog:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/worklog/status - Check if submitted for a date
  app.get('/api/worklog/status', async (req, res) => {
    try {
      const dateStr = req.query.date || null
      const submitted = hasWorklogForDate(dateStr)
      res.json({ submitted })
    } catch (err) {
      console.error('Error checking status:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/worklog/history - Get worklog history
  app.get('/api/worklog/history', async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 7
      const history = getWorklogHistory(days)
      res.json({ history })
    } catch (err) {
      console.error('Error getting worklog history:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/worklog/check - Check and sync worklogs with Jira
  app.post('/api/worklog/check', async (req, res) => {
    try {
      const { date, sync } = req.body
      const dateStr = date || getTodayDate()

      // Get local worklog records
      const localWorklogs = getWorklogByDate(dateStr)
      const localMap = {}
      for (const w of localWorklogs) {
        localMap[w.issue_key] = w.hours
      }
      const localTotal = roundTo(localWorklogs.reduce((sum, w) => sum + w.hours, 0))

      // Query Jira worklogs
      const jiraWorklogs = await getUserWorklogsByDate(dateStr)

      // Aggregate by issue
      const jiraMap = {}
      for (const w of jiraWorklogs) {
        if (!jiraMap[w.issueKey]) {
          jiraMap[w.issueKey] = { hours: 0, summary: w.summary, worklogs: [] }
        }
        jiraMap[w.issueKey].hours += w.hours
        jiraMap[w.issueKey].worklogs.push(w)
      }
      for (const key of Object.keys(jiraMap)) {
        jiraMap[key].hours = roundTo(jiraMap[key].hours)
      }

      const jiraTotal = roundTo(Object.values(jiraMap).reduce((sum, data) => sum + data.hours, 0))

      // Compare local vs Jira
      const differences = []
      const allIssueKeys = new Set([...Object.keys(localMap), ...Object.keys(jiraMap)])

      for (const issueKey of allIssueKeys) {
        const localHours = localMap[issueKey] || 0
        const jiraHours = jiraMap[issueKey]?.hours || 0

        if (localHours !== jiraHours) {
          let action = 'updated'
          if (localHours === 0 && jiraHours > 0) action = 'added'
          else if (localHours > 0 && jiraHours === 0) action = 'deleted'
          else if (localHours > jiraHours) action = 'reduced'
          else action = 'increased'

          differences.push({
            issueKey,
            localHours,
            jiraHours,
            diff: roundTo(localHours - jiraHours),
            action
          })
        }
      }

      // Sync if requested
      if (sync && differences.length > 0) {
        const syncedWorklogs = []
        for (const [issueKey, data] of Object.entries(jiraMap)) {
          if (data.hours > 0) {
            syncedWorklogs.push({ issueKey, hours: data.hours })
            updateRecentTicket(issueKey, data.summary || '', '')
          }
        }
        syncWorklogForDate(syncedWorklogs, dateStr)
      }

      // Build worklog list
      const worklogList = []
      for (const [issueKey, data] of Object.entries(jiraMap)) {
        if (data.hours > 0) {
          worklogList.push({
            issue_key: issueKey,
            hours: data.hours,
            summary: data.summary || '',
            submitted_at: new Date().toISOString()
          })
        }
      }

      res.json({
        date: dateStr,
        localTotal,
        jiraTotal,
        differences,
        synced: sync && differences.length > 0,
        worklog: worklogList,
        submitted: jiraTotal > 0,
        message: differences.length === 0
          ? `✅ 工作记录一致，共 ${jiraTotal}h`
          : (sync
            ? `🔄 已同步，从 ${localTotal}h 更新为 ${jiraTotal}h`
            : `⚠️ 发现 ${differences.length} 处差异`)
      })
    } catch (err) {
      console.error('Error checking worklogs:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/bug/:key/subtasks - Get subtasks of a bug created by current user
  app.get('/api/bug/:key/subtasks', async (req, res) => {
    try {
      const parentKey = req.params.key
      const subtasks = await getSubtasksByUser(parentKey)
      res.json({ subtasks })
    } catch (err) {
      console.error('Error getting subtasks:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/subtask - Create a new subtask
  app.post('/api/subtask', async (req, res) => {
    try {
      const { parentKey, summary } = req.body

      if (!parentKey) {
        return res.status(400).json({ error: 'Parent key is required' })
      }

      if (!summary) {
        return res.status(400).json({ error: 'Summary is required' })
      }

      const subtaskKey = await createSubtask(parentKey, summary)
      res.json({ success: true, subtaskKey })
    } catch (err) {
      console.error('Error creating subtask:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/issue/:key/transition - Transition issue to a new status
  app.post('/api/issue/:key/transition', async (req, res) => {
    try {
      const issueKey = req.params.key
      const { status } = req.body

      if (!status) {
        return res.status(400).json({ error: 'Status is required' })
      }

      await transitionIssue(issueKey, status)
      res.json({ success: true })
    } catch (err) {
      console.error('Error transitioning issue:', err)
      res.status(500).json({ error: err.message })
    }
  })
}