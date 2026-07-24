import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '../e2e.fixture'
import { bootApp, createManualTable, openManualTable } from '../app.support'

async function expectAccessible(page: Page, context?: string, include?: string) {
  let builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  if (include) builder = builder.include(include)
  const results = await builder.analyze()
  const violations = results.violations.map(violation => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map(node => ({
      target: node.target.join(' '),
      html: node.html,
      failureSummary: node.failureSummary,
    })),
  }))
  expect(violations, `${context ?? 'Page'} must have no WCAG A/AA violations`).toEqual([])
}

test.describe('Accessibility', () => {
  test('app shell and empty canvas have no automated WCAG violations', async ({ page }) => {
    await bootApp(page)
    await expectAccessible(page, 'Empty canvas')
  })

  test('creation dialogs are labelled and accessible', async ({ page }) => {
    await bootApp(page)
    await page.locator('aside').getByRole('button', { name: 'New Table' }).click()

    const dialog = page.getByRole('dialog', { name: 'Create New Table' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Table Name')).toBeVisible()
    await expect(dialog.getByLabel('Rows')).toBeVisible()
    await expectAccessible(page, 'New table dialog')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Current project' }).click()
    await page.getByRole('menuitem', { name: 'New project' }).click()
    const projectDialog = page.getByRole('dialog', { name: 'Create project' })
    await expect(projectDialog.getByLabel('Project name')).toBeFocused()
    await expectAccessible(page, 'New project dialog')
  })

  test('grid and suggestions panel have no automated WCAG violations', async ({ page }) => {
    await bootApp(page)
    await createManualTable(page)
    await openManualTable(page)
    await expectAccessible(page, 'Editable grid')

    await page.getByRole('button', { name: 'Suggestions', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Suggestions' })).toBeVisible()
    await page.waitForTimeout(250)
    await expectAccessible(page, 'Suggestions panel')
  })

  test('grid overlays and destructive confirmation are accessible', async ({ page }) => {
    await bootApp(page)
    await createManualTable(page)
    await openManualTable(page)

    await page.getByRole('button', { name: 'Filter' }).click()
    const filterDialog = page.getByRole('dialog', { name: 'Filter Data' })
    await expect(filterDialog.getByRole('button', { name: 'Close filter panel' })).toBeFocused()
    await expectAccessible(page, 'Filter dialog', '[aria-labelledby="filter-data-title"]')
    await page.keyboard.press('Escape')
    await expect(filterDialog).toBeHidden()

    await page.getByRole('button', { name: 'Add Column at end' }).click()
    const columnDialog = page.getByRole('dialog', { name: 'New Column' })
    await expect(columnDialog.getByLabel('Column Name')).toBeFocused()
    await expectAccessible(
      page,
      'Formula column dialog',
      '[aria-labelledby="formula-column-title"]',
    )
    await page.keyboard.press('Escape')

    const firstCell = page.getByRole('gridcell').first()
    await firstCell.click({ button: 'right' })
    const menu = page.getByRole('menu', { name: 'Grid actions' })
    await expect(menu.getByRole('menuitem').first()).toBeFocused()
    await expectAccessible(page, 'Grid context menu', '[role="menu"][aria-label="Grid actions"]')
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem').nth(1)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(firstCell).toBeFocused()

    await page.locator('aside').getByRole('button', {
      name: 'Actions for Test Table',
    }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    const deleteDialog = page.getByRole('alertdialog', { name: 'Delete Node' })
    await expect(deleteDialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await expectAccessible(page, 'Delete confirmation', '[role="alertdialog"]')
  })

  test('report creation and editor have no automated WCAG violations', async ({ page }) => {
    await bootApp(page)
    await page.locator('aside').getByRole('button', { name: 'Report', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Create a report' })).toBeVisible()
    await expectAccessible(page, 'Report start')

    await page.getByRole('button', { name: /Blank report/ }).click()
    await expect(page.locator('.tiptap-editor-content')).toBeVisible()
    await expectAccessible(page, 'Report editor')

    await page.getByRole('button', { name: 'Insert' }).click()
    await page.getByRole('menuitem', { name: /Manual table/ }).click()
    const tableDialog = page.getByRole('dialog', { name: 'Insert Table' })
    await expect(tableDialog.getByRole('button', { name: 'Close table picker' })).toBeFocused()
    await expectAccessible(page, 'Report table dimensions', '[aria-labelledby="insert-table-title"]')
  })
})

test.describe('Keyboard interaction', () => {
  test('dialog opens and closes from the keyboard and restores focus', async ({ page }) => {
    await bootApp(page)
    const trigger = page.locator('aside').getByRole('button', { name: 'New Table' })
    await trigger.focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Create New Table' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Table Name')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('export menu supports keyboard open, navigation, and escape', async ({ page }) => {
    await bootApp(page)
    const trigger = page.getByRole('button', { name: 'Export', exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const exportItem = page.getByRole('menuitem', { name: /Export Project/ })
    await expect(exportItem).toBeVisible()
    await expect(exportItem).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(exportItem).toBeHidden()
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(exportItem).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(exportItem).toBeHidden()
  })

  test('report insert menu follows menu button keyboard behavior', async ({ page }) => {
    await bootApp(page)
    await page.locator('aside').getByRole('button', { name: 'Report', exact: true }).click()
    await page.getByRole('button', { name: /Blank report/ }).click()
    await page.waitForTimeout(200)

    const trigger = page.getByRole('button', { name: 'Insert', exact: true })
    const menu = page.getByRole('menu')
    const items = menu.getByRole('menuitem')
    await trigger.focus()
    await page.keyboard.press('ArrowDown')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(items.last()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(items.nth(1)).toBeFocused()
    await page.keyboard.press('Home')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('End')
    await expect(items.last()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(menu).toBeHidden()
  })

  test('grid cells enter and commit edit mode from the keyboard', async ({ page }) => {
    await bootApp(page)
    await createManualTable(page)
    await openManualTable(page)

    const firstCell = page.getByRole('gridcell', { name: /^Name, row 1:/ })
    const secondCell = page.getByRole('gridcell', { name: /^Name, row 2:/ })
    await firstCell.focus()
    await expect(firstCell).toBeFocused()
    await expect(firstCell).toHaveCSS('outline-style', 'none')

    await page.keyboard.press('Enter')
    const editor = firstCell.locator('input')
    await expect(editor).toBeFocused()
    await expect(editor).toHaveCSS('outline-style', 'none')
    await editor.fill('Keyboard edit')
    await page.keyboard.press('Enter')

    await expect(firstCell).toContainText('Keyboard edit')
    await expect(firstCell).toBeFocused()
    await expect(editor).toBeHidden()

    const scrollBeforeNavigation = await page.evaluate(() => window.scrollY)
    await page.keyboard.press('ArrowDown')
    await expect(secondCell).toBeFocused()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBeforeNavigation)
    await page.keyboard.press('ArrowUp')
    await expect(firstCell).toBeFocused()
  })

  test('column resizing and autofill have keyboard equivalents', async ({ page }) => {
    await bootApp(page)
    await createManualTable(page)
    await openManualTable(page)

    const separator = page.getByRole('separator', { name: 'Resize Name column' })
    await separator.focus()
    const initialWidth = Number(await separator.getAttribute('aria-valuenow'))
    await page.keyboard.press('ArrowRight')
    await expect(separator).toHaveAttribute('aria-valuenow', String(initialWidth + 10))

    const firstCell = page.getByRole('gridcell', { name: /^Name, row 1:/ })
    await firstCell.focus()
    await page.keyboard.press('Enter')
    await firstCell.locator('input').fill('Repeat me')
    await page.keyboard.press('Enter')

    const fillButton = firstCell.getByRole('button', { name: 'Fill Name down one row' })
    await fillButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('gridcell', { name: /^Name, row 2:/ })).not.toContainText('(empty)')
  })

  test('table wiring opens and dismisses an accessible combine dialog', async ({ page }) => {
    await bootApp(page)
    await createManualTable(page, 'Source Table')
    await createManualTable(page, 'Target Table')
    await page.locator('aside').getByRole('button', { name: 'Canvas', exact: true }).click()

    await expect(page.getByText('Connect to a table…')).toHaveCount(0)
    await page.getByRole('button', { name: 'Arrange tables left to right' }).click()
    const nodes = page.locator('.react-flow__node')
    const source = nodes.filter({
      has: page.getByRole('heading', { name: 'Source Table', exact: true }),
    })
    const target = nodes.filter({
      has: page.getByRole('heading', { name: 'Target Table', exact: true }),
    })
    await source.locator('.table-handle-right').first().dragTo(
      target.locator('.table-handle-left').first(),
    )

    const dialog = page.getByRole('dialog', { name: 'Combine Tables' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('suggestion tabs use arrow-key navigation', async ({ page }) => {
    await bootApp(page)
    await createManualTable(page)
    await openManualTable(page)
    await page.getByRole('button', { name: 'Suggestions', exact: true }).click()

    const allTab = page.getByRole('tab', { name: /^All/ })
    await allTab.focus()
    await page.keyboard.press('ArrowRight')
    const cleaningTab = page.getByRole('tab', { name: /^Cleaning/ })
    await expect(cleaningTab).toBeFocused()
    await expect(cleaningTab).toHaveAttribute('aria-controls', 'suggestion-category-panel')
    await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'suggestion-tab-cleaning')
  })
})

test.describe('Mobile dialog interaction', () => {
  test.use({ viewport: { width: 320, height: 700 } })

  test('new table close restores focus to a visible control', async ({ page }) => {
    await bootApp(page)
    const openNavigation = page.getByRole('button', { name: 'Open navigation' })
    await openNavigation.click()

    const sidebar = page.locator('aside')
    await sidebar.getByRole('button', { name: 'New Table' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create New Table' })
    await expect(dialog.getByLabel('Table Name')).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(sidebar).toHaveClass(/invisible/)
    await expect(openNavigation).toBeFocused()
  })

  test('escape closes only the topmost sidebar dialog', async ({ page }) => {
    await bootApp(page)
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await createManualTable(page, 'Nested Dialog Table')
    await page.getByRole('button', { name: 'Open navigation' }).click()

    const sidebar = page.locator('aside')
    const trigger = sidebar.getByRole('button', {
      name: 'Actions for Nested Dialog Table',
    })
    await trigger.click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Delete Node' })
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(sidebar).toBeVisible()
    await expect(trigger).toBeFocused()
  })
})
