import { expect, test } from '../e2e.fixture'
import {
  bootApp,
  createManualTable,
  freezeVisualMotion,
  openManualTable,
} from '../app.support'

test.describe('@ux visual regression contract', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('empty canvas is visually stable in light and dark themes', async ({ page }) => {
    await bootApp(page)
    await freezeVisualMotion(page)
    await page.evaluate(() => document.fonts.ready)

    await expect(page).toHaveScreenshot('canvas-empty-light.png')

    await page.locator('aside').getByRole('button', { name: /switch to dark mode/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page).toHaveScreenshot('canvas-empty-dark.png')
  })

  test('new-table dialog is visually stable', async ({ page }) => {
    await bootApp(page)
    await freezeVisualMotion(page)
    await page.locator('aside').getByRole('button', { name: 'New Table' }).click()
    await expect(page.getByRole('dialog', { name: 'Create New Table' })).toBeVisible()

    await expect(page).toHaveScreenshot('new-table-dialog.png')
  })

  test('editable grid and suggestions panel are visually stable', async ({ page }) => {
    await bootApp(page)
    await freezeVisualMotion(page)
    await createManualTable(page, 'Visual Contract')
    await openManualTable(page, 'Visual Contract')

    await expect(page).toHaveScreenshot('editable-grid.png')

    await page.getByRole('button', { name: 'Suggestions', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Suggestions' })).toBeVisible()
    await expect(page).toHaveScreenshot('suggestions-panel.png')
  })

  test('canvas combine flow is visually stable', async ({ page }) => {
    await bootApp(page)
    await freezeVisualMotion(page)
    await createManualTable(page, 'Visual Left')
    await createManualTable(page, 'Visual Right')
    await page.getByRole('button', { name: 'Auto-Arrange' }).click()

    const nodes = page.locator('.react-flow__node')
    await nodes.filter({ hasText: 'Visual Left' }).locator('.table-handle-right').first()
      .dragTo(
        nodes.filter({ hasText: 'Visual Right' }).locator('.table-handle-left').first(),
        { force: true },
      )
    await expect(page.getByRole('dialog', { name: 'Combine Tables' })).toBeVisible()

    await expect(page).toHaveScreenshot('combine-tables-dialog.png')
  })

  test('report start and blank report editor are visually stable', async ({ page }) => {
    await bootApp(page)
    await freezeVisualMotion(page)
    await page.locator('aside').getByRole('button', { name: 'Report', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Create a report' })).toBeVisible()

    await expect(page).toHaveScreenshot('report-start.png')

    await page.getByRole('button', { name: /Blank report/ }).click()
    await expect(page.locator('.tiptap-editor-content')).toBeVisible()
    await expect(page).toHaveScreenshot('report-editor.png', {
      mask: [page.locator('.report-toolbar-v2-info')],
    })
  })
})
