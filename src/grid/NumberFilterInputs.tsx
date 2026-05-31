export function NumberInput({
  value,
  onChange,
  placeholder = 'Enter number',
}: {
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 px-3 text-sm font-mono
        bg-white dark:bg-gray-800
        border border-gray-200 dark:border-gray-700 rounded-lg
        text-gray-900 dark:text-gray-100
        focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
        transition-all duration-150"
    />
  )
}

export function NumberRangeInput({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: {
  startValue: string | number
  endValue: string | number
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <input
        type="number"
        value={startValue}
        onChange={(e) => onStartChange(e.target.value)}
        placeholder="Min"
        className="w-full min-w-0 h-10 px-3 text-sm font-mono
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700 rounded-lg
          text-gray-900 dark:text-gray-100
          focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
          transition-all duration-150"
      />
      <span className="text-gray-400 text-sm shrink-0">to</span>
      <input
        type="number"
        value={endValue}
        onChange={(e) => onEndChange(e.target.value)}
        placeholder="Max"
        className="w-full min-w-0 h-10 px-3 text-sm font-mono
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700 rounded-lg
          text-gray-900 dark:text-gray-100
          focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
          transition-all duration-150"
      />
    </div>
  )
}
