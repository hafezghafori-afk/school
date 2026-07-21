const express = require('express');
const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  buildFeeBreakdownFromLineItems,
  deriveFinanceOrderStatus,
  normalizeFinanceLineItems
} = require('../utils/financeLineItems');

const router = express.Router();

const asId = (value) => String(value?._id || value?.id || value || '').trim();
const text = (value) => String(value || '').trim();
const money = (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
const time = (value) => {
  const parsed = new Date(value || 0).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
};

const formatAcademicYear = (value) => value ? {
  id: asId(value),
  title: text(value.title),
  code: text(value.code)
} : null;

const formatSchoolClass = (value) => value ? {
  id: asId(value),
  title: text(value.title),
  code: text(value.code),
  academicYear: formatAcademicYear(value.academicYearId)
} : null;

const formatStudent = (membership = null) => {
  const core = membership?.studentId || null;
  const user = membership?.student || null;
  return {
    studentId: asId(core),
    userId: asId(user),
    fullName: text(core?.fullName) || text(user?.name),
    email: text(core?.email) || text(user?.email)
  };
};

const formatMembership = (membership = null) => membership ? {
  id: asId(membership),
  status: text(membership.status),
  isCurrent: membership.isCurrent !== false,
  enrolledAt: membership.enrolledAt || null,
  student: formatStudent(membership),
  schoolClass: formatSchoolClass(membership.classId),
  academicYear: formatAcademicYear(membership.academicYearId)
} : null;

const formatOrder = (doc, membership = null) => {
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
    feeType: text(entry?.feeType),
    label: text(entry?.label),
    periodKey: text(entry?.periodKey),
    grossAmount: money(entry?.grossAmount),
    reductionAmount: money(entry?.reductionAmount),
    penaltyAmount: money(entry?.penaltyAmount),
    netAmount: money(entry?.netAmount),
    paidAmount: money(entry?.paidAmount),
    balanceAmount: money(entry?.balanceAmount),
    status: text(entry?.status)
  }));
  const amountOriginal = money(lineItems.reduce((sum, entry) => sum + entry.grossAmount, 0));
  const amountDue = money(lineItems.reduce((sum, entry) => sum + entry.netAmount, 0));
  const amountPaid = money(item.amountPaid);
  const outstandingAmount = money(Math.max(0, amountDue - amountPaid));
  const status = deriveFinanceOrderStatus({
    currentStatus: item.status,
    amountOriginal,
    amountDue,
    amountPaid,
    dueDate: item.dueDate
  });

  return {
    id: asId(item),
    orderNumber: text(item.orderNumber),
    billNumber: text(item.billNumber),
    title: text(item.title),
    orderType: text(item.orderType),
    periodType: text(item.periodType),
    periodLabel: text(item.periodLabel),
    currency: text(item.currency) || 'AFN',
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
    membership: formatMembership(membership),
    student: formatStudent(membership),
    schoolClass: formatSchoolClass(item.classId) || formatSchoolClass(membership?.classId),
    academicYear: formatAcademicYear(item.academicYearId) || formatAcademicYear(membership?.academicYearId)
  };
};

const tuitionAmounts = (order = {}) => (
  (Array.isArray(order.lineItems) ? order.lineItems : [])
    .filter((entry) => text(entry?.feeType) === 'tuition')
    .reduce((summary, entry) => ({
      gross: money(summary.gross + Number(entry?.grossAmount || 0)),
      discount: money(summary.discount + Number(entry?.reductionAmount || 0)),
      penalty: money(summary.penalty + Number(entry?.penaltyAmount || 0)),
      net: money(summary.net + Number(entry?.netAmount || 0)),
      paid: money(summary.paid + Number(entry?.paidAmount || 0)),
      outstanding: money(summary.outstanding + Number(entry?.balanceAmount || 0))
    }), { gross: 0, discount: 0, penalty: 0, net: 0, paid: 0, outstanding: 0 })
);

router.get('/students/:studentId/open-account', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const studentId = asId(req.params.studentId);
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'شناسه شاگرد معتبر نیست.' });
    }

    const memberships = await StudentMembership.find({
      $or: [{ student: studentId }, { studentId }]
    })
      .populate('studentId')
      .populate('student', 'name email')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ isCurrent: -1, enrolledAt: -1, createdAt: -1 });

    if (!memberships.length) {
      return res.status(404).json({ success: false, message: 'عضویت مالی این شاگرد پیدا نشد.' });
    }

    const membershipIds = memberships.map((item) => item._id);
    const membershipMap = new Map(memberships.map((item) => [asId(item), item]));
    const docs = await FeeOrder.find({
      studentMembershipId: { $in: membershipIds },
      status: { $ne: 'void' }
    })
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ dueDate: 1, createdAt: 1 });

    const allOrders = docs
      .map((doc) => formatOrder(doc, membershipMap.get(asId(doc.studentMembershipId)) || null))
      .filter((item) => item.id && item.status !== 'void');
    const openOrders = allOrders
      .map((item) => ({ ...item, tuition: tuitionAmounts(item) }))
      .filter((item) => item.tuition.outstanding > 0)
      .sort((left, right) => time(left.dueDate) - time(right.dueDate));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const overdueOrders = openOrders.filter((item) => time(item.dueDate) < Date.now());
    const currentOrders = openOrders.filter((item) => {
      const due = time(item.dueDate);
      return due >= monthStart && due < nextMonthStart;
    });
    const nextPayableOrders = currentOrders.length ? currentOrders : openOrders.slice(0, 1);
    const sum = (rows, key) => money(rows.reduce((total, item) => total + Number(item?.tuition?.[key] || 0), 0));

    return res.json({
      success: true,
      student: formatStudent(memberships[0]),
      membership: formatMembership(memberships[0]),
      memberships: memberships.map(formatMembership),
      items: openOrders,
      summary: {
        studentFee: sum(nextPayableOrders, 'gross'),
        pastArrears: sum(overdueOrders, 'outstanding'),
        totalDiscount: sum(openOrders, 'discount'),
        payableFee: sum(openOrders, 'outstanding'),
        totalGross: sum(openOrders, 'gross'),
        totalNet: sum(openOrders, 'net'),
        totalPaid: sum(openOrders, 'paid'),
        totalOutstanding: sum(openOrders, 'outstanding'),
        overdueOrders: overdueOrders.length,
        openMonths: new Set(openOrders.map((item) => `${item.periodLabel || item.dueDate || item.id}:${item.studentMembershipId}`)).size,
        oldestDueDate: openOrders[0]?.dueDate || null,
        oldestMembershipId: openOrders[0]?.studentMembershipId || null,
        paymentPolicy: 'oldest_due_first'
      }
    });
  } catch (error) {
    console.error('Student account by student failed:', error);
    return res.status(500).json({ success: false, message: 'دریافت حساب مالی شاگرد ناموفق بود.' });
  }
});

module.exports = router;
