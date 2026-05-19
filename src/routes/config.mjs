import { loadConfig } from '../config.mjs'
import { hasWorklogForDate, getYesterdayAllocation } from '../storage.mjs'

/**
 * Register config and status routes
 */
export function registerConfigRoutes(app) {
  // GET /api/status - Check if already submitted today
  app.get('/api/status', async (req, res) => {
    try {
      const submitted = hasWorklogForDate()
      res.json({ submitted })
    } catch (err) {
      console.error('Error checking status:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/config/jira-server - Get Jira server URL
  app.get('/api/config/jira-server', async (req, res) => {
    try {
      const config = loadConfig()
      res.json({ server: config.jira?.server || '' })
    } catch (err) {
      console.error('Error getting config:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/history/yesterday - Get yesterday's allocation
  app.get('/api/history/yesterday', async (req, res) => {
    try {
      const yesterday = getYesterdayAllocation()
      res.json(yesterday || {})
    } catch (err) {
      console.error('Error fetching yesterday:', err)
      res.status(500).json({ error: err.message })
    }
  })
}