import { Router, Response } from 'express';
import { User } from '../models/User.js';
import { AuthenticatedRequest, ApiResponse, LoginResponse, RegisterResponse } from '../types/index.js';
import {
  hashPassword,
  comparePassword,
  validatePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromCookie,
  getRefreshTokenExpiryDate,
} from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.js';
import {
  asyncHandler,
  ValidationError,
  AuthenticationError,
  ConflictError,
} from '../middleware/errorHandler.js';

const router = Router();

// ============================================================================
// POST /api/auth/register
// ============================================================================

router.post(
  '/register',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, password, name } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      throw new ValidationError(['Email, password, and name are required']);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError(['Invalid email format']);
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw new ValidationError(passwordValidation.errors);
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const user = new User({
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name.trim(),
    });

    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user._id.toString(), user.email);
    const refreshToken = generateRefreshToken(user._id.toString(), user.email);

    // Store refresh token
    user.refreshTokens.push({
      token: refreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    });
    await user.save();

    // Set cookies
    setAuthCookies(res, accessToken, refreshToken);

    const response: ApiResponse<RegisterResponse> = {
      success: true,
      data: {
        user: user.toPublic(),
        message: 'Registration successful',
      },
    };

    res.status(201).json(response);
  })
);

// ============================================================================
// POST /api/auth/login
// ============================================================================

router.post(
  '/login',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      throw new ValidationError(['Email and password are required']);
    }

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id.toString(), user.email);
    const refreshToken = generateRefreshToken(user._id.toString(), user.email);

    // Store refresh token
    user.refreshTokens.push({
      token: refreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    });
    await user.save();

    // Set cookies
    setAuthCookies(res, accessToken, refreshToken);

    const response: ApiResponse<LoginResponse> = {
      success: true,
      data: {
        user: user.toPublic(),
        message: 'Login successful',
      },
    };

    res.json(response);
  })
);

// ============================================================================
// POST /api/auth/logout
// ============================================================================

router.post(
  '/logout',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Get refresh token to remove from database
    const refreshToken = getRefreshTokenFromCookie(req.cookies || {});

    if (refreshToken) {
      // Remove the refresh token from the user's tokens
      await User.updateOne(
        { 'refreshTokens.token': refreshToken },
        { $pull: { refreshTokens: { token: refreshToken } } }
      );
    }

    // Clear cookies
    clearAuthCookies(res);

    const response: ApiResponse = {
      success: true,
      message: 'Logged out successfully',
    };

    res.json(response);
  })
);

// ============================================================================
// GET /api/auth/me
// ============================================================================

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = await User.findById(req.user!.userId);
    
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    const response: ApiResponse = {
      success: true,
      data: {
        user: user.toPublic(),
      },
    };

    res.json(response);
  })
);

// ============================================================================
// POST /api/auth/refresh
// ============================================================================

router.post(
  '/refresh',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const refreshToken = getRefreshTokenFromCookie(req.cookies || {});

    if (!refreshToken) {
      throw new AuthenticationError('No refresh token provided');
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      clearAuthCookies(res);
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    // Find user and verify token exists in database
    const user = await User.findById(payload.userId);
    if (!user) {
      clearAuthCookies(res);
      throw new AuthenticationError('User not found');
    }

    const tokenExists = user.refreshTokens.some(
      (t) => t.token === refreshToken && t.expiresAt > new Date()
    );

    if (!tokenExists) {
      clearAuthCookies(res);
      throw new AuthenticationError('Refresh token not found or expired');
    }

    // Remove old refresh token
    user.refreshTokens = user.refreshTokens.filter(
      (t) => t.token !== refreshToken
    );

    // Generate new tokens
    const newAccessToken = generateAccessToken(user._id.toString(), user.email);
    const newRefreshToken = generateRefreshToken(user._id.toString(), user.email);

    // Store new refresh token
    user.refreshTokens.push({
      token: newRefreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    });
    await user.save();

    // Set new cookies
    setAuthCookies(res, newAccessToken, newRefreshToken);

    const response: ApiResponse = {
      success: true,
      data: {
        user: user.toPublic(),
      },
      message: 'Token refreshed successfully',
    };

    res.json(response);
  })
);

export default router;
