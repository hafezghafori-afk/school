// گزارشِ مالیِ یکپارچهٔ مکتب — سه حوزهٔ جدا را که هرکدام دیتابیسِ مستقلِ خودش
// را دارد فقط‌خواندنی می‌خواند و کنارِ هم می‌گذارد:
//   • مرکز مالی مکتب        → دیتابیسِ اصلی (FeePayment / ExpenseEntry / FeeOrder)
//   • آموزشگاه              → academy_db      (AcademyPayment / AcademyExpense / AcademyRegistration)
//   • شاگردانِ موقت         → short_term_center_db (ShortTerm*)
//
// مبنا: «ماهِ شمسی، نقدی» — درآمدِ هر ماه = پولی که در همان ماهِ شمسی واقعاً
// دریافت شده (paidAt). هیچ join سطحِ دیتابیس انجام نمی‌شود؛ merge فقط اینجا در
// لایهٔ سرویس است. همه‌چیز AFN فرض می‌شود (رجوع به طرحِ توافق‌شده).

const FeePayment = require('../models/FeePayment');
const ExpenseEntry = require('../models/ExpenseEntry');
const FeeOrder = require('../models/FeeOrder');

const AcademyPayment = require('../models/AcademyPayment');
const AcademyExpense = require('../models/AcademyExpense');
const AcademyRegistration = require('../models/AcademyRegistration');
const AcademyStudent = require('../models/AcademyStudent');
const AcademyCourse = require('../models/AcademyCourse');
const AcademyClass = require('../models/AcademyClass');
const AcademyCharge = require('../models/AcademyCharge');

const ShortTermPayment = require('../models/ShortTermPayment');
const ShortTermExpense = require('../models/ShortTermExpense');
const ShortTermRegistration = require('../models/ShortTermRegistration');
const ShortTermStudent = require('../models/ShortTermStudent');
const ShortTermClass = require('../models/ShortTermClass');

const { sumPaidRefunds } = require('../utils/financeRefundRecognition');
const { resolveAsasNumberMapForDocs, pickAdmissionNo } = require('../utils/studentAdmissionNumber');
const {
  lastShamsiMonthKeys,
  yearShamsiMonthKeys,
  shamsiMonthKeyOf,
  shamsiMonthKeyToGregorianStart,
  shamsiMonthKeyToGregorianEnd
} = require('../utils/shamsiMonthlyReport');

const DAY_MS = 24 * 60 * 60 * 1000;
// همهٔ بدهکاران در payload می‌آیند (صفحه‌بندی سمتِ کلاینت است)؛ فقط یک سقفِ
// ایمنی برای جلوگیری از payloadِ غول‌آسا.
const DEFAULT_DEBTOR_LIMIT = 2000;

// نرمال‌سازی کلیدِ ماهِ شمسی: «1405-7» → «1405-07»
function normMonthKey(value) {
  const match = String(value || '').match(/^(\d{3,4})-(\d{1,2})/);
  return match ? `${Number(match[1])}-${String(Number(match[2])).padStart(2, '0')}` : '';
}

// کلیدِ ماهِ شمسی از یک تاریخِ میلادی
function shamsiMonthOfDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return shamsiMonthKeyOf(date) || '';
}

// «تاریخِ ثبت‌نامِ» آموزشگاه/موقت گاهی رشتهٔ شمسیِ 'YYYY-MM-DD' و گاهی تاریخِ
// میلادیِ ISO است — هر دو حالت را به کلیدِ ماهِ شمسی تبدیل می‌کند.
function shamsiMonthFromRegDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{3,4})-(\d{1,2})/);
  if (match) {
    const year = Number(match[1]);
    if (year >= 1300 && year <= 1500) return `${year}-${String(Number(match[2])).padStart(2, '0')}`;
  }
  return shamsiMonthOfDate(raw);
}
const DOMAIN_KEYS = ['school', 'shortTerm', 'academy'];
const DOMAIN_LABELS = {
  school: 'مرکز مالی مکتب',
  shortTerm: 'شاگردان موقت',
  academy: 'آموزشگاه'
};

const toNumber = (value) => Math.max(0, Number(value || 0));
const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const safePercent = (part, whole) => (Number(whole) > 0 ? round((Number(part) / Number(whole)) * 10000) / 100 : 0);

function newMonthlyMap(monthKeys) {
  return new Map(monthKeys.map((key) => [key, { month: key, income: 0, expense: 0, net: 0 }]));
}

function bucket(monthlyMap, dateValue, field, amount) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return;
  const key = shamsiMonthKeyOf(date);
  const row = key && monthlyMap.get(key);
  if (row) row[field] = round(row[field] + Number(amount || 0));
}

function toSortedList(map, keyName) {
  return Array.from(map.entries())
    .map(([value, total]) => ({ [keyName]: value || 'other', total: round(total) }))
    .sort((left, right) => right.total - left.total);
}

function finalizeMonthly(monthlyMap, monthKeys) {
  return monthKeys.map((key) => {
    const row = monthlyMap.get(key);
    row.income = round(row.income);
    row.expense = round(row.expense);
    row.net = round(row.income - row.expense);
    return row;
  });
}

// ── بدهکاران: باقیاتِ باز «تا همین لحظه» است و به بازهٔ تاریخی ربطی ندارد،
//    پس این توابع مستقل از year/months کار می‌کنند و هم برای کارت‌های خلاصه و
//    هم برای صفحهٔ drill-downِ «همهٔ بدهکاران» به‌کار می‌روند.

async function loadSchoolDebtors() {
  const standingOrders = await FeeOrder.find({ status: { $ne: 'void' } })
    .select('amountDue amountPaid outstandingAmount student studentId classId dueDate issuedAt periodLabel')
    .populate('studentId', 'fullName admissionNo')
    .populate('student', 'name')
    .populate('classId', 'title')
    .lean();

  // نمبرِ اساس: StudentCore.admissionNo اول، وگرنه AfghanStudent.asasNumber
  const asasMap = await resolveAsasNumberMapForDocs(standingOrders);

  const now = Date.now();
  let dueSum = 0;
  let paidSum = 0;
  const map = new Map();
  // «شاگردِ فعالِ مالیِ مکتب» = هرکس بلِ غیرِ ابطالی با پرداخت یا باقیاتِ باز دارد
  // (مکتب مدلِ سبکِ «شاگردِ فعال» مثلِ آموزشگاه/موقت ندارد).
  const activeStudentIds = new Set();
  standingOrders.forEach((order) => {
    dueSum += toNumber(order.amountDue);
    paidSum += toNumber(order.amountPaid);
    const outstanding = toNumber(order.outstandingAmount);
    const holderId = String(order.studentId?._id || order.student?._id || order.student || '');
    if (holderId && (outstanding > 0 || toNumber(order.amountPaid) > 0)) activeStudentIds.add(holderId);
    if (outstanding <= 0) return;
    const id = holderId || 'unknown';
    const asas = pickAdmissionNo(order, asasMap);
    const row = map.get(id) || {
      studentName: order.studentId?.fullName || order.student?.name || 'شاگرد',
      studentCode: asas,
      asasNumber: asas,
      groupName: order.classId?.title || 'بدون صنف',
      balance: 0,
      orderCount: 0,
      overdueCount: 0,
      maxLateDays: 0,
      monthKey: '',
      monthLabel: '',
      _oldestDue: Infinity
    };
    row.balance = round(row.balance + outstanding);
    row.orderCount += 1;
    const dueTs = new Date(order.dueDate || order.issuedAt || now).getTime();
    const dueSafe = Number.isNaN(dueTs) ? now : dueTs;
    const lateDays = Math.max(0, Math.floor((now - dueSafe) / DAY_MS));
    if (lateDays > 0) row.overdueCount += 1;
    row.maxLateDays = Math.max(row.maxLateDays, lateDays);
    // «ماهِ شاگرد» = ماهِ قدیمی‌ترین بلِ بازِ او
    if (dueSafe < row._oldestDue) {
      row._oldestDue = dueSafe;
      row.monthKey = shamsiMonthOfDate(order.dueDate || order.issuedAt);
      row.monthLabel = String(order.periodLabel || '').trim();
    }
    map.set(id, row);
  });

  const debtors = Array.from(map.values())
    .map(({ _oldestDue, ...rest }) => rest)
    .sort((left, right) => right.balance - left.balance);
  return {
    debtors,
    count: debtors.length,
    totalOutstanding: round(debtors.reduce((sum, row) => sum + row.balance, 0)),
    activeStudentCount: activeStudentIds.size,
    dueSum,
    paidSum
  };
}

async function loadCenterDebtors({ RegistrationModel, CourseModel, ChargeModel }) {
  const regPopulate = [{ path: 'studentId', select: 'fullName studentCode phone guardianPhone' }];
  if (CourseModel) regPopulate.push({ path: 'courseId', select: 'name' });
  regPopulate.push({ path: 'classId', select: 'name' });

  const registrations = await RegistrationModel.find({ status: { $ne: 'cancelled' } })
    .select('totalPayable paidAmount balance status paymentPlan studentId courseId classId startDate registrationDate')
    .populate(regPopulate)
    .lean();

  // آموزشگاه: «ماهِ شاگرد» = قدیمی‌ترین قلمِ بدهیِ بازِ همان ثبت‌نام (AcademyCharge.periodKey).
  let oldestOpenChargeByReg = new Map();
  if (ChargeModel) {
    try {
      const rows = await ChargeModel.aggregate([
        { $match: { status: { $ne: 'void' }, balance: { $gt: 0 } } },
        { $group: { _id: '$registrationId', minPeriod: { $min: '$periodKey' } } }
      ]);
      oldestOpenChargeByReg = new Map(rows.map((item) => [String(item._id), normMonthKey(item.minPeriod)]));
    } catch {
      oldestOpenChargeByReg = new Map();
    }
  }

  let dueSum = 0;
  let paidSum = 0;
  const debtors = [];
  registrations.forEach((reg) => {
    dueSum += toNumber(reg.totalPayable);
    paidSum += toNumber(reg.paidAmount);
    const balance = toNumber(reg.balance);
    if (balance > 0 && reg.status === 'active') {
      const code = reg.studentId?.studentCode || '';
      const monthKey = oldestOpenChargeByReg.get(String(reg._id))
        || shamsiMonthFromRegDate(reg.startDate)
        || shamsiMonthFromRegDate(reg.registrationDate);
      debtors.push({
        studentName: reg.studentId?.fullName || 'شاگرد',
        studentCode: code,
        asasNumber: code,
        groupName: reg.courseId?.name || reg.classId?.name || 'بدون صنف',
        balance: round(balance),
        paymentPlan: reg.paymentPlan || '',
        phone: reg.studentId?.phone || reg.studentId?.guardianPhone || '',
        monthKey: monthKey || '',
        monthLabel: ''
      });
    }
  });

  debtors.sort((left, right) => right.balance - left.balance);
  return {
    debtors,
    count: debtors.length,
    totalOutstanding: round(debtors.reduce((sum, row) => sum + row.balance, 0)),
    dueSum,
    paidSum
  };
}

// ── مرکز مالی مکتب (دیتابیسِ اصلی) ─────────────────────────────────────────────
async function buildSchoolDomain({ monthKeys, gregStart, gregEnd, currentMonthKey, debtorLimit }) {
  const monthlyMap = newMonthlyMap(monthKeys);
  const methodMap = new Map();
  const categoryMap = new Map();

  const [payments, expenses, refundSummary, debtorData] = await Promise.all([
    FeePayment.find({ status: 'approved', paidAt: { $gte: gregStart, $lt: gregEnd } })
      .select('amount paidAt paymentMethod')
      .lean(),
    ExpenseEntry.find({ status: 'approved', expenseDate: { $gte: gregStart, $lt: gregEnd } })
      .select('amount expenseDate category subCategory')
      .lean(),
    sumPaidRefunds({ startAt: gregStart, endAt: gregEnd }),
    loadSchoolDebtors()
  ]);

  payments.forEach((item) => {
    bucket(monthlyMap, item.paidAt, 'income', item.amount);
    const method = item.paymentMethod || 'other';
    methodMap.set(method, round((methodMap.get(method) || 0) + toNumber(item.amount)));
  });
  expenses.forEach((item) => {
    bucket(monthlyMap, item.expenseDate, 'expense', item.amount);
    const category = item.category || item.subCategory || 'other';
    categoryMap.set(category, round((categoryMap.get(category) || 0) + toNumber(item.amount)));
  });
  // پولِ برگشت‌داده‌شده به شاگرد (FinanceRefund.status==='paid') از درآمدِ همان
  // ماهِ پرداختِ برگشت کم می‌شود؛ آموزشگاه/موقت مدلِ refund ندارند.
  (refundSummary?.rows || []).forEach((item) => {
    bucket(monthlyMap, item.paidAt, 'income', -toNumber(item.amount));
  });

  const monthly = finalizeMonthly(monthlyMap, monthKeys);
  const incomeTotal = round(monthly.reduce((sum, row) => sum + row.income, 0));
  const expenseTotal = round(monthly.reduce((sum, row) => sum + row.expense, 0));

  const currentRow = monthlyMap.get(currentMonthKey) || { income: 0, expense: 0 };
  return {
    key: 'school',
    label: DOMAIN_LABELS.school,
    totals: {
      income: incomeTotal,
      expense: expenseTotal,
      net: round(incomeTotal - expenseTotal),
      outstanding: debtorData.totalOutstanding,
      collectionRate: safePercent(debtorData.paidSum, debtorData.dueSum),
      activeStudents: debtorData.activeStudentCount,
      currentMonthIncome: round(currentRow.income),
      currentMonthExpense: round(currentRow.expense),
      refundTotal: round(refundSummary?.total || 0)
    },
    monthly,
    byPaymentMethod: toSortedList(methodMap, 'method'),
    byExpenseCategory: toSortedList(categoryMap, 'category'),
    debtors: debtorData.debtors.slice(0, debtorLimit),
    debtorCount: debtorData.count
  };
}

// ── آموزشگاه / شاگردانِ موقت (دیتابیسِ جدا، ساختارِ یکسان) ─────────────────────
async function buildCenterDomain({
  key,
  PaymentModel,
  ExpenseModel,
  RegistrationModel,
  StudentModel,
  CourseModel,
  ChargeModel,
  paymentMatch,
  monthKeys,
  gregStart,
  gregEnd,
  gregStartStr,
  gregEndStr,
  currentMonthKey,
  debtorLimit
}) {
  const monthlyMap = newMonthlyMap(monthKeys);
  const methodMap = new Map();
  const categoryMap = new Map();

  const [payments, expenses, activeStudents, debtorData] = await Promise.all([
    PaymentModel.find({ ...(paymentMatch || {}), paidAt: { $gte: gregStart, $lt: gregEnd } })
      .select('amount paidAt paymentMethod')
      .lean(),
    // expenseDate در این دیتابیس‌ها رشتهٔ 'YYYY-MM-DD' است (نه Date) — مقایسهٔ
    // لغوی با مرزهای میلادیِ رشته‌ای همان کاری را می‌کند که buildShamsiMonthlyReport می‌کند.
    ExpenseModel.find({ expenseDate: { $gte: gregStartStr, $lt: gregEndStr } })
      .select('amount expenseDate category')
      .lean(),
    StudentModel.countDocuments({ status: 'active' }),
    loadCenterDebtors({ RegistrationModel, CourseModel, ChargeModel })
  ]);

  payments.forEach((item) => {
    bucket(monthlyMap, item.paidAt, 'income', item.amount);
    const method = item.paymentMethod || 'other';
    methodMap.set(method, round((methodMap.get(method) || 0) + toNumber(item.amount)));
  });
  expenses.forEach((item) => {
    bucket(monthlyMap, item.expenseDate, 'expense', item.amount);
    const category = item.category || 'other';
    categoryMap.set(category, round((categoryMap.get(category) || 0) + toNumber(item.amount)));
  });

  const monthly = finalizeMonthly(monthlyMap, monthKeys);
  const incomeTotal = round(monthly.reduce((sum, row) => sum + row.income, 0));
  const expenseTotal = round(monthly.reduce((sum, row) => sum + row.expense, 0));

  const currentRow = monthlyMap.get(currentMonthKey) || { income: 0, expense: 0 };
  return {
    key,
    label: DOMAIN_LABELS[key] || key,
    totals: {
      income: incomeTotal,
      expense: expenseTotal,
      net: round(incomeTotal - expenseTotal),
      outstanding: debtorData.totalOutstanding,
      collectionRate: safePercent(debtorData.paidSum, debtorData.dueSum),
      activeStudents,
      currentMonthIncome: round(currentRow.income),
      currentMonthExpense: round(currentRow.expense),
      refundTotal: 0
    },
    monthly,
    byPaymentMethod: toSortedList(methodMap, 'method'),
    byExpenseCategory: toSortedList(categoryMap, 'category'),
    debtors: debtorData.debtors.slice(0, debtorLimit),
    debtorCount: debtorData.count
  };
}

// فهرستِ کلیدهای ماهِ شمسی (jy-jm) از fromKey تا toKey به‌صورتِ شمولی. برای بازهٔ
// نامعتبر یا بیش از ۴۸ ماه null برمی‌گرداند.
function monthKeysBetween(fromKey, toKey) {
  const [fy, fm] = String(fromKey || '').split('-').map(Number);
  const [ty, tm] = String(toKey || '').split('-').map(Number);
  if (!fy || !fm || !ty || !tm || fm < 1 || fm > 12 || tm < 1 || tm > 12) return null;
  const start = fy * 12 + (fm - 1);
  const end = ty * 12 + (tm - 1);
  if (end < start || end - start > 47) return null;
  const keys = [];
  for (let index = start; index <= end; index += 1) {
    keys.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }
  return keys;
}

function resolveMonthKeys({ year, months, from, to } = {}) {
  const explicit = from && to ? monthKeysBetween(from, to) : null;
  if (explicit && explicit.length) {
    return { monthKeys: explicit, isFullYear: false, parsedYear: null, rangeMode: 'custom' };
  }
  const parsedYear = Number(year);
  const isFullYear = Number.isFinite(parsedYear) && parsedYear >= 1300 && parsedYear <= 1600;
  const monthKeys = isFullYear
    ? yearShamsiMonthKeys(parsedYear)
    : lastShamsiMonthKeys(Math.min(24, Math.max(1, Number(months) || 12)));
  return { monthKeys, isFullYear, parsedYear, rangeMode: isFullYear ? 'year' : 'rolling' };
}

/**
 * گزارشِ مالیِ یکپارچه برای بازهٔ ماهِ شمسی.
 * @param {{ year?: number|string, months?: number|string, from?: string, to?: string, debtorLimit?: number }} [options]
 *   from/to: کلیدِ ماهِ شمسی «jy-jm» (مثلاً `1404-01` تا `1404-12`) — بازهٔ صریح.
 *   year: اگر بازهٔ صریح نبود و یک سالِ شمسیِ معتبر (۱۳۰۰–۱۶۰۰) بود، هر ۱۲ ماهِ آن سال؛
 *   وگرنه پنجرهٔ غلتانِ `months` ماهِ اخیر (پیش‌فرض ۱۲، بیشینه ۲۴).
 *   debtorLimit: چند بدهکارِ برتر در هر حوزه برگردانده شود (پیش‌فرض ۲۵؛ برای «همه» عددِ بزرگ بده).
 */
async function buildConsolidatedFinanceReport({ year, months, from, to, debtorLimit } = {}) {
  const { monthKeys, isFullYear, parsedYear, rangeMode } = resolveMonthKeys({ year, months, from, to });
  const limit = Number.isFinite(Number(debtorLimit)) && Number(debtorLimit) > 0
    ? Number(debtorLimit)
    : DEFAULT_DEBTOR_LIMIT;

  const startKey = monthKeys[0];
  const endKey = monthKeys[monthKeys.length - 1];
  const gregStartStr = shamsiMonthKeyToGregorianStart(startKey);
  const gregEndStr = shamsiMonthKeyToGregorianEnd(endKey); // مرزِ بالا، شمولی‌نیست
  const gregStart = new Date(`${gregStartStr}T00:00:00.000Z`);
  const gregEnd = new Date(`${gregEndStr}T00:00:00.000Z`);
  const currentMonthKey = lastShamsiMonthKeys(1)[0];

  const [school, shortTerm, academy] = await Promise.all([
    buildSchoolDomain({ monthKeys, gregStart, gregEnd, currentMonthKey, debtorLimit: limit }),
    buildCenterDomain({
      key: 'shortTerm',
      PaymentModel: ShortTermPayment,
      ExpenseModel: ShortTermExpense,
      RegistrationModel: ShortTermRegistration,
      StudentModel: ShortTermStudent,
      CourseModel: null,
      paymentMatch: {}, // پرداختِ موقت مدلِ ابطال ندارد
      monthKeys,
      gregStart,
      gregEnd,
      gregStartStr,
      gregEndStr,
      currentMonthKey,
      debtorLimit: limit
    }),
    buildCenterDomain({
      key: 'academy',
      PaymentModel: AcademyPayment,
      ExpenseModel: AcademyExpense,
      RegistrationModel: AcademyRegistration,
      StudentModel: AcademyStudent,
      CourseModel: AcademyCourse,
      ChargeModel: AcademyCharge,
      paymentMatch: { status: { $ne: 'void' } },
      monthKeys,
      gregStart,
      gregEnd,
      gregStartStr,
      gregEndStr,
      currentMonthKey,
      debtorLimit: limit
    })
  ]);

  const domains = [school, shortTerm, academy];
  const monthlyTrend = monthKeys.map((month, index) => {
    const entry = { month };
    let combinedIncome = 0;
    let combinedExpense = 0;
    domains.forEach((domain) => {
      const row = domain.monthly[index] || { income: 0, expense: 0, net: 0 };
      entry[domain.key] = { income: row.income, expense: row.expense, net: row.net };
      combinedIncome += row.income;
      combinedExpense += row.expense;
    });
    entry.combined = {
      income: round(combinedIncome),
      expense: round(combinedExpense),
      net: round(combinedIncome - combinedExpense)
    };
    return entry;
  });

  const combinedIncome = round(domains.reduce((sum, domain) => sum + domain.totals.income, 0));
  const combinedExpense = round(domains.reduce((sum, domain) => sum + domain.totals.expense, 0));
  const combinedOutstanding = round(domains.reduce((sum, domain) => sum + domain.totals.outstanding, 0));

  return {
    generatedAt: new Date().toISOString(),
    basis: 'cash_shamsi_month',
    currency: 'AFN',
    period: {
      year: isFullYear ? parsedYear : null,
      rangeMode,
      monthKeys,
      from: startKey,
      to: endKey,
      currentMonth: currentMonthKey
    },
    combined: {
      income: combinedIncome,
      expense: combinedExpense,
      net: round(combinedIncome - combinedExpense),
      outstanding: combinedOutstanding,
      activeStudents: domains.reduce((sum, domain) => sum + (domain.totals.activeStudents || 0), 0),
      activeStudentsByDomain: {
        school: school.totals.activeStudents,
        shortTerm: shortTerm.totals.activeStudents,
        academy: academy.totals.activeStudents
      }
    },
    domains: { school, shortTerm, academy },
    monthlyTrend
  };
}

/**
 * لیستِ کاملِ بدهکارانِ یک حوزه (برای صفحهٔ drill-down). مستقل از بازهٔ تاریخی.
 * @param {{ domain: 'school'|'shortTerm'|'academy' }} options
 */
async function buildConsolidatedFinanceDebtors({ domain } = {}) {
  const key = String(domain || '').trim();
  if (!DOMAIN_KEYS.includes(key)) {
    const error = new Error('consolidated_finance_domain_invalid');
    error.statusCode = 400;
    throw error;
  }

  let data;
  if (key === 'school') {
    data = await loadSchoolDebtors();
  } else if (key === 'academy') {
    data = await loadCenterDebtors({ RegistrationModel: AcademyRegistration, CourseModel: AcademyCourse, ChargeModel: AcademyCharge });
  } else {
    data = await loadCenterDebtors({ RegistrationModel: ShortTermRegistration, CourseModel: null });
  }

  return {
    generatedAt: new Date().toISOString(),
    domain: key,
    label: DOMAIN_LABELS[key] || key,
    currency: 'AFN',
    count: data.count,
    totalOutstanding: data.totalOutstanding,
    debtors: data.debtors
  };
}

module.exports = {
  buildConsolidatedFinanceReport,
  buildConsolidatedFinanceDebtors,
  resolveMonthKeys,
  DOMAIN_KEYS,
  DOMAIN_LABELS
};
