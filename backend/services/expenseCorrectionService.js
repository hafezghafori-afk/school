// Editing recorded expenses in the government finance centre (مرکز مالی دولت).
//
// - draft / rejected / pending_review rows are edited in place; editing a row
//   that is already in review restarts the approval chain from stage one.
// - approved rows: a change limited to the text fields is saved directly (and
//   logged); any money-relevant change opens a correction request that runs
//   the full approval chain. While it is open the row is back in pending_review,
//   so treasury balances, reports and budgets stop counting it until the final
//   approval applies the new values.
// - expenses booked automatically by a staff salary payment are locked; they are
//   linked to the payment record, advance repayments and the printed voucher.
//
// Everything here is pure (no database access) so the routes and the smoke
// checks share the exact same rules.

const EXPENSE_FINANCIAL_FIELDS = Object.freeze([
  'category',
  'subCategory',
  'amount',
  'expenseDate',
  'paymentMethod',
  'treasuryAccountId',
  'procurementCommitmentId'
]);
const EXPENSE_TEXT_FIELDS = Object.freeze(['vendorName', 'referenceNo', 'note']);
const EXPENSE_EDITABLE_FIELDS = Object.freeze([...EXPENSE_FINANCIAL_FIELDS, ...EXPENSE_TEXT_FIELDS]);
const EXPENSE_PAYMENT_METHODS = Object.freeze(['cash', 'bank_transfer', 'hawala', 'manual', 'other']);
const SALARY_EXPENSE_REFERENCE_PREFIX = 'staff_salary:';

// A submit (or a correction request) opens a new review round.
const EXPENSE_REVIEW_ROUND_START_ACTIONS = new Set(['submit', 'correction_request']);

function normalizeId(value) {
  return String(value?._id || value || '').trim();
}

function toDayKey(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function comparableExpenseValue(field, value) {
  if (field === 'amount') {
    const amount = Number(value);
    return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
  }
  if (field === 'expenseDate') return toDayKey(value);
  if (field === 'treasuryAccountId' || field === 'procurementCommitmentId') return normalizeId(value);
  if (field === 'category') return String(value ?? '').trim().toLowerCase();
  return String(value ?? '').trim();
}

function storableExpenseValue(field, value) {
  if (field === 'amount') return comparableExpenseValue(field, value);
  if (field === 'expenseDate') {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (field === 'treasuryAccountId' || field === 'procurementCommitmentId') return normalizeId(value) || null;
  return comparableExpenseValue(field, value);
}

// Field-level diff between the stored row and the requested values. Only
// fields present in `requested` are compared.
function diffExpenseFields(current = {}, requested = {}) {
  return EXPENSE_EDITABLE_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(requested, field))
    .filter((field) => comparableExpenseValue(field, current?.[field]) !== comparableExpenseValue(field, requested[field]))
    .map((field) => ({
      field,
      from: storableExpenseValue(field, current?.[field]),
      to: storableExpenseValue(field, requested[field])
    }));
}

function hasFinancialExpenseChange(changes = []) {
  return (changes || []).some((change) => EXPENSE_FINANCIAL_FIELDS.includes(String(change?.field || '')));
}

function toPlainExpenseChanges(changes = []) {
  return (Array.isArray(changes) ? changes : []).map((change) => ({
    field: String(change?.field || ''),
    from: change?.from ?? null,
    to: change?.to ?? null
  }));
}

function isSalaryLinkedExpense(item) {
  return String(item?.referenceNo || '').trim().startsWith(SALARY_EXPENSE_REFERENCE_PREFIX);
}

function hasOpenExpenseCorrection(item) {
  return Boolean(item?.correction?.requestedAt);
}

// Separation of duties applies per review round: only approve/reject events
// after the latest submit count. Without this, anyone who reviewed an expense
// that was later rejected could never review its corrected resubmission, and
// with one person per level the expense would be stuck forever.
function currentExpenseReviewRound(trail = []) {
  if (!Array.isArray(trail)) return [];
  let startIndex = 0;
  trail.forEach((entry, index) => {
    if (EXPENSE_REVIEW_ROUND_START_ACTIONS.has(String(entry?.action || '').trim().toLowerCase())) {
      startIndex = index;
    }
  });
  return trail.slice(startIndex);
}

function actorReviewedCurrentExpenseRound(trail = [], actorId = '') {
  const normalizedActorId = normalizeId(actorId);
  if (!normalizedActorId) return false;
  return currentExpenseReviewRound(trail).some((entry) => (
    normalizeId(entry?.by) === normalizedActorId
    && ['approve', 'reject'].includes(String(entry?.action || '').trim().toLowerCase())
  ));
}

function snapshotExpenseApproval(item) {
  return {
    submittedBy: item?.submittedBy || null,
    submittedAt: item?.submittedAt || null,
    approvedBy: item?.approvedBy || null,
    approvedAt: item?.approvedAt || null
  };
}

// Plain copy of an open correction, safe to use after `item.correction` is cleared.
function snapshotExpenseCorrection(item) {
  if (!hasOpenExpenseCorrection(item)) return null;
  const correction = item.correction;
  const previous = correction.previousApproval || {};
  return {
    reason: String(correction.reason || '').trim(),
    requestedBy: correction.requestedBy || null,
    requestedAt: correction.requestedAt || null,
    changes: toPlainExpenseChanges(correction.changes),
    previousApproval: {
      submittedBy: previous.submittedBy || null,
      submittedAt: previous.submittedAt || null,
      approvedBy: previous.approvedBy || null,
      approvedAt: previous.approvedAt || null
    }
  };
}

function restoreExpenseApproval(item, previousApproval = {}) {
  if (!item) return;
  item.status = 'approved';
  item.approvalStage = 'completed';
  item.submittedBy = previousApproval.submittedBy || item.submittedBy || null;
  item.submittedAt = previousApproval.submittedAt || item.submittedAt || null;
  item.approvedBy = previousApproval.approvedBy || null;
  item.approvedAt = previousApproval.approvedAt || new Date();
  item.rejectedBy = null;
  item.rejectedAt = null;
  item.rejectReason = '';
}

function appendExpenseRevision(item, {
  kind = 'edit',
  by = null,
  requestedBy = null,
  reason = '',
  statusBefore = '',
  changes = []
} = {}) {
  if (!item) return;
  if (!Array.isArray(item.revisions)) item.revisions = [];
  item.revisions.push({
    kind,
    at: new Date(),
    by: by || null,
    requestedBy: requestedBy || null,
    reason: String(reason || '').trim(),
    statusBefore: String(statusBefore || '').trim(),
    changes: toPlainExpenseChanges(changes)
  });
}

// Dates a treasury checkpoint must be dropped from after an approved row
// changed in place: the earlier of the old and the new expense date, on both
// the old and the new account.
function resolveCheckpointInvalidationScope({ before = {}, after = {} } = {}) {
  const accountIds = [...new Set([normalizeId(before.treasuryAccountId), normalizeId(after.treasuryAccountId)].filter(Boolean))];
  const dates = [before.expenseDate, after.expenseDate]
    .map((value) => (value ? new Date(value) : null))
    .filter((date) => date && !Number.isNaN(date.getTime()));
  const fromDate = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
  return { accountIds, fromDate };
}

module.exports = {
  EXPENSE_EDITABLE_FIELDS,
  EXPENSE_FINANCIAL_FIELDS,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_TEXT_FIELDS,
  SALARY_EXPENSE_REFERENCE_PREFIX,
  actorReviewedCurrentExpenseRound,
  appendExpenseRevision,
  comparableExpenseValue,
  currentExpenseReviewRound,
  diffExpenseFields,
  hasFinancialExpenseChange,
  hasOpenExpenseCorrection,
  isSalaryLinkedExpense,
  resolveCheckpointInvalidationScope,
  restoreExpenseApproval,
  snapshotExpenseApproval,
  snapshotExpenseCorrection,
  toPlainExpenseChanges
};
