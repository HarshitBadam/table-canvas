# Table Canvas

A local-first visual data workbench. Import CSV or Excel files, then build transformation pipelines by wiring tables together on a canvas instead of editing formulas across cells. SQL runs entirely in the browser via DuckDB-WASM, so data never has to leave the machine.

Everything persists locally in IndexedDB. There's also an optional Express + MongoDB backend that adds login and cross-device sync, but the app runs fully without it.

> Built solo. Core technical pieces: DuckDB-WASM for in-browser SQL, a reactive DAG compute engine, and a ReactFlow canvas. No server required.

**Live app:** [table-canvas.vercel.app](https://table-canvas.vercel.app)

## Quick start

Frontend only. No Docker, no database, no config.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and choose **Continue as guest** for a browser-local workspace. Set `VITE_AUTO_GUEST=true` only when automatic guest startup is useful during development.

For the full stack (auth + sync) with Docker:

```bash
npm run docker:up      # MongoDB + backend + frontend; creates the demo user
npm run docker:down    # stop
```

`docker:up` resets the local Docker users and creates `demo@tablecanvas.app`
with password `1234`. Run `npm run docker:seed` only to reset that demo user again.

See [docs/setup.md](docs/setup.md) for environment variables and the manual backend setup.

## Docs

| Document                                            | What's in it                                                   |
| --------------------------------------------------- | -------------------------------------------------------------- |
| [Setup](docs/setup.md)                              | Run modes, environment variables, troubleshooting              |
| [Architecture](docs/architecture.md)                | DAG, engine, state, materialization, persistence               |
| [Session and data reliability](docs/reliability.md) | Guest/account isolation, tabs, promotion, concurrency, quotas  |
| [Production deployment](docs/production.md)         | Vercel, backend, backups, monitoring, release and rollback     |
| [Features](docs/features.md)                        | Canvas, grid, formulas, transforms, charts, dashboard, reports |
| [API](docs/api.md)                                  | REST endpoints for the optional backend                        |
| [Testing](docs/testing.md)                          | How to run tests, where they live, CI                          |

## How it works

1. Import a file (or create a table). It's parsed, typed, stored in IndexedDB, and loaded into DuckDB.
2. The project is a directed acyclic graph (DAG): nodes are tables/charts, edges are transforms.
3. Connecting two nodes opens a transform modal (filter, join, group, etc.) and creates a derived table.
4. DuckDB-WASM (running in a Web Worker) executes the SQL and materializes results.
5. When upstream data changes, downstream tables are marked dirty and recomputed on demand.
6. View data in the grid, build charts, see a project overview on the dashboard, or write reports.

## Tech stack

| Layer              | Technology             | Purpose                                    |
| ------------------ | ---------------------- | ------------------------------------------ |
| UI                 | React 18, TypeScript, Tailwind CSS | Components, type safety, and styling |
| Routing            | React Router           | Client-side application routes             |
| Engine             | DuckDB-WASM            | In-browser SQL execution (in a Web Worker) |
| State              | Zustand + Immer        | DAG state and immutable updates            |
| Canvas             | ReactFlow + Dagre      | Node graph and auto-layout                 |
| Charts             | Recharts               | Bar / line / pie / scatter                 |
| Reports            | TipTap + pdfmake       | Rich-text editing and PDF export           |
| Grid               | TanStack Virtual       | Windowed rendering for large tables        |
| Persistence        | IndexedDB (`idb`)      | Local storage, offline-capable             |
| Parsing/Export     | PapaParse, xlsx, JSZip | CSV/Excel import and project export        |
| Backend (optional) | Express + MongoDB      | Auth and cross-device sync                 |

## Project structure

```
src/
├── api/             # HTTP client for the optional backend
├── auth/            # Login, Google sign-in, and legal dialogs
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
data/                # Workbook fixture used by tests
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
npm run test:all         # Frontend unit + E2E tests
npm run test:release     # Full frontend/backend release gate
npm run test:production  # Isolated production Docker smoke test

npm --prefix server run lint
npm --prefix server run typecheck   # server/src + server/tests
npm --prefix server run build
npm --prefix server run test

npm run docker:up        # Full stack (Docker)
npm run docker:up:attached # Full stack with attached logs; does not auto-seed
npm run docker:logs      # Follow frontend/backend logs
npm run docker:down      # Stop the stack
npm run docker:down:volumes # Stop and erase Docker data
npm run docker:seed      # Reset local Docker users and recreate the demo user
```

See [docs/testing.md](docs/testing.md) for domain suites, release checks, and E2E details.