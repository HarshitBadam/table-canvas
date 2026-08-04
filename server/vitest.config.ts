import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.{test,spec}.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,js}'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
      ],
      thresholds: {
        lines: 70,
        statements: 68,
        functions: 80,
        branches: 50,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run sequentially with shared module cache to avoid mongoose model conflicts
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
  },
});
