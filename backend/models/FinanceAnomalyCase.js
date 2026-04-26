const mongoose = require('mongoose');

const financeAnomalyHistorySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['created', 'assigned', 'noted', 'snoozed', 'resolved', 'reopened'],
    required: true
  },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  at: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['open', 'assigned', 'snoozed', 'resolved'],
    default: 'open'
  },
  note: { type: String, default: '' },
  assignedLevel: {
    type: String,
    enum: ['', 'finance_manager', 'finance_lead', 'general_president'],
    default: ''
  },
  snoozedUntil: { type: Date, default: null }
}, { _id: false });

const financeAnomalyCaseSchema = new mongoose.Schema({
  anomalyId: { type: String, required: true, unique: true, index: true },
  anomalyType: { type: String, default: 'finance_signal', index: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info', index: true },
  signalActionRequired: { type: Boolean, default: false },
  studentMembershipId: { type: String, default: '', index: true },
  studentUserId: { type: String, default: '' },
  studentName: { type: String, default: '' },
  classId: { type: String, default: '', index: true },
  classTitle: { type: String, default: '' },
  academicYearId: { type: String, default: '' },
  academicYearTitle: { type: String, default: '' },
  targetType: { type: String, default: '' },
  targetId: { type: String, default: '' },
  referenceNumber: { type: String, default: '' },
  secondaryReference: { type: String, default: '' },
  amount: { type: Number, default: 0 },
  amountLabel: { type: String, default: '' },
  status: {
    type: String,
    enum: ['open', 'assigned', 'snoozed', 'resolved'],
    default: 'open',
    index: true
  },
  assignedLevel: {
    type: String,
    enum: ['', 'finance_manager', 'finance_lead', 'general_president'],
    default: ''
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  snoozedUntil: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolutionNote: { type: String, default: '' },
  latestNote: { type: String, default: '' },
  latestActionAt: { type: Date, default: null },
  latestActionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dueDate: { type: Date, default: null },
  occurredAt: { type: Date, default: null },
  currentSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  history: { type: [financeAnomalyHistorySchema], default: [] }
}, { timestamps: true });

financeAnomalyCaseSchema.index({ classId: 1, status: 1, updatedAt: -1 });
financeAnomalyCaseSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model('FinanceAnomalyCase', financeAnomalyCaseSchema);
