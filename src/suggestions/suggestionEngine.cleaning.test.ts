import { describe, expect, it } from 'vitest'
import { generateSuggestions } from './engine'
import type { SuggestionEngineContext } from './engine'
import type { ColumnProfile, ColumnSchema, TableSchema } from '@/types'

describe('generateSuggestions - Cleaning', () => {
  const createContext = (
    columns: ColumnSchema[],
    columnProfiles: ColumnProfile[],
    rowCount = 20
  ): SuggestionEngineContext => ({
    tableId: 'test-table',
    tableName: 'test_table',
    schema: { columns } as TableSchema,
    profile: { columns: columnProfiles, rowCount },
  })

  it('generates whitespace trimming suggestion', () => {
    const columns: ColumnSchema[] = [
      { id: 'name', name: 'name', type: 'string', nullable: true },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'name',
        topValues: [
          { value: 'Laptop Pro ', count: 3 },
          { value: ' Mouse', count: 2 },
          { value: 'Keyboard', count: 5 },
        ],
        distinctCount: 10,
      } as ColumnProfile,
    ]

    const context = createContext(columns, profiles)
    const suggestions = generateSuggestions(context)

    const whitespaceSuggestion = suggestions.find(
      s => s.context.cleaningOperation?.type === 'trim'
    )
    expect(whitespaceSuggestion).toBeDefined()
    expect(whitespaceSuggestion?.title).toContain('whitespace')
  })

  it('generates case normalization suggestion for mixed case column', () => {
    const columns: ColumnSchema[] = [
      { id: 'category', name: 'category', type: 'string', nullable: true },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'category',
        topValues: [
          { value: 'Electronics', count: 5 },
          { value: 'electronics', count: 3 },
          { value: 'ELECTRONICS', count: 4 },
        ],
        distinctCount: 3,
      } as ColumnProfile,
    ]

    const context = createContext(columns, profiles)
    const suggestions = generateSuggestions(context)

    const caseSuggestion = suggestions.find(
      s => s.context.cleaningOperation?.type === 'normalize_case'
    )
    expect(caseSuggestion).toBeDefined()
    expect(caseSuggestion?.title).toContain('casing')
  })

  it('generates placeholder conversion suggestion', () => {
    const columns: ColumnSchema[] = [
      { id: 'notes', name: 'notes', type: 'string', nullable: true },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'notes',
        topValues: [
          { value: 'Good product', count: 5 },
          { value: 'N/A', count: 3 },
          { value: 'TBD', count: 2 },
          { value: 'null', count: 1 },
        ],
        distinctCount: 10,
      } as ColumnProfile,
    ]

    const context = createContext(columns, profiles)
    const suggestions = generateSuggestions(context)

    const placeholderSuggestion = suggestions.find(
      s => s.context.cleaningOperation?.type === 'nullify_placeholders'
    )
    expect(placeholderSuggestion).toBeDefined()
    expect(placeholderSuggestion?.title).toContain('placeholder')
  })

  it('does NOT generate case normalization for ID-like columns', () => {
    const columns: ColumnSchema[] = [
      { id: 'product_id', name: 'product_id', type: 'string', nullable: true },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'product_id',
        topValues: [
          { value: 'PROD001', count: 1 },
          { value: 'prod002', count: 1 },
          { value: 'Prod003', count: 1 },
        ],
        distinctCount: 20,
        isKeyCandidate: true,
      } as ColumnProfile,
    ]

    const context = createContext(columns, profiles)
    const suggestions = generateSuggestions(context)

    const caseSuggestion = suggestions.find(
      s => s.context.cleaningOperation?.type === 'normalize_case' &&
           s.context.columnId === 'product_id'
    )
    expect(caseSuggestion).toBeUndefined()
  })

  it('generates multiple cleaning suggestions for messy data', () => {
    const columns: ColumnSchema[] = [
      { id: 'product_name', name: 'product_name', type: 'string', nullable: true },
      { id: 'category', name: 'category', type: 'string', nullable: true },
      { id: 'status', name: 'status', type: 'string', nullable: true },
      { id: 'notes', name: 'notes', type: 'string', nullable: true },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'product_name',
        topValues: [
          { value: 'Laptop Pro ', count: 1 },
          { value: ' Wireless Mouse', count: 1 },
        ],
        distinctCount: 20,
      } as ColumnProfile,
      {
        columnId: 'category',
        topValues: [
          { value: 'Electronics', count: 5 },
          { value: 'electronics', count: 5 },
          { value: 'ELECTRONICS', count: 5 },
        ],
        distinctCount: 3,
      } as ColumnProfile,
      {
        columnId: 'status',
        topValues: [
          { value: 'Active', count: 8 },
          { value: 'active', count: 5 },
          { value: 'ACTIVE', count: 3 },
          { value: 'inactive', count: 2 },
        ],
        distinctCount: 4,
      } as ColumnProfile,
      {
        columnId: 'notes',
        topValues: [
          { value: 'Good', count: 5 },
          { value: 'N/A', count: 3 },
          { value: 'TBD', count: 2 },
          { value: 'null', count: 2 },
          { value: 'unknown', count: 1 },
        ],
        distinctCount: 10,
      } as ColumnProfile,
    ]

    const context = createContext(columns, profiles)
    const suggestions = generateSuggestions(context)
    const cleaningSuggestions = suggestions.filter(s => s.category === 'cleaning')

    expect(cleaningSuggestions.length).toBeGreaterThanOrEqual(4)

    const trimSuggestion = cleaningSuggestions.find(
      s => s.context.cleaningOperation?.type === 'trim'
    )
    expect(trimSuggestion).toBeDefined()

    const categoryCaseSuggestion = cleaningSuggestions.find(
      s => s.context.cleaningOperation?.type === 'normalize_case' &&
           s.context.columnId === 'category'
    )
    expect(categoryCaseSuggestion).toBeDefined()

    const statusCaseSuggestion = cleaningSuggestions.find(
      s => s.context.cleaningOperation?.type === 'normalize_case' &&
           s.context.columnId === 'status'
    )
    expect(statusCaseSuggestion).toBeDefined()

    const placeholderSuggestion = cleaningSuggestions.find(
      s => s.context.cleaningOperation?.type === 'nullify_placeholders'
    )
    expect(placeholderSuggestion).toBeDefined()
  })
})


