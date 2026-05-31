import { useState } from 'react'

interface DimensionPickerModalProps {
  onSelect: (rows: number, cols: number) => void
  onCancel: () => void
}

export function DimensionPickerModal({ onSelect, onCancel }: DimensionPickerModalProps) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)

  const increment = (setter: React.Dispatch<React.SetStateAction<number>>, max: number) => {
    setter(prev => Math.min(prev + 1, max))
  }

  const decrement = (setter: React.Dispatch<React.SetStateAction<number>>, min: number) => {
    setter(prev => Math.max(prev - 1, min))
  }

  return (
    <div className="dimension-modal-overlay" onClick={onCancel}>
      <div className="dimension-modal" onClick={e => e.stopPropagation()}>
        <div className="dimension-modal-header">
          <h3>Insert Table</h3>
          <button className="dimension-modal-close" onClick={onCancel}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="dimension-modal-body">
          <div className="dimension-input-group">
            <label>Rows</label>
            <div className="dimension-stepper">
              <button onClick={() => decrement(setRows, 1)} disabled={rows <= 1}>−</button>
              <span>{rows}</span>
              <button onClick={() => increment(setRows, 20)}>+</button>
            </div>
          </div>

          <span className="dimension-separator">×</span>

          <div className="dimension-input-group">
            <label>Columns</label>
            <div className="dimension-stepper">
              <button onClick={() => decrement(setCols, 1)} disabled={cols <= 1}>−</button>
              <span>{cols}</span>
              <button onClick={() => increment(setCols, 20)}>+</button>
            </div>
          </div>
        </div>

        <div className="dimension-modal-footer">
          <button className="dimension-btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="dimension-btn-create" onClick={() => onSelect(rows, cols)}>
            Create {rows} × {cols} Table
          </button>
        </div>
      </div>
    </div>
  )
}
