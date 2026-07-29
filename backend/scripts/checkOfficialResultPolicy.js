const assert = require('assert');
const {
  GENERAL_RESULT_POLICY,
  OFFICIAL_RESULT_POLICY_VERSION,
  combineOfficialSubjectScores,
  computeCompetitionRanks,
  computeGeneralResult,
  getInitialMarkStatus,
  getMembershipLifecycleLabel,
  getOfficialExamPolicy
} = require('../utils/officialResultPolicy');

const fourHalf = getOfficialExamPolicy('FOUR_HALF_MONTH');
const annual = getOfficialExamPolicy('annual');
assert.strictEqual(fourHalf.totalMark, 40);
assert.strictEqual(fourHalf.passMark, 16);
assert.strictEqual(annual.totalMark, 60);
assert.strictEqual(annual.passMark, 40);
assert.strictEqual(GENERAL_RESULT_POLICY.passMark, 55);
assert.ok(OFFICIAL_RESULT_POLICY_VERSION);

assert.deepStrictEqual(combineOfficialSubjectScores({ fourHalf: 16, annual: 39 }), {
  obtainedMark: 55,
  totalMark: 100,
  percentage: 55,
  passed: true,
  complete: true
});
assert.strictEqual(combineOfficialSubjectScores({ fourHalf: null, annual: 40 }).complete, false);

const passed = computeGeneralResult([
  combineOfficialSubjectScores({ fourHalf: 16, annual: 40 }),
  combineOfficialSubjectScores({ fourHalf: 20, annual: 40 })
]);
assert.strictEqual(passed.average, 58);
assert.strictEqual(passed.resultStatus, 'passed');

const ranked = [{ score: 90 }, { score: 90 }, { score: 80 }, { score: null }];
const ranks = computeCompetitionRanks(ranked, (item) => item.score, (item) => Number.isFinite(item.score));
assert.deepStrictEqual(ranked.map((item) => ranks.get(item) || null), [1, 1, 3, null]);

assert.strictEqual(getMembershipLifecycleLabel({ status: 'transferred_out' }), 'تبدیل شده');
assert.strictEqual(getMembershipLifecycleLabel({ status: 'dropped', endedReason: 'ترک تحصیل' }), 'ترک تحصیل');
assert.strictEqual(getMembershipLifecycleLabel({ status: 'dropped' }), 'ترک تحصیل');
assert.strictEqual(getMembershipLifecycleLabel({ status: 'dropped', endedReason: 'منفک' }), 'منفک شده (ثبت قدیمی)');
assert.strictEqual(getMembershipLifecycleLabel({ status: 'expelled' }), 'منفک شده (اخراج رسمی)');
assert.strictEqual(getInitialMarkStatus({ status: 'active', isCurrent: true }), 'pending');
assert.strictEqual(getInitialMarkStatus({ status: 'transferred_out', isCurrent: false }), 'not_applicable');

console.log('Official result policy checks passed.');
