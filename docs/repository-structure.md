# Repository structure

This is a guided map of the repository. It names the files and folders that define each subsystem rather than listing every component or test.

## Top level

```text
.
├── src/                     Browser application
├── server/                  Optional Express and MongoDB backend
├── tests/                   Frontend Vitest suites and support
├── e2e/                     Playwright workflows and UX contracts
├── data/                    Shared workbook fixture
├── docs/                    Product and engineering documentation
├── scripts/                 Repository checks and Docker smoke helpers
├── .github/workflows/       CI, manual suites, and releases
├── docker-compose.yml       Local full stack
├── docker-compose.prod.yml  Production container smoke stack
├── vite.config.ts           Frontend build and development proxy
├── vitest.config.ts         Frontend test and coverage configuration
├── playwright.config.ts     Browser test configuration
├── eslint.config.js         Lint rules and file-size policy
├── knip.json                Dead-code and dependency-cycle checks
├── vercel.json              Frontend deployment and API rewrite
└── render.yaml              Backend deployment blueprint
```

## Browser application

`src/main.tsx` initializes the router, theme, application provider, and client telemetry. `src/layout/App.tsx` defines the application routes and lazy view boundaries.

| Area | Important paths | Responsibility |
|---|---|---|
| API | `api/client.ts`, `api/auth.api.ts` | Cookie-authenticated requests to the optional backend |
| Authentication | `auth/LoginPage.tsx`, `auth/GoogleSignInButton.tsx` | Guest, password, and Google entry paths |
| Canvas | `canvas/CanvasView.tsx`, `canvas/nodes/`, `canvas/modals/` | ReactFlow pipeline editor, nodes, and transform creation |
| Charts | `charts/ChartView.tsx`, `charts/ChartBuilder.tsx`, `charts/renderers/` | Chart configuration and rendering |
| Dashboard | `dashboard/Dashboard.tsx`, `dashboard/components/` | Project summary, lineage, and quick actions |
| Discovery | `discovery/DiscoveryTourProvider.tsx`, `discovery/discoveryTourDefinitions.ts` | Contextual onboarding tours and persistence |
| Grid | `grid/GridView.tsx`, `grid/editing/`, `grid/filtering/`, `grid/interaction/`, `grid/view/` | Virtualized table viewing, selection, filtering, and editing |
| Layout | `layout/App.tsx`, `layout/navigation/`, `layout/project-controls/` | Routing, sidebar navigation, history shortcuts, and project controls |
| Reports | `report/ReportView.tsx`, `report/editor/`, `report/pdf/`, `report/export/` | TipTap documents, linked data blocks, and export |
| Shared UI | `components/`, `styles/` | Reusable components, theme, and global styling |

## Computation and analysis

```text
src/
├── engine/
│   ├── EngineAdapter.ts
│   ├── graph/                   Dependency traversal, cycle checks, ordering
│   ├── materialization/         Topological execution, caching, invalidation
│   ├── parsing/                 CSV and workbook parsing
│   └── worker/                  DuckDB worker, RPC, scheduling, table operations
├── formula/
│   ├── evaluation/              Parser, canonicalization, and evaluation
│   ├── functions/               Math, text, date, and logic functions
│   └── suggestions/             Formula completion patterns
├── lib/profiling/               Column statistics and semantic hints
└── suggestions/
    ├── engine/rules/            Analysis, cleaning, and recipe rules
    ├── cleaning/                Cleaning application flow
    ├── commands/                Executable suggestion commands
    └── panel/state/             Suggestion UI state
```

`src/engine/materialization/materializationService.ts` is the main entry point for dependency-aware computation. `src/engine/worker/engine.worker.ts` owns the in-browser DuckDB instance, and `src/engine/worker/rpc.ts` is the main-thread boundary.

## State and editing history

```text
src/state/
├── app-session/                 Boot, auth, autosave, catalog reconciliation
├── document/                    Write lease, read-only mirror, deletion guards
├── project/                     Project lifecycle and preparation
├── runtime/                     Per-tab operations and background refresh
├── stores/
│   ├── nodes/                   Table, chart, and column operations
│   ├── nodesSlice.ts
│   ├── edgesSlice.ts
│   ├── patchesSlice.ts
│   ├── historySlice.ts
│   └── selectionSlice.ts
├── projectStore.ts              Composed persisted project graph
├── dataStore.ts                 Temporary in-memory row data
└── tableRuntimeStore.ts         Dirty, schema, and compute state
```

`stores/historySlice.ts` coordinates project-wide undo and redo. It restores graph snapshots, reconciles changed tables, invalidates affected descendants, retains files referenced by history, and keeps report-editor history separate.

## Persistence and synchronization

```text
src/persistence/
├── storage/
│   ├── local-db/                IndexedDB projects, files, reports, sync state
│   ├── storageScope.ts          Guest and account ownership keys
│   └── legacyGuestMigration.ts
├── import-export/
│   ├── import/                  File inspection, staging, and import lifecycle
│   └── export/                  Project ZIP and workbook generation
├── merge/                       Three-way project conflict merge
├── sync/
│   ├── files/                   Upload, download, garbage collection
│   ├── project/                 Durable save queue and conflict retry
│   └── session/                 Login promotion and sync orchestration
└── report-export/               Report data extraction and HTML helpers
```

The authoritative local database entry point is `src/persistence/storage/local-db/db.ts`. Project synchronization begins in `src/persistence/sync/project/projectSync.ts`; stale server revisions are handled under `sync/project/save/` and merged by `src/persistence/merge/projectMerge.ts`.

## Optional backend

```text
server/
├── src/
│   ├── index.ts                 Express bootstrap and health endpoints
│   ├── config/
│   │   ├── env.ts               Environment validation
│   │   ├── db.ts                MongoDB connection
│   │   ├── enforce.ts           Server-side boundary enforcement
│   │   └── limits.ts            Mirrored account and project limits
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── projects.ts
│   │   └── files.ts
│   ├── middleware/              Auth, CSRF, rate limits, error handling
│   ├── models/                  User and Project Mongoose models
│   ├── services/                Auth, files, leases, quotas, and rate limits
│   ├── observability/sentry.ts
│   └── types/index.ts
├── tests/
│   ├── unit/                    Suites mirroring server/src
│   └── support/                 MongoDB and route test helpers
└── scripts/seed.ts              Local demo-user seed
```

`server/src/config/limits.ts` intentionally mirrors `src/shared/limits.ts`. Changes to account tiers or payload limits must update both files.

## Tests

| Location | Purpose |
|---|---|
| `tests/unit/` | Frontend unit and integration suites, organized like `src/` |
| `tests/support/` | Shared setup, IndexedDB support, and tab fakes |
| `server/tests/unit/` | Backend route, service, model, and middleware suites |
| `server/tests/support/` | MongoDB Memory Server and request helpers |
| `e2e/*.spec.ts` | Import, transform, report, formula, ownership, and discovery workflows |
| `e2e/ux/` | Visual, accessibility, keyboard, geometry, and performance contracts |

## Where to start reading

Follow one path based on the behavior you want to understand:

1. **Application boot:** `src/main.tsx` → `src/layout/App.tsx` → `src/state/app-session/AppProvider.tsx`
2. **Import to query:** `src/components/ImportButton.tsx` → `src/persistence/import-export/import/importParsers.ts` → `src/engine/EngineAdapter.ts`
3. **DAG computation:** `src/engine/graph/workflowGraph.ts` → `src/engine/materialization/materializationService.ts` → `src/engine/worker/engine.worker.ts`
4. **Cell edit to recompute:** `src/grid/editing/useGridEditing.ts` → `src/state/stores/patchesSlice.ts` → `src/state/tableRuntimeStore.ts`
5. **Offline and server save:** `src/state/app-session/persistence/useProjectAutosave.ts` → `src/persistence/storage/local-db/` → `src/persistence/sync/project/projectSync.ts`
6. **Cross-tab ownership:** `src/state/document/useDocumentCoordination.ts` → `documentLease.ts` → `documentMirror.ts`

Continue with [Architecture](architecture.md) for the runtime model or [Testing](testing.md) for the verification strategy.
