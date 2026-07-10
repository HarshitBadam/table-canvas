import { describe, expect, it } from 'vitest'
import { evaluateFormula } from './evaluator'
import { createContext } from './evaluatorTestUtils'

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
    expect(result.value).toBe(14)
  })
  it('respects operator precedence - division before subtraction', () => {
    const result = evaluateFormula('20 - 12 / 4', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(17)
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
    expect(result.value).toBe(30)
  })
})

describe('evaluateFormula - Column References', () => {
  it('resolves column reference by name', () => {
    const result = evaluateFormula('[price]', createContext({ price: 100 }, [{ id: 'price', name: 'price', type: 'number' }]))
    expect(result.success).toBe(true)
    expect(result.value).toBe(100)
  })
  it('resolves column reference case-insensitively', () => {
    const result = evaluateFormula('[price]', createContext({ Price: 100 }, [{ id: 'Price', name: 'Price', type: 'number' }]))
    expect(result.success).toBe(true)
    expect(result.value).toBe(100)
  })
  it('resolves column by id', () => {
    const result = evaluateFormula('[col_1]', createContext({ col_1: 42 }, [{ id: 'col_1', name: 'Column One', type: 'number' }]))
    expect(result.success).toBe(true)
    expect(result.value).toBe(42)
  })
  it('computes formula with column references', () => {
    const context = createContext({ price: 100, quantity: 5 }, [
      { id: 'price', name: 'price', type: 'number' },
      { id: 'quantity', name: 'quantity', type: 'number' },
    ])
    const result = evaluateFormula('[price] * [quantity]', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(500)
  })
  it('computes complex formula with multiple columns', () => {
    const context = createContext({ price: 100, quantity: 5, discount: 10 }, [
      { id: 'price', name: 'price', type: 'number' },
      { id: 'quantity', name: 'quantity', type: 'number' },
      { id: 'discount', name: 'discount', type: 'number' },
    ])
    const result = evaluateFormula('[price] * [quantity] - [discount]', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(490)
  })
  it('returns null for null column values in arithmetic', () => {
    const result = evaluateFormula('[price] + 10', createContext({ price: null }, [{ id: 'price', name: 'price', type: 'number' }]))
    expect(result.success).toBe(true)
    expect(result.value).toBe(null)
  })
  it('returns null for empty string column values', () => {
    const result = evaluateFormula('[price] + 10', createContext({ price: '' }, [{ id: 'price', name: 'price', type: 'number' }]))
    expect(result.success).toBe(true)
    expect(result.value).toBe(null)
  })
  it('handles column names with spaces', () => {
    const result = evaluateFormula('[unit price] * 2', createContext({ 'unit price': 50 }, [{ id: 'unit price', name: 'unit price', type: 'number' }]))
    expect(result.success).toBe(true)
    expect(result.value).toBe(100)
  })
})

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
    const context = createContext({ first_name: 'John', last_name: 'Doe' }, [
      { id: 'first_name', name: 'first_name', type: 'string' },
      { id: 'last_name', name: 'last_name', type: 'string' },
    ])
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
    const context = createContext({ price: 100, threshold: 50 }, [
      { id: 'price', name: 'price', type: 'number' },
      { id: 'threshold', name: 'threshold', type: 'number' },
    ])
    expect(evaluateFormula('[price] > [threshold]', context).value).toBe(true)
  })
  it('returns boolean type for comparisons', () => {
    expect(evaluateFormula('5 > 3', createContext({})).inferredType).toBe('boolean')
  })
})
