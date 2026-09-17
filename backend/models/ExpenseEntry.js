const mongoose = require('mongoose');

const EXPENSE_APPROVAL_STAGES = [
  'draft',
  'finance_manager_review',
  'finance_lead_review',
  'general_president_review',
  'completed',
  'rejected',
  'void'
];

const expenseApprovalTrailSchema = new mongoose.Schema({
  level: { type: String, default: '', trim: true },
  action: { type: String, default: '', trim: true },
  by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  at: { type: Date, default: null },
  note: { type: String, default: '', trim: true },
  reason: { type: String, default: '', trim: true }
}, { _id: false });

const expenseFieldChangeSchema = new mongoose.Schema({
  field: { type: String, default: '', trim: true },
  from: { type: mongoose.Schema.Types.Mixed, default: null },
  to: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false });

// Audit history of changes made to an expense after it was recorded: direct
// edits of open rows, text-only fixes on approved rows, the outcome of every
// correction request (applied / rejected / cancelled), and data-repair scripts
// (system_fix, `by` is null).
const expenseRevisionSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['edit', 'text_edit', 'correction_applied', 'correction_rejected', 'correction_cancelled', 'system_fix'],
    default: 'edit'
  },
  at: { type: Date, default: null },
  by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reason: { type: String, default: '', trim: true },
  statusBefore: { type: String, default: '', trim: true },
  changes: {
    type: [expenseFieldChangeSchema],
    default: []
  }
}, { _id: false });

// An open correction request on an APPROVED expense. While it exists the row
// sits in pending_review (so treasury balances, reports and budgets ignore it)
// but its own fields keep the last approved values; `changes[].to` replaces
// them only on final approval. Rejecting or cancelling restores
// `previousApproval`.
const expenseCorrectionSchema = new mongoose.Schema({
  reason: { type: String, default: '', trim: true },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  requestedAt: { type: Date, default: null },
  changes: {
    type: [expenseFieldChangeSchema],
    default: []
  },
  previousApproval: {
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null }
  }
}, { _id: false });

const expenseEntrySchema = new mongoose.Schema({
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
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  category: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  subCategory: { type: String, default: '', trim: true },
  // Set by the expense-chart migration for rows whose original category string
  // could not be mapped to the unified chart. `legacyCategory` keeps the raw
  // pre-migration value so the "دسته‌بندیِ معلق" queue can group identical
  // values and classify them in one action.
  legacyCategory: { type: String, default: '', trim: true },
  needsCategoryReview: { type: Boolean, default: false, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'AFN', trim: true },
  expenseDate: { type: Date, required: true, index: true },
  periodQuarter: {
    type: Number,
    min: 1,
    max: 4,
    default: null,
    index: true
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'hawala', 'manual', 'other'],
    default: 'manual'
  },
  treasuryAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceTreasuryAccount',
    default: null,
    index: true
  },
  procurementCommitmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceProcurementCommitment',
    default: null,
    index: true
  },
  vendorName: { type: String, default: '', trim: true },
  referenceNo: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'approved', 'rejected', 'void'],
    default: 'draft',
    index: true
  },
  approvalStage: {
    type: String,
    enum: EXPENSE_APPROVAL_STAGES,
    default: 'draft',
    index: true
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  submittedAt: { type: Date, default: null },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: { type: Date, default: null },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  rejectedAt: { type: Date, default: null },
  rejectReason: { type: String, default: '', trim: true },
  approvalTrail: {
    type: [expenseApprovalTrailSchema],
    default: []
  },
  correction: {
    type: expenseCorrectionSchema,
    default: null
  },
  revisions: {
    type: [expenseRevisionSchema],
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
  }
}, { timestamps: true });

expenseEntrySchema.pre('validate', function syncExpenseEntryState() {
  if (typeof this.category === 'string') this.category = this.category.trim().toLowerCase();
  if (typeof this.subCategory === 'string') this.subCategory = this.subCategory.trim();
  if (typeof this.legacyCategory === 'string') this.legacyCategory = this.legacyCategory.trim().toLowerCase();
  if (typeof this.currency === 'string') this.currency = this.currency.trim().toUpperCase() || 'AFN';
  if (typeof this.vendorName === 'string') this.vendorName = this.vendorName.trim();
  if (typeof this.referenceNo === 'string') this.referenceNo = this.referenceNo.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();

  this.amount = Math.max(0, Number(this.amount) || 0);

  if (typeof this.rejectReason === 'string') this.rejectReason = this.rejectReason.trim();
  if (!Array.isArray(this.approvalTrail)) this.approvalTrail = [];

  if (this.status === 'pending_review') {
    if (!['finance_manager_review', 'finance_lead_review', 'general_president_review'].includes(this.approvalStage)) {
      this.approvalStage = 'finance_manager_review';
    }
    if (!this.submittedAt) this.submittedAt = new Date();
  } else if (this.status === 'approved') {
    this.approvalStage = 'completed';
    if (!this.submittedAt) this.submittedAt = new Date();
  } else if (this.status === 'rejected') {
    this.approvalStage = 'rejected';
    if (!this.rejectedAt) this.rejectedAt = new Date();
    if (!this.submittedAt) this.submittedAt = new Date();
  } else if (this.status === 'void') {
    this.approvalStage = 'void';
  } else {
    this.approvalStage = 'draft';
    this.submittedAt = null;
    this.submittedBy = null;
  }

  if (this.status !== 'approved') {
    this.approvedBy = null;
    this.approvedAt = null;
  } else if (!this.approvedAt) {
    this.approvedAt = new Date();
  }

  if (this.status !== 'rejected') {
    this.rejectedBy = null;
    this.rejectedAt = null;
    this.rejectReason = '';
  }
});

expenseEntrySchema.index({ financialYearId: 1, status: 1, expenseDate: -1 });
expenseEntrySchema.index({ academicYearId: 1, classId: 1, status: 1 });
expenseEntrySchema.index({ category: 1, status: 1, expenseDate: -1 });
expenseEntrySchema.index({ schoolId: 1, needsCategoryReview: 1, financialYearId: 1 });
expenseEntrySchema.index({ financialYearId: 1, approvalStage: 1, createdAt: -1 });
expenseEntrySchema.index({ treasuryAccountId: 1, status: 1, expenseDate: -1 });
expenseEntrySchema.index({ procurementCommitmentId: 1, status: 1, expenseDate: -1 });
expenseEntrySchema.index({ schoolId: 1, academicYearId: 1, status: 1, expenseDate: -1 });

module.exports = mongoose.model('ExpenseEntry', expenseEntrySchema);
