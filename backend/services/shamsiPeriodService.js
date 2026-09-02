// Phase 2 of the مرکز مالی دولت review (finding P4).
//
// financialPeriodService buckets a financial year into months/quarters with
// Gregorian addMonths() from the FY start date. Afghan solar (Shamsi) months are
// 31/31/31/31/31/31/30/30/30/30/30/29-or-30 days, so from month 2 onward the
// Gregorian buckets drift a few days off the real Shamsi month boundaries — the
// monthly/quarterly government figures then don't line up with a Shamsi-calendar
// ledger.
//
// This service returns the TRUE Shamsi month/quarter ranges when the financial
// year is anchored to 1 Hamal (the Afghan fiscal year start). For any other
// start date — a custom or partial-year window — it transparently falls back to
// the Gregorian ranges, so nothing that relies on the old behaviour changes.

const { gregorianToAfghanSolar, afghanSolarToGregorianInput } = require('../utils/afghanDate');
const {
  getMonthRange: getGregorianMonthRange,
  getQuarterRange: getGregorianQuarterRange,
  listQuarterRanges: listGregorianQuarterRanges,
  startOfDay,
  endOfDay,
  toDate
} = require('./financialPeriodService');

const DAY_MS = 24 * 60 * 60 * 1000;

// First calendar day of a given Shamsi month, as a local start-of-day Date.
function shamsiMonthStart(jy, jm) {
  const iso = afghanSolarToGregorianInput(jy, jm, 1);
  if (!iso) return null;
  const [gy, gm, gd] = iso.split('-').map(Number);
  if (!gy || !gm || !gd) return null;
  return new Date(gy, gm - 1, gd, 0, 0, 0, 0);
}

// [start, end] of a Shamsi month: from day 1 to the last moment before the next
// month begins. Length is derived from the real calendar, so leap Hoot (month
// 12 with 30 days) is handled without a separate leap-year test.
function shamsiMonthRange(jy, jm) {
  const start = shamsiMonthStart(jy, jm);
  if (!start) return null;
  const nextStart = jm < 12 ? shamsiMonthStart(jy, jm + 1) : shamsiMonthStart(jy + 1, 1);
  if (!nextStart) return null;
  return { start, end: new Date(nextStart.getTime() - 1) };
}

// The FY is Shamsi-aligned when it starts on 1 Hamal (a few days of slack for
// schools that record the start as 20/21/22 March).
function resolveShamsiAnchorYear(source = {}) {
  const start = toDate(source?.startDate);
  if (!start) return null;
  const solar = gregorianToAfghanSolar(start);
  if (!solar || solar.jm !== 1 || solar.jd > 5) return null;
  return solar.jy;
}

function isShamsiAlignedSource(source = {}) {
  return resolveShamsiAnchorYear(source) !== null;
}

function clampRangeToSource(range, source, extra = {}) {
  const sourceStart = startOfDay(source?.startDate);
  const sourceEnd = endOfDay(source?.endDate);
  let startDate = range.start;
  let endDate = range.end;
  if (sourceStart && startDate < sourceStart) startDate = sourceStart;
  if (sourceEnd && endDate > sourceEnd) endDate = sourceEnd;
  if (startDate > endDate) {
    return { ...extra, startDate: new Date(0), endDate: new Date(0) };
  }
  return { ...extra, startDate: startOfDay(startDate), endDate: endOfDay(endDate) };
}

function getShamsiMonthRange(source = {}, month = 1) {
  const anchorYear = resolveShamsiAnchorYear(source);
  if (anchorYear === null) return getGregorianMonthRange(source, month);
  const normalizedMonth = Math.max(1, Math.min(12, Number(month) || 1));
  const range = shamsiMonthRange(anchorYear, normalizedMonth);
  if (!range) return getGregorianMonthRange(source, month);
  const sourceEnd = endOfDay(source?.endDate);
  if (sourceEnd && range.start > sourceEnd) return null;
  return clampRangeToSource(range, source, { month: normalizedMonth });
}

function getShamsiQuarterRange(source = {}, quarter = 1) {
  const anchorYear = resolveShamsiAnchorYear(source);
  if (anchorYear === null) return getGregorianQuarterRange(source, quarter);
  const normalizedQuarter = Math.max(1, Math.min(4, Number(quarter) || 1));
  const firstMonth = shamsiMonthRange(anchorYear, normalizedQuarter * 3 - 2);
  const lastMonth = shamsiMonthRange(anchorYear, normalizedQuarter * 3);
  if (!firstMonth || !lastMonth) return getGregorianQuarterRange(source, quarter);
  return clampRangeToSource({ start: firstMonth.start, end: lastMonth.end }, source, { quarter: normalizedQuarter });
}

function listShamsiQuarterRanges(source = {}) {
  if (resolveShamsiAnchorYear(source) === null) return listGregorianQuarterRanges(source);
  return [1, 2, 3, 4]
    .map((quarter) => getShamsiQuarterRange(source, quarter))
    .filter(Boolean);
}

module.exports = {
  DAY_MS,
  isShamsiAlignedSource,
  shamsiMonthRange,
  getShamsiMonthRange,
  getShamsiQuarterRange,
  listShamsiQuarterRanges
};
