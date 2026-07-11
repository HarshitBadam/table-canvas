import { useEffect, useRef, useState } from 'react';

interface DimensionPickerProps {
  onSelect: (rows: number, cols: number) => void;
  onCancel: () => void;
}

export function DimensionPicker({ onSelect, onCancel }: DimensionPickerProps) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const timeout = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, []);
  const increment = (setter: React.Dispatch<React.SetStateAction<number>>, max: number) => {
    setter(value => Math.min(value + 1, max));
  };
  const decrement = (setter: React.Dispatch<React.SetStateAction<number>>, min: number) => {
    setter(value => Math.max(value - 1, min));
  };

  return (
    <div className="dimension-modal-overlay" onClick={onCancel}>
      <div
        className="dimension-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="insert-table-title"
        onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <div className="dimension-modal-header">
          <h3 id="insert-table-title">Insert Table</h3>
          <button ref={closeRef} type="button" className="dimension-modal-close" onClick={onCancel} aria-label="Close table picker">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="dimension-modal-body">
          <DimensionStepper label="Rows" value={rows} onDecrease={() => decrement(setRows, 1)} onIncrease={() => increment(setRows, 20)} />
          <span className="dimension-separator">×</span>
          <DimensionStepper label="Columns" value={cols} onDecrease={() => decrement(setCols, 1)} onIncrease={() => increment(setCols, 20)} />
        </div>
        <div className="dimension-modal-footer">
          <button type="button" className="dimension-btn-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="dimension-btn-create" onClick={() => onSelect(rows, cols)}>
            Create {rows} × {cols} Table
          </button>
        </div>
      </div>
    </div>
  );
}

function DimensionStepper({ label, value, onDecrease, onIncrease }: {
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="dimension-input-group" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="dimension-stepper">
        <button type="button" onClick={onDecrease} disabled={value <= 1} aria-label={`Decrease ${label.toLowerCase()}`}>−</button>
        <span aria-live="polite">{value}</span>
        <button type="button" onClick={onIncrease} aria-label={`Increase ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}
