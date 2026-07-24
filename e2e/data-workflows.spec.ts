import * as XLSX from 'xlsx'
import { expect, test } from './e2e.fixture'
import {
  bootApp,
  connectTables,
  downloadProjectZip,
  importCsv,
} from './app.support'

async function readExportedWorkbook(page: Parameters<typeof downloadProjectZip>[0]) {
  const zip = await downloadProjectZip(page)
  const workbookFile = zip.file('data.xlsx')
  expect(workbookFile, 'The export must include data.xlsx').not.toBeNull()
  const workbook = XLSX.read(await workbookFile!.async('nodebuffer'), { type: 'buffer' })
  return { zip, workbook }
}

test.describe('Data import and export integrity', () => {
  test('quoted, empty, numeric, and Unicode CSV values survive reload and export', async ({ page }) => {
    test.setTimeout(90_000)
    await bootApp(page)
    await importCsv(page, 'Edge Values', [
      'Record,Contact,Note,Amount',
      'A-001,"Ada, Lovelace","He said ""hello""",-12.5',
      'B-002,Zoë,東京,0',
      'C-003,李雷,,999999.125',
    ])

    await page.locator('aside').getByRole('button', { name: /^Edge Values 3 rows/ }).click()
    await expect(page.getByText('3 rows × 4 columns')).toBeVisible()
    await expect(page.getByRole('gridcell')).toHaveCount(12)
    await expect(page.getByRole('gridcell', { name: 'Contact, row 1: Ada, Lovelace' })).toBeVisible()
    await expect(page.getByRole('gridcell', { name: 'Note, row 1: He said "hello"' })).toBeVisible()
    await expect(page.getByRole('gridcell', { name: 'Contact, row 3: 李雷' })).toBeVisible()
    await expect(page.getByRole('gridcell', { name: 'Note, row 3: empty' })).toBeVisible()

    await page.reload()
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
    await page.locator('aside').getByRole('button', { name: /^Edge Values 3 rows/ }).click()
    await expect(page.getByRole('gridcell', { name: 'Contact, row 1: Ada, Lovelace' })).toBeVisible()
    await expect(page.getByRole('gridcell', { name: 'Note, row 3: empty' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to Canvas' }).click()
    const { zip, workbook } = await readExportedWorkbook(page)

    expect(Object.keys(zip.files).sort()).toEqual([
      'data.xlsx',
      'project.tablecanvas.json',
      'reports/',
    ])
    expect(workbook.SheetNames).toEqual(['Edge Values'])
    expect(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['Edge Values'], {
      header: 1,
      defval: null,
    })).toEqual([
      ['Record', 'Contact', 'Note', 'Amount'],
      ['A-001', 'Ada, Lovelace', 'He said "hello"', -12.5],
      ['B-002', 'Zoë', '東京', 0],
      ['C-003', '李雷', '', 999999.125],
    ])

    const projectFile = zip.file('project.tablecanvas.json')
    expect(projectFile, 'The export must include the native project file').not.toBeNull()
    const projectExport = JSON.parse(await projectFile!.async('text')) as {
      version: string
      formatType: string
      project: { name: string; nodes: Record<string, { name?: string }> }
      files: Record<string, unknown>
    }
    expect(projectExport.version).toBe('2.0.0')
    expect(projectExport.formatType).toBe('tablecanvas-full')
    expect(projectExport.project.name).toBe('Sample Workbook Project')
    expect(Object.values(projectExport.project.nodes).map(node => node.name)).toEqual(['Edge Values'])
    expect(Object.keys(projectExport.files)).toHaveLength(1)
  })
})

test.describe('Join correctness', () => {
  test('an inner join preserves duplicate matches and excludes unmatched rows after reload', async ({ page }) => {
    test.setTimeout(90_000)
    await bootApp(page)
    await importCsv(page, 'Join Customers', [
      'ID,Customer',
      '1,Ada',
      '2,Grace',
      '3,Linus',
    ])
    await importCsv(page, 'Join Orders', [
      'ID,Order',
      '2,A-10',
      '2,A-11',
      '4,A-12',
    ])

    await page.getByRole('button', { name: 'Arrange tables left to right' }).click()
    await connectTables(page, 'Join Customers', 'Join Orders')
    const dialog = page.getByRole('dialog', { name: 'Combine Tables' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^Inner/ }).click()
    await dialog.getByRole('button', { name: 'Join Customers match column' }).click()
    await dialog.getByRole('option', { name: /ID/ }).click()
    await dialog.getByRole('button', { name: 'Join Orders match column' }).click()
    await dialog.getByRole('option', { name: /ID/ }).click()
    await expect(dialog.getByText(/67% match - 2 rows/)).toBeVisible()
    await dialog.getByText('Output options', { exact: true }).click()
    await dialog.getByLabel('Table Name').fill('Matched Orders')
    await dialog.getByRole('button', { name: 'Create joined table' }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    await page.reload()
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
    await page.locator('aside').getByRole('button', { name: /^Matched Orders 2 rows/ }).click()
    await expect(page.getByText('2 rows × 3 columns')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('gridcell').filter({ hasText: 'Grace' })).toHaveCount(2)
    await expect(page.getByRole('gridcell').filter({ hasText: 'A-10' })).toHaveCount(1)
    await expect(page.getByRole('gridcell').filter({ hasText: 'A-11' })).toHaveCount(1)
    await expect(page.getByRole('gridcell').filter({ hasText: /Ada|Linus|A-12/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Back to Canvas' }).click()
    const { workbook } = await readExportedWorkbook(page)
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets['Matched Orders'],
      { defval: null },
    )).toEqual([
      { Id: 2, Customer: 'Grace', Order: 'A-10' },
      { Id: 2, Customer: 'Grace', Order: 'A-11' },
    ])
  })
})

test.describe('Suggestions panel state', () => {
  test('dismiss and restore update the visible suggestions without applying a change', async ({ page }) => {
    test.setTimeout(90_000)
    await bootApp(page)
    await importCsv(page, 'Suggestion Review', [
      'Name,Amount',
      'N/A,10',
      'Ada,20',
      'Grace,30',
      'Linus,40',
      'Margaret,50',
    ])
    await page.locator('aside').getByRole('button', { name: /^Suggestion Review 5 rows/ }).click()
    await expect(page.getByRole('gridcell').first()).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: 'Suggestions', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Suggestions' })
    const title = 'Convert placeholders to NULL in "Name"'
    const summary = panel.getByRole('button', {
      name: `${title}: Expand details`,
    })
    await expect(summary).toBeVisible({ timeout: 30_000 })
    await summary.click()
    const details = panel.getByRole('region', { name: title })
    await expect(details.getByRole('button', { name: 'Review fix' })).toBeVisible()
    await details.getByRole('button', { name: 'Dismiss' }).click()

    await expect(panel.getByText('1 dismissed')).toBeVisible()
    await expect(summary).toHaveCount(0)

    await panel.getByRole('button', { name: 'Restore' }).click()
    await expect(panel.getByText('1 dismissed')).toHaveCount(0)
    await expect(panel.getByRole('button', {
      name: `${title}: Collapse details`,
    })).toBeVisible()
    await panel.getByRole('button', { name: 'Close suggestions panel' }).click()
    await expect(page.getByRole('gridcell').first()).toHaveText('N/A')
  })
})
