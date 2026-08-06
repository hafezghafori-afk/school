function toDate(value) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function startOfDay(value) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(value) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addMonths(value, count = 0) {
  const date = toDate(value);
  if (!date) return null;
  const next = new Date(date);
  next.setMonth(next.getMonth() + Number(count || 0));
  return next;
}

function normalizePeriodSource(source = {}) {
  return {
    startDate: startOfDay(source.startDate),
    endDate: endOfDay(source.endDate)
  };
}

function getQuarterRange(source = {}, quarter = 1) {
  const normalizedQuarter = Math.max(1, Math.min(4, Number(quarter) || 1));
  const { startDate, endDate } = normalizePeriodSource(source);
  if (!startDate || !endDate) return null;

  const quarterStart = addMonths(startDate, (normalizedQuarter - 1) * 3);
  const quarterEndCandidate = new Date(addMonths(startDate, normalizedQuarter * 3) - 1);
  const quarterEnd = quarterEndCandidate > endDate ? endDate : quarterEndCandidate;

  return {
    quarter: normalizedQuarter,
    startDate: startOfDay(quarterStart),
    endDate: endOfDay(quarterEnd)
  };
}

function listQuarterRanges(source = {}) {
  return [1, 2, 3, 4]
    .map((quarter) => getQuarterRange(source, quarter))
    .filter(Boolean);
}

function getMonthRange(source = {}, month = 1) {
  const { startDate, endDate } = normalizePeriodSource(source);
  if (!startDate || !endDate) return null;
  const normalizedMonth = Math.max(1, Math.min(12, Number(month) || 1));

  const monthStart = addMonths(startDate, normalizedMonth - 1);
  if (monthStart > endDate) return null;
  const monthEndCandidate = new Date(addMonths(startDate, normalizedMonth) - 1);
  const monthEnd = monthEndCandidate > endDate ? endDate : monthEndCandidate;

  return {
    month: normalizedMonth,
    startDate: startOfDay(monthStart),
    endDate: endOfDay(monthEnd)
  };
}

function listMonthRanges(source = {}) {
  return Array.from({ length: 12 }, (_, index) => index + 1)
    .map((month) => getMonthRange(source, month))
    .filter(Boolean);
}

function resolveQuarterForDate(source = {}, value = null) {
  const date = toDate(value);
  if (!date) return null;
  const ranges = listQuarterRanges(source);
  const match = ranges.find((item) => date >= item.startDate && date <= item.endDate);
  return match ? match.quarter : null;
}

module.exports = {
  addMonths,
  endOfDay,
  getMonthRange,
  getQuarterRange,
  listMonthRanges,
  listQuarterRanges,
  resolveQuarterForDate,
  startOfDay,
  toDate
};
