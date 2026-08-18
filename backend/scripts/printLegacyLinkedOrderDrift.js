// Verbose companion to checkLegacyLinkedOrders.js: same in-sync/drift/missing
// classification, but prints per-record detail (student, class, amounts on
// both sides) for a human to review the drifted/missing rows individually.
// Only compares fields that exist on BOTH models - FinanceBill has no
// outstandingAmount field, so it is intentionally excluded here (see
// checkLegacyLinkedOrders.js for why that comparison used to be wrong).
require('dotenv').config();
const mongoose = require('mongoose');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
require('../models/StudentCore');
require('../models/SchoolClass');
require('../models/User');

function roundMoney(n) { return Math.round((Number(n) || 0) * 100) / 100; }
const FIELDS = ['amountOriginal', 'amountDue', 'amountPaid', 'status'];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const linkedOrders = await FeeOrder.find({ sourceBillId: { $ne: null } })
    .select('_id sourceBillId amountOriginal amountDue amountPaid status studentId classId academicYearId dueDate createdAt orderType')
    .populate('studentId', 'fullName')
    .populate('classId', 'name nameDari')
    .lean();

  const rows = [];
  for (const order of linkedOrders) {
    const bill = await FinanceBill.findById(order.sourceBillId)
      .select('_id amountOriginal amountDue amountPaid status createdAt')
      .lean();

    const studentName = order.studentId?.fullName || '(نامشخص)';
    const className = order.classId?.nameDari || order.classId?.name || '(نامشخص)';

    if (!bill) {
      rows.push({
        kind: 'MISSING_BILL',
        orderId: String(order._id),
        sourceBillId: String(order.sourceBillId),
        student: studentName,
        class: className,
        orderType: order.orderType || '',
        dueDate: order.dueDate,
        order: {
          amountOriginal: order.amountOriginal, amountDue: order.amountDue,
          amountPaid: order.amountPaid, outstandingAmount: order.outstandingAmount, status: order.status
        }
      });
      continue;
    }

    const diffs = {};
    for (const field of FIELDS) {
      const a = field === 'status' ? String(order[field] || '') : roundMoney(order[field]);
      const b = field === 'status' ? String(bill[field] || '') : roundMoney(bill[field]);
      if (a !== b) diffs[field] = { order: a, bill: b };
    }

    if (Object.keys(diffs).length > 0) {
      rows.push({
        kind: 'DRIFT',
        orderId: String(order._id),
        billId: String(bill._id),
        student: studentName,
        class: className,
        orderType: order.orderType || '',
        dueDate: order.dueDate,
        billCreatedAt: bill.createdAt,
        orderCreatedAt: order.createdAt,
        diffs
      });
    }
  }

  console.log(JSON.stringify({ total: rows.length, rows }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('FAILED:', error.message, error.stack);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
