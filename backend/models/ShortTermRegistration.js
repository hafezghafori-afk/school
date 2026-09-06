const mongoose = require('mongoose');
const shortTermConnection = require('./shortTermConnection');

function addMonthsToDateKey(dateKey = '', months = 0) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? new Date(`${dateKey}T00:00:00.000Z`) : new Date();
  const result = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + Math.max(0, Number(months) || 0), base.getUTCDate()));
  return result.toISOString().slice(0, 10);
}

const shortTermRegistrationSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShortTermStudent', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShortTermClass', required: true, index: true },
  registrationDate: { type: String, default: '', trim: true },
  startDate: { type: String, default: '', trim: true },
  // "مدت شاگرد": how long this temporary student is enrolled for, in
  // months. endDate is derived from startDate + durationMonths so the UI
  // can flag a registration as overdue once endDate has passed - status is
  // still changed by hand (see PUT /registrations/:id/complete), duration
  // just tells the admin it's time to look at it.
  durationMonths: { type: Number, default: 1, min: 1 },
  endDate: { type: String, default: '', trim: true },
  feeAmount: { type: Number, default: 0, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  totalPayable: { type: Number, default: 0, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  balance: { type: Number, default: 0, min: 0 },
  paymentPlan: { type: String, enum: ['full', 'installment', 'monthly'], default: 'full' },
  // وقتی true، totalPayable/paidAmount/balance از ShortTermCharge رول‌آپ می‌شوند و
  // pre-validate آن‌ها را از feeAmount/discountAmount×durationMonths بازنمی‌نویسد.
  ledgerManaged: { type: Boolean, default: false },
  paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid', index: true },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active', index: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

shortTermRegistrationSchema.pre('validate', function normalizeShortTermRegistration() {
  this.registrationDate = String(this.registrationDate || '').trim() || new Date().toISOString().slice(0, 10);
  this.startDate = String(this.startDate || '').trim() || this.registrationDate;
  this.durationMonths = Math.max(1, Number(this.durationMonths || 1));
  this.endDate = addMonthsToDateKey(this.startDate, this.durationMonths);
  this.feeAmount = Math.max(0, Number(this.feeAmount || 0));
  this.discountAmount = Math.max(0, Number(this.discountAmount || 0));
  this.paidAmount = Math.max(0, Number(this.paidAmount || 0));
  if (this.ledgerManaged) {
    // مقادیر را services/shortTermLedger.js از قلم‌های ماهانه رول‌آپ کرده — فقط نرمال کن
    this.totalPayable = Math.max(0, Number(this.totalPayable || 0));
    this.balance = Math.max(0, Number(this.balance || 0));
  } else {
    // feeAmount/discountAmount مبلغِ *یک ماه* است؛ کلِ قابل‌پرداخت = یک ماه × مدت.
    // (دادهٔ پیش از دفترِ ماهانه، یا ثبت‌نامِ تازه پیش از ساختِ قلم‌ها.)
    this.totalPayable = Math.max(0, this.feeAmount - this.discountAmount) * this.durationMonths;
    this.balance = Math.max(0, this.totalPayable - this.paidAmount);
  }
  this.paymentStatus = this.balance <= 0 && this.totalPayable > 0
    ? 'paid'
    : this.paidAmount > 0
      ? 'partial'
      : 'unpaid';
  this.note = String(this.note || '').trim();
});

shortTermRegistrationSchema.index({ studentId: 1, classId: 1, status: 1 });

// ضدِ ثبت‌نامِ تکراری در سطحِ دیتابیس: حداکثر یک ثبت‌نامِ فعال per (شاگرد، صنف).
shortTermRegistrationSchema.index(
  { studentId: 1, classId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

module.exports = shortTermConnection.model('ShortTermRegistration', shortTermRegistrationSchema);
