import { Page } from '@playwright/test'

export function getTableNodes(page: Page) {
  return page.locator('.react-flow__node')
}
