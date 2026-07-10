import { Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

export const testHelpers = {
  async waitForAppReady(page: Page) {
    await page.waitForSelector('.react-flow', { timeout: 15000 })
    await page.waitForTimeout(1000)
  },

  async mockAuthentication(page: Page) {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('table-canvas-auth', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com', name: 'Test User' },
        token: 'mock-token',
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }))
      localStorage.setItem('table-canvas-test-mode', 'true')
    })
    await page.reload()
  },

  async importCSVFile(page: Page, fileName: string, content: string) {
    const tempDir = path.join(__dirname, '..', 'temp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    const filePath = path.join(tempDir, fileName)
    fs.writeFileSync(filePath, content)
    const fileInput = page.locator('input[type="file"][accept*=".csv"]')
    await fileInput.setInputFiles(filePath)
    await page.waitForSelector('.react-flow__node', { timeout: 10000 })
    fs.unlinkSync(filePath)
    await page.waitForTimeout(500)
  },
}

export function getTableNodes(page: Page) {
  return page.locator('.react-flow__node')
}
