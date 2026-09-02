const AcademicYear = require('../models/AcademicYear');
const ExpenseCategoryDefinition = require('../models/ExpenseCategoryDefinition');
const ExpenseEntry = require('../models/ExpenseEntry');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinancialYear = require('../models/FinancialYear');
const SchoolClass = require('../models/SchoolClass');
const { buildTreasuryAnalytics } = require('./treasuryGovernanceService');
const { startOfDay, endOfDay } = require('./financialPeriodService');
const {
  getShamsiMonthRange: getMonthRange,
  getShamsiQuarterRange: getQuarterRange,
  listShamsiQuarterRanges: listQuarterRanges,
  isShamsiAlignedSource
} = require('./shamsiPeriodService');
const { buildProcurementCommitmentAnalytics } = require('./procurementCommitmentService');

// Government reports are kept on a single, documented accounting basis: CASH.
// Income is recognized at the approved payment's paidAt date, expense at the
// approved ExpenseEntry's expenseDate. Procurement commitments are NOT folded
// into `balance`; they are surfaced separately as an encumbrance memo line
// (findings P5 / P6 of the مرکز مالی دولت review).
const GOVERNMENT_FINANCE_BASIS = 'cash';
const GOVERNMENT_FINANCE_BASIS_NOTE = 'مبنای نقدی: درآمد در تاریخ وصول (paidAt) و مصرف در تاریخ مصرف (expenseDate)، هر دو فقط تاییدشده. تعهدات خرید در «مانده» لحاظ نمی‌شوند و جداگانه به‌عنوان encumbrance نمایش داده می‌شوند.';
const GOVERNMENT_FINANCE_PER_CLASS_NOTE = 'مصارف تنها زمانی به یک صنف نسبت داده می‌شوند که در ثبت مصرف، صنف مشخص شده باشد. مصارف عمومی مکتب (معاش، کرایه، انرژی) در ردیف «عمومی / بدون صنف» می‌آیند و در بیلانسِ هر صنف کسر نشده‌اند.';

async function computeOpenEncumbrance({ schoolId = '', financialYearId = '', academicYearId = '', classId = '' } = {}) {
  try {
    const analytics = await buildProcurementCommitmentAnalytics({
      schoolId: String(schoolId || ''),
      financialYearId: String(financialYearId || ''),
      academicYearId: String(academicYearId || ''),
      classId: String(classId || '')
    });
    return {
      outstanding: Number(analytics?.summary?.totalOutstandingAmount || 0),
      committed: Number(analytics?.summary?.totalCommittedAmount || 0),
      openCommitmentCount: Number(analytics?.summary?.openCommitmentCount || 0)
    };
  } catch {
    return { outstanding: 0, committed: 0, openCommitmentCount: 0 };
  }
}

function buildGovernmentBasisMeta(source = null) {
  return {
    basis: GOVERNMENT_FINANCE_BASIS,
    basisNote: GOVERNMENT_FINANCE_BASIS_NOTE,
    periodBasis: source && isShamsiAlignedSource(source) ? 'shamsi' : 'gregorian',
    perClassBasis: 'direct_costs_only',
    perClassNote: GOVERNMENT_FINANCE_PER_CLASS_NOTE
  };
}

// Direct expense that could not be attributed to any class — the pool that makes
// a naive per-class balance read as profit (P6). Surfaced so the caveat is
// visible rather than implied.
function summarizeUnallocatedExpense(rows = []) {
  const unscoped = (rows || []).find((item) => !item.classId) || null;
  return {
    unallocatedExpense: Number(Number(unscoped?.totalExpense || 0).toFixed(2)),
    unallocatedExpenseCount: Number(unscoped?.expenseCount || 0)
  };
}

function applyEncumbranceToSummary(summary = {}, encumbrance = null) {
  const outstanding = Number(encumbrance?.outstanding || 0);
  const balance = Number(summary.balance || 0);
  return {
    ...summary,
    encumbranceOutstanding: Number(outstanding.toFixed(2)),
    encumbranceOpenCount: Number(encumbrance?.openCommitmentCount || 0),
    balanceAfterEncumbrance: Number((balance - outstanding).toFixed(2))
  };
}
const { recognizePayments } = require('../utils/financeRevenueRecognition');
const { sumPaidRefunds } = require('../utils/financeRefundRecognition');
const {
  buildPaymentClassScope,
  buildPaymentOrderLinkFilter,
  groupPaymentAmountsByClass
} = require('../utils/paymentClassScope');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeId(value) {
  return String(value?._id || value || '').trim();
}

async function resolveFinancialSource(filters = {}) {
  const financialYearId = normalizeText(filters.financialYearId);
  const academicYearId = normalizeText(filters.academicYearId);
  const schoolId = normalizeText(filters.schoolId);
  let financialYear = null;
  let academicYear = null;

  if (!schoolId) {
    const error = new Error('report_school_scope_required');
    error.statusCode = 400;
    throw error;
  }

  if (financialYearId) {
    financialYear = await FinancialYear.findOne({ _id: financialYearId, schoolId })
      .populate('academicYearId', 'title code startDate endDate schoolId');
    if (financialYear?.academicYearId?._id) {
      academicYear = financialYear.academicYearId;
    }
  }

  if (!academicYear && academicYearId) {
    academicYear = await AcademicYear.findOne({ _id: academicYearId, schoolId })
      .select('title code startDate endDate schoolId');
  }

  if (!financialYear && academicYear?._id) {
    financialYear = await FinancialYear.findOne({ schoolId, academicYearId: academicYear._id, status: { $ne: 'archived' } })
      .sort({ isActive: -1, createdAt: -1 });
  }

  if (!financialYear && !academicYear) {
    const error = new Error('report_financial_scope_required');
    error.statusCode = 400;
    throw error;
  }

  const source = financialYear || academicYear || {};
  return {
    financialYear,
    academicYear,
    schoolId,
    baseStartDate: startOfDay(source.startDate),
    baseEndDate: endOfDay(source.endDate)
  };
}

function intersectRequestedRange(range = null, filters = {}) {
  if (!range?.startDate || !range?.endDate) return range;
  const requestedStart = filters.dateFrom ? startOfDay(new Date(filters.dateFrom)) : null;
  const requestedEnd = filters.dateTo ? endOfDay(new Date(filters.dateTo)) : null;
  const startDate = requestedStart && requestedStart > range.startDate ? requestedStart : range.startDate;
  const endDate = requestedEnd && requestedEnd < range.endDate ? requestedEnd : range.endDate;
  if (startDate > endDate) {
    return { startDate: new Date(0), endDate: new Date(0) };
  }
  return { startDate, endDate };
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

function buildFeeTypeBreakdown(recognizedRows = []) {
  const grouped = new Map();
  for (const row of recognizedRows || []) {
    for (const allocation of row.recognizedAllocations || []) {
      const feeType = normalizeText(allocation.feeType).toLowerCase()
        || normalizeText(row.payment?.feeType).toLowerCase()
        || 'other';
      const current = grouped.get(feeType) || { feeType, amount: 0, allocationCount: 0 };
      current.amount += Number(allocation.amount || 0);
      current.allocationCount += 1;
      grouped.set(feeType, current);
    }
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, amount: Number(item.amount.toFixed(2)) }))
    .sort((left, right) => right.amount - left.amount);
}

async function applyGovernmentPaymentOrderScope(paymentFilter = {}, {
  schoolId = '',
  academicYearId = '',
  classId = ''
} = {}) {
  const orderFilter = { schoolId };
  if (academicYearId) orderFilter.academicYearId = academicYearId;
  if (classId) orderFilter.classId = classId;
  const scopedOrders = await FeeOrder.find(orderFilter).select('_id').lean();
  Object.assign(paymentFilter, buildPaymentOrderLinkFilter(scopedOrders.map((item) => item?._id).filter(Boolean)));
  return paymentFilter;
}

function buildGovernmentPaymentOrderMap(payments = []) {
  const result = new Map();
  for (const payment of payments || []) {
    const candidates = [
      payment?.feeOrderId,
      ...(Array.isArray(payment?.allocations) ? payment.allocations.map((item) => item?.feeOrderId) : [])
    ];
    candidates.forEach((order) => {
      const orderId = normalizeId(order);
      if (orderId && order && typeof order === 'object') result.set(orderId, order);
    });
  }
  return result;
}

function scopeGovernmentPaymentRows(rows = [], orderById = new Map(), {
  schoolId = '',
  academicYearId = '',
  classId = ''
} = {}) {
  return (rows || []).map((row) => {
    const paymentScope = buildPaymentClassScope({
      ...row.payment,
      allocations: row.recognizedAllocations
    }, orderById);
    const recognizedAllocations = paymentScope.allocations
      .filter((allocation) => {
        if (!allocation.order) return false;
        if (schoolId && allocation.schoolId !== String(schoolId)) return false;
        if (academicYearId && allocation.academicYearId !== String(academicYearId)) return false;
        if (classId && allocation.classId !== String(classId)) return false;
        return true;
      })
      .map((allocation) => ({
        feeOrderId: allocation.feeOrderId,
        feeType: allocation.feeType,
        amount: Number(allocation.amount || 0)
      }));
    return {
      ...row,
      recognizedAllocations,
      recognizedAmount: Number(recognizedAllocations
        .reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0)
        .toFixed(2))
    };
  });
}

async function buildQuarterlyGovernmentFinanceReport(filters = {}) {
  const context = await resolveFinancialSource(filters);
  const quarter = Math.max(1, Math.min(4, Number(filters.quarter) || 1));
  const baseRange = context.baseStartDate && context.baseEndDate
    ? getQuarterRange({ startDate: context.baseStartDate, endDate: context.baseEndDate }, quarter)
    : null;
  const range = intersectRequestedRange(baseRange, filters);

  const paymentFilter = { status: 'approved', schoolId: context.schoolId };
  const expenseFilter = { status: 'approved', schoolId: context.schoolId };

  if (filters.classId) {
    expenseFilter.classId = filters.classId;
  }
  if (context.financialYear?._id) {
    expenseFilter.financialYearId = context.financialYear._id;
  }
  if (context.academicYear?._id) {
    expenseFilter.academicYearId = context.academicYear._id;
  }

  Object.assign(paymentFilter, buildRangeMatch('paidAt', range));
  Object.assign(expenseFilter, buildRangeMatch('expenseDate', range));
  await applyGovernmentPaymentOrderScope(paymentFilter, {
    schoolId: context.schoolId,
    academicYearId: normalizeId(context.academicYear),
    classId: normalizeText(filters.classId)
  });

  const [payments, expenseRows, refundSummary] = await Promise.all([
    FeePayment.find(paymentFilter)
      .populate('classId', 'title code gradeLevel section')
      .populate({ path: 'feeOrderId', select: 'classId academicYearId schoolId status', populate: { path: 'classId', select: 'title code gradeLevel section' } })
      .populate({ path: 'allocations.feeOrderId', select: 'classId academicYearId schoolId status', populate: { path: 'classId', select: 'title code gradeLevel section' } })
      .lean(),
    ExpenseEntry.aggregate([
      { $match: expenseFilter },
      {
        $group: {
          _id: '$classId',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]),
    sumPaidRefunds({
      schoolId: context.schoolId,
      classId: filters.classId,
      academicYearId: normalizeId(context.academicYear),
      startAt: range?.startDate,
      endAt: range?.endDate
    })
  ]);
  const paymentOrderMap = buildGovernmentPaymentOrderMap(payments);
  const recognizedPaymentRows = scopeGovernmentPaymentRows(
    await recognizePayments(payments),
    paymentOrderMap,
    {
      schoolId: context.schoolId,
      academicYearId: normalizeId(context.academicYear),
      classId: normalizeText(filters.classId)
    }
  );
  const feeTypeBreakdown = buildFeeTypeBreakdown(recognizedPaymentRows);
  const paymentMap = new Map();
  recognizedPaymentRows.forEach(({ payment: item, recognizedAmount, recognizedAllocations }) => {
    if (recognizedAmount <= 0) return;
    const amountByClass = groupPaymentAmountsByClass(
      { ...item, allocations: recognizedAllocations },
      paymentOrderMap
    );
    amountByClass.forEach(({ classId: allocationClassId, amount }) => {
      if (amount <= 0) return;
      const key = allocationClassId || null;
      const current = paymentMap.get(key) || { _id: key, total: 0, count: 0 };
      current.total += amount;
      current.count += 1;
      paymentMap.set(key, current);
    });
  });
  const paymentRows = [...paymentMap.values()];

  const classMap = await loadClassMap([
    ...paymentRows.map((item) => item._id),
    ...expenseRows.map((item) => item._id)
  ]);
  const rows = mergeGroupedEntries(paymentRows, expenseRows, classMap);
  const totalIncome = rows.reduce((sum, item) => sum + Number(item.totalIncome || 0), 0);
  const totalExpense = rows.reduce((sum, item) => sum + Number(item.totalExpense || 0), 0);
  const totalRefunds = Number(refundSummary?.total || 0);
  const encumbrance = await computeOpenEncumbrance({
    schoolId: context.schoolId,
    financialYearId: normalizeId(context.financialYear),
    academicYearId: normalizeId(context.academicYear),
    classId: normalizeText(filters.classId)
  });

  return {
    range,
    rows,
    summary: applyEncumbranceToSummary({
      totalIncome: Number(totalIncome.toFixed(2)),
      totalRefunds: Number(totalRefunds.toFixed(2)),
      totalExpense: Number(totalExpense.toFixed(2)),
      balance: Number((totalIncome - totalRefunds - totalExpense).toFixed(2)),
      quarter,
      classCount: rows.length,
      paymentCount: recognizedPaymentRows.filter((item) => Number(item.recognizedAmount || 0) > 0).length,
      refundCount: refundSummary?.count || 0,
      expenseCount: rows.reduce((sum, item) => sum + Number(item.expenseCount || 0), 0),
      ...summarizeUnallocatedExpense(rows)
    }, encumbrance),
    feeTypeBreakdown,
    meta: {
      financialYearId: context.financialYear?._id ? String(context.financialYear._id) : '',
      academicYearId: context.academicYear?._id ? String(context.academicYear._id) : '',
      financialYearTitle: context.financialYear?.title || context.academicYear?.title || '',
      quarter,
      ...buildGovernmentBasisMeta({ startDate: context.baseStartDate, endDate: context.baseEndDate })
    }
  };
}

async function buildMonthlyGovernmentFinanceReport(filters = {}) {
  const context = await resolveFinancialSource(filters);
  const month = Math.max(1, Math.min(12, Number(filters.month) || 1));
  const baseRange = context.baseStartDate && context.baseEndDate
    ? getMonthRange({ startDate: context.baseStartDate, endDate: context.baseEndDate }, month)
    : null;
  const range = intersectRequestedRange(baseRange, filters);

  const paymentFilter = { status: 'approved', schoolId: context.schoolId };
  const expenseFilter = { status: 'approved', schoolId: context.schoolId };

  if (filters.classId) {
    expenseFilter.classId = filters.classId;
  }
  if (context.financialYear?._id) {
    expenseFilter.financialYearId = context.financialYear._id;
  }
  if (context.academicYear?._id) {
    expenseFilter.academicYearId = context.academicYear._id;
  }

  Object.assign(paymentFilter, buildRangeMatch('paidAt', range));
  Object.assign(expenseFilter, buildRangeMatch('expenseDate', range));
  await applyGovernmentPaymentOrderScope(paymentFilter, {
    schoolId: context.schoolId,
    academicYearId: normalizeId(context.academicYear),
    classId: normalizeText(filters.classId)
  });

  const [payments, expenseRows, refundSummary] = await Promise.all([
    FeePayment.find(paymentFilter)
      .populate('classId', 'title code gradeLevel section')
      .populate({ path: 'feeOrderId', select: 'classId academicYearId schoolId status', populate: { path: 'classId', select: 'title code gradeLevel section' } })
      .populate({ path: 'allocations.feeOrderId', select: 'classId academicYearId schoolId status', populate: { path: 'classId', select: 'title code gradeLevel section' } })
      .lean(),
    ExpenseEntry.aggregate([
      { $match: expenseFilter },
      {
        $group: {
          _id: '$classId',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]),
    sumPaidRefunds({
      schoolId: context.schoolId,
      classId: filters.classId,
      academicYearId: normalizeId(context.academicYear),
      startAt: range?.startDate,
      endAt: range?.endDate
    })
  ]);
  const paymentOrderMap = buildGovernmentPaymentOrderMap(payments);
  const recognizedPaymentRows = scopeGovernmentPaymentRows(
    await recognizePayments(payments),
    paymentOrderMap,
    {
      schoolId: context.schoolId,
      academicYearId: normalizeId(context.academicYear),
      classId: normalizeText(filters.classId)
    }
  );
  const feeTypeBreakdown = buildFeeTypeBreakdown(recognizedPaymentRows);
  const paymentMap = new Map();
  recognizedPaymentRows.forEach(({ payment: item, recognizedAmount, recognizedAllocations }) => {
    if (recognizedAmount <= 0) return;
    const amountByClass = groupPaymentAmountsByClass(
      { ...item, allocations: recognizedAllocations },
      paymentOrderMap
    );
    amountByClass.forEach(({ classId: allocationClassId, amount }) => {
      if (amount <= 0) return;
      const key = allocationClassId || null;
      const current = paymentMap.get(key) || { _id: key, total: 0, count: 0 };
      current.total += amount;
      current.count += 1;
      paymentMap.set(key, current);
    });
  });
  const paymentRows = [...paymentMap.values()];

  const classMap = await loadClassMap([
    ...paymentRows.map((item) => item._id),
    ...expenseRows.map((item) => item._id)
  ]);
  const rows = mergeGroupedEntries(paymentRows, expenseRows, classMap);
  const totalIncome = rows.reduce((sum, item) => sum + Number(item.totalIncome || 0), 0);
  const totalExpense = rows.reduce((sum, item) => sum + Number(item.totalExpense || 0), 0);
  const totalRefunds = Number(refundSummary?.total || 0);
  const encumbrance = await computeOpenEncumbrance({
    schoolId: context.schoolId,
    financialYearId: normalizeId(context.financialYear),
    academicYearId: normalizeId(context.academicYear),
    classId: normalizeText(filters.classId)
  });

  return {
    range,
    rows,
    summary: applyEncumbranceToSummary({
      totalIncome: Number(totalIncome.toFixed(2)),
      totalRefunds: Number(totalRefunds.toFixed(2)),
      totalExpense: Number(totalExpense.toFixed(2)),
      balance: Number((totalIncome - totalRefunds - totalExpense).toFixed(2)),
      month,
      classCount: rows.length,
      paymentCount: recognizedPaymentRows.filter((item) => Number(item.recognizedAmount || 0) > 0).length,
      refundCount: refundSummary?.count || 0,
      expenseCount: rows.reduce((sum, item) => sum + Number(item.expenseCount || 0), 0),
      ...summarizeUnallocatedExpense(rows)
    }, encumbrance),
    feeTypeBreakdown,
    meta: {
      financialYearId: context.financialYear?._id ? String(context.financialYear._id) : '',
      academicYearId: context.academicYear?._id ? String(context.academicYear._id) : '',
      financialYearTitle: context.financialYear?.title || context.academicYear?.title || '',
      month,
      ...buildGovernmentBasisMeta({ startDate: context.baseStartDate, endDate: context.baseEndDate })
    }
  };
}

async function buildAnnualGovernmentFinanceReport(filters = {}) {
  const context = await resolveFinancialSource(filters);
  const source = context.baseStartDate && context.baseEndDate
    ? intersectRequestedRange({ startDate: context.baseStartDate, endDate: context.baseEndDate }, filters)
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
      totalRefunds: quarterly.summary.totalRefunds,
      totalExpense: quarterly.summary.totalExpense,
      balance: quarterly.summary.balance,
      classCount: quarterly.summary.classCount
    });
  }

  const totalIncome = quarterItems.reduce((sum, item) => sum + Number(item.totalIncome || 0), 0);
  const totalRefunds = quarterItems.reduce((sum, item) => sum + Number(item.totalRefunds || 0), 0);
  const totalExpense = quarterItems.reduce((sum, item) => sum + Number(item.totalExpense || 0), 0);
  const netProfit = Number((totalIncome - totalRefunds - totalExpense).toFixed(2));
  const encumbrance = await computeOpenEncumbrance({
    schoolId: context.schoolId,
    financialYearId: normalizeId(context.financialYear),
    academicYearId: normalizeId(context.academicYear),
    classId: normalizeText(filters.classId)
  });

  return {
    range: source,
    rows: quarterItems,
    summary: {
      totalIncome: Number(totalIncome.toFixed(2)),
      totalRefunds: Number(totalRefunds.toFixed(2)),
      totalExpense: Number(totalExpense.toFixed(2)),
      netProfit,
      quarterCount: quarterItems.length,
      encumbranceOutstanding: Number(Number(encumbrance.outstanding || 0).toFixed(2)),
      encumbranceOpenCount: Number(encumbrance.openCommitmentCount || 0),
      balanceAfterEncumbrance: Number((netProfit - Number(encumbrance.outstanding || 0)).toFixed(2))
    },
    meta: {
      financialYearId: context.financialYear?._id ? String(context.financialYear._id) : '',
      academicYearId: context.academicYear?._id ? String(context.academicYear._id) : '',
      financialYearTitle: context.financialYear?.title || context.academicYear?.title || '',
      ...buildGovernmentBasisMeta(source)
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
  const paymentFilter = { status: 'approved', schoolId: context.schoolId };
  const expenseFilter = { status: 'approved', schoolId: context.schoolId };
  const classId = normalizeText(filters.classId);

  if (financialYear?._id) {
    expenseFilter.financialYearId = financialYear._id;
  }
  if (academicYear?._id) {
    expenseFilter.academicYearId = academicYear._id;
  }
  if (classId) {
    expenseFilter.classId = classId;
  }

  const reportRange = intersectRequestedRange({
    startDate: context.baseStartDate,
    endDate: context.baseEndDate
  }, filters);
  Object.assign(paymentFilter, buildRangeMatch('paidAt', reportRange));
  Object.assign(expenseFilter, buildRangeMatch('expenseDate', reportRange));
  await applyGovernmentPaymentOrderScope(paymentFilter, {
    schoolId: context.schoolId,
    academicYearId: normalizeId(academicYear),
    classId
  });

  const [paymentRows, expenseSummaryRows, expenseCategoryRows, categoryRegistry, treasuryAnalytics] = await Promise.all([
    FeePayment.find(paymentFilter)
      .select('amount feeOrderId allocations')
      .populate('feeOrderId', 'classId academicYearId schoolId status')
      .populate('allocations.feeOrderId', 'classId academicYearId schoolId status')
      .lean(),
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

  const recognizedPaymentRows = scopeGovernmentPaymentRows(
    await recognizePayments(paymentRows),
    buildGovernmentPaymentOrderMap(paymentRows),
    {
      schoolId: context.schoolId,
      academicYearId: normalizeId(academicYear),
      classId
    }
  );
  const feeTypeBreakdown = buildFeeTypeBreakdown(recognizedPaymentRows);
  const actualIncome = recognizedPaymentRows.reduce((sum, row) => sum + Number(row.recognizedAmount || 0), 0);
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
      categoryLabel: registryItem?.label || budget?.label || categoryKey || 'بدون دسته‌بندی',
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
      title: 'بودجه مصرفات بیشتر از حد تعیین‌شده شد',
      detail: `مصارف تاییدشده ${summary.expenseVariance.toFixed(2)} افغانی از بودجه سالانه بیشتر است.`
    });
  }
  if (summary.annualIncomeTarget > 0 && summary.actualIncome < summary.annualIncomeTarget) {
    alerts.push({
      key: 'income_under_target',
      tone: 'copper',
      title: 'هدف درآمد تکمیل نشده است',
      detail: `درآمد جمع‌آوری‌شده ${(summary.annualIncomeTarget - summary.actualIncome).toFixed(2)} افغانی کمتر از هدف تعیین‌شده است.`
    });
  }
  if (summary.treasuryReserveTarget > 0 && summary.treasuryReserveBalance < summary.treasuryReserveTarget) {
    alerts.push({
      key: 'treasury_reserve_gap',
      tone: 'copper',
      title: 'ذخیره خزانه کمتر از هدف است',
      detail: `مانده خزانه ${(summary.treasuryReserveTarget - summary.treasuryReserveBalance).toFixed(2)} افغانی کمتر از هدف ذخیره تعیین‌شده است.`
    });
  }
  if (summary.overBudgetCategoryCount > 0 || summary.unbudgetedCategoryCount > 0) {
    alerts.push({
      key: 'category_budget_attention',
      tone: 'rose',
      title: 'بودجه دسته‌بندی‌ها نیاز به بررسی دارد',
      detail: `${summary.overBudgetCategoryCount} دسته‌بندی از حد بودجه گذشته و ${summary.unbudgetedCategoryCount} دسته‌بندی مصرف بدون بودجه تعریف‌شده دارد.`
    });
  }

  return {
    meta: {
      financialYearId: financialYear?._id ? String(financialYear._id) : '',
      academicYearId: academicYear?._id ? String(academicYear._id) : '',
      financialYearTitle: financialYear?.title || academicYear?.title || '',
      budgetNote: budgetTargets.note || '',
      ...buildGovernmentBasisMeta({ startDate: context.baseStartDate, endDate: context.baseEndDate })
    },
    summary,
    feeTypeBreakdown,
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
  buildMonthlyGovernmentFinanceReport,
  buildQuarterlyGovernmentFinanceReport,
  __paymentClassScopeTestUtils: Object.freeze({
    scopeGovernmentPaymentRows
  })
};
