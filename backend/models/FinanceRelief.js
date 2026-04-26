const mongoose = require('mongoose');
const { deriveLinkScope } = require('../utils/financeLinkScope');
const {
  RELIEF_TYPES,
  RELIEF_SCOPES,
  RELIEF_COVERAGE_MODES,
  normalizeReliefType,
  normalizeReliefScope,
  normalizeCoverageMode,
  roundMoney,
  normalizeText
} = require('../utils/financeRelief');

const financeReliefSchema = new mongoose.Schema({
  sourceModel: {
    type: String,
    enum: ['discount', 'fee_exemption', 'manual', 'migration', 'system'],
    default: 'manual',
    index: true
  },
  sourceKey: { type: String, default: '', trim: true },
  sourceDiscountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Discount', default: null, index: true },
  sourceExemptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeExemption', default: null, index: true },
  feeOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeOrder', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', required: true, index: true },
  linkScope: { type: String, enum: ['membership', 'student'], default: 'membership', index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  reliefType: { type: String, enum: RELIEF_TYPES, default: 'manual', index: true },
  scope: { type: String, enum: RELIEF_SCOPES, default: 'all', index: true },
  coverageMode: { type: String, enum: RELIEF_COVERAGE_MODES, default: 'fixed' },
  amount: { type: Number, default: 0, min: 0 },
  percentage: { type: Number, default: 0, min: 0, max: 100 },
  sponsorName: { type: String, default: '' },
  reason: { type: String, default: '' },
  note: { type: String, default: '' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
  startDate: { type: Date, default: null, index: true },
  endDate: { type: Date, default: null, index: true },
  lastReminderAt: { type: Date, default: null, index: true },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: '' },
  sourceUpdatedAt: { type: Date, default: null }
}, { timestamps: true });

financeReliefSchema.pre('validate', function syncFinanceReliefState() {
  if (typeof this.sourceKey === 'string') this.sourceKey = this.sourceKey.trim();
  if (typeof this.sponsorName === 'string') this.sponsorName = this.sponsorName.trim();
  if (typeof this.reason === 'string') this.reason = this.reason.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.cancelReason === 'string') this.cancelReason = this.cancelReason.trim();

  this.reliefType = normalizeReliefType(this.reliefType, 'manual');
  this.scope = normalizeReliefScope(this.scope, 'all');
  this.coverageMode = normalizeCoverageMode(
    this.coverageMode,
    this.reliefType === 'free_student' || this.reliefType === 'scholarship_full' ? 'full' : 'fixed'
  );
  this.amount = roundMoney(this.amount);
  this.percentage = Math.max(0, Math.min(100, Number(this.percentage) || 0));
  this.linkScope = deriveLinkScope({
    linkScope: this.linkScope,
    studentMembershipId: this.studentMembershipId,
    classId: this.classId
  });

  if (this.coverageMode === 'full') {
    this.amount = 0;
    this.percentage = 100;
  }

  if (this.coverageMode === 'percent' && this.percentage <= 0) {
    this.percentage = this.amount > 0 ? Math.min(100, this.amount) : 0;
  }

  if (this.status === 'cancelled') {
    if (!this.cancelledAt) this.cancelledAt = new Date();
  } else {
    this.cancelledAt = null;
    this.cancelReason = '';
    this.cancelledBy = null;
  }

  if (this.startDate && Number.isNaN(new Date(this.startDate).getTime())) this.startDate = null;
  if (this.endDate && Number.isNaN(new Date(this.endDate).getTime())) this.endDate = null;
  if (this.startDate && this.endDate && new Date(this.endDate).getTime() < new Date(this.startDate).getTime()) {
    this.endDate = this.startDate;
  }
  if (this.sourceUpdatedAt && Number.isNaN(new Date(this.sourceUpdatedAt).getTime())) this.sourceUpdatedAt = null;
});

financeReliefSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });
financeReliefSchema.index({ studentMembershipId: 1, status: 1, reliefType: 1, scope: 1 });
financeReliefSchema.index({ classId: 1, academicYearId: 1, status: 1, reliefType: 1 });
financeReliefSchema.index({ linkScope: 1, status: 1, reliefType: 1 });
financeReliefSchema.index({ status: 1, endDate: 1, lastReminderAt: 1 });

module.exports = mongoose.model('FinanceRelief', financeReliefSchema);
