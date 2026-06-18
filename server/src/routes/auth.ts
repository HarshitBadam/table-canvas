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
import { verifyGoogleToken } from '../services/google.service.js';
import { requireAuth } from '../middleware/auth.js';
import {
  asyncHandler,
  ValidationError,
  AuthenticationError,
  ConflictError,
} from '../middleware/errorHandler.js';

const router = Router();

router.post(
  '/register',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      throw new ValidationError(['Email, password, and name are required']);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError(['Invalid email format']);
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw new ValidationError(passwordValidation.errors);
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await hashPassword(password);
    const user = new User({
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name.trim(),
    });

    await user.save();

    const accessToken = generateAccessToken(user._id.toString(), user.email);
    const refreshToken = generateRefreshToken(user._id.toString(), user.email);

    user.refreshTokens.push({
      token: refreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    });
    await user.save();

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

router.post(
  '/login',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError(['Email and password are required']);
    }

    const user = await User.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw new AuthenticationError('Invalid email or password');
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid email or password');
    }

    const accessToken = generateAccessToken(user._id.toString(), user.email);
    const refreshToken = generateRefreshToken(user._id.toString(), user.email);

    user.refreshTokens.push({
      token: refreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    });
    await user.save();

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

router.post(
  '/logout',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const refreshToken = getRefreshTokenFromCookie(req.cookies || {});

    if (refreshToken) {
      await User.updateOne(
        { 'refreshTokens.token': refreshToken },
        { $pull: { refreshTokens: { token: refreshToken } } }
      );
    }

    clearAuthCookies(res);

    const response: ApiResponse = {
      success: true,
      message: 'Logged out successfully',
    };

    res.json(response);
  })
);

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

router.post(
  '/refresh',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const refreshToken = getRefreshTokenFromCookie(req.cookies || {});

    if (!refreshToken) {
      throw new AuthenticationError('No refresh token provided');
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      clearAuthCookies(res);
      throw new AuthenticationError('Invalid or expired refresh token');
    }

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

    user.refreshTokens = user.refreshTokens.filter(
      (t) => t.token !== refreshToken
    );

    const newAccessToken = generateAccessToken(user._id.toString(), user.email);
    const newRefreshToken = generateRefreshToken(user._id.toString(), user.email);

    user.refreshTokens.push({
      token: newRefreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    });
    await user.save();

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

router.post(
  '/google',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { credential } = req.body;

    if (!credential) {
      throw new ValidationError(['Google credential token is required']);
    }

    let googleInfo;
    try {
      googleInfo = await verifyGoogleToken(credential);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google token verification failed';
      throw new AuthenticationError(message);
    }

    // 1. Try to find by googleId
    let user = await User.findOne({ googleId: googleInfo.googleId });

    if (!user) {
      // 2. Try to find by email and link the Google account
      user = await User.findByEmail(googleInfo.email);
      if (user) {
        user.googleId = googleInfo.googleId;
        if (!user.avatarUrl && googleInfo.avatarUrl) {
          user.avatarUrl = googleInfo.avatarUrl;
        }
        if (!user.tier) {
          user.tier = 'google';
        }
      } else {
        // 3. Create a brand-new Google user
        user = new User({
          email: googleInfo.email.toLowerCase().trim(),
          name: googleInfo.name,
          googleId: googleInfo.googleId,
          avatarUrl: googleInfo.avatarUrl,
          tier: 'google',
        });
      }
    } else {
      if (googleInfo.avatarUrl) {
        user.avatarUrl = googleInfo.avatarUrl;
      }
    }

    const accessToken = generateAccessToken(user._id.toString(), user.email);
    const refreshToken = generateRefreshToken(user._id.toString(), user.email);

    user.refreshTokens.push({
      token: refreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    });
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    const response: ApiResponse<LoginResponse> = {
      success: true,
      data: {
        user: user.toPublic(),
        message: 'Google login successful',
      },
    };

    res.json(response);
  })
);

export default router;
