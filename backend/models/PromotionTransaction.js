const mongoose = require('mongoose');

const promotionTransactionSchema = new mongoose.Schema({
  batchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PromotionBatch',
    default: null,
    index: true
  },
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
  // 'held': a conditional (مشروط) student waiting for the second-chance exam;
  // nothing has moved yet and resolving it turns it into 'applied'.
  transactionStatus: {
    type: String,
    enum: ['preview', 'held', 'applied', 'rolled_back', 'cancelled'],
    default: 'preview',
    index: true
  },
  generatedMembershipStatus: { type: String, default: '', trim: true },
  // false when the student already had a current membership in the target
  // class and promotion only linked to it - a rollback must leave that one alone.
  targetMembershipGenerated: { type: Boolean, default: true },
  heldOutcome: { type: String, default: '', trim: true },
  // What the decision rested on, kept so finance can see a held student's
  // failed subjects without re-running the result engine.
  averageScore: { type: Number, default: null },
  failedSubjects: {
    type: [new mongoose.Schema({
      subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
      subjectTitle: { type: String, default: '', trim: true },
      percentage: { type: Number, default: 0 }
    }, { _id: false })],
    default: []
  },
  // «فیس امتحان چانس دوم» decision of the finance office. The bill itself is
  // a normal FinanceBill with issuanceKey `second_chance_exam:<this id>`, so it
  // stays the source of truth for "billed"; this keeps who decided what.
  secondChanceFee: {
    status: { type: String, enum: ['', 'billed', 'waived'], default: '' },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceBill', default: null },
    amount: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date, default: null },
    waiverReason: { type: String, default: '', trim: true },
    note: { type: String, default: '', trim: true },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  // What promotion did on the finance side for this student: the source-year
  // debt it left in place, after-end documents it voided or turned into
  // refund cases (or left for review in a closed month), and the reliefs
  // re-registered on the new membership.
  financeEffects: {
    outstandingAtPromotion: { type: Number, default: 0 },
    voidedBills: { type: Number, default: 0 },
    voidedOrders: { type: Number, default: 0 },
    refundCases: { type: Number, default: 0 },
    reviewRequired: {
      type: [new mongoose.Schema({
        documentId: { type: String, default: '' },
        documentType: { type: String, default: '' },
        number: { type: String, default: '' },
        reason: { type: String, default: '' }
      }, { _id: false })],
      default: []
    },
    plannedReliefs: {
      type: [new mongoose.Schema({
        sourceModel: { type: String, default: '' },
        id: { type: String, default: '' }
      }, { _id: false })],
      default: []
    },
    carriedReliefs: {
      type: [new mongoose.Schema({
        sourceModel: { type: String, default: '' },
        sourceId: { type: String, default: '' },
        newId: { type: String, default: '' },
        status: { type: String, default: '' },
        error: { type: String, default: '' }
      }, { _id: false })],
      default: []
    }
  },
  resolvedAt: { type: Date, default: null },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
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
promotionTransactionSchema.index({ studentMembershipId: 1, transactionStatus: 1, promotionOutcome: 1 });
promotionTransactionSchema.index({ heldOutcome: 1, transactionStatus: 1, academicYearId: 1, classId: 1 });

module.exports = mongoose.model('PromotionTransaction', promotionTransactionSchema);
