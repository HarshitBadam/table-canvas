# Table Canvas

A visual data analysis tool for Excel power users. Import tables, create joins and transforms on a canvas, edit data in an Excel-like grid, and build polished dashboards.

## Features

- **Canvas View** — Visual data lineage with drag-and-drop table nodes
- **Grid View** — Excel-like editing with virtualized scrolling (60fps)
- **Smart Joins** — Suggested keys, match rate preview, row explosion warnings
- **Transforms** — Filter, Select, Calculated Columns, Group/Summarize
- **Profiling** — Schema inference, missing values, distinct counts, semantic hints
- **Suggestions** — Context-aware cleaning and analysis recommendations
- **Charts** — Bar, Line, Pie, Scatter with configurable aggregations
- **Dashboards** — Drag-and-drop layout with PDF export

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS |
| UI Primitives | Radix UI |
| Canvas | React Flow |
| Data Engine | DuckDB-WASM (Web Worker) |
| State | Zustand + Immer |
| Charts | Recharts |
| Storage | IndexedDB |
| File Parsing | Papa Parse, SheetJS |

## Project Structure

```
src/
├── app/           # App shell, routing, layout
├── canvas/        # React Flow nodes, edges, transform modals
├── charts/        # Chart builder, chart components
├── components/    # Shared UI primitives
├── dashboard/     # Dashboard layout, PDF export
├── engine/        # DuckDB-WASM adapter, Web Worker
├── grid/          # Grid view, cell editors
├── lib/           # Types, utilities
├── persistence/   # IndexedDB storage
├── profiling/     # Schema inference, statistics
├── state/         # Zustand stores
├── styles/        # Design tokens, global styles
└── suggestions/   # Analysis recommendations
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | Product and engineering specification |
| [User Guide](docs/user-guide.md) | End-user documentation |
| [Suggestions Spec](docs/suggestions-spec.md) | Suggestion system implementation details |
| [Internal Map](docs/internal-map.md) | Codebase architecture overview |

## Architecture Highlights

1. **Main thread stays fast** — All parsing, joins, and profiling run in a Web Worker
2. **Patch overlay model** — Edits are stored as sparse patches, not full rewrites
3. **Engine abstraction** — DuckDB-WASM behind an adapter for future swappability
4. **Progressive display** — Show partial results immediately, refine in background
5. **Normalized state** — Nodes and edges stored separately with IDs

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Enter` | Edit selected cell |
| `Escape` | Cancel editing |
| `Tab` | Move to next cell |
| `Arrow keys` | Navigate grid |

## Environment Setup

For backend features (optional):

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/table-canvas` |
| `JWT_ACCESS_SECRET` | Access token secret | Required in production |
| `JWT_REFRESH_SECRET` | Refresh token secret | Required in production |
| `PORT` | Server port | `3001` |

## License

MIT
