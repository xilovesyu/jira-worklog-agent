/**
 * Environment-based configuration
 * Values are loaded from .env file (VITE_* variables)
 */

// Parse comma-separated env values into array
const parseEnvArray = (value: string | undefined): string[] => {
  if (!value) return []
  return value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}

// Project filter keywords from env
export const getProjectFilterKeywords = (): string[] =>
  parseEnvArray(import.meta.env.VITE_PROJECT_FILTER_KEYWORDS)

// Backlog area filter values from env
export const getBacklogAreaFilterValues = (): string[] =>
  parseEnvArray(import.meta.env.VITE_BACKLOG_AREA_FILTER_VALUES)