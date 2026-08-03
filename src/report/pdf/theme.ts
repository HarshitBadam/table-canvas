import type { Margins, Style, StyleDictionary } from 'pdfmake/interfaces'
import type { FitCandidate } from '@/report/layout/tableFit'

export const BRAND = '#217346'
const INK = '#1a1a1a'
export const MUTED = '#5f6b7a'
export const RULE = '#d8dee6'
export const SUBTLE_FILL = '#f6f8fa'
export const HIGHLIGHT_FILL = '#d9f2e3'

/** Letter portrait, 0.7in side margins; the bottom margin also carries the footer. */
export const PAGE_MARGINS: Margins = [50, 54, 50, 54]

/** Printable width of a portrait page in `pt`, for full-width rules and graphics. */
export const CONTENT_WIDTH = 512

export const DEFAULT_STYLE: Style = {
  font: 'Roboto',
  fontSize: 10.5,
  lineHeight: 1.35,
  color: INK,
}

export const STYLES: StyleDictionary = {
  title: { fontSize: 22, bold: true, color: INK },
  meta: { fontSize: 9, color: MUTED, margin: [0, 0, 0, 18] },
  h1: { fontSize: 19, bold: true, margin: [0, 14, 0, 6] },
  h2: { fontSize: 15, bold: true, margin: [0, 12, 0, 5] },
  h3: { fontSize: 12.5, bold: true, margin: [0, 10, 0, 4] },
  paragraph: { margin: [0, 0, 0, 7] },
  quote: { color: MUTED, italics: true },
  code: { fontSize: 9, color: INK, preserveLeadingSpaces: true },
  tableNote: { fontSize: 8.5, color: MUTED, margin: [0, 0, 0, 8] },
  tableCaption: { fontSize: 8.5, color: MUTED, italics: true, margin: [0, 0, 0, 4] },
  tableBandLabel: { fontSize: 8, bold: true, color: MUTED, margin: [0, 6, 0, 2] },
  chartTitle: { fontSize: 11, bold: true, margin: [0, 0, 0, 3] },
  chartSubtitle: { fontSize: 9, color: MUTED, margin: [0, 0, 0, 4] },
  chartCaption: { fontSize: 8.5, color: MUTED, margin: [0, 5, 0, 0] },
  placeholder: { fontSize: 9, color: MUTED, italics: true, margin: [0, 6, 0, 8] },
  footer: { fontSize: 8, color: MUTED },
}

/** Printable width of a landscape Letter page, at the same side margins. */
export const LANDSCAPE_CONTENT_WIDTH = 692

/**
 * Type sizes widest-first. 8pt is the floor: below it a table is present but
 * not readable, which is worse than banding. `planTableFit` escalates instead.
 */
export const TABLE_FIT_CANDIDATES: FitCandidate[] = [
  { fontSize: 9, paddingX: 6, paddingY: 3 },
  { fontSize: 8, paddingX: 4, paddingY: 2.5 },
]

/** Room a `boxed()` wrapper takes from a nested table's available width. */
export const NESTED_WIDTH_INSET = 20
