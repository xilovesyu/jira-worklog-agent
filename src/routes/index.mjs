import { registerTicketRoutes } from './tickets.mjs'
import { registerWorklogRoutes } from './worklog.mjs'
import { registerConfigRoutes } from './config.mjs'
import { registerReminderRoutes } from './reminder.mjs'
import { registerAiRoutes } from './ai.mjs'

/**
 * Register all API routes on Express app
 */
export function registerAllRoutes(app) {
  registerTicketRoutes(app)
  registerWorklogRoutes(app)
  registerConfigRoutes(app)
  registerReminderRoutes(app)
  registerAiRoutes(app)
}