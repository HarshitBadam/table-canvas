import { describe, expect, it } from 'vitest'
import {
  CONTENT_WIDTH,
  LANDSCAPE_CONTENT_WIDTH,
  TABLE_FIT_CANDIDATES,
} from '@/report/pdf/theme'
import { bandLabel, fitTable, omittedNote } from './tableFit'

const PDF_OPTIONS = {
  portraitWidth: CONTENT_WIDTH,
  landscapeWidth: LANDSCAPE_CONTENT_WIDTH,
  allowBanding: true,
  candidates: TABLE_FIT_CANDIDATES,
}

function columns(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`)
}

function numericRows(rowCount: number, columnCount: number): string[][] {
  return Array.from({ length: rowCount }, (_, row) => (
    Array.from({ length: columnCount }, (_, column) => `${(row + 1) * (column + 1) * 37}`)
  ))
}

/** Total page width a band consumes, including padding and rules. */
function bandWidth(widths: number[], paddingX: number): number {
  const content = widths.reduce((carry, width) => carry + width, 0)
  return content + widths.length * 2 * paddingX + (widths.length + 1) * 0.75
}

describe('table fitting', () => {
  it('keeps an ordinary table portrait at full size', () => {
    const { plan } = fitTable(
      ['Region', 'Units', 'Revenue'],
      [['North America', '1240', '48,300'], ['EMEA', '910', '32,110']],
      PDF_OPTIONS,
    )

    expect(plan.fontSize).toBe(9)
    expect(plan.landscape).toBe(false)
    expect(plan.bands).toHaveLength(1)
    expect(plan.omitted).toEqual([])
    expect(plan.breakAnywhere).toBe(false)
    expect(bandWidth(plan.bands[0].widths, plan.paddingX)).toBeLessThanOrEqual(CONTENT_WIDTH + 0.5)
  })

  it('gives a fixed-width column its own width instead of an equal share', () => {
    const { plan } = fitTable(
      ['Qty', 'Description'],
      [
        ['7', 'Reinforced aluminium mounting bracket with powder coating'],
        ['12', 'Replacement gasket set for the mark three pressure housing'],
      ],
      PDF_OPTIONS,
    )

    const [qty, description] = plan.bands[0].widths
    expect(qty).toBeLessThan(description / 3)
  })

  it('fits twenty numeric columns on a landscape page without splitting', () => {
    const { plan } = fitTable(columns(20, 'M'), numericRows(30, 20), PDF_OPTIONS)

    expect(plan.bands).toHaveLength(1)
    expect(plan.landscape).toBe(true)
    expect(plan.fontSize).toBeGreaterThanOrEqual(8)
    expect(plan.omitted).toEqual([])
    expect(bandWidth(plan.bands[0].widths, plan.paddingX))
      .toBeLessThanOrEqual(LANDSCAPE_CONTENT_WIDTH + 0.5)
  })

  it('splits a genuinely wide table into bands that each fit the page', () => {
    const headers = ['Order ID', ...columns(19, 'Attribute')]
    const rows = Array.from({ length: 12 }, (_, row) => [
      `ORD-${1000 + row}`,
      ...Array.from({ length: 19 }, (_, column) => `Value ${column} for order ${row} pending review`),
    ])

    const { plan } = fitTable(headers, rows, PDF_OPTIONS)

    expect(plan.bands.length).toBeGreaterThan(1)
    expect(plan.fontSize).toBe(8)
    for (const band of plan.bands) {
      expect(bandWidth(band.widths, plan.paddingX))
        .toBeLessThanOrEqual(LANDSCAPE_CONTENT_WIDTH + 0.5)
    }
  })

  it('repeats the key column in every band but the first, in order', () => {
    const headers = ['Order ID', ...columns(19, 'Attribute')]
    const rows = Array.from({ length: 12 }, (_, row) => [
      `ORD-${1000 + row}`,
      ...Array.from({ length: 19 }, (_, column) => `Value ${column} for order ${row} pending review`),
    ])

    const { plan } = fitTable(headers, rows, PDF_OPTIONS)

    expect(plan.bands[0].repeatedKey).toBeNull()
    for (const band of plan.bands.slice(1)) {
      expect(band.repeatedKey).toBe(0)
      expect(band.columns[0]).toBe(0)
    }

    // Every column appears exactly once outside the repeats, in original order.
    const own = plan.bands.flatMap((band, index) => (
      index === 0 ? band.columns : band.columns.slice(1)
    ))
    expect(own).toEqual([...own].sort((a, b) => a - b))
    expect(new Set(own).size).toBe(own.length)
  })

  it('never renders below the legibility floor', () => {
    const floor = TABLE_FIT_CANDIDATES[TABLE_FIT_CANDIDATES.length - 1].fontSize
    const headers = columns(40, 'Field')
    const rows = Array.from({ length: 5 }, () => (
      Array.from({ length: 40 }, () => 'a fairly long descriptive value here')
    ))

    const { plan } = fitTable(headers, rows, PDF_OPTIONS)
    expect(plan.fontSize).toBe(floor)
  })

  it('drops columns only after the band ceiling, and names them', () => {
    const headers = columns(40, 'Field')
    const rows = Array.from({ length: 5 }, () => (
      Array.from({ length: 40 }, () => 'a fairly long descriptive value here')
    ))

    const { plan } = fitTable(headers, rows, PDF_OPTIONS)
    expect(plan.bands.length).toBeLessThanOrEqual(3)
    expect(plan.omitted.length).toBeGreaterThan(0)
    expect(omittedNote(plan.omitted, headers)).toContain('omitted to fit the page')
  })

  it('labels bands so a split table cannot be mistaken for the whole one', () => {
    const headers = ['ID', ...columns(19, 'Attribute')]
    const band = { columns: [0, 10, 11], widths: [10, 10, 10], repeatedKey: 0, range: [11, 12] as [number, number] }

    expect(bandLabel(band, 1, 2, 20, 'ID')).toBe('Columns 11–12 of 20 · “ID” repeated')
    expect(bandLabel(band, 0, 1, 20, headers[0])).toBeUndefined()
  })

  it('lets a scrolling medium overflow instead of banding', () => {
    const headers = columns(20, 'Attribute')
    const rows = Array.from({ length: 10 }, () => (
      Array.from({ length: 20 }, () => 'a reasonably long cell value')
    ))

    const { plan } = fitTable(headers, rows, {
      portraitWidth: 760,
      allowBanding: false,
      candidates: TABLE_FIT_CANDIDATES,
    })

    expect(plan.bands).toHaveLength(1)
    expect(plan.overflow).toBe(true)
    expect(bandWidth(plan.bands[0].widths, plan.paddingX)).toBeGreaterThan(760)
  })

  it('handles a table with no rows', () => {
    const { plan } = fitTable(['A', 'B'], [], PDF_OPTIONS)
    expect(plan.bands).toHaveLength(1)
    expect(plan.bands[0].widths).toHaveLength(2)
  })
})
