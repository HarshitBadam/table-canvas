import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import {
  verifyAccessToken,
  getAccessTokenFromCookie,
} from '../services/auth.service.js';
import { AuthenticationError } from './errorHandler.js';


export function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    let token = getAccessTokenFromCookie(req.cookies || {});

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      throw new AuthenticationError('Invalid or expired token');
    }

    req.user = {
      userId: payload.userId,
      email: payload.email,
    };

    next();
  } catch (error) {
    next(error);
  }
}
