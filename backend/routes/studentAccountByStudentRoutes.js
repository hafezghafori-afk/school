const express = require('express');
const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const SchoolClass = require('../models/SchoolClass');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
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

const solarMonthKey = (value = null) => {
  const date = value instanceof Date ? value : new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
      year: 'numeric',
      month: '2-digit'
    }).formatToParts(date);
    const year = Number(parts.find((item) => item.type === 'year')?.value || 0);
    const month = Number(parts.find((item) => item.type === 'month')?.value || 0);
    return year && month ? `${year}-${String(month).padStart(2, '0')}` : '';
  } catch {
    return '';
  }
};

const requestSchoolId = (req) => asId(
  req.headers?.['x-school-id']
  || req.user?.schoolId
  || req.user?.activeSchoolId
);

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

router.get(
  '/students/:studentId/open-account',
  requireAuth,
  requireRole(['admin']),
  requirePermission('manage_finance'),
  async (req, res) => {
    try {
      const studentId = asId(req.params.studentId);
      const schoolId = requestSchoolId(req);
      if (!studentId) {
        return res.status(400).json({ success: false, message: 'شناسه شاگرد معتبر نیست.' });
      }
      if (!schoolId) {
        return res.status(400).json({ success: false, message: 'برای مشاهده حساب، مکتب فعال را انتخاب کنید.' });
      }

      const scopedClassIds = await SchoolClass.find({ schoolId }).distinct('_id');

      const memberships = await StudentMembership.find({
      $and: [
        { $or: [{ student: studentId }, { studentId }] },
        { $or: [{ schoolId }, { classId: { $in: scopedClassIds } }] }
      ]
    })
      .populate('studentId')
      .populate('student', 'name email')
      .populate('course')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .populate('academicYear')
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

    const allTuitionOrders = docs
      .map((doc) => formatOrder(doc, membershipMap.get(asId(doc.studentMembershipId)) || null))
      .filter((item) => item.id && item.status !== 'void')
      .map((item) => ({
        ...item,
        tuition: tuitionAmounts(item),
        monthKey: solarMonthKey(item.dueDate || item.issuedAt)
      }))
      .filter((item) => item.tuition.gross > 0 || item.tuition.net > 0 || item.tuition.paid > 0)
      .sort((left, right) => time(left.dueDate || left.issuedAt) - time(right.dueDate || right.issuedAt));

    const currentMonthKey = solarMonthKey(new Date());
    const currentOrders = allTuitionOrders.filter((item) => item.monthKey && item.monthKey === currentMonthKey);
    const previousOpenOrders = allTuitionOrders.filter((item) => (
      item.tuition.outstanding > 0
      && (!item.monthKey || !currentMonthKey || item.monthKey < currentMonthKey)
    ));
    const currentOpenOrders = currentOrders.filter((item) => item.tuition.outstanding > 0);
    const payableOrders = [...previousOpenOrders, ...currentOpenOrders]
      .sort((left, right) => time(left.dueDate || left.issuedAt) - time(right.dueDate || right.issuedAt));

    const displayOrderMap = new Map();
    [...previousOpenOrders, ...currentOrders].forEach((item) => {
      if (item?.id) displayOrderMap.set(item.id, item);
    });
    const displayOrders = [...displayOrderMap.values()]
      .sort((left, right) => time(left.dueDate || left.issuedAt) - time(right.dueDate || right.issuedAt));

    const sum = (rows, key) => money((Array.isArray(rows) ? rows : []).reduce(
      (total, item) => total + Number(item?.tuition?.[key] || 0),
      0
    ));

      return res.json({
      success: true,
      student: formatStudent(memberships[0]),
      membership: formatMembership(memberships[0]),
      memberships: memberships.map(formatMembership),
      items: displayOrders,
      arrearsSync: {
        created: 0,
        skipped: 0,
        memberships: [],
        mode: 'read_only'
      },
      summary: {
        studentFee: sum(currentOrders, 'gross'),
        pastArrears: sum(previousOpenOrders, 'outstanding'),
        totalDiscount: sum(displayOrders, 'discount'),
        currentMonthPayable: sum(currentOpenOrders, 'outstanding'),
        payableFee: sum(payableOrders, 'outstanding'),
        totalGross: sum(displayOrders, 'gross'),
        totalNet: sum(displayOrders, 'net'),
        totalPaid: sum(displayOrders, 'paid'),
        totalOutstanding: sum(payableOrders, 'outstanding'),
        overdueOrders: previousOpenOrders.length,
        openMonths: new Set(payableOrders.map((item) => `${item.monthKey || item.periodLabel || item.dueDate || item.id}:${item.studentMembershipId}`)).size,
        oldestDueDate: payableOrders[0]?.dueDate || payableOrders[0]?.issuedAt || null,
        oldestMembershipId: payableOrders[0]?.studentMembershipId || null,
        autoGeneratedOrders: 0,
        paymentPolicy: 'oldest_due_first'
      }
      });
    } catch (error) {
      console.error('Student account by student failed:', error);
      return res.status(500).json({ success: false, message: 'دریافت حساب مالی شاگرد ناموفق بود.' });
    }
  }
);

module.exports = router;
