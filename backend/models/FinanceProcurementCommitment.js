const mongoose = require('mongoose');

const PROCUREMENT_APPROVAL_STAGES = [
  'draft',
  'finance_manager_review',
  'finance_lead_review',
  'general_president_review',
  'approved',
  'rejected',
  'cancelled'
];

const procurementApprovalTrailSchema = new mongoose.Schema({
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

const procurementSettlementSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'AFN', trim: true },
  settlementDate: { type: Date, required: true, index: true },
  treasuryAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceTreasuryAccount',
    default: null
  },
  treasuryTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceTreasuryTransaction',
    default: null
  },
  referenceNo: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const financeProcurementCommitmentSchema = new mongoose.Schema({
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
  treasuryAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceTreasuryAccount',
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
  procurementType: {
    type: String,
    enum: ['vendor_commitment', 'purchase_order', 'service_agreement', 'other'],
    default: 'vendor_commitment'
  },
  title: { type: String, required: true, trim: true },
  vendorName: { type: String, required: true, trim: true, index: true },
  description: { type: String, default: '', trim: true },
  committedAmount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'AFN', trim: true },
  requestDate: { type: Date, required: true, index: true },
  expectedDeliveryDate: { type: Date, default: null },
  referenceNo: { type: String, default: '', trim: true },
  paymentTerms: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  settlements: {
    type: [procurementSettlementSchema],
    default: []
  },
  settledAmount: { type: Number, default: 0, min: 0 },
  settlementCount: { type: Number, default: 0, min: 0 },
  lastSettledAt: { type: Date, default: null },
  lastSettledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'approved', 'rejected', 'cancelled'],
    default: 'draft',
    index: true
  },
  approvalStage: {
    type: String,
    enum: PROCUREMENT_APPROVAL_STAGES,
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
    type: [procurementApprovalTrailSchema],
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

financeProcurementCommitmentSchema.pre('validate', function syncProcurementCommitmentState() {
  if (typeof this.category === 'string') this.category = this.category.trim().toLowerCase();
  if (typeof this.subCategory === 'string') this.subCategory = this.subCategory.trim();
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.vendorName === 'string') this.vendorName = this.vendorName.trim();
  if (typeof this.description === 'string') this.description = this.description.trim();
  if (typeof this.currency === 'string') this.currency = this.currency.trim().toUpperCase() || 'AFN';
  if (typeof this.referenceNo === 'string') this.referenceNo = this.referenceNo.trim();
  if (typeof this.paymentTerms === 'string') this.paymentTerms = this.paymentTerms.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.rejectReason === 'string') this.rejectReason = this.rejectReason.trim();

  this.committedAmount = Math.max(0, Number(this.committedAmount) || 0);
  this.settlements = (Array.isArray(this.settlements) ? this.settlements : [])
    .map((item) => {
      const amount = Math.max(0, Number(item?.amount || 0));
      const settlementDate = item?.settlementDate ? new Date(item.settlementDate) : null;
      if (!amount || !settlementDate || Number.isNaN(settlementDate.getTime())) return null;
      return {
        ...item,
        amount,
        currency: String(item?.currency || this.currency || 'AFN').trim().toUpperCase() || 'AFN',
        settlementDate,
        referenceNo: String(item?.referenceNo || '').trim(),
        note: String(item?.note || '').trim()
      };
    })
    .filter(Boolean);
  this.settledAmount = Number(this.settlements.reduce((sum, item) => sum + Number(item?.amount || 0), 0).toFixed(2));
  this.settlementCount = this.settlements.length;
  const latestSettlement = this.settlements.reduce((latest, item) => {
    if (!item?.settlementDate) return latest;
    if (!latest) return item;
    return new Date(item.settlementDate).getTime() >= new Date(latest.settlementDate).getTime()
      ? item
      : latest;
  }, null);
  this.lastSettledAt = latestSettlement?.settlementDate || null;
  this.lastSettledBy = latestSettlement?.createdBy || null;
  if (!Array.isArray(this.approvalTrail)) this.approvalTrail = [];

  if (this.status === 'pending_review') {
    if (!['finance_manager_review', 'finance_lead_review', 'general_president_review'].includes(this.approvalStage)) {
      this.approvalStage = 'finance_manager_review';
    }
    if (!this.submittedAt) this.submittedAt = new Date();
  } else if (this.status === 'approved') {
    this.approvalStage = 'approved';
    if (!this.submittedAt) this.submittedAt = new Date();
    if (!this.approvedAt) this.approvedAt = new Date();
  } else if (this.status === 'rejected') {
    this.approvalStage = 'rejected';
    if (!this.submittedAt) this.submittedAt = new Date();
    if (!this.rejectedAt) this.rejectedAt = new Date();
  } else if (this.status === 'cancelled') {
    this.approvalStage = 'cancelled';
  } else {
    this.status = 'draft';
    this.approvalStage = 'draft';
    this.submittedAt = null;
    this.submittedBy = null;
  }

  if (this.status !== 'approved') {
    this.approvedAt = null;
    this.approvedBy = null;
  }
  if (this.status !== 'rejected') {
    this.rejectedAt = null;
    this.rejectedBy = null;
    this.rejectReason = '';
  }
});

financeProcurementCommitmentSchema.index({ financialYearId: 1, status: 1, requestDate: -1 });
financeProcurementCommitmentSchema.index({ financialYearId: 1, approvalStage: 1, createdAt: -1 });
financeProcurementCommitmentSchema.index({ academicYearId: 1, classId: 1, status: 1 });
financeProcurementCommitmentSchema.index({ vendorName: 1, status: 1, requestDate: -1 });
financeProcurementCommitmentSchema.index({ 'settlements.treasuryTransactionId': 1 });

module.exports = mongoose.model('FinanceProcurementCommitment', financeProcurementCommitmentSchema);
