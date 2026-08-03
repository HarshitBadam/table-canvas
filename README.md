# Table Canvas

Table Canvas replaces the spreadsheet grid-of-formulas with a node graph: import a file, drop it
on a canvas, and wire it into filters, joins, group-bys, and calculated columns that produce new
tables you can see, trace, and rerun. Every derived table remembers exactly which transform and
which upstream tables produced it, so the pipeline is never hidden inside a cell reference.

Under the hood it's a real analytical engine, not a UI trick: DuckDB-WASM runs actual SQL against
your data inside a Web Worker, entirely in the browser, so nothing is uploaded anywhere. The
project graph is a reactive DAG — change a source table and every downstream derived table,
chart, and report block that depends on it is marked dirty and recomputes automatically. From the
same project you also get a virtualized grid with spreadsheet-style formula columns, an
auto-suggestion engine that profiles your data and proposes cleanups and charts, a live dashboard
with lineage, and a Notion-style report editor with embedded, always-in-sync tables and charts.

Everything persists locally in IndexedDB by default — full offline, no account needed. An
optional Express + MongoDB backend adds login and cross-device sync on top, with multi-tab
editing handled safely (one tab owns writes at a time; others mirror it live).

> Built solo. Core technical pieces: DuckDB-WASM for in-browser SQL, a reactive DAG compute
> engine, and a ReactFlow canvas.

## Quick start

Frontend only. No Docker, no database, no config.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and choose **Continue as guest** for a browser-local
workspace. Set `VITE_AUTO_GUEST=true` only when automatic guest startup is useful
during development.

For the full stack (auth + sync) with Docker:

```bash
npm run docker:up      # MongoDB + backend + frontend
npm run docker:seed    # optional sample data
npm run docker:down    # stop
```

See [docs/setup.md](docs/setup.md) for environment variables and the manual backend setup.

## Docs

| Document | What's in it |
|----------|--------------|
| [Setup](docs/setup.md) | Run modes, environment variables, troubleshooting |
| [Architecture](docs/architecture.md) | DAG, engine, state, materialization, persistence |
| [Session and data reliability](docs/reliability.md) | Guest/account isolation, tabs, promotion, concurrency, quotas |
| [Production deployment](docs/production.md) | Vercel, backend, backups, monitoring, release and rollback |
| [Features](docs/features.md) | Canvas, grid, formulas, transforms, charts, dashboard, reports |
| [API](docs/api.md) | REST endpoints for the optional backend |
| [Testing](docs/testing.md) | How to run tests, where they live, CI |

## How it works

1. Import a file (or create a table). It's parsed, typed, stored in IndexedDB, and loaded into DuckDB.
2. The project is a directed acyclic graph (DAG): nodes are tables/charts, edges are transforms.
3. Connecting two nodes opens a transform modal (filter, join, group, etc.) and creates a derived table.
4. DuckDB-WASM (running in a Web Worker) executes the SQL and materializes results.
5. When upstream data changes, downstream tables are marked dirty and recomputed on demand.
6. View data in the grid, build charts, see a project overview on the dashboard, or write reports.

## Tech stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| UI | React 18 + TypeScript | Component architecture and type safety |
| Engine | DuckDB-WASM | In-browser SQL execution (in a Web Worker) |
| State | Zustand + Immer | DAG state and immutable updates |
| Canvas | ReactFlow + Dagre | Node graph and auto-layout |
| Charts | Recharts | Bar / line / pie / scatter |
| Reports | TipTap | Notion-style rich-text editor |
| Persistence | IndexedDB (`idb`) | Local storage, offline-capable |
| Parsing/Export | PapaParse, xlsx, JSZip | CSV/Excel import and project export |
| Backend (optional) | Express + MongoDB | Auth and cross-device sync |

## Project structure

```
src/
├── api/             # HTTP client for the optional backend
├── auth/            # Login and early-access pages
├── canvas/          # ReactFlow canvas, nodes, transform modals
├── charts/          # Chart builder + renderers
├── components/      # Shared UI (import, theme, banners)
├── dashboard/       # Project overview and lineage
├── engine/          # DuckDB-WASM adapter, DAG, materialization, worker
├── formula/         # Spreadsheet formula parser + evaluator
├── grid/            # Virtualized spreadsheet grid
├── layout/          # App shell, sidebar, header, project controls
├── lib/             # Utilities (column profiling)
├── observability/   # Error boundary and frontend telemetry
├── persistence/     # IndexedDB, import/export, merge, server sync
│   ├── storage/     # Storage scopes + local-db
│   ├── import-export/
│   ├── merge/       # Cross-device conflict merge
│   └── sync/        # files / project / session sync
├── report/          # TipTap reports, toolbar, PDF/HTML export
│   └── editor/      # Extensions and embedded table/chart nodes
├── shared/          # Shared client limits/enforcement helpers
├── state/           # Zustand stores + session orchestration
│   ├── app-session/ # Auth, boot, autosave, catalog reconcile
│   ├── document/    # Per-document lease + mirror
│   ├── project/     # Project lifecycle helpers
│   ├── runtime/     # Per-tab compute coordination
│   └── stores/      # Graph slices (nodes, edges, history, …)
├── styles/          # Global CSS and vendor overrides
├── suggestions/     # Analysis / cleaning suggestion engine
└── types/           # Shared TypeScript types
tests/
├── unit/            # Vitest suites mirroring src/ domains
└── support/         # Shared setup and fakes (@test/*)
server/
├── src/             # Express routes, services, models, middleware
└── tests/
    ├── unit/        # Vitest suites mirroring server/src/
    └── support/     # Mongo memory server and route helpers
e2e/                 # Playwright end-to-end tests
docs/                # Architecture, reliability, API, testing
data/                # Sample datasets
scripts/             # Docker and production smoke helpers
```

Unit tests live under `tests/` and `server/tests/`, not beside `src/`.

## Scripts

```bash
npm run dev              # Vite dev server
npm run build            # Production build (tsc + vite)
npm run preview          # Preview the production build
npm run lint             # Line-count check + ESLint
npm run check:dead-code  # Knip (frontend + server)

npm run test             # Frontend unit tests (watch)
npm run test:run         # Frontend unit tests once
npm run test:coverage    # Frontend coverage report
npm run test:e2e         # Playwright E2E
npm run test:production  # Isolated production Docker smoke test

npm --prefix server run lint
npm --prefix server run typecheck   # server/src + server/tests
npm --prefix server run build
npm --prefix server run test

npm run docker:up        # Full stack (Docker)
npm run docker:down      # Stop the stack
npm run docker:seed      # Seed sample data
```

See [docs/testing.md](docs/testing.md) for domain suites, release checks, and E2E details.
