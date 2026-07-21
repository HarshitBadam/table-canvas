import type { Page } from '@playwright/test'
import { expect, test } from '../e2e.fixture'
import { bootApp } from '../app.support'

type LongTaskWindow = Window & { __uxLongTasks: number[] }

async function installLongTaskRecorder(page: Page) {
  await page.addInitScript(() => {
    const target = window as LongTaskWindow
    target.__uxLongTasks = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) target.__uxLongTasks.push(entry.duration)
    }).observe({ type: 'longtask', buffered: true })
  })
}

async function resetLongTasks(page: Page) {
  await page.evaluate(() => {
    (window as LongTaskWindow).__uxLongTasks = []
  })
}

async function expectLongTasksWithinBudget(page: Page) {
  await page.waitForTimeout(250)
  const durations = await page.evaluate(
    () => (window as LongTaskWindow).__uxLongTasks ?? [],
  )
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0
  expect(maxDuration, `Longest main-thread task was ${maxDuration.toFixed(1)}ms`).toBeLessThan(250)
  expect(
    durations.filter(duration => duration >= 100),
    'At most one main-thread task may exceed 100ms',
  ).toHaveLength(durations.some(duration => duration >= 100) ? 1 : 0)
}

test.describe('@ux deterministic performance contract', () => {
  test('production build records Core Web Vitals in the telemetry buffer', async ({ page }) => {
    await bootApp(page)

    await expect.poll(() => page.evaluate(() => (
      window.__tableCanvasTelemetry
        ?.filter(event => event.type === 'web-vital')
        .map(event => event.name) ?? []
    )), { timeout: 10_000 }).toEqual(expect.arrayContaining(['FCP', 'TTFB']))
  })

  test('large-table import and grid rendering remain virtualized and bounded', async ({ page }) => {
    test.setTimeout(90_000)
    await installLongTaskRecorder(page)
    await bootApp(page)
    await resetLongTasks(page)

    const csv = [
      'Name,Amount',
      ...Array.from({ length: 2_000 }, (_, index) => `Item ${index + 1},${index + 1}`),
    ].join('\n')
    await page.locator('aside input[type="file"][accept*=".csv"]').setInputFiles({
      name: 'performance-contract.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    })
    await expect(page.locator('aside').getByRole('button', { name: 'Import Data' }))
      .toBeEnabled({ timeout: 30_000 })
    await page.locator('aside').getByRole('button', {
      name: /^performance-contract\b/,
    }).click()
    await expect(page.getByText('2,000 rows × 2 columns')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.cursor-cell').first()).toBeVisible()

    expect(await page.locator('.cursor-cell').count()).toBeLessThan(500)
    expect(await page.locator('body *').count()).toBeLessThan(3_500)

    const session = await page.context().newCDPSession(page)
    await session.send('Performance.enable')
    const { metrics } = await session.send('Performance.getMetrics')
    const metric = (name: string) => metrics.find(item => item.name === name)?.value ?? 0
    expect(metric('Nodes')).toBeLessThan(5_000)
    expect(metric('JSHeapUsedSize')).toBeLessThan(128 * 1024 * 1024)
    await expectLongTasksWithinBudget(page)
  })

  test('core overlays and report editing avoid repeated or blocking main-thread work', async ({ page }) => {
    await installLongTaskRecorder(page)
    await bootApp(page)

    await resetLongTasks(page)
    await page.locator('aside').getByRole('button', { name: 'New Table' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create New Table' })
    await expect(dialog.getByLabel('Table Name')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await page.locator('aside').getByRole('button', { name: 'Report', exact: true }).click()
    await page.getByRole('button', { name: /Blank report/ }).click()
    const editor = page.locator('.tiptap-editor-content')
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type('Responsive editing remains smooth under the UX contract.')
    await expect(editor).toContainText('Responsive editing remains smooth')

    await expectLongTasksWithinBudget(page)
  })
})
