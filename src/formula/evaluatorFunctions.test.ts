import { describe, expect, it } from 'vitest'
import { evaluateFormula } from './evaluator'
import { createContext } from './evaluatorTestUtils'

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
    const context = createContext({ score: 85 }, [{ id: 'score', name: 'score', type: 'number' }])
    const result = evaluateFormula('IF([score] >= 90, "A", IF([score] >= 80, "B", "C"))', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe('B')
  })
  it('handles deeply nested IF', () => {
    const context = createContext({ score: 75 }, [{ id: 'score', name: 'score', type: 'number' }])
    const result = evaluateFormula('IF([score] >= 90, "A", IF([score] >= 80, "B", IF([score] >= 70, "C", "F")))', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe('C')
  })
  it('IF with column references in condition', () => {
    const context = createContext({ status: 'active', premium: 100 }, [
      { id: 'status', name: 'status', type: 'string' },
      { id: 'premium', name: 'premium', type: 'number' },
    ])
    const result = evaluateFormula('IF([premium] > 50, "High", "Low")', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe('High')
  })
  it('IF with expressions in consequent/alternate', () => {
    const context = createContext({ price: 100, discount: 0.2 }, [
      { id: 'price', name: 'price', type: 'number' },
      { id: 'discount', name: 'discount', type: 'number' },
    ])
    const result = evaluateFormula('IF([discount] > 0, [price] * (1 - [discount]), [price])', context)
    expect(result.success).toBe(true)
    expect(result.value).toBe(80)
  })
})

describe('evaluateFormula - Math Functions', () => {
  it('evaluates SUM function', () => {
    const result = evaluateFormula('SUM(1, 2, 3, 4, 5)', createContext({}))
    expect(result.success).toBe(true)
    expect(result.value).toBe(15)
  })
  it('SUM ignores null values', () => {
    const context = createContext({ a: 10, b: null, c: 20 }, [
      { id: 'a', name: 'a', type: 'number' },
      { id: 'b', name: 'b', type: 'number' },
      { id: 'c', name: 'c', type: 'number' },
    ])
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

describe('evaluateFormula - Logic Functions', () => {
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
    const context = createContext({ a: null, b: 'value' }, [
      { id: 'a', name: 'a', type: 'string' },
      { id: 'b', name: 'b', type: 'string' },
    ])
    expect(evaluateFormula('ISNULL([a])', context).value).toBe(true)
    expect(evaluateFormula('ISNULL([b])', context).value).toBe(false)
  })
  it('evaluates IFNULL function', () => {
    const context = createContext({ a: null, b: 'value' }, [
      { id: 'a', name: 'a', type: 'string' },
      { id: 'b', name: 'b', type: 'string' },
    ])
    expect(evaluateFormula('IFNULL([a], "default")', context).value).toBe('default')
    expect(evaluateFormula('IFNULL([b], "default")', context).value).toBe('value')
  })
  it('evaluates COALESCE function', () => {
    const context = createContext({ a: null, b: '', c: 'value' }, [
      { id: 'a', name: 'a', type: 'string' },
      { id: 'b', name: 'b', type: 'string' },
      { id: 'c', name: 'c', type: 'string' },
    ])
    expect(evaluateFormula('COALESCE([a], [b], [c])', context).value).toBe('value')
  })
})
