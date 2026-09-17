const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academyRegistrationSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyStudent', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyCourse', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClass', required: true, index: true },
  registrationDate: { type: String, default: '', trim: true },
  startDate: { type: String, default: '', trim: true },
  endDate: { type: String, default: '', trim: true },
  feeAmount: { type: Number, default: 0, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  totalPayable: { type: Number, default: 0, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  balance: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'AFN', trim: true, uppercase: true },
  paymentPlan: { type: String, enum: ['full', 'installment', 'monthly'], default: 'full' },
  // فقط برای paymentPlan=monthly: مبلغِ ثابتِ هر ماه
  monthlyFee: { type: Number, default: 0, min: 0 },
  // آخرین ماهِ شمسیِ شارژشده «1405-07» — ضدِ شارژِ عقب‌افتاده
  lastMonthlyChargeKey: { type: String, default: '', trim: true },
  // فقط برای paymentPlan=monthly: تخفیفِ خودکاری که هنگامِ «صدور بل» روی بلِ ماه‌های
  // تازه می‌نشیند. untilMonth خالی = ادامه‌دار. تخفیفِ بل‌های موجود روی خودِ بل است.
  monthlyDiscount: {
    amount: { type: Number, default: 0, min: 0 },
    untilMonth: { type: String, default: '', trim: true },
    discountType: { type: String, enum: ['', 'sibling', 'scholarship', 'staff', 'hardship', 'other'], default: '' },
    discountReason: { type: String, default: '', trim: true },
    setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    setAt: { type: Date, default: null }
  },
  monthlyDiscountHistory: {
    type: [new mongoose.Schema({
      at: { type: Date, default: Date.now },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      from: { type: Number, default: 0, min: 0 },
      to: { type: Number, default: 0, min: 0 },
      untilMonth: { type: String, default: '', trim: true },
      discountType: { type: String, default: '' },
      discountReason: { type: String, default: '', trim: true }
    }, { _id: false })],
    default: []
  },
  // وقتی true، totalPayable/paidAmount/balance از AcademyCharge رول‌آپ می‌شوند و
  // pre-validate آن‌ها را از feeAmount/discountAmount بازنمی‌نویسد.
  ledgerManaged: { type: Boolean, default: false },
  paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid', index: true },
  // paused = توقفِ موقت. merged = یکی از چند ثبت‌نامِ تکراری که در مهاجرت در
  // ثبت‌نامِ کانونیِ همان شاگرد ادغام شد؛ برای تاریخچه می‌ماند ولی از جریان کنار است.
  status: { type: String, enum: ['active', 'paused', 'completed', 'cancelled', 'merged'], default: 'active', index: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academyRegistrationSchema.pre('validate', function normalizeAcademyRegistration() {
  this.registrationDate = String(this.registrationDate || '').trim() || new Date().toISOString().slice(0, 10);
  this.startDate = String(this.startDate || '').trim();
  this.endDate = String(this.endDate || '').trim();
  this.feeAmount = Math.max(0, Number(this.feeAmount || 0));
  this.discountAmount = Math.max(0, Number(this.discountAmount || 0));
  this.monthlyFee = Math.max(0, Number(this.monthlyFee || 0));
  if (this.monthlyDiscount) {
    this.monthlyDiscount.amount = Math.max(0, Number(this.monthlyDiscount.amount || 0));
    const until = String(this.monthlyDiscount.untilMonth || '').trim();
    this.monthlyDiscount.untilMonth = /^\d{3,4}-(0[1-9]|1[0-2])$/.test(until) ? until : '';
  }
  this.paidAmount = Math.max(0, Number(this.paidAmount || 0));
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';

  if (this.ledgerManaged) {
    // مقادیر را services/academyLedger.js از اقلامِ بدهی رول‌آپ کرده — فقط نرمال کن
    this.totalPayable = Math.max(0, Number(this.totalPayable || 0));
    this.balance = Math.max(0, Number(this.balance || 0));
  } else {
    // ثبت‌نامِ تازه پیش از نوشتنِ قلمِ شمولیت، یا دادهٔ پیش از مهاجرت
    this.totalPayable = Math.max(0, this.feeAmount - this.discountAmount);
    this.balance = Math.max(0, this.totalPayable - this.paidAmount);
  }

  this.paymentStatus = this.balance <= 0 && this.totalPayable > 0
    ? 'paid'
    : this.paidAmount > 0
      ? 'partial'
      : 'unpaid';
  this.note = String(this.note || '').trim();
});

academyRegistrationSchema.index({ studentId: 1, classId: 1, status: 1 });

// ضدِ ثبت‌نامِ تکراری در سطحِ دیتابیس: حداکثر یک ثبت‌نامِ فعال per (شاگرد، صنف).
academyRegistrationSchema.index(
  { studentId: 1, classId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

module.exports = academyConnection.model('AcademyRegistration', academyRegistrationSchema);
