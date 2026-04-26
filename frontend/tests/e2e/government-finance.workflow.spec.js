import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

const DEFAULT_CATEGORIES = [
  {
    _id: 'cat-admin',
    key: 'admin',
    label: 'Admin',
    description: 'Administration and office operations',
    colorTone: 'rose',
    isActive: true,
    isSystem: true,
    subCategories: [
      { key: 'stationery', label: 'Stationery', isActive: true, order: 0 },
      { key: 'printing', label: 'Printing', isActive: true, order: 1 }
    ]
  },
  {
    _id: 'cat-salary',
    key: 'salary',
    label: 'Salary',
    description: 'Teacher and staff compensation',
    colorTone: 'teal',
    isActive: true,
    isSystem: true,
    subCategories: [
      { key: 'teachers', label: 'Teachers', isActive: true, order: 0 }
    ]
  }
];

function buildExpenseAnalytics(state) {
  const statusCounts = {
    draft: 0,
    pendingReview: 0,
    approved: 0,
    rejected: 0,
    void: 0
  };
  const categoryMap = new Map();
  const vendorMap = new Map();
  const monthlyMap = new Map();
  let totalAmount = 0;
  let approvedAmount = 0;
  let pendingAmount = 0;

  for (const item of state.expenses) {
    const status = String(item.status || '').trim();
    const amount = Number(item.amount || 0);
    totalAmount += amount;
    if (status === 'approved') approvedAmount += amount;
    if (status === 'pending_review') pendingAmount += amount;

    if (status === 'draft') statusCounts.draft += 1;
    else if (status === 'pending_review') statusCounts.pendingReview += 1;
    else if (status === 'approved') statusCounts.approved += 1;
    else if (status === 'rejected') statusCounts.rejected += 1;
    else if (status === 'void') statusCounts.void += 1;

    const categoryDefinition = state.expenseCategories.find((entry) => entry.key === item.category);
    const categoryBucket = categoryMap.get(item.category) || {
      key: item.category,
      label: categoryDefinition?.label || item.category,
      colorTone: categoryDefinition?.colorTone || 'slate',
      amount: 0,
      count: 0,
      sharePercent: 0
    };
    categoryBucket.amount += amount;
    categoryBucket.count += 1;
    categoryMap.set(item.category, categoryBucket);

    const vendorName = String(item.vendorName || 'Unassigned vendor').trim() || 'Unassigned vendor';
    const vendorBucket = vendorMap.get(vendorName) || { label: vendorName, amount: 0, count: 0 };
    vendorBucket.amount += amount;
    vendorBucket.count += 1;
    vendorMap.set(vendorName, vendorBucket);

    const monthKey = String(item.expenseDate || '').slice(0, 7);
    const monthBucket = monthlyMap.get(monthKey) || {
      monthKey,
      label: monthKey,
      amount: 0,
      approvedAmount: 0,
      pendingAmount: 0,
      count: 0
    };
    monthBucket.amount += amount;
    monthBucket.count += 1;
    if (status === 'approved') monthBucket.approvedAmount += amount;
    if (status === 'pending_review') monthBucket.pendingAmount += amount;
    monthlyMap.set(monthKey, monthBucket);
  }

  const blockers = [];
  if (statusCounts.draft > 0) blockers.push(`${statusCounts.draft} مصرف پیش‌نویس هنوز برای بررسی ارسال نشده است.`);
  if (statusCounts.pendingReview > 0) blockers.push(`${statusCounts.pendingReview} مصرف هنوز در صف بررسی قرار دارد.`);
  if (statusCounts.rejected > 0) blockers.push(`${statusCounts.rejected} مصرف ردشده هنوز نیاز به اصلاح یا باطل‌سازی دارد.`);

  const categories = [...categoryMap.values()].sort((left, right) => right.amount - left.amount);
  categories.forEach((item) => {
    item.sharePercent = totalAmount > 0 ? Number(((item.amount / totalAmount) * 100).toFixed(2)) : 0;
  });

  return {
    summary: {
      totalAmount,
      approvedAmount,
      pendingAmount,
      queueCount: statusCounts.draft + statusCounts.pendingReview + statusCounts.rejected,
      vendorCount: vendorMap.size,
      categoryCount: categories.length,
      statusCounts
    },
    categories,
    vendors: [...vendorMap.values()].sort((left, right) => right.amount - left.amount).slice(0, 6),
    monthly: [...monthlyMap.values()].sort((left, right) => left.monthKey.localeCompare(right.monthKey)),
    queue: state.expenses.filter((item) => ['draft', 'pending_review', 'rejected'].includes(item.status)).slice(0, 12),
    closeReadiness: {
      financialYearId: state.financialYears[0]?._id || '',
      financialYearTitle: state.financialYears[0]?.title || '',
      isClosed: Boolean(state.financialYears[0]?.isClosed),
      canClose: blockers.length === 0,
      blockerCount: blockers.length,
      blockers,
      counts: statusCounts
    },
    registry: state.expenseCategories
  };
}

function buildTreasuryAnalytics(state) {
  const metricsByAccountId = new Map(
    state.treasuryAccounts.map((account) => [account._id, {
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

  for (const item of state.treasuryTransactions) {
    const bucket = metricsByAccountId.get(item.accountId);
    if (!bucket || item.status === 'void') continue;
    const amount = Number(item.amount || 0);
    const transactionTime = String(item.transactionDate || '');
    if (item.transactionType === 'transfer_in') {
      bucket.transferIn += amount;
      bucket.transferCount += 1;
      bucket.bookBalance += amount;
    } else if (item.transactionType === 'transfer_out') {
      bucket.transferOut += amount;
      bucket.transferCount += 1;
      bucket.bookBalance -= amount;
    } else if (item.direction === 'in') {
      bucket.manualInflow += amount;
      bucket.bookBalance += amount;
    } else {
      bucket.manualOutflow += amount;
      bucket.bookBalance -= amount;
    }
    if (!bucket.lastTransactionAt || new Date(transactionTime).getTime() > new Date(bucket.lastTransactionAt).getTime()) {
      bucket.lastTransactionAt = transactionTime;
    }
  }

  for (const item of state.expenses) {
    if (item.status !== 'approved' || !item.treasuryAccountId) continue;
    const bucket = metricsByAccountId.get(item.treasuryAccountId);
    if (!bucket) continue;
    const amount = Number(item.amount || 0);
    const expenseTime = String(item.expenseDate || '');
    bucket.expenseOutflow += amount;
    bucket.expenseCount += 1;
    bucket.bookBalance -= amount;
    if (!bucket.lastTransactionAt || new Date(expenseTime).getTime() > new Date(bucket.lastTransactionAt).getTime()) {
      bucket.lastTransactionAt = expenseTime;
    }
  }

  const accounts = state.treasuryAccounts.map((account) => {
    const metrics = metricsByAccountId.get(account._id) || {};
    return {
      ...account,
      accountNoMasked: account.accountNo ? `***${String(account.accountNo).slice(-4)}` : '',
      metrics: {
        ...metrics,
        manualInflow: Number((metrics.manualInflow || 0).toFixed(2)),
        manualOutflow: Number((metrics.manualOutflow || 0).toFixed(2)),
        transferIn: Number((metrics.transferIn || 0).toFixed(2)),
        transferOut: Number((metrics.transferOut || 0).toFixed(2)),
        expenseOutflow: Number((metrics.expenseOutflow || 0).toFixed(2)),
        bookBalance: Number((metrics.bookBalance || 0).toFixed(2))
      }
    };
  });

  const recentTransactions = state.treasuryTransactions
    .filter((item) => item.status !== 'void')
    .slice()
    .sort((left, right) => new Date(right.transactionDate || 0).getTime() - new Date(left.transactionDate || 0).getTime())
    .slice(0, 12)
    .map((item) => {
      const account = state.treasuryAccounts.find((entry) => entry._id === item.accountId) || null;
      const counterAccount = state.treasuryAccounts.find((entry) => entry._id === item.counterAccountId) || null;
      return {
        ...item,
        account: account ? {
          _id: account._id,
          title: account.title,
          code: account.code,
          accountType: account.accountType,
          accountNoMasked: account.accountNo ? `***${String(account.accountNo).slice(-4)}` : ''
        } : null,
        counterAccount: counterAccount ? {
          _id: counterAccount._id,
          title: counterAccount.title,
          code: counterAccount.code,
          accountType: counterAccount.accountType,
          accountNoMasked: counterAccount.accountNo ? `***${String(counterAccount.accountNo).slice(-4)}` : ''
        } : null
      };
    });

  const unassignedApprovedExpenses = state.expenses.filter((item) => item.status === 'approved' && !item.treasuryAccountId);
  const summary = {
    accountCount: accounts.length,
    activeAccountCount: accounts.filter((item) => item.isActive !== false).length,
    cashBalance: Number(accounts.filter((item) => item.accountType === 'cashbox').reduce((sum, item) => sum + Number(item.metrics?.bookBalance || 0), 0).toFixed(2)),
    bankBalance: Number(accounts.filter((item) => item.accountType === 'bank').reduce((sum, item) => sum + Number(item.metrics?.bookBalance || 0), 0).toFixed(2)),
    bookBalance: Number(accounts.reduce((sum, item) => sum + Number(item.metrics?.bookBalance || 0), 0).toFixed(2)),
    manualInflow: Number(accounts.reduce((sum, item) => sum + Number(item.metrics?.manualInflow || 0), 0).toFixed(2)),
    manualOutflow: Number(accounts.reduce((sum, item) => sum + Number(item.metrics?.manualOutflow || 0), 0).toFixed(2)),
    transferCount: accounts.reduce((sum, item) => sum + Number(item.metrics?.transferCount || 0), 0) / 2,
    expenseOutflow: Number(accounts.reduce((sum, item) => sum + Number(item.metrics?.expenseOutflow || 0), 0).toFixed(2)),
    unassignedApprovedExpenseCount: unassignedApprovedExpenses.length,
    unassignedApprovedExpenseAmount: Number(unassignedApprovedExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)),
    reconciledAccountCount: accounts.filter((item) => item.lastReconciledAt).length,
    unreconciledAccountCount: accounts.filter((item) => !item.lastReconciledAt).length
  };

  const alerts = [];
  if (summary.unassignedApprovedExpenseCount > 0) {
    alerts.push({ key: 'unassigned_expense', tone: 'rose', label: `${summary.unassignedApprovedExpenseCount} approved expense(s) missing treasury assignment.` });
  }
  if (summary.unreconciledAccountCount > 0) {
    alerts.push({ key: 'unreconciled_accounts', tone: 'copper', label: `${summary.unreconciledAccountCount} treasury account(s) need reconciliation.` });
  }

  return {
    summary,
    accounts,
    recentTransactions,
    alerts
  };
}

function buildTreasuryReports(state, accountId = '') {
  const analytics = buildTreasuryAnalytics(state);
  const selectedAccount = analytics.accounts.find((item) => item._id === accountId) || analytics.accounts[0] || null;
  const selectedAccountId = selectedAccount?._id || '';
  const openingBalance = Number(selectedAccount?.openingBalance || 0);

  const cashbookRows = [];
  for (const item of state.treasuryTransactions) {
    if (item.status === 'void' || item.accountId !== selectedAccountId) continue;
    const counterAccount = analytics.accounts.find((entry) => entry._id === item.counterAccountId) || null;
    cashbookRows.push({
      key: item._id,
      postedAt: item.transactionDate,
      rowType: 'transaction',
      transactionType: item.transactionType,
      title: item.note || item.transactionType,
      referenceNo: item.referenceNo || '',
      counterparty: counterAccount?.title || '',
      inflow: item.direction === 'in' ? Number(item.amount || 0) : 0,
      outflow: item.direction === 'out' ? Number(item.amount || 0) : 0
    });
  }

  for (const item of state.expenses) {
    if (item.status !== 'approved' || item.treasuryAccountId !== selectedAccountId) continue;
    cashbookRows.push({
      key: `expense-${item._id}`,
      postedAt: item.expenseDate,
      rowType: 'expense',
      transactionType: 'expense_outflow',
      title: item.subCategory || item.category || 'expense',
      referenceNo: item.referenceNo || '',
      counterparty: item.vendorName || '',
      inflow: 0,
      outflow: Number(item.amount || 0)
    });
  }

  cashbookRows.sort((left, right) => new Date(left.postedAt || 0).getTime() - new Date(right.postedAt || 0).getTime());
  let runningBalance = openingBalance;
  let inflowTotal = 0;
  let outflowTotal = 0;
  const normalizedCashbookRows = cashbookRows.map((item) => {
    inflowTotal += Number(item.inflow || 0);
    outflowTotal += Number(item.outflow || 0);
    runningBalance += Number(item.inflow || 0);
    runningBalance -= Number(item.outflow || 0);
    return {
      ...item,
      balance: Number(runningBalance.toFixed(2))
    };
  });

  const movementSummary = analytics.accounts.map((item) => ({
    accountId: item._id,
    accountTitle: item.title,
    accountCode: item.code,
    accountType: item.accountType,
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

  const reconciliationRows = analytics.accounts.map((item) => {
    const variance = Number(item.lastReconciliationVariance || 0);
    return {
      accountId: item._id,
      accountTitle: item.title,
      accountCode: item.code,
      accountType: item.accountType,
      bookBalance: Number(item.metrics?.bookBalance || 0),
      statementBalance: Number(item.lastStatementBalance || 0),
      variance,
      status: item.lastReconciledAt ? (Math.abs(variance) < 0.01 ? 'matched' : 'variance') : 'pending',
      lastReconciledAt: item.lastReconciledAt || null,
      lastReconciledBy: item.lastReconciledBy || null
    };
  });

  const varianceRows = [];
  for (const item of analytics.accounts) {
    if (!item.lastReconciledAt) {
      varianceRows.push({
        key: `missing-${item._id}`,
        issueType: 'missing_reconciliation',
        severity: 'warning',
        accountTitle: item.title || item.code || '',
        referenceNo: '',
        amount: Number(item.metrics?.bookBalance || 0)
      });
      continue;
    }
    const variance = Number(item.lastReconciliationVariance || 0);
    if (Math.abs(variance) >= 0.01) {
      varianceRows.push({
        key: `variance-${item._id}`,
        issueType: 'reconciliation_variance',
        severity: Math.abs(variance) >= 500 ? 'critical' : 'warning',
        accountTitle: item.title || item.code || '',
        referenceNo: '',
        amount: variance
      });
    }
  }

  for (const item of state.expenses.filter((entry) => entry.status === 'approved' && !entry.treasuryAccountId)) {
    varianceRows.push({
      key: `expense-${item._id}`,
      issueType: 'unassigned_expense',
      severity: 'critical',
      accountTitle: item.vendorName || item.category || 'expense',
      referenceNo: item.referenceNo || '',
      amount: Number(item.amount || 0)
    });
  }

  return {
    generatedAt: '2026-03-20T08:00:00.000Z',
    selectedAccountId,
    cashbook: {
      account: selectedAccount,
      rows: normalizedCashbookRows,
      summary: {
        openingBalance,
        inflowTotal: Number(inflowTotal.toFixed(2)),
        outflowTotal: Number(outflowTotal.toFixed(2)),
        closingBalance: Number((selectedAccount?.metrics?.bookBalance || runningBalance || 0).toFixed(2)),
        rowCount: normalizedCashbookRows.length
      }
    },
    movementSummary: {
      rows: movementSummary,
      summary: {
        accountCount: movementSummary.length,
        totalOpeningBalance: Number(movementSummary.reduce((sum, item) => sum + Number(item.openingBalance || 0), 0).toFixed(2)),
        totalClosingBalance: Number(movementSummary.reduce((sum, item) => sum + Number(item.closingBalance || 0), 0).toFixed(2)),
        totalNetChange: Number(movementSummary.reduce((sum, item) => sum + Number(item.netChange || 0), 0).toFixed(2))
      }
    },
    reconciliation: {
      rows: reconciliationRows,
      summary: {
        totalAccounts: reconciliationRows.length,
        matchedCount: reconciliationRows.filter((item) => item.status === 'matched').length,
        varianceCount: reconciliationRows.filter((item) => item.status === 'variance').length,
        pendingCount: reconciliationRows.filter((item) => item.status === 'pending').length
      }
    },
    variance: {
      rows: varianceRows,
      summary: {
        totalIssues: varianceRows.length,
        criticalCount: varianceRows.filter((item) => item.severity === 'critical').length,
        warningCount: varianceRows.filter((item) => item.severity === 'warning').length
      }
    }
  };
}

function buildBudgetVsActual(state, financialYearId = '') {
  const financialYear = state.financialYears.find((item) => item._id === financialYearId || item.id === financialYearId) || state.financialYears[0] || {};
  const budgetTargets = financialYear.budgetTargets || {};
  const approvedExpenses = state.expenses.filter((item) => item.status === 'approved');
  const actualExpense = approvedExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const actualIncome = 8200;
  const treasuryAnalytics = buildTreasuryAnalytics(state);
  const categoryRows = state.expenseCategories.map((item) => {
    const actualAmount = approvedExpenses
      .filter((entry) => entry.category === item.key)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const configuredBudget = (budgetTargets.categoryBudgets || []).find((entry) => entry.categoryKey === item.key) || {};
    const annualBudget = Number(configuredBudget.annualBudget || 0);
    const utilizationPercent = annualBudget > 0 ? Number(((actualAmount / annualBudget) * 100).toFixed(2)) : 0;
    let status = 'on_track';
    if (annualBudget <= 0 && actualAmount > 0) status = 'unbudgeted';
    else if (annualBudget > 0 && actualAmount > annualBudget) status = 'over_budget';
    else if (annualBudget > 0 && utilizationPercent >= Number(configuredBudget.alertThresholdPercent || 85)) status = 'watch';
    else if (annualBudget <= 0) status = 'no_budget';
    return {
      categoryKey: item.key,
      categoryLabel: item.label,
      annualBudget,
      monthlyBudget: Number(configuredBudget.monthlyBudget || 0),
      actualAmount,
      status
    };
  });

  const annualExpenseBudget = Number(budgetTargets.annualExpenseBudget || 0);
  const annualIncomeTarget = Number(budgetTargets.annualIncomeTarget || 0);
  const treasuryReserveTarget = Number(budgetTargets.treasuryReserveTarget || 0);
  const treasuryReserveBalance = Number(treasuryAnalytics.summary?.bookBalance || 0);
  const alerts = [];
  if (annualExpenseBudget > 0 && actualExpense > annualExpenseBudget) {
    alerts.push({ key: 'expense_over_budget', title: 'Expense budget exceeded', detail: 'Actual approved expense is over the configured annual budget.' });
  }
  if (annualIncomeTarget > 0 && actualIncome < annualIncomeTarget) {
    alerts.push({ key: 'income_under_target', title: 'Income target not reached', detail: 'Collected income is still below target.' });
  }
  if (treasuryReserveTarget > 0 && treasuryReserveBalance < treasuryReserveTarget) {
    alerts.push({ key: 'treasury_reserve_gap', title: 'Treasury reserve below target', detail: 'Treasury reserve is below the configured target.' });
  }

  return {
    meta: {
      financialYearId: financialYear._id || financialYear.id || '',
      financialYearTitle: financialYear.title || '',
      budgetNote: budgetTargets.note || ''
    },
    summary: {
      annualIncomeTarget,
      annualExpenseBudget,
      monthlyIncomeTarget: Number(budgetTargets.monthlyIncomeTarget || 0),
      monthlyExpenseBudget: Number(budgetTargets.monthlyExpenseBudget || 0),
      treasuryReserveTarget,
      actualIncome,
      actualExpense,
      actualNet: actualIncome - actualExpense,
      incomeVariance: actualIncome - annualIncomeTarget,
      expenseVariance: actualExpense - annualExpenseBudget,
      treasuryReserveBalance,
      treasuryReserveVariance: treasuryReserveBalance - treasuryReserveTarget,
      overBudgetCategoryCount: categoryRows.filter((item) => item.status === 'over_budget').length,
      unbudgetedCategoryCount: categoryRows.filter((item) => item.status === 'unbudgeted').length,
      watchCategoryCount: categoryRows.filter((item) => item.status === 'watch').length
    },
    categories: categoryRows,
    alerts,
    treasury: {
      summary: treasuryAnalytics.summary,
      alerts: treasuryAnalytics.alerts
    }
  };
}

function buildBudgetApproval(financialYear = {}) {
  return {
    configured: Boolean(
      Number(financialYear?.budgetTargets?.annualIncomeTarget || 0)
      || Number(financialYear?.budgetTargets?.annualExpenseBudget || 0)
      || Number(financialYear?.budgetTargets?.monthlyIncomeTarget || 0)
      || Number(financialYear?.budgetTargets?.monthlyExpenseBudget || 0)
      || Number(financialYear?.budgetTargets?.treasuryReserveTarget || 0)
    ),
    stage: financialYear?.budgetApprovalStage || 'draft',
    submittedBy: financialYear?.budgetSubmittedBy || null,
    submittedAt: financialYear?.budgetSubmittedAt || null,
    approvedBy: financialYear?.budgetApprovedBy || null,
    approvedAt: financialYear?.budgetApprovedAt || null,
    rejectedBy: financialYear?.budgetRejectedBy || null,
    rejectedAt: financialYear?.budgetRejectedAt || null,
    rejectReason: financialYear?.budgetRejectReason || '',
    trail: Array.isArray(financialYear?.budgetApprovalTrail) ? financialYear.budgetApprovalTrail : [],
    version: Math.max(1, Number(financialYear?.budgetVersion || 1)),
    lastApprovedVersion: Math.max(0, Number(financialYear?.budgetLastApprovedVersion || 0)),
    frozenAt: financialYear?.budgetFrozenAt || null,
    canStartRevision: String(financialYear?.budgetApprovalStage || '').trim() === 'approved' && !Boolean(financialYear?.isClosed),
    revisionHistory: Array.isArray(financialYear?.budgetRevisionHistory) ? financialYear.budgetRevisionHistory : []
  };
}

function buildProcurementAnalytics(state, financialYearId = '') {
  const items = (state.procurements || [])
    .filter((item) => !financialYearId || item.financialYearId === financialYearId)
    .map((item) => {
      const approvedExpenses = (state.expenses || []).filter((expense) => (
        expense.status === 'approved' && expense.procurementCommitmentId === item._id
      ));
      const approvedExpenseAmount = approvedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      const approvedExpenseCount = approvedExpenses.length;
      const outstandingAmount = Math.max(0, Number(item.committedAmount || 0) - approvedExpenseAmount);
      const settlements = Array.isArray(item.settlements) ? item.settlements : [];
      const settledAmount = settlements.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const payableReadyAmount = Math.max(0, approvedExpenseAmount - settledAmount);
      const settlementBalanceAmount = Math.max(0, outstandingAmount - settledAmount);
      return {
        ...item,
        settlements,
        settledAmount,
        settlementCount: Number(item.settlementCount || settlements.length || 0),
        approvedExpenseAmount,
        approvedExpenseCount,
        outstandingAmount,
        payableReadyAmount,
        settlementBalanceAmount,
        settlementProgressPercent: approvedExpenseAmount > 0
          ? Number(Math.min(100, (settledAmount / Math.max(approvedExpenseAmount, 1)) * 100).toFixed(2))
          : 0,
        fulfillmentPercent: Number(item.committedAmount || 0) > 0
          ? Number(Math.min(100, (approvedExpenseAmount / Number(item.committedAmount || 0)) * 100).toFixed(2))
          : 0,
        latestExpenseDate: approvedExpenses[0]?.expenseDate || null,
        lastSettledAt: item.lastSettledAt || settlements.slice().sort((left, right) => new Date(right.settlementDate || right.createdAt || 0).getTime() - new Date(left.settlementDate || left.createdAt || 0).getTime())[0]?.settlementDate || null,
        lastSettledBy: item.lastSettledBy || null
      };
    });

  const vendors = Array.from(items.reduce((map, item) => {
    const key = String(item.vendorName || '').trim().toLowerCase();
    if (!key) return map;
    const bucket = map.get(key) || {
      vendorName: item.vendorName,
      commitmentCount: 0,
      committedAmount: 0,
      outstandingAmount: 0,
      settledAmount: 0,
      payableReadyAmount: 0
    };
    bucket.commitmentCount += 1;
    bucket.committedAmount += Number(item.committedAmount || 0);
    bucket.outstandingAmount += Number(item.outstandingAmount || 0);
    bucket.settledAmount += Number(item.settledAmount || 0);
    bucket.payableReadyAmount += Number(item.payableReadyAmount || 0);
    map.set(key, bucket);
    return map;
  }, new Map()).values());

  return {
    summary: {
      totalCount: items.length,
      draftCount: items.filter((item) => item.status === 'draft').length,
      pendingReviewCount: items.filter((item) => item.status === 'pending_review').length,
      approvedCount: items.filter((item) => item.status === 'approved').length,
      rejectedCount: items.filter((item) => item.status === 'rejected').length,
      cancelledCount: items.filter((item) => item.status === 'cancelled').length,
      vendorCount: vendors.length,
      totalCommittedAmount: items.reduce((sum, item) => sum + Number(item.committedAmount || 0), 0),
      totalApprovedExpenseAmount: items.reduce((sum, item) => sum + Number(item.approvedExpenseAmount || 0), 0),
      totalOutstandingAmount: items.reduce((sum, item) => sum + Number(item.outstandingAmount || 0), 0),
      totalSettledAmount: items.reduce((sum, item) => sum + Number(item.settledAmount || 0), 0),
      totalPayableReadyAmount: items.reduce((sum, item) => sum + Number(item.payableReadyAmount || 0), 0),
      openCommitmentCount: items.filter((item) => item.status === 'approved' && Number(item.outstandingAmount || 0) > 0).length,
      settlementReadyCount: items.filter((item) => item.status === 'approved' && Number(item.payableReadyAmount || 0) > 0).length,
      settledCount: items.filter((item) => Number(item.settledAmount || 0) > 0).length
    },
    items,
    vendors
  };
}

function buildSnapshotPack(state, financialYearId = '') {
  const selectedFinancialYear = state.financialYears.find((item) => item._id === financialYearId) || state.financialYears[0] || {};
  return {
    generatedAt: '2026-03-19T09:00:00.000Z',
    expenseAnalytics: buildExpenseAnalytics(state),
    treasuryAnalytics: buildTreasuryAnalytics(state),
    treasuryReports: buildTreasuryReports(state),
    budgetVsActual: buildBudgetVsActual(state, selectedFinancialYear._id || ''),
    budgetApproval: buildBudgetApproval(selectedFinancialYear),
    procurementAnalytics: buildProcurementAnalytics(state, selectedFinancialYear._id || '')
  };
}

test.describe('government finance workflow', () => {
  test('government finance workflow manages registry, review queue, and official snapshots', async ({ page }) => {
    test.slow();

    const state = {
      financialYears: [
        {
          _id: 'fy-1',
          id: 'fy-1',
          title: 'Financial Year 1405',
          code: 'FY1405',
          academicYearId: 'year-1',
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-12-31T00:00:00.000Z',
          dailyFeePercent: 2,
          yearlyFeePercent: 10,
          budgetTargets: {
            annualIncomeTarget: 10000,
            annualExpenseBudget: 1500,
            monthlyIncomeTarget: 900,
            monthlyExpenseBudget: 200,
            treasuryReserveTarget: 3500,
            note: 'Baseline operating budget',
            categoryBudgets: [
              { categoryKey: 'admin', label: 'Admin', annualBudget: 1000, monthlyBudget: 100, alertThresholdPercent: 85 },
              { categoryKey: 'salary', label: 'Salary', annualBudget: 500, monthlyBudget: 50, alertThresholdPercent: 85 }
            ]
          },
          budgetApprovalStage: 'draft',
          budgetSubmittedBy: null,
          budgetSubmittedAt: null,
          budgetApprovedBy: null,
          budgetApprovedAt: null,
          budgetRejectedBy: null,
          budgetRejectedAt: null,
          budgetRejectReason: '',
          budgetApprovalTrail: [],
          budgetVersion: 1,
          budgetLastApprovedVersion: 0,
          budgetFrozenAt: null,
          budgetRevisionHistory: [],
          status: 'active',
          isActive: true,
          isClosed: false
        }
      ],
      expenseCategories: [...DEFAULT_CATEGORIES],
      expenses: [
        {
          _id: 'exp-1',
          category: 'admin',
          subCategory: 'stationery',
          amount: 1200,
          expenseDate: '2026-03-12T00:00:00.000Z',
          status: 'approved',
          approvalStage: 'completed',
          vendorName: 'School Supply House',
          procurementCommitmentId: '',
          approvalTrail: [{ action: 'approve' }]
        }
      ],
      procurements: [],
      archivedDocuments: [],
      snapshots: [
        {
          _id: 'snap-1',
          reportType: 'annual',
          quarter: null,
          version: 1,
          generatedAt: '2026-03-15T08:00:00.000Z',
          generatedBy: { _id: 'admin-1', name: 'Admin Alpha' },
          title: 'Government Annual Snapshot',
          columns: [
            { key: 'quarterLabel', label: 'Quarter' },
            { key: 'totalIncome', label: 'Income' },
            { key: 'totalExpense', label: 'Expense' }
          ],
          rows: [
            { quarterLabel: 'Quarter 1', totalIncome: 12000, totalExpense: 3000 }
          ],
          summary: { netProfit: 9000 },
          pack: null
        }
      ],
      treasuryAccounts: [
        {
          _id: 'treasury-account-1',
          title: 'Main Cashbox',
          code: 'CASH-01',
          accountType: 'cashbox',
          currency: 'AFN',
          openingBalance: 2500,
          providerName: 'Front Desk',
          branchName: '',
          accountNo: '001-1001',
          isActive: true,
          lastReconciledAt: null,
          lastReconciledBy: null,
          lastStatementBalance: 0,
          lastReconciliationVariance: 0,
          note: ''
        }
      ],
      treasuryTransactions: [
        {
          _id: 'treasury-transaction-1',
          accountId: 'treasury-account-1',
          counterAccountId: null,
          transactionGroupKey: '',
          transactionType: 'deposit',
          direction: 'in',
          amount: 500,
          currency: 'AFN',
          transactionDate: '2026-03-05T00:00:00.000Z',
          sourceType: 'manual',
          referenceNo: 'TR-001',
          note: 'Seed deposit',
          status: 'posted'
        }
      ]
    };

    const counters = {
      createYear: 0,
      saveCategory: 0,
      createExpense: 0,
      createTreasuryAccount: 0,
      createTreasuryTransaction: 0,
      createTreasuryTransfer: 0,
      reconcileTreasury: 0,
      reviewExpense: 0,
      closeBlocked: 0,
      closeSuccess: 0,
      saveBudget: 0,
      budgetStartRevision: 0,
      budgetReviewRequest: 0,
      budgetReviewApprove: 0,
      saveProcurement: 0,
      submitProcurement: 0,
      reviewProcurement: 0,
      settleProcurement: 0,
      snapshot: 0,
      snapshotPdf: 0,
      deliverGovernmentArchive: 0,
      reportRuns: {
        finance_overview: 0,
        government_finance_quarterly: 0,
        government_finance_annual: 0
      }
    };

    state.snapshots = state.snapshots.map((item) => ({
      ...item,
      pack: buildSnapshotPack(state, state.financialYears[0]?._id || '')
    }));

    const buildQuarterlyReport = () => {
      const analytics = buildExpenseAnalytics(state);
      const approvedExpense = analytics.summary.approvedAmount;
      return {
        report: { key: 'government_finance_quarterly', title: 'Government Finance Quarterly' },
        summary: {
          totalIncome: 8200,
          totalExpense: approvedExpense,
          balance: 8200 - approvedExpense,
          classCount: 1,
          expenseCount: analytics.summary.statusCounts.approved
        },
        columns: [
          { key: 'classTitle', label: 'Class' },
          { key: 'totalIncome', label: 'Income' },
          { key: 'totalExpense', label: 'Expense' }
        ],
        rows: [
          {
            classTitle: 'Class 10 A',
            totalIncome: 8200,
            totalExpense: approvedExpense,
            balance: 8200 - approvedExpense,
            paymentCount: 4,
            expenseCount: analytics.summary.statusCounts.approved
          }
        ],
        generatedAt: '2026-03-19T08:00:00.000Z'
      };
    };

    const buildAnnualReport = () => {
      const analytics = buildExpenseAnalytics(state);
      const approvedExpense = analytics.summary.approvedAmount;
      return {
        report: { key: 'government_finance_annual', title: 'Government Finance Annual' },
        summary: {
          totalIncome: 32000,
          totalExpense: approvedExpense,
          netProfit: 32000 - approvedExpense
        },
        columns: [
          { key: 'quarterLabel', label: 'Quarter' },
          { key: 'totalIncome', label: 'Income' },
          { key: 'totalExpense', label: 'Expense' }
        ],
        rows: [
          { quarterLabel: 'Quarter 1', totalIncome: 8000, totalExpense: approvedExpense, balance: 8000 - approvedExpense, classCount: 1 },
          { quarterLabel: 'Quarter 2', totalIncome: 7600, totalExpense: 0, balance: 7600, classCount: 1 }
        ],
        generatedAt: '2026-03-19T08:00:00.000Z'
      };
    };

    await setupAdminWorkspace(page, {
      permissions: ['manage_finance', 'view_reports']
    });

    await page.route('**/api/reports/reference-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          catalog: [
            { key: 'finance_overview', title: 'Finance Overview' },
            { key: 'government_finance_quarterly', title: 'Government Finance Quarterly' },
            { key: 'government_finance_annual', title: 'Government Finance Annual' }
          ],
          academicYears: [
            { id: 'year-1', title: '1405', code: '1405', isActive: true }
          ],
          financialYears: state.financialYears,
          classes: [
            { id: 'class-1', title: 'Class 10 A', code: '10A' }
          ]
        })
      });
    });

    await page.route('**/api/finance/admin/summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          summary: {
            pendingReceipts: 2,
            overdueBills: 1,
            monthCollection: 6400,
            collectionRate: 71,
            receiptWorkflow: {
              financeManager: 1,
              financeLead: 1,
              generalPresident: 0
            }
          }
        })
      });
    });

    await page.route('**/api/finance/admin/reports/aging**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          buckets: {
            current: 2000,
            d1_30: 1000,
            d31_60: 300,
            d61_plus: 120
          }
        })
      });
    });

    await page.route('**/api/finance/admin/reports/cashflow**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            { date: '2026-01-15', total: 2000 },
            { date: '2026-02-15', total: 2500 },
            { date: '2026-03-15', total: 1900 }
          ]
        })
      });
    });

    await page.route('**/api/finance/admin/reports/by-class**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            { classId: 'class-1', schoolClass: { _id: 'class-1', title: 'Class 10 A' }, due: 8200, remaining: 1700, bills: 6 }
          ]
        })
      });
    });

    await page.route('**/api/finance/admin/month-close', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            { _id: 'close-1', monthKey: '2026-02', closedBy: { name: 'Admin Alpha' } }
          ]
        })
      });
    });

    await page.route('**/api/reports/run', async (route) => {
      const payload = route.request().postDataJSON();
      const reportKey = payload?.reportKey || '';
      counters.reportRuns[reportKey] = (counters.reportRuns[reportKey] || 0) + 1;

      if (reportKey === 'government_finance_quarterly') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, report: buildQuarterlyReport() })
        });
        return;
      }

      if (reportKey === 'government_finance_annual') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, report: buildAnnualReport() })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          report: {
            report: { key: reportKey, title: 'Finance Overview' },
            summary: {
              totalDue: 8200,
              totalPaymentAmount: 6400,
              totalOutstanding: 1800,
              totalOrders: 6,
              totalPayments: 4,
              overdueOrders: 1
            },
            columns: [
              { key: 'orderNumber', label: 'Order' },
              { key: 'classTitle', label: 'Class' },
              { key: 'amountDue', label: 'Due' }
            ],
            rows: [
              {
                orderNumber: 'FO-1',
                classTitle: 'Class 10 A',
                amountDue: 8200,
                outstandingAmount: 1800,
                issuedAt: '2026-01-15T00:00:00.000Z',
                dueDate: '2026-03-15T00:00:00.000Z'
              }
            ],
            generatedAt: '2026-03-19T08:00:00.000Z'
          }
        })
      });
    });

    await page.route('**/api/finance/admin/financial-years', async (route) => {
      if (route.request().method() === 'POST') {
        counters.createYear += 1;
        const body = route.request().postDataJSON();
        const item = {
          _id: `fy-${state.financialYears.length + 1}`,
          id: `fy-${state.financialYears.length + 1}`,
          title: body.title,
          code: body.code,
          academicYearId: body.academicYearId,
          startDate: `${body.startDate}T00:00:00.000Z`,
          endDate: `${body.endDate}T00:00:00.000Z`,
          dailyFeePercent: Number(body.dailyFeePercent || 0),
          yearlyFeePercent: Number(body.yearlyFeePercent || 0),
          status: body.isActive ? 'active' : 'planning',
          isActive: Boolean(body.isActive),
          isClosed: false,
          budgetApprovalStage: 'draft',
          budgetApprovalTrail: [],
          budgetVersion: 1,
          budgetLastApprovedVersion: 0,
          budgetFrozenAt: null,
          budgetRevisionHistory: []
        };
        state.financialYears.unshift(item);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item: { ...item, budgetApproval: buildBudgetApproval(item) } })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: state.financialYears.map((item) => ({ ...item, budgetApproval: buildBudgetApproval(item) }))
        })
      });
    });

    await page.route('**/api/finance/admin/financial-years/*', async (route) => {
      const url = new URL(route.request().url());
      const match = /^\/api\/finance\/admin\/financial-years\/([^/]+)$/.exec(url.pathname || '');
      if (!match) {
        await route.fallback();
        return;
      }

      if (route.request().method() === 'PATCH') {
        counters.saveBudget += 1;
        const id = match[1];
        const body = route.request().postDataJSON();
        state.financialYears = state.financialYears.map((item) => (
          item._id === id
            ? {
                ...item,
                budgetTargets: body.budgetTargets || item.budgetTargets || {},
                budgetApprovalStage: 'draft',
                budgetSubmittedBy: null,
                budgetSubmittedAt: null,
                budgetApprovedBy: null,
                budgetApprovedAt: null,
                budgetRejectedBy: null,
                budgetRejectedAt: null,
                budgetRejectReason: '',
                budgetLastApprovedVersion: item.budgetApprovalStage === 'approved'
                  ? Math.max(Number(item.budgetLastApprovedVersion || 0), Number(item.budgetVersion || 1))
                  : Number(item.budgetLastApprovedVersion || 0),
                budgetApprovalTrail: [
                  ...(item.budgetApprovalTrail || []),
                  {
                    level: 'finance_manager',
                    action: 'edit',
                    by: { _id: 'admin-1', name: 'Admin Alpha' },
                    at: '2026-03-19T09:15:00.000Z',
                    note: 'Budget targets updated from year workspace.',
                    reason: ''
                  }
                ],
                budgetRevisionHistory: [
                  ...(item.budgetRevisionHistory || []),
                  {
                    revisionNumber: Number(item.budgetVersion || 1),
                    fromVersion: Number(item.budgetVersion || 1),
                    toVersion: Number(item.budgetVersion || 1),
                    action: 'saved',
                    by: { _id: 'admin-1', name: 'Admin Alpha' },
                    at: '2026-03-19T09:15:00.000Z',
                    note: 'Budget targets updated from year workspace.',
                    reason: ''
                  }
                ]
              }
            : item
        ));
        const item = state.financialYears.find((entry) => entry._id === id) || null;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item: item ? { ...item, budgetApproval: buildBudgetApproval(item) } : null })
        });
        return;
      }

      await route.fallback();
    });

    await page.route('**/api/finance/admin/financial-years/*/budget-vs-actual**', async (route) => {
      const id = route.request().url().split('/').at(-2);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          report: buildBudgetVsActual(state, id)
        })
      });
    });

    await page.route('**/api/finance/admin/financial-years/*/budget/request-review', async (route) => {
      counters.budgetReviewRequest += 1;
      const id = route.request().url().split('/').at(-3);
      const body = route.request().postDataJSON();
      state.financialYears = state.financialYears.map((item) => (
        item._id === id
          ? {
              ...item,
              budgetApprovalStage: 'finance_manager_review',
              budgetSubmittedBy: { _id: 'admin-1', name: 'Admin Alpha' },
              budgetSubmittedAt: '2026-03-19T09:30:00.000Z',
              budgetRejectedBy: null,
              budgetRejectedAt: null,
              budgetRejectReason: '',
              budgetApprovalTrail: [
                ...(item.budgetApprovalTrail || []),
                {
                  level: 'finance_manager',
                  action: 'submit',
                  by: { _id: 'admin-1', name: 'Admin Alpha' },
                  at: '2026-03-19T09:30:00.000Z',
                  note: body.note || 'Budget submitted for review.',
                  reason: ''
                }
              ]
            }
          : item
      ));
      const item = state.financialYears.find((entry) => entry._id === id) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: item ? { ...item, budgetApproval: buildBudgetApproval(item) } : null })
      });
    });

    await page.route('**/api/finance/admin/financial-years/*/budget/start-revision', async (route) => {
      counters.budgetStartRevision += 1;
      const id = route.request().url().split('/').at(-3);
      const body = route.request().postDataJSON();
      state.financialYears = state.financialYears.map((item) => {
        if (item._id !== id) return item;
        const nextVersion = Math.max(1, Number(item.budgetVersion || 1)) + 1;
        return {
          ...item,
          budgetVersion: nextVersion,
          budgetApprovalStage: 'draft',
          budgetSubmittedBy: null,
          budgetSubmittedAt: null,
          budgetApprovedBy: null,
          budgetApprovedAt: null,
          budgetRejectedBy: null,
          budgetRejectedAt: null,
          budgetRejectReason: '',
          budgetApprovalTrail: [
            ...(item.budgetApprovalTrail || []),
            {
              level: 'finance_manager',
              action: 'start_revision',
              by: { _id: 'admin-1', name: 'Admin Alpha' },
              at: '2026-03-19T09:50:00.000Z',
              note: body.note || 'Budget revision started.',
              reason: body.reason || ''
            }
          ],
          budgetRevisionHistory: [
            ...(item.budgetRevisionHistory || []),
            {
              revisionNumber: nextVersion,
              fromVersion: Number(item.budgetVersion || 1),
              toVersion: nextVersion,
              action: 'revision_started',
              by: { _id: 'admin-1', name: 'Admin Alpha' },
              at: '2026-03-19T09:50:00.000Z',
              note: body.note || 'Budget revision started.',
              reason: body.reason || ''
            }
          ]
        };
      });
      const item = state.financialYears.find((entry) => entry._id === id) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: item ? { ...item, budgetApproval: buildBudgetApproval(item) } : null })
      });
    });

    await page.route('**/api/finance/admin/financial-years/*/budget/review', async (route) => {
      counters.budgetReviewApprove += 1;
      const id = route.request().url().split('/').at(-3);
      const body = route.request().postDataJSON();
      state.financialYears = state.financialYears.map((item) => {
        if (item._id !== id) return item;
        const currentStage = item.budgetApprovalStage || 'draft';
        const nextStage = body.action === 'reject'
          ? 'rejected'
          : currentStage === 'finance_manager_review'
            ? 'finance_lead_review'
            : currentStage === 'finance_lead_review'
              ? 'general_president_review'
              : 'approved';
        return {
          ...item,
          budgetApprovalStage: nextStage,
          budgetApprovedBy: nextStage === 'approved' ? { _id: 'admin-1', name: 'Admin Alpha' } : item.budgetApprovedBy,
          budgetApprovedAt: nextStage === 'approved' ? '2026-03-19T09:45:00.000Z' : item.budgetApprovedAt,
          budgetRejectedBy: body.action === 'reject' ? { _id: 'admin-1', name: 'Admin Alpha' } : null,
          budgetRejectedAt: body.action === 'reject' ? '2026-03-19T09:45:00.000Z' : null,
          budgetRejectReason: body.reason || '',
          budgetLastApprovedVersion: nextStage === 'approved'
            ? Math.max(Number(item.budgetLastApprovedVersion || 0), Number(item.budgetVersion || 1))
            : Number(item.budgetLastApprovedVersion || 0),
          budgetApprovalTrail: [
            ...(item.budgetApprovalTrail || []),
            {
              level: 'finance_manager',
              action: body.action === 'reject' ? 'reject' : 'approve',
              by: { _id: 'admin-1', name: 'Admin Alpha' },
              at: '2026-03-19T09:45:00.000Z',
              note: body.note || '',
              reason: body.reason || ''
            }
          ],
          budgetRevisionHistory: [
            ...(item.budgetRevisionHistory || []),
            {
              revisionNumber: Number(item.budgetVersion || 1),
              fromVersion: Number(item.budgetLastApprovedVersion || item.budgetVersion || 1),
              toVersion: Number(item.budgetVersion || 1),
              action: body.action === 'reject' ? 'rejected' : (nextStage === 'approved' ? 'approved' : 'reviewed'),
              by: { _id: 'admin-1', name: 'Admin Alpha' },
              at: '2026-03-19T09:45:00.000Z',
              note: body.note || '',
              reason: body.reason || ''
            }
          ]
        };
      });
      const item = state.financialYears.find((entry) => entry._id === id) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item: item ? { ...item, budgetApproval: buildBudgetApproval(item) } : null,
          nextStage: item?.budgetApprovalStage || 'draft'
        })
      });
    });

    await page.route('**/api/finance/admin/financial-years/*/activate', async (route) => {
      const id = route.request().url().split('/').at(-2);
      state.financialYears = state.financialYears.map((item) => ({
        ...item,
        isActive: item._id === id,
        status: item._id === id ? 'active' : 'planning'
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.route('**/api/finance/admin/financial-years/*/close', async (route) => {
      const id = route.request().url().split('/').at(-2);
      const analytics = buildExpenseAnalytics(state);
      if (!analytics.closeReadiness.canClose) {
        counters.closeBlocked += 1;
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message: 'تا رفع موانع بخش مصارف، بستن سال مالی ممکن نیست.',
            readiness: analytics.closeReadiness
          })
        });
        return;
      }

      counters.closeSuccess += 1;
      state.financialYears = state.financialYears.map((item) => (
        item._id === id
          ? { ...item, isActive: false, isClosed: true, status: 'closed', budgetFrozenAt: item.budgetFrozenAt || '2026-03-31T23:59:59.000Z' }
          : item
      ));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.route('**/api/finance/admin/expense-categories**', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        counters.saveCategory += 1;
        const body = route.request().postDataJSON();
        const item = {
          _id: `cat-${state.expenseCategories.length + 1}`,
          key: body.key,
          label: body.label,
          description: body.description || '',
          colorTone: body.colorTone || 'teal',
          isActive: body.isActive !== false,
          isSystem: false,
          subCategories: body.subCategories || []
        };
        state.expenseCategories.push(item);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item })
        });
        return;
      }

      if (method === 'PATCH') {
        counters.saveCategory += 1;
        const id = route.request().url().split('/').at(-1);
        const body = route.request().postDataJSON();
        state.expenseCategories = state.expenseCategories.map((item) => (
          item._id === id
            ? {
                ...item,
                ...body,
                subCategories: body.subCategories || item.subCategories
              }
            : item
        ));
        const item = state.expenseCategories.find((entry) => entry._id === id);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: state.expenseCategories })
      });
    });

    await page.route('**/api/finance/admin/expenses/analytics**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          analytics: buildExpenseAnalytics(state)
        })
      });
    });

    await page.route('**/api/finance/admin/treasury/analytics**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          analytics: buildTreasuryAnalytics(state)
        })
      });
    });

    await page.route('**/api/finance/admin/treasury/reports**', async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          reports: buildTreasuryReports(state, url.searchParams.get('accountId') || '')
        })
      });
    });

    await page.route('**/api/finance/admin/treasury/accounts/*/reconcile', async (route) => {
      counters.reconcileTreasury += 1;
      const accountId = route.request().url().split('/').at(-2);
      const body = route.request().postDataJSON();
      const account = state.treasuryAccounts.find((item) => item._id === accountId);
      const analytics = buildTreasuryAnalytics(state);
      const currentAccount = analytics.accounts.find((item) => item._id === accountId);
      const bookBalance = Number(currentAccount?.metrics?.bookBalance || 0);
      const statementBalance = Number(body.statementBalance || 0);
      const variance = Number((statementBalance - bookBalance).toFixed(2));

      if (account) {
        account.lastReconciledAt = `${body.reconciliationDate}T00:00:00.000Z`;
        account.lastStatementBalance = statementBalance;
        account.lastReconciliationVariance = variance;
      }

      let adjustment = null;
      if (body.applyAdjustment && variance !== 0) {
        adjustment = {
          _id: `treasury-transaction-${state.treasuryTransactions.length + 1}`,
          accountId,
          counterAccountId: null,
          transactionGroupKey: '',
          transactionType: 'reconciliation_adjustment',
          direction: variance >= 0 ? 'in' : 'out',
          amount: Math.abs(variance),
          currency: account?.currency || 'AFN',
          transactionDate: `${body.reconciliationDate}T00:00:00.000Z`,
          sourceType: 'reconciliation',
          referenceNo: body.referenceNo || '',
          note: body.note || '',
          status: 'posted'
        };
        state.treasuryTransactions.unshift(adjustment);
      }

      const refreshed = buildTreasuryAnalytics(state);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          account: refreshed.accounts.find((item) => item._id === accountId) || null,
          adjustment,
          bookBalanceBefore: bookBalance,
          statementBalance,
          variance
        })
      });
    });

    await page.route('**/api/finance/admin/treasury/accounts', async (route) => {
      counters.createTreasuryAccount += 1;
      const body = route.request().postDataJSON();
      const item = {
        _id: `treasury-account-${state.treasuryAccounts.length + 1}`,
        title: body.title,
        code: body.code,
        accountType: body.accountType || 'cashbox',
        currency: body.currency || 'AFN',
        openingBalance: Number(body.openingBalance || 0),
        providerName: body.providerName || '',
        branchName: body.branchName || '',
        accountNo: body.accountNo || '',
        isActive: body.isActive !== false,
        lastReconciledAt: null,
        lastReconciledBy: null,
        lastStatementBalance: 0,
        lastReconciliationVariance: 0,
        note: body.note || ''
      };
      state.treasuryAccounts.push(item);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item })
      });
    });

    await page.route('**/api/finance/admin/treasury/transactions', async (route) => {
      counters.createTreasuryTransaction += 1;
      const body = route.request().postDataJSON();
      const transactionType = body.transactionType || 'deposit';
      const item = {
        _id: `treasury-transaction-${state.treasuryTransactions.length + 1}`,
        accountId: body.accountId,
        counterAccountId: null,
        transactionGroupKey: '',
        transactionType,
        direction: ['withdrawal', 'adjustment_out'].includes(transactionType) ? 'out' : 'in',
        amount: Number(body.amount || 0),
        currency: 'AFN',
        transactionDate: `${body.transactionDate}T00:00:00.000Z`,
        sourceType: 'manual',
        referenceNo: body.referenceNo || '',
        note: body.note || '',
        status: 'posted'
      };
      state.treasuryTransactions.unshift(item);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item })
      });
    });

    await page.route('**/api/finance/admin/treasury/transfers', async (route) => {
      counters.createTreasuryTransfer += 1;
      const body = route.request().postDataJSON();
      const groupKey = `transfer-${counters.createTreasuryTransfer}`;
      const outItem = {
        _id: `treasury-transaction-${state.treasuryTransactions.length + 1}`,
        accountId: body.sourceAccountId,
        counterAccountId: body.destinationAccountId,
        transactionGroupKey: groupKey,
        transactionType: 'transfer_out',
        direction: 'out',
        amount: Number(body.amount || 0),
        currency: 'AFN',
        transactionDate: `${body.transactionDate}T00:00:00.000Z`,
        sourceType: 'transfer',
        referenceNo: body.referenceNo || '',
        note: body.note || '',
        status: 'posted'
      };
      const inItem = {
        ...outItem,
        _id: `treasury-transaction-${state.treasuryTransactions.length + 2}`,
        accountId: body.destinationAccountId,
        counterAccountId: body.sourceAccountId,
        transactionType: 'transfer_in',
        direction: 'in'
      };
      state.treasuryTransactions.unshift(inItem);
      state.treasuryTransactions.unshift(outItem);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, transactionGroupKey: groupKey, items: [outItem, inItem] })
      });
    });

    await page.route('**/api/finance/admin/expenses/*/submit', async (route) => {
      const id = route.request().url().split('/').at(-2);
      state.expenses = state.expenses.map((item) => (
        item._id === id
          ? {
              ...item,
              status: 'pending_review',
              approvalStage: 'finance_manager_review',
              approvalTrail: [...(item.approvalTrail || []), { action: 'submit' }]
            }
          : item
      ));
      const item = state.expenses.find((entry) => entry._id === id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item, nextStage: 'finance_manager_review' })
      });
    });

    await page.route('**/api/finance/admin/expenses/*/review', async (route) => {
      counters.reviewExpense += 1;
      const id = route.request().url().split('/').at(-2);
      const body = route.request().postDataJSON();
      state.expenses = state.expenses.map((item) => {
        if (item._id !== id) return item;
        if (body.action === 'reject') {
          return {
            ...item,
            status: 'rejected',
            approvalStage: 'rejected',
            approvalTrail: [...(item.approvalTrail || []), { action: 'reject' }]
          };
        }
        return {
          ...item,
          status: 'approved',
          approvalStage: 'completed',
          approvalTrail: [...(item.approvalTrail || []), { action: 'approve' }]
        };
      });
      const item = state.expenses.find((entry) => entry._id === id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item, nextStage: item.approvalStage })
      });
    });

    await page.route('**/api/finance/admin/expenses**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== '/api/finance/admin/expenses') {
        await route.fallback();
        return;
      }

      if (route.request().method() === 'POST') {
        counters.createExpense += 1;
        const body = route.request().postDataJSON();
        const item = {
          _id: `exp-${state.expenses.length + 1}`,
          category: body.category,
          subCategory: body.subCategory || '',
          amount: Number(body.amount),
          expenseDate: `${body.expenseDate}T00:00:00.000Z`,
          status: body.status === 'pending_review' ? 'pending_review' : 'draft',
          approvalStage: body.status === 'pending_review' ? 'finance_manager_review' : 'draft',
          vendorName: body.vendorName || '',
          treasuryAccountId: body.treasuryAccountId || '',
          procurementCommitmentId: body.procurementCommitmentId || '',
          approvalTrail: body.status === 'pending_review' ? [{ action: 'submit' }] : []
        };
        state.expenses.unshift(item);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: state.expenses })
      });
    });

    await page.route('**/api/finance/admin/procurements/*/submit', async (route) => {
      counters.submitProcurement += 1;
      const id = route.request().url().split('/').at(-2);
      state.procurements = state.procurements.map((item) => (
        item._id === id
          ? {
              ...item,
              status: 'pending_review',
              approvalStage: 'finance_manager_review',
              submittedBy: { _id: 'admin-1', name: 'Admin Alpha' },
              submittedAt: '2026-03-20T08:30:00.000Z',
              approvalTrail: [...(item.approvalTrail || []), {
                level: 'finance_manager',
                action: 'submit',
                by: { _id: 'admin-1', name: 'Admin Alpha' },
                at: '2026-03-20T08:30:00.000Z',
                note: 'Submitted for procurement review.',
                reason: ''
              }]
            }
          : item
      ));
      const item = buildProcurementAnalytics(state).items.find((entry) => entry._id === id) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item })
      });
    });

    await page.route('**/api/finance/admin/procurements/*/review', async (route) => {
      counters.reviewProcurement += 1;
      const id = route.request().url().split('/').at(-2);
      const body = route.request().postDataJSON();
      state.procurements = state.procurements.map((item) => {
        if (item._id !== id) return item;
        if (body.action === 'reject') {
          return {
            ...item,
            status: 'rejected',
            approvalStage: 'rejected',
            approvalTrail: [...(item.approvalTrail || []), {
              level: 'finance_manager',
              action: 'reject',
              by: { _id: 'admin-1', name: 'Admin Alpha' },
              at: '2026-03-20T08:45:00.000Z',
              note: body.note || '',
              reason: body.reason || ''
            }]
          };
        }
        return {
          ...item,
          status: 'approved',
          approvalStage: 'approved',
          approvedBy: { _id: 'admin-1', name: 'Admin Alpha' },
          approvedAt: '2026-03-20T08:45:00.000Z',
          approvalTrail: [...(item.approvalTrail || []), {
            level: 'finance_manager',
            action: 'approve',
            by: { _id: 'admin-1', name: 'Admin Alpha' },
            at: '2026-03-20T08:45:00.000Z',
            note: body.note || '',
            reason: ''
          }]
        };
      });
      const item = buildProcurementAnalytics(state).items.find((entry) => entry._id === id) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item,
          nextStage: item?.approvalStage || 'draft'
        })
      });
    });

    await page.route('**/api/finance/admin/procurements/*/settlements', async (route) => {
      counters.settleProcurement += 1;
      const id = route.request().url().split('/').at(-2);
      const body = route.request().postDataJSON();
      state.procurements = state.procurements.map((item) => {
        if (item._id !== id) return item;
        const settlement = {
          _id: `proc-settlement-${counters.settleProcurement}`,
          amount: Number(body.amount || 0),
          settlementDate: `${body.settlementDate}T00:00:00.000Z`,
          treasuryAccountId: state.treasuryAccounts.find((entry) => entry._id === body.treasuryAccountId) || { _id: body.treasuryAccountId, title: body.treasuryAccountId },
          treasuryTransactionId: {
            _id: `treasury-transaction-${state.treasuryTransactions.length + 1}`,
            referenceNo: body.referenceNo || `SET-${counters.settleProcurement}`
          },
          referenceNo: body.referenceNo || '',
          note: body.note || '',
          createdBy: { _id: 'admin-1', name: 'Admin Alpha' },
          createdAt: '2026-03-20T09:15:00.000Z'
        };
        const transaction = {
          _id: `treasury-transaction-${state.treasuryTransactions.length + 1}`,
          accountId: body.treasuryAccountId,
          counterAccountId: null,
          transactionGroupKey: '',
          transactionType: 'withdrawal',
          direction: 'out',
          amount: Number(body.amount || 0),
          currency: 'AFN',
          transactionDate: `${body.settlementDate}T00:00:00.000Z`,
          sourceType: 'procurement_settlement',
          referenceNo: body.referenceNo || `SET-${counters.settleProcurement}`,
          note: body.note || '',
          status: 'posted'
        };
        state.treasuryTransactions.unshift(transaction);
        const nextSettlements = [...(item.settlements || []), settlement];
        const nextSettledAmount = nextSettlements.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
        return {
          ...item,
          settlements: nextSettlements,
          settledAmount: nextSettledAmount,
          settlementCount: nextSettlements.length,
          lastSettledAt: settlement.settlementDate,
          lastSettledBy: { _id: 'admin-1', name: 'Admin Alpha' }
        };
      });
      const item = buildProcurementAnalytics(state).items.find((entry) => entry._id === id) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item,
          settlement: item?.settlements?.slice(-1)?.[0] || null
        })
      });
    });

    await page.route('**/api/finance/admin/procurements**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== '/api/finance/admin/procurements') {
        await route.fallback();
        return;
      }

      if (route.request().method() === 'POST') {
        counters.saveProcurement += 1;
        const body = route.request().postDataJSON();
        const item = {
          _id: `proc-${state.procurements.length + 1}`,
          financialYearId: body.financialYearId || state.financialYears[0]?._id || '',
          academicYearId: body.academicYearId || state.financialYears[0]?.academicYearId || '',
          classId: body.classId || '',
          treasuryAccountId: body.treasuryAccountId || '',
          category: body.category,
          subCategory: body.subCategory || '',
          procurementType: body.procurementType || 'vendor_commitment',
          title: body.title,
          vendorName: body.vendorName,
          committedAmount: Number(body.committedAmount || 0),
          requestDate: `${body.requestDate}T00:00:00.000Z`,
          expectedDeliveryDate: body.expectedDeliveryDate ? `${body.expectedDeliveryDate}T00:00:00.000Z` : null,
          referenceNo: body.referenceNo || '',
          paymentTerms: body.paymentTerms || '',
          description: body.description || '',
          note: body.note || '',
          status: body.status === 'pending_review' ? 'pending_review' : 'draft',
          approvalStage: body.status === 'pending_review' ? 'finance_manager_review' : 'draft',
          settlements: [],
          settledAmount: 0,
          settlementCount: 0,
          lastSettledAt: null,
          lastSettledBy: null,
          approvalTrail: body.status === 'pending_review'
            ? [{
                level: 'finance_manager',
                action: 'submit',
                by: { _id: 'admin-1', name: 'Admin Alpha' },
                at: '2026-03-20T08:15:00.000Z',
                note: 'Submitted during commitment creation.',
                reason: ''
              }]
            : []
        };
        state.procurements.unshift(item);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            item: buildProcurementAnalytics(state).items.find((entry) => entry._id === item._id) || item
          })
        });
        return;
      }

      const analytics = buildProcurementAnalytics(state, url.searchParams.get('financialYearId') || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          summary: analytics.summary,
          vendors: analytics.vendors,
          items: analytics.items
        })
      });
    });

    await page.route('**/api/finance/admin/government-snapshots**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== '/api/finance/admin/government-snapshots') {
        await route.fallback();
        return;
      }
      if (route.request().method() === 'POST') {
        counters.snapshot += 1;
        const body = route.request().postDataJSON();
        const reportType = body.reportType;
        const nextVersion = state.snapshots.filter((item) => item.reportType === reportType).length + 1;
        const item = {
          _id: `snap-${state.snapshots.length + 1}`,
          reportType,
          quarter: reportType === 'quarterly' ? body.quarter : null,
          version: nextVersion,
          generatedAt: '2026-03-19T09:00:00.000Z',
          generatedBy: { _id: 'admin-1', name: 'Admin Alpha' },
          title: reportType === 'quarterly' ? 'Quarterly Snapshot' : 'Annual Snapshot',
          columns: reportType === 'quarterly'
            ? [
                { key: 'classTitle', label: 'Class' },
                { key: 'totalIncome', label: 'Income' },
                { key: 'totalExpense', label: 'Expense' }
              ]
            : [
                { key: 'quarterLabel', label: 'Quarter' },
                { key: 'totalIncome', label: 'Income' },
                { key: 'totalExpense', label: 'Expense' }
              ],
          rows: reportType === 'quarterly'
            ? [{ classTitle: 'Class 10 A', totalIncome: 8200, totalExpense: buildExpenseAnalytics(state).summary.approvedAmount }]
            : [{ quarterLabel: 'Quarter 1', totalIncome: 8000, totalExpense: buildExpenseAnalytics(state).summary.approvedAmount }],
          pack: buildSnapshotPack(state, body.financialYearId || state.financialYears[0]?._id || ''),
          summary: reportType === 'quarterly'
            ? { balance: 8200 - buildExpenseAnalytics(state).summary.approvedAmount }
            : { netProfit: 32000 - buildExpenseAnalytics(state).summary.approvedAmount }
        };
        state.snapshots.unshift(item);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: state.snapshots })
      });
    });

    await page.route('**/api/finance/admin/government-snapshots/*/export.pdf', async (route) => {
      counters.snapshotPdf += 1;
      const snapshotId = route.request().url().split('/').at(-2);
      const snapshot = state.snapshots.find((item) => item._id === snapshotId) || state.snapshots[0] || null;
      if (snapshot && !state.archivedDocuments.some((item) => String(item.meta?.governmentSnapshotId || '') === String(snapshotId || ''))) {
        state.archivedDocuments.unshift({
          _id: `archive-${state.archivedDocuments.length + 1}`,
          documentNo: `GSP-202603-${String(state.archivedDocuments.length + 1).padStart(3, '0')}`,
          documentType: 'government_snapshot_pack',
          title: snapshot.title || 'Government finance snapshot pack',
          classId: 'class-1',
          academicYearId: state.financialYears[0]?.academicYearId || 'year-1',
          generatedAt: snapshot.generatedAt,
          generatedBy: snapshot.generatedBy,
          verificationCode: `VERIFY-GSP-${String(state.archivedDocuments.length + 1).padStart(3, '0')}`,
          verificationUrl: `https://example.test/verify/GSP-${state.archivedDocuments.length + 1}`,
          verification: {
            code: `VERIFY-GSP-${String(state.archivedDocuments.length + 1).padStart(3, '0')}`,
            url: `https://example.test/verify/GSP-${state.archivedDocuments.length + 1}`
          },
          deliveryCount: 0,
          lastDeliveredAt: null,
          lastDeliveryStatus: '',
          deliveryLog: [],
          liveStatus: null,
          meta: {
            governmentSnapshotId: snapshotId,
            reportType: snapshot.reportType || '',
            version: snapshot.version || 1
          }
        });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: '%PDF-1.4\n%mock government snapshot pdf'
      });
    });

    await page.route('**/api/finance/admin/document-archive**', async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      const documentType = url.searchParams.get('documentType') || '';
      const classId = url.searchParams.get('classId') || '';
      const academicYearId = url.searchParams.get('academicYearId') || '';
      const items = state.archivedDocuments.filter((item) => (
        (!documentType || item.documentType === documentType)
        && (!classId || String(item.classId || '') === classId)
        && (!academicYearId || String(item.academicYearId || '') === academicYearId)
      ));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items })
      });
    });

    await page.route('**/api/finance/admin/document-archive/*/deliver', async (route) => {
      counters.deliverGovernmentArchive += 1;
      const archiveId = route.request().url().split('/').at(-2);
      const body = route.request().postDataJSON();
      state.archivedDocuments = state.archivedDocuments.map((item) => {
        if (item._id !== archiveId) return item;
        const nextStatus = Number(item.deliveryCount || 0) > 0 ? 'resent' : 'sent';
        const logEntry = {
          channel: body.channel || 'email',
          status: nextStatus,
          recipient: body.recipientHandles || '',
          recipientCount: String(body.recipientHandles || '').split(/[\n,;]+/).map((entry) => entry.trim()).filter(Boolean).length,
          linkedAudienceNotified: body.includeLinkedAudience !== false,
          provider: body.channel === 'sms' ? 'mock_sms_gateway' : body.channel === 'whatsapp' ? 'mock_whatsapp_gateway' : body.channel === 'portal' ? 'portal_notification' : 'smtp',
          sentAt: '2026-03-20T09:20:00.000Z'
        };
        return {
          ...item,
          deliveryCount: Number(item.deliveryCount || 0) + 1,
          lastDeliveredAt: '2026-03-20T09:20:00.000Z',
          lastDeliveryStatus: nextStatus,
          deliveryLog: [...(item.deliveryLog || []), logEntry],
          liveStatus: {
            key: nextStatus,
            label: nextStatus === 'resent' ? 'Resent' : 'Sent',
            tone: nextStatus === 'resent' ? 'copper' : 'teal'
          }
        };
      });
      const item = state.archivedDocuments.find((entry) => entry._id === archiveId) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item })
      });
    });

    await page.goto('/admin-government-finance', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.gov-finance-badge.info')).toContainText('متصل به هسته مالی و موتور گزارش');
    await expect(page.locator('.gov-kpi-grid')).toContainText('AFN');

    await page.getByRole('tab', { name: 'عملیات مصارف' }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('tab') || '').toBe('operations');
    const categoryFormCard = page.locator('[data-expense-category-save="true"]').locator('xpath=ancestor::article[1]');
    await categoryFormCard.locator('input[name="label"]').fill('Technology');
    await categoryFormCard.locator('input[name="key"]').fill('technology');
    await categoryFormCard.locator('input[name="description"]').fill('Devices and classroom technology');
    await categoryFormCard.locator('textarea[name="subCategoriesText"]').fill('Devices\nProjectors');
    await categoryFormCard.locator('[data-expense-category-save="true"]').click();

    await expect.poll(() => counters.saveCategory).toBe(1);
    await page.getByRole('tab').nth(3).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('tab') || '').toBe('treasury');
    const treasuryAccountFormCard = page.locator('[data-treasury-account-save="true"]').locator('xpath=ancestor::article[1]');
    await treasuryAccountFormCard.locator('input[name="title"]').fill('Reserve Bank');
    await treasuryAccountFormCard.locator('input[name="code"]').fill('BANK-01');
    await treasuryAccountFormCard.locator('select[name="accountType"]').selectOption('bank');
    await treasuryAccountFormCard.locator('input[name="openingBalance"]').fill('1800');
    await treasuryAccountFormCard.locator('input[name="providerName"]').fill('AIB');
    await treasuryAccountFormCard.locator('input[name="branchName"]').fill('Kabul Main');
    await treasuryAccountFormCard.locator('input[name="accountNo"]').fill('222-0002');
    await treasuryAccountFormCard.locator('input[name="note"]').fill('Reserve treasury account');
    await treasuryAccountFormCard.locator('[data-treasury-account-save="true"]').click();

    await expect.poll(() => counters.createTreasuryAccount).toBe(1);
    await expect(page.locator('[data-treasury-account-edit="BANK-01"]')).toBeVisible();

    const treasuryTransactionCard = page.locator('[data-treasury-transaction-save="true"]').locator('xpath=ancestor::article[1]');
    await treasuryTransactionCard.locator('select[name="accountId"]').selectOption({ label: 'Reserve Bank' });
    await treasuryTransactionCard.locator('select[name="transactionType"]').selectOption('withdrawal');
    await treasuryTransactionCard.locator('input[name="amount"]').fill('250');
    await treasuryTransactionCard.locator('input[name="transactionDate"]').fill('2026-03-21');
    await treasuryTransactionCard.locator('input[name="referenceNo"]').fill('BANK-WD-01');
    await treasuryTransactionCard.locator('input[name="note"]').fill('Petty cash support');
    await treasuryTransactionCard.locator('[data-treasury-transaction-save="true"]').click();

    await expect.poll(() => counters.createTreasuryTransaction).toBe(1);
    await expect(page.locator('.gov-content-grid')).toContainText('BANK-WD-01');

    const treasurySettlementCard = page.locator('[data-treasury-transfer-save="true"]').locator('xpath=ancestor::article[1]');
    await treasurySettlementCard.locator('select[name="sourceAccountId"]').selectOption({ label: 'Main Cashbox' });
    await treasurySettlementCard.locator('select[name="destinationAccountId"]').selectOption({ label: 'Reserve Bank' });
    await treasurySettlementCard.locator('input[name="amount"]').fill('400');
    await treasurySettlementCard.locator('input[name="transactionDate"]').fill('2026-03-22');
    await treasurySettlementCard.locator('input[name="referenceNo"]').first().fill('TRF-2026-01');
    await treasurySettlementCard.locator('input[name="note"]').first().fill('Top up reserve account');
    await treasurySettlementCard.locator('[data-treasury-transfer-save="true"]').click();

    await expect.poll(() => counters.createTreasuryTransfer).toBe(1);
    await expect(page.locator('.gov-content-grid')).toContainText('TRF-2026-01');

    await treasurySettlementCard.locator('select[name="accountId"]').selectOption({ label: 'Reserve Bank' });
    await treasurySettlementCard.locator('input[name="statementBalance"]').fill('2200');
    await treasurySettlementCard.locator('input[name="reconciliationDate"]').fill('2026-03-23');
    await treasurySettlementCard.locator('input[name="referenceNo"]').last().fill('REC-2026-01');
    await treasurySettlementCard.locator('input[name="note"]').last().fill('Bank statement matched');
    await treasurySettlementCard.locator('[data-treasury-reconcile-save="true"]').click();

    await expect.poll(() => counters.reconcileTreasury).toBe(1);
    await expect(page.locator('.gov-content-grid')).toContainText('REC-2026-01');
    await expect(page.locator('.gov-content-grid')).toContainText('Reserve Bank');
    await page.locator('[data-treasury-report-account-select="true"]').selectOption({ label: 'Reserve Bank' });
    await expect(page.locator('[data-treasury-cashbook-card="true"]')).toContainText('BANK-WD-01');
    await expect(page.locator('[data-treasury-cashbook-card="true"]')).toContainText('TRF-2026-01');
    await expect(page.locator('[data-treasury-reconciliation-card="true"]')).toContainText('Reserve Bank');
    await expect(page.locator('[data-treasury-variance-card="true"]')).toContainText('Main Cashbox');
    await page.getByRole('tab').nth(2).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('tab') || '').toBe('operations');
    await expect(page.locator('.gov-card', { hasText: 'رجیستری رسمی دسته‌های مصرف' })).toContainText('Technology');

    const procurementCard = page.locator('[data-procurement-save="true"]').locator('xpath=ancestor::article[1]');
    await procurementCard.locator('input[name="title"]').fill('Technology Lab Devices');
    await procurementCard.locator('input[name="vendorName"]').fill('Atlas Supplies');
    await procurementCard.locator('select[name="category"]').selectOption('technology');
    await procurementCard.locator('select[name="subCategory"]').selectOption('devices');
    await procurementCard.locator('input[name="committedAmount"]').fill('1200');
    await procurementCard.locator('input[name="requestDate"]').fill('2026-03-20');
    await procurementCard.locator('input[name="expectedDeliveryDate"]').fill('2026-03-25');
    await procurementCard.locator('input[name="referenceNo"]').fill('PROC-2026-01');
    await procurementCard.locator('input[name="paymentTerms"]').fill('Net 15');
    await procurementCard.locator('input[name="description"]').fill('Lab device purchase');
    await procurementCard.locator('input[name="note"]').fill('Need approval before expense release');
    await procurementCard.locator('[data-procurement-save="true"]').click();

    await expect.poll(() => counters.saveProcurement).toBe(1);
    const procurementRow = page.locator('[data-procurement-registry-card="true"] tbody tr', { hasText: 'Technology Lab Devices' });
    await procurementRow.locator('[data-procurement-submit]').click();
    await expect.poll(() => counters.submitProcurement).toBe(1);
    await procurementRow.locator('[data-procurement-approve]').click();
    await expect.poll(() => counters.reviewProcurement).toBe(1);
    await expect(page.locator('[data-procurement-registry-card="true"]')).toContainText('تایید شده');

    const ledgerCard = page.locator('.gov-card', { hasText: 'دفتر ثبت مصارف' });
    await page.getByRole('tab').nth(2).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('tab') || '').toBe('operations');
    await ledgerCard.locator('select[name="category"]').selectOption('technology');
    await ledgerCard.locator('select[name="procurementCommitmentId"]').selectOption('proc-1');
    await ledgerCard.locator('select[name="subCategory"]').selectOption('devices');
    await ledgerCard.locator('input[name="amount"]').fill('950');
    await ledgerCard.locator('input[name="expenseDate"]').fill('2026-03-20');
    await ledgerCard.locator('select[name="status"]').selectOption('pending_review');
    await expect(ledgerCard.locator('input[name="vendorName"]')).toHaveValue('Atlas Supplies');
    await ledgerCard.locator('input[name="referenceNo"]').fill('GF-2026-009');
    await ledgerCard.locator('input[name="note"]').fill('Technology refresh');
    await ledgerCard.locator('.gov-primary-btn').click();

    await expect.poll(() => counters.createExpense).toBe(1);
    const queueCard = page.locator('.gov-card', { hasText: 'صف بررسی مصارف' });
    await expect(queueCard.locator('.gov-table')).toContainText('Atlas Supplies');
    await expect(queueCard.locator('.gov-table')).toContainText('در انتظار بررسی');

    await page.getByRole('tab', { name: 'مدیریت سال مالی' }).click();
    const yearLedger = page.locator('.gov-card', { hasText: 'دفتر سال‌های مالی' });
    await expect(page.locator('[data-budget-summary-card="true"]')).toContainText('Expense budget');
    await page.locator('input[name="annualExpenseBudget"]').fill('1800');
    await page.locator('[data-budget-annual="admin"]').fill('1250');
    await page.locator('[data-budget-save="true"]').click();
    await expect.poll(() => counters.saveBudget).toBe(1);
    await expect(page.locator('input[name="annualExpenseBudget"]')).toHaveValue('1800');
    await page.locator('[data-budget-request-review="true"]').click();
    await expect.poll(() => counters.budgetReviewRequest).toBe(1);
    await expect(page.locator('[data-budget-approval-card="true"]')).toContainText('بررسی مدیر مالی');
    for (let step = 1; step <= 3; step += 1) {
      await page.locator('[data-budget-approve="true"]').click();
      await expect.poll(() => counters.budgetReviewApprove).toBe(step);
    }
    await expect(page.locator('[data-budget-approval-card="true"]')).toContainText('بودجه تایید شد');
    await page.locator('[data-budget-start-revision="true"]').click();
    await expect.poll(() => counters.budgetStartRevision).toBe(1);
    await expect(page.locator('[data-budget-revision-history="true"]')).toContainText('revision_started');
    await page.locator('input[name="annualExpenseBudget"]').fill('1900');
    await page.locator('[data-budget-save="true"]').click();
    await expect.poll(() => counters.saveBudget).toBe(2);
    await page.locator('[data-budget-request-review="true"]').click();
    await expect.poll(() => counters.budgetReviewRequest).toBe(2);
    for (let step = 4; step <= 6; step += 1) {
      await page.locator('[data-budget-approve="true"]').click();
      await expect.poll(() => counters.budgetReviewApprove).toBe(step);
    }
    await yearLedger.locator('.gov-year-card.selected .gov-card-actions button').last().click();
    await expect.poll(() => counters.closeBlocked).toBe(1);
    await expect(page.locator('.gov-finance-message.error')).toContainText('بستن سال مالی متوقف شد');

    await page.getByRole('tab', { name: 'عملیات مصارف' }).click();
    const pendingQueueRow = queueCard.locator('tbody tr', { hasText: 'Atlas Supplies' });
    await expect(pendingQueueRow).toContainText('در انتظار بررسی');
    await pendingQueueRow.locator('[data-expense-review-approve]').click();
    await expect.poll(() => counters.reviewExpense).toBe(1);
    await expect(queueCard).not.toContainText('Atlas Supplies');
    const settlementCard = page.locator('[data-procurement-settlement-card="true"]');
    await settlementCard.locator('select[name="commitmentId"]').selectOption('proc-1');
    await settlementCard.locator('input[name="amount"]').fill('500');
    await settlementCard.locator('input[name="settlementDate"]').fill('2026-03-24');
    await settlementCard.locator('input[name="referenceNo"]').fill('SET-2026-01');
    await settlementCard.locator('input[name="note"]').fill('First vendor settlement');
    await settlementCard.locator('[data-procurement-settlement-save="true"]').click();
    await expect.poll(() => counters.settleProcurement).toBe(1);
    await expect(settlementCard).toContainText('SET-2026-01');
    await expect(settlementCard).toContainText('۵۰۰');
    await expect(ledgerCard.locator('.gov-table')).toContainText('تایید شده');

    await page.getByRole('tab', { name: 'مدیریت سال مالی' }).click();
    await yearLedger.locator('.gov-year-card.selected .gov-card-actions button').last().click();
    await expect.poll(() => counters.closeSuccess).toBe(1);

    await page.getByRole('tab', { name: 'آرشیف رسمی' }).click();
    await page.getByRole('button', { name: 'ساخت نسخه رسمی ربعوار' }).click();
    await page.getByRole('button', { name: 'ساخت نسخه رسمی سالانه' }).click();

    await expect.poll(() => counters.snapshot).toBe(2);
    await expect(page.locator('.gov-stack-section .gov-table').first()).toContainText('quarterly');
    await expect(page.locator('.gov-stack-section .gov-table').first()).toContainText('annual');
    await expect(page.locator('[data-snapshot-pack-summary="true"]')).toContainText('Treasury balance');
    await page.locator('[data-snapshot-pdf-latest="true"]').click();
    await expect.poll(() => counters.snapshotPdf).toBe(1);
    await page.locator('[data-snapshot-pdf]').first().click();
    await expect.poll(() => counters.snapshotPdf).toBe(2);
    await expect(page.locator('[data-government-archive-card="true"]')).toContainText('government_snapshot_pack');
    const archiveDeliveryCard = page.locator('[data-government-archive-delivery-card="true"]');
    await archiveDeliveryCard.locator('select[name="channel"]').selectOption('email');
    await archiveDeliveryCard.locator('textarea[name="recipientHandles"]').fill('finance@example.edu');
    await archiveDeliveryCard.locator('input[name="note"]').fill('Monthly compliance copy');
    await archiveDeliveryCard.locator('[data-government-archive-deliver="true"]').click();
    await expect.poll(() => counters.deliverGovernmentArchive).toBe(1);
    await expect(archiveDeliveryCard).toContainText('finance@example.edu');
    await expect(archiveDeliveryCard).toContainText('Sent');
  });
});
