import {
  captureException,
  dedupeIntegration,
  functionToStringIntegration,
  inboundFiltersIntegration,
  init,
  linkedErrorsIntegration,
} from '@sentry/browser'

/**
 * Loaded on demand by `frontendTelemetry` so that a build without a DSN ships no
 * SDK at all. The named imports above are what let the bundler drop the tracing,
 * replay, and feedback code paths; importing the module namespace instead pulls
 * in the entire package.
 */
export function startErrorReporting(dsn: string): typeof captureException {
  init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    // Named one by one rather than filtered from the defaults, because the
    // defaults would install window hooks that `frontendTelemetry` already owns,
    // and breadcrumbs would collect console output and request URLs that the
    // privacy contract keeps out of a report.
    defaultIntegrations: false,
    integrations: [
      inboundFiltersIntegration(),
      functionToStringIntegration(),
      linkedErrorsIntegration(),
      dedupeIntegration(),
    ],
  })
  return captureException
}
