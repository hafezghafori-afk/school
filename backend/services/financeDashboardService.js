const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const ExpenseEntry = require('../models/ExpenseEntry');
const FinanceTreasuryTransaction = require('../models/FinanceTreasuryTransaction');
const { recognizePayments } = require('../utils/financeRevenueRecognition');
const { formatFinanceCode } = require('../utils/latinFinanceCode');

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeText(value = '') {
  return String(value?._id || value || '').trim();
}

function roundMoney(value = 0) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function safePercent(value = 0, total = 0) {
  const denominator = Number(total) || 0;
  if (denominator <= 0) return 0;
  return Math.round(((Number(value) || 0) / denominator) * 10000) / 100;
}

function asDate(value, fallback = null) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function normalizeDateRange({ from = '', to = '', asOf = null } = {}) {
  const now = asDate(asOf, new Date());
  const fallbackStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const fallbackEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const startAt = asDate(from, fallbackStart);
  const endAt = asDate(to, fallbackEnd);
  startAt.setHours(0, 0, 0, 0);
  endAt.setHours(23, 59, 59, 999);
  if (endAt.getTime() < startAt.getTime()) {
    const error = new Error('finance_dashboard_range_invalid');
    error.statusCode = 400;
    throw error;
  }
  return { startAt, endAt, asOf: endAt };
}

function buildScopeFilter({ schoolId = '', academicYearId = '', classId = '', schoolClassIds = [] } = {}) {
  const clauses = [];
  const normalizedSchoolId = normalizeText(schoolId);
  const normalizedClassId = normalizeText(classId);
  const normalizedAcademicYearId = normalizeText(academicYearId);
  const normalizedSchoolClassIds = (Array.isArray(schoolClassIds) ? schoolClassIds : [])
    .map(normalizeText)
    .filter(Boolean);

  if (normalizedSchoolId) {
    clauses.push({
      $or: [
        { schoolId: normalizedSchoolId },
        ...(normalizedSchoolClassIds.length ? [{ classId: { $in: normalizedSchoolClassIds } }] : [])
      ]
    });
  }
  if (normalizedAcademicYearId) clauses.push({ academicYearId: normalizedAcademicYearId });
  if (normalizedClassId) clauses.push({ classId: normalizedClassId });
  if (!clauses.length) return {};
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function mergeFilter(base = {}, additions = {}) {
  const clauses = [];
  if (Object.keys(base).length) clauses.push(base);
  if (Object.keys(additions).length) clauses.push(additions);
  if (!clauses.length) return {};
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function adjustmentTotals(orders = []) {
  return orders.reduce((totals, order) => {
    (Array.isArray(order?.adjustments) ? order.adjustments : []).forEach((item) => {
      const amount = roundMoney(item?.amount);
      if (String(item?.type || '').trim() === 'penalty') totals.penalty += amount;
      else totals.relief += amount;
    });
    return totals;
  }, { relief: 0, penalty: 0 });
}

function paymentStudentName(payment = {}) {
  return String(payment?.studentId?.fullName || payment?.student?.name || 'شاگرد').trim();
}

function orderStudentName(order = {}) {
  return String(order?.studentId?.fullName || order?.student?.name || 'شاگرد').trim();
}

function classTitle(item = {}) {
  return String(item?.classId?.title || 'بدون صنف').trim();
}

function buildAging(orders = [], asOf = new Date()) {
  const values = { current: 0, d1_30: 0, d31_60: 0, d61_plus: 0 };
  orders.forEach((order) => {
    const outstanding = roundMoney(order?.outstandingAmount);
    if (outstanding <= 0) return;
    const dueDate = asDate(order?.dueDate || order?.issuedAt, asOf);
    const lateDays = Math.max(0, Math.floor((asOf.getTime() - dueDate.getTime()) / DAY_MS));
    if (lateDays <= 0) values.current += outstanding;
    else if (lateDays <= 30) values.d1_30 += outstanding;
    else if (lateDays <= 60) values.d31_60 += outstanding;
    else values.d61_plus += outstanding;
  });
  const rows = [
    { key: 'current', label: 'جاری', value: roundMoney(values.current) },
    { key: 'd1_30', label: '۱ تا ۳۰ روز', value: roundMoney(values.d1_30) },
    { key: 'd31_60', label: '۳۱ تا ۶۰ روز', value: roundMoney(values.d31_60) },
    { key: 'd61_plus', label: 'بیشتر از ۶۰ روز', value: roundMoney(values.d61_plus) }
  ];
  const total = roundMoney(rows.reduce((sum, row) => sum + row.value, 0));
  return rows.map((row) => ({ ...row, percent: safePercent(row.value, total) }));
}

function buildPaymentMethods(payments = []) {
  const labels = {
    cash: 'نقدی',
    bank_transfer: 'انتقال بانکی',
    hawala: 'حواله',
    manual: 'ثبت دستی',
    gateway: 'درگاه پرداخت',
    other: 'سایر'
  };
  const map = new Map();
  payments.forEach((payment) => {
    const key = String(payment?.paymentMethod || 'other').trim() || 'other';
    const current = map.get(key) || { key, label: labels[key] || key, value: 0, count: 0 };
    current.value += Number(payment?.amount || 0);
    current.count += 1;
    map.set(key, current);
  });
  const total = Array.from(map.values()).reduce((sum, row) => sum + row.value, 0);
  return Array.from(map.values())
    .map((row) => ({ ...row, value: roundMoney(row.value), percent: safePercent(row.value, total) }))
    .sort((left, right) => right.value - left.value);
}

function localDateKey(value) {
  const date = asDate(value, null);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildDailySeries(payments = [], expenses = []) {
  const map = new Map();
  const ensure = (value) => {
    const key = localDateKey(value);
    if (!key) return null;
    const row = map.get(key) || { date: key, income: 0, expense: 0, net: 0 };
    map.set(key, row);
    return row;
  };
  payments.forEach((item) => {
    const row = ensure(item?.paidAt || item?.createdAt);
    if (row) row.income += Number(item?.amount || 0);
  });
  expenses.forEach((item) => {
    const row = ensure(item?.expenseDate || item?.createdAt);
    if (row) row.expense += Number(item?.amount || 0);
  });
  return Array.from(map.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row) => ({
      ...row,
      income: roundMoney(row.income),
      expense: roundMoney(row.expense),
      net: roundMoney(row.income - row.expense)
    }));
}

function buildClassRows(orders = []) {
  const map = new Map();
  orders.forEach((order) => {
    const id = normalizeText(order?.classId) || 'unassigned';
    const row = map.get(id) || {
      classId: id === 'unassigned' ? '' : id,
      title: classTitle(order),
      due: 0,
      paid: 0,
      outstanding: 0,
      orderCount: 0
    };
    row.due += Number(order?.amountDue || 0);
    row.paid += Number(order?.amountPaid || 0);
    row.outstanding += Number(order?.outstandingAmount || 0);
    row.orderCount += 1;
    map.set(id, row);
  });
  return Array.from(map.values())
    .map((row) => ({
      ...row,
      due: roundMoney(row.due),
      paid: roundMoney(row.paid),
      outstanding: roundMoney(row.outstanding),
      collectionRate: safePercent(row.paid, row.due)
    }))
    .sort((left, right) => right.outstanding - left.outstanding);
}

function buildTopDebtors(orders = [], limit = 10, asOf = new Date()) {
  const map = new Map();
  orders.forEach((order) => {
    const outstanding = roundMoney(order?.outstandingAmount);
    if (outstanding <= 0) return;
    const studentId = normalizeText(order?.studentId || order?.student) || orderStudentName(order);
    const row = map.get(studentId) || {
      studentId,
      studentCoreId: normalizeText(order?.studentId),
      studentUserId: normalizeText(order?.student),
      name: orderStudentName(order),
      classTitle: classTitle(order),
      amount: 0,
      orderCount: 0,
      overdueOrderCount: 0,
      maxLateDays: 0
    };
    row.amount += outstanding;
    row.orderCount += 1;
    const dueDate = asDate(order?.dueDate || order?.issuedAt, asOf);
    const lateDays = Math.max(0, Math.floor((asOf.getTime() - dueDate.getTime()) / DAY_MS));
    if (lateDays > 0) row.overdueOrderCount += 1;
    row.maxLateDays = Math.max(row.maxLateDays, lateDays);
    map.set(studentId, row);
  });
  return Array.from(map.values())
    .map((row) => ({
      ...row,
      amount: roundMoney(row.amount),
      risk: row.maxLateDays >= 60 ? 'critical' : row.maxLateDays >= 30 ? 'high' : row.maxLateDays > 0 ? 'watch' : 'current'
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, limit);
}

async function buildFinanceDashboardOverview(options = {}) {
  const { startAt, endAt, asOf } = normalizeDateRange(options);
  const scope = buildScopeFilter(options);
  const orderStandingFilter = mergeFilter(scope, {
    status: { $ne: 'void' },
    issuedAt: { $lte: endAt }
  });
  const orderPeriodFilter = mergeFilter(scope, {
    status: { $ne: 'void' },
    issuedAt: { $gte: startAt, $lte: endAt }
  });
  const paymentPeriodFilter = mergeFilter(scope, {
    paidAt: { $gte: startAt, $lte: endAt }
  });
  const expensePeriodFilter = mergeFilter(scope, {
    expenseDate: { $gte: startAt, $lte: endAt }
  });
  const treasuryPeriodFilter = mergeFilter(scope, {
    status: 'posted',
    transactionDate: { $gte: startAt, $lte: endAt }
  });

  const [standingOrders, periodOrders, approvedRaw, pendingRaw, approvedExpenses, pendingExpenses, treasuryRows] = await Promise.all([
    FeeOrder.find(orderStandingFilter)
      .select('orderNumber title student studentId classId amountOriginal amountDue amountPaid outstandingAmount adjustments status issuedAt dueDate periodLabel')
      .populate('student', 'name')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .lean(),
    FeeOrder.find(orderPeriodFilter)
      .select('orderNumber title student studentId classId amountOriginal amountDue amountPaid outstandingAmount adjustments status issuedAt dueDate periodLabel')
      .populate('student', 'name')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .sort({ issuedAt: -1 })
      .lean(),
    FeePayment.find(mergeFilter(paymentPeriodFilter, { status: 'approved' }))
      .select('paymentNumber student studentId classId amount paymentMethod allocations feeOrderId paidAt status')
      .populate('student', 'name')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .sort({ paidAt: -1 })
      .lean(),
    FeePayment.find(mergeFilter(paymentPeriodFilter, { status: 'pending' }))
      .select('paymentNumber student studentId classId amount paymentMethod allocations feeOrderId paidAt status approvalStage')
      .populate('student', 'name')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .sort({ paidAt: -1 })
      .lean(),
    ExpenseEntry.find(mergeFilter(expensePeriodFilter, { status: 'approved' }))
      .select('category subCategory amount expenseDate paymentMethod vendorName referenceNo treasuryAccountId status')
      .sort({ expenseDate: -1 })
      .lean(),
    ExpenseEntry.find(mergeFilter(expensePeriodFilter, { status: { $in: ['draft', 'pending_review'] } }))
      .select('category subCategory amount expenseDate vendorName referenceNo treasuryAccountId status approvalStage')
      .sort({ expenseDate: -1 })
      .lean(),
    FinanceTreasuryTransaction.find(treasuryPeriodFilter)
      .select('transactionType direction amount transactionDate sourceType referenceNo status')
      .sort({ transactionDate: -1 })
      .lean()
  ]);

  const [approvedRecognition, pendingRecognition] = await Promise.all([
    recognizePayments(approvedRaw),
    recognizePayments(pendingRaw)
  ]);
  const approvedPayments = approvedRecognition
    .filter((row) => Number(row?.recognizedAmount || 0) > 0)
    .map((row) => ({ ...row.payment, amount: roundMoney(row.recognizedAmount) }));
  const pendingPayments = pendingRecognition
    .filter((row) => Number(row?.recognizedAmount || 0) > 0)
    .map((row) => ({ ...row.payment, amount: roundMoney(row.recognizedAmount) }));

  const standingAdjustments = adjustmentTotals(standingOrders);
  const periodAdjustments = adjustmentTotals(periodOrders);
  const standingDue = roundMoney(standingOrders.reduce((sum, item) => sum + Number(item?.amountDue || 0), 0));
  const standingPaid = roundMoney(standingOrders.reduce((sum, item) => sum + Number(item?.amountPaid || 0), 0));
  const standingOutstanding = roundMoney(standingOrders.reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0));
  const periodGross = roundMoney(periodOrders.reduce((sum, item) => sum + Number(item?.amountOriginal || 0), 0));
  const periodBilled = roundMoney(periodOrders.reduce((sum, item) => sum + Number(item?.amountDue || 0), 0));
  const approvedIncome = roundMoney(approvedPayments.reduce((sum, item) => sum + Number(item?.amount || 0), 0));
  const pendingIncome = roundMoney(pendingPayments.reduce((sum, item) => sum + Number(item?.amount || 0), 0));
  const approvedExpense = roundMoney(approvedExpenses.reduce((sum, item) => sum + Number(item?.amount || 0), 0));
  const pendingExpense = roundMoney(pendingExpenses.reduce((sum, item) => sum + Number(item?.amount || 0), 0));
  const treasuryInflow = roundMoney(treasuryRows.filter((item) => item?.direction === 'in').reduce((sum, item) => sum + Number(item?.amount || 0), 0));
  const treasuryOutflow = roundMoney(treasuryRows.filter((item) => item?.direction === 'out').reduce((sum, item) => sum + Number(item?.amount || 0), 0));
  const overdueOrders = standingOrders.filter((item) => {
    const dueDate = asDate(item?.dueDate || item?.issuedAt, asOf);
    return Number(item?.outstandingAmount || 0) > 0 && dueDate.getTime() < asOf.getTime();
  });
  const distinctStudents = new Set(periodOrders.map((item) => normalizeText(item?.studentId || item?.student)).filter(Boolean));
  const recentLimit = Math.max(1, Math.min(10, Number(options?.recentLimit || options?.limit || 10) || 10));
  const debtorLimit = Math.max(10, Math.min(500, Number(options?.debtorLimit || 100) || 100));

  const obligationDistribution = [
    { key: 'paid', label: 'پرداخت‌شده', value: standingPaid },
    { key: 'outstanding', label: 'باقیات', value: standingOutstanding },
    { key: 'relief', label: 'تخفیف و معافیت', value: roundMoney(standingAdjustments.relief) },
    { key: 'penalty', label: 'جریمه', value: roundMoney(standingAdjustments.penalty) }
  ];
  const obligationTotal = obligationDistribution.reduce((sum, row) => sum + row.value, 0);
  const incomeExpenseDistribution = [
    { key: 'income', label: 'عواید تاییدشده', value: approvedIncome },
    { key: 'expense', label: 'مصارف تاییدشده', value: approvedExpense }
  ];
  const incomeExpenseTotal = incomeExpenseDistribution.reduce((sum, row) => sum + row.value, 0);

  return {
    generatedAt: new Date().toISOString(),
    period: {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      basis: 'cash_and_accrual'
    },
    kpis: {
      issuedBills: { count: periodOrders.length, studentCount: distinctStudents.size, amount: periodBilled, grossAmount: periodGross },
      approvedRevenue: { count: approvedPayments.length, amount: approvedIncome },
      outstanding: { count: standingOrders.filter((item) => Number(item?.outstandingAmount || 0) > 0).length, amount: standingOutstanding },
      reliefs: { count: periodOrders.filter((item) => (item?.adjustments || []).some((adjustment) => adjustment?.type !== 'penalty')).length, amount: roundMoney(periodAdjustments.relief) },
      expenses: { count: approvedExpenses.length, amount: approvedExpense },
      netCash: { amount: roundMoney(approvedIncome - approvedExpense), treasuryAmount: roundMoney(treasuryInflow - treasuryOutflow) },
      pendingReceipts: { count: pendingPayments.length, amount: pendingIncome },
      overdue: { count: overdueOrders.length, amount: roundMoney(overdueOrders.reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0)) },
      pendingExpenses: { count: pendingExpenses.length, amount: pendingExpense },
      standing: { due: standingDue, paid: standingPaid, outstanding: standingOutstanding },
      treasury: { inflow: treasuryInflow, outflow: treasuryOutflow, net: roundMoney(treasuryInflow - treasuryOutflow) },
      rates: {
        collection: safePercent(standingPaid, standingDue),
        periodCollection: safePercent(approvedIncome, periodBilled),
        outstanding: safePercent(standingOutstanding, standingDue),
        relief: safePercent(periodAdjustments.relief, periodGross),
        expenseToIncome: safePercent(approvedExpense, approvedIncome)
      }
    },
    distributions: {
      obligations: obligationDistribution.map((row) => ({ ...row, percent: safePercent(row.value, obligationTotal) })),
      incomeExpense: incomeExpenseDistribution.map((row) => ({ ...row, percent: safePercent(row.value, incomeExpenseTotal) })),
      paymentMethods: buildPaymentMethods(approvedPayments),
      aging: buildAging(standingOrders, asOf)
    },
    series: {
      daily: buildDailySeries(approvedPayments, approvedExpenses)
    },
    byClass: buildClassRows(standingOrders),
    topDebtors: buildTopDebtors(standingOrders, debtorLimit, asOf),
    recent: {
      bills: periodOrders.slice(0, recentLimit).map((item) => ({
        id: normalizeText(item?._id),
        number: formatFinanceCode(item?.orderNumber || ''),
        title: item?.title || item?.periodLabel || 'بل مالی',
        studentName: orderStudentName(item),
        classTitle: classTitle(item),
        amount: roundMoney(item?.amountDue),
        outstanding: roundMoney(item?.outstandingAmount),
        status: item?.status || '',
        occurredAt: item?.issuedAt || null
      })),
      payments: approvedPayments.slice(0, recentLimit).map((item) => ({
        id: normalizeText(item?._id),
        number: formatFinanceCode(item?.paymentNumber || ''),
        studentName: paymentStudentName(item),
        classTitle: classTitle(item),
        amount: roundMoney(item?.amount),
        paymentMethod: item?.paymentMethod || '',
        status: item?.status || '',
        occurredAt: item?.paidAt || null
      })),
      expenses: approvedExpenses.slice(0, recentLimit).map((item) => ({
        id: normalizeText(item?._id),
        title: item?.subCategory || item?.category || 'مصرف',
        vendorName: item?.vendorName || '',
        referenceNo: formatFinanceCode(item?.referenceNo || ''),
        amount: roundMoney(item?.amount),
        status: item?.status || '',
        occurredAt: item?.expenseDate || null
      }))
    }
  };
}

module.exports = {
  buildFinanceDashboardOverview,
  normalizeDateRange,
  safePercent
};
