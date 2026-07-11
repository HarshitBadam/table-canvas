import { expect, test } from './e2e.fixture'
import { bootApp, expectNoViewportOverflow } from './app.support'

test.describe('Layout and theme behavior', () => {
  test('theme changes the rendered palette and persists across reload', async ({ page }) => {
    await bootApp(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.locator('aside').getByRole('button', { name: /switch to dark mode/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const darkCanvas = await page.locator('body').evaluate(
      element => getComputedStyle(element).backgroundColor,
    )

    await page.reload()
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await page.locator('body').evaluate(
      element => getComputedStyle(element).backgroundColor,
    )).toBe(darkCanvas)
  })

  test('sidebar, header, and canvas occupy non-overlapping desktop regions', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await bootApp(page)
    await expectNoViewportOverflow(page)

    const sidebar = await page.locator('aside').boundingBox()
    const main = await page.locator('main').boundingBox()
    const header = await page.locator('header').boundingBox()
    const canvas = await page.locator('.react-flow').boundingBox()
    expect(sidebar).not.toBeNull()
    expect(main).not.toBeNull()
    expect(header).not.toBeNull()
    expect(canvas).not.toBeNull()
    expect(main!.x).toBeGreaterThanOrEqual(sidebar!.x + sidebar!.width - 1)
    expect(header!.x).toBeGreaterThanOrEqual(main!.x)
    expect(canvas!.x).toBeGreaterThanOrEqual(main!.x)
    expect(main!.x + main!.width).toBeLessThanOrEqual(1366)
  })

  test('keyboard focus is visibly indicated on primary actions', async ({ page }) => {
    await bootApp(page)
    const button = page.locator('aside').getByRole('button', { name: 'New Table' })
    await button.focus()
    await expect(button).toBeFocused()

    const focusStyle = await button.evaluate(element => {
      const style = getComputedStyle(element)
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        outlineColor: style.outlineColor,
      }
    })
    expect(focusStyle.outlineStyle).not.toBe('none')
    expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2)
    expect(focusStyle.outlineColor).not.toBe('rgba(0, 0, 0, 0)')
  })
})
