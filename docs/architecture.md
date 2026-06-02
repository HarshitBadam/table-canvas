# Architecture

Computation happens client-side in DuckDB-WASM. The optional server only handles auth and
persistence. If the server isn't reachable, the app runs entirely in the browser (local mode).

```
┌─────────────────────────────────────────────────────────────┐
│                          Browser                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │   React UI  │  │   Zustand   │  │      IndexedDB      │    │
│  │ (Canvas,    │◄─┤   Stores    │◄─┤  (Projects, Files,  │    │
│  │  Grid, etc.)│  │             │  │   Cache, Reports)   │    │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘    │
│         │                │                                    │
│         │         ┌──────▼───────┐                            │
│         └────────►│  Web Worker  │                            │
│                   │  DuckDB-WASM │                            │
│                   └──────────────┘                            │
└─────────────────────────────────────────────────────────────┘
                            │
                       (optional sync)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                          Server                               │
│   Express routes ─► services ─► MongoDB (users, projects)     │
└─────────────────────────────────────────────────────────────┘
```

## The DAG

A project is a directed acyclic graph. Nodes are tables and charts; edges are transforms that
turn upstream tables into downstream ones.

### Node types

| Kind | Description |
|------|-------------|
| `source_table` | Imported CSV/Excel or a manually created table. Holds a file reference, schema, and patches (cell edits). |
| `derived_table` | Computed from a transform applied to one or more upstream tables. Read-only. |
| `chart` | A visualization bound to a source table. |

See `src/types/node.types.ts` and `src/types/transform.types.ts` for the exact shapes.

### Edges

```typescript
interface Edge {
  id: string
  fromNodeId: string      // upstream (data source)
  toNodeId: string        // downstream (dependent)
  transformType: TransformType
}
```

### Cycle detection

Before an edge is created, the graph is checked for cycles with a reachability test
(`src/engine/dependencyGraph.ts`). A self-loop, or a target that can already reach the source,
is rejected and the connection is blocked.

### Computation order

`getComputationOrder` does a topological sort so upstream tables are materialized before the
tables that depend on them.

## State management

Zustand stores, with Immer for immutable updates. The main ones:

- **`projectStore`**: the graph itself, composed from slices in `src/state/stores/`:
  `nodesSlice`, `edgesSlice`, `patchesSlice` (cell edits / row ops), `historySlice` (undo/redo),
  `selectionSlice`, plus `nodesColumnOps` for column-level operations.
- **`dataStore`**: in-memory row data for loaded tables.
- **`profilingStore`** (`src/lib/profiling/`): per-column profiles (see below).
- **`suggestionsStore`**: analysis/cleaning suggestions.
- **`reportStore`**: report documents.

`AppContext` (`src/state/AppContext.tsx`) ties it together: it boots the engine, checks auth,
loads or creates a project, materializes tables, and auto-saves (debounced ~1.5s) when the graph
changes.

### Dirty propagation

Editing a source cell updates its patches and marks the node plus every downstream descendant
dirty (`cacheInfo.isDirty = true`). Dirty tables are recomputed the next time they're needed.

## Computation engine

### Web Worker

DuckDB-WASM runs in a dedicated worker (`src/engine/worker/`) so SQL execution never blocks the
UI thread. The main thread talks to it over a small RPC layer (`worker/rpc.ts`).

```
Main thread                Worker thread
    │  ── loadTable ──►          │
    │  ◄─ ready ──────           │
    │  ── transform ──►          │
    │  ◄─ result ─────           │
```

### Materialization

`ensureTableMaterialized` (`src/engine/materializationService.ts`) orchestrates computation:

1. Dedupe: an `inProgressMaterializations` map prevents duplicate concurrent requests.
2. Resolve the computation order (topological sort).
3. Materialize each node in order; the queue chains promises so execution stays sequential.
4. Update cache info.

### Cache invalidation

Version hashes decide whether cached data is stale:

```typescript
// source table
hash = simpleHash(`source:${tableId}:${fileRef}:${patchVersion}`)

// derived table
hash = simpleHash(`derived:${tableId}:${transformDefJson}:${upstreamHashes}`)
```

If a hash matches the cached one, the cached result is reused; otherwise it recomputes.

## Profiling

When a table is opened, the profiler (`src/lib/profiling/`) computes per-column statistics in
two phases: phase 1 is fast (counts, null rate, basic types) and phase 2 fills in the heavier
stats asynchronously. Profiles also get semantic hints (e.g. "looks like an email/date column").
These feed the grid's column stats, the dashboard, and the suggestion engine.

## Transforms

Six transform types (`TransformType` in `src/types/transform.types.ts`). Each has its own
definition shape:

### filter
```typescript
{ type: 'filter', sourceTableId, conditions: FilterCondition[], logic: 'and' | 'or' }
```
Operators: equals, not_equals, contains, not_contains, starts_with, ends_with, greater_than,
less_than, greater_equal, less_equal, between, is_null, is_not_null.

### group_summarize
```typescript
{
  type: 'group_summarize',
  sourceTableId,
  groupByColumns: string[],
  aggregations: [{ columnId, operation: 'sum'|'avg'|'min'|'max'|'count'|'count_distinct', alias }]
}
```

### join
```typescript
{ type: 'join', leftTableId, rightTableId, joinType: 'inner'|'left'|'right'|'full', leftKey, rightKey,
  leftColumns?, rightColumns?, columnPrefix? }
```

### select
Column projection and renaming.
```typescript
{ type: 'select', sourceTableId, columns: [{ sourceColumnId, newName?, include }] }
```

### calculated_column
Adds a column from a formula expression.
```typescript
{ type: 'calculated_column', sourceTableId, newColumnName, expression }
```

### union
Stacks rows from multiple tables.
```typescript
{ type: 'union', sourceTableIds: string[] }
```

## Persistence

### IndexedDB

```typescript
interface TableCanvasDB {
  projects: {
    key: string
    value: { id, name, nodes, edges, patches, createdAt, updatedAt }
    indexes: { 'by-updated': string }
  }
  files: {
    key: string
    value: { id, name, type, data: ArrayBuffer, createdAt }
  }
  cache: {
    key: [string, string]   // [tableId, type]
    value: { tableId, type: 'profile'|'slice'|'aggregation', data, computedAt }
    indexes: { 'by-table': string }
  }
  reports: {
    key: string
    value: Report
    indexes: { 'by-updated': string }
  }
}
```

### Server sync

When the backend is available, `syncService` saves local changes through the API to MongoDB and
loads them back on startup. There's no conflict resolution — the last write wins. When the
backend is unreachable, all of this is skipped and the app stays purely local.

## Export

Exporting a project bundles everything into a self-contained ZIP:

```
project.tablecanvas.json   # full state, with base64-encoded source files
data.xlsx                  # every table as a sheet
reports/*.html             # reports as HTML
```

All tables are included as individual sheets in `data.xlsx` inside the ZIP.

## Error boundaries

Each major view (Canvas, Grid, Charts, Dashboard, Reports) is wrapped in an `ErrorBoundary`,
so a render error in one area shows a recovery UI instead of taking down the whole app.
