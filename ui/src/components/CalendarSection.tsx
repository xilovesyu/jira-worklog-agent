import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'

interface Props {
  selectedDate: Date
  daysWithRecords: Set<string>
  onDateChange: (date: Date) => void
  dateToStr: (date: Date) => string
}

function CalendarSection({ selectedDate, daysWithRecords, onDateChange, dateToStr }: Props) {
  const handleDateChange = (value: Date | [Date | null, Date | null] | null) => {
    if (!value) {
      onDateChange(new Date())
      return
    }
    if (Array.isArray(value)) {
      const newDate = value[0]
      if (!newDate || isNaN(newDate.getTime())) {
        onDateChange(new Date())
        return
      }
      onDateChange(newDate)
    } else {
      if (isNaN(value.getTime())) {
        onDateChange(new Date())
        return
      }
      onDateChange(value)
    }
  }

  const tileClassName = ({ date }: { date: Date }) => {
    if (!date || isNaN(date.getTime())) return ''
    const dateStr = dateToStr(date)
    if (!dateStr) return ''
    if (daysWithRecords.has(dateStr)) return 'has-record'
    return ''
  }

  return (
    <section className="calendar-section compact">
      <Calendar
        onChange={handleDateChange}
        value={selectedDate}
        tileClassName={tileClassName}
      />
    </section>
  )
}

export default CalendarSection