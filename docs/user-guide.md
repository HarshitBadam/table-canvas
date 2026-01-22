# Table Canvas User Guide

This guide covers importing data, creating analyses, and building dashboards in Table Canvas.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Importing Data](#importing-data)
3. [Working with the Canvas](#working-with-the-canvas)
4. [Editing Data in Grid View](#editing-data-in-grid-view)
5. [Creating Joins and Transforms](#creating-joins-and-transforms)
6. [Using Suggestions](#using-suggestions)
7. [Creating Charts](#creating-charts)
8. [Building Dashboards](#building-dashboards)
9. [Exporting to PDF](#exporting-to-pdf)
10. [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Getting Started

### Running the Application

```bash
npm run dev
# Open http://localhost:5173
```

### Interface Overview

- **Sidebar (left)** — Import data, create new tables, view table list
- **Canvas (center)** — Visual view of your data tables and their relationships
- **Grid View** — Opens when you double-click a table to view/edit data

---

## Importing Data

### CSV Files

1. Click **Import Data** in the sidebar
2. Select a `.csv` file
3. The table appears on the canvas

### Excel Files

1. Click **Import Data** in the sidebar
2. Select an `.xlsx` or `.xls` file
3. If the file has multiple sheets, select which ones to import
4. Each selected sheet becomes a separate table

### Blank Tables

1. Click **New Table** in the sidebar
2. Double-click to open in Grid View and add data

---

## Working with the Canvas

### Navigation

| Action | How |
|--------|-----|
| Pan | Click and drag on empty space |
| Zoom | Scroll wheel or pinch gesture |
| Select | Click on a table node |
| Move | Drag a table node |

### Table Nodes

Each node displays:
- **Name** — Table name at the top
- **Stats** — Row and column counts
- **Columns** — First 4 column names with types
- **Badge** — "Source" (imported) or "Derived" (from transform)

**Double-click** any table to open it in Grid View.

---

## Editing Data in Grid View

### Navigation

| Action | How |
|--------|-----|
| Move between cells | Arrow keys |
| Select a cell | Click |
| Select a column | Click the header |
| Scroll | Mouse wheel or trackpad |

### Editing Cells

Source tables can be edited. Derived tables are read-only.

1. Select a cell
2. Press **Enter** or double-click to edit
3. Type the new value
4. Press **Enter** to save, **Escape** to cancel, **Tab** to save and move right

### Undo/Redo

- **Undo**: `Cmd+Z` (Mac) / `Ctrl+Z` (Windows)
- **Redo**: `Cmd+Shift+Z` / `Cmd+Y`

---

## Creating Joins and Transforms

### Creating a Join

1. Find the **connection handle** (blue dot) on the right side of a table
2. Drag from this handle to another table
3. In the Transform Modal, select **Join**
4. Choose join type, left key, and right key
5. Review suggested keys (ranked by match confidence)
6. Check the preview for estimated rows and warnings
7. Click **Create Table**

### Join Types

| Type | Result |
|------|--------|
| Left | All rows from left table, matched rows from right |
| Inner | Only rows that match in both tables |
| Right | All rows from right table, matched rows from left |
| Full | All rows from both tables |

---

## Using Suggestions

### Accessing Suggestions

1. Open a table in Grid View
2. Click **Suggestions** in the toolbar

### Suggestion Categories

**Cleaning**
- Fill missing values
- Convert data types
- Trim whitespace
- Remove duplicates

**Analysis**
- Sum by category
- Trend over time
- Top contributors
- Distribution analysis

**Recipes**
- Variance analysis (actual vs budget)
- Trend analysis
- Category contribution (Pareto)
- Ratio KPIs

### Applying a Suggestion

1. Click a suggestion card to expand it
2. Review the preview and explanation
3. Click **Apply**

---

## Creating Charts

### Chart Types

| Type | Use Case |
|------|----------|
| Bar | Compare categories |
| Line | Show trends over time |
| Pie | Show composition/proportions |
| Scatter | Show correlations |

### Configuration

1. Select the data source table
2. Choose chart type
3. Set X axis (category or time dimension)
4. Set Y axis (numeric value)
5. Choose aggregation (Sum, Average, Count, Min, Max)
6. Optionally set Group By for multiple series

---

## Building Dashboards

### Adding Charts

1. Create charts on the canvas
2. Open the Dashboard view
3. Click **Add Chart**
4. Select from available charts

Charts appear in a responsive grid layout.

---

## Exporting to PDF

1. Open the Dashboard view
2. Click **Export PDF**
3. In the browser print dialog, select "Save as PDF"
4. Click Save

### Recommended Print Settings

- Margins: Default or Minimum
- Background graphics: Enabled
- Orientation: Match your dashboard layout

---

## Keyboard Shortcuts

### Global

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |

### Grid View

| Shortcut | Action |
|----------|--------|
| Arrow keys | Navigate cells |
| `Enter` | Edit selected cell |
| `Escape` | Cancel editing |
| `Tab` | Save and move to next cell |

### Canvas

| Shortcut | Action |
|----------|--------|
| `Delete` / `Backspace` | Delete selected node |
| Scroll | Zoom in/out |

---

## Tips

### Data Import
- Use consistent date formats
- Remove empty rows/columns before import

### Joins
- Start with Left Join if unsure
- Pay attention to many-to-many warnings
- Use the suggested keys when available

### Performance
- The app handles thousands of rows smoothly
- Large files (100k+ rows) may take longer to profile
- Use filters to work with subsets

### Saving
- Projects auto-save to browser storage
- Export important projects as `.tablecanvas.json`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Table won't open | Double-click (not single click) |
| Can't edit a cell | Check if it's a Source table (Derived tables are read-only) |
| Join not working | Check for compatible key columns and matching data types |
| Buttons not responding | Refresh the page |
