import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { config, validateConfig } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import fileRoutes from './routes/files.js';
import { reconcileStorageUsage } from './services/storageQuota.service.js';
import { revokeLegacyRefreshSessions } from './services/auth.service.js';
import { initializeFileIndexes } from './services/file.service.js';
import { initializeRateLimitIndexes } from './services/rateLimitStore.js';
import { createCsrfProtection } from './middleware/csrfProtection.js';

validateConfig();

const app = express();
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration for cookie-based auth
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.frontendOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
}));

app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use(cookieParser());
app.use('/api', createCsrfProtection(config.frontendOrigins));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not-ready',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/files', fileRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
  });
});

app.use(errorHandler);

let httpServer: ReturnType<typeof app.listen> | null = null;
let shuttingDown = false;

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    await revokeLegacyRefreshSessions();
    await initializeFileIndexes();
    await initializeRateLimitIndexes();
    await reconcileStorageUsage();

    httpServer = app.listen(config.port, () => {
      console.log(`[Server] Running on port ${config.port}`);
      console.log(`[Server] Environment: ${config.nodeEnv}`);
      console.log(`[Server] Frontend URL: ${config.frontendUrl}`);
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Server] ${signal} received, shutting down gracefully`);
  const forceExit = setTimeout(() => {
    console.error('[Server] Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer!.close(error => error ? reject(error) : resolve());
      });
    }
    await mongoose.disconnect();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    console.error('[Server] Graceful shutdown failed:', error);
    clearTimeout(forceExit);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

startServer();
