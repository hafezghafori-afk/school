/**
 * READ-ONLY. Lists the fee plans that would stop MongoDB from building the
 * class-scope unique index of FinanceFeePlan, so they can be reviewed before
 * the fix that makes the index buildable is deployed.
 *
 * The index allows one plan per school, class, academic year, term, billing
 * frequency and plan code, counting every plan that has both a class and an
 * academic year (inactive and archived ones too). Its partial filter used to
 * say `$ne: null`, which MongoDB refuses, so the index never existed and
 * nothing stopped a second plan for the same class. Once the fix is deployed,
 * Mongoose builds the index when the backend starts. While a group below still
 * has more than one plan that build fails, Mongoose swallows the error and the
 * backend runs on without the index.
 *
 * Each plan is shown with the number of fee orders issued from it: the
 * fee-plan delete refuses a plan that has any, and archiving a plan does not
 * take it out of the index. Also listed: plans the index skips because their
 * class or academic year is not stored as an ObjectId, and how the indexes in
 * the database differ from the ones the schema declares. Nothing is changed.
 *
 * Usage (from backend/):
 *   node scripts/listDuplicateFeePlans.js
 *   node scripts/listDuplicateFeePlans.js --uri='mongodb+srv://...' --dns=8.8.8.8,1.1.1.1
 *   node scripts/listDuplicateFeePlans.js --school=<schoolId> --json
 */
require('dotenv').config({ quiet: true });
const dns = require('dns');
const mongoose = require('mongoose');

const AcademicYear = require('../models/AcademicYear');
const FeeOrder = require('../models/FeeOrder');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const SchoolClass = require('../models/SchoolClass');

function arg(name) {
  for (const token of process.argv.slice(2)) {
    if (token === `--${name}`) return 'true';
    if (token.startsWith(`--${name}=`)) return token.slice(name.length + 3).trim();
  }
  return '';
}

const day = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
};
const money = (value) => Math.round(Number(value || 0)).toLocaleString('en-US');
// A key value as the index sees it: null stands for a missing field too.
const keyText = (value) => (value === null || value === undefined ? '(none)' : `"${value}"`);
const valueText = (value) => (value?._bsontype ? `${value._bsontype}(${value})` : JSON.stringify(value));

// The class-scope unique index, as the model declares it.
function classScopeIndex() {
  const index = FinanceFeePlan.schema.indexes()
    .find(([fields, options]) => options.unique && options.partialFilterExpression && 'classId' in fields);
  if (!index) throw new Error('FinanceFeePlan declares no class-scope unique index.');
  const [fields, options] = index;
  return { fields: Object.keys(fields), filter: options.partialFilterExpression };
}

// Plans that share every key of the class-scope index, compared the way the
// index compares them: a missing field is the same key as null.
async function findClassScopeDuplicates({ schoolId = null } = {}) {
  const { fields, filter } = classScopeIndex();
  const groups = await FinanceFeePlan.collection.aggregate([
    { $match: schoolId ? { ...filter, schoolId } : filter },
    { $sort: { _id: 1 } },
    {
      $group: {
        _id: Object.fromEntries(fields.map((field) => [field, { $ifNull: [`$${field}`, null] }])),
        planIds: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: Object.fromEntries(fields.map((field) => [`_id.${field}`, 1])) }
  ]).toArray();
  return groups.map((group) => ({ key: group._id, planIds: group.planIds }));
}

// Plans with a class and an academic year that the index skips, because one
// of the two is not stored as an ObjectId. The model casts both, so only a raw
// write leaves a plan like that.
async function findUncoveredClassPlans({ schoolId = null } = {}) {
  const { filter } = classScopeIndex();
  return FinanceFeePlan.collection.find({
    ...(schoolId ? { schoolId } : {}),
    classId: { $ne: null },
    academicYearId: { $ne: null },
    $nor: [filter]
  }).project({ title: 1, classId: 1, academicYearId: 1 }).sort({ _id: 1 }).toArray();
}

const describeIndex = ([fields, options = {}]) => {
  const flags = [
    options.unique ? 'unique' : '',
    options.partialFilterExpression ? `partial ${JSON.stringify(options.partialFilterExpression)}` : ''
  ].filter(Boolean);
  const name = Object.entries(fields).map(([field, value]) => `${field}_${value}`).join('_');
  return `${name}${flags.length ? ` (${flags.join(', ')})` : ''}`;
};

async function run() {
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);

  const uri = arg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = arg('dns');
  if (dnsServers) dns.setServers(dnsServers.split(',').map((item) => item.trim()).filter(Boolean));
  const asJson = arg('json') === 'true';
  const log = asJson ? () => {} : (...parts) => console.log(...parts);
  const school = arg('school');
  if (school && !/^[0-9a-f]{24}$/i.test(school)) throw new Error(`--school is not an ObjectId: ${school}`);
  const schoolId = school ? new mongoose.Types.ObjectId(school) : null;
  log(`connecting to: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });

  try {
    const { filter } = classScopeIndex();
    const scope = schoolId ? { schoolId } : {};
    const [planCount, coveredCount, groups, uncovered, { toDrop, toCreate }] = await Promise.all([
      FinanceFeePlan.collection.countDocuments(scope),
      FinanceFeePlan.collection.countDocuments({ ...scope, ...filter }),
      findClassScopeDuplicates({ schoolId }),
      findUncoveredClassPlans({ schoolId }),
      FinanceFeePlan.diffIndexes({ indexOptionsToCreate: true })
    ]);

    const planIds = groups.flatMap((group) => group.planIds);
    const [plans, orderCounts, classes, years] = await Promise.all([
      FinanceFeePlan.find({ _id: { $in: planIds } })
        .select('title planType course lifecycleStatus isDefault tuitionFee currency createdAt updatedAt')
        .lean(),
      // The fee-plan delete counts these: fee orders with a line item from the plan.
      FeeOrder.aggregate([
        { $match: { 'lineItems.sourcePlanId': { $in: planIds } } },
        { $unwind: '$lineItems' },
        { $match: { 'lineItems.sourcePlanId': { $in: planIds } } },
        { $group: { _id: '$lineItems.sourcePlanId', orders: { $addToSet: '$_id' } } }
      ]),
      SchoolClass.find({ _id: { $in: groups.map((group) => group.key.classId) } }).select('title').lean(),
      AcademicYear.find({ _id: { $in: groups.map((group) => group.key.academicYearId) } }).select('title').lean()
    ]);
    const byId = (rows) => new Map(rows.map((row) => [String(row._id), row]));
    const planById = byId(plans);
    const classById = byId(classes);
    const yearById = byId(years);
    const ordersByPlan = new Map(orderCounts.map((row) => [String(row._id), row.orders.length]));

    const report = groups.map(({ key, planIds: ids }) => ({
      schoolId: key.schoolId ? String(key.schoolId) : null,
      classId: String(key.classId),
      className: classById.get(String(key.classId))?.title || '',
      academicYearId: String(key.academicYearId),
      academicYear: yearById.get(String(key.academicYearId))?.title || '',
      term: key.term,
      billingFrequency: key.billingFrequency,
      planCode: key.planCode,
      plans: ids.map((planId) => {
        const plan = planById.get(String(planId)) || {};
        return {
          id: String(planId),
          title: plan.title || '',
          planType: plan.planType || '',
          course: plan.course ? String(plan.course) : '',
          lifecycleStatus: plan.lifecycleStatus || '',
          isDefault: plan.isDefault === true,
          tuitionFee: Number(plan.tuitionFee || 0),
          currency: plan.currency || '',
          createdAt: day(plan.createdAt),
          updatedAt: day(plan.updatedAt),
          feeOrders: ordersByPlan.get(String(planId)) || 0
        };
      })
    }));
    const totals = {
      plans: planCount,
      coveredByClassIndex: coveredCount,
      duplicateGroups: report.length,
      plansInDuplicateGroups: planIds.length,
      uncoveredClassPlans: uncovered.length
    };

    if (asJson) {
      console.log(JSON.stringify({
        totals,
        duplicateGroups: report,
        uncoveredClassPlans: uncovered.map((plan) => ({
          id: String(plan._id),
          title: plan.title || '',
          classId: valueText(plan.classId),
          academicYearId: valueText(plan.academicYearId)
        })),
        indexes: { missing: toCreate.map(describeIndex), notInSchema: toDrop }
      }, null, 2));
      return;
    }

    log(`${totals.plans} fee plan(s); ${totals.coveredByClassIndex} have a class and an academic year, so the class-scope index covers them.`);
    if (!report.length) {
      log('No two of them share a school, class, academic year, term, billing frequency and plan code: the index can be built.');
    } else {
      log(`${report.length} group(s) of plans share a school, class, academic year, term, billing frequency and plan code`
        + ` (${totals.plansInDuplicateGroups} plans). The index cannot be built until each group is down to one plan.`);
      log('"fee orders" counts the fee orders issued from a plan: the fee-plan delete refuses a plan that has any,'
        + ' and archiving a plan does not take it out of the index.');
      report.forEach((group) => {
        log('');
        log(`${group.className || '(class not found)'} (${group.classId}) | ${group.academicYear || '(year not found)'} (${group.academicYearId})`
          + ` | school ${group.schoolId || '(none)'} | term ${keyText(group.term)} | billing ${keyText(group.billingFrequency)}`
          + ` | plan code ${keyText(group.planCode)}: ${group.plans.length} plans`);
        group.plans.forEach((plan) => log(`    ${plan.id} | ${plan.lifecycleStatus || '-'}${plan.isDefault ? ', default' : ''}`
          + ` | "${plan.title}" | ${plan.planType || '-'} | course ${plan.course || '-'} | tuition ${money(plan.tuitionFee)} ${plan.currency}`
          + ` | created ${plan.createdAt}, updated ${plan.updatedAt} | fee orders ${plan.feeOrders}`));
      });
    }

    log('');
    log(`Plans the index skips because their class or academic year is not stored as an ObjectId: ${uncovered.length}.`);
    uncovered.forEach((plan) => log(`    ${plan._id} | "${plan.title || ''}" | class ${valueText(plan.classId)} | academic year ${valueText(plan.academicYearId)}`));

    log('');
    if (toCreate.length) {
      log('Indexes the schema declares that the database lacks (Mongoose builds them when the backend starts):');
      toCreate.forEach((index) => log(`    ${describeIndex(index)}`));
    } else {
      log('The database has every index the schema declares.');
    }
    if (toDrop.length) {
      log('Indexes in the database that the schema no longer declares (Mongoose leaves them; syncIndexes() would drop them):');
      toDrop.forEach((name) => log(`    ${name}`));
    }
    log('Nothing was changed.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error('[audit:fee-plan-duplicates] failed:', error?.message || error);
    process.exit(1);
  });
}

module.exports = { findClassScopeDuplicates, findUncoveredClassPlans };
