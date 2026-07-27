import type { Page } from '@playwright/test'
import { expect, test } from './e2e.fixture'
import { createManualTable } from './app.support'
import {
  createMockBackendState,
  installMockBackend,
  type MockBackendState,
} from './derived-tables.support'

const MIRROR_NOTICE = 'Viewing live. Editing is active in another tab.'

async function bootTab(page: Page, state: MockBackendState) {
  await installMockBackend(page, { state })
  await page.goto('/')
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
}

async function openSecondTab(page: Page, state: MockBackendState) {
  const second = await page.context().newPage()
  await installMockBackend(second, { state })
  await second.goto('/')
  // The workspace keeps editing where it is until a tab holds focus, so put the first
  // tab back in front before the second one finishes booting.
  await page.bringToFront()
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
  // Both tabs keep the workspace: nothing is ever walled off.
  await expect(mirror.locator('.react-flow')).toBeVisible()
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect(mirror.getByRole('heading', {
    name: 'Table Canvas is open in another tab',
  })).toHaveCount(0)

  // Mutating controls are disabled with an explanation, not hidden.
  const newTable = mirror.locator('aside').getByRole('button', { name: 'New Table' })
  await expect(newTable).toBeVisible()
  await expect(newTable).toBeDisabled()
  await expect(newTable).toHaveAttribute('title', 'Editing is active in another tab.')
  await expect(page.locator('aside').getByRole('button', { name: 'New Table' }))
    .toBeEnabled()

  await mirror.close()

  // The tab left on its own keeps the document and is never walled, including after a
  // reload that has to reclaim a lock the closed tab used to hold.
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

  // A read-only tab left open on the dashboard is the case that used to clobber the
  // editing tab; now it just watches.
  await mirror.locator('aside').getByRole('button', { name: 'Dashboard' }).click()
  await expect(dashboardSummary(mirror)).toContainText('1 Tables', { timeout: 20_000 })

  // Editing follows attention, so the tab being worked in has to be the front one; the
  // dashboard stays open behind it.
  await page.bringToFront()
  await expect(page.locator('aside').getByRole('button', { name: 'New Table' }))
    .toBeEnabled({ timeout: 20_000 })
  await createManualTable(page, 'Live Table')

  await expect(sidebarTable(mirror, 'Live Table')).toBeAttached({ timeout: 20_000 })
  await expect(dashboardSummary(mirror)).toContainText('2 Tables', { timeout: 20_000 })
  await mirror.close()
})

test('editing follows focus once the other tab has saved', async ({ page }) => {
  test.setTimeout(90_000)
  const state = createMockBackendState()
  await bootTab(page, state)
  await createManualTable(page, 'Handover Table')

  const mirror = await openSecondTab(page, state)
  await expect(mirror.getByText(MIRROR_NOTICE)).toBeVisible({ timeout: 20_000 })

  // Made in the tab that is about to lose the document, so the handover has a save to
  // flush before it releases.
  await createManualTable(page, 'Last Minute Table')
  await mirror.bringToFront()

  // Editing moves here, so the notice goes away and the controls come back.
  await expect(mirror.getByText(MIRROR_NOTICE)).toHaveCount(0, { timeout: 20_000 })
  await expect(mirror.locator('aside').getByRole('button', { name: 'New Table' }))
    .toBeEnabled({ timeout: 20_000 })
  // The tab that gave up editing keeps the workspace as a live mirror.
  await expect(page.getByText(MIRROR_NOTICE)).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.react-flow')).toBeVisible()

  // Whatever the first tab had is still there, so the handover flushed first.
  await expect(sidebarTable(mirror, 'Handover Table')).toBeAttached()
  await expect(sidebarTable(mirror, 'Last Minute Table')).toBeAttached({ timeout: 20_000 })

  // Reloading reads the document back from storage rather than the mirror channel, so
  // the pre-handover edit has to have been written, not just broadcast.
  await mirror.reload()
  await expect(mirror.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
  await expect(sidebarTable(mirror, 'Last Minute Table')).toBeAttached({ timeout: 20_000 })
  await expect(mirror.locator('aside').getByRole('button', { name: 'New Table' }))
    .toBeEnabled({ timeout: 20_000 })

  await createManualTable(mirror, 'Second Tab Table')
  await expect(sidebarTable(page, 'Second Tab Table')).toBeAttached({ timeout: 20_000 })

  await mirror.close()
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
  await second.getByRole('menuitem', { name: 'New project' }).click()
  const dialog = second.getByRole('dialog')
  await dialog.getByLabel('Project name').fill('Second Project')
  await dialog.getByRole('button', { name: 'Create project' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })

  // Different documents, so neither tab waits on the other.
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
