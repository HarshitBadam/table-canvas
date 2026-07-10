import { describe, expect, it } from 'vitest'
import { generateSuggestions } from './engine'
import type { SuggestionEngineContext } from './engine'
import type { ColumnProfile, ColumnSchema, TableSchema } from '@/types'

describe('analysis suggestions use classification', () => {
  const createContext = (
    columns: ColumnSchema[],
    columnProfiles: ColumnProfile[],
    rowCount = 100
  ): SuggestionEngineContext => ({
    tableId: 'test-table',
    tableName: 'test_table',
    schema: { columns } as TableSchema,
    profile: { columns: columnProfiles, rowCount },
  })

  it('does NOT suggest histogram for ID column', () => {
    const columns: ColumnSchema[] = [
      { id: 'id', name: 'id', type: 'number', nullable: false },
    ]
    const profiles: ColumnProfile[] = [
      { 
        columnId: 'id', 
        distinctCount: 100, 
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        isKeyCandidate: true, 
        min: 1, 
        max: 100,
        stdDev: 28.87
      },
    ]

    const context = createContext(columns, profiles, 100)
    const suggestions = generateSuggestions(context)
    
    const histogram = suggestions.find(s => s.title.includes('Distribution of id'))
    expect(histogram).toBeUndefined()
  })

  it('suggests histogram for continuous numeric column', () => {
    const columns: ColumnSchema[] = [
      { id: 'height', name: 'height', type: 'number', nullable: false },
    ]
    const profiles: ColumnProfile[] = [
      { 
        columnId: 'height', 
        distinctCount: 45, 
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        min: 150, 
        max: 200, 
        stdDev: 12.5 
      },
    ]

    const context = createContext(columns, profiles, 100)
    const suggestions = generateSuggestions(context)
    
    const histogram = suggestions.find(s => s.title.includes('Distribution of height'))
    expect(histogram).toBeDefined()
  })

  it('suggests category breakdown for low cardinality categorical + numeric', () => {
    const columns: ColumnSchema[] = [
      { id: 'status', name: 'status', type: 'string', nullable: false },
      { id: 'amount', name: 'amount', type: 'number', nullable: false },
    ]
    const profiles: ColumnProfile[] = [
      { 
        columnId: 'status', 
        distinctCount: 3,
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        topValues: [
          { value: 'Active', count: 50 },
          { value: 'Pending', count: 30 },
          { value: 'Inactive', count: 20 },
        ]
      },
      { 
        columnId: 'amount', 
        distinctCount: 80,
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        min: 100, 
        max: 10000, 
        stdDev: 2500 
      },
    ]

    const context = createContext(columns, profiles, 100)
    const suggestions = generateSuggestions(context)
    
    const breakdown = suggestions.find(s => 
      s.title.includes('amount') && s.title.includes('status')
    )
    expect(breakdown).toBeDefined()
  })

  it('does NOT suggest chart for ID + unique text columns only', () => {
    const columns: ColumnSchema[] = [
      { id: 'id', name: 'id', type: 'number', nullable: false },
      { id: 'name', name: 'customer_name', type: 'string', nullable: false },
    ]
    const profiles: ColumnProfile[] = [
      { 
        columnId: 'id', 
        distinctCount: 100,
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        isKeyCandidate: true,
        min: 1, 
        max: 100,
        stdDev: 28.87
      },
      { 
        columnId: 'name', 
        distinctCount: 98, // Near-unique
        missingCount: 0,
        missingPercent: 0,
        completeness: 100
      },
    ]

    const context = createContext(columns, profiles, 100)
    const suggestions = generateSuggestions(context)
    
    // Should not have any analysis suggestions since both columns are unsuitable
    const analysisSuggestions = suggestions.filter(s => s.category === 'analysis')
    expect(analysisSuggestions.length).toBe(0)
  })
})
