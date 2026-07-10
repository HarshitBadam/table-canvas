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
  return (
    <div
      role="tablist"
      aria-label="Suggestion categories"
      className="flex gap-1 overflow-x-auto px-4 py-2 border-b border-border bg-surface-secondary/50"
    >
      {(['all', 'cleaning', 'analysis', 'recipe'] as const).map((cat) => (
        <button
          key={cat}
          role="tab"
          aria-selected={activeCategory === cat}
          onClick={() => onCategoryChange(cat)}
          className={`
            px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
            ${
              activeCategory === cat
                ? 'bg-accent-green text-white shadow-sm'
                : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
            }
          `}
        >
          {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          <span className={`ml-1 ${activeCategory === cat ? 'opacity-80' : 'opacity-60'}`}>
            ({categoryCounts[cat]}{cat === 'cleaning' && isPhase2Loading ? '+' : ''})
          </span>
          {cat === 'cleaning' && isPhase2Loading && (
            <span className="ml-1 text-[10px] opacity-60" role="status">
              analyzing
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
