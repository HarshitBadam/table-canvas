import type { JSONContent } from '@tiptap/core'
import type { Content } from 'pdfmake/interfaces'
import type { EmbeddedDataMap } from '@/persistence/reportHtmlGenerator'
import { boxed, horizontalRule } from './boxes'
import { chartBlocks } from './charts'
import { inlineContent, plainText } from './inline'
import { embeddedTableBlocks, inlineTableBlocks } from './dataTables'
import { BRAND, RULE, SUBTLE_FILL } from './theme'

const CALLOUT_VARIANTS: Record<string, { accent: string; fill: string }> = {
  info: { accent: BRAND, fill: '#f2f9f5' },
  warning: { accent: '#b45309', fill: '#fffaeb' },
  error: { accent: '#b91c1c', fill: '#fef3f2' },
  success: { accent: '#15803d', fill: '#f0fdf4' },
}

/** A block the author inserted but never pointed at a data source. */
function isUnconfigured(node: JSONContent): boolean {
  if (node.type !== 'embeddedTable' && node.type !== 'chartBlock') return false
  if (!node.attrs?.sourceTableId) return true
  if (node.type !== 'chartBlock') return false
  const config = (node.attrs.config ?? {}) as Record<string, unknown>
  return !config.xAxis || !config.yAxis
}

function childBlocks(
  node: JSONContent,
  dataMap: EmbeddedDataMap,
  topLevel: boolean,
): Content[] {
  return (node.content ?? []).flatMap((child) => nodeBlocks(child, dataMap, topLevel))
}

/** A list item collapses to its single block, so lists stay tight. */
function listItem(node: JSONContent, dataMap: EmbeddedDataMap): Content {
  const blocks = childBlocks(node, dataMap, false)
  if (blocks.length === 1) return blocks[0]
  return { stack: blocks }
}

export function nodeBlocks(
  node: JSONContent,
  dataMap: EmbeddedDataMap,
  topLevel: boolean,
): Content[] {
  switch (node.type) {
    // An empty paragraph is the editor's spacer — TipTap keeps one at the end of
    // every document — not something the author wrote. Emitting it makes it a
    // block the page flow has to place, which after a landscape table means
    // breaking back to portrait and spending a whole page rendering nothing.
    case 'paragraph': {
      const runs = inlineContent(node.content)
      if (runs.length === 0) return []
      return [{ text: runs, style: 'paragraph' }]
    }

    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 3)
      return [{ text: inlineContent(node.content), style: `h${level}` }]
    }

    case 'bulletList':
      return [{
        ul: (node.content ?? []).map((item) => listItem(item, dataMap)),
        margin: [0, 0, 0, 7],
      }]

    case 'orderedList':
      return [{
        ol: (node.content ?? []).map((item) => listItem(item, dataMap)),
        margin: [0, 0, 0, 7],
      }]

    case 'listItem':
      return [listItem(node, dataMap)]

    case 'blockquote':
      return [boxed(childBlocks(node, dataMap, false), { accent: BRAND, padding: [9, 3] })]

    case 'codeBlock':
      return [boxed([{ text: plainText(node.content), style: 'code' }], {
        border: RULE,
        fill: SUBTLE_FILL,
      })]

    case 'horizontalRule':
      return [horizontalRule()]

    case 'hardBreak':
      return []

    // An unconfigured block is an unfinished editing affordance rather than
    // content, so it is dropped instead of shipped as a placeholder in a document
    // someone else reads. A configured block whose data is missing keeps its
    // placeholder, because dropping real content would hide the failure.
    case 'embeddedTable':
      if (isUnconfigured(node)) return []
      return embeddedTableBlocks(node.attrs ?? {}, dataMap, topLevel)

    case 'chartBlock':
      if (isUnconfigured(node)) return []
      return chartBlocks(node.attrs ?? {}, dataMap)

    case 'inlineTable':
    case 'editableTable':
      return inlineTableBlocks(node.attrs ?? {}, topLevel)

    case 'callout': {
      const variant = CALLOUT_VARIANTS[String(node.attrs?.variant)] ?? CALLOUT_VARIANTS.info
      return [boxed(childBlocks(node, dataMap, false), {
        accent: variant.accent,
        fill: variant.fill,
      })]
    }

    case 'toggle': {
      const title = String(node.attrs?.title || 'Details')
      return [boxed([
        { text: title, bold: true, margin: [0, 0, 0, 4] },
        ...childBlocks(node, dataMap, false),
      ], { border: RULE })]
    }

    default:
      return childBlocks(node, dataMap, topLevel)
  }
}
