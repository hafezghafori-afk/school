import React, { useEffect, useMemo, useState } from 'react';
import './AdminWorkspace.css';

import {
  downloadBlob,
  errorMessage,
  fetchBlob,
  fetchJson,
  fetchText,
  formatNumber,
  normalizeOptions,
  openHtmlDocument,
  postJson,
  toLocaleDateTime
} from './adminWorkspaceUtils';

const EMPTY_REFERENCE = {
  catalog: [],
  financialYears: [],
  academicYears: [],
  academicTerms: [],
  examSessions: [],
  classes: [],
  students: [],
  teachers: [],
  sheetTemplates: []
};

const EMPTY_FORM = {
  reportKey: '',
  templateId: '',
  financialYearId: '',
  academicYearId: '',
  termId: '',
  examId: '',
  classId: '',
  studentId: '',
  teacherId: '',
  quarter: '',
  month: '',
  dateFrom: '',
  dateTo: ''
};

const QUARTER_OPTIONS = [
  { id: '1', title: 'ربع اول' },
  { id: '2', title: 'ربع دوم' },
  { id: '3', title: 'ربع سوم' },
  { id: '4', title: 'ربع چهارم' }
];

const REPORT_TEMPLATE_TYPE_MAP = {
  attendance_overview: ['attendance'],
  attendance_summary_overview: ['attendance_summary'],
  class_overview: [],
  subjects_overview: ['subjects'],
  exam_outcomes: ['exam'],
  finance_overview: ['finance'],
  fee_debtors_overview: ['finance'],
  fee_discount_exemption_overview: ['finance'],
  fee_collection_by_class: ['finance']
};

const REPORT_UI = {
  finance_overview: {
    title: 'گزارش مالی عمومی',
    description: 'خلاصه مالی و تعهدات مبتنی بر عضویت'
  },
  __fee_debtors_columns: {
    title: 'گزارش بدهکاران فیس',
    description: 'لیست بدهکاران، باقی‌مانده‌ها و بل‌های سررسیدشده بر پایه سفارش‌ها'
  },
  __fee_discount_exemption_columns: {
    title: 'گزارش تخفیف و معافیت',
    description: 'نمای یکپارچه تخفیف‌ها، معافیت‌ها و متعلمین رایگان در لایه مالی'
  },
  __fee_collection_by_class_columns: {
    title: 'گزارش وصول فیس بر اساس صنف',
    description: 'تحلیل وصول تاییدشده، پرداخت‌های در انتظار و باقی‌مانده فیس برای هر صنف'
  },
  __fee_debtors_report_columns: {
    studentName: 'متعلم',
    classTitle: 'صنف',
    academicYear: 'سال تعلیمی',
    orderCount: 'تعداد بل‌ها',
    totalDue: 'مبلغ کل',
    totalPaid: 'پرداخت‌شده',
    totalOutstanding: 'باقی‌مانده',
    overdueOrders: 'بل‌های سررسیدشده',
    partialOrders: 'بل‌های نیمه‌پرداخت',
    lastDueDate: 'آخرین سررسید',
    debtorStatus: 'وضعیت بدهکاری'
  },
  __fee_discount_exemption_report_columns: {
    studentName: 'متعلم',
    classTitle: 'صنف',
    academicYear: 'سال تعلیمی',
    recordType: 'نوع ثبت',
    benefitType: 'نوع امتیاز',
    scope: 'ساحه',
    coverageMode: 'نوع پوشش',
    amount: 'مبلغ',
    percentage: 'فیصدی',
    sponsorName: 'تمویل‌کننده',
    status: 'وضعیت',
    reason: 'دلیل',
    createdAt: 'زمان ثبت',
    startDate: 'شروع',
    endDate: 'ختم'
  },
  __fee_collection_by_class_report_columns: {
    classTitle: 'صنف',
    orderCount: 'تعداد بل‌ها',
    paymentCount: 'تعداد پرداخت‌ها',
    approvedPaymentCount: 'پرداخت‌های تاییدشده',
    pendingPaymentCount: 'پرداخت‌های در انتظار',
    totalDue: 'مبلغ کل',
    approvedAmount: 'وصول تاییدشده',
    pendingAmount: 'وصول در انتظار',
    totalOutstanding: 'باقی‌مانده',
    reliefCount: 'تعداد تسهیلات',
    fixedReliefAmount: 'مبلغ تسهیلات ثابت',
    fullReliefCount: 'معافیت‌های کامل',
    collectionRate: 'فیصدی وصول'
  },
  exam_outcomes: {
    title: 'گزارش نتایج امتحانات',
    description: 'خلاصه امتحانات بر پایه جلسه و عضویت'
  },
  attendance_overview: {
    title: 'گزارش حضور',
    description: 'خلاصه حضور و غیاب بر پایه عضویت'
  },
  class_overview: {
    title: 'گزارش صنفی',
    description: 'خلاصه عضویت‌ها و وضعیت صنف‌ها'
  },
  timetable_overview: {
    title: 'گزارش تقسیم اوقات و پلان',
    description: 'تحلیل تقسیم اوقات و پلان تعلیمی'
  },
  promotion_overview: {
    title: 'گزارش ارتقا',
    description: 'خلاصه preview/apply تراکنش‌های ارتقا'
  },
  government_finance_quarterly: {
    title: 'گزارش مالی دولت - ربعوار',
    description: 'خلاصه مالی رسمی دولت در سطح ربع مالی'
  },
  government_finance_annual: {
    title: 'گزارش مالی دولت - سالانه',
    description: 'خلاصه سالانه مالی دولت'
  }
};

const REPORT_COLUMN_LABELS = {
  finance_overview: {
    orderNumber: 'شماره سفارش',
    title: 'عنوان',
    studentName: 'متعلم',
    classTitle: 'صنف',
    academicYear: 'سال',
    term: 'ترم',
    status: 'وضعیت',
    amountDue: 'مبلغ قابل پرداخت',
    amountPaid: 'پرداخت‌شده',
    outstandingAmount: 'باقی‌مانده',
    issuedAt: 'تاریخ صدور',
    dueDate: 'سررسید'
  },
  exam_outcomes: {
    studentName: 'متعلم',
    classTitle: 'صنف',
    sessionTitle: 'جلسه امتحان',
    examType: 'نوع امتحان',
    term: 'ترم',
    subject: 'مضمون',
    resultStatus: 'نتیجه',
    markStatus: 'وضعیت نمره',
    obtainedMark: 'نمره',
    totalMark: 'نمره کل',
    percentage: 'فیصدی',
    rank: 'رتبه'
  },
  attendance_overview: {
    date: 'تاریخ',
    studentName: 'متعلم',
    classTitle: 'صنف',
    academicYear: 'سال',
    status: 'وضعیت',
    note: 'ملاحظه'
  },
  class_overview: {
    studentName: 'متعلم',
    classTitle: 'صنف',
    academicYear: 'سال',
    status: 'وضعیت',
    source: 'منبع',
    isCurrent: 'جاری',
    enrolledAt: 'شمول',
    endedAt: 'ختم',
    endedReason: 'دلیل ختم'
  },
  timetable_overview: {
    occurrenceDate: 'تاریخ',
    dayOfWeek: 'روز',
    classTitle: 'صنف',
    subject: 'مضمون',
    teacherName: 'استاد',
    startTime: 'شروع',
    endTime: 'ختم',
    room: 'اطاق',
    status: 'وضعیت'
  },
  promotion_overview: {
    studentName: 'متعلم',
    classTitle: 'صنف مبدا',
    academicYear: 'سال مبدا',
    sourceResultStatus: 'نتیجه مبنا',
    promotionOutcome: 'نتیجه ارتقا',
    transactionStatus: 'وضعیت تراکنش',
    targetClassTitle: 'صنف مقصد',
    targetAcademicYear: 'سال مقصد',
    decidedAt: 'زمان تصمیم'
  },
  government_finance_quarterly: {
    classTitle: 'صنف',
    totalIncome: 'عواید',
    totalExpense: 'مصارف',
    balance: 'بیلانس',
    paymentCount: 'تعداد پرداخت‌ها',
    expenseCount: 'تعداد مصارف'
  },
  government_finance_annual: {
    quarterLabel: 'ربع',
    totalIncome: 'عواید',
    totalExpense: 'مصارف',
    balance: 'بیلانس',
    classCount: 'تعداد صنف‌ها'
  }
};

const REPORT_UI_OVERRIDES = {
  fee_debtors_overview: {
    title: 'گزارش بدهکاران فیس',
    description: 'لیست بدهکاران، باقی‌مانده‌ها و بل‌های سررسیدشده بر پایه سفارش‌ها'
  },
  fee_discount_exemption_overview: {
    title: 'گزارش تخفیف و معافیت',
    description: 'نمای یکپارچه تخفیف‌ها، معافیت‌ها و متعلمین رایگان در لایه مالی'
  },
  fee_collection_by_class: {
    title: 'گزارش وصول فیس بر اساس صنف',
    description: 'تحلیل وصول تاییدشده، پرداخت‌های در انتظار و باقی‌مانده فیس برای هر صنف'
  }
};

const REPORT_COLUMN_OVERRIDES = {
  fee_debtors_overview: {
    studentName: 'متعلم',
    classTitle: 'صنف',
    academicYear: 'سال تعلیمی',
    orderCount: 'تعداد بل‌ها',
    totalDue: 'مبلغ کل',
    totalPaid: 'پرداخت‌شده',
    totalOutstanding: 'باقی‌مانده',
    overdueOrders: 'بل‌های سررسیدشده',
    partialOrders: 'بل‌های نیمه‌پرداخت',
    lastDueDate: 'آخرین سررسید',
    debtorStatus: 'وضعیت بدهکاری'
  },
  fee_discount_exemption_overview: {
    studentName: 'متعلم',
    classTitle: 'صنف',
    academicYear: 'سال تعلیمی',
    recordType: 'نوع ثبت',
    benefitType: 'نوع امتیاز',
    scope: 'ساحه',
    coverageMode: 'نوع پوشش',
    amount: 'مبلغ',
    percentage: 'فیصدی',
    sponsorName: 'تمویل‌کننده',
    status: 'وضعیت',
    reason: 'دلیل',
    createdAt: 'زمان ثبت',
    startDate: 'شروع',
    endDate: 'ختم'
  },
  fee_collection_by_class: {
    classTitle: 'صنف',
    orderCount: 'تعداد بل‌ها',
    paymentCount: 'تعداد پرداخت‌ها',
    approvedPaymentCount: 'پرداخت‌های تاییدشده',
    pendingPaymentCount: 'پرداخت‌های در انتظار',
    totalDue: 'مبلغ کل',
    approvedAmount: 'وصول تاییدشده',
    pendingAmount: 'وصول در انتظار',
    totalOutstanding: 'باقی‌مانده',
    reliefCount: 'تعداد تسهیلات',
    fixedReliefAmount: 'مبلغ تسهیلات ثابت',
    fullReliefCount: 'معافیت‌های کامل',
    collectionRate: 'فیصدی وصول'
  }
};

const SUMMARY_LABELS = {
  totalOrders: 'مجموع سفارش‌ها',
  totalPayments: 'مجموع پرداخت‌ها',
  totalDue: 'مبلغ کل',
  totalPaidOnOrders: 'پرداخت‌شده',
  totalOutstanding: 'باقی‌مانده',
  totalPaymentAmount: 'مبلغ پرداخت‌ها',
  paidOrders: 'سفارش‌های تصفیه‌شده',
  overdueOrders: 'سفارش‌های سررسیدشده',
  partialOrders: 'سفارش‌های نیمه‌پرداخت',
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
  totalRecords: 'رکوردها',
  present: 'حاضر',
  late: 'تاخیر',
  attendanceRate: 'فیصدی حضور',
  totalMemberships: 'عضویت‌ها',
  active: 'فعال',
  pending: 'در انتظار',
  suspended: 'تعلیق‌شده',
  ended: 'ختم‌شده',
  current: 'جاری',
  timetableEntries: 'ورودی‌های تقسیم اوقات',
  publishedEntries: 'منتشرشده',
  draftEntries: 'پیش‌نویس',
  configs: 'پیکربندی‌ها',
  annualPlans: 'پلان‌های سالانه',
  weeklyPlans: 'پلان‌های هفتگی',
  totalTransactions: 'تراکنش‌ها',
  promoted: 'ارتقا یافته',
  repeated: 'مکرر',
  graduated: 'فارغ',
  blocked: 'مسدود',
  applied: 'اعمال‌شده',
  preview: 'پیش‌نمایش',
  totalIncome: 'عواید',
  totalExpense: 'مصارف',
  balance: 'بیلانس',
  paymentCount: 'تعداد پرداخت‌ها',
  expenseCount: 'تعداد مصارف',
  classCount: 'تعداد صنف‌ها'
};

const SUMMARY_LABEL_OVERRIDES = {
  totalDebtors: 'تعداد بدهکاران',
  overdueDebtors: 'بدهکاران سررسیدشده',
  partialDebtors: 'بدهکاران نیمه‌پرداخت',
  totalEntries: 'تعداد ثبت‌ها',
  activeDiscounts: 'تخفیف‌های فعال',
  activeExemptions: 'معافیت‌های فعال',
  totalDiscountAmount: 'مجموع تخفیف‌ها',
  totalReliefs: 'مجموع تسهیلات',
  activeReliefs: 'تسهیلات فعال',
  totalFixedReliefAmount: 'مجموع تسهیلات ثابت',
  percentReliefCount: 'تسهیلات درصدی',
  fullReliefCount: 'تسهیلات کامل',
  activeScholarships: 'بورسیه‌های فعال',
  charitySupports: 'حمایت‌های خیریه',
  debtorsWithRelief: 'بدهکاران دارای تسهیلات',
  fullWaivers: 'معافیت کامل',
  partialWaivers: 'معافیت جزئی',
  totalClasses: 'تعداد صنف‌ها',
  approvedCollection: 'وصول تاییدشده',
  pendingCollection: 'وصول در انتظار'
};

const CLEAN_REPORT_UI = {
  finance_overview: {
    title: 'گزارش مالی عمومی',
    description: 'خلاصه مالی و تعهدات مبتنی بر عضویت'
  },
  fee_debtors_overview: {
    title: 'گزارش بدهکاران فیس',
    description: 'لیست بدهکاران، باقی‌مانده‌ها و بل‌های سررسیدشده'
  },
  fee_discount_exemption_overview: {
    title: 'گزارش تخفیف و معافیت',
    description: 'نمای یکپارچه تخفیف‌ها، معافیت‌ها و متعلمین رایگان'
  },
  fee_collection_by_class: {
    title: 'گزارش وصول فیس بر اساس صنف',
    description: 'تحلیل وصول، پرداخت‌های در انتظار و باقی‌مانده فیس در سطح صنف'
  },
  exam_outcomes: {
    title: 'گزارش نتایج امتحانات',
    description: 'خلاصه نتایج امتحانات بر پایه جلسه و عضویت'
  },
  attendance_overview: {
    title: 'گزارش حضور',
    description: 'خلاصه حضور و غیاب بر پایه عضویت'
  },
  class_overview: {
    title: 'گزارش صنفی',
    description: 'خلاصه عضویت‌ها و وضعیت صنف‌ها'
  },
  timetable_overview: {
    title: 'گزارش تقسیم اوقات و پلان',
    description: 'تحلیل تقسیم اوقات و پلان تعلیمی'
  },
  promotion_overview: {
    title: 'گزارش ارتقا',
    description: 'خلاصه تراکنش‌های ارتقا'
  },
  government_finance_quarterly: {
    title: 'گزارش مالی دولت - ربعوار',
    description: 'خلاصه مالی رسمی دولت در سطح ربع مالی'
  },
  government_finance_annual: {
    title: 'گزارش مالی دولت - سالانه',
    description: 'خلاصه سالانه مالی دولت'
  }
};

const CLEAN_REPORT_COLUMN_LABELS = {
  fee_debtors_overview: {
    studentName: 'متعلم',
    classTitle: 'صنف',
    academicYear: 'سال تعلیمی',
    orderCount: 'تعداد بل‌ها',
    totalDue: 'مبلغ کل',
    totalPaid: 'پرداخت‌شده',
    totalOutstanding: 'باقی‌مانده',
    overdueOrders: 'بل‌های سررسیدشده',
    partialOrders: 'بل‌های نیمه‌پرداخت',
    lastDueDate: 'آخرین سررسید',
    debtorStatus: 'وضعیت بدهکاری'
  },
  fee_discount_exemption_overview: {
    studentName: 'متعلم',
    classTitle: 'صنف',
    academicYear: 'سال تعلیمی',
    recordType: 'نوع ثبت',
    benefitType: 'نوع امتیاز',
    scope: 'ساحه',
    amount: 'مبلغ',
    percentage: 'فیصدی',
    status: 'وضعیت',
    reason: 'دلیل',
    createdAt: 'زمان ثبت'
  },
  fee_collection_by_class: {
    classTitle: 'صنف',
    orderCount: 'تعداد بل‌ها',
    paymentCount: 'تعداد پرداخت‌ها',
    approvedPaymentCount: 'پرداخت‌های تاییدشده',
    pendingPaymentCount: 'پرداخت‌های در انتظار',
    totalDue: 'مبلغ کل',
    approvedAmount: 'وصول تاییدشده',
    pendingAmount: 'وصول در انتظار',
    totalOutstanding: 'باقی‌مانده',
    collectionRate: 'فیصدی وصول'
  }
};

const CLEAN_SUMMARY_LABELS = {
  totalDebtors: 'تعداد بدهکاران',
  overdueDebtors: 'بدهکاران سررسیدشده',
  partialDebtors: 'بدهکاران نیمه‌پرداخت',
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
  debtorsWithRelief: 'بدهکاران دارای تسهیلات',
  totalClasses: 'تعداد صنف‌ها',
  approvedCollection: 'وصول تاییدشده',
  pendingCollection: 'وصول در انتظار'
};

function repairDisplayText(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (!/[ØÙÚÛÂâ€]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(Array.from(text).map((char) => char.charCodeAt(0) & 0xff));
    const repaired = new TextDecoder('utf-8').decode(bytes).trim();
    return repaired || text;
  } catch {
    return text;
  }
}

function isUnreadableText(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  return /^[?\u061F\s.-]+$/.test(text) || /�/.test(text) || /[ØÙÚÛÂâ€]/.test(text);
}

function resolveDisplayText(primary, fallback = '') {
  const repairedPrimary = repairDisplayText(primary);
  if (repairedPrimary && !isUnreadableText(repairedPrimary)) return repairedPrimary;
  const repairedFallback = repairDisplayText(fallback);
  if (repairedFallback && !isUnreadableText(repairedFallback)) return repairedFallback;
  return repairedPrimary || repairedFallback || '';
}

function normalizeReferenceItems(items = [], textKeys = []) {
  return Array.isArray(items)
    ? items.map((item) => {
        const next = { ...(item || {}) };
        textKeys.forEach((key) => {
          if (typeof next[key] === 'string') next[key] = resolveDisplayText(next[key]);
        });
        return next;
      })
    : [];
}

function getColumnFallbackLabel(reportKey, columnKey) {
  return CLEAN_REPORT_COLUMN_LABELS[reportKey]?.[columnKey]
    || REPORT_COLUMN_OVERRIDES[reportKey]?.[columnKey]
    || REPORT_COLUMN_LABELS[reportKey]?.[columnKey]
    || columnKey;
}

function normalizeReportPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const reportKey = String(payload.report?.key || '').trim();
  const normalizedRows = Array.isArray(payload.rows)
    ? payload.rows.map((row) => Object.fromEntries(
        Object.entries(row || {}).map(([key, value]) => [key, typeof value === 'string' ? resolveDisplayText(value) : value])
      ))
    : [];

  return {
    ...payload,
    report: {
      ...(payload.report || {}),
      title: resolveDisplayText(
        payload.report?.title || '',
        CLEAN_REPORT_UI[reportKey]?.title || REPORT_UI_OVERRIDES[reportKey]?.title || REPORT_UI[reportKey]?.title || ''
      ),
      description: resolveDisplayText(
        payload.report?.description || '',
        CLEAN_REPORT_UI[reportKey]?.description || REPORT_UI_OVERRIDES[reportKey]?.description || REPORT_UI[reportKey]?.description || ''
      )
    },
    columns: Array.isArray(payload.columns)
      ? payload.columns.map((column) => ({
          ...column,
          label: resolveDisplayText(column?.label || '', getColumnFallbackLabel(reportKey, column?.key))
        }))
      : [],
    rows: normalizedRows
  };
}

function buildFilters(form) {
  const filters = {
    financialYearId: String(form.financialYearId || '').trim(),
    academicYearId: String(form.academicYearId || '').trim(),
    termId: String(form.termId || '').trim(),
    examId: String(form.examId || '').trim(),
    classId: String(form.classId || '').trim(),
    studentId: String(form.studentId || '').trim(),
    teacherId: String(form.teacherId || '').trim(),
    quarter: String(form.quarter || '').trim(),
    month: String(form.month || '').trim(),
    dateFrom: String(form.dateFrom || '').trim(),
    dateTo: String(form.dateTo || '').trim()
  };

  Object.keys(filters).forEach((key) => {
    if (!filters[key]) delete filters[key];
  });

  return filters;
}

function getReportTitle(report) {
  const key = String(report?.report?.key || '').trim();
  return resolveDisplayText(report?.report?.title || '', REPORT_UI[key]?.title || key || 'گزارش');
}

function getReportOptionLabel(item = {}) {
  const key = String(item?.key || '').trim();
  return resolveDisplayText(item?.uiLabel || item?.title || '', REPORT_UI[key]?.title || key || '---');
}

function getSummaryLabel(key) {
  return resolveDisplayText(SUMMARY_LABEL_OVERRIDES[key] || SUMMARY_LABELS[key] || '', key);
}

function getCleanReportTitle(report) {
  const key = String(report?.report?.key || '').trim();
  return resolveDisplayText(report?.report?.title || '', CLEAN_REPORT_UI[key]?.title || REPORT_UI[key]?.title || key || 'گزارش');
}

function getCleanReportOptionLabel(item = {}) {
  const key = String(item?.key || '').trim();
  return resolveDisplayText(item?.uiLabel || item?.title || '', CLEAN_REPORT_UI[key]?.title || REPORT_UI[key]?.title || key || '---');
}

function getCleanSummaryLabel(key) {
  return resolveDisplayText(CLEAN_SUMMARY_LABELS[key] || SUMMARY_LABEL_OVERRIDES[key] || SUMMARY_LABELS[key] || '', key);
}

export default function AdminReports() {
  const [reference, setReference] = useState(EMPTY_REFERENCE);
  const [form, setForm] = useState(EMPTY_FORM);
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [busyAction, setBusyAction] = useState('');

  const catalog = useMemo(
    () => normalizeOptions(reference.catalog, ['title', 'key']).map((item) => ({
      ...item,
      uiLabel: getCleanReportOptionLabel(item)
    })),
    [reference.catalog]
  );
  const financialYears = useMemo(() => normalizeOptions(reference.financialYears, ['title', 'code']), [reference.financialYears]);
  const academicYears = useMemo(() => normalizeOptions(reference.academicYears, ['title', 'code']), [reference.academicYears]);
  const academicTerms = useMemo(() => normalizeOptions(reference.academicTerms, ['title', 'code']), [reference.academicTerms]);
  const examSessions = useMemo(() => normalizeOptions(reference.examSessions, ['title', 'code']), [reference.examSessions]);
  const classes = useMemo(() => normalizeOptions(reference.classes, ['title', 'code']), [reference.classes]);
  const students = useMemo(() => normalizeOptions(reference.students, ['fullName', 'admissionNo']), [reference.students]);
  const teachers = useMemo(() => normalizeOptions(reference.teachers, ['name', 'email']), [reference.teachers]);
  const sheetTemplates = useMemo(() => normalizeOptions(reference.sheetTemplates, ['title', 'code']), [reference.sheetTemplates]);
  const compatibleTemplates = useMemo(() => {
    if (!form.reportKey) return sheetTemplates;
    if (Object.prototype.hasOwnProperty.call(REPORT_TEMPLATE_TYPE_MAP, form.reportKey) && !REPORT_TEMPLATE_TYPE_MAP[form.reportKey].length) {
      return [];
    }
    const allowedTypes = REPORT_TEMPLATE_TYPE_MAP[form.reportKey] || [];
    if (!allowedTypes.length) return sheetTemplates;
    return sheetTemplates.filter((item) => allowedTypes.includes(String(item.type || '').trim()));
  }, [form.reportKey, sheetTemplates]);
  const quarterOptions = useMemo(() => normalizeOptions(QUARTER_OPTIONS, ['title', 'id']), []);
  const summaryEntries = Object.entries(report?.summary || {});

  const showMessage = (text, tone = 'info') => {
    setMessage(resolveDisplayText(text));
    setMessageTone(tone);
  };

  const loadReference = async () => {
    try {
      const [data, templatesData] = await Promise.all([
        fetchJson('/api/reports/reference-data'),
        fetchJson('/api/sheet-templates')
      ]);
      setReference({
        catalog: normalizeReferenceItems(data.catalog || [], ['title', 'description']),
        financialYears: normalizeReferenceItems(data.financialYears || [], ['title', 'code']),
        academicYears: normalizeReferenceItems(data.academicYears || [], ['title', 'code']),
        academicTerms: normalizeReferenceItems(data.academicTerms || [], ['title', 'code']),
        examSessions: normalizeReferenceItems(data.examSessions || [], ['title', 'code']),
        classes: normalizeReferenceItems(data.classes || [], ['title', 'code']),
        students: normalizeReferenceItems(data.students || [], ['fullName', 'admissionNo']),
        teachers: normalizeReferenceItems(data.teachers || [], ['name', 'email']),
        sheetTemplates: normalizeReferenceItems(templatesData.items || [], ['title', 'code'])
      });
      setForm((current) => ({
        ...current,
        reportKey: current.reportKey || data.catalog?.[0]?.key || ''
      }));
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت داده‌های گزارش ناموفق بود.'), 'error');
    }
  };

  useEffect(() => {
    loadReference();
  }, []);

  useEffect(() => {
    if (!form.templateId) return;
    const exists = compatibleTemplates.some((item) => String(item.id) === String(form.templateId));
    if (!exists) {
      setForm((current) => ({ ...current, templateId: '' }));
    }
  }, [compatibleTemplates, form.templateId]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const runReport = async () => {
    try {
      setBusyAction('run');
      const data = await postJson('/api/reports/run', {
        reportKey: form.reportKey,
        templateId: form.templateId || undefined,
        filters: buildFilters(form)
      });
      setReport(normalizeReportPayload(data.report || null));
      showMessage('گزارش با موفقیت اجرا شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'اجرای گزارش ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const exportBinary = async (endpoint, actionName) => {
    try {
      setBusyAction(actionName);
      const { blob, filename } = await fetchBlob(endpoint, {
        reportKey: form.reportKey,
        templateId: form.templateId || undefined,
        filters: buildFilters(form)
      });
      downloadBlob(blob, filename);
      showMessage('فایل خروجی دانلود شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت خروجی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const exportPrint = async () => {
    try {
      setBusyAction('print');
      const { text, filename, contentType } = await fetchText('/api/reports/export.print', {
        reportKey: form.reportKey,
        templateId: form.templateId || undefined,
        filters: buildFilters(form)
      });
      const opened = openHtmlDocument(text, filename);
      if (!opened) {
        downloadBlob(new Blob([text], { type: contentType }), filename);
      }
      showMessage('نسخه چاپی آماده شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'آماده‌سازی نسخه چاپی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="admin-workspace-page">
      <div className="admin-workspace-shell">
        <section className="admin-workspace-hero">
          <div className="admin-workspace-badges">
            <span className="admin-workspace-badge">موتور گزارش</span>
            <span className="admin-workspace-badge info">CSV / Excel / PDF / نسخه چاپی</span>
          </div>
          <h1>گزارش‌ساز یکپارچه</h1>
          <p>همه گزارش‌های مالی، امتحان، حضور، صنفی، تقسیم اوقات و ارتقا از یک موتور واحد با فیلترهای اصلی اجرا و صادر می‌شوند.</p>
          <div className="admin-workspace-meta">
            <span>تعداد گزارش‌ها: {formatNumber(catalog.length)}</span>
            <span>آخرین اجرا: {toLocaleDateTime(report?.generatedAt)}</span>
            <span>تعداد سطرها: {formatNumber(report?.rows?.length || 0)}</span>
            <span><a href="/admin-sheet-templates">مدیریت شقه‌ها</a></span>
          </div>
        </section>

        {message && <div className={`admin-workspace-message ${messageTone === 'error' ? 'error' : ''}`}>{message}</div>}

        <section className="admin-workspace-grid">
          <article className="admin-workspace-card" data-span="5">
            <h2>فیلترها</h2>
            <p className="admin-workspace-subtitle">نوع گزارش را انتخاب کن و در صورت نیاز بر اساس سال مالی، سال تعلیمی، ترم، صنف، متعلم، استاد، ربع و بازه زمانی فیلتر بزن.</p>
            <div className="admin-workspace-message" style={{ marginBottom: 12 }}>
              بخش شقه‌ها همین‌جاست: از فیلد <strong>شقه خروجی (Template)</strong> استفاده کن یا مستقیم وارد
              {' '}
              <a href="/admin-sheet-templates">مدیریت شقه‌ها</a>
              {' '}
              شو.
            </div>
            <div className="admin-workspace-form">
              <div className="admin-workspace-form-grid">
                <div className="admin-workspace-field">
                  <label htmlFor="report-key">نوع گزارش</label>
                  <select id="report-key" name="reportKey" value={form.reportKey} onChange={handleChange}>
                    <option value="">انتخاب گزارش</option>
                    {catalog.map((item) => (
                      <option key={item.key} value={item.key}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-template">شقه خروجی (Template)</label>
                  <select id="report-template" name="templateId" value={form.templateId} onChange={handleChange}>
                    <option value="">پیش‌فرض موتور گزارش</option>
                    {compatibleTemplates.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-financial-year">سال مالی</label>
                  <select id="report-financial-year" name="financialYearId" value={form.financialYearId} onChange={handleChange}>
                    <option value="">همه</option>
                    {financialYears.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-year">سال تعلیمی</label>
                  <select id="report-year" name="academicYearId" value={form.academicYearId} onChange={handleChange}>
                    <option value="">همه</option>
                    {academicYears.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-term">ترم</label>
                  <select id="report-term" name="termId" value={form.termId} onChange={handleChange}>
                    <option value="">همه</option>
                    {academicTerms.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-exam">جلسه امتحان</label>
                  <select id="report-exam" name="examId" value={form.examId} onChange={handleChange}>
                    <option value="">همه</option>
                    {examSessions.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-class">صنف</label>
                  <select id="report-class" name="classId" value={form.classId} onChange={handleChange}>
                    <option value="">همه</option>
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-student">متعلم</label>
                  <select id="report-student" name="studentId" value={form.studentId} onChange={handleChange}>
                    <option value="">همه</option>
                    {students.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-teacher">استاد</label>
                  <select id="report-teacher" name="teacherId" value={form.teacherId} onChange={handleChange}>
                    <option value="">همه</option>
                    {teachers.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-quarter">ربع</label>
                  <select id="report-quarter" name="quarter" value={form.quarter} onChange={handleChange}>
                    <option value="">همه</option>
                    {quarterOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-month">ماه</label>
                  <input id="report-month" name="month" value={form.month} onChange={handleChange} placeholder="مثال: حمل ۱۴۰۵" />
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-from">از تاریخ</label>
                  <input id="report-from" type="date" name="dateFrom" value={form.dateFrom} onChange={handleChange} />
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="report-to">تا تاریخ</label>
                  <input id="report-to" type="date" name="dateTo" value={form.dateTo} onChange={handleChange} />
                </div>
              </div>
              <div className="admin-workspace-actions">
                <a className="admin-workspace-button-ghost" href="/admin-sheet-templates">مدیریت شقه‌ها</a>
                <button type="button" className="admin-workspace-button-ghost" onClick={loadReference} disabled={!!busyAction}>بازخوانی</button>
                <button type="button" className="admin-workspace-button" onClick={runReport} disabled={busyAction === 'run' || !form.reportKey}>اجرا</button>
              </div>
            </div>
          </article>

          <article className="admin-workspace-card" data-span="7">
            <h2>خروجی‌ها و خلاصه</h2>
            <p className="admin-workspace-subtitle">همین گزارش فعلی را می‌توانی به CSV، Excel، PDF یا نسخه چاپی صادر کنی.</p>
            <div className="admin-workspace-actions">
              <button type="button" className="admin-workspace-button-ghost" onClick={() => exportBinary('/api/reports/export.csv', 'csv')} disabled={busyAction === 'csv' || !form.reportKey}>CSV</button>
              <button type="button" className="admin-workspace-button-secondary" onClick={() => exportBinary('/api/reports/export.xlsx', 'xlsx')} disabled={busyAction === 'xlsx' || !form.reportKey}>Excel</button>
              <button type="button" className="admin-workspace-button-secondary" onClick={() => exportBinary('/api/reports/export.pdf', 'pdf')} disabled={busyAction === 'pdf' || !form.reportKey}>PDF</button>
              <button type="button" className="admin-workspace-button" onClick={exportPrint} disabled={busyAction === 'print' || !form.reportKey}>نسخه چاپی</button>
            </div>
            <div className="admin-workspace-summary">
              <div className="admin-workspace-stat"><strong>{getCleanReportTitle(report)}</strong><span>عنوان گزارش</span></div>
              <div className="admin-workspace-stat"><strong>{formatNumber(report?.rows?.length || 0)}</strong><span>تعداد سطرها</span></div>
              <div className="admin-workspace-stat"><strong>{toLocaleDateTime(report?.generatedAt)}</strong><span>زمان تولید</span></div>
            </div>
            {summaryEntries.length ? (
              <div className="admin-workspace-badges">
                {summaryEntries.map(([key, value]) => (
                  <span key={key} className="admin-workspace-badge muted">{getCleanSummaryLabel(key)}: {resolveDisplayText(String(value))}</span>
                ))}
              </div>
            ) : (
              <div className="admin-workspace-empty">بعد از اجرای گزارش، خلاصه اینجا نمایش داده می‌شود.</div>
            )}
          </article>

          <article className="admin-workspace-card">
            <h2>نتیجه گزارش</h2>
            <p className="admin-workspace-subtitle">خروجی همین گزارش در جدول زیر نمایش داده می‌شود.</p>
            {report?.rows?.length && report?.columns?.length ? (
              <div className="admin-workspace-table-wrap">
                <table className="admin-workspace-table">
                  <thead>
                    <tr>
                      {report.columns.map((column) => (
                        <th key={column.key}>{resolveDisplayText(column.label || '', getColumnFallbackLabel(report?.report?.key, column.key))}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, rowIndex) => (
                      <tr key={`${rowIndex}-${row[report.columns[0]?.key] || 'row'}`}>
                        {report.columns.map((column) => (
                          <td key={`${rowIndex}-${column.key}`}>{resolveDisplayText(String(row?.[column.key] ?? '')) || '---'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-workspace-empty">برای دیدن داده‌ها، ابتدا گزارش را اجرا کن.</div>
            )}
          </article>
        </section>
      </div>
    </div>
  );
}
