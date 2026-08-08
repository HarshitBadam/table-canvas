import mongoose, { Schema, Document, Model } from 'mongoose';
import {
  DISCOVERY_TOUR_IDS,
  DISCOVERY_TOUR_VERSION,
  type DiscoveryTourId,
  type DiscoveryTourState,
  type IUser,
  type IRefreshToken,
} from '../types/index.js';

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    tokenHash: {
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

const DiscoveryTourSchema = new Schema<DiscoveryTourState>(
  {
    version: {
      type: Number,
      required: true,
      default: DISCOVERY_TOUR_VERSION,
    },
    completedTours: {
      type: [{
        type: String,
        enum: DISCOVERY_TOUR_IDS,
      }],
      default: [],
    },
  },
  { _id: false },
);

export interface IUserDocument extends Omit<IUser, '_id'>, Document {
  toPublic(): {
    id: string;
    email: string;
    name: string;
    tier: 'guest' | 'google';
    avatarUrl?: string;
    discoveryTours: DiscoveryTourState;
    createdAt: Date;
  };
}

interface IUserModel extends Model<IUserDocument> {
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
      required: [
        function (this: IUserDocument) {
          return !this.googleId;
        },
        'Password is required for non-Google accounts',
      ],
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [1, 'Name cannot be empty'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    avatarUrl: {
      type: String,
    },
    tier: {
      type: String,
      enum: ['guest', 'google'],
      default: 'google',
    },
    refreshTokens: {
      type: [RefreshTokenSchema],
      default: [],
    },
    storageUsedBytes: {
      type: Number,
      min: 0,
      default: 0,
    },
    discoveryTours: {
      type: DiscoveryTourSchema,
      default: () => ({
        version: DISCOVERY_TOUR_VERSION,
        completedTours: [],
      }),
    },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

// Note: email index is already created by `unique: true` in schema definition
// googleId index is created by `unique: true` + `sparse: true` in schema definition
UserSchema.index({ 'refreshTokens.tokenHash': 1 });

UserSchema.methods.toPublic = function () {
  const completedTours = this.discoveryTours?.version === DISCOVERY_TOUR_VERSION
    ? this.discoveryTours.completedTours.filter(
      (tourId: DiscoveryTourId) => DISCOVERY_TOUR_IDS.includes(tourId),
    )
    : [];
  const pub: ReturnType<IUserDocument['toPublic']> = {
    id: this._id.toString(),
    email: this.email,
    name: this.name,
    tier: this.tier || 'google',
    discoveryTours: {
      version: DISCOVERY_TOUR_VERSION,
      completedTours,
    },
    createdAt: this.createdAt,
  };
  if (this.avatarUrl) {
    pub.avatarUrl = this.avatarUrl;
  }
  return pub;
};

UserSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

UserSchema.pre('save', function (next) {
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

export const User = mongoose.model<IUserDocument, IUserModel>('User', UserSchema);
