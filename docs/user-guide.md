# Table Canvas User Guide

Welcome to Table Canvas! This guide will help you get started with importing data, creating analyses, and building dashboards.

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

### Starting the Application

1. Open your terminal
2. Navigate to the project folder
3. Run `npm run dev`
4. Open http://localhost:5173 in your browser

### Interface Overview

The interface has three main areas:

- **Sidebar (left)**: Import data, create new tables, view table list
- **Canvas (center)**: Visual view of your data tables and their relationships
- **Grid View**: Opens when you double-click a table to view/edit data

---

## Importing Data

### Importing CSV Files

1. Click **"Import Data"** in the left sidebar
2. Select a `.csv` file from your computer
3. The file will be parsed and appear as a new table on the canvas

### Importing Excel Files

1. Click **"Import Data"** in the left sidebar
2. Select an `.xlsx` or `.xls` file
3. If the file has multiple sheets:
   - A dialog will appear showing all sheets
   - Check the sheets you want to import
   - Click **"Import X Sheet(s)"**
4. Each selected sheet becomes a separate table on the canvas

### Creating a Blank Table

1. Click **"New Table"** in the left sidebar
2. A new empty table will appear on the canvas
3. Double-click to open in Grid View and add data

---

## Working with the Canvas

### Navigating the Canvas

- **Pan**: Click and drag on empty space
- **Zoom**: Use scroll wheel or pinch gesture
- **Select**: Click on a table node
- **Move**: Drag a table node to reposition it

### Understanding Table Nodes

Each table node shows:
- **Name**: The table name at the top
- **Stats**: Row and column counts
- **Columns**: First 4 column names with their types
- **Badge**: "Source" (imported/created) or "Derived" (from transform)

### Opening a Table

**Double-click** any table node to open it in Grid View.

---

## Editing Data in Grid View

### Opening Grid View

Double-click a table on the canvas to open it in Grid View.

### Navigating the Grid

| Action | How |
|--------|-----|
| Move between cells | Arrow keys |
| Select a cell | Click on it |
| Select a column | Click the column header |
| Scroll | Mouse wheel or trackpad |

### Editing Cells (Source Tables Only)

Source tables (imported or created) can be edited. Derived tables are read-only.

1. **Select** a cell by clicking on it
2. **Press Enter** or **double-click** to start editing
3. **Type** your new value
4. **Press Enter** to save, or **Escape** to cancel
5. **Press Tab** to save and move to the next cell

### Undo/Redo

- **Undo**: `Cmd+Z` (Mac) or `Ctrl+Z` (Windows)
- **Redo**: `Cmd+Shift+Z` or `Cmd+Y`

---

## Creating Joins and Transforms

### Creating a Join

1. On the canvas, find the **connection handle** (small blue dot) on the right side of a table
2. **Drag** from this handle to another table
3. A **Transform Modal** will appear
4. Select **"Join"** as the transform type
5. Choose:
   - **Join Type**: Left, Inner, Right, or Full
   - **Left Key**: Column from the first table
   - **Right Key**: Column from the second table
6. Review the **suggested keys** (ranked by match confidence)
7. Check the **preview** for estimated rows and warnings
8. Click **"Create Table"**

### Join Types Explained

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
2. Click the **"Suggestions"** button in the toolbar

### Types of Suggestions

**Cleaning Suggestions**
- Fill missing values
- Convert data types
- Trim whitespace
- Remove duplicates

**Analysis Suggestions**
- Sum by category
- Trend over time
- Top contributors
- Distribution analysis

**Recipe Suggestions**
- Variance analysis (actual vs budget)
- Trend analysis
- Category contribution (Pareto)
- Ratio KPIs

### Applying a Suggestion

1. Click on a suggestion card to expand it
2. Review the preview and explanation
3. Click **"Apply"** to execute the suggestion

---

## Creating Charts

### From the Canvas

1. Right-click on a table node (coming soon)
2. Or use the Suggestions panel to create charts

### Chart Types Available

- **Bar Chart**: Compare categories
- **Line Chart**: Show trends over time
- **Pie Chart**: Show composition/proportions
- **Scatter Chart**: Show correlations

### Configuring a Chart

1. Select **Data Source**: Which table to visualize
2. Choose **Chart Type**: Bar, Line, Pie, or Scatter
3. Set **X Axis**: Category or time dimension
4. Set **Y Axis**: Numeric value to display
5. Choose **Aggregation**: Sum, Average, Count, Min, Max
6. Optionally set **Group By** for multiple series

---

## Building Dashboards

### Accessing the Dashboard

The Dashboard view is accessible via the Dashboard component. Currently, charts created on the canvas can be added to a dashboard layout.

### Adding Charts to Dashboard

1. First, create charts on your canvas
2. Open the Dashboard view
3. Click **"Add Chart"**
4. Select from available charts
5. Charts appear in a grid layout

### Arranging Charts

- Charts can be positioned in a responsive grid
- Each chart shows as a card with title and visualization

---

## Exporting to PDF

### Quick Export

1. Open the Dashboard view
2. Click **"Export PDF"** button
3. Use your browser's print dialog
4. Select "Save as PDF" as the destination
5. Click Save

### Print Settings

For best results:
- Set margins to "Default" or "Minimum"
- Enable "Background graphics"
- Choose "Portrait" or "Landscape" based on your dashboard

### What's Included

- All charts in your dashboard
- Chart titles and legends
- Clean, professional formatting
- Consistent typography

---

## Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + Y` | Redo (alternative) |

### Grid View Shortcuts

| Shortcut | Action |
|----------|--------|
| `↑` `↓` `←` `→` | Navigate cells |
| `Enter` | Edit selected cell |
| `Escape` | Cancel editing |
| `Tab` | Save and move to next cell |
| `Double-click` | Edit cell |

### Canvas Shortcuts

| Shortcut | Action |
|----------|--------|
| `Delete/Backspace` | Delete selected node |
| `Click + Drag` | Move node |
| `Scroll` | Zoom in/out |

---

## Tips & Best Practices

### Data Import
- Clean your data before importing for best results
- Use consistent date formats
- Remove completely empty rows/columns

### Joins
- Start with a Left Join if unsure
- Pay attention to many-to-many warnings
- Use the suggested keys when available

### Performance
- The app handles thousands of rows smoothly
- Very large files (100k+ rows) may take a moment to profile
- Use filters to work with subsets of large data

### Saving Your Work
- Projects are auto-saved to your browser's storage
- Export important projects as `.tablecanvas.json` files
- Re-import project files when needed

---

## Troubleshooting

### Table won't open in Grid View
- Make sure you **double-click** (not single click)
- Single click selects, double-click opens

### Can't edit a cell
- Check if it's a **Source** table (editable) vs **Derived** table (read-only)
- Press **Enter** or **double-click** to start editing

### Join not working
- Ensure both tables have compatible key columns
- Check for data type mismatches

### Buttons not responding
- Try refreshing the page
- Check browser console for errors
- Ensure you're clicking the button (not the icon)

---

## Getting Help

If you encounter issues:
1. Refresh the page
2. Check the browser console for errors (`F12` → Console tab)
3. Try with a smaller dataset to isolate the issue
4. Review this guide for the correct workflow

---

*Table Canvas v1.0.0*

