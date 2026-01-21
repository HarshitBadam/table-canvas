/**
 * Test App Factory
 * 
 * Creates an Express app for testing with mocked authentication.
 * Bypasses actual auth to allow testing routes in isolation.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import projectRoutes from '../routes/projects.js';
import { errorHandler } from '../middleware/errorHandler.js';

/**
 * Mock user data for testing
 */
export interface MockUser {
  userId: string;
  email: string;
}

/**
 * Create a test Express app with mocked authentication
 * 
 * @param mockUser - The mock user to inject into requests
 * @returns Configured Express app
 */
export function createTestApp(mockUser?: MockUser): Express {
  const app = express();

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mock authentication middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (mockUser) {
      (req as any).user = mockUser;
    }
    next();
  });

  // Routes
  app.use('/api/projects', projectRoutes);

  // Error handler
  app.use(errorHandler);

  return app;
}

/**
 * Create a default mock user for testing
 */
export function createDefaultMockUser(): MockUser {
  const userId = new Types.ObjectId();
  return {
    userId: userId.toString(),
    email: `test-${userId.toString().slice(-6)}@example.com`,
  };
}

/**
 * Create a second mock user for multi-user testing
 */
export function createSecondMockUser(): MockUser {
  const userId = new Types.ObjectId();
  return {
    userId: userId.toString(),
    email: `other-${userId.toString().slice(-6)}@example.com`,
  };
}
