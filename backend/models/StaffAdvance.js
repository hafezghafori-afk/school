const mongoose = require('mongoose');

// A staff/teacher advance or withdrawal recorded inside the Government Finance
// page. Money leaves the treasury in full on final approval; it comes back as
// installments deducted from the person's salary (Phase 2) until settled.
// The approval chain is intentionally identical to ExpenseEntry so the review
// UI and helpers (submitExpenseEntryForReview / reviewExpenseEntryTransition)
// can be reused verbatim.

const STAFF_ADVANCE_KINDS = [
  'salary_advance',
  'principal_withdrawal',
  'owner_withdrawal',
  'staff_loan'
];

const STAFF_ADVANCE_APPROVAL_STAGES = [
  'draft',
  'finance_manager_review',
  'finance_lead_review',
  'general_president_review',
  'completed',
  'rejected',
  'void'
];

const STAFF_ADVANCE_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'settled',
  'rejected',
  'void',
  'written_off',
  'refunded'
];

const approvalTrailSchema = new mongoose.Schema({
  level: { type: String, default: '', trim: true },
  action: { type: String, default: '', trim: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  at: { type: Date, default: null },
  note: { type: String, default: '', trim: true },
  reason: { type: String, default: '', trim: true }
}, { _id: false });

const repaymentSchema = new mongoose.Schema({
  period: { type: String, default: '', trim: true }, // Shamsi month key, e.g. 1405-06
  amount: { type: Number, required: true, min: 0 },
  salaryExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseEntry', default: null },
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, default: '', trim: true }
}, { _id: false });

const staffAdvanceSchema = new mongoose.Schema({
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

  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AfghanTeacher',
    default: null,
    index: true
  },
  staffSnapshot: {
    name: { type: String, default: '', trim: true },
    employeeId: { type: String, default: '', trim: true },
    position: { type: String, default: '', trim: true }
  },

  kind: { type: String, enum: STAFF_ADVANCE_KINDS, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'AFN', trim: true },
  // Monthly salary used to enforce the hard cap (salary is entered manually, so
  // this is captured on the record and frozen for audit).
  monthlySalaryBasis: { type: Number, required: true, min: 0 },
  issueDate: { type: Date, required: true, index: true },
  reason: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },

  treasuryAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceTreasuryAccount',
    required: true,
    index: true
  },
  treasuryTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceTreasuryTransaction',
    default: null
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'hawala', 'manual'],
    default: 'manual'
  },

  repaymentPlan: {
    mode: { type: String, enum: ['next_salary', 'installments'], default: 'next_salary' },
    installmentAmount: { type: Number, default: 0, min: 0 },
    months: { type: Number, default: 1, min: 1 }
  },
  repayments: { type: [repaymentSchema], default: [] },
  outstandingAmount: { type: Number, default: 0, min: 0 },

  status: { type: String, enum: STAFF_ADVANCE_STATUSES, default: 'draft', index: true },
  approvalStage: { type: String, enum: STAFF_ADVANCE_APPROVAL_STAGES, default: 'draft', index: true },
  approvalTrail: { type: [approvalTrailSchema], default: [] },

  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  submittedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectReason: { type: String, default: '', trim: true },

  settledAt: { type: Date, default: null },
  writeOff: {
    at: { type: Date, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, default: '', trim: true }
  },
  refund: {
    at: { type: Date, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    amount: { type: Number, default: 0, min: 0 },
    treasuryTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceTreasuryTransaction', default: null },
    note: { type: String, default: '', trim: true }
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

staffAdvanceSchema.pre('validate', function syncStaffAdvanceState() {
  if (typeof this.currency === 'string') this.currency = this.currency.trim().toUpperCase() || 'AFN';
  if (typeof this.reason === 'string') this.reason = this.reason.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.rejectReason === 'string') this.rejectReason = this.rejectReason.trim();
  if (this.staffSnapshot && typeof this.staffSnapshot.name === 'string') {
    this.staffSnapshot.name = this.staffSnapshot.name.trim();
  }

  this.amount = Math.max(0, Number(this.amount) || 0);
  this.monthlySalaryBasis = Math.max(0, Number(this.monthlySalaryBasis) || 0);
  if (!Array.isArray(this.repayments)) this.repayments = [];
  if (!Array.isArray(this.approvalTrail)) this.approvalTrail = [];

  const repaid = this.repayments.reduce((sum, item) => sum + Math.max(0, Number(item?.amount) || 0), 0);
  this.outstandingAmount = Math.max(0, Math.round((this.amount - repaid) * 100) / 100);

  // A live advance with nothing left owed becomes settled.
  if (this.status === 'approved' && this.outstandingAmount <= 0 && this.amount > 0) {
    this.status = 'settled';
    if (!this.settledAt) this.settledAt = new Date();
  }

  // Keep stage consistent with the terminal statuses; the review-transition
  // helper owns the intermediate `pending_review` stage transitions.
  if (this.status === 'draft') this.approvalStage = 'draft';
  else if (this.status === 'rejected') this.approvalStage = 'rejected';
  else if (this.status === 'void') this.approvalStage = 'void';
  else if (['approved', 'settled', 'written_off', 'refunded'].includes(this.status)) this.approvalStage = 'completed';
});

staffAdvanceSchema.index({ schoolId: 1, financialYearId: 1, status: 1 });
staffAdvanceSchema.index({ staffId: 1, status: 1 });
staffAdvanceSchema.index({ financialYearId: 1, status: 1, issueDate: -1 });
staffAdvanceSchema.index({ schoolId: 1, status: 1, outstandingAmount: 1 });

module.exports = mongoose.model('StaffAdvance', staffAdvanceSchema);
module.exports.STAFF_ADVANCE_KINDS = STAFF_ADVANCE_KINDS;
module.exports.STAFF_ADVANCE_APPROVAL_STAGES = STAFF_ADVANCE_APPROVAL_STAGES;
module.exports.STAFF_ADVANCE_STATUSES = STAFF_ADVANCE_STATUSES;
