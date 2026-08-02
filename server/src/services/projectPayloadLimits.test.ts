import { describe, expect, it } from 'vitest';
import { LIMITS } from '../config/limits.js';
import { validateProjectTierLimits } from './projectPayloadLimits.js';

function sourceTable(id: string, rowCount: number) {
  return {
    id,
    kind: 'source_table',
    name: `Table ${id}`,
    ui: { position: { x: 0, y: 0 } },
    schema: { columns: [], rowCount },
    plan: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('validateProjectTierLimits', () => {
  it('rejects a project over the table limit', () => {
    const nodes = Object.fromEntries(
      Array.from({ length: LIMITS.guest.maxTablesPerProject + 1 }, (_, index) => [
        `table-${index}`,
        sourceTable(`table-${index}`, 1),
      ]),
    );
    expect(() => validateProjectTierLimits(nodes, 'guest')).toThrow();
  });

  it('counts rows inserted through patches', () => {
    const nodes = { table: sourceTable('table', LIMITS.guest.maxRowsPerTable) };
    const patches = {
      table: {
        deletedRows: [],
        insertedRows: [{ rowId: 'new-row', values: {}, insertedAt: 25_000 }],
      },
    };
    expect(() => validateProjectTierLimits(nodes, 'guest', patches)).toThrow();
  });
});
