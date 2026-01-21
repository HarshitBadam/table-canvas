import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUser, IRefreshToken } from '../types/index.js';

// ============================================================================
// Refresh Token Sub-Schema
// ============================================================================

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    token: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

// ============================================================================
// User Schema
// ============================================================================

export interface IUserDocument extends Omit<IUser, '_id'>, Document {
  // Instance methods can be added here
  toPublic(): {
    id: string;
    email: string;
    name: string;
    createdAt: Date;
  };
}

interface IUserModel extends Model<IUserDocument> {
  // Static methods can be added here
  findByEmail(email: string): Promise<IUserDocument | null>;
}

const UserSchema = new Schema<IUserDocument, IUserModel>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v: string) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'Invalid email format',
      },
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [1, 'Name cannot be empty'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    refreshTokens: {
      type: [RefreshTokenSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

// ============================================================================
// Indexes
// ============================================================================

// Note: email index is already created by `unique: true` in schema definition
UserSchema.index({ 'refreshTokens.token': 1 });

// ============================================================================
// Instance Methods
// ============================================================================

UserSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    email: this.email,
    name: this.name,
    createdAt: this.createdAt,
  };
};

// ============================================================================
// Static Methods
// ============================================================================

UserSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

// ============================================================================
// Pre-save Hooks
// ============================================================================

UserSchema.pre('save', function (next) {
  // Clean up expired refresh tokens before saving
  if (this.refreshTokens && this.refreshTokens.length > 0) {
    const now = new Date();
    this.refreshTokens = this.refreshTokens.filter(
      (token) => token.expiresAt > now
    );
    
    // Limit to 5 active refresh tokens (5 devices)
    if (this.refreshTokens.length > 5) {
      this.refreshTokens = this.refreshTokens.slice(-5);
    }
  }
  next();
});

// ============================================================================
// Export Model
// ============================================================================

export const User = mongoose.model<IUserDocument, IUserModel>('User', UserSchema);
