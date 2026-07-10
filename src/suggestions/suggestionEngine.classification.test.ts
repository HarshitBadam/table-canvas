import { describe, expect, it } from 'vitest'
import {
  classifyColumn,
  classifyNumericColumn,
  classifyStringColumn,
  isUniqueIdentifier,
} from './engine/classification'
import type { ColumnProfile, ColumnSchema } from '@/types'

describe('classifyColumn', () => {
  it('classifies sequential numeric ID as unique_identifier', () => {
    const col: ColumnSchema = { id: 'id', name: 'id', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'id', 
      distinctCount: 100, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1, 
      max: 100,
      stdDev: 28.87, // ≈ sqrt((100-1)^2/12) for uniform 1-100
      isKeyCandidate: true 
    }
    expect(classifyColumn(col, profile, 100)).toBe('unique_identifier')
  })

  it('classifies column named "user_id" as unique_identifier', () => {
    const col: ColumnSchema = { id: 'uid', name: 'user_id', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'uid', 
      distinctCount: 50, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyColumn(col, profile, 100)).toBe('unique_identifier')
  })

  it('classifies height data as continuous_numeric', () => {
    const col: ColumnSchema = { id: 'height', name: 'height', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'height', 
      distinctCount: 45, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 150, 
      max: 200,
      stdDev: 12.5,
      mean: 172 
    }
    expect(classifyColumn(col, profile, 100)).toBe('continuous_numeric')
  })

  it('classifies price data as continuous_numeric', () => {
    const col: ColumnSchema = { id: 'price', name: 'price', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'price', 
      distinctCount: 80, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 9.99, 
      max: 999.99,
      stdDev: 150.5,
      mean: 250 
    }
    expect(classifyColumn(col, profile, 100)).toBe('continuous_numeric')
  })

  it('classifies city as high_cardinality_cat', () => {
    const col: ColumnSchema = { id: 'city', name: 'city', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'city', 
      distinctCount: 50,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      topValues: [
        { value: 'New York', count: 15 },
        { value: 'Los Angeles', count: 12 },
        { value: 'Chicago', count: 10 },
      ]
    }
    expect(classifyColumn(col, profile, 100)).toBe('high_cardinality_cat')
  })

  it('classifies status as low_cardinality_cat', () => {
    const col: ColumnSchema = { id: 'status', name: 'status', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'status', 
      distinctCount: 3,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      topValues: [
        { value: 'Active', count: 60 },
        { value: 'Pending', count: 30 },
        { value: 'Inactive', count: 10 },
      ]
    }
    expect(classifyColumn(col, profile, 100)).toBe('low_cardinality_cat')
  })

  it('classifies category column as low_cardinality_cat', () => {
    const col: ColumnSchema = { id: 'cat', name: 'category', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'cat', 
      distinctCount: 5,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      topValues: [
        { value: 'Electronics', count: 30 },
        { value: 'Clothing', count: 25 },
        { value: 'Food', count: 20 },
        { value: 'Books', count: 15 },
        { value: 'Other', count: 10 },
      ]
    }
    expect(classifyColumn(col, profile, 100)).toBe('low_cardinality_cat')
  })

  it('classifies rating (1-5) as discrete_numeric', () => {
    const col: ColumnSchema = { id: 'rating', name: 'rating', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'rating', 
      distinctCount: 5, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1, 
      max: 5,
      stdDev: 1.2,
      mean: 3.5
    }
    expect(classifyColumn(col, profile, 100)).toBe('discrete_numeric')
  })

  it('classifies quantity counts as discrete_numeric', () => {
    const col: ColumnSchema = { id: 'qty', name: 'quantity', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'qty', 
      distinctCount: 8, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1, 
      max: 10,
      stdDev: 2.5
    }
    expect(classifyColumn(col, profile, 100)).toBe('discrete_numeric')
  })

  it('classifies date column as temporal', () => {
    const col: ColumnSchema = { id: 'created', name: 'created_at', type: 'date', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'created', 
      distinctCount: 90,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyColumn(col, profile, 100)).toBe('temporal')
  })

  it('classifies datetime column as temporal', () => {
    const col: ColumnSchema = { id: 'updated', name: 'updated_at', type: 'datetime', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'updated', 
      distinctCount: 100,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyColumn(col, profile, 100)).toBe('temporal')
  })

  it('classifies high-uniqueness string (names) as text', () => {
    const col: ColumnSchema = { id: 'name', name: 'customer_name', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'name', 
      distinctCount: 98, // 98% unique
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      topValues: [
        { value: 'John Smith', count: 2 },
        { value: 'Jane Doe', count: 1 },
      ]
    }
    expect(classifyColumn(col, profile, 100)).toBe('text')
  })

  it('classifies column with semantic id hint as unique_identifier', () => {
    const col: ColumnSchema = { 
      id: 'code', 
      name: 'product_code', 
      type: 'string', 
      nullable: false,
      semanticHints: ['id']
    }
    const profile: ColumnProfile = { 
      columnId: 'code', 
      distinctCount: 50,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyColumn(col, profile, 100)).toBe('unique_identifier')
  })
})

describe('isUniqueIdentifier', () => {
  it('returns true for column with isKeyCandidate flag', () => {
    const col: ColumnSchema = { id: 'pk', name: 'record_num', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'pk',
      distinctCount: 100,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      isKeyCandidate: true
    }
    expect(isUniqueIdentifier(col, profile, 100)).toBe(true)
  })

  it('returns false for regular numeric column', () => {
    const col: ColumnSchema = { id: 'price', name: 'price', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'price',
      distinctCount: 50,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 10,
      max: 500,
      stdDev: 100,
      isKeyCandidate: false
    }
    expect(isUniqueIdentifier(col, profile, 100)).toBe(false)
  })

  it('returns true for auto-increment like numeric (1 to N)', () => {
    const col: ColumnSchema = { id: 'idx', name: 'row_index', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'idx',
      distinctCount: 100,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1,
      max: 100,
      stdDev: 28.87 // uniform distribution stdDev
    }
    expect(isUniqueIdentifier(col, profile, 100)).toBe(true)
  })
})

describe('classifyNumericColumn', () => {
  it('returns discrete_numeric for small distinct count', () => {
    const col: ColumnSchema = { id: 'stars', name: 'stars', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'stars',
      distinctCount: 5, // Only 5 distinct values
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1,
      max: 5
    }
    expect(classifyNumericColumn(col, profile, 100)).toBe('discrete_numeric')
  })

  it('returns continuous_numeric for high distinct count', () => {
    const col: ColumnSchema = { id: 'revenue', name: 'revenue', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'revenue',
      distinctCount: 85,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1000,
      max: 100000,
      stdDev: 25000
    }
    expect(classifyNumericColumn(col, profile, 100)).toBe('continuous_numeric')
  })

  it('returns discrete_numeric for zero variance', () => {
    const col: ColumnSchema = { id: 'const', name: 'constant', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'const',
      distinctCount: 1,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 42,
      max: 42,
      stdDev: 0
    }
    expect(classifyNumericColumn(col, profile, 100)).toBe('discrete_numeric')
  })
})

describe('classifyStringColumn', () => {
  it('returns low_cardinality_cat for few distinct values', () => {
    const col: ColumnSchema = { id: 'status', name: 'status', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'status',
      distinctCount: 4,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyStringColumn(col, profile, 100)).toBe('low_cardinality_cat')
  })

  it('returns high_cardinality_cat for medium distinct values', () => {
    const col: ColumnSchema = { id: 'city', name: 'city', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'city',
      distinctCount: 40,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyStringColumn(col, profile, 100)).toBe('high_cardinality_cat')
  })

  it('returns text for near-unique values', () => {
    const col: ColumnSchema = { id: 'desc', name: 'description', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'desc',
      distinctCount: 97,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyStringColumn(col, profile, 100)).toBe('text')
  })
})

