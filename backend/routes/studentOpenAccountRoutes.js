const express = require('express');
const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const { requireAuth } = require('../middleware/auth');
const {
  buildFeeBreakdownFromLineItems,
  deriveFinanceOrderStatus,
  normalizeFinanceLineItems
} = require('../utils/financeLineItems');

const router = express.Router();

const asId = (value) => String(value?._id || value?.id || value || '').trim();
const asText = (value) => String(value || '').trim();
const roundMoney = (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
const asTime = (value) => {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
};

const formatAcademicYear = (value) => {
  if (!value) return null;
  return {
    id: asId(value),
    title: asText(value.title),
    code: asText(value.code)
  };
};

const formatSchoolClass = (value) => {
  if (!value) return null;
  return {
    id: asId(value),
    title: asText(value.title),
    code: asText(value.code),
    academicYear: formatAcademicYear(value.academicYearId)
  };
};

const formatMembership = (value) => {
  if (!value) return null;
  const studentCore = value.studentId || null;
  const user = value.student || null;
  return {
    id: asId(value),
    status: asText(value.status),
    isCurrent: value.isCurrent !== false,
    enrolledAt: value.enrolledAt || null,
    student: {
      studentId: asId(studentCore),
      userId: asId(user),
      fullName: asText(studentCore?.fullName) || asText(user?.name),
      email: asText(studentCore?.email) || asText(user?.email)
    },
    schoolClass: formatSchoolClass(value.classId),
    academicYear: formatAcademicYear(value.academicYearId)
  };
};

const formatOpenOrder = (doc, membership = null) => {
  const item = typeof doc?.toObject === 'function' ? doc.toObject({ virtuals: false }) : { ...(doc || {}) };
  const normalized = normalizeFinanceLineItems({
    lineItems: item.lineItems,
    amountOriginal: item.amountOriginal,
    adjustments: item.adjustments,
    amountPaid: item.amountPaid,
    paymentBreakdown: item.paymentBreakdown,
    defaultType: item.orderType
  });
  const lineItems = normalized.map((entry) => ({
    feeType: asText(entry?.feeType),
    label: asText(entry?.label),
    periodKey: asText(entry?.periodKey),
    grossAmount: roundMoney(entry?.grossAmount),
    reductionAmount: roundMoney(entry?.reductionAmount),
    penaltyAmount: roundMoney(entry?.penaltyAmount),
    netAmount: roundMoney(entry?.netAmount),
    paidAmount: roundMoney(entry?.paidAmount),
    balanceAmount: roundMoney(entry?.balanceAmount),
    status: asText(entry?.status)
  }));
  const amountOriginal = roundMoney(lineItems.reduce((sum, entry) => sum + entry.grossAmount, 0));
  const amountDue = roundMoney(lineItems.reduce((sum, entry) => sum + entry.netAmount, 0));
  const amountPaid = roundMoney(item.amountPaid);
  const outstandingAmount = roundMoney(Math.max(0, amountDue - amountPaid));
  const status = deriveFinanceOrderStatus({
    currentStatus: item.status,
    amountOriginal,
    amountDue,
    amountPaid,
    dueDate: item.dueDate
  });

  return {
    id: asId(item),
    orderNumber: asText(item.orderNumber),
    billNumber: asText(item.billNumber),
    title: asText(item.title),
    orderType: asText(item.orderType),
    periodType: asText(item.periodType),
    periodLabel: asText(item.periodLabel),
    currency: asText(item.currency) || 'AFN',
    amountOriginal,
    amountDue,
    amountPaid,
    outstandingAmount,
    status,
    issuedAt: item.issuedAt || null,
    dueDate: item.dueDate || null,
    lineItems,
    feeBreakdown: buildFeeBreakdownFromLineItems(lineItems),
    studentMembershipId: asId(item.studentMembershipId),
    membership: membership ? formatMembership(membership) : null,
    student: membership ? formatMembership(membership)?.student : null,
    schoolClass: formatSchoolClass(item.classId) || (membership ? formatSchoolClass(membership.classId) : null),
    academicYear: formatAcademicYear(item.academicYearId) || (membership ? formatAcademicYear(membership.academicYearId) : null)
  };
};

const getFeeBalance = (item, feeType) => roundMoney(
  (Array.isArray(item?.lineItems) ? item.lineItems : [])
    .filter((entry) => asText(entry?.feeType) === feeType)
    .reduce((sum, entry) => sum + Number(entry?.balanceAmount || 0), 0)
);

router.get('/memberships/:membershipId/open-orders', requireAuth, async (req, res) => {
  try {
    const currentMembership = await StudentMembership.findById(req.params.membershipId)
      .populate('studentId')
      .populate('student', 'name email')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId');

    if (!currentMembership) {
      return res.status(404).json({ success: false, message: 'عضویت مالی پیدا نشد.' });
    }

    const userId = asId(currentMembership.student);
    const studentCoreId = asId(currentMembership.studentId);
    const schoolId = asId(currentMembership.schoolId || currentMembership.classId?.schoolId);
    const identityFilters = [];
    if (userId) identityFilters.push({ student: userId });
    if (studentCoreId) identityFilters.push({ studentId: studentCoreId });

    const memberships = await StudentMembership.find({
      ...(schoolId ? { schoolId } : {}),
      ...(identityFilters.length ? { $or: identityFilters } : { _id: currentMembership._id })
    })
      .populate('studentId')
      .populate('student', 'name email')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ isCurrent: -1, enrolledAt: -1, createdAt: -1 });

    const membershipIds = memberships.length
      ? memberships.map((item) => item._id)
      : [currentMembership._id];
    const membershipMap = new Map(memberships.map((item) => [asId(item), item]));
    if (!membershipMap.has(asId(currentMembership))) {
      membershipMap.set(asId(currentMembership), currentMembership);
    }

    const orderDocs = await FeeOrder.find({
      studentMembershipId: { $in: membershipIds },
      status: { $nin: ['paid', 'waived', 'void'] }
    })
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ dueDate: 1, createdAt: 1 });

    const items = orderDocs
      .map((doc) => formatOpenOrder(doc, membershipMap.get(asId(doc.studentMembershipId)) || null))
      .filter((item) => item.id && item.outstandingAmount > 0 && !['paid', 'waived', 'void'].includes(item.status))
      .sort((left, right) => {
        const dueDiff = asTime(left?.dueDate) - asTime(right?.dueDate);
        if (dueDiff !== 0) return dueDiff;
        return asId(left?.id).localeCompare(asId(right?.id));
      });

    const now = Date.now();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const nextMonthStart = new Date(monthStart);
    nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

    const overdueItems = items.filter((item) => asTime(item?.dueDate) < now);
    const currentItems = items.filter((item) => {
      const due = asTime(item?.dueDate);
      return due >= monthStart.getTime() && due < nextMonthStart.getTime();
    });
    const futureItems = items.filter((item) => asTime(item?.dueDate) >= nextMonthStart.getTime());
    const sumOutstanding = (rows) => roundMoney(rows.reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0));
    const sumFeeBalance = (rows, feeType) => roundMoney(rows.reduce((sum, item) => sum + getFeeBalance(item, feeType), 0));

    return res.json({
      success: true,
      membership: formatMembership(currentMembership),
      memberships: memberships.map(formatMembership),
      items,
      summary: {
        totalOrders: items.length,
        totalOutstanding: sumOutstanding(items),
        tuitionOutstanding: sumFeeBalance(items, 'tuition'),
        admissionOutstanding: sumFeeBalance(items, 'admission'),
        overdueOrders: overdueItems.length,
        overdueOutstanding: sumOutstanding(overdueItems),
        overdueTuitionOutstanding: sumFeeBalance(overdueItems, 'tuition'),
        currentOrders: currentItems.length,
        currentOutstanding: sumOutstanding(currentItems),
        currentTuitionOutstanding: sumFeeBalance(currentItems, 'tuition'),
        futureOrders: futureItems.length,
        futureOutstanding: sumOutstanding(futureItems),
        futureTuitionOutstanding: sumFeeBalance(futureItems, 'tuition'),
        oldestDueDate: items[0]?.dueDate || null,
        oldestMembershipId: items[0]?.studentMembershipId || null,
        paymentPolicy: 'oldest_due_first'
      },
      accountView: {
        overdue: overdueItems,
        current: currentItems,
        future: futureItems
      }
    });
  } catch (error) {
    console.error('Student open account failed:', error);
    return res.status(500).json({ success: false, message: 'دریافت حساب باز کامل شاگرد ناموفق بود.' });
  }
});

module.exports = router;
