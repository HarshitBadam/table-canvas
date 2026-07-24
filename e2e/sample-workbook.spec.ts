import type { Page } from '@playwright/test'
import { expect, test } from './e2e.fixture'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { installMockBackend } from './derived-tables.support'
import { downloadProjectZip } from './app.support'

const workbookPath = resolve(process.cwd(), 'data/sample_workbook.xlsx')
const expectedRows: Record<string, number> = {
  Sales: 8,
  Inventory: 8,
  Targets: 12,
  Employees: 10,
  Customers: 10,
  Expenses: 10,
  Revenue: 14,
  Projects: 8,
}

async function downloadWorkbook(page: Page): Promise<XLSX.WorkBook> {
  const zip = await downloadProjectZip(page)
  const workbookBytes = await zip.file('data.xlsx')!.async('nodebuffer')
  return XLSX.read(workbookBytes, { type: 'buffer' })
}

test('@ux imports, reloads, and exports every sample workbook sheet with data', async ({ page }) => {
  test.setTimeout(120_000)
  const backend = await installMockBackend(page)
  await page.goto('/')
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })

  await page.locator('aside input[type="file"][accept*=".xlsx"]').setInputFiles(workbookPath)
  const sheetDialog = page.getByRole('dialog')
  await expect(sheetDialog.getByRole('heading', { name: 'Select Sheets to Import' })).toBeVisible()
  await expect(sheetDialog.getByText('8 selected')).toBeVisible()
  await sheetDialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(sheetDialog).toBeHidden({ timeout: 30_000 })

  for (const [sheetName, rowCount] of Object.entries(expectedRows)) {
    const tableButton = page.locator('aside').getByRole('button', {
      name: new RegExp(`^${sheetName} ${rowCount} rows`),
    })
    await expect(tableButton).toBeVisible()
  }

  await expect.poll(
    () => Object.keys(backend.getProject()?.nodes ?? {}).length,
    { timeout: 10_000 },
  ).toBe(8)

  await page.reload()
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
  for (const sheetName of Object.keys(expectedRows)) {
    await expect(page.locator('aside').getByText(sheetName, { exact: true })).toBeVisible()
  }

  const exported = await downloadWorkbook(page)
  expect(exported.SheetNames).toEqual(Object.keys(expectedRows))

  for (const [sheetName, rowCount] of Object.entries(expectedRows)) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(exported.Sheets[sheetName], { header: 1 })
    expect(rows).toHaveLength(rowCount + 1)
    expect(rows[0].length).toBeGreaterThan(0)
    expect(rows[1].some(value => value !== '')).toBe(true)
  }
})

test('@ux exports an immediate edit to a newly created manual table', async ({ page }) => {
  test.setTimeout(60_000)
  const backend = await installMockBackend(page)
  await page.goto('/')
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })

  await page.locator('aside').getByRole('button', { name: 'New Table' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Enter table name').fill('Manual Reliability')
  await dialog.getByRole('button', { name: 'Create Table' }).click()
  await expect(dialog).toBeHidden()

  await page.locator('aside').getByRole('button', {
    name: /^Manual Reliability 5 rows/,
  }).click()
  const firstCell = page.locator('.cursor-cell').first()
  await expect(firstCell).toBeVisible({ timeout: 10_000 })
  await firstCell.dblclick()
  const editor = firstCell.locator('input')
  await editor.fill('Exported immediately')
  await editor.press('Enter')
  await expect(firstCell).toContainText('Exported immediately')

  await expect.poll(() => {
    const patches = backend.getProject()?.patches ?? {}
    return Object.values(patches).some((value) => {
      const tablePatches = value as { cellPatches?: Record<string, Record<string, unknown>> }
      return Object.values(tablePatches.cellPatches ?? {})
        .some(column => Object.keys(column).length > 0)
    })
  }, { timeout: 10_000 }).toBe(true)

  await page.reload()
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
  const exported = await downloadWorkbook(page)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(
    exported.Sheets['Manual Reliability'],
    { header: 1 },
  )

  expect(rows[1][0]).toBe('Exported immediately')
})

test('@ux applies a cleaning suggestion and preserves it across reload', async ({ page }) => {
  test.setTimeout(90_000)
  const backend = await installMockBackend(page)
  await page.goto('/')
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })

  await page.locator('aside input[type="file"][accept*=".csv"]').setInputFiles({
    name: 'cleaning-sample.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'Name,Amount',
      'N/A,10',
      'Alice,20',
      'Bob,30',
      'Carol,40',
      'Dave,50',
    ].join('\n')),
  })
  await expect(page.locator('aside').getByRole('button', { name: 'Import Data' }))
    .toBeEnabled({ timeout: 20_000 })
  await page.locator('aside').getByRole('button', {
    name: /^cleaning-sample 5 rows/,
  }).click()
  await expect(page.locator('.cursor-cell').first()).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Suggestions', exact: true }).click()
  const panel = page.getByRole('dialog')
  await expect(panel.getByRole('heading', { name: 'Suggestions' })).toBeVisible()
  await panel.getByRole('tab', { name: /Cleaning/ }).click()
  await expect(panel.getByText('Convert placeholders to NULL in "Name"')).toBeVisible({
    timeout: 30_000,
  })
  await panel.getByRole('button', { name: 'All', exact: true }).click()
  await panel.getByRole('button', { name: /Apply \d+ fix/ }).click()
  await expect(page.getByText(/Applied \d+ cell changes?/)).toBeVisible()
  await panel.getByRole('button', { name: 'Close suggestions panel' }).click()
  await expect(page.locator('.cursor-cell').first()).toHaveText('')
  await expect(page.locator('.cursor-cell').first())
    .toHaveAccessibleName('Name, row 1: empty')
  await expect(page.locator('.cursor-cell').nth(2)).toHaveText('Alice')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.cursor-cell').first()).toHaveText('N/A', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled()
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.locator('.cursor-cell').first()).toHaveText('', { timeout: 20_000 })
  await expect(page.locator('.cursor-cell').nth(2)).toHaveText('Alice')

  await expect.poll(() => {
    const patches = backend.getProject()?.patches ?? {}
    return Object.values(patches).some((value) => {
      const tablePatches = value as { cellPatches?: Record<string, Record<string, unknown>> }
      return Object.values(tablePatches.cellPatches ?? {})
        .some(column => Object.keys(column).length > 0)
    })
  }, { timeout: 10_000 }).toBe(true)

  await page.reload()
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
  const exported = await downloadWorkbook(page)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(
    exported.Sheets['cleaning-sample'],
    { header: 1, defval: null },
  )
  expect(rows[1][0]).toBe('')
})
