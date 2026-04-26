require('../models/User');
require('../models/StudentCore');
require('../models/SchoolClass');
require('../models/AcademicYear');
require('../models/StudentMembership');
require('../models/FeeOrder');
require('../models/FeePayment');
require('../models/FinanceRelief');

const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceRelief = require('../models/FinanceRelief');

function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') {
    return doc.toObject({ virtuals: false });
  }
  return { ...doc };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableId(value) {
  if (!value) return '';
  return String(value);
}

function roundMoney(value) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function formatAmountLabel(value = 0, currency = 'AFN') {
  return `${roundMoney(value).toLocaleString('fa-AF-u-ca-persian')} ${normalizeText(currency) || 'AFN'}`;
}

function getStudentName(item = {}) {
  return normalizeText(
    item?.student?.fullName
    || item?.studentId?.fullName
    || item?.student?.name
    || item?.membership?.student?.fullName
    || item?.membership?.student?.name
    || ''
  ) || 'متعلم';
}

function getClassTitle(item = {}) {
  return normalizeText(
    item?.schoolClass?.title
    || item?.classId?.title
    || item?.membership?.schoolClass?.title
    || item?.membership?.classId?.title
    || ''
  ) || 'صنف';
}

function getAcademicYearTitle(item = {}) {
  return normalizeText(
    item?.academicYear?.title
    || item?.academicYearId?.title
    || item?.membership?.academicYear?.title
    || item?.membership?.academicYearId?.title
    || ''
  ) || 'سال تعلیمی';
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameOrBefore(left, right) {
  const leftDate = toDate(left);
  const rightDate = toDate(right);
  if (!leftDate || !rightDate) return false;
  return leftDate.getTime() <= rightDate.getTime();
}

function isSameOrAfter(left, right) {
  const leftDate = toDate(left);
  const rightDate = toDate(right);
  if (!leftDate || !rightDate) return false;
  return leftDate.getTime() >= rightDate.getTime();
}

function differenceInDays(later, earlier) {
  const laterDate = toDate(later);
  const earlierDate = toDate(earlier);
  if (!laterDate || !earlierDate) return 0;
  return Math.floor((laterDate.getTime() - earlierDate.getTime()) / (24 * 60 * 60 * 1000));
}

function reliefIsActiveAt(relief = {}, asOf = new Date()) {
  if (normalizeText(relief?.status) !== 'active') return false;
  const at = toDate(asOf) || new Date();
  const startDate = toDate(relief?.startDate);
  const endDate = toDate(relief?.endDate);
  if (startDate && startDate.getTime() > at.getTime()) return false;
  if (endDate && endDate.getTime() < at.getTime()) return false;
  return true;
}

function getOrderFeeTypes(order = {}) {
  const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];
  const lineItemTypes = lineItems
    .map((entry) => normalizeText(entry?.feeType))
    .filter(Boolean);
  if (lineItemTypes.length) return new Set(lineItemTypes);
  const orderType = normalizeText(order?.orderType);
  return orderType ? new Set([orderType]) : new Set();
}

function reliefAppliesToOrder(relief = {}, order = {}) {
  const scope = normalizeText(relief?.scope) || 'all';
  if (scope === 'all') return true;
  return getOrderFeeTypes(order).has(scope);
}

function isCurrentMembership(membership = {}) {
  return Boolean(membership?.isCurrent) && ['active', 'pending', 'suspended', 'transferred_in'].includes(normalizeText(membership?.status));
}

function buildAnomalySummary(items = []) {
  const rows = Array.isArray(items) ? items : [];
  const byType = {};
  const summary = {
    total: rows.length,
    critical: 0,
    warning: 0,
    info: 0,
    actionRequired: 0,
    byType
  };

  rows.forEach((item) => {
    const severity = normalizeText(item?.severity) || 'info';
    const type = normalizeText(item?.anomalyType) || 'finance_signal';
    if (severity === 'critical') summary.critical += 1;
    else if (severity === 'warning') summary.warning += 1;
    else summary.info += 1;
    if (item?.actionRequired) summary.actionRequired += 1;
    byType[type] = (byType[type] || 0) + 1;
  });

  return summary;
}

function getAnomalySeverityScore(item = {}) {
  const severity = normalizeText(item?.severity);
  if (severity === 'critical') return 300;
  if (severity === 'warning') return 200;
  return 100;
}

function getAnomalyTimeScore(item = {}) {
  const date = toDate(item?.at || item?.dueDate || item?.endDate || item?.paidAt);
  return date ? date.getTime() : 0;
}

function sortAnomalies(items = []) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const severityDelta = getAnomalySeverityScore(right) - getAnomalySeverityScore(left);
    if (severityDelta !== 0) return severityDelta;
    const amountDelta = roundMoney(right?.amount || 0) - roundMoney(left?.amount || 0);
    if (amountDelta !== 0) return amountDelta;
    return getAnomalyTimeScore(right) - getAnomalyTimeScore(left);
  });
}

function buildMembershipFinanceAnomalies({
  membership = null,
  orders = [],
  payments = [],
  reliefs = [],
  asOf = new Date(),
  limit = 20
} = {}) {
  const membershipItem = toPlain(membership) || {};
  const membershipId = normalizeNullableId(membershipItem?.id || membershipItem?._id);
  const now = toDate(asOf) || new Date();
  const studentName = getStudentName({ membership: membershipItem });
  const classTitle = getClassTitle({ membership: membershipItem });
  const academicYearTitle = getAcademicYearTitle({ membership: membershipItem });
  const studentUserId = normalizeNullableId(
    membershipItem?.student?.userId
    || membershipItem?.student?._id
    || membershipItem?.student
  );
  const classId = normalizeNullableId(
    membershipItem?.schoolClass?.id
    || membershipItem?.schoolClass?._id
    || membershipItem?.classId?.id
    || membershipItem?.classId?._id
  );
  const academicYearId = normalizeNullableId(
    membershipItem?.academicYear?.id
    || membershipItem?.academicYear?._id
    || membershipItem?.academicYearId?.id
    || membershipItem?.academicYearId?._id
  );
  const currency = normalizeText(
    payments.find((item) => normalizeText(item?.currency))?.currency
    || orders.find((item) => normalizeText(item?.currency))?.currency
    || 'AFN'
  ) || 'AFN';

  const normalizedOrders = (Array.isArray(orders) ? orders : []).filter(Boolean);
  const normalizedPayments = (Array.isArray(payments) ? payments : []).filter(Boolean);
  const normalizedReliefs = (Array.isArray(reliefs) ? reliefs : []).filter(Boolean);
  const openOrders = normalizedOrders.filter((item) => ['new', 'partial', 'overdue'].includes(normalizeText(item?.status)) && roundMoney(item?.outstandingAmount) > 0);
  const activeReliefs = normalizedReliefs.filter((item) => reliefIsActiveAt(item, now));
  const anomalies = [];

  normalizedOrders.forEach((order) => {
    const amountDue = roundMoney(order?.amountDue);
    const amountPaid = roundMoney(order?.amountPaid);
    const outstandingAmount = roundMoney(order?.outstandingAmount);
    const orderNumber = normalizeText(order?.orderNumber || order?.billNumber || order?.title) || 'بل مالی';
    const dueDate = toDate(order?.dueDate);

    if (amountPaid > amountDue + 0.009) {
      const excess = roundMoney(amountPaid - amountDue);
      anomalies.push({
        id: `overpayment-${normalizeNullableId(order?.id || order?._id || orderNumber)}`,
        anomalyType: 'overpayment',
        severity: 'warning',
        actionRequired: true,
        title: 'بیش‌پرداخت روی بدهی ثبت شده است',
        description: `${orderNumber} برای ${studentName} بیشتر از مبلغ لازم پرداخت شده است.`,
        studentName,
        studentUserId,
        classTitle,
        classId,
        academicYearTitle,
        academicYearId,
        membershipId,
        referenceNumber: orderNumber,
        amount: excess,
        amountLabel: formatAmountLabel(excess, currency),
        status: normalizeText(order?.status),
        dueDate: dueDate?.toISOString() || null,
        at: dueDate?.toISOString() || order?.paidAt || order?.updatedAt || order?.createdAt || null,
        orderId: normalizeNullableId(order?.id || order?._id),
        tags: ['order', 'payment_overage']
      });
    }

    if (outstandingAmount > 0) {
      const matchingFullRelief = activeReliefs.find((relief) => (
        normalizeText(relief?.coverageMode) === 'full' && reliefAppliesToOrder(relief, order)
      ));
      if (matchingFullRelief) {
        anomalies.push({
          id: `full-relief-open-order-${normalizeNullableId(order?.id || order?._id || orderNumber)}-${normalizeNullableId(matchingFullRelief?.id || matchingFullRelief?._id)}`,
          anomalyType: 'full_relief_with_open_balance',
          severity: 'critical',
          actionRequired: true,
          title: 'بل باز با وجود تسهیل کامل',
          description: `${studentName} تسهیل کامل فعال دارد اما ${orderNumber} هنوز مانده باز دارد.`,
          studentName,
          studentUserId,
          classTitle,
          classId,
          academicYearTitle,
          academicYearId,
          membershipId,
          referenceNumber: orderNumber,
          secondaryReference: normalizeText(matchingFullRelief?.sourceKey || matchingFullRelief?.reliefType),
          amount: outstandingAmount,
          amountLabel: formatAmountLabel(outstandingAmount, currency),
          status: normalizeText(order?.status),
          dueDate: dueDate?.toISOString() || null,
          at: dueDate?.toISOString() || order?.updatedAt || order?.createdAt || null,
          orderId: normalizeNullableId(order?.id || order?._id),
          reliefId: normalizeNullableId(matchingFullRelief?.id || matchingFullRelief?._id),
          tags: ['relief', 'order', normalizeText(matchingFullRelief?.reliefType)]
        });
      }
    }

    if (outstandingAmount > 0 && dueDate && differenceInDays(now, dueDate) >= 90) {
      anomalies.push({
        id: `long-overdue-${normalizeNullableId(order?.id || order?._id || orderNumber)}`,
        anomalyType: 'long_overdue_balance',
        severity: 'critical',
        actionRequired: true,
        title: 'بدهی بیش از سه ماه معوق مانده است',
        description: `${studentName} برای ${orderNumber} بیشتر از سه ماه بدهی باز دارد.`,
        studentName,
        studentUserId,
        classTitle,
        classId,
        academicYearTitle,
        academicYearId,
        membershipId,
        referenceNumber: orderNumber,
        amount: outstandingAmount,
        amountLabel: formatAmountLabel(outstandingAmount, currency),
        status: normalizeText(order?.status),
        dueDate: dueDate.toISOString(),
        lateDays: differenceInDays(now, dueDate),
        at: dueDate.toISOString(),
        orderId: normalizeNullableId(order?.id || order?._id),
        tags: ['overdue', 'aging_90_plus']
      });
    }
  });

  activeReliefs.forEach((relief) => {
    const endDate = toDate(relief?.endDate);
    if (!endDate) return;
    const daysLeft = differenceInDays(endDate, now);
    if (daysLeft < 0 || daysLeft > 14) return;
    anomalies.push({
      id: `relief-expiring-${normalizeNullableId(relief?.id || relief?._id || relief?.sourceKey)}`,
      anomalyType: 'relief_expiring',
      severity: 'warning',
      actionRequired: true,
      title: 'تسهیل مالی رو به ختم است',
      description: `${studentName} یک تسهیل مالی دارد که تا ${daysLeft.toLocaleString('fa-AF-u-ca-persian')} روز دیگر ختم می‌شود.`,
      studentName,
      studentUserId,
      classTitle,
      classId,
      academicYearTitle,
      academicYearId,
      membershipId,
      referenceNumber: normalizeText(relief?.sourceKey || relief?.reliefType) || 'تسهیل مالی',
      amount: normalizeText(relief?.coverageMode) === 'percent'
        ? roundMoney(relief?.percentage)
        : roundMoney(relief?.amount),
      amountLabel: normalizeText(relief?.coverageMode) === 'full'
        ? '100%'
        : normalizeText(relief?.coverageMode) === 'percent'
          ? `${roundMoney(relief?.percentage).toLocaleString('fa-AF-u-ca-persian')}%`
          : formatAmountLabel(relief?.amount, currency),
      endDate: endDate.toISOString(),
      daysLeft,
      at: endDate.toISOString(),
      reliefId: normalizeNullableId(relief?.id || relief?._id),
      tags: ['relief', normalizeText(relief?.reliefType), 'expiring']
    });
  });

  normalizedPayments
    .filter((payment) => normalizeText(payment?.status) === 'pending')
    .forEach((payment) => {
      const paidAt = toDate(payment?.paidAt || payment?.createdAt);
      if (!paidAt || differenceInDays(now, paidAt) < 7) return;
      const paymentNumber = normalizeText(payment?.paymentNumber) || 'پرداخت';
      anomalies.push({
        id: `pending-payment-stalled-${normalizeNullableId(payment?.id || payment?._id || paymentNumber)}`,
        anomalyType: 'pending_payment_stalled',
        severity: 'warning',
        actionRequired: true,
        title: 'پرداخت در انتظار بیش از حد طول کشیده است',
        description: `${paymentNumber} برای ${studentName} هنوز تایید نشده است.`,
        studentName,
        studentUserId,
        classTitle,
        classId,
        academicYearTitle,
        academicYearId,
        membershipId,
        referenceNumber: paymentNumber,
        amount: roundMoney(payment?.amount),
        amountLabel: formatAmountLabel(payment?.amount, normalizeText(payment?.currency) || currency),
        status: normalizeText(payment?.status),
        paidAt: paidAt.toISOString(),
        at: paidAt.toISOString(),
        paymentId: normalizeNullableId(payment?.id || payment?._id),
        tags: ['payment', normalizeText(payment?.approvalStage), 'stalled']
      });
    });

  if (isCurrentMembership(membershipItem)) {
    const hasAdmissionOrder = normalizedOrders.some((order) => (
      normalizeText(order?.status) !== 'void' && (
        normalizeText(order?.orderType) === 'admission' || getOrderFeeTypes(order).has('admission')
      )
    ));
    const hasActiveCharge = openOrders.some((order) => {
      const feeTypes = getOrderFeeTypes(order);
      return feeTypes.has('tuition') || feeTypes.has('service') || feeTypes.has('exam') || feeTypes.has('transport');
    });

    if (!hasAdmissionOrder && hasActiveCharge) {
      anomalies.push({
        id: `admission-missing-${membershipId || normalizeNullableId(membershipItem?.id || membershipItem?._id || studentName)}`,
        anomalyType: 'admission_missing',
        severity: 'warning',
        actionRequired: true,
        title: 'عضویت فعال بدون داخله مالی',
        description: `${studentName} عضویت فعال دارد اما هنوز بدهی یا سند داخله برای او دیده نشد.`,
        studentName,
        studentUserId,
        classTitle,
        classId,
        academicYearTitle,
        academicYearId,
        membershipId,
        referenceNumber: membershipId || normalizeNullableId(membershipItem?.id || membershipItem?._id),
        amount: 0,
        amountLabel: formatAmountLabel(0, currency),
        status: normalizeText(membershipItem?.status),
        at: membershipItem?.enrolledAt || membershipItem?.createdAt || null,
        tags: ['membership', 'admission']
      });
    }
  }

  const ordered = sortAnomalies(anomalies);
  const limited = ordered.slice(0, Math.max(1, Number(limit) || 20));
  return {
    items: limited,
    summary: buildAnomalySummary(ordered)
  };
}

function formatMembershipLite(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: normalizeNullableId(item._id || item.id),
    status: normalizeText(item.status),
    isCurrent: Boolean(item.isCurrent),
    enrolledAt: item.enrolledAt || null,
    createdAt: item.createdAt || null,
    student: item.student ? {
      userId: normalizeNullableId(item.student?._id || item.student),
      fullName: normalizeText(item.studentId?.fullName),
      name: normalizeText(item.student?.name),
      email: normalizeText(item.student?.email)
    } : {
      userId: normalizeNullableId(item.student),
      fullName: normalizeText(item.studentId?.fullName),
      name: '',
      email: ''
    },
    schoolClass: item.classId ? {
      id: normalizeNullableId(item.classId?._id || item.classId),
      title: normalizeText(item.classId?.title)
    } : null,
    academicYear: item.academicYearId ? {
      id: normalizeNullableId(item.academicYearId?._id || item.academicYearId),
      title: normalizeText(item.academicYearId?.title)
    } : null
  };
}

function formatOrderLite(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: normalizeNullableId(item._id || item.id),
    orderNumber: normalizeText(item.orderNumber),
    title: normalizeText(item.title),
    orderType: normalizeText(item.orderType),
    lineItems: Array.isArray(item.lineItems) ? item.lineItems.map((entry) => ({
      feeType: normalizeText(entry?.feeType),
      label: normalizeText(entry?.label)
    })) : [],
    status: normalizeText(item.status),
    currency: normalizeText(item.currency) || 'AFN',
    amountDue: roundMoney(item.amountDue),
    amountPaid: roundMoney(item.amountPaid),
    outstandingAmount: roundMoney(item.outstandingAmount),
    dueDate: item.dueDate || null,
    paidAt: item.paidAt || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    student: {
      userId: normalizeNullableId(item.student?._id || item.student),
      fullName: normalizeText(item.studentId?.fullName),
      name: normalizeText(item.student?.name),
      email: normalizeText(item.student?.email)
    },
    schoolClass: item.classId ? {
      id: normalizeNullableId(item.classId?._id || item.classId),
      title: normalizeText(item.classId?.title)
    } : null,
    academicYear: item.academicYearId ? {
      id: normalizeNullableId(item.academicYearId?._id || item.academicYearId),
      title: normalizeText(item.academicYearId?.title)
    } : null
  };
}

function formatPaymentLite(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: normalizeNullableId(item._id || item.id),
    paymentNumber: normalizeText(item.paymentNumber),
    amount: roundMoney(item.amount),
    currency: normalizeText(item.currency) || 'AFN',
    status: normalizeText(item.status),
    approvalStage: normalizeText(item.approvalStage),
    paidAt: item.paidAt || null,
    createdAt: item.createdAt || null,
    student: {
      userId: normalizeNullableId(item.student?._id || item.student),
      fullName: normalizeText(item.studentId?.fullName),
      name: normalizeText(item.student?.name),
      email: normalizeText(item.student?.email)
    },
    schoolClass: item.classId ? {
      id: normalizeNullableId(item.classId?._id || item.classId),
      title: normalizeText(item.classId?.title)
    } : null,
    academicYear: item.academicYearId ? {
      id: normalizeNullableId(item.academicYearId?._id || item.academicYearId),
      title: normalizeText(item.academicYearId?.title)
    } : null
  };
}

function formatReliefLite(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: normalizeNullableId(item._id || item.id),
    sourceKey: normalizeText(item.sourceKey),
    reliefType: normalizeText(item.reliefType),
    scope: normalizeText(item.scope),
    coverageMode: normalizeText(item.coverageMode),
    amount: roundMoney(item.amount),
    percentage: roundMoney(item.percentage),
    status: normalizeText(item.status),
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    createdAt: item.createdAt || null,
    student: {
      userId: normalizeNullableId(item.student?._id || item.student),
      fullName: normalizeText(item.studentId?.fullName),
      name: normalizeText(item.student?.name),
      email: normalizeText(item.student?.email)
    },
    schoolClass: item.classId ? {
      id: normalizeNullableId(item.classId?._id || item.classId),
      title: normalizeText(item.classId?.title)
    } : null,
    academicYear: item.academicYearId ? {
      id: normalizeNullableId(item.academicYearId?._id || item.academicYearId),
      title: normalizeText(item.academicYearId?.title)
    } : null
  };
}

async function buildFinanceAnomalyReport({
  classId = '',
  academicYearId = '',
  studentMembershipId = '',
  asOf = new Date(),
  limit = 120
} = {}) {
  const membershipFilter = {};
  const orderFilter = { status: { $ne: 'void' } };
  const paymentFilter = { status: { $in: ['pending', 'approved'] } };
  const reliefFilter = { status: 'active' };

  if (normalizeNullableId(studentMembershipId)) {
    membershipFilter._id = studentMembershipId;
    orderFilter.studentMembershipId = studentMembershipId;
    paymentFilter.studentMembershipId = studentMembershipId;
    reliefFilter.studentMembershipId = studentMembershipId;
  }
  if (normalizeNullableId(classId)) {
    membershipFilter.classId = classId;
    orderFilter.classId = classId;
    paymentFilter.classId = classId;
    reliefFilter.classId = classId;
  }
  if (normalizeNullableId(academicYearId)) {
    membershipFilter.academicYearId = academicYearId;
    orderFilter.academicYearId = academicYearId;
    paymentFilter.academicYearId = academicYearId;
    reliefFilter.academicYearId = academicYearId;
  }

  const [memberships, orders, payments, reliefs] = await Promise.all([
    StudentMembership.find(membershipFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ createdAt: -1 })
      .lean(),
    FeeOrder.find(orderFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ dueDate: -1, createdAt: -1 })
      .lean(),
    FeePayment.find(paymentFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ paidAt: -1, createdAt: -1 })
      .lean(),
    FinanceRelief.find(reliefFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ endDate: 1, createdAt: -1 })
      .lean()
  ]);

  const membershipMap = new Map(
    memberships.map((item) => [normalizeNullableId(item?._id), formatMembershipLite(item)])
  );

  const orderMap = new Map();
  orders.forEach((item) => {
    const membershipId = normalizeNullableId(item?.studentMembershipId);
    if (!membershipId) return;
    const current = orderMap.get(membershipId) || [];
    current.push(formatOrderLite(item));
    orderMap.set(membershipId, current);
  });

  const paymentMap = new Map();
  payments.forEach((item) => {
    const membershipId = normalizeNullableId(item?.studentMembershipId);
    if (!membershipId) return;
    const current = paymentMap.get(membershipId) || [];
    current.push(formatPaymentLite(item));
    paymentMap.set(membershipId, current);
  });

  const reliefMap = new Map();
  reliefs.forEach((item) => {
    const membershipId = normalizeNullableId(item?.studentMembershipId);
    if (!membershipId) return;
    const current = reliefMap.get(membershipId) || [];
    current.push(formatReliefLite(item));
    reliefMap.set(membershipId, current);
  });

  const allItems = [];
  membershipMap.forEach((membership, membershipId) => {
    const report = buildMembershipFinanceAnomalies({
      membership,
      orders: orderMap.get(membershipId) || [],
      payments: paymentMap.get(membershipId) || [],
      reliefs: reliefMap.get(membershipId) || [],
      asOf,
      limit: Math.max(Number(limit) || 120, 50)
    });
    allItems.push(...report.items);
  });

  const ordered = sortAnomalies(allItems).slice(0, Math.max(1, Number(limit) || 120));
  return {
    items: ordered,
    summary: buildAnomalySummary(allItems),
    generatedAt: new Date().toISOString(),
    appliedFilters: {
      classId: normalizeNullableId(classId),
      academicYearId: normalizeNullableId(academicYearId),
      studentMembershipId: normalizeNullableId(studentMembershipId)
    }
  };
}

module.exports = {
  buildFinanceAnomalyReport,
  buildMembershipFinanceAnomalies,
  buildAnomalySummary,
  formatAmountLabel
};
