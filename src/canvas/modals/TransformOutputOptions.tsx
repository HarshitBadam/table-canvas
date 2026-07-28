interface OutputColumn {
  id: string
  colId: string
  name: string
  side: 'L' | 'R'
  table?: string
  sourceTone: 'source' | 'derived'
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
    <section className="join-section">
      <div className="space-y-5">
        {operation === 'join' && (
          <div className="join-output-subsection">
            <div className="join-section-header">
              <h4 className="join-subsection-label">Columns to Include</h4>
              <span className="join-cols-badge">
                {includedColumnCount} of {Math.max(0, columns.length - 1)}
              </span>
            </div>
            <div className="join-cols-grid">
              {columns.map(column => {
                const isKey = (column.side === 'L' && column.colId === leftKey)
                  || (column.side === 'R' && column.colId === rightKey)
                return (
                  <button
                    key={column.id}
                    type="button"
                    disabled={isKey}
                    aria-pressed={selected.has(column.id)}
                    onClick={() => onToggleColumn(column.id)}
                    className={`join-col-item ${selected.has(column.id) ? 'active' : ''} ${isKey ? 'disabled' : ''}`}
                  >
                    <span className="join-col-info">
                      <span className="join-col-name">{column.name}</span>
                      <span className={`join-col-source ${column.sourceTone}`}>
                        {column.table}
                      </span>
                    </span>
                    {isKey && <span className="join-col-key-badge">Key</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="join-output-subsection">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-tertiary" htmlFor="join-output-name">
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
    </section>
  )
}
