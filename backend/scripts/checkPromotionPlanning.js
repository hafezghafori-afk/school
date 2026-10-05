// The pure rules behind «مرکز ارتقا صنف»: which class of the target year a
// student is moved into, which explicitly chosen classes are refused, how two
// academic years are ordered and which dates a promotion takes effect on.
const assert = require('assert');

const {
  academicYearOrder,
  classTargetIssues,
  finalizeOutcome,
  gradeOf,
  normalizeDigits,
  normalizeStudentOverrides,
  planIssueMessage,
  rankTargetClasses,
  resolvePromotionDates,
  selectTargetClass,
  summarizeTargetCapacity
} = require('../services/promotionPlanning');

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`FAIL  ${name}\n      ${error.stack || error.message}`);
  }
}

const SOURCE_YEAR = 'year-1405';
const TARGET_YEAR = 'year-1406';
const schoolClass = (id, gradeLevel, section, extra = {}) => ({
  _id: id,
  title: `صنف ${gradeLevel} ${section}`,
  gradeLevel,
  section,
  genderType: 'female',
  shiftId: 'shift-morning',
  status: 'active',
  academicYearId: TARGET_YEAR,
  ...extra
});
const source = schoolClass('src-5a', 5, 'الف', { academicYearId: SOURCE_YEAR });

check('Persian and Arabic-Indic digits are read as numbers', () => {
  assert.equal(normalizeDigits('صنف ۱۰ ب'), 'صنف 10 ب');
  assert.equal(normalizeDigits('١٤٠٥'), '1405');
  assert.equal(gradeOf({ title: 'صنف ۷ الف' }), 7);
  assert.equal(gradeOf({ gradeLevel: 9, title: 'صنف ۷' }), 9, 'gradeLevel wins over the title');
});

check('the promoted class is the next grade with the same section, gender and shift', () => {
  const candidates = [
    schoolClass('6a-male', 6, 'الف', { genderType: 'male' }),
    schoolClass('6b', 6, 'ب'),
    schoolClass('6a-afternoon', 6, 'الف', { shiftId: 'shift-afternoon' }),
    schoolClass('5a-next-year', 5, 'الف'),
    schoolClass('6a-archived', 6, 'الف', { status: 'archived' }),
    schoolClass('7a', 7, 'الف')
  ];
  const ranked = rankTargetClasses({ candidates, sourceClass: source, mode: 'promoted', targetAcademicYearId: TARGET_YEAR });
  assert.deepEqual(ranked.map((entry) => entry.candidate._id), ['6a-afternoon', '6b'],
    'only grade-6, non-archived, gender-compatible classes are offered, same section first');
});

check('repeaters go to the same grade of the target year', () => {
  const candidates = [schoolClass('6a', 6, 'الف'), schoolClass('5a', 5, 'الف'), schoolClass('5b', 5, 'ب')];
  const { targetClass } = selectTargetClass({ candidates, sourceClass: source, mode: 'repeated', targetAcademicYearId: TARGET_YEAR });
  assert.equal(targetClass._id, '5a');
});

check('no next-grade class means no target, never a same-named class of the same grade', () => {
  // The old matcher scored the same title/code and returned the grade-5 copy
  // of the class, so a "promoted" student silently repeated.
  const candidates = [schoolClass('5a-clone', 5, 'الف', { title: source.title })];
  const { targetClass } = selectTargetClass({ candidates, sourceClass: source, mode: 'promoted', targetAcademicYearId: TARGET_YEAR });
  assert.equal(targetClass, null);
});

check('two equally good classes are reported as ambiguous', () => {
  const candidates = [schoolClass('6b', 6, 'ب'), schoolClass('6j', 6, 'ج')];
  const selection = selectTargetClass({ candidates, sourceClass: source, mode: 'promoted', targetAcademicYearId: TARGET_YEAR });
  assert.equal(selection.ambiguous, true);
  assert.equal(selection.candidates.length, 2);
});

check('an explicitly chosen class must be the right grade, year and gender', () => {
  const issues = (targetClass, mode = 'promoted') => classTargetIssues({ sourceClass: source, targetClass, mode, targetAcademicYearId: TARGET_YEAR });
  assert.deepEqual(issues(schoolClass('6a', 6, 'الف')), []);
  assert.deepEqual(issues(schoolClass('5a', 5, 'الف')), ['target_class_grade_mismatch']);
  assert.deepEqual(issues(schoolClass('5a', 5, 'الف'), 'repeated'), []);
  assert.deepEqual(issues(schoolClass('6a-old', 6, 'الف', { academicYearId: SOURCE_YEAR })), ['target_class_wrong_year']);
  assert.deepEqual(issues(schoolClass('6a-male', 6, 'الف', { genderType: 'male' })), ['target_class_gender_mismatch']);
  assert.deepEqual(issues(schoolClass('6a-mixed', 6, 'الف', { genderType: 'mixed' })), []);
  assert.deepEqual(issues(schoolClass('6a-archived', 6, 'الف', { status: 'archived' })), ['target_class_archived']);
  assert.deepEqual(issues(null), ['target_class_not_found']);
});

check('the grade-mismatch message names the slot it is about', () => {
  assert.match(planIssueMessage('target_class_grade_mismatch', { mode: 'promoted' }), /یک پایه بالاتر/);
  assert.match(planIssueMessage('target_class_grade_mismatch', { mode: 'repeated' }), /همان پایه/);
});

check('academic years are ordered by start date, then sequence, then the year in the title', () => {
  const at = (value) => new Date(`${value}T00:00:00Z`);
  assert.equal(academicYearOrder({ _id: 'a', startDate: at('2026-03-21') }, { _id: 'b', startDate: at('2027-03-21') }), 'after');
  assert.equal(academicYearOrder({ _id: 'a', startDate: at('2027-03-21') }, { _id: 'b', startDate: at('2026-03-21') }), 'before');
  assert.equal(academicYearOrder({ _id: 'a', sequence: 3 }, { _id: 'b', sequence: 4 }), 'after');
  assert.equal(academicYearOrder({ _id: 'a', title: 'سال ۱۴۰۵' }, { _id: 'b', title: '1404' }), 'before');
  assert.equal(academicYearOrder({ _id: 'a', title: '1405' }, { _id: 'a', title: '1405' }), 'same');
  assert.equal(academicYearOrder({ _id: 'a', title: 'جاری' }, { _id: 'b', title: 'بعدی' }), 'unknown');
});

check('promotion dates default to the end of the source year and the start of the target year', () => {
  const sourceAcademicYear = { endDate: new Date('2027-03-20T00:00:00Z') };
  const targetAcademicYear = { startDate: new Date('2027-03-21T00:00:00Z') };
  const defaults = resolvePromotionDates({ sourceAcademicYear, targetAcademicYear });
  assert.equal(defaults.sourceEndAt.toISOString(), '2027-03-20T00:00:00.000Z');
  assert.equal(defaults.targetStartAt.toISOString(), '2027-03-21T00:00:00.000Z');
  assert.deepEqual(defaults.warnings, []);

  const legacy = resolvePromotionDates({ payload: { effectiveAt: '2027-01-05' }, sourceAcademicYear, targetAcademicYear });
  assert.equal(legacy.sourceEndAt.getTime(), legacy.targetStartAt.getTime(), 'a legacy «تاریخ اثر» drives both dates');

  const reversed = resolvePromotionDates({ payload: { sourceEndAt: '2027-03-25', targetStartAt: '2027-03-21' } });
  assert.deepEqual(reversed.warnings, ['target_start_before_source_end']);
});

check('a class-12 pass graduates even under a non-terminal rule', () => {
  assert.equal(finalizeOutcome({ computedOutcome: 'promoted', sourceClass: { gradeLevel: 12 }, rule: {} }), 'graduated');
  assert.equal(finalizeOutcome({ computedOutcome: 'promoted', sourceClass: { gradeLevel: 11 }, rule: {} }), 'promoted');
  assert.equal(finalizeOutcome({ computedOutcome: 'promoted', sourceClass: { gradeLevel: 9 }, rule: { isTerminalClass: true } }), 'graduated');
  assert.equal(finalizeOutcome({ computedOutcome: 'repeated', sourceClass: { gradeLevel: 12 }, rule: {} }), 'repeated');
});

check('capacity counts the students already in the class plus the incoming ones', () => {
  const rows = summarizeTargetCapacity({
    targetClasses: [schoolClass('6a', 6, 'الف', { capacity: 30 }), schoolClass('5a', 5, 'الف', { capacity: 30 })],
    incomingByClassId: new Map([['6a', 12]]),
    currentByClassId: new Map([['6a', 20]])
  });
  assert.equal(rows.length, 1, 'only classes receiving students are listed');
  assert.equal(rows[0].projected, 32);
  assert.equal(rows[0].overCapacity, true);
});

check('per-student overrides are keyed by membership', () => {
  const overrides = normalizeStudentOverrides([
    { membershipId: 'm1', targetClassId: 'c6b', reason: 'تقسیم صنف' },
    { studentMembershipId: 'm2', exclude: true },
    { targetClassId: 'orphan' }
  ]);
  assert.equal(overrides.size, 2);
  assert.deepEqual(overrides.get('m1'), { targetClassId: 'c6b', exclude: false, reason: 'تقسیم صنف' });
  assert.equal(overrides.get('m2').exclude, true);
});

const failed = results.filter((item) => !item.ok);
if (failed.length) {
  console.error(`check:promotion-planning FAIL (${failed.length}/${results.length})`);
  process.exit(1);
}
console.log(`check:promotion-planning PASS (${results.length})`);
