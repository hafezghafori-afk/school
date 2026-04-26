const mongoose = require('mongoose');
const { deriveLinkScope } = require('../utils/financeLinkScope');

const discountSchema = new mongoose.Schema({
  feeOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeOrder', default: null, index: true },
  sourceBillId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceBill', default: null, index: true },
  sourceKey: { type: String, default: '', trim: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null, index: true },
  linkScope: { type: String, enum: ['membership', 'student'], default: 'membership', index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  discountType: { type: String, enum: ['discount', 'waiver', 'penalty', 'manual'], default: 'discount', index: true },
  amount: { type: Number, default: 0, min: 0 },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
  source: { type: String, enum: ['finance_adjustment', 'manual', 'migration'], default: 'finance_adjustment' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

discountSchema.pre('validate', function syncDiscountState() {
  if (typeof this.sourceKey === 'string') this.sourceKey = this.sourceKey.trim();
  if (typeof this.reason === 'string') this.reason = this.reason.trim();
  this.amount = Math.max(0, Number(this.amount) || 0);
  this.linkScope = deriveLinkScope({
    linkScope: this.linkScope,
    studentMembershipId: this.studentMembershipId,
    classId: this.classId
  });
});

discountSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });
discountSchema.index({ feeOrderId: 1, status: 1, discountType: 1 });
discountSchema.index({ linkScope: 1, status: 1, discountType: 1 });

module.exports = mongoose.model('Discount', discountSchema);
