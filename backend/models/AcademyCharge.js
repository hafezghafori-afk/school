const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

// یک قلمِ بدهی برای یک ثبت‌نامِ آموزشگاه. هر ثبت‌نام به‌جای یک مبلغِ کل، N قلم دارد:
// شمولیت / اقساط / شارژِ ماهانه / دستی / جریمهٔ دیرکرد. مقادیرِ رول‌آپِ ثبت‌نام
// (totalPayable / paidAmount / balance) از همین اقلام بازمحاسبه می‌شوند
// (services/academyLedger.js).

const academyChargeSchema = new mongoose.Schema({
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyRegistration', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyStudent', required: true, index: true },
  kind: {
    type: String,
    enum: ['enrollment', 'installment', 'monthly', 'manual', 'late_fee'],
    default: 'manual',
    index: true
  },
  title: { type: String, default: '', trim: true },
  amount: { type: Number, default: 0, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  discountReason: { type: String, default: '', trim: true },
  // تاریخِ سررسید — رشتهٔ ISO میلادی مثل بقیهٔ تاریخ‌های آموزشگاه (YYYY-MM-DD)
  dueDate: { type: String, default: '', trim: true },
  // فقط برای kind=monthly: کلیدِ ماهِ شمسی «1405-07» — یکتا per ثبت‌نام، ضدِ دوبار شارژ
  periodKey: { type: String, default: '', trim: true, index: true },
  currency: { type: String, default: 'AFN', trim: true, uppercase: true },
  paidAmount: { type: Number, default: 0, min: 0 },
  balance: { type: Number, default: 0, min: 0 },
  // overdue حالتِ ذخیره‌شده نیست (به «امروز» وابسته است) — در سرویس/پاسخ به‌صورت isOverdue می‌آید
  status: { type: String, enum: ['pending', 'partial', 'paid', 'void'], default: 'pending', index: true },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  voidReason: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academyChargeSchema.pre('validate', function normalizeAcademyCharge() {
  this.title = String(this.title || '').trim();
  this.amount = Math.max(0, Number(this.amount || 0));
  this.discountAmount = Math.min(this.amount, Math.max(0, Number(this.discountAmount || 0)));
  this.discountReason = String(this.discountReason || '').trim();
  this.dueDate = String(this.dueDate || '').trim();
  this.periodKey = String(this.periodKey || '').trim();
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';
  this.paidAmount = Math.max(0, Number(this.paidAmount || 0));

  const net = Math.max(0, this.amount - this.discountAmount);
  this.balance = Math.max(0, Math.round((net - this.paidAmount) * 100) / 100);
  if (this.status !== 'void') {
    this.status = this.balance <= 0 && net > 0 ? 'paid' : this.paidAmount > 0 ? 'partial' : 'pending';
  }
});

// یک شارژِ ماهانه per (ثبت‌نام، ماه)
academyChargeSchema.index(
  { registrationId: 1, periodKey: 1 },
  { unique: true, partialFilterExpression: { kind: 'monthly', periodKey: { $gt: '' } } }
);

module.exports = academyConnection.model('AcademyCharge', academyChargeSchema);
