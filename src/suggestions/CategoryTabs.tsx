import type { SuggestionCategory } from '@/types'

type ActiveCategory = SuggestionCategory | 'all'

interface CategoryCounts {
  all: number
  cleaning: number
  analysis: number
  recipe: number
}

interface CategoryTabsProps {
  activeCategory: ActiveCategory
  onCategoryChange: (cat: ActiveCategory) => void
  categoryCounts: CategoryCounts
  isPhase2Loading: boolean
}

export function CategoryTabs({
  activeCategory,
  onCategoryChange,
  categoryCounts,
  isPhase2Loading,
}: CategoryTabsProps) {
  const categories = ['all', 'cleaning', 'analysis', 'recipe'] as const

  return (
    <div
      role="tablist"
      aria-label="Suggestion categories"
      className="flex gap-1 overflow-x-auto px-4 py-2 border-b border-border bg-surface-secondary/50"
    >
      {categories.map((cat, index) => (
        <button
          key={cat}
          id={`suggestion-tab-${cat}`}
          role="tab"
          aria-controls="suggestion-category-panel"
          aria-selected={activeCategory === cat}
          tabIndex={activeCategory === cat ? 0 : -1}
          onClick={() => onCategoryChange(cat)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            const direction = event.key === 'ArrowRight' ? 1 : -1
            const next = categories[(index + direction + categories.length) % categories.length]
            onCategoryChange(next)
            document.getElementById(`suggestion-tab-${next}`)?.focus()
          }}
          className={`
            px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
            ${
              activeCategory === cat
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-text-primary hover:bg-surface-tertiary'
            }
          `}
        >
          {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          <span className="ml-1">
            ({categoryCounts[cat]}{cat === 'cleaning' && isPhase2Loading ? '+' : ''})
          </span>
          {cat === 'cleaning' && isPhase2Loading && (
            <span className="ml-1 text-[10px]" role="status">
              analyzing
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
