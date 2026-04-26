const mongoose = require('mongoose');

const financeDocumentAccessSchema = new mongoose.Schema({
  eventType: {
    type: String,
    enum: ['generated', 'downloaded', 'verified', 'emailed', 'revoked'],
    required: true
  },
  at: {
    type: Date,
    default: Date.now
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
  },
  actorRole: {
    type: String,
    default: '',
    trim: true
  },
  ipAddress: {
    type: String,
    default: '',
    trim: true
  },
  userAgent: {
    type: String,
    default: '',
    trim: true
  },
  note: {
    type: String,
    default: '',
    trim: true
  }
}, { _id: false });

const financeChildDocumentSchema = new mongoose.Schema({
  documentNo: { type: String, default: '', trim: true },
  verificationCode: { type: String, default: '', trim: true },
  documentType: { type: String, default: '', trim: true },
  filename: { type: String, default: '', trim: true },
  studentMembershipId: { type: String, default: '', trim: true },
  subjectName: { type: String, default: '', trim: true }
}, { _id: false });

const financeDocumentDeliverySchema = new mongoose.Schema({
  channel: {
    type: String,
    enum: ['email', 'portal', 'sms', 'whatsapp', 'manual'],
    default: 'email'
  },
  status: {
    type: String,
    enum: ['sent', 'failed', 'resent', 'delivered'],
    default: 'sent'
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
  linkedAudienceNotified: {
    type: Boolean,
    default: false
  },
  subject: {
    type: String,
    default: '',
    trim: true
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
  note: {
    type: String,
    default: '',
    trim: true
  },
  errorMessage: {
    type: String,
    default: '',
    trim: true
  },
  failureCode: {
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
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  sentByLabel: {
    type: String,
    default: '',
    trim: true
  }
}, { _id: false });

const financeDocumentArchiveSchema = new mongoose.Schema({
  documentType: {
    type: String,
    enum: ['student_statement', 'parent_statement', 'month_close_pack', 'batch_statement_pack', 'government_snapshot_pack'],
    required: true,
    index: true
  },
  documentNo: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  verificationCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  verificationUrl: {
    type: String,
    default: '',
    trim: true
  },
  filename: {
    type: String,
    default: '',
    trim: true
  },
  contentType: {
    type: String,
    default: 'application/pdf',
    trim: true
  },
  sizeBytes: {
    type: Number,
    default: 0
  },
  sha256: {
    type: String,
    default: '',
    trim: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'revoked'],
    default: 'active',
    index: true
  },
  generatedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  generatedByLabel: {
    type: String,
    default: '',
    trim: true
  },
  studentMembershipId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentMembership',
    default: null,
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentCore',
    default: null,
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
  sourceMonthCloseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceMonthClose',
    default: null,
    index: true
  },
  monthKey: {
    type: String,
    default: '',
    trim: true,
    index: true
  },
  title: {
    type: String,
    default: '',
    trim: true
  },
  subjectName: {
    type: String,
    default: '',
    trim: true
  },
  membershipLabel: {
    type: String,
    default: '',
    trim: true
  },
  batchLabel: {
    type: String,
    default: '',
    trim: true
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  verifyCount: {
    type: Number,
    default: 0
  },
  lastDownloadedAt: {
    type: Date,
    default: null
  },
  lastVerifiedAt: {
    type: Date,
    default: null
  },
  deliveryCount: {
    type: Number,
    default: 0
  },
  lastDeliveredAt: {
    type: Date,
    default: null
  },
  lastDeliveryStatus: {
    type: String,
    enum: ['sent', 'failed', 'resent', 'delivered', ''],
    default: '',
    trim: true
  },
  childDocuments: {
    type: [financeChildDocumentSchema],
    default: []
  },
  deliveryLog: {
    type: [financeDocumentDeliverySchema],
    default: []
  },
  accessLog: {
    type: [financeDocumentAccessSchema],
    default: []
  },
  meta: {
    type: Object,
    default: {}
  }
}, { timestamps: true });

financeDocumentArchiveSchema.index({ documentType: 1, generatedAt: -1 });
financeDocumentArchiveSchema.index({ classId: 1, academicYearId: 1, monthKey: 1, documentType: 1 });
financeDocumentArchiveSchema.index({ 'deliveryLog.providerMessageId': 1 });

module.exports = mongoose.model('FinanceDocumentArchive', financeDocumentArchiveSchema);
