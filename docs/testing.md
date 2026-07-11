# Testing

Two layers: Vitest for unit/integration, Playwright for end-to-end.

| Layer | Framework | Location |
|-------|-----------|----------|
| Frontend unit / integration | Vitest | `src/**/*.test.{ts,tsx}` |
| Backend unit / integration | Vitest | `server/src/**/*.test.ts` |
| E2E | Playwright | `e2e/**/*.spec.ts` |

## Running

Frontend unit and integration commands:

```bash
npm run test
npm run test:run
npm run test:coverage
npm run test:ui
npm run test:engine
npm run test:formula
npm run test:persistence
npm run test:suggestions
```

Browser commands:

```bash
npm run test:e2e
npm run test:e2e:ui
npm run test:ux
npm run test:ux:update
```

Aggregate and CI commands:

```bash
npm run test:all
npm run test:release
npm run test:ci
npm run check:dead-code
```

`test:coverage` writes HTML to `coverage/index.html`. `test:ux:update` updates reviewed visual baselines. `test:ci` writes JUnit output to `test-results/junit.xml`.

Run a single file: `npm run test:run src/engine/dependencyGraph.test.ts`.

## What's covered

**Frontend** (`src/`) tests cover engine graph and materialization behavior, formula evaluation,
filtering, persistence/export/sync, suggestions, state lifecycle, and report embedding. Larger
suites are split by behavior:

| Area | Test files |
|------|------|
| Engine | `engine/dependencyGraph*.test.ts`, `engine/integration*.test.ts`, `engine/materializationService.test.ts`, `engine/worker/tableOperations.test.ts` |
| Formula | `formula/evaluator{Core,Functions,Validation}.test.ts` |
| Persistence | `persistence/db*.test.ts`, `persistence/exportService*.test.ts`, `persistence/sync*.test.ts` |
| Grid | `grid/filter{Evaluation,Metadata}.test.ts`, `grid/hooks/useWindowedRows.test.ts` |
| Suggestions | `suggestions/suggestionEngine.{analysis,classification,cleaning,detection}.test.ts` |

**Backend** (`server/src/`) tests cover models, project/file routes, Google integration, file
service behavior, and limit enforcement.

| Area | Test files |
|------|------|
| Project routes | `routes/projects{CreateRead,UpdateDelete,Limits}.test.ts` |
| File routes | `routes/files.test.ts` |
| Models and services | `models/*.test.ts`, `services/*.test.ts`, `config/enforce.test.ts` |

**E2E**: `e2e/derived-tables.{canvas,interactions,layout}.spec.ts` covers canvas rendering,
interactions, and responsive layout. `sample-workbook.spec.ts` and `report-workflow.spec.ts`
cover persisted import/edit/clean/report/export workflows. All specs use the deterministic
mock API in `e2e/derived-tables.support.ts`.

`e2e/ux/` is the release-blocking UX contract: committed visual baselines, WCAG checks,
keyboard/focus behavior, supported viewport geometry, browser-error detection, project switching,
canvas joins, production telemetry, bounded DOM/memory use, and main-thread long-task budgets.
The exact pass/fail contract is documented in `docs/ux-quality.md`.

The well-covered core is the engine (DAG, materialization), the formula parser, filtering,
persistence, and the backend routes. React components are only lightly covered; canvas
interactions are exercised via E2E.

## Setup

- **Frontend**: the `jsdom` environment is set in `vitest.config.ts`. Coverage instruments all
  production TypeScript sources, emits text/HTML/LCOV/JSON reports, and enforces a ratchetable
  baseline threshold. `src/test/setup.ts` imports
  `@testing-library/jest-dom` and enables Immer's MapSet plugin. Persistence tests import
  `fake-indexeddb/auto` directly (for example, `dbProjectFile.test.ts` and
  `exportServiceHappy.test.ts`) to run against an in-memory IndexedDB.
- **Backend** (`server/src/test/setup.ts`): in-memory MongoDB via `mongodb-memory-server`, exposed
  as `setupMongoTestDB()` which test files import and call directly.

Reset Zustand state in `beforeEach` with `useProjectStore.setState({...})` when a test touches
the store.

## CI

GitHub Actions workflows live in `.github/workflows/`:

- **`ci.yml`**: runs on push/PR to `main` and `develop`. Jobs: lint, typecheck (`tsc --noEmit`),
  unit tests (with coverage), E2E, build, backend checks, and dead-code analysis. A final gate
  job fails if any of them fail.
- **`test-suites.yml`**: manual (`workflow_dispatch`); run a single suite (engine, formula,
  persistence, suggestions, or e2e) on demand.
- **`release.yml`**: runs on `v*` tags to validate and build a release.

CI artifacts: coverage report and Playwright report are uploaded on every run. Playwright
screenshots are uploaded only on failure. Traces are retained on failure; view one locally
with `npx playwright show-trace test-results/*/trace.zip`.
