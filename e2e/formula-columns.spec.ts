import { expect, test } from './e2e.fixture'
import { bootApp } from './app.support'

test('formula columns can be created, edited, deleted, and reloaded', async ({ page }) => {
  await bootApp(page)

  const csv = [
    'product,price,quantity',
    'Laptop,950,25',
    'Mouse,15,150',
  ].join('\n')
  await page.locator('aside input[type="file"][accept*=".csv"]').setInputFiles({
    name: 'Formula Regression.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })

  const table = page.locator('aside').getByRole('button', {
    name: /^Formula Regression\b/,
  })
  await expect(table).toBeVisible({ timeout: 30_000 })
  await table.click()
  await expect(page.getByRole('gridcell').first()).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Add column at end' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Column' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Column Name').fill('total')
  await dialog.getByRole('button', { name: '[price] * [quantity]' }).click()
  await dialog.getByRole('button', { name: 'Add Column' }).click()

  await expect(page.getByText('2 rows × 4 columns')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('columnheader', { name: /total/ })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: /23,750/ })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: /2,250/ })).toBeVisible()

  const totalHeader = page.getByRole('columnheader', { name: /total/ })
  await totalHeader.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Edit Formula' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Edit Formula' })
  await editDialog.getByRole('textbox', { name: 'Formula' }).fill('[price] * 2')
  await editDialog.getByRole('button', { name: 'Save Formula' }).click()
  await expect(page.getByRole('gridcell', { name: /1,900/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('gridcell', { name: /total, row 2: 30/ })).toBeVisible()

  await totalHeader.click({ button: 'right' })
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('menuitem', { name: 'Delete Formula Column' }).click()
  await expect(page.getByText('2 rows × 3 columns')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('columnheader', { name: /total/ })).toHaveCount(0)
  await page.waitForTimeout(250)
  await expect(page.getByText('Saving...')).toBeHidden({ timeout: 20_000 })

  await page.reload()
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
  await page.locator('aside').getByRole('button', {
    name: /^Formula Regression\b/,
  }).click()
  await expect(page.getByRole('gridcell').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('columnheader', { name: /total/ })).toHaveCount(0)
})
