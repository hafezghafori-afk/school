const mongoose = require('mongoose');
const { deriveLinkScope } = require('../utils/financeLinkScope');
const { applySchoolOwnership } = require('../utils/schoolOwnership');
const { roundMoney } = require('../utils/financeLineItems');

// A FinanceRefund is opened whenever money was collected (a bill/order shows
// amountPaid > 0) for a billing period that turned out to belong to a
// student whose membership had already ended (dropped/transferred/expelled/
// graduated) before that period started. It gives finance staff an explicit,
// auditable place to review the case and pay the money back, instead of the
// bill silently sitting there marked "paid".
const REFUND_REASONS = Object.freeze([
  'membership_ended', // student was already dropped/transferred/expelled/graduated before the billed period
  'overpayment', // student paid more than what was owed
  'billing_error', // bill/order was issued or approved by mistake
  'other'
]);

const REFUND_STATUSES = Object.freeze(['pending_review', 'approved', 'rejected', 'paid']);
const OPEN_REFUND_STATUSES = Object.freeze(['pending_review', 'approved']);

const REFUND_METHODS = Object.freeze(['cash', 'bank_transfer', 'hawala', 'credit_next_bill', 'other']);

const DETECTION_SOURCES = Object.freeze(['auto_lifecycle', 'auto_backfill', 'auto_anomaly', 'manual']);

const financeRefundSchema = new mongoose.Schema({
  refundNumber: { type: String, unique: true, required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null, index: true },
  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceBill', default: null, index: true },
  feeOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeOrder', default: null, index: true },
  sourceReceipt: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceReceipt', default: null, index: true },
  linkScope: { type: String, enum: ['membership', 'student'], default: 'membership', index: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', default: null, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },

  currency: { type: String, default: 'AFN', trim: true },
  amount: { type: Number, required: true, min: 0 },

  reason: { type: String, enum: REFUND_REASONS, default: 'membership_ended' },
  reasonNote: { type: String, default: '' },
  detectionSource: { type: String, enum: DETECTION_SOURCES, default: 'manual' },

  status: { type: String, enum: REFUND_STATUSES, default: 'pending_review', index: true },

  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },
  rejectReason: { type: String, default: '' },
  approvalTrail: {
    type: [{
      action: { type: String, enum: ['approve', 'reject'], required: true },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      at: { type: Date, default: Date.now },
      note: { type: String, default: '' },
      reason: { type: String, default: '' }
    }],
    default: []
  },

  refundMethod: { type: String, enum: REFUND_METHODS, default: undefined },
  proofReference: { type: String, default: '' },
  paidAt: { type: Date, default: null },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  treasuryTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceTreasuryTransaction', default: null },

  note: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, optimisticConcurrency: true });

financeRefundSchema.pre('validate', async function syncFinanceRefundState() {
  if (typeof this.refundNumber === 'string') this.refundNumber = this.refundNumber.trim().toUpperCase();
  if (typeof this.currency === 'string') this.currency = this.currency.trim().toUpperCase() || 'AFN';
  if (typeof this.reasonNote === 'string') this.reasonNote = this.reasonNote.trim();
  if (typeof this.reviewNote === 'string') this.reviewNote = this.reviewNote.trim();
  if (typeof this.rejectReason === 'string') this.rejectReason = this.rejectReason.trim();
  if (typeof this.proofReference === 'string') this.proofReference = this.proofReference.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  this.amount = roundMoney(this.amount);
  this.linkScope = deriveLinkScope({
    linkScope: this.linkScope,
    studentMembershipId: this.studentMembershipId,
    classId: this.classId
  });
  if (this.status !== 'rejected') this.rejectReason = '';
  if (this.status !== 'paid') {
    this.paidAt = this.paidAt || null;
  }
  await applySchoolOwnership(this);
});

financeRefundSchema.index({ studentMembershipId: 1, status: 1 });
financeRefundSchema.index({ bill: 1, status: 1 });
financeRefundSchema.index({ feeOrder: 1, status: 1 });
financeRefundSchema.index({ schoolId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('FinanceRefund', financeRefundSchema);
module.exports.REFUND_REASONS = REFUND_REASONS;
module.exports.REFUND_STATUSES = REFUND_STATUSES;
module.exports.OPEN_REFUND_STATUSES = OPEN_REFUND_STATUSES;
module.exports.REFUND_METHODS = REFUND_METHODS;
module.exports.DETECTION_SOURCES = DETECTION_SOURCES;
