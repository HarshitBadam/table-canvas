```md
# Table Canvas v1.0.0 — Product + Engineering Spec (Cursor-ready)

This document is intended to be pasted into Cursor and used as the “north star” spec for building the first complete web version (v1.0.0). It balances concrete implementation guidance with deliberate freedom where decisions are still ambiguous.

Core idea: A web app for Excel power users where tables are objects on a canvas, connections create derived tables (joins/transforms), clicking a table opens an Excel-like grid editor, and the app provides fast profiling + “analysis auto-complete” suggestions. Users build charts/dashboards and export a polished PDF.

---

## 1) Product intent and constraints

Primary users:
- Excel power users (analysts, commerce/accounting students, consultants).
- They are not necessarily SQL/R users. The UI must feel safe, intuitive, and fun.

Problem being solved:
- People waste most time not on “final charts” but on importing, organizing, joining, cleaning, validating, and repeating analyses in fragile Excel notebooks.
- This product replaces the Excel notebook workflow with explicit data lineage + guided transforms + ambient insights.

Constraints (v1.0.0):
- Web app (demo/share friendly).
- Single-user only (no auth, no collaboration).
- Smaller datasets initially (optimize for functionality + “feels instant” UX, not enterprise scale).
- Data sources: CSV, XLSX, and manual table creation/editing.

Non-goals (v1):
- Scheduling/pipelines (no “run workflow” mindset).
- Enterprise connectors (DBs, Google Sheets APIs).
- Full Excel formula compatibility.
- Security hardening / permissions / multi-user.

---

## 2) UX principles (must-follow)

These principles are more important than any single feature.

1) Instant feedback and progressive refinement:
- The app should show something immediately (sample rows, basic stats), then refine in the background.

2) Safety and trust:
- Undo/redo should exist for canvas actions and grid edits.
- Joins must preview and warn about row explosion risk.
- Derived tables should not silently become “wrong” without clear indicators.

3) Calm UI, complexity behind clicks:
- Default view is minimal and clean (Apple/iOS industrial).
- Advanced stats/analysis are opt-in via toggles or “Insights” drawers.

4) “Not a workflow tool”, even if it uses a canvas:
- No “Run”.
- The graph is data lineage; changes propagate automatically.

5) Familiar where it matters:
- Clicking a table opens an Excel-like grid that supports editing, copy/paste, search, filters.

---

## 3) Key objects and mental model

User-visible objects:
- Table node: a dataset (source or derived).
- Edge: a directional transform that produces a derived table (e.g., Join, Filter, Add Column).
- Chart: a visualization attached to a table node (child object).
- Dashboard: a layout of chart cards and KPIs, exportable to PDF.

Important defaults:
- Most transforms produce a new derived table (so users don’t fear “breaking the raw data”).
- Source tables are editable in grid mode.
- Derived tables are view-only by default; users can “Create editable copy” if needed.

---

## 4) End-to-end user flows

### 4.1 Import and create tables
1) User clicks Import → chooses CSV or XLSX.
2) For XLSX, user picks sheet(s). Each sheet becomes a Table node.
3) A Table node appears on canvas immediately with:
   - name, rows/cols (approx ok initially), “profiling…” status.
4) Clicking the node opens Grid view instantly showing the first N rows.
5) Profiling results progressively appear as subtle badges/insights.

Also support “New Table”:
- Create a blank table with columns, then edit in grid.

### 4.2 Join/transform via canvas connections
1) User drags a connection handle from Table A → Table B.
2) A modal opens: “Combine data” (Join) by default, with other transforms available.
3) The modal suggests join keys and shows a preview:
   - estimated output rows
   - match rate
   - risk warnings (many-to-many)
4) On confirm, a new derived Table node is created to the right and connected directionally.

### 4.3 Analysis auto-complete in grid (fast + guided)
1) In Grid view, user clicks “Suggestions” (or selects a column and sees contextual suggestions).
2) The app proposes a small set of high-confidence actions:
   - cleaning steps (trim, type convert, fill missing)
   - quick analyses (pivot-like summaries)
   - chart suggestions
   - commerce recipes (variance, trend, contribution, reconciliation)
3) Each suggestion must show:
   - what it will create (derived table / chart / dashboard card)
   - a preview (sample rows or summarized output)
   - “Why this?” explanation in plain language
4) One click applies it and updates the canvas/dash.

### 4.4 Dashboard and PDF export
1) User creates charts from table nodes.
2) User arranges charts in a dashboard grid layout.
3) Export → generates a polished PDF with consistent typography and spacing.

---

## 5) Technical architecture (keep it clean, swappable, fast)

High-level components:
- UI (React): canvas, grid, chart/dashboard, modals, inspector.
- State store: project graph + UI state + undo/redo.
- Compute worker: all data operations off the main thread.
- Data engine adapter: a thin layer that executes transforms and returns slices/aggregates.
- Metadata/profiling service: computes schema and stats in phases; fuels suggestions.

The single most important rule:
- Never do heavy parsing, joins, profiling, or chart aggregation on the main thread.

### 5.1 Engine choice (practical, with future room)
Because datasets are small initially, prioritize development speed and reliability, but keep an engine abstraction so switching later is not a rewrite.

Recommended baseline:
- Use DuckDB-WASM OR Polars-WASM in a Web Worker.
- Choose one for implementation; design the adapter so you can swap later.

If you need the simplest mental model for transforms:
- Polars-WASM (dataframe style) can be simpler.
If you want robust joins and easy aggregation + future scale:
- DuckDB-WASM is a safe long-term bet.

Cursor instruction:
- Implement an `EngineAdapter` interface and keep transform compilation inside it.
- Do not scatter SQL or engine calls throughout UI components.

---

## 6) Data model and core data structures (important for grid editing + speed)

### 6.1 Project Graph (normalized)
Store nodes and edges in normalized form.

Node fields (minimum):
- id
- kind: `source_table | derived_table | chart | dashboard`
- name
- ui: position, collapsed state
- schema: columns (name, type, nullable, semanticHints)
- plan:
  - for source: fileRef + editPatches + inferredSchemaVersion
  - for derived: transformDef + upstreamNodeIds
- cacheInfo: lastComputedAt, lastPlanHash, warnings

Edge fields:
- id
- fromNodeId
- toNodeId
- transformType
- transformParamsRef (or embed transformDef in toNode)

### 6.2 Table identity and edits (grid needs this)
Do not rely on row position as identity once sorting/filtering exists.

Row identity strategy:
- Assign a stable internal RowId for each row in a source table.
- Sorting/filtering creates a view mapping (RowId list), not a rewritten dataset.

Editing strategy (patch overlay model):
- Base data is treated as immutable.
- Edits are stored as sparse patches:
  - `cellPatches: Map<ColumnId, Map<RowId, Value>>`
  - `deletedRows: Set<RowId>` (or bitset)
  - `insertedRows: Array<{rowId, valuesByColumnId}>`
- Grid reads base value unless patched.

Why this matters:
- Undo/redo is natural.
- Editing doesn’t trigger full recomputation.
- Derived tables can recompute based on a “source version hash”.

### 6.3 Table versions (for caching + invalidation)
Every table node has a `tableVersionHash` derived from:
- source: fileRef hash + patch hash + schema overrides
- derived: upstream hashes + transform definition hash

When something changes:
- mark downstream nodes dirty.
- recompute lazily when user views grid/chart/dashboard.

---

## 7) Transform system (v1 set)

Guideline:
- Keep transform types small and composable. Avoid “do everything” transforms.

Must-have transforms:
1) Join (Combine data)
2) Filter rows
3) Select/rename/reorder columns
4) Add calculated column (formula builder)
5) (Recommended) Group/Summarize (pivot-like)
6) (Optional) Union append

### 7.1 Join transform — safety first
Join types:
- Default: Left join
- Also: Inner, Right, Full (Full behind “Advanced” toggle)

Join UI must show preview signals:
- suggested keys ranked
- estimated output rows
- match rate (left matched %, right matched %)
- many-to-many risk warning

Row explosion risk heuristic:
- If duplicates exist on both join keys, warn clearly.
- Offer remedies:
  - “Deduplicate left/right key”
  - “Aggregate before join” (advanced)
  - “Keep first match only” (explicitly labeled as lossy)

Implementation note:
- For small datasets, you can compute exact counts.
- For larger datasets later, use sampled approximations.

### 7.2 Filter transform
Supports simple conditions with AND/OR:
- equals, not equals
- contains
- >, <, between
- is missing / not missing
Show “rows kept / rows removed” preview.

### 7.3 Select/Rename columns
Allow:
- include/exclude
- reorder
- rename inline

### 7.4 Calculated column (formula system)
Do not attempt full Excel formulas in v1.

Design a small expression language:
- column references
- arithmetic
- comparisons
- IF / CASE
- text concat
- date extraction
- COALESCE / NULL handling

The formula builder UI should support:
- “Plain English prompt” → suggests a formula (optional AI)
- a safe preview (first 20 rows)
- validation errors that are human-readable

### 7.5 Group/Summarize (pivot-like)
Allow:
- group-by columns
- aggregations: sum, avg, min, max, count, count distinct
Output is a derived table.

---

## 8) Metadata & profiling (how the app feels “smart” without being slow)

Compute metadata in phases.

Phase 1 (fast, immediate):
- infer types from sample
- missing %
- sample distinct estimate
- top values (categorical)

Phase 2 (background):
- exact distinct counts (if dataset small)
- histograms (numeric)
- key candidates (uniqueness + low missingness)
- join helper stats (value overlap sketches)
- correlation matrix (only if user enables advanced insights)

Metadata drives:
- join key suggestions
- chart defaults
- grid suggestions
- analysis recipes

Semantic hints:
- Detect patterns like “currency”, “percentage”, “ID-like”, “date-like”.
- Use heuristics (regex + stats), not AI, for baseline speed and reliability.

---

## 9) Suggestions and “analysis auto-complete” (deterministic core + optional AI)

Design principle:
- Suggestions must be bounded actions with previews, not free-form text.

### 9.1 Suggestion types
A) Data cleaning suggestions (usually create a “cleaned copy” derived table):
- trim whitespace
- normalize casing
- type conversion
- fill missing (mean/median/mode/custom)
- split column by delimiter
- remove duplicates (key-based)

B) Quick analysis suggestions (produce derived table + chart):
- “Sum of Amount by Category” (group + bar)
- “Trend of Amount over Date” (date bucket + line)
- “Top N contributors” (pareto-like)
- “Variance: Actual vs Budget” (if detected)

C) Recipe suggestions (multi-step)
- reconciliation (match/unmatched across two tables)
- ratio analysis (gross margin %, etc.)
- period-over-period changes

### 9.2 Suggestion generation pipeline
1) Deterministic rules (must implement first):
- Use schema + metadata patterns to propose actions.
- Keep it fast and stable.

2) Optional AI layer (add only after deterministic system works):
- AI rewrites suggestions into user-friendly text, proposes formulas, and picks defaults.
- AI input must be bounded:
  - column names/types/summary stats
  - top values
  - small sampled rows (e.g., 20 rows)
- Cache AI results by metadata hash so repeated opens are instant.

### 9.3 UI placement
Avoid noisy always-on AI.

Recommended:
- Grid toolbar button: “Suggestions”
- Contextual suggestions when selecting a column (small tray)
- A right-side “Insights” drawer where suggestions can live without clutter

Each suggestion card includes:
- action title
- what it creates (table/chart/dashboard)
- preview
- “Why this?” expandable explanation
- Apply / Dismiss

---

## 10) UI stack guidance (premium feel without fighting a framework)

Avoid default Material UI look unless you’re willing to override extensively.

Recommended approach for “Apple-clean”:
- React + TypeScript
- Tailwind CSS for consistent spacing and quick iteration
- Headless UI primitives (e.g., Radix) for accessible dialogs/menus
- A small design token system:
  - typography scale
  - spacing scale
  - radius/shadow
  - neutral color palette

Canvas:
- Use a stable node/edge library (e.g., React Flow) unless custom is necessary.
- Keep canvas interactions smooth: pan, zoom, snap, keyboard shortcuts.

Grid:
- Pick a grid that supports virtualization and editing cleanly.
- Criteria matter more than brand:
  - 60fps scroll
  - copy/paste
  - selection model
  - editable cells
  - column resize/reorder
If the chosen grid makes premium styling hard, wrap it in a consistent chrome.

Charts:
- Pick a chart library with good defaults and theming.
- Charts should never request raw full table data if aggregation can be done in the engine.

---

## 11) Snappiness tactics (even for “small datasets”)

The biggest sources of perceived slowness are not “CPU”, they’re:
- blocking the main thread
- re-render storms
- no progressive display

Rules:
- Heavy work in worker.
- Virtualize grid rows (always).
- Debounce expensive operations (suggestions, profiling refresh).
- Cache slices and chart aggregations.
- Show instant “good enough” results then refine.

Task scheduling:
- Prioritize in this order:
  1) current grid slice
  2) join modal preview
  3) chart aggregation preview
  4) baseline profiling
  5) advanced profiling (correlations)

---

## 12) Dashboard and PDF export (make it “deliverable quality”)

Dashboard:
- A drag-and-drop layout of cards (charts and KPI tiles).
- Keep it simple: a responsive grid with breakpoints is enough for v1.

PDF export approach:
- Implement a “print layout mode” that renders the dashboard into a paginated, print-safe layout.
- Then export using a PDF pipeline:
  - Option A: browser print-to-PDF (simple, fast)
  - Option B: render to canvas and generate PDF client-side (more control)
Choose based on quality needs; start with print mode and iterate.

Non-negotiable:
- PDF output must look like a designed report, not a screenshot dump.
- Consistent typography and spacing.

---

## 13) Storage and project persistence

v1 storage:
- Use IndexedDB to store:
  - project graph JSON
  - imported file blobs (or references if too large)
  - edit patches
  - cached previews (optional)

Support:
- Export project file: `.tablecanvas.json`
- Import project file

Project file should include:
- nodes/edges
- transforms
- dashboard layout
- schema overrides
- patches
It may omit raw file blobs initially, but then re-import prompts must exist.

---

## 14) Implementation boundaries (where to be strict vs flexible)

Be strict about:
- worker separation for compute
- normalized state + undo/redo
- patch model for edits
- join preview safety UX
- progressive display

Be flexible about:
- exact UI layout and styling details (iterate visually)
- exact grid library selection (choose one and adjust)
- whether engine is DuckDB-WASM or Polars-WASM (keep adapter clean)
- exact list of recipes in v1 (ship a small set that feels magical)

---

## 15) Suggested folder structure (guidance, not mandatory)

`/src`
- `/app` (routing, app shell)
- `/state` (stores, undo/redo, selectors)
- `/canvas` (nodes, edges, transforms UI)
- `/grid` (grid view, editors, selection, context actions)
- `/charts` (chart builder, chart components)
- `/dashboard` (layout + export)
- `/engine`
  - `EngineAdapter.ts`
  - `worker/` (worker entry + RPC)
  - `transforms/` (compile transform defs to engine ops)
- `/profiling` (schema inference, stats, hints)
- `/suggestions` (rules, ranking, optional AI integration)
- `/components` (shared UI primitives)
- `/styles` (tokens/theme)

---

## 16) Milestones (build order that keeps morale high)

Milestone 1: App shell + canvas
- basic node add/move
- connect edge opens transform modal
- undo/redo for canvas

Milestone 2: Import + grid viewer
- CSV/XLSX import
- open node → grid shows first slice
- virtualization and basic UX polish

Milestone 3: Editing + patch model
- edit cells, insert/delete rows
- undo/redo integrated

Milestone 4: Engine in worker + basic transforms
- load tables into engine
- filter/select/rename/calc
- join with preview warnings

Milestone 5: Profiling + suggestions
- phase 1 profiling
- basic deterministic suggestions in grid

Milestone 6: Charts + dashboard
- chart builder
- dashboard layout
- print layout mode

Milestone 7: PDF export
- export pipeline
- quality iteration

Milestone 8: Recipes (commerce)
- 3–5 recipes that feel high impact:
  - trend
  - category contribution
  - variance
  - reconciliation
  - ratio KPI

---

## 17) Acceptance criteria (v1.0.0 “it’s real” checklist)

A user can:
- Import CSV and XLSX and see each as a table node.
- Click any table and view/edit it in an Excel-like grid with undo/redo.
- Connect two tables and create a join with suggested keys and explosion warnings.
- Apply filters and add calculated columns via a formula builder with preview.
- See profiling insights (missing %, type suggestions) without clutter.
- Click “Suggestions” in grid and one-click generate a useful analysis output (table + chart).
- Build a dashboard from charts and export a clean PDF.

---

## 18) Open questions (explicitly allowed to decide during build)

These are intentionally not fully specified; Cursor/implementation can choose reasonable defaults, but must keep architecture flexible.

1) Engine selection:
- DuckDB-WASM vs Polars-WASM (pick one for v1; keep adapter swappable).

2) Grid library:
- Choose based on editing + virtualization + styling constraints.

3) Derived table editability:
- Default: view-only, “Create editable copy” option.
- Decide whether to allow direct editing later.

4) Recipe catalog depth:
- Start with 3–5 high-impact recipes, expand later.

5) AI integration:
- Start deterministic.
- Add AI only when deterministic suggestions are solid and UI feels stable.

---

## 19) Build philosophy for Cursor

Cursor should:
- Implement core primitives first (tables, transforms, worker engine adapter, patches, profiling).
- Keep UI minimal but polished early (spacing, typography, animations).
- Avoid overfitting to edge cases in v1; focus on trust + delight.
- Leave hooks and interfaces clean so more transforms/recipes can be added without refactors.

End of spec.
```
