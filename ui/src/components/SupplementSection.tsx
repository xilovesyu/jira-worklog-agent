import TicketList from './TicketList'
import type { SubmittedTicket } from '../types'

interface Props {
  submittedTickets: SubmittedTicket[]
  submittedHours: number
  targetHours: number
  jiraServer: string
}

function SupplementSection({ submittedTickets, submittedHours, targetHours, jiraServer }: Props) {
  if (submittedTickets.length === 0) return null

  return (
    <section className="submitted-section">
      <h3>已提交 ({Math.round(submittedHours * 10) / 10}h)：</h3>
      <TicketList
        tickets={submittedTickets}
        selected={[]}
        onToggle={() => {}}
        jiraServer={jiraServer}
        displayOnly={true}
      />
      <div className="supplement-remaining">
        需补充: <span className="remaining-hours">{Math.round(targetHours * 10) / 10}h</span>
      </div>
    </section>
  )
}

export default SupplementSection