# Table Canvas

### Abstract

Table Canvas is a local-first **visual data workbench** that experiments with a node-based approach to ETL (Extract, Transform, Load). Built on a modular React architecture and powered by **DuckDB-WASM**, it explores how visual graphs can improve the auditability of data transformation pipelines compared to traditional tabular interfaces.

### Technical Scope

This repository houses the source code for the initial public release. The system encompasses:

* **Core Engine:** A client-side SQL execution layer (DuckDB-WASM) capable of processing 100k+ row datasets entirely in the browser.
* **State Management:** A custom Directed Acyclic Graph (DAG) implementation using **Zustand** and **Immer** to ensure reactive data propagation.
* **Frontend Architecture:** A modular React 18 application featuring virtualized grids for high-performance rendering.

---

## The Motivation

Spreadsheets are the industry standard for data entry and ad-hoc analysis. However, as data transformation complexity grows, tabular interfaces present specific architectural challenges:

* **Auditability:** In traditional spreadsheets, logic is hidden inside cells. Tracing dependencies often requires manual inspection of formulas.
* **Linearity:** Complex joins and filtering logic can become difficult to visualize in a grid format.
* **Reproducibility:** Re-running the same analysis on new datasets often requires manual adjustments to cell ranges.

## The Approach

Table Canvas proposes a **visual graph paradigm** for data operations. By decoupling the data (tables) from the logic (nodes), users can architect transformation pipelines that self-document their lineage.

* **Visual Lineage:** Drag connections between nodes to filter, join, and aggregate data. The pipeline *is* the documentation.
* **Local-First Execution:** Leveraging WebAssembly (DuckDB-WASM) to execute SQL queries client-side, ensuring data privacy and zero-latency feedback.
* **Reactive Propagation:** When upstream data changes, the DAG automatically determines which downstream nodes require re-calculation.

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **Core** | React 18 + TypeScript | Component architecture and type safety |
| **Engine** | DuckDB-WASM | In-browser SQL execution |
| **State** | Zustand + Immer | DAG state management and immutability |
| **Canvas** | ReactFlow | Node-based interactive graph |
| **Persistence** | IndexedDB | Local storage for offline capability |
| **Visualization** | Recharts | Reactive data charting |
| **Backend** | Express + MongoDB | Optional server sync and auth |

## Architecture Overview

The application follows a **Headless UI** pattern where the calculation engine is decoupled from the visualization layer.

1. **Ingestion:** Files (CSV/Excel) are parsed and loaded into a transient DuckDB instance in memory.
2. **DAG Processing:** The visual graph is converted into a topological sort order to determine execution dependency.
3. **Execution:** SQL queries are generated dynamically based on node connections and executed against the WASM instance.
4. **Rendering:** Results are streamed back to the UI via web workers to prevent main-thread blocking.

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- Docker and Docker Compose (optional, for full-stack setup)

### Local Development (Frontend Only)

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application runs at `http://localhost:5173`. This mode uses IndexedDB for local persistence.

### Full Stack with Docker

```bash
# Start all services (MongoDB, backend, frontend)
npm run docker:up

# Seed sample data
npm run docker:seed

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

Services:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`
- MongoDB: `localhost:27017`

See [docs/setup.md](docs/setup.md) for detailed configuration options.

## Project Structure

```
├── src/                    # Frontend application
│   ├── canvas/             # ReactFlow-based visual canvas
│   ├── engine/             # DuckDB-WASM integration + DAG
│   ├── formula/            # Custom formula parser/evaluator
│   ├── grid/               # Spreadsheet grid component
│   ├── suggestions/        # Rule-based analysis suggestions
│   ├── persistence/        # IndexedDB + export services
│   ├── state/              # Zustand stores
│   └── ...
├── server/                 # Express backend
│   └── src/
│       ├── routes/         # API endpoints
│       ├── models/         # MongoDB schemas
│       └── services/       # Business logic
├── e2e/                    # Playwright E2E tests
└── data/                   # Sample datasets
```

## Documentation

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/setup.md) | Installation, configuration, environment variables |
| [Architecture](docs/architecture.md) | System design, DAG implementation, state management |
| [API Reference](docs/api.md) | REST endpoint documentation |
| [Features](docs/features.md) | Canvas, suggestions, formulas, export formats |
| [Testing](docs/testing.md) | Test strategy, coverage, running tests |

## Scripts

```bash
# Development
npm run dev              # Start Vite dev server
npm run build            # Production build
npm run preview          # Preview production build

# Testing
npm run test             # Run unit tests (watch mode)
npm run test:run         # Run unit tests once
npm run test:coverage    # Generate coverage report
npm run test:e2e         # Run Playwright E2E tests

# Docker
npm run docker:up        # Start all services
npm run docker:down      # Stop services
npm run docker:seed      # Seed database

# Linting
npm run lint             # ESLint check
```
