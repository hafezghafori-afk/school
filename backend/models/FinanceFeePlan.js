const mongoose = require('mongoose');

const FINANCE_PLAN_TYPES = ['standard', 'charity', 'sibling', 'scholarship', 'special', 'semi_annual'];

function normalizePlanCode(value = '', fallback = 'STANDARD') {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalized || fallback;
}

function normalizeDateValue(value = null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const financeFeePlanSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  planCode: { type: String, default: 'STANDARD', trim: true, index: true },
  planType: {
    type: String,
    enum: FINANCE_PLAN_TYPES,
    default: 'standard',
    index: true
  },
  priority: { type: Number, default: 100, min: 0 },
  effectiveFrom: { type: Date, default: null, index: true },
  effectiveTo: { type: Date, default: null, index: true },
  isDefault: { type: Boolean, default: false, index: true },
  eligibilityRule: { type: String, default: '' },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  academicYear: { type: String, default: '' },
  term: { type: String, default: '' },
  grade: { type: String, default: '' },
  subject: { type: String, default: '' },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  billingFrequency: {
    type: String,
    enum: ['monthly', 'term', 'annual', 'custom'],
    default: 'term'
  },
  periodType: { type: String, enum: ['monthly', 'term'], default: 'term' },
  tuitionFee: { type: Number, default: 0, min: 0 },
  admissionFee: { type: Number, default: 0, min: 0 },
  examFee: { type: Number, default: 0, min: 0 },
  documentFee: { type: Number, default: 0, min: 0 },
  transportDefaultFee: { type: Number, default: 0, min: 0 },
  otherFee: { type: Number, default: 0, min: 0 },
  amount: { type: Number, default: 0, min: 0 },
  dueDay: { type: Number, default: 10, min: 1, max: 28 },
  currency: { type: String, default: 'AFN' },
  isActive: { type: Boolean, default: true },
  note: { type: String, default: '' }
}, { timestamps: true });

financeFeePlanSchema.pre('validate', function syncFinanceFeePlanState() {
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.eligibilityRule === 'string') this.eligibilityRule = this.eligibilityRule.trim();
  if (typeof this.academicYear === 'string') this.academicYear = this.academicYear.trim();
  if (typeof this.term === 'string') this.term = this.term.trim();
  if (typeof this.grade === 'string') this.grade = this.grade.trim();
  if (typeof this.subject === 'string') this.subject = this.subject.trim();
  if (typeof this.currency === 'string') this.currency = this.currency.trim().toUpperCase() || 'AFN';
  if (typeof this.note === 'string') this.note = this.note.trim();

  this.planType = FINANCE_PLAN_TYPES.includes(this.planType) ? this.planType : 'standard';
  this.planCode = normalizePlanCode(this.planCode, this.planType === 'standard' ? 'STANDARD' : String(this.planType || 'PLAN').toUpperCase());
  this.priority = Math.max(0, Number(this.priority != null ? this.priority : (this.planType === 'standard' ? 100 : 200)) || 0);
  this.effectiveFrom = normalizeDateValue(this.effectiveFrom);
  this.effectiveTo = normalizeDateValue(this.effectiveTo);
  if (this.effectiveFrom && this.effectiveTo && this.effectiveTo < this.effectiveFrom) {
    this.effectiveTo = this.effectiveFrom;
  }

  this.billingFrequency = ['monthly', 'term', 'annual', 'custom'].includes(this.billingFrequency)
    ? this.billingFrequency
    : (this.periodType === 'monthly' ? 'monthly' : 'term');
  this.periodType = this.billingFrequency === 'monthly' ? 'monthly' : 'term';

  this.tuitionFee = Math.max(0, Number(this.tuitionFee != null ? this.tuitionFee : this.amount) || 0);
  this.admissionFee = Math.max(0, Number(this.admissionFee) || 0);
  this.examFee = Math.max(0, Number(this.examFee) || 0);
  this.documentFee = Math.max(0, Number(this.documentFee) || 0);
  this.transportDefaultFee = Math.max(0, Number(this.transportDefaultFee) || 0);
  this.otherFee = Math.max(0, Number(this.otherFee) || 0);
  this.amount = this.tuitionFee;
  if (!this.isActive) {
    this.isDefault = false;
  }
});

financeFeePlanSchema.index({
  course: 1,
  academicYearId: 1,
  term: 1,
  billingFrequency: 1,
  planCode: 1
}, { unique: true });

financeFeePlanSchema.index({
  classId: 1,
  academicYearId: 1,
  term: 1,
  billingFrequency: 1,
  planCode: 1
}, {
  unique: true,
  partialFilterExpression: {
    classId: { $exists: true, $ne: null },
    academicYearId: { $exists: true, $ne: null }
  }
});

financeFeePlanSchema.index({
  classId: 1,
  academicYearId: 1,
  term: 1,
  billingFrequency: 1,
  isActive: 1,
  isDefault: 1,
  priority: 1,
  planType: 1
});

module.exports = mongoose.model('FinanceFeePlan', financeFeePlanSchema);
