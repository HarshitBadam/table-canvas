/**
 * Maps raw engine (DuckDB) error strings into a friendlier title + plain
 * English explanation for the GridView error panel. The raw message is
 * always still shown (collapsed, under "Show raw error"), this only
 * decides the headline copy shown above it.
 */
export interface EngineErrorPresentation {
  title: string
  description: string
}

function defaultPresentation(nodeKind: string): EngineErrorPresentation {
  return nodeKind === 'derived_table'
    ? {
        title: 'Computation Error',
        description: 'This table could not be computed. Your source data and edits are unchanged.',
      }
    : {
        title: 'Data Loading Error',
        description: 'This table could not be loaded. Your saved data is unchanged.',
      }
}

export function describeEngineError(rawError: string, nodeKind: string): EngineErrorPresentation {
  if (/row.{0,3}safety limit|too many rows/i.test(rawError)) {
    return {
      title: 'Result Too Large',
      description: rawError,
    }
  }

  if (/out of memory/i.test(rawError)) {
    return nodeKind === 'derived_table'
      ? {
          title: 'Ran Out of Memory',
          description:
            'This computation produced more data than the browser tab can hold in memory. This usually happens when a join key has duplicate values on one or both sides, so matching rows multiply instead of lining up one-to-one. Edit the join to use a more unique key, filter the input tables first, or use a smaller join type (e.g. inner/left instead of full).',
        }
      : {
          title: 'Ran Out of Memory',
          description:
            'This file used more memory than the browser tab can hold. Try splitting it into smaller files before importing.',
        }
  }

  return defaultPresentation(nodeKind)
}
