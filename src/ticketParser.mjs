/**
 * Ticket parsing utilities - shared logic for Jira ticket processing
 */

/**
 * Extract plain text from ADF (Atlassian Document Format)
 * Handles nested paragraphs and text nodes
 */
export function extractTextFromADF(adf) {
  if (!adf || !adf.content) return ''

  let text = ''
  for (const node of adf.content) {
    if (node.type === 'paragraph' && node.content) {
      for (const child of node.content) {
        if (child.type === 'text') {
          text += child.text + ' '
        }
      }
      text += '\n'
    } else if (node.content) {
      text += extractTextFromADF(node)
    }
  }
  return text.trim()
}

/**
 * Extract Backlog Area value from custom field
 * Handles different field formats: string, object (value/name), array
 */
export function extractBacklogArea(fieldValue) {
  if (!fieldValue) return ''

  if (typeof fieldValue === 'string') {
    return fieldValue
  }

  if (fieldValue.value) {
    return fieldValue.value
  }

  if (fieldValue.name) {
    return fieldValue.name
  }

  if (Array.isArray(fieldValue)) {
    return fieldValue.map(v => v.value || v.name || v).join(', ')
  }

  return ''
}

/**
 * Parse a Jira issue into a standardized ticket object
 * Handles description parsing, Backlog Area extraction, and parent inheritance
 */
export function parseTicket(issue, backlogAreaFieldId = null, parentDetails = null) {
  const isSubtask = !!issue.fields.parent?.key
  const parentKey = issue.fields.parent?.key

  // Parse description
  let description = issue.fields.description
  if (description && typeof description === 'object') {
    description = extractTextFromADF(description)
  }

  // Get parent info
  let parentSummary = issue.fields.parent?.fields?.summary || ''
  let parentDescription = ''
  let parentBacklogArea = ''

  if (parentKey && parentDetails) {
    parentSummary = parentDetails.summary || parentSummary
    parentDescription = parentDetails.description || ''
    parentBacklogArea = parentDetails.backlogArea || ''
  }

  // Backlog Area: subtasks inherit from parent
  let backlogArea = ''
  if (isSubtask && parentBacklogArea) {
    backlogArea = parentBacklogArea
  } else if (backlogAreaFieldId && issue.fields[backlogAreaFieldId]) {
    backlogArea = extractBacklogArea(issue.fields[backlogAreaFieldId])
  }

  // Project info
  const project = issue.fields.project
  const projectKey = project?.key || ''
  const projectName = project?.name || ''

  // Issue type
  const issueType = issue.fields.issuetype
  const typeName = issueType?.name || 'Unknown'

  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name || 'Unknown',
    priority: issue.fields.priority?.name || 'None',
    updated: issue.fields.updated,
    description: description || '',
    isSubtask,
    parentKey: parentKey || '',
    parentSummary,
    parentDescription,
    projectKey,
    projectName,
    backlogArea,
    typeName
  }
}

/**
 * Fetch parent details for subtasks
 * Returns object with summary, description, and backlogArea
 */
export async function fetchParentDetails(api, parentKey, backlogAreaFieldId = null) {
  let fieldsList = 'summary,description,project'
  if (backlogAreaFieldId) {
    fieldsList += ',' + backlogAreaFieldId
  }

  const response = await api.get(`/rest/api/2/issue/${parentKey}`, {
    params: { fields: fieldsList }
  })

  const parent = response.data

  let description = parent.fields.description
  if (description && typeof description === 'object') {
    description = extractTextFromADF(description)
  }

  let backlogArea = ''
  if (backlogAreaFieldId && parent.fields[backlogAreaFieldId]) {
    backlogArea = extractBacklogArea(parent.fields[backlogAreaFieldId])
  }

  return {
    summary: parent.fields.summary,
    description: description || '',
    project: parent.fields.project,
    backlogArea
  }
}

/**
 * Batch fetch parent details for multiple subtasks
 * More efficient than individual fetches
 */
export async function batchFetchParentDetails(api, parentKeys, backlogAreaFieldId = null) {
  if (!parentKeys || parentKeys.length === 0) return {}

  let fieldsList = 'summary,description,project,issuetype'
  if (backlogAreaFieldId) {
    fieldsList += ',' + backlogAreaFieldId
  }

  const response = await api.get('/rest/api/2/search', {
    params: {
      jql: `key in (${parentKeys.join(',')})`,
      fields: fieldsList,
      maxResults: 50
    }
  })

  const details = {}
  if (response.data.issues) {
    response.data.issues.forEach(parent => {
      let description = parent.fields.description
      if (description && typeof description === 'object') {
        description = extractTextFromADF(description)
      }

      let backlogArea = ''
      if (backlogAreaFieldId && parent.fields[backlogAreaFieldId]) {
        backlogArea = extractBacklogArea(parent.fields[backlogAreaFieldId])
      }

      const issueType = parent.fields.issuetype

      details[parent.key] = {
        summary: parent.fields.summary,
        description: description || '',
        project: parent.fields.project,
        backlogArea,
        typeName: issueType?.name || 'Unknown'
      }
    })
  }

  return details
}