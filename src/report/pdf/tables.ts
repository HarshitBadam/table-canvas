import type { Content, ContentTable, TableCell } from 'pdfmake/interfaces'
import {
  bandLabel,
  fitTable,
  omittedNote,
  type TableBand,
  type TableFitPlan,
} from '@/report/layout/tableFit'
import {
  CONTENT_WIDTH,
  LANDSCAPE_CONTENT_WIDTH,
  MUTED,
  NESTED_WIDTH_INSET,
  RULE,
  SUBTLE_FILL,
  TABLE_FIT_CANDIDATES,
} from './theme'

export interface TableBlockOptions {
  /** Column labels; also decides the column count when headers are hidden. */
  headers: string[]
  rows: string[][]
  showHeaders: boolean
  caption?: string
  /** Embedded tables label the table above it; inline tables caption below. */
  captionAbove?: boolean
  /** Truncation note printed under the table. */
  note?: string
  /**
   * Whether the table may claim a landscape page. Only true at the top level of
   * the document: pdfmake ties orientation to a page break, which a nested block
   * cannot request. Banding needs no page break, so it works either way.
   */
  allowLandscape: boolean
}

function bandTable(options: TableBlockOptions, plan: TableFitPlan, band: TableBand): ContentTable {
  const wordBreak = plan.breakAnywhere ? ('break-all' as const) : undefined
  const body: TableCell[][] = []

  if (options.showHeaders) {
    body.push(band.columns.map((column) => ({
      text: options.headers[column] ?? '',
      bold: true,
      color: MUTED,
      fillColor: SUBTLE_FILL,
      wordBreak,
    })))
  }

  for (const row of options.rows) {
    body.push(band.columns.map((column) => ({
      text: row[column] ?? '',
      wordBreak,
    })))
  }

  return {
    table: {
      headerRows: options.showHeaders ? 1 : 0,
      // A header stranded at the foot of a page belongs to rows nobody can see,
      // so it moves with at least one of them.
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths: band.widths,
      body,
    },
    layout: {
      hLineWidth: () => 0.75,
      vLineWidth: () => 0.75,
      hLineColor: () => RULE,
      vLineColor: () => RULE,
      paddingLeft: () => plan.paddingX,
      paddingRight: () => plan.paddingX,
      paddingTop: () => plan.paddingY,
      paddingBottom: () => plan.paddingY,
    },
    fontSize: plan.fontSize,
    margin: [0, 6, 0, 6],
  }
}

/**
 * Builds a table together with its caption and any layout notes.
 *
 * A table too wide for the page comes back from the fitter as several bands,
 * which render as stacked tables rather than forced pages: short tables then keep
 * all their bands on one page, and the whole thing still works inside a callout
 * or list where a page break is not available.
 *
 * The first block of the group carries the landscape request when the table needs
 * one; the document assembler reads that back to restore portrait for whatever
 * follows.
 */
export function tableBlocks(options: TableBlockOptions): Content[] {
  const available = options.allowLandscape
    ? CONTENT_WIDTH
    : CONTENT_WIDTH - NESTED_WIDTH_INSET

  const { plan } = fitTable(options.headers, options.rows, {
    portraitWidth: available,
    landscapeWidth: options.allowLandscape ? LANDSCAPE_CONTENT_WIDTH : undefined,
    allowBanding: true,
    candidates: TABLE_FIT_CANDIDATES,
  }, options.showHeaders)

  const blocks: Content[] = []
  const caption = options.caption?.trim()
  const bandCount = plan.bands.length

  if (caption && options.captionAbove) {
    blocks.push({ text: caption, style: 'tableCaption' })
  }

  for (const [index, band] of plan.bands.entries()) {
    const label = bandLabel(
      band,
      index,
      bandCount,
      options.headers.length,
      options.headers[band.columns[0]] ?? '',
    )
    if (label) blocks.push({ text: label, style: 'tableBandLabel' })
    blocks.push(bandTable(options, plan, band))
  }

  if (caption && !options.captionAbove) {
    blocks.push({ text: caption, style: 'tableCaption', margin: [0, 0, 0, 6] })
  }

  const omitted = omittedNote(plan.omitted, options.headers)
  for (const note of [options.note, omitted]) {
    if (note) blocks.push({ text: note, style: 'tableNote' })
  }

  if (plan.landscape) {
    Object.assign(blocks[0], { pageBreak: 'before', pageOrientation: 'landscape' })
  }

  return blocks
}

export function truncationNote(
  shownRows: number,
  totalRows: number,
  shownColumns: number,
  totalColumns: number,
  window: 'first' | 'last',
): string | undefined {
  const notes: string[] = []
  if (shownRows < totalRows) {
    notes.push(
      `Showing the ${window} ${shownRows.toLocaleString()} of ${totalRows.toLocaleString()} rows`,
    )
  }
  if (shownColumns < totalColumns) {
    notes.push(`${shownColumns} of ${totalColumns} columns`)
  }
  return notes.length > 0 ? `${notes.join(' · ')}.` : undefined
}
