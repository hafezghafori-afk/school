const mongoose = require('mongoose');

// One press of «اعمال ارتقا»: a source class of one academic year moved into
// the classes of the target year. Every student it touched has a
// PromotionTransaction pointing back here, so the whole class can be listed,
// printed or rolled back together; students it left alone (blocked marks,
// excluded by the operator, already promoted) are kept in `notApplied`.
const batchStudentSchema = new mongoose.Schema({
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  fullName: { type: String, default: '', trim: true },
  outcome: { type: String, default: '', trim: true },
  issueCode: { type: String, default: '', trim: true }
}, { _id: false });

const batchOverrideSchema = new mongoose.Schema({
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', required: true },
  targetClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
  exclude: { type: Boolean, default: false },
  reason: { type: String, default: '', trim: true }
}, { _id: false });

const promotionBatchSchema = new mongoose.Schema({
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'PromotionRule', default: null, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', default: null, index: true },
  sourceAcademicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
  sourceClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', required: true, index: true },
  targetAcademicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
  promotedClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
  repeatClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
  isTerminal: { type: Boolean, default: false },
  sourceEndAt: { type: Date, required: true },
  targetStartAt: { type: Date, required: true },
  status: {
    type: String,
    enum: ['applied', 'partially_rolled_back', 'rolled_back'],
    default: 'applied',
    index: true
  },
  summary: {
    total: { type: Number, default: 0 },
    promoted: { type: Number, default: 0 },
    repeated: { type: Number, default: 0 },
    conditional: { type: Number, default: 0 },
    graduated: { type: Number, default: 0 },
    notApplied: { type: Number, default: 0 }
  },
  financeSummary: {
    studentsWithDebt: { type: Number, default: 0 },
    debtAmount: { type: Number, default: 0 },
    voidedDocuments: { type: Number, default: 0 },
    refundCases: { type: Number, default: 0 },
    reviewRequired: { type: Number, default: 0 },
    carriedReliefs: { type: Number, default: 0 },
    failedReliefs: { type: Number, default: 0 }
  },
  notApplied: { type: [batchStudentSchema], default: [] },
  overrides: { type: [batchOverrideSchema], default: [] },
  warnings: { type: [String], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  appliedAt: { type: Date, default: Date.now },
  rolledBackAt: { type: Date, default: null },
  rolledBackBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rollbackReason: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true }
}, { timestamps: true });

promotionBatchSchema.index({ sourceAcademicYearId: 1, sourceClassId: 1, appliedAt: -1 });
promotionBatchSchema.index({ targetAcademicYearId: 1, appliedAt: -1 });

module.exports = mongoose.model('PromotionBatch', promotionBatchSchema);
