const express = require('express');
const StudentMembership = require('../models/StudentMembership');
const { requireAuth } = require('../middleware/auth');
const { listOpenFeeOrdersForMembership } = require('../services/studentFinanceService');

const router = express.Router();

const asId = (value) => String(value?._id || value?.id || value || '').trim();
const asTime = (value) => {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
};

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
    }).select('_id isCurrent status createdAt');

    const membershipIds = memberships.length
      ? memberships.map((item) => asId(item)).filter(Boolean)
      : [asId(currentMembership)];

    const accountParts = await Promise.all(membershipIds.map(async (membershipId) => {
      try {
        return await listOpenFeeOrdersForMembership(membershipId);
      } catch {
        return null;
      }
    }));

    const seen = new Set();
    const items = accountParts
      .flatMap((part) => {
        const membershipId = asId(part?.membership?.id);
        return (Array.isArray(part?.items) ? part.items : []).map((item) => ({
          ...item,
          studentMembershipId: membershipId,
          membership: part?.membership || null
        }));
      })
      .filter((item) => {
        const id = asId(item?.id);
        if (!id || seen.has(id) || Number(item?.outstandingAmount || 0) <= 0) return false;
        seen.add(id);
        return true;
      })
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
    const totalOutstanding = items.reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0);
    const overdueOutstanding = overdueItems.reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0);

    return res.json({
      success: true,
      membership: accountParts.find((part) => asId(part?.membership?.id) === asId(currentMembership))?.membership
        || accountParts.find(Boolean)?.membership
        || null,
      memberships: accountParts.filter(Boolean).map((part) => part.membership),
      items,
      summary: {
        totalOrders: items.length,
        totalOutstanding,
        overdueOrders: overdueItems.length,
        overdueOutstanding,
        currentOrders: currentItems.length,
        currentOutstanding: currentItems.reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0),
        futureOrders: futureItems.length,
        futureOutstanding: futureItems.reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0),
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
