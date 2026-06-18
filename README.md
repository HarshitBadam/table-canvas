# Table Canvas

A local-first visual data workbench. Import CSV or Excel files, then build transformation
pipelines by wiring tables together on a canvas instead of editing formulas across cells.
SQL runs entirely in the browser via DuckDB-WASM, so data never has to leave the machine.

Everything persists locally in IndexedDB. There's also an optional Express + MongoDB backend
that adds login and cross-device sync, but the app runs fully without it.

> Built solo. Core technical pieces: DuckDB-WASM for in-browser SQL, a reactive DAG compute
> engine, and a ReactFlow canvas. No server required.

## Quick start

Frontend only. No Docker, no database, no config.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. With no backend running, the app drops into **local mode**:
you're signed in automatically as "Local User" and everything is stored in IndexedDB.

For the full stack (auth + sync) with Docker:

```bash
npm run docker:up      # MongoDB + backend + frontend
npm run docker:seed    # optional sample data
npm run docker:down    # stop
```

See [docs/setup.md](docs/setup.md) for environment variables and the manual backend setup.

## The idea

Spreadsheets hide their logic inside cells, which makes pipelines hard to trace and re-run.
Table Canvas keeps the data (tables) separate from the logic (transforms). You connect nodes
on a canvas, pick a transform, and the result becomes a new derived table. The graph itself is
the documentation. You can see exactly where every table came from.

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
├── api/            # HTTP client for the optional backend (auth, projects, files)
├── auth/           # Login and early-access pages
├── canvas/         # ReactFlow canvas: nodes, transform modal, auto-layout
├── charts/         # Chart builder + renderers (bar/line/pie/scatter)
├── components/     # Shared UI (import button, theme toggle, error boundary)
├── dashboard/      # Project overview: lineage map, data-quality stats, suggestions
├── engine/         # DuckDB-WASM adapter, DAG, materialization, Web Worker
├── formula/        # Spreadsheet formula parser + evaluator
├── grid/           # Virtualized spreadsheet grid
├── layout/         # App shell: routing, sidebar, header, view switching
├── lib/            # Utilities, including column profiling
├── persistence/    # IndexedDB, ZIP export, server sync
├── report/         # TipTap report editor + export
├── state/          # Zustand stores + AppContext orchestration
├── styles/         # Global CSS and vendor overrides
├── suggestions/    # Analysis / cleaning suggestion engine
├── test/           # Vitest setup and shared test utilities
└── types/          # Shared TypeScript types
server/             # Optional Express + MongoDB backend
e2e/                # Playwright end-to-end tests
data/               # Sample datasets
scripts/            # Docker helper scripts
```

## Scripts

```bash
npm run dev            # Vite dev server
npm run build          # Production build (tsc + vite)
npm run preview        # Preview the production build
npm run lint           # ESLint

npm run test           # Unit tests (watch)
npm run test:run       # Unit tests once
npm run test:coverage  # Coverage report
npm run test:e2e       # Playwright E2E

npm run docker:up      # Full stack (Docker)
npm run docker:down    # Stop the stack
npm run docker:seed    # Seed sample data
```

## Docs

| Document | What's in it |
|----------|--------------|
| [Setup](docs/setup.md) | Run modes, environment variables, troubleshooting |
| [Architecture](docs/architecture.md) | DAG, engine, state, materialization, persistence |
| [Features](docs/features.md) | Canvas, grid, formulas, transforms, charts, dashboard, reports |
| [API](docs/api.md) | REST endpoints for the optional backend |
| [Testing](docs/testing.md) | How to run tests, where they live, CI |
