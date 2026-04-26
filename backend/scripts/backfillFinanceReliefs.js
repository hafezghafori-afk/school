require('dotenv').config();
const mongoose = require('mongoose');

const Discount = require('../models/Discount');
const FeeExemption = require('../models/FeeExemption');
const FinanceRelief = require('../models/FinanceRelief');
const {
  syncFinanceReliefFromDiscount,
  syncFinanceReliefFromFeeExemption
} = require('../utils/financeReliefSync');

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function toComparableDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function applySyncResult(summary = {}, result = {}, type = 'discount') {
  const keyPrefix = type === 'discount' ? 'discount' : 'exemption';
  if (result?.created) summary[`${keyPrefix}Created`] += 1;
  else if (result?.updated) summary[`${keyPrefix}Updated`] += 1;
  else summary.skipped += 1;
}

async function run() {
  await mongoose.connect(MONGO_URI);

  const summary = {
    dryRun: DRY_RUN,
    discountsScanned: 0,
    discountCreated: 0,
    discountUpdated: 0,
    exemptionsScanned: 0,
    exemptionCreated: 0,
    exemptionUpdated: 0,
    skipped: 0,
    existingReliefs: 0,
    finalReliefs: 0,
    syncedIndexes: []
  };

  summary.existingReliefs = await FinanceRelief.countDocuments({});

  const discounts = await Discount.find({}).sort({ createdAt: 1 }).lean();
  for (const discount of discounts) {
    summary.discountsScanned += 1;
    const result = await syncFinanceReliefFromDiscount(discount, { dryRun: DRY_RUN });
    applySyncResult(summary, result, 'discount');
  }

  const exemptions = await FeeExemption.find({}).sort({ createdAt: 1 }).lean();
  for (const exemption of exemptions) {
    summary.exemptionsScanned += 1;
    const result = await syncFinanceReliefFromFeeExemption(exemption, { dryRun: DRY_RUN });
    applySyncResult(summary, result, 'exemption');
  }

  summary.finalReliefs = DRY_RUN
    ? summary.existingReliefs + summary.discountCreated + summary.exemptionCreated
    : await FinanceRelief.countDocuments({});

  summary.syncedIndexes = DRY_RUN
    ? FinanceRelief.schema.indexes().map(([spec]) => spec)
    : await FinanceRelief.syncIndexes();

  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(JSON.stringify({
    success: false,
    dryRun: DRY_RUN,
    message: error?.message || 'Finance relief backfill failed',
    stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
    at: toComparableDate(new Date())
  }, null, 2));
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
