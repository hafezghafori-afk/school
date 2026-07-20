require('dotenv').config();
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const { syncApprovedFeePaymentToTreasury } = require('../services/treasuryGovernanceService');

const shouldApply = process.argv.includes('--apply');

const normalizeId = (value) => String(value?._id || value || '').trim();
const isAdmissionOrder = (order = {}) => (
  String(order.orderType || '').trim() === 'admission'
  || (Array.isArray(order.lineItems) && order.lineItems.some((item) => String(item?.feeType || '').trim() === 'admission'))
);

function buildRepairPaymentNumber(orderId = '') {
  return `PAY-ADM-${normalizeId(orderId).slice(-12).toUpperCase()}`;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', {
    autoIndex: false,
    autoCreate: false
  });

  const summary = {
    mode: shouldApply ? 'apply' : 'dry-run',
    paidAdmissionOrders: 0,
    paymentEvidencePresent: 0,
    paymentEvidenceMissing: 0,
    repaired: 0,
    skippedWithExistingPendingPayment: 0
  };

  try {
    const orders = await FeeOrder.find({
      status: 'paid',
      amountPaid: { $gt: 0 },
      $or: [
        { orderType: 'admission' },
        { 'lineItems.feeType': 'admission' }
      ]
    }).lean();
    summary.paidAdmissionOrders = orders.filter(isAdmissionOrder).length;

    for (const order of orders.filter(isAdmissionOrder)) {
      const existingPayment = await FeePayment.findOne({
        $or: [
          { feeOrderId: order._id },
          { 'allocations.feeOrderId': order._id }
        ]
      }).sort({ status: 1, createdAt: -1 }).lean();

      if (existingPayment?.status === 'approved') {
        summary.paymentEvidencePresent += 1;
        continue;
      }
      if (existingPayment) {
        summary.skippedWithExistingPendingPayment += 1;
        continue;
      }

      summary.paymentEvidenceMissing += 1;
      if (!shouldApply) continue;

      const paidAt = order.paidAt || order.updatedAt || order.createdAt || new Date();
      const amount = Math.max(0, Number(order.amountPaid || 0));
      if (amount <= 0) continue;
      const actorId = order.createdBy || null;
      const paymentNumber = buildRepairPaymentNumber(order._id);
      let payment = await FeePayment.findOne({ paymentNumber });
      if (!payment) {
        payment = await FeePayment.create({
          paymentNumber,
          feeOrderId: order._id,
          source: 'migration',
          student: order.student,
          studentId: order.studentId || null,
          studentMembershipId: order.studentMembershipId || null,
          linkScope: order.linkScope || 'membership',
          schoolId: order.schoolId || null,
          classId: order.classId || null,
          academicYearId: order.academicYearId || null,
          payerType: 'student_guardian',
          receivedBy: actorId,
          amount,
          currency: String(order.currency || 'AFN').trim().toUpperCase() || 'AFN',
          paymentMethod: 'manual',
          allocationMode: 'single_order',
          allocations: [{
            feeOrderId: order._id,
            amount,
            title: String(order.title || 'داخله').trim(),
            orderNumber: String(order.orderNumber || '').trim()
          }],
          paidAt,
          note: 'ترمیم سند پرداخت داخله‌ای که قبلاً پرداخت‌شده علامت‌گذاری شده بود.',
          status: 'approved',
          approvalStage: 'completed',
          reviewedBy: actorId,
          reviewedAt: paidAt,
          reviewNote: 'ترمیم شواهد پرداخت داخله از داده موجود.',
          approvalTrail: actorId ? [{
            level: 'finance_manager',
            action: 'approve',
            by: actorId,
            at: paidAt,
            note: 'ترمیم داده تاریخی',
            reason: 'missing_payment_evidence'
          }] : []
        });
      }
      await syncApprovedFeePaymentToTreasury(payment).catch(() => null);
      summary.repaired += 1;
    }

    console.log(`[repair:admission-payment-evidence] ${JSON.stringify(summary)}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[repair:admission-payment-evidence] failed:', error?.stack || error);
  process.exitCode = 1;
});
