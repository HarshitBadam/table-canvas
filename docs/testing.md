# Testing

## Overview

The project uses a multi-layered testing strategy:

| Layer | Framework | Location | Count |
|-------|-----------|----------|-------|
| Unit Tests | Vitest | `src/**/*.test.ts`, `server/src/**/*.test.ts` | 14 files |
| E2E Tests | Playwright | `e2e/*.spec.ts` | 1 file |

## Running Tests

### Unit Tests

```bash
# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run with coverage report
npm run test:coverage

# Run specific test file
npm run test:run src/engine/dependencyGraph.test.ts

# Run tests matching pattern
npm run test:run -- --grep "cycle"
```

### Test Subsets

```bash
# Engine tests only
npm run test:engine

# Formula parser tests only
npm run test:formula

# Persistence tests only
npm run test:persistence

# Suggestions engine tests only
npm run test:suggestions
```

### E2E Tests

```bash
# Run headless
npm run test:e2e

# Run with UI for debugging
npm run test:e2e:ui
```

### All Tests

```bash
npm run test:all
```

### CI Mode

```bash
npm run test:ci
# Outputs JUnit XML to ./test-results/junit.xml
```

## Test Configuration

### Vitest (`vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  },
})
```

### Playwright (`playwright.config.ts`)

```typescript
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
  },
})
```

## Test Files

### Frontend Tests

| File | Coverage |
|------|----------|
| `src/engine/dependencyGraph.test.ts` | DAG operations, cycle detection, topological sort |
| `src/engine/integration.test.ts` | Dirty propagation, computation order, cache management |
| `src/engine/materializationService.test.ts` | Table materialization, version hashing |
| `src/formula/evaluator.test.ts` | Formula parsing, evaluation, type inference |
| `src/persistence/db.test.ts` | IndexedDB operations |
| `src/persistence/syncService.test.ts` | Server sync logic |
| `src/persistence/exportService.test.ts` | ZIP export, file embedding |
| `src/grid/filterUtils.test.ts` | Filter condition evaluation |
| `src/suggestions/suggestionEngine.test.ts` | Rule matching, scoring |

### Backend Tests

| File | Coverage |
|------|----------|
| `server/src/routes/files.test.ts` | File upload/download endpoints |
| `server/src/routes/projects.test.ts` | Project CRUD endpoints |
| `server/src/models/File.test.ts` | File model methods |
| `server/src/models/Project.test.ts` | Project model methods |
| `server/src/services/file.service.test.ts` | File service logic |

### E2E Tests

| File | Coverage |
|------|----------|
| `e2e/derived-tables.spec.ts` | Create derived table workflow |

## Test Setup

### Frontend Setup (`src/test/setup.ts`)

```typescript
import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  value: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }),
})
```

Key mocks:
- `fake-indexeddb`: In-memory IndexedDB for persistence tests
- `jsdom`: Browser environment simulation

### Backend Setup (`server/src/test/setup.ts`)

Uses in-memory MongoDB via mongodb-memory-server for isolated test runs.

## Writing Tests

### Conventions

- **Reset state in `beforeEach`:** Use `useProjectStore.setState({...})` for Zustand stores
- **Use `fake-indexeddb`:** Already configured in setup file for persistence tests
- **Name tests descriptively:** Follow `should [behavior] when [condition]` pattern

### Key Patterns

| Pattern | When to Use |
|---------|-------------|
| Direct function import | Pure functions (DAG utils, formula parser) |
| Store state manipulation | Testing Zustand actions and selectors |
| `renderHook` from testing-library | Custom React hooks |
| Playwright locators | E2E user flows |

Refer to existing test files for examples matching each pattern.

## Coverage

Generate coverage report:

```bash
npm run test:coverage
```

Report output: `./coverage/index.html`

### Current Coverage Areas

| Area | Status |
|------|--------|
| Dependency graph | Covered |
| Dirty propagation | Covered |
| Formula parser | Covered |
| Filter utilities | Covered |
| IndexedDB operations | Covered |
| API routes | Covered |
| React components | Partial |
| Canvas interactions | E2E only |

## CI Integration

### GitHub Actions

The CI workflow (`.github/workflows/ci.yml`) runs:

1. Lint check
2. Unit tests
3. Build verification
4. E2E tests (on PR)

### Test Artifacts

On failure, CI preserves:
- JUnit XML report
- Playwright trace files
- Screenshot on failure

## Debugging Tests

### Vitest UI

```bash
npm run test:ui
```

Opens browser-based test runner with:
- Test tree navigation
- Real-time output
- Filter by status

### Playwright Debug

```bash
# Debug specific test
npx playwright test --debug e2e/derived-tables.spec.ts

# Show browser
npx playwright test --headed

# Generate trace
npx playwright test --trace on
```

View traces:
```bash
npx playwright show-trace test-results/*/trace.zip
```

## Best Practices

1. **Isolate tests:** Reset state in `beforeEach`
2. **Mock external dependencies:** Network, timers, random
3. **Test behavior, not implementation:** Focus on inputs/outputs
4. **Use meaningful assertions:** Prefer specific matchers
5. **Keep tests fast:** Mock heavy operations
6. **Name tests descriptively:** `should [expected behavior] when [condition]`
