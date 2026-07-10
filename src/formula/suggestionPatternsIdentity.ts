import type { NamePattern } from './suggestionPatternTypes'
import { findColumn, normalizeColumnName } from './suggestionPatternTypes'

export const identityPatterns: NamePattern[] = [
  {
    patterns: [
      /^full[_\s]*name$/i,
      /^display[_\s]*name$/i,
      /^complete[_\s]*name$/i,
      /^name$/i,
    ],
    generator: (_, columns) => {
      const firstNameCol = findColumn(columns, ['first_name', 'firstname', 'fname', 'given_name'], 'string')
      const lastNameCol = findColumn(columns, ['last_name', 'lastname', 'lname', 'surname', 'family_name'], 'string')
      if (!firstNameCol || !lastNameCol) return null
      return {
        formula: `CONCAT([${firstNameCol.name}], " ", [${lastNameCol.name}])`,
        description: 'Combine first and last name',
        confidence: 'high',
        basedOn: [firstNameCol.name, lastNameCol.name],
      }
    },
  },
  {
    patterns: [
      /^age[_\s]*(group|category|bracket|range)$/i,
      /^(.+)[_\s]*(group|category|bracket|tier)$/i,
    ],
    generator: (columnName, columns) => {
      const normalized = normalizeColumnName(columnName)
      if (normalized.includes('age')) {
        const ageCol = findColumn(columns, ['age', 'years', 'years_old'], 'number')
        if (ageCol) {
          return {
            formula: `IF([${ageCol.name}] < 18, "Child", IF([${ageCol.name}] < 65, "Adult", "Senior"))`,
            description: 'Categorize by age: Child (<18), Adult (18-64), Senior (65+)',
            confidence: 'high',
            basedOn: [ageCol.name],
          }
        }
      }
      if (normalized.includes('income')) {
        const incomeCol = findColumn(columns, ['income', 'salary', 'earnings', 'revenue'], 'number')
        if (incomeCol) {
          return {
            formula: `IF([${incomeCol.name}] < 30000, "Low", IF([${incomeCol.name}] < 100000, "Medium", "High"))`,
            description: 'Categorize by income level',
            confidence: 'medium',
            basedOn: [incomeCol.name],
          }
        }
      }
      return null
    },
  },
]
