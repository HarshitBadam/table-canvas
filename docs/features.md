# Features

## Canvas Interface

The canvas is a node-based visual editor built on ReactFlow where users construct data pipelines by connecting tables.

### Node Types

**Source Tables**
- Created by importing CSV or Excel files
- Display file name, row count, column count
- Support in-place cell editing (patches)
- Patches are stored separately from original data

**Derived Tables**
- Created by connecting nodes and selecting a transform
- Display transform type and source table name
- Automatically recompute when upstream data changes
- Cannot be directly edited (read-only)

**Charts**
- Visualizations linked to a source table
- Supported types: bar, line, histogram, pie
- Single-click to open chart editor

### Interactions

| Action | Behavior |
|--------|----------|
| Drag node | Updates position, edges follow |
| Double-click table | Opens grid view |
| Single-click chart | Opens chart editor |
| Connect nodes | Opens transform modal |
| Delete/Backspace | Removes selected node |
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z | Redo |

### Auto-Arrange

The "Auto-Arrange" button uses Dagre layout algorithm to organize nodes:
- Horizontal (LR): Left-to-right flow
- Vertical (TB): Top-to-bottom flow

Nodes are positioned based on their depth in the dependency graph.

### Cycle Prevention

When connecting nodes, the system checks if the connection would create a cycle. If detected, a warning toast appears and the connection is blocked.

---

## Grid View

The grid is a virtualized spreadsheet component for viewing and editing table data.

### Features

- Virtual scrolling for large datasets (tested up to 100k rows)
- Column resize by dragging headers
- Cell selection (single cell or range)
- Copy/paste support
- Autofill by dragging cell handle
- Filter panel for column-based filtering
- Column statistics on hover

### Editing (Source Tables Only)

- Double-click cell to edit
- Enter to confirm, Escape to cancel
- Tab to move to next cell
- Changes stored as patches, preserving original data

### Formula Columns

Add computed columns using a spreadsheet-like formula syntax:

```
=Column1 * 0.1
=IF(Status = "Active", Price, 0)
=CONCAT(FirstName, " ", LastName)
```

**Supported functions:**
| Category | Functions |
|----------|-----------|
| Math | SUM, AVG, MIN, MAX, COUNT, ROUND, ABS, FLOOR, CEIL, POWER, SQRT, MOD |
| Text | CONCAT, UPPER, LOWER, TRIM, LEFT, RIGHT, MID, LEN, SUBSTITUTE |
| Logic | IF, AND, OR, NOT, ISNULL |
| Date | NOW, TODAY, YEAR, MONTH, DAY, DATEDIFF |

**Operators:** `+`, `-`, `*`, `/`, `%`, `^`, `=`, `<>`, `>`, `<`, `>=`, `<=`, `AND`, `OR`

---

## Suggestions Engine

The suggestions engine analyzes table data and recommends transformations, charts, and data cleaning actions.

### Rule Categories

**Analysis**
- Trend charts (date + numeric columns)
- Category breakdowns (categorical + numeric)
- Distribution histograms (continuous numeric)
- Top N analysis

**Cleaning**
- Type mismatches (date columns stored as strings)
- Whitespace issues
- Casing inconsistencies
- Outlier detection

**Recipes**
- Time series aggregation
- Variance analysis (budget vs actual)

### How It Works

1. **Profiling:** When a table is selected, the engine computes column statistics (distinct count, min, max, null rate, etc.)
2. **Classification:** Columns are classified (continuous numeric, categorical, date, ID, etc.)
3. **Rule Matching:** Each rule has a `when` predicate that checks if it applies
4. **Scoring:** Matching rules are scored by confidence and relevance
5. **Display:** Top suggestions shown in a panel

### Column Classification

| Classification | Criteria |
|----------------|----------|
| `id_like` | High cardinality (>90%), sequential |
| `continuous_numeric` | Numeric, high distinct ratio |
| `discrete_numeric` | Numeric, low distinct values |
| `low_cardinality_cat` | String, <50 distinct values |
| `high_cardinality_cat` | String, 50-500 distinct values |
| `date_like` | Parsed as date |

---

## Transforms

### Filter

Filter rows based on conditions.

**Condition types:**
- Equals / Not equals
- Greater than / Less than
- Contains / Starts with / Ends with
- Is null / Is not null

**Logic:** AND (all conditions) or OR (any condition)

### Group & Summarize

Group rows and compute aggregations.

**Aggregations:** SUM, AVG, MIN, MAX, COUNT, COUNT DISTINCT

**Example:** Group by `Category`, compute SUM of `Revenue`

### Join

Combine two tables on matching keys.

**Join types:**
- Inner: Only matching rows
- Left: All left rows, matching right
- Right: All right rows, matching left
- Full: All rows from both

### Pivot

Reshape data by turning row values into columns.

**Example:** Rows with `Month` values become columns `Jan`, `Feb`, etc.

### Select Columns

Pick a subset of columns or reorder them.

### Sort

Order rows by one or more columns (ascending or descending).

---

## Charts

Charts are created from the suggestions panel or by connecting a table to a chart node.

### Chart Types

| Type | Best For |
|------|----------|
| Bar | Category comparisons |
| Line | Trends over time |
| Histogram | Value distributions |
| Pie | Part-to-whole relationships |

### Configuration

- X-axis column
- Y-axis column (for bar/line)
- Aggregation (sum, avg, count)
- Group by (optional, for stacked/grouped)

Charts automatically update when source data changes.

---

## Reports

Rich-text documents that embed tables and charts.

### Editor Features

- WYSIWYG editing (TipTap)
- Headings, bold, italic, underline
- Bullet and numbered lists
- Code blocks
- Block quotes
- Horizontal rules

### Embedded Blocks

- **Table Snippet:** Reference a table (auto-updates)
- **Chart:** Embed a chart visualization
- **Inline Table:** Static table for manual data

### Export

Reports export as HTML files in the project ZIP.

---

## Export Formats

### Project Export (`.tablecanvas.zip`)

A ZIP archive containing:

```
project.tablecanvas.json    # Full project state
data.xlsx                   # All tables as Excel sheets
reports/
  └── *.html                # Reports as HTML
```

The JSON file includes base64-encoded source files, making the export fully self-contained and portable.

### Table Export

Individual tables can be exported as:
- CSV
- Excel (.xlsx)
- JSON

---

## Persistence

### Local (IndexedDB)

Projects are auto-saved to IndexedDB:
- Project metadata (nodes, edges, patches)
- Imported files (as ArrayBuffer)
- Cache data (profiles, computed slices)
- Reports

### Server Sync

When authenticated, projects sync to MongoDB:
- Full project state stored
- Files stored in GridFS
- Bidirectional sync on load/save

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + Z | Undo |
| Cmd/Ctrl + Shift + Z | Redo |
| Delete / Backspace | Delete selected node |
| Escape | Deselect / Close modal |
| Tab | Next cell (in grid) |
| Enter | Confirm edit / Open cell |
| Cmd/Ctrl + C | Copy |
| Cmd/Ctrl + V | Paste |
