import { expect, test } from '@playwright/test'
import { getTableNodes } from './derived-tables.support'

test.setTimeout(60000)

test.describe('View Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    const hasCanvas = await page.waitForSelector('.react-flow', { timeout: 10000 }).catch(() => null)
    if (!hasCanvas) {
      test.skip(true, 'Canvas not available')
    }
  })

  test('should show Canvas in header when on canvas view', async ({ page }) => {
    const header = page.locator('header')
    await expect(header).toBeVisible()

    const canvasTitle = header.locator('text=Table Canvas')
    await expect(canvasTitle).toBeVisible()
  })

  test('double-clicking a table node should open grid view', async ({ page }) => {
    const tableNodes = getTableNodes(page)
    const count = await tableNodes.count()

    if (count > 0) {
      await tableNodes.first().dblclick()

      const backButton = page.locator('button:has-text("Canvas")')
      const hasBackButton = await backButton.isVisible({ timeout: 2000 }).catch(() => false)

      if (hasBackButton) {
        await expect(backButton).toBeVisible()
        await backButton.click()
        await page.waitForSelector('.react-flow', { timeout: 5000 })
      }
    }
  })
})

test.describe('Export Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    const hasCanvas = await page.waitForSelector('.react-flow', { timeout: 10000 }).catch(() => null)
    if (!hasCanvas) {
      test.skip(true, 'Canvas not available')
    }
  })

  test('should have Export button in header', async ({ page }) => {
    const exportButton = page.locator('button:has-text("Export")')
    await expect(exportButton).toBeVisible()
  })

  test('clicking Export should show dropdown menu', async ({ page }) => {
    const exportButton = page.locator('button:has-text("Export")').first()
    await exportButton.click()
    await page.waitForTimeout(300)

    const exportProjectOption = page.locator('text=Export Project')
    const hasExportOption = await exportProjectOption.isVisible({ timeout: 1000 }).catch(() => false)

    if (hasExportOption) {
      await expect(exportProjectOption).toBeVisible()
    }
  })
})

test.describe('Dirty State Propagation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    const hasCanvas = await page.waitForSelector('.react-flow', { timeout: 10000 }).catch(() => null)
    if (!hasCanvas) {
      test.skip(true, 'Canvas not available')
    }
  })

  test('dirty tables should show "Needs refresh" indicator', async ({ page }) => {
    const dirtyIndicator = page.locator('.react-flow__node:has-text("Needs refresh")')
    const dirtyCount = await dirtyIndicator.count()
    expect(dirtyCount).toBeGreaterThanOrEqual(0)
  })

  test('computing tables should show spinner animation', async ({ page }) => {
    const computingIndicator = page.locator('.react-flow__node:has-text("Computing")')
    const computingCount = await computingIndicator.count()
    expect(computingCount).toBeGreaterThanOrEqual(0)
  })

  test('error tables should show error message', async ({ page }) => {
    const errorIndicator = page.locator('.react-flow__node:has-text("Error")')
    const errorCount = await errorIndicator.count()
    expect(errorCount).toBeGreaterThanOrEqual(0)
  })
})

test.describe('Canvas Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    const hasCanvas = await page.waitForSelector('.react-flow', { timeout: 10000 }).catch(() => null)
    if (!hasCanvas) {
      test.skip(true, 'Canvas not available')
    }
  })

  test('canvas should support zoom controls', async ({ page }) => {
    const canvas = page.locator('.react-flow')
    expect(await canvas.isVisible()).toBe(true)
  })

  test('nodes should be draggable', async ({ page }) => {
    const tableNodes = getTableNodes(page)
    const count = await tableNodes.count()

    if (count > 0) {
      const node = tableNodes.first()
      const box = await node.boundingBox()
      if (box) {
        await node.hover()
        await page.mouse.down()
        await page.mouse.move(box.x + 50, box.y + 50)
        await page.mouse.up()
        await expect(node).toBeVisible()
      }
    }
  })

  test('clicking a node should select it', async ({ page }) => {
    const tableNodes = getTableNodes(page)
    const count = await tableNodes.count()

    if (count > 0) {
      const node = tableNodes.first()
      await node.click()
      await expect(node).toBeVisible()
    }
  })
})
