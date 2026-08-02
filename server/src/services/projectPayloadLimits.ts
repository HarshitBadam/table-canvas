import { checkRowCount } from '../config/enforce.js';
import { getLimits, type Tier } from '../config/limits.js';
import { ValidationError } from '../middleware/errorHandler.js';

export function validateProjectTierLimits(
  nodes: Record<string, unknown>,
  tier: Tier,
  patches: Record<string, unknown> = {},
): void {
  if (tier === 'google') return;
  const tables = Object.values(nodes).filter((node) => (
    node !== null
    && typeof node === 'object'
    && !Array.isArray(node)
    && ((node as Record<string, unknown>).kind === 'source_table'
      || (node as Record<string, unknown>).kind === 'derived_table')
  ))
  const { maxTablesPerProject } = getLimits(tier);
  if (tables.length > maxTablesPerProject) {
    throw new ValidationError([
      `This project has ${tables.length} tables (limit: ${maxTablesPerProject})`,
    ]);
  }

  for (const table of tables) {
    const record = table as Record<string, unknown>;
    const schema = record.schema;
    let schemaRowCount = 0;
    if (schema !== undefined) {
      if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
        throw new ValidationError([`Table "${String(record.name ?? record.id)}" has an invalid schema`]);
      }
      const value = (schema as Record<string, unknown>).rowCount;
      if (value !== undefined
        && (typeof value !== 'number' || !Number.isInteger(value) || value < 0)) {
        throw new ValidationError([
          `Table "${String(record.name ?? record.id)}" rowCount must be a non-negative integer`,
        ]);
      }
      schemaRowCount = value ?? 0;
    }
    const initialRows = record.kind === 'source_table'
      && record.plan !== null
      && typeof record.plan === 'object'
      && Array.isArray((record.plan as Record<string, unknown>).initialRows)
      ? (record.plan as { initialRows: unknown[] }).initialRows.length
      : 0;
    const tablePatches = patches[String(record.id)];
    const patchRecord = tablePatches !== null && typeof tablePatches === 'object'
      ? tablePatches as Record<string, unknown>
      : {};
    const insertedRows = Array.isArray(patchRecord.insertedRows) ? patchRecord.insertedRows : [];
    const deletedRows = Array.isArray(patchRecord.deletedRows) ? patchRecord.deletedRows : [];
    const insertedRowIds = new Set(
      insertedRows
        .filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object')
        .map(row => row.rowId)
        .filter((rowId): rowId is string => typeof rowId === 'string'),
    );
    const deletedBaseRows = deletedRows.filter(
      (rowId): rowId is string => typeof rowId === 'string' && !insertedRowIds.has(rowId),
    ).length;
    const activeInsertedRows = insertedRows.filter((row) => {
      const rowId = row !== null && typeof row === 'object'
        ? (row as Record<string, unknown>).rowId
        : undefined;
      return typeof rowId === 'string' && !deletedRows.includes(rowId);
    }).length;
    const rowCount = Math.max(0, Math.max(schemaRowCount, initialRows) - deletedBaseRows)
      + activeInsertedRows;
    const rowCountCheck = checkRowCount(rowCount, tier);
    if (!rowCountCheck.ok) {
      throw new ValidationError([
        `Table "${String(record.name ?? record.id)}" has ${rowCount.toLocaleString()} rows (limit: ${rowCountCheck.limit.toLocaleString()})`,
      ]);
    }
  }
}
