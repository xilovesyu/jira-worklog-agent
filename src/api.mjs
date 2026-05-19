/**
 * API routes entry point
 * Delegates to separate route modules for better organization
 */
import { registerAllRoutes } from './routes/index.mjs'

/**
 * Register API routes on Express app
 */
export function registerApiRoutes(app) {
  registerAllRoutes(app)
}