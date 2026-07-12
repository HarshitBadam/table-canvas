# Table Canvas — Technical Audit and Closure Baseline

**Date:** 2026-07-12
**Scope:** `src/`
**Status:** Post-critique, hardening, responsive, optimization, color, distillation, and polish passes

This document is the fixed reference for the current quality state and the remaining release work. It exists to prevent another open-ended audit/fix/polish loop with changing criteria.

## Current score

| Dimension | Score | Rationale |
|---|---:|---|
| Accessibility | 3/4 | Broad axe and keyboard coverage passes, but chart and report controls retain uncovered keyboard/focus gaps. |
| Performance | 2/4 | Worker isolation, code splitting, and row virtualization are strong; startup materialization, import cloning, and broad grid updates remain material costs. |
| Responsive design | 3/4 | Mobile, tablet, and desktop contracts pass; several report/grid controls remain below 44px. |
| Theming | 2/4 | The core shell and canvas are token-native; ChartView, FormulaColumnModal, and report-editor CSS still use parallel palettes. |
| Anti-patterns | 3/4 | Core inspected surfaces are restrained and credible; decorative gradient/glass treatments remain in secondary report/chart views. |
| **Total** | **13/20 — Acceptable** | No P0 blockers, but two systemic dimensions remain unfinished. |

### Severity summary

- **P0 Blocking:** 0
- **P1 Major:** 4
- **P2 Minor:** 8
- **P3 Polish:** 2

The 13/20 score does **not** mean the application is generally poor. The production build, core interface, automated accessibility, responsive behavior, and test coverage are solid. The score remains low because the rubric gives equal weight to two unfinished systemic areas—performance architecture and legacy theming—and reserves 4/4 for near-complete implementation.

## Why the previous loop did not close

The completed passes substantially improved visible UI quality, accessibility coverage, responsiveness, and bundle splitting. The final audit then widened the scope to architecture and legacy surfaces that were not part of the original fixed backlog:

- Serial project materialization during startup
- Full row-set cloning across the worker boundary
- Grid horizontal scaling and context invalidation
- ChartView and report-editor token drift
- Chart/report keyboard interactions not covered by the existing contracts

That made the final score non-comparable with earlier reviews. The criteria in this document are now frozen. Future work should address only the verified items below, followed by the same audit rubric.

## Work already completed

The following passes have already been performed:

1. `/impeccable critique src`
2. `/impeccable audit src`
3. `/impeccable harden src`
4. `/impeccable adapt src`
5. `/impeccable optimize src`
6. `/impeccable colorize src`
7. `/impeccable distill src`
8. `/impeccable polish src`
9. Final `/impeccable audit src`

Material outcomes include:

- Responsive application shell, navigation, dialogs, grid toolbar, and report surfaces
- Coarse-pointer sizing and safe-area support
- Lazy loading for Grid, Chart, Dashboard, Report, parsers, and export paths
- Worker-backed DuckDB execution and row virtualization
- Simplified headers, toolbars, navigation, and suggestion layouts
- Consolidated CSS/Tailwind semantic tokens for the core shell
- Refined canvas and dashboard empty states
- Token-native FilterPanel shell and filter cards
- Reliable FilterPanel initial focus and focus restoration
- Updated light/dark visual baselines

## Verification baseline

The latest work was checked with:

- `npm run build` — passes
- `npm run lint` — passes
- `npm run check:dead-code` — passes, including dependency-cycle checks
- `npm run test:run` — **545/545 unit tests pass**
- Responsive Playwright contracts — **7/7 pass**
- Targeted visual regression contracts — pass; intentional snapshots updated
- Accessibility/keyboard contracts — all checks pass across the final verification runs
  - One full run passed 10/11 and hit a timing-sensitive New Table Escape check
  - That exact check passed immediately when rerun in isolation
  - This is treated as test timing evidence, not a confirmed product defect

### Production build profile

| Asset | Raw | Gzip | Loading behavior |
|---|---:|---:|---|
| Main application JS | 634 KB | 201 KB | Initial |
| GridView | 124 KB | 33 KB | Lazy |
| ReportView | 496 KB | 153 KB | Lazy |
| ChartRenderer | 401 KB | 102 KB | Lazy |
| XLSX | 424 KB | 140 KB | On demand |
| HTML-to-PDF | 777 KB | 233 KB | On demand |
| DuckDB WASM | 34–39 MB per selected variant | 7.7–8.8 MB | Runtime selects one variant |

The build emits all three DuckDB WASM variants for compatibility, but clients fetch only the selected variant. This is a hosting/deployment-size concern, not a triple-download runtime defect.

## Verified P1 findings

### 1. Startup waits for project-wide serial materialization

- **Location:** `src/state/projectLifecycle.ts:20-50`, `src/state/AppProvider.tsx:146-201`
- **Category:** Performance
- **Impact:** Existing projects wait for every source and derived table to materialize before the application enters the ready phase. Startup time grows with the sum of table materialization times.
- **Recommendation:** Render the project shell/canvas before all tables finish. Materialize source tables concurrently where safe and derived tables by dependency order, or lazily materialize on first use.
- **Suggested command:** `/impeccable optimize src/state src/engine`

### 2. Large imports clone the full dataset across the worker boundary

- **Location:** `src/engine/EngineAdapter.ts:60-109`, `src/engine/worker/tableWriteOperations.ts:13-30`
- **Category:** Performance
- **Impact:** The main thread preprocesses the complete row array, then structured-clones the full request to the worker before worker-side batching begins. Large imports can create memory spikes and main-thread stalls.
- **Recommendation:** Stream batches through RPC, use transferable buffers/Arrow, or parse and load directly inside the worker.
- **Suggested command:** `/impeccable optimize src/engine`

### 3. Chart title rename is pointer-only

- **Location:** `src/charts/ChartView.tsx:145-151`
- **Category:** Accessibility
- **Impact:** The chart title uses `onClick` on an `<h1>` without keyboard activation. Keyboard-only users cannot rename a chart from this view.
- **Standard:** WCAG 2.1.1 Keyboard
- **Recommendation:** Use a semantic button styled as a heading, or provide `tabIndex`, a suitable role/name, and Enter/Space activation.
- **Suggested command:** `/impeccable harden src/charts`

### 4. Report menu and custom picker focus behavior is incomplete

- **Location:** `src/report/ReportToolbar.tsx:277-320`, `src/report/editor/nodes/DimensionPicker.tsx:23-55`, `src/report/editor/nodes/TablePickerModal.tsx`
- **Category:** Accessibility
- **Impact:** The Insert menu lacks Arrow/Home/End navigation and Escape refocus behavior. Custom report pickers do not consistently trap and restore focus.
- **Standard:** WCAG 2.1.1, WCAG 2.4.3, WAI-ARIA menu/dialog patterns
- **Recommendation:** Reuse the established menu keyboard utility and shared dialog focus primitive, or migrate these surfaces to Radix Dialog/Menu.
- **Suggested command:** `/impeccable harden src/report`

## Verified P2 findings

### 1. Grid virtualizes rows but not columns

- **Location:** `src/grid/GridViewport.tsx:78-104`
- **Impact:** Every visible row renders every column. A 50-column table with roughly 35 mounted rows creates about 1,750 cells even when most columns are outside the horizontal viewport.
- **Recommendation:** Add horizontal virtualization with a small overscan window.

### 2. Grid interaction state has a broad render blast radius

- **Location:** `src/grid/GridContext.tsx`, `src/grid/GridCell.tsx`, `src/grid/useColumnResize.ts`
- **Impact:** Selection, resize, autofill, editing, and data state share a large context. Resize and selection pointer updates can rerender all visible cells.
- **Recommendation:** Split context by update frequency, memoize cells with narrow props, and use `requestAnimationFrame` for resize previews.

### 3. Filter statistics are calculated while the panel is closed

- **Location:** `src/grid/FilterPanel.tsx:47-66`
- **Impact:** Unique-value counts are computed before the closed-panel early return, scanning rows × columns unnecessarily.
- **Recommendation:** Guard the calculation with `isOpen` or query distinct counts through the engine.

### 4. Autosave follows every graph mutation

- **Location:** `src/state/AppProvider.tsx:210-222`
- **Impact:** Changes to nodes, edges, patches, or project name trigger saving, including position updates during graph interaction.
- **Recommendation:** Debounce saves and commit drag positions on drag end.

### 5. Report-editor design-token drift remains systemic

- **Location:** `src/report/editor/styles/`
- **Evidence:** A targeted detector scan found 99 findings across five report CSS files:
  - 67 color findings
  - 25 font-size findings
  - 6 radius findings
  - 1 side-tab warning
- **Impact:** The editor can look and behave like a parallel product despite the token-native shell.
- **Recommendation:** Remove zinc fallbacks and migrate colors, type sizes, radii, and states to the documented tokens.

### 6. ChartView and FormulaColumnModal bypass semantic primitives

- **Location:** `src/charts/ChartView.tsx`, `src/grid/FormulaColumnModal.tsx`, `src/grid/FilterInputs.tsx`, `src/grid/EnumMultiSelect.tsx`
- **Impact:** Raw gray/emerald Tailwind classes create a different visual vocabulary from NewTableModal, ChartBuilder, Sidebar, and the polished FilterPanel.
- **Recommendation:** Adopt `bg-surface*`, `text-text-*`, `border-border`, `.input`, and `.btn-*`.

### 7. Several pointer targets remain below 44px

- **Location:** `src/report/ReportToolbar.tsx:143-152,263-290`, `src/grid/GridCell.tsx:219-237`, `src/grid/ColumnHeader.tsx:115-127`
- **Impact:** Report controls are 40px on mobile; the autofill handle is visually and interactively 12px; the column filter control is icon-sized.
- **Standard:** WCAG 2.5.8 Target Size
- **Recommendation:** Keep compact visuals but add 44px coarse-pointer hit areas.

### 8. Dark report callouts lose semantic distinction

- **Location:** `src/report/editor/styles/callout-toggle-blocks.css`
- **Impact:** Info, success, warning, and error callouts collapse to nearly identical neutral styling in dark mode.
- **Recommendation:** Map each type to the existing semantic soft/text tokens.

## P3 findings

### 1. All DuckDB variants are emitted

- **Location:** `vite.config.ts`
- **Impact:** Hosting/storage includes approximately 103 MB of WASM variants, although each client downloads only one.
- **Recommendation:** If browser support permits, emit only the supported target variant. Otherwise retain compatibility and treat this as infrastructure cost.

### 2. Secondary decorative treatments remain

- **Location:** `src/report/editor/nodes/ChartNodeView.tsx`, `src/dashboard/components/LineageMiniMap.tsx`, chart tooltip styling
- **Impact:** Gradient/glass styling and multi-color decorative edges remain at the product’s edges, although the core canvas, dashboard, and report start surfaces are restrained.
- **Recommendation:** Use flat token surfaces and functional edge colors during the final polish.

## Anti-pattern verdict

**Pass for core product surfaces.**

The live canvas, dashboard, and report start screen no longer look AI-generated. They are calm, dense, and familiar for a data tool. Remaining tells are localized:

- Gradient/glass chrome in report chart blocks
- Decorative multi-color lineage edges
- Repeated uppercase field scaffolding in ChartView
- Some card-within-card structure in complex editors

These are follow-up issues, not evidence that the entire product needs redesign.

## Positive findings to preserve

- Axe AA checks cover the shell, creation dialogs, grid, suggestions, report editor, and overlays.
- Keyboard contracts cover dialog Escape/focus, export menus, grid editing, column resize, autofill, canvas connection, context menus, and suggestion tabs.
- Responsive contracts cover mobile, tablet, and desktop containment.
- Global focus-visible, reduced-motion, safe-area, and coarse-pointer baselines are present.
- DuckDB and table execution run off the main thread.
- Grid rows use `@tanstack/react-virtual`.
- Major views and heavy import/export dependencies are split into lazy chunks.
- Dead-code and dependency-cycle scans are clean.
- Core colors, spacing, radii, shadows, and semantic states are documented in `DESIGN.md`.

## Frozen closure gate

Do not broaden the audit beyond this section until these items are complete.

### Required for 18/20

1. **Startup and import performance**
   - Application shell becomes usable before project-wide materialization completes.
   - Independent source tables no longer materialize strictly serially.
   - Large row sets are streamed or transferred in batches rather than cloned as one RPC payload.

2. **Grid performance**
   - Column virtualization is present for wide tables.
   - Resize/selection updates do not rerender every visible cell per pointer event.
   - Closed FilterPanel performs no row/column distinct scan.
   - Autosave is debounced or committed at interaction boundaries.

3. **Keyboard and focus**
   - Chart rename is keyboard-operable.
   - Report Insert menu follows the menu-button keyboard pattern.
   - Report custom pickers trap focus, close with Escape, and return focus.

4. **Responsive targets**
   - Report actions, grid autofill, and column filter controls provide 44px coarse-pointer hit areas.

5. **Theming and anti-pattern cleanup**
   - ChartView, FormulaColumnModal, FilterInputs, and EnumMultiSelect use semantic tokens/primitives.
   - Report editor no longer uses the parallel zinc fallback palette.
   - Dark callout types retain distinct semantics.
   - Remaining report-chart glass/gradient treatments and decorative lineage gradients are removed.

### Expected score after closure

| Dimension | Target |
|---|---:|
| Accessibility | 4/4 |
| Performance | 3/4 |
| Responsive design | 4/4 |
| Theming | 3/4 |
| Anti-patterns | 4/4 |
| **Total** | **18/20 — Excellent** |

The score must be recomputed against this unchanged rubric. New findings may be documented separately, but they must not change the closure gate or retroactively redefine success.

## Recommended implementation sequence

1. `/impeccable optimize src/state src/engine`
2. `/impeccable harden src/charts src/report`
3. `/impeccable optimize src/grid`
4. `/impeccable extract src/report/editor`
5. `/impeccable adapt src/report src/grid`
6. `/impeccable polish src`
7. Re-run `/impeccable audit src` against this frozen baseline

## Repository hygiene

Development and generated artifacts are already excluded by `.gitignore`:

- `.cursor/`
- `.impeccable/`
- `test-results/`
- `playwright-report/`
- `blob-report/`
- `coverage/`
- build output and local caches

`AUDIT.md`, `DESIGN.md`, `PRODUCT.md`, and source documentation remain trackable project references.
