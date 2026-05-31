import type { Report } from '@/report/types'
import type { JSONContent } from '@tiptap/core'

function nodeToHtml(node: JSONContent): string {
  if (!node) return ''

  const nodeType = node.type ?? ''

  switch (nodeType) {
    case 'paragraph': {
      const pContent = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<p>${pContent}</p>\n`
    }

    case 'heading': {
      const level = node.attrs?.level || 1
      const hContent = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<h${level}>${hContent}</h${level}>\n`
    }

    case 'text': {
      let text = node.text || ''
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case 'bold':
              text = `<strong>${text}</strong>`
              break
            case 'italic':
              text = `<em>${text}</em>`
              break
            case 'underline':
              text = `<u>${text}</u>`
              break
            case 'code':
              text = `<code>${text}</code>`
              break
          }
        }
      }
      return text
    }

    case 'bulletList': {
      const ulItems = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<ul>${ulItems}</ul>\n`
    }

    case 'orderedList': {
      const olItems = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<ol>${olItems}</ol>\n`
    }

    case 'listItem': {
      const liContent = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<li>${liContent}</li>\n`
    }

    case 'blockquote': {
      const bqContent = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<blockquote>${bqContent}</blockquote>\n`
    }

    case 'codeBlock': {
      const codeContent = node.content?.map((n) => n.text || '').join('') || ''
      return `<pre><code>${codeContent}</code></pre>\n`
    }

    case 'horizontalRule':
      return '<hr>\n'

    case 'hardBreak':
      return '<br>\n'

    case 'tableBlock':
    case 'chartBlock':
      return `<div class="block-placeholder">[${nodeType}]</div>\n`

    default:
      if (node.content) {
        return node.content.map((n) => nodeToHtml(n)).join('')
      }
      return ''
  }
}

function tiptapToHtml(content: JSONContent): string {
  if (!content || !content.content) return ''

  let html = ''
  for (const node of content.content) {
    html += nodeToHtml(node)
  }
  return html
}

interface LegacyBlock {
  type: string
  content?: string
  level?: number
  chartType?: string
  data?: {
    headers?: string[]
    rows?: unknown[][]
  }
}

function renderTableHtml(headers: string[], rows: unknown[][]): string {
  let html = '<table border="1" style="border-collapse: collapse; width: 100%;">\n'
  html += '<thead><tr>'
  for (const header of headers) {
    html += `<th style="padding: 8px; text-align: left;">${header}</th>`
  }
  html += '</tr></thead>\n<tbody>'
  for (const row of rows) {
    html += '<tr>'
    for (const cell of row) {
      html += `<td style="padding: 8px;">${cell ?? ''}</td>`
    }
    html += '</tr>\n'
  }
  html += '</tbody></table>\n'
  return html
}

function blocksToHtml(blocks: LegacyBlock[]): string {
  if (!blocks || blocks.length === 0) return ''

  let html = ''

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        html += `<p>${block.content || ''}</p>\n`
        break
      case 'heading': {
        const level = block.level || 1
        html += `<h${level}>${block.content || ''}</h${level}>\n`
        break
      }
      case 'divider':
        html += '<hr>\n'
        break
      case 'chart':
        html += `<div class="block-placeholder">[Chart: ${block.chartType || 'Unknown'}]</div>\n`
        break
      case 'table_snippet':
        html += `<div class="block-placeholder">[Table Snippet]</div>\n`
        break
      case 'table_inline':
      case 'table_blank':
        if (block.data?.headers && block.data?.rows) {
          html += renderTableHtml(block.data.headers, block.data.rows)
        } else {
          const label = block.type === 'table_inline' ? 'Inline Table' : 'Blank Table'
          html += `<div class="block-placeholder">[${label}]</div>\n`
        }
        break
      default:
        html += `<div class="block-placeholder">[${block.type || 'Unknown Block'}]</div>\n`
    }
  }

  return html
}

export function generateReportHtml(report: Report): string {
  let content = ''

  if (report.tiptapContent && report.tiptapContent.content && report.tiptapContent.content.length > 0) {
    content = tiptapToHtml(report.tiptapContent)
  } else if (report.blocks && report.blocks.length > 0) {
    content = blocksToHtml(report.blocks)
  } else {
    content = '<p><em>This report is empty.</em></p>'
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.name} - Table Canvas Report</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      color: #1a1a1a;
    }
    h1 { font-size: 2em; border-bottom: 2px solid #217346; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    p { margin: 1em 0; }
    ul, ol { margin: 1em 0; padding-left: 2em; }
    li { margin: 0.5em 0; }
    blockquote {
      border-left: 4px solid #217346;
      margin: 1em 0;
      padding: 0.5em 1em;
      background: #f9f9f9;
    }
    pre {
      background: #f4f4f4;
      padding: 1em;
      border-radius: 4px;
      overflow-x: auto;
    }
    code {
      background: #f4f4f4;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'Monaco', 'Consolas', monospace;
    }
    pre code {
      background: none;
      padding: 0;
    }
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 2em 0;
    }
    .block-placeholder {
      background: #f0f0f0;
      border: 1px dashed #ccc;
      padding: 1em;
      text-align: center;
      color: #666;
      margin: 1em 0;
    }
    .report-meta {
      color: #666;
      font-size: 0.9em;
      margin-bottom: 2em;
      padding-bottom: 1em;
      border-bottom: 1px solid #eee;
    }
    .footer {
      margin-top: 3em;
      padding-top: 1em;
      border-top: 1px solid #eee;
      color: #666;
      font-size: 0.8em;
    }
    @media print {
      body { padding: 20px; }
      .footer { display: none; }
    }
  </style>
</head>
<body>
  <h1>${report.name}</h1>
  <div class="report-meta">
    Created: ${new Date(report.createdAt).toLocaleDateString()}<br>
    Last updated: ${new Date(report.updatedAt).toLocaleDateString()}
  </div>
  
  <div class="content">
    ${content}
  </div>
  
  <div class="footer">
    Exported from Table Canvas on ${new Date().toLocaleDateString()}
  </div>
</body>
</html>`
}
