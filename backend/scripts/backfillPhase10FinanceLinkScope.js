require('dotenv').config();
const mongoose = require('mongoose');

const Course = require('../models/Course');
const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Discount = require('../models/Discount');
const { deriveLinkScope, normalizeLinkScope } = require('../utils/financeLinkScope');

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveScopedLink({ currentLinkScope = '', studentMembershipId = null, classId = null, courseKind = '', fallbackLinkScope = '' } = {}) {
  if (normalize(courseKind) === 'academic_class') {
    return 'membership';
  }
  return deriveLinkScope({
    linkScope: currentLinkScope || fallbackLinkScope,
    studentMembershipId,
    classId
  });
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');

  try {
    const [courses, feeOrders, bills] = await Promise.all([
      Course.find({}).select('kind').lean(),
      FeeOrder.find({}).select('course classId studentMembershipId linkScope').lean(),
      FinanceBill.find({}).select('course classId studentMembershipId linkScope').lean()
    ]);

    const courseKindById = new Map(courses.map((item) => [String(item._id), normalize(item.kind)]));
    const feeOrderById = new Map(feeOrders.map((item) => [String(item._id), item]));
    const billById = new Map(bills.map((item) => [String(item._id), item]));

    const summary = {
      dryRun,
      financeBillsUpdated: 0,
      financeReceiptsUpdated: 0,
      feeOrdersUpdated: 0,
      feePaymentsUpdated: 0,
      discountsUpdated: 0
    };

    const rawBills = await FinanceBill.find({}).select('linkScope studentMembershipId classId course').lean();
    for (const bill of rawBills) {
      const desired = resolveScopedLink({
        currentLinkScope: bill.linkScope,
        studentMembershipId: bill.studentMembershipId,
        classId: bill.classId,
        courseKind: courseKindById.get(String(bill.course || '')) || ''
      });
      if (normalizeLinkScope(bill.linkScope, '') === desired) continue;
      summary.financeBillsUpdated += 1;
      if (!dryRun) {
        await FinanceBill.updateOne({ _id: bill._id }, { $set: { linkScope: desired } });
      }
    }

    const rawReceipts = await FinanceReceipt.find({}).select('linkScope studentMembershipId classId course bill').lean();
    for (const receipt of rawReceipts) {
      const linkedBill = billById.get(String(receipt.bill || ''));
      const desired = resolveScopedLink({
        currentLinkScope: receipt.linkScope,
        studentMembershipId: receipt.studentMembershipId || linkedBill?.studentMembershipId || null,
        classId: receipt.classId || linkedBill?.classId || null,
        courseKind: courseKindById.get(String(receipt.course || linkedBill?.course || '')) || '',
        fallbackLinkScope: linkedBill?.linkScope || ''
      });
      if (normalizeLinkScope(receipt.linkScope, '') === desired) continue;
      summary.financeReceiptsUpdated += 1;
      if (!dryRun) {
        await FinanceReceipt.updateOne({ _id: receipt._id }, { $set: { linkScope: desired } });
      }
    }

    const rawFeeOrders = await FeeOrder.find({}).select('linkScope studentMembershipId classId course').lean();
    for (const feeOrder of rawFeeOrders) {
      const desired = resolveScopedLink({
        currentLinkScope: feeOrder.linkScope,
        studentMembershipId: feeOrder.studentMembershipId,
        classId: feeOrder.classId,
        courseKind: courseKindById.get(String(feeOrder.course || '')) || ''
      });
      if (normalizeLinkScope(feeOrder.linkScope, '') === desired) continue;
      summary.feeOrdersUpdated += 1;
      if (!dryRun) {
        await FeeOrder.updateOne({ _id: feeOrder._id }, { $set: { linkScope: desired } });
      }
    }

    const rawFeePayments = await FeePayment.find({}).select('linkScope studentMembershipId classId feeOrderId').lean();
    for (const payment of rawFeePayments) {
      const linkedFeeOrder = feeOrderById.get(String(payment.feeOrderId || ''));
      const desired = resolveScopedLink({
        currentLinkScope: payment.linkScope,
        studentMembershipId: payment.studentMembershipId || linkedFeeOrder?.studentMembershipId || null,
        classId: payment.classId || linkedFeeOrder?.classId || null,
        courseKind: courseKindById.get(String(linkedFeeOrder?.course || '')) || '',
        fallbackLinkScope: linkedFeeOrder?.linkScope || ''
      });
      if (normalizeLinkScope(payment.linkScope, '') === desired) continue;
      summary.feePaymentsUpdated += 1;
      if (!dryRun) {
        await FeePayment.updateOne({ _id: payment._id }, { $set: { linkScope: desired } });
      }
    }

    const rawDiscounts = await Discount.find({}).select('linkScope studentMembershipId classId feeOrderId sourceBillId').lean();
    for (const discount of rawDiscounts) {
      const linkedFeeOrder = feeOrderById.get(String(discount.feeOrderId || ''));
      const linkedBill = billById.get(String(discount.sourceBillId || ''));
      const desired = resolveScopedLink({
        currentLinkScope: discount.linkScope,
        studentMembershipId: discount.studentMembershipId || linkedFeeOrder?.studentMembershipId || linkedBill?.studentMembershipId || null,
        classId: discount.classId || linkedFeeOrder?.classId || linkedBill?.classId || null,
        courseKind: courseKindById.get(String(linkedFeeOrder?.course || linkedBill?.course || '')) || '',
        fallbackLinkScope: linkedFeeOrder?.linkScope || linkedBill?.linkScope || ''
      });
      if (normalizeLinkScope(discount.linkScope, '') === desired) continue;
      summary.discountsUpdated += 1;
      if (!dryRun) {
        await Discount.updateOne({ _id: discount._id }, { $set: { linkScope: desired } });
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
