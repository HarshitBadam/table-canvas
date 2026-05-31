import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Exclude auth-related tests per project constraints
      '**/auth*.test.ts',
      '**/auth*.spec.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/test/',
        // Exclude auth-related code from coverage per constraints
        '**/auth*',
        '**/User*',
        'src/middleware/auth.ts',
        'src/routes/auth.ts',
        'src/services/auth.service.ts',
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run sequentially with shared module cache to avoid mongoose model conflicts
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: false,
      },
    },
  },
});
