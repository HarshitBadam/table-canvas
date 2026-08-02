import type { JSONContent } from '@tiptap/core'
import type { Content, ContentText, Decoration } from 'pdfmake/interfaces'
import { safeLink } from '@/persistence/reportHtmlUtils'
import { BRAND, HIGHLIGHT_FILL, SUBTLE_FILL } from './theme'

/**
 * pdfmake consumes plain strings, so text is passed through verbatim — running
 * it through an HTML escaper would print the entities literally.
 */
function textLeaf(node: JSONContent): ContentText {
  const leaf: ContentText = { text: node.text ?? '' }
  const decorations: Decoration[] = []

  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold':
        leaf.bold = true
        break
      case 'italic':
        leaf.italics = true
        break
      case 'underline':
        decorations.push('underline')
        break
      case 'strike':
        decorations.push('lineThrough')
        break
      case 'highlight':
        leaf.background = HIGHLIGHT_FILL
        break
      case 'code':
        leaf.background = SUBTLE_FILL
        break
      case 'link': {
        const href = safeLink(mark.attrs?.href)
        if (href) {
          leaf.link = href
          leaf.color = BRAND
          decorations.push('underline')
        }
        break
      }
    }
  }

  if (decorations.length === 1) leaf.decoration = decorations[0]
  else if (decorations.length > 1) leaf.decoration = decorations

  return leaf
}

/** Flattens a node's inline children into the runs of a single text paragraph. */
export function inlineContent(nodes: JSONContent[] | undefined): Content[] {
  if (!nodes) return []

  const runs: Content[] = []
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      runs.push('\n')
      continue
    }
    if (node.type === 'text') {
      runs.push(textLeaf(node))
      continue
    }
    if (node.content) runs.push(...inlineContent(node.content))
  }
  return runs
}

/** Concatenates the plain text of a subtree, for contexts that take no markup. */
export function plainText(nodes: JSONContent[] | undefined): string {
  if (!nodes) return ''
  return nodes.map((node) => node.text ?? plainText(node.content)).join('')
}
