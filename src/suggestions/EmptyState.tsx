export function EmptyState({ hasColumn, hasTable, category }: { hasColumn: boolean; hasTable: boolean; category?: string }) {
  const getEmptyStateContent = () => {
    if (!hasTable) {
      return {
        icon: (
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        ),
        title: 'No table selected',
        description: 'Select a table to see suggestions.',
      }
    }
    
    if (category === 'analysis') {
      return {
        icon: (
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
        title: 'No analysis suggestions',
        description: hasColumn 
          ? 'This column may not be suitable for charts. Try a categorical or numeric column.'
          : 'Add categorical and numeric columns to enable visualizations, or use the "Create Chart" button in the table view.',
      }
    }
    
    if (category === 'recipe') {
      return {
        icon: (
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        ),
        title: 'No recipe suggestions',
        description: 'Recipes help aggregate and transform data. Try adding group-by candidates like categorical columns.',
      }
    }
    
    return {
      icon: (
        <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      title: 'No suggestions available',
      description: hasColumn 
        ? 'No actions needed for this column.'
        : 'Your data looks clean! Import more data to see suggestions.',
    }
  }
  
  const content = getEmptyStateContent()
  
  return (
    <div className="text-center py-8 px-4 text-text-tertiary">
      {content.icon}
      <p className="text-sm font-medium text-text-secondary">{content.title}</p>
      <p className="text-xs mt-1 max-w-[250px] mx-auto">
        {content.description}
      </p>
    </div>
  )
}
