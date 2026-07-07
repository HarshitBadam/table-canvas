import { describe, it, expect } from 'vitest';
import { needsMigration, migrateBlocksToTipTap, migrateReport } from './migrateToTipTap';
import type { Report, ReportBlock } from '../types';

const now = '2024-01-01T00:00:00.000Z';

function baseReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    name: 'Test',
    blocks: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function textBlock(content: string): ReportBlock {
  return { id: 't', type: 'text', content, createdAt: now, updatedAt: now };
}

describe('needsMigration', () => {
  it('is true for a legacy report with blocks and no tiptapContent', () => {
    expect(needsMigration(baseReport({ blocks: [textBlock('hi')] }))).toBe(true);
  });

  it('is false when tiptapContent already exists', () => {
    expect(
      needsMigration(
        baseReport({
          blocks: [textBlock('hi')],
          tiptapContent: { type: 'doc', content: [] },
        })
      )
    ).toBe(false);
  });

  it('is false when there are no blocks', () => {
    expect(needsMigration(baseReport({ blocks: [] }))).toBe(false);
  });
});

describe('migrateBlocksToTipTap', () => {
  it('preserves every paragraph in a multi-paragraph text block', () => {
    const doc = migrateBlocksToTipTap([textBlock('First para.\n\nSecond para.\n\nThird para.')]);
    const paragraphs = doc.content.filter((n) => n.type === 'paragraph');
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0].content?.[0].text).toBe('First para.');
    expect(paragraphs[2].content?.[0].text).toBe('Third para.');
  });

  it('maps a chart block to a chartBlock node', () => {
    const block: ReportBlock = {
      id: 'c',
      type: 'chart',
      sourceTableId: 'tbl',
      chartType: 'bar',
      config: { xAxis: 'a', yAxis: 'b' },
      createdAt: now,
      updatedAt: now,
    };
    const doc = migrateBlocksToTipTap([block]);
    expect(doc.content[0].type).toBe('chartBlock');
    expect(doc.content[0].attrs).toMatchObject({ sourceTableId: 'tbl', chartType: 'bar' });
  });

  it('maps a table_snippet block to an embeddedTable node', () => {
    const block: ReportBlock = {
      id: 's',
      type: 'table_snippet',
      sourceTableId: 'tbl',
      selectedColumns: ['x'],
      rowSelectionMode: 'first_n',
      rowLimit: 5,
      createdAt: now,
      updatedAt: now,
    };
    const doc = migrateBlocksToTipTap([block]);
    expect(doc.content[0].type).toBe('embeddedTable');
    expect(doc.content[0].attrs).toMatchObject({
      sourceTableId: 'tbl',
      rowSelectionMode: 'first_n',
      rowLimit: 5,
    });
  });

  it('always produces at least one node', () => {
    const doc = migrateBlocksToTipTap([]);
    expect(doc.content.length).toBeGreaterThan(0);
  });
});

describe('migrateReport', () => {
  it('returns the report unchanged when no migration is needed', () => {
    const report = baseReport({ tiptapContent: { type: 'doc', content: [] } });
    expect(migrateReport(report)).toBe(report);
  });

  it('adds tiptapContent for a legacy report', () => {
    const report = baseReport({ blocks: [textBlock('hello')] });
    const migrated = migrateReport(report);
    expect(migrated.tiptapContent).toBeDefined();
    expect(migrated.tiptapContent?.content[0].type).toBe('paragraph');
  });
});
