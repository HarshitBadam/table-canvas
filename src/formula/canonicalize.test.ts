import { describe, expect, it } from 'vitest'
import { canonicalizeFormulaReferences } from './canonicalize'

const columns = [
  { id: 'col_revenue_1', name: 'Net revenue ($)' },
  { id: 'col_region_2', name: 'Sales region' },
]

describe('canonicalizeFormulaReferences', () => {
  it('rewrites readable references to stable IDs', () => {
    expect(
      canonicalizeFormulaReferences(
        '[Net revenue ($)] * 2 + LEN("[Sales region]")',
        columns,
      ),
    ).toEqual({
      success: true,
      formula: '[col_revenue_1] * 2 + LEN("[Sales region]")',
    })
  })

  it('is case-insensitive and leaves canonical references stable', () => {
    expect(
      canonicalizeFormulaReferences('[net REVENUE ($)] + [col_region_2]', columns),
    ).toEqual({
      success: true,
      formula: '[col_revenue_1] + [col_region_2]',
    })
  })

  it('returns a safe error for malformed or unknown references', () => {
    expect(canonicalizeFormulaReferences('[Net revenue ($)', columns)).toMatchObject({
      success: false,
      error: { message: 'Unclosed column reference' },
    })
    expect(canonicalizeFormulaReferences('[Missing]', columns)).toMatchObject({
      success: false,
      error: { message: 'Column not found: Missing' },
    })
  })
})
