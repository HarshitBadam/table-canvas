# Suggestions System (Grid Mode) — End-to-End Implementation Spec (v1.0.0)

This spec defines how to implement the **Suggestions** feature end-to-end:
UI/UX behavior, data + metadata requirements, algorithms (rule engine + scoring), previews, applying actions, undo/redo, caching, and an initial “starter set” of suggestions that will produce useful results for tables like `sales_data`.

The goal is to keep the experience **fast, intuitive, and trustworthy** for Excel power users.

---

## 1) What “Suggestions” means in this product

When the user is in **Grid mode**, they should be able to click **Suggestions** and immediately see helpful next actions.

Suggestions must:
- Be **actionable** (each suggestion maps to a deterministic action)
- Be **safe** (default to non-destructive transforms, warn when risky)
- Be **fast** (computed from metadata + small samples, not full scans)
- Be **calm** (only a handful shown; no spam)
- Be **undoable** (Cmd+Z reverts suggestion application)

Suggestions are NOT:
- A chat assistant
- A stream of random ideas
- A heavy computation tool that blocks the UI

---

## 2) UX requirements (based on current UI)

### 2.1 Where Suggestions lives
- A **Suggestions** button in the grid toolbar opens/closes the right panel.
- Panel title: “Suggestions”
- Panel subtitle depends on context:
  - “For this table” when no column is selected
  - “For selected column” when a column is selected

### 2.2 Tabs
Tabs:
- All
- Cleaning
- Analysis
- Recipe

Tab counts must reflect the filtered suggestion set (after dismissals).

Default:
- If a column is selected, default to All (still OK).
- If panel is opened and there are cached results, show instantly.

### 2.3 Panel states
Loading:
- Show skeleton cards immediately if suggestions aren’t cached.

Empty:
- If table is too small / no metadata yet:
  - “No suggestions available”
  - Hint: “Select a column or import more data.”

Error:
- “Couldn’t generate suggestions” + Retry

### 2.4 Suggestion card design requirements
Each card must show:
- Title (short, verb-led)
- One-line description
- Confidence: High / Medium / Low (subtle)
- “Why” expander (1–3 bullets, plain language)
- Primary CTA:
  - Cleaning/Analysis: Apply
  - Recipe: Open recipe
- Optional:
  - Preview (lazy)
  - Dismiss (hide this suggestion for this context)

Preview must never block the list rendering.

---

## 3) Behavioral rules (when suggestions update)

Suggestions must regenerate when any changes:
- Selected table
- Selected column
- Table data version changes (edits, patches)
- Schema overrides change (type override, rename)
- (Optional) Advanced insights toggle changes

Debounce:
- Selection changes debounce ~100ms (avoid flicker when user is clicking around).

Cancellation:
- If generation is in-flight and context changes, cancel or ignore stale results.

---

## 4) Data and metadata requirements (what suggestions depend on)

Suggestions should be driven by a **MetadataBundle** per table, computed progressively.

### 4.1 MetadataBundle (minimum for v1)
Per table:
- rowCount (approx ok initially)
- columnCount
- column list:
  - name
  - inferredType: string | number | boolean | date | categorical
  - nullCount / nullPct (approx from sample ok)
  - distinctEstimate (approx ok)
  - topValues sample (for categorical/text)
  - numeric stats (if numeric): min/max/mean (approx ok)
  - semantic hints:
    - idLike
    - currencyLike
    - percentLike
    - dateLike
    - hasThousandsSeparators (useful for cleaning)

Per project (lightweight):
- list of other tables + their key-like columns (for reconcile recipes)

### 4.2 Progressive profiling (performance-friendly)
Phase 1 (fast, <300–600ms):
- infer types from sample
- nullPct
- distinctEstimate
- topValues sample
- hints (dateLike, currencyLike, idLike)

Phase 2 (background, optional):
- histograms for numeric
- duplicate detection for id-like columns (exact for small, approx later)
- correlation scan (only if advanced mode requested)

Important:
- The Suggestions panel must still work with Phase 1 metadata.

---

## 5) Suggestion system architecture (modules and responsibilities)

The system should be structured into clean layers:

1) **UI Layer**
- Panel rendering, tabs, states, card interactions

2) **Suggestions Orchestrator**
- Reads selection context
- Requests suggestions from generator
- Applies caching + dismissal filters
- Requests previews lazily

3) **Suggestion Generator (Deterministic Rule Engine)**
- Runs fast rules against MetadataBundle
- Produces structured suggestions with actions

4) **Preview Generator**
- Computes before/after or aggregate preview on demand

5) **Apply Pipeline (Commands)**
- Executes the suggestion action (patch/transform/chart/recipe)
- Adds derived nodes or charts
- Integrates with undo/redo

6) **Compute / Profiling Worker**
- Performs profiling, previews, and transform computations off the main thread

Main rule:
- Suggestions and previews should run in a Worker if possible.
- At minimum, heavy operations (profiling, preview aggregation) must run in Worker.

---

## 6) Suggestion contracts (what Cursor should implement)

### 6.1 Types (core)
```ts
type SuggestionCategory = "cleaning" | "analysis" | "recipe";
type SuggestionScope = "table" | "column";
type SuggestionConfidence = "high" | "medium" | "low";

type SuggestionContext = {
  tableId: string;
  columnId?: string;              // present for column-scope
  tableVersionHash: string;       // changes when data/patch/schema changes
};

type SuggestionImpactKind = "patch" | "derivedTable" | "chart" | "recipe";

type Suggestion = {
  id: string;                     // stable id derived from rule id + context
  category: SuggestionCategory;
  scope: SuggestionScope;

  title: string;
  description?: string;
  confidence: SuggestionConfidence;

  why: string[];                  // short bullets
  impact: { kind: SuggestionImpactKind; summary: string };

  context: SuggestionContext;

  preview: {
    status: "not_loaded" | "loading" | "ready" | "error";
    data?: PreviewData;
    error?: string;
  };

  action: SuggestionAction;       // deterministic executable action
};
