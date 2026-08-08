import { expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { installMockBackend } from './derived-tables.support'

function tableSidebarName(name: string, rowCount: number | string) {
  return new RegExp(`^${name} .*${rowCount} rows`)
}

interface BootAppOptions {
  discoveryTours?: boolean | readonly ('canvas' | 'report' | 'grid')[]
  authMode?: 'account' | 'guest'
}

export async function seedCompletedDiscoveryTours(
  page: Page,
  tourIds: readonly ('canvas' | 'report' | 'grid')[] = ['canvas', 'report', 'grid'],
) {
  await page.addInitScript((completedTours) => {
    localStorage.setItem(
      'table-canvas:discovery-tours:v1:guest-browser',
      JSON.stringify({
        version: 1,
        completedTours,
      }),
    )
  }, [...tourIds])
}

export async function bootApp(page: Page, options: BootAppOptions = {}) {
  const authMode = options.authMode ?? 'account'
  if (options.discoveryTours !== true) {
    const completedTours = Array.isArray(options.discoveryTours)
      ? [...options.discoveryTours]
      : ['canvas', 'report', 'grid']
    await seedCompletedDiscoveryTours(page, completedTours)
  }
  // Guest tabs are tab-local: seed the session marker so boot skips account auth
  // without visiting the login page (and its noisy Google/401 console traffic).
  if (authMode === 'guest') {
    await page.addInitScript(() => {
      sessionStorage.setItem('table-canvas:guest-session', 'true')
    })
  }
  // Keep the account mock available for incidental API probes; guest-session is
  // what selects guest identity in the app.
  await installMockBackend(page)
  // Preview can briefly 404 while workers start in parallel; retry until the
  // canvas is actually mounted instead of treating the first navigation as final.
  await expect(async () => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' })
    expect(response, 'homepage must respond').toBeTruthy()
    expect(response!.ok(), `homepage returned ${response!.status()}`).toBeTruthy()
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 45_000 })
  await expect(page.locator('aside')).toBeAttached()
}

export async function importCsv(
  page: Page,
  name: string,
  lines: string[],
) {
  await page.locator('aside input[type="file"][accept*=".csv"]').setInputFiles({
    name: `${name}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(lines.join('\n')),
  })
  await expect(page.locator('aside').getByRole('button', {
    name: tableSidebarName(name, lines.length - 1),
  })).toBeVisible({ timeout: 30_000 })
}

export async function connectTables(
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
  )
}

export async function createManualTable(
  page: Page,
  name = 'Test Table',
  rowCount = 5,
) {
  const trigger = page.locator('aside').getByRole('button', { name: 'New Table' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Create New Table' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Table Name').fill(name)
  if (rowCount !== 5) {
    await dialog.getByLabel('Rows').fill(String(rowCount))
  }
  await dialog.getByRole('button', { name: 'Create Table' }).click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  await expect(page.locator('aside').getByRole('button', {
    name: tableSidebarName(name, rowCount),
    includeHidden: true,
  })).toBeAttached()
}

export async function openManualTable(page: Page, name = 'Test Table', rowCount = 5) {
  await page.locator('aside').getByRole('button', {
    name: tableSidebarName(name, rowCount),
  }).click()
  await expect(page.locator('.cursor-cell').first()).toBeVisible({ timeout: 20_000 })
}

export async function expectNoViewportOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: document.documentElement.clientHeight,
  }))
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight)
}

export async function freezeVisualMotion(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  })
}

export async function openCanvasView(page: Page) {
  await page.locator('aside').getByRole('button', { name: 'Canvas', exact: true }).click()
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
}

export async function downloadProjectZip(page: Page): Promise<JSZip> {
  await page.getByRole('button', { name: 'Import or export project' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /Export Project ZIP/ }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return JSZip.loadAsync(Buffer.concat(chunks))
}
