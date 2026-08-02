import { fitTable, type FitCandidate } from '@/report/layout/tableFit'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function safeLink(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value, 'https://tablecanvas.local')
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : null
  } catch {
    return null
  }
}

/** Usable width inside the document's centred column, in `px`. */
const CONTAINER_WIDTH = 760

/**
 * A single size, at the document's body type. Stepping the type down is how a
 * page buys width it cannot otherwise get; a scroll container has no such limit,
 * so shrinking here would cost legibility for nothing.
 */
const HTML_FIT_CANDIDATES: FitCandidate[] = [
  { fontSize: 16, paddingX: 8, paddingY: 8 },
]

/**
 * Widest a column is allowed to get before its cells wrap instead, in `em`. Only
 * bites on essay-length values: without it a single long cell would stretch one
 * column across the whole scroll width.
 */
const MAX_NATURAL_EM = 40

export interface TableMarkup {
  headers: string[]
  /** Rendered cell text, used to size the columns. */
  rows: string[][]
  showHeaders: boolean
  /** Caption, thead and tbody markup for the table element. */
  inner: string
}

/**
 * Wraps a table body in the horizontal scroll container used by the HTML export.
 *
 * Column widths are measured from the content rather than shared out equally, so
 * a date column keeps the room it needs and a description column takes the rest.
 * Past the container width the columns keep the width they asked for and the
 * container scrolls, rather than being compressed to fit: this is an interactive
 * document, so the page-fitting the PDF exporter has to do — shrinking type,
 * splitting into bands — buys nothing here.
 */
export function wrapTable({ headers, rows, showHeaders, inner }: TableMarkup): string {
  const { plan } = fitTable(headers, rows, {
    portraitWidth: CONTAINER_WIDTH,
    allowBanding: false,
    candidates: HTML_FIT_CANDIDATES,
    // Every column gets the width its widest value asks for. Trimming to a
    // percentile trades a little width for a little wrapping, which is a bargain
    // on paper and pointless in a container that can just scroll further.
    naturalPercentile: 1,
    maxNaturalEm: MAX_NATURAL_EM,
  }, showHeaders)

  const band = plan.bands[0]
  if (!band) return `<div class="table-scroll">\n<table>\n${inner}</table>\n</div>\n`

  const total = band.widths.reduce((carry, width) => carry + width, 0)
  const colgroup = band.widths
    .map((width) => `<col style="width:${((width / total) * 100).toFixed(3)}%">`)
    .join('')

  // Only an overflowing table needs a floor; below the container width the
  // declaration would force a scrollbar onto a table that already fits.
  const chrome = headers.length * 2 * plan.paddingX + (headers.length + 1)
  const minWidth = plan.overflow ? Math.ceil(total + chrome) : 0
  const style = minWidth > 0 ? ` style="--table-min-width:${minWidth}px"` : ''

  return `<div class="table-scroll">\n<table${style}>\n<colgroup>${colgroup}</colgroup>\n${inner}</table>\n</div>\n`
}

export function renderInlineTable(attrs: Record<string, unknown>): string {
  const headers = Array.isArray(attrs.headers)
    ? attrs.headers.map(value => String(value ?? ''))
    : []
  const rows = Array.isArray(attrs.rows)
    ? attrs.rows.filter(Array.isArray).slice(0, 1_000) as unknown[][]
    : []
  const showHeaders = attrs.showHeaders !== false
  if (headers.length === 0) {
    return '<div class="block-placeholder">[Empty table]</div>\n'
  }
  const caption = typeof attrs.caption === 'string' ? attrs.caption : ''
  const cells = rows.map(row => headers.map((_, index) => String(row[index] ?? '')))

  let inner = ''
  if (caption) inner += `<caption>${escapeHtml(caption)}</caption>\n`
  if (showHeaders) {
    inner += `<thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>\n`
  }
  inner += '<tbody>'
  for (const row of cells) {
    inner += `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>\n`
  }
  inner += '</tbody>'
  let html = wrapTable({ headers, rows: cells, showHeaders, inner })
  if (Array.isArray(attrs.rows) && attrs.rows.length > rows.length) {
    html += `<p class="table-note">Showing the first ${rows.length.toLocaleString()} rows.</p>\n`
  }
  return html
}
