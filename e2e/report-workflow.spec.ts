import { expect, test } from './e2e.fixture'
import { installMockBackend } from './derived-tables.support'
import { createManualTable, downloadProjectZip } from './app.support'

test('report text and linked tables survive reload and project export', async ({ page }) => {
  test.setTimeout(90_000)
  await installMockBackend(page)
  await page.goto('/')
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
  await createManualTable(page, 'Report Evidence')

  await page.locator('aside').getByRole('button', { name: 'Report', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Create a report' })).toBeVisible()
  await page.getByRole('button', { name: /Blank report/ }).click()

  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByRole('menuitem', { name: /Linked table/ }).click()
  await page.getByRole('button', { name: /Embed Table/ }).click()
  const tablePicker = page.getByRole('dialog', { name: 'Select a table to embed' })
  await tablePicker.getByRole('button', { name: /Report Evidence/ }).click()
  await expect(page.locator('.editable-table-block')).toContainText('Report Evidence')

  const editor = page.locator('.tiptap-editor-content')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.type('Quarterly review note')
  await expect(editor).toContainText('Quarterly review note')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 })

  await page.reload()
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
  await page.locator('aside').getByRole('button', { name: 'Report', exact: true }).click()
  await expect(page.locator('.tiptap-editor-content')).toContainText(
    'Quarterly review note',
  )

  await page.locator('aside').getByRole('button', { name: 'Canvas', exact: true }).click()
  const zip = await downloadProjectZip(page)
  const reportPath = Object.keys(zip.files).find(
    path => path.startsWith('reports/') && path.endsWith('.html'),
  )
  expect(reportPath).toBeTruthy()
  const reportHtml = await zip.file(reportPath!)!.async('text')
  expect(reportHtml).toContain('Quarterly review note')
})
