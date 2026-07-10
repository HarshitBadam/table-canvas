import express, { Express, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import projectRoutes from '../routes/projects.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { generateAccessToken } from '../services/auth.service.js';

export interface MockUser {
  userId: string;
  email: string;
}

/**
 * Creates a test Express app with a real JWT token injected into each
 * request so that `requireAuth` middleware validates successfully.
 */
export function createTestApp(mockUser?: MockUser): Express {
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

  app.use('/api/projects', projectRoutes);
  app.use(errorHandler);

  return app;
}

export function createDefaultMockUser(): MockUser {
  const userId = new Types.ObjectId();
  return {
    userId: userId.toString(),
    email: `test-${userId.toString().slice(-6)}@example.com`,
  };
}
