/**
 * Decides how a table should be laid out on a fixed-width page.
 *
 * Column count is a poor proxy for width: twenty integer columns fit a landscape
 * page comfortably, while eight columns of prose do not fit a portrait one. So
 * every layout decision here is driven by measured content instead, and the
 * exporters ask this module rather than carrying their own thresholds.
 *
 * The escalation is ordered by what it costs the reader: shrink the type, then
 * turn the page sideways, then split the columns across stacked bands, and only
 * then drop columns. Nothing silently shrinks past legibility — the type floor is
 * the last candidate in the list, and a table that cannot fit at that size is
 * split rather than crushed.
 */

import { measureColumns, type ColumnMetric } from './columnMetrics'

export type { ColumnMetric }

/** A type size paired with the cell padding that suits it. */
export interface FitCandidate {
  fontSize: number
  paddingX: number
  paddingY: number
}

export interface TableBand {
  /** Column indices in render order, including a repeated key column if any. */
  columns: number[]
  /** Content widths aligned with `columns`, in the same unit as `fontSize`. */
  widths: number[]
  /** Position of the repeated key column within `columns`, or null if not added. */
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
  /** Whether the table asked for a sideways page. */
  landscape: boolean
  /** One entry unless the table was split; bands render stacked, in order. */
  bands: TableBand[]
  /** Columns dropped because not even banding could fit them. */
  omitted: number[]
  /** Set when the table exceeds its budget and the medium must scroll it. */
  overflow: boolean
}

export interface FitOptions {
  /** Usable width of the default page or container. */
  portraitWidth: number
  /** Usable width when turned sideways; omit where that isn't possible. */
  landscapeWidth?: number
  /** Whether the table may be split into bands. Screen media scroll instead. */
  allowBanding: boolean
  /** Type sizes to try, widest-first. The last entry is the floor. */
  candidates: FitCandidate[]
  maxBands?: number
  /** Passed through to measurement; see `MeasureOptions`. */
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
 * Divides a budget among columns, or reports that they cannot fit.
 *
 * Fixed-width columns are served their measured width first and flexible ones
 * absorb the shortfall by wrapping, which is the whole point: a date column keeps
 * its ten characters while a description column takes three lines, instead of
 * both being squeezed to the same unreadable sliver.
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
    // Spare room goes to the columns that can use it. Numbers gain nothing from
    // a wider cell, so padding them out just to fill the line wastes the page.
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
 *
 * Without a repeated identifier a band is a wall of values with no way to tell
 * which record each row belongs to, so a band that cannot afford the key column
 * is treated as not fitting at all.
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
 *
 * Order is by reader cost, not implementation convenience: staying portrait at a
 * smaller size is less disruptive than rotating the page, and rotating is less
 * disruptive than splitting a record across bands.
 */
export function planTableFit(metrics: ColumnMetric[], options: FitOptions): TableFitPlan {
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

  // Band on the widest page available, since every extra band is another page the
  // reader has to hold in their head.
  const landscape = Boolean(options.landscapeWidth)
  const available = options.landscapeWidth ?? options.portraitWidth
  const maxBands = options.maxBands ?? DEFAULT_MAX_BANDS
  const keyColumn = 0

  for (let bandCount = 2; bandCount <= maxBands; bandCount++) {
    const bands = buildBands(metrics, columns, bandCount, keyColumn, available, floor)
    if (bands) return toPlan(metrics, bands, floor, landscape)
  }

  // Past the band ceiling, reconstructing one record means flipping through too
  // many pages to be worth it, so the table keeps its leading columns and says
  // what it dropped. The full data ships alongside the report regardless.
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

/** Convenience wrapper for callers that hold rendered cell text. */
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
 * Labels a band so a reader can tell the table was split and what they are
 * looking at. Without this the split is invisible and the band reads as the
 * whole table.
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

/** Note naming the columns a layout had to drop. */
export function omittedNote(omitted: number[], headers: string[]): string | undefined {
  if (omitted.length === 0) return undefined
  const names = omitted.map((index) => headers[index]).filter(Boolean)
  const shown = names.slice(0, 4).join(', ')
  const rest = names.length > 4 ? `, and ${names.length - 4} more` : ''
  return `${omitted.length} column${omitted.length === 1 ? '' : 's'} omitted to fit the page: ${shown}${rest}.`
}
