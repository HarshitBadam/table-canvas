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
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="w-full h-8 pl-8 pr-3 text-sm
              bg-white dark:bg-gray-800
              border border-gray-200 dark:border-gray-700 rounded-md
              text-gray-900 dark:text-gray-100 placeholder:text-gray-400
              focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
              transition-all duration-150"
          />
        </div>
        <button
          onClick={selectAll}
          className="px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded"
        >
          All
        </button>
        <button
          onClick={clearAll}
          className="px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
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
                bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium rounded-full"
            >
              {val}
              <button
                onClick={() => toggleValue(val)}
                className="hover:bg-emerald-200 dark:hover:bg-emerald-800 rounded-full p-0.5 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          {selectedValues.length > 5 && (
            <span className="px-2 py-0.5 text-xs text-gray-500">
              +{selectedValues.length - 5} more
            </span>
          )}
        </div>
      )}

      <div className="max-h-[160px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
        {filteredValues.length === 0 ? (
          <div className="p-3 text-center text-sm text-gray-400">
            No values found
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredValues.map((val, i) => {
              const strVal = String(val)
              const isSelected = selectedValues.includes(strVal)
              return (
                <label
                  key={i}
                  className={`
                    flex items-center gap-2.5 px-3 py-2 cursor-pointer
                    transition-colors duration-100
                    ${isSelected ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleValue(strVal)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                      text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0
                      cursor-pointer"
                  />
                  <span className={`text-sm ${isSelected ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
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
