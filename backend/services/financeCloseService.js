require('../models/StudentMembership');
require('../models/FeeOrder');
require('../models/FeePayment');
require('../models/FinanceRelief');
require('../models/SchoolClass');
require('../models/AcademicYear');

const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceRelief = require('../models/FinanceRelief');
const { buildFinanceAnomalyReport } = require('./financeAnomalyService');
const {
  mergeFinanceAnomalyCases,
  buildFinanceAnomalyWorkflowSummary
} = require('../utils/financeAnomalyWorkflow');

const CURRENT_MEMBERSHIP_STATUSES = ['active', 'pending', 'suspended', 'transferred_in'];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function roundMoney(value) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function normalizeNullableId(value) {
  if (!value) return '';
  return String(value);
}

function toMonthDateRange(monthKey = '') {
  const value = String(monthKey || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error('finance_month_key_invalid');
  }
  const [year, month] = value.split('-').map((entry) => Number(entry));
  const startAt = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endAt = new Date(year, month, 0, 23, 59, 59, 999);
  return { monthKey: value, startAt, endAt };
}

function dateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildReliefActiveFilter(endAt) {
  return {
    status: 'active',
    $and: [
      {
        $or: [
          { startDate: null },
          { startDate: { $exists: false } },
          { startDate: { $lte: endAt } }
        ]
      },
      {
        $or: [
          { endDate: null },
          { endDate: { $exists: false } },
          { endDate: { $gte: endAt } }
        ]
      }
    ]
  };
}

function buildClassTitle(item = {}) {
  return normalizeText(item?.classId?.title || item?.schoolClass?.title || '') || 'بدون صنف';
}

function buildClassSnapshot({ orders = [], approvedPayments = [], pendingPayments = [], reliefs = [] } = {}) {
  const classMap = new Map();

  const ensureClassRow = (classId = '', fallbackTitle = 'بدون صنف') => {
    const key = normalizeNullableId(classId) || 'unassigned';
    const current = classMap.get(key) || {
      classId: key === 'unassigned' ? '' : key,
      title: fallbackTitle,
      totalDue: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      orderCount: 0,
      paymentCount: 0,
      approvedPaymentAmount: 0,
      pendingPaymentCount: 0,
      pendingPaymentAmount: 0,
      reliefCount: 0,
      fixedReliefAmount: 0,
      fullReliefCount: 0
    };
    if (!current.title && fallbackTitle) current.title = fallbackTitle;
    classMap.set(key, current);
    return current;
  };

  orders.forEach((order) => {
    const row = ensureClassRow(order?.classId?._id || order?.classId, buildClassTitle(order));
    row.totalDue = roundMoney(row.totalDue + Number(order?.amountDue || 0));
    row.totalPaid = roundMoney(row.totalPaid + Number(order?.amountPaid || 0));
    row.totalOutstanding = roundMoney(row.totalOutstanding + Number(order?.outstandingAmount || 0));
    row.orderCount += 1;
  });

  approvedPayments.forEach((payment) => {
    const row = ensureClassRow(payment?.classId?._id || payment?.classId, buildClassTitle(payment));
    row.paymentCount += 1;
    row.approvedPaymentAmount = roundMoney(row.approvedPaymentAmount + Number(payment?.amount || 0));
  });

  pendingPayments.forEach((payment) => {
    const row = ensureClassRow(payment?.classId?._id || payment?.classId, buildClassTitle(payment));
    row.pendingPaymentCount += 1;
    row.pendingPaymentAmount = roundMoney(row.pendingPaymentAmount + Number(payment?.amount || 0));
  });

  reliefs.forEach((relief) => {
    const row = ensureClassRow(relief?.classId?._id || relief?.classId, buildClassTitle(relief));
    row.reliefCount += 1;
    if (normalizeText(relief?.coverageMode) === 'fixed') {
      row.fixedReliefAmount = roundMoney(row.fixedReliefAmount + Number(relief?.amount || 0));
    }
    if (normalizeText(relief?.coverageMode) === 'full') {
      row.fullReliefCount += 1;
    }
  });

  return Array.from(classMap.values())
    .sort((left, right) => {
      const outstandingDelta = Number(right.totalOutstanding || 0) - Number(left.totalOutstanding || 0);
      if (outstandingDelta !== 0) return outstandingDelta;
      return Number(right.totalDue || 0) - Number(left.totalDue || 0);
    })
    .slice(0, 16);
}

function buildAgingSnapshot(orders = [], asOf = new Date()) {
  const now = new Date(asOf);
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_plus: 0 };
  const rows = [];

  orders.forEach((order) => {
    const remaining = roundMoney(order?.outstandingAmount);
    if (remaining <= 0) return;
    const dueDate = new Date(order?.dueDate || order?.issuedAt || now);
    const lateDays = Number.isNaN(dueDate.getTime())
      ? 0
      : Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)));

    if (lateDays <= 0) buckets.current = roundMoney(buckets.current + remaining);
    else if (lateDays <= 30) buckets.d1_30 = roundMoney(buckets.d1_30 + remaining);
    else if (lateDays <= 60) buckets.d31_60 = roundMoney(buckets.d31_60 + remaining);
    else buckets.d61_plus = roundMoney(buckets.d61_plus + remaining);

    rows.push({
      orderId: normalizeNullableId(order?._id),
      orderNumber: normalizeText(order?.orderNumber),
      studentName: normalizeText(order?.studentId?.fullName || order?.student?.name) || 'متعلم',
      classTitle: buildClassTitle(order),
      dueDate: order?.dueDate || null,
      lateDays,
      remaining
    });
  });

  return {
    buckets,
    totalRemaining: roundMoney(rows.reduce((sum, row) => sum + Number(row.remaining || 0), 0)),
    rows: rows
      .sort((left, right) => Number(right.remaining || 0) - Number(left.remaining || 0))
      .slice(0, 30)
  };
}

function buildCashflowItems(items = []) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = dateKey(item?.paidAt || item?.createdAt);
    if (!key) return;
    const current = map.get(key) || { date: key, total: 0, count: 0 };
    current.total = roundMoney(current.total + Number(item?.amount || 0));
    current.count += 1;
    map.set(key, current);
  });
  return Array.from(map.values()).sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

function buildFinanceMonthCloseReadiness({ totals = {}, anomalies = {} } = {}) {
  const blockingIssues = [];
  const warningIssues = [];

  const pendingPaymentCount = Number(totals?.pendingPaymentCount || 0) || 0;
  const pendingPaymentAmount = roundMoney(totals?.pendingPaymentAmount || 0);
  if (pendingPaymentCount > 0) {
    blockingIssues.push({
      code: 'pending_payments',
      label: 'پرداخت‌های در انتظار تایید',
      count: pendingPaymentCount,
      amount: pendingPaymentAmount
    });
  }

  const actionRequiredAnomalies = Number(anomalies?.summary?.actionRequired || 0) || 0;
  if (actionRequiredAnomalies > 0) {
    blockingIssues.push({
      code: 'anomalies_action_required',
      label: 'ناهنجاری‌های نیازمند اقدام',
      count: actionRequiredAnomalies
    });
  }

  const overdueOrders = Number(totals?.overdueOrders || 0) || 0;
  if (overdueOrders > 0) {
    warningIssues.push({
      code: 'overdue_orders',
      label: 'بل‌های معوق فعال',
      count: overdueOrders
    });
  }

  const outstandingAmount = roundMoney(totals?.standingOutstandingAmount || 0);
  if (outstandingAmount > 0) {
    warningIssues.push({
      code: 'standing_outstanding_balance',
      label: 'مانده ایستای پایان ماه',
      amount: outstandingAmount
    });
  }

  return {
    readyToApprove: blockingIssues.length === 0,
    blockingIssues,
    warningIssues
  };
}

async function buildFinanceMonthCloseSnapshot(monthKey = '', options = {}) {
  const { startAt, endAt } = toMonthDateRange(monthKey);
  const anomalyCases = Array.isArray(options?.anomalyCases) ? options.anomalyCases : [];

  const [ordersBeforeClose, ordersIssuedInMonth, approvedPayments, pendingPayments, reliefs, activeMemberships, anomalyReport] = await Promise.all([
    FeeOrder.find({
      status: { $ne: 'void' },
      issuedAt: { $lte: endAt }
    })
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ dueDate: 1, createdAt: -1 })
      .lean(),
    FeeOrder.find({
      status: { $ne: 'void' },
      issuedAt: { $gte: startAt, $lte: endAt }
    }).lean(),
    FeePayment.find({
      status: 'approved',
      paidAt: { $gte: startAt, $lte: endAt }
    })
      .populate('classId', 'title code gradeLevel section')
      .lean(),
    FeePayment.find({
      status: 'pending',
      paidAt: { $gte: startAt, $lte: endAt }
    })
      .populate('classId', 'title code gradeLevel section')
      .lean(),
    FinanceRelief.find(buildReliefActiveFilter(endAt))
      .populate('classId', 'title code gradeLevel section')
      .lean(),
    StudentMembership.countDocuments({
      joinedAt: { $lte: endAt },
      $or: [
        { endedAt: null },
        { endedAt: { $exists: false } },
        { endedAt: { $gt: endAt } }
      ],
      status: { $in: CURRENT_MEMBERSHIP_STATUSES }
    }),
    buildFinanceAnomalyReport({ asOf: endAt, limit: 30 })
  ]);
  const mergedAnomalies = mergeFinanceAnomalyCases(anomalyReport?.items || [], anomalyCases, { asOf: endAt });
  const anomalySummary = {
    ...(anomalyReport?.summary || { total: 0, critical: 0, warning: 0, info: 0, actionRequired: 0, byType: {} }),
    byWorkflow: buildFinanceAnomalyWorkflowSummary(mergedAnomalies),
    actionRequired: mergedAnomalies.filter((item) => item?.actionRequired).length
  };

  const outstandingOrders = ordersBeforeClose.filter((item) => roundMoney(item?.outstandingAmount) > 0);
  const overdueOrders = outstandingOrders.filter((item) => {
    const dueDate = new Date(item?.dueDate || item?.issuedAt || endAt);
    return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < endAt.getTime();
  });
  const reliefSummary = reliefs.reduce((summary, item) => {
    summary.activeReliefs += 1;
    const mode = normalizeText(item?.coverageMode);
    if (mode === 'fixed') {
      summary.fixedReliefAmount = roundMoney(summary.fixedReliefAmount + Number(item?.amount || 0));
    } else if (mode === 'percent') {
      summary.percentReliefs += 1;
    } else if (mode === 'full') {
      summary.fullReliefs += 1;
    }
    return summary;
  }, {
    activeReliefs: 0,
    fixedReliefAmount: 0,
    percentReliefs: 0,
    fullReliefs: 0
  });

  const totals = {
    ordersIssuedCount: ordersIssuedInMonth.length,
    ordersIssuedAmount: roundMoney(ordersIssuedInMonth.reduce((sum, item) => sum + Number(item?.amountDue || 0), 0)),
    approvedPaymentCount: approvedPayments.length,
    approvedPaymentAmount: roundMoney(approvedPayments.reduce((sum, item) => sum + Number(item?.amount || 0), 0)),
    pendingPaymentCount: pendingPayments.length,
    pendingPaymentAmount: roundMoney(pendingPayments.reduce((sum, item) => sum + Number(item?.amount || 0), 0)),
    standingDueAmount: roundMoney(ordersBeforeClose.reduce((sum, item) => sum + Number(item?.amountDue || 0), 0)),
    standingPaidAmount: roundMoney(ordersBeforeClose.reduce((sum, item) => sum + Number(item?.amountPaid || 0), 0)),
    standingOutstandingAmount: roundMoney(ordersBeforeClose.reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0)),
    overdueOrders: overdueOrders.length,
    activeMemberships,
    ...reliefSummary
  };

  const anomalies = {
    summary: anomalySummary,
    items: mergedAnomalies.slice(0, 12)
  };

  return {
    generatedAt: new Date().toISOString(),
    monthKey,
    window: {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString()
    },
    totals,
    aging: buildAgingSnapshot(ordersBeforeClose, endAt),
    cashflow: {
      approvedTotal: roundMoney(approvedPayments.reduce((sum, item) => sum + Number(item?.amount || 0), 0)),
      approvedCount: approvedPayments.length,
      pendingTotal: roundMoney(pendingPayments.reduce((sum, item) => sum + Number(item?.amount || 0), 0)),
      pendingCount: pendingPayments.length,
      items: buildCashflowItems(approvedPayments).slice(-31)
    },
    readiness: buildFinanceMonthCloseReadiness({ totals, anomalies }),
    classes: buildClassSnapshot({
      orders: ordersBeforeClose,
      approvedPayments,
      pendingPayments,
      reliefs
    }),
    anomalies
  };
}

module.exports = {
  buildFinanceMonthCloseSnapshot,
  toMonthDateRange
};
