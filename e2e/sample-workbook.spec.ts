import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

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

interface MockProject {
  id: string
  name: string
  nodes: Record<string, unknown>
  edges: Record<string, unknown>
  patches: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: status < 400, data }),
  })
}

async function installBackend(page: Page) {
  let project: MockProject | null = null
  let fileNumber = 0
  const user = {
    id: 'sample-user',
    email: 'sample@example.com',
    name: 'Sample User',
    tier: 'google',
    createdAt: new Date().toISOString(),
  }

  await page.route('http://localhost:3001/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path === '/api/auth/me') {
      await json(route, { user })
      return
    }
    if (path === '/api/projects' && request.method() === 'GET') {
      await json(route, {
        projects: project
          ? [{
              id: project.id,
              name: project.name,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            }]
          : [],
      })
      return
    }
    if (path === '/api/projects' && request.method() === 'POST') {
      const now = new Date().toISOString()
      project = {
        id: 'sample-project',
        name: 'Sample Workbook Project',
        nodes: {},
        edges: {},
        patches: {},
        createdAt: now,
        updatedAt: now,
      }
      await json(route, { project }, 201)
      return
    }
    if (path === '/api/projects/sample-project' && request.method() === 'GET') {
      await json(route, { project })
      return
    }
    if (path === '/api/projects/sample-project' && request.method() === 'PUT') {
      const update = request.postDataJSON() as Partial<MockProject>
      project = {
        ...project!,
        ...update,
        updatedAt: new Date().toISOString(),
      }
      await json(route, { project })
      return
    }
    if (path === '/api/files/upload' && request.method() === 'POST') {
      fileNumber += 1
      await json(route, {
        file: {
          id: `sample-file-${fileNumber}`,
          filename: 'sample_workbook.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: readFileSync(workbookPath).byteLength,
          uploadDate: new Date().toISOString(),
        },
      }, 201)
      return
    }

    await route.fulfill({ status: 404, body: 'Not mocked' })
  })

  return {
    getProject: () => project,
  }
}

async function downloadWorkbook(page: Page): Promise<XLSX.WorkBook> {
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export Project ZIP/ }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  const workbookBytes = await zip.file('data.xlsx')!.async('nodebuffer')
  return XLSX.read(workbookBytes, { type: 'buffer' })
}

test('imports, reloads, and exports every sample workbook sheet with data', async ({ page }) => {
  test.setTimeout(120_000)
  const backend = await installBackend(page)
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

test('exports an immediate edit to a newly created manual table', async ({ page }) => {
  test.setTimeout(60_000)
  await installBackend(page)
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

  await page.locator('main').getByRole('button', { name: 'Canvas', exact: true }).click()
  const exported = await downloadWorkbook(page)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(
    exported.Sheets['Manual Reliability'],
    { header: 1 },
  )

  expect(rows[1][0]).toBe('Exported immediately')
})
