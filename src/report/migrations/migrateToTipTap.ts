/**
 * Migration utility for converting old block format to TipTap JSON
 */

import type { Report, ReportBlock, TipTapContent, TipTapNode } from '../types';

/**
 * Check if a report uses the old block format
 */
export function needsMigration(report: Report): boolean {
  return !report.tiptapContent && report.blocks && report.blocks.length > 0;
}

/**
 * Convert old block format to TipTap JSON content
 */
export function migrateBlocksToTipTap(blocks: ReportBlock[]): TipTapContent {
  const content: TipTapNode[] = [];

  for (const block of blocks) {
    content.push(...convertBlockToNodes(block));
  }

  // Ensure at least one paragraph
  if (content.length === 0) {
    content.push({ type: 'paragraph' });
  }

  return {
    type: 'doc',
    content,
  };
}

/**
 * Convert a single block to one or more TipTap nodes.
 *
 * Most blocks map to a single node; a text block may expand into several
 * paragraphs, so this always returns an array.
 */
function convertBlockToNodes(block: ReportBlock): TipTapNode[] {
  switch (block.type) {
    case 'text':
      return convertTextBlock(block.content);

    case 'heading':
      return [
        {
          type: 'heading',
          attrs: { level: block.level },
          content: block.content ? [{ type: 'text', text: block.content }] : [],
        },
      ];

    case 'divider':
      return [{ type: 'horizontalRule' }];

    case 'chart':
      return [
        {
          type: 'chartBlock',
          attrs: {
            sourceTableId: block.sourceTableId,
            chartType: block.chartType,
            config: block.config,
          },
        },
      ];

    case 'table_snippet':
      return [
        {
          type: 'embeddedTable',
          attrs: {
            sourceTableId: block.sourceTableId,
            selectedColumns: block.selectedColumns,
            rowSelectionMode: block.rowSelectionMode,
            rowLimit: block.rowLimit,
            caption: block.caption,
          },
        },
      ];

    case 'table_inline':
      return [
        {
          type: 'inlineTable',
          attrs: {
            headers: block.data.headers,
            rows: block.data.rows,
            caption: block.caption,
            sourceInfo: block.sourceInfo,
          },
        },
      ];

    case 'table_blank':
      return [
        {
          type: 'editableTable',
          attrs: {
            headers: block.data.headers,
            rows: block.data.rows,
            caption: block.caption,
          },
        },
      ];

    default:
      console.warn(`Unknown block type during migration:`, block);
      return [];
  }
}

/**
 * Convert markdown-like text content to TipTap paragraph nodes, preserving
 * paragraph breaks (double newlines) so no content is dropped.
 */
function convertTextBlock(content: string): TipTapNode[] {
  if (!content || content.trim() === '') {
    return [{ type: 'paragraph' }];
  }

  return content
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => ({
      type: 'paragraph',
      content: parseInlineContent(paragraph),
    }));
}

/**
 * Parse inline content (bold, italic, code, links)
 */
function parseInlineContent(text: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      nodes.push({
        type: 'text',
        text: boldMatch[1],
        marks: [{ type: 'bold' }],
      });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      nodes.push({
        type: 'text',
        text: italicMatch[1],
        marks: [{ type: 'italic' }],
      });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Code: `text`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push({
        type: 'text',
        text: codeMatch[1],
        marks: [{ type: 'code' }],
      });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Link: [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      nodes.push({
        type: 'text',
        text: linkMatch[1],
        marks: [{ type: 'link', attrs: { href: linkMatch[2] } }],
      });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Plain text - take characters until next special character
    const plainMatch = remaining.match(/^[^*`[]+/);
    if (plainMatch) {
      nodes.push({
        type: 'text',
        text: plainMatch[0],
      });
      remaining = remaining.slice(plainMatch[0].length);
      continue;
    }

    // Fallback - take one character
    nodes.push({
      type: 'text',
      text: remaining[0],
    });
    remaining = remaining.slice(1);
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', text: '' }];
}

/**
 * Migrate a report in place
 */
export function migrateReport(report: Report): Report {
  if (!needsMigration(report)) {
    return report;
  }

  return {
    ...report,
    tiptapContent: migrateBlocksToTipTap(report.blocks),
    updatedAt: new Date().toISOString(),
  };
}
