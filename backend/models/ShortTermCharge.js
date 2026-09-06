const mongoose = require('mongoose');
const shortTermConnection = require('./shortTermConnection');

// یک قلمِ بدهیِ ماهانه برای یک ثبت‌نامِ مرکزِ موقت. هر ثبت‌نام به‌تعدادِ
// durationMonths قلمِ «فیس ماهانه» دارد (یکی per ماهِ شمسی از ماهِ ثبت‌نام).
// پرداخت‌ها با allocations به این قلم‌ها می‌چسبند و مقادیرِ رول‌آپِ ثبت‌نام
// (totalPayable / paidAmount / balance) از همین قلم‌ها بازمحاسبه می‌شوند
// (services/shortTermLedger.js). الگو: models/AcademyCharge.js
const shortTermChargeSchema = new mongoose.Schema({
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShortTermRegistration', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShortTermStudent', required: true, index: true },
  kind: { type: String, enum: ['monthly', 'manual'], default: 'monthly', index: true },
  title: { type: String, default: '', trim: true },
  // کلیدِ ماهِ شمسی «1405-06» — یکتا per ثبت‌نام
  periodKey: { type: String, default: '', trim: true, index: true },
  amount: { type: Number, default: 0, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  // سررسیدِ میلادی YYYY-MM-DD
  dueDate: { type: String, default: '', trim: true },
  currency: { type: String, default: 'AFN', trim: true, uppercase: true },
  paidAmount: { type: Number, default: 0, min: 0 },
  balance: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['pending', 'partial', 'paid', 'void'], default: 'pending', index: true },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  voidReason: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

shortTermChargeSchema.pre('validate', function normalizeShortTermCharge() {
  this.title = String(this.title || '').trim();
  this.periodKey = String(this.periodKey || '').trim();
  this.amount = Math.max(0, Number(this.amount || 0));
  this.discountAmount = Math.min(this.amount, Math.max(0, Number(this.discountAmount || 0)));
  this.dueDate = String(this.dueDate || '').trim();
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';
  this.paidAmount = Math.max(0, Number(this.paidAmount || 0));

  const net = Math.max(0, this.amount - this.discountAmount);
  this.balance = Math.max(0, Math.round((net - this.paidAmount) * 100) / 100);
  if (this.status !== 'void') {
    this.status = this.balance <= 0 && net > 0 ? 'paid' : this.paidAmount > 0 ? 'partial' : 'pending';
  }
});

// یک قلمِ ماهانه per (ثبت‌نام، ماه)
shortTermChargeSchema.index(
  { registrationId: 1, periodKey: 1 },
  { unique: true, partialFilterExpression: { periodKey: { $gt: '' } } }
);

module.exports = shortTermConnection.model('ShortTermCharge', shortTermChargeSchema);
