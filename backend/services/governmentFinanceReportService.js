const AcademicYear = require('../models/AcademicYear');
const ExpenseCategoryDefinition = require('../models/ExpenseCategoryDefinition');
const ExpenseEntry = require('../models/ExpenseEntry');
const FeePayment = require('../models/FeePayment');
const FinancialYear = require('../models/FinancialYear');
const SchoolClass = require('../models/SchoolClass');
const { buildTreasuryAnalytics } = require('./treasuryGovernanceService');
const { getQuarterRange, listQuarterRanges, startOfDay, endOfDay } = require('./financialPeriodService');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function resolveFinancialSource(filters = {}) {
  const financialYearId = normalizeText(filters.financialYearId);
  const academicYearId = normalizeText(filters.academicYearId);
  let financialYear = null;
  let academicYear = null;

  if (financialYearId) {
    financialYear = await FinancialYear.findById(financialYearId).populate('academicYearId', 'title code startDate endDate');
    if (financialYear?.academicYearId?._id) {
      academicYear = financialYear.academicYearId;
    }
  }

  if (!academicYear && academicYearId) {
    academicYear = await AcademicYear.findById(academicYearId).select('title code startDate endDate');
  }

  if (!financialYear && academicYear?._id) {
    financialYear = await FinancialYear.findOne({ academicYearId: academicYear._id, status: { $ne: 'archived' } })
      .sort({ isActive: -1, createdAt: -1 });
  }

  const source = financialYear || academicYear || {};
  return {
    financialYear,
    academicYear,
    baseStartDate: startOfDay(source.startDate),
    baseEndDate: endOfDay(source.endDate)
  };
}

function buildRangeMatch(field, range = null) {
  if (!range?.startDate || !range?.endDate) return {};
  return {
    [field]: {
      $gte: range.startDate,
      $lte: range.endDate
    }
  };
}

async function loadClassMap(classIds = []) {
  const uniqueIds = [...new Set(classIds.map((item) => String(item || '')).filter(Boolean))];
  if (!uniqueIds.length) return new Map();
  const classes = await SchoolClass.find({ _id: { $in: uniqueIds } }).select('title code gradeLevel section').lean();
  return new Map(classes.map((item) => [String(item._id), item]));
}

function mergeGroupedEntries(payments = [], expenses = [], classMap = new Map()) {
  const grouped = new Map();

  const ensureBucket = (classId = '') => {
    const key = String(classId || 'unscoped');
    if (!grouped.has(key)) {
      const schoolClass = classMap.get(key) || null;
      grouped.set(key, {
        classId: key === 'unscoped' ? '' : key,
        classTitle: schoolClass?.title || (key === 'unscoped' ? 'عمومی / بدون صنف' : 'صنف'),
        totalIncome: 0,
        totalExpense: 0,
        balance: 0,
        paymentCount: 0,
        expenseCount: 0
      });
    }
    return grouped.get(key);
  };

  payments.forEach((row) => {
    const bucket = ensureBucket(row._id);
    bucket.totalIncome += Number(row.total || 0);
    bucket.paymentCount += Number(row.count || 0);
    bucket.balance = bucket.totalIncome - bucket.totalExpense;
  });

  expenses.forEach((row) => {
    const bucket = ensureBucket(row._id);
    bucket.totalExpense += Number(row.total || 0);
    bucket.expenseCount += Number(row.count || 0);
    bucket.balance = bucket.totalIncome - bucket.totalExpense;
  });

  return [...grouped.values()].sort((left, right) => right.balance - left.balance);
}

async function buildQuarterlyGovernmentFinanceReport(filters = {}) {
  const context = await resolveFinancialSource(filters);
  const quarter = Math.max(1, Math.min(4, Number(filters.quarter) || 1));
  const range = context.baseStartDate && context.baseEndDate
    ? getQuarterRange({ startDate: context.baseStartDate, endDate: context.baseEndDate }, quarter)
    : null;

  const paymentFilter = { status: 'approved' };
  const expenseFilter = { status: 'approved' };

  if (filters.classId) {
    paymentFilter.classId = filters.classId;
    expenseFilter.classId = filters.classId;
  }
  if (context.financialYear?._id) {
    expenseFilter.financialYearId = context.financialYear._id;
  }
  if (context.academicYear?._id) {
    paymentFilter.academicYearId = context.academicYear._id;
    expenseFilter.academicYearId = context.academicYear._id;
  }

  Object.assign(paymentFilter, buildRangeMatch('paidAt', range));
  Object.assign(expenseFilter, buildRangeMatch('expenseDate', range));

  const [paymentRows, expenseRows] = await Promise.all([
    FeePayment.aggregate([
      { $match: paymentFilter },
      {
        $group: {
          _id: '$classId',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]),
    ExpenseEntry.aggregate([
      { $match: expenseFilter },
      {
        $group: {
          _id: '$classId',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const classMap = await loadClassMap([
    ...paymentRows.map((item) => item._id),
    ...expenseRows.map((item) => item._id)
  ]);
  const rows = mergeGroupedEntries(paymentRows, expenseRows, classMap);
  const totalIncome = rows.reduce((sum, item) => sum + Number(item.totalIncome || 0), 0);
  const totalExpense = rows.reduce((sum, item) => sum + Number(item.totalExpense || 0), 0);

  return {
    range,
    rows,
    summary: {
      totalIncome: Number(totalIncome.toFixed(2)),
      totalExpense: Number(totalExpense.toFixed(2)),
      balance: Number((totalIncome - totalExpense).toFixed(2)),
      quarter,
      classCount: rows.length,
      paymentCount: rows.reduce((sum, item) => sum + Number(item.paymentCount || 0), 0),
      expenseCount: rows.reduce((sum, item) => sum + Number(item.expenseCount || 0), 0)
    },
    meta: {
      financialYearId: context.financialYear?._id ? String(context.financialYear._id) : '',
      academicYearId: context.academicYear?._id ? String(context.academicYear._id) : '',
      financialYearTitle: context.financialYear?.title || context.academicYear?.title || '',
      quarter
    }
  };
}

async function buildAnnualGovernmentFinanceReport(filters = {}) {
  const context = await resolveFinancialSource(filters);
  const source = context.baseStartDate && context.baseEndDate
    ? { startDate: context.baseStartDate, endDate: context.baseEndDate }
    : null;
  const ranges = source ? listQuarterRanges(source) : [];

  const quarterItems = [];
  for (const item of ranges) {
    // eslint-disable-next-line no-await-in-loop
    const quarterly = await buildQuarterlyGovernmentFinanceReport({ ...filters, quarter: item.quarter });
    quarterItems.push({
      quarter: item.quarter,
      quarterLabel: `ربع ${item.quarter}`,
      totalIncome: quarterly.summary.totalIncome,
      totalExpense: quarterly.summary.totalExpense,
      balance: quarterly.summary.balance,
      classCount: quarterly.summary.classCount
    });
  }

  const totalIncome = quarterItems.reduce((sum, item) => sum + Number(item.totalIncome || 0), 0);
  const totalExpense = quarterItems.reduce((sum, item) => sum + Number(item.totalExpense || 0), 0);

  return {
    range: source,
    rows: quarterItems,
    summary: {
      totalIncome: Number(totalIncome.toFixed(2)),
      totalExpense: Number(totalExpense.toFixed(2)),
      netProfit: Number((totalIncome - totalExpense).toFixed(2)),
      quarterCount: quarterItems.length
    },
    meta: {
      financialYearId: context.financialYear?._id ? String(context.financialYear._id) : '',
      academicYearId: context.academicYear?._id ? String(context.academicYear._id) : '',
      financialYearTitle: context.financialYear?.title || context.academicYear?.title || ''
    }
  };
}

function normalizeBudgetTargets(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const categoryBudgets = Array.isArray(source.categoryBudgets)
    ? source.categoryBudgets
      .map((item) => ({
        categoryKey: normalizeText(item?.categoryKey).toLowerCase(),
        label: normalizeText(item?.label),
        annualBudget: Math.max(0, Number(item?.annualBudget || 0)),
        monthlyBudget: Math.max(0, Number(item?.monthlyBudget || 0)),
        alertThresholdPercent: Math.max(0, Number(item?.alertThresholdPercent || 85))
      }))
      .filter((item) => item.categoryKey)
    : [];

  return {
    annualIncomeTarget: Math.max(0, Number(source.annualIncomeTarget || 0)),
    annualExpenseBudget: Math.max(0, Number(source.annualExpenseBudget || 0)),
    monthlyIncomeTarget: Math.max(0, Number(source.monthlyIncomeTarget || 0)),
    monthlyExpenseBudget: Math.max(0, Number(source.monthlyExpenseBudget || 0)),
    treasuryReserveTarget: Math.max(0, Number(source.treasuryReserveTarget || 0)),
    note: normalizeText(source.note),
    categoryBudgets
  };
}

async function buildGovernmentBudgetVsActualReport(filters = {}) {
  const context = await resolveFinancialSource(filters);
  const financialYear = context.financialYear || null;
  const academicYear = context.academicYear || null;
  const paymentFilter = { status: 'approved' };
  const expenseFilter = { status: 'approved' };
  const classId = normalizeText(filters.classId);

  if (financialYear?._id) {
    expenseFilter.financialYearId = financialYear._id;
  }
  if (academicYear?._id) {
    paymentFilter.academicYearId = academicYear._id;
    expenseFilter.academicYearId = academicYear._id;
  }
  if (classId) {
    paymentFilter.classId = classId;
    expenseFilter.classId = classId;
  }

  Object.assign(paymentFilter, buildRangeMatch('paidAt', {
    startDate: context.baseStartDate,
    endDate: context.baseEndDate
  }));
  Object.assign(expenseFilter, buildRangeMatch('expenseDate', {
    startDate: context.baseStartDate,
    endDate: context.baseEndDate
  }));

  const [paymentSummaryRows, expenseSummaryRows, expenseCategoryRows, categoryRegistry, treasuryAnalytics] = await Promise.all([
    FeePayment.aggregate([
      { $match: paymentFilter },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]),
    ExpenseEntry.aggregate([
      { $match: expenseFilter },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]),
    ExpenseEntry.aggregate([
      { $match: expenseFilter },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]),
    ExpenseCategoryDefinition.find({ isActive: true }).select('key label colorTone order').sort({ order: 1, label: 1 }).lean(),
    buildTreasuryAnalytics({
      financialYearId: financialYear?._id ? String(financialYear._id) : '',
      academicYearId: academicYear?._id ? String(academicYear._id) : ''
    })
  ]);

  const actualIncome = Number(paymentSummaryRows[0]?.total || 0);
  const actualExpense = Number(expenseSummaryRows[0]?.total || 0);
  const actualNet = Number((actualIncome - actualExpense).toFixed(2));
  const budgetTargets = normalizeBudgetTargets(financialYear?.budgetTargets || {});
  const actualByCategory = new Map(
    (expenseCategoryRows || []).map((item) => [normalizeText(item?._id).toLowerCase(), {
      actualAmount: Number(item?.total || 0),
      expenseCount: Number(item?.count || 0)
    }])
  );
  const budgetByCategory = new Map(
    (budgetTargets.categoryBudgets || []).map((item) => [item.categoryKey, item])
  );
  const knownCategoryKeys = new Set([
    ...Array.from(actualByCategory.keys()),
    ...Array.from(budgetByCategory.keys()),
    ...(categoryRegistry || []).map((item) => normalizeText(item?.key).toLowerCase()).filter(Boolean)
  ]);

  const categoryRows = Array.from(knownCategoryKeys).map((categoryKey) => {
    const registryItem = (categoryRegistry || []).find((entry) => normalizeText(entry?.key).toLowerCase() === categoryKey) || null;
    const actual = actualByCategory.get(categoryKey) || { actualAmount: 0, expenseCount: 0 };
    const budget = budgetByCategory.get(categoryKey) || null;
    const annualBudget = Number(budget?.annualBudget || 0);
    const monthlyBudget = Number(budget?.monthlyBudget || 0);
    const actualAmount = Number(actual.actualAmount || 0);
    const varianceAmount = Number((actualAmount - annualBudget).toFixed(2));
    const utilizationPercent = annualBudget > 0
      ? Number(((actualAmount / annualBudget) * 100).toFixed(2))
      : 0;
    const alertThresholdPercent = Number(budget?.alertThresholdPercent || 85);
    let status = 'on_track';
    if (annualBudget <= 0 && actualAmount > 0) {
      status = 'unbudgeted';
    } else if (annualBudget > 0 && actualAmount > annualBudget) {
      status = 'over_budget';
    } else if (annualBudget > 0 && utilizationPercent >= alertThresholdPercent) {
      status = 'watch';
    } else if (annualBudget <= 0) {
      status = 'no_budget';
    }
    return {
      categoryKey,
      categoryLabel: registryItem?.label || budget?.label || categoryKey || 'Unassigned',
      colorTone: registryItem?.colorTone || 'slate',
      annualBudget,
      monthlyBudget,
      actualAmount,
      varianceAmount,
      remainingBudget: Number(Math.max(0, annualBudget - actualAmount).toFixed(2)),
      utilizationPercent,
      alertThresholdPercent,
      expenseCount: Number(actual.expenseCount || 0),
      status
    };
  }).sort((left, right) => {
    const leftPriority = left.status === 'over_budget' ? 0 : left.status === 'unbudgeted' ? 1 : left.status === 'watch' ? 2 : 3;
    const rightPriority = right.status === 'over_budget' ? 0 : right.status === 'unbudgeted' ? 1 : right.status === 'watch' ? 2 : 3;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return Number(right.actualAmount || 0) - Number(left.actualAmount || 0);
  });

  const summary = {
    annualIncomeTarget: Number(budgetTargets.annualIncomeTarget || 0),
    annualExpenseBudget: Number(budgetTargets.annualExpenseBudget || 0),
    monthlyIncomeTarget: Number(budgetTargets.monthlyIncomeTarget || 0),
    monthlyExpenseBudget: Number(budgetTargets.monthlyExpenseBudget || 0),
    treasuryReserveTarget: Number(budgetTargets.treasuryReserveTarget || 0),
    actualIncome: Number(actualIncome.toFixed(2)),
    actualExpense: Number(actualExpense.toFixed(2)),
    actualNet,
    incomeVariance: Number((actualIncome - Number(budgetTargets.annualIncomeTarget || 0)).toFixed(2)),
    expenseVariance: Number((actualExpense - Number(budgetTargets.annualExpenseBudget || 0)).toFixed(2)),
    treasuryReserveBalance: Number(treasuryAnalytics?.summary?.bookBalance || 0),
    treasuryReserveVariance: Number((Number(treasuryAnalytics?.summary?.bookBalance || 0) - Number(budgetTargets.treasuryReserveTarget || 0)).toFixed(2)),
    categoryCount: categoryRows.length,
    overBudgetCategoryCount: categoryRows.filter((item) => item.status === 'over_budget').length,
    unbudgetedCategoryCount: categoryRows.filter((item) => item.status === 'unbudgeted').length,
    watchCategoryCount: categoryRows.filter((item) => item.status === 'watch').length
  };

  const alerts = [];
  if (summary.annualExpenseBudget > 0 && summary.actualExpense > summary.annualExpenseBudget) {
    alerts.push({
      key: 'expense_over_budget',
      tone: 'rose',
      title: 'Expense budget exceeded',
      detail: `Actual approved expense exceeded the annual budget by ${summary.expenseVariance.toFixed(2)} AFN.`
    });
  }
  if (summary.annualIncomeTarget > 0 && summary.actualIncome < summary.annualIncomeTarget) {
    alerts.push({
      key: 'income_under_target',
      tone: 'copper',
      title: 'Income target not reached',
      detail: `Collected income is ${(summary.annualIncomeTarget - summary.actualIncome).toFixed(2)} AFN below target.`
    });
  }
  if (summary.treasuryReserveTarget > 0 && summary.treasuryReserveBalance < summary.treasuryReserveTarget) {
    alerts.push({
      key: 'treasury_reserve_gap',
      tone: 'copper',
      title: 'Treasury reserve below target',
      detail: `Treasury balance is ${(summary.treasuryReserveTarget - summary.treasuryReserveBalance).toFixed(2)} AFN below the reserve target.`
    });
  }
  if (summary.overBudgetCategoryCount > 0 || summary.unbudgetedCategoryCount > 0) {
    alerts.push({
      key: 'category_budget_attention',
      tone: 'rose',
      title: 'Category budgets need review',
      detail: `${summary.overBudgetCategoryCount} category budget(s) are over limit and ${summary.unbudgetedCategoryCount} category(ies) have spend without a defined budget.`
    });
  }

  return {
    meta: {
      financialYearId: financialYear?._id ? String(financialYear._id) : '',
      academicYearId: academicYear?._id ? String(academicYear._id) : '',
      financialYearTitle: financialYear?.title || academicYear?.title || '',
      budgetNote: budgetTargets.note || ''
    },
    summary,
    categories: categoryRows,
    alerts,
    treasury: {
      summary: treasuryAnalytics?.summary || {},
      alerts: treasuryAnalytics?.alerts || []
    }
  };
}

module.exports = {
  buildAnnualGovernmentFinanceReport,
  buildGovernmentBudgetVsActualReport,
  buildQuarterlyGovernmentFinanceReport
};
