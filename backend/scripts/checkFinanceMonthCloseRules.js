// Month close by Afghan solar month: which days a close covers, when it locks
// them, the order months close and reopen in, and the period guard that
// refuses writes into a locked month (run against an in-memory model).
const assert = require('assert');
const path = require('path');
const Module = require('module');

const rules = require('../utils/financeMonthClosePeriods');

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`FAIL  ${name}\n      ${error.message}`);
  }
}

const day = (value) => new Date(`${value}T00:00:00`);
const at = (value) => new Date(`${value}T12:00:00`);
// A January-December year touches 13 solar months; a Hamal-Hoot year 12.
const gregorianYear = { startDate: day('2026-01-01'), endDate: day('2026-12-31') };
const solarYear = { startDate: day('2026-03-21'), endDate: day('2027-03-20') };

// In-memory FinanceMonthClose for the guard: enough of Mongo's matching for
// the guard's query (dotted paths, $in, $lte/$gte, null, $or).
const store = [];
const readPath = (item, key) => key.split('.').reduce((value, part) => (value == null ? undefined : value[part]), item);
const matchValue = (actual, expected) => {
  if (expected === null) return actual == null;
  if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
  if (expected && typeof expected === 'object') {
    if ('$in' in expected) return expected.$in.some((value) => String(value) === String(actual));
    if (actual == null) return false;
    if ('$lte' in expected && !(new Date(actual).getTime() <= new Date(expected.$lte).getTime())) return false;
    if ('$gte' in expected && !(new Date(actual).getTime() >= new Date(expected.$gte).getTime())) return false;
    return true;
  }
  return String(actual) === String(expected);
};
const matches = (item, filter) => Object.entries(filter).every(([key, expected]) => (
  key === '$or' ? expected.some((branch) => matches(item, branch)) : matchValue(readPath(item, key), expected)
));
const FinanceMonthCloseMock = {
  find(filter = {}) {
    const rows = () => store.filter((item) => matches(item, filter)).map((item) => ({ ...item }));
    const query = {
      select: () => query,
      session: () => query,
      lean: () => Promise.resolve(rows())
    };
    return query;
  }
};
const FinancialYearMock = {
  findOne() {
    const year = { _id: '507f1f77bcf86cd799439012', status: 'active', isClosed: false };
    const query = { sort: () => query, session: () => query, then: (resolve) => resolve(year) };
    return query;
  }
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  const fromGuard = String(parent?.filename || '').endsWith(path.join('services', 'financePeriodGuardService.js'));
  if (fromGuard && request === '../models/FinanceMonthClose') return FinanceMonthCloseMock;
  if (fromGuard && request === '../models/FinancialYear') return FinancialYearMock;
  return originalLoad.call(this, request, parent, isMain);
};
const guard = require('../services/financePeriodGuardService');
Module._load = originalLoad;

const SCHOOL = '507f1f77bcf86cd799439011';
const YEAR = '507f1f77bcf86cd799439012';
const record = (fields) => ({ schoolId: SCHOOL, financialYearId: YEAR, ...fields });

async function run() {
  await check('month keys: solar keys are solar, Gregorian keys legacy, anything else invalid', () => {
    assert.strictEqual(rules.resolveMonthCloseCalendar('1405-06'), 'shamsi');
    assert.strictEqual(rules.resolveMonthCloseCalendar('2026-09'), 'gregorian');
    assert.strictEqual(rules.resolveMonthCloseCalendar('1405-13'), '');
    assert.strictEqual(rules.resolveMonthCloseCalendar(''), '');
  });

  await check('close window: a solar month covers its own days, clipped to the financial year', () => {
    const sonbola = rules.resolveMonthCloseWindow('1405-06', gregorianYear);
    assert.strictEqual(sonbola.startAt.getTime(), day('2026-08-23').getTime());
    assert.strictEqual(sonbola.endAt.getTime(), new Date(2026, 8, 22, 23, 59, 59, 999).getTime());
    const firstMonth = rules.resolveMonthCloseWindow('1404-10', gregorianYear);
    assert.strictEqual(firstMonth.startAt.getTime(), day('2026-01-01').getTime(), 'first month starts with the year');
    assert.strictEqual(firstMonth.endAt.getTime(), new Date(2026, 0, 20, 23, 59, 59, 999).getTime());
    assert.strictEqual(rules.resolveMonthCloseWindow('1403-01', gregorianYear), null, 'a month outside the year');
    const legacy = rules.resolveMonthCloseWindow('2026-09');
    assert.strictEqual(legacy.startAt.getTime(), day('2026-09-01').getTime());
    assert.strictEqual(legacy.endAt.getTime(), new Date(2026, 8, 30, 23, 59, 59, 999).getTime());
  });

  await check('financial year months: every solar month the year touches, in order', () => {
    const months = rules.listFinancialYearMonthKeys(gregorianYear);
    assert.strictEqual(months.length, 13);
    assert.strictEqual(months[0], '1404-10');
    assert.strictEqual(months[12], '1405-10');
    const solarMonths = rules.listFinancialYearMonthKeys(solarYear);
    assert.deepStrictEqual([solarMonths.length, solarMonths[0], solarMonths[11]], [12, '1405-01', '1405-12']);
  });

  await check('coverage: older Gregorian closes count for a solar month only when they cover all its days', () => {
    const sonbola = rules.resolveMonthCloseWindow('1405-06', gregorianYear);
    const august = rules.resolveMonthCloseWindow('2026-08');
    const september = rules.resolveMonthCloseWindow('2026-09');
    assert.strictEqual(rules.isWindowCovered(sonbola, [september, august]), true);
    assert.strictEqual(rules.isWindowCovered(sonbola, [august]), false);
    assert.strictEqual(rules.isWindowCovered(sonbola, [rules.resolveMonthCloseWindow('1405-06', gregorianYear)]), true);
    assert.strictEqual(rules.isWindowCovered(sonbola, []), false);
  });

  await check('lock: closed and in-review months are locked, a reopen only until its deadline', () => {
    const now = at('2026-09-24');
    assert.deepStrictEqual(rules.resolveMonthCloseLock({ status: 'closed' }, now), { locked: true, reason: 'closed' });
    assert.deepStrictEqual(rules.resolveMonthCloseLock({ status: 'pending_review' }, now), { locked: true, reason: 'in_review' });
    assert.strictEqual(rules.resolveMonthCloseLock({ status: 'reopened', reopenDeadline: at('2026-09-25') }, now).locked, false);
    assert.deepStrictEqual(
      rules.resolveMonthCloseLock({ status: 'reopened', reopenDeadline: at('2026-09-23') }, now),
      { locked: true, reason: 'reopen_expired' }
    );
    assert.strictEqual(rules.resolveMonthCloseLock({ status: 'reopened', reopenDeadline: null }, now).locked, false);
    assert.strictEqual(rules.resolveMonthCloseLock({ status: 'rejected' }, now).locked, false);
  });

  await check('lock message: names the solar month and says what to do for each reason', () => {
    const month = { monthKey: '1405-06' };
    assert.ok(rules.buildMonthCloseLockMessage(month, 'closed').includes('سنبله'));
    assert.ok(rules.buildMonthCloseLockMessage(month, 'in_review').includes('در جریان تایید'));
    assert.ok(rules.buildMonthCloseLockMessage(month, 'reopen_expired').includes('مهلت بازگشایی'));
    assert.ok(rules.formatMonthCloseLabel({ monthKey: '2026-09' }).includes('میلادی'));
  });

  await check('reopen days: 3 by default, between 1 and 7', () => {
    assert.strictEqual(rules.normalizeReopenDays(undefined), 3);
    assert.strictEqual(rules.normalizeReopenDays(0), 3);
    assert.strictEqual(rules.normalizeReopenDays('5'), 5);
    assert.strictEqual(rules.normalizeReopenDays(30), 7);
    assert.strictEqual(rules.normalizeReopenDays(1), 1);
  });

  await check('fingerprint: the month\'s own figures count, standing balances do not', () => {
    const base = { ordersIssuedCount: 4, ordersIssuedAmount: 4000, approvedPaymentAmount: 2500, standingOutstandingAmount: 900 };
    const fingerprint = rules.buildMonthCloseFingerprint(base);
    assert.strictEqual(rules.buildMonthCloseFingerprint({ ...base, standingOutstandingAmount: 100 }), fingerprint);
    assert.notStrictEqual(rules.buildMonthCloseFingerprint({ ...base, ordersIssuedAmount: 4100 }), fingerprint);
    const diff = rules.diffMonthCloseTotals(base, { ...base, ordersIssuedAmount: 4100, standingOutstandingAmount: 100 });
    assert.deepStrictEqual(diff.map((row) => [row.key, row.delta]), [['ordersIssuedAmount', 100], ['standingOutstandingAmount', -800]]);
  });

  await check('guard: a solar close locks exactly its days, and a reopen unlocks them until the deadline', async () => {
    store.length = 0;
    const sonbola = rules.resolveMonthCloseWindow('1405-06', gregorianYear);
    store.push(record({ monthKey: '1405-06', status: 'closed', closeWindow: { startAt: sonbola.startAt, endAt: sonbola.endAt } }));
    const scope = { schoolId: SCHOOL, financialYearId: YEAR };
    assert.strictEqual(await guard.isFinanceMonthClosed(at('2026-08-23'), scope), true);
    assert.strictEqual(await guard.isFinanceMonthClosed(at('2026-09-22'), scope), true);
    assert.strictEqual(await guard.isFinanceMonthClosed(at('2026-08-22'), scope), false, 'the day before Sonbola');
    assert.strictEqual(await guard.isFinanceMonthClosed(at('2026-09-23'), scope), false, 'the first day of Mizan');
    await assert.rejects(
      guard.assertFinancePeriodWritable({ ...scope, dateValue: at('2026-09-01') }),
      (error) => error.code === 'finance_month_closed' && error.messageDari.includes('سنبله')
    );

    store[0].status = 'reopened';
    store[0].reopenDeadline = new Date(Date.now() + 60 * 60 * 1000);
    assert.strictEqual(await guard.isFinanceMonthClosed(at('2026-09-01'), scope), false);
    store[0].reopenDeadline = new Date(Date.now() - 1000);
    const lock = await guard.findLockingMonthClose(at('2026-09-01'), scope);
    assert.strictEqual(lock?.reason, 'reopen_expired');

    store[0].status = 'pending_review';
    assert.strictEqual((await guard.findLockingMonthClose(at('2026-09-01'), scope))?.reason, 'in_review');
    store[0].status = 'rejected';
    assert.strictEqual(await guard.isFinanceMonthClosed(at('2026-09-01'), scope), false);
  });

  await check('guard: closes made before the switch keep their Gregorian month locked', async () => {
    store.length = 0;
    store.push(record({ monthKey: '2026-07', status: 'closed' }));
    const july = rules.resolveMonthCloseWindow('2026-08');
    store.push(record({ monthKey: '2026-08', status: 'closed', closeWindow: { startAt: july.startAt, endAt: july.endAt } }));
    const scope = { schoolId: SCHOOL, financialYearId: YEAR };
    assert.strictEqual(await guard.isFinanceMonthClosed(at('2026-07-15'), scope), true, 'record without a stored window');
    assert.strictEqual(await guard.isFinanceMonthClosed(at('2026-08-31'), scope), true, 'record with a stored window');
    assert.strictEqual(await guard.isFinanceMonthClosed(at('2026-09-01'), scope), false);
    assert.strictEqual(await guard.isFinanceMonthClosed(at('2026-07-15'), { schoolId: '507f1f77bcf86cd799439099' }), false, 'another school');
  });

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`\nFinance month close rules: ${failed.length} of ${results.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nFinance month close rules passed: ${results.length} check(s).`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
