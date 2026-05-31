import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { IProject, ProjectNode, Edge, SerializedPatches } from '../types/index.js';

export interface IProjectDocument extends Omit<IProject, '_id'>, Document {
  deletedAt: Date | null;
  
  toPublic(): {
    id: string;
    name: string;
    nodes: Record<string, ProjectNode>;
    edges: Record<string, Edge>;
    patches: Record<string, SerializedPatches>;
    createdAt: Date;
    updatedAt: Date;
  };
  softDelete(): Promise<IProjectDocument>;
  restore(): Promise<IProjectDocument>;
  isDeleted(): boolean;
}

interface IProjectModel extends Model<IProjectDocument> {
  findByUser(userId: string | Types.ObjectId): Promise<IProjectDocument[]>;
  findByIdAndUser(projectId: string, userId: string): Promise<IProjectDocument | null>;
  findWithDeleted(filter?: mongoose.FilterQuery<IProjectDocument>): Promise<IProjectDocument[]>;
  findByUserWithDeleted(userId: string | Types.ObjectId): Promise<IProjectDocument[]>;
}

const ProjectSchema = new Schema<IProjectDocument, IProjectModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      minlength: [1, 'Project name cannot be empty'],
      maxlength: [200, 'Project name cannot exceed 200 characters'],
      default: 'Untitled Project',
    },
    nodes: {
      type: Schema.Types.Mixed,
      default: {},
      validate: {
        validator: function (v: unknown) {
          return typeof v === 'object' && v !== null;
        },
        message: 'Nodes must be an object',
      },
    },
    edges: {
      type: Schema.Types.Mixed,
      default: {},
      validate: {
        validator: function (v: unknown) {
          return typeof v === 'object' && v !== null;
        },
        message: 'Edges must be an object',
      },
    },
    patches: {
      type: Schema.Types.Mixed,
      default: {},
      validate: {
        validator: function (v: unknown) {
          return typeof v === 'object' && v !== null;
        },
        message: 'Patches must be an object',
      },
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'projects',
    // Allow storing flexible node/edge structures
    strict: false,
  }
);

// Primary query pattern: user's active projects sorted by last update
ProjectSchema.index({ userId: 1, deletedAt: 1, updatedAt: -1 });

ProjectSchema.index({ userId: 1, name: 1 });

ProjectSchema.index({ deletedAt: 1 }, { sparse: true });

ProjectSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    nodes: this.nodes || {},
    edges: this.edges || {},
    patches: this.patches || {},
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

ProjectSchema.methods.softDelete = async function (): Promise<IProjectDocument> {
  this.deletedAt = new Date();
  return this.save();
};

ProjectSchema.methods.restore = async function (): Promise<IProjectDocument> {
  this.deletedAt = null;
  return this.save();
};

ProjectSchema.methods.isDeleted = function (): boolean {
  return this.deletedAt !== null;
};

ProjectSchema.statics.findByUser = function (userId: string | Types.ObjectId) {
  return this.find({ 
    userId,
    deletedAt: null,
  })
    .select('_id name updatedAt createdAt')
    .sort({ updatedAt: -1 });
};

ProjectSchema.statics.findByIdAndUser = function (
  projectId: string,
  userId: string
) {
  return this.findOne({
    _id: new Types.ObjectId(projectId),
    userId: new Types.ObjectId(userId),
    deletedAt: null,
  });
};

ProjectSchema.statics.findWithDeleted = function (
  filter: mongoose.FilterQuery<IProjectDocument> = {}
) {
  return this.find(filter).sort({ updatedAt: -1 });
};

ProjectSchema.statics.findByUserWithDeleted = function (
  userId: string | Types.ObjectId
) {
  return this.find({ userId })
    .select('_id name updatedAt createdAt deletedAt')
    .sort({ updatedAt: -1 });
};

ProjectSchema.pre('save', function (next) {
  if (!this.nodes) this.nodes = {};
  if (!this.edges) this.edges = {};
  if (!this.patches) this.patches = {};
  next();
});

export const Project = mongoose.model<IProjectDocument, IProjectModel>(
  'Project',
  ProjectSchema
);
