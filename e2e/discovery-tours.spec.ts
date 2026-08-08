import { test, expect } from './e2e.fixture'
import {
  bootApp,
  createManualTable,
  openCanvasView,
  openManualTable,
} from './app.support'

async function resetTour(page: Parameters<typeof bootApp>[0], tourId: 'canvas' | 'report' | 'grid') {
  await page.evaluate((id) => {
    const key = 'table-canvas:discovery-tours:v1:account:sample-user'
    const current = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, true>
    delete current[id]
    localStorage.setItem(key, JSON.stringify(current))
  }, tourId)
}

test('canvas tour launches once and can be replayed', async ({ page }) => {
  await bootApp(page, { discoveryTours: true })

  await expect(page.getByRole('dialog', { name: 'Build workflows by connecting tables' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('dialog', { name: 'Three ways to work' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()

  await page.reload()
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.getByRole('button', { name: 'Replay guided tours' }).click()
  await expect(page.getByRole('dialog', { name: 'Build workflows by connecting tables' })).toBeVisible()
})

test('canvas tour keeps its workspace step visible on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await bootApp(page, { discoveryTours: true })

  await page.getByRole('button', { name: 'Next' }).click()
  const dialog = page.getByRole('dialog', { name: 'Three ways to work' })
  const workspaceNavigation = page.getByRole('navigation', { name: 'Workspace' })
  await expect(dialog).toBeVisible()
  await expect(workspaceNavigation).toBeVisible()

  const [dialogBox, navigationBox] = await Promise.all([
    dialog.boundingBox(),
    workspaceNavigation.boundingBox(),
  ])
  expect(dialogBox).not.toBeNull()
  expect(navigationBox).not.toBeNull()
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0)
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(844)
  expect(navigationBox!.y + navigationBox!.height).toBeLessThanOrEqual(844)
})

test('report tour previews blocks and opens the real Insert menu', async ({ page }) => {
  await bootApp(page)

  await page.locator('aside').getByRole('button', { name: 'Report', exact: true }).click()
  await page.getByRole('button', { name: 'Blank report' }).click()
  await expect(page.getByRole('button', { name: 'Insert', exact: true })).toBeVisible()

  await resetTour(page, 'report')
  await openCanvasView(page)
  await page.locator('aside').getByRole('button', { name: 'Report', exact: true }).click()

  await expect(page.getByRole('dialog', { name: 'Reports are more than text' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('dialog', { name: 'Your component library lives here' })).toBeVisible()
  await expect(page.getByRole('menu', { name: 'Insert block' })).toBeVisible()
})

test('table tour spotlights Suggestions and calculated columns', async ({ page }) => {
  await bootApp(page)
  await createManualTable(page, 'Tour Data', 5)
  await resetTour(page, 'grid')
  await openManualTable(page, 'Tour Data', 5)

  await expect(page.getByRole('dialog', { name: 'Let your data suggest the next step' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('dialog', { name: 'Create calculated columns' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})
