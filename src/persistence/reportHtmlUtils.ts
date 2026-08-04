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

const CONTAINER_WIDTH = 760

/** HTML export keeps body type; scroll replaces the PDF path's font step-down. */
const HTML_FIT_CANDIDATES: FitCandidate[] = [
  { fontSize: 16, paddingX: 8, paddingY: 8 },
]

/** Cap natural column width (em) so one long cell cannot dominate scroll width. */
const MAX_NATURAL_EM = 40

export interface TableMarkup {
  headers: string[]
  rows: string[][]
  showHeaders: boolean
  inner: string
}

/**
 * HTML export table wrapper: content-measured columns that scroll horizontally
 * instead of the PDF exporter's type-shrink / band split.
 */
export function wrapTable({ headers, rows, showHeaders, inner }: TableMarkup): string {
  const { plan } = fitTable(headers, rows, {
    portraitWidth: CONTAINER_WIDTH,
    allowBanding: false,
    candidates: HTML_FIT_CANDIDATES,
    // Full natural width — percentile trimming only helps fixed page width.
    naturalPercentile: 1,
    maxNaturalEm: MAX_NATURAL_EM,
  }, showHeaders)

  const band = plan.bands[0]
  if (!band) return `<div class="table-scroll">\n<table>\n${inner}</table>\n</div>\n`

  const total = band.widths.reduce((carry, width) => carry + width, 0)
  const colgroup = band.widths
    .map((width) => `<col style="width:${((width / total) * 100).toFixed(3)}%">`)
    .join('')

  // Floor only when overflowing; otherwise min-width would force a useless scrollbar.
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
