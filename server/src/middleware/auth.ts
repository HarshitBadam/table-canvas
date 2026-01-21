import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import {
  verifyAccessToken,
  getAccessTokenFromCookie,
} from '../services/auth.service.js';
import { AuthenticationError } from './errorHandler.js';

// ============================================================================
// Authentication Middleware
// ============================================================================

export function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    // Get token from cookie or Authorization header
    let token = getAccessTokenFromCookie(req.cookies || {});

    // Fallback to Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }

    // Verify the token
    const payload = verifyAccessToken(token);
    if (!payload) {
      throw new AuthenticationError('Invalid or expired token');
    }

    // Attach user info to request
    req.user = {
      userId: payload.userId,
      email: payload.email,
    };

    next();
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// Optional Auth Middleware (for routes that work with or without auth)
// ============================================================================

export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    // Get token from cookie or Authorization header
    let token = getAccessTokenFromCookie(req.cookies || {});

    // Fallback to Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (token) {
      const payload = verifyAccessToken(token);
      if (payload) {
        req.user = {
          userId: payload.userId,
          email: payload.email,
        };
      }
    }

    next();
  } catch {
    // Ignore errors for optional auth
    next();
  }
}
