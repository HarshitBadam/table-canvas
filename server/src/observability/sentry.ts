import * as Sentry from '@sentry/node';
import type { Request } from 'express';
import { config } from '../config/env.js';
import type { AuthenticatedRequest } from '../types/index.js';

const FLUSH_TIMEOUT_MS = 2_000;

export function initializeServerTelemetry(): void {
  if (!config.sentryDsn) return;

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    // Request bodies, headers, cookies, and IP addresses stay out of Sentry.
    // Every event is built explicitly in captureServerError below.
    sendDefaultPii: false,
  });
}

/**
 * Reports a request failure that the API did not anticipate. Expected client
 * errors (validation, auth, conflicts, quota) are answered with a 4xx and never
 * reach this function, so anything recorded here is a real defect.
 */
export function captureServerError(error: Error, req: Request, statusCode: number): void {
  if (!config.sentryDsn) return;

  // The matched route pattern rather than the concrete path, so that ids do not
  // fragment one recurring failure into thousands of distinct issues.
  const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;

  Sentry.captureException(error, {
    tags: { method: req.method, route, statusCode: String(statusCode) },
    user: { id: (req as AuthenticatedRequest).user?.userId },
  });
}

export async function closeServerTelemetry(): Promise<void> {
  if (!config.sentryDsn) return;
  await Sentry.close(FLUSH_TIMEOUT_MS);
}
