// Date utilities
export const dateToStr = (date: Date | null | undefined): string => {
  if (!date || isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const formatDate = (date: Date | null | undefined): string => {
  if (!date || isNaN(date.getTime())) return '未知日期'
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}

export const safeDate = (date: Date | null | undefined): Date => {
  return date && !isNaN(date.getTime()) ? date : new Date()
}

// Allocation utilities
export const calculateAllocation = (keys: string[], targetHours: number): Record<string, number> => {
  if (keys.length === 0) return {}

  const hours = Math.round(targetHours / keys.length * 10) / 10
  const allocation: Record<string, number> = {}
  keys.forEach(key => { allocation[key] = hours })

  // Fix floating point total
  const total = Object.values(allocation).reduce((a, b) => a + b, 0)
  const diff = Math.round((targetHours - total) * 10) / 10
  if (diff !== 0 && keys.length > 0) {
    allocation[keys[0]] = Math.round((allocation[keys[0]] + diff) * 10) / 10
  }

  return allocation
}

import { getProjectFilterKeywords, getBacklogAreaFilterValues } from '../config/envConfig'

// Filter utilities
export const extractFilteredProjects = (
  projects: { key: string; name: string }[] | undefined
): string[] => {
  const keywords = getProjectFilterKeywords()
  return (projects || [])
    .filter(p => p?.name && keywords.some(k => p.name.toLowerCase().includes(k) || p.key?.toLowerCase().includes(k)))
    .map(p => p.key)
}

export const extractFilteredBacklogAreas = (
  areas: string[] | undefined
): string[] => {
  const filterValues = getBacklogAreaFilterValues()
  return (areas || []).filter(area => filterValues.some(v => area?.toLowerCase() === v))
}

export const extractAllTypes = (types: { name: string }[] | undefined): string[] => {
  return (types || []).map(t => t?.name).filter(Boolean)
}

// Filter pre-selected tickets to match project/area criteria
export const filterPreSelectedTickets = (
  preSelected: string[] | undefined,
  allTickets: { key: string; projectKey?: string; backlogArea?: string }[] | undefined,
  projectKeys: string[],
  backlogAreas: string[]
): string[] => {
  return (preSelected || []).filter(key => {
    const ticket = (allTickets || []).find(t => t.key === key)
    return ticket &&
      projectKeys.includes(ticket.projectKey || '') &&
      (!ticket.backlogArea || backlogAreas.length === 0 || backlogAreas.includes(ticket.backlogArea))
  })
}