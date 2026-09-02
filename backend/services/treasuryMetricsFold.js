// Phase 3 of the مرکز مالی دولت review (P9) — the single source of truth for
// folding treasury activity into per-account metrics. Extracted from
// treasuryGovernanceService so treasuryCheckpointService can reuse the exact
// same fold (a checkpoint is just this fold run over history through a cut-off
// date), with no circular require between the two services.

function normalizeText(value = '') {
  return String(value || '').trim();
}

function toDate(value = null, fallback = null) {
  if (!value) return fallback;
  const next = new Date(value);
  return Number.isNaN(next.getTime()) ? fallback : next;
}

function emptyBucket(openingBalance = 0) {
  return {
    manualInflow: 0,
    manualOutflow: 0,
    transferIn: 0,
    transferOut: 0,
    expenseOutflow: 0,
    transferCount: 0,
    expenseCount: 0,
    bookBalance: Number(openingBalance || 0),
    lastTransactionAt: null
  };
}

// `seedByAccountId` (optional): Map<accountIdString, bucket> of already-folded
// metrics (from a checkpoint). When present for an account, folding starts from
// that bucket instead of a zero bucket at openingBalance, and `transactions` /
// `expenses` are expected to contain only the rows AFTER the checkpoint cut-off.
function accumulateAccountMetrics({
  accounts = [],
  transactions = [],
  expenses = [],
  seedByAccountId = null
} = {}) {
  const seed = seedByAccountId instanceof Map ? seedByAccountId : null;
  const metricsByAccountId = new Map(
    (accounts || []).map((account) => {
      const key = String(account._id);
      const seeded = seed && seed.has(key) ? seed.get(key) : null;
      return [key, seeded ? { ...emptyBucket(0), ...seeded } : emptyBucket(account.openingBalance)];
    })
  );

  (transactions || []).forEach((item) => {
    const accountKey = String(item.accountId?._id || item.accountId || '');
    if (!metricsByAccountId.has(accountKey)) return;
    const bucket = metricsByAccountId.get(accountKey);
    const amount = Number(item.amount || 0);
    const type = normalizeText(item.transactionType).toLowerCase();
    const direction = normalizeText(item.direction).toLowerCase();

    if (type === 'transfer_in') {
      bucket.transferIn += amount;
      bucket.transferCount += 1;
      bucket.bookBalance += amount;
    } else if (type === 'transfer_out') {
      bucket.transferOut += amount;
      bucket.transferCount += 1;
      bucket.bookBalance -= amount;
    } else if (direction === 'in') {
      bucket.manualInflow += amount;
      bucket.bookBalance += amount;
    } else {
      bucket.manualOutflow += amount;
      bucket.bookBalance -= amount;
    }

    const itemDate = toDate(item.transactionDate, null);
    if (itemDate && (!bucket.lastTransactionAt || itemDate.getTime() > new Date(bucket.lastTransactionAt).getTime())) {
      bucket.lastTransactionAt = itemDate.toISOString();
    }
  });

  (expenses || []).forEach((item) => {
    // A procurement-linked expense records the obligation/expense. Cash leaves the
    // treasury only through its procurement settlement transaction, so counting
    // both here would debit the same amount twice.
    if (item.procurementCommitmentId) return;
    const accountKey = String(item.treasuryAccountId?._id || item.treasuryAccountId || '');
    if (!metricsByAccountId.has(accountKey)) return;
    const bucket = metricsByAccountId.get(accountKey);
    const amount = Number(item.amount || 0);
    bucket.expenseOutflow += amount;
    bucket.expenseCount += 1;
    bucket.bookBalance -= amount;

    const itemDate = toDate(item.expenseDate, null);
    if (itemDate && (!bucket.lastTransactionAt || itemDate.getTime() > new Date(bucket.lastTransactionAt).getTime())) {
      bucket.lastTransactionAt = itemDate.toISOString();
    }
  });

  metricsByAccountId.forEach((bucket) => {
    bucket.manualInflow = Number(bucket.manualInflow.toFixed(2));
    bucket.manualOutflow = Number(bucket.manualOutflow.toFixed(2));
    bucket.transferIn = Number(bucket.transferIn.toFixed(2));
    bucket.transferOut = Number(bucket.transferOut.toFixed(2));
    bucket.expenseOutflow = Number(bucket.expenseOutflow.toFixed(2));
    bucket.bookBalance = Number(bucket.bookBalance.toFixed(2));
    // Keep the field a plain ISO string whether it came from a checkpoint seed
    // (a Date) or from a folded row (already a string).
    if (bucket.lastTransactionAt instanceof Date) {
      bucket.lastTransactionAt = bucket.lastTransactionAt.toISOString();
    }
  });

  return metricsByAccountId;
}

module.exports = { accumulateAccountMetrics, emptyBucket };
