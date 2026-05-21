import axios from 'axios'
import { loadConfig } from './config.mjs'
import { getTodayStartTimeForJira, getDateStartTimeForJira, getTodayDate, getDateRange } from './utils.mjs'
import { extractTextFromADF, extractBacklogArea, parseTicket, batchFetchParentDetails, fetchParentDetails } from './ticketParser.mjs'

let jiraApi = null

export function getJiraApi() {
  if (!jiraApi) {
    const config = loadConfig()
    jiraApi = axios.create({
      baseURL: config.jira?.server,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.jira?.api_token}`
      }
    })
  }
  return jiraApi
}

/**
 * Extract user's last action time from issue changelog
 * Changelog contains history of all changes (status, assignee, comments, etc.)
 * @param issue - Jira issue object with expanded changelog
 * @param userKey - Current user's key
 * @param userAccountId - Current user's accountId (for Cloud)
 * @returns Date string of user's last action, or null if no user action found
 */
function getUserLastActionTime(issue, userKey, userAccountId) {
  const changelog = issue.changelog
  if (!changelog || !changelog.histories) {
    return null
  }

  // Find the most recent change by current user
  const userHistories = changelog.histories.filter(history => {
    const author = history.author
    // Match by key or accountId (Jira Server uses key, Cloud uses accountId)
    return author?.key === userKey || author?.accountId === userAccountId
  })

  if (userHistories.length === 0) {
    return null
  }

  // Sort by created time (descending) and return the most recent
  userHistories.sort((a, b) => new Date(b.created) - new Date(a.created))
  return userHistories[0].created
}

/**
 * Test Jira API connection
 */
export async function testConnection() {
  const api = getJiraApi()
  try {
    const response = await api.get('/rest/api/2/myself')
    console.log('Connection test successful:', response.data.displayName)
    return response.data
  } catch (err) {
    console.error('Connection test failed:', err.response?.status, err.response?.data || err.message)
    throw err
  }
}

/**
 * Get custom field names by searching field metadata
 */
export async function getCustomFields() {
  const api = getJiraApi()
  try {
    const response = await api.get('/rest/api/2/field')
    const fields = response.data

    // Find Backlog Area custom field - exact match first, then loose match
    let backlogAreaField = fields.find(f => f.name === 'Backlog Area')

    // If not found, try case-insensitive exact match
    if (!backlogAreaField) {
      backlogAreaField = fields.find(f => f.name.toLowerCase() === 'backlog area')
    }

    // Last resort: contains 'backlog' (but not other 'area' fields)
    if (!backlogAreaField) {
      backlogAreaField = fields.find(f =>
        f.name.toLowerCase().includes('backlog') && f.name.toLowerCase().includes('area')
      )
    }

    console.log('=== Backlog Area Field ===')
    console.log('  Found:', backlogAreaField?.id, backlogAreaField?.name)

    return {
      backlogAreaId: backlogAreaField?.id || null,
      backlogAreaName: backlogAreaField?.name || 'Backlog Area'
    }
  } catch (err) {
    console.error('Get custom fields failed:', err.response?.status, err.response?.data || err.message)
    return { backlogAreaId: null, backlogAreaName: 'Backlog Area' }
  }
}

/**
 * Search user's active tickets and recently participated tickets
 * @param backlogAreaFieldId - Custom field ID for Backlog Area
 * @param dateStr - Target date (YYYY-MM-DD), defaults to today
 * @returns { tickets, filters } - List of tickets and filter options
 */
export async function searchMyTickets(backlogAreaFieldId = null, dateStr = null) {
  const api = getJiraApi()

  // Calculate date range: [date - 7 days, date]
  const dateRange = getDateRange(dateStr, 7)

  // Combined JQL: active tickets + recently created + recently assigned
  const jql = `
    (assignee = currentUser() AND status not in (Closed, Done, Resolved))
    OR (reporter = currentUser() AND created >= '${dateRange.start}')
    OR (assignee was currentUser() AND updated >= '${dateRange.start}')
    ORDER BY updated DESC
  `.trim().replace(/\s+/g, ' ')

  // Build fields list
  let fieldsList = 'summary,status,priority,updated,description,parent,issuetype,project'
  if (backlogAreaFieldId) {
    fieldsList += ',' + backlogAreaFieldId
  }

  try {
    // Get current user info for filtering changelog
    const myselfResponse = await api.get('/rest/api/2/myself')
    const currentUserKey = myselfResponse.data.key
    const currentUserAccountId = myselfResponse.data.accountId

    const response = await api.get('/rest/api/2/search', {
      params: {
        jql: jql,
        fields: fieldsList,
        expand: 'changelog',  // Get changelog to find user's last action time
        maxResults: 50
      }
    })

    if (!response.data.issues) {
      console.error('Unexpected response:', response.data)
      return { tickets: [], filters: { projects: [], backlogAreas: [], types: [] } }
    }

    // Collect unique filter values
    const projectsSet = new Map()
    const backlogAreasSet = new Map()
    const typesSet = new Map()

    // First pass: collect parent keys from subtasks (tickets with parent field)
    const subtaskParentKeys = new Set()
    response.data.issues.forEach(issue => {
      // A subtask has a parent field, regardless of issuetype.subtask flag
      if (issue.fields.parent?.key) {
        subtaskParentKeys.add(issue.fields.parent.key)
      }
    })

    // Fetch parent details if there are subtasks using batch fetch
    let parentDetails = {}
    if (subtaskParentKeys.size > 0) {
      parentDetails = await batchFetchParentDetails(api, Array.from(subtaskParentKeys), backlogAreaFieldId)
    }

    // Map issues using shared parser, and extract user's last action time from changelog
    const tickets = response.data.issues.map(issue => {
      const parentKey = issue.fields.parent?.key
      const ticket = parseTicket(issue, backlogAreaFieldId, parentKey ? parentDetails[parentKey] : null)

      // Extract user's last action time from changelog
      // Changelog contains all changes made to the issue
      const userLastActionTime = getUserLastActionTime(issue, currentUserKey, currentUserAccountId)
      ticket.userLastAction = userLastActionTime  // Add user's last action time

      // Collect filter values
      if (ticket.projectKey && ticket.projectName) {
        projectsSet.set(ticket.projectKey, ticket.projectName)
      }
      const issueType = issue.fields.issuetype
      const typeName = issueType?.name || 'Unknown'
      const typeIsSubtask = issueType?.subtask === true
      typesSet.set(typeName, { name: typeName, isSubtask: typeIsSubtask })
      if (ticket.backlogArea) {
        backlogAreasSet.set(ticket.backlogArea, ticket.backlogArea)
      }

      return ticket
    })

    // Sort tickets by user's last action time (most recent first)
    tickets.sort((a, b) => {
      // If both have user action time, sort by that
      if (a.userLastAction && b.userLastAction) {
        return new Date(b.userLastAction) - new Date(a.userLastAction)
      }
      // If only one has user action time, prioritize it
      if (a.userLastAction) return -1
      if (b.userLastAction) return 1
      // Fallback: sort by ticket updated time
      return new Date(b.updated) - new Date(a.updated)
    })

    // Build filter options
    const filters = {
      projects: Array.from(projectsSet.entries()).map(([key, name]) => ({ key, name })),
      backlogAreas: Array.from(backlogAreasSet.keys()),
      types: Array.from(typesSet.values())
    }

    return { tickets, filters }
  } catch (err) {
    console.error('Search tickets failed:', err.response?.status, err.response?.data || err.message)
    throw err
  }
}

/**
 * Add worklog to a ticket
 * @param issueKey - Jira issue key
 * @param hours - Hours spent
 * @param comment - Worklog comment
 * @param dateStr - Optional date string (YYYY-MM-DD), defaults to today
 */
export async function addWorklog(issueKey, hours, comment = 'Daily work', dateStr = null) {
  const api = getJiraApi()

  // Use Jira server timezone to ensure worklog appears on correct date in Jira UI
  const started = dateStr ? getDateStartTimeForJira(dateStr) : getTodayStartTimeForJira()

  const payload = {
    timeSpent: `${hours}h`,
    comment: comment,
    started
  }

  const response = await api.post(
    `/rest/api/2/issue/${issueKey}/worklog`,
    payload
  )

  return response.data
}

/**
 * Get worklogs for an issue on a specific date
 * @param issueKey - Jira issue key
 * @param dateStr - Date string (YYYY-MM-DD)
 * @returns Array of worklogs with id, hours, started, comment
 */
export async function getIssueWorklogsByDate(issueKey, dateStr) {
  const api = getJiraApi()

  try {
    const response = await api.get(`/rest/api/2/issue/${issueKey}/worklog`)
    const worklogs = response.data.worklogs || []

    // Filter by date - Jira started time format: "2026-05-06T09:00:00.000+0800"
    const targetDate = dateStr || getTodayDate()
    const filtered = worklogs.filter(w => {
      const startedDate = w.started?.substring(0, 10)
      return startedDate === targetDate
    })

    return filtered.map(w => ({
      id: w.id,
      issueKey: issueKey,
      hours: w.timeSpentSeconds / 3600,  // Convert seconds to hours
      started: w.started,
      comment: w.comment || ''
    }))
  } catch (err) {
    console.error(`Error getting worklogs for ${issueKey}:`, err.response?.status, err.response?.data || err.message)
    return []
  }
}

/**
 * Get all worklogs for multiple issues on a specific date
 * @param issueKeys - Array of Jira issue keys
 * @param dateStr - Date string (YYYY-MM-DD)
 * @returns Map of issueKey -> worklogs array
 */
export async function getWorklogsForIssuesByDate(issueKeys, dateStr) {
  const results = {}

  for (const key of issueKeys) {
    results[key] = await getIssueWorklogsByDate(key, dateStr)
  }

  return results
}

/**
 * Delete a worklog from an issue
 * @param issueKey - Jira issue key
 * @param worklogId - Worklog ID to delete
 */
export async function deleteWorklog(issueKey, worklogId) {
  const api = getJiraApi()

  try {
    await api.delete(`/rest/api/2/issue/${issueKey}/worklog/${worklogId}`)
    return true
  } catch (err) {
    console.error(`Error deleting worklog ${worklogId} from ${issueKey}:`, err.response?.status, err.response?.data || err.message)
    return false
  }
}

/**
 * Get ticket details
 */
export async function getTicket(issueKey) {
  const api = getJiraApi()

  const response = await api.get(`/rest/api/2/issue/${issueKey}`, {
    params: {
      fields: 'summary,status,assignee'
    }
  })

  return {
    key: response.data.key,
    summary: response.data.fields.summary,
    status: response.data.fields.status?.name
  }
}

/**
 * Get user's worklogs for a specific date from Jira
 * Uses JQL to find issues where user logged work on that date
 * @param dateStr - Date string (YYYY-MM-DD) in local timezone
 * @returns Array of worklogs with issueKey, hours, started, comment
 */
export async function getUserWorklogsByDate(dateStr) {
  const api = getJiraApi()
  const targetDate = dateStr || getTodayDate()

  try {
    // Calculate server timezone offset (PDT = -7 hours)
    // Worklog might be recorded on different date due to timezone
    // Query both the target date and the day before/after to catch timezone shifts
    const prevDate = new Date(targetDate)
    prevDate.setDate(prevDate.getDate() - 1)
    const prevDateStr = prevDate.toISOString().split('T')[0]

    const nextDate = new Date(targetDate)
    nextDate.setDate(nextDate.getDate() + 1)
    const nextDateStr = nextDate.toISOString().split('T')[0]

    // Search for issues where current user logged work on target date range
    const jql = `worklogAuthor = currentUser() AND worklogDate >= '${prevDateStr}' AND worklogDate <= '${nextDateStr}'`

    const response = await api.get('/rest/api/2/search', {
      params: {
        jql: jql,
        fields: 'summary',
        maxResults: 50
      }
    })

    const issues = response.data.issues || []
    const worklogs = []

    // For each issue, get the actual worklogs and filter by date and author
    for (const issue of issues) {
      const issueKey = issue.key
      const worklogResponse = await api.get(`/rest/api/2/issue/${issueKey}/worklog`)
      const issueWorklogs = worklogResponse.data.worklogs || []

      // Filter by author
      const currentUser = await api.get('/rest/api/2/myself')
      const currentUserKey = currentUser.data.key

      for (const w of issueWorklogs) {
        const authorKey = w.author?.key

        if (authorKey === currentUserKey) {
          // Parse started time - use Jira server timezone date, NOT local timezone
          // Jira format: "2026-05-05T18:00:00.000-0700"
          // The date part (before T) is in the server's timezone (e.g., PDT)
          // We should use this date to match the target date for consistency
          const startedStr = w.started
          if (startedStr) {
            // Extract date from started string (server timezone date)
            // e.g., "2026-05-11T18:00:00.000-0700" -> "2026-05-11"
            const serverDateStr = startedStr.substring(0, 10)

            if (serverDateStr === targetDate) {
              worklogs.push({
                id: w.id,
                issueKey: issueKey,
                summary: issue.fields.summary,
                hours: w.timeSpentSeconds / 3600,
                started: w.started,
                comment: w.comment || ''
              })
            }
          }
        }
      }
    }

    return worklogs
  } catch (err) {
    console.error('Error getting user worklogs:', err.response?.status, err.response?.data || err.message)
    return []
  }
}

/**
 * Search ticket by key or URL, return full ticket details
 */
export async function searchTicketByKeyOrUrl(input, backlogAreaFieldId = null) {
  const api = getJiraApi()

  // Extract ticket key from input (could be "PROJ-123" or full URL)
  let issueKey = input.trim()

  // If it's a URL, extract the key
  const urlMatch = issueKey.match(/browse\/([A-Z][A-Z0-9_]+-\d+)/i)
  if (urlMatch) {
    issueKey = urlMatch[1].toUpperCase()
  }

  // Validate key format
  const keyPattern = /^[A-Z][A-Z0-9_]+-\d+$/
  if (!keyPattern.test(issueKey)) {
    throw new Error('Invalid ticket key format. Use format like PROJ-123 or URL')
  }

  // Build fields list
  let fieldsList = 'summary,status,priority,updated,description,parent,issuetype,project'
  if (backlogAreaFieldId) {
    fieldsList += ',' + backlogAreaFieldId
  }

  try {
    const response = await api.get(`/rest/api/2/issue/${issueKey}`, {
      params: {
        fields: fieldsList
      }
    })

    const issue = response.data
    const parentKey = issue.fields.parent?.key

    // Fetch parent details if subtask
    let parentDetails = null
    if (parentKey) {
      parentDetails = await fetchParentDetails(api, parentKey, backlogAreaFieldId)
    }

    // Use shared parser
    return parseTicket(issue, backlogAreaFieldId, parentDetails)
  } catch (err) {
    if (err.response?.status === 404) {
      throw new Error(`Ticket ${issueKey} not found`)
    }
    console.error('Search ticket failed:', err.response?.status, err.response?.data || err.message)
    throw err
  }
}

/**
 * Get subtasks of a parent issue created by current user
 * @param parentKey - Parent issue key (e.g., Bug key)
 * @returns Array of subtasks with key, summary, status
 */
export async function getSubtasksByUser(parentKey) {
  const api = getJiraApi()

  try {
    // Get current user info
    const myselfResponse = await api.get('/rest/api/2/myself')
    const currentUserAccountId = myselfResponse.data.accountId
    const currentUserKey = myselfResponse.data.key

    // Build JQL: parent = {parentKey} AND reporter = currentUser
    // Use accountId for Cloud, key for Server
    const reporterQuery = currentUserAccountId
      ? `reporter = "${currentUserAccountId}"`
      : `reporter = "${currentUserKey}"`

    const jql = `parent = ${parentKey} AND ${reporterQuery}`

    const response = await api.get('/rest/api/2/search', {
      params: {
        jql: jql,
        fields: 'summary,status,issuetype',
        maxResults: 20
      }
    })

    const issues = response.data.issues || []

    return issues.map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name || 'Unknown'
    }))
  } catch (err) {
    console.error('Error getting subtasks:', err.response?.status, err.response?.data || err.message)
    return []
  }
}

/**
 * Create a new subtask under a parent issue
 * @param parentKey - Parent issue key
 * @param summary - Subtask summary/title
 * @returns New subtask key
 */
export async function createSubtask(parentKey, summary) {
  const api = getJiraApi()

  try {
    // Get current user info for assignee
    const myselfResponse = await api.get('/rest/api/2/myself')
    const currentAccountId = myselfResponse.data.accountId
    const currentUserKey = myselfResponse.data.key
    const currentUserName = myselfResponse.data.name || currentUserKey

    // Get parent issue to extract project key and required fields
    const parentResponse = await api.get(`/rest/api/2/issue/${parentKey}`, {
      params: { fields: 'project,customfield_10314' }  // Include TEAM field
    })
    const projectKey = parentResponse.data.fields.project?.key
    const teamField = parentResponse.data.fields.customfield_10314  // TEAM field

    if (!projectKey) {
      throw new Error('Could not determine project key from parent')
    }

    // Get project's available issue types to find correct subtask type
    const projectResponse = await api.get(`/rest/api/2/project/${projectKey}`)
    const issueTypes = projectResponse.data.issueTypes || []

    // Find a subtask issue type (subtask === true)
    const subtaskType = issueTypes.find(t => t.subtask === true)

    if (!subtaskType) {
      throw new Error('No subtask issue type available in this project')
    }

    console.log(`Using subtask issue type: ${subtaskType.name} (id: ${subtaskType.id})`)
    console.log(`Assigning subtask to current user: ${currentAccountId || currentUserName}`)
    if (teamField) {
      console.log(`Inheriting TEAM field from parent:`, teamField)
    }

    // Create subtask using the correct issue type, assign to self, inherit required fields
    // Jira Cloud uses accountId, Jira Server/DC uses name
    const assignee = currentAccountId
      ? { accountId: currentAccountId }
      : { name: currentUserName }

    const payload = {
      fields: {
        project: { key: projectKey },
        summary: summary,
        issuetype: { id: subtaskType.id },  // Use ID for reliability
        parent: { key: parentKey },
        assignee: assignee  // Assign to current user
      }
    }

    // Inherit TEAM field from parent if it exists (required field)
    if (teamField) {
      payload.fields.customfield_10314 = teamField
    }

    const response = await api.post('/rest/api/2/issue', payload)

    console.log(`Created subtask ${response.data.key} under ${parentKey}`)
    return response.data.key
  } catch (err) {
    // Log full error details for debugging
    console.error('Error creating subtask:', {
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      message: err.message
    })

    // Extract error message from various Jira error formats
    const errorData = err.response?.data
    let errorMsg = 'Failed to create subtask'

    // Check for field-level errors
    if (errorData?.errors) {
      const fieldErrors = Object.entries(errorData.errors)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join(', ')
      if (fieldErrors) errorMsg = fieldErrors
    }

    // Check for general error messages
    if (errorData?.errorMessages?.length > 0) {
      errorMsg = errorData.errorMessages.join(', ')
    }

    // Check for warning messages (some Jira instances use this)
    if (errorData?.warningMessages?.length > 0) {
      errorMsg = errorData.warningMessages.join(', ')
    }

    throw new Error(errorMsg)
  }
}

/**
 * Batch get ticket details by keys
 * More efficient than searchMyTickets when we know specific tickets
 * @param ticketKeys - Array of Jira issue keys (e.g., ['PROJ-123', 'CAP-456'])
 * @param backlogAreaFieldId - Optional custom field ID for Backlog Area
 * @returns Array of tickets with key, summary, status
 */
export async function batchGetTicketDetails(ticketKeys, backlogAreaFieldId = null) {
  if (!ticketKeys || ticketKeys.length === 0) {
    return []
  }

  const api = getJiraApi()

  // Build JQL: key in (KEY-1, KEY-2, ...)
  const jql = `key in (${ticketKeys.map(k => `"${k}"`).join(',')})`

  // Build fields list
  let fieldsList = 'summary,status,updated,assignee,description,parent,issuetype,project'
  if (backlogAreaFieldId) {
    fieldsList += ',' + backlogAreaFieldId
  }

  try {
    // Get current user for assignee comparison
    const myselfResponse = await api.get('/rest/api/2/myself')
    const currentUserAccountId = myselfResponse.data.accountId
    const currentUserKey = myselfResponse.data.key

    const response = await api.get('/rest/api/2/search', {
      params: {
        jql: jql,
        fields: fieldsList,
        maxResults: 50
      }
    })

    if (!response.data.issues) {
      return []
    }

    // Collect parent keys from subtasks
    const subtaskParentKeys = new Set()
    response.data.issues.forEach(issue => {
      if (issue.fields.parent?.key) {
        subtaskParentKeys.add(issue.fields.parent.key)
      }
    })

    // Fetch parent details if there are subtasks
    let parentDetails = {}
    if (subtaskParentKeys.size > 0) {
      parentDetails = await batchFetchParentDetails(api, Array.from(subtaskParentKeys), backlogAreaFieldId)
    }

    return response.data.issues.map(issue => {
      const assignee = issue.fields.assignee
      const isAssignedToMe = assignee &&
        (assignee.accountId === currentUserAccountId ||
         assignee.key === currentUserKey ||
         assignee.name === currentUserKey)

      const parentKey = issue.fields.parent?.key
      const parentInfo = parentKey ? parentDetails[parentKey] : null

      // Parse description
      let description = issue.fields.description
      if (description && typeof description === 'object') {
        description = extractTextFromADF(description)
      }

      // Parse parent description
      let parentDescription = ''
      if (parentInfo?.description) {
        parentDescription = parentInfo.description
      }

      const issueType = issue.fields.issuetype
      const isSubtask = !!parentKey

      // Extract backlog area
      let backlogArea = null
      if (backlogAreaFieldId && issue.fields[backlogAreaFieldId]) {
        backlogArea = extractBacklogArea(issue.fields[backlogAreaFieldId])
      }

      return {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name || 'Unknown',
        assignee: assignee?.displayName || assignee?.name || 'Unassigned',
        isAssignedToMe,
        updated: issue.fields.updated,
        description: description || null,
        isSubtask,
        parentKey: parentKey || null,
        parentSummary: parentInfo?.summary || issue.fields.parent?.fields?.summary || '',
        parentDescription: parentDescription || null,
        parentTypeName: parentInfo?.typeName || null,
        typeName: issueType?.name || 'Unknown',
        projectKey: issue.fields.project?.key || '',
        backlogArea: backlogArea
      }
    })
  } catch (err) {
    console.error('Batch get tickets failed:', err.response?.status, err.response?.data || err.message)
    return []
  }
}

/**
 * Transition an issue to a new status
 * @param issueKey - Issue key
 * @param transitionName - Target status name (e.g., 'Closed')
 * @returns true if successful
 */
export async function transitionIssue(issueKey, transitionName) {
  const api = getJiraApi()

  try {
    // Get available transitions
    const transitionsResponse = await api.get(`/rest/api/2/issue/${issueKey}/transitions`)
    const transitions = transitionsResponse.data.transitions || []

    // Find the transition that leads to the target status
    const transition = transitions.find(t =>
      t.to?.name?.toLowerCase() === transitionName.toLowerCase()
    )

    if (!transition) {
      console.error(`No transition found to ${transitionName} for ${issueKey}`)
      console.log('Available transitions:', transitions.map(t => `${t.name} -> ${t.to?.name}`))
      throw new Error(`Cannot transition to ${transitionName}`)
    }

    // Perform the transition
    await api.post(`/rest/api/2/issue/${issueKey}/transitions`, {
      transition: { id: transition.id }
    })

    console.log(`Transitioned ${issueKey} to ${transitionName}`)
    return true
  } catch (err) {
    console.error('Error transitioning issue:', err.response?.status, err.response?.data || err.message)
    throw err
  }
}