---
name: Table Canvas
description: A local-first visual workbench for traceable data transformations.
colors:
  primary: "#217346"
  primary-hover: "#185c37"
  canvas: "#f8faf9"
  surface: "#ffffff"
  surface-secondary: "#f5f5f7"
  surface-tertiary: "#e8e8ed"
  border: "#d2d2d7"
  border-subtle: "#e5e5ea"
  ink: "#1d1d1f"
  ink-secondary: "#5f5f64"
  ink-tertiary: "#6e6e73"
  ink-tertiary-dark: "#8f8f94"
  success: "#107c41"
  warning: "#ff9500"
  error: "#ff3b30"
  node-derived: "#a855f7"
typography:
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  mono:
    fontFamily: "JetBrains Mono, SF Mono, Menlo, Monaco, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
---

# Design System: Table Canvas

## 1. Overview

**Creative North Star: "The Data Control Surface"**

Table Canvas is a calm, operational environment for doing consequential work with tabular data. Its interface makes the data flow tangible: a neutral canvas holds the work, a deep green accent marks the controls and selections that move it forward, and dense but orderly panels carry the detail.

The system is technical, precise, and powerful without becoming theatrical. It rejects generic, overdecorated SaaS-dashboard styling: no ornamental metrics, decorative gradients, or loud color competing with data. Interfaces should make data state, dependencies, and next actions easy to locate at a glance.

**Key Characteristics:**
- Restrained neutral surfaces create a dependable working field.
- Excel Green is reserved for meaningful actions, current selection, focus, and lineage.
- Compact controls preserve workspace for grids, graphs, and reports.
- Dual light and dark themes preserve the same visual hierarchy.
- Motion is brief feedback for state changes, never page choreography.

## 2. Colors

The palette is a functional hierarchy: low-chroma neutrals create a clear working field, while Excel Green and semantic colors signal decisions and data state.

### Primary
- **Excel Green:** the single accent for primary actions, selected navigation, focus, and graph lineage.
- **Deep Action Green:** the hover state for deliberate interaction without introducing a second brand color.

### Secondary
- **Derived Violet:** distinguishes derived-table nodes from source data only; it is never a general-purpose accent.

### Tertiary
- **Semantic Status:** success, warning, and error colors communicate system state; they never decorate inactive UI.

### Neutral
- **Canvas White:** the broad workspace background for grid and canvas work.
- **Surface White:** the default plane for sidebars, panels, fields, and dialogs.
- **Layered Gray:** the secondary and tertiary surfaces that separate toolbars and quiet groupings.
- **Measured Border:** a restrained divider for structure before elevation is introduced.
- **Ink Hierarchy:** primary, secondary, and tertiary text establish readable information density.

**The One Accent Rule.** Use Excel Green for actions, current selection, keyboard focus, and lineage. Do not spread it across decorative badges, inactive panels, or large background areas.

## 3. Typography

**Display Font:** Inter, with the system sans stack as fallback.
**Body Font:** Inter, with the system sans stack as fallback.
**Label/Mono Font:** JetBrains Mono for formulas, SQL, types, and values that need a code-like reading mode.

**Character:** Inter keeps the interface compact and legible across dense controls, grids, and reports. JetBrains Mono is a purposeful functional contrast, reserved for data and computational language rather than general UI copy.

### Hierarchy
- **Headline:** semibold product headings establish a clear local task without turning an application view into a marketing surface.
- **Body:** regular 15px copy is the default for explanatory text, with concise prose kept within readable measure in report contexts.
- **Label:** medium 13px text carries controls, navigation, and table-adjacent metadata.
- **Data Label:** 11px labels support dense secondary information only when it remains readable at normal zoom.
- **Mono:** 13px monospaced text is for expressions, data types, and technical values.

**The Data-First Type Rule.** Use the smallest type only for supporting metadata; primary values, active controls, and destructive consequences must remain immediately legible.

## 4. Elevation

Elevation is structural, not decorative. Flat surfaces and one-pixel borders define the everyday application; small shadows clarify cards, menus, and floating controls; medium shadows are reserved for active panels and dialogs. Dark theme shifts the border treatment toward subtle light-on-dark separation rather than increasing visual noise.

### Shadow Vocabulary
- **Quiet Lift:** the small shadow for ordinary cards and contained content.
- **Active Layer:** the medium shadow for elevated panels, overlays, and dialogs.
- **Modal Depth:** the large shadow for the highest-priority transient surface.

**The Structural Elevation Rule.** A shadow must explain stacking or interaction priority. If a panel does not float above another surface, keep it flat and use a border or tonal layer instead.

## 5. Components

### Buttons

Compact and precise controls use a 13px medium Inter label, 6px by 12px padding, and an 8px corner radius. Primary buttons carry Excel Green and deepen on hover; secondary buttons are transparent with a measured border; ghost buttons use secondary ink until interaction. Disabled controls do not accept pointer input and reduce opacity.

### Cards / Containers

Cards use a white surface, a thin measured border, and quiet lift. Elevated containers use an 8px radius and active-layer shadow. Do not nest cards to manufacture hierarchy; use panel boundaries only where the content has an independent task.

### Inputs / Fields

Fields are white, bordered, compact, and use the 8px component radius. Placeholder text follows the tertiary ink level. Focus replaces the neutral border with Excel Green and retains the global 2px visible outline; disabled fields reduce opacity and lose pointer interaction.

### Navigation

The desktop sidebar is a 240px structural surface with section dividers and compact row navigation. The current item receives a low-opacity Excel Green fill and matching text; inactive items remain neutral until hover. Section labels use uppercase, wider-tracked secondary metadata sparingly to organize the working set.

### Data Canvas

The canvas is a clear workspace for table, transform, and chart nodes. Source, derived, and chart nodes use distinct contextual colors, while edges use Excel Green to make transformation direction legible. Node color expresses type, not priority.

## 6. Do's and Don'ts

### Do:
- **Do** use Excel Green only for action, selection, focus, and lineage.
- **Do** preserve compact 4px-grid spacing in task controls, tables, and panels.
- **Do** use light border and tonal-layer separation before adding elevation.
- **Do** keep light and dark themes functionally equivalent, with the same semantic hierarchy.
- **Do** provide a visible keyboard focus treatment and respect reduced-motion preferences.

### Don't:
- **Don't** introduce generic, overdecorated SaaS-dashboard styling.
- **Don't** use gradients, saturated decorative backgrounds, or green as an inactive accent.
- **Don't** turn every content grouping into a card or stack cards inside cards.
- **Don't** use display typefaces or oversized headings in application controls.
- **Don't** use motion for decoration; transitions must communicate state or feedback.
