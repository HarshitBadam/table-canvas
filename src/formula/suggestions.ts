import type { FormulaSuggestion } from './types'
import { namePatterns, normalizeColumnName } from './suggestionPatterns'
import type { ColumnInfo } from './suggestionPatterns'

export type { ColumnInfo } from './suggestionPatterns'

export function suggestFormulasFromName(
  columnName: string,
  existingColumns: ColumnInfo[]
): FormulaSuggestion[] {
  const suggestions: FormulaSuggestion[] = []
  
  if (!columnName || columnName.trim().length === 0) {
    return suggestions
  }

  const normalizedInput = normalizeColumnName(columnName)

  for (const pattern of namePatterns) {
    for (const regex of pattern.patterns) {
      if (regex.test(columnName) || regex.test(normalizedInput)) {
        const suggestion = pattern.generator(columnName, existingColumns)
        if (suggestion) {
          suggestions.push(suggestion)
        }
        break
      }
    }
  }

  const confidenceOrder = { high: 0, medium: 1, low: 2 }
  suggestions.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence])

  const seen = new Set<string>()
  return suggestions.filter(s => {
    if (seen.has(s.formula)) return false
    seen.add(s.formula)
    return true
  })
}
