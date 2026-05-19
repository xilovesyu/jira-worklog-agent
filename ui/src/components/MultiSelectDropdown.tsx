import { useState, useRef, useEffect } from 'react'

interface Option {
  key?: string
  name: string
  isSubtask?: boolean
}

interface Props {
  label: string
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
  valueKey?: 'key' | 'name'  // Which property to use as value
}

function MultiSelectDropdown({ label, options, selected, onChange, valueKey = 'name' }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Get value from option
  const getValue = (option: Option) => valueKey === 'key' ? (option.key || option.name) : option.name

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const toggleAll = () => {
    if (selected.length === options.length) {
      onChange([])
    } else {
      onChange(options.map(getValue))
    }
  }

  const displayText = selected.length === 0
    ? `全部 ${label}`
    : selected.length === options.length
      ? `全部 ${label}`
      : `${selected.length} 个 ${label}`

  return (
    <div className="multi-select" ref={dropdownRef}>
      <button
        className={`multi-select-trigger ${isOpen ? 'open' : ''} ${selected.length > 0 && selected.length < options.length ? 'partial' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="multi-select-text">{displayText}</span>
        <span className="multi-select-arrow"></span>
      </button>

      {isOpen && (
        <div className="multi-select-dropdown">
          <div className="multi-select-header">
            <button
              className={`multi-select-all ${selected.length === options.length ? 'selected' : ''}`}
              onClick={toggleAll}
            >
              {selected.length === options.length ? '取消全选' : '全选'}
            </button>
            {selected.length > 0 && selected.length < options.length && (
              <span className="multi-select-count">{selected.length}/{options.length}</span>
            )}
          </div>
          <div className="multi-select-options">
            {options.map(option => {
              const value = getValue(option)
              const isSelected = selected.includes(value)
              return (
                <div
                  key={value}
                  className={`multi-select-option ${isSelected ? 'selected' : ''} ${option.isSubtask ? 'subtask' : ''}`}
                  onClick={() => toggleOption(value)}
                >
                  <span className={`multi-select-checkbox ${isSelected ? 'checked' : ''}`}>
                    {isSelected ? '✓' : ''}
                  </span>
                  <span className="multi-select-label">{option.name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default MultiSelectDropdown