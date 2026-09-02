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
  // وقتی true، totalPayable/paidAmount/balance از AcademyCharge رول‌آپ می‌شوند و
  // pre-validate آن‌ها را از feeAmount/discountAmount بازنمی‌نویسد.
  ledgerManaged: { type: Boolean, default: false },
  paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid', index: true },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active', index: true },
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

module.exports = academyConnection.model('AcademyRegistration', academyRegistrationSchema);
