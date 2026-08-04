import { useState, useMemo } from 'react'
import { CellValue } from '@/types'

export function EnumMultiSelect({
  selectedValues,
  availableValues,
  onChange,
}: {
  selectedValues: string[]
  availableValues: CellValue[]
  onChange: (values: string[]) => void
}) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredValues = useMemo(() => {
    if (!searchTerm) return availableValues
    const term = searchTerm.toLowerCase()
    return availableValues.filter(v => String(v).toLowerCase().includes(term))
  }, [availableValues, searchTerm])

  const toggleValue = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter(v => v !== val))
    } else {
      onChange([...selectedValues, val])
    }
  }

  const selectAll = () => {
    const allValues = availableValues.map(v => String(v))
    onChange(allValues)
  }

  const clearAll = () => {
    onChange([])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search values"
            aria-label="Search available values"
            className="h-9 w-full rounded-md border border-border bg-surface-secondary pl-8 pr-3 text-sm text-text-primary
              placeholder:text-text-tertiary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/30"
          />
        </div>
        <button
          type="button"
          onClick={selectAll}
          className="rounded px-2 py-1 text-xs font-medium text-accent-text hover:bg-accent-green/10"
        >
          All
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-tertiary"
        >
          Clear
        </button>
      </div>

      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedValues.slice(0, 5).map((val) => (
            <span
              key={val}
              className="inline-flex items-center gap-1 px-2 py-0.5
                bg-accent-green/10 text-accent-text text-xs font-medium rounded-full"
            >
              {val}
              <button
                type="button"
                onClick={() => toggleValue(val)}
                aria-label={`Remove ${val}`}
                className="rounded-full p-0.5 transition-colors hover:bg-accent-green/15"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          {selectedValues.length > 5 && (
            <span className="px-2 py-0.5 text-xs text-text-secondary">
              +{selectedValues.length - 5} more
            </span>
          )}
        </div>
      )}

      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface">
        {filteredValues.length === 0 ? (
          <div className="p-3 text-center text-sm text-text-tertiary">
            No values found
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {filteredValues.map((val, i) => {
              const strVal = String(val)
              const isSelected = selectedValues.includes(strVal)
              return (
                <label
                  key={i}
                  className={`
                    flex items-center gap-2.5 px-3 py-2 cursor-pointer
                    transition-colors duration-100
                    ${isSelected ? 'bg-accent-green/10' : 'hover:bg-surface-secondary'}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleValue(strVal)}
                    className="h-4 w-4 cursor-pointer rounded border-border text-accent-green"
                  />
                  <span className={`text-sm ${isSelected ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>
                    {strVal}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
