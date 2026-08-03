import { defineConfig, devices } from '@playwright/test'

const retainFailureArtifacts = !process.env.PW_NO_ARTIFACTS

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Specs use isolated browser contexts + mocked backends, so they can run concurrently.
  // GitHub runners are 2-core; locally use half the CPUs (Playwright default).
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html']] : 'html',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
      scale: 'css',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: retainFailureArtifacts ? 'retain-on-failure' : 'off',
    screenshot: retainFailureArtifacts ? 'only-on-failure' : 'off',
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
})
