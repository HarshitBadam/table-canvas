import type { Page } from '@playwright/test'
import { expect, test } from './e2e.fixture'
import { createManualTable } from './app.support'
import {
  createMockBackendState,
  installMockBackend,
  type MockBackendState,
} from './derived-tables.support'

const MIRROR_NOTICE = 'Read-only · Editing in another tab'

async function bootTab(page: Page, state: MockBackendState) {
  await installMockBackend(page, { state })
  await page.goto('/')
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
}

async function openSecondTab(page: Page, state: MockBackendState) {
  const second = await page.context().newPage()
  await installMockBackend(second, { state })
  await second.goto('/')
  // Ownership is decided purely by which tab holds the Web Lock, never by focus.
  await expect(second.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
  return second
}

function sidebarTable(page: Page, name: string) {
  return page.locator('aside').getByRole('button', {
    name: new RegExp(`^${name} .*rows`),
    includeHidden: true,
  })
}

function dashboardSummary(page: Page) {
  return page.locator('header').filter({ hasText: 'Project Overview' })
}

test('the second tab on a project mirrors it and never gets walled', async ({ page }) => {
  test.setTimeout(90_000)
  const state = createMockBackendState()
  await bootTab(page, state)
  await createManualTable(page, 'Shared Numbers')

  const mirror = await openSecondTab(page, state)

  await expect(mirror.getByText(MIRROR_NOTICE)).toBeVisible({ timeout: 20_000 })
  await expect(mirror.locator('.react-flow')).toBeVisible()
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect(mirror.getByRole('heading', {
    name: 'Table Canvas is open in another tab',
  })).toHaveCount(0)
  await expect(mirror.getByRole('button', { name: 'Edit here' })).toHaveCount(0)

  const newTable = mirror.locator('aside').getByRole('button', { name: 'New Table' })
  await expect(newTable).toBeVisible()
  await expect(newTable).toBeDisabled()
  await expect(newTable).toHaveAttribute('title', 'Editing is active in another tab.')
  await expect(page.locator('aside').getByRole('button', { name: 'New Table' }))
    .toBeEnabled()

  await mirror.close()

  // Closing the reader naturally leaves the owner editing; a reload reclaims the lock.
  await expect(page.getByText(MIRROR_NOTICE)).toHaveCount(0, { timeout: 20_000 })
  await page.reload()
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', {
    name: 'Table Canvas is open in another tab',
  })).toHaveCount(0)
  await expect(page.getByText(MIRROR_NOTICE)).toHaveCount(0, { timeout: 20_000 })
  await expect(page.locator('aside').getByRole('button', { name: 'New Table' }))
    .toBeEnabled({ timeout: 20_000 })
  await expect(sidebarTable(page, 'Shared Numbers')).toBeAttached()
})

test('a mirroring dashboard tab shows edits from the editing tab live', async ({ page }) => {
  test.setTimeout(90_000)
  const state = createMockBackendState()
  await bootTab(page, state)
  await createManualTable(page, 'First Table')

  const mirror = await openSecondTab(page, state)
  await expect(mirror.getByText(MIRROR_NOTICE)).toBeVisible({ timeout: 20_000 })
  await expect(sidebarTable(mirror, 'First Table')).toBeAttached()

  // Focus never claims editing; the reader stays statically read-only.
  await mirror.bringToFront()
  await mirror.locator('aside').getByRole('button', { name: 'Dashboard' }).click()
  await expect(dashboardSummary(mirror)).toContainText(/1\s*Tables/, { timeout: 20_000 })
  await expect(mirror.getByText(MIRROR_NOTICE)).toBeVisible()
  await expect(mirror.locator('aside').getByRole('button', { name: 'New Table' }))
    .toBeDisabled()

  await page.bringToFront()
  await expect(page.locator('aside').getByRole('button', { name: 'New Table' }))
    .toBeEnabled({ timeout: 20_000 })
  await createManualTable(page, 'Live Table')

  await expect(sidebarTable(mirror, 'Live Table')).toBeAttached({ timeout: 20_000 })
  await expect(dashboardSummary(mirror)).toContainText(/2\s*Tables/, { timeout: 20_000 })
  await mirror.close()
})

test('closing the owner promotes the queued reader after durable adoption', async ({ page }) => {
  test.setTimeout(90_000)
  const state = createMockBackendState()
  await bootTab(page, state)
  await createManualTable(page, 'Owned Table')

  const mirror = await openSecondTab(page, state)
  await expect(mirror.getByText(MIRROR_NOTICE)).toBeVisible({ timeout: 20_000 })

  await createManualTable(page, 'Final Owner Edit')
  await expect(sidebarTable(mirror, 'Final Owner Edit')).toBeAttached({ timeout: 20_000 })

  await page.close()

  await expect(mirror.getByText(MIRROR_NOTICE)).toHaveCount(0, { timeout: 20_000 })
  await expect(mirror.locator('aside').getByRole('button', { name: 'New Table' }))
    .toBeEnabled({ timeout: 20_000 })
  await expect(sidebarTable(mirror, 'Owned Table')).toBeAttached()
  await expect(sidebarTable(mirror, 'Final Owner Edit')).toBeAttached()

  await createManualTable(mirror, 'Promoted Tab Table')
  await expect(sidebarTable(mirror, 'Promoted Tab Table')).toBeAttached({ timeout: 20_000 })
})

test('two tabs on different projects are both editable', async ({ page }) => {
  test.setTimeout(90_000)
  const state = createMockBackendState()
  await bootTab(page, state)
  await createManualTable(page, 'Project One Table')

  const second = await openSecondTab(page, state)
  await expect(second.getByText(MIRROR_NOTICE)).toBeVisible({ timeout: 20_000 })

  await second.bringToFront()
  await second.getByRole('button', { name: 'Current project' }).click()
  await second.getByRole('menuitem', { name: /Create project/ }).click()
  const dialog = second.getByRole('dialog', { name: /Create.*project/i })
  await dialog.getByLabel('Project name').fill('Second Project')
  await dialog.getByRole('button', { name: 'Create project' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })

  await expect(second.getByText(MIRROR_NOTICE)).toHaveCount(0, { timeout: 20_000 })
  await expect(page.getByText(MIRROR_NOTICE)).toHaveCount(0, { timeout: 20_000 })
  await expect(second.locator('aside').getByRole('button', { name: 'New Table' }))
    .toBeEnabled()

  await page.bringToFront()
  await expect(page.locator('aside').getByRole('button', { name: 'New Table' }))
    .toBeEnabled({ timeout: 20_000 })
  await createManualTable(page, 'Project One Second Table')

  await second.close()
})
