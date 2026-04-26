const mongoose = require('mongoose');
const { deriveLinkScope } = require('../utils/financeLinkScope');
const { formatAfghanMonthYearLabel, replaceIranianSolarMonthNames } = require('../utils/afghanDate');
const {
  BREAKDOWN_KEYS,
  LINE_ITEM_TYPES,
  normalizeFinanceLineItems,
  buildFeeBreakdownFromLineItems,
  buildFeeScopesFromLineItems,
  roundMoney
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

const financeBillSchema = new mongoose.Schema({
  billNumber: { type: String, unique: true, required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null },
  linkScope: { type: String, enum: ['membership', 'student'], default: 'membership', index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  academicYear: { type: String, default: '' },
  term: { type: String, default: '' },
  periodType: { type: String, enum: ['monthly', 'term', 'custom'], default: 'term' },
  periodLabel: { type: String, default: '' },
  currency: { type: String, default: 'AFN' },
  amountOriginal: { type: Number, default: 0, min: 0 },
  amountDue: { type: Number, default: 0, min: 0 },
  amountPaid: { type: Number, default: 0, min: 0 },
  feeScopes: {
    type: [{
      type: String,
      enum: BREAKDOWN_KEYS
    }],
    default: ['tuition']
  },
  feeBreakdown: {
    tuition: { type: Number, default: 0, min: 0 },
    admission: { type: Number, default: 0, min: 0 },
    transport: { type: Number, default: 0, min: 0 },
    exam: { type: Number, default: 0, min: 0 },
    document: { type: Number, default: 0, min: 0 },
    service: { type: Number, default: 0, min: 0 },
    other: { type: Number, default: 0, min: 0 }
  },
  lineItems: { type: [lineItemSchema], default: [] },
  status: { type: String, enum: ['new', 'partial', 'paid', 'overdue', 'void'], default: 'new', index: true },
  issuedAt: { type: Date, default: Date.now, index: true },
  dueDate: { type: Date, required: true, index: true },
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

financeBillSchema.pre('validate', function syncFinanceBillState() {
  if (typeof this.billNumber === 'string') this.billNumber = this.billNumber.trim().toUpperCase();
  if (typeof this.academicYear === 'string') this.academicYear = this.academicYear.trim();
  if (typeof this.term === 'string') this.term = this.term.trim();
  if (typeof this.periodLabel === 'string') this.periodLabel = replaceIranianSolarMonthNames(this.periodLabel.trim());
  if (typeof this.currency === 'string') this.currency = this.currency.trim().toUpperCase() || 'AFN';
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.voidReason === 'string') this.voidReason = this.voidReason.trim();
  this.amountOriginal = Math.max(0, roundMoney(this.amountOriginal));
  this.amountPaid = Math.max(0, roundMoney(this.amountPaid));
  this.linkScope = deriveLinkScope({
    linkScope: this.linkScope,
    studentMembershipId: this.studentMembershipId,
    classId: this.classId
  });
  this.lineItems = normalizeFinanceLineItems({
    lineItems: this.lineItems,
    feeBreakdown: this.feeBreakdown,
    feeScopes: this.feeScopes,
    amountOriginal: this.amountOriginal,
    adjustments: this.adjustments,
    amountPaid: this.amountPaid,
    defaultType: 'tuition'
  });
  this.feeBreakdown = buildFeeBreakdownFromLineItems(this.lineItems);
  this.feeScopes = buildFeeScopesFromLineItems(this.lineItems);
  this.amountOriginal = roundMoney(Object.values(this.feeBreakdown || {}).reduce((sum, item) => sum + (Number(item) || 0), 0));
  this.amountDue = roundMoney(this.lineItems.reduce((sum, item) => sum + (Number(item?.netAmount) || 0), 0));
  if (this.periodType === 'monthly' && this.dueDate) {
    this.periodLabel = formatAfghanMonthYearLabel(this.dueDate);
  }
});

financeBillSchema.index({ student: 1, course: 1, academicYear: 1, term: 1 });
financeBillSchema.index({ studentMembershipId: 1, status: 1, dueDate: 1 });
financeBillSchema.index({ studentId: 1, academicYearId: 1, status: 1 });
financeBillSchema.index({ classId: 1, academicYearId: 1, status: 1 });
financeBillSchema.index({ linkScope: 1, status: 1, dueDate: 1 });
financeBillSchema.index({ status: 1, dueDate: 1 });

financeBillSchema.post('save', function syncStudentFinanceCanonical(doc) {
  setImmediate(() => {
    const { syncStudentFinanceFromFinanceBill } = require('../utils/studentFinanceSync');
    syncStudentFinanceFromFinanceBill(doc && doc._id ? doc._id : doc).catch(() => {});
  });
});

module.exports = mongoose.model('FinanceBill', financeBillSchema);
