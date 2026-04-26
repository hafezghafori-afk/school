const mongoose = require('mongoose');

const FinanceFeePlan = require('../models/FinanceFeePlan');

const PLAN_TYPES = ['standard', 'charity', 'sibling', 'scholarship', 'special', 'semi_annual'];

function getMongoUri() {
  return process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizePlanType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  return PLAN_TYPES.includes(normalized) ? normalized : 'standard';
}

function normalizePlanCode(value = '', fallback = 'STANDARD') {
  const normalized = normalizeText(value)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalized || fallback;
}

function normalizeDate(value = null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getScopeKey(plan = {}) {
  return [
    String(plan.classId || ''),
    String(plan.academicYearId || ''),
    normalizeText(plan.term),
    normalizeText(plan.billingFrequency || plan.periodType || 'term')
  ].join('|');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply || process.argv.includes('--dry-run');

  await mongoose.connect(getMongoUri());

  try {
    const plans = await FinanceFeePlan.find({}).sort({ createdAt: 1 });
    const scopeDefaults = new Map();
    const updates = [];

    for (const plan of plans) {
      const planType = normalizePlanType(plan.planType);
      const planCode = normalizePlanCode(plan.planCode, planType === 'standard' ? 'STANDARD' : String(planType || 'PLAN').toUpperCase());
      const priority = Math.max(0, Number(plan.priority != null ? plan.priority : (planType === 'standard' ? 100 : 200)) || 0);
      const effectiveFrom = normalizeDate(plan.effectiveFrom);
      let effectiveTo = normalizeDate(plan.effectiveTo);
      if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
        effectiveTo = effectiveFrom;
      }

      const scopeKey = getScopeKey(plan);
      const shouldBeDefault = scopeDefaults.has(scopeKey)
        ? false
        : (plan.isDefault === true || planType === 'standard');
      if (shouldBeDefault) {
        scopeDefaults.set(scopeKey, true);
      }

      const next = {
        planType,
        planCode,
        priority,
        effectiveFrom,
        effectiveTo,
        isDefault: shouldBeDefault,
        eligibilityRule: normalizeText(plan.eligibilityRule)
      };

      const changed = (
        String(plan.planType || '') !== String(next.planType || '')
        || String(plan.planCode || '') !== String(next.planCode || '')
        || Number(plan.priority != null ? plan.priority : NaN) !== Number(next.priority)
        || String(plan.effectiveFrom ? new Date(plan.effectiveFrom).toISOString() : '') !== String(next.effectiveFrom ? next.effectiveFrom.toISOString() : '')
        || String(plan.effectiveTo ? new Date(plan.effectiveTo).toISOString() : '') !== String(next.effectiveTo ? next.effectiveTo.toISOString() : '')
        || Boolean(plan.isDefault) !== Boolean(next.isDefault)
        || String(plan.eligibilityRule || '') !== String(next.eligibilityRule || '')
      );

      if (changed) {
        updates.push({
          id: String(plan._id || ''),
          title: normalizeText(plan.title),
          classId: String(plan.classId || ''),
          academicYearId: String(plan.academicYearId || ''),
          planCode: next.planCode,
          planType: next.planType,
          priority: next.priority,
          isDefault: next.isDefault
        });
        if (!dryRun) {
          Object.assign(plan, next);
          await plan.save();
        }
      }
    }

    const syncedIndexes = dryRun
      ? FinanceFeePlan.schema.indexes().map(([spec]) => spec)
      : await FinanceFeePlan.syncIndexes();

    console.log(JSON.stringify({
      dryRun,
      scanned: plans.length,
      updated: updates.length,
      updates,
      syncedIndexes
    }, null, 2));
  } finally {
    await mongoose.connection.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
