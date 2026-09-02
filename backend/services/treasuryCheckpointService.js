const FinanceTreasuryAccount = require('../models/FinanceTreasuryAccount');
const FinanceTreasuryTransaction = require('../models/FinanceTreasuryTransaction');
const FinanceTreasuryCheckpoint = require('../models/FinanceTreasuryCheckpoint');
const ExpenseEntry = require('../models/ExpenseEntry');
const { accumulateAccountMetrics } = require('./treasuryMetricsFold');

// Phase 3 of the مرکز مالی دولت review (P9) — build and safely reuse per-account
// treasury balance checkpoints.

const NON_PROCUREMENT_EXPENSE_MATCH = {
  $or: [{ procurementCommitmentId: null }, { procurementCommitmentId: { $exists: false } }]
};

function toDate(value) {
  if (!value) return null;
  const next = new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

// Fold an account's entire history up to and including `asOf` into the metrics
// bucket — the same fold buildTreasuryAnalytics uses, so a checkpoint can never
// drift from a live recompute.
async function computeAccountMetricsThrough(account, asOf) {
  const cutOff = toDate(asOf);
  if (!account?._id || !cutOff) return null;

  const [transactions, approvedExpenses, txCountThrough, expenseCountThrough] = await Promise.all([
    FinanceTreasuryTransaction.find({
      accountId: account._id,
      status: { $ne: 'void' },
      transactionDate: { $lte: cutOff }
    }).select('accountId amount transactionType direction transactionDate').lean(),
    ExpenseEntry.find({
      treasuryAccountId: account._id,
      status: 'approved',
      expenseDate: { $lte: cutOff }
    }).select('treasuryAccountId amount expenseDate procurementCommitmentId').lean(),
    FinanceTreasuryTransaction.countDocuments({
      accountId: account._id,
      status: { $ne: 'void' },
      transactionDate: { $lte: cutOff }
    }),
    ExpenseEntry.countDocuments({
      treasuryAccountId: account._id,
      status: 'approved',
      expenseDate: { $lte: cutOff }
    })
  ]);

  const metricsByAccountId = accumulateAccountMetrics({
    accounts: [account],
    transactions,
    expenses: approvedExpenses
  });

  return {
    metrics: metricsByAccountId.get(String(account._id)) || null,
    txCountThrough,
    expenseCountThrough
  };
}

async function createTreasuryCheckpoint({ account, asOf, createdBy = null, note = '' } = {}) {
  const cutOff = toDate(asOf);
  if (!account?._id || !cutOff) {
    const error = new Error('finance_treasury_checkpoint_invalid');
    error.statusCode = 400;
    throw error;
  }
  const computed = await computeAccountMetricsThrough(account, cutOff);
  if (!computed?.metrics) {
    const error = new Error('finance_treasury_checkpoint_compute_failed');
    error.statusCode = 500;
    throw error;
  }

  return FinanceTreasuryCheckpoint.findOneAndUpdate(
    { accountId: account._id, asOf: cutOff },
    {
      $set: {
        schoolId: account.schoolId,
        financialYearId: account.financialYearId || null,
        metrics: computed.metrics,
        txCountThrough: computed.txCountThrough,
        expenseCountThrough: computed.expenseCountThrough,
        note: String(note || '').trim(),
        createdBy: createdBy || null
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// For each account, the latest checkpoint at or before `asOf` whose recorded
// row counts still match the live counts (i.e. no backdated / voided row changed
// history before the cut-off). Untrusted or checkpoint-less accounts are simply
// omitted, so the caller falls back to a full recompute for them.
async function findValidCheckpointSeedMap({ accounts = [], asOf = new Date() } = {}) {
  const cutOff = toDate(asOf) || new Date();
  const seedByAccountId = new Map();
  const sinceByAccountId = new Map();
  if (!accounts.length) return { seedByAccountId, sinceByAccountId };

  await Promise.all(accounts.map(async (account) => {
    const checkpoint = await FinanceTreasuryCheckpoint.findOne({
      accountId: account._id,
      asOf: { $lte: cutOff }
    }).sort({ asOf: -1 }).lean();
    if (!checkpoint) return;

    const [txCount, expenseCount] = await Promise.all([
      FinanceTreasuryTransaction.countDocuments({
        accountId: account._id,
        status: { $ne: 'void' },
        transactionDate: { $lte: checkpoint.asOf }
      }),
      ExpenseEntry.countDocuments({
        treasuryAccountId: account._id,
        status: 'approved',
        expenseDate: { $lte: checkpoint.asOf }
      })
    ]);
    if (txCount !== Number(checkpoint.txCountThrough) || expenseCount !== Number(checkpoint.expenseCountThrough)) {
      return; // stale — history before the cut-off changed; fall back to full recompute
    }

    seedByAccountId.set(String(account._id), { ...checkpoint.metrics });
    sinceByAccountId.set(String(account._id), checkpoint.asOf);
  }));

  return { seedByAccountId, sinceByAccountId };
}

async function listActiveTreasuryAccounts({ financialYearId = '', academicYearId = '' } = {}) {
  const filter = { isActive: true };
  if (financialYearId) filter.financialYearId = financialYearId;
  if (academicYearId) filter.academicYearId = academicYearId;
  return FinanceTreasuryAccount.find(filter);
}

module.exports = {
  NON_PROCUREMENT_EXPENSE_MATCH,
  computeAccountMetricsThrough,
  createTreasuryCheckpoint,
  findValidCheckpointSeedMap,
  listActiveTreasuryAccounts
};
