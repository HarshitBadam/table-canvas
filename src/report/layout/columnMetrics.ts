/**
 * Measures how much width each column of a table actually needs.
 *
 * Kept separate from the fitting decision because measurement is the part that
 * has to be right: every layout choice downstream is only as good as these
 * numbers. Widths are in `em` so one measurement serves every candidate type
 * size.
 */

export interface ColumnMetric {
  /** Content laid out on a single line, at the 90th percentile of sampled rows. */
  naturalEm: number
  /** Narrowest the column goes without breaking inside a word. */
  minEm: number
  /** Widest single unbreakable token, uncapped. */
  longestTokenEm: number
  /** Whether wrapping can buy this column anything, i.e. values contain spaces. */
  flexible: boolean
}

export interface MeasureOptions {
  showHeaders?: boolean
  /**
   * Which cell width counts as the column's natural width. Below 1 a few long
   * values are allowed to wrap so they cannot claim room from every other column
   * — worth it on paper, where width is finite, and not worth it on a screen that
   * scrolls.
   */
  naturalPercentile?: number
  /** Ceiling on the natural width, so one essay-length cell cannot dominate. */
  maxNaturalEm?: number
}

const SAFETY = 1.04
const MAX_SAMPLE_ROWS = 250

/**
 * A token wider than this is treated as breakable rather than allowed to dictate
 * the whole table's layout — one 200-character cell should not force a split.
 */
const MAX_TOKEN_EM = 18

/** Floor so an all-empty column still reads as a column. */
const MIN_COLUMN_EM = 2.2

/**
 * Per-character advance widths for Roboto, in `em`.
 *
 * Approximate on purpose: real font metrics are only available once pdfmake has
 * loaded, and a fit decision needs a few percent of accuracy, not exact glyph
 * positions. `SAFETY` absorbs the error. Being independent of the renderer is
 * what lets the PDF and HTML exporters share one answer.
 */
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

export function textEm(text: string): number {
  let total = 0
  for (const char of text) total += charEm(char)
  return total * SAFETY
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.floor(fraction * (sorted.length - 1))]
}

/**
 * Measures each column from the text that will actually be rendered.
 *
 * Deliberately reads the formatted strings rather than the column schema, so it
 * works the same for embedded tables (which have types) and inline tables (which
 * do not). Whitespace is the signal that matters: a value with no spaces cannot
 * be wrapped, which is exactly what makes numbers, dates, IDs and codes
 * incompressible and prose compressible.
 *
 * The natural width uses the 90th percentile so a single outlier value does not
 * claim room from every other column, while the minimum uses the widest token,
 * because that one really cannot be wrapped away.
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

    // The header is held apart from the cell sample rather than mixed into it: as
    // one value among hundreds it would be discarded by the percentile, which
    // silently squeezes any column whose label is wider than its data.
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
