const mongoose = require('mongoose');
require('dotenv').config();

const Attendance = require('../models/Attendance');
const Course = require('../models/Course');
const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Grade = require('../models/Grade');
const StudentMembership = require('../models/StudentMembership');
const { normalizeLinkScope } = require('../utils/financeLinkScope');

const args = new Set(process.argv.slice(2));
const showHelp = args.has('--help') || args.has('-h');

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function printHelp() {
  console.log('Usage: node ./scripts/checkTransactionMembershipIntegrity.js');
  console.log('');
  console.log('Checks that transaction models are linked to StudentMembership where required.');
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveRequirement({ linkScope = '', courseKind = '', classId = null } = {}) {
  const explicit = normalizeLinkScope(linkScope, '');
  if (explicit === 'membership' || explicit === 'student') return explicit;
  if (normalize(courseKind) === 'academic_class' || classId) return 'membership';
  if (normalize(courseKind)) return 'student';
  return 'student';
}

async function run() {
  if (showHelp) {
    printHelp();
    return;
  }

  await mongoose.connect(getMongoUri());

  try {
    const [courses, memberships, bills, receipts, feeOrders, feePayments, attendances, grades] = await Promise.all([
      Course.find({}).select('kind').lean(),
      StudentMembership.find({}).select('student course academicYearId academicYear').lean(),
      FinanceBill.find({}).select('student studentMembershipId course academicYearId classId linkScope').lean(),
      FinanceReceipt.find({}).select('student studentMembershipId course academicYearId classId bill linkScope').lean(),
      FeeOrder.find({}).select('student studentMembershipId course academicYearId classId linkScope').lean(),
      FeePayment.find({}).select('student studentMembershipId academicYearId classId feeOrderId linkScope').lean(),
      Attendance.find({}).select('student studentMembershipId course academicYearId').lean(),
      Grade.find({}).select('student studentMembershipId course academicYearId').lean()
    ]);

    const issues = [];
    const warnings = [];
    const membershipById = new Map(memberships.map((item) => [String(item._id), item]));
    const courseKindById = new Map(courses.map((item) => [String(item._id), normalize(item.kind)]));
    const billById = new Map(bills.map((item) => [String(item._id), item]));
    const feeOrderById = new Map(feeOrders.map((item) => [String(item._id), item]));

    const push = (bucket, code, detail) => {
      bucket.push({ code, ...detail });
    };

    for (const bill of bills) {
      const requirement = resolveRequirement({
        linkScope: bill.linkScope,
        courseKind: courseKindById.get(String(bill.course || '')) || '',
        classId: bill.classId || null
      });
      if (requirement === 'membership' && !bill.studentMembershipId) {
        push(issues, 'academic_bill_missing_membership', { id: String(bill._id) });
      }
      if (bill.studentMembershipId) {
        const membership = membershipById.get(String(bill.studentMembershipId));
        if (!membership) {
          push(issues, 'bill_membership_missing', { id: String(bill._id) });
        } else {
          if (normalize(membership.student) !== normalize(bill.student)) {
            push(issues, 'bill_student_membership_mismatch', { id: String(bill._id) });
          }
          if (normalize(membership.course) !== normalize(bill.course)) {
            push(issues, 'bill_course_membership_mismatch', { id: String(bill._id) });
          }
        }
      }
      if (requirement === 'student' && !bill.studentMembershipId) {
        push(warnings, 'non_academic_bill_without_membership', { id: String(bill._id) });
      }
    }

    for (const receipt of receipts) {
      const linkedBill = billById.get(String(receipt.bill || ''));
      const requirement = resolveRequirement({
        linkScope: receipt.linkScope || linkedBill?.linkScope || '',
        courseKind: courseKindById.get(String(receipt.course || linkedBill?.course || '')) || '',
        classId: receipt.classId || linkedBill?.classId || null
      });
      if (requirement === 'membership' && !receipt.studentMembershipId) {
        push(issues, 'academic_receipt_missing_membership', { id: String(receipt._id) });
      }
      if (receipt.studentMembershipId) {
        const membership = membershipById.get(String(receipt.studentMembershipId));
        if (!membership) {
          push(issues, 'receipt_membership_missing', { id: String(receipt._id) });
        }
      }
      if (receipt.bill) {
        const bill = billById.get(String(receipt.bill));
        if (bill && normalize(bill.studentMembershipId) !== normalize(receipt.studentMembershipId)) {
          push(issues, 'receipt_bill_membership_mismatch', { id: String(receipt._id) });
        }
      }
      if (requirement === 'student' && !receipt.studentMembershipId) {
        push(warnings, 'non_academic_receipt_without_membership', { id: String(receipt._id) });
      }
    }

    for (const feeOrder of feeOrders) {
      const requirement = resolveRequirement({
        linkScope: feeOrder.linkScope,
        courseKind: courseKindById.get(String(feeOrder.course || '')) || '',
        classId: feeOrder.classId || null
      });
      if (requirement === 'membership' && !feeOrder.studentMembershipId) {
        push(issues, 'academic_fee_order_missing_membership', { id: String(feeOrder._id) });
      }
      if (requirement === 'student' && !feeOrder.studentMembershipId) {
        push(warnings, 'non_academic_fee_order_without_membership', { id: String(feeOrder._id) });
      }
    }

    for (const feePayment of feePayments) {
      const linkedFeeOrder = feeOrderById.get(String(feePayment.feeOrderId || ''));
      const requirement = resolveRequirement({
        linkScope: feePayment.linkScope || linkedFeeOrder?.linkScope || '',
        courseKind: courseKindById.get(String(linkedFeeOrder?.course || '')) || '',
        classId: feePayment.classId || linkedFeeOrder?.classId || null
      });
      if (requirement === 'membership' && !feePayment.studentMembershipId) {
        push(issues, 'academic_fee_payment_missing_membership', { id: String(feePayment._id) });
      }
      if (feePayment.studentMembershipId) {
        const membership = membershipById.get(String(feePayment.studentMembershipId));
        if (!membership) {
          push(issues, 'fee_payment_membership_missing', { id: String(feePayment._id) });
        }
      }
      if (linkedFeeOrder && normalize(linkedFeeOrder.studentMembershipId) !== normalize(feePayment.studentMembershipId)) {
        push(issues, 'fee_payment_order_membership_mismatch', { id: String(feePayment._id) });
      }
      if (requirement === 'student' && !feePayment.studentMembershipId) {
        push(warnings, 'non_academic_fee_payment_without_membership', { id: String(feePayment._id) });
      }
    }

    for (const record of attendances) {
      const courseKind = courseKindById.get(String(record.course || '')) || '';
      if (courseKind === 'academic_class' && !record.studentMembershipId) {
        push(issues, 'attendance_missing_membership', { id: String(record._id) });
      }
    }

    for (const grade of grades) {
      const courseKind = courseKindById.get(String(grade.course || '')) || '';
      if (courseKind === 'academic_class' && !grade.studentMembershipId) {
        push(issues, 'grade_missing_membership', { id: String(grade._id) });
      }
    }

    const summary = {
      financeBills: bills.length,
      financeBillsWithMembership: bills.filter((item) => !!item.studentMembershipId).length,
      financeReceipts: receipts.length,
      financeReceiptsWithMembership: receipts.filter((item) => !!item.studentMembershipId).length,
      feeOrders: feeOrders.length,
      feeOrdersWithMembership: feeOrders.filter((item) => !!item.studentMembershipId).length,
      feePayments: feePayments.length,
      feePaymentsWithMembership: feePayments.filter((item) => !!item.studentMembershipId).length,
      attendances: attendances.length,
      attendancesWithMembership: attendances.filter((item) => !!item.studentMembershipId).length,
      grades: grades.length,
      gradesWithMembership: grades.filter((item) => !!item.studentMembershipId).length,
      issues: issues.length,
      warnings: warnings.length
    };

    console.log(`[check:transaction-memberships] ${JSON.stringify(summary)}`);

    if (issues.length) {
      console.log('[check:transaction-memberships] first issues:');
      issues.slice(0, 20).forEach((item) => console.log(` - ${item.code}: ${item.id}`));
      process.exitCode = 1;
    }

    if (warnings.length) {
      console.log('[check:transaction-memberships] first warnings:');
      warnings.slice(0, 20).forEach((item) => console.log(` - ${item.code}: ${item.id}`));
    }

    if (!issues.length) {
      console.log('[check:transaction-memberships] ok');
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[check:transaction-memberships] failed:', error);
  process.exit(1);
});
