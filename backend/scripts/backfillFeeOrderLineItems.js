require('dotenv').config();
const mongoose = require('mongoose');

const FinanceBill = require('../models/FinanceBill');
const FeeOrder = require('../models/FeeOrder');
const {
  normalizeFinanceLineItems,
  buildFeeBreakdownFromLineItems,
  buildFeeScopesFromLineItems,
  inferPrimaryOrderType
} = require('../utils/financeLineItems');

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function toComparableDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function sameJson(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

function normalizeBillSnapshot(item = {}) {
  const lineItems = normalizeFinanceLineItems({
    lineItems: item.lineItems,
    feeBreakdown: item.feeBreakdown,
    feeScopes: item.feeScopes,
    amountOriginal: item.amountOriginal,
    adjustments: item.adjustments,
    amountPaid: item.amountPaid,
    defaultType: 'tuition'
  });
  const feeBreakdown = buildFeeBreakdownFromLineItems(lineItems);
  const feeScopes = buildFeeScopesFromLineItems(lineItems);
  return {
    lineItems,
    feeBreakdown,
    feeScopes,
    amountOriginal: Object.values(feeBreakdown).reduce((sum, value) => sum + (Number(value) || 0), 0),
    amountDue: lineItems.reduce((sum, value) => sum + (Number(value?.netAmount) || 0), 0)
  };
}

function normalizeOrderSnapshot(item = {}, sourceBill = null) {
  const lineItems = normalizeFinanceLineItems({
    lineItems: item.lineItems,
    feeBreakdown: sourceBill?.feeBreakdown,
    feeScopes: sourceBill?.feeScopes,
    amountOriginal: item.amountOriginal,
    adjustments: item.adjustments,
    amountPaid: item.amountPaid,
    defaultType: item.orderType || 'tuition',
    sourcePlanId: (sourceBill?.lineItems || []).find((line) => line?.sourcePlanId)?.sourcePlanId || null,
    periodKey: item.periodLabel || ''
  });
  const feeBreakdown = buildFeeBreakdownFromLineItems(lineItems);
  const amountOriginal = Object.values(feeBreakdown).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const amountDue = lineItems.reduce((sum, value) => sum + (Number(value?.netAmount) || 0), 0);
  const amountPaid = Math.max(0, Number(item.amountPaid) || 0);
  return {
    lineItems,
    orderType: inferPrimaryOrderType(lineItems, item.orderType || 'tuition'),
    amountOriginal,
    amountDue,
    outstandingAmount: Math.max(0, amountDue - amountPaid)
  };
}

async function run() {
  await mongoose.connect(MONGO_URI);

  const summary = {
    dryRun: DRY_RUN,
    billsScanned: 0,
    billsUpdated: 0,
    ordersScanned: 0,
    ordersUpdated: 0
  };

  const bills = await FinanceBill.find({});
  const billMap = new Map();

  for (const bill of bills) {
    summary.billsScanned += 1;
    const next = normalizeBillSnapshot(bill);
    billMap.set(String(bill._id || ''), {
      lineItems: next.lineItems,
      feeBreakdown: next.feeBreakdown,
      feeScopes: next.feeScopes
    });

    const changed = !sameJson(bill.lineItems, next.lineItems)
      || !sameJson(bill.feeBreakdown, next.feeBreakdown)
      || !sameJson(bill.feeScopes, next.feeScopes)
      || Number(bill.amountOriginal || 0) !== Number(next.amountOriginal || 0)
      || Number(bill.amountDue || 0) !== Number(next.amountDue || 0);

    if (!changed) continue;
    summary.billsUpdated += 1;
    if (!DRY_RUN) {
      bill.lineItems = next.lineItems;
      bill.feeBreakdown = next.feeBreakdown;
      bill.feeScopes = next.feeScopes;
      bill.amountOriginal = next.amountOriginal;
      bill.amountDue = next.amountDue;
      await bill.save();
    }
  }

  const orders = await FeeOrder.find({});
  for (const order of orders) {
    summary.ordersScanned += 1;
    const sourceBill = billMap.get(String(order.sourceBillId || '')) || null;
    const next = normalizeOrderSnapshot(order, sourceBill);
    const changed = !sameJson(order.lineItems, next.lineItems)
      || String(order.orderType || '') !== String(next.orderType || '')
      || Number(order.amountOriginal || 0) !== Number(next.amountOriginal || 0)
      || Number(order.amountDue || 0) !== Number(next.amountDue || 0)
      || Number(order.outstandingAmount || 0) !== Number(next.outstandingAmount || 0);

    if (!changed) continue;
    summary.ordersUpdated += 1;
    if (!DRY_RUN) {
      order.lineItems = next.lineItems;
      order.orderType = next.orderType;
      order.amountOriginal = next.amountOriginal;
      order.amountDue = next.amountDue;
      order.outstandingAmount = next.outstandingAmount;
      await order.save();
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(JSON.stringify({
    success: false,
    dryRun: DRY_RUN,
    message: error?.message || 'Line item backfill failed',
    stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
    at: toComparableDate(new Date())
  }, null, 2));
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
