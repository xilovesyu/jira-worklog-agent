import { useState, useEffect } from 'react'
import type { Ticket } from '../types'
import { DEFAULT_JIRA_URL } from '../api/queries'

interface SubtaskInfo {
  key: string
  summary: string
  status: string
}

interface BugChoice {
  bugKey: string
  bugSummary: string
  hours: number
  choice: 'parent' | 'existing' | 'new'
  existingSubtaskKey?: string
  newSubtaskSummary?: string
}

interface BugWorklogChoice {
  target: string
  hours: number
  closeAfter?: boolean
  parentKey?: string
  summary?: string
}

interface Props {
  isOpen: boolean
  bugs: Ticket[]
  allocation: Record<string, number>
  onConfirm: (choices: Record<string, BugWorklogChoice>) => void
  onCancel: () => void
}

function BugWorklogModal({ isOpen, bugs, allocation, onConfirm, onCancel }: Props) {
  const [bugSubtasks, setBugSubtasks] = useState<Record<string, SubtaskInfo[]>>({})
  const [choices, setChoices] = useState<Record<string, BugChoice>>({})
  const [loading, setLoading] = useState(true)

  // Fetch subtasks for each bug on mount (parallel fetch with cleanup)
  useEffect(() => {
    if (!isOpen || bugs.length === 0) return

    setLoading(true)
    const controller = new AbortController()

    const fetchSubtasks = async () => {
      // Parallel fetch all bug subtasks
      const fetchPromises = bugs.map(async (bug) => {
        try {
          const response = await fetch(`/api/bug/${bug.key}/subtasks`, {
            signal: controller.signal
          })
          const data = await response.json()
          return { bugKey: bug.key, subtasks: data.subtasks || [] }
        } catch {
          return { bugKey: bug.key, subtasks: [] }
        }
      })

      const resultsArray = await Promise.all(fetchPromises)
      const results: Record<string, SubtaskInfo[]> = {}
      for (const { bugKey, subtasks } of resultsArray) {
        results[bugKey] = subtasks
      }

      setBugSubtasks(results)

      // Initialize default choices
      const initialChoices: Record<string, BugChoice> = {}
      for (const bug of bugs) {
        initialChoices[bug.key] = {
          bugKey: bug.key,
          bugSummary: bug.summary,
          hours: allocation[bug.key] || 0,
          choice: 'parent',
          newSubtaskSummary: '[UI Dev] bug fix'
        }
      }
      setChoices(initialChoices)
      setLoading(false)
    }

    fetchSubtasks()

    // Cleanup: abort fetch on unmount or modal close
    return () => {
      controller.abort()
    }
  }, [isOpen, bugs, allocation])

  if (!isOpen) return null

  const handleChoiceChange = (bugKey: string, field: string, value: string | number) => {
    setChoices(prev => ({
      ...prev,
      [bugKey]: {
        ...prev[bugKey],
        [field]: value
      }
    }))
  }

  const handleConfirm = () => {
    const result: Record<string, BugWorklogChoice> = {}

    for (const [bugKey, choice] of Object.entries(choices)) {
      if (choice.choice === 'parent') {
        result[bugKey] = { target: bugKey, hours: choice.hours }
      } else if (choice.choice === 'existing') {
        result[bugKey] = { target: choice.existingSubtaskKey || bugKey, hours: choice.hours }
      } else if (choice.choice === 'new') {
        result[bugKey] = {
          target: 'new',
          hours: choice.hours,
          closeAfter: true,
          parentKey: bugKey,
          summary: choice.newSubtaskSummary || '[UI Dev] bug fix'
        }
      }
    }

    onConfirm(result)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">Bug 工时记录方式</h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        {loading ? (
          <div className="modal-body">
            <div className="loading">加载中...</div>
          </div>
        ) : (
          <div className="modal-body">
            <p className="modal-desc">以下 Bug 需要选择工时记录方式：</p>

            {bugs.map(bug => (
              <div key={bug.key} className="bug-item">
                <div className="bug-header">
                  <a
                    href={`${DEFAULT_JIRA_URL}browse/${bug.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bug-key"
                  >
                    {bug.key}
                  </a>
                  <span className="bug-summary">{bug.summary}</span>
                  <span className="bug-hours">{allocation[bug.key]}h</span>
                </div>

                <div className="choice-options">
                  <label className="choice-option">
                    <input
                      type="radio"
                      name={`choice-${bug.key}`}
                      checked={choices[bug.key]?.choice === 'parent'}
                      onChange={() => handleChoiceChange(bug.key, 'choice', 'parent')}
                    />
                    <span>直接 log 在 Bug 上</span>
                  </label>

                  {bugSubtasks[bug.key]?.length > 0 && (
                    <label className="choice-option">
                      <input
                        type="radio"
                        name={`choice-${bug.key}`}
                        checked={choices[bug.key]?.choice === 'existing'}
                        onChange={() => handleChoiceChange(bug.key, 'choice', 'existing')}
                      />
                      <span>使用已有 subtask</span>
                      <select
                        className="subtask-select"
                        value={choices[bug.key]?.existingSubtaskKey || ''}
                        onChange={(e) => handleChoiceChange(bug.key, 'existingSubtaskKey', e.target.value)}
                        disabled={choices[bug.key]?.choice !== 'existing'}
                      >
                        <option value="">选择 subtask</option>
                        {bugSubtasks[bug.key].map(st => (
                          <option key={st.key} value={st.key}>
                            {st.key} - {st.summary} ({st.status})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="choice-option">
                    <input
                      type="radio"
                      name={`choice-${bug.key}`}
                      checked={choices[bug.key]?.choice === 'new'}
                      onChange={() => handleChoiceChange(bug.key, 'choice', 'new')}
                    />
                    <span>创建新 subtask 并 log（自动 Close）</span>
                  </label>

                  {choices[bug.key]?.choice === 'new' && (
                    <input
                      type="text"
                      className="new-subtask-input"
                      value={choices[bug.key]?.newSubtaskSummary || '[UI Dev] bug fix'}
                      onChange={(e) => handleChoiceChange(bug.key, 'newSubtaskSummary', e.target.value)}
                      placeholder="Subtask 名称"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onCancel}>取消</button>
          <button className="btn-primary" onClick={handleConfirm} disabled={loading}>
            确认提交
          </button>
        </div>
      </div>
    </div>
  )
}

export default BugWorklogModal