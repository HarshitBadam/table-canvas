interface OutputColumn {
  id: string
  colId: string
  name: string
  side: 'L' | 'R'
  table?: string
}

interface TransformOutputOptionsProps {
  operation: 'join' | 'union'
  columns: OutputColumn[]
  selected: Set<string>
  leftKey: string
  rightKey: string
  includedColumnCount: number
  outputName: string
  maxNameLength: number
  onToggleColumn: (id: string) => void
  onOutputNameChange: (name: string) => void
}

export function TransformOutputOptions({
  operation,
  columns,
  selected,
  leftKey,
  rightKey,
  includedColumnCount,
  outputName,
  maxNameLength,
  onToggleColumn,
  onOutputNameChange,
}: TransformOutputOptionsProps) {
  return (
    <details className="join-section border-t border-border-subtle pt-4">
      <summary className="canvas-touch-target cursor-pointer rounded-md text-sm font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
        <span className="ml-1 inline-flex items-center gap-2">
          <span>Output options</span>
          <span className="text-xs font-normal text-text-secondary">
            {operation === 'join' ? `${includedColumnCount} columns` : 'Optional'}
          </span>
        </span>
      </summary>

      <div className="mt-5 space-y-5">
        {operation === 'join' && (
          <section>
            <div className="join-section-header">
              <h3>Columns to Include</h3>
              <span className="join-cols-badge">
                {includedColumnCount} of {Math.max(0, columns.length - 1)}
              </span>
            </div>
            <div className="join-cols-grid">
              {columns.map(column => {
                const isKey = (column.side === 'L' && column.colId === leftKey)
                  || (column.side === 'R' && column.colId === rightKey)
                return (
                  <label
                    key={column.id}
                    className={`join-col-item ${selected.has(column.id) ? 'checked' : ''} ${isKey ? 'disabled' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(column.id)}
                      disabled={isKey}
                      onChange={() => onToggleColumn(column.id)}
                    />
                    <span className="join-col-checkbox">
                      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M2.5 6l2.5 2.5 4.5-5"/>
                      </svg>
                    </span>
                    <span className="join-col-info">
                      <span className="join-col-name">{column.name}</span>
                      <span className={`join-col-source ${column.side === 'L' ? 'left' : 'right'}`}>
                        {column.table}
                      </span>
                    </span>
                    {isKey && <span className="join-col-key-badge">Key</span>}
                  </label>
                )
              })}
            </div>
          </section>
        )}

        <div>
          <label className="mb-2 block text-xs font-semibold text-text-tertiary" htmlFor="join-output-name">
            Table Name
          </label>
          <input
            id="join-output-name"
            type="text"
            value={outputName}
            onChange={event => onOutputNameChange(event.target.value)}
            maxLength={maxNameLength}
            className="join-name-input"
            placeholder="Enter a table name"
          />
        </div>
      </div>
    </details>
  )
}
