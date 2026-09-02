const assert = require('assert');
const { afghanSolarToGregorianInput } = require('../utils/afghanDate');
const {
  getMonthRange: getGregorianMonthRange,
  getQuarterRange: getGregorianQuarterRange
} = require('../services/financialPeriodService');
const {
  DAY_MS,
  isShamsiAlignedSource,
  getShamsiMonthRange,
  getShamsiQuarterRange,
  listShamsiQuarterRanges
} = require('../services/shamsiPeriodService');

// Phase 2 of the مرکز مالی دولت review (finding P4) — the month/quarter buckets
// of a Shamsi-aligned financial year must follow the real Afghan solar calendar
// (31/31/31/31/31/31/30/30/30/30/30/29-or-30), not Gregorian addMonths.

function isoToLocalDate(iso, endOfDay = false) {
  const [y, m, d] = iso.split('-').map(Number);
  return endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0);
}

function spanDays(range) {
  return Math.round((range.endDate.getTime() - range.startDate.getTime() + 1) / DAY_MS);
}

// A financial year that runs a full Shamsi year 1404 (1 Hamal 1404 .. 29/30 Hoot 1404).
const fyStartIso = afghanSolarToGregorianInput(1404, 1, 1);
const nextYearStartIso = afghanSolarToGregorianInput(1405, 1, 1);
const fyEnd = new Date(isoToLocalDate(nextYearStartIso).getTime() - 1);
const source = {
  startDate: isoToLocalDate(fyStartIso),
  endDate: new Date(fyEnd.getFullYear(), fyEnd.getMonth(), fyEnd.getDate(), 23, 59, 59, 999)
};

assert.strictEqual(isShamsiAlignedSource(source), true, 'a 1-Hamal financial year is Shamsi-aligned');

// ---- months ----------------------------------------------------------------
const months = [];
for (let m = 1; m <= 12; m += 1) {
  const range = getShamsiMonthRange(source, m);
  assert.ok(range && range.startDate && range.endDate, `month ${m} has a range`);
  months.push(range);
}

assert.strictEqual(months[0].startDate.getTime(), source.startDate.getTime(), 'month 1 starts on the FY start');
assert.strictEqual(months[11].endDate.getTime(), source.endDate.getTime(), 'month 12 ends on the FY end');

for (let m = 0; m < 11; m += 1) {
  assert.strictEqual(
    months[m].endDate.getTime() + 1,
    months[m + 1].startDate.getTime(),
    `month ${m + 1} end is contiguous with month ${m + 2} start`
  );
}

for (let m = 1; m <= 6; m += 1) {
  assert.strictEqual(spanDays(months[m - 1]), 31, `Shamsi month ${m} spans 31 days`);
}
for (let m = 7; m <= 11; m += 1) {
  assert.strictEqual(spanDays(months[m - 1]), 30, `Shamsi month ${m} spans 30 days`);
}
assert.ok([29, 30].includes(spanDays(months[11])), 'Shamsi month 12 spans 29 or 30 days');

const totalMonthDays = months.reduce((sum, range) => sum + spanDays(range), 0);
const yearDays = spanDays({ startDate: source.startDate, endDate: source.endDate });
assert.strictEqual(totalMonthDays, yearDays, 'the 12 Shamsi months exactly cover the financial year');

// ---- quarters ------------------------------------------------------------
const quarters = [1, 2, 3, 4].map((q) => getShamsiQuarterRange(source, q));
assert.strictEqual(quarters[0].startDate.getTime(), months[0].startDate.getTime(), 'Q1 starts with month 1');
assert.strictEqual(quarters[0].endDate.getTime(), months[2].endDate.getTime(), 'Q1 ends with month 3');
assert.strictEqual(quarters[3].endDate.getTime(), source.endDate.getTime(), 'Q4 ends on the FY end');
for (let q = 0; q < 3; q += 1) {
  assert.strictEqual(
    quarters[q].endDate.getTime() + 1,
    quarters[q + 1].startDate.getTime(),
    `Q${q + 1} is contiguous with Q${q + 2}`
  );
}
assert.strictEqual(
  quarters.reduce((sum, range) => sum + spanDays(range), 0),
  yearDays,
  'the 4 Shamsi quarters exactly cover the financial year'
);
assert.strictEqual(listShamsiQuarterRanges(source).length, 4, 'listShamsiQuarterRanges yields 4 quarters');

// ---- non-aligned FY falls back to Gregorian ------------------------------
const gregSource = {
  startDate: new Date(2026, 5, 15, 0, 0, 0, 0),
  endDate: new Date(2027, 5, 14, 23, 59, 59, 999)
};
assert.strictEqual(isShamsiAlignedSource(gregSource), false, 'a mid-June FY is not Shamsi-aligned');
assert.deepStrictEqual(
  getShamsiMonthRange(gregSource, 4),
  getGregorianMonthRange(gregSource, 4),
  'non-aligned month range falls back to the Gregorian bucket'
);
assert.deepStrictEqual(
  getShamsiQuarterRange(gregSource, 3),
  getGregorianQuarterRange(gregSource, 3),
  'non-aligned quarter range falls back to the Gregorian bucket'
);

console.log('[check:government-finance-periods] ok');
