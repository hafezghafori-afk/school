const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

// یک دورهٔ محاسبهٔ معاش/کمیسیونِ استاد. periodKey = ماهِ شمسی «1405-07».
const academyPayrollRunSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyTeacher', required: true, index: true },
  periodKey: { type: String, required: true, trim: true, index: true },
  baseAmount: { type: Number, default: 0, min: 0 },          // معاشِ ثابت
  commissionBase: { type: String, enum: ['collected', 'billed'], default: 'collected' },
  commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
  commissionOn: { type: Number, default: 0, min: 0 },         // مبلغی که درصد رویش حساب شد
  commissionAmount: { type: Number, default: 0, min: 0 },
  deductions: { type: Number, default: 0, min: 0 },
  netAmount: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'AFN', trim: true, uppercase: true },
  status: { type: String, enum: ['draft', 'paid'], default: 'draft', index: true },
  paidExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyExpense', default: null },
  paidAt: { type: Date, default: null },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academyPayrollRunSchema.pre('validate', function normalizeAcademyPayrollRun() {
  this.baseAmount = Math.max(0, Number(this.baseAmount || 0));
  this.commissionPercent = Math.min(100, Math.max(0, Number(this.commissionPercent || 0)));
  this.commissionOn = Math.max(0, Number(this.commissionOn || 0));
  this.commissionAmount = Math.max(0, Number(this.commissionAmount || 0));
  this.deductions = Math.max(0, Number(this.deductions || 0));
  this.netAmount = Math.max(0, Math.round((this.baseAmount + this.commissionAmount - this.deductions) * 100) / 100);
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';
  this.note = String(this.note || '').trim();
});

academyPayrollRunSchema.index({ teacherId: 1, periodKey: 1 }, { unique: true });

module.exports = academyConnection.model('AcademyPayrollRun', academyPayrollRunSchema);
