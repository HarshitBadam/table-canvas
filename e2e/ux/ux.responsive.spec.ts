import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../e2e.fixture'
import {
  bootApp,
  createManualTable,
  expectNoViewportOverflow,
  openManualTable,
} from '../app.support'

async function expectInsideViewport(page: Page, locator: Locator) {
  await expect.poll(async () => (await locator.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0)
  const box = await locator.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
}

for (const viewport of [
  { width: 1024, height: 768, label: 'minimum desktop' },
  { width: 1440, height: 900, label: 'standard desktop' },
]) {
  test.describe(`Responsive layout: ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('canvas shell has no clipping or page-level overflow', async ({ page }) => {
      await bootApp(page)
      await expectNoViewportOverflow(page)
      await expectInsideViewport(page, page.locator('aside'))
      await expectInsideViewport(page, page.locator('header'))
      await expectInsideViewport(page, page.locator('.react-flow'))
    })

    test('dialog, grid toolbar, and report toolbar stay inside the viewport', async ({ page }) => {
      await bootApp(page)
      await page.locator('aside').getByRole('button', { name: 'New Table' }).click()
      const dialog = page.getByRole('dialog', { name: 'Create New Table' })
      await expect(dialog).toBeVisible()
      await expectInsideViewport(page, dialog)
      await page.keyboard.press('Escape')

      await createManualTable(page, 'Responsive Table')
      await openManualTable(page, 'Responsive Table')
      await expectNoViewportOverflow(page)
      await expectInsideViewport(page, page.getByRole('button', {
        name: 'Suggestions',
        exact: true,
      }))

      await page.locator('aside').getByRole('button', { name: 'Report', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Create a report' })).toBeVisible()
      await expectNoViewportOverflow(page)
      await expectInsideViewport(page, page.locator('.report-toolbar-v2'))
    })
  })
}

for (const viewport of [
  { width: 320, height: 700, label: 'small phone portrait' },
  { width: 667, height: 375, label: 'phone landscape' },
  { width: 768, height: 1024, label: 'tablet portrait' },
]) {
  test.describe(`Adaptive layout: ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('navigation, dialogs, grid, and reports reflow inside the viewport', async ({ page }) => {
      await bootApp(page)
      await expectNoViewportOverflow(page)
      await expectInsideViewport(page, page.locator('header'))
      await expectInsideViewport(page, page.locator('.react-flow'))

      await page.getByRole('button', { name: 'Open navigation' }).click()
      const sidebar = page.locator('aside')
      await expectInsideViewport(page, sidebar)

      await sidebar.getByRole('button', { name: 'New Table' }).click()
      const dialog = page.getByRole('dialog', { name: 'Create New Table' })
      await expectInsideViewport(page, dialog)
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Open navigation' }).click()
      await createManualTable(page, `Adaptive ${viewport.width}`)
      await page.getByRole('button', { name: 'Open navigation' }).click()
      await openManualTable(page, `Adaptive ${viewport.width}`)
      await expectNoViewportOverflow(page)
      await expectInsideViewport(page, page.getByRole('button', { name: 'Suggestions' }))

      const workspaceNav = page.getByRole('navigation', { name: 'Workspace' })
      await workspaceNav.getByRole('button', { name: 'Report' }).click()
      await expect(page.getByRole('heading', { name: 'Create a report' })).toBeVisible()
      await expectNoViewportOverflow(page)
      await expectInsideViewport(page, page.locator('.report-toolbar-v2'))
      await expectInsideViewport(page, workspaceNav)
    })
  })
}
