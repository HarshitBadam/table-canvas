/**
 * Standalone HTML document for a single report.
 *
 * Used both for the files written into a project ZIP and for the report menu's
 * "Export as HTML" action, so the two produce identical output. Styles are
 * embedded rather than linked so the file stays readable offline on its own.
 */

import type { Report } from '@/report/types'
import { escapeHtml } from './reportHtmlUtils'
import { tiptapToHtml, type EmbeddedDataMap } from './reportHtmlGenerator'

export function generateReportHtml(report: Report, dataMap: EmbeddedDataMap = {}): string {
  let content = ''

  if (report.tiptapContent && report.tiptapContent.content && report.tiptapContent.content.length > 0) {
    content = tiptapToHtml(report.tiptapContent, dataMap)
  } else {
    content = '<p><em>This report is empty.</em></p>'
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(report.name)} - Table Canvas Report</title>
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
    /*
     * Read on screen, a wide table scrolls sideways rather than crushing its
     * columns. The paired gradients are a pure-CSS scroll cue: the white masks
     * scroll with the content (background-attachment: local) and uncover the
     * fixed shadows only on the side where content is still hidden, so a table
     * that fits shows no shadow at all. Scrollbars stay hidden so the gradients
     * are the only affordance, and overscroll is pinned so the table cannot
     * rubber-band away from its edges.
     */
    .table-scroll {
      overflow-x: auto;
      overscroll-behavior-x: none;
      scrollbar-width: none;
      -ms-overflow-style: none;
      margin: 1em 0;
      background:
        linear-gradient(to right, #fff 40%, rgba(255, 255, 255, 0)) left center,
        linear-gradient(to left, #fff 40%, rgba(255, 255, 255, 0)) right center,
        radial-gradient(farthest-side at 0 50%, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0)) left center,
        radial-gradient(farthest-side at 100% 50%, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0)) right center;
      background-repeat: no-repeat;
      background-size: 40px 100%, 40px 100%, 14px 100%, 14px 100%;
      background-attachment: local, local, scroll, scroll;
    }
    .table-scroll::-webkit-scrollbar { display: none; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    /*
     * Fixed layout so the measured column widths in the colgroup are what the
     * browser actually uses; left on auto it would re-sort them by content and
     * undo the sizing. The floor is only published for a table that overflows,
     * so narrow tables never scroll.
     */
    .table-scroll table {
      margin: 0;
      table-layout: fixed;
      min-width: var(--table-min-width, 0);
    }
    thead { display: table-header-group; }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
      overflow-wrap: anywhere;
    }
    th { background: #f7f7f7; }
    caption {
      caption-side: bottom;
      color: #666;
      font-size: 0.9em;
      padding-top: 8px;
    }
    .table-note { color: #666; font-size: 0.85em; }
    .callout {
      border-left: 4px solid #217346;
      background: #f5faf7;
      padding: 0.5em 1em;
      margin: 1em 0;
    }
    .callout-warning { border-left-color: #a16207; background: #fffbeb; }
    .callout-error { border-left-color: #b91c1c; background: #fef2f2; }
    details {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 0.75em 1em;
      margin: 1em 0;
    }
    summary { font-weight: 600; }
    mark { background: #d1fae5; padding: 0 0.1em; }
    a { color: #17653a; }
    .block-placeholder { background: #f0f0f0; border: 1px dashed #ccc; padding: 1em; text-align: center; color: #666; margin: 1em 0; }
    .report-chart { margin: 1.5em 0; padding: 1em; border: 1px solid #ddd; break-inside: avoid; }
    .report-chart h3 { margin: 0; }
    .report-chart svg { display: block; width: 100%; height: auto; }
    .report-chart svg text { fill: #6b7280; font-size: 10px; }
    .chart-subtitle, .report-chart figcaption { color: #666; font-size: 0.85em; }
    .chart-legend { display: flex; flex-wrap: wrap; gap: 0.5em 1em; }
    .chart-legend-item { display: inline-flex; align-items: center; gap: 0.35em; font-size: 0.8em; }
    .chart-legend-item i { width: 0.75em; height: 0.75em; display: inline-block; }
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
      @page {
        size: letter;
        margin: 0.6in;
      }
      body { max-width: none; padding: 0; }
      .footer { display: none; }
      /* Paper cannot scroll: a clipped container would silently drop columns, so
         an overflowing table gives up its floor and compresses to the page. Use
         the PDF export for wide tables — it splits them into bands instead. */
      .table-scroll {
        overflow: visible;
        background: none;
      }
      .table-scroll table {
        min-width: 0;
        width: 100%;
      }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      h1, h2, h3 { break-after: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(report.name)}</h1>
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
