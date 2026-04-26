const mongoose = require('mongoose');
const { deriveLinkScope } = require('../utils/financeLinkScope');
const { formatAfghanMonthYearLabel, replaceIranianSolarMonthNames } = require('../utils/afghanDate');
const {
  LINE_ITEM_TYPES,
  normalizeFinanceLineItems,
  buildFeeBreakdownFromLineItems,
  inferPrimaryOrderType
} = require('../utils/financeLineItems');

const installmentSchema = new mongoose.Schema({
  installmentNo: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  amount: { type: Number, default: 0, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['open', 'paid', 'overdue'], default: 'open' },
  paidAt: { type: Date, default: null }
}, { _id: false });

const adjustmentSchema = new mongoose.Schema({
  type: { type: String, enum: ['discount', 'waiver', 'penalty', 'manual'], default: 'manual' },
  amount: { type: Number, default: 0, min: 0 },
  reason: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const lineItemSchema = new mongoose.Schema({
  feeType: { type: String, enum: LINE_ITEM_TYPES, default: 'tuition' },
  label: { type: String, default: '' },
  sourcePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceFeePlan', default: null },
  periodKey: { type: String, default: '' },
  grossAmount: { type: Number, default: 0, min: 0 },
  reductionAmount: { type: Number, default: 0, min: 0 },
  penaltyAmount: { type: Number, default: 0, min: 0 },
  netAmount: { type: Number, default: 0, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  balanceAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['open', 'partial', 'paid', 'waived'], default: 'open' }
}, { _id: false });

const feeOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, trim: true, unique: true },
  title: { type: String, default: '', trim: true },
  orderType: {
    type: String,
    enum: ['tuition', 'admission', 'transport', 'exam', 'document', 'service', 'penalty', 'other'],
    default: 'tuition'
  },
  source: {
    type: String,
    enum: ['finance_bill', 'transport_plan', 'manual', 'migration', 'system'],
    default: 'finance_bill'
  },
  sourceBillId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceBill',
    default: null
  },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null, index: true },
  linkScope: { type: String, enum: ['membership', 'student'], default: 'membership', index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  assessmentPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', default: null, index: true },
  periodType: { type: String, enum: ['monthly', 'term', 'custom'], default: 'term' },
  periodLabel: { type: String, default: '', trim: true },
  currency: { type: String, default: 'AFN', trim: true },
  amountOriginal: { type: Number, default: 0, min: 0 },
  amountDue: { type: Number, default: 0, min: 0 },
  amountPaid: { type: Number, default: 0, min: 0 },
  outstandingAmount: { type: Number, default: 0, min: 0 },
  lineItems: { type: [lineItemSchema], default: [] },
  status: { type: String, enum: ['new', 'partial', 'paid', 'overdue', 'void'], default: 'new', index: true },
  issuedAt: { type: Date, default: Date.now, index: true },
  dueDate: { type: Date, default: null, index: true },
  paidAt: { type: Date, default: null },
  note: { type: String, default: '' },
  installments: { type: [installmentSchema], default: [] },
  adjustments: { type: [adjustmentSchema], default: [] },
  voidReason: { type: String, default: '' },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  voidedAt: { type: Date, default: null },
  lastReminderAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

feeOrderSchema.pre('validate', function syncFeeOrderState() {
  if (typeof this.orderNumber === 'string') this.orderNumber = this.orderNumber.trim().toUpperCase();
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.periodLabel === 'string') this.periodLabel = replaceIranianSolarMonthNames(this.periodLabel.trim());
  if (typeof this.currency === 'string') this.currency = this.currency.trim().toUpperCase() || 'AFN';
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.voidReason === 'string') this.voidReason = this.voidReason.trim();
  if (!this.title && this.orderNumber) {
    this.title = this.orderNumber;
  }
  this.amountOriginal = Math.max(0, Number(this.amountOriginal) || 0);
  this.amountPaid = Math.max(0, Number(this.amountPaid) || 0);
  this.lineItems = normalizeFinanceLineItems({
    lineItems: this.lineItems,
    amountOriginal: this.amountOriginal,
    adjustments: this.adjustments,
    amountPaid: this.amountPaid,
    defaultType: this.orderType
  });
  const derivedBreakdown = buildFeeBreakdownFromLineItems(this.lineItems);
  this.amountOriginal = Math.max(0, Object.values(derivedBreakdown).reduce((sum, item) => sum + (Number(item) || 0), 0));
  this.amountDue = Math.max(0, this.lineItems.reduce((sum, item) => sum + (Number(item?.netAmount) || 0), 0));
  this.outstandingAmount = Math.max(0, this.amountDue - this.amountPaid);
  this.orderType = inferPrimaryOrderType(this.lineItems, this.orderType);
  this.linkScope = deriveLinkScope({
    linkScope: this.linkScope,
    studentMembershipId: this.studentMembershipId,
    classId: this.classId
  });
  if (this.periodType === 'monthly' && this.dueDate) {
    this.periodLabel = formatAfghanMonthYearLabel(this.dueDate);
  }
  if (this.status !== 'void') {
    if (this.outstandingAmount <= 0) {
      this.status = 'paid';
      if (!this.paidAt) this.paidAt = new Date();
    } else if (this.amountPaid > 0) {
      this.status = 'partial';
      this.paidAt = null;
    } else if (this.dueDate && new Date(this.dueDate).getTime() < Date.now()) {
      this.status = 'overdue';
      this.paidAt = null;
    } else {
      this.status = 'new';
      this.paidAt = null;
    }
  }
});

feeOrderSchema.index({ sourceBillId: 1 }, { unique: true, sparse: true });
feeOrderSchema.index({ studentMembershipId: 1, status: 1, dueDate: 1 });
feeOrderSchema.index({ studentId: 1, academicYearId: 1, status: 1 });
feeOrderSchema.index({ classId: 1, academicYearId: 1, status: 1 });
feeOrderSchema.index({ linkScope: 1, status: 1, dueDate: 1 });

module.exports = mongoose.model('FeeOrder', feeOrderSchema);
