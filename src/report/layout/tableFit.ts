/**
 * Content-measured table layout for a fixed page width.
 *
 * Escalation by reader cost: shrink type, then landscape, then band columns,
 * then omit. The type floor is the last candidate; past that the table splits
 * rather than shrinking past legibility.
 */

import { measureColumns, type ColumnMetric } from './columnMetrics'

export interface FitCandidate {
  fontSize: number
  paddingX: number
  paddingY: number
}

export interface TableBand {
  columns: number[]
  /** Content widths aligned with `columns`, in the same unit as `fontSize`. */
  widths: number[]
  /** Index of the repeated key column within `columns`, or null if not added. */
  repeatedKey: number | null
  /** 1-based inclusive range of the band's own columns in the original table. */
  range: [number, number]
}

export interface TableFitPlan {
  fontSize: number
  paddingX: number
  paddingY: number
  /** Set when a column had to be narrower than its longest word. */
  breakAnywhere: boolean
  landscape: boolean
  bands: TableBand[]
  /** Columns dropped because banding still could not fit them. */
  omitted: number[]
  /** Set when the table exceeds its budget and the medium must scroll it. */
  overflow: boolean
}

interface FitOptions {
  portraitWidth: number
  /** Omit where landscape is unavailable (nested blocks, screen scroll). */
  landscapeWidth?: number
  /** Screen media scroll instead of banding. */
  allowBanding: boolean
  /** Type sizes widest-first; the last entry is the legibility floor. */
  candidates: FitCandidate[]
  maxBands?: number
  naturalPercentile?: number
  maxNaturalEm?: number
}

const BORDER = 0.75
const DEFAULT_MAX_BANDS = 3

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

/** Width left for cell content once padding and rules are paid for. */
function contentBudget(available: number, columnCount: number, paddingX: number): number {
  return available - columnCount * 2 * paddingX - (columnCount + 1) * BORDER
}

/**
 * Allocates a budget: fixed columns keep measured width; flexible ones absorb
 * shortfall by wrapping so dates stay readable while prose takes extra lines.
 */
function allocate(
  metrics: ColumnMetric[],
  columns: number[],
  budgetEm: number,
): number[] | null {
  const natural = columns.map((index) => metrics[index].naturalEm)
  const minimum = columns.map((index) => metrics[index].minEm)
  const naturalTotal = sum(natural)

  if (naturalTotal <= budgetEm) {
    // Spare room goes to flexible columns; padding fixed columns just wastes space.
    const slack = budgetEm - naturalTotal
    const flexible = columns.map((index, position) => (
      metrics[index].flexible ? natural[position] : 0
    ))
    const shareBase = sum(flexible) > 0 ? flexible : natural
    const shareTotal = sum(shareBase)
    return natural.map((width, position) => width + slack * (shareBase[position] / shareTotal))
  }

  const minimumTotal = sum(minimum)
  if (minimumTotal > budgetEm) return null

  const appetite = natural.map((width, position) => width - minimum[position])
  const appetiteTotal = sum(appetite)
  const spare = budgetEm - minimumTotal
  return minimum.map((width, position) => (
    appetiteTotal > 0 ? width + spare * (appetite[position] / appetiteTotal) : width
  ))
}

/** Contiguous, width-balanced groups. Column order is never rearranged. */
function splitContiguous(
  metrics: ColumnMetric[],
  columns: number[],
  bandCount: number,
): number[][] | null {
  if (columns.length < bandCount) return null

  const weights = columns.map((index) => metrics[index].naturalEm)
  const target = sum(weights) / bandCount
  const groups: number[][] = []
  let current: number[] = []
  let accumulated = 0

  for (let position = 0; position < columns.length; position++) {
    current.push(columns[position])
    accumulated += weights[position]

    const remaining = columns.length - position - 1
    const groupsLeft = bandCount - groups.length - 1
    if (groupsLeft <= 0 || remaining < groupsLeft) continue
    if (accumulated >= target || remaining <= groupsLeft) {
      groups.push(current)
      current = []
      accumulated = 0
    }
  }
  if (current.length > 0) groups.push(current)

  return groups.length === bandCount ? groups : null
}

/**
 * Builds bands, repeating the key column so every band identifies its rows.
 * A band that cannot afford the key is treated as not fitting.
 */
function buildBands(
  metrics: ColumnMetric[],
  columns: number[],
  bandCount: number,
  keyColumn: number,
  available: number,
  candidate: FitCandidate,
): TableBand[] | null {
  const groups = splitContiguous(metrics, columns, bandCount)
  if (!groups) return null

  const bands: TableBand[] = []
  for (const [position, own] of groups.entries()) {
    const repeats = position > 0 && !own.includes(keyColumn)
    const bandColumns = repeats ? [keyColumn, ...own] : own
    const budget = contentBudget(available, bandColumns.length, candidate.paddingX)
    const widths = allocate(metrics, bandColumns, budget / candidate.fontSize)
    if (!widths) return null

    bands.push({
      columns: bandColumns,
      widths: widths.map((width) => width * candidate.fontSize),
      repeatedKey: repeats ? 0 : null,
      range: [own[0] + 1, own[own.length - 1] + 1],
    })
  }
  return bands
}

function needsWordBreak(
  metrics: ColumnMetric[],
  bands: TableBand[],
  fontSize: number,
): boolean {
  return bands.some((band) => band.columns.some((column, position) => (
    band.widths[position] < metrics[column].longestTokenEm * fontSize - 0.01
  )))
}

function toPlan(
  metrics: ColumnMetric[],
  bands: TableBand[],
  candidate: FitCandidate,
  landscape: boolean,
  extra: { omitted?: number[]; overflow?: boolean } = {},
): TableFitPlan {
  return {
    fontSize: candidate.fontSize,
    paddingX: candidate.paddingX,
    paddingY: candidate.paddingY,
    breakAnywhere: needsWordBreak(metrics, bands, candidate.fontSize),
    landscape,
    bands,
    omitted: extra.omitted ?? [],
    overflow: extra.overflow ?? false,
  }
}

/** Single band at intrinsic width, for media that can scroll past the budget. */
function overflowPlan(
  metrics: ColumnMetric[],
  columns: number[],
  candidate: FitCandidate,
): TableFitPlan {
  const widths = columns.map((index) => metrics[index].naturalEm * candidate.fontSize)
  const band: TableBand = {
    columns,
    widths,
    repeatedKey: null,
    range: [columns[0] + 1, columns[columns.length - 1] + 1],
  }
  return toPlan(metrics, [band], candidate, false, { overflow: true })
}

/**
 * Walks the escalation ladder and returns the first layout that fits.
 * Portrait at a smaller size beats landscape; landscape beats banding.
 */
function planTableFit(metrics: ColumnMetric[], options: FitOptions): TableFitPlan {
  const columns = metrics.map((_, index) => index)
  const candidates = options.candidates
  const floor = candidates[candidates.length - 1]
  if (columns.length === 0) return toPlan(metrics, [], floor, false)

  const orientations: { landscape: boolean; available: number }[] = [
    { landscape: false, available: options.portraitWidth },
  ]
  if (options.landscapeWidth) {
    orientations.push({ landscape: true, available: options.landscapeWidth })
  }

  for (const orientation of orientations) {
    for (const candidate of candidates) {
      const budget = contentBudget(orientation.available, columns.length, candidate.paddingX)
      const widths = allocate(metrics, columns, budget / candidate.fontSize)
      if (!widths) continue

      const band: TableBand = {
        columns,
        widths: widths.map((width) => width * candidate.fontSize),
        repeatedKey: null,
        range: [1, columns.length],
      }
      return toPlan(metrics, [band], candidate, orientation.landscape)
    }
  }

  if (!options.allowBanding) return overflowPlan(metrics, columns, floor)

  // Prefer the widest page: each extra band is another page the reader holds in mind.
  const landscape = Boolean(options.landscapeWidth)
  const available = options.landscapeWidth ?? options.portraitWidth
  const maxBands = options.maxBands ?? DEFAULT_MAX_BANDS
  const keyColumn = 0

  for (let bandCount = 2; bandCount <= maxBands; bandCount++) {
    const bands = buildBands(metrics, columns, bandCount, keyColumn, available, floor)
    if (bands) return toPlan(metrics, bands, floor, landscape)
  }

  // Past the band ceiling, keep leading columns and report what was dropped.
  // Full data still ships alongside the report.
  for (let count = columns.length - 1; count >= 2; count--) {
    const kept = columns.slice(0, count)
    for (let bandCount = 1; bandCount <= maxBands; bandCount++) {
      const bands = bandCount === 1
        ? singleBand(metrics, kept, available, floor)
        : buildBands(metrics, kept, bandCount, keyColumn, available, floor)
      if (bands) {
        return toPlan(metrics, bands, floor, landscape, { omitted: columns.slice(count) })
      }
    }
  }

  return overflowPlan(metrics, columns, floor)
}

function singleBand(
  metrics: ColumnMetric[],
  columns: number[],
  available: number,
  candidate: FitCandidate,
): TableBand[] | null {
  const budget = contentBudget(available, columns.length, candidate.paddingX)
  const widths = allocate(metrics, columns, budget / candidate.fontSize)
  if (!widths) return null
  return [{
    columns,
    widths: widths.map((width) => width * candidate.fontSize),
    repeatedKey: null,
    range: [columns[0] + 1, columns[columns.length - 1] + 1],
  }]
}

export function fitTable(
  headers: string[],
  rows: string[][],
  options: FitOptions,
  showHeaders = true,
): { metrics: ColumnMetric[]; plan: TableFitPlan } {
  const metrics = measureColumns(headers, rows, {
    showHeaders,
    naturalPercentile: options.naturalPercentile,
    maxNaturalEm: options.maxNaturalEm,
  })
  return { metrics, plan: planTableFit(metrics, options) }
}

/**
 * Labels a band so a split is visible; without this a band reads as the whole table.
 */
export function bandLabel(
  band: TableBand,
  bandIndex: number,
  bandCount: number,
  totalColumns: number,
  keyHeader: string,
): string | undefined {
  if (bandCount < 2) return undefined
  const [from, to] = band.range
  const span = from === to ? `Column ${from}` : `Columns ${from}–${to}`
  const base = `${span} of ${totalColumns}`
  if (bandIndex === 0) return `${base} · table continues below`
  return band.repeatedKey === null ? base : `${base} · “${keyHeader}” repeated`
}

export function omittedNote(omitted: number[], headers: string[]): string | undefined {
  if (omitted.length === 0) return undefined
  const names = omitted.map((index) => headers[index]).filter(Boolean)
  const shown = names.slice(0, 4).join(', ')
  const rest = names.length > 4 ? `, and ${names.length - 4} more` : ''
  return `${omitted.length} column${omitted.length === 1 ? '' : 's'} omitted to fit the page: ${shown}${rest}.`
}
