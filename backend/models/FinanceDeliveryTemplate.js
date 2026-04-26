const mongoose = require('mongoose');

const financeDeliveryTemplateVersionSchema = new mongoose.Schema({
  versionNumber: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  approvalStage: {
    type: String,
    enum: ['draft', 'pending_review', 'approved', 'rejected'],
    default: 'draft'
  },
  subject: {
    type: String,
    default: '',
    trim: true
  },
  body: {
    type: String,
    default: '',
    trim: true
  },
  changeNote: {
    type: String,
    default: '',
    trim: true
  },
  source: {
    type: String,
    enum: ['custom', 'rollback'],
    default: 'custom'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdByLabel: {
    type: String,
    default: '',
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedByLabel: {
    type: String,
    default: '',
    trim: true
  },
  updatedAt: {
    type: Date,
    default: null
  },
  reviewRequestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewRequestedByLabel: {
    type: String,
    default: '',
    trim: true
  },
  reviewRequestedAt: {
    type: Date,
    default: null
  },
  reviewNote: {
    type: String,
    default: '',
    trim: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedByLabel: {
    type: String,
    default: '',
    trim: true
  },
  approvedAt: {
    type: Date,
    default: null
  },
  approvalNote: {
    type: String,
    default: '',
    trim: true
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  rejectedByLabel: {
    type: String,
    default: '',
    trim: true
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectionNote: {
    type: String,
    default: '',
    trim: true
  },
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  publishedByLabel: {
    type: String,
    default: '',
    trim: true
  },
  publishedAt: {
    type: Date,
    default: null
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  archivedByLabel: {
    type: String,
    default: '',
    trim: true
  },
  archivedAt: {
    type: Date,
    default: null
  }
}, { _id: false });

const financeDeliveryTemplateHistorySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['draft_saved', 'review_requested', 'approved', 'rejected', 'published', 'archived', 'rolled_back'],
    required: true
  },
  versionNumber: {
    type: Number,
    default: null
  },
  fromVersionNumber: {
    type: Number,
    default: null
  },
  toVersionNumber: {
    type: Number,
    default: null
  },
  note: {
    type: String,
    default: '',
    trim: true
  },
  by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  byLabel: {
    type: String,
    default: '',
    trim: true
  },
  at: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const financeDeliveryTemplateSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index: true
  },
  currentPublishedVersion: {
    type: Number,
    default: 1
  },
  currentDraftVersion: {
    type: Number,
    default: null
  },
  versions: {
    type: [financeDeliveryTemplateVersionSchema],
    default: []
  },
  history: {
    type: [financeDeliveryTemplateHistorySchema],
    default: []
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdByLabel: {
    type: String,
    default: '',
    trim: true
  },
  updatedByLabel: {
    type: String,
    default: '',
    trim: true
  }
}, { timestamps: true });

financeDeliveryTemplateSchema.pre('validate', function financeDeliveryTemplatePreValidate(next) {
  if (!Array.isArray(this.versions)) this.versions = [];
  if (!Array.isArray(this.history)) this.history = [];
  if (!Number(this.currentPublishedVersion || 0)) this.currentPublishedVersion = 1;
  next();
});

module.exports = mongoose.models.FinanceDeliveryTemplate || mongoose.model('FinanceDeliveryTemplate', financeDeliveryTemplateSchema);
