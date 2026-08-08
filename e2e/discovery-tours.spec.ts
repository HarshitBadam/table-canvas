import { test, expect } from './e2e.fixture'
import {
  bootApp,
  createManualTable,
  openCanvasView,
  openManualTable,
} from './app.support'

test('canvas tour launches once, does not relaunch after reload, and can be replayed from the logo', async ({ page }) => {
  await bootApp(page, { discoveryTours: true })

  await expect(page.getByRole('dialog', { name: 'Build workflows by connecting tables' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('dialog', { name: 'Three ways to work' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()

  await page.reload()
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.getByRole('button', { name: 'Replay guided tours' }).click()
  await expect(page.getByRole('dialog', { name: 'Build workflows by connecting tables' })).toBeVisible()
})

test('account tour completion persists from the server after guest storage is cleared', async ({ page }) => {
  await bootApp(page, { discoveryTours: true })

  await expect(page.getByRole('dialog', { name: 'Build workflows by connecting tables' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.evaluate(() => {
    localStorage.removeItem('table-canvas:discovery-tours:v1:guest-browser')
    for (const key of Object.keys(localStorage)) {
      if (key.includes(':pending:account:')) localStorage.removeItem(key)
    }
  })
  await page.reload()
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('guest browser completion merges into the signed-in account', async ({ page }) => {
  const sync = page.waitForRequest(request =>
    request.url().includes('/api/auth/me/discovery-tours')
    && request.method() === 'PUT',
  )
  await bootApp(page, { discoveryTours: ['canvas'] })
  const request = await sync
  expect(request.postDataJSON()).toMatchObject({
    version: 1,
    completedTours: expect.arrayContaining(['canvas']),
  })
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.evaluate(() => {
    localStorage.removeItem('table-canvas:discovery-tours:v1:guest-browser')
  })
  await page.reload()
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('guest tour completion persists across reload', async ({ page }) => {
  await bootApp(page, { discoveryTours: true, authMode: 'guest' })

  await expect(page.getByRole('dialog', { name: 'Build workflows by connecting tables' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  const stored = await page.evaluate(() =>
    localStorage.getItem('table-canvas:discovery-tours:v1:guest-browser'),
  )
  expect(stored).toContain('canvas')

  await page.reload()
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
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
  await bootApp(page, { discoveryTours: ['canvas', 'grid'] })

  await page.locator('aside').getByRole('button', { name: 'Report', exact: true }).click()
  await page.getByRole('button', { name: 'Blank report' }).click()
  await expect(page.getByRole('button', { name: 'Insert', exact: true })).toBeVisible()

  await openCanvasView(page)
  await page.locator('aside').getByRole('button', { name: 'Report', exact: true }).click()

  await expect(page.getByRole('dialog', { name: 'Reports are more than text' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('dialog', { name: 'Your component library lives here' })).toBeVisible()
  await expect(page.getByRole('menu', { name: 'Insert block' })).toBeVisible()
})

test('table tour spotlights Suggestions and calculated columns', async ({ page }) => {
  await bootApp(page, { discoveryTours: ['canvas', 'report'] })
  await createManualTable(page, 'Tour Data', 5)
  await openManualTable(page, 'Tour Data', 5)

  await expect(page.getByRole('dialog', { name: 'Let your data suggest the next step' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('dialog', { name: 'Create calculated columns' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})
