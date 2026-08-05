# Testing

Two layers: Vitest for unit/integration, Playwright for end-to-end.

| Layer | Framework | Location |
|-------|-----------|----------|
| Frontend unit / integration | Vitest | `tests/unit/**/*.{test,spec}.{ts,tsx}` |
| Frontend test support | — | `tests/support/` (`@test/*`) |
| Backend unit / integration | Vitest | `server/tests/unit/**/*.{test,spec}.ts` |
| Backend test support | — | `server/tests/support/` |
| E2E | Playwright | `e2e/**/*.spec.ts` |

Tests are not colocated under `src/` or `server/src/`. Frontend suites mirror `src/` domains under `tests/unit/`; backend suites mirror `server/src/` under `server/tests/unit/`.

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

Backend:

```bash
npm --prefix server run test
npm --prefix server run test:coverage
npm --prefix server run typecheck   # server/src + server/tests via tsconfig.test.json
```

Browser / E2E:

```bash
npm run test:e2e
npm run test:e2e:ui
npm run test:ux
npm run test:ux:update
npx tsc -p e2e/tsconfig.json --noEmit
```

Aggregate and release checks:

```bash
npm run test:all
npm run test:release
npm run test:ci
npm run check:dead-code
npm run lint
npm run build
npm --prefix server run lint
npm --prefix server run build
CI=true npm run test:e2e
```

`test:coverage` writes HTML to `coverage/index.html`. `test:ux:update` updates reviewed visual baselines. `test:ci` writes JUnit output to `test-results/junit.xml`. `test:release` runs lint, dead-code and cycle checks, frontend/backend coverage, backend typechecking, E2E, both builds, and dependency audits.

Run a single file: `npm run test:run tests/unit/engine/graph/dependencyGraph.test.ts`.

## What's covered

**Frontend** (`tests/unit/`, mirroring `src/`) covers engine graph and materialization, formula evaluation, filtering, persistence/export/sync, suggestions, state lifecycle, and report embedding. Larger suites are split by behavior:

| Area | Test files |
|------|------|
| Engine | `engine/graph/dependencyGraph*.test.ts`, `engine/integration*.test.ts`, `engine/materialization/materializationService.test.ts`, `engine/worker/table/tableOperations.test.ts` |
| Formula | `formula/evaluation/evaluator{Core,Functions,Validation}.test.ts` |
| Persistence | `persistence/storage/local-db/db*.test.ts`, `persistence/import-export/export/exportService*.test.ts`, `persistence/sync/**/*.test.ts` |
| Grid | `grid/filtering/filter{Evaluation,Metadata}.test.ts`, `grid/hooks/useWindowedRows.test.ts` |
| Suggestions | `suggestions/engine/suggestionEngine.{analysis,classification,cleaning,detection}.test.ts` |
| Concurrency | `state/document/document{Lease,Mirror}.test.ts`, `state/document/useDocumentCoordination.test.ts`, `persistence/merge/projectMerge*.test.ts`, `persistence/sync/project/save/projectSaveConflict.test.ts` |

**Backend** (`server/tests/unit/`, mirroring `server/src/`) covers configuration, middleware, models, authentication, project/file routes, Google integration, storage and rate-limit services, and payload-limit enforcement.

| Area | Test files |
|------|------|
| Project routes | `routes/projects{CreateRead,UpdateDelete,Limits}.test.ts` |
| Authentication and files | `routes/auth.test.ts`, `routes/files.test.ts` |
| Configuration and middleware | `config/*.test.ts`, `middleware/*.test.ts` |
| Models and services | `models/*.test.ts`, `services/*.test.ts` |

**E2E**: `e2e/derived-tables.{canvas,interactions,layout}.spec.ts` covers canvas rendering, interactions, and responsive layout. `sample-workbook.spec.ts`, `report-workflow.spec.ts`, `data-workflows.spec.ts`, and `formula-columns.spec.ts` cover persisted import/edit/clean/report workflows. `tab-ownership.spec.ts` drives two real tabs for mirroring, focus handover, and project independence. Specs share helpers in `e2e/derived-tables.support.ts` and `e2e/app.support.ts`.

`e2e/ux/` is the release-blocking UX contract: committed visual baselines, WCAG checks, keyboard/focus behavior, supported viewport geometry, browser-error detection, project switching, canvas joins, production telemetry, bounded DOM/memory use, and main-thread long-task budgets.

The well-covered core is the engine (DAG, materialization), the formula parser, filtering, persistence, and the backend routes. React components are only lightly covered; canvas interactions are exercised via E2E.

## Setup

- **Frontend**: the `jsdom` environment is set in `vitest.config.ts`. Discovery includes `tests/unit/**/*.{test,spec}.{ts,tsx}`. Coverage instruments `src/**/*.{ts,tsx}`, emits text/HTML/LCOV/JSON reports, and enforces a ratchetable baseline threshold. `tests/support/setup.ts` imports `@testing-library/jest-dom` and enables Immer's MapSet plugin. Persistence test support loads `fake-indexeddb/auto` to provide an in-memory IndexedDB. Shared tab fakes live in `tests/support/fakeTabEnvironment.ts` and are imported via `@test/fakeTabEnvironment`.
- **Backend** (`server/tests/support/setup.ts`): in-memory MongoDB via `mongodb-memory-server`, exposed as `setupMongoTestDB()` which test files import and call directly. Backend Vitest discovers `server/tests/unit/**/*.{test,spec}.ts`. Backend test TypeScript is checked with `npm --prefix server run typecheck` (`server/tsconfig.test.json`).

Reset Zustand state in `beforeEach` with `useProjectStore.setState({...})` when a test touches the store.

## CI

GitHub Actions workflows live in `.github/workflows/`:

- **`ci.yml`**: runs on push/PR to `main` and `develop`. Jobs: lint, frontend typecheck (`tsc --noEmit`), dependency audit, unit tests (with coverage), E2E, build, backend checks (including backend typecheck, build, coverage, and dead-code), and the production Compose smoke test. A final gate job fails if any of them fail.
- **`test-suites.yml`**: manual (`workflow_dispatch`); run a single suite (engine, formula, persistence, suggestions, or e2e) on demand.
- **`release.yml`**: runs on `v*` tags and repeats the full frontend/backend release checks and production Compose smoke test before building a release.

CI artifacts: coverage report and Playwright report are uploaded on every run. Playwright screenshots are uploaded only on failure. Traces are retained on failure; view one locally with `npx playwright show-trace test-results/*/trace.zip`.
