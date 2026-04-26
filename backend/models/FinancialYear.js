const mongoose = require('mongoose');
const { formatAfghanStoredDateLabel } = require('../utils/afghanDate');

const financialYearBudgetCategorySchema = new mongoose.Schema({
  categoryKey: { type: String, default: '', trim: true },
  label: { type: String, default: '', trim: true },
  annualBudget: { type: Number, default: 0, min: 0 },
  monthlyBudget: { type: Number, default: 0, min: 0 },
  alertThresholdPercent: { type: Number, default: 85, min: 0 }
}, { _id: false });

const financialYearBudgetTargetsSchema = new mongoose.Schema({
  annualIncomeTarget: { type: Number, default: 0, min: 0 },
  annualExpenseBudget: { type: Number, default: 0, min: 0 },
  monthlyIncomeTarget: { type: Number, default: 0, min: 0 },
  monthlyExpenseBudget: { type: Number, default: 0, min: 0 },
  treasuryReserveTarget: { type: Number, default: 0, min: 0 },
  note: { type: String, default: '', trim: true },
  categoryBudgets: {
    type: [financialYearBudgetCategorySchema],
    default: []
  }
}, { _id: false });

const financialYearBudgetApprovalTrailSchema = new mongoose.Schema({
  level: { type: String, default: '', trim: true },
  action: { type: String, default: '', trim: true },
  by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  at: { type: Date, default: null },
  note: { type: String, default: '', trim: true },
  reason: { type: String, default: '', trim: true }
}, { _id: false });

const financialYearBudgetRevisionHistorySchema = new mongoose.Schema({
  revisionNumber: { type: Number, default: 1, min: 1 },
  action: {
    type: String,
    enum: ['saved', 'revision_started', 'review_requested', 'approved', 'rejected'],
    default: 'saved'
  },
  fromVersion: { type: Number, default: 0, min: 0 },
  toVersion: { type: Number, default: 1, min: 1 },
  stage: { type: String, default: 'draft', trim: true },
  by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  at: { type: Date, default: null },
  note: { type: String, default: '', trim: true },
  reason: { type: String, default: '', trim: true },
  snapshot: {
    type: financialYearBudgetTargetsSchema,
    default: () => ({})
  }
}, { _id: false });

const financialYearSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true,
    index: true
  },
  code: { type: String, default: '', trim: true },
  title: { type: String, required: true, trim: true },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  startDateLocal: { type: String, default: '', trim: true },
  endDateLocal: { type: String, default: '', trim: true },
  dailyFeePercent: { type: Number, default: 0, min: 0 },
  yearlyFeePercent: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['planning', 'active', 'closed', 'archived'],
    default: 'planning',
    index: true
  },
  isActive: { type: Boolean, default: false, index: true },
  isClosed: { type: Boolean, default: false, index: true },
  closedAt: { type: Date, default: null },
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  budgetTargets: {
    type: financialYearBudgetTargetsSchema,
    default: () => ({})
  },
  budgetApprovalStage: {
    type: String,
    enum: ['draft', 'finance_manager_review', 'finance_lead_review', 'general_president_review', 'approved', 'rejected'],
    default: 'draft',
    index: true
  },
  budgetSubmittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  budgetSubmittedAt: { type: Date, default: null },
  budgetApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  budgetApprovedAt: { type: Date, default: null },
  budgetRejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  budgetRejectedAt: { type: Date, default: null },
  budgetRejectReason: { type: String, default: '', trim: true },
  budgetApprovalTrail: {
    type: [financialYearBudgetApprovalTrailSchema],
    default: []
  },
  budgetVersion: {
    type: Number,
    default: 1,
    min: 1
  },
  budgetLastApprovedVersion: {
    type: Number,
    default: 0,
    min: 0
  },
  budgetFrozenAt: {
    type: Date,
    default: null
  },
  budgetRevisionHistory: {
    type: [financialYearBudgetRevisionHistorySchema],
    default: []
  },
  note: { type: String, default: '', trim: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

financialYearSchema.pre('validate', function syncFinancialYearState() {
  if (typeof this.code === 'string') this.code = this.code.trim();
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.startDateLocal === 'string') this.startDateLocal = this.startDateLocal.trim();
  if (typeof this.endDateLocal === 'string') this.endDateLocal = this.endDateLocal.trim();

  this.dailyFeePercent = Math.max(0, Number(this.dailyFeePercent) || 0);
  this.yearlyFeePercent = Math.max(0, Number(this.yearlyFeePercent) || 0);
  if (!this.budgetTargets || typeof this.budgetTargets !== 'object') {
    this.budgetTargets = {};
  }
  this.budgetTargets.annualIncomeTarget = Math.max(0, Number(this.budgetTargets.annualIncomeTarget || 0));
  this.budgetTargets.annualExpenseBudget = Math.max(0, Number(this.budgetTargets.annualExpenseBudget || 0));
  this.budgetTargets.monthlyIncomeTarget = Math.max(0, Number(this.budgetTargets.monthlyIncomeTarget || 0));
  this.budgetTargets.monthlyExpenseBudget = Math.max(0, Number(this.budgetTargets.monthlyExpenseBudget || 0));
  this.budgetTargets.treasuryReserveTarget = Math.max(0, Number(this.budgetTargets.treasuryReserveTarget || 0));
  if (typeof this.budgetTargets.note === 'string') this.budgetTargets.note = this.budgetTargets.note.trim();
  const seenBudgetCategories = new Set();
  this.budgetTargets.categoryBudgets = (Array.isArray(this.budgetTargets.categoryBudgets) ? this.budgetTargets.categoryBudgets : [])
    .map((item) => {
      const categoryKey = String(item?.categoryKey || '').trim().toLowerCase();
      if (!categoryKey || seenBudgetCategories.has(categoryKey)) return null;
      seenBudgetCategories.add(categoryKey);
      return {
        categoryKey,
        label: String(item?.label || categoryKey).trim(),
        annualBudget: Math.max(0, Number(item?.annualBudget || 0)),
        monthlyBudget: Math.max(0, Number(item?.monthlyBudget || 0)),
        alertThresholdPercent: Math.max(0, Number(item?.alertThresholdPercent || 85))
      };
    })
    .filter(Boolean);
  if (typeof this.budgetRejectReason === 'string') this.budgetRejectReason = this.budgetRejectReason.trim();
  if (!Array.isArray(this.budgetApprovalTrail)) this.budgetApprovalTrail = [];
  this.budgetVersion = Math.max(1, Number(this.budgetVersion || 1));
  this.budgetLastApprovedVersion = Math.max(0, Number(this.budgetLastApprovedVersion || 0));
  this.budgetRevisionHistory = (Array.isArray(this.budgetRevisionHistory) ? this.budgetRevisionHistory : [])
    .map((item) => {
      if (!item) return null;
      const snapshot = item?.snapshot && typeof item.snapshot === 'object' ? item.snapshot : {};
      return {
        revisionNumber: Math.max(1, Number(item.revisionNumber || this.budgetVersion || 1)),
        action: String(item.action || 'saved').trim().toLowerCase() || 'saved',
        fromVersion: Math.max(0, Number(item.fromVersion || 0)),
        toVersion: Math.max(1, Number(item.toVersion || item.revisionNumber || this.budgetVersion || 1)),
        stage: String(item.stage || 'draft').trim().toLowerCase() || 'draft',
        by: item.by || null,
        at: item.at ? new Date(item.at) : new Date(),
        note: String(item.note || '').trim(),
        reason: String(item.reason || '').trim(),
        snapshot: {
          annualIncomeTarget: Math.max(0, Number(snapshot.annualIncomeTarget || 0)),
          annualExpenseBudget: Math.max(0, Number(snapshot.annualExpenseBudget || 0)),
          monthlyIncomeTarget: Math.max(0, Number(snapshot.monthlyIncomeTarget || 0)),
          monthlyExpenseBudget: Math.max(0, Number(snapshot.monthlyExpenseBudget || 0)),
          treasuryReserveTarget: Math.max(0, Number(snapshot.treasuryReserveTarget || 0)),
          note: String(snapshot.note || '').trim(),
          categoryBudgets: Array.isArray(snapshot.categoryBudgets)
            ? snapshot.categoryBudgets.map((entry) => ({
              categoryKey: String(entry?.categoryKey || '').trim().toLowerCase(),
              label: String(entry?.label || entry?.categoryKey || '').trim(),
              annualBudget: Math.max(0, Number(entry?.annualBudget || 0)),
              monthlyBudget: Math.max(0, Number(entry?.monthlyBudget || 0)),
              alertThresholdPercent: Math.max(0, Number(entry?.alertThresholdPercent || 85))
            })).filter((entry) => entry.categoryKey)
            : []
        }
      };
    })
    .filter(Boolean);

  if (this.budgetApprovalStage === 'approved') {
    if (!this.budgetApprovedAt) this.budgetApprovedAt = new Date();
    this.budgetLastApprovedVersion = Math.max(this.budgetLastApprovedVersion || 0, this.budgetVersion || 1);
    this.budgetRejectedBy = null;
    this.budgetRejectedAt = null;
    this.budgetRejectReason = '';
  } else if (this.budgetApprovalStage === 'rejected') {
    if (!this.budgetRejectedAt) this.budgetRejectedAt = new Date();
    this.budgetApprovedBy = null;
    this.budgetApprovedAt = null;
  } else if (!['finance_manager_review', 'finance_lead_review', 'general_president_review'].includes(this.budgetApprovalStage)) {
    this.budgetApprovalStage = 'draft';
    this.budgetSubmittedBy = null;
    this.budgetSubmittedAt = null;
    this.budgetApprovedBy = null;
    this.budgetApprovedAt = null;
    this.budgetRejectedBy = null;
    this.budgetRejectedAt = null;
    this.budgetRejectReason = '';
  } else if (!this.budgetSubmittedAt) {
    this.budgetSubmittedAt = new Date();
  }

  if (!this.title && this.code) {
    this.title = this.code;
  }

  if (this.startDate) {
    this.startDateLocal = formatAfghanStoredDateLabel(this.startDate);
  }

  if (this.endDate) {
    this.endDateLocal = formatAfghanStoredDateLabel(this.endDate);
  }

  if (this.isClosed) {
    this.isActive = false;
    this.status = 'closed';
    if (!this.closedAt) this.closedAt = new Date();
    if (!this.budgetFrozenAt) this.budgetFrozenAt = new Date();
  } else if (this.isActive) {
    this.status = 'active';
    this.closedAt = null;
    this.closedBy = null;
  } else if (this.status === 'active') {
    this.isActive = true;
  }
});

financialYearSchema.index({ schoolId: 1, title: 1 }, { unique: true });
financialYearSchema.index({ schoolId: 1, code: 1 }, { unique: true, sparse: true });
financialYearSchema.index({ schoolId: 1, academicYearId: 1 }, { unique: true });
financialYearSchema.index({ schoolId: 1, isActive: 1 }, {
  unique: true,
  partialFilterExpression: { isActive: true }
});
financialYearSchema.index({ schoolId: 1, status: 1 });
financialYearSchema.index({ schoolId: 1, budgetApprovalStage: 1, updatedAt: -1 });

module.exports = mongoose.model('FinancialYear', financialYearSchema);
