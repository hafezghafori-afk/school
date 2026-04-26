const mongoose = require('mongoose');

const promotionTransactionSchema = new mongoose.Schema({
  ruleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PromotionRule',
    default: null,
    index: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamSession',
    default: null,
    index: true
  },
  examResultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamResult',
    default: null,
    index: true
  },
  studentMembershipId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentMembership',
    required: true,
    index: true
  },
  targetMembershipId: {
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
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  targetAcademicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  assessmentPeriodId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicTerm',
    default: null,
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  targetClassId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  sourceResultStatus: { type: String, default: '', trim: true },
  promotionOutcome: {
    type: String,
    enum: ['promoted', 'repeated', 'conditional', 'graduated', 'blocked', 'skipped'],
    default: 'blocked',
    index: true
  },
  transactionStatus: {
    type: String,
    enum: ['preview', 'applied', 'rolled_back', 'cancelled'],
    default: 'preview',
    index: true
  },
  generatedMembershipStatus: { type: String, default: '', trim: true },
  decidedAt: { type: Date, default: Date.now },
  appliedAt: { type: Date, default: null },
  rolledBackAt: { type: Date, default: null },
  rollbackReason: { type: String, default: '', trim: true },
  rolledBackBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  sourceMembershipStatusBefore: { type: String, default: '', trim: true },
  sourceMembershipEndedReasonBefore: { type: String, default: '', trim: true },
  sourceMembershipEndedAtBefore: { type: Date, default: null },
  sourceMembershipLeftAtBefore: { type: Date, default: null },
  sourceMembershipIsCurrentBefore: { type: Boolean, default: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  appliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  note: { type: String, default: '' }
}, { timestamps: true });

promotionTransactionSchema.pre('validate', function syncPromotionTransactionState() {
  if (typeof this.sourceResultStatus === 'string') this.sourceResultStatus = this.sourceResultStatus.trim().toLowerCase();
  if (typeof this.generatedMembershipStatus === 'string') this.generatedMembershipStatus = this.generatedMembershipStatus.trim().toLowerCase();
  if (typeof this.rollbackReason === 'string') this.rollbackReason = this.rollbackReason.trim();
  if (typeof this.sourceMembershipStatusBefore === 'string') this.sourceMembershipStatusBefore = this.sourceMembershipStatusBefore.trim().toLowerCase();
  if (typeof this.sourceMembershipEndedReasonBefore === 'string') this.sourceMembershipEndedReasonBefore = this.sourceMembershipEndedReasonBefore.trim().toLowerCase();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (this.transactionStatus === 'applied' && !this.appliedAt) {
    this.appliedAt = new Date();
  }
  if (this.transactionStatus === 'rolled_back' && !this.rolledBackAt) {
    this.rolledBackAt = new Date();
  }
  if (this.transactionStatus !== 'rolled_back') {
    this.rolledBackAt = null;
    this.rollbackReason = '';
    this.rolledBackBy = null;
  }
});

promotionTransactionSchema.index({ sessionId: 1, studentMembershipId: 1, targetAcademicYearId: 1, transactionStatus: 1 });
promotionTransactionSchema.index({ studentId: 1, createdAt: -1 });

module.exports = mongoose.model('PromotionTransaction', promotionTransactionSchema);
