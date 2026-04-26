require('dotenv').config();
const mongoose = require('mongoose');

const Course = require('../models/Course');
const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Discount = require('../models/Discount');
const { normalizeLinkScope } = require('../utils/financeLinkScope');

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveExpectedScope({ linkScope = '', studentMembershipId = null, classId = null, courseKind = '', fallbackLinkScope = '' } = {}) {
  const normalizedExplicit = normalizeLinkScope(linkScope || fallbackLinkScope, '');
  if (normalize(courseKind) === 'academic_class' || studentMembershipId || classId) {
    return 'membership';
  }
  return normalizedExplicit || 'student';
}

function pushIssue(bucket, code, id) {
  bucket.push({ code, id: String(id || '') });
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');

  try {
    const [courses, bills, receipts, feeOrders, feePayments, discounts] = await Promise.all([
      Course.find({}).select('kind').lean(),
      FinanceBill.find({}).select('linkScope studentMembershipId classId course').lean(),
      FinanceReceipt.find({}).select('linkScope studentMembershipId classId course bill').lean(),
      FeeOrder.find({}).select('linkScope studentMembershipId classId course').lean(),
      FeePayment.find({}).select('linkScope studentMembershipId classId feeOrderId').lean(),
      Discount.find({}).select('linkScope studentMembershipId classId feeOrderId sourceBillId').lean()
    ]);

    const courseKindById = new Map(courses.map((item) => [String(item._id), normalize(item.kind)]));
    const billById = new Map(bills.map((item) => [String(item._id), item]));
    const feeOrderById = new Map(feeOrders.map((item) => [String(item._id), item]));
    const issues = [];

    const checkRow = ({ row, id, expectedScope, studentMembershipId = null, classId = null, label }) => {
      const actual = normalizeLinkScope(row.linkScope, '');
      if (!actual) {
        pushIssue(issues, `${label}_missing_link_scope`, id);
        return;
      }
      if (actual !== expectedScope) {
        pushIssue(issues, `${label}_link_scope_mismatch`, id);
      }
      if (actual === 'membership' && !studentMembershipId) {
        pushIssue(issues, `${label}_membership_scope_missing_membership`, id);
      }
      if (actual === 'student' && classId) {
        pushIssue(issues, `${label}_student_scope_with_class`, id);
      }
    };

    for (const row of bills) {
      checkRow({
        row,
        id: row._id,
        expectedScope: resolveExpectedScope({
          linkScope: row.linkScope,
          studentMembershipId: row.studentMembershipId,
          classId: row.classId,
          courseKind: courseKindById.get(String(row.course || '')) || ''
        }),
        studentMembershipId: row.studentMembershipId,
        classId: row.classId,
        label: 'finance_bill'
      });
    }

    for (const row of receipts) {
      const bill = billById.get(String(row.bill || ''));
      checkRow({
        row,
        id: row._id,
        expectedScope: resolveExpectedScope({
          linkScope: row.linkScope,
          studentMembershipId: row.studentMembershipId || bill?.studentMembershipId || null,
          classId: row.classId || bill?.classId || null,
          courseKind: courseKindById.get(String(row.course || bill?.course || '')) || '',
          fallbackLinkScope: bill?.linkScope || ''
        }),
        studentMembershipId: row.studentMembershipId || bill?.studentMembershipId || null,
        classId: row.classId || bill?.classId || null,
        label: 'finance_receipt'
      });
    }

    for (const row of feeOrders) {
      checkRow({
        row,
        id: row._id,
        expectedScope: resolveExpectedScope({
          linkScope: row.linkScope,
          studentMembershipId: row.studentMembershipId,
          classId: row.classId,
          courseKind: courseKindById.get(String(row.course || '')) || ''
        }),
        studentMembershipId: row.studentMembershipId,
        classId: row.classId,
        label: 'fee_order'
      });
    }

    for (const row of feePayments) {
      const feeOrder = feeOrderById.get(String(row.feeOrderId || ''));
      checkRow({
        row,
        id: row._id,
        expectedScope: resolveExpectedScope({
          linkScope: row.linkScope,
          studentMembershipId: row.studentMembershipId || feeOrder?.studentMembershipId || null,
          classId: row.classId || feeOrder?.classId || null,
          courseKind: courseKindById.get(String(feeOrder?.course || '')) || '',
          fallbackLinkScope: feeOrder?.linkScope || ''
        }),
        studentMembershipId: row.studentMembershipId || feeOrder?.studentMembershipId || null,
        classId: row.classId || feeOrder?.classId || null,
        label: 'fee_payment'
      });
    }

    for (const row of discounts) {
      const feeOrder = feeOrderById.get(String(row.feeOrderId || ''));
      const bill = billById.get(String(row.sourceBillId || ''));
      checkRow({
        row,
        id: row._id,
        expectedScope: resolveExpectedScope({
          linkScope: row.linkScope,
          studentMembershipId: row.studentMembershipId || feeOrder?.studentMembershipId || bill?.studentMembershipId || null,
          classId: row.classId || feeOrder?.classId || bill?.classId || null,
          courseKind: courseKindById.get(String(feeOrder?.course || bill?.course || '')) || '',
          fallbackLinkScope: feeOrder?.linkScope || bill?.linkScope || ''
        }),
        studentMembershipId: row.studentMembershipId || feeOrder?.studentMembershipId || bill?.studentMembershipId || null,
        classId: row.classId || feeOrder?.classId || bill?.classId || null,
        label: 'discount'
      });
    }

    const summary = {
      financeBills: bills.length,
      financeReceipts: receipts.length,
      feeOrders: feeOrders.length,
      feePayments: feePayments.length,
      discounts: discounts.length,
      issues: issues.length
    };

    console.log(`[check:finance-link-scope] ${JSON.stringify(summary)}`);
    if (issues.length) {
      console.log('[check:finance-link-scope] first issues:');
      issues.slice(0, 20).forEach((item) => console.log(` - ${item.code}: ${item.id}`));
      process.exitCode = 1;
      return;
    }

    console.log('[check:finance-link-scope] ok');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[check:finance-link-scope] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
