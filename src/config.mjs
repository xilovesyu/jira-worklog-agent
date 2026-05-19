import fs from 'fs'
import yaml from 'js-yaml'
import path from 'path'
import { getUserDataDir, getProgramDir } from './paths.mjs'

/**
 * Default configuration values
 * Single source of truth for all default settings
 */
export const DEFAULT_CONFIG = {
  timezone: 'local',

  jira: {
    server_timezone: 'America/Los_Angeles'
  },

  scheduler: {
    enabled: true,
    trigger_time: '17:00',
    timezone: 'Asia/Shanghai',
    reminder_interval: 5
  },

  worklog: {
    default_hours: 8,
    preselect_count: 3,
    default_comment: 'Daily work'
  },

  smart_selector: {
    recent_days: 7,
    max_tickets: 10
  },

  llm: {
    provider: 'openai',
    max_tokens: 1024,
    temperature: 0.3,
    enabled: true,
    api_key_env: 'OPENAI_API_KEY'
  },

  ai: {
    automation_level: 'semi',
    confidence_threshold: 85,
    auto_submit_time: '17:30',
    notify_before_submit: true
  },

  api: {
    port: 7301
  },

  ui: {
    port: 7302,
    auto_open: false
  }
}

// Get config file path - priority: program dir > APPDATA
function getConfigPath() {
  const programDir = getProgramDir()
  const localConfig = path.join(programDir, 'config.yaml')

  // Priority 1: config.yaml in program directory (for development/testing)
  if (fs.existsSync(localConfig)) {
    console.log('✅ Using local config:', localConfig)
    return localConfig
  }

  // Priority 2: APPDATA config.yaml (for production/installation)
  return path.join(getUserDataDir(), 'config.yaml')
}

// Get .env file path - priority: program dir > APPDATA
function getEnvPath() {
  const programDir = getProgramDir()
  const localEnv = path.join(programDir, '.env')

  // Priority 1: .env in program directory
  if (fs.existsSync(localEnv)) {
    return localEnv
  }

  // Priority 2: APPDATA .env
  return path.join(getUserDataDir(), '.env')
}

const CONFIG_FILE = getConfigPath()
const ENV_FILE = getEnvPath()
const USER_DATA_DIR = getUserDataDir()

export { USER_DATA_DIR, getProgramDir, ENV_FILE, CONFIG_FILE }

export function loadConfig() {
  // Load .env file first (if exists)
  loadEnvFile()

  try {
    // Ensure APPDATA directory exists (for fallback)
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true })
    }

    if (!fs.existsSync(CONFIG_FILE)) {
      console.warn('⚠️  Config file not found at:', CONFIG_FILE)
      console.warn('   Creating default config...')
      createDefaultConfig()
    }
    const content = fs.readFileSync(CONFIG_FILE, 'utf8')
    const config = yaml.load(content)

    // Replace environment variables
    return replaceEnvVars(config)
  } catch (err) {
    console.warn('⚠️  Failed to load config:', err.message)
    return getDefaultConfig()
  }
}

/**
 * Load .env file and set environment variables
 * Simple dotenv-like implementation
 */
function loadEnvFile() {
  const envPath = getEnvPath()

  console.log('🔍 Looking for .env at:', envPath)

  if (!fs.existsSync(envPath)) {
    console.log('   ❌ .env file not found')
    return
  }

  try {
    const content = fs.readFileSync(envPath, 'utf8')
    const lines = content.split('\n')

    const loadedVars = []

    for (const line of lines) {
      // Skip empty lines and comments
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      // Parse KEY=VALUE
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }

        // Set environment variable (only if not already set)
        if (!process.env[key]) {
          process.env[key] = value
          loadedVars.push(key)
        }
      }
    }

    console.log('✅ Loaded .env from:', envPath)
    console.log('   Variables loaded:', loadedVars.join(', '))

    // Debug: show LLM config status
    const apiKey = process.env.OPENAI_API_KEY
    console.log('   OPENAI_API_KEY:', apiKey ? `✅ set (${apiKey.length} chars)` : '❌ empty')

    const baseUrl = process.env.OPENAI_BASE_URL
    if (baseUrl) {
      console.log('   OPENAI_BASE_URL:', baseUrl)
    }

    const model = process.env.OPENAI_MODEL
    if (model) {
      console.log('   OPENAI_MODEL:', model)
    }
  } catch (err) {
    console.warn('⚠️  Failed to load .env:', err.message)
  }
}

function createDefaultConfig() {
  const defaultConfigContent = `# Global timezone for date operations
# Options: "local" (use system TZ), "Asia/Shanghai", "America/Los_Angeles", etc.
timezone: "local"

jira:
  server: "\${JIRA_SERVER}"
  api_token: "\${JIRA_API_TOKEN}"
  server_timezone: "America/Los_Angeles"

scheduler:
  trigger_time: "17:00"
  timezone: "Asia/Shanghai"
  reminder_interval: 5
  enabled: true

worklog:
  default_hours: 8
  preselect_count: 3
  default_comment: "Daily work"

smart_selector:
  recent_days: 7
  max_tickets: 10

llm:
  provider: "openai"
  model: "\${OPENAI_MODEL}"
  base_url: "\${OPENAI_BASE_URL}"
  api_key_env: "OPENAI_API_KEY"
  max_tokens: 1024
  temperature: 0.3
  enabled: true

ai:
  automation_level: "semi"
  confidence_threshold: 85
  auto_submit_time: "17:30"
  notify_before_submit: true

api:
  port: 7301

ui:
  port: 7302
  auto_open: false
`
  try {
    fs.writeFileSync(CONFIG_FILE, defaultConfigContent, 'utf8')
    console.log('✅ Created default config at:', CONFIG_FILE)
    console.log('   Please edit config.yaml and set JIRA_SERVER/JIRA_API_TOKEN')
  } catch (err) {
    console.warn('⚠️  Failed to create default config:', err.message)
  }
}

function replaceEnvVars(obj) {
  if (typeof obj === 'string') {
    // Replace ${VAR} with environment variable
    const match = obj.match(/\$\{([^}]+)\}/)
    if (match) {
      const envVar = match[1]
      return process.env[envVar] || obj
    }
    return obj
  }

  if (typeof obj === 'object' && obj !== null) {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceEnvVars(value)
    }
    return result
  }

  return obj
}

function getDefaultConfig() {
  return {
    ...DEFAULT_CONFIG,
    jira: {
      ...DEFAULT_CONFIG.jira,
      server: process.env.JIRA_SERVER || '',
      email: process.env.JIRA_EMAIL || '',
      api_token: process.env.JIRA_API_TOKEN || ''
    },
    llm: {
      ...DEFAULT_CONFIG.llm,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      base_url: process.env.OPENAI_BASE_URL || null
    }
  }
}