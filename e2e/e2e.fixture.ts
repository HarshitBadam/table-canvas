import { expect, test as base } from '@playwright/test'

function shouldIgnoreFailedRequest(errorText: string): boolean {
  return errorText.includes('ERR_ABORTED')
    || errorText.includes('NS_BINDING_ABORTED')
}

export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
    })
    page.on('requestfailed', request => {
      const errorText = request.failure()?.errorText ?? 'unknown network error'
      if (!shouldIgnoreFailedRequest(errorText)) {
        errors.push(`request failed: ${request.method()} ${request.url()} (${errorText})`)
      }
    })
    page.on('response', response => {
      if (response.status() >= 500) {
        errors.push(`server error: ${response.status()} ${response.request().method()} ${response.url()}`)
      }
    })

    await use(errors)

    expect(errors, 'The browser session must finish without runtime or server errors').toEqual([])
  }, { auto: true }],
})

export { expect }
