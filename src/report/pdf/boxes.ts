import type { Content, ContentTable } from 'pdfmake/interfaces'
import { CONTENT_WIDTH, MUTED, RULE } from './theme'

interface BoxOptions {
  fill?: string
  /** Colour of a 3pt bar down the left edge, in place of a full border. */
  accent?: string
  border?: string
  padding?: [number, number]
}

/**
 * Wraps blocks in a single-cell table — the only pdfmake construct that can
 * give a group of blocks a background, border and padding at once.
 */
export function boxed(children: Content[], options: BoxOptions = {}): ContentTable {
  const [paddingX, paddingY] = options.padding ?? [9, 6]
  const accented = Boolean(options.accent)
  const lineColor = options.accent ?? options.border ?? RULE

  return {
    table: {
      widths: ['*'],
      body: [[{
        stack: children,
        fillColor: options.fill,
        border: accented ? [true, false, false, false] : [true, true, true, true],
      }]],
    },
    layout: {
      defaultBorder: false,
      hLineWidth: () => (accented ? 0 : 0.75),
      vLineWidth: (columnIndex) => {
        if (accented) return columnIndex === 0 ? 3 : 0
        return 0.75
      },
      hLineColor: () => lineColor,
      vLineColor: () => lineColor,
      paddingLeft: () => paddingX,
      paddingRight: () => paddingX,
      paddingTop: () => paddingY,
      paddingBottom: () => paddingY,
    },
    margin: [0, 6, 0, 8],
    unbreakable: true,
  }
}

export function horizontalRule(): Content {
  return {
    canvas: [{
      type: 'line',
      x1: 0,
      y1: 0,
      x2: CONTENT_WIDTH,
      y2: 0,
      lineWidth: 0.75,
      lineColor: RULE,
    }],
    margin: [0, 10, 0, 12],
  }
}

export function placeholder(label: string): Content {
  return { text: label, style: 'placeholder', color: MUTED }
}
