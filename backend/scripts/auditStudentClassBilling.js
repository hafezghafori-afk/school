const mongoose = require('mongoose');
require('dotenv').config();

const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const AfghanStudent = require('../models/AfghanStudent');
const SchoolClass = require('../models/SchoolClass');
const {
  getFinanceRecordFeeTypes,
  normalizePeriodText,
  solarMonthKey
} = require('../utils/studentBillingPeriodIntegrity');

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const schoolId = valueAfter('--school-id');
const sampleLimit = Math.max(1, Math.min(100, Number(valueAfter('--samples')) || 20));
const idOf = (value = '') => String(value?._id || value || '').trim();
const unique = (items = []) => [...new Set(items.filter(Boolean))];
const currentStatuses = new Set(['active', 'pending', 'suspended', 'transferred_in']);

const groupBy = (items, keyOf) => {
  const groups = new Map();
  items.forEach((item) => {
    const key = keyOf(item);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.values()];
};

async function run() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  await mongoose.connect(mongoUri);
  try {
    const classes = await SchoolClass.find(schoolId ? { schoolId } : {})
      .select('_id title schoolId academicYearId')
      .lean();
    const classById = new Map(classes.map((item) => [idOf(item), item]));
    const classIds = classes.map((item) => item._id);
    const schoolScope = schoolId
      ? { $or: [{ schoolId }, { schoolId: null, classId: { $in: classIds } }] }
      : {};
    const [memberships, orders, afghanStudents] = await Promise.all([
      StudentMembership.find({ ...schoolScope, endedReason: { $ne: 'deleted_by_admin' } })
        .select('_id student afghanStudentId classId academicYear academicYearId status isCurrent endedAt leftAt')
        .lean(),
      FeeOrder.find({ ...schoolScope, status: { $ne: 'void' }, outstandingAmount: { $gt: 0 } })
        .select('_id orderNumber student studentMembershipId classId academicYearId periodType periodLabel dueDate orderType feeScopes lineItems.feeType outstandingAmount status')
        .lean(),
      AfghanStudent.find({ status: { $ne: 'deleted' } })
        .select('_id linkedUserId asasNumber registrationId')
        .lean()
    ]);
    const membershipById = new Map(memberships.map((item) => [idOf(item), item]));
    const afghanById = new Map(afghanStudents.map((item) => [idOf(item), item]));
    const afghanByUserId = new Map(afghanStudents.filter((item) => item.linkedUserId).map((item) => [idOf(item.linkedUserId), item]));
    const yearOf = (membership) => idOf(membership?.academicYearId || membership?.academicYear);
    const classOf = (record) => idOf(record?.classId || membershipById.get(idOf(record?.studentMembershipId))?.classId);
    const classTitle = (classId) => String(classById.get(classId)?.title || classId || '').trim();
    const asasOf = (membership) => {
      const profile = afghanById.get(idOf(membership?.afghanStudentId)) || afghanByUserId.get(idOf(membership?.student));
      return String(profile?.asasNumber || profile?.registrationId || '').trim();
    };

    const currentMemberships = memberships.filter((item) => (
      item.isCurrent === true && currentStatuses.has(String(item.status || '').trim()) && item.classId
    ));
    const currentByUser = groupBy(currentMemberships, (item) => `${idOf(item.student)}|${yearOf(item)}`)
      .filter((group) => unique(group.map((item) => idOf(item.classId))).length > 1);
    const currentByAsas = groupBy(currentMemberships, (item) => {
      const asas = normalizePeriodText(asasOf(item));
      return asas ? `${asas}|${yearOf(item)}` : '';
    }).filter((group) => unique(group.map((item) => idOf(item.classId))).length > 1);

    const openMonthlyTuition = orders.filter((item) => (
      String(item.periodType || '').trim() === 'monthly'
      && getFinanceRecordFeeTypes(item).includes('tuition')
    ));
    const sameMonthCrossClass = groupBy(openMonthlyTuition, (item) => (
      `${idOf(item.student)}|${solarMonthKey(item.dueDate) || normalizePeriodText(item.periodLabel)}`
    )).filter((group) => unique(group.map(classOf)).length > 1);
    const openOnEndedMembership = orders.filter((item) => {
      const membership = membershipById.get(idOf(item.studentMembershipId));
      return membership && !(membership.isCurrent === true && currentStatuses.has(String(membership.status || '').trim()));
    });

    const describeMembershipGroup = (group) => ({
      studentId: idOf(group[0]?.student),
      asasNumber: asasOf(group[0]),
      classes: unique(group.map((item) => classTitle(idOf(item.classId)))),
      membershipIds: group.map(idOf)
    });
    const describeOrderGroup = (group) => ({
      studentId: idOf(group[0]?.student),
      month: solarMonthKey(group[0]?.dueDate) || String(group[0]?.periodLabel || ''),
      classes: unique(group.map((item) => classTitle(classOf(item)))),
      orders: group.map((item) => String(item.orderNumber || idOf(item)))
    });

    console.log(JSON.stringify({
      mode: 'read-only',
      database: mongoose.connection.name,
      schoolId: schoolId || 'all',
      scanned: {
        memberships: memberships.length,
        currentMemberships: currentMemberships.length,
        openOrders: orders.length,
        openMonthlyTuitionOrders: openMonthlyTuition.length
      },
      anomalies: {
        studentsWithMultipleCurrentClassesSameYear: currentByUser.length,
        asasNumbersWithMultipleCurrentClassesSameYear: currentByAsas.length,
        studentsWithOpenTuitionInMultipleClassesSameMonth: sameMonthCrossClass.length,
        openOrdersLinkedToEndedMemberships: openOnEndedMembership.length
      },
      samples: {
        multipleCurrentClasses: currentByUser.slice(0, sampleLimit).map(describeMembershipGroup),
        multipleCurrentClassesByAsas: currentByAsas.slice(0, sampleLimit).map(describeMembershipGroup),
        sameMonthCrossClassBills: sameMonthCrossClass.slice(0, sampleLimit).map(describeOrderGroup),
        endedMembershipOpenOrders: openOnEndedMembership.slice(0, sampleLimit).map((item) => ({
          studentId: idOf(item.student),
          orderNumber: String(item.orderNumber || ''),
          membershipId: idOf(item.studentMembershipId),
          class: classTitle(classOf(item)),
          month: solarMonthKey(item.dueDate) || String(item.periodLabel || ''),
          outstandingAmount: Number(item.outstandingAmount || 0)
        }))
      }
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[audit:student-class-billing] failed:', error?.stack || error);
  process.exitCode = 1;
});
