const mongoose = require('mongoose');
const { deriveLinkScope } = require('../utils/financeLinkScope');

const approvalTrailEntrySchema = new mongoose.Schema({
  level: { type: String, enum: ['finance_manager', 'finance_lead', 'general_president'], required: true },
  action: { type: String, enum: ['approve', 'reject'], required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, default: Date.now },
  note: { type: String, default: '' },
  reason: { type: String, default: '' }
}, { _id: false });

const followUpHistorySchema = new mongoose.Schema({
  assignedLevel: { type: String, enum: ['finance_manager', 'finance_lead', 'general_president'], required: true },
  status: { type: String, enum: ['new', 'in_progress', 'on_hold', 'escalated', 'resolved'], required: true },
  note: { type: String, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const paymentAllocationSchema = new mongoose.Schema({
  feeOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeOrder', required: true },
  amount: { type: Number, default: 0, min: 0 },
  title: { type: String, default: '' },
  orderNumber: { type: String, default: '' }
}, { _id: false });

const feePaymentSchema = new mongoose.Schema({
  paymentNumber: { type: String, required: true, trim: true, unique: true },
  feeOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeOrder', default: null, index: true },
  source: {
    type: String,
    enum: ['finance_receipt', 'manual', 'gateway', 'migration'],
    default: 'finance_receipt'
  },
  sourceReceiptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceReceipt',
    default: undefined
  },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null, index: true },
  linkScope: { type: String, enum: ['membership', 'student'], default: 'membership', index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  payerType: {
    type: String,
    enum: ['student_guardian', 'student', 'sponsor', 'school', 'other'],
    default: 'student_guardian'
  },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  amount: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'AFN', trim: true },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'hawala', 'manual', 'gateway', 'other'],
    default: 'manual'
  },
  allocationMode: {
    type: String,
    enum: ['single_order', 'manual', 'auto_oldest_due', 'auto_selected'],
    default: 'single_order'
  },
  allocations: { type: [paymentAllocationSchema], default: [] },
  referenceNo: { type: String, default: '', trim: true },
  paidAt: { type: Date, default: Date.now, index: true },
  fileUrl: { type: String, default: '' },
  note: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  approvalStage: {
    type: String,
    enum: ['finance_manager_review', 'finance_lead_review', 'general_president_review', 'completed', 'rejected'],
    default: 'finance_manager_review'
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },
  rejectReason: { type: String, default: '' },
  approvalTrail: { type: [approvalTrailEntrySchema], default: [] },
  followUp: {
    assignedLevel: {
      type: String,
      enum: ['finance_manager', 'finance_lead', 'general_president'],
      default: 'finance_manager'
    },
    status: {
      type: String,
      enum: ['new', 'in_progress', 'on_hold', 'escalated', 'resolved'],
      default: 'new'
    },
    note: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: null },
    history: { type: [followUpHistorySchema], default: [] }
  }
}, { timestamps: true });

feePaymentSchema.pre('validate', function syncFeePaymentState() {
  if (typeof this.paymentNumber === 'string') this.paymentNumber = this.paymentNumber.trim().toUpperCase();
  if (typeof this.currency === 'string') this.currency = this.currency.trim().toUpperCase() || 'AFN';
  if (typeof this.referenceNo === 'string') this.referenceNo = this.referenceNo.trim();
  if (typeof this.fileUrl === 'string') this.fileUrl = this.fileUrl.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.reviewNote === 'string') this.reviewNote = this.reviewNote.trim();
  if (typeof this.rejectReason === 'string') this.rejectReason = this.rejectReason.trim();
  if (!this.sourceReceiptId) this.sourceReceiptId = undefined;
  this.amount = Math.max(0, Number(this.amount) || 0);
  this.payerType = String(this.payerType || 'student_guardian').trim() || 'student_guardian';
  this.allocationMode = String(this.allocationMode || '').trim() || (this.feeOrderId ? 'single_order' : 'manual');
  this.allocations = Array.isArray(this.allocations)
    ? this.allocations
        .map((item) => ({
          feeOrderId: item?.feeOrderId || null,
          amount: Math.max(0, Number(item?.amount) || 0),
          title: String(item?.title || '').trim(),
          orderNumber: String(item?.orderNumber || '').trim().toUpperCase()
        }))
        .filter((item) => item.feeOrderId && item.amount > 0)
    : [];

  if (!this.allocations.length && this.feeOrderId && this.amount > 0) {
    this.allocations = [{
      feeOrderId: this.feeOrderId,
      amount: this.amount,
      title: '',
      orderNumber: ''
    }];
  }

  if (!this.feeOrderId && this.allocations.length === 1) {
    this.feeOrderId = this.allocations[0].feeOrderId;
  }

  const allocationTotal = this.allocations.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
  if (!this.allocations.length) {
    this.invalidate('allocations', 'At least one fee order allocation is required.');
  } else if (Math.abs(allocationTotal - this.amount) > 0.009) {
    this.invalidate('allocations', 'Allocation total must match the payment amount.');
  }

  this.linkScope = deriveLinkScope({
    linkScope: this.linkScope,
    studentMembershipId: this.studentMembershipId,
    classId: this.classId
  });
});

feePaymentSchema.index({ sourceReceiptId: 1 }, { unique: true, sparse: true });
feePaymentSchema.index({ feeOrderId: 1, status: 1, paidAt: -1 });
feePaymentSchema.index({ studentMembershipId: 1, status: 1, paidAt: -1 });
feePaymentSchema.index({ linkScope: 1, status: 1, paidAt: -1 });
feePaymentSchema.index({ 'allocations.feeOrderId': 1, status: 1, paidAt: -1 });
feePaymentSchema.index({ receivedBy: 1, paidAt: -1, status: 1 });

module.exports = mongoose.model('FeePayment', feePaymentSchema);
