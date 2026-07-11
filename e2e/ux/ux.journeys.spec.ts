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
    await page.getByRole('button', { name: 'Auto-Arrange' }).click()
    const customers = nodes.filter({ hasText: 'Customers' })
    const orders = nodes.filter({ hasText: 'Orders' })
    await customers.locator('.table-handle-right').first()
      .dragTo(orders.locator('.table-handle-left').first(), { force: true })

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
    await dialog.getByLabel('Output table name').fill('Customer Orders')
    await dialog.getByRole('button', { name: 'Create Table' }).click()

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

    await page.locator('aside').getByRole('button', { name: 'New project' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Create project' })
    await createDialog.getByLabel('Project name').fill('Second Workspace')
    await createDialog.getByRole('button', { name: 'Create project' }).click()
    await expect(createDialog).toBeHidden({ timeout: 20_000 })
    await expect(page.locator('aside').getByLabel('Current project')).toHaveValue(
      'sample-project-2',
    )
    await expect(page.locator('aside').getByText('No tables yet')).toBeVisible()

    await createManualTable(page, 'Second Workspace Table')
    await page.locator('aside').getByLabel('Current project').selectOption('sample-project')
    await expect(page.locator('aside').getByRole('button', {
      name: /^First Workspace Table 5 rows/,
    })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('aside').getByText('Second Workspace Table')).toHaveCount(0)

    await page.locator('aside').getByLabel('Current project').selectOption('sample-project-2')
    await expect(page.locator('aside').getByRole('button', {
      name: /^Second Workspace Table 5 rows/,
    })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('aside').getByText('First Workspace Table')).toHaveCount(0)
  })
})
