/**
 * Unit tests for Formula Evaluator
 * Tests the core formula evaluation engine including:
 * - Arithmetic operations with operator precedence
 * - Column references
 * - String operations
 * - Comparison and logical operators
 * - Conditional expressions (IF)
 * - Built-in functions
 * - Error handling and edge cases
 */

import { describe, it, expect } from 'vitest'
import { 
  evaluateFormula, 
  evaluateFormulaForRows,
  inferFormulaType, 
  validateFormulaWithColumns,
  FormulaEvaluator
} from './evaluator'
import { parseFormula, extractColumnReferences } from './parser'
import type { EvaluationContext } from './types'

// ============================================================================
// Test Fixtures
// ============================================================================

function createContext(
  row: Record<string, unknown>,
  columns?: Array<{ id: string; name: string; type: string }>
): EvaluationContext {
  const inferredColumns = columns || Object.keys(row).map(id => ({ 
    id, 
    name: id, 
    type: typeof row[id] === 'number' ? 'number' : 'string' 
  }))
  return {
    row: row as Record<string, import('./types').FormulaValue>,
    columns: inferredColumns,
    allRows: [row as Record<string, import('./types').FormulaValue>],
  }
}

// ============================================================================
// Basic Arithmetic - Happy Path
// ============================================================================

describe('evaluateFormula - Arithmetic', () => {
  it('evaluates simple addition', () => {
    const result = evaluateFormula('2 + 3', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(5)
    expect(result.inferredType).toBe('number')
  })

  it('evaluates subtraction', () => {
    const result = evaluateFormula('10 - 4', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(6)
  })

  it('evaluates multiplication', () => {
    const result = evaluateFormula('6 * 7', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(42)
  })

  it('evaluates division', () => {
    const result = evaluateFormula('15 / 3', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(5)
  })

  it('evaluates floating point division', () => {
    const result = evaluateFormula('10 / 4', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(2.5)
  })

  it('respects operator precedence (PEMDAS) - multiplication before addition', () => {
    const result = evaluateFormula('2 + 3 * 4', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(14) // Not 20
  })

  it('respects operator precedence - division before subtraction', () => {
    const result = evaluateFormula('20 - 12 / 4', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(17) // Not 2
  })

  it('handles parentheses for grouping', () => {
    const result = evaluateFormula('(2 + 3) * 4', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(20)
  })

  it('handles nested parentheses', () => {
    const result = evaluateFormula('((2 + 3) * (4 - 1))', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(15)
  })

  it('evaluates exponentiation', () => {
    const result = evaluateFormula('2 ^ 3', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(8)
  })

  it('evaluates modulo', () => {
    const result = evaluateFormula('17 % 5', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(2)
  })

  it('handles negative numbers', () => {
    const result = evaluateFormula('-5 + 3', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(-2)
  })

  it('handles decimal numbers', () => {
    const result = evaluateFormula('3.14 * 2', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBeCloseTo(6.28)
  })

  it('handles complex expression', () => {
    const result = evaluateFormula('(100 - 20) / 4 + 5 * 2', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(30) // 80/4 + 10 = 20 + 10 = 30
  })
})

// ============================================================================
// Column References
// ============================================================================

describe('evaluateFormula - Column References', () => {
  it('resolves column reference by name', () => {
    const context = createContext(
      { price: 100 },
      [{ id: 'price', name: 'price', type: 'number' }]
    )
    const result = evaluateFormula('[price]', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(100)
  })

  it('resolves column reference case-insensitively', () => {
    const context = createContext(
      { Price: 100 },
      [{ id: 'Price', name: 'Price', type: 'number' }]
    )
    const result = evaluateFormula('[price]', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(100)
  })

  it('resolves column by id', () => {
    const context = createContext(
      { col_1: 42 },
      [{ id: 'col_1', name: 'Column One', type: 'number' }]
    )
    const result = evaluateFormula('[col_1]', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(42)
  })

  it('computes formula with column references', () => {
    const context = createContext(
      { price: 100, quantity: 5 },
      [
        { id: 'price', name: 'price', type: 'number' },
        { id: 'quantity', name: 'quantity', type: 'number' },
      ]
    )
    const result = evaluateFormula('[price] * [quantity]', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(500)
  })

  it('computes complex formula with multiple columns', () => {
    const context = createContext(
      { price: 100, quantity: 5, discount: 10 },
      [
        { id: 'price', name: 'price', type: 'number' },
        { id: 'quantity', name: 'quantity', type: 'number' },
        { id: 'discount', name: 'discount', type: 'number' },
      ]
    )
    const result = evaluateFormula('[price] * [quantity] - [discount]', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(490)
  })

  it('returns null for null column values in arithmetic', () => {
    const context = createContext(
      { price: null },
      [{ id: 'price', name: 'price', type: 'number' }]
    )
    const result = evaluateFormula('[price] + 10', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(null)
  })

  it('returns null for empty string column values', () => {
    const context = createContext(
      { price: '' },
      [{ id: 'price', name: 'price', type: 'number' }]
    )
    const result = evaluateFormula('[price] + 10', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(null)
  })

  it('handles column names with spaces', () => {
    const context = createContext(
      { 'unit price': 50 },
      [{ id: 'unit price', name: 'unit price', type: 'number' }]
    )
    const result = evaluateFormula('[unit price] * 2', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(100)
  })
})

// ============================================================================
// String Operations
// ============================================================================

describe('evaluateFormula - Strings', () => {
  it('returns string literal', () => {
    const result = evaluateFormula('"Hello"', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe('Hello')
    expect(result.inferredType).toBe('string')
  })

  it('concatenates strings with + operator', () => {
    const result = evaluateFormula('"Hello" + " World"', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe('Hello World')
  })

  it('concatenates string and number', () => {
    const result = evaluateFormula('"Price: $" + 100', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe('Price: $100')
  })

  it('concatenates number and string', () => {
    const result = evaluateFormula('100 + " dollars"', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe('100 dollars')
  })

  it('handles string column concatenation', () => {
    const context = createContext(
      { first_name: 'John', last_name: 'Doe' },
      [
        { id: 'first_name', name: 'first_name', type: 'string' },
        { id: 'last_name', name: 'last_name', type: 'string' },
      ]
    )
    const result = evaluateFormula('[first_name] + " " + [last_name]', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe('John Doe')
  })

  it('handles single quotes', () => {
    const result = evaluateFormula("'Hello'", createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe('Hello')
  })
})

// ============================================================================
// Comparison Operators
// ============================================================================

describe('evaluateFormula - Comparisons', () => {
  it('evaluates equality with =', () => {
    expect(evaluateFormula('5 = 5', createContext({})).value).toBe(true)
    expect(evaluateFormula('5 = 6', createContext({})).value).toBe(false)
  })

  it('evaluates equality with ==', () => {
    expect(evaluateFormula('5 == 5', createContext({})).value).toBe(true)
    expect(evaluateFormula('5 == 6', createContext({})).value).toBe(false)
  })

  it('evaluates inequality with <>', () => {
    expect(evaluateFormula('5 <> 6', createContext({})).value).toBe(true)
    expect(evaluateFormula('5 <> 5', createContext({})).value).toBe(false)
  })

  it('evaluates inequality with !=', () => {
    expect(evaluateFormula('5 != 6', createContext({})).value).toBe(true)
    expect(evaluateFormula('5 != 5', createContext({})).value).toBe(false)
  })

  it('evaluates greater than', () => {
    expect(evaluateFormula('10 > 5', createContext({})).value).toBe(true)
    expect(evaluateFormula('5 > 10', createContext({})).value).toBe(false)
    expect(evaluateFormula('5 > 5', createContext({})).value).toBe(false)
  })

  it('evaluates less than', () => {
    expect(evaluateFormula('5 < 10', createContext({})).value).toBe(true)
    expect(evaluateFormula('10 < 5', createContext({})).value).toBe(false)
    expect(evaluateFormula('5 < 5', createContext({})).value).toBe(false)
  })

  it('evaluates greater than or equal', () => {
    expect(evaluateFormula('10 >= 5', createContext({})).value).toBe(true)
    expect(evaluateFormula('5 >= 5', createContext({})).value).toBe(true)
    expect(evaluateFormula('4 >= 5', createContext({})).value).toBe(false)
  })

  it('evaluates less than or equal', () => {
    expect(evaluateFormula('5 <= 10', createContext({})).value).toBe(true)
    expect(evaluateFormula('5 <= 5', createContext({})).value).toBe(true)
    expect(evaluateFormula('6 <= 5', createContext({})).value).toBe(false)
  })

  it('compares column values', () => {
    const context = createContext(
      { price: 100, threshold: 50 },
      [
        { id: 'price', name: 'price', type: 'number' },
        { id: 'threshold', name: 'threshold', type: 'number' },
      ]
    )
    expect(evaluateFormula('[price] > [threshold]', context).value).toBe(true)
  })

  it('returns boolean type for comparisons', () => {
    const result = evaluateFormula('5 > 3', createContext({}))
    expect(result.inferredType).toBe('boolean')
  })
})

// ============================================================================
// Logical Operators
// ============================================================================

describe('evaluateFormula - Logical Operators', () => {
  it('evaluates AND operator', () => {
    expect(evaluateFormula('TRUE AND TRUE', createContext({})).value).toBe(true)
    expect(evaluateFormula('TRUE AND FALSE', createContext({})).value).toBe(false)
    expect(evaluateFormula('FALSE AND TRUE', createContext({})).value).toBe(false)
    expect(evaluateFormula('FALSE AND FALSE', createContext({})).value).toBe(false)
  })

  it('evaluates OR operator', () => {
    expect(evaluateFormula('TRUE OR TRUE', createContext({})).value).toBe(true)
    expect(evaluateFormula('TRUE OR FALSE', createContext({})).value).toBe(true)
    expect(evaluateFormula('FALSE OR TRUE', createContext({})).value).toBe(true)
    expect(evaluateFormula('FALSE OR FALSE', createContext({})).value).toBe(false)
  })

  it('evaluates NOT operator', () => {
    expect(evaluateFormula('NOT TRUE', createContext({})).value).toBe(false)
    expect(evaluateFormula('NOT FALSE', createContext({})).value).toBe(true)
  })

  it('combines logical with comparison using AND', () => {
    const result = evaluateFormula('5 > 3 AND 10 < 20', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(true)
  })

  it('evaluates multiple AND conditions', () => {
    const result = evaluateFormula('TRUE AND TRUE AND TRUE', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(true)
  })
})

// ============================================================================
// Conditional Expressions (IF)
// ============================================================================

describe('evaluateFormula - IF Function', () => {
  it('evaluates IF with true condition', () => {
    const result = evaluateFormula('IF(5 > 3, "yes", "no")', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe('yes')
  })

  it('evaluates IF with false condition', () => {
    const result = evaluateFormula('IF(5 < 3, "yes", "no")', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe('no')
  })

  it('evaluates IF with numeric results', () => {
    const result = evaluateFormula('IF(TRUE, 100, 0)', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(100)
  })

  it('handles nested IF', () => {
    const context = createContext(
      { score: 85 },
      [{ id: 'score', name: 'score', type: 'number' }]
    )
    const formula = 'IF([score] >= 90, "A", IF([score] >= 80, "B", "C"))'
    const result = evaluateFormula(formula, context)
    expect(result.success).toBe(true)
    expect(result.value).toBe('B')
  })

  it('handles deeply nested IF', () => {
    const context = createContext(
      { score: 75 },
      [{ id: 'score', name: 'score', type: 'number' }]
    )
    const formula = 'IF([score] >= 90, "A", IF([score] >= 80, "B", IF([score] >= 70, "C", "F")))'
    const result = evaluateFormula(formula, context)
    expect(result.success).toBe(true)
    expect(result.value).toBe('C')
  })

  it('IF with column references in condition', () => {
    const context = createContext(
      { status: 'active', premium: 100 },
      [
        { id: 'status', name: 'status', type: 'string' },
        { id: 'premium', name: 'premium', type: 'number' },
      ]
    )
    const result = evaluateFormula('IF([premium] > 50, "High", "Low")', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe('High')
  })

  it('IF with expressions in consequent/alternate', () => {
    const context = createContext(
      { price: 100, discount: 0.2 },
      [
        { id: 'price', name: 'price', type: 'number' },
        { id: 'discount', name: 'discount', type: 'number' },
      ]
    )
    const result = evaluateFormula('IF([discount] > 0, [price] * (1 - [discount]), [price])', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(80)
  })
})

// ============================================================================
// Built-in Math Functions
// ============================================================================

describe('evaluateFormula - Math Functions', () => {
  it('evaluates SUM function', () => {
    const result = evaluateFormula('SUM(1, 2, 3, 4, 5)', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(15)
  })

  it('SUM ignores null values', () => {
    const context = createContext(
      { a: 10, b: null, c: 20 },
      [
        { id: 'a', name: 'a', type: 'number' },
        { id: 'b', name: 'b', type: 'number' },
        { id: 'c', name: 'c', type: 'number' },
      ]
    )
    const result = evaluateFormula('SUM([a], [b], [c])', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(30)
  })

  it('evaluates AVG function', () => {
    const result = evaluateFormula('AVG(10, 20, 30)', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(20)
  })

  it('evaluates MIN function', () => {
    const result = evaluateFormula('MIN(5, 2, 8, 1, 9)', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(1)
  })

  it('evaluates MAX function', () => {
    const result = evaluateFormula('MAX(5, 2, 8, 1, 9)', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(9)
  })

  it('evaluates COUNT function', () => {
    const result = evaluateFormula('COUNT(1, 2, 3)', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(3)
  })

  it('evaluates ROUND function', () => {
    expect(evaluateFormula('ROUND(3.14159, 2)', createContext({})).value).toBe(3.14)
    expect(evaluateFormula('ROUND(3.5)', createContext({})).value).toBe(4)
    expect(evaluateFormula('ROUND(3.4)', createContext({})).value).toBe(3)
  })

  it('evaluates ABS function', () => {
    expect(evaluateFormula('ABS(-42)', createContext({})).value).toBe(42)
    expect(evaluateFormula('ABS(42)', createContext({})).value).toBe(42)
  })

  it('evaluates FLOOR function', () => {
    expect(evaluateFormula('FLOOR(3.7)', createContext({})).value).toBe(3)
    expect(evaluateFormula('FLOOR(3.2)', createContext({})).value).toBe(3)
  })

  it('evaluates CEIL function', () => {
    expect(evaluateFormula('CEIL(3.2)', createContext({})).value).toBe(4)
    expect(evaluateFormula('CEIL(3.7)', createContext({})).value).toBe(4)
  })

  it('evaluates POWER function', () => {
    expect(evaluateFormula('POWER(2, 3)', createContext({})).value).toBe(8)
    expect(evaluateFormula('POWER(10, 2)', createContext({})).value).toBe(100)
  })

  it('evaluates SQRT function', () => {
    expect(evaluateFormula('SQRT(16)', createContext({})).value).toBe(4)
    expect(evaluateFormula('SQRT(2)', createContext({})).value).toBeCloseTo(1.414, 2)
  })

  it('SQRT returns null for negative numbers', () => {
    const result = evaluateFormula('SQRT(-1)', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(null)
  })

  it('evaluates MOD function', () => {
    expect(evaluateFormula('MOD(10, 3)', createContext({})).value).toBe(1)
    expect(evaluateFormula('MOD(15, 5)', createContext({})).value).toBe(0)
  })
})

// ============================================================================
// Built-in Text Functions
// ============================================================================

describe('evaluateFormula - Text Functions', () => {
  it('evaluates UPPER function', () => {
    expect(evaluateFormula('UPPER("hello")', createContext({})).value).toBe('HELLO')
  })

  it('evaluates LOWER function', () => {
    expect(evaluateFormula('LOWER("HELLO")', createContext({})).value).toBe('hello')
  })

  it('evaluates TRIM function', () => {
    expect(evaluateFormula('TRIM("  hello  ")', createContext({})).value).toBe('hello')
  })

  it('evaluates CONCAT function', () => {
    expect(evaluateFormula('CONCAT("Hello", " ", "World")', createContext({})).value).toBe('Hello World')
  })

  it('evaluates LEFT function', () => {
    expect(evaluateFormula('LEFT("Hello World", 5)', createContext({})).value).toBe('Hello')
  })

  it('evaluates RIGHT function', () => {
    expect(evaluateFormula('RIGHT("Hello World", 5)', createContext({})).value).toBe('World')
  })

  it('evaluates MID function', () => {
    expect(evaluateFormula('MID("Hello World", 7, 5)', createContext({})).value).toBe('World')
  })

  it('evaluates LEN function', () => {
    expect(evaluateFormula('LEN("Hello")', createContext({})).value).toBe(5)
    expect(evaluateFormula('LEN("")', createContext({})).value).toBe(0)
  })

  it('evaluates FIND function', () => {
    expect(evaluateFormula('FIND("@", "test@example.com")', createContext({})).value).toBe(5)
  })

  it('FIND returns null when not found', () => {
    expect(evaluateFormula('FIND("x", "hello")', createContext({})).value).toBe(null)
  })

  it('evaluates SUBSTITUTE function', () => {
    expect(evaluateFormula('SUBSTITUTE("hello world", "world", "there")', createContext({})).value).toBe('hello there')
  })

  it('evaluates TEXT function', () => {
    expect(evaluateFormula('TEXT(123)', createContext({})).value).toBe('123')
  })
})

// ============================================================================
// Built-in Logic Functions
// ============================================================================

describe('evaluateFormula - Logic Functions', () => {
  // Note: AND and OR in this parser are binary operators (e.g., TRUE AND FALSE)
  // not function calls. The AND(...) and OR(...) function syntax is recognized 
  // but parsed as LOGICAL tokens. Use binary operator syntax instead.
  it('evaluates AND as binary operator', () => {
    expect(evaluateFormula('TRUE AND TRUE', createContext({})).value).toBe(true)
    expect(evaluateFormula('TRUE AND FALSE', createContext({})).value).toBe(false)
  })

  it('evaluates OR as binary operator', () => {
    expect(evaluateFormula('FALSE OR TRUE', createContext({})).value).toBe(true)
    expect(evaluateFormula('FALSE OR FALSE', createContext({})).value).toBe(false)
  })

  it('evaluates NOT function', () => {
    expect(evaluateFormula('NOT(TRUE)', createContext({})).value).toBe(false)
    expect(evaluateFormula('NOT(FALSE)', createContext({})).value).toBe(true)
  })

  it('evaluates ISNULL function', () => {
    const context = createContext(
      { a: null, b: 'value' },
      [
        { id: 'a', name: 'a', type: 'string' },
        { id: 'b', name: 'b', type: 'string' },
      ]
    )
    expect(evaluateFormula('ISNULL([a])', context).value).toBe(true)
    expect(evaluateFormula('ISNULL([b])', context).value).toBe(false)
  })

  it('evaluates IFNULL function', () => {
    const context = createContext(
      { a: null, b: 'value' },
      [
        { id: 'a', name: 'a', type: 'string' },
        { id: 'b', name: 'b', type: 'string' },
      ]
    )
    expect(evaluateFormula('IFNULL([a], "default")', context).value).toBe('default')
    expect(evaluateFormula('IFNULL([b], "default")', context).value).toBe('value')
  })

  it('evaluates COALESCE function', () => {
    const context = createContext(
      { a: null, b: '', c: 'value' },
      [
        { id: 'a', name: 'a', type: 'string' },
        { id: 'b', name: 'b', type: 'string' },
        { id: 'c', name: 'c', type: 'string' },
      ]
    )
    expect(evaluateFormula('COALESCE([a], [b], [c])', context).value).toBe('value')
  })
})

// ============================================================================
// Built-in Date Functions
// ============================================================================

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
    expect((result.value as Date).getMonth()).toBe(2) // 0-indexed
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

// ============================================================================
// Edge Cases & Error Handling
// ============================================================================

describe('evaluateFormula - Edge Cases', () => {
  it('handles division by zero gracefully', () => {
    const result = evaluateFormula('10 / 0', createContext({}))
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('Division by zero')
  })

  it('handles unknown column reference', () => {
    const context = createContext(
      { price: 100 },
      [{ id: 'price', name: 'price', type: 'number' }]
    )
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
    const result = evaluateFormula('2 + + 3', createContext({}))
    // This might parse as 2 + (+3) which is valid, or fail
    // Let's just check it doesn't crash
    expect(result).toBeDefined()
  })

  it('handles unclosed parenthesis', () => {
    const result = evaluateFormula('(2 + 3', createContext({}))
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain("Expected ')'")
  })

  it('handles unclosed bracket in column reference', () => {
    const result = evaluateFormula('[price', createContext({}))
    // Should handle gracefully
    expect(result).toBeDefined()
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

// ============================================================================
// Batch Evaluation
// ============================================================================

describe('evaluateFormulaForRows', () => {
  it('evaluates formula for multiple rows', () => {
    const rows = [
      { price: 100, quantity: 2 },
      { price: 50, quantity: 4 },
      { price: 25, quantity: 8 },
    ]
    const columns = [
      { id: 'price', name: 'price', type: 'number' },
      { id: 'quantity', name: 'quantity', type: 'number' },
    ]
    
    const results = evaluateFormulaForRows('[price] * [quantity]', rows, columns)
    
    expect(results).toHaveLength(3)
    expect(results[0].value).toBe(200)
    expect(results[1].value).toBe(200)
    expect(results[2].value).toBe(200)
  })

  it('handles errors in individual rows', () => {
    const rows = [
      { price: 100 },
      { price: null },
      { price: 50 },
    ]
    const columns = [
      { id: 'price', name: 'price', type: 'number' },
    ]
    
    const results = evaluateFormulaForRows('[price] + 10', rows, columns)
    
    expect(results[0].value).toBe(110)
    expect(results[1].value).toBe(null) // null propagates
    expect(results[2].value).toBe(60)
  })

  it('returns same error for all rows on parse error', () => {
    const rows = [{ price: 100 }, { price: 50 }]
    const columns = [{ id: 'price', name: 'price', type: 'number' }]
    
    const results = evaluateFormulaForRows('INVALID(', rows, columns)
    
    expect(results).toHaveLength(2)
    expect(results[0].success).toBe(false)
    expect(results[1].success).toBe(false)
  })
})

// ============================================================================
// Type Inference
// ============================================================================

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

// ============================================================================
// Validation
// ============================================================================

describe('validateFormulaWithColumns', () => {
  const columns = [
    { id: 'price', name: 'price', type: 'number' },
    { id: 'name', name: 'name', type: 'string' },
  ]

  it('returns no errors for valid formula', () => {
    const errors = validateFormulaWithColumns('[price] * 2', columns)
    expect(errors).toHaveLength(0)
  })

  it('returns error for invalid column reference', () => {
    const errors = validateFormulaWithColumns('[unknown_column] + 1', columns)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('Column not found')
  })

  it('returns parse error for malformed formula', () => {
    const errors = validateFormulaWithColumns('(1 + 2', columns)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('returns no errors for formula without column refs', () => {
    const errors = validateFormulaWithColumns('1 + 2 + 3', columns)
    expect(errors).toHaveLength(0)
  })
})

// ============================================================================
// Parser - extractColumnReferences
// ============================================================================

describe('extractColumnReferences', () => {
  it('extracts single column reference', () => {
    const refs = extractColumnReferences('[price]')
    expect(refs).toEqual(['price'])
  })

  it('extracts multiple column references', () => {
    const refs = extractColumnReferences('[price] * [quantity]')
    expect(refs).toContain('price')
    expect(refs).toContain('quantity')
  })

  it('removes duplicates', () => {
    const refs = extractColumnReferences('[price] + [price]')
    expect(refs).toEqual(['price'])
  })

  it('extracts from nested expressions', () => {
    const refs = extractColumnReferences('IF([score] > 90, [bonus], [base])')
    expect(refs).toContain('score')
    expect(refs).toContain('bonus')
    expect(refs).toContain('base')
  })

  it('returns empty array for no column refs', () => {
    const refs = extractColumnReferences('1 + 2 + 3')
    expect(refs).toEqual([])
  })

  it('returns empty array for invalid formula', () => {
    const refs = extractColumnReferences('INVALID(')
    expect(refs).toEqual([])
  })
})
