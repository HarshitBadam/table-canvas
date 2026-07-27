import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import { MongoRateLimitStore } from '../services/rateLimitStore.js';
import type { AuthenticatedRequest } from '../types/index.js';

interface ApiRateLimitOptions {
  prefix: string
  windowMs: number
  limit: number
  message: string
}

/**
 * Builds a limiter for authenticated API routes. Mount it after `requireAuth`
 * so the quota follows the account rather than the IP: shared offices, mobile
 * carriers, and proxies collapse many honest users onto one address, while a
 * single abusive account can rotate addresses freely. The IP fallback only
 * applies if the limiter is ever mounted ahead of authentication.
 */
export function createApiRateLimit(
  options: ApiRateLimitOptions,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: new MongoRateLimitStore(options.prefix),
    keyGenerator: (req: Request, _res: Response) => {
      const userId = (req as AuthenticatedRequest).user?.userId;
      return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
    },
    message: { success: false, error: options.message },
  });
}
