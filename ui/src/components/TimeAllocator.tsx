import type { Allocation } from '../types'
import { DEFAULT_JIRA_URL } from '../api/queries'

interface Props {
  allocation: Allocation
  jiraServer?: string
  onRecalculate?: () => void
}

function TimeAllocator({ allocation, jiraServer, onRecalculate }: Props) {
  const keys = Object.keys(allocation)

  if (keys.length === 0) {
    return <div className="no-allocation">请先选择 tickets</div>
  }

  const total = Math.round(Object.values(allocation).reduce((a, b) => a + b, 0) * 10) / 10
  const serverUrl = jiraServer || DEFAULT_JIRA_URL

  return (
    <div className="time-allocator">
      <div className="allocation-items">
        {keys.map(key => (
          <div key={key} className="allocation-item">
            <a href={`${serverUrl}browse/${key}`} target="_blank" rel="noopener noreferrer" className="ticket-key">
              {key}
            </a>
            <span className="hours">{allocation[key]}h</span>
          </div>
        ))}
      </div>
      <div className="allocation-total">
        总计: {total}h
        {onRecalculate && (
          <button className="btn-recalc" onClick={onRecalculate}>
            🔄 重分
          </button>
        )}
      </div>
    </div>
  )
}

export default TimeAllocator