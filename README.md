# Table Canvas v1.0.0

A web application for Excel power users where tables are objects on a canvas, connections create derived tables (joins/transforms), clicking a table opens an Excel-like grid editor, and the app provides fast profiling + "analysis auto-complete" suggestions.

## Features

### Core Functionality
- **Canvas View**: Visual data lineage with drag-and-drop table nodes
- **Grid View**: Excel-like editing with virtualized scrolling (60fps)
- **Data Import**: CSV and XLSX file support with sheet selection
- **Transforms**: Join, Filter, Select, Calculated Column, Group/Summarize
- **Undo/Redo**: Full history for canvas and grid operations

### Data Intelligence
- **Automatic Profiling**: Schema inference, missing values, distinct counts
- **Type Detection**: Semantic hints (currency, email, date patterns)
- **Join Suggestions**: Smart key matching with confidence scores
- **Analysis Suggestions**: Context-aware cleaning and analysis recommendations

### Visualization
- **Chart Builder**: Bar, Line, Pie, Scatter with axis mapping
- **Dashboard**: Drag-and-drop chart layout
- **PDF Export**: Print-optimized layout with consistent styling

### Commerce Recipes
- Trend Analysis
- Category Contribution (Pareto)
- Variance Analysis (Actual vs Budget)
- Ratio KPIs

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
| Storage | IndexedDB (idb) |
| File Parsing | Papa Parse, SheetJS |

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd table-canvas

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Development

The app runs entirely in the browser with no backend required. All data processing happens in a Web Worker using DuckDB-WASM.

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

## Key Architecture Decisions

1. **Never block main thread**: All parsing, joins, and profiling run in a Web Worker
2. **Patch overlay model**: Edits are stored as sparse patches, not rewrites
3. **Engine abstraction**: DuckDB-WASM behind an adapter for future swappability
4. **Progressive display**: Show partial results immediately, refine in background
5. **Normalized state**: Nodes and edges stored separately with IDs

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Enter` | Edit selected cell |
| `Escape` | Cancel editing |
| `Tab` | Move to next cell |
| `Arrow keys` | Navigate grid |

## Browser Support

- Chrome 90+
- Firefox 90+
- Safari 15+
- Edge 90+

## License

MIT

## Acknowledgments

- [DuckDB](https://duckdb.org/) - In-process SQL database
- [React Flow](https://reactflow.dev/) - Canvas library
- [Radix UI](https://www.radix-ui.com/) - Accessible primitives
- [Recharts](https://recharts.org/) - Chart library

