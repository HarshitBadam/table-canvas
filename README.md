# Table Canvas

**A visual data transformation platform that replaces fragile Excel workflows with explicit data lineage, live previews, and one-click analytics.**

![Project Status](https://img.shields.io/badge/status-v1.0_Release-brightgreen) ![TypeScript](https://img.shields.io/badge/TypeScript-61k_LOC-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## The Problem

Analysts spend 80% of their time on data prep—importing, joining, cleaning, and validating—not analysis. Excel's "everything in one sheet" model creates brittle workbooks where one bad formula breaks everything and lineage is invisible.

**Table Canvas** treats tables as first-class objects on an infinite canvas. Drag connections to create joins, click a table to edit it in a familiar grid, and let the system suggest cleaning operations and analyses based on your data's actual shape.

---

## Under the Hood

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Main Thread                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐ │
│  │ Canvas  │  │  Grid   │  │ Charts  │  │  Suggestions Panel  │ │
│  │(ReactFlow)│ │(Virtual)│  │(Recharts)│ │  (Rule Engine)      │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └──────────┬──────────┘ │
│       │            │            │                   │            │
│       └────────────┴────────────┴───────────────────┘            │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │   Zustand Store   │                        │
│                    │ (Immer + Patches) │                        │
│                    └─────────┬─────────┘                        │
└──────────────────────────────┼──────────────────────────────────┘
                               │ RPC
┌──────────────────────────────▼──────────────────────────────────┐
│                        Web Worker                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    DuckDB-WASM                               ││
│  │  • SQL query execution    • Aggregations & window functions ││
│  │  • Join optimization      • In-memory columnar storage      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Design Patterns

| Pattern | Implementation |
|---------|----------------|
| **Patch Overlay Model** | Edits stored as sparse patches over immutable base data—enables instant undo/redo and lazy recomputation |
| **Dependency Graph** | Topological sort determines materialization order; dirty flags propagate downstream automatically |
| **Progressive Profiling** | Phase 1 (instant): type inference, missing %, top values. Phase 2 (background): histograms, correlations, key candidates |
| **Engine Abstraction** | `EngineAdapter` interface isolates DuckDB-WASM; swap to Polars/DataFusion without touching UI code |

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 + TypeScript (strict mode) |
| Build | Vite 6 with Web Worker support |
| State | Zustand + Immer (normalized graph) |
| Data Engine | DuckDB-WASM (Web Worker) |
| Canvas | React Flow (custom nodes/edges) |
| Grid | Custom virtualized grid (60fps scroll) |
| Rich Text | TipTap (ProseMirror) for report editor |
| Charts | Recharts with aggregation pushdown |
| Persistence | IndexedDB + optional REST sync |

---

## Key Features

### 1. Safe Joins with Explosion Warnings

Most join tools let you shoot yourself in the foot. Table Canvas previews every join:

- **Match rate**: "87% of left rows will match"
- **Row explosion risk**: Detects many-to-many keys before you create a 10M row monster
- **Suggested keys**: Ranked by uniqueness and value overlap

### 2. Context-Aware Suggestions Engine

A rule-based engine analyzes column metadata and proposes high-confidence actions:

- **Cleaning**: Trim whitespace, normalize casing, convert "N/A" to NULL
- **Analysis**: "Sum of Revenue by Region" with auto-generated chart
- **Recipes**: Variance analysis, period-over-period trends, reconciliation workflows

Each suggestion includes a live preview and one-click apply.

### 3. Formula Columns with Live Preview

A safe expression language (not full Excel) for calculated columns:

```
IF([status] = "paid", [amount], 0)
CONCAT([first_name], " ", [last_name])
DATEDIFF("day", [start_date], [end_date])
```

Preview shows results on real data before committing.

### 4. Notion-Style Report Editor

Build polished reports with embedded tables, charts, and rich text. TipTap-powered editor with:

- Slash commands (`/chart`, `/table`, `/heading`)
- Drag-and-drop block reordering
- PDF export with print-optimized layout

### 5. Real-Time Data Lineage

Every derived table knows its upstream dependencies. Change a source table and downstream tables show a "stale" badge until re-materialized. No mystery about where numbers come from.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Install & Run

```bash
# Clone the repository
git clone https://github.com/HarshitBadam/table-canvas.git
cd table-canvas

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

### Run Tests

```bash
# Unit tests
npm run test:unit

# E2E tests (requires Playwright)
npx playwright install
npm run test:e2e

# All tests
npm run test:all
```

---

## Project Structure

```
src/
├── app/            # App shell, routing, sidebar
├── canvas/         # React Flow nodes, edges, transform modals
├── charts/         # Chart builder, Recharts wrappers
├── dashboard/      # Dashboard layout, PDF export
├── engine/         # DuckDB adapter, Web Worker, materialization
├── formula/        # Tokenizer, parser, evaluator for expressions
├── grid/           # Virtualized grid, cell editors, autofill
├── persistence/    # IndexedDB storage, project export/import
├── profiling/      # Schema inference, statistics, semantic hints
├── report/         # TipTap editor, block components, PDF generation
├── state/          # Zustand stores, normalized slices
├── suggestions/    # Rule engine, detectors, cleaning commands
└── styles/         # Design tokens, Tailwind config
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | Full product and engineering specification |
| [User Guide](docs/user-guide.md) | End-user documentation |
| [Suggestions Spec](docs/suggestions-spec.md) | How the suggestion engine works |

---

## License

MIT
