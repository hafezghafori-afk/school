const mongoose = require('mongoose');

const MONTH_CLOSE_STATUSES = ['draft', 'pending_review', 'closed', 'reopened', 'rejected'];
const MONTH_CLOSE_APPROVAL_STAGES = [
  'draft',
  'finance_manager_review',
  'finance_lead_review',
  'general_president_review',
  'completed',
  'rejected'
];

const monthCloseApprovalTrailSchema = new mongoose.Schema({
  level: { type: String, enum: ['finance_manager', 'finance_lead', 'general_president'], required: true },
  action: { type: String, enum: ['submit', 'approve', 'reject'], required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  at: { type: Date, default: Date.now },
  note: { type: String, default: '' },
  reason: { type: String, default: '' }
}, { _id: false });

const monthCloseHistorySchema = new mongoose.Schema({
  action: { type: String, enum: ['requested', 'approved', 'closed', 'rejected', 'reopened'], required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  at: { type: Date, default: Date.now },
  note: { type: String, default: '' }
}, { _id: false });

const financeMonthCloseSchema = new mongoose.Schema({
  monthKey: { type: String, required: true, unique: true }, // YYYY-MM
  status: { type: String, enum: MONTH_CLOSE_STATUSES, default: 'draft', index: true },
  approvalStage: {
    type: String,
    enum: MONTH_CLOSE_APPROVAL_STAGES,
    default: 'draft',
    index: true
  },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  requestedAt: { type: Date, default: null },
  requestNote: { type: String, default: '' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectReason: { type: String, default: '' },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  closedAt: { type: Date, default: null },
  note: { type: String, default: '' },
  reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reopenedAt: { type: Date, default: null },
  reopenNote: { type: String, default: '' },
  approvalTrail: { type: [monthCloseApprovalTrailSchema], default: [] },
  closeWindow: {
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null }
  },
  snapshot: {
    generatedAt: { type: Date, default: null },
    monthKey: { type: String, default: '' },
    window: {
      startAt: { type: Date, default: null },
      endAt: { type: Date, default: null }
    },
    totals: {
      ordersIssuedCount: { type: Number, default: 0 },
      ordersIssuedAmount: { type: Number, default: 0 },
      approvedPaymentCount: { type: Number, default: 0 },
      approvedPaymentAmount: { type: Number, default: 0 },
      pendingPaymentCount: { type: Number, default: 0 },
      pendingPaymentAmount: { type: Number, default: 0 },
      standingDueAmount: { type: Number, default: 0 },
      standingPaidAmount: { type: Number, default: 0 },
      standingOutstandingAmount: { type: Number, default: 0 },
      overdueOrders: { type: Number, default: 0 },
      activeMemberships: { type: Number, default: 0 },
      activeReliefs: { type: Number, default: 0 },
      fixedReliefAmount: { type: Number, default: 0 },
      percentReliefs: { type: Number, default: 0 },
      fullReliefs: { type: Number, default: 0 }
    },
    aging: {
      buckets: {
        current: { type: Number, default: 0 },
        d1_30: { type: Number, default: 0 },
        d31_60: { type: Number, default: 0 },
        d61_plus: { type: Number, default: 0 }
      },
      totalRemaining: { type: Number, default: 0 },
      rows: { type: [mongoose.Schema.Types.Mixed], default: [] }
    },
    cashflow: {
      approvedTotal: { type: Number, default: 0 },
      approvedCount: { type: Number, default: 0 },
      pendingTotal: { type: Number, default: 0 },
      pendingCount: { type: Number, default: 0 },
      items: { type: [mongoose.Schema.Types.Mixed], default: [] }
    },
    readiness: {
      readyToApprove: { type: Boolean, default: true },
      blockingIssues: { type: [mongoose.Schema.Types.Mixed], default: [] },
      warningIssues: { type: [mongoose.Schema.Types.Mixed], default: [] }
    },
    classes: { type: [mongoose.Schema.Types.Mixed], default: [] },
    anomalies: {
      summary: { type: mongoose.Schema.Types.Mixed, default: {} },
      items: { type: [mongoose.Schema.Types.Mixed], default: [] }
    }
  },
  history: { type: [monthCloseHistorySchema], default: [] }
}, { timestamps: true });

financeMonthCloseSchema.pre('validate', function syncFinanceMonthCloseState() {
  if (typeof this.monthKey === 'string') this.monthKey = this.monthKey.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.requestNote === 'string') this.requestNote = this.requestNote.trim();
  if (typeof this.reopenNote === 'string') this.reopenNote = this.reopenNote.trim();
  if (typeof this.rejectReason === 'string') this.rejectReason = this.rejectReason.trim();
  if (!Array.isArray(this.approvalTrail)) this.approvalTrail = [];
  if (!Array.isArray(this.history)) this.history = [];

  if (this.status === 'pending_review') {
    if (!['finance_manager_review', 'finance_lead_review', 'general_president_review'].includes(this.approvalStage)) {
      this.approvalStage = 'finance_manager_review';
    }
    if (!this.requestedAt) this.requestedAt = new Date();
    this.closedBy = null;
    this.closedAt = null;
    this.approvedBy = null;
    this.approvedAt = null;
    this.rejectedBy = null;
    this.rejectedAt = null;
    this.rejectReason = '';
  } else if (this.status === 'closed') {
    this.approvalStage = 'completed';
    if (!this.closedAt) this.closedAt = new Date();
    if (!this.approvedAt) this.approvedAt = this.closedAt;
  } else if (this.status === 'rejected') {
    this.approvalStage = 'rejected';
    if (!this.rejectedAt) this.rejectedAt = new Date();
    this.closedBy = null;
    this.closedAt = null;
    this.approvedBy = null;
    this.approvedAt = null;
  } else if (this.status === 'reopened') {
    this.approvalStage = 'completed';
  } else {
    this.approvalStage = 'draft';
  }
});

financeMonthCloseSchema.index({ status: 1, approvalStage: 1, monthKey: -1 });

module.exports = mongoose.model('FinanceMonthClose', financeMonthCloseSchema);
