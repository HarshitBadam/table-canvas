import { Router, Response } from 'express';
import { User, IUserDocument } from '../models/User.js';
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
  hashRefreshToken,
  persistRefreshSession,
} from '../services/auth.service.js';
import { verifyGoogleToken } from '../services/google.service.js';
import { requireAuth } from '../middleware/auth.js';
import {
  asyncHandler,
  ValidationError,
  AuthenticationError,
  ConflictError,
  AppError,
} from '../middleware/errorHandler.js';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env.js';
import { MongoRateLimitStore } from '../services/rateLimitStore.js';

const router = Router();
const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: new MongoRateLimitStore('auth-sign-in'),
  message: { success: false, error: 'Too many authentication attempts' },
});
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: new MongoRateLimitStore('auth-refresh'),
  message: { success: false, error: 'Too many refresh attempts' },
});

router.post(
  '/register',
  signInLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!config.registrationEnabled) {
      throw new AppError('Public registration is disabled', 403);
    }
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

    const sessionUser = await persistRefreshSession(user._id.toString(), refreshToken);

    setAuthCookies(res, accessToken, refreshToken);

    const response: ApiResponse<RegisterResponse> = {
      success: true,
      data: {
        user: sessionUser.toPublic(),
        message: 'Registration successful',
      },
    };

    res.status(201).json(response);
  })
);

router.post(
  '/login',
  signInLimiter,
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

    const sessionUser = await persistRefreshSession(user._id.toString(), refreshToken);

    setAuthCookies(res, accessToken, refreshToken);

    const response: ApiResponse<LoginResponse> = {
      success: true,
      data: {
        user: sessionUser.toPublic(),
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
        { 'refreshTokens.tokenHash': hashRefreshToken(refreshToken) },
        { $pull: { refreshTokens: { tokenHash: hashRefreshToken(refreshToken) } } }
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
  refreshLimiter,
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

    const newAccessToken = generateAccessToken(payload.userId, payload.email);
    const newRefreshToken = generateRefreshToken(payload.userId, payload.email);
    const user = await User.findOneAndUpdate(
      {
        _id: payload.userId,
        refreshTokens: {
          $elemMatch: {
            tokenHash: hashRefreshToken(refreshToken),
            expiresAt: { $gt: new Date() },
          },
        },
      },
      {
        $set: {
          'refreshTokens.$': {
            tokenHash: hashRefreshToken(newRefreshToken),
            expiresAt: getRefreshTokenExpiryDate(),
          },
        },
      },
      { new: true },
    );
    if (!user) {
      clearAuthCookies(res);
      throw new AuthenticationError('Refresh token not found or expired');
    }

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
  signInLimiter,
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

    // Google identities are only linked at account creation. Existing password
    // accounts require a future explicit, authenticated account-linking flow.
    let user: IUserDocument | null = await User.findOne({ googleId: googleInfo.googleId });

    if (!user) {
      const passwordAccount = await User.findByEmail(googleInfo.email);
      if (passwordAccount) {
        throw new ConflictError(
          'An account already uses this email. Sign in with its password before linking Google.',
        );
      }
      user = await User.create({
        email: googleInfo.email.toLowerCase().trim(),
        name: googleInfo.name,
        googleId: googleInfo.googleId,
        avatarUrl: googleInfo.avatarUrl,
        tier: 'google',
      });
    } else {
      if (googleInfo.avatarUrl) {
        user = await User.findByIdAndUpdate(
          user._id,
          { $set: { avatarUrl: googleInfo.avatarUrl } },
          { new: true },
        );
        if (!user) throw new AuthenticationError('Google account no longer exists');
      }
    }

    const accessToken = generateAccessToken(user._id.toString(), user.email);
    const refreshToken = generateRefreshToken(user._id.toString(), user.email);

    const sessionUser = await persistRefreshSession(user._id.toString(), refreshToken);

    setAuthCookies(res, accessToken, refreshToken);

    const response: ApiResponse<LoginResponse> = {
      success: true,
      data: {
        user: sessionUser.toPublic(),
        message: 'Google login successful',
      },
    };

    res.json(response);
  })
);

export default router;
