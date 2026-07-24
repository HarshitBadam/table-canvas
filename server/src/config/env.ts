import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const INSECURE_DEFAULTS = [
  'default-access-secret-change-me',
  'default-refresh-secret-change-me',
  'docker-dev-access-secret-not-for-production',
  'docker-dev-refresh-secret-not-for-production',
];

const nodeEnv = process.env.NODE_ENV || 'development';
const frontendOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const trustProxyValue = process.env.TRUST_PROXY?.trim();
const trustProxy = trustProxyValue === 'false'
  ? false
  : trustProxyValue && /^\d+$/.test(trustProxyValue)
    ? Number(trustProxyValue)
    : trustProxyValue || false;
const cookieSameSite = (
  process.env.COOKIE_SAME_SITE
  || (nodeEnv === 'production' ? 'strict' : 'lax')
) as 'strict' | 'lax' | 'none';

export const config = {
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/table-canvas',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'default-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-me',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv,
  frontendUrl: frontendOrigins[0],
  frontendOrigins,
  trustProxy,
  cookieSecure: nodeEnv === 'production',
  cookieSameSite,
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  registrationEnabled:
    process.env.ENABLE_REGISTRATION === 'true'
    || (process.env.ENABLE_REGISTRATION !== 'false'
      && process.env.NODE_ENV !== 'production'),
} as const;

export function validateConfig(): void {
  const required = ['mongodbUri', 'jwtAccessSecret', 'jwtRefreshSecret'] as const;

  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required environment variable for: ${key}`);
    }
  }

  const isProduction = config.nodeEnv === 'production';

  if (isProduction) {
    if (config.frontendOrigins.length === 0) {
      throw new Error('FRONTEND_URL must contain at least one trusted HTTPS origin');
    }
    if (INSECURE_DEFAULTS.includes(config.jwtAccessSecret)) {
      throw new Error(
        'JWT_ACCESS_SECRET must be set to a secure, non-default value in production',
      );
    }
    if (INSECURE_DEFAULTS.includes(config.jwtRefreshSecret)) {
      throw new Error(
        'JWT_REFRESH_SECRET must be set to a secure, non-default value in production',
      );
    }
    if (
      config.jwtAccessSecret.length < 32
      || config.jwtRefreshSecret.length < 32
    ) {
      throw new Error('JWT secrets must each contain at least 32 characters in production');
    }
    if (config.jwtAccessSecret === config.jwtRefreshSecret) {
      throw new Error('JWT access and refresh secrets must be different');
    }
    if (/localhost|127\.0\.0\.1/.test(config.mongodbUri)) {
      throw new Error('MONGODB_URI must not target localhost in production');
    }
    for (const origin of config.frontendOrigins) {
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throw new Error(`FRONTEND_URL contains an invalid origin: ${origin}`);
      }
      if (url.protocol !== 'https:') {
        throw new Error(`FRONTEND_URL must use HTTPS in production: ${origin}`);
      }
      if (url.origin !== origin) {
        throw new Error(`FRONTEND_URL entries must be origins without paths: ${origin}`);
      }
    }
    if (!trustProxyValue) {
      throw new Error('TRUST_PROXY must be explicitly configured in production');
    }
    if (
      config.trustProxy === 'true'
      || config.trustProxy === '*'
      || config.trustProxy === '0.0.0.0/0'
    ) {
      throw new Error('TRUST_PROXY must contain only trusted proxy ranges');
    }
    if (!['strict', 'lax', 'none'].includes(config.cookieSameSite)) {
      throw new Error('COOKIE_SAME_SITE must be strict, lax, or none');
    }
  } else {
    if (INSECURE_DEFAULTS.includes(config.jwtAccessSecret)) {
      console.warn(
        '[Config] WARNING: Using insecure default JWT_ACCESS_SECRET — set a real secret before deploying',
      );
    }
    if (INSECURE_DEFAULTS.includes(config.jwtRefreshSecret)) {
      console.warn(
        '[Config] WARNING: Using insecure default JWT_REFRESH_SECRET — set a real secret before deploying',
      );
    }
  }
}
