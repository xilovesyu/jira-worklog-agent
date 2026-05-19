import { searchMyTickets, getCustomFields, searchTicketByKeyOrUrl } from '../jiraClient.mjs'
import { getRecentTickets, getYesterdayAllocation, hasWorklogForDate } from '../storage.mjs'
import { getRecommendedTickets } from '../smartSelector.mjs'
import { allocateTime } from '../allocator.mjs'

/**
 * Register ticket-related routes
 */
export function registerTicketRoutes(app) {
  // GET /api/tickets - Get recommended tickets with pre-selection
  app.get('/api/tickets', async (req, res) => {
    try {
      const dateStr = req.query.date || null

      // Check if already submitted for selected date
      const submitted = hasWorklogForDate(dateStr)

      if (submitted) {
        return res.json({
          submitted: true,
          message: 'Worklog has already been submitted for this date'
        })
      }

      // Get custom field IDs first
      const customFields = await getCustomFields()

      // Fetch tickets from Jira with date range
      const { tickets, filters } = await searchMyTickets(customFields.backlogAreaId, dateStr)

      // Get recent usage history
      const recent = getRecentTickets(7)

      // Get recommendations
      const { tickets: recommended, preSelected } = getRecommendedTickets(tickets, recent)

      // Calculate time allocation
      const history = {
        hasAllocationHistory: (keys) => {
          return recent.some(r => keys.includes(r.issue_key))
        },
        getAllocationRatio: (keys) => {
          const ratios = {}
          const totalWeight = keys.reduce((sum, key) => {
            const found = recent.find(r => r.issue_key === key)
            return sum + (found ? found.use_count : 1)
          }, 0)

          for (const key of keys) {
            const found = recent.find(r => r.issue_key === key)
            const weight = found ? found.use_count : 1
            ratios[key] = weight / totalWeight
          }
          return ratios
        }
      }

      const allocation = allocateTime(preSelected, history)

      // Get yesterday's allocation
      const yesterday = getYesterdayAllocation()

      res.json({
        tickets: recommended,
        preSelected,
        allocation,
        yesterday,
        submitted: false,
        filters
      })
    } catch (err) {
      console.error('Error fetching tickets:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/ticket/search - Search and add a ticket by key or URL
  app.post('/api/ticket/search', async (req, res) => {
    try {
      const { input } = req.body

      if (!input || !input.trim()) {
        return res.status(400).json({ error: 'Please provide a ticket key or URL' })
      }

      // Get custom field IDs
      const customFields = await getCustomFields()

      // Search ticket
      const ticket = await searchTicketByKeyOrUrl(input, customFields.backlogAreaId)

      res.json({ ticket })
    } catch (err) {
      console.error('Error searching ticket:', err)
      res.status(404).json({ error: err.message })
    }
  })
}