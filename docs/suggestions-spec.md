# Suggestions System — Implementation Specification

This document defines the Suggestions feature end-to-end: UI/UX behavior, data requirements, rule engine algorithms, previews, action execution, undo/redo, and caching.

**Goal:** Keep the experience fast, intuitive, and trustworthy for Excel power users.

---

## 1) What Suggestions Means

When the user is in Grid mode, clicking **Suggestions** should immediately surface helpful next actions.

**Suggestions must be:**
- **Actionable** — each maps to a deterministic action
- **Safe** — default to non-destructive transforms, warn when risky
- **Fast** — computed from metadata + small samples, not full scans
- **Calm** — only a handful shown; no spam
- **Undoable** — Cmd+Z reverts any applied suggestion

**Suggestions are NOT:**
- A chat interface
- A stream of random ideas
- A heavy computation that blocks the UI

---

## 2) UX Requirements

### 2.1 Panel Location
- A **Suggestions** button in the grid toolbar opens/closes the right panel
- Panel title: "Suggestions"
- Panel subtitle varies by context:
  - "For this table" when no column is selected
  - "For selected column" when a column is selected

### 2.2 Tabs
- All
- Cleaning
- Analysis
- Recipe

Tab counts reflect the filtered suggestion set (after dismissals).

### 2.3 Panel States

**Loading:** Show skeleton cards immediately if suggestions aren't cached.

**Empty:** If table is too small or no metadata yet:
- "No suggestions available"
- Hint: "Select a column or import more data."

**Error:** "Couldn't generate suggestions" + Retry button

### 2.4 Suggestion Card Design

Each card must show:
- Title (short, verb-led)
- One-line description
- Confidence: High / Medium / Low (subtle indicator)
- "Why" expander (1–3 bullets, plain language)
- Primary CTA: Apply (Cleaning/Analysis) or Open recipe (Recipe)
- Optional: Preview (lazy-loaded), Dismiss

Preview must never block list rendering.

---

## 3) Update Triggers

Suggestions regenerate when any of the following change:
- Selected table
- Selected column
- Table data version (edits, patches)
- Schema overrides (type override, rename)

**Debounce:** Selection changes debounce ~100ms to avoid flicker.

**Cancellation:** If generation is in-flight and context changes, cancel or ignore stale results.

---

## 4) Metadata Requirements

Suggestions are driven by a **MetadataBundle** per table, computed progressively.

### 4.1 MetadataBundle (v1 minimum)

**Per table:**
- rowCount (approximate is acceptable initially)
- columnCount
- Column list with:
  - name
  - inferredType: string | number | boolean | date | categorical
  - nullCount / nullPct (approximate from sample)
  - distinctEstimate (approximate)
  - topValues sample (for categorical/text)
  - numeric stats (if numeric): min/max/mean
  - semantic hints: idLike, currencyLike, percentLike, dateLike, hasThousandsSeparators

**Per project (lightweight):**
- List of other tables + their key-like columns (for reconcile recipes)

### 4.2 Progressive Profiling

**Phase 1 (fast, <300–600ms):**
- Infer types from sample
- nullPct
- distinctEstimate
- topValues sample
- Semantic hints (dateLike, currencyLike, idLike)

**Phase 2 (background):**
- Histograms for numeric columns
- Duplicate detection for id-like columns
- Correlation scan (only if advanced mode requested)

The Suggestions panel must work with Phase 1 metadata alone.

---

## 5) System Architecture

### Layer Structure

**1) UI Layer**
- Panel rendering, tabs, states, card interactions

**2) Suggestions Orchestrator**
- Reads selection context
- Requests suggestions from generator
- Applies caching + dismissal filters
- Requests previews lazily

**3) Suggestion Generator (Rule Engine)**
- Runs deterministic rules against MetadataBundle
- Produces structured suggestions with executable actions

**4) Preview Generator**
- Computes before/after or aggregate preview on demand

**5) Apply Pipeline (Commands)**
- Executes the suggestion action (patch/transform/chart/recipe)
- Adds derived nodes or charts
- Integrates with undo/redo

**6) Compute Worker**
- Performs profiling, previews, and transform computations off the main thread

**Cardinal rule:** Heavy operations (profiling, preview aggregation) must run in a Worker.

---

## 6) Type Contracts

### 6.1 Core Types

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
```
