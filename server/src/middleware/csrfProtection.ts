import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createCsrfProtection(allowedOrigins: readonly string[]) {
  const trusted = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.get('origin');
    const fetchSite = req.get('sec-fetch-site');
    if (
      (origin && !trusted.has(origin))
      || (!origin && fetchSite === 'cross-site')
    ) {
      res.status(403).json({
        success: false,
        error: 'Request origin is not allowed',
      });
      return;
    }

    next();
  };
}
