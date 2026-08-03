/**
 * Column width measurement in `em`, shared by PDF and HTML exporters.
 *
 * Approximate Roboto advances are used because real font metrics are only
 * available once pdfmake has loaded; `SAFETY` absorbs the few-percent error.
 */

export interface ColumnMetric {
  /** Single-line width at the chosen percentile of sampled rows. */
  naturalEm: number
  /** Narrowest width without breaking inside a word. */
  minEm: number
  /** Widest unbreakable token, uncapped. */
  longestTokenEm: number
  /** True when values contain spaces, so wrapping can reclaim width. */
  flexible: boolean
}

interface MeasureOptions {
  showHeaders?: boolean
  /**
   * Fraction of the cell-width sample used as natural width. Below 1, a few long
   * values wrap instead of claiming room from every other column — useful on
   * paper, unnecessary when the medium can scroll.
   */
  naturalPercentile?: number
  /** Cap so one essay-length cell cannot dominate. */
  maxNaturalEm?: number
}

const SAFETY = 1.04
const MAX_SAMPLE_ROWS = 250

/** Tokens wider than this are treated as breakable rather than dictating layout. */
const MAX_TOKEN_EM = 18

/** Floor so an all-empty column still reads as a column. */
const MIN_COLUMN_EM = 2.2

/** Approximate Roboto advance widths in `em`. */
function charEm(char: string): number {
  if (char >= '0' && char <= '9') return 0.556
  if (char === ' ') return 0.26
  if ('.,:;\'`!|iljI'.includes(char)) return 0.28
  if ('ftr()[]{}/\\-'.includes(char)) return 0.35
  if ('mwMW'.includes(char)) return 0.86
  if (char >= 'A' && char <= 'Z') return 0.66
  if (char >= 'a' && char <= 'z') return 0.54
  return 0.58
}

function textEm(text: string): number {
  let total = 0
  for (const char of text) total += charEm(char)
  return total * SAFETY
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.floor(fraction * (sorted.length - 1))]
}

/**
 * Measures columns from the text that will actually render (not the schema),
 * so embedded and inline tables share one answer. Natural width uses a
 * percentile so outliers do not starve neighbours; minimum uses the widest
 * token, which cannot wrap away.
 */
export function measureColumns(
  headers: string[],
  rows: string[][],
  options: MeasureOptions = {},
): ColumnMetric[] {
  const {
    showHeaders = true,
    naturalPercentile = 0.9,
    maxNaturalEm = Number.POSITIVE_INFINITY,
  } = options
  const stride = Math.max(1, Math.ceil(rows.length / MAX_SAMPLE_ROWS))

  return headers.map((header, index) => {
    const cellWidths: number[] = []
    let longestTokenEm = 0
    let sawSpace = false

    const tokenise = (value: string) => {
      const tokens = value.split(/\s+/)
      if (tokens.length > 1) sawSpace = true
      for (const token of tokens) {
        longestTokenEm = Math.max(longestTokenEm, textEm(token))
      }
    }

    // Keep the header out of the percentile sample: as one value among hundreds
    // it would be discarded, silently squeezing columns whose label is widest.
    let headerEm = 0
    if (showHeaders && header.trim()) {
      headerEm = textEm(header.trim())
      tokenise(header.trim())
    }

    for (let row = 0; row < rows.length; row += stride) {
      const value = (rows[row]?.[index] ?? '').trim()
      cellWidths.push(value ? textEm(value) : 0)
      if (value) tokenise(value)
    }

    cellWidths.sort((a, b) => a - b)
    const minEm = Math.max(Math.min(longestTokenEm, MAX_TOKEN_EM), MIN_COLUMN_EM)
    const naturalEm = Math.min(
      Math.max(percentile(cellWidths, naturalPercentile), headerEm, minEm, MIN_COLUMN_EM),
      Math.max(maxNaturalEm, minEm),
    )

    return {
      naturalEm,
      minEm,
      longestTokenEm: Math.max(longestTokenEm, MIN_COLUMN_EM),
      flexible: sawSpace && naturalEm - minEm > 0.5,
    }
  })
}
