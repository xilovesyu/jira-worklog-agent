import { useState, KeyboardEvent } from 'react'

interface Props {
  onAdd: (input: string) => void
  disabled?: boolean
}

function TicketSearch({ onAdd, disabled }: Props) {
  const [input, setInput] = useState('')

  const handleSearch = () => {
    if (!input.trim()) return
    onAdd(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !disabled) {
      handleSearch()
    }
  }

  return (
    <div className="ticket-search-wrapper">
      <div className="ticket-search">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入 ticket 号 (如 PROJ-123) 或完整链接"
          disabled={disabled}
          className="search-input"
        />
        <button
          onClick={handleSearch}
          disabled={disabled || !input.trim()}
          className="search-btn"
        >
          添加
        </button>
      </div>
    </div>
  )
}

export default TicketSearch