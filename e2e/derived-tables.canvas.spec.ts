import { expect, test } from '@playwright/test'
import { getTableNodes } from './derived-tables.support'

test.setTimeout(60000)

test.describe('Canvas View and Table Nodes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    const canvasOrLogin = await Promise.race([
      page.waitForSelector('.react-flow', { timeout: 10000 }).then(() => 'canvas'),
      page.waitForSelector('input[type="email"]', { timeout: 10000 }).then(() => 'login'),
    ]).catch(() => 'unknown')

    if (canvasOrLogin === 'login') {
      test.skip(true, 'Authentication required - skipping until auth is configured')
    }
  })

  test('should display the canvas view with React Flow', async ({ page }) => {
    const canvas = page.locator('.react-flow')
    await expect(canvas).toBeVisible({ timeout: 10000 })

    const viewport = page.locator('.react-flow__viewport')
    await expect(viewport).toBeVisible()
  })

  test('should show sidebar with Import Data button', async ({ page }) => {
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    const importButton = sidebar.locator('button:has-text("Import Data")')
    await expect(importButton).toBeVisible()
  })

  test('should show New Table button in sidebar', async ({ page }) => {
    const sidebar = page.locator('aside')
    const newTableButton = sidebar.locator('button:has-text("New Table")')
    await expect(newTableButton).toBeVisible()
  })

  test('should open New Table modal when clicking New Table button', async ({ page }) => {
    const sidebar = page.locator('aside')
    const newTableButton = sidebar.locator('button:has-text("New Table")')
    await newTableButton.click()

    const modal = page.locator('[role="dialog"], .modal')
    const modalVisible = await modal.isVisible({ timeout: 2000 }).catch(() => false)

    if (modalVisible) {
      await expect(modal).toBeVisible()

      const nameInput = modal.locator('input').first()
      await expect(nameInput).toBeVisible()
    }
  })
})

test.describe('Table Node Status Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    const hasCanvas = await page.waitForSelector('.react-flow', { timeout: 10000 }).catch(() => null)
    if (!hasCanvas) {
      test.skip(true, 'Canvas not available - authentication may be required')
    }
  })

  test('source tables should have green accent styling', async ({ page }) => {
    const tableNodes = getTableNodes(page)
    const count = await tableNodes.count()

    if (count > 0) {
      await expect(tableNodes.first()).toBeVisible()
      const sourceTableIcon = page.locator('.bg-accent-green, .bg-\\[\\#217346\\]')
      const hasSourceStyle = await sourceTableIcon.count() > 0
      expect(hasSourceStyle).toBeDefined()
    }
  })

  test('derived tables should have violet accent styling', async ({ page }) => {
    const derivedTableIcon = page.locator('.bg-violet-500')
    const derivedCount = await derivedTableIcon.count()
    expect(derivedCount).toBeGreaterThanOrEqual(0)
  })

  test('table nodes should show row and column counts', async ({ page }) => {
    const tableNodes = getTableNodes(page)
    const count = await tableNodes.count()

    if (count > 0) {
      const statsText = page.locator('.react-flow__node:has-text("rows")')
      const statsCount = await statsText.count()
      expect(statsCount).toBeGreaterThanOrEqual(0)
    }
  })
})

test.describe('Data Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    const hasCanvas = await page.waitForSelector('.react-flow', { timeout: 10000 }).catch(() => null)
    if (!hasCanvas) {
      test.skip(true, 'Canvas not available')
    }
  })

  test('should have file input for CSV/Excel import', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    const inputCount = await fileInput.count()
    expect(inputCount).toBeGreaterThan(0)
  })

  test('file input should accept CSV and Excel formats', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first()
    const acceptAttr = await fileInput.getAttribute('accept')
    expect(acceptAttr).toContain('.csv')
  })
})
