const {
  buildStudentMonthlyTuitionIdentity,
  buildStudentMonthlyTuitionIssuanceKey,
  solarMonthKey
} = require('../utils/studentBillingPeriodIntegrity');
const {
  classifyClosedMembershipBill,
  hasPaymentEvidence
} = require('../services/membershipBillingReconciliationService');
const {
  buildConcurrentCurrentMembershipFilter
} = require('../utils/studentMembershipIntegrity');

const assertCase = (condition, message) => {
  if (!condition) throw new Error(message);
};

const monthDate = new Date('2026-07-21T00:00:00.000Z');
const nextMonthDate = new Date('2026-08-21T00:00:00.000Z');
const base = {
  schoolId: 'school-1',
  studentId: 'student-1',
  academicYearId: 'year-1',
  periodType: 'monthly',
  dueDate: monthDate
};

const firstIdentity = buildStudentMonthlyTuitionIdentity({ ...base, courseId: 'course-1', studentMembershipId: 'membership-1' });
const movedClassIdentity = buildStudentMonthlyTuitionIdentity({ ...base, courseId: 'course-2', studentMembershipId: 'membership-2' });
assertCase(firstIdentity === movedClassIdentity, 'Monthly tuition identity must remain stable after a class change.');
assertCase(
  buildStudentMonthlyTuitionIssuanceKey({ ...base, courseId: 'course-1' })
    === buildStudentMonthlyTuitionIssuanceKey({ ...base, courseId: 'course-2' }),
  'Monthly tuition issuance key must not depend on class/course.'
);
assertCase(
  buildStudentMonthlyTuitionIdentity({ ...base, studentId: 'student-2' }) !== firstIdentity,
  'Different students must have different monthly tuition identities.'
);
assertCase(solarMonthKey(monthDate) !== solarMonthKey(nextMonthDate), 'Different solar months must produce different keys.');

assertCase(
  classifyClosedMembershipBill({ record: { status: 'new', dueDate: nextMonthDate, amountPaid: 0 }, effectiveAt: monthDate }) === 'void_future',
  'Unpaid future bill must be voidable after class reassignment.'
);
assertCase(
  classifyClosedMembershipBill({ record: { status: 'new', dueDate: monthDate, amountPaid: 0 }, effectiveAt: monthDate }) === 'review_effective_period',
  'Effective-month bill must require review by default.'
);
assertCase(
  classifyClosedMembershipBill({ record: { status: 'new', dueDate: monthDate, amountPaid: 0 }, effectiveAt: monthDate, voidEffectivePeriod: true }) === 'void_effective_period',
  'Placement correction must be able to void the effective-month bill.'
);
assertCase(hasPaymentEvidence({ status: 'partial', amountPaid: 1 }), 'Partially paid bills must be protected.');

const conflictFilter = buildConcurrentCurrentMembershipFilter({
  schoolId: 'school-1',
  studentId: 'student-1',
  academicYearId: 'year-1',
  excludeMembershipId: 'membership-2'
});
assertCase(Array.isArray(conflictFilter.$and), 'Membership conflict filter must be conjunctive.');
assertCase(JSON.stringify(conflictFilter).includes('year-1'), 'Membership conflict filter must be scoped to academic year.');

console.log('[check:student-class-billing-integrity] ok');
