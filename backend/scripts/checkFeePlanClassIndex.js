// FinanceFeePlan's class-scope unique index, against a real MongoDB: one plan
// per school, class, academic year, term, billing frequency and plan code,
// among the plans that have both a class and an academic year. Its partial
// filter used to say `$ne: null`, which MongoDB refuses ("Expression not
// supported in partial index"), so the index never existed and a second plan
// for the same class went through. The read-only audit
// (listDuplicateFeePlans.js) lists the plans that would stop it from building.
// Runs in its own throwaway database.
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');

// The plan's validate hook looks up its class and academic year.
require('../models/AcademicYear');
require('../models/SchoolClass');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const { findClassScopeDuplicates, findUncoveredClassPlans } = require('./listDuplicateFeePlans');

const DB_NAME = 'school_fee_plan_class_index_check';
const CLASS_INDEX = 'schoolId_1_classId_1_academicYearId_1_term_1_billingFrequency_1_planCode_1';
const CLASS_INDEX_FIELDS = ['schoolId', 'classId', 'academicYearId', 'term', 'billingFrequency', 'planCode'];
const id = () => new mongoose.Types.ObjectId();

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`FAIL  ${name}\n      ${error.stack || error.message}`);
  }
}

// A class and academic year of a school, with ids no other check uses.
const classScope = () => ({ schoolId: id(), classId: id(), academicYearId: id() });
// Every plan gets its own course, so the course index never refuses one.
const plan = (scope, fields = {}) => ({
  title: 'Class plan',
  course: id(),
  term: '',
  billingFrequency: 'monthly',
  planCode: 'STANDARD',
  tuitionFee: 1000,
  ...scope,
  ...fields
});

// Refused by the class-scope index, not by the course index.
const refusedByClassIndex = (error) => {
  assert.strictEqual(error.code, 11000, error.message);
  assert.deepStrictEqual(Object.keys(error.keyPattern || {}), CLASS_INDEX_FIELDS);
  return true;
};
const idSets = (lists) => lists.map((list) => list.map(String).sort().join(',')).sort();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', { dbName: DB_NAME });
  // Let every model finish the index build it starts on connect, then drop the
  // database so the first check builds FinanceFeePlan's indexes from scratch.
  await Promise.allSettled(Object.values(mongoose.models).map((model) => model.init()));
  await mongoose.connection.db.dropDatabase();

  try {
    await check('FinanceFeePlan builds every index it declares', async () => {
      await FinanceFeePlan.createIndexes();
      const index = (await FinanceFeePlan.collection.indexes()).find((item) => item.name === CLASS_INDEX);
      assert.ok(index, 'the class-scope index exists');
      assert.strictEqual(index.unique, true);
      assert.deepStrictEqual(index.partialFilterExpression, {
        classId: { $type: 'objectId' },
        academicYearId: { $type: 'objectId' }
      });
      // MongoDB keeps the filter as declared, so syncIndexes() leaves the index alone.
      assert.deepStrictEqual(await FinanceFeePlan.diffIndexes(), { toDrop: [], toCreate: [] });
    });

    await check('a second plan for the same class, year, term, billing and plan code is refused', async () => {
      const scope = classScope();
      await FinanceFeePlan.create(plan(scope));
      await assert.rejects(FinanceFeePlan.create(plan(scope)), refusedByClassIndex);
      // An upsert by class, year, term, billing, plan code and course (how the
      // fee-plan form used to save) inserts under another course: refused too.
      const course = id();
      await assert.rejects(FinanceFeePlan.findOneAndUpdate(
        { ...scope, term: '', billingFrequency: 'monthly', planCode: 'STANDARD', course },
        { $set: plan(scope, { course, title: 'Saved again' }) },
        { upsert: true }
      ), refusedByClassIndex);
      assert.strictEqual(await FinanceFeePlan.countDocuments({ classId: scope.classId }), 1);
    });

    await check('plans without a class or an academic year are left to the course index', async () => {
      const scope = classScope();
      await FinanceFeePlan.create([
        plan({ ...scope, classId: null }),
        plan({ ...scope, classId: null }),
        plan({ ...scope, academicYearId: null }),
        plan({ ...scope, academicYearId: null })
      ]);
      // Without the field at all, as an import can leave it.
      const withoutClass = [plan(scope), plan(scope)];
      withoutClass.forEach((row) => delete row.classId);
      await FinanceFeePlan.collection.insertMany(withoutClass);
      assert.strictEqual(await FinanceFeePlan.countDocuments({ schoolId: scope.schoolId }), 6);
    });

    await check('plans of one class differ by school, year, term, billing or plan code', async () => {
      const scope = classScope();
      await FinanceFeePlan.create([
        plan(scope),
        plan(scope, { schoolId: id() }),
        plan(scope, { academicYearId: id() }),
        plan(scope, { term: 'Term 2' }),
        plan(scope, { billingFrequency: 'term' }),
        plan(scope, { planCode: 'SPECIAL' })
      ]);
      assert.strictEqual(await FinanceFeePlan.countDocuments({ classId: scope.classId }), 6);
    });

    await check('the audit lists exactly the plans that stop the index from building', async () => {
      await FinanceFeePlan.collection.dropIndex(CLASS_INDEX);
      const raw = (scope, fields = {}) => ({ _id: id(), ...plan(scope, fields) });
      const shared = classScope();
      const tripled = [raw(shared), raw(shared), raw(shared)];
      // No school: the index files a missing schoolId under null.
      const unscoped = { ...classScope(), schoolId: null };
      const nullSchool = raw(unscoped);
      const missingSchool = raw(unscoped);
      delete missingSchool.schoolId;
      const classAsString = raw({ ...shared, classId: String(shared.classId) });
      await FinanceFeePlan.collection.insertMany([
        ...tripled,
        nullSchool,
        missingSchool,
        raw(shared, { planCode: 'SPECIAL' }),
        raw(unscoped, { term: null }), // a null term is not the empty one
        raw({ ...shared, classId: null }),
        raw({ ...shared, classId: null }),
        classAsString
      ]);
      const groupIds = (groups) => idSets(groups.map((group) => group.planIds));

      assert.deepStrictEqual(
        groupIds(await findClassScopeDuplicates()),
        idSets([tripled.map((row) => row._id), [nullSchool._id, missingSchool._id]])
      );
      assert.deepStrictEqual(
        groupIds(await findClassScopeDuplicates({ schoolId: shared.schoolId })),
        idSets([tripled.map((row) => row._id)])
      );
      assert.deepStrictEqual((await findUncoveredClassPlans()).map((row) => String(row._id)), [String(classAsString._id)]);

      // The groups it lists are what fails the build...
      await assert.rejects(FinanceFeePlan.createIndexes(), { code: 11000 });
      // ...and the index builds once each group is down to one plan.
      await FinanceFeePlan.collection.deleteMany({ _id: { $in: [tripled[1]._id, tripled[2]._id, missingSchool._id] } });
      assert.deepStrictEqual(await findClassScopeDuplicates(), []);
      await FinanceFeePlan.createIndexes();
      assert.ok((await FinanceFeePlan.collection.indexes()).some((item) => item.name === CLASS_INDEX));
    });
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`\nFee plan class index: ${failed.length} of ${results.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nFee plan class index passed: ${results.length} check(s).`);
}

run().catch((error) => {
  console.error('[check:fee-plan-class-index] failed:', error);
  process.exit(1);
});
