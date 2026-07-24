import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '../e2e.fixture'
import { bootApp, createManualTable } from '../app.support'

async function importCsv(page: Page, name: string, rows: string[]) {
  await page.locator('aside input[type="file"][accept*=".csv"]').setInputFiles({
    name: `${name}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(rows.join('\n')),
  })
  await expect(page.locator('aside').getByRole('button', {
    name: new RegExp(`^${name} ${rows.length - 1} rows`),
  })).toBeVisible({ timeout: 30_000 })
}

async function connectTables(
  page: Page,
  sourceName: string,
  targetName: string,
  targetHandle = '.table-handle-left',
) {
  const nodes = page.locator('.react-flow__node')
  const source = nodes.filter({
    has: page.getByRole('heading', { name: sourceName, exact: true }),
  })
  const target = nodes.filter({
    has: page.getByRole('heading', { name: targetName, exact: true }),
  })
  await source.locator('.table-handle-right').first().dragTo(
    target.locator(targetHandle).first(),
    { force: true },
  )
}

test.describe('@ux critical journey contract', () => {
  test('canvas join creates, persists, and reopens a correct derived result', async ({ page }) => {
    test.setTimeout(90_000)
    await bootApp(page)
    await importCsv(page, 'Customers', [
      'ID,Customer',
      '1,Ada',
      '2,Grace',
      '3,Linus',
    ])
    await importCsv(page, 'Orders', [
      'ID,Amount',
      '1,120',
      '2,240',
      '4,480',
    ])

    const nodes = page.locator('.react-flow__node')
    await expect(nodes).toHaveCount(2)
    await page.getByRole('button', { name: 'Arrange tables left to right' }).click()
    await connectTables(page, 'Customers', 'Orders')

    const dialog = page.getByRole('dialog', { name: 'Combine Tables' })
    await expect(dialog).toBeVisible()
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(axe.violations.map(violation => violation.id)).toEqual([])

    await dialog.getByRole('button', { name: 'Customers match column' }).click()
    await dialog.getByRole('option', { name: /ID/ }).click()
    await dialog.getByRole('button', { name: 'Orders match column' }).click()
    await dialog.getByRole('option', { name: /ID/ }).click()
    await expect(dialog.getByLabel('Table Name')).toBeHidden()
    await dialog.getByText('Output options', { exact: true }).click()
    await dialog.getByLabel('Table Name').fill('Customer Orders')
    await dialog.getByRole('button', { name: 'Create joined table' }).click()

    await expect(dialog).toBeHidden({ timeout: 20_000 })
    await expect(page.locator('.react-flow__node')).toHaveCount(3)
    const derived = page.locator('aside').getByRole('button', {
      name: /^Customer Orders 3 rows/,
    })
    await expect(derived).toBeVisible({ timeout: 30_000 })
    await derived.click()
    await expect(page.getByText('3 rows × 3 columns')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('gridcell').filter({ hasText: 'Ada' })).toHaveCount(1)
    await expect(page.getByRole('gridcell').filter({ hasText: '240' })).toHaveCount(1)

    await page.reload()
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.react-flow__node')).toHaveCount(3)
    await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  })

  test('project switching saves each workspace and restores its exact state', async ({ page }) => {
    test.setTimeout(90_000)
    await bootApp(page)
    await createManualTable(page, 'First Workspace Table')

    await page.getByRole('button', { name: 'Current project' }).click()
    await page.getByRole('button', { name: 'New project' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Create project' })
    await createDialog.getByLabel('Project name').fill('Second Workspace')
    await createDialog.getByRole('button', { name: 'Create project' }).click()
    await expect(createDialog).toBeHidden({ timeout: 20_000 })
    const projectSwitcher = page.getByRole('button', { name: 'Current project' })
    await expect(projectSwitcher).toContainText('Second Workspace')
    await expect(page.locator('aside').getByText('No tables yet')).toBeVisible()

    await createManualTable(page, 'Second Workspace Table')
    await projectSwitcher.click()
    await page.getByRole('option', { name: 'Sample Workbook Project', exact: true }).click()
    await expect(page.locator('aside').getByRole('button', {
      name: /^First Workspace Table 5 rows/,
    })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('aside').getByText('Second Workspace Table')).toHaveCount(0)

    await projectSwitcher.click()
    await page.getByRole('option', { name: 'Second Workspace', exact: true }).click()
    await expect(page.locator('aside').getByRole('button', {
      name: /^Second Workspace Table 5 rows/,
    })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('aside').getByText('First Workspace Table')).toHaveCount(0)

    await projectSwitcher.click()
    await page.getByRole('button', { name: 'Rename', exact: true }).click()
    const renameInput = page.getByLabel('Rename project')
    await renameInput.fill('Operations Workspace')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(renameInput).toBeHidden()
    await expect(projectSwitcher).toContainText('Operations Workspace')
  })
})

test.describe('@ux narrow viewport contract', () => {
  test.use({ viewport: { width: 320, height: 700 } })

  test('join dialog stays inside a narrow viewport', async ({ page }) => {
    await bootApp(page)
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await importCsv(page, 'Narrow Customers', [
      'ID,Customer',
      '1,Ada',
      '2,Grace',
    ])
    await importCsv(page, 'Narrow Orders', [
      'ID,Amount',
      '1,120',
      '2,240',
    ])

    const nodes = page.locator('.react-flow__node')
    await page.locator('aside').getByRole('button', { name: 'Close navigation' }).click()
    await expect(nodes).toHaveCount(2)
    await page.getByRole('button', { name: 'Arrange tables top to bottom' }).click()
    await connectTables(page, 'Narrow Customers', 'Narrow Orders', '.table-handle-top')

    const dialog = page.getByRole('dialog', { name: 'Combine Tables' })
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  })
})
