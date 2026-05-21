/**
 * Unified type definitions for Jira Worklog Agent frontend
 */

export interface Ticket {
  key: string
  summary: string
  status: string
  description?: string
  priority?: string
  updated?: string
  isSubtask?: boolean
  parentKey?: string
  parentSummary?: string
  parentDescription?: string
  projectKey?: string
  projectName?: string
  backlogArea?: string
  typeName?: string
  hours?: number
  // User's own activity actions (from Jira changelog)
  activityActions?: Array<{
    time: string
    actions: Array<{
      type: string
      field?: string
      from?: string
      to?: string
    }>
  }>
}

export interface SubmittedTicket extends Ticket {
  hours: number
}

export interface Allocation {
  [ticketKey: string]: number
}

export interface ProjectFilter {
  key: string
  name: string
}

export interface TypeFilter {
  name: string
  isSubtask?: boolean
}

export interface Filters {
  projects: ProjectFilter[]
  backlogAreas: string[]
  types: TypeFilter[]
}

export interface TicketsResponse {
  tickets: Ticket[]
  preSelected: string[]
  allocation: Allocation
  yesterday: Allocation | null
  filters?: Filters
  submitted?: boolean
  message?: string
}

export interface WorklogEntry {
  issue_key: string
  hours: number
  submitted_at: string
  summary?: string
}

export interface WorklogResponse {
  worklog: WorklogEntry[]
  submitted: boolean
}

export interface WorklogHistoryEntry {
  date: string
  allocation: Allocation
  created_at: string
}

export interface WorklogHistoryResponse {
  history: WorklogHistoryEntry[]
}

export interface CheckWorklogResponse {
  date: string
  localTotal: number
  jiraTotal: number
  differences: Array<{
    issueKey: string
    localHours: number
    jiraHours: number
    diff: number
    action: string
  }>
  synced: boolean
  worklog: WorklogEntry[]
  submitted: boolean
  message: string
}

export interface SubmitResponse {
  success: boolean
  message: string
  date: string
  appended?: boolean
}

// ========== AI Types ==========

export interface AiRecommendationTicket {
  key: string
  summary: string
  status: string
  description?: string | null
  typeName?: string
  projectKey?: string | null
  backlogArea?: string | null
  isSubtask?: boolean
  parentKey?: string | null
  parentSummary?: string
  parentDescription?: string | null
  parentTypeName?: string | null
  confidence: number
  confidenceLevel: 'high' | 'medium' | 'low' | 'very-low'
  llm_reason: string
  // User's own activity actions (from Jira changelog)
  activityActions?: Array<{
    time: string
    actions: Array<{
      type: string
      field?: string
      from?: string
      to?: string
    }>
  }>
}

export interface AiRecommendation {
  enabled: boolean
  id?: number
  tickets: AiRecommendationTicket[]
  recommendation?: {
    tickets: string[]
    allocation: Allocation
    total_hours: number
  }
  explanation: string
  confidence_level: 'high' | 'medium' | 'low'
  llm_used: boolean
  llm_provider?: string
  fallback?: boolean
  message?: string
  // Already logged worklog for this date
  existingWorklog?: WorklogEntry[]
  existingTotalHours?: number
}

export interface AiConfig {
  // AI automation config (editable via API, stored in SQLite)
  automation_level: 'none' | 'semi' | 'full'
  confidence_threshold: number
  auto_submit_time: string
  notify_before_submit: boolean

  // LLM config (read-only from config.yaml)
  llm_provider: 'openai' | 'ollama' | 'azure'
  llm_model: string
  llm_base_url: string | null
  llm_enabled: boolean
  llmAvailable?: boolean
}

export interface LlmCostStats {
  total_calls: number
  total_tokens: number
  total_cost_usd: number
  daily_stats: Array<{
    date: string
    calls: number
    cost: number
  }>
}

export interface AiDecisionHistoryEntry {
  id: number
  date: string
  decision_type: string
  confidence_level: string
  tickets_selected: string[]
  allocation: Allocation
  llm_explanation: string
  executed: boolean
  user_override: boolean
  created_at: string
}

export interface AiSubmitResponse {
  success: boolean
  message: string
  results: Array<{
    issueKey: string
    hours: number
    success: boolean
    worklogId?: string
    error?: string
  }>
}