/**
 * Persian labels for the generic report exports (Excel «خلاصه» sheet).
 *
 * Summary keys mirror SUMMARY_LABELS / CLEAN_SUMMARY_LABELS in
 * frontend/src/pages/AdminReports.jsx, plus the keys that page never shows.
 * A report can still override any of them with its own `summaryLabels`.
 * A key with no label falls back to the humanized key, so a new summary field
 * is exported in English until it is added here.
 */

'use strict';

const SUMMARY_LABELS = Object.freeze({
  // fee orders / payments
  totalOrders: 'مجموع سفارش‌ها',
  totalPayments: 'مجموع پرداخت‌ها',
  totalDue: 'مبلغ کل',
  totalPaidOnOrders: 'پرداخت‌شده',
  totalOutstanding: 'باقی‌مانده',
  totalPaymentAmount: 'مبلغ پرداخت‌ها',
  paymentsByFeeType: 'پرداخت‌ها بر اساس نوع فیس',
  paidOrders: 'سفارش‌های تصفیه‌شده',
  waivedOrders: 'سفارش‌های معاف‌شده',
  overdueOrders: 'سفارش‌های مهلت‌گذشته',
  partialOrders: 'سفارش‌های نیمه‌پرداخت',
  // debtors / reliefs
  totalDebtors: 'تعداد بدهکاران',
  overdueDebtors: 'بدهکاران مهلت‌گذشته',
  partialDebtors: 'بدهکاران نیمه‌پرداخت',
  departedDebtors: 'بدهکاران ترک‌کرده',
  debtorsWithRelief: 'بدهکاران دارای تسهیلات',
  totalEntries: 'تعداد ثبت‌ها',
  activeDiscounts: 'تخفیف‌های فعال',
  activeExemptions: 'معافیت‌های فعال',
  totalDiscountAmount: 'مجموع تخفیف‌ها',
  fullWaivers: 'معافیت کامل',
  partialWaivers: 'معافیت جزئی',
  totalReliefs: 'مجموع تسهیلات',
  activeReliefs: 'تسهیلات فعال',
  totalFixedReliefAmount: 'مجموع تسهیلات ثابت',
  percentReliefCount: 'تسهیلات درصدی',
  fullReliefCount: 'تسهیلات کامل',
  activeScholarships: 'بورسیه‌های فعال',
  charitySupports: 'حمایت‌های خیریه',
  // advance payments / payment timing / monthly summary
  referenceDate: 'تاریخ مرجع',
  totalStudents: 'تعداد متعلمین',
  totalMonthsPrepaid: 'مجموع ماه‌های پیش‌پرداخت',
  totalPrepaidAmount: 'مبلغ پیش‌پرداخت',
  onTimeCount: 'پرداخت به‌موقع',
  lateCount: 'پرداخت با تأخیر',
  advanceCount: 'پرداخت پیشکی',
  averageLagMonths: 'اوسط تأخیر (ماه)',
  grossMonthlyIncome: 'عاید ناخالص ماه',
  pastMonthsCollectedThisMonth: 'وصول ماه‌های گذشته در این ماه',
  futureMonthsCollectedThisMonth: 'وصول ماه‌های آینده در این ماه',
  payableThisMonth: 'قابل پرداخت این ماه',
  currentMonthApprovedCollection: 'وصول تأییدشدهٔ این ماه',
  partialPaymentStudents: 'متعلمین نیمه‌پرداخت',
  fullPaymentStudents: 'متعلمین تصفیه‌کرده',
  outstandingThisMonth: 'باقی‌ماندهٔ این ماه',
  discountExemptionThisMonth: 'تخفیف و معافیت این ماه',
  refundsDeducted: 'بازپرداخت‌های کسرشده',
  // collection by class
  totalClasses: 'تعداد صنف‌ها',
  approvedCollection: 'وصول تاییدشده',
  pendingCollection: 'وصول در انتظار',
  // government finance
  totalIncome: 'عواید',
  totalExpense: 'مصارف',
  totalRefunds: 'بازپرداخت‌ها',
  balance: 'بیلانس',
  paymentCount: 'تعداد پرداخت‌ها',
  expenseCount: 'تعداد مصارف',
  classCount: 'تعداد صنف‌ها',
  quarterCount: 'تعداد ربع‌ها',
  financialYearId: 'سال مالی',
  financialYearTitle: 'سال مالی',
  academicYearId: 'سال تعلیمی',
  encumbranceOpenCount: 'تعهدات باز',
  encumbranceOutstanding: 'مبلغ تعهدات باز',
  balanceAfterEncumbrance: 'بیلانس پس از تعهدات',
  // exams
  totalResults: 'مجموع نتایج',
  passed: 'کامیاب',
  failed: 'ناکام',
  conditional: 'مشروط',
  distinction: 'لیاقت',
  temporary: 'موقت',
  placement: 'سویه',
  excused: 'معذرتی',
  absent: 'غایب',
  averagePercentage: 'اوسط فیصدی',
  // attendance
  totalRecords: 'رکوردها',
  present: 'حاضر',
  late: 'تاخیر',
  attendanceRate: 'فیصدی حضور',
  totalPresentDays: 'روزهای حاضر',
  totalAbsentDays: 'روزهای غیرحاضر',
  totalSickDays: 'روزهای مریضی',
  totalLeaveDays: 'روزهای رخصتی',
  totalLateDays: 'روزهای تأخیر',
  totalExcusedDays: 'روزهای معذرتی',
  totalSuspendedDays: 'روزهای تعلیق',
  averageAttendanceRate: 'اوسط فیصدی حضور',
  // memberships
  totalMemberships: 'عضویت‌ها',
  active: 'فعال',
  transferredIn: 'انتقالی',
  pending: 'در انتظار',
  suspended: 'تعلیق‌شده',
  ended: 'ختم‌شده',
  current: 'جاری',
  // timetable / assignments
  totalAssignments: 'مجموع تقرری‌ها',
  activeAssignments: 'تقرری‌های فعال',
  matchedTeacherAssignments: 'تقرری‌های مطابق',
  uniqueSubjects: 'تعداد مضامین',
  uniqueTeachers: 'تعداد استادان',
  totalWeeklyPeriods: 'مجموع ساعات هفته',
  timetableEntries: 'ورودی‌های تقسیم اوقات',
  publishedEntries: 'منتشرشده',
  draftEntries: 'پیش‌نویس',
  configs: 'پیکربندی‌ها',
  annualPlans: 'پلان‌های سالانه',
  weeklyPlans: 'پلان‌های هفتگی',
  // promotions
  totalTransactions: 'تراکنش‌ها',
  promoted: 'ارتقا یافته',
  repeated: 'مکرر',
  graduated: 'فارغ',
  blocked: 'مسدود',
  applied: 'اعمال‌شده',
  preview: 'پیش‌نمایش'
});

// Same wording as the filter fields on the report builder page.
const FILTER_LABELS = Object.freeze({
  schoolId: 'مکتب',
  financialYearId: 'سال مالی',
  academicYearId: 'سال تعلیمی',
  termId: 'ترم',
  examId: 'جلسه امتحان',
  classId: 'صنف',
  studentId: 'متعلم',
  studentMembershipId: 'عضویت متعلم',
  userId: 'کاربر',
  teacherId: 'استاد',
  quarter: 'ربع',
  month: 'ماه',
  monthNumber: 'ماه',
  dateFrom: 'از تاریخ',
  dateTo: 'تا تاریخ',
  shamsiYear: 'سال شمسی',
  rollingMonths: 'ماه‌های اخیر',
  shamsiFrom: 'از ماه',
  shamsiTo: 'تا ماه'
});

// Keys inside an object-valued summary field (e.g. paymentsByFeeType).
const NESTED_KEY_LABELS = Object.freeze({
  tuition: 'شهریه',
  admission: 'داخله',
  transport: 'ترانسپورت',
  exam: 'امتحان',
  document: 'اسناد',
  service: 'خدمت',
  registration: 'ثبت نام',
  fine: 'جریمه',
  other: 'سایر'
});

// Dynamic per-month keys the payment-timing report adds ("netRevenue:<month>").
const DYNAMIC_SUMMARY_PREFIXES = Object.freeze({
  netRevenue: 'خالص عاید'
});

function summaryLabel(key = '', overrides = null, fallback = (value) => value) {
  const text = String(key || '');
  if (overrides && overrides[text]) return overrides[text];
  if (SUMMARY_LABELS[text]) return SUMMARY_LABELS[text];
  const [prefix, ...rest] = text.split(':');
  if (rest.length && DYNAMIC_SUMMARY_PREFIXES[prefix]) return `${DYNAMIC_SUMMARY_PREFIXES[prefix]} ${rest.join(':')}`;
  return fallback(text);
}

function filterLabel(key = '', fallback = (value) => value) {
  return FILTER_LABELS[key] || fallback(String(key || ''));
}

function nestedKeyLabel(key = '') {
  return NESTED_KEY_LABELS[key] || String(key || '');
}

module.exports = {
  SUMMARY_LABELS,
  FILTER_LABELS,
  NESTED_KEY_LABELS,
  summaryLabel,
  filterLabel,
  nestedKeyLabel
};
