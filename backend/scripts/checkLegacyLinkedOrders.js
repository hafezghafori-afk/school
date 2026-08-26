// Read-only diagnostic: reports how many FeeOrder documents still linked to a
// legacy FinanceBill (sourceBillId) are fully in sync with that bill (safe to
// disconnect once cutover work touches them), how many disagree with the bill
// on real money/status fields (need a human look, do not auto-disconnect),
// and how many point at a FinanceBill that no longer exists (dangling ref).
//
// Only compares fields that exist on BOTH models. outstandingAmount is
// FeeOrder-only (FinanceBill has no such field) and was previously compared
// here by mistake, which made every linked order look "drifted" - see
// docs/FINANCE_CORE_V2_EXECUTION_BACKLOG_FA.md phase 5 for the cutover this
// feeds into.
require('dotenv').config();
const mongoose = require('mongoose');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');

const FIELDS = ['amountOriginal', 'amountDue', 'amountPaid', 'status'];

function roundMoney(n) { return Math.round((Number(n) || 0) * 100) / 100; }

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const linkedOrders = await FeeOrder.find({ sourceBillId: { $ne: null } })
    .select('_id sourceBillId amountOriginal amountDue amountPaid status studentId studentMembershipId')
    .lean();

  const summary = {
    totalLinkedOrders: linkedOrders.length,
    safeToUnlink: 0,
    drifted: 0,
    missingBill: 0,
    driftDetails: [],
    missingBillDetails: []
  };

  for (const order of linkedOrders) {
    const bill = await FinanceBill.findById(order.sourceBillId)
      .select('_id amountOriginal amountDue amountPaid status')
      .lean();

    if (!bill) {
      summary.missingBill += 1;
      summary.missingBillDetails.push({ orderId: String(order._id), sourceBillId: String(order.sourceBillId) });
      continue;
    }

    const diffs = {};
    for (const field of FIELDS) {
      const a = field === 'status' ? String(order[field] || '') : roundMoney(order[field]);
      const b = field === 'status' ? String(bill[field] || '') : roundMoney(bill[field]);
      if (a !== b) diffs[field] = { order: a, bill: b };
    }

    if (Object.keys(diffs).length === 0) {
      summary.safeToUnlink += 1;
    } else {
      summary.drifted += 1;
      summary.driftDetails.push({ orderId: String(order._id), billId: String(bill._id), diffs });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
