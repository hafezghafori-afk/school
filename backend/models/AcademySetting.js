const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academySettingSchema = new mongoose.Schema({
  name: { type: String, default: 'آموزشگاه', trim: true },
  logoUrl: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true },
  currency: { type: String, default: 'AFN', trim: true },
  invoicePrefix: { type: String, default: 'ACD', trim: true, uppercase: true },
  studentCodePrefix: { type: String, default: 'AST', trim: true, uppercase: true },
  invoiceFooter: { type: String, default: 'تشکر از پرداخت شما', trim: true },
  receiptSize: { type: String, enum: ['a4', 'half', 'small'], default: 'half' },
  // روزِ ماهِ شمسی که شارژِ ماهانه سررسید می‌شود (پیش‌فرض ۲۰)
  monthlyChargeDueDay: { type: Number, default: 20, min: 1, max: 31 },
  // پالیسیِ کمیسیونِ استاد (فاز ۲) — پایه/درصد؛ فعلاً فقط نگه‌داری می‌شود
  teacherCommissionBase: { type: String, enum: ['collected', 'billed'], default: 'collected' },
  teacherCommissionPercent: { type: Number, default: 0, min: 0, max: 100 },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academySettingSchema.pre('validate', function normalizeAcademySetting() {
  this.name = String(this.name || '').trim() || 'آموزشگاه';
  this.logoUrl = String(this.logoUrl || '').trim();
  this.address = String(this.address || '').trim();
  this.phone = String(this.phone || '').trim();
  this.email = String(this.email || '').trim();
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';
  this.invoicePrefix = String(this.invoicePrefix || 'ACD').trim().toUpperCase() || 'ACD';
  this.studentCodePrefix = String(this.studentCodePrefix || 'AST').trim().toUpperCase() || 'AST';
  this.invoiceFooter = String(this.invoiceFooter || '').trim();
  this.monthlyChargeDueDay = Math.min(31, Math.max(1, Math.round(Number(this.monthlyChargeDueDay || 20)) || 20));
  this.teacherCommissionPercent = Math.min(100, Math.max(0, Number(this.teacherCommissionPercent || 0)));
});

module.exports = academyConnection.model('AcademySetting', academySettingSchema);
