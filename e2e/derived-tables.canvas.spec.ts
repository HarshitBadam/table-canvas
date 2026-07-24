import { expect, test } from './e2e.fixture'
import { bootApp, createManualTable, openManualTable } from './app.support'

test.describe('Canvas and table behavior', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page)
  })

  test('empty-state actions create a real table node with exact metadata', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Start with a table' })).toBeVisible()
    await page.locator('.react-flow').getByRole('button', { name: 'New Table' }).click()

    const dialog = page.getByRole('dialog', { name: 'Create New Table' })
    await dialog.getByLabel('Table Name').fill('Canvas Table')
    await dialog.getByLabel('Rows').fill('7')
    await dialog.getByRole('button', { name: 'Create Table' }).click()

    const node = page.locator('.react-flow__node').filter({ hasText: 'Canvas Table' })
    await expect(node).toHaveCount(1)
    await expect(node).toContainText('7 rows · 2 columns')
    await expect(node).toContainText('Name')
    await expect(node).toContainText('Value')
    await expect(page.locator('aside').getByRole('button', {
      name: /^Canvas Table 7 rows/,
    })).toBeVisible()
  })

  test('a created source opens an editable grid and returns to the same canvas node', async ({ page }) => {
    await createManualTable(page, 'Navigation Table')
    await openManualTable(page, 'Navigation Table')

    await expect(page.getByText('Source - Editable')).toBeVisible()
    await expect(page.getByRole('grid', { name: 'Table data' })).toBeVisible()
    await expect(page.getByRole('gridcell')).toHaveCount(10)
    await page.getByRole('button', { name: 'Back to Canvas' }).click()

    await expect(page.locator('.react-flow__node').filter({
      hasText: 'Navigation Table',
    })).toHaveCount(1)
  })

  test('new-table validation blocks empty and duplicate names with an explicit error', async ({ page }) => {
    await page.locator('aside').getByRole('button', { name: 'New Table' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create New Table' })
    const create = dialog.getByRole('button', { name: 'Create Table' })

    await dialog.getByLabel('Table Name').fill(' ')
    await expect(create).toBeDisabled()
    await dialog.getByLabel('Table Name').fill('Validation Table')
    await dialog.getByLabel('Column 2 name').fill('Name')
    await expect(dialog.getByRole('alert')).toHaveText('Give each column a different name.')
    await expect(create).toBeDisabled()
    await dialog.getByLabel('Column 2 name').fill('Amount')
    await expect(dialog.getByRole('alert')).toBeHidden()
    await expect(create).toBeEnabled()
  })

  test('CSV import materializes exact rows and schema instead of only exposing a file input', async ({ page }) => {
    await page.locator('aside input[type="file"][accept*=".csv"]').setInputFiles({
      name: 'imported-data.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('ID,Name\n1,Ada\n2,Grace\n3,Linus'),
    })

    const table = page.locator('aside').getByRole('button', {
      name: /^imported-data 3 rows/,
    })
    await expect(table).toBeVisible({ timeout: 20_000 })
    await table.click()
    await expect(page.getByText('3 rows × 2 columns')).toBeVisible()
    await expect(page.getByRole('gridcell').filter({ hasText: 'Ada' })).toHaveCount(1)
    await expect(page.getByRole('gridcell').filter({ hasText: 'Linus' })).toHaveCount(1)
  })
})
