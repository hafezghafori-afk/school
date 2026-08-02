const assert = require('assert');
const { buildMonthlyBillingPeriods } = require('../services/feeBillingService');

const academicYear = {
  startDate: new Date(2026, 2, 21),
  endDate: new Date(2027, 2, 20, 23, 59, 59),
  feeBillingMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9]
};
const feePlan = { dueDay: 10 };

const standard = buildMonthlyBillingPeriods({
  membership: { enrolledAt: new Date(2026, 2, 21) },
  feePlan,
  academicYear,
  dueDate: new Date(2026, 2, 21)
});
assert.equal(standard.length, 1);
assert.deepEqual(standard.map((item) => Number(item.periodLabel.split('-')[1])), [1]);

const allMonths = buildMonthlyBillingPeriods({
  membership: { enrolledAt: new Date(2026, 2, 21) },
  feePlan,
  academicYear,
  dueDate: new Date(2026, 2, 21),
  includeFutureMonths: true
});
assert.equal(allMonths.length, 9);
assert.deepEqual(allMonths.map((item) => Number(item.periodLabel.split('-')[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9]);

const threeMonths = buildMonthlyBillingPeriods({
  membership: { enrolledAt: new Date(2026, 2, 21) },
  feePlan,
  academicYear,
  dueDate: new Date(2026, 2, 21),
  includeFutureMonths: true,
  futureMonthCount: 3
});
assert.equal(threeMonths.length, 3);
assert.deepEqual(threeMonths.map((item) => Number(item.periodLabel.split('-')[1])), [1, 2, 3]);

const transferred = buildMonthlyBillingPeriods({
  membership: { enrolledAt: new Date(2026, 6, 23) },
  feePlan,
  academicYear,
  dueDate: new Date(2026, 2, 21),
  includeFutureMonths: true
});
assert.equal(transferred.length, 5);
assert.deepEqual(transferred.map((item) => Number(item.periodLabel.split('-')[1])), [5, 6, 7, 8, 9]);

console.log('check:monthly-billing-calendar PASS');
