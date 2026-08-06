const FinanceRefund = require('../models/FinanceRefund');

function roundMoney(value = 0) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function normalizeId(value = '') {
  return String(value?._id || value || '').trim();
}

// Money already paid back to a student (FinanceRefund.status === 'paid') must
// not keep counting as revenue. This is queried the same way approved
// payments are - scoped by school/class/academic year and bucketed by the
// date the refund was actually paid out (paidAt), so it lands in whichever
// period/report the payout happened in, not the period the original bill
// was for.
async function sumPaidRefunds({
  schoolId = '',
  classId = '',
  academicYearId = '',
  startAt = null,
  endAt = null
} = {}) {
  const filter = { status: 'paid' };
  const normalizedSchoolId = normalizeId(schoolId);
  const normalizedClassId = normalizeId(classId);
  const normalizedAcademicYearId = normalizeId(academicYearId);
  if (normalizedSchoolId) filter.schoolId = normalizedSchoolId;
  if (normalizedClassId) filter.classId = normalizedClassId;
  if (normalizedAcademicYearId) filter.academicYearId = normalizedAcademicYearId;
  if (startAt || endAt) {
    filter.paidAt = {};
    if (startAt) filter.paidAt.$gte = startAt;
    if (endAt) filter.paidAt.$lte = endAt;
  }

  const rows = await FinanceRefund.find(filter)
    .select('amount classId paidAt refundNumber student')
    .lean();

  return {
    total: roundMoney(rows.reduce((sum, item) => sum + Number(item?.amount || 0), 0)),
    count: rows.length,
    rows
  };
}

module.exports = { sumPaidRefunds };
