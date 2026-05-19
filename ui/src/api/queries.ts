import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Ticket, TicketsResponse, WorklogEntry, WorklogHistoryEntry, CheckWorklogResponse, SubmitResponse, Allocation, SubmittedTicket, AiRecommendation, AiConfig, AiDecisionHistoryEntry, LlmCostStats, AiSubmitResponse } from '../types'

const API_BASE = '/api'

// Default Jira server URL (placeholder for users to configure their own)
export const DEFAULT_JIRA_URL = 'https://jira.example.com/'

// Query keys
export const queryKeys = {
  tickets: (date?: string) => ['tickets', date] as const,
  worklog: (date?: string) => ['worklog', date] as const,
  worklogHistory: (days: number) => ['worklogHistory', days] as const,
  jiraServer: () => ['jiraServer'] as const,
  yesterday: () => ['yesterday'] as const,
  submittedTickets: (date?: string) => ['submittedTickets', date] as const,
  // AI query keys
  aiRecommendation: (date?: string) => ['aiRecommendation', date] as const,
  aiConfig: () => ['aiConfig'] as const,
  aiHistory: (days: number) => ['aiHistory', days] as const,
  llmStatus: () => ['llmStatus'] as const,
  llmCost: (days: number) => ['llmCost', days] as const,
}

// API functions with abort signal support
const api = {
  getTickets: async (date?: string, signal?: AbortSignal): Promise<TicketsResponse> => {
    const url = date ? `${API_BASE}/tickets?date=${date}` : `${API_BASE}/tickets`
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error('Failed to fetch tickets')
    return response.json()
  },

  getWorklog: async (date?: string, signal?: AbortSignal): Promise<{ worklog: WorklogEntry[]; submitted: boolean }> => {
    const url = date ? `${API_BASE}/worklog/today?date=${date}` : `${API_BASE}/worklog/today`
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error('Failed to fetch worklog')
    return response.json()
  },

  getWorklogHistory: async (days: number = 30, signal?: AbortSignal): Promise<{ history: WorklogHistoryEntry[] }> => {
    const response = await fetch(`${API_BASE}/worklog/history?days=${days}`, { signal })
    if (!response.ok) throw new Error('Failed to fetch history')
    return response.json()
  },

  getJiraServer: async (signal?: AbortSignal): Promise<string> => {
    const response = await fetch(`${API_BASE}/config/jira-server`, { signal })
    if (!response.ok) return DEFAULT_JIRA_URL
    const data = await response.json()
    return data.server || DEFAULT_JIRA_URL
  },

  searchTicket: async (input: string, signal?: AbortSignal): Promise<Ticket> => {
    const response = await fetch(`${API_BASE}/ticket/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
      signal,
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to search ticket')
    }
    const data = await response.json()
    return data.ticket
  },

  submitWorklog: async (allocation: Allocation, date?: string, append?: boolean): Promise<SubmitResponse> => {
    const response = await fetch(`${API_BASE}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocation, date, append }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to submit worklog')
    }
    return response.json()
  },

  checkWorklog: async (date?: string, sync?: boolean): Promise<CheckWorklogResponse> => {
    const response = await fetch(`${API_BASE}/worklog/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, sync }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to check worklog')
    }
    return response.json()
  },

  getBugSubtasks: async (parentKey: string): Promise<{ key: string; summary: string; status: string }[]> => {
    const response = await fetch(`${API_BASE}/bug/${parentKey}/subtasks`)
    if (!response.ok) throw new Error('Failed to fetch subtasks')
    const data = await response.json()
    return data.subtasks || []
  },

  createSubtask: async (parentKey: string, summary: string): Promise<string> => {
    const response = await fetch(`${API_BASE}/subtask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentKey, summary }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to create subtask')
    }
    const data = await response.json()
    return data.subtaskKey
  },

  transitionIssue: async (issueKey: string, status: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/issue/${issueKey}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to transition issue')
    }
  },
}

// React Query hooks

// Fetch tickets for a date
export function useTickets(date: string) {
  return useQuery({
    queryKey: queryKeys.tickets(date),
    queryFn: ({ signal }) => api.getTickets(date, signal),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Fetch worklog for a date
export function useWorklog(date: string) {
  return useQuery({
    queryKey: queryKeys.worklog(date),
    queryFn: ({ signal }) => api.getWorklog(date, signal),
    staleTime: 30 * 1000, // 30 seconds
  })
}

// Fetch worklog history for calendar markers
export function useWorklogHistory(days: number = 30) {
  return useQuery({
    queryKey: queryKeys.worklogHistory(days),
    queryFn: ({ signal }) => api.getWorklogHistory(days, signal),
    staleTime: 5 * 60 * 1000,
  })
}

// Fetch Jira server URL
export function useJiraServer() {
  return useQuery({
    queryKey: queryKeys.jiraServer(),
    queryFn: ({ signal }) => api.getJiraServer(signal),
    staleTime: Infinity, // Never refetch
  })
}

// Submit worklog mutation
export function useSubmitWorklog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ allocation, date, append }: { allocation: Allocation; date?: string; append?: boolean }) =>
      api.submitWorklog(allocation, date, append),
    onSuccess: (_result, { allocation, date, append }) => {
      // Immediately update worklog cache with new data for instant UI feedback
      const currentData = queryClient.getQueryData(queryKeys.worklog(date)) as { worklog: WorklogEntry[]; submitted: boolean } | undefined
      const currentWorklog = currentData?.worklog || []

      // Build updated worklog list
      let updatedWorklog: WorklogEntry[]
      if (append) {
        // Append mode: add to existing worklog
        const existingMap = new Map(currentWorklog.map(w => [w.issue_key, w.hours]))
        for (const [key, hours] of Object.entries(allocation)) {
          existingMap.set(key, (existingMap.get(key) || 0) + hours)
        }
        updatedWorklog = Array.from(existingMap.entries()).map(([issue_key, hours]) => ({
          issue_key,
          hours,
          submitted_at: new Date().toISOString()
        }))
      } else {
        // Replace mode: use new allocation
        updatedWorklog = Object.entries(allocation).map(([issue_key, hours]) => ({
          issue_key,
          hours,
          submitted_at: new Date().toISOString()
        }))
      }

      // Set updated cache data immediately
      queryClient.setQueryData(queryKeys.worklog(date), {
        worklog: updatedWorklog,
        submitted: true
      })

      // Then invalidate to trigger refetch for accurate data
      queryClient.invalidateQueries({ queryKey: queryKeys.worklog(date) })
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets(date) })
      queryClient.invalidateQueries({ queryKey: queryKeys.worklogHistory(30) })
      queryClient.invalidateQueries({ queryKey: queryKeys.submittedTickets(date) })
    },
  })
}

// Check/sync worklog mutation
export function useCheckWorklog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ date, sync }: { date?: string; sync?: boolean }) =>
      api.checkWorklog(date, sync),
    onSuccess: (_, { date, sync }) => {
      // Only invalidate after sync, not after check
      if (sync) {
        queryClient.invalidateQueries({ queryKey: queryKeys.worklog(date) })
        queryClient.invalidateQueries({ queryKey: queryKeys.worklogHistory(30) })
        queryClient.invalidateQueries({ queryKey: queryKeys.submittedTickets(date) })
      }
    },
  })
}

// Search single ticket (for adding manual tickets)
export function useSearchTicket() {
  return useMutation({
    mutationFn: (input: string) => api.searchTicket(input),
  })
}

// Get bug subtasks mutation
export function useBugSubtasks() {
  return useMutation({
    mutationFn: (parentKey: string) => api.getBugSubtasks(parentKey),
  })
}

// Create subtask mutation
export function useCreateSubtask() {
  return useMutation({
    mutationFn: ({ parentKey, summary }: { parentKey: string; summary: string }) =>
      api.createSubtask(parentKey, summary),
  })
}

// Transition issue mutation
export function useTransitionIssue() {
  return useMutation({
    mutationFn: ({ issueKey, status }: { issueKey: string; status: string }) =>
      api.transitionIssue(issueKey, status),
  })
}

// Export API for direct use (e.g., in event handlers)
export { api }

// Fetch submitted tickets with full details (summary, status, description)
export function useSubmittedTickets(worklog: WorklogEntry[], date: string) {
  return useQuery({
    queryKey: queryKeys.submittedTickets(date),
    queryFn: async ({ signal }): Promise<SubmittedTicket[]> => {
      if (!worklog || worklog.length === 0) return []

      // Fetch full details for each worklog entry in parallel
      const results = await Promise.allSettled(
        worklog.map(async (w) => {
          try {
            const ticket = await api.searchTicket(w.issue_key, signal)
            return { ...ticket, hours: w.hours }
          } catch {
            // Return basic info if fetch fails
            return {
              key: w.issue_key,
              summary: w.summary || '',
              status: '',
              hours: w.hours,
            }
          }
        })
      )

      return results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<SubmittedTicket>).value)
    },
    enabled: worklog && worklog.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// ========== AI API ==========

// AI API functions
const aiApi = {
  getAiRecommendation: async (date?: string, signal?: AbortSignal): Promise<AiRecommendation> => {
    const url = date ? `${API_BASE}/ai/recommendation?date=${date}` : `${API_BASE}/ai/recommendation`
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error('Failed to fetch AI recommendation')
    return response.json()
  },

  submitAiRecommendation: async (
    allocation: Allocation,
    date?: string,
    override?: Allocation,
    decisionId?: number
  ): Promise<AiSubmitResponse> => {
    const response = await fetch(`${API_BASE}/ai/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocation, date, override, decisionId }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to submit AI recommendation')
    }
    return response.json()
  },

  getAiConfig: async (signal?: AbortSignal): Promise<AiConfig> => {
    const response = await fetch(`${API_BASE}/ai/config`, { signal })
    if (!response.ok) throw new Error('Failed to fetch AI config')
    return response.json()
  },

  updateAiConfig: async (config: Partial<AiConfig>): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_BASE}/ai/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to update AI config')
    }
    return response.json()
  },

  getAiHistory: async (days: number = 30, signal?: AbortSignal): Promise<AiDecisionHistoryEntry[]> => {
    const response = await fetch(`${API_BASE}/ai/history?days=${days}`, { signal })
    if (!response.ok) throw new Error('Failed to fetch AI history')
    return response.json()
  },

  getLlmStatus: async (signal?: AbortSignal): Promise<{ available: boolean; provider: string; model: string; enabled: boolean }> => {
    const response = await fetch(`${API_BASE}/ai/llm/status`, { signal })
    if (!response.ok) throw new Error('Failed to fetch LLM status')
    return response.json()
  },

  getLlmCost: async (days: number = 30, signal?: AbortSignal): Promise<LlmCostStats> => {
    const response = await fetch(`${API_BASE}/ai/llm/cost?days=${days}`, { signal })
    if (!response.ok) throw new Error('Failed to fetch LLM cost')
    return response.json()
  },
}

// ========== AI Hooks ==========

// Fetch AI recommendation
export function useAiRecommendation(date: string) {
  return useQuery({
    queryKey: queryKeys.aiRecommendation(date),
    queryFn: ({ signal }) => aiApi.getAiRecommendation(date, signal),
    staleTime: 60 * 1000, // 1 minute
    enabled: !!date,
  })
}

// Fetch AI config
export function useAiConfig() {
  return useQuery({
    queryKey: queryKeys.aiConfig(),
    queryFn: ({ signal }) => aiApi.getAiConfig(signal),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Update AI config mutation
export function useUpdateAiConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: Partial<AiConfig>) => aiApi.updateAiConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiConfig() })
    },
  })
}

// Submit AI recommendation mutation
export function useSubmitAiRecommendation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      allocation,
      date,
      override,
      decisionId,
    }: {
      allocation: Allocation
      date?: string
      override?: Allocation
      decisionId?: number
    }) => aiApi.submitAiRecommendation(allocation, date, override, decisionId),
    onSuccess: (_, { allocation, override, date }) => {
      // Immediately update worklog cache for instant UI feedback
      const finalAllocation = override || allocation
      const currentData = queryClient.getQueryData(queryKeys.worklog(date)) as { worklog: WorklogEntry[]; submitted: boolean } | undefined
      const currentWorklog = currentData?.worklog || []

      // Build updated worklog (AI submission is usually append mode)
      const existingMap = new Map(currentWorklog.map(w => [w.issue_key, w.hours]))
      for (const [key, hours] of Object.entries(finalAllocation)) {
        existingMap.set(key, (existingMap.get(key) || 0) + hours)
      }
      const updatedWorklog = Array.from(existingMap.entries()).map(([issue_key, hours]) => ({
        issue_key,
        hours,
        submitted_at: new Date().toISOString()
      }))

      // Set updated cache data immediately
      queryClient.setQueryData(queryKeys.worklog(date), {
        worklog: updatedWorklog,
        submitted: true
      })

      // Then invalidate to trigger refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.worklog(date) })
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets(date) })
      queryClient.invalidateQueries({ queryKey: queryKeys.worklogHistory(30) })
      queryClient.invalidateQueries({ queryKey: queryKeys.submittedTickets(date) })
      queryClient.invalidateQueries({ queryKey: queryKeys.aiRecommendation(date) })
    },
  })
}

// Fetch AI decision history
export function useAiHistory(days: number = 30) {
  return useQuery({
    queryKey: queryKeys.aiHistory(days),
    queryFn: ({ signal }) => aiApi.getAiHistory(days, signal),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Fetch LLM status
export function useLlmStatus() {
  return useQuery({
    queryKey: queryKeys.llmStatus(),
    queryFn: ({ signal }) => aiApi.getLlmStatus(signal),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Fetch LLM cost stats
export function useLlmCost(days: number = 30) {
  return useQuery({
    queryKey: queryKeys.llmCost(days),
    queryFn: ({ signal }) => aiApi.getLlmCost(days, signal),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Export AI API for direct use
export { aiApi }