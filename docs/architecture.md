# Table Canvas v1.0.0 — Product & Engineering Specification

This document serves as the north-star specification for Table Canvas v1.0.0. It provides concrete implementation guidance while preserving flexibility for decisions that require iteration.

**Core idea:** A web app for Excel power users where tables are objects on a canvas, connections create derived tables (joins/transforms), clicking a table opens an Excel-like grid editor, and the app provides fast profiling with context-aware suggestions. Users build charts and dashboards and export polished PDFs.

---

## 1) Product Intent and Constraints

**Primary users:**
- Excel power users (analysts, finance/accounting professionals, consultants)
- Not necessarily SQL/R users — the UI must feel safe, intuitive, and approachable

**Problem being solved:**
- Analysts waste most time not on "final charts" but on importing, organizing, joining, cleaning, validating, and repeating analyses in fragile Excel workbooks
- This product replaces the spreadsheet-centric workflow with explicit data lineage, guided transforms, and ambient insights

**Constraints (v1.0.0):**
- Web app (demo/share friendly)
- Single-user only (no auth, no collaboration)
- Smaller datasets initially (optimize for functionality + "feels instant" UX, not enterprise scale)
- Data sources: CSV, XLSX, and manual table creation/editing

**Non-goals (v1):**
- Scheduling/pipelines (no "run workflow" mindset)
- Enterprise connectors (databases, Google Sheets APIs)
- Full Excel formula compatibility
- Security hardening / permissions / multi-user

---

## 2) UX Principles

These principles take precedence over any single feature.

**1) Instant feedback and progressive refinement:**
- Show something immediately (sample rows, basic stats), then refine in background

**2) Safety and trust:**
- Undo/redo for canvas actions and grid edits
- Joins must preview and warn about row explosion risk
- Derived tables should not silently become stale without clear indicators

**3) Calm UI, complexity behind clicks:**
- Default view is minimal and clean
- Advanced stats/analysis are opt-in via toggles or "Insights" drawers

**4) Data lineage, not workflow:**
- No "Run" button
- The graph represents data lineage; changes propagate automatically

**5) Familiar where it matters:**
- Clicking a table opens an Excel-like grid with editing, copy/paste, search, and filters

---

## 3) Key Objects and Mental Model

**User-visible objects:**
- **Table node:** a dataset (source or derived)
- **Edge:** a directional transform that produces a derived table (e.g., Join, Filter, Add Column)
- **Chart:** a visualization attached to a table node
- **Dashboard:** a layout of chart cards and KPIs, exportable to PDF

**Important defaults:**
- Most transforms produce a new derived table (users don't fear "breaking the raw data")
- Source tables are editable in grid mode
- Derived tables are view-only by default; users can "Create editable copy" if needed

---

## 4) End-to-End User Flows

### 4.1 Import and Create Tables
1. User clicks Import → chooses CSV or XLSX
2. For XLSX, user picks sheet(s). Each sheet becomes a Table node
3. A Table node appears on canvas immediately with name, row/column counts, and "profiling…" status
4. Clicking the node opens Grid view instantly showing the first N rows
5. Profiling results progressively appear as subtle badges/insights

**Also support "New Table":** Create a blank table with columns, then edit in grid.

### 4.2 Join/Transform via Canvas Connections
1. User drags a connection handle from Table A → Table B
2. A modal opens: "Combine data" (Join) by default, with other transforms available
3. The modal suggests join keys and shows a preview: estimated output rows, match rate, risk warnings (many-to-many)
4. On confirm, a new derived Table node is created and connected directionally

### 4.3 Suggestions in Grid View
1. In Grid view, user clicks "Suggestions" (or selects a column for contextual suggestions)
2. The app proposes high-confidence actions:
   - Cleaning steps (trim, type convert, fill missing)
   - Quick analyses (pivot-like summaries)
   - Chart suggestions
   - Commerce recipes (variance, trend, contribution, reconciliation)
3. Each suggestion shows what it will create, a preview, and a "Why this?" explanation
4. One click applies it and updates the canvas/dashboard

### 4.4 Dashboard and PDF Export
1. User creates charts from table nodes
2. User arranges charts in a dashboard grid layout
3. Export generates a polished PDF with consistent typography and spacing

---

## 5) Technical Architecture

**High-level components:**
- **UI (React):** canvas, grid, chart/dashboard, modals, inspector
- **State store:** project graph + UI state + undo/redo
- **Compute worker:** all data operations off the main thread
- **Data engine adapter:** thin layer that executes transforms and returns slices/aggregates
- **Metadata/profiling service:** computes schema and stats in phases; fuels suggestions

**The cardinal rule:** Never do heavy parsing, joins, profiling, or chart aggregation on the main thread.

### 5.1 Engine Choice

For v1, prioritize development speed and reliability. Keep an engine abstraction so switching later is not a rewrite.

**Recommended baseline:**
- DuckDB-WASM or Polars-WASM in a Web Worker
- Choose one for implementation; design the adapter for swappability

**Trade-offs:**
- Polars-WASM: simpler dataframe-style mental model
- DuckDB-WASM: robust joins, easy aggregation, better long-term scale

**Implementation guidelines:**
- Implement an `EngineAdapter` interface; keep transform compilation inside it
- Do not scatter SQL or engine calls throughout UI components

---

## 6) Data Model and Core Data Structures

### 6.1 Project Graph (Normalized)

Store nodes and edges in normalized form.

**Node fields (minimum):**
- `id`
- `kind`: `source_table | derived_table | chart | dashboard`
- `name`
- `ui`: position, collapsed state
- `schema`: columns (name, type, nullable, semanticHints)
- `plan`:
  - For source: fileRef + editPatches + inferredSchemaVersion
  - For derived: transformDef + upstreamNodeIds
- `cacheInfo`: lastComputedAt, lastPlanHash, warnings

**Edge fields:**
- `id`
- `fromNodeId`
- `toNodeId`
- `transformType`
- `transformParamsRef` (or embed transformDef in toNode)

### 6.2 Table Identity and Edits

Do not rely on row position as identity once sorting/filtering exists.

**Row identity strategy:**
- Assign a stable internal RowId for each row in a source table
- Sorting/filtering creates a view mapping (RowId list), not a rewritten dataset

**Editing strategy (patch overlay model):**
- Base data is treated as immutable
- Edits are stored as sparse patches:
  - `cellPatches: Map<ColumnId, Map<RowId, Value>>`
  - `deletedRows: Set<RowId>` (or bitset)
  - `insertedRows: Array<{rowId, valuesByColumnId}>`
- Grid reads base value unless patched

**Benefits:**
- Undo/redo is natural
- Editing doesn't trigger full recomputation
- Derived tables can recompute based on a "source version hash"

### 6.3 Table Versions (Caching + Invalidation)

Every table node has a `tableVersionHash` derived from:
- Source: fileRef hash + patch hash + schema overrides
- Derived: upstream hashes + transform definition hash

When something changes:
- Mark downstream nodes dirty
- Recompute lazily when user views grid/chart/dashboard

---

## 7) Transform System (v1 Set)

**Guideline:** Keep transform types small and composable. Avoid "do everything" transforms.

**Must-have transforms:**
1. Join (Combine data)
2. Filter rows
3. Select/rename/reorder columns
4. Add calculated column (formula builder)
5. Group/Summarize (pivot-like) — recommended
6. Union append — optional

### 7.1 Join Transform — Safety First

**Join types:**
- Default: Left join
- Also: Inner, Right, Full (Full behind "Advanced" toggle)

**Join UI must show preview signals:**
- Suggested keys ranked
- Estimated output rows
- Match rate (left matched %, right matched %)
- Many-to-many risk warning

**Row explosion risk heuristic:**
- If duplicates exist on both join keys, warn clearly
- Offer remedies:
  - "Deduplicate left/right key"
  - "Aggregate before join" (advanced)
  - "Keep first match only" (explicitly labeled as lossy)

**Note:** For small datasets, compute exact counts. For larger datasets, use sampled approximations.

### 7.2 Filter Transform

Supports simple conditions with AND/OR:
- equals, not equals
- contains
- >, <, between
- is missing / not missing

Show "rows kept / rows removed" preview.

### 7.3 Select/Rename Columns

- Include/exclude
- Reorder
- Rename inline

### 7.4 Calculated Column (Formula System)

Do not attempt full Excel formulas in v1.

**Design a small expression language:**
- Column references
- Arithmetic
- Comparisons
- IF / CASE
- Text concat
- Date extraction
- COALESCE / NULL handling

**Formula builder UI should support:**
- Natural language prompt → suggests a formula (optional)
- Safe preview (first 20 rows)
- Human-readable validation errors

### 7.5 Group/Summarize (Pivot-like)

- Group-by columns
- Aggregations: sum, avg, min, max, count, count distinct

Output is a derived table.

---

## 8) Metadata & Profiling

Compute metadata in phases.

**Phase 1 (fast, immediate):**
- Infer types from sample
- Missing %
- Sample distinct estimate
- Top values (categorical)

**Phase 2 (background):**
- Exact distinct counts (if dataset small)
- Histograms (numeric)
- Key candidates (uniqueness + low missingness)
- Join helper stats (value overlap sketches)
- Correlation matrix (only if user enables advanced insights)

**Metadata drives:**
- Join key suggestions
- Chart defaults
- Grid suggestions
- Analysis recipes

**Semantic hints:**
- Detect patterns like "currency", "percentage", "ID-like", "date-like"
- Use heuristics (regex + stats) for baseline speed and reliability

---

## 9) Suggestions System

**Design principle:** Suggestions must be bounded actions with previews, not free-form text.

### 9.1 Suggestion Types

**A) Data cleaning suggestions** (usually create a "cleaned copy" derived table):
- Trim whitespace
- Normalize casing
- Type conversion
- Fill missing (mean/median/mode/custom)
- Split column by delimiter
- Remove duplicates (key-based)

**B) Quick analysis suggestions** (produce derived table + chart):
- "Sum of Amount by Category" (group + bar)
- "Trend of Amount over Date" (date bucket + line)
- "Top N contributors" (pareto-like)
- "Variance: Actual vs Budget" (if detected)

**C) Recipe suggestions** (multi-step):
- Reconciliation (match/unmatched across two tables)
- Ratio analysis (gross margin %, etc.)
- Period-over-period changes

### 9.2 Suggestion Generation Pipeline

**1) Deterministic rules (primary):**
- Use schema + metadata patterns to propose actions
- Keep it fast and stable

**2) Optional enhancement layer:**
- Rewrite suggestions into user-friendly text, propose formulas, pick defaults
- Input must be bounded: column names/types/summary stats, top values, small sampled rows
- Cache results by metadata hash for instant repeated opens

### 9.3 UI Placement

**Recommended:**
- Grid toolbar button: "Suggestions"
- Contextual suggestions when selecting a column (small tray)
- Right-side "Insights" drawer where suggestions can live without clutter

**Each suggestion card includes:**
- Action title
- What it creates (table/chart/dashboard)
- Preview
- "Why this?" expandable explanation
- Apply / Dismiss

---

## 10) UI Stack Guidance

**Recommended approach:**
- React + TypeScript
- Tailwind CSS for consistent spacing and quick iteration
- Headless UI primitives (e.g., Radix) for accessible dialogs/menus
- A small design token system: typography scale, spacing scale, radius/shadow, neutral color palette

**Canvas:**
- Use a stable node/edge library (e.g., React Flow) unless custom is necessary
- Keep canvas interactions smooth: pan, zoom, snap, keyboard shortcuts

**Grid:**
- Pick a grid that supports virtualization and editing cleanly
- Criteria: 60fps scroll, copy/paste, selection model, editable cells, column resize/reorder
- If the chosen grid makes premium styling hard, wrap it in a consistent chrome

**Charts:**
- Pick a chart library with good defaults and theming
- Charts should never request raw full table data if aggregation can be done in the engine

---

## 11) Performance Tactics

The biggest sources of perceived slowness are not CPU — they're:
- Blocking the main thread
- Re-render storms
- No progressive display

**Rules:**
- Heavy work in worker
- Virtualize grid rows (always)
- Debounce expensive operations (suggestions, profiling refresh)
- Cache slices and chart aggregations
- Show instant "good enough" results, then refine

**Task scheduling priority:**
1. Current grid slice
2. Join modal preview
3. Chart aggregation preview
4. Baseline profiling
5. Advanced profiling (correlations)

---

## 12) Dashboard and PDF Export

**Dashboard:**
- Drag-and-drop layout of cards (charts and KPI tiles)
- A responsive grid with breakpoints is enough for v1

**PDF export approach:**
- Implement a "print layout mode" that renders the dashboard into a paginated, print-safe layout
- Export options:
  - Option A: browser print-to-PDF (simple, fast)
  - Option B: render to canvas and generate PDF client-side (more control)
- Start with print mode and iterate

**Non-negotiable:**
- PDF output must look like a designed report, not a screenshot dump
- Consistent typography and spacing

---

## 13) Storage and Project Persistence

**v1 storage:**
- Use IndexedDB to store:
  - Project graph JSON
  - Imported file blobs (or references if too large)
  - Edit patches
  - Cached previews (optional)

**Support:**
- Export project file: `.tablecanvas.json`
- Import project file

**Project file should include:**
- Nodes/edges
- Transforms
- Dashboard layout
- Schema overrides
- Patches

It may omit raw file blobs initially, but re-import prompts must exist.

---

## 14) Implementation Boundaries

**Be strict about:**
- Worker separation for compute
- Normalized state + undo/redo
- Patch model for edits
- Join preview safety UX
- Progressive display

**Be flexible about:**
- Exact UI layout and styling details (iterate visually)
- Exact grid library selection (choose one and adjust)
- Whether engine is DuckDB-WASM or Polars-WASM (keep adapter clean)
- Exact list of recipes in v1 (ship a small set that feels magical)

---

## 15) Folder Structure

```
/src
├── /app          (routing, app shell)
├── /state        (stores, undo/redo, selectors)
├── /canvas       (nodes, edges, transforms UI)
├── /grid         (grid view, editors, selection, context actions)
├── /charts       (chart builder, chart components)
├── /dashboard    (layout + export)
├── /engine
│   ├── EngineAdapter.ts
│   ├── /worker   (worker entry + RPC)
│   └── /transforms (compile transform defs to engine ops)
├── /profiling    (schema inference, stats, hints)
├── /suggestions  (rules, ranking)
├── /components   (shared UI primitives)
└── /styles       (tokens/theme)
```

---

## 16) Milestones

**Milestone 1: App shell + canvas**
- Basic node add/move
- Connect edge opens transform modal
- Undo/redo for canvas

**Milestone 2: Import + grid viewer**
- CSV/XLSX import
- Open node → grid shows first slice
- Virtualization and basic UX polish

**Milestone 3: Editing + patch model**
- Edit cells, insert/delete rows
- Undo/redo integrated

**Milestone 4: Engine in worker + basic transforms**
- Load tables into engine
- Filter/select/rename/calc
- Join with preview warnings

**Milestone 5: Profiling + suggestions**
- Phase 1 profiling
- Basic deterministic suggestions in grid

**Milestone 6: Charts + dashboard**
- Chart builder
- Dashboard layout
- Print layout mode

**Milestone 7: PDF export**
- Export pipeline
- Quality iteration

**Milestone 8: Commerce recipes**
- 3–5 high-impact recipes: trend, category contribution, variance, reconciliation, ratio KPI

---

## 17) Acceptance Criteria (v1.0.0)

A user can:
- Import CSV and XLSX and see each as a table node
- Click any table and view/edit it in an Excel-like grid with undo/redo
- Connect two tables and create a join with suggested keys and explosion warnings
- Apply filters and add calculated columns via a formula builder with preview
- See profiling insights (missing %, type suggestions) without clutter
- Click "Suggestions" in grid and one-click generate a useful analysis output (table + chart)
- Build a dashboard from charts and export a clean PDF

---

## 18) Open Questions

These are intentionally not fully specified; reasonable defaults should be chosen while keeping architecture flexible.

1. **Engine selection:** DuckDB-WASM vs Polars-WASM (pick one for v1; keep adapter swappable)
2. **Grid library:** Choose based on editing + virtualization + styling constraints
3. **Derived table editability:** Default view-only, "Create editable copy" option. Decide whether to allow direct editing later.
4. **Recipe catalog depth:** Start with 3–5 high-impact recipes, expand later
5. **Enhancement integration:** Start deterministic. Add enhancements only when the deterministic system is solid and UI feels stable.

---

## 19) Implementation Philosophy

**Priorities:**
- Implement core primitives first (tables, transforms, worker engine adapter, patches, profiling)
- Keep UI minimal but polished early (spacing, typography, animations)
- Avoid overfitting to edge cases in v1; focus on trust + delight
- Leave hooks and interfaces clean so more transforms/recipes can be added without refactors
