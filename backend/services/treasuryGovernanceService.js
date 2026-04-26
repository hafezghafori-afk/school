const crypto = require('crypto');
const FinanceTreasuryAccount = require('../models/FinanceTreasuryAccount');
const FinanceTreasuryTransaction = require('../models/FinanceTreasuryTransaction');
const ExpenseEntry = require('../models/ExpenseEntry');

const TREASURY_ACCOUNT_TYPES = new Set(['cashbox', 'bank', 'hawala', 'mobile_money', 'other']);
const TREASURY_TRANSACTION_TYPE_META = Object.freeze({
  deposit: { direction: 'in', sourceType: 'manual' },
  withdrawal: { direction: 'out', sourceType: 'manual' },
  adjustment_in: { direction: 'in', sourceType: 'manual' },
  adjustment_out: { direction: 'out', sourceType: 'manual' },
  transfer_in: { direction: 'in', sourceType: 'transfer' },
  transfer_out: { direction: 'out', sourceType: 'transfer' },
  reconciliation_adjustment: { direction: 'in', sourceType: 'reconciliation' }
});

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeMoney(value, fallback = 0) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;
  return Math.max(0, Number(amount.toFixed(2)));
}

function toDate(value = null, fallback = null) {
  if (!value) return fallback;
  const next = new Date(value);
  return Number.isNaN(next.getTime()) ? fallback : next;
}

function serializeUserRef(value = null) {
  if (!value) return null;
  if (value?._id) {
    return {
      _id: value._id,
      name: value.name || ''
    };
  }
  return value;
}

function maskAccountNo(value = '') {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.length <= 4) return `***${normalized}`;
  return `***${normalized.slice(-4)}`;
}

async function resolveTreasuryAccountSelection({
  accountId = '',
  schoolId = '',
  financialYearId = '',
  academicYearId = '',
  allowInactive = false
} = {}) {
  const normalizedAccountId = normalizeText(accountId);
  if (!normalizedAccountId) return null;

  const account = await FinanceTreasuryAccount.findById(normalizedAccountId)
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name')
    .populate('lastReconciledBy', 'name');

  if (!account) {
    const error = new Error('finance_treasury_account_invalid');
    error.statusCode = 404;
    throw error;
  }

  if (schoolId && String(account.schoolId || '') !== String(schoolId)) {
    const error = new Error('finance_treasury_account_invalid');
    error.statusCode = 409;
    throw error;
  }
  if (financialYearId && String(account.financialYearId || '') !== String(financialYearId)) {
    const error = new Error('finance_treasury_account_invalid');
    error.statusCode = 409;
    throw error;
  }
  if (academicYearId && String(account.academicYearId || '') !== String(academicYearId)) {
    const error = new Error('finance_treasury_account_invalid');
    error.statusCode = 409;
    throw error;
  }
  if (!allowInactive && account.isActive === false) {
    const error = new Error('finance_treasury_account_inactive');
    error.statusCode = 409;
    throw error;
  }

  return account;
}

function serializeTreasuryAccount(value = null, metricsByAccountId = new Map()) {
  if (!value) return null;
  const plain = value?.toObject ? value.toObject() : { ...(value || {}) };
  const metrics = metricsByAccountId.get(String(plain._id || '')) || {
    manualInflow: 0,
    manualOutflow: 0,
    transferIn: 0,
    transferOut: 0,
    expenseOutflow: 0,
    bookBalance: Number(plain.openingBalance || 0),
    lastTransactionAt: null,
    transferCount: 0,
    expenseCount: 0
  };
  return {
    ...plain,
    accountNoMasked: maskAccountNo(plain.accountNo),
    createdBy: serializeUserRef(plain.createdBy),
    updatedBy: serializeUserRef(plain.updatedBy),
    lastReconciledBy: serializeUserRef(plain.lastReconciledBy),
    metrics: {
      manualInflow: Number(metrics.manualInflow || 0),
      manualOutflow: Number(metrics.manualOutflow || 0),
      transferIn: Number(metrics.transferIn || 0),
      transferOut: Number(metrics.transferOut || 0),
      expenseOutflow: Number(metrics.expenseOutflow || 0),
      transferCount: Number(metrics.transferCount || 0),
      expenseCount: Number(metrics.expenseCount || 0),
      bookBalance: Number(metrics.bookBalance || 0),
      lastTransactionAt: metrics.lastTransactionAt || null
    }
  };
}

function serializeTreasuryTransaction(value = null, accountById = new Map()) {
  if (!value) return null;
  const plain = value?.toObject ? value.toObject() : { ...(value || {}) };
  const accountRef = plain.accountId?._id
    ? plain.accountId
    : accountById.get(String(plain.accountId || '')) || plain.accountId || null;
  const counterRef = plain.counterAccountId?._id
    ? plain.counterAccountId
    : accountById.get(String(plain.counterAccountId || '')) || plain.counterAccountId || null;
  return {
    ...plain,
    accountId: accountRef?._id || accountRef || null,
    counterAccountId: counterRef?._id || counterRef || null,
    account: accountRef?._id
      ? {
          _id: accountRef._id,
          title: accountRef.title || '',
          code: accountRef.code || '',
          accountType: accountRef.accountType || '',
          accountNoMasked: maskAccountNo(accountRef.accountNo)
        }
      : null,
    counterAccount: counterRef?._id
      ? {
          _id: counterRef._id,
          title: counterRef.title || '',
          code: counterRef.code || '',
          accountType: counterRef.accountType || '',
          accountNoMasked: maskAccountNo(counterRef.accountNo)
        }
      : null,
    createdBy: serializeUserRef(plain.createdBy),
    updatedBy: serializeUserRef(plain.updatedBy)
  };
}

function accumulateAccountMetrics({
  accounts = [],
  transactions = [],
  expenses = []
} = {}) {
  const metricsByAccountId = new Map(
    (accounts || []).map((account) => [String(account._id), {
      manualInflow: 0,
      manualOutflow: 0,
      transferIn: 0,
      transferOut: 0,
      expenseOutflow: 0,
      transferCount: 0,
      expenseCount: 0,
      bookBalance: Number(account.openingBalance || 0),
      lastTransactionAt: null
    }])
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
  });

  return metricsByAccountId;
}

async function loadTreasuryDataset({
  financialYearId = '',
  academicYearId = '',
  accountId = ''
} = {}) {
  const normalizedFinancialYearId = normalizeText(financialYearId);
  const normalizedAcademicYearId = normalizeText(academicYearId);
  const normalizedAccountId = normalizeText(accountId);
  const accountFilter = {};

  if (normalizedFinancialYearId) accountFilter.financialYearId = normalizedFinancialYearId;
  if (normalizedAcademicYearId) accountFilter.academicYearId = normalizedAcademicYearId;

  if (normalizedAccountId) {
    await resolveTreasuryAccountSelection({
      accountId: normalizedAccountId,
      financialYearId: normalizedFinancialYearId,
      academicYearId: normalizedAcademicYearId,
      allowInactive: true
    });
    accountFilter._id = normalizedAccountId;
  }

  const accounts = await FinanceTreasuryAccount.find(accountFilter)
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name')
    .populate('lastReconciledBy', 'name')
    .sort({ isActive: -1, accountType: 1, title: 1 });

  const accountIds = accounts.map((item) => item._id);
  const accountIdFilter = accountIds.length ? { $in: accountIds } : { $in: [] };

  const [transactions, approvedExpenses, unassignedApprovedExpenses] = await Promise.all([
    accountIds.length
      ? FinanceTreasuryTransaction.find({
          accountId: accountIdFilter,
          status: { $ne: 'void' }
        })
        .populate('accountId', 'title code accountType accountNo')
        .populate('counterAccountId', 'title code accountType accountNo')
        .populate('createdBy', 'name')
        .populate('updatedBy', 'name')
        .sort({ transactionDate: -1, createdAt: -1 })
      : [],
    accountIds.length
      ? ExpenseEntry.find({
          treasuryAccountId: accountIdFilter,
          status: 'approved'
        })
        .populate('treasuryAccountId', 'title code accountType accountNo')
        .sort({ expenseDate: -1, createdAt: -1 })
        .lean()
      : [],
    ExpenseEntry.find({
      ...(normalizedFinancialYearId ? { financialYearId: normalizedFinancialYearId } : {}),
      ...(normalizedAcademicYearId ? { academicYearId: normalizedAcademicYearId } : {}),
      status: 'approved',
      $or: [
        { treasuryAccountId: null },
        { treasuryAccountId: { $exists: false } }
      ]
    }).lean()
  ]);

  const metricsByAccountId = accumulateAccountMetrics({
    accounts,
    transactions,
    expenses: approvedExpenses
  });
  const accountById = new Map(accounts.map((item) => [String(item._id), item]));
  const serializedAccounts = accounts.map((item) => serializeTreasuryAccount(item, metricsByAccountId));

  return {
    accounts,
    transactions,
    approvedExpenses,
    unassignedApprovedExpenses,
    metricsByAccountId,
    accountById,
    serializedAccounts
  };
}

function buildTreasuryCashbookReport({
  selectedAccount = null,
  metricsByAccountId = new Map(),
  transactions = [],
  approvedExpenses = [],
  accountById = new Map()
} = {}) {
  if (!selectedAccount) {
    return {
      account: null,
      rows: [],
      summary: {
        openingBalance: 0,
        inflowTotal: 0,
        outflowTotal: 0,
        closingBalance: 0,
        rowCount: 0
      }
    };
  }

  const selectedAccountKey = String(selectedAccount._id || '');
  const timelineRows = [];
  const openingBalance = Number(selectedAccount.openingBalance || 0);

  (transactions || []).forEach((item) => {
    const itemAccountKey = String(item.accountId?._id || item.accountId || '');
    if (itemAccountKey !== selectedAccountKey) return;
    const transaction = serializeTreasuryTransaction(item, accountById);
    timelineRows.push({
      key: `txn-${transaction._id}`,
      postedAt: transaction.transactionDate || transaction.createdAt || null,
      sourceType: transaction.sourceType || 'manual',
      rowType: 'transaction',
      transactionType: transaction.transactionType || '',
      title: transaction.transactionType || 'transaction',
      referenceNo: transaction.referenceNo || '',
      note: transaction.note || '',
      counterparty: transaction.counterAccount?.title || '',
      amount: Number(transaction.amount || 0),
      inflow: transaction.direction === 'in' ? Number(transaction.amount || 0) : 0,
      outflow: transaction.direction === 'out' ? Number(transaction.amount || 0) : 0
    });
  });

  (approvedExpenses || []).forEach((item) => {
    const expenseAccountKey = String(item.treasuryAccountId?._id || item.treasuryAccountId || '');
    if (expenseAccountKey !== selectedAccountKey) return;
    timelineRows.push({
      key: `exp-${item._id}`,
      postedAt: item.expenseDate || item.createdAt || null,
      sourceType: 'expense',
      rowType: 'expense',
      transactionType: 'expense_outflow',
      title: item.subCategory || item.category || 'expense',
      referenceNo: item.referenceNo || '',
      note: item.note || '',
      counterparty: item.vendorName || '',
      amount: Number(item.amount || 0),
      inflow: 0,
      outflow: Number(item.amount || 0)
    });
  });

  timelineRows.sort((left, right) => {
    const leftTime = toDate(left.postedAt, new Date(0)).getTime();
    const rightTime = toDate(right.postedAt, new Date(0)).getTime();
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left.key || '').localeCompare(String(right.key || ''));
  });

  let runningBalance = openingBalance;
  let inflowTotal = 0;
  let outflowTotal = 0;
  const rows = timelineRows.map((item) => {
    inflowTotal += Number(item.inflow || 0);
    outflowTotal += Number(item.outflow || 0);
    runningBalance += Number(item.inflow || 0);
    runningBalance -= Number(item.outflow || 0);
    return {
      ...item,
      balance: Number(runningBalance.toFixed(2))
    };
  });

  const metrics = metricsByAccountId.get(selectedAccountKey) || null;
  const serializedAccount = serializeTreasuryAccount(selectedAccount, metricsByAccountId);
  return {
    account: serializedAccount,
    rows,
    summary: {
      openingBalance: Number(openingBalance.toFixed(2)),
      inflowTotal: Number(inflowTotal.toFixed(2)),
      outflowTotal: Number(outflowTotal.toFixed(2)),
      closingBalance: Number(((metrics?.bookBalance) != null ? metrics.bookBalance : runningBalance).toFixed(2)),
      rowCount: rows.length
    }
  };
}

function buildTreasuryMovementSummaryReport(serializedAccounts = []) {
  const rows = (serializedAccounts || []).map((item) => ({
    accountId: item._id,
    accountTitle: item.title || item.code || '',
    accountCode: item.code || '',
    accountType: item.accountType || '',
    openingBalance: Number(item.openingBalance || 0),
    manualInflow: Number(item.metrics?.manualInflow || 0),
    manualOutflow: Number(item.metrics?.manualOutflow || 0),
    transferIn: Number(item.metrics?.transferIn || 0),
    transferOut: Number(item.metrics?.transferOut || 0),
    expenseOutflow: Number(item.metrics?.expenseOutflow || 0),
    netChange: Number((
      Number(item.metrics?.manualInflow || 0)
      + Number(item.metrics?.transferIn || 0)
      - Number(item.metrics?.manualOutflow || 0)
      - Number(item.metrics?.transferOut || 0)
      - Number(item.metrics?.expenseOutflow || 0)
    ).toFixed(2)),
    closingBalance: Number(item.metrics?.bookBalance || 0),
    lastTransactionAt: item.metrics?.lastTransactionAt || null
  }));

  return {
    rows,
    summary: {
      accountCount: rows.length,
      totalOpeningBalance: Number(rows.reduce((sum, item) => sum + Number(item.openingBalance || 0), 0).toFixed(2)),
      totalClosingBalance: Number(rows.reduce((sum, item) => sum + Number(item.closingBalance || 0), 0).toFixed(2)),
      totalNetChange: Number(rows.reduce((sum, item) => sum + Number(item.netChange || 0), 0).toFixed(2))
    }
  };
}

function buildTreasuryReconciliationReport(serializedAccounts = []) {
  const rows = (serializedAccounts || []).map((item) => {
    const variance = Number(item.lastReconciliationVariance || 0);
    let status = 'pending';
    if (item.lastReconciledAt) {
      status = Math.abs(variance) < 0.01 ? 'matched' : 'variance';
    }
    return {
      accountId: item._id,
      accountTitle: item.title || item.code || '',
      accountCode: item.code || '',
      accountType: item.accountType || '',
      bookBalance: Number(item.metrics?.bookBalance || 0),
      statementBalance: Number(item.lastStatementBalance || 0),
      variance,
      status,
      lastReconciledAt: item.lastReconciledAt || null,
      lastReconciledBy: item.lastReconciledBy || null
    };
  });

  return {
    rows,
    summary: {
      totalAccounts: rows.length,
      matchedCount: rows.filter((item) => item.status === 'matched').length,
      varianceCount: rows.filter((item) => item.status === 'variance').length,
      pendingCount: rows.filter((item) => item.status === 'pending').length
    }
  };
}

function buildTreasuryVarianceReport({
  serializedAccounts = [],
  unassignedApprovedExpenses = []
} = {}) {
  const rows = [];

  (serializedAccounts || []).forEach((item) => {
    if (!item.lastReconciledAt) {
      rows.push({
        key: `missing-${item._id}`,
        issueType: 'missing_reconciliation',
        severity: 'warning',
        accountId: item._id,
        accountTitle: item.title || item.code || '',
        referenceNo: '',
        amount: Number(item.metrics?.bookBalance || 0),
        occurredAt: item.metrics?.lastTransactionAt || item.updatedAt || item.createdAt || null,
        note: 'Account has not been reconciled yet.'
      });
      return;
    }

    const variance = Number(item.lastReconciliationVariance || 0);
    if (Math.abs(variance) >= 0.01) {
      rows.push({
        key: `variance-${item._id}`,
        issueType: 'reconciliation_variance',
        severity: Math.abs(variance) >= 500 ? 'critical' : 'warning',
        accountId: item._id,
        accountTitle: item.title || item.code || '',
        referenceNo: '',
        amount: variance,
        occurredAt: item.lastReconciledAt || null,
        note: 'Reconciliation variance still needs follow-up.'
      });
    }
  });

  (unassignedApprovedExpenses || []).forEach((item) => {
    rows.push({
      key: `expense-${item._id}`,
      issueType: 'unassigned_expense',
      severity: 'critical',
      accountId: '',
      accountTitle: item.vendorName || item.category || 'expense',
      referenceNo: item.referenceNo || '',
      amount: Number(item.amount || 0),
      occurredAt: item.expenseDate || item.createdAt || null,
      note: 'Approved expense is not linked to a treasury account.'
    });
  });

  rows.sort((left, right) => {
    const leftTime = toDate(left.occurredAt, new Date(0)).getTime();
    const rightTime = toDate(right.occurredAt, new Date(0)).getTime();
    return rightTime - leftTime;
  });

  return {
    rows,
    summary: {
      totalIssues: rows.length,
      criticalCount: rows.filter((item) => item.severity === 'critical').length,
      warningCount: rows.filter((item) => item.severity === 'warning').length
    }
  };
}

async function buildTreasuryReportBundle({
  financialYearId = '',
  academicYearId = '',
  accountId = ''
} = {}) {
  const {
    accounts,
    transactions,
    approvedExpenses,
    unassignedApprovedExpenses,
    metricsByAccountId,
    accountById,
    serializedAccounts
  } = await loadTreasuryDataset({
    financialYearId,
    academicYearId,
    accountId
  });

  const selectedAccount = accounts[0] || null;
  return {
    generatedAt: new Date().toISOString(),
    selectedAccountId: selectedAccount?._id ? String(selectedAccount._id) : '',
    cashbook: buildTreasuryCashbookReport({
      selectedAccount,
      metricsByAccountId,
      transactions,
      approvedExpenses,
      accountById
    }),
    movementSummary: buildTreasuryMovementSummaryReport(serializedAccounts),
    reconciliation: buildTreasuryReconciliationReport(serializedAccounts),
    variance: buildTreasuryVarianceReport({
      serializedAccounts,
      unassignedApprovedExpenses
    })
  };
}

async function buildTreasuryAnalytics({
  financialYearId = '',
  academicYearId = '',
  accountId = ''
} = {}) {
  const {
    transactions,
    unassignedApprovedExpenses,
    accountById,
    serializedAccounts
  } = await loadTreasuryDataset({
    financialYearId,
    academicYearId,
    accountId
  });
  const recentTransactions = transactions
    .slice(0, 12)
    .map((item) => serializeTreasuryTransaction(item, accountById));

  const summary = {
    accountCount: serializedAccounts.length,
    activeAccountCount: serializedAccounts.filter((item) => item.isActive !== false).length,
    cashBalance: Number(serializedAccounts
      .filter((item) => item.accountType === 'cashbox')
      .reduce((sum, item) => sum + Number(item.metrics?.bookBalance || 0), 0)
      .toFixed(2)),
    bankBalance: Number(serializedAccounts
      .filter((item) => item.accountType === 'bank')
      .reduce((sum, item) => sum + Number(item.metrics?.bookBalance || 0), 0)
      .toFixed(2)),
    bookBalance: Number(serializedAccounts
      .reduce((sum, item) => sum + Number(item.metrics?.bookBalance || 0), 0)
      .toFixed(2)),
    manualInflow: Number(serializedAccounts
      .reduce((sum, item) => sum + Number(item.metrics?.manualInflow || 0), 0)
      .toFixed(2)),
    manualOutflow: Number(serializedAccounts
      .reduce((sum, item) => sum + Number(item.metrics?.manualOutflow || 0), 0)
      .toFixed(2)),
    transferCount: serializedAccounts.reduce((sum, item) => sum + Number(item.metrics?.transferCount || 0), 0) / 2,
    expenseOutflow: Number(serializedAccounts
      .reduce((sum, item) => sum + Number(item.metrics?.expenseOutflow || 0), 0)
      .toFixed(2)),
    unassignedApprovedExpenseCount: unassignedApprovedExpenses.length,
    unassignedApprovedExpenseAmount: Number(unassignedApprovedExpenses
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
      .toFixed(2)),
    reconciledAccountCount: serializedAccounts.filter((item) => item.lastReconciledAt).length,
    unreconciledAccountCount: serializedAccounts.filter((item) => !item.lastReconciledAt).length
  };

  const alerts = [];
  if (summary.unassignedApprovedExpenseCount > 0) {
    alerts.push({
      key: 'unassigned_expense',
      tone: 'rose',
      label: `${summary.unassignedApprovedExpenseCount} مصرف تاییدشده هنوز به حساب خزانه وصل نشده است.`
    });
  }
  if (summary.unreconciledAccountCount > 0) {
    alerts.push({
      key: 'unreconciled_accounts',
      tone: 'copper',
      label: `${summary.unreconciledAccountCount} حساب خزانه هنوز تطبیق رسمی ندارد.`
    });
  }

  return {
    summary,
    accounts: serializedAccounts,
    recentTransactions,
    alerts
  };
}

async function createTreasuryAccount({ financialYear, payload = {}, actorId = '' } = {}) {
  const code = normalizeText(payload.code).toUpperCase();
  const title = normalizeText(payload.title);
  const accountType = normalizeText(payload.accountType).toLowerCase() || 'cashbox';

  if (!code || !title) {
    const error = new Error('finance_treasury_account_invalid');
    error.statusCode = 400;
    throw error;
  }
  if (!TREASURY_ACCOUNT_TYPES.has(accountType)) {
    const error = new Error('finance_treasury_account_type_invalid');
    error.statusCode = 400;
    throw error;
  }

  const exists = await FinanceTreasuryAccount.exists({
    schoolId: financialYear.schoolId,
    financialYearId: financialYear._id,
    code
  });
  if (exists) {
    const error = new Error('finance_treasury_account_duplicate_code');
    error.statusCode = 409;
    throw error;
  }

  const item = await FinanceTreasuryAccount.create({
    schoolId: financialYear.schoolId,
    financialYearId: financialYear._id,
    academicYearId: financialYear.academicYearId,
    code,
    title,
    accountType,
    currency: normalizeText(payload.currency || 'AFN').toUpperCase() || 'AFN',
    openingBalance: normalizeMoney(payload.openingBalance, 0),
    providerName: normalizeText(payload.providerName),
    branchName: normalizeText(payload.branchName),
    accountNo: normalizeText(payload.accountNo),
    isActive: payload.isActive !== false,
    note: normalizeText(payload.note),
    createdBy: actorId || null,
    updatedBy: actorId || null
  });

  const saved = await FinanceTreasuryAccount.findById(item._id)
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name')
    .populate('lastReconciledBy', 'name');
  return serializeTreasuryAccount(saved);
}

async function updateTreasuryAccount({ account, payload = {}, actorId = '' } = {}) {
  if (!account) {
    const error = new Error('finance_treasury_account_invalid');
    error.statusCode = 404;
    throw error;
  }

  if (payload.code != null) {
    const nextCode = normalizeText(payload.code).toUpperCase();
    if (!nextCode) {
      const error = new Error('finance_treasury_account_invalid');
      error.statusCode = 400;
      throw error;
    }
    if (nextCode !== account.code) {
      const exists = await FinanceTreasuryAccount.exists({
        schoolId: account.schoolId,
        financialYearId: account.financialYearId,
        code: nextCode,
        _id: { $ne: account._id }
      });
      if (exists) {
        const error = new Error('finance_treasury_account_duplicate_code');
        error.statusCode = 409;
        throw error;
      }
      account.code = nextCode;
    }
  }

  if (payload.title != null) account.title = normalizeText(payload.title) || account.title;
  if (payload.accountType != null) {
    const nextType = normalizeText(payload.accountType).toLowerCase();
    if (!TREASURY_ACCOUNT_TYPES.has(nextType)) {
      const error = new Error('finance_treasury_account_type_invalid');
      error.statusCode = 400;
      throw error;
    }
    account.accountType = nextType;
  }
  if (payload.currency != null) account.currency = normalizeText(payload.currency).toUpperCase() || account.currency;
  if (payload.openingBalance != null) account.openingBalance = normalizeMoney(payload.openingBalance, account.openingBalance);
  if (payload.providerName != null) account.providerName = normalizeText(payload.providerName);
  if (payload.branchName != null) account.branchName = normalizeText(payload.branchName);
  if (payload.accountNo != null) account.accountNo = normalizeText(payload.accountNo);
  if (payload.note != null) account.note = normalizeText(payload.note);
  if (payload.isActive != null) account.isActive = payload.isActive !== false;
  account.updatedBy = actorId || null;
  await account.save();

  const saved = await FinanceTreasuryAccount.findById(account._id)
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name')
    .populate('lastReconciledBy', 'name');
  return serializeTreasuryAccount(saved);
}

async function createTreasuryManualTransaction({
  financialYear,
  account,
  payload = {},
  actorId = ''
} = {}) {
  if (!account) {
    const error = new Error('finance_treasury_account_invalid');
    error.statusCode = 404;
    throw error;
  }

  const transactionType = normalizeText(payload.transactionType).toLowerCase() || 'deposit';
  const meta = TREASURY_TRANSACTION_TYPE_META[transactionType];
  if (!meta || meta.sourceType !== 'manual') {
    const error = new Error('finance_treasury_transaction_type_invalid');
    error.statusCode = 400;
    throw error;
  }

  const amount = normalizeMoney(payload.amount, 0);
  if (amount <= 0) {
    const error = new Error('finance_treasury_amount_invalid');
    error.statusCode = 400;
    throw error;
  }

  const item = await FinanceTreasuryTransaction.create({
    schoolId: financialYear.schoolId,
    financialYearId: financialYear._id,
    academicYearId: financialYear.academicYearId,
    accountId: account._id,
    transactionType,
    direction: meta.direction,
    amount,
    currency: normalizeText(payload.currency || account.currency || 'AFN').toUpperCase() || 'AFN',
    transactionDate: toDate(payload.transactionDate, new Date()),
    sourceType: meta.sourceType,
    referenceNo: normalizeText(payload.referenceNo),
    note: normalizeText(payload.note),
    createdBy: actorId || null,
    updatedBy: actorId || null
  });

  const saved = await FinanceTreasuryTransaction.findById(item._id)
    .populate('accountId', 'title code accountType accountNo')
    .populate('counterAccountId', 'title code accountType accountNo')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');
  return serializeTreasuryTransaction(saved);
}

async function createTreasuryTransfer({
  financialYear,
  sourceAccount,
  destinationAccount,
  payload = {},
  actorId = ''
} = {}) {
  if (!sourceAccount || !destinationAccount) {
    const error = new Error('finance_treasury_account_invalid');
    error.statusCode = 404;
    throw error;
  }
  if (String(sourceAccount._id) === String(destinationAccount._id)) {
    const error = new Error('finance_treasury_source_destination_same');
    error.statusCode = 400;
    throw error;
  }
  if (
    String(sourceAccount.financialYearId || '') !== String(destinationAccount.financialYearId || '')
    || String(sourceAccount.financialYearId || '') !== String(financialYear?._id || '')
  ) {
    const error = new Error('finance_treasury_transfer_cross_financial_year');
    error.statusCode = 409;
    throw error;
  }

  const amount = normalizeMoney(payload.amount, 0);
  if (amount <= 0) {
    const error = new Error('finance_treasury_amount_invalid');
    error.statusCode = 400;
    throw error;
  }

  const groupKey = `tr-${crypto.randomBytes(8).toString('hex')}`;
  const transactionDate = toDate(payload.transactionDate, new Date());
  const basePayload = {
    schoolId: financialYear.schoolId,
    financialYearId: financialYear._id,
    academicYearId: financialYear.academicYearId,
    transactionGroupKey: groupKey,
    amount,
    currency: normalizeText(payload.currency || sourceAccount.currency || destinationAccount.currency || 'AFN').toUpperCase() || 'AFN',
    transactionDate,
    sourceType: 'transfer',
    referenceNo: normalizeText(payload.referenceNo),
    note: normalizeText(payload.note),
    createdBy: actorId || null,
    updatedBy: actorId || null
  };

  await FinanceTreasuryTransaction.insertMany([
    {
      ...basePayload,
      accountId: sourceAccount._id,
      counterAccountId: destinationAccount._id,
      transactionType: 'transfer_out',
      direction: 'out'
    },
    {
      ...basePayload,
      accountId: destinationAccount._id,
      counterAccountId: sourceAccount._id,
      transactionType: 'transfer_in',
      direction: 'in'
    }
  ]);

  const items = await FinanceTreasuryTransaction.find({ transactionGroupKey: groupKey })
    .populate('accountId', 'title code accountType accountNo')
    .populate('counterAccountId', 'title code accountType accountNo')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name')
    .sort({ direction: 1 });

  return {
    transactionGroupKey: groupKey,
    items: items.map((item) => serializeTreasuryTransaction(item))
  };
}

async function reconcileTreasuryAccount({
  account,
  payload = {},
  actorId = ''
} = {}) {
  if (!account) {
    const error = new Error('finance_treasury_account_invalid');
    error.statusCode = 404;
    throw error;
  }

  const statementBalance = normalizeMoney(payload.statementBalance, NaN);
  if (!Number.isFinite(statementBalance)) {
    const error = new Error('finance_treasury_reconciliation_balance_required');
    error.statusCode = 400;
    throw error;
  }

  const analytics = await buildTreasuryAnalytics({
    financialYearId: String(account.financialYearId || ''),
    academicYearId: String(account.academicYearId || ''),
    accountId: String(account._id)
  });
  const currentAccount = analytics.accounts[0] || serializeTreasuryAccount(account);
  const bookBalance = Number(currentAccount?.metrics?.bookBalance || 0);
  const variance = Number((statementBalance - bookBalance).toFixed(2));
  const reconciliationDate = toDate(payload.reconciliationDate, new Date());

  account.lastReconciledAt = reconciliationDate;
  account.lastReconciledBy = actorId || null;
  account.lastStatementBalance = statementBalance;
  account.lastReconciliationVariance = variance;
  account.updatedBy = actorId || null;
  await account.save();

  let adjustment = null;
  const applyAdjustment = payload.applyAdjustment === true || String(payload.applyAdjustment || '').trim().toLowerCase() === 'true';
  if (applyAdjustment && variance !== 0) {
    const transaction = await FinanceTreasuryTransaction.create({
      schoolId: account.schoolId,
      financialYearId: account.financialYearId,
      academicYearId: account.academicYearId,
      accountId: account._id,
      transactionType: 'reconciliation_adjustment',
      direction: variance >= 0 ? 'in' : 'out',
      amount: Math.abs(variance),
      currency: account.currency || 'AFN',
      transactionDate: reconciliationDate,
      sourceType: 'reconciliation',
      referenceNo: normalizeText(payload.referenceNo),
      note: normalizeText(payload.note) || 'Treasury reconciliation adjustment.',
      createdBy: actorId || null,
      updatedBy: actorId || null
    });
    const savedTransaction = await FinanceTreasuryTransaction.findById(transaction._id)
      .populate('accountId', 'title code accountType accountNo')
      .populate('counterAccountId', 'title code accountType accountNo')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');
    adjustment = serializeTreasuryTransaction(savedTransaction);
  }

  const refreshedAnalytics = await buildTreasuryAnalytics({
    financialYearId: String(account.financialYearId || ''),
    academicYearId: String(account.academicYearId || ''),
    accountId: String(account._id)
  });
  return {
    account: refreshedAnalytics.accounts[0] || serializeTreasuryAccount(account),
    adjustment,
    bookBalanceBefore: bookBalance,
    statementBalance,
    variance
  };
}

module.exports = {
  buildTreasuryAnalytics,
  buildTreasuryReportBundle,
  createTreasuryAccount,
  createTreasuryManualTransaction,
  createTreasuryTransfer,
  normalizeTreasuryText: normalizeText,
  reconcileTreasuryAccount,
  resolveTreasuryAccountSelection,
  serializeTreasuryAccount,
  serializeTreasuryTransaction,
  updateTreasuryAccount
};
