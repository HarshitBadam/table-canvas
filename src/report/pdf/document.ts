import type {
  Content,
  PageBreak,
  PageOrientation,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'
import type { EmbeddedDataMap } from '@/persistence/reportHtmlGenerator'
import type { Report } from '@/report/types'
import { nodeBlocks } from './content'
import {
  BRAND,
  CONTENT_WIDTH,
  DEFAULT_STYLE,
  LANDSCAPE_CONTENT_WIDTH,
  PAGE_MARGINS,
  STYLES,
} from './theme'

const FOOTER_LABEL_LIMIT = 70

function formatDate(value: string | number | Date): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

interface PagedBlock {
  pageBreak?: PageBreak
  pageOrientation?: PageOrientation
}

function asBlock(content: Content): PagedBlock | null {
  if (typeof content !== 'object' || Array.isArray(content)) return null
  return content as PagedBlock
}

interface DocumentBody {
  content: Content[]
  /** Orientation the document opens on, which the title block shares. */
  orientation: PageOrientation
}

/**
 * Flattens top-level nodes while resolving page orientation.
 *
 * pdfmake only switches orientation at a page break, so a landscape block leaves
 * the flow landscape until the next block breaks back to portrait. Doing that
 * here — rather than a separate marker — avoids a stray empty page when a wide
 * table ends the report.
 *
 * A report that opens on a wide table opens sideways so the title travels with
 * the table instead of sitting alone on a portrait page.
 */
function documentBody(report: Report, dataMap: EmbeddedDataMap): DocumentBody {
  const nodes = report.tiptapContent?.content ?? []
  const content: Content[] = []
  let orientation: PageOrientation = 'portrait'
  let landscape = false

  for (const node of nodes) {
    const blocks = nodeBlocks(node, dataMap, true)
    if (blocks.length === 0) continue

    const first = asBlock(blocks[0])
    const wantsLandscape = first?.pageOrientation === 'landscape'
    if (content.length === 0 && wantsLandscape && first) {
      delete first.pageBreak
      delete first.pageOrientation
      orientation = 'landscape'
    } else if (landscape && wantsLandscape && first) {
      // Already landscape — a break would only start a fresh page. Consecutive
      // wide tables share a page and flow onto the next when full.
      delete first.pageBreak
      delete first.pageOrientation
    } else if (landscape && !wantsLandscape && first) {
      first.pageBreak = 'before'
      first.pageOrientation = 'portrait'
    }
    landscape = wantsLandscape
    content.push(...blocks)
  }

  if (content.length === 0) {
    content.push({ text: 'This report is empty.', italics: true, style: 'placeholder' })
  }
  return { content, orientation }
}

interface ReportDocumentOptions {
  report: Report
  dataMap?: EmbeddedDataMap
  appName?: string
}

export function buildReportDocDefinition({
  report,
  dataMap = {},
  appName = 'Table Canvas',
}: ReportDocumentOptions): TDocumentDefinitions {
  const name = report.name?.trim() || 'Untitled Report'
  const footerLabel = `${appName} · ${name}`.slice(0, FOOTER_LABEL_LIMIT)
  const body = documentBody(report, dataMap)
  const ruleWidth = body.orientation === 'landscape' ? LANDSCAPE_CONTENT_WIDTH : CONTENT_WIDTH

  return {
    pageSize: 'LETTER',
    pageOrientation: body.orientation,
    pageMargins: PAGE_MARGINS,
    defaultStyle: DEFAULT_STYLE,
    styles: STYLES,
    info: {
      title: name,
      author: appName,
      creator: appName,
    },
    content: [
      { text: name, style: 'title' },
      {
        canvas: [{
          type: 'line',
          x1: 0,
          y1: 0,
          x2: ruleWidth,
          y2: 0,
          lineWidth: 2,
          lineColor: BRAND,
        }],
        margin: [0, 4, 0, 6],
      },
      {
        text: [
          appName,
          ` · Last updated ${formatDate(report.updatedAt)}`,
          ` · Exported ${formatDate(Date.now())}`,
        ].join(''),
        style: 'meta',
      },
      ...body.content,
    ],
    footer: (currentPage, pageCount) => ({
      margin: [50, 14, 50, 0],
      columns: [
        { text: footerLabel, style: 'footer' },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          style: 'footer',
          alignment: 'right',
          width: 'auto',
        },
      ],
    }),
  }
}

export function reportPdfFilename(report: Report): string {
  const safe = (report.name || '').replace(/[^a-zA-Z0-9-_ ]/g, '_').trim().slice(0, 50)
  return `${safe || 'report'}.pdf`
}
