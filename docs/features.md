# Features

## Layout

The app shell (`src/layout/`) is a sidebar plus a main view area. The sidebar lists tables and
charts and has buttons to switch between Canvas, Dashboard, and Report views. The main area swaps
between five views: canvas, grid, chart, dashboard, and report. Double-clicking a table node
opens the grid; clicking a chart node opens the chart editor.

## Canvas

A node-based editor (ReactFlow) where you build pipelines by connecting tables.

### Node types

- **Source tables**: created by importing a CSV/Excel file or via "New Table". Show file name,
  row count, and column count. Support in-place cell editing; edits are stored as patches,
  separate from the original data.
- **Derived tables**: created by connecting nodes and choosing a transform. Show the transform
  type and source. Recompute automatically when upstream data changes. Read-only.
- **Charts**: visualizations bound to a source table.

### Interactions

| Action | Behavior |
|--------|----------|
| Drag node | Move it; edges follow |
| Double-click table | Open grid view |
| Click chart | Open chart editor |
| Connect nodes | Open the transform modal |
| Delete / Backspace | Remove selected node |
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z | Redo |

### Auto-arrange

Uses Dagre to lay out nodes by depth in the dependency graph, either left-to-right or
top-to-bottom.

### Cycle prevention

Connecting nodes is blocked if it would create a cycle; a warning toast explains why.

## Grid

A virtualized spreadsheet for viewing and editing table data.

- Virtual scrolling (only visible rows are rendered), so large tables stay responsive
- Column resize, cell and range selection, copy (Cmd/Ctrl+C), drag-to-autofill
- Column filtering panel
- Editing (source tables only): double-click a cell, Enter to confirm, Escape to cancel, Tab to
  move on. Changes are stored as patches.

### Formula columns

Add computed columns with a spreadsheet-like syntax:

```
=Column1 * 0.1
=IF(Status = "Active", Price, 0)
=CONCAT(FirstName, " ", LastName)
```

Functions are grouped by category (`src/formula/`):

| Category | Functions |
|----------|-----------|
| Math | SUM, AVG, MIN, MAX, COUNT, ROUND, ABS, FLOOR, CEIL, POWER, SQRT, MOD, NUMBER |
| Text | CONCAT, UPPER, LOWER, TRIM, LEFT, RIGHT, MID, LEN, FIND, REPLACE, SUBSTITUTE, TEXT |
| Logic | IF, AND, OR, NOT, ISNULL, IFNULL, COALESCE, BOOLEAN |
| Date | NOW, TODAY, YEAR, MONTH, DAY, HOUR, MINUTE, SECOND, DATE, DATEDIFF |

Operators: `+`, `-`, `*`, `/`, `%`, `^`, `=`, `<>`, `>`, `<`, `>=`, `<=`, `AND`, `OR`.

## Transforms

Opened from the transform modal when you connect nodes. Six types:

- **Filter**: keep rows matching conditions, combined with AND or OR. Operators include equals,
  not equals, contains / not contains, starts/ends with, greater/less than, greater/less-or-equal, between,
  is null / is not null.
- **Group & Summarize**: group by columns and aggregate with SUM, AVG, MIN, MAX, COUNT, or
  COUNT DISTINCT.
- **Join**: combine two tables on key columns. Inner, left, right, or full. You can pick which
  columns to keep and how to disambiguate names.
- **Select**: project a subset of columns and/or rename them.
- **Calculated column**: add a column from a formula expression (same engine as formula columns).
- **Union**: stack rows from multiple tables.

No pivot or standalone sort transform.

## Charts

Created from the suggestions panel or by adding a chart node bound to a table. Types: **bar,
line, pie, scatter**. Configure the X/Y columns, aggregation, and optional grouping. Charts update
when their source data changes.

## Suggestions engine

Analyzes table profiles and recommends transforms, charts, and cleaning actions
(`src/suggestions/`).

**Categories**

- **Analysis**: trend charts (date + numeric), category breakdowns, distributions, top-N.
- **Cleaning**: type mismatches, whitespace, casing inconsistencies, outliers.
- **Recipes**: guided multi-step flows like time-series aggregation or variance analysis.

**How it works**

1. Profile the table (column stats + semantic hints).
2. Classify each column (continuous numeric, categorical, date, id-like, etc.).
3. Match rules; each rule has a `when` predicate.
4. Score matches by confidence/relevance.
5. Show the top suggestions; applying one runs the corresponding command.

## Dashboard

A read-only "Project Overview" (`src/dashboard/`) that summarizes the whole project:

- **Header stats**: total tables, rows, columns, and overall data completeness.
- **Lineage mini-map**: a compact view of the node graph; click a node to jump to it.
- **Table stats**: per-table row/column counts and data-quality metrics from the profiler.
- **Quick actions**: the top suggestions, applied directly from the dashboard.

Empty until you import data.

## Reports

Notion-style rich-text documents (TipTap) that embed live tables and charts (`src/report/`).

- **Editing**: headings, bold/italic/underline, lists, code blocks, quotes, callouts, toggles,
  horizontal rules, plus a slash (`/`) command menu for inserting blocks.
- **Embedded blocks**: embedded table (references a project table, stays in sync), inline/editable
  table (static, manually entered), and chart.
- **Export**: reports are written as HTML into the project ZIP; there's also a PDF export path.

## Persistence

- **Local (IndexedDB)**: projects auto-save: graph (nodes/edges/patches), imported files,
  cached results, and reports. Everything lives locally by default.
- **Server sync**: when connected to the backend, the project graph (nodes, edges, patches)
  syncs to MongoDB on save. Files are stored in GridFS and fetched on load. Reports stay
  local-only and are not part of server sync.

## Export

- **Project** (`.tablecanvas.zip`): `project.tablecanvas.json` (full state with base64-encoded
  source files), `data.xlsx` (every table as a sheet), and `reports/*.html`. Self-contained.
- **Data**: all tables are included as sheets in `data.xlsx` inside the project ZIP.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + Z | Undo |
| Cmd/Ctrl + Shift + Z | Redo |
| Delete / Backspace | Delete selected node |
| Escape | Cancel edit (grid) / close dialog |
| Tab | Next cell (grid) |
| Enter | Confirm edit / open cell |
| Cmd/Ctrl + C | Copy selected cells |
