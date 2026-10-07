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
const { loadExpenseCategoryLabelMap } = require('../utils/expenseCategoryLabels');
const { AFGHAN_SOLAR_MONTHS, shiftAfghanMonthKey } = require('../utils/afghanDate');
const { EXPENSE_CHART_KEYS, resolveLegacyExpenseCategory } = require('../config/expenseChart');
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

// ارقامِ فارسی/عربی → لاتین
function toAsciiDigits(value) {
  return String(value == null ? '' : value)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

// تاریخ‌های آموزشگاه/موقت (ثبت‌نام، مصرف، …) رشته‌اند و بسته به فورمِ ورودی
// می‌توانند شمسی یا میلادی، با «-» یا «/» یا «.»، و با ارقامِ فارسی باشند.
// این تابع هر حالت را به کلیدِ ماهِ شمسی (jy-jm) تبدیل می‌کند؛ اگر نشد '' برمی‌گرداند.
function shamsiMonthFromDateString(value) {
  const raw = toAsciiDigits(value).trim().replace(/[.،/\\]+/g, '-').replace(/-+/g, '-');
  if (!raw) return '';
  const match = raw.match(/^(\d{3,4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (match) {
    const year = Number(match[1]);
    const month = String(Math.min(12, Math.max(1, Number(match[2]) || 1))).padStart(2, '0');
    if (year >= 1300 && year <= 1500) return `${year}-${month}`;
    if (year >= 1900 && year <= 2200) {
      const day = String(Math.min(28, Math.max(1, Number(match[3]) || 1))).padStart(2, '0');
      return shamsiMonthOfDate(`${year}-${month}-${day}T00:00:00.000Z`);
    }
  }
  return shamsiMonthOfDate(raw);
}
// نامِ قدیمی برای سازگاری در همین فایل
const shamsiMonthFromRegDate = shamsiMonthFromDateString;
const DOMAIN_KEYS = ['school', 'shortTerm', 'academy'];
const DOMAIN_LABELS = {
  school: 'مرکز مالی مکتب',
  shortTerm: 'شاگردان موقت',
  academy: 'آموزشگاه'
};

// دسته‌های داخلیِ مصرفِ آموزشگاه/موقت با همین کلیدهای انگلیسی ذخیره می‌شوند؛
// دسته‌ای که خودِ مرکز تعریف کرده با نامِ فارسی‌اش ذخیره می‌شود و دست‌نخورده
// می‌ماند. هم‌خوان با expenseCategoryLabels در AcademyManagement.jsx و ShortTermCenter.jsx.
const CENTER_EXPENSE_CATEGORY_LABELS = {
  teacher_salary: 'معاش استادان',
  rent: 'کرایه',
  utilities: 'برق و خدمات',
  internet: 'انترنت',
  stationery: 'قرطاسیه',
  marketing: 'تبلیغات',
  equipment: 'تجهیزات',
  other: 'سایر'
};
const centerExpenseCategoryLabel = (key) => CENTER_EXPENSE_CATEGORY_LABELS[key] || key;

// برای جدولِ «مصارفِ هر سه بخش بر اساسِ سرفصل»: دسته‌های داخلیِ آموزشگاه/موقت به
// سرفصلِ چارتِ مکتب می‌روند؛ دستهٔ خودساختهٔ مرکز اگر در نگاشتِ قدیمیِ چارت شناخته
// شد همان‌جا، وگرنه با نامِ خودش جدا می‌ماند — از روی نام حدس زده نمی‌شود.
const CENTER_CATEGORY_CHART_KEYS = {
  teacher_salary: 'payroll',
  rent: 'occupancy',
  utilities: 'utilities',
  internet: 'utilities',
  stationery: 'office_supplies',
  marketing: 'admin_misc',
  equipment: 'repair_equipment',
  other: 'admin_misc'
};

function chartKeyOfCategory(domainKey, category) {
  const key = String(category || '').trim();
  if (domainKey !== 'school' && CENTER_CATEGORY_CHART_KEYS[key]) return CENTER_CATEGORY_CHART_KEYS[key];
  if (EXPENSE_CHART_KEYS.has(key)) return key;
  const resolved = resolveLegacyExpenseCategory(key);
  return resolved.matched ? resolved.category : '';
}

const EXPENSE_STATUS_LABELS = { approved: 'تأییدشده', draft: 'پیش‌نویس', pending_review: 'در انتظار تأیید' };
// آموزشگاه/موقت مرحلهٔ تأیید ندارند (وضعیتِ خالی)، پس «ثبت‌شده» — نه «تأییدشده».
const expenseStatusLabel = (status) => (status ? (EXPENSE_STATUS_LABELS[status] || status) : 'ثبت‌شده');

// «میزان ۱۴۰۵» — سال با ارقامِ فارسی و بدونِ جداکنندهٔ هزارگان.
function monthKeyLabel(key) {
  const [jy, jm] = String(key || '').split('-').map(Number);
  if (!jy || !jm) return String(key || '');
  return `${AFGHAN_SOLAR_MONTHS[jm - 1] || jm} ${jy.toLocaleString('fa-AF', { useGrouping: false })}`;
}

function expenseCategoryText(row = {}) {
  return [row.categoryLabel || row.category, row.subCategoryLabel].filter(Boolean).join(' — ');
}

function debtorMonthText(row = {}) {
  return [monthKeyLabel(row.monthKey), row.periodNote].filter(Boolean).join(' · ');
}

// «ماهِ» بدهکارِ مکتب از کلیدِ ماهِ شمسی ساخته می‌شود تا با آموزشگاه/موقت یک‌شکل
// باشد؛ برچسبِ بل («۱۴۰۵ سنبلهٔ») فقط وقتی نگه داشته می‌شود که خودش ماه نیست (مثلاً «داخله»).
const AFGHAN_MONTH_NAME_RE = new RegExp(AFGHAN_SOLAR_MONTHS.join('|'));
function periodNoteOf(periodLabel) {
  const text = String(periodLabel || '').trim();
  if (!text || AFGHAN_MONTH_NAME_RE.test(text) || /\d{4}\s*[-/]\s*\d{1,2}/.test(toAsciiDigits(text))) return '';
  return text;
}

const toNumber = (value) => Math.max(0, Number(value || 0));
const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const safePercent = (part, whole) => (Number(whole) > 0 ? round((Number(part) / Number(whole)) * 10000) / 100 : 0);

// درصدِ تغییر نسبت به بازهٔ قبل؛ اگر بازهٔ قبل صفر بود null (درصد بی‌معناست).
function percentChange(current, previous) {
  const base = Number(previous) || 0;
  if (!base) return null;
  return round(((Number(current) - base) / Math.abs(base)) * 100);
}

function changePercentOf(totals = {}, previous = {}) {
  return {
    income: percentChange(totals.income, previous.income),
    expense: percentChange(totals.expense, previous.expense),
    net: percentChange(totals.net, previous.net)
  };
}

function newMonthlyMap(monthKeys) {
  return new Map(monthKeys.map((key) => [key, { month: key, income: 0, expense: 0, net: 0 }]));
}

// مبلغ را روی ماهِ شمسیِ تاریخ می‌گذارد و کلیدِ همان ماه را برمی‌گرداند ('' اگر تاریخ نامعتبر بود).
function bucket(monthlyMap, dateValue, field, amount) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const key = shamsiMonthKeyOf(date) || '';
  const row = key && monthlyMap.get(key);
  if (row) row[field] = round(row[field] + Number(amount || 0));
  return key;
}

function sumMonths(monthlyMap, keys) {
  let income = 0;
  let expense = 0;
  keys.forEach((key) => {
    const row = monthlyMap.get(key);
    if (!row) return;
    income += Number(row.income || 0);
    expense += Number(row.expense || 0);
  });
  return { income: round(income), expense: round(expense), net: round(income - expense) };
}

// چند بازهٔ «jy-jm تا jy-jm» → بازه‌های تاریخیِ [start, end) به‌هم‌چسبیده، برای کوئری.
function mergeDateRanges(keyRanges) {
  const ranges = keyRanges
    .map(([fromKey, toKey]) => ({
      start: new Date(`${shamsiMonthKeyToGregorianStart(fromKey)}T00:00:00.000Z`),
      end: new Date(`${shamsiMonthKeyToGregorianEnd(toKey)}T00:00:00.000Z`)
    }))
    .sort((left, right) => left.start - right.start);
  return ranges.reduce((merged, range) => {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      if (range.end > last.end) last.end = range.end;
    } else {
      merged.push({ ...range });
    }
    return merged;
  }, []);
}

function dateRangeFilter(field, ranges) {
  const clauses = ranges.map((range) => ({ [field]: { $gte: range.start, $lt: range.end } }));
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

function toSortedList(map, keyName, labelOf = null) {
  return Array.from(map.entries())
    .map(([value, total]) => {
      const key = value || 'other';
      return labelOf
        ? { [keyName]: key, label: labelOf(key), total: round(total) }
        : { [keyName]: key, total: round(total) };
    })
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
      periodNote: '',
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
      row.periodNote = periodNoteOf(order.periodLabel);
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
        periodNote: ''
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
async function buildSchoolDomain({
  monthKeys,
  previousKeys,
  trackedKeys,
  dateRanges,
  currentMonthKey,
  debtorLimit,
  expenseLabels
}) {
  const monthlyMap = newMonthlyMap(trackedKeys);
  const rangeKeySet = new Set(monthKeys);
  const methodMap = new Map();
  const categoryMap = new Map();

  const [payments, expenses, refundBatches, debtorData] = await Promise.all([
    FeePayment.find({ status: 'approved', ...dateRangeFilter('paidAt', dateRanges) })
      .select('amount paidAt paymentMethod')
      .lean(),
    // «مصارفِ مکمل» = هر مصرفِ ثبت‌شده که ابطال/ردنشده — شاملِ draft و
    // pending_review، نه فقط approved — تا با آموزشگاه/موقت (که همه را می‌شمارند)
    // هم‌خوان باشد. سهمِ در انتظار تأیید جدا گزارش می‌شود.
    // مصرفِ تاییدشده‌ای که «درخواستِ اصلاحِ» باز دارد تا تاییدِ نهاییِ اصلاح
    // اصلاً شمرده نمی‌شود (correction: null یعنی بدونِ درخواستِ باز).
    ExpenseEntry.find({ status: { $nin: ['void', 'rejected'] }, correction: null, ...dateRangeFilter('expenseDate', dateRanges) })
      .select('amount expenseDate category subCategory status vendorName referenceNo note')
      .lean(),
    Promise.all(dateRanges.map((range) => sumPaidRefunds({ startAt: range.start, endAt: range.end }))),
    loadSchoolDebtors()
  ]);

  // ردیف‌های بازهٔ قبل و ماهِ جاری فقط در مجموعِ ماهانه می‌روند؛ تفکیک‌ها و فهرست‌ها فقط بازه.
  payments.forEach((item) => {
    const key = bucket(monthlyMap, item.paidAt, 'income', item.amount);
    if (!rangeKeySet.has(key)) return;
    const method = item.paymentMethod || 'other';
    methodMap.set(method, round((methodMap.get(method) || 0) + toNumber(item.amount)));
  });
  let pendingExpense = 0;
  let expenseCount = 0;
  const expenseList = [];
  expenses.forEach((item) => {
    const key = bucket(monthlyMap, item.expenseDate, 'expense', item.amount);
    if (!rangeKeySet.has(key)) return;
    expenseCount += 1;
    const category = item.category || item.subCategory || 'other';
    categoryMap.set(category, round((categoryMap.get(category) || 0) + toNumber(item.amount)));
    if (item.status !== 'approved') pendingExpense += toNumber(item.amount);
    const categoryLabel = expenseLabels.category(category);
    const subCategoryLabel = expenseLabels.subCategory(item.category, item.subCategory);
    expenseList.push({
      // «شرح» = توضیحی که ثبت‌کننده نوشته؛ اگر خالی بود گیرنده، بعد نامِ زیرسرفصل.
      title: String(item.note || item.vendorName || subCategoryLabel || categoryLabel || 'مصرف').trim(),
      category,
      categoryLabel,
      subCategoryLabel,
      monthKey: key,
      amount: round(toNumber(item.amount)),
      status: item.status || 'approved'
    });
  });
  expenseList.sort((a, b) => (b.monthKey || '').localeCompare(a.monthKey || '') || b.amount - a.amount);
  // پولِ برگشت‌داده‌شده به شاگرد (FinanceRefund.status==='paid') از درآمدِ همان
  // ماهِ پرداختِ برگشت کم می‌شود؛ آموزشگاه/موقت مدلِ refund ندارند.
  let refundTotal = 0;
  refundBatches.flatMap((batch) => batch?.rows || []).forEach((item) => {
    const key = bucket(monthlyMap, item.paidAt, 'income', -toNumber(item.amount));
    if (rangeKeySet.has(key)) refundTotal += toNumber(item.amount);
  });

  const monthly = finalizeMonthly(monthlyMap, monthKeys);
  const incomeTotal = round(monthly.reduce((sum, row) => sum + row.income, 0));
  const expenseTotal = round(monthly.reduce((sum, row) => sum + row.expense, 0));

  // «ماهِ جاری» همیشه ماهِ واقعیِ امروز است، حتی اگر بازهٔ انتخابی آن را نداشته باشد.
  const currentMonth = sumMonths(monthlyMap, [currentMonthKey]);
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
      currentMonthIncome: currentMonth.income,
      currentMonthExpense: currentMonth.expense,
      refundTotal: round(refundTotal),
      pendingExpense: round(pendingExpense),
      expenseCount
    },
    previousTotals: sumMonths(monthlyMap, previousKeys),
    monthly,
    byPaymentMethod: toSortedList(methodMap, 'method'),
    byExpenseCategory: toSortedList(categoryMap, 'category', expenseLabels.category),
    expenses: expenseList.slice(0, 2000),
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
  previousKeys,
  trackedKeys,
  dateRanges,
  currentMonthKey,
  debtorLimit
}) {
  const monthlyMap = newMonthlyMap(trackedKeys);
  const rangeKeySet = new Set(monthKeys);
  const methodMap = new Map();
  const categoryMap = new Map();

  const [payments, expenses, activeStudents, debtorData] = await Promise.all([
    PaymentModel.find({ ...(paymentMatch || {}), ...dateRangeFilter('paidAt', dateRanges) })
      .select('amount paidAt paymentMethod')
      .lean(),
    // expenseDate در این دیتابیس‌ها رشته است و بسته به فورمِ ورودی گاهی میلادی
    // ('2026-08-08') و گاهی شمسی ('1405-05-18') ذخیره شده. پس فیلترِ لغویِ بازه
    // قابل‌اعتماد نیست — همه را می‌گیریم و در JS با تبدیلِ هر تاریخ به کلیدِ ماهِ
    // شمسی و تطبیق با monthKeys فیلتر می‌کنیم.
    ExpenseModel.find({})
      .select('amount expenseDate category title paidTo')
      .limit(20000)
      .lean(),
    StudentModel.countDocuments({ status: 'active' }),
    loadCenterDebtors({ RegistrationModel, CourseModel, ChargeModel })
  ]);

  payments.forEach((item) => {
    const key = bucket(monthlyMap, item.paidAt, 'income', item.amount);
    if (!rangeKeySet.has(key)) return;
    const method = item.paymentMethod || 'other';
    methodMap.set(method, round((methodMap.get(method) || 0) + toNumber(item.amount)));
  });
  let expenseCount = 0;
  const expenseList = [];
  expenses.forEach((item) => {
    const key = shamsiMonthFromDateString(item.expenseDate);
    const row = key && monthlyMap.get(key);
    if (row) row.expense = round(row.expense + toNumber(item.amount));
    if (!rangeKeySet.has(key)) return;
    expenseCount += 1;
    const category = item.category || 'other';
    categoryMap.set(category, round((categoryMap.get(category) || 0) + toNumber(item.amount)));
    const categoryLabel = centerExpenseCategoryLabel(category);
    expenseList.push({
      title: String(item.title || item.paidTo || categoryLabel || 'مصرف').trim(),
      category,
      categoryLabel,
      subCategoryLabel: '',
      monthKey: key,
      amount: round(toNumber(item.amount)),
      status: ''
    });
  });
  expenseList.sort((a, b) => (b.monthKey || '').localeCompare(a.monthKey || '') || b.amount - a.amount);

  const monthly = finalizeMonthly(monthlyMap, monthKeys);
  const incomeTotal = round(monthly.reduce((sum, row) => sum + row.income, 0));
  const expenseTotal = round(monthly.reduce((sum, row) => sum + row.expense, 0));

  const currentMonth = sumMonths(monthlyMap, [currentMonthKey]);
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
      currentMonthIncome: currentMonth.income,
      currentMonthExpense: currentMonth.expense,
      refundTotal: 0,
      pendingExpense: 0,
      expenseCount
    },
    previousTotals: sumMonths(monthlyMap, previousKeys),
    monthly,
    byPaymentMethod: toSortedList(methodMap, 'method'),
    byExpenseCategory: toSortedList(categoryMap, 'category', centerExpenseCategoryLabel),
    expenses: expenseList.slice(0, 2000),
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

// «مصارفِ هر سه بخش بر اساسِ سرفصل»: هر دستهٔ هر بخش زیرِ سرفصلِ چارت جمع می‌شود؛
// دسته‌ای که به چارت نگاشت نشد با نامِ خودش ردیفِ جدا می‌گیرد (inChart: false).
function buildCombinedExpenseCategories(domains, expenseLabels) {
  const rows = new Map();
  domains.forEach((domain) => {
    (domain.byExpenseCategory || []).forEach((item) => {
      const chartKey = chartKeyOfCategory(domain.key, item.category);
      const name = String(item.label || item.category || '').trim();
      const rowKey = chartKey ? `chart:${chartKey}` : `own:${name}`;
      const row = rows.get(rowKey) || {
        key: chartKey || name,
        label: chartKey ? expenseLabels.category(chartKey) : name,
        inChart: Boolean(chartKey),
        school: 0,
        shortTerm: 0,
        academy: 0,
        total: 0
      };
      row[domain.key] = round(row[domain.key] + toNumber(item.total));
      row.total = round(row.total + toNumber(item.total));
      rows.set(rowKey, row);
    });
  });
  return Array.from(rows.values())
    .sort((left, right) => (Number(right.inChart) - Number(left.inChart)) || (right.total - left.total));
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
  const currentMonthKey = lastShamsiMonthKeys(1)[0];
  // «بازهٔ قبل» = همان تعداد ماه، درست پیش از بازه: سالِ قبل برای «یک سال»، ماهِ قبل برای «یک ماه».
  const previousKeys = monthKeys.map((key) => shiftAfghanMonthKey(key, -monthKeys.length));
  // هر ردیف یک بار خوانده و روی ماهش پخش می‌شود؛ بازهٔ قبل و «ماهِ جاری» (که شاید بیرونِ
  // بازه باشد، مثلاً وقتی سالِ گذشته انتخاب شده) هم در همین پخش حساب می‌شوند.
  const trackedKeys = Array.from(new Set([...previousKeys, ...monthKeys, currentMonthKey]));
  const dateRanges = mergeDateRanges([[previousKeys[0], endKey], [currentMonthKey, currentMonthKey]]);
  const expenseLabels = await loadExpenseCategoryLabelMap();
  const shared = { monthKeys, previousKeys, trackedKeys, dateRanges, currentMonthKey, debtorLimit: limit };

  const [school, shortTerm, academy] = await Promise.all([
    buildSchoolDomain({ ...shared, expenseLabels }),
    buildCenterDomain({
      ...shared,
      key: 'shortTerm',
      PaymentModel: ShortTermPayment,
      ExpenseModel: ShortTermExpense,
      RegistrationModel: ShortTermRegistration,
      StudentModel: ShortTermStudent,
      CourseModel: null,
      paymentMatch: {} // پرداختِ موقت مدلِ ابطال ندارد
    }),
    buildCenterDomain({
      ...shared,
      key: 'academy',
      PaymentModel: AcademyPayment,
      ExpenseModel: AcademyExpense,
      RegistrationModel: AcademyRegistration,
      StudentModel: AcademyStudent,
      CourseModel: AcademyCourse,
      ChargeModel: AcademyCharge,
      paymentMatch: { status: { $ne: 'void' } }
    })
  ]);

  const domains = [school, shortTerm, academy];
  domains.forEach((domain) => {
    domain.changePercent = changePercentOf(domain.totals, domain.previousTotals);
  });
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
  const combinedPendingExpense = round(domains.reduce((sum, domain) => sum + (domain.totals.pendingExpense || 0), 0));
  const previousIncome = round(domains.reduce((sum, domain) => sum + domain.previousTotals.income, 0));
  const previousExpense = round(domains.reduce((sum, domain) => sum + domain.previousTotals.expense, 0));
  const combinedTotals = { income: combinedIncome, expense: combinedExpense, net: round(combinedIncome - combinedExpense) };
  const combinedPrevious = { income: previousIncome, expense: previousExpense, net: round(previousIncome - previousExpense) };

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
      currentMonth: currentMonthKey,
      currentMonthInRange: monthKeys.includes(currentMonthKey),
      previous: { from: previousKeys[0], to: previousKeys[previousKeys.length - 1], monthKeys: previousKeys }
    },
    combined: {
      ...combinedTotals,
      pendingExpense: combinedPendingExpense,
      outstanding: combinedOutstanding,
      activeStudents: domains.reduce((sum, domain) => sum + (domain.totals.activeStudents || 0), 0),
      activeStudentsByDomain: {
        school: school.totals.activeStudents,
        shortTerm: shortTerm.totals.activeStudents,
        academy: academy.totals.activeStudents
      },
      previousTotals: combinedPrevious,
      changePercent: changePercentOf(combinedTotals, combinedPrevious),
      byExpenseCategory: buildCombinedExpenseCategories(domains, expenseLabels)
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
  DOMAIN_LABELS,
  // متن‌های نمایشیِ مشترکِ PDF و Excel
  monthKeyLabel,
  expenseStatusLabel,
  expenseCategoryText,
  debtorMonthText
};
