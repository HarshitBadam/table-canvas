import { Request } from 'express';
import { Types } from 'mongoose';


/**
 * Base interface for soft-deletable entities
 */
interface SoftDeletable {
  deletedAt: Date | null;
}

/**
 * Base interface for timestamped entities
 */
interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}


export interface IRefreshToken {
  tokenHash: string;
  expiresAt: Date;
}

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  passwordHash?: string;
  name: string;
  googleId?: string;
  avatarUrl?: string;
  tier: 'guest' | 'google';
  refreshTokens: IRefreshToken[];
  storageUsedBytes: number;
  createdAt: Date;
  updatedAt: Date;
}

interface IUserPublic {
  id: string;
  email: string;
  name: string;
  tier: 'guest' | 'google';
  avatarUrl?: string;
  createdAt: Date;
}


type NodeKind = 'source_table' | 'derived_table' | 'chart';

interface Position {
  x: number;
  y: number;
}

interface NodeUI {
  position: Position;
  viewMode?: 'collapsed' | 'data';
}

export interface ProjectNode {
  id: string;
  kind: NodeKind;
  name: string;
  ui: NodeUI;
  schema?: unknown;
  plan: unknown;
  cacheInfo?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface Edge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  transformType: string;
}

export interface SerializedPatches {
  cellPatches: Record<string, Record<string, unknown>>;
  deletedRows: string[];
  insertedRows: Array<{ rowId: string; values: Record<string, unknown>; insertedAt: number }>;
}

export interface IProject extends SoftDeletable, Timestamped {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  nodes: Record<string, ProjectNode>;
  edges: Record<string, Edge>;
  patches: Record<string, SerializedPatches>;
  reports: Record<string, unknown>;
  revision: number;
}

export interface IProjectPublic {
  id: string;
  name: string;
  nodes: Record<string, ProjectNode>;
  edges: Record<string, Edge>;
  patches: Record<string, SerializedPatches>;
  reports: Record<string, unknown>;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileMetadata {
  originalName: string;
  projectId?: string;
  userId: string;
}

export interface UploadedFile {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  uploadDate: Date;
}


export interface JwtPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}


export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoginResponse {
  user: IUserPublic;
  message: string;
}

export interface RegisterResponse {
  user: IUserPublic;
  message: string;
}
