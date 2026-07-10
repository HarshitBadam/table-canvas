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

  it('suggests a count pie chart for a boolean column', () => {
    const columns: ColumnSchema[] = [
      { id: 'active', name: 'active', type: 'boolean', nullable: false },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'active',
        distinctCount: 2,
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        topValues: [
          { value: true, count: 70 },
          { value: false, count: 30 },
        ],
      },
    ]

    const suggestion = generateSuggestions(createContext(columns, profiles)).find(
      (item) => item.id.includes('boolean_breakdown'),
    )

    expect(suggestion?.action.kind).toBe('createChart')
    if (suggestion?.action.kind === 'createChart') {
      expect(suggestion.action.chart.chartType).toBe('pie')
      expect(suggestion.action.chart.config.aggregation).toBe('count')
    }
  })

  it('does not create a time-series chart using an ID as the metric', () => {
    const columns: ColumnSchema[] = [
      { id: 'date', name: 'date', type: 'date', nullable: false },
      { id: 'id', name: 'id', type: 'number', nullable: false },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'date',
        distinctCount: 30,
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
      },
      {
        columnId: 'id',
        distinctCount: 100,
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        isKeyCandidate: true,
        min: 1,
        max: 100,
        stdDev: 28.87,
      },
    ]

    const trend = generateSuggestions(createContext(columns, profiles)).find(
      (suggestion) => suggestion.id.includes('trend_chart'),
    )
    expect(trend).toBeUndefined()
  })

  it('does not suggest analysis for rows containing only null values', () => {
    const columns: ColumnSchema[] = [
      { id: 'name', name: 'name', type: 'string', nullable: true },
      { id: 'value', name: 'value', type: 'number', nullable: true },
    ]
    const profiles: ColumnProfile[] = columns.map((column) => ({
      columnId: column.id,
      distinctCount: 0,
      missingCount: 5,
      missingPercent: 100,
      completeness: 0,
      topValues: [],
    }))

    const suggestions = generateSuggestions(createContext(columns, profiles, 5))
    expect(suggestions.filter((suggestion) => suggestion.category === 'analysis')).toEqual([])
  })
})
