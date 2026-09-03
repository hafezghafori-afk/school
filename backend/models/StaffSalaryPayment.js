const mongoose = require('mongoose');

// One person's salary payment for one month, recorded in the Government
// Finance page. On final approval it books a `salary` ExpenseEntry for the NET
// amount (so the treasury is debited by the net) and posts a repayment
// installment onto each linked StaffAdvance. Gross salary is entered manually
// (school runs salary per-person, no batch payroll). Approval chain mirrors
// ExpenseEntry so the same helpers apply.

const STAFF_SALARY_PAYMENT_APPROVAL_STAGES = [
  'draft',
  'finance_manager_review',
  'finance_lead_review',
  'general_president_review',
  'completed',
  'rejected',
  'void'
];

const STAFF_SALARY_PAYMENT_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'void'];

const approvalTrailSchema = new mongoose.Schema({
  level: { type: String, default: '', trim: true },
  action: { type: String, default: '', trim: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  at: { type: Date, default: null },
  note: { type: String, default: '', trim: true },
  reason: { type: String, default: '', trim: true }
}, { _id: false });

const deductionSchema = new mongoose.Schema({
  advanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffAdvance', required: true },
  amount: { type: Number, required: true, min: 0 },
  kind: { type: String, default: '', trim: true }
}, { _id: false });

const staffSalaryPaymentSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  financialYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', required: true, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },

  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanTeacher', default: null, index: true },
  staffSnapshot: {
    name: { type: String, default: '', trim: true },
    employeeId: { type: String, default: '', trim: true },
    position: { type: String, default: '', trim: true }
  },

  period: { type: String, default: '', trim: true }, // YYYY-MM of paymentDate
  paymentDate: { type: Date, required: true, index: true },
  grossSalary: { type: Number, required: true, min: 0 },
  deductions: { type: [deductionSchema], default: [] },
  deductionTotal: { type: Number, default: 0, min: 0 },
  netAmount: { type: Number, default: 0, min: 0 },

  treasuryAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceTreasuryAccount', required: true, index: true },
  paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'hawala', 'manual'], default: 'manual' },
  salaryExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseEntry', default: null },
  note: { type: String, default: '', trim: true },

  status: { type: String, enum: STAFF_SALARY_PAYMENT_STATUSES, default: 'draft', index: true },
  approvalStage: { type: String, enum: STAFF_SALARY_PAYMENT_APPROVAL_STAGES, default: 'draft', index: true },
  approvalTrail: { type: [approvalTrailSchema], default: [] },

  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  submittedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectReason: { type: String, default: '', trim: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

staffSalaryPaymentSchema.pre('validate', function syncStaffSalaryPaymentState() {
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.rejectReason === 'string') this.rejectReason = this.rejectReason.trim();
  if (this.staffSnapshot && typeof this.staffSnapshot.name === 'string') {
    this.staffSnapshot.name = this.staffSnapshot.name.trim();
  }
  if (!Array.isArray(this.deductions)) this.deductions = [];
  if (!Array.isArray(this.approvalTrail)) this.approvalTrail = [];

  this.grossSalary = Math.max(0, Number(this.grossSalary) || 0);
  const rawDeductions = this.deductions.reduce((sum, item) => sum + Math.max(0, Number(item?.amount) || 0), 0);
  this.deductionTotal = Math.min(this.grossSalary, Math.round(rawDeductions * 100) / 100);
  this.netAmount = Math.max(0, Math.round((this.grossSalary - this.deductionTotal) * 100) / 100);

  if (this.status === 'draft') this.approvalStage = 'draft';
  else if (this.status === 'rejected') this.approvalStage = 'rejected';
  else if (this.status === 'void') this.approvalStage = 'void';
  else if (this.status === 'approved') this.approvalStage = 'completed';
});

staffSalaryPaymentSchema.index({ schoolId: 1, financialYearId: 1, status: 1 });
staffSalaryPaymentSchema.index({ staffId: 1, period: 1 });
staffSalaryPaymentSchema.index({ financialYearId: 1, status: 1, paymentDate: -1 });

module.exports = mongoose.model('StaffSalaryPayment', staffSalaryPaymentSchema);
module.exports.STAFF_SALARY_PAYMENT_APPROVAL_STAGES = STAFF_SALARY_PAYMENT_APPROVAL_STAGES;
module.exports.STAFF_SALARY_PAYMENT_STATUSES = STAFF_SALARY_PAYMENT_STATUSES;
