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

export const config = {
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/table-canvas',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'default-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-me',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  cookieSecure: process.env.NODE_ENV === 'production',
  cookieSameSite: (process.env.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax' | 'none',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
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
    if (!config.googleClientId) {
      throw new Error('GOOGLE_CLIENT_ID is required in production');
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
