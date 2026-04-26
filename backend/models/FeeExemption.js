const mongoose = require('mongoose');
const { deriveLinkScope } = require('../utils/financeLinkScope');

const feeExemptionSchema = new mongoose.Schema({
  studentMembershipId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentMembership',
    required: true,
    index: true
  },
  linkScope: {
    type: String,
    enum: ['membership', 'student'],
    default: 'membership',
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentCore',
    default: null,
    index: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  exemptionType: {
    type: String,
    enum: ['full', 'partial'],
    default: 'full',
    index: true
  },
  scope: {
    type: String,
    enum: ['tuition', 'admission', 'exam', 'transport', 'document', 'other', 'all'],
    default: 'all',
    index: true
  },
  amount: {
    type: Number,
    default: 0,
    min: 0
  },
  percentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  reason: {
    type: String,
    default: ''
  },
  note: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'cancelled'],
    default: 'active',
    index: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  cancelReason: {
    type: String,
    default: ''
  }
}, { timestamps: true });

feeExemptionSchema.pre('validate', function syncFeeExemptionState() {
  if (typeof this.reason === 'string') this.reason = this.reason.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.cancelReason === 'string') this.cancelReason = this.cancelReason.trim();

  this.amount = Math.max(0, Number(this.amount) || 0);
  this.percentage = Math.max(0, Math.min(100, Number(this.percentage) || 0));
  this.linkScope = deriveLinkScope({
    linkScope: this.linkScope,
    studentMembershipId: this.studentMembershipId,
    classId: this.classId
  });

  if (this.exemptionType === 'full') {
    this.amount = 0;
    this.percentage = 100;
  }

  if (this.status === 'cancelled') {
    if (!this.cancelledAt) this.cancelledAt = new Date();
  } else {
    this.cancelledAt = null;
    this.cancelReason = '';
    this.cancelledBy = null;
  }
});

feeExemptionSchema.index({ studentMembershipId: 1, status: 1, scope: 1 });
feeExemptionSchema.index({ classId: 1, academicYearId: 1, status: 1 });
feeExemptionSchema.index({ linkScope: 1, status: 1, scope: 1 });

module.exports = mongoose.model('FeeExemption', feeExemptionSchema);
