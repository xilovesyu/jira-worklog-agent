interface Props {
  onSubmit: () => void
  onSameAsYesterday: () => void
  onCheck: () => void
  onSkip: () => void
  onClearSelection: () => void
  hasYesterday: boolean
  disabled: boolean
  submitting: boolean
  totalHours: number
  hasSelection: boolean
}

function QuickActions({ onSubmit, onSameAsYesterday, onCheck, onSkip, onClearSelection, hasYesterday, disabled, submitting, totalHours, hasSelection }: Props) {
  const is8Hours = Math.round(totalHours * 10) === 80

  return (
    <div className="quick-actions">
      {!is8Hours && totalHours > 0 && (
        <div className="hours-warning">总时间需为 8h (当前: {Math.round(totalHours * 10) / 10}h)</div>
      )}

      <button
        className="btn-primary"
        onClick={onSubmit}
        disabled={disabled || submitting || !is8Hours}
      >
        {submitting ? '提交中...' : '✅ 确认提交'}
      </button>

      {hasYesterday && (
        <button
          className="btn-secondary"
          onClick={onSameAsYesterday}
          disabled={submitting}
        >
          📋 同昨天
        </button>
      )}

      {hasSelection && (
        <button
          className="btn-clear"
          onClick={onClearSelection}
          disabled={submitting}
        >
          🗑️ 取消选择
        </button>
      )}

      <button
        className="btn-check"
        onClick={onCheck}
        disabled={submitting}
      >
        🔍 检查
      </button>

      <button
        className="btn-skip"
        onClick={onSkip}
        disabled={submitting}
      >
        ⏭️ 跳过
      </button>
    </div>
  )
}

export default QuickActions