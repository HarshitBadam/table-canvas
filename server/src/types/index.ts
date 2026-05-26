import { Request } from 'express';
import { Types } from 'mongoose';


/**
 * Base interface for soft-deletable entities
 */
export interface SoftDeletable {
  deletedAt: Date | null;
}

/**
 * Base interface for timestamped entities
 */
export interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}


export interface IRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  refreshTokens: IRefreshToken[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserPublic {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}


export type NodeKind = 'source_table' | 'derived_table' | 'chart' | 'dashboard';

export interface Position {
  x: number;
  y: number;
}

export interface NodeUI {
  position: Position;
  collapsed?: boolean;
  expanded?: boolean;
  viewMode?: 'collapsed' | 'stats' | 'data';
  width?: number;
  height?: number;
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
}

export interface IProjectPublic {
  id: string;
  name: string;
  nodes: Record<string, ProjectNode>;
  edges: Record<string, Edge>;
  patches: Record<string, SerializedPatches>;
  createdAt: Date;
  updatedAt: Date;
}


export interface IFile extends SoftDeletable, Timestamped {
  _id: Types.ObjectId;
  gridFsId: Types.ObjectId;
  userId: Types.ObjectId;
  projectId?: Types.ObjectId;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
}

export interface IFilePublic {
  id: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  projectId?: string;
  createdAt: Date;
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


export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
