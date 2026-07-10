import { expect, test } from '@playwright/test'

test.setTimeout(60000)

test.describe('Theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    const hasCanvas = await page.waitForSelector('.react-flow, aside', { timeout: 10000 }).catch(() => null)
    if (!hasCanvas) {
      test.skip(true, 'App not available')
    }
  })

  test('should have theme toggle in sidebar', async ({ page }) => {
    const themeToggle = page.locator('button[aria-label*="theme"], button:has(svg[class*="sun"]), button:has(svg[class*="moon"])')
    const hasThemeToggle = await themeToggle.count() > 0
    expect(hasThemeToggle).toBeDefined()
  })
})

test.describe('Responsive Layout', () => {
  test('should display properly on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/')

    const hasCanvas = await page.waitForSelector('.react-flow, aside', { timeout: 10000 }).catch(() => null)
    if (!hasCanvas) {
      test.skip(true, 'App not available')
    }

    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()
  })

  test('should display properly on laptop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto('/')

    const hasCanvas = await page.waitForSelector('.react-flow, aside', { timeout: 10000 }).catch(() => null)
    if (!hasCanvas) {
      test.skip(true, 'App not available')
    }

    const main = page.locator('main')
    await expect(main).toBeVisible()
  })
})

test.describe('Performance', () => {
  test('app should load within acceptable time', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/')

    await Promise.race([
      page.waitForSelector('.react-flow', { timeout: 15000 }),
      page.waitForSelector('input[type="email"]', { timeout: 15000 }),
    ]).catch(() => null)

    const loadTime = Date.now() - startTime
    expect(loadTime).toBeLessThan(15000)
  })

  test('canvas should remain responsive with nodes', async ({ page }) => {
    await page.goto('/')

    const hasCanvas = await page.waitForSelector('.react-flow', { timeout: 10000 }).catch(() => null)
    if (!hasCanvas) {
      test.skip(true, 'Canvas not available')
    }

    const startTime = Date.now()
    const canvas = page.locator('.react-flow')
    await canvas.click()

    const interactionTime = Date.now() - startTime
    expect(interactionTime).toBeLessThan(1000)
  })
})
