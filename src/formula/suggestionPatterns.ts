import { financialPatterns } from './suggestionPatternsFinancial'
import { identityPatterns } from './suggestionPatternsIdentity'
import { metricPatterns } from './suggestionPatternsMetrics'
import { utilityPatterns } from './suggestionPatternsUtility'
import type { NamePattern } from './suggestionPatternTypes'

export type { ColumnInfo } from './suggestionPatternTypes'
export { normalizeColumnName } from './suggestionPatternTypes'

export const namePatterns: NamePattern[] = [
  ...financialPatterns,
  ...identityPatterns,
  ...metricPatterns,
  ...utilityPatterns,
]
