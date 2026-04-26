const mongoose = require('mongoose');
const { deriveLinkScope } = require('../utils/financeLinkScope');

const financeReceiptSchema = new mongoose.Schema({
  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceBill', required: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null },
  linkScope: { type: String, enum: ['membership', 'student'], default: 'membership', index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  amount: { type: Number, default: 0, min: 0 },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'hawala', 'manual', 'other'],
    default: 'manual'
  },
  referenceNo: { type: String, default: '' },
  paidAt: { type: Date, default: Date.now },
  fileUrl: { type: String, default: '' },
  note: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  approvalStage: {
    type: String,
    enum: ['finance_manager_review', 'finance_lead_review', 'general_president_review', 'completed', 'rejected'],
    default: 'finance_manager_review',
    index: true
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },
  rejectReason: { type: String, default: '' },
  approvalTrail: {
    type: [{
      level: { type: String, enum: ['finance_manager', 'finance_lead', 'general_president'], required: true },
      action: { type: String, enum: ['approve', 'reject'], required: true },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      at: { type: Date, default: Date.now },
      note: { type: String, default: '' },
      reason: { type: String, default: '' }
    }],
    default: []
  },
  followUp: {
    assignedLevel: {
      type: String,
      enum: ['finance_manager', 'finance_lead', 'general_president'],
      default: 'finance_manager'
    },
    status: {
      type: String,
      enum: ['new', 'in_progress', 'on_hold', 'escalated', 'resolved'],
      default: 'new'
    },
    note: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: null },
    history: {
      type: [{
        assignedLevel: { type: String, enum: ['finance_manager', 'finance_lead', 'general_president'], required: true },
        status: { type: String, enum: ['new', 'in_progress', 'on_hold', 'escalated', 'resolved'], required: true },
        note: { type: String, default: '' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        updatedAt: { type: Date, default: Date.now }
      }],
      default: []
    }
  }
}, { timestamps: true });

financeReceiptSchema.pre('validate', function syncFinanceReceiptState() {
  if (typeof this.referenceNo === 'string') this.referenceNo = this.referenceNo.trim();
  if (typeof this.fileUrl === 'string') this.fileUrl = this.fileUrl.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.reviewNote === 'string') this.reviewNote = this.reviewNote.trim();
  if (typeof this.rejectReason === 'string') this.rejectReason = this.rejectReason.trim();
  this.amount = Math.max(0, Number(this.amount) || 0);
  this.linkScope = deriveLinkScope({
    linkScope: this.linkScope,
    studentMembershipId: this.studentMembershipId,
    classId: this.classId
  });
});

financeReceiptSchema.index({ bill: 1, studentMembershipId: 1 });
financeReceiptSchema.index({ studentMembershipId: 1, status: 1, paidAt: -1 });
financeReceiptSchema.index({ linkScope: 1, status: 1, paidAt: -1 });
financeReceiptSchema.index({ createdAt: -1, status: 1 });

financeReceiptSchema.post('save', function syncStudentFinanceCanonical(doc) {
  setImmediate(() => {
    const { syncStudentFinanceFromFinanceReceipt } = require('../utils/studentFinanceSync');
    syncStudentFinanceFromFinanceReceipt(doc && doc._id ? doc._id : doc).catch(() => {});
  });
});

module.exports = mongoose.model('FinanceReceipt', financeReceiptSchema);
