import express, { Express, Request, Response, NextFunction } from 'express';
import fileRoutes from '../../src/routes/files.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { generateAccessToken } from '../../src/services/auth.service.js';
import type { MockUser } from './testApp.js';

/**
 * Creates a test Express app that mounts the real `files` router (and its
 * real GridFS-backed service layer) behind a valid JWT, so tests exercise
 * production code paths rather than a hand-rolled stand-in.
 */
export function createFilesTestApp(mockUser?: MockUser): Express {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (mockUser && !req.headers.authorization) {
      const token = generateAccessToken(mockUser.userId, mockUser.email);
      req.headers.authorization = `Bearer ${token}`;
    }
    next();
  });

  app.use('/api/files', fileRoutes);
  app.use(errorHandler);

  return app;
}
