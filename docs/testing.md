# Testing

Two layers: Vitest for unit/integration, Playwright for end-to-end.

| Layer | Framework | Location |
|-------|-----------|----------|
| Unit / integration | Vitest | `src/**/*.test.ts`, `server/src/**/*.test.ts` (14 files) |
| E2E | Playwright | `e2e/*.spec.ts` (1 file) |

## Running

```bash
npm run test            # watch mode
npm run test:run        # once
npm run test:coverage   # coverage report → ./coverage/index.html
npm run test:ui         # Vitest UI

# scoped subsets (verbose)
npm run test:engine
npm run test:formula
npm run test:persistence
npm run test:suggestions

# E2E
npm run test:e2e        # headless
npm run test:e2e:ui     # Playwright UI

npm run test:all        # unit + E2E
npm run test:ci         # JUnit output → ./test-results/junit.xml
```

Run a single file: `npm run test:run src/engine/dependencyGraph.test.ts`.

## What's covered

**Frontend** (`src/`)

| File | Area |
|------|------|
| `engine/dependencyGraph.test.ts` | DAG ops, cycle detection, topological sort |
| `engine/integration.test.ts` | Dirty propagation, computation order, cache |
| `engine/materializationService.test.ts` | Materialization, version hashing |
| `formula/evaluator.test.ts` | Formula parsing, evaluation, type inference |
| `persistence/db.test.ts` | IndexedDB operations |
| `persistence/syncService.test.ts` | Server sync logic |
| `persistence/exportService.test.ts` | ZIP export, file embedding |
| `grid/filterUtils.test.ts` | Filter condition evaluation |
| `suggestions/suggestionEngine.test.ts` | Rule matching, scoring |

**Backend** (`server/src/`)

| File | Area |
|------|------|
| `routes/projects.test.ts` | Project CRUD endpoints |
| `routes/files.test.ts` | File upload/download endpoints |
| `models/Project.test.ts` | Project model |
| `models/File.test.ts` | File model |
| `services/file.service.test.ts` | File service logic |

**E2E**: `e2e/derived-tables.spec.ts` runs Playwright smoke tests over the canvas UI — view
rendering, sidebar buttons (Import Data / New Table), file-input presence, view navigation, the
export menu, theme toggle, responsive layout, performance, and node status-indicator presence.
Several tests skip automatically when the canvas isn't reachable without authentication.

The well-covered core is the engine (DAG, materialization), the formula parser, filtering,
persistence, and the backend routes. React components are only lightly covered; canvas
interactions are exercised via E2E.

## Setup

- **Frontend**: the `jsdom` environment is set in `vitest.config.ts`. `src/test/setup.ts` imports
  `@testing-library/jest-dom` and enables Immer's MapSet plugin. Persistence tests import
  `fake-indexeddb/auto` directly (e.g. `db.test.ts`, `exportService.test.ts`) to run against an
  in-memory IndexedDB.
- **Backend** (`server/src/test/setup.ts`): in-memory MongoDB via `mongodb-memory-server`, exposed
  as `setupMongoTestDB()` which test files import and call directly.

Reset Zustand state in `beforeEach` with `useProjectStore.setState({...})` when a test touches
the store.

## CI

GitHub Actions workflows live in `.github/workflows/`:

- **`ci.yml`**: runs on push/PR to `main` and `develop`. Jobs: lint, typecheck (`tsc --noEmit`),
  unit tests (with coverage), E2E, and build. A final gate job fails if any of them fail.
- **`test-suites.yml`**: manual (`workflow_dispatch`); run a single suite (engine, formula,
  persistence, suggestions, or e2e) on demand.
- **`release.yml`**: runs on `v*` tags to validate and build a release.

CI artifacts: coverage report and Playwright report are uploaded on every run. Playwright
screenshots are uploaded only on failure. Traces are captured on first retry; view one locally
with `npx playwright show-trace test-results/*/trace.zip`.
