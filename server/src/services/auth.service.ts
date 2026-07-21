import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { config } from '../config/env.js';
import { JwtPayload } from '../types/index.js';
import { createHash, randomUUID } from 'crypto';

const SALT_ROUNDS = 12;

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 15 * 60 * 1000; // Default 15 minutes
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function generateAccessToken(userId: string, email: string): string {
  const payload: JwtPayload = {
    userId,
    email,
    type: 'access',
  };

  const expiresInMs = parseDuration(config.jwtAccessExpiresIn);
  const expiresInSeconds = Math.floor(expiresInMs / 1000);

  return jwt.sign(payload, config.jwtAccessSecret, {
    expiresIn: expiresInSeconds,
  });
}

export function generateRefreshToken(userId: string, email: string): string {
  const payload: JwtPayload = {
    userId,
    email,
    type: 'refresh',
  };

  const expiresInMs = parseDuration(config.jwtRefreshExpiresIn);
  const expiresInSeconds = Math.floor(expiresInMs / 1000);

  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: expiresInSeconds,
    jwtid: randomUUID(),
  });
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret) as JwtPayload;
    if (payload.type !== 'access') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, config.jwtRefreshSecret) as JwtPayload;
    if (payload.type !== 'refresh') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string
): void {
  const accessMaxAge = parseDuration(config.jwtAccessExpiresIn);
  const refreshMaxAge = parseDuration(config.jwtRefreshExpiresIn);

  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    maxAge: accessMaxAge,
    path: '/',
  });

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    maxAge: refreshMaxAge,
    path: '/api/auth', // Only send to auth routes
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
  });

  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/api/auth',
  });
}

export function getAccessTokenFromCookie(cookies: Record<string, string>): string | undefined {
  return cookies[ACCESS_TOKEN_COOKIE];
}

export function getRefreshTokenFromCookie(cookies: Record<string, string>): string | undefined {
  return cookies[REFRESH_TOKEN_COOKIE];
}

export function getRefreshTokenExpiryDate(): Date {
  const expiresIn = parseDuration(config.jwtRefreshExpiresIn);
  return new Date(Date.now() + expiresIn);
}
