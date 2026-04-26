const mongoose = require('mongoose');

const financeDeliveryCampaignTargetSchema = new mongoose.Schema({
  archiveId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceDocumentArchive',
    default: null
  },
  documentNo: {
    type: String,
    default: '',
    trim: true
  },
  channel: {
    type: String,
    enum: ['email', 'portal', 'sms', 'whatsapp'],
    default: 'email'
  },
  status: {
    type: String,
    enum: ['sent', 'resent', 'delivered', 'failed', 'skipped'],
    default: 'skipped'
  },
  recipient: {
    type: String,
    default: '',
    trim: true
  },
  recipientCount: {
    type: Number,
    default: 0
  },
  provider: {
    type: String,
    default: '',
    trim: true
  },
  providerMessageId: {
    type: String,
    default: '',
    trim: true
  },
  providerStatus: {
    type: String,
    default: '',
    trim: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  lastAttemptAt: {
    type: Date,
    default: null
  },
  lastDeliveredAt: {
    type: Date,
    default: null
  },
  lastError: {
    type: String,
    default: '',
    trim: true
  },
  lastFailureCode: {
    type: String,
    default: '',
    trim: true
  },
  retryable: {
    type: Boolean,
    default: false
  },
  nextRetryAt: {
    type: Date,
    default: null
  }
}, { _id: false });

const financeDeliveryCampaignRunSchema = new mongoose.Schema({
  runAt: {
    type: Date,
    default: Date.now
  },
  mode: {
    type: String,
    enum: ['manual', 'automation'],
    default: 'manual'
  },
  status: {
    type: String,
    enum: ['success', 'partial', 'failed', 'skipped'],
    default: 'success'
  },
  matchedDocuments: {
    type: Number,
    default: 0
  },
  deliveredDocuments: {
    type: Number,
    default: 0
  },
  failedDocuments: {
    type: Number,
    default: 0
  },
  skippedDocuments: {
    type: Number,
    default: 0
  },
  note: {
    type: String,
    default: '',
    trim: true
  },
  actorId: {
    type: String,
    default: '',
    trim: true
  },
  actorName: {
    type: String,
    default: '',
    trim: true
  }
}, { _id: false });

const financeDeliveryCampaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'paused'],
    default: 'active',
    index: true
  },
  documentType: {
    type: String,
    enum: ['student_statement', 'parent_statement', 'month_close_pack', 'batch_statement_pack'],
    required: true,
    index: true
  },
  channel: {
    type: String,
    enum: ['email', 'portal', 'sms', 'whatsapp'],
    default: 'email',
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  monthKey: {
    type: String,
    default: '',
    trim: true,
    index: true
  },
  messageTemplateKey: {
    type: String,
    default: '',
    trim: true
  },
  messageTemplateSubject: {
    type: String,
    default: '',
    trim: true
  },
  messageTemplateBody: {
    type: String,
    default: '',
    trim: true
  },
  recipientHandles: {
    type: [String],
    default: []
  },
  includeLinkedAudience: {
    type: Boolean,
    default: true
  },
  retryFailed: {
    type: Boolean,
    default: true
  },
  automationEnabled: {
    type: Boolean,
    default: false,
    index: true
  },
  intervalHours: {
    type: Number,
    default: 24
  },
  maxDocumentsPerRun: {
    type: Number,
    default: 10
  },
  note: {
    type: String,
    default: '',
    trim: true
  },
  nextRunAt: {
    type: Date,
    default: null,
    index: true
  },
  lastRunAt: {
    type: Date,
    default: null
  },
  lastRunStatus: {
    type: String,
    enum: ['idle', 'success', 'partial', 'failed', 'skipped'],
    default: 'idle'
  },
  lastRunSummary: {
    type: Object,
    default: {}
  },
  runCount: {
    type: Number,
    default: 0
  },
  successCount: {
    type: Number,
    default: 0
  },
  failureCount: {
    type: Number,
    default: 0
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
  },
  targets: {
    type: [financeDeliveryCampaignTargetSchema],
    default: []
  },
  runLog: {
    type: [financeDeliveryCampaignRunSchema],
    default: []
  },
  meta: {
    type: Object,
    default: {}
  }
}, { timestamps: true });

financeDeliveryCampaignSchema.index({ status: 1, automationEnabled: 1, nextRunAt: 1 });
financeDeliveryCampaignSchema.index({ documentType: 1, classId: 1, academicYearId: 1, monthKey: 1 });
financeDeliveryCampaignSchema.index({ 'targets.providerMessageId': 1 });

module.exports = mongoose.model('FinanceDeliveryCampaign', financeDeliveryCampaignSchema);
