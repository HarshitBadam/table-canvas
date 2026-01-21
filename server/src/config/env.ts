import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  // MongoDB
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/table-canvas',
  
  // JWT
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'default-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-me',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  
  // Cookie settings
  cookieSecure: process.env.NODE_ENV === 'production',
  cookieSameSite: (process.env.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax' | 'none',
} as const;

// Validate required config
export function validateConfig(): void {
  const required = ['mongodbUri', 'jwtAccessSecret', 'jwtRefreshSecret'] as const;
  
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required environment variable for: ${key}`);
    }
  }
  
  if (config.nodeEnv === 'production') {
    if (config.jwtAccessSecret.includes('default') || config.jwtRefreshSecret.includes('default')) {
      throw new Error('Default JWT secrets must not be used in production');
    }
  }
}
