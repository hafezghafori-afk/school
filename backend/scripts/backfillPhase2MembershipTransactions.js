const mongoose = require('mongoose');
require('dotenv').config();

const Attendance = require('../models/Attendance');
const Course = require('../models/Course');
const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const Grade = require('../models/Grade');
const { resolveMembershipTransactionLink } = require('../utils/studentMembershipLookup');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function idsEqual(left, right) {
  return String(left || '') === String(right || '');
}

function patchValue(target, key, value) {
  const normalizedValue = value || null;
  if (normalizedValue === null) {
    if (target[key] !== null) {
      target[key] = null;
      return true;
    }
    return false;
  }
  if (!idsEqual(target[key], normalizedValue)) {
    target[key] = normalizedValue;
    return true;
  }
  return false;
}

async function run() {
  const args = parseArgs();
  const dryRun = Boolean(args['dry-run']);
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

  await mongoose.connect(mongoUri);

  const stats = {
    financeBillsUpdated: 0,
    financeBillsAcademicMissingMembership: 0,
    financeBillsPublicCourseWithoutMembership: 0,
    financeReceiptsUpdated: 0,
    financeReceiptsAcademicMissingMembership: 0,
    financeReceiptsPublicCourseWithoutMembership: 0,
    attendancesUpdated: 0,
    attendanceMissingMembership: 0,
    gradesUpdated: 0,
    gradeMissingMembership: 0,
    gradeLegacyUniqueIndexDropped: 0,
    gradeMembershipUniqueIndexEnsured: 0
  };

  try {
    const courseKindById = new Map(
      (await Course.find({}).select('kind').lean()).map((item) => [String(item._id), String(item.kind || '').trim()])
    );

    const bills = await FinanceBill.find({});
    for (const bill of bills) {
      const { membership, linkFields } = await resolveMembershipTransactionLink({
        studentUserId: bill.student,
        courseId: bill.course,
        academicYearId: bill.academicYearId,
        academicYear: bill.academicYear,
        statuses: null
      });

      let changed = false;
      changed = patchValue(bill, 'studentMembershipId', linkFields.studentMembershipId) || changed;
      changed = patchValue(bill, 'studentId', linkFields.studentId) || changed;
      changed = patchValue(bill, 'classId', linkFields.classId) || changed;
      changed = patchValue(bill, 'academicYearId', linkFields.academicYearId) || changed;

      const courseKind = courseKindById.get(String(bill.course || '')) || '';
      if (!membership && courseKind === 'academic_class') {
        stats.financeBillsAcademicMissingMembership += 1;
      } else if (!membership) {
        stats.financeBillsPublicCourseWithoutMembership += 1;
      }

      if (changed) {
        stats.financeBillsUpdated += 1;
        if (!dryRun) await bill.save();
      }
    }

    const receipts = await FinanceReceipt.find({}).populate('bill');
    for (const receipt of receipts) {
      const bill = receipt.bill || null;
      const membershipId = bill?.studentMembershipId || null;
      const { membership, linkFields } = membershipId
        ? {
            membership: membershipId,
            linkFields: {
              studentMembershipId: membershipId,
              studentId: bill.studentId || null,
              classId: bill.classId || null,
              academicYearId: bill.academicYearId || null
            }
          }
        : await resolveMembershipTransactionLink({
            studentUserId: receipt.student,
            courseId: receipt.course,
            academicYearId: receipt.academicYearId,
            statuses: null
          });

      let changed = false;
      changed = patchValue(receipt, 'studentMembershipId', linkFields.studentMembershipId) || changed;
      changed = patchValue(receipt, 'studentId', linkFields.studentId) || changed;
      changed = patchValue(receipt, 'classId', linkFields.classId) || changed;
      changed = patchValue(receipt, 'academicYearId', linkFields.academicYearId) || changed;

      const courseKind = courseKindById.get(String(receipt.course || '')) || '';
      if (!membership && courseKind === 'academic_class') {
        stats.financeReceiptsAcademicMissingMembership += 1;
      } else if (!membership) {
        stats.financeReceiptsPublicCourseWithoutMembership += 1;
      }

      if (changed) {
        stats.financeReceiptsUpdated += 1;
        if (!dryRun) await receipt.save();
      }
    }

    const attendanceRows = await Attendance.find({});
    for (const record of attendanceRows) {
      const { membership, linkFields } = await resolveMembershipTransactionLink({
        studentUserId: record.student,
        courseId: record.course,
        academicYearId: record.academicYearId,
        statuses: null
      });

      let changed = false;
      changed = patchValue(record, 'studentMembershipId', linkFields.studentMembershipId) || changed;
      changed = patchValue(record, 'studentId', linkFields.studentId) || changed;
      changed = patchValue(record, 'classId', linkFields.classId) || changed;
      changed = patchValue(record, 'academicYearId', linkFields.academicYearId) || changed;

      if (!membership) {
        stats.attendanceMissingMembership += 1;
      }

      if (changed) {
        stats.attendancesUpdated += 1;
        if (!dryRun) await record.save();
      }
    }

    const grades = await Grade.find({});
    for (const grade of grades) {
      const { membership, linkFields } = await resolveMembershipTransactionLink({
        studentUserId: grade.student,
        courseId: grade.course,
        academicYearId: grade.academicYearId,
        statuses: null
      });

      let changed = false;
      changed = patchValue(grade, 'studentMembershipId', linkFields.studentMembershipId) || changed;
      changed = patchValue(grade, 'studentId', linkFields.studentId) || changed;
      changed = patchValue(grade, 'classId', linkFields.classId) || changed;
      changed = patchValue(grade, 'academicYearId', linkFields.academicYearId) || changed;

      if (!membership) {
        stats.gradeMissingMembership += 1;
      }

      if (changed) {
        stats.gradesUpdated += 1;
        if (!dryRun) await grade.save();
      }
    }

    const gradeIndexes = await Grade.collection.indexes();
    const legacyGradeIndex = gradeIndexes.find((item) => item.name === 'student_1_course_1' && item.unique);
    if (legacyGradeIndex) {
      stats.gradeLegacyUniqueIndexDropped += 1;
      if (!dryRun) {
        await Grade.collection.dropIndex(legacyGradeIndex.name);
      }
    }

    const membershipIndex = gradeIndexes.find((item) => item.name === 'studentMembershipId_1');
    const membershipIndexIsCompatible = Boolean(
      membershipIndex
      && membershipIndex.unique
      && membershipIndex.partialFilterExpression
      && membershipIndex.partialFilterExpression.studentMembershipId
      && membershipIndex.partialFilterExpression.studentMembershipId.$type === 'objectId'
    );

    if (membershipIndex && !membershipIndexIsCompatible) {
      stats.gradeLegacyUniqueIndexDropped += 1;
      if (!dryRun) {
        await Grade.collection.dropIndex(membershipIndex.name);
      }
    }

    if (!membershipIndexIsCompatible) {
      stats.gradeMembershipUniqueIndexEnsured += 1;
      if (!dryRun) {
        await Grade.collection.createIndex(
          { studentMembershipId: 1 },
          {
            unique: true,
            partialFilterExpression: { studentMembershipId: { $type: 'objectId' } },
            name: 'studentMembershipId_1'
          }
        );
      }
    }

    console.log(`[backfill:phase2-membership-transactions] ${JSON.stringify(stats)}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[backfill:phase2-membership-transactions] failed:', error);
  process.exit(1);
});
