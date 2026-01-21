# Internal Architecture Map

This document provides a quick reference to the codebase structure and key data flows.

## Frontend (`src/`)

| Folder | Purpose |
|--------|---------|
| `app/` | Root App component, routing, and Sidebar |
| `api/` | HTTP clients for auth, files, and projects APIs |
| `auth/` | Login, early access pages, protected route wrapper |
| `canvas/` | React Flow-based node canvas (TableNode, ChartNode, connection lines) |
| `charts/` | Chart builder and rendering with Recharts |
| `components/` | Shared presentational components (buttons, tooltips, loading states) |
| `dashboard/` | Dashboard view aggregating multiple charts |
| `engine/` | DuckDB WASM adapter, dependency graph, materialization service |
| `formula/` | Expression parser, evaluator, and autocomplete for calculated columns |
| `grid/` | Virtualized table view with filtering and formula columns |
| `lib/` | Core TypeScript types (`types.ts`) and shared utilities |
| `persistence/` | IndexedDB wrapper and backend sync service |
| `profiling/` | Schema inference and statistics computation |
| `state/` | Zustand stores (`projectStore`, `dataStore`) and AppContext |
| `suggestions/` | Rule-based suggestion engine for data cleaning and analysis |

## Backend (`server/`)

| Folder | Purpose |
|--------|---------|
| `config/` | Database connection and environment variables |
| `middleware/` | Auth validation and error handling |
| `models/` | Mongoose models for User, Project, and File |
| `routes/` | Express route handlers for auth, files, projects |
| `services/` | Business logic for auth and file storage |

## Supporting Directories

| Path | Purpose |
|------|---------|
| `data/` | Sample CSV/XLSX files for testing |
| `docs/` | Project documentation |
| `e2e/` | Playwright end-to-end tests |
| `scripts/` | Data generation and utility scripts |

## Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Import    │────▶│   Engine    │────▶│   Store     │
│  (CSV/XLSX) │     │  (DuckDB)   │     │  (Zustand)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │ Suggestions │     │    Views    │
                    │   Engine    │     │ (Grid/Chart)│
                    └─────────────┘     └─────────────┘
```

## State Architecture

- **projectStore**: Nodes, edges, patches, project metadata
- **dataStore**: Materialized table data (in-memory cache)
- **AppContext**: Initialization orchestration, auth state, auto-save

## Entry Points

- `src/main.tsx` — React app bootstrap
- `server/src/index.ts` — Express server entry
