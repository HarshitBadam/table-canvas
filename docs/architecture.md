# Architecture

Computation happens client-side in DuckDB-WASM. The optional server only handles auth and
persistence. If the server isn't reachable, the app runs entirely in the browser (local mode).

```
┌─────────────────────────────────────────────────────────────┐
│                          Browser                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │   React UI  │  │   Zustand   │  │      IndexedDB      │    │
│  │ (Canvas,    │◄─┤   Stores    │◄─┤ (Projects, Files,   │    │
│  │  Grid, etc.)│  │             │  │      Reports)       │    │
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

## Source layout

Major client domains under `src/`:

| Domain | Role |
|--------|------|
| `api/`, `auth/` | Optional backend client and login UI |
| `canvas/`, `grid/`, `charts/`, `dashboard/`, `report/` | Primary views |
| `engine/` | DuckDB worker, DAG helpers, materialization |
| `formula/`, `suggestions/` | Spreadsheet formulas and recommendation engine |
| `persistence/` | Local storage, import/export, merge, sync |
| `state/` | Session orchestration, document lease/mirror, Zustand slices |
| `layout/`, `components/`, `observability/`, `shared/` | Shell, shared UI, telemetry, limits |

Tests are separated from production sources:

- Frontend: `tests/unit/` (mirrors `src/`) and `tests/support/` (`@test/*`)
- Backend: `server/tests/unit/` (mirrors `server/src/`) and `server/tests/support/`
- E2E: `e2e/`

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
(`src/engine/graph/dependencyGraph.ts`). A self-loop, or a target that can already reach the source,
is rejected and the connection is blocked.

### Computation order

`getComputationOrder` does a topological sort so upstream tables are materialized before the
tables that depend on them.

## State management

Zustand stores, with Immer for immutable updates. State is split by subdomain under `src/state/`:

| Area | Path | Responsibility |
|------|------|----------------|
| App session | `app-session/` | Boot, auth (`useAuthState`), autosave, project actions, catalog reconcile |
| Document | `document/` | Per-document identity, write lease, mirror invalidation |
| Project helpers | `project/` | Load/create/duplicate lifecycle |
| Runtime | `runtime/` | Per-tab compute coordination (not persisted) |
| Graph slices | `stores/` | `nodesSlice`, `edgesSlice`, `patchesSlice`, `historySlice`, `selectionSlice`, column ops |

Other stores:

- **`projectStore`**: composed graph state from `stores/`
- **`dataStore`**: temporary in-memory rows while importing/editing; DuckDB is authoritative for materialized rows
- **`tableRuntimeStore`**: per-tab cache/dirty/compute flags kept out of the persisted document
- **`profilingStore`** (`src/lib/profiling/`): per-column profiles
- **`suggestionsStore`** (`src/suggestions/panel/state/`): analysis/cleaning suggestions
- **`reportStore`** (`src/report/`): report documents

`AppProvider` (`src/state/app-session/AppProvider.tsx`, exported through `src/state/AppContext.ts`) ties it
together: it boots the engine, checks auth, loads or creates a project, materializes tables, and
auto-saves when the graph changes.

### Dirty propagation

Editing a source cell updates its patches and marks the node plus every downstream descendant
dirty (`cacheInfo.isDirty = true`). Dirty tables are recomputed the next time they're needed.

### Cross-tab session vs document coordination

Auth cookies are origin-shared; guest choice and explicit sign-out markers are tab-local
(`sessionStorage`). Auth React state is **not** broadcast between tabs. Within a storage scope,
open-document invalidations and project-catalog changes use `BroadcastChannel`, with
`visibilitychange` refreshes as a fallback. Full contract:
[Reliability — Cross-tab authentication and session](reliability.md#cross-tab-authentication-and-session).

## Computation engine

### Web Worker

DuckDB-WASM runs in a dedicated worker (`src/engine/worker/`) so SQL execution never blocks the
UI thread. The main thread talks to it over a small RPC layer (`src/engine/worker/rpc.ts`).

```
Main thread                Worker thread
    │  ── loadTable ──►          │
    │  ◄─ ready ──────           │
    │  ── transform ──►          │
    │  ◄─ result ─────           │
```

### Materialization

`ensureTableMaterialized` (`src/engine/materialization/materializationService.ts`) orchestrates computation:

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

Client persistence is organized under `src/persistence/`:

| Layer | Path | Role |
|-------|------|------|
| Storage scopes + IndexedDB | `storage/` (`local-db/`, `storageScope.ts`) | Owner-scoped projects, files, reports |
| Import / export | `import-export/` | CSV/Excel/ZIP parsers and project ZIP export |
| Cross-device merge | `merge/` | Entity-level merge after HTTP 409 |
| Sync | `sync/files`, `sync/project`, `sync/session` | File GC/upload, project save queue, session sync |
| Report export helpers | `report-export/` | Data extraction for report export |

### IndexedDB

Development uses the clean `table-canvas-v2` database with a single schema version. Earlier
development databases are intentionally not migrated. Records are keyed by owner scope
(`guest:<id>` or `account:<userId>`).

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
  reports: {
    key: string
    value: Report
    indexes: { 'by-updated': string }
  }
}
```

### Server sync

When the backend is available, `syncService`
(`src/persistence/sync/session/syncService.ts`) saves local changes through the API to MongoDB and
loads them back on startup. Saves carry the revision they were based on and the server applies
them only if it still matches, so a save built on stale data is rejected rather than allowed to
overwrite newer work. A rejection is resolved on the client by `projectMerge`, which merges the
last acknowledged base, the local payload, and the current server state entity by entity, and
retries the save against the fresh revision. Only an unmergeable conflict falls back to keeping
the local work as a separate conflict copy. When the backend is unreachable, all of this is
skipped and the app stays purely local.

Within one browser, `documentLease` gives a single tab the right to write a given project while
`documentMirror` invalidates readers over `BroadcastChannel` (readers reload from IndexedDB).
`projectCatalog` fans out create/rename/delete within a storage scope the same way. See
[Reliability](reliability.md) for the ownership and merge contract in full.

## Reports

Report UI lives under `src/report/`:

- `editor/` — TipTap editor, extensions, linked-data nodes (embedded tables/charts), table nodes
- `toolbar/`, `layout/` — chrome around the editor
- `export/`, `pdf/` — HTML/PDF export paths
- `reportStore.ts` — report documents persisted with the project

## Server layout

Optional backend under `server/src/`:

| Path | Role |
|------|------|
| `routes/` | Auth, projects, files, health |
| `services/` | Google auth, storage quota, rate-limit store, files |
| `models/` | Mongoose models |
| `middleware/` | Auth, CSRF, rate limits, errors |
| `config/`, `observability/`, `types/` | Env/enforce, Sentry, shared types |

Backend tests: `server/tests/unit/` and `server/tests/support/`. Typecheck covers both with
`npm --prefix server run typecheck` (`server/tsconfig.test.json`).

## Export

Exporting a project bundles everything into a self-contained ZIP:

```
project.tablecanvas.json   # full state, with base64-encoded source files
data.xlsx                  # every table as a sheet
reports/*.html             # reports as HTML
```

All tables are included as individual sheets in `data.xlsx` inside the ZIP.

## Error boundaries

Each major view (Canvas, Grid, Charts, Dashboard, Reports) is wrapped in
`ErrorBoundary` (`src/observability/ErrorBoundary.tsx`), so a render error in one area
shows a recovery UI instead of taking down the whole app.
