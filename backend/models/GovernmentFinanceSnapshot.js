const mongoose = require('mongoose');

const governmentFinanceSnapshotSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  financialYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinancialYear',
    required: true,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true,
    index: true
  },
  reportType: {
    type: String,
    enum: ['monthly', 'quarterly', 'annual'],
    required: true,
    index: true
  },
  quarter: {
    type: Number,
    min: 1,
    max: 4,
    default: null,
    index: true
  },
  month: {
    type: Number,
    min: 1,
    max: 12,
    default: null,
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  reportKey: { type: String, default: '', trim: true, index: true },
  title: { type: String, default: '', trim: true },
  filters: { type: Object, default: {} },
  columns: { type: [Object], default: [] },
  summary: { type: Object, default: {} },
  rows: { type: [Object], default: [] },
  pack: { type: Object, default: null },
  sourceDigest: { type: String, default: '', trim: true },
  // Tamper-evident version chain (P8). `previousDigest` links each version to the
  // sourceDigest of the prior version in the same (financialYear, reportType,
  // quarter/month, class) chain; `digestAlgo` distinguishes records hashed with
  // the canonical serializer from pre-chain rows still on order-sensitive JSON.
  previousDigest: { type: String, default: '', trim: true },
  digestAlgo: { type: String, default: 'legacy-json', trim: true },
  version: { type: Number, default: 1 },
  isOfficial: { type: Boolean, default: false, index: true },
  // Two-person control for the "official" designation (P2). Generation always
  // produces a `draft`; a second admin (finance_lead or general_president, and
  // not the generator) ratifies it into the official record, or rejects it.
  officialStage: {
    type: String,
    enum: ['draft', 'ratified', 'rejected'],
    default: 'draft',
    index: true
  },
  ratifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ratifiedAt: { type: Date, default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectReason: { type: String, default: '', trim: true },
  officialTrail: { type: [Object], default: [] },
  readinessAtGeneration: { type: Object, default: null },
  readinessAtRatification: { type: Object, default: null },
  generatedAt: { type: Date, default: Date.now, index: true },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

governmentFinanceSnapshotSchema.index({ financialYearId: 1, reportType: 1, quarter: 1, month: 1, classId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('GovernmentFinanceSnapshot', governmentFinanceSnapshotSchema);
