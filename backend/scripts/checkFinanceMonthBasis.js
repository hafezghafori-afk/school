// The finance centre reports in Afghan solar months. This check pins the
// shared basis the dashboard, the monthly trend and the monthly report agree
// on: a bill belongs to its bill month (the Afghan month of its due date),
// months are solar months, and overdue is never measured past today.
const assert = require('assert');

const {
  afghanMonthKeyBounds,
  formatAfghanMonthKeyLabel,
  normalizeAfghanMonthKey,
  shiftAfghanMonthKey,
  toAfghanMonthKey
} = require('../utils/afghanDate');

// ---- solar month helpers ----
assert.strictEqual(toAfghanMonthKey('2026-09-22'), '1405-06', '31 Sonbola 1405 is in Sonbola');
assert.strictEqual(toAfghanMonthKey('2026-09-23'), '1405-07', '1 Mizan 1405 is in Mizan (Gregorian September spans two solar months)');
assert.strictEqual(normalizeAfghanMonthKey('۱۴۰۵-۷'), '1405-07', 'Dari digits and a one-digit month normalize');
assert.strictEqual(normalizeAfghanMonthKey('2026-09'), '', 'a Gregorian month key is not a solar month');
assert.strictEqual(shiftAfghanMonthKey('1405-12', 1), '1406-01');
assert.strictEqual(shiftAfghanMonthKey('1405-01', -1), '1404-12');
const sonbola = afghanMonthKeyBounds('1405-06');
assert.deepStrictEqual(
  [sonbola.start.getFullYear(), sonbola.start.getMonth() + 1, sonbola.start.getDate()],
  [2026, 8, 23],
  'Sonbola 1405 starts on 23 Aug 2026'
);
assert.deepStrictEqual(
  [sonbola.end.getFullYear(), sonbola.end.getMonth() + 1, sonbola.end.getDate(), sonbola.end.getHours()],
  [2026, 9, 22, 23],
  'Sonbola 1405 ends on 22 Sep 2026'
);
assert.strictEqual(formatAfghanMonthKeyLabel('1405-06'), 'سنبله ۱۴۰۵');

// ---- in-memory stand-ins for the collections the services read ----
const store = {
  feeOrders: [],
  feePayments: [],
  expenses: [],
  refunds: []
};

const readPath = (item, key) => key.split('.').reduce((value, part) => (value == null ? value : value[part]), item);
const toComparable = (value) => (value instanceof Date ? value.getTime() : value);

function matchesCondition(actual, expected) {
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof Date) return toComparable(actual) === expected.getTime();
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    return Object.entries(expected).every(([operator, operand]) => {
      const left = toComparable(actual);
      const right = toComparable(operand);
      if (operator === '$gte') return actual != null && left >= right;
      if (operator === '$lte') return actual != null && left <= right;
      if (operator === '$ne') return String(actual) !== String(operand);
      if (operator === '$in') return operand.some((entry) => String(entry) === String(actual));
      if (operator === '$nin') return !operand.some((entry) => String(entry) === String(actual));
      throw new Error(`unsupported operator ${operator}`);
    });
  }
  return String(actual) === String(expected);
}

function matches(item, filter = {}) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    if (key === '$and') return expected.every((branch) => matches(item, branch));
    if (key === '$or') return expected.some((branch) => matches(item, branch));
    return matchesCondition(readPath(item, key), expected);
  });
}

class Query {
  constructor(rows) {
    this.rows = rows;
  }

  select() { return this; }

  populate() { return this; }

  sort() { return this; }

  limit() { return this; }

  lean() { return this; }

  then(resolve, reject) {
    return Promise.resolve(this.rows.map((row) => ({ ...row }))).then(resolve, reject);
  }
}

const patchFind = (Model, rowsKey) => {
  Model.find = (filter = {}) => new Query((typeof rowsKey === 'string' ? store[rowsKey] : rowsKey).filter((row) => matches(row, filter)));
};

patchFind(require('../models/FeeOrder'), 'feeOrders');
patchFind(require('../models/FeePayment'), 'feePayments');
patchFind(require('../models/ExpenseEntry'), 'expenses');
patchFind(require('../models/FinanceRefund'), 'refunds');
patchFind(require('../models/FinanceTreasuryTransaction'), []);
patchFind(require('../models/ExpenseCategoryDefinition'), []);

// Payment recognition, refunds, lifecycle badges and admission numbers have
// their own checks; stub them before the services destructure them.
const revenueRecognition = require('../utils/financeRevenueRecognition');
revenueRecognition.recognizePayments = async (payments = []) => payments.map((payment) => ({
  payment,
  recognizedAmount: Number(payment.amount || 0)
}));
require('../utils/financeRefundRecognition').sumPaidRefunds = async () => ({ total: 0, count: 0, rows: [] });
const lifecycle = require('../utils/financeStudentLifecycleStatus');
lifecycle.loadCurrentMembershipStatusMap = async () => new Map();
lifecycle.attachLifecycleBadge = (row) => row;
lifecycle.hasStudentLeft = () => false;
require('../utils/studentAdmissionNumber').resolveAsasNumberMapForDocs = async () => new Map();

const { buildFinanceDashboardOverview, normalizeDateRange } = require('../services/financeDashboardService');
const { buildFinanceMonthlyTrend } = require('../services/financeCloseService');

const local = (year, month, day) => new Date(year, month - 1, day);
const order = (id, { dueDate, issuedAt, outstanding = 0, amount = 100 }) => ({
  _id: id,
  orderNumber: id,
  schoolId: 'school-1',
  student: `student-${id}`,
  status: outstanding > 0 ? 'new' : 'paid',
  amountOriginal: amount,
  amountDue: amount,
  amountPaid: amount - outstanding,
  outstandingAmount: outstanding,
  adjustments: [],
  dueDate,
  issuedAt
});

async function run() {
  // ---- date range parsing ----
  const now = local(2026, 9, 24); // 2 Mizan 1405
  const defaultRange = normalizeDateRange({ asOf: now });
  assert.strictEqual(toAfghanMonthKey(defaultRange.startAt), '1405-07', 'no range = the current Afghan month');
  assert.strictEqual(defaultRange.startAt.getDate(), 23, 'the default range starts on 1 Mizan, not on the 1st of the Gregorian month');
  assert.strictEqual(defaultRange.asOf.getTime(), now.getTime(), 'overdue is measured today while the range has not ended');
  const pastRange = normalizeDateRange({ from: '2026-08-23', to: '2026-09-22', asOf: now });
  assert.deepStrictEqual(
    [pastRange.startAt.getMonth() + 1, pastRange.startAt.getDate(), pastRange.endAt.getMonth() + 1, pastRange.endAt.getDate()],
    [8, 23, 9, 22],
    'a picked date is read as that calendar day'
  );
  assert.strictEqual(pastRange.asOf.getTime(), pastRange.endAt.getTime(), 'a finished range is measured at its end');

  // ---- dashboard overview: bills by bill month ----
  store.feeOrders = [
    // Sonbola's bill, prepared on 29 Asad before its month began.
    order('sonbola-early', { dueDate: local(2026, 9, 1), issuedAt: local(2026, 8, 20), outstanding: 100 }),
    // Mizan's bill, prepared on 29 Sonbola - it is not a Sonbola bill.
    order('mizan-early', { dueDate: local(2026, 10, 2), issuedAt: local(2026, 9, 20), outstanding: 100 }),
    // An Asad bill that is still unpaid.
    order('asad-open', { dueDate: local(2026, 8, 1), issuedAt: local(2026, 7, 25), outstanding: 40 }),
    // A bill with no due date falls back to its issue day.
    order('no-due-date', { dueDate: null, issuedAt: local(2026, 9, 5), outstanding: 0 })
  ];
  store.feePayments = [];
  store.expenses = [];

  const sonbolaOverview = await buildFinanceDashboardOverview({
    schoolId: 'school-1',
    from: '2026-08-23',
    to: '2026-09-22',
    asOf: now
  });
  const sonbolaBillIds = sonbolaOverview.recent.bills.map((item) => item.id).sort();
  assert.deepStrictEqual(sonbolaBillIds, ['no-due-date', 'sonbola-early'], 'Sonbola shows Sonbola\'s bills, wherever they were prepared');
  assert.strictEqual(sonbolaOverview.kpis.issuedBills.count, 2);
  assert.strictEqual(
    sonbolaOverview.recent.bills.find((item) => item.id === 'sonbola-early').monthLabel,
    'سنبله ۱۴۰۵',
    'recent bills carry their bill month'
  );
  assert.strictEqual(sonbolaOverview.kpis.outstanding.amount, 140, 'standing balance = bills whose month has started by 31 Sonbola');
  assert.strictEqual(sonbolaOverview.kpis.overdue.amount, 140, 'both open bills were overdue at the end of Sonbola');
  assert.strictEqual(sonbolaOverview.period.billBasis, 'bill_month');

  const mizanOverview = await buildFinanceDashboardOverview({
    schoolId: 'school-1',
    from: '2026-09-23',
    to: '2026-10-22',
    asOf: now
  });
  assert.deepStrictEqual(mizanOverview.recent.bills.map((item) => item.id), ['mizan-early'], 'Mizan shows only Mizan\'s bill');
  assert.strictEqual(mizanOverview.kpis.outstanding.amount, 240, 'Mizan\'s standing balance includes its own bill');
  assert.strictEqual(
    mizanOverview.kpis.overdue.amount,
    140,
    'Mizan\'s bill (due 10 Mizan) is not overdue on 2 Mizan, even though the range runs to 31 Mizan'
  );

  // ---- monthly trend: solar buckets ----
  store.feeOrders = [
    order('trend-sonbola', { dueDate: local(2026, 8, 25), issuedAt: local(2026, 8, 25), outstanding: 30 }),
    order('trend-mizan', { dueDate: local(2026, 9, 23), issuedAt: local(2026, 9, 23), outstanding: 0 })
  ];
  store.feePayments = [
    { _id: 'pay-sonbola', schoolId: 'school-1', status: 'approved', amount: 70, paidAt: local(2026, 8, 25) },
    // 1 Mizan - Gregorian September, which the old Gregorian buckets filed
    // together with 10-31 Sonbola under the label "Sonbola".
    { _id: 'pay-mizan', schoolId: 'school-1', status: 'approved', amount: 50, paidAt: local(2026, 9, 23) }
  ];
  store.expenses = [
    { _id: 'expense-sonbola', schoolId: 'school-1', status: 'approved', amount: 20, expenseDate: local(2026, 9, 22) }
  ];
  store.refunds = [];
  const trend = await buildFinanceMonthlyTrend({ schoolId: 'school-1', months: 3, asOf: now });
  assert.deepStrictEqual(trend.map((item) => item.monthKey), ['1405-05', '1405-06', '1405-07'], 'the trend lists solar months ending with the current one');
  const byKey = new Map(trend.map((item) => [item.monthKey, item]));
  assert.strictEqual(byKey.get('1405-06').monthLabel, 'سنبله ۱۴۰۵');
  assert.strictEqual(byKey.get('1405-06').income, 70);
  assert.strictEqual(byKey.get('1405-06').expense, 20, '31 Sonbola stays in Sonbola');
  assert.strictEqual(byKey.get('1405-06').arrearsAmount, 30);
  assert.strictEqual(byKey.get('1405-07').income, 50, '1 Mizan is Mizan income');
  assert.strictEqual(byKey.get('1405-07').billsIssuedCount, 1);

  const anchoredTrend = await buildFinanceMonthlyTrend({ schoolId: 'school-1', months: 2, asOf: local(2026, 9, 1) });
  assert.deepStrictEqual(anchoredTrend.map((item) => item.monthKey), ['1405-05', '1405-06'], 'asOf picks the last month shown');

  console.log('check:finance-month-basis PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
