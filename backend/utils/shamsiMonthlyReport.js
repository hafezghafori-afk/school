// Shared helper for the academy / short-term "monthly income & expense"
// reports. Buckets payments and expenses by Afghan solar (Shamsi) year-month
// instead of the Gregorian calendar - MongoDB has no native Jalali calendar
// support, so unlike a plain $group aggregation this pulls the matching rows
// and buckets them in JS using the numeric Jalali conversion in afghanDate.js.
const { gregorianToAfghanSolar, afghanSolarToGregorianInput } = require('./afghanDate');

const toNumber = (value) => Math.max(0, Number(value || 0));

// Builds the last `count` Shamsi calendar months (oldest first) as 'jy-jm'
// keys, ending with the current Shamsi month - used as the fixed axis both
// income/expense sets get bucketed onto, so a month with zero activity still
// shows up as a 0 row instead of silently disappearing from the report.
function lastShamsiMonthKeys(count) {
  const today = gregorianToAfghanSolar(new Date());
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    let jy = today.jy;
    let jm = today.jm - i;
    while (jm < 1) {
      jm += 12;
      jy -= 1;
    }
    keys.push(`${jy}-${String(jm).padStart(2, '0')}`);
  }
  return keys;
}

// All 12 'jy-jm' keys of a single Shamsi year (Hamal-Hoot), for the
// year/month filter on the report - as opposed to lastShamsiMonthKeys'
// rolling window ending at "today".
function yearShamsiMonthKeys(jy) {
  const keys = [];
  for (let m = 1; m <= 12; m += 1) {
    keys.push(`${jy}-${String(m).padStart(2, '0')}`);
  }
  return keys;
}

function shamsiMonthKeyOf(dateLike) {
  const solar = gregorianToAfghanSolar(dateLike);
  if (!solar) return null;
  return `${solar.jy}-${String(solar.jm).padStart(2, '0')}`;
}

function shamsiMonthKeyToGregorianStart(key) {
  const [jy, jm] = String(key).split('-').map(Number);
  return afghanSolarToGregorianInput(jy, jm, 1);
}

// Exclusive upper bound: the Gregorian date of the first day of the month
// right after `key`.
function shamsiMonthKeyToGregorianEnd(key) {
  const [jy, jm] = String(key).split('-').map(Number);
  const nextJy = jm === 12 ? jy + 1 : jy;
  const nextJm = jm === 12 ? 1 : jm + 1;
  return afghanSolarToGregorianInput(nextJy, nextJm, 1);
}

async function buildShamsiMonthlyReport({
  paymentModel,
  expenseModel,
  year,
  months,
  paymentDateField = 'paidAt',
  paymentAmountField = 'amount',
  paymentGroupField = 'paymentMethod',
  expenseDateField = 'expenseDate',
  expenseAmountField = 'amount',
  expenseGroupField = 'category'
}) {
  const monthKeys = (year && year >= 1300 && year <= 1600)
    ? yearShamsiMonthKeys(year)
    : lastShamsiMonthKeys(Math.min(24, Math.max(1, Number(months) || 12)));

  const rangeStart = shamsiMonthKeyToGregorianStart(monthKeys[0]);
  const rangeEndExclusive = shamsiMonthKeyToGregorianEnd(monthKeys[monthKeys.length - 1]);
  const rangeStartDate = new Date(`${rangeStart}T00:00:00.000Z`);
  const rangeEndDate = new Date(`${rangeEndExclusive}T00:00:00.000Z`);

  const [incomeDocs, expenseDocs] = await Promise.all([
    paymentModel.find(
      { [paymentDateField]: { $gte: rangeStartDate, $lt: rangeEndDate } },
      { [paymentDateField]: 1, [paymentAmountField]: 1, [paymentGroupField]: 1 }
    ).lean(),
    expenseModel.find(
      { [expenseDateField]: { $gte: rangeStart, $lt: rangeEndExclusive } },
      { [expenseDateField]: 1, [expenseAmountField]: 1, [expenseGroupField]: 1 }
    ).lean()
  ]);

  const monthMap = new Map(monthKeys.map((key) => [key, {
    month: key,
    income: 0,
    expenses: 0,
    byPaymentMethod: new Map(),
    byExpenseCategory: new Map()
  }]));

  incomeDocs.forEach((doc) => {
    const key = shamsiMonthKeyOf(doc[paymentDateField]);
    const bucket = key && monthMap.get(key);
    if (!bucket) return;
    const amount = toNumber(doc[paymentAmountField]);
    const method = doc[paymentGroupField] || 'other';
    bucket.income += amount;
    bucket.byPaymentMethod.set(method, toNumber(bucket.byPaymentMethod.get(method)) + amount);
  });

  expenseDocs.forEach((doc) => {
    const key = shamsiMonthKeyOf(doc[expenseDateField]);
    const bucket = key && monthMap.get(key);
    if (!bucket) return;
    const amount = toNumber(doc[expenseAmountField]);
    const category = doc[expenseGroupField] || 'other';
    bucket.expenses += amount;
    bucket.byExpenseCategory.set(category, toNumber(bucket.byExpenseCategory.get(category)) + amount);
  });

  return monthKeys.map((key) => {
    const bucket = monthMap.get(key);
    return {
      month: bucket.month,
      income: bucket.income,
      expenses: bucket.expenses,
      net: bucket.income - bucket.expenses,
      byPaymentMethod: Array.from(bucket.byPaymentMethod, ([method, total]) => ({ method, total })),
      byExpenseCategory: Array.from(bucket.byExpenseCategory, ([category, total]) => ({ category, total }))
    };
  });
}

// Gregorian [start, endExclusive) 'YYYY-MM-DD' bounds of the current Shamsi
// calendar month - for "this month" dashboard cards that used to match
// against the Gregorian month instead.
function currentShamsiMonthRange() {
  const key = lastShamsiMonthKeys(1)[0];
  return {
    start: shamsiMonthKeyToGregorianStart(key),
    endExclusive: shamsiMonthKeyToGregorianEnd(key)
  };
}

module.exports = {
  lastShamsiMonthKeys,
  yearShamsiMonthKeys,
  buildShamsiMonthlyReport,
  currentShamsiMonthRange,
  // Exposed for callers that need to bucket rows onto a Shamsi-month axis
  // themselves (e.g. the cross-database consolidated finance report) instead
  // of going through buildShamsiMonthlyReport's fixed two-model shape.
  shamsiMonthKeyOf,
  shamsiMonthKeyToGregorianStart,
  shamsiMonthKeyToGregorianEnd
};
