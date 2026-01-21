import mongoose, { Schema, Document, Model, Types } from 'mongoose';

// ============================================================================
// File Metadata Schema
// ============================================================================

/**
 * File metadata document interface.
 * This model tracks files stored in GridFS with additional metadata
 * and soft-delete support.
 */
export interface IFileDocument extends Document {
  _id: Types.ObjectId;
  gridFsId: Types.ObjectId;
  userId: Types.ObjectId;
  projectId?: Types.ObjectId;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  toPublic(): IFilePublic;
  softDelete(): Promise<IFileDocument>;
  restore(): Promise<IFileDocument>;
  isDeleted(): boolean;
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

interface IFileModel extends Model<IFileDocument> {
  findByUser(userId: string | Types.ObjectId): Promise<IFileDocument[]>;
  findByProject(projectId: string | Types.ObjectId): Promise<IFileDocument[]>;
  findByIdAndUser(fileId: string, userId: string): Promise<IFileDocument | null>;
  findWithDeleted(filter?: mongoose.FilterQuery<IFileDocument>): Promise<IFileDocument[]>;
}

const FileSchema = new Schema<IFileDocument, IFileModel>(
  {
    gridFsId: {
      type: Schema.Types.ObjectId,
      required: [true, 'GridFS ID is required'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
      sparse: true,  // Allow null values
    },
    filename: {
      type: String,
      required: [true, 'Filename is required'],
      trim: true,
    },
    originalName: {
      type: String,
      required: [true, 'Original filename is required'],
      trim: true,
    },
    contentType: {
      type: String,
      required: [true, 'Content type is required'],
      default: 'application/octet-stream',
    },
    size: {
      type: Number,
      required: [true, 'File size is required'],
      min: [0, 'File size cannot be negative'],
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'file_metadata',
  }
);

// ============================================================================
// Indexes
// ============================================================================

// Primary query pattern: user's active files
FileSchema.index({ userId: 1, deletedAt: 1, createdAt: -1 });

// Files by project
FileSchema.index({ projectId: 1, deletedAt: 1 });

// Cleanup jobs: find orphaned or old deleted files
FileSchema.index({ deletedAt: 1 }, { sparse: true });

// ============================================================================
// Instance Methods
// ============================================================================

FileSchema.methods.toPublic = function (): IFilePublic {
  return {
    id: this._id.toString(),
    filename: this.filename,
    originalName: this.originalName,
    contentType: this.contentType,
    size: this.size,
    projectId: this.projectId?.toString(),
    createdAt: this.createdAt,
  };
};

/**
 * Soft delete the file by setting deletedAt timestamp
 */
FileSchema.methods.softDelete = async function (): Promise<IFileDocument> {
  this.deletedAt = new Date();
  return this.save();
};

/**
 * Restore a soft-deleted file by clearing deletedAt
 */
FileSchema.methods.restore = async function (): Promise<IFileDocument> {
  this.deletedAt = null;
  return this.save();
};

/**
 * Check if file is soft-deleted
 */
FileSchema.methods.isDeleted = function (): boolean {
  return this.deletedAt !== null;
};

// ============================================================================
// Static Methods
// ============================================================================

/**
 * Find all active (non-deleted) files for a user
 */
FileSchema.statics.findByUser = function (userId: string | Types.ObjectId) {
  return this.find({
    userId,
    deletedAt: null,
  }).sort({ createdAt: -1 });
};

/**
 * Find all active (non-deleted) files for a project
 */
FileSchema.statics.findByProject = function (projectId: string | Types.ObjectId) {
  return this.find({
    projectId,
    deletedAt: null,
  }).sort({ createdAt: -1 });
};

/**
 * Find a specific active (non-deleted) file by ID and user
 */
FileSchema.statics.findByIdAndUser = function (fileId: string, userId: string) {
  return this.findOne({
    _id: new Types.ObjectId(fileId),
    userId: new Types.ObjectId(userId),
    deletedAt: null,
  });
};

/**
 * Find all files including soft-deleted (for admin/recovery)
 */
FileSchema.statics.findWithDeleted = function (
  filter: mongoose.FilterQuery<IFileDocument> = {}
) {
  return this.find(filter).sort({ createdAt: -1 });
};

// ============================================================================
// Export Model
// ============================================================================

export const File = mongoose.model<IFileDocument, IFileModel>('File', FileSchema);
