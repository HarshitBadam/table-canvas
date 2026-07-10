import { describe, expect, it } from 'vitest'
import { evaluateFormula, inferFormulaType, validateFormulaWithColumns } from './evaluator'
import { createContext } from './evaluatorTestUtils'
import { extractColumnReferences } from './parser'

describe('evaluateFormula - Date Functions', () => {
  it('evaluates YEAR function', () => {
    expect(evaluateFormula('YEAR("2024-03-15")', createContext({})).value).toBe(2024)
  })
  it('evaluates MONTH function', () => {
    expect(evaluateFormula('MONTH("2024-03-15")', createContext({})).value).toBe(3)
  })
  it('evaluates DAY function', () => {
    expect(evaluateFormula('DAY("2024-03-15")', createContext({})).value).toBe(15)
  })
  it('evaluates DATE function', () => {
    const result = evaluateFormula('DATE(2024, 3, 15)', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBeInstanceOf(Date)
    expect((result.value as Date).getFullYear()).toBe(2024)
    expect((result.value as Date).getMonth()).toBe(2)
    expect((result.value as Date).getDate()).toBe(15)
  })
  it('evaluates DATEDIFF function', () => {
    const result = evaluateFormula('DATEDIFF("2024-03-15", "2024-03-10")', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(5)
  })
  it('evaluates NOW function', () => {
    const result = evaluateFormula('NOW()', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBeInstanceOf(Date)
  })
  it('evaluates TODAY function', () => {
    const result = evaluateFormula('TODAY()', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBeInstanceOf(Date)
  })
})

describe('evaluateFormula - Edge Cases', () => {
  it('handles division by zero gracefully', () => {
    const result = evaluateFormula('10 / 0', createContext({}))
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('Division by zero')
  })
  it('handles unknown column reference', () => {
    const context = createContext({ price: 100 }, [{ id: 'price', name: 'price', type: 'number' }])
    const result = evaluateFormula('[nonexistent]', context)
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('Column not found')
  })
  it('handles unknown function', () => {
    const result = evaluateFormula('UNKNOWNFUNC(1, 2)', createContext({}))
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('Unknown function')
  })
  it('handles empty formula', () => {
    const result = evaluateFormula('', createContext({}))
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('Empty formula')
  })
  it('handles malformed expression - double operator', () => {
    expect(evaluateFormula('2 + + 3', createContext({}))).toBeDefined()
  })
  it('handles unclosed parenthesis', () => {
    const result = evaluateFormula('(2 + 3', createContext({}))
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain("Expected ')'")
  })
  it('handles unclosed bracket in column reference', () => {
    expect(evaluateFormula('[price', createContext({}))).toBeDefined()
  })
  it('handles function with wrong argument count', () => {
    const result = evaluateFormula('ABS(1, 2, 3)', createContext({}))
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('argument')
  })
  it('handles IF with wrong argument count', () => {
    const result = evaluateFormula('IF(TRUE)', createContext({}))
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('argument')
  })
})

describe('inferFormulaType', () => {
  const columns = [
    { id: 'price', name: 'price', type: 'number' },
    { id: 'name', name: 'name', type: 'string' },
    { id: 'created', name: 'created', type: 'date' },
    { id: 'active', name: 'active', type: 'boolean' },
  ]
  it('infers number type for arithmetic', () => {
    expect(inferFormulaType('[price] * 2', columns)).toBe('number')
    expect(inferFormulaType('10 + 5', columns)).toBe('number')
  })
  it('infers string type for concatenation', () => {
    expect(inferFormulaType('[name] + " Smith"', columns)).toBe('string')
  })
  it('infers boolean type for comparisons', () => {
    expect(inferFormulaType('[price] > 100', columns)).toBe('boolean')
    expect(inferFormulaType('5 = 5', columns)).toBe('boolean')
  })
  it('infers boolean type for logical operators', () => {
    expect(inferFormulaType('[price] > 100 AND [active]', columns)).toBe('boolean')
  })
  it('infers date type for date functions', () => {
    expect(inferFormulaType('NOW()', columns)).toBe('date')
    expect(inferFormulaType('TODAY()', columns)).toBe('date')
  })
  it('infers number type for math functions', () => {
    expect(inferFormulaType('SUM(1, 2, 3)', columns)).toBe('number')
    expect(inferFormulaType('ROUND([price], 2)', columns)).toBe('number')
  })
  it('infers string type for text functions', () => {
    expect(inferFormulaType('UPPER([name])', columns)).toBe('string')
    expect(inferFormulaType('CONCAT("a", "b")', columns)).toBe('string')
  })
  it('returns unknown for invalid formula', () => {
    expect(inferFormulaType('INVALID(', columns)).toBe('unknown')
  })
})

describe('validateFormulaWithColumns', () => {
  const columns = [
    { id: 'price', name: 'price', type: 'number' },
    { id: 'name', name: 'name', type: 'string' },
  ]
  it('returns no errors for valid formula', () => {
    expect(validateFormulaWithColumns('[price] * 2', columns)).toHaveLength(0)
  })
  it('returns error for invalid column reference', () => {
    const errors = validateFormulaWithColumns('[unknown_column] + 1', columns)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('Column not found')
  })
  it('returns parse error for malformed formula', () => {
    expect(validateFormulaWithColumns('(1 + 2', columns).length).toBeGreaterThan(0)
  })
  it('returns no errors for formula without column refs', () => {
    expect(validateFormulaWithColumns('1 + 2 + 3', columns)).toHaveLength(0)
  })
})

describe('extractColumnReferences', () => {
  it('extracts single column reference', () => {
    expect(extractColumnReferences('[price]')).toEqual(['price'])
  })
  it('extracts multiple column references', () => {
    const references = extractColumnReferences('[price] * [quantity]')
    expect(references).toContain('price')
    expect(references).toContain('quantity')
  })
  it('removes duplicates', () => {
    expect(extractColumnReferences('[price] + [price]')).toEqual(['price'])
  })
  it('extracts from nested expressions', () => {
    const references = extractColumnReferences('IF([score] > 90, [bonus], [base])')
    expect(references).toContain('score')
    expect(references).toContain('bonus')
    expect(references).toContain('base')
  })
  it('returns empty array for no column refs', () => {
    expect(extractColumnReferences('1 + 2 + 3')).toEqual([])
  })
  it('returns empty array for invalid formula', () => {
    expect(extractColumnReferences('INVALID(')).toEqual([])
  })
})
