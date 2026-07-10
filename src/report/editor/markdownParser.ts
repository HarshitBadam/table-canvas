import type { JSONContent } from '@tiptap/react';

function parseInlineFormatting(text: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Bold: **text**
    let match = remaining.match(/^\*\*(.+?)\*\*/);
    if (match) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'bold' }] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic: *text*
    match = remaining.match(/^\*([^*]+)\*/);
    if (match) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'italic' }] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Code: `text`
    match = remaining.match(/^`([^`]+)`/);
    if (match) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'code' }] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Link: [text](url)
    match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'link', attrs: { href: match[2] } }] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Plain text
    match = remaining.match(/^[^*`[]+/);
    if (match && match[0]) {
      nodes.push({ type: 'text', text: match[0] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    nodes.push({ type: 'text', text: remaining[0] });
    remaining = remaining.slice(1);
  }

  return nodes;
}

export function markdownToTipTapContent(markdown: string): JSONContent[] {
  const lines = markdown.split('\n');
  const content: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      content.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const text = headingMatch[2];
      const inlineContent = parseInlineFormatting(text);
      content.push({
        type: 'heading',
        attrs: { level },
        content: inlineContent.length > 0 ? inlineContent : [{ type: 'text', text: '' }],
      });
      i++;
      continue;
    }

    // Code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      content.push({
        type: 'codeBlock',
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.slice(2);
      content.push({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: parseInlineFormatting(quoteText) }],
      });
      i++;
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: JSONContent[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*]\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineFormatting(itemText) }],
        });
        i++;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: JSONContent[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineFormatting(itemText) }],
        });
        i++;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    // Markdown table (| col1 | col2 |)
    if (isMarkdownTable(lines, i)) {
      const { rows, endIndex } = parseMarkdownTable(lines, i);
      if (rows.length > 0) {
        const headers = rows[0];
        const dataRows = rows.slice(1);

        content.push({
          type: 'editableTable',
          attrs: {
            headers: headers,
            rows: dataRows.length > 0 ? dataRows : [headers.map(() => '')],
            initialized: true, // Important: skip the dimension picker dialog
          },
        });
      }
      i = endIndex;
      continue;
    }

    // Paragraph
    content.push({
      type: 'paragraph',
      content: parseInlineFormatting(trimmed),
    });
    i++;
  }

  return content;
}

export function isMarkdownContent(text: string): boolean {
  return /^#{1,6}\s/m.test(text) ||
         /^[-*]\s+\S/m.test(text) ||
         /^[-*_]{3,}$/m.test(text) ||
         /^\d+\.\s+/m.test(text) ||
         /^>\s/m.test(text) ||
         /```/.test(text) ||
         /^\|.+\|$/m.test(text);
}

function isMarkdownTable(lines: string[], startIndex: number): boolean {
  if (startIndex >= lines.length) return false;
  const line = lines[startIndex].trim();

  if (!line.includes('|')) return false;

  const pipeCount = (line.match(/\|/g) || []).length;
  if (pipeCount < 1) return false;

  if (startIndex + 1 < lines.length) {
    const nextLine = lines[startIndex + 1].trim();
    if (/^\|?[\s]*[-:]+[\s]*\|/.test(nextLine) || /[-:]+[\s]*\|[\s]*[-:]/.test(nextLine)) {
      return true;
    }
  }

  if (pipeCount >= 2) {
    if (startIndex + 1 < lines.length) {
      const nextLine = lines[startIndex + 1].trim();
      if (nextLine.includes('|') && nextLine.includes('-')) {
        return true;
      }
    }
  }

  return false;
}

function parseMarkdownTable(lines: string[], startIndex: number): { rows: string[][]; endIndex: number } {
  const rows: string[][] = [];
  let i = startIndex;
  let maxCols = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line || !line.includes('|')) break;

    // Skip separator row (contains only |, -, :, and spaces)
    if (/^[\s|:-]+$/.test(line) && line.includes('-')) {
      i++;
      continue;
    }

    let cells: string[];
    if (line.startsWith('|')) {
      cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim());
    } else {
      cells = line.split('|').map(cell => cell.trim());
    }

    if (cells.length > 0 && cells.some(c => c.length > 0)) {
      rows.push(cells);
      maxCols = Math.max(maxCols, cells.length);
    }
    i++;
  }

  const normalizedRows = rows.map(row => {
    if (row.length < maxCols) {
      return [...row, ...Array(maxCols - row.length).fill('')];
    }
    return row;
  });

  return { rows: normalizedRows, endIndex: i };
}

export function isTabularData(text: string): boolean {
  const lines = text.trim().split('\n');
  if (lines.length < 1) return false;

  const tabCounts = lines.map(line => (line.match(/\t/g) || []).length);
  const hasConsistentTabs = tabCounts.length > 1 && tabCounts[0] > 0 &&
    tabCounts.every(count => count === tabCounts[0]);

  return hasConsistentTabs;
}

export function parseTabularData(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text.trim().split('\n').filter(line => line.trim());
  if (lines.length < 1) return null;

  const rows = lines.map(line => line.split('\t').map(cell => cell.trim()));

  const headers = rows[0];
  const dataRows = rows.slice(1);

  const colCount = headers.length;
  const normalizedRows = dataRows.map(row => {
    if (row.length < colCount) {
      return [...row, ...Array(colCount - row.length).fill('')];
    }
    return row.slice(0, colCount);
  });

  return { headers, rows: normalizedRows };
}
