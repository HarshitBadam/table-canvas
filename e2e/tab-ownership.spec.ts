import { expect, test } from './e2e.fixture'
import { createManualTable } from './app.support'
import {
  createMockBackendState,
  installMockBackend,
} from './derived-tables.support'

test('tab takeover waits for pending saves and opens the same workspace', async ({ page }) => {
  test.setTimeout(60_000)
  const backendState = createMockBackendState()
  await installMockBackend(page, {
    state: backendState,
    projectUpdateDelayMs: 5_000,
  })
  await page.goto('/')
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
  await createManualTable(page, 'Transfer Pending Save')
  await expect.poll(
    () => backendState.pendingProjectUpdates,
    { timeout: 10_000 },
  ).toBe(1)

  const replacement = await page.context().newPage()
  await installMockBackend(replacement, { state: backendState })
  await replacement.goto('/')
  await expect(replacement.getByRole('heading', {
    name: 'Table Canvas is open in another tab',
  })).toBeVisible()

  await replacement.getByRole('button', { name: 'Use this tab instead' }).click()
  await expect(replacement.getByText('Opening Table Canvas…')).toBeVisible()
  expect(backendState.pendingProjectUpdates).toBe(1)
  await expect(replacement.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
  await expect(replacement.locator('aside').getByRole('button', {
    name: /^Transfer Pending Save 5 rows/,
  })).toBeVisible({ timeout: 20_000 })

  await expect(page.getByRole('heading', {
    name: 'Table Canvas is open in another tab',
  })).toBeVisible()
  await expect(page.locator('.react-flow')).toHaveCount(0)
  await replacement.close()
})
