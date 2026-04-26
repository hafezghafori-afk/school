const ExpenseEntry = require('../models/ExpenseEntry');
const FinanceProcurementCommitment = require('../models/FinanceProcurementCommitment');
const FinanceTreasuryTransaction = require('../models/FinanceTreasuryTransaction');
const { normalizeAdminLevel } = require('../utils/permissions');
const { resolveExpenseCategorySelection } = require('./expenseGovernanceService');
const {
  resolveTreasuryAccountSelection,
  serializeTreasuryTransaction
} = require('./treasuryGovernanceService');

const PROCUREMENT_APPROVAL_STAGES = {
  draft: 'draft',
  financeManager: 'finance_manager_review',
  financeLead: 'finance_lead_review',
  generalPresident: 'general_president_review',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled'
};

const OPEN_PROCUREMENT_APPROVAL_STAGES = [
  PROCUREMENT_APPROVAL_STAGES.financeManager,
  PROCUREMENT_APPROVAL_STAGES.financeLead,
  PROCUREMENT_APPROVAL_STAGES.generalPresident
];

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeMoney(value, fallback = 0) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;
  return Math.max(0, Number(amount.toFixed(2)));
}

function parseDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function normalizeProcurementApprovalStage(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (OPEN_PROCUREMENT_APPROVAL_STAGES.includes(normalized)) return normalized;
  if ([PROCUREMENT_APPROVAL_STAGES.approved, PROCUREMENT_APPROVAL_STAGES.rejected, PROCUREMENT_APPROVAL_STAGES.cancelled].includes(normalized)) {
    return normalized;
  }
  return PROCUREMENT_APPROVAL_STAGES.draft;
}

function getRequiredLevelForProcurementStage(stage = '') {
  const normalized = normalizeProcurementApprovalStage(stage);
  if (normalized === PROCUREMENT_APPROVAL_STAGES.financeLead) return 'finance_lead';
  if (normalized === PROCUREMENT_APPROVAL_STAGES.generalPresident) return 'general_president';
  return 'finance_manager';
}

function canReviewProcurementStage(adminLevel = '', stage = '') {
  const level = normalizeAdminLevel(adminLevel || '');
  const normalizedStage = normalizeProcurementApprovalStage(stage);
  if (!OPEN_PROCUREMENT_APPROVAL_STAGES.includes(normalizedStage)) return false;
  if (level === 'general_president') return true;
  return getRequiredLevelForProcurementStage(normalizedStage) === level;
}

function getNextProcurementStage(adminLevel = '', currentStage = '') {
  const level = normalizeAdminLevel(adminLevel || '');
  const stage = normalizeProcurementApprovalStage(currentStage);
  if (level === 'general_president') return PROCUREMENT_APPROVAL_STAGES.approved;
  if (level === 'finance_manager' && stage === PROCUREMENT_APPROVAL_STAGES.financeManager) return PROCUREMENT_APPROVAL_STAGES.financeLead;
  if (level === 'finance_lead' && stage === PROCUREMENT_APPROVAL_STAGES.financeLead) return PROCUREMENT_APPROVAL_STAGES.generalPresident;
  return '';
}

function actorAlreadyReviewed(trail = [], actorId = '') {
  return Array.isArray(trail)
    && trail.some((entry) => String(entry?.by || '') === String(actorId || ''));
}

function appendProcurementApprovalTrail(item, {
  level = '',
  action = '',
  by = '',
  note = '',
  reason = ''
} = {}) {
  if (!item) return;
  if (!Array.isArray(item.approvalTrail)) item.approvalTrail = [];
  item.approvalTrail.push({
    level: normalizeAdminLevel(level || ''),
    action: normalizeText(action).toLowerCase(),
    by: by || null,
    at: new Date(),
    note: normalizeText(note),
    reason: normalizeText(reason)
  });
}

function normalizeProcurementType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['purchase_order', 'service_agreement', 'other'].includes(normalized)) return normalized;
  return 'vendor_commitment';
}

function serializeProcurementUser(value = null) {
  if (!value) return null;
  return value?._id
    ? { _id: value._id, name: value.name || '' }
    : value;
}

function buildCoverageMap(expenses = []) {
  const map = new Map();
  (Array.isArray(expenses) ? expenses : []).forEach((item) => {
    const key = String(item?.procurementCommitmentId?._id || item?.procurementCommitmentId || '').trim();
    if (!key) return;
    const bucket = map.get(key) || {
      approvedExpenseAmount: 0,
      approvedExpenseCount: 0,
      latestExpenseDate: null
    };
    bucket.approvedExpenseAmount += Number(item?.amount || 0);
    bucket.approvedExpenseCount += 1;
    const latestAt = parseDate(item?.expenseDate || item?.createdAt, null);
    if (latestAt && (!bucket.latestExpenseDate || latestAt.getTime() > new Date(bucket.latestExpenseDate).getTime())) {
      bucket.latestExpenseDate = latestAt.toISOString();
    }
    map.set(key, bucket);
  });
  return map;
}

function serializeProcurementSettlement(item = null) {
  if (!item) return null;
  const plain = item?.toObject ? item.toObject() : { ...(item || {}) };
  return {
    ...plain,
    amount: Number(plain.amount || 0),
    treasuryAccountId: plain.treasuryAccountId?._id || plain.treasuryAccountId || null,
    treasuryTransactionId: plain.treasuryTransactionId?._id || plain.treasuryTransactionId || null,
    treasuryAccount: plain.treasuryAccountId?._id
      ? {
          _id: plain.treasuryAccountId._id,
          title: plain.treasuryAccountId.title || '',
          code: plain.treasuryAccountId.code || '',
          accountType: plain.treasuryAccountId.accountType || ''
        }
      : null,
    treasuryTransaction: plain.treasuryTransactionId?._id
      ? serializeTreasuryTransaction(plain.treasuryTransactionId)
      : null,
    createdBy: serializeProcurementUser(plain.createdBy)
  };
}

function serializeProcurementCommitment(item = null, coverageMap = new Map()) {
  if (!item) return null;
  const plain = item?.toObject ? item.toObject() : { ...(item || {}) };
  const coverage = coverageMap.get(String(plain._id || '')) || {
    approvedExpenseAmount: 0,
    approvedExpenseCount: 0,
    latestExpenseDate: null
  };
  const committedAmount = Number(plain.committedAmount || 0);
  const approvedExpenseAmount = Number(coverage.approvedExpenseAmount || 0);
  const settlements = (Array.isArray(plain.settlements) ? plain.settlements : []).map((entry) => serializeProcurementSettlement(entry)).filter(Boolean);
  const settledAmount = Number(settlements.reduce((sum, entry) => sum + Number(entry?.amount || 0), 0).toFixed(2));
  const outstandingAmount = Number(Math.max(0, committedAmount - approvedExpenseAmount).toFixed(2));
  const payableReadyAmount = Number(Math.max(0, approvedExpenseAmount - settledAmount).toFixed(2));
  const settlementBalanceAmount = Number(Math.max(0, committedAmount - settledAmount).toFixed(2));
  const fulfillmentPercent = committedAmount > 0
    ? Number(Math.min(100, (approvedExpenseAmount / committedAmount) * 100).toFixed(2))
    : 0;
  const settlementProgressPercent = committedAmount > 0
    ? Number(Math.min(100, (settledAmount / committedAmount) * 100).toFixed(2))
    : 0;

  return {
    ...plain,
    financialYearId: plain.financialYearId?._id || plain.financialYearId || null,
    academicYearId: plain.academicYearId?._id || plain.academicYearId || null,
    classId: plain.classId?._id || plain.classId || null,
    treasuryAccountId: plain.treasuryAccountId?._id || plain.treasuryAccountId || null,
    financialYear: plain.financialYearId?._id
      ? { _id: plain.financialYearId._id, title: plain.financialYearId.title || '', status: plain.financialYearId.status || '' }
      : null,
    academicYear: plain.academicYearId?._id
      ? { _id: plain.academicYearId._id, title: plain.academicYearId.title || '', code: plain.academicYearId.code || '' }
      : null,
    schoolClass: plain.classId?._id
      ? {
          _id: plain.classId._id,
          title: plain.classId.title || '',
          code: plain.classId.code || '',
          gradeLevel: plain.classId.gradeLevel ?? null,
          section: plain.classId.section || ''
        }
      : null,
    treasuryAccount: plain.treasuryAccountId?._id
      ? {
          _id: plain.treasuryAccountId._id,
          title: plain.treasuryAccountId.title || '',
          code: plain.treasuryAccountId.code || '',
          accountType: plain.treasuryAccountId.accountType || ''
        }
      : null,
    submittedBy: serializeProcurementUser(plain.submittedBy),
    approvedBy: serializeProcurementUser(plain.approvedBy),
    rejectedBy: serializeProcurementUser(plain.rejectedBy),
    createdBy: serializeProcurementUser(plain.createdBy),
    updatedBy: serializeProcurementUser(plain.updatedBy),
    approvalTrail: Array.isArray(plain.approvalTrail)
      ? plain.approvalTrail.map((entry) => ({
          ...entry,
          by: serializeProcurementUser(entry?.by)
        }))
      : [],
    settlements,
    settledAmount,
    settlementCount: settlements.length,
    payableReadyAmount,
    settlementBalanceAmount,
    settlementProgressPercent,
    lastSettledAt: plain.lastSettledAt ? new Date(plain.lastSettledAt).toISOString() : null,
    lastSettledBy: serializeProcurementUser(plain.lastSettledBy),
    approvedExpenseAmount,
    approvedExpenseCount: Number(coverage.approvedExpenseCount || 0),
    outstandingAmount,
    fulfillmentPercent,
    latestExpenseDate: coverage.latestExpenseDate || null
  };
}

async function populateProcurementCommitmentQuery(query) {
  return query
    .populate('financialYearId', 'title status isClosed')
    .populate('academicYearId', 'title code')
    .populate('classId', 'title code gradeLevel section')
    .populate('treasuryAccountId', 'title code accountType currency isActive')
    .populate('settlements.treasuryAccountId', 'title code accountType currency')
    .populate({
      path: 'settlements.treasuryTransactionId',
      select: 'transactionType transactionDate referenceNo sourceType status amount direction accountId counterAccountId createdBy updatedBy',
      populate: [
        { path: 'accountId', select: 'title code accountType accountNo' },
        { path: 'counterAccountId', select: 'title code accountType accountNo' },
        { path: 'createdBy', select: 'name' },
        { path: 'updatedBy', select: 'name' }
      ]
    })
    .populate('settlements.createdBy', 'name')
    .populate('lastSettledBy', 'name')
    .populate('approvalTrail.by', 'name')
    .populate('submittedBy', 'name')
    .populate('approvedBy', 'name')
    .populate('rejectedBy', 'name')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');
}

async function buildProcurementCommitmentAnalytics({
  financialYearId = '',
  academicYearId = '',
  classId = '',
  status = '',
  approvalStage = ''
} = {}) {
  const filter = {};
  if (normalizeText(financialYearId)) filter.financialYearId = normalizeText(financialYearId);
  if (normalizeText(academicYearId)) filter.academicYearId = normalizeText(academicYearId);
  if (normalizeText(classId)) filter.classId = normalizeText(classId);
  if (normalizeText(status)) filter.status = normalizeText(status).toLowerCase();
  if (normalizeText(approvalStage)) filter.approvalStage = normalizeProcurementApprovalStage(approvalStage);

  const commitments = await populateProcurementCommitmentQuery(
    FinanceProcurementCommitment.find(filter).sort({ requestDate: -1, createdAt: -1 })
  );
  const commitmentIds = commitments.map((item) => item._id);
  const approvedExpenses = commitmentIds.length
    ? await ExpenseEntry.find({
        procurementCommitmentId: { $in: commitmentIds },
        status: 'approved'
      }).select('procurementCommitmentId amount expenseDate createdAt')
    : [];

  const coverageMap = buildCoverageMap(approvedExpenses);
  const items = commitments.map((item) => serializeProcurementCommitment(item, coverageMap));
  const totalCommittedAmount = items.reduce((sum, item) => sum + Number(item.committedAmount || 0), 0);
  const totalApprovedExpenseAmount = items.reduce((sum, item) => sum + Number(item.approvedExpenseAmount || 0), 0);
  const totalOutstandingAmount = items.reduce((sum, item) => sum + Number(item.outstandingAmount || 0), 0);
  const totalSettledAmount = items.reduce((sum, item) => sum + Number(item.settledAmount || 0), 0);
  const totalPayableReadyAmount = items.reduce((sum, item) => sum + Number(item.payableReadyAmount || 0), 0);
  const vendorCount = new Set(items.map((item) => normalizeText(item.vendorName).toLowerCase()).filter(Boolean)).size;

  return {
    summary: {
      totalCount: items.length,
      draftCount: items.filter((item) => item.status === 'draft').length,
      pendingReviewCount: items.filter((item) => item.status === 'pending_review').length,
      approvedCount: items.filter((item) => item.status === 'approved').length,
      rejectedCount: items.filter((item) => item.status === 'rejected').length,
      cancelledCount: items.filter((item) => item.status === 'cancelled').length,
      vendorCount,
      totalCommittedAmount: Number(totalCommittedAmount.toFixed(2)),
      totalApprovedExpenseAmount: Number(totalApprovedExpenseAmount.toFixed(2)),
      totalOutstandingAmount: Number(totalOutstandingAmount.toFixed(2)),
      totalSettledAmount: Number(totalSettledAmount.toFixed(2)),
      totalPayableReadyAmount: Number(totalPayableReadyAmount.toFixed(2)),
      openCommitmentCount: items.filter((item) => item.status === 'approved' && Number(item.outstandingAmount || 0) > 0).length,
      settlementReadyCount: items.filter((item) => item.status === 'approved' && Number(item.payableReadyAmount || 0) > 0).length,
      settledCount: items.filter((item) => Number(item.settledAmount || 0) > 0).length
    },
    items,
    vendors: Array.from(items
      .reduce((list, item) => {
        const key = normalizeText(item.vendorName).toLowerCase();
        if (!key) return list;
        const current = list.get(key) || {
          vendorName: item.vendorName,
          commitmentCount: 0,
          committedAmount: 0,
          outstandingAmount: 0,
          settledAmount: 0,
          payableReadyAmount: 0
        };
        current.commitmentCount += 1;
        current.committedAmount += Number(item.committedAmount || 0);
        current.outstandingAmount += Number(item.outstandingAmount || 0);
        current.settledAmount += Number(item.settledAmount || 0);
        current.payableReadyAmount += Number(item.payableReadyAmount || 0);
        list.set(key, current);
        return list;
      }, new Map())
      .values())
  };
}

async function createProcurementSettlement({
  commitment,
  payload = {},
  actorId = ''
} = {}) {
  if (!commitment) {
    const error = new Error('finance_procurement_commitment_not_found');
    error.statusCode = 404;
    throw error;
  }
  if (String(commitment.status || '') !== 'approved') {
    const error = new Error('finance_procurement_commitment_status_invalid');
    error.statusCode = 409;
    throw error;
  }

  const amount = normalizeMoney(payload.amount, 0);
  if (amount <= 0) {
    const error = new Error('finance_procurement_settlement_invalid');
    error.statusCode = 400;
    throw error;
  }
  const settlementDate = parseDate(payload.settlementDate, null);
  if (!settlementDate) {
    const error = new Error('finance_procurement_settlement_date_invalid');
    error.statusCode = 400;
    throw error;
  }

  const financialYearId = String(commitment.financialYearId?._id || commitment.financialYearId || '');
  const academicYearId = String(commitment.academicYearId?._id || commitment.academicYearId || '');
  const classId = String(commitment.classId?._id || commitment.classId || '');
  const analytics = await buildProcurementCommitmentAnalytics({
    financialYearId,
    academicYearId,
    classId
  });
  const current = (analytics.items || []).find((item) => String(item._id || '') === String(commitment._id || '')) || serializeProcurementCommitment(commitment);
  const payableReadyAmount = Number(current?.payableReadyAmount || 0);
  if (payableReadyAmount <= 0 || amount > payableReadyAmount) {
    const error = new Error('finance_procurement_settlement_limit');
    error.statusCode = 409;
    throw error;
  }

  const treasuryAccount = await resolveTreasuryAccountSelection({
    accountId: payload.treasuryAccountId || commitment.treasuryAccountId,
    schoolId: commitment.schoolId,
    financialYearId: commitment.financialYearId,
    academicYearId: commitment.academicYearId
  });

  const referenceNo = normalizeText(payload.referenceNo || commitment.referenceNo || `SET-${String(commitment._id || '').slice(-6)}`);
  const transaction = await FinanceTreasuryTransaction.create({
    schoolId: commitment.schoolId,
    financialYearId: commitment.financialYearId,
    academicYearId: commitment.academicYearId,
    accountId: treasuryAccount._id,
    transactionType: 'withdrawal',
    direction: 'out',
    amount,
    currency: normalizeText(payload.currency || treasuryAccount.currency || commitment.currency || 'AFN').toUpperCase() || 'AFN',
    transactionDate: settlementDate,
    sourceType: 'procurement_settlement',
    referenceNo,
    note: normalizeText(payload.note) || `Vendor settlement for ${normalizeText(commitment.title || commitment.vendorName || 'commitment')}`,
    createdBy: actorId || null,
    updatedBy: actorId || null
  });
  const savedTransaction = await FinanceTreasuryTransaction.findById(transaction._id)
    .populate('accountId', 'title code accountType accountNo')
    .populate('counterAccountId', 'title code accountType accountNo')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  commitment.settlements = Array.isArray(commitment.settlements) ? commitment.settlements : [];
  commitment.settlements.push({
    amount,
    currency: normalizeText(payload.currency || treasuryAccount.currency || commitment.currency || 'AFN').toUpperCase() || 'AFN',
    settlementDate,
    treasuryAccountId: treasuryAccount._id,
    treasuryTransactionId: transaction._id,
    referenceNo,
    note: normalizeText(payload.note),
    createdBy: actorId || null,
    createdAt: new Date()
  });
  commitment.lastSettledAt = settlementDate;
  commitment.lastSettledBy = actorId || null;
  commitment.updatedBy = actorId || commitment.updatedBy || null;
  await commitment.save();

  const refreshed = await populateProcurementCommitmentQuery(
    FinanceProcurementCommitment.findById(commitment._id)
  );
  const refreshedAnalytics = await buildProcurementCommitmentAnalytics({
    financialYearId,
    academicYearId,
    classId
  });
  const coverageMap = new Map(
    (refreshedAnalytics.items || []).map((entry) => [String(entry._id || ''), {
      approvedExpenseAmount: Number(entry.approvedExpenseAmount || 0),
      approvedExpenseCount: Number(entry.approvedExpenseCount || 0),
      latestExpenseDate: entry.latestExpenseDate || null
    }])
  );

  return {
    item: serializeProcurementCommitment(refreshed, coverageMap),
    settlement: serializeTreasuryTransaction(savedTransaction)
  };
}

async function resolveProcurementCommitmentSelection({
  commitmentId = '',
  financialYearId = '',
  academicYearId = '',
  allowStatuses = ['approved']
} = {}) {
  const normalizedCommitmentId = normalizeText(commitmentId);
  if (!normalizedCommitmentId) return null;

  const commitment = await populateProcurementCommitmentQuery(
    FinanceProcurementCommitment.findById(normalizedCommitmentId)
  );
  if (!commitment) {
    const error = new Error('finance_procurement_commitment_not_found');
    error.statusCode = 404;
    throw error;
  }
  if (normalizeText(financialYearId) && String(commitment.financialYearId?._id || commitment.financialYearId || '') !== String(financialYearId)) {
    const error = new Error('finance_procurement_commitment_scope_invalid');
    error.statusCode = 400;
    throw error;
  }
  if (normalizeText(academicYearId) && String(commitment.academicYearId?._id || commitment.academicYearId || '') !== String(academicYearId)) {
    const error = new Error('finance_procurement_commitment_scope_invalid');
    error.statusCode = 400;
    throw error;
  }
  if (Array.isArray(allowStatuses) && allowStatuses.length && !allowStatuses.includes(String(commitment.status || ''))) {
    const error = new Error('finance_procurement_commitment_status_invalid');
    error.statusCode = 409;
    throw error;
  }
  return commitment;
}

async function createProcurementCommitment({
  financialYear,
  payload = {},
  actorId = '',
  classId = ''
} = {}) {
  if (!financialYear?._id) {
    const error = new Error('finance_financial_year_not_found');
    error.statusCode = 404;
    throw error;
  }

  const title = normalizeText(payload.title);
  const vendorName = normalizeText(payload.vendorName);
  const committedAmount = normalizeMoney(payload.committedAmount, 0);
  if (!title || !vendorName || committedAmount <= 0) {
    const error = new Error('finance_procurement_commitment_invalid');
    error.statusCode = 400;
    throw error;
  }

  const categorySelection = await resolveExpenseCategorySelection({
    category: payload.category,
    subCategory: payload.subCategory
  });

  let treasuryAccount = null;
  if (normalizeText(payload.treasuryAccountId)) {
    treasuryAccount = await resolveTreasuryAccountSelection({
      accountId: payload.treasuryAccountId,
      schoolId: financialYear.schoolId,
      financialYearId: financialYear._id,
      academicYearId: financialYear.academicYearId
    });
  }

  const requestDate = parseDate(payload.requestDate, null);
  if (!requestDate) {
    const error = new Error('finance_procurement_commitment_date_invalid');
    error.statusCode = 400;
    throw error;
  }

  const item = new FinanceProcurementCommitment({
    schoolId: financialYear.schoolId,
    financialYearId: financialYear._id,
    academicYearId: financialYear.academicYearId,
    classId: classId || null,
    treasuryAccountId: treasuryAccount?._id || null,
    category: categorySelection.category,
    subCategory: categorySelection.subCategory,
    procurementType: normalizeProcurementType(payload.procurementType),
    title,
    vendorName,
    description: normalizeText(payload.description),
    committedAmount,
    currency: normalizeText(payload.currency || 'AFN').toUpperCase() || 'AFN',
    requestDate,
    expectedDeliveryDate: parseDate(payload.expectedDeliveryDate, null),
    referenceNo: normalizeText(payload.referenceNo),
    paymentTerms: normalizeText(payload.paymentTerms),
    note: normalizeText(payload.note),
    status: 'draft',
    approvalStage: PROCUREMENT_APPROVAL_STAGES.draft,
    createdBy: actorId || null,
    updatedBy: actorId || null
  });

  if (String(payload.status || '').trim() === 'pending_review') {
    item.status = 'pending_review';
    item.approvalStage = PROCUREMENT_APPROVAL_STAGES.financeManager;
    item.submittedBy = actorId || null;
    item.submittedAt = new Date();
    appendProcurementApprovalTrail(item, {
      level: 'finance_manager',
      action: 'submit',
      by: actorId,
      note: 'Submitted during commitment creation.'
    });
  }

  await item.save();
  const saved = await populateProcurementCommitmentQuery(
    FinanceProcurementCommitment.findById(item._id)
  );
  const analytics = await buildProcurementCommitmentAnalytics({
    financialYearId: String(financialYear._id || ''),
    academicYearId: String(financialYear.academicYearId || ''),
    classId
  });
  const coverageMap = new Map(
    (analytics.items || []).map((entry) => [String(entry._id || ''), {
      approvedExpenseAmount: Number(entry.approvedExpenseAmount || 0),
      approvedExpenseCount: Number(entry.approvedExpenseCount || 0),
      latestExpenseDate: entry.latestExpenseDate || null
    }])
  );
  return serializeProcurementCommitment(saved, coverageMap);
}

async function submitProcurementCommitmentForReview({
  commitment,
  actorId = '',
  note = ''
} = {}) {
  if (!commitment) {
    const error = new Error('finance_procurement_commitment_not_found');
    error.statusCode = 404;
    throw error;
  }
  if (['approved', 'cancelled'].includes(String(commitment.status || ''))) {
    const error = new Error('finance_procurement_commitment_status_invalid');
    error.statusCode = 409;
    throw error;
  }
  commitment.status = 'pending_review';
  commitment.approvalStage = PROCUREMENT_APPROVAL_STAGES.financeManager;
  commitment.submittedBy = actorId || commitment.submittedBy || null;
  commitment.submittedAt = commitment.submittedAt || new Date();
  commitment.rejectedBy = null;
  commitment.rejectedAt = null;
  commitment.rejectReason = '';
  commitment.updatedBy = actorId || commitment.updatedBy || null;
  appendProcurementApprovalTrail(commitment, {
    level: 'finance_manager',
    action: 'submit',
    by: actorId,
    note: note || 'Submitted for procurement review.'
  });
  await commitment.save();
  return populateProcurementCommitmentQuery(FinanceProcurementCommitment.findById(commitment._id));
}

async function reviewProcurementCommitmentTransition({
  commitment,
  actorId = '',
  actorLevel = '',
  action = 'approve',
  note = '',
  reason = ''
} = {}) {
  if (!commitment) {
    const error = new Error('finance_procurement_commitment_not_found');
    error.statusCode = 404;
    throw error;
  }

  const currentStage = normalizeProcurementApprovalStage(commitment.approvalStage);
  if (!OPEN_PROCUREMENT_APPROVAL_STAGES.includes(currentStage)) {
    const error = new Error('finance_procurement_review_stage_invalid');
    error.statusCode = 409;
    throw error;
  }
  if (!canReviewProcurementStage(actorLevel, currentStage)) {
    const error = new Error('finance_procurement_review_level_invalid');
    error.statusCode = 403;
    throw error;
  }
  if (actorAlreadyReviewed(commitment.approvalTrail, actorId)) {
    const error = new Error('finance_procurement_already_reviewed');
    error.statusCode = 409;
    throw error;
  }

  const normalizedLevel = normalizeAdminLevel(actorLevel || '');
  const normalizedAction = String(action || 'approve').trim().toLowerCase() === 'reject'
    ? 'reject'
    : 'approve';

  if (normalizedAction === 'reject') {
    commitment.status = 'rejected';
    commitment.approvalStage = PROCUREMENT_APPROVAL_STAGES.rejected;
    commitment.rejectedBy = actorId || null;
    commitment.rejectedAt = new Date();
    commitment.rejectReason = normalizeText(reason);
    commitment.updatedBy = actorId || null;
    appendProcurementApprovalTrail(commitment, {
      level: normalizedLevel,
      action: 'reject',
      by: actorId,
      note,
      reason
    });
    await commitment.save();
    return {
      nextStage: PROCUREMENT_APPROVAL_STAGES.rejected,
      completed: false,
      item: await populateProcurementCommitmentQuery(FinanceProcurementCommitment.findById(commitment._id))
    };
  }

  const nextStage = getNextProcurementStage(normalizedLevel, currentStage);
  if (!nextStage) {
    const error = new Error('finance_procurement_review_stage_invalid');
    error.statusCode = 409;
    throw error;
  }

  commitment.updatedBy = actorId || null;
  appendProcurementApprovalTrail(commitment, {
    level: normalizedLevel,
    action: 'approve',
    by: actorId,
    note
  });

  if (nextStage === PROCUREMENT_APPROVAL_STAGES.approved) {
    commitment.status = 'approved';
    commitment.approvalStage = PROCUREMENT_APPROVAL_STAGES.approved;
    commitment.approvedBy = actorId || null;
    commitment.approvedAt = new Date();
    await commitment.save();
    return {
      nextStage,
      completed: true,
      item: await populateProcurementCommitmentQuery(FinanceProcurementCommitment.findById(commitment._id))
    };
  }

  commitment.status = 'pending_review';
  commitment.approvalStage = nextStage;
  await commitment.save();
  return {
    nextStage,
    completed: false,
    item: await populateProcurementCommitmentQuery(FinanceProcurementCommitment.findById(commitment._id))
  };
}

module.exports = {
  PROCUREMENT_APPROVAL_STAGES,
  buildProcurementCommitmentAnalytics,
  createProcurementSettlement,
  createProcurementCommitment,
  populateProcurementCommitmentQuery,
  resolveProcurementCommitmentSelection,
  reviewProcurementCommitmentTransition,
  serializeProcurementCommitment,
  submitProcurementCommitmentForReview
};
