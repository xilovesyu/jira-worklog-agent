import TicketList from './TicketList'
import type { SubmittedTicket } from '../types'

interface Props {
  submittedTickets: SubmittedTicket[]
  submittedHours: number
  selectedDate: Date
  jiraServer: string
  submitting: boolean
  formatDate: (date: Date) => string
  onCheck: () => void
  onSkip: () => void
}

function SubmittedView({
  submittedTickets,
  submittedHours,
  selectedDate,
  jiraServer,
  submitting,
  formatDate,
  onCheck,
  onSkip
}: Props) {
  return (
    <div className="already-submitted">
      <h2>✅ {formatDate(selectedDate)} 已提交</h2>
      <div className="total-hours-display">
        总计: <span className="hours-value">{Math.round(submittedHours * 10) / 10}h</span>
      </div>

      {submittedTickets.length > 0 && (
        <section className="submitted-section">
          <TicketList
            tickets={submittedTickets}
            selected={[]}
            onToggle={() => {}}
            jiraServer={jiraServer}
            displayOnly={true}
          />
        </section>
      )}

      <section className="actions-section">
        <button
          className="btn-check"
          onClick={onCheck}
          disabled={submitting}
        >
          {submitting ? '检查中...' : '🔍 检查同步'}
        </button>
        <button
          className="btn-skip"
          onClick={onSkip}
          disabled={submitting}
        >
          ⏭️ 下一日
        </button>
      </section>
    </div>
  )
}

export default SubmittedView