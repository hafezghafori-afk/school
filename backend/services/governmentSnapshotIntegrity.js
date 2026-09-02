const crypto = require('crypto');
const { canonicalStringify } = require('../utils/canonicalJson');

// Phase 1 of the مرکز مالی دولت review — integrity helpers for the official
// government finance record. Kept out of the route file so they can be unit
// tested without mounting the whole finance router (findings P7, P8).

const GOVERNMENT_SNAPSHOT_DIGEST_ALGO = 'canonical-sha256-v1';

// P8 — reproducible, chain-linked digest. `previousDigest` is part of the hashed
// payload so each version is cryptographically bound to the one before it.
function computeGovernmentSnapshotDigest({
  previousDigest = '',
  reportKey = '',
  filters = {},
  columns = [],
  summary = {},
  rows = [],
  pack = null
} = {}) {
  return crypto
    .createHash('sha256')
    .update(canonicalStringify({ previousDigest, reportKey, filters, columns, summary, rows, pack }))
    .digest('hex');
}

// P7 — which close-readiness findings block RATIFYING a snapshot as official.
// Operational blockers (unsettled money, unreviewed items) always apply. The
// "every month closed / budget finally approved" conditions, plus treasury
// reconciliation, only hard-block the ANNUAL record — a mid-year quarterly
// snapshot is legitimately produced before year-end close, so for it those
// become non-blocking warnings instead.
function collectOfficialSnapshotGate(readiness = null, reportType = '') {
  const blockers = [];
  const warnings = [];
  if (!readiness || typeof readiness !== 'object') return { blockers, warnings };

  const counts = readiness.counts || {};
  const expenses = counts.expenses || {};
  const procurements = counts.procurements || {};
  const isAnnual = String(reportType || '').trim().toLowerCase() === 'annual';

  const openExpenses = Number(expenses.draft || 0) + Number(expenses.pendingReview || 0) + Number(expenses.rejected || 0);
  const openProcurement = Number(procurements.draft || 0)
    + Number(procurements.pendingReview || 0)
    + Number(procurements.rejected || 0)
    + Number(procurements.unsettledApproved || 0);
  const unreconciled = Number(counts.unreconciledTreasuryAccounts || 0);
  const variances = Number(counts.reconciliationVariances || 0);
  const openOrders = Number(counts.openOrders || 0);

  if (Number(counts.pendingPayments || 0) > 0) {
    blockers.push({ key: 'pending_payments', label: `${counts.pendingPayments} پرداخت در انتظار تایید` });
  }
  if (Number(counts.actionableAnomalies || 0) > 0) {
    blockers.push({ key: 'actionable_anomalies', label: `${counts.actionableAnomalies} ناهنجاری مالی عملیاتی حل‌نشده` });
  }
  if (openExpenses > 0) {
    blockers.push({ key: 'expenses_open', label: `${openExpenses} مصرف پیش‌نویس/در صف بررسی/ردشده تعیین تکلیف نشده` });
  }
  if (openProcurement > 0) {
    blockers.push({ key: 'procurement_open', label: `${openProcurement} تعهد خرید باز یا تسویه‌نشده` });
  }

  const treasuryBucket = isAnnual ? blockers : warnings;
  if (unreconciled > 0) {
    treasuryBucket.push({ key: 'treasury_unreconciled', label: `${unreconciled} حساب خزانه تطبیق بانکی/صندوقی نشده` });
  }
  if (variances > 0) {
    treasuryBucket.push({ key: 'treasury_variance', label: `${variances} حساب خزانه دارای تفاوت تطبیق` });
  }
  if (isAnnual && readiness.canClose === false) {
    blockers.push({ key: 'year_not_close_ready', label: 'سال مالی هنوز آمادهٔ بستن نیست (ماه‌های نبسته یا بودجهٔ تاییدنشده)' });
  }
  if (openOrders > 0) {
    warnings.push({ key: 'open_orders', label: `${openOrders} بل رسمی دارای باقیات` });
  }
  return { blockers, warnings };
}

module.exports = {
  GOVERNMENT_SNAPSHOT_DIGEST_ALGO,
  computeGovernmentSnapshotDigest,
  collectOfficialSnapshotGate
};
