import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
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
    // Increase timeout for database operations
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run tests sequentially to avoid MongoDB connection issues
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
