const mongoose = require('mongoose');

// Phase 3 of the مرکز مالی دولت review (finding P9).
//
// buildTreasuryAnalytics recomputes each account's running balance by folding
// EVERY non-void transaction and approved expense from openingBalance forward —
// O(all history) on every call. A checkpoint freezes an account's fully-folded
// metrics bucket as of a cut-off date; a later read starts from the checkpoint
// and only folds the transactions/expenses AFTER it.
//
// Safety: `txCountThrough` / `expenseCountThrough` record how many rows the
// checkpoint folded. On read, a cheap countDocuments(<= asOf) must still match;
// if a backdated or voided row changed history before the cut-off, the counts
// disagree and the checkpoint is ignored (full recompute), so a stale checkpoint
// can never produce a wrong balance — only a slower read.

const treasuryMetricsSchema = new mongoose.Schema({
  manualInflow: { type: Number, default: 0 },
  manualOutflow: { type: Number, default: 0 },
  transferIn: { type: Number, default: 0 },
  transferOut: { type: Number, default: 0 },
  expenseOutflow: { type: Number, default: 0 },
  transferCount: { type: Number, default: 0 },
  expenseCount: { type: Number, default: 0 },
  bookBalance: { type: Number, default: 0 },
  lastTransactionAt: { type: Date, default: null }
}, { _id: false });

const financeTreasuryCheckpointSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceTreasuryAccount',
    required: true,
    index: true
  },
  financialYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinancialYear',
    default: null,
    index: true
  },
  // Inclusive cut-off: metrics reflect all activity with date <= asOf.
  asOf: { type: Date, required: true, index: true },
  metrics: { type: treasuryMetricsSchema, default: () => ({}) },
  txCountThrough: { type: Number, default: 0 },
  expenseCountThrough: { type: Number, default: 0 },
  note: { type: String, default: '', trim: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

financeTreasuryCheckpointSchema.index({ accountId: 1, asOf: -1 });

module.exports = mongoose.model('FinanceTreasuryCheckpoint', financeTreasuryCheckpointSchema);
