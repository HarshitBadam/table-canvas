import { expect, test } from './e2e.fixture'
import { bootApp, createManualTable } from './app.support'

test.describe('Canvas interaction behavior', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page)
  })

  test('zoom controls change the viewport transform', async ({ page }) => {
    await createManualTable(page, 'Zoom Contract')
    const viewport = page.locator('.react-flow__viewport')
    const before = await viewport.getAttribute('style')

    await page.getByRole('button', { name: 'zoom out' }).click()

    await expect.poll(() => viewport.getAttribute('style')).not.toBe(before)
  })

  test('dragging a node changes its position and keeps it interactive', async ({ page }) => {
    await createManualTable(page, 'Drag Contract')
    const node = page.locator('.react-flow__node').filter({ hasText: 'Drag Contract' })
    const before = await node.boundingBox()
    expect(before).not.toBeNull()

    await node.hover({ position: { x: 18, y: 18 } })
    await page.mouse.down()
    await page.mouse.move(
      before!.x + 138,
      before!.y + 98,
      { steps: 8 },
    )
    await page.mouse.up()

    const after = await node.boundingBox()
    expect(after).not.toBeNull()
    expect(Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y))
      .toBeGreaterThan(50)
    await node.dblclick()
    await expect(page.getByRole('grid', { name: 'Table data' })).toBeVisible()
  })

  test('selection and export menu expose explicit state and actions', async ({ page }) => {
    await createManualTable(page, 'Selection Contract')
    const node = page.locator('.react-flow__node').filter({ hasText: 'Selection Contract' })
    await node.click()
    await expect(node).toHaveClass(/selected/)

    const exportButton = page.getByRole('button', { name: 'Export', exact: true })
    await exportButton.click()
    const menu = page.getByRole('menu', { name: 'Project actions' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem')).toHaveCount(3)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(exportButton).toBeFocused()
  })
})
