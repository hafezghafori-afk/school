const mongoose = require('mongoose');
const { deriveLinkScope } = require('../utils/financeLinkScope');
const { applySchoolOwnership } = require('../utils/schoolOwnership');

const discountSchema = new mongoose.Schema({
  feeOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeOrder', default: null, index: true },
  sourceBillId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceBill', default: null, index: true },
  sourceKey: { type: String, default: '', trim: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null, index: true },
  linkScope: { type: String, enum: ['membership', 'student'], default: 'membership', index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', default: null, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  discountType: { type: String, enum: ['discount', 'waiver', 'penalty', 'manual'], default: 'discount', index: true },
  targetScope: { type: String, enum: ['student', 'class'], default: 'student', index: true },
  groupKey: { type: String, default: '', trim: true, index: true },
  coverageMode: { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
  amount: { type: Number, default: 0, min: 0 },
  percentage: { type: Number, default: 0, min: 0, max: 100 },
  reason: { type: String, default: '' },
  durationMode: {
    type: String,
    enum: ['academic_year', 'custom_period', 'selected_bills'],
    default: 'academic_year',
    index: true
  },
  startDate: { type: Date, default: null, index: true },
  endDate: { type: Date, default: null, index: true },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
  source: { type: String, enum: ['finance_adjustment', 'manual', 'migration'], default: 'finance_adjustment' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

discountSchema.pre('validate', async function syncDiscountState() {
  if (typeof this.sourceKey === 'string') this.sourceKey = this.sourceKey.trim();
  if (typeof this.reason === 'string') this.reason = this.reason.trim();
  if (typeof this.groupKey === 'string') this.groupKey = this.groupKey.trim();
  this.targetScope = this.targetScope === 'class' ? 'class' : 'student';
  this.coverageMode = this.coverageMode === 'percent' ? 'percent' : 'fixed';
  this.percentage = Math.max(0, Math.min(100, Number(this.percentage) || 0));
  this.durationMode = ['academic_year', 'custom_period', 'selected_bills'].includes(this.durationMode)
    ? this.durationMode
    : 'academic_year';
  this.amount = Math.max(0, Number(this.amount) || 0);
  if (this.coverageMode === 'percent') this.amount = 0;
  if (this.startDate && Number.isNaN(new Date(this.startDate).getTime())) this.startDate = null;
  if (this.endDate && Number.isNaN(new Date(this.endDate).getTime())) this.endDate = null;
  if (this.startDate && this.endDate && new Date(this.endDate).getTime() < new Date(this.startDate).getTime()) {
    this.endDate = this.startDate;
  }
  this.linkScope = deriveLinkScope({
    linkScope: this.linkScope,
    studentMembershipId: this.studentMembershipId,
    classId: this.classId
  });
  await applySchoolOwnership(this);
});

discountSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });
discountSchema.index({ schoolId: 1, status: 1, discountType: 1 });
discountSchema.index({ feeOrderId: 1, status: 1, discountType: 1 });
discountSchema.index({ linkScope: 1, status: 1, discountType: 1 });

module.exports = mongoose.model('Discount', discountSchema);
