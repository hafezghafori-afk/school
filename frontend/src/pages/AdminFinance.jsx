import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import './AdminFinance.css';
import { API_BASE } from '../config/api';
import AfghanDateInput from '../components/ui/AfghanDateInput';
import {
  afghanSolarToGregorianInput,
  formatAfghanDate,
  formatAfghanDateTime,
  gregorianToAfghanSolar,
  toGregorianDateInputValue
} from '../utils/afghanDate';
import { formatFinanceCode, toEnglishAlphaNumeric } from '../utils/latinFinanceCode';
import useSiteSettings from '../hooks/useSiteSettings';
import { getOfficialPrintLogoImageClass, getPrintLogoUrls } from '../utils/printLogos';
import { localizeSystemMessage } from '../utils/systemMessage';
import { buildStudentSearchBlob as buildSharedStudentSearchBlob } from '../utils/studentSearch';
import { readStoredSchoolId, resolveActiveSchoolContext } from './adminWorkspaceUtils';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  const schoolId = readStoredSchoolId();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(schoolId ? { 'X-School-Id': schoolId } : {})
  };
};

const toFaDate = (value) => {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) || '-';
};

const toFaDateTime = (value) => {
  return formatAfghanDateTime(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) || '-';
};

const toInputDate = (value) => {
  return toGregorianDateInputValue(value);
};

const toFaMonthKey = (value) => {
  if (!value) return '-';
  const date = new Date(`${String(value).trim()}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return formatAfghanDate(date, { year: 'numeric', month: 'long' }) || value;
};

const fmt = (value) => {
  const number = Number(value) || 0;
  return number.toLocaleString('fa-AF-u-ca-persian');
};

const normalizeFinanceSearchTerm = (value = '') => String(value || '')
  .normalize('NFKC')
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[ۀة]/g, 'ه')
  .replace(/[أإآ]/g, 'ا')
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[\u200c\u200d\s]+/g, ' ')
  .trim()
  .toLowerCase();

const includesFinanceSearch = (values, term) => {
  const normalizedTerm = normalizeFinanceSearchTerm(term);
  if (!normalizedTerm) return true;
  return values.some((value) => normalizeFinanceSearchTerm(value).includes(normalizedTerm));
};

const getDefaultFinanceDashboardRange = () => {
  const today = new Date();
  const solar = gregorianToAfghanSolar(today);
  if (!solar) {
    return {
      from: toGregorianDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: toGregorianDateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, 0))
    };
  }
  const nextMonth = solar.jm === 12
    ? { year: solar.jy + 1, month: 1 }
    : { year: solar.jy, month: solar.jm + 1 };
  const from = afghanSolarToGregorianInput(solar.jy, solar.jm, 1);
  const nextStart = afghanSolarToGregorianInput(nextMonth.year, nextMonth.month, 1);
  const nextStartDate = new Date(`${nextStart}T00:00:00`);
  nextStartDate.setDate(nextStartDate.getDate() - 1);
  return { from, to: toGregorianDateInputValue(nextStartDate) };
};

// Shows whether the student behind a finance row is still enrolled -
// backed by financeDashboardService's lifecycleStatus/lifecycleStatusLabel/
// lifecycleStatusTone fields (see backend/utils/financeStudentLifecycleStatus.js).
// A student marked منفک/تبدیل/محروم by the academic manager no longer looks
// identical to an active one in bill lists, debtor lists, and payment lists.
function FinanceStudentStatusBadge({ label, tone }) {
  if (!label) return null;
  return <span className={`finance-status-badge ${tone || 'unknown'}`}>{label}</span>;
}

const FINANCE_DONUT_COLORS = ['#22c55e', '#f97316', '#38bdf8', '#a78bfa', '#f43f5e', '#facc15'];

function FinanceDonutCard({ title, subtitle, rows = [] }) {
  const normalizedRows = (Array.isArray(rows) ? rows : []).filter((row) => Number(row?.value || 0) > 0);
  let cursor = 0;
  const stops = normalizedRows.map((row, index) => {
    const start = cursor;
    cursor += Number(row?.percent || 0);
    return `${FINANCE_DONUT_COLORS[index % FINANCE_DONUT_COLORS.length]} ${start}% ${cursor}%`;
  });
  const total = normalizedRows.reduce((sum, row) => sum + Number(row?.value || 0), 0);
  return (
    <div className="finance-card finance-donut-card">
      <div className="finance-card-head">
        <div>
          <h3>{title}</h3>
          <p className="muted">{subtitle}</p>
        </div>
      </div>
      <div className="finance-donut-layout">
        <div
          className="finance-donut"
          style={{ background: stops.length ? `conic-gradient(${stops.join(', ')})` : 'rgba(148, 163, 184, 0.18)' }}
          aria-label={title}
        >
          <span><strong>{fmt(total)}</strong><small>AFN</small></span>
        </div>
        <div className="finance-donut-legend">
          {normalizedRows.map((row, index) => (
            <div key={`${title}-${row.key || index}`}>
              <i style={{ background: FINANCE_DONUT_COLORS[index % FINANCE_DONUT_COLORS.length] }} />
              <span>{row.label}</span>
              <strong>{fmt(row.value)} <small>({fmt(row.percent)}%)</small></strong>
            </div>
          ))}
          {!normalizedRows.length && <p className="muted">برای این بازه هنوز رقم ثبت نشده است.</p>}
        </div>
      </div>
    </div>
  );
}

const buildFinanceSearchBlob = (values = []) => (
  values
    .map((value) => normalizeFinanceSearchTerm(value))
    .filter(Boolean)
    .join(' | ')
);

const buildStudentSearchBlob = (student = {}) => buildSharedStudentSearchBlob(student);

const buildStudentOptionList = ({
  indexedStudents = [],
  term = '',
  selectedId = '',
  defaultLimit = 24,
  searchLimit = 80
} = {}) => {
  const normalizedTerm = normalizeFinanceSearchTerm(term);
  const selectedKey = String(selectedId || '').trim();
  const pool = normalizedTerm
    ? indexedStudents.filter((entry) => entry.searchBlob.includes(normalizedTerm)).slice(0, searchLimit)
    : indexedStudents.slice(0, defaultLimit);
  const items = pool.map((entry) => entry.student);

  if (!selectedKey) return items;

  const alreadySelected = items.some((student) => String(student?._id || '') === selectedKey);
  if (alreadySelected) return items;

  const selectedEntry = indexedStudents.find((entry) => String(entry?.student?._id || '') === selectedKey);
  return selectedEntry ? [selectedEntry.student, ...items] : items;
};

const toSafeNumber = (value) => Number(value || 0) || 0;
const RECEIPT_PAGE_SIZE = 10;
const EXPENSE_PAGE_SIZE = 10;

// Quick-tools dropdown in the Payments tab - these four panels used to
// render fully inline (one after another) inside the receipt-inbox card,
// making that card very long. Now only the selected one mounts, keyed off
// its existing data-testid so we can scroll it into view once it renders.
const PAYMENT_TOOL_OPTIONS = [
  { value: 'class_bulk_approval', label: 'تأیید نهایی گروهی رسیدها بر اساس صنف', anchorTestId: 'class-payment-approval-panel' },
  { value: 'admission_bulk_correction', label: 'اصلاح گروهی مبلغ رسیدهای داخله', anchorTestId: 'admission-receipt-correction-panel' },
  { value: 'payment_scope_repair', label: 'ترمیم تفکیک پرداخت فیس و داخله', anchorTestId: 'payment-scope-repair-panel' },
  { value: 'refund_requests', label: 'درخواست‌های بازپرداخت', anchorTestId: 'finance-refunds-card' }
];

const getFeePlanBillPeriodType = (plan = {}) => (
  String(plan?.billingFrequency || plan?.periodType || '').trim().toLowerCase() === 'monthly'
    ? 'monthly'
    : 'term'
);

const selectActiveFeePlanForScope = ({
  plans = [],
  classId = '',
  academicYearId = '',
  effectiveAt = ''
} = {}) => {
  const normalizedClassId = String(classId || '').trim();
  const normalizedAcademicYearId = String(academicYearId || '').trim();
  const effectiveDate = effectiveAt ? new Date(effectiveAt) : null;
  const hasEffectiveDate = effectiveDate && !Number.isNaN(effectiveDate.getTime());
  if (!normalizedClassId) return null;

  return (Array.isArray(plans) ? plans : [])
    .filter((plan) => {
      const planClassId = String(plan?.classId?._id || plan?.classId || plan?.schoolClass?.id || plan?.schoolClass?._id || '').trim();
      const planAcademicYearId = String(plan?.academicYearId?._id || plan?.academicYearId || plan?.academicYear?.id || plan?.academicYear?._id || '').trim();
      const active = plan?.isActive !== false && String(plan?.lifecycleStatus || 'active').trim().toLowerCase() === 'active';
      if (!active || planClassId !== normalizedClassId) return false;
      if (normalizedAcademicYearId && planAcademicYearId && planAcademicYearId !== normalizedAcademicYearId) return false;
      if (hasEffectiveDate) {
        const effectiveFrom = plan?.effectiveFrom ? new Date(plan.effectiveFrom) : null;
        const effectiveTo = plan?.effectiveTo ? new Date(plan.effectiveTo) : null;
        if (effectiveFrom && !Number.isNaN(effectiveFrom.getTime()) && effectiveFrom > effectiveDate) return false;
        if (effectiveTo && !Number.isNaN(effectiveTo.getTime()) && effectiveTo < effectiveDate) return false;
      }
      return true;
    })
    .sort((left, right) => {
      const leftYearId = String(left?.academicYearId?._id || left?.academicYearId || left?.academicYear?.id || left?.academicYear?._id || '').trim();
      const rightYearId = String(right?.academicYearId?._id || right?.academicYearId || right?.academicYear?.id || right?.academicYear?._id || '').trim();
      const exactLeft = normalizedAcademicYearId && leftYearId === normalizedAcademicYearId ? 1 : 0;
      const exactRight = normalizedAcademicYearId && rightYearId === normalizedAcademicYearId ? 1 : 0;
      if (exactLeft !== exactRight) return exactRight - exactLeft;
      const defaultDelta = (right?.isDefault === true ? 1 : 0) - (left?.isDefault === true ? 1 : 0);
      if (defaultDelta !== 0) return defaultDelta;
      return toSafeNumber(left?.priority ?? 100) - toSafeNumber(right?.priority ?? 100);
    })[0] || null;
};

const getMonthBucket = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

// Afghan solar-hijri year-month bucket (e.g. "1405-05"), unlike getMonthBucket
// above which buckets by the Gregorian calendar. Used wherever a bucket key
// needs to line up with Afghan month labels/filters instead of Gregorian ones.
const getAfghanMonthBucket = (value) => {
  const solar = gregorianToAfghanSolar(value);
  if (!solar || !Number.isInteger(solar.jy) || !Number.isInteger(solar.jm)) return '';
  return `${solar.jy}-${String(solar.jm).padStart(2, '0')}`;
};

const getWeekBucket = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const copy = new Date(date);
  const diff = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
};

const formatFinanceTrendLabel = (bucket, mode) => {
  if (!bucket) return '-';
  try {
    if (mode === 'monthly') {
      const date = new Date(`${bucket}-01T00:00:00`);
      return formatAfghanDate(date, { month: 'short', year: '2-digit' }) || '-';
    }
    return formatAfghanDate(bucket, mode === 'weekly'
      ? { month: 'short', day: 'numeric' }
      : { month: 'numeric', day: 'numeric' }) || '-';
  } catch {
    return bucket;
  }
};

const buildFinanceTrendSeries = (items = [], mode = 'daily') => {
  const bucketMap = new Map();
  const rows = Array.isArray(items) ? items : [];
  rows.forEach((item) => {
    const rawDate = item?.date || item?.monthKey || '';
    const bucket = mode === 'monthly'
      ? (item?.monthKey || getMonthBucket(rawDate))
      : mode === 'weekly'
        ? getWeekBucket(rawDate)
        : rawDate;
    if (!bucket) return;
    const current = bucketMap.get(bucket) || 0;
    bucketMap.set(bucket, current + toSafeNumber(item?.total));
  });

  const sorted = Array.from(bucketMap.entries())
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
    .map(([bucket, total]) => ({
      bucket,
      label: formatFinanceTrendLabel(bucket, mode),
      total
    }));

  if (mode === 'daily') return sorted.slice(-14);
  if (mode === 'weekly') return sorted.slice(-8);
  return sorted.slice(-6);
};

const buildFinanceFlowTrendSeries = (items = [], mode = 'daily') => {
  const keys = ['income', 'expense', 'net'];
  const seriesByKey = keys.reduce((result, key) => ({
    ...result,
    [key]: buildFinanceTrendSeries(
      (Array.isArray(items) ? items : []).map((item) => ({
        date: item?.date,
        monthKey: item?.monthKey,
        total: toSafeNumber(item?.[key])
      })),
      mode
    )
  }), {});
  const buckets = new Map();
  keys.forEach((key) => {
    seriesByKey[key].forEach((item) => {
      const row = buckets.get(item.bucket) || {
        bucket: item.bucket,
        label: item.label,
        income: 0,
        expense: 0,
        net: 0
      };
      row[key] = toSafeNumber(item.total);
      buckets.set(item.bucket, row);
    });
  });
  return Array.from(buckets.values()).sort((left, right) => String(left.bucket).localeCompare(String(right.bucket)));
};

const buildFinanceMultiLineChart = (series = [], width = 520, height = 220, padding = 20) => {
  if (!Array.isArray(series) || !series.length) {
    return { paths: {}, points: {}, zeroY: height - padding };
  }
  const values = series.flatMap((item) => ['income', 'expense', 'net'].map((key) => toSafeNumber(item?.[key])));
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = Math.max(1, max - min);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const step = series.length > 1 ? innerWidth / (series.length - 1) : 0;
  const toY = (value) => padding + ((max - toSafeNumber(value)) / range) * innerHeight;
  const paths = {};
  const points = {};
  ['income', 'expense', 'net'].forEach((key) => {
    points[key] = series.map((item, index) => ({
      ...item,
      value: toSafeNumber(item?.[key]),
      x: padding + step * index,
      y: toY(item?.[key])
    }));
    paths[key] = points[key]
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' ');
  });
  return { paths, points, zeroY: toY(0) };
};

const escapeCsvValue = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toFileUrl = (fileUrl = '') => {
  if (!fileUrl) return '';
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const normalized = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
  return `${API_BASE || ''}${normalized}`;
};

const extractTemplateVariables = (template = '') => Array.from(new Set(
  Array.from(String(template || '').matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g))
    .map((match) => String(match?.[1] || '').trim())
    .filter(Boolean)
));

const normalizeFinanceRole = (value = '', fallback = '') => {
  const level = String(value || '').trim().toLowerCase();
  if (level === 'finance_manager' || level === 'finance_lead' || level === 'general_president') return level;
  return fallback;
};

const normalizeReceiptStage = (value = '') => {
  const stage = String(value || '').trim();
  if (stage === 'finance_manager_review' || stage === 'finance_lead_review' || stage === 'general_president_review' || stage === 'completed' || stage === 'rejected') {
    return stage;
  }
  return 'finance_manager_review';
};

const normalizeMonthCloseStatus = (value = '') => {
  const status = String(value || '').trim();
  if (status === 'draft' || status === 'pending_review' || status === 'closed' || status === 'reopened' || status === 'rejected') {
    return status;
  }
  return 'draft';
};

const normalizeMonthCloseApprovalStage = (value = '') => {
  const stage = String(value || '').trim();
  if (stage === 'finance_manager_review' || stage === 'finance_lead_review' || stage === 'general_president_review' || stage === 'completed' || stage === 'rejected') {
    return stage;
  }
  return 'draft';
};

const normalizeClassOptions = (refData = {}) => {
  const canonical = Array.isArray(refData?.classes) ? refData.classes : [];
  if (canonical.length) {
    return canonical
      .map((item) => ({
        id: String(item?.classId || item?.id || item?._id || '').trim(),
        classId: String(item?.classId || item?.id || item?._id || '').trim(),
        courseId: String(item?.courseId || item?.legacyCourseId || '').trim(),
        title: String(item?.title || '').trim(),
        uiLabel: String(item?.uiLabel || item?.title || '').trim()
      }))
      .filter((item) => item.classId);
  }

  const legacy = Array.isArray(refData?.courses) ? refData.courses : [];
  return legacy
    .map((item) => ({
      id: String(item?.classId || item?._id || '').trim(),
      classId: String(item?.classId || item?._id || '').trim(),
      courseId: String(item?.legacyCourseId || item?._id || '').trim(),
      title: String(item?.title || '').trim(),
      uiLabel: String(item?.uiLabel || item?.title || '').trim()
    }))
    .filter((item) => item.classId);
};

const normalizeAcademicYearOptions = (refData = {}) => (
  (Array.isArray(refData?.academicYears) ? refData.academicYears : [])
    .map((item) => ({
      id: String(item?._id || item?.id || '').trim(),
      title: String(item?.title || '').trim(),
      code: String(item?.code || '').trim(),
      isActive: item?.isActive === true,
      isCurrent: item?.isCurrent === true,
      status: String(item?.status || '').trim(),
      feeBillingMonths: Array.isArray(item?.feeBillingMonths) && item.feeBillingMonths.length
        ? item.feeBillingMonths.map(Number)
        : [1, 2, 3, 4, 5, 6, 7, 8, 9]
    }))
    .filter((item) => item.id)
);

const getClassOptionLabel = (item = {}) => String(item?.uiLabel || item?.title || '').trim() || 'صنف';
const getStudentOptionLabel = (item = {}) => {
  const asasNumber = String(
    item?.asasNumber
    || item?.admissionNo
    || item?.studentCode
    || ''
  ).trim();

  return (
    [
      item?.fullName
        || item?.name
        || item?.email
        || '',
      asasNumber
        ? `(نمبر اساس: ${asasNumber})`
        : ''
    ]
      .filter(Boolean)
      .join(' ')
      .trim()
    || 'متعلم'
  );
};
const getAcademicYearOptionLabel = (item = {}) => (
  [item?.title, item?.code && item.code !== item.title ? `(${item.code})` : '', item?.isCurrent ? 'جاری' : '']
    .filter(Boolean)
    .join(' ')
    .trim()
);
const AFGHAN_SCHOOL_MONTHS = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];

const getFinanceStudentOptionLabel = (item = {}) => (
  [
    getStudentOptionLabel(item),

    item?.fatherName
      ? `- پدر: ${item.fatherName}`
      : '',

    item?.classTitle
      ? `- ${item.classTitle}`
      : '',

    item?.academicYearTitle
      ? `- ${item.academicYearTitle}`
      : ''
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
);

const getFinanceStudentIdentityRows = (item = {}) => {
  const asasNumber = String(
    item?.asasNumber
    || item?.admissionNo
    || item?.studentCode
    || ''
  ).trim();

  return [
    ['نام پدر', item?.fatherName || '-'],
    ['صنف', item?.classTitle || '-'],
    ['سال تعلیمی', item?.academicYearTitle || '-'],
    ['نمبر اساس', asasNumber || 'ثبت نشده']
  ];
};

const CURRENT_FINANCE_MEMBERSHIP_STATUSES = new Set(['active', 'pending', 'suspended', 'transferred_in']);

const toFinanceOptionId = (value = '') => String(value?._id || value || '').trim();

const isCurrentFinanceMembership = (item = {}) => {
  if (item?.isCurrent === false) return false;
  if (item?.endDate || item?.endedAt || item?.leftAt) return false;
  const status = String(item?.status || 'active').trim();
  return !status || CURRENT_FINANCE_MEMBERSHIP_STATUSES.has(status);
};

const buildFinanceMembershipStudentOptions = (items = []) => {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .filter(isCurrentFinanceMembership)
    .map((item) => {
      const studentCoreId = toFinanceOptionId(item?.studentCoreId);
      const userId = toFinanceOptionId(item?.studentId || item?.student?._id) || studentCoreId;
      const classId = toFinanceOptionId(item?.classId);
      const academicYearId = toFinanceOptionId(item?.academicYearId || item?.academicYear);
      const asasNumber = String( item?.asasNumber  || item?.admissionNo  || item?.studentCode  || '' ).trim();
      return {
        _id: userId,
        membershipId: toFinanceOptionId(item?._id || item?.id),
        studentCoreId,
        name: item?.studentName || item?.student?.name || item?.fullName || '',
        fullName: item?.studentName || item?.student?.name || item?.fullName || '',
        email: item?.studentEmail || item?.student?.email || '',
        asasNumber, admissionNo: asasNumber,
        fatherName: item?.fatherName || '',
        phone: item?.primaryPhone || '',
        classId,
        classTitle: item?.classTitle || item?.class?.title || item?.schoolClass?.title || '',
        academicYearId,
        academicYearTitle: item?.academicYearTitle || item?.academicYear?.title || ''
      };
    })
    .filter((item) => item._id)
    .filter((item) => {
      const key = item._id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const countFinanceMembershipStudents = (items = []) => {
  const seen = new Set();
  (Array.isArray(items) ? items : [])
    .filter(isCurrentFinanceMembership)
    .forEach((item, index) => {
      const key = toFinanceOptionId(
        item?.studentId
        || item?.student?._id
        || item?.student
        || item?.studentCoreId
        || item?.afghanStudentId
        || item?.membershipId
        || item?._id
        || item?.id
        || `membership-${index}`
      );
      if (key) seen.add(key);
    });
  return seen.size;
};

const RECEIPT_STAGE_LABELS = {
  finance_manager_review: 'در انتظار مدیر مالی',
  finance_lead_review: 'مرحله قدیمی آمریت مالی',
  general_president_review: 'در انتظار ریاست عمومی',
  completed: 'تایید نهایی',
  rejected: 'رد شده'
};

const ADMIN_LEVEL_LABELS = {
  finance_manager: 'مدیر مالی',
  finance_lead: 'آمریت مالی',
  general_president: 'ریاست عمومی'
};

const DISCOUNT_TYPE_LABELS = {
  discount: 'تخفیف',
  waiver: 'معافیت مبلغی',
  penalty: 'جریمه/افزایش',
  manual: 'ثبت دستی'
};

const EXEMPTION_TYPE_LABELS = {
  full: 'معافیت کامل',
  partial: 'معافیت جزئی'
};

const EXEMPTION_SCOPE_LABELS = {
  all: 'همه موارد',
  tuition: 'فیس/شهریه',
  admission: 'داخله',
  exam: 'امتحان',
  transport: 'ترانسپورت',
  document: 'اسناد',
  service: 'خدمت',
  other: 'سایر'
};

const FEE_PLAN_TYPE_LABELS = {
  standard: 'عادی',
  charity: 'خیریه',
  sibling: 'خواهر / برادر',
  scholarship: 'بورسیه',
  special: 'ویژه',
  semi_annual: 'نیم‌ساله'
};

const FEE_PLAN_FREQUENCY_LABELS = {
  term: 'ترمی',
  monthly: 'ماهانه',
  annual: 'سالانه',
  custom: 'سفارشی'
};

const FEE_PLAN_LIFECYCLE_LABELS = {
  active: 'فعال',
  inactive: 'غیرفعال',
  archived: 'آرشیف'
};

const getStudentDisplayName = (student = {}) => (
  String(student?.fullName || student?.name || student?.email || '').trim() || 'متعلم'
);

const RECEIPT_STAGE_UI_LABELS = {
  finance_manager_review: 'در انتظار مدیر مالی',
  finance_lead_review: 'مرحله قدیمی آمریت مالی',
  general_president_review: 'در انتظار ریاست عمومی',
  completed: 'تایید نهایی',
  rejected: 'رد شده'
};

const ADMIN_LEVEL_UI_LABELS = {
  finance_manager: 'مدیر مالی',
  finance_lead: 'آمریت مالی',
  general_president: 'ریاست عمومی'
};

const MONTH_CLOSE_STAGE_UI_LABELS = {
  draft: 'پیش‌نویس',
  finance_manager_review: 'در انتظار مدیر مالی',
  finance_lead_review: 'در انتظار آمریت مالی',
  general_president_review: 'در انتظار ریاست عمومی',
  completed: 'تایید نهایی',
  rejected: 'رد شده'
};

const MONTH_CLOSE_STATUS_UI_LABELS = {
  draft: 'پیش‌نویس',
  pending_review: 'در جریان تایید',
  closed: 'بسته',
  reopened: 'بازگشایی شده',
  rejected: 'برگشت شده'
};

const PAYMENT_STATUS_UI_LABELS = {
  pending: 'در انتظار',
  approved: 'تاییدشده',
  rejected: 'ردشده'
};

const PAYMENT_SOURCE_UI_LABELS = {
  legacy_receipt: 'رسید legacy',
  guardian_upload: 'ارسال ولی/متعلم',
  cashier_manual: 'ثبت صندوق',
  gateway: 'درگاه آنلاین',
  migration: 'مهاجرت',
  canonical_manual: 'پرداخت canonical'
};

const FOLLOW_UP_LEVEL_OPTIONS = [
  { value: 'finance_manager', label: 'مدیر مالی' },
  { value: 'general_president', label: 'ریاست عمومی' }
];

const FOLLOW_UP_STATUS_OPTIONS = [
  { value: 'new', label: 'جدید' },
  { value: 'in_progress', label: 'در حال پیگیری' },
  { value: 'on_hold', label: 'در انتظار' },
  { value: 'escalated', label: 'ارجاع شده' },
  { value: 'resolved', label: 'تکمیل شده' }
];

const FOLLOW_UP_LEVEL_LABELS = Object.fromEntries(FOLLOW_UP_LEVEL_OPTIONS.map((item) => [item.value, item.label]));
const FOLLOW_UP_STATUS_LABELS = Object.fromEntries(FOLLOW_UP_STATUS_OPTIONS.map((item) => [item.value, item.label]));

const canReviewMonthCloseForRole = (role = '', stage = '') => {
  const normalizedRole = normalizeFinanceRole(role, '');
  const normalizedStage = normalizeMonthCloseApprovalStage(stage);
  if (normalizedStage !== 'finance_manager_review' && normalizedStage !== 'finance_lead_review' && normalizedStage !== 'general_president_review') {
    return false;
  }
  if (normalizedRole === 'general_president') return true;
  if (normalizedRole === 'finance_lead') return normalizedStage === 'finance_lead_review';
  return normalizedRole === 'finance_manager' && normalizedStage === 'finance_manager_review';
};

const getStageDefaultLevel = (stage = '') => {
  const normalized = String(stage || '').trim();
  if (normalized === 'finance_lead_review') return 'finance_lead';
  if (normalized === 'general_president_review') return 'general_president';
  return 'finance_manager';
};

const getReceiptFollowUpStatus = (item = {}) => (
  String(item?.followUp?.status || '').trim()
  || (String(item?.status || '').trim() === 'pending' ? 'new' : 'resolved')
);

const getPaymentSourceKey = ({ payment = {}, receipt = null, legacyReceiptId = '' } = {}) => {
  if (legacyReceiptId) return 'legacy_receipt';
  const source = String(payment?.source || '').trim();
  const hasFile = Boolean(String(receipt?.fileUrl || payment?.fileUrl || '').trim());
  const hasReceiver = Boolean(payment?.receivedBy);
  if (source === 'gateway') return 'gateway';
  if (source === 'migration') return 'migration';
  if (hasFile && !hasReceiver) return 'guardian_upload';
  if (hasReceiver) return 'cashier_manual';
  return 'canonical_manual';
};

const DISCOUNT_TYPE_UI_LABELS = {
  discount: 'تخفیف',
  waiver: 'معافیت مبلغی',
  penalty: 'جریمه یا افزایش',
  manual: 'ثبت دستی'
};

const EXEMPTION_TYPE_UI_LABELS = {
  full: 'معافیت کامل',
  partial: 'معافیت جزئی'
};

const EXEMPTION_SCOPE_UI_LABELS = {
  all: 'همه موارد',
  tuition: 'فیس/شهریه',
  admission: 'داخله',
  exam: 'امتحان',
  transport: 'ترانسپورت',
  document: 'اسناد',
  other: 'سایر'
};

const RELIEF_TYPE_UI_LABELS = {
  discount: 'تخفیف',
  waiver: 'معافیت مبلغی',
  penalty: 'جریمه',
  manual: 'تسهیل دستی',
  free_student: 'رایگان کامل',
  scholarship_partial: 'بورسیه جزئی',
  scholarship_full: 'بورسیه کامل',
  charity_support: 'حمایت خیریه',
  sibling_discount: 'تخفیف خواهر / برادر'
};

const RELIEF_COVERAGE_MODE_UI_LABELS = {
  fixed: 'مبلغ ثابت',
  percent: 'درصدی',
  full: 'پوشش کامل'
};

const PAYMENT_METHOD_UI_LABELS = {
  cash: 'نقدی',
  bank_transfer: 'انتقال بانکی',
  hawala: 'حواله',
  manual: 'ثبت دستی',
  gateway: 'درگاه',
  other: 'سایر'
};

// Pure, React-free: builds the receipt print model straight from a receipt record. Previously this
// lived only inside a useMemo keyed on component state, which meant printing had to wait for a
// React re-render (and for the sheet built from it to mount, keep its data frozen against
// concurrent refreshes, load its fonts, etc.) before anything could be printed - a whole chain of
// timing that kept producing a blank page in production for reasons that were fixed one at a time
// (see #51-#57) without ever fully landing. buildReceiptPrintHtml below uses this to generate a
// standalone print document directly from data, sidestepping that chain entirely.
const buildReceiptPrintModel = (receipt) => {
  if (!receipt) return null;
  const details = receipt.receiptDetails || {};
  const allocations = Array.isArray(details.allocations) && details.allocations.length
    ? details.allocations
    : (Array.isArray(receipt.allocations) ? receipt.allocations : []);
  const isMultiBill = allocations.length > 1;
  const billNumber = (isMultiBill ? (details.paymentNumber || receipt.paymentNumber || receipt.id) : '')
    || details.billNumber
    || receipt.bill?.billNumber
    || allocations.find((item) => item?.orderNumber)?.orderNumber
    || receipt.paymentNumber
    || receipt.id
    || '';
  const purpose = (isMultiBill ? `پرداخت یک‌جای ${allocations.length} بل فیس` : details.title)
    || allocations[0]?.title
    || 'پرداخت فیس';
  const toOptionalAmount = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
  };
  return {
    title: details.title || receipt.bill?.billNumber || 'رسید مالی',
    billNumber: toEnglishAlphaNumeric(billNumber),
    purpose,
    paymentNumber: formatFinanceCode(details.paymentNumber || receipt.id, ''),
    studentName: details.studentName || receipt.student?.fullName || receipt.student?.name || '---',
    fatherName: details.fatherName || receipt.student?.fatherName || 'ثبت نشده',
    asasNumber: String(
      details.asasNumber
      || details.admissionNo
      || receipt.student?.asasNumber
      || receipt.student?.admissionNo
      || receipt.student?.studentCode
      || ''
    ).trim() || 'ثبت نشده',
    classTitle: details.classTitle || receipt.classId?.title || receipt.course?.title || '---',
    academicYearTitle: details.academicYearTitle
      || receipt.academicYear?.title
      || '-',
    amount: Number(receipt.amount || 0),
    grossAmount: toOptionalAmount(details.grossAmount ?? receipt.bill?.amountOriginal),
    discountAmount: toOptionalAmount(details.discountAmount),
    netAmount: toOptionalAmount(details.netAmount ?? receipt.bill?.amountDue),
    currency: details.currency || 'AFN',
    currencyLabel: String(details.currency || 'AFN').trim().toUpperCase() === 'AFN' ? 'افغانی' : details.currency,
    paymentMethod: receipt.paymentMethod || '-',
    referenceNo: receipt.referenceNo || '-',
    status: receipt.status || 'pending',
    paidAt: receipt.paidAt || null,
    note: receipt.note || '',
    receivedBy: receipt.receivedBy?.name || 'ثبت سیستمی',
    remainingBeforePayment: toOptionalAmount(details.remainingBeforePayment),
    remainingAfterPayment: toOptionalAmount(details.remainingAfterPayment),
    currentOutstandingAmount: toOptionalAmount(
      details.currentOutstandingAmount
      ?? (allocations.length
        ? allocations.reduce((sum, allocation) => sum + Number(allocation?.outstandingAmount || 0), 0)
        : details.remainingAfterPayment)
    ),
    allocations,
    isMultiBill
  };
};

const FEE_LINE_TYPE_LABELS = {
  tuition: 'فیس/شهریه',
  admission: 'داخله',
  transport: 'ترانسپورت',
  exam: 'امتحان',
  document: 'اسناد',
  service: 'خدمت',
  other: 'سایر',
  penalty: 'جریمه'
};

const FEE_PLAN_LINE_CONFIG = [
  { key: 'tuitionFee', label: 'فیس/شهریه', cadence: 'دوره‌ای', required: true },
  { key: 'admissionFee', label: 'داخله', cadence: 'یک‌بار', required: false },
  { key: 'examFee', label: 'فیس امتحان', cadence: 'ترمی', required: false },
  { key: 'documentFee', label: 'فیس اسناد', cadence: 'در صورت نیاز', required: false },
  { key: 'transportDefaultFee', label: 'ترانسپورت', cadence: 'دوره‌ای', required: false },
  { key: 'otherFee', label: 'سایر', cadence: 'سفارشی', required: false }
];

const MANUAL_BILL_FEE_TYPES = ['tuition', 'admission', 'transport', 'exam', 'document', 'other'];
const MANUAL_BILL_PLAN_FIELDS = {
  tuition: 'tuitionFee',
  admission: 'admissionFee',
  transport: 'transportDefaultFee',
  exam: 'examFee',
  document: 'documentFee',
  other: 'otherFee'
};

const AUDIT_KIND_UI_LABELS = {
  order: 'بل و بدهی',
  payment: 'پرداخت',
  relief: 'تسهیل مالی',
  system: 'کنترل و سیستم'
};

const AUDIT_SEVERITY_UI_LABELS = {
  info: 'اطلاع',
  warning: 'هشدار',
  critical: 'حساس'
};

const FINANCE_ANOMALY_UI_LABELS = {
  overpayment: 'بیش‌پرداخت',
  full_relief_with_open_balance: 'بل باز با تسهیل کامل',
  relief_expiring: 'تسهیل رو به ختم',
  long_overdue_balance: 'سررسید گذشته بیش از سه ماه',
  pending_payment_stalled: 'پرداخت معطل در بررسی',
  admission_missing: 'بل داخله صادر نشده',
  planned_fee_missing: 'بل فیس صادر نشده',
  duplicate_fee_bill: 'بل تکراری',
  fee_underbilled: 'مبلغ کمتر از پلان',
  payment_after_membership_end: 'پرداخت بعد از ختم عضویت'
};

const FINANCE_REFUND_REASON_LABELS = {
  membership_ended: 'ختم عضویت',
  overpayment: 'بیش‌پرداخت',
  billing_error: 'اشتباه در بل',
  other: 'سایر'
};

const FINANCE_REFUND_STATUS_LABELS = {
  pending_review: 'در انتظار بررسی',
  approved: 'تاییدشده',
  rejected: 'ردشده',
  paid: 'پرداخت‌شده'
};

const FINANCE_REFUND_METHOD_LABELS = {
  cash: 'نقدی',
  bank_transfer: 'حواله بانکی',
  hawala: 'حواله سنتی',
  credit_next_bill: 'اعتبار برای بل بعدی',
  other: 'سایر'
};

const FINANCE_ANOMALY_WORKFLOW_LABELS = {
  open: 'باز',
  assigned: 'ارجاع‌شده',
  snoozed: 'معطل',
  resolved: 'حل‌شده'
};

const DOCUMENT_ARCHIVE_TYPE_LABELS = {
  student_statement: 'استیتمنت متعلم',
  parent_statement: 'استیتمنت ولی/سرپرست',
  month_close_pack: 'بسته بستن ماه',
  batch_statement_pack: 'بسته گروهی استیتمنت'
};

const DELIVERY_CAMPAIGN_STATUS_LABELS = {
  active: 'فعال',
  paused: 'متوقف'
};

const DELIVERY_CAMPAIGN_RUN_STATUS_LABELS = {
  idle: 'بدون اجرا',
  success: 'موفق',
  partial: 'نیمه‌موفق',
  failed: 'ناموفق',
  skipped: 'بدون مورد'
};

const DELIVERY_CHANNEL_LABELS = {
  email: 'ایمیل',
  portal: 'پرتال',
  sms: 'SMS',
  whatsapp: 'WhatsApp'
};

const DELIVERY_EVENT_STATUS_LABELS = {
  sent: 'ارسال شد',
  resent: 'ارسال مجدد',
  delivered: 'تحویل شد',
  failed: 'ناموفق'
};

const DELIVERY_LIVE_STATUS_LABELS = {
  queued: 'در صف',
  accepted: 'پذیرفته‌شده',
  sent: 'ارسال‌شده',
  delivered: 'تحویل‌شده',
  read: 'دیده‌شده',
  failed: 'ناموفق',
  skipped: 'رد شد',
  unknown: 'نامشخص'
};

const DELIVERY_LIVE_STATUS_CHIP_CLASS = {
  queued: 'finance-chip finance-chip-muted',
  accepted: 'finance-chip finance-chip-amber',
  sent: 'finance-chip finance-chip-amber',
  delivered: 'finance-chip finance-chip-emerald',
  read: 'finance-chip finance-chip-sky',
  failed: 'finance-chip finance-chip-rose',
  skipped: 'finance-chip finance-chip-muted',
  unknown: 'finance-chip finance-chip-muted'
};

const DELIVERY_RECOVERY_STATE_LABELS = {
  awaiting_callback: 'در انتظار callback',
  retry_ready: 'آماده recovery',
  retry_waiting: 'در انتظار retry',
  provider_failed: 'ناموفق نزد provider',
  status_unknown: 'وضعیت نامشخص'
};

const normalizeDeliveryLiveStage = ({ providerStatus = '', status = '', failureCode = '', errorMessage = '' } = {}) => {
  const normalizedProviderStatus = String(providerStatus || '').trim().toLowerCase();
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedFailureCode = String(failureCode || '').trim().toLowerCase();
  const normalizedError = String(errorMessage || '').trim().toLowerCase();

  if (['read', 'seen'].includes(normalizedProviderStatus)) return 'read';
  if (['delivered', 'delivery_confirmed', 'completed', 'complete'].includes(normalizedProviderStatus)) return 'delivered';
  if (['failed', 'undelivered', 'rejected', 'expired', 'cancelled', 'canceled', 'error', 'timeout', 'bounced'].includes(normalizedProviderStatus)) return 'failed';
  if (['accepted', 'submitted', 'received'].includes(normalizedProviderStatus)) return 'accepted';
  if (['queued', 'pending', 'scheduled'].includes(normalizedProviderStatus)) return 'queued';
  if (['sent', 'resent', 'dispatched', 'dispatching', 'in_transit'].includes(normalizedProviderStatus)) return 'sent';

  if (normalizedStatus === 'delivered') return 'delivered';
  if (normalizedStatus === 'failed') return 'failed';
  if (['sent', 'resent'].includes(normalizedStatus)) return 'sent';
  if (normalizedStatus === 'skipped') return 'skipped';
  if (normalizedFailureCode || normalizedError) return 'failed';
  return normalizedProviderStatus || normalizedStatus || 'unknown';
};

const buildDeliveryLiveStatus = (value = {}) => {
  const stage = String(value?.stage || '').trim().toLowerCase() || normalizeDeliveryLiveStage(value);
  return {
    stage,
    providerStatus: String(value?.providerStatus || '').trim(),
    deliveryStatus: String(value?.status || value?.deliveryStatus || '').trim(),
    provider: String(value?.provider || '').trim(),
    providerMessageId: String(value?.providerMessageId || '').trim(),
    channel: String(value?.channel || '').trim(),
    failureCode: String(value?.failureCode || value?.lastFailureCode || '').trim(),
    errorMessage: String(value?.errorMessage || value?.lastError || '').trim(),
    retryable: value?.retryable === true,
    nextRetryAt: value?.nextRetryAt || null,
    occurredAt: value?.occurredAt || value?.lastDeliveredAt || value?.lastAttemptAt || value?.sentAt || null
  };
};

const buildDeliveryLiveSummary = (items = [], fallbackItem = null) => {
  if (fallbackItem?.liveStatusSummary) {
    return {
      ...fallbackItem.liveStatusSummary,
      latest: fallbackItem.liveStatus ? buildDeliveryLiveStatus(fallbackItem.liveStatus) : buildDeliveryLiveStatus(fallbackItem.liveStatusSummary.latest || {})
    };
  }
  const statuses = (Array.isArray(items) ? items : [])
    .map((item) => buildDeliveryLiveStatus(item?.liveStatus || item))
    .filter(Boolean);
  const counts = statuses.reduce((acc, item) => {
    const key = String(item?.stage || '').trim().toLowerCase();
    if (!key) return acc;
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
  const latest = statuses.reduce((current, item) => {
    if (!current) return item;
    const currentTime = current?.occurredAt ? new Date(current.occurredAt).getTime() : 0;
    const nextTime = item?.occurredAt ? new Date(item.occurredAt).getTime() : 0;
    return nextTime >= currentTime ? item : current;
  }, fallbackItem?.liveStatus ? buildDeliveryLiveStatus(fallbackItem.liveStatus) : null);
  return {
    total: statuses.length,
    counts,
    latest,
    inFlight: Number(counts.queued || 0) + Number(counts.accepted || 0) + Number(counts.sent || 0),
    successful: Number(counts.delivered || 0) + Number(counts.read || 0),
    failed: Number(counts.failed || 0),
    read: Number(counts.read || 0)
  };
};

const DELIVERY_TEMPLATE_VERSION_STATUS_LABELS = {
  draft: 'پیش‌نویس',
  published: 'منتشرشده',
  archived: 'آرشیف'
};

const DELIVERY_TEMPLATE_HISTORY_ACTION_LABELS = {
  draft_saved: 'ذخیره پیش‌نویس',
  published: 'انتشار',
  archived: 'آرشیف',
  rolled_back: 'بازگشت به نسخه'
};

const DELIVERY_TEMPLATE_APPROVAL_STAGE_LABELS = {
  draft: 'پیش‌نویس',
  pending_review: 'در بازبینی',
  approved: 'تاییدشده',
  rejected: 'ردشده'
};
DELIVERY_TEMPLATE_HISTORY_ACTION_LABELS.review_requested = 'ارسال برای بازبینی';
DELIVERY_TEMPLATE_HISTORY_ACTION_LABELS.approved = 'تایید نسخه';
DELIVERY_TEMPLATE_HISTORY_ACTION_LABELS.rejected = 'رد نسخه';

const DELIVERY_CHANNEL_INPUT_LABELS = {
  email: 'ایمیل‌های مقصد',
  portal: 'audience مرتبط',
  sms: 'شماره‌های SMS',
  whatsapp: 'شماره‌های WhatsApp'
};

const DELIVERY_CHANNEL_INPUT_PLACEHOLDERS = {
  email: 'family@example.com, admin@example.com',
  portal: 'برای پرتال از audience مرتبط متعلم استفاده می‌شود',
  sms: '+93700111222, +93700999888',
  whatsapp: '+93700111222, +93700999888'
};

const DELIVERY_PROVIDER_MODE_LABELS = {
  mock: 'دروازه شبیه‌سازی',
  webhook: 'Webhook عمومی',
  twilio: 'Twilio',
  meta: 'Meta واتساپ'
};

const DELIVERY_PROVIDER_REQUIRED_FIELD_LABELS = {
  mode: 'حالت',
  provider: 'نام Provider',
  isActive: 'فعال',
  webhookUrl: 'آدرس Webhook',
  statusWebhookUrl: 'آدرس callback وضعیت',
  accountSid: 'شناسه حساب (Account SID)',
  authToken: 'رمز احراز هویت (Auth Token)',
  fromHandle: 'شناسه فرستنده',
  apiBaseUrl: 'آدرس API',
  accessToken: 'رمز دسترسی (Access Token)',
  phoneNumberId: 'شناسه شماره (Phone Number ID)',
  webhookToken: 'Webhook Token',
  note: 'یادداشت'
};

const DELIVERY_PROVIDER_AUDIT_ACTION_LABELS = {
  created: 'ایجاد تنظیمات',
  config_saved: 'ذخیره تنظیمات',
  credentials_rotated: 'چرخش credential',
  secrets_cleared: 'پاک‌سازی credential'
};

const DELIVERY_PROVIDER_CHANNEL_MODE_OPTIONS = {
  sms: ['mock', 'webhook', 'twilio'],
  whatsapp: ['mock', 'webhook', 'twilio', 'meta']
};

const buildDeliveryProviderForm = (item = null, fallbackChannel = 'sms') => ({
  channel: String(item?.channel || fallbackChannel || 'sms').trim() || 'sms',
  mode: String(item?.mode || 'webhook').trim() || 'webhook',
  provider: String(item?.provider || '').trim(),
  isActive: item?.isActive !== false,
  webhookUrl: String(item?.webhookUrl || '').trim(),
  statusWebhookUrl: String(item?.statusWebhookUrl || '').trim(),
  fromHandle: String(item?.fromHandle || '').trim(),
  apiBaseUrl: String(item?.apiBaseUrl || '').trim(),
  accountSid: '',
  authToken: '',
  accessToken: '',
  phoneNumberId: '',
  webhookToken: '',
  note: String(item?.note || '').trim(),
  rotationNote: ''
});

const sortCountEntries = (value = {}) => (
  Object.entries(value || {})
    .filter(([key, count]) => String(key || '').trim() && Number(count || 0) > 0)
    .sort((left, right) => Number(right?.[1] || 0) - Number(left?.[1] || 0))
);

const FINANCE_SECTION_LABELS = {
  overview: 'داشبورد',
  payments: 'پرداخت‌ها',
  orders: 'بل‌ها و تعهدات',
  expenses: 'مصارف',
  discounts: 'تخفیف و معافیت',
  anomalies: 'ناهنجاری‌ها',
  reports: 'گزارش‌ها',
  settings: 'تنظیمات و پلان مالی'
};

const FINANCE_SECTION_DESCRIPTIONS = {
  overview: 'نمای کلان از وصول، بدهی‌های سررسید گذشته، صندوق و وضعیت عملیات مالی.',
  payments: 'ثبت پرداخت، بررسی رسیدها و مدیریت صندوق روزانه.',
  orders: 'صدور بل، بازبینی بدهی‌ها و مدیریت تعهدات مالی متعلمین.',
  expenses: 'ثبت، بررسی، تایید و باطل‌سازی مصارف مکتب - سازمان‌یافته بر اساس ماه.',
  discounts: 'تخفیف‌ها، معافیت‌ها و رجیستر مزایای مالی متعلمین.',
  anomalies: 'کنترل هوشمند مغایرت‌ها؛ بل صادرنشده، بل تکراری، مبلغ کمتر از پلان و هشدارهای نیازمند اقدام.',
  reports: 'گزارش‌های تحلیلی، کاش‌فلو، بدهکاران و خروجی مدیریتی.',
  settings: 'پلان فیس، بستن ماه مالی، یادآوری و پیوند به فرماندهی دولت.'
};

const EXPENSE_STATUS_LABELS = {
  draft: 'پیش‌نویس',
  pending_review: 'در انتظار بررسی',
  approved: 'تاییدشده',
  rejected: 'ردشده',
  void: 'باطل'
};

const EXPENSE_STAGE_LABELS = {
  draft: 'پیش‌نویس',
  finance_manager_review: 'بررسی مدیر مالی',
  finance_lead_review: 'بررسی آمریت مالی',
  general_president_review: 'بررسی ریاست عمومی',
  completed: 'تکمیل‌شده',
  rejected: 'ردشده',
  void: 'باطل'
};

const EXPENSE_PAYMENT_METHOD_LABELS = {
  cash: 'نقدی',
  bank_transfer: 'حواله بانکی',
  hawala: 'حواله سنتی',
  manual: 'دستی',
  other: 'سایر'
};

const OPEN_ORDER_STATUSES = new Set(['new', 'partial', 'overdue']);
const ORDER_STATUS_UI_LABELS = {
  new: 'پرداخت نشده',
  pending: 'در انتظار پرداخت',
  partial: 'پرداخت ناقص',
  paid: 'پرداخت‌شده',
  waived: 'معاف/پوشش کامل',
  overdue: 'سررسید گذشته',
  void: 'باطل'
};

const getFinanceRecordStudentUserId = (item = {}) => (
  String(item?.student?.userId || item?.student?._id || item?.student?.id || '').trim()
);

const getFinanceRecordClassId = (item = {}) => (
  String(item?.schoolClass?.id || item?.classId?._id || item?.classId?.id || item?.classId || '').trim()
);

const getFinanceRecordAcademicYearId = (item = {}) => (
  String(item?.academicYear?.id || item?.academicYearId?.id || item?.academicYearId || '').trim()
);

const getFinanceBillMonthLabel = (item = {}) => {
  const explicitLabel = String(item?.periodLabel || '').trim();
  if (explicitLabel) return explicitLabel;
  if (item?.periodType === 'monthly' && item?.dueDate) return toFaMonthKey(getMonthBucket(item.dueDate));
  if (item?.dueDate) return toFaDate(item.dueDate);
  return item?.title || formatFinanceCode(item?.billNumber, 'باقیات');
};

const getFinanceBillMonthFilterKey = (item = {}) => {
  const explicitKey = String(item?.monthKey || item?.billingMonth || '').trim().replace('/', '-');
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(explicitKey)) return explicitKey;

  // Prefer deriving the key from the actual due/issue date (converted to the
  // Afghan solar calendar) whenever one is available. This keeps bills that
  // share the same real month on one canonical "YYYY-MM" key regardless of
  // whether they went through the periodLabel text path or not — previously
  // this branch only ran as a last resort and used the *Gregorian* calendar,
  // which could silently produce a second, differently-formatted key for the
  // same Afghan month (e.g. one bill keyed "period:اسد 1405" via periodLabel
  // and another keyed "2026-07" via the Gregorian due date), causing the
  // month filter dropdown to show duplicate entries for the same month.
  const dateBucket = getAfghanMonthBucket(item?.dueDate || item?.issuedAt);
  if (dateBucket) return dateBucket;

  const periodLabel = String(item?.periodLabel || '').trim();
  const periodMatches = [...periodLabel.matchAll(/(?:^|\D)((?:13|14|20)\d{2})[-/](0?[1-9]|1[0-2])(?=\D|$)/g)];
  if (periodMatches.length) {
    const [, year, month] = periodMatches[periodMatches.length - 1];
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  if (String(item?.periodType || '').trim() === 'monthly' && periodLabel) {
    return `period:${normalizeFinanceSearchTerm(periodLabel)}`;
  }

  return '';
};

const formatFinanceBillMonthFilterLabel = (key = '', item = {}) => {
  const normalizedKey = String(key || '').trim();
  const numericMatch = normalizedKey.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (numericMatch) {
    const year = Number(numericMatch[1]);
    const monthIndex = Number(numericMatch[2]) - 1;
    if (year >= 1300 && year <= 1499) {
      return `${AFGHAN_SCHOOL_MONTHS[monthIndex] || numericMatch[2]} ${year.toLocaleString('fa-AF', { useGrouping: false })}`;
    }
    return toFaMonthKey(normalizedKey) || normalizedKey;
  }
  return String(item?.periodLabel || '').trim() || normalizedKey.replace(/^period:/, '') || 'ماه نامشخص';
};

const getArrearsTimingLabel = (dueDate = '') => {
  const due = dueDate ? new Date(dueDate) : null;
  if (!due || Number.isNaN(due.getTime())) return 'بدون تاریخ سررسید';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay < today) return 'سررسید گذشته';
  if (due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth()) return 'ماه جاری';
  return 'آینده';
};

const buildFinanceItemsByStudentMap = (items = []) => {
  const grouped = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const studentUserId = getFinanceRecordStudentUserId(item);
    if (!studentUserId) return;
    const existing = grouped.get(studentUserId);
    if (existing) {
      existing.push(item);
      return;
    }
    grouped.set(studentUserId, [item]);
  });
  return grouped;
};

const matchesFinanceScope = (item = {}, scope = {}) => {
  const studentId = String(scope?.studentId || '').trim();
  const classId = String(scope?.classId || '').trim();
  const academicYearId = String(scope?.academicYearId || '').trim();
  if (studentId && getFinanceRecordStudentUserId(item) !== studentId) return false;
  if (classId && getFinanceRecordClassId(item) !== classId) return false;
  if (academicYearId && getFinanceRecordAcademicYearId(item) !== academicYearId) return false;
  return true;
};

const getBillFeeScopeSummary = (bill = {}, feeType = 'tuition') => {
  const normalizedFeeType = String(feeType || 'tuition').trim();
  const scopedLines = (Array.isArray(bill?.lineItems) ? bill.lineItems : [])
    .filter((item) => String(item?.feeType || '').trim() === normalizedFeeType);
  if (scopedLines.length) {
    return scopedLines.reduce((summary, item) => ({
      gross: summary.gross + toSafeNumber(item?.grossAmount ?? item?.netAmount),
      discount: summary.discount + toSafeNumber(item?.reductionAmount),
      penalty: summary.penalty + toSafeNumber(item?.penaltyAmount),
      net: summary.net + toSafeNumber(item?.netAmount),
      due: summary.due + toSafeNumber(item?.netAmount),
      paid: summary.paid + toSafeNumber(item?.paidAmount),
      outstanding: summary.outstanding + Math.max(0, toSafeNumber(
        item?.balanceAmount ?? (toSafeNumber(item?.netAmount) - toSafeNumber(item?.paidAmount))
      ))
    }), { gross: 0, discount: 0, penalty: 0, net: 0, due: 0, paid: 0, outstanding: 0 });
  }
  const breakdownDue = Math.max(0, toSafeNumber(bill?.feeBreakdown?.[normalizedFeeType]));
  const scopedPayment = Math.max(0, toSafeNumber(bill?.paymentBreakdown?.[normalizedFeeType]));
  const feeScopes = Array.isArray(bill?.feeScopes)
    ? bill.feeScopes.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (breakdownDue > 0 || feeScopes.includes(normalizedFeeType)) {
    const paid = scopedPayment > 0
      ? scopedPayment
      : feeScopes.length === 1
        ? toSafeNumber(bill?.amountPaid)
        : 0;
    const net = breakdownDue || toSafeNumber(bill?.amountDue);
    const gross = feeScopes.length === 1
      ? Math.max(net, toSafeNumber(bill?.amountOriginal))
      : net;
    return {
      gross,
      discount: Math.max(0, gross - net),
      penalty: 0,
      net,
      due: net,
      paid,
      outstanding: Math.max(0, net - paid)
    };
  }
  if (String(bill?.orderType || '').trim() !== normalizedFeeType) {
    return { gross: 0, discount: 0, penalty: 0, net: 0, due: 0, paid: 0, outstanding: 0 };
  }
  const net = toSafeNumber(bill?.amountDue);
  const gross = Math.max(net, toSafeNumber(bill?.amountOriginal));
  return {
    gross,
    discount: Math.max(0, gross - net),
    penalty: 0,
    net,
    due: net,
    paid: toSafeNumber(bill?.amountPaid),
    outstanding: Math.max(0, toSafeNumber(
      bill?.outstandingAmount ?? (toSafeNumber(bill?.amountDue) - toSafeNumber(bill?.amountPaid))
    ))
  };
};

const buildStudentFinanceSnapshot = ({ bills = [], reliefs = [], studentId = '', classId = '', academicYearId = '' } = {}) => {
  const scopedBills = (Array.isArray(bills) ? bills : []).filter((item) => (
    String(item?.status || '').trim() !== 'void'
    && matchesFinanceScope(item, { studentId, classId, academicYearId })
  ));
  const scopedReliefs = (Array.isArray(reliefs) ? reliefs : [])
    .filter((item) => matchesFinanceScope(item, { studentId, classId, academicYearId }))
    .sort((left, right) => new Date(right?.createdAt || right?.startDate || 0).getTime() - new Date(left?.createdAt || left?.startDate || 0).getTime());
  const totalDue = scopedBills.reduce((sum, item) => sum + toSafeNumber(item?.amountDue), 0);
  const totalPaid = scopedBills.reduce((sum, item) => sum + toSafeNumber(item?.amountPaid), 0);
  const outstanding = scopedBills.reduce((sum, item) => sum + toSafeNumber(item?.outstandingAmount), 0);
  const byFeeType = ['tuition', 'admission', 'transport', 'exam', 'document', 'service', 'other'].reduce((acc, feeType) => {
    acc[feeType] = scopedBills.reduce((summary, bill) => {
      const scoped = getBillFeeScopeSummary(bill, feeType);
      return {
        gross: summary.gross + scoped.gross,
        discount: summary.discount + scoped.discount,
        penalty: summary.penalty + scoped.penalty,
        net: summary.net + scoped.net,
        due: summary.due + scoped.due,
        paid: summary.paid + scoped.paid,
        outstanding: summary.outstanding + scoped.outstanding
      };
    }, { gross: 0, discount: 0, penalty: 0, net: 0, due: 0, paid: 0, outstanding: 0 });
    return acc;
  }, {});
  const openOrders = scopedBills.filter((item) => OPEN_ORDER_STATUSES.has(String(item?.status || '').trim()));
  const fixedReliefAmount = scopedReliefs.reduce((sum, item) => (
    String(item?.coverageMode || '').trim() === 'fixed' ? sum + toSafeNumber(item?.amount) : sum
  ), 0);
  const percentReliefCount = scopedReliefs.filter((item) => String(item?.coverageMode || '').trim() === 'percent').length;
  const fullReliefCount = scopedReliefs.filter((item) => String(item?.coverageMode || '').trim() === 'full').length;
  const nextDueOrder = [...openOrders].sort((left, right) => {
    const leftTime = new Date(left?.dueDate || 0).getTime();
    const rightTime = new Date(right?.dueDate || 0).getTime();
    return (Number.isNaN(leftTime) ? Number.MAX_SAFE_INTEGER : leftTime) - (Number.isNaN(rightTime) ? Number.MAX_SAFE_INTEGER : rightTime);
  })[0] || null;

  return {
    scopedBills,
    scopedReliefs,
    totalDue,
    totalPaid,
    outstanding,
    byFeeType,
    openOrders: openOrders.length,
    reliefCount: scopedReliefs.length,
    fixedReliefAmount,
    percentReliefCount,
    fullReliefCount,
    nextDueOrder,
    topReliefs: scopedReliefs.slice(0, 4)
  };
};

const getReliefValueLabel = (item = {}) => {
  const coverageMode = String(item?.coverageMode || '').trim();
  if (coverageMode === 'full') return '100%';
  if (coverageMode === 'percent') {
    const percent = toSafeNumber(item?.percentage);
    const amount = toSafeNumber(item?.amount);
    return amount > 0 ? `${fmt(percent)}% / ${fmt(amount)} AFN` : `${fmt(percent)}%`;
  }
  return `${fmt(item?.amount || 0)} AFN`;
};

const getReliefSourceEntityId = (item = {}) => {
  const sourceKey = String(item?.sourceKey || '').trim();
  if (!sourceKey.includes(':')) return '';
  return sourceKey.split(':').slice(1).join(':').trim();
};

const getFeeOrderRowId = (item = {}) => String(item?.id || item?._id || item?.feeOrderId || '').trim();

const formatFeeLineSummary = (lineItems = []) => (
  (Array.isArray(lineItems) ? lineItems : [])
    .filter((item) => Number(item?.netAmount || item?.grossAmount || 0) > 0)
    .slice(0, 3)
    .map((item) => `${FEE_LINE_TYPE_LABELS[item?.feeType] || item?.label || item?.feeType || 'آیتم'}: ${fmt(item?.netAmount || item?.grossAmount || 0)}`)
    .join(' | ')
);

const getBillFeeTypes = (bill = {}) => {
  const lineTypes = (Array.isArray(bill?.lineItems) ? bill.lineItems : [])
    .filter((item) => Number(item?.netAmount ?? item?.grossAmount ?? 0) > 0)
    .map((item) => String(item?.feeType || '').trim())
    .filter(Boolean);
  const fallbackType = String(bill?.orderType || '').trim();
  return Array.from(new Set(lineTypes.length ? lineTypes : (fallbackType ? [fallbackType] : ['other'])));
};

const getBillTypeLabel = (bill = {}) => getBillFeeTypes(bill)
  .map((feeType) => FEE_LINE_TYPE_LABELS[feeType] || feeType)
  .join(' + ');

const summarizeBillTypes = (items = []) => {
  const counts = new Map();
  (Array.isArray(items) ? items : []).forEach((bill) => {
    getBillFeeTypes(bill).forEach((feeType) => {
      counts.set(feeType, (counts.get(feeType) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([feeType, count]) => `${FEE_LINE_TYPE_LABELS[feeType] || feeType}: ${fmt(count)}`)
    .join(' · ');
};

const getBillDisplayAmount = (bill = {}) => Math.max(
  0,
  Number(bill?.amountOriginal || 0),
  Number(bill?.amountDue || 0)
);

const getBillReliefAmount = (bill = {}) => Math.max(
  0,
  Number(bill?.amountOriginal || 0) - Number(bill?.amountDue || 0)
);

const toLegacyLikeBillRow = (order = {}) => {
  const canonicalId = String(order?.id || order?._id || '').trim();
  const legacyBillId = String(order?.sourceBillId || '').trim();
  const classTitle = String(order?.schoolClass?.title || order?.course?.title || '').trim() || '---';
  const academicYear = order?.academicYear?.id
    ? order.academicYear
    : order?.schoolClass?.academicYear?.id
      ? order.schoolClass.academicYear
      : null;
  const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];
  return {
    id: canonicalId,
    _id: canonicalId,
    legacyBillId,
    legacyCompatible: Boolean(legacyBillId),
    billNumber: formatFinanceCode(order?.orderNumber || order?.title, '---'),
    title: String(order?.title || '').trim(),
    orderType: String(order?.orderType || '').trim() || 'other',
    source: String(order?.source || '').trim(),
    periodType: String(order?.periodType || '').trim(),
    periodLabel: String(order?.periodLabel || '').trim(),
    issuedAt: order?.issuedAt || null,
    student: {
      userId: String(order?.student?.userId || order?.student?.id || order?.student?._id || '').trim(),
      studentId: String(order?.student?.studentId || order?.student?.coreId || '').trim(),
      name: getStudentDisplayName(order?.student),
      fullName: String(order?.student?.fullName || '').trim(),
      email: String(order?.student?.email || '').trim()
    },
    classId: order?.schoolClass?.id ? { _id: order.schoolClass.id, title: classTitle } : null,
    schoolClass: order?.schoolClass?.id ? { id: order.schoolClass.id, title: classTitle } : null,
    academicYear: academicYear?.id ? { id: academicYear.id, title: String(academicYear?.title || '').trim() } : null,
    course: order?.course?.title ? { title: order.course.title } : null,
    status: String(order?.status || '').trim() || 'new',
    amountOriginal: Number(order?.amountOriginal || 0),
    amountDue: Number(order?.amountDue || 0),
    amountPaid: Number(order?.amountPaid || 0),
    outstandingAmount: Number(order?.outstandingAmount || 0),
    lineItems,
    feeBreakdown: order?.feeBreakdown || null,
    feeLineSummary: formatFeeLineSummary(lineItems),
    dueDate: order?.dueDate || null,
    note: String(order?.note || '').trim(),
    adjustments: Array.isArray(order?.adjustments) ? order.adjustments : [],
    installments: Array.isArray(order?.installments) ? order.installments : [],
    voidReason: String(order?.voidReason || '').trim(),
    voidedAt: order?.voidedAt || null,
    lifecycleStatus: String(order?.lifecycleStatus || '').trim(),
    lifecycleStatusLabel: String(order?.lifecycleStatusLabel || '').trim(),
    lifecycleStatusTone: String(order?.lifecycleStatusTone || '').trim()
  };
};

const toLegacyLikeReceiptRow = (payment = {}) => {
  const canonicalId = String(payment?.id || '').trim();
  const receipt = payment?.receipt || {};
  const legacyReceiptId = String(receipt?.id || payment?.sourceReceiptId || '').trim();
  const sourceKey = getPaymentSourceKey({ payment, receipt, legacyReceiptId });
  const approvalTrail = Array.isArray(payment?.approvalTrail) && payment.approvalTrail.length
    ? payment.approvalTrail
    : Array.isArray(receipt?.approvalTrail)
      ? receipt.approvalTrail
      : [];
  const classTitle = String(payment?.schoolClass?.title || payment?.feeOrder?.schoolClass?.title || '').trim() || '---';
  return {
    id: canonicalId,
    _id: canonicalId,
    paymentNumber: formatFinanceCode(payment?.paymentNumber || canonicalId, ''),
    legacyReceiptId,
    legacyCompatible: Boolean(legacyReceiptId),
    source: String(payment?.source || '').trim(),
    sourceKey,
    student: {
      userId: String(payment?.student?.userId || '').trim(),
      studentId: String(payment?.student?.studentId || '').trim(),
      name: getStudentDisplayName(payment?.student),
      fullName: String(payment?.student?.fullName || '').trim(),
      email: String(payment?.student?.email || '').trim(),
      fatherName: String(payment?.student?.fatherName || '').trim(),
      asasNumber: String(payment?.student?.asasNumber || '').trim(),
      admissionNo: String(payment?.student?.admissionNo || '').trim()
    },
    classId: payment?.schoolClass?.id ? { _id: payment.schoolClass.id, title: classTitle } : null,
    academicYear: (() => {
      const academicYear = payment?.academicYear
        || payment?.feeOrder?.academicYear
        || payment?.schoolClass?.academicYear
        || payment?.feeOrder?.schoolClass?.academicYear
        || null;
      if (!academicYear) return null;
      return {
        id: String(academicYear?.id || '').trim(),
        title: String(academicYear?.title || '').trim()
      };
    })(),
    course: classTitle !== '---' ? { title: classTitle } : null,
    bill: {
      _id: String(payment?.feeOrderId || payment?.feeOrder?.id || payment?.feeOrder?.sourceBillId || '').trim(),
      billNumber: formatFinanceCode(payment?.feeOrder?.orderNumber, '---'),
      amountOriginal: Number(payment?.feeOrder?.amountOriginal || 0),
      amountDue: Number(payment?.feeOrder?.amountDue || 0),
      amountPaid: Number(payment?.feeOrder?.amountPaid || 0),
      status: String(payment?.feeOrder?.status || '').trim() || '-'
    },
    amount: Number(payment?.amount || 0),
    paymentMethod: String(receipt?.paymentMethod || payment?.paymentMethod || '').trim(),
    referenceNo: String(receipt?.referenceNo || payment?.referenceNo || '').trim(),
    paidAt: payment?.paidAt || receipt?.paidAt || null,
    fileUrl: String(receipt?.fileUrl || payment?.fileUrl || '').trim(),
    note: String(receipt?.note || payment?.note || '').trim(),
    status: String(receipt?.status || payment?.status || '').trim() || 'pending',
    approvalStage: String(receipt?.approvalStage || payment?.approvalStage || '').trim() || 'finance_manager_review',
    approvalTrail,
    reviewedBy: payment?.reviewedBy || receipt?.reviewedBy || null,
    reviewNote: String(receipt?.reviewNote || payment?.reviewNote || '').trim(),
    rejectReason: String(payment?.rejectReason || receipt?.rejectReason || '').trim(),
    followUp: payment?.followUp || receipt?.followUp || null,
    receivedBy: payment?.receivedBy || null,
    allocations: Array.isArray(payment?.allocations) ? payment.allocations : [],
    receiptDetails: payment?.receiptDetails || null
  };
};

const toDetailedReceiptRow = (data = {}) => {
  const row = toLegacyLikeReceiptRow(data?.item || {});
  const receipt = data?.receipt || {};
  const membership = data?.membership || {};
  const membershipStudent = membership?.student || {};
  const student = {
    ...row.student,
    fullName: receipt.studentName || membershipStudent.fullName || row.student?.fullName || row.student?.name || '',
    fatherName: receipt.fatherName || membershipStudent.fatherName || row.student?.fatherName || '',
    asasNumber: receipt.asasNumber
      || membershipStudent.asasNumber
      || membershipStudent.admissionNo
      || row.student?.asasNumber
      || row.student?.admissionNo
      || '',
    admissionNo: receipt.asasNumber
      || membershipStudent.admissionNo
      || membershipStudent.asasNumber
      || row.student?.admissionNo
      || row.student?.asasNumber
      || ''
  };
  const academicYearTitle = String(
    receipt.academicYearTitle
    || membership?.academicYear?.title
    || row.academicYear?.title
    || ''
  ).trim();
  const classTitle = String(receipt.classTitle || membership?.schoolClass?.title || row.classId?.title || '').trim();
  return {
    ...row,
    student,
    classId: row.classId || (classTitle ? { _id: String(membership?.schoolClass?.id || ''), title: classTitle } : null),
    course: row.course || (classTitle ? { title: classTitle } : null),
    academicYear: row.academicYear || (academicYearTitle
      ? { id: String(membership?.academicYear?.id || ''), title: academicYearTitle }
      : null),
    receiptDetails: {
      ...(row.receiptDetails || {}),
      ...receipt,
      studentName: receipt.studentName || student.fullName,
      fatherName: receipt.fatherName || student.fatherName,
      asasNumber: receipt.asasNumber || student.asasNumber,
      classTitle: receipt.classTitle || classTitle,
      academicYearTitle: receipt.academicYearTitle || academicYearTitle
    }
  };
};

const buildAnomalyActionPayload = (item = {}, extras = {}) => ({
  ...extras,
  snapshot: {
    id: String(item?.id || '').trim(),
    legacyAnomalyIds: Array.isArray(item?.legacyAnomalyIds)
      ? item.legacyAnomalyIds.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
    anomalyType: String(item?.anomalyType || '').trim(),
    title: String(item?.title || '').trim(),
    description: String(item?.description || '').trim(),
    severity: String(item?.severity || '').trim(),
    membershipId: String(item?.membershipId || item?.studentMembershipId || '').trim(),
    studentMembershipId: String(item?.membershipId || item?.studentMembershipId || '').trim(),
    studentUserId: String(item?.studentUserId || '').trim(),
    studentName: String(item?.studentName || '').trim(),
    classId: String(item?.classId || '').trim(),
    classTitle: String(item?.classTitle || '').trim(),
    academicYearId: String(item?.academicYearId || '').trim(),
    academicYearTitle: String(item?.academicYearTitle || '').trim(),
    referenceNumber: String(item?.referenceNumber || '').trim(),
    secondaryReference: String(item?.secondaryReference || '').trim(),
    amount: Number(item?.amount || 0) || 0,
    amountLabel: String(item?.amountLabel || '').trim(),
    status: String(item?.status || '').trim(),
    dueDate: item?.dueDate || null,
    at: item?.at || null,
    orderId: String(item?.orderId || '').trim(),
    paymentId: String(item?.paymentId || '').trim(),
    reliefId: String(item?.reliefId || '').trim(),
    tags: Array.isArray(item?.tags) ? item.tags : []
  }
});

// Print data (financeOverview / cashierReportPrintModel) is loaded asynchronously and the
// printable sheet is only mounted in the DOM once that data is ready (this no longer applies to
// receipts - see buildReceiptPrintHtml, which prints from its own standalone window instead). If
// window.print() fires before React has actually committed the sheet, the print CSS (which hides
// everything except .finance-print-sheet) has nothing left to show and the printout comes out
// completely blank/white. This polls for the sheet instead of relying on a fixed delay, so print
// only fires once there is really something on the page.
const waitForPrintableSheet = async (selector = '.finance-print-sheet', { maxAttempts = 20, intervalMs = 50 } = {}) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const root = document.querySelector(selector);
    if (root) return root;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  return null;
};

// The page's Persian text runs through the custom @font-face families (B Nazanin / B Mitra / B
// Zar). On a slow connection those fonts can still be loading when window.print() fires; the
// browser's own print header/footer (system font) shows up fine, but every bit of the sheet's own
// text renders with essentially nothing visible until the font swap finishes — indistinguishable
// from a blank page. document.fonts.ready resolves once all fonts the page actually used have
// finished loading (or failed), so wait for it — bounded, so a font that never loads can't hang
// printing forever.
const waitForPrintableFonts = async (timeoutMs = 4000) => {
  if (typeof document === 'undefined' || !document.fonts?.ready) return;
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => { if (typeof window !== 'undefined') window.setTimeout(resolve, timeoutMs); })
    ]);
  } catch {
    // A rejected font load shouldn't block printing — proceed with whatever is ready.
  }
};

const waitForPrintableImages = async (root) => {
  if (!root || typeof window === 'undefined') return;
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
  const images = Array.from(root.querySelectorAll('img'));
  if (!images.length) return;
  await Promise.all(images.map((image) => new Promise((resolve) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }
    const done = () => {
      image.removeEventListener('load', done);
      image.removeEventListener('error', done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, 1500);
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
  })));
};

// The app has no top-level error boundary, so a render crash caused by an edge case in a real
// record's data (e.g. a malformed allocation, an unexpected field shape) would otherwise unmount
// the whole page and print a totally blank sheet with no clue why. This boundary is scoped to just
// the printable sheets: on a crash it swaps in a normal (non print-sheet-classed) fallback, which
// means waitForPrintableSheet correctly treats the print as "not ready" and reports it instead of
// silently opening the print dialog on nothing, and it surfaces the actual error via onError so it
// shows up in the on-page message instead of only the browser console.
class PrintSheetErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="finance-print-error" role="alert">
          آماده‌سازی این مورد برای چاپ با خطا مواجه شد: {String(this.state.error?.message || this.state.error)}
        </div>
      );
    }
    return this.props.children;
  }
}

const escapeHtml = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Renders one physical copy (student/school) of the receipt as a self-contained HTML fragment -
// no dependency on the app's own stylesheet, DOM, or React tree at all.
const buildReceiptCopyHtml = (model, schoolInfo, logoUrls, copyLabel, copyKey) => {
  const currency = model.currencyLabel || 'افغانی';
  const amountLabel = (value) => (value === null || value === undefined
    ? '-'
    : `${escapeHtml(fmt(value))} ${escapeHtml(currency)}`);
  const logoHtml = (url, alt) => (url
    ? `<img class="${escapeHtml(getOfficialPrintLogoImageClass(url))}" src="${escapeHtml(url)}" alt="${alt}" />`
    : `<span>${alt}</span>`);
  const allocationsHtml = model.allocations.length ? `
    <div class="allocation-block">
      <span>تفکیک بل‌های پرداخت‌شده:</span>
      <div class="allocation-list">
        ${model.allocations.map((allocation, index) => `
          <div>
            <strong>${escapeHtml(allocation.title || `بل ${index + 1}`)}</strong>
            <small class="latin">${escapeHtml(formatFinanceCode(allocation.orderNumber, '-'))}</small>
            <b>پرداخت: ${escapeHtml(fmt(allocation.amount))} ${escapeHtml(currency)}</b>
            <small class="totals">اصل: ${allocation.grossAmount == null ? '-' : escapeHtml(fmt(allocation.grossAmount))} · تخفیف: ${allocation.discountAmount == null ? '-' : escapeHtml(fmt(allocation.discountAmount))} · باقیات: ${allocation.outstandingAmount == null ? '-' : escapeHtml(fmt(allocation.outstandingAmount))}</small>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';
  const noteHtml = model.note
    ? `<div class="note-line"><span>یادداشت:</span><strong>${escapeHtml(model.note)}</strong></div>`
    : '';

  return `
    <section class="copy" data-receipt-copy="${escapeHtml(copyKey)}">
    <div class="copy-inner">
      <div class="copy-label">${escapeHtml(copyLabel)}</div>
      <div class="letterhead">
        <div class="logo-box">${logoHtml(logoUrls.schoolLogoUrl, 'لوگوی مکتب')}</div>
        <div class="letterhead-center">
          <div class="kicker">${escapeHtml(schoolInfo.title)}</div>
          <h3>رسید پرداخت فیس شاگرد</h3>
          ${schoolInfo.subtitle ? `<small>${escapeHtml(schoolInfo.subtitle)}</small>` : ''}
        </div>
        <div class="logo-box">${logoHtml(logoUrls.ministryLogoUrl, 'لوگوی وزارت معارف')}</div>
      </div>
      <div class="document-meta">
        <div><span>شماره رسید</span><strong class="latin">${escapeHtml(model.paymentNumber || '-')}</strong></div>
        <div><span>تاریخ</span><strong>${escapeHtml(toFaDate(model.paidAt))}</strong></div>
        <div><span>سال تعلیمی</span><strong>${escapeHtml(model.academicYearTitle || '-')}</strong></div>
        <div><span>وضعیت</span><strong>${escapeHtml(PAYMENT_STATUS_UI_LABELS[model.status] || model.status || '-')}</strong></div>
      </div>
      <div class="main-grid">
        <section class="info-panel">
          <h4>مشخصات شاگرد</h4>
          <div><span>نام شاگرد:</span><strong>${escapeHtml(model.studentName)}</strong></div>
          <div><span>نام پدر:</span><strong>${escapeHtml(model.fatherName)}</strong></div>
          <div><span>نمبر اساس:</span><strong class="latin">${escapeHtml(model.asasNumber)}</strong></div>
          <div><span>صنف:</span><strong>${escapeHtml(model.classTitle)}</strong></div>
        </section>
        <section class="info-panel">
          <h4>مشخصات پرداخت</h4>
          <div><span>${model.isMultiBill ? 'شماره سند:' : 'شماره بل:'}</span><strong class="latin">${escapeHtml(model.billNumber || '-')}</strong></div>
          <div><span>مبلغ پرداختی:</span><strong>${escapeHtml(fmt(model.amount))} ${escapeHtml(currency)}</strong></div>
          <div><span>روش پرداخت:</span><strong>${escapeHtml(PAYMENT_METHOD_UI_LABELS[model.paymentMethod] || model.paymentMethod || '-')}</strong></div>
          <div><span>شماره مرجع:</span><strong class="latin">${escapeHtml(model.referenceNo || '-')}</strong></div>
        </section>
      </div>
      <div class="purpose-line"><span>بابت:</span><strong>${escapeHtml(model.purpose)}</strong></div>
      <div class="summary-grid">
        <div><span>مبلغ اصلی بل</span><strong>${amountLabel(model.grossAmount)}</strong></div>
        <div><span>تخفیف و معافیت</span><strong>${amountLabel(model.discountAmount)}</strong></div>
        <div><span>پرداخت فعلی</span><strong>${escapeHtml(fmt(model.amount))} ${escapeHtml(currency)}</strong></div>
        <div><span>باقیات فعلی</span><strong>${amountLabel(model.currentOutstandingAmount)}</strong></div>
      </div>
      ${noteHtml}
      ${allocationsHtml}
      <div class="signatures">
        <div><span>ثبت‌کننده پرداخت</span><strong>${escapeHtml(model.receivedBy || ' ')}</strong></div>
        <div><span>مدیر مالی</span><strong>نام: __________________</strong><b>امضا و مهر: __________________</b></div>
      </div>
    </div>
    </section>
  `;
};

// Builds a complete, standalone HTML document for the receipt and prints it from its own isolated
// window instead of inside the main app page. This deliberately avoids the entire class of bugs
// spent #51-#57 chasing one at a time in the in-page print sheet: no "everything hidden except one
// element" CSS trick to get wrong, no dependency on the main document's own layout/CSS cascade or
// React re-render timing, nothing else on the page (sockets, other admins' activity, unrelated
// state) able to touch this document at all once it's open. The one browser-side risk this
// approach carries - the print sheet still overflowing its own single physical page - is handled
// directly: the inline script measures the rendered content against an actual page-height
// reference and scales the whole thing down to fit if it's too tall, rather than silently clipping
// or blanking anything.
const buildReceiptPrintHtml = (model, schoolInfo, logoUrls) => {
  const studentCopy = buildReceiptCopyHtml(model, schoolInfo, logoUrls, 'نسخه شاگرد', 'student');
  const schoolCopy = buildReceiptCopyHtml(model, schoolInfo, logoUrls, 'نسخه مکتب', 'school');
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>رسید پرداخت فیس شاگرد</title>
<style>
  @font-face { font-family: 'B Nazanin'; src: url('/fonts/B_Nazanin.ttf') format('truetype'); font-weight: 400; }
  @font-face { font-family: 'B Nazanin'; src: url('/fonts/B_Nazanin_Bold.ttf') format('truetype'); font-weight: 700; }
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: 'B Nazanin', 'B Mitra', Tahoma, sans-serif; }
  /* Two copies must each occupy exactly half of the printable page (not just their natural
     content height) so the two halves always meet edge-to-edge with the cut line exactly in the
     middle - a page shorter than that leaves an empty gap at the bottom of the sheet, which is
     the "نصف بالا / نصف پایین" layout this was asked to produce. */
  #page-ruler { position: absolute; visibility: hidden; height: 134mm; width: 1px; top: 0; left: 0; }
  #scale-wrap { width: 186mm; margin: 0 auto; }
  .copy { height: 134mm; box-sizing: border-box; border: 0.25mm solid #111; padding: 2.2mm 2.6mm; font-size: 8.5pt; line-height: 1.2; overflow: visible; position: relative; }
  .copy-inner { display: grid; gap: 2px; direction: rtl; transform-origin: top center; }
  .cut-line { position: relative; display: flex; align-items: center; justify-content: center; height: 5mm; color: #555; font-size: 7pt; margin: 0; }
  .cut-line::before { position: absolute; right: 0; left: 0; top: 50%; border-top: 0.25mm dashed #777; content: ''; }
  .cut-line span { position: relative; z-index: 1; padding: 0 3mm; background: #fff; }
  .copy-label, .kicker { text-align: center; font-weight: 700; }
  .copy h3 { margin: 0; text-align: center; font-size: 11pt; line-height: 1.15; }
  .letterhead { display: grid; grid-template-columns: 15mm minmax(0, 1fr) 15mm; gap: 2mm; align-items: center; direction: ltr; }
  .letterhead-center { min-width: 0; text-align: center; direction: rtl; }
  .letterhead-center small { display: block; margin-top: 1px; color: #222; font-size: 6.3pt; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .logo-box { display: grid; place-items: center; width: 13mm; height: 13mm; border: 1px solid #b8b8b8; background: #fff; color: #444; font-size: 6pt; padding: 0.5mm; overflow: hidden; text-align: center; }
  .logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .document-meta, .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; border-top: 1px solid #111; border-right: 1px solid #111; }
  .document-meta > div, .summary-grid > div { display: grid; gap: 0; min-width: 0; padding: 1px 2px; border-bottom: 1px solid #111; border-left: 1px solid #111; text-align: center; }
  .document-meta span, .summary-grid span { font-size: 7pt; font-weight: 700; line-height: 1.05; }
  .document-meta strong, .summary-grid strong { min-width: 0; overflow-wrap: anywhere; font-size: 7.8pt; line-height: 1.1; }
  .main-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.6mm; }
  .info-panel { display: grid; align-content: start; min-width: 0; border-top: 1px solid #111; border-right: 1px solid #111; }
  .info-panel h4 { margin: 0; padding: 1px 3px; border-bottom: 1px solid #111; border-left: 1px solid #111; background: #f1f1f1; text-align: center; font-size: 8pt; }
  .info-panel > div { display: grid; grid-template-columns: 35% minmax(0, 1fr); min-height: 4.6mm; border-bottom: 1px solid #111; }
  .info-panel span, .info-panel strong { display: flex; align-items: center; min-width: 0; padding: 1px 3px; border-left: 1px solid #111; overflow-wrap: anywhere; font-size: 8pt; line-height: 1.05; }
  .info-panel span { color: #111; font-weight: 700; }
  .purpose-line, .note-line { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px; align-items: center; min-height: 4.6mm; padding: 1px 3px; border: 1px solid #111; font-size: 7.8pt; line-height: 1.05; }
  .purpose-line span, .note-line span { font-weight: 800; }
  .allocation-block { display: grid; gap: 1px; color: #111; font-size: 7.4pt; line-height: 1.1; }
  .allocation-block > span { font-weight: 800; }
  .allocation-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid #111; border-right: 1px solid #111; }
  .allocation-list > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 2px; min-width: 0; padding: 1px 2px; border-bottom: 1px solid #111; border-left: 1px solid #111; }
  .allocation-list strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .allocation-list small { grid-column: 1; }
  .allocation-list .totals { grid-column: 1 / -1; color: #222; line-height: 1.25; white-space: normal; font-size: 6.6pt; }
  .allocation-list b { grid-column: 2; grid-row: 1 / span 2; align-self: center; white-space: nowrap; font-size: 6.6pt; }
  .signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5mm; margin-top: 2px; }
  .signatures > div { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 1px 5px; align-items: end; min-height: 7mm; border-bottom: 1px solid #111; font-size: 7.8pt; line-height: 1.1; }
  .signatures > div > b { grid-column: 1 / -1; font-weight: 700; }
  .latin { direction: ltr; unicode-bidi: isolate; text-align: left; letter-spacing: 0; }
</style>
</head>
<body>
  <div id="page-ruler"></div>
  <div id="scale-wrap">
    ${studentCopy}
    <div class="cut-line"><span>محل برش</span></div>
    ${schoolCopy}
  </div>
  <script>
    (function () {
      var printed = false;
      function ready() {
        if (printed) return;
        printed = true;
        try {
          var halfPageHeightPx = document.getElementById('page-ruler').getBoundingClientRect().height;
          var inners = document.querySelectorAll('.copy-inner');
          for (var i = 0; i < inners.length; i += 1) {
            var inner = inners[i];
            inner.style.transform = 'none';
            var naturalHeight = inner.getBoundingClientRect().height;
            if (halfPageHeightPx > 0 && naturalHeight > halfPageHeightPx) {
              inner.style.transform = 'scale(' + (halfPageHeightPx / naturalHeight) + ')';
            }
          }
        } catch (err) {
          // Printing the unscaled document beats not printing at all.
        }
        setTimeout(function () { window.print(); }, 60);
      }
      if (window.document.fonts && window.document.fonts.ready) {
        window.document.fonts.ready.then(ready, ready);
      }
      window.addEventListener('load', ready);
      setTimeout(ready, 2500);
    })();
  </script>
</body>
</html>`;
};

export default function AdminFinance() {
  const { settings: siteSettings } = useSiteSettings();
  const [summary, setSummary] = useState(null);
  const [financeOverview, setFinanceOverview] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [financeOverviewLoading, setFinanceOverviewLoading] = useState(false);
  const [financeOverviewRange, setFinanceOverviewRange] = useState(getDefaultFinanceDashboardRange);
  const [students, setStudents] = useState([]);
  const [studentMemberships, setStudentMemberships] = useState([]);
  const [classOptions, setClassOptions] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [feePlans, setFeePlans] = useState([]);
  const [bills, setBills] = useState([]);
  const [pendingReceipts, setPendingReceipts] = useState([]);
  const [discountRegistry, setDiscountRegistry] = useState([]);
  const [discountDuplicateSummary, setDiscountDuplicateSummary] = useState({
    scanned: 0,
    duplicateGroups: 0,
    duplicateRecords: 0,
    affectedStudents: 0,
    affectedClasses: 0,
    mirroredDiscountRecords: 0,
    mirroredActiveReliefs: 0
  });
  const discountSubmitInFlightRef = useRef(false);
  const fullOrdersLoadedRef = useRef(false);
  const fullOrdersLoadInFlightRef = useRef(false);
  const paymentWorkspaceRefreshIdRef = useRef(0);
  const [exemptions, setExemptions] = useState([]);
  const [reliefs, setReliefs] = useState([]);
  const [billingPreview, setBillingPreview] = useState(null);
  const [closedMonths, setClosedMonths] = useState([]);
  const [selectedMonthCloseId, setSelectedMonthCloseId] = useState('');
  const [selectedMonthCloseDetail, setSelectedMonthCloseDetail] = useState(null);
  const [documentArchiveItems, setDocumentArchiveItems] = useState([]);
  const [documentArchiveTypeFilter, setDocumentArchiveTypeFilter] = useState('all');
  const [selectedDocumentArchiveId, setSelectedDocumentArchiveId] = useState('');
  const [documentVerificationCode, setDocumentVerificationCode] = useState('');
  const [verifiedDocument, setVerifiedDocument] = useState(null);
  const [deliveryProviderConfigs, setDeliveryProviderConfigs] = useState([]);
  const [selectedDeliveryProviderChannel, setSelectedDeliveryProviderChannel] = useState('sms');
  const [deliveryProviderForm, setDeliveryProviderForm] = useState(() => buildDeliveryProviderForm(null, 'sms'));
  const [deliveryTemplates, setDeliveryTemplates] = useState([]);
  const [deliveryTemplateVariables, setDeliveryTemplateVariables] = useState([]);
  const [deliveryTemplatePreview, setDeliveryTemplatePreview] = useState(null);
  const [deliveryTemplatePreviewBusy, setDeliveryTemplatePreviewBusy] = useState(false);
  const [deliveryTemplatePreviewError, setDeliveryTemplatePreviewError] = useState('');
  const [selectedDeliveryTemplateVersionNumber, setSelectedDeliveryTemplateVersionNumber] = useState('');
  const [deliveryTemplateChangeNote, setDeliveryTemplateChangeNote] = useState('');
  const [documentDeliveryForm, setDocumentDeliveryForm] = useState({
    channel: 'email',
    recipientHandles: '',
    includeLinkedAudience: true,
    subject: '',
    note: ''
  });
  const [deliveryCampaigns, setDeliveryCampaigns] = useState([]);
  const [deliveryAnalytics, setDeliveryAnalytics] = useState(null);
  const [deliveryRetryQueue, setDeliveryRetryQueue] = useState([]);
  const [deliveryRecoveryQueue, setDeliveryRecoveryQueue] = useState([]);
  const [deliveryCampaignStatusFilter, setDeliveryCampaignStatusFilter] = useState('all');
  const [deliveryRetryChannelFilter, setDeliveryRetryChannelFilter] = useState('all');
  const [deliveryOpsStatusFilter, setDeliveryOpsStatusFilter] = useState('all');
  const [deliveryOpsProviderFilter, setDeliveryOpsProviderFilter] = useState('all');
  const [deliveryOpsFailureFilter, setDeliveryOpsFailureFilter] = useState('all');
  const [deliveryOpsRetryableFilter, setDeliveryOpsRetryableFilter] = useState('all');
  const [deliveryRecoveryStateFilter, setDeliveryRecoveryStateFilter] = useState('all');
  const [selectedDeliveryCampaignId, setSelectedDeliveryCampaignId] = useState('');
  const [deliveryCampaignForm, setDeliveryCampaignForm] = useState({
    name: '',
    documentType: 'batch_statement_pack',
    channel: 'email',
    classId: '',
    academicYearId: '',
    monthKey: '',
    messageTemplateKey: '',
    messageTemplateSubject: '',
    messageTemplateBody: '',
    recipientHandles: '',
    includeLinkedAudience: false,
    automationEnabled: true,
    intervalHours: 24,
    retryFailed: true,
    maxDocumentsPerRun: 5,
    note: ''
  });
  const [anomalies, setAnomalies] = useState([]);
  const [anomalySummary, setAnomalySummary] = useState(null);
  const [selectedAnomalyId, setSelectedAnomalyId] = useState('');
  const [anomalyTypeFilter, setAnomalyTypeFilter] = useState('all');
  const [anomalyWorkflowStatusFilter, setAnomalyWorkflowStatusFilter] = useState('open');
  const [anomalyClassFilter, setAnomalyClassFilter] = useState('');
  const [anomalySearchTerm, setAnomalySearchTerm] = useState('');
  const [anomalyWorkflowForm, setAnomalyWorkflowForm] = useState({
    assignedLevel: 'finance_manager',
    snoozedUntil: '',
    note: ''
  });
  const [refunds, setRefunds] = useState([]);
  const [selectedRefundId, setSelectedRefundId] = useState('');
  const [refundStatusFilter, setRefundStatusFilter] = useState('all');
  const [refundSearchTerm, setRefundSearchTerm] = useState('');
  const [refundReviewNote, setRefundReviewNote] = useState('');
  const [refundPayForm, setRefundPayForm] = useState({ refundMethod: 'cash', proofReference: '', accountId: '' });
  const [manualRefundForm, setManualRefundForm] = useState({ feeOrderId: '', amount: '', reason: 'membership_ended', reasonNote: '' });
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [expenseStatusFilter, setExpenseStatusFilter] = useState('all');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all');
  const [expenseSearchTerm, setExpenseSearchTerm] = useState('');
  const [expensePage, setExpensePage] = useState(1);
  const [expenseForm, setExpenseForm] = useState({
    category: '',
    subCategory: '',
    amount: '',
    currency: 'AFN',
    expenseDate: toInputDate(new Date()),
    academicYearId: '',
    classId: '',
    paymentMethod: 'manual',
    treasuryAccountId: '',
    vendorName: '',
    referenceNo: '',
    note: '',
    submitForReview: true
  });
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showAddExpenseCategory, setShowAddExpenseCategory] = useState(false);
  const [newExpenseCategoryForm, setNewExpenseCategoryForm] = useState({ label: '' });
  const [admissionBatchForm, setAdmissionBatchForm] = useState({
    classId: '',
    mode: 'open',
    note: ''
  });
  const [admissionBatchPreview, setAdmissionBatchPreview] = useState({
    loading: false,
    items: [],
    error: ''
  });
  const [admissionBatchRefreshKey, setAdmissionBatchRefreshKey] = useState(0);
  const [admissionReceiptCorrectionForm, setAdmissionReceiptCorrectionForm] = useState({
    classId: '',
    note: ''
  });
  const [admissionReceiptCorrectionPreview, setAdmissionReceiptCorrectionPreview] = useState({
    loading: false,
    items: [],
    summary: null,
    error: ''
  });
  const [admissionReceiptCorrectionRefreshKey, setAdmissionReceiptCorrectionRefreshKey] = useState(0);
  const [paymentScopeRepairForm, setPaymentScopeRepairForm] = useState({
    classId: '',
    note: ''
  });
  const [paymentScopeRepairPreview, setPaymentScopeRepairPreview] = useState({
    loading: false,
    items: [],
    summary: null,
    error: ''
  });
  const [paymentScopeRepairRefreshKey, setPaymentScopeRepairRefreshKey] = useState(0);
  const [classPaymentApprovalForm, setClassPaymentApprovalForm] = useState({
    classId: '',
    feeType: 'all',
    note: ''
  });
  const [classPaymentApprovalPreview, setClassPaymentApprovalPreview] = useState({
    loading: false,
    items: [],
    summary: null,
    error: ''
  });
  const [classPaymentApprovalRefreshKey, setClassPaymentApprovalRefreshKey] = useState(0);
  const [message, setMessageState] = useState('');
  const setMessage = (value = '') => setMessageState(localizeSystemMessage(value));
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessageState(''), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  const [financeDataErrors, setFinanceDataErrors] = useState({ orders: '', payments: '' });
  const [busy, setBusy] = useState(false);
  const [activeSchoolContext, setActiveSchoolContext] = useState(null);
  const [receiptStatusFilter, setReceiptStatusFilter] = useState('all');
  const [receiptStageFilter, setReceiptStageFilter] = useState('all');
  const [receiptSourceFilter, setReceiptSourceFilter] = useState('all');
  const [receiptFollowUpFilter, setReceiptFollowUpFilter] = useState('all');
  const [receiptAcademicYearFilter, setReceiptAcademicYearFilter] = useState('all');
  const [receiptClassFilter, setReceiptClassFilter] = useState('all');
  const [receiptPage, setReceiptPage] = useState(1);
  const [activePaymentTool, setActivePaymentTool] = useState('');
  const [selectedReceiptId, setSelectedReceiptId] = useState('');
  const [selectedReceiptDetail, setSelectedReceiptDetail] = useState(null);
  const [receiptFollowUpForm, setReceiptFollowUpForm] = useState({
    assignedLevel: 'finance_manager',
    status: 'new',
    note: ''
  });
  const [printMode, setPrintMode] = useState('');
  // A snapshot of whatever data was live at the moment printing started, frozen for the
  // duration of the print. Printing now stays open for several seconds (waiting for the sheet
  // to mount, its logos to load, and its fonts to finish loading) - meanwhile a socket.io
  // 'finance:lifecycle-changed' event from ANY admin action anywhere in the school (not just this
  // one) can fire loadAll() and replace financeOverview/cashierReport mid-print. If the sheet
  // read those live values directly, a refresh landing in that window could change or clear
  // financeOverview/cashierReportPrintModel and unmount the sheet out from under window.print(),
  // producing a totally blank page despite everything above having gone right. Snapshotting once
  // when printMode is set (see the effect below) makes the printed sheet immune to any data
  // change that happens after the user clicked print. (Receipts no longer go through this path at
  // all - see buildReceiptPrintHtml.)
  const [printSnapshot, setPrintSnapshot] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [formLayoutMode, setFormLayoutMode] = useState('landscape');
  const [orderFormMode, setOrderFormMode] = useState('manual');
  const [billingAdvancedOpen, setBillingAdvancedOpen] = useState(false);
  const [planVisibleCount, setPlanVisibleCount] = useState(5);
  const [billVisibleCount, setBillVisibleCount] = useState(5);
  const [ordersCatalogLoading, setOrdersCatalogLoading] = useState(false);
  const [discountRegistryPage, setDiscountRegistryPage] = useState(1);
  const [discountRegistryPageSize, setDiscountRegistryPageSize] = useState(10);
  const [discountRegistryClassFilter, setDiscountRegistryClassFilter] = useState('all');
  const [reliefRegistryPage, setReliefRegistryPage] = useState(1);
  const [reliefRegistryPageSize, setReliefRegistryPageSize] = useState(10);
  const [exemptionRegistryPage, setExemptionRegistryPage] = useState(1);
  const [exemptionRegistryPageSize, setExemptionRegistryPageSize] = useState(10);
  const [reliefFocusPage, setReliefFocusPage] = useState(1);
  const [reliefFocusPageSize, setReliefFocusPageSize] = useState(5);
  const [paymentAdvancedOpen, setPaymentAdvancedOpen] = useState(false);
  const [reliefFormMode, setReliefFormMode] = useState('discount');
  const [incomeTrendRange, setIncomeTrendRange] = useState('daily');
  const [debtorDelayFilter, setDebtorDelayFilter] = useState('all');
  const [debtorSearchTerm, setDebtorSearchTerm] = useState('');
  const [debtorPage, setDebtorPage] = useState(1);
  const [manualStudentSearch, setManualStudentSearch] = useState('');
  const [paymentStudentSearch, setPaymentStudentSearch] = useState('');
  const [discountStudentSearch, setDiscountStudentSearch] = useState('');
  const [exemptionStudentSearch, setExemptionStudentSearch] = useState('');
  const [receiptSearchTerm, setReceiptSearchTerm] = useState('');
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('official');
  const [orderFeeTypeFilter, setOrderFeeTypeFilter] = useState('all');
  const [orderClassFilter, setOrderClassFilter] = useState('all');
  const [orderMonthFilter, setOrderMonthFilter] = useState('all');
  const [billIssuanceFilter, setBillIssuanceFilter] = useState('all');
  const [discountRegistrySearch, setDiscountRegistrySearch] = useState('');
  const [exemptionRegistrySearch, setExemptionRegistrySearch] = useState('');
  const [reliefRegistrySearch, setReliefRegistrySearch] = useState('');
  const [reliefRegistryTypeFilter, setReliefRegistryTypeFilter] = useState('all');
  const [feePlanSearchTerm, setFeePlanSearchTerm] = useState('');
  const [deskPaymentSubmitMode, setDeskPaymentSubmitMode] = useState('save');
  const financeRole = useMemo(
    () => normalizeFinanceRole(
      localStorage.getItem('adminLevel') || '',
      normalizeFinanceRole(localStorage.getItem('orgRole') || '', 'finance_manager')
    ),
    []
  );
  const deferredManualStudentSearch = useDeferredValue(manualStudentSearch);
  const deferredPaymentStudentSearch = useDeferredValue(paymentStudentSearch);
  const deferredDiscountStudentSearch = useDeferredValue(discountStudentSearch);
  const deferredExemptionStudentSearch = useDeferredValue(exemptionStudentSearch);

  const [manualForm, setManualForm] = useState({
    studentId: '',
    classId: '',
    feeType: 'tuition',
    amountSource: 'plan',
    amount: '',
    dueDate: '',
    academicYearId: '',
    academicYear: '',
    term: '',
    periodLabel: '',
    note: ''
  });

  const [bulkForm, setBulkForm] = useState({
    classId: '',
    dueDate: '',
    academicYear: '',
    academicYearId: '',
    term: '',
    periodType: 'monthly',
    periodLabel: '',
    includeAdmission: false,
    includeTransport: false,
    onlyDebtors: false
  });

  const [feePlanForm, setFeePlanForm] = useState({
    title: '',
    classId: '',
    academicYearId: '',
    term: '',
    planCode: '',
    planType: 'standard',
    priority: '',
    isDefault: false,
    effectiveFrom: '',
    effectiveTo: '',
    eligibilityRule: '',
    billingFrequency: 'monthly',
    tuitionFee: '',
    admissionFee: '',
    examFee: '',
    documentFee: '',
    transportDefaultFee: '',
    otherFee: '',
    currency: 'AFN',
    dueDay: 10,
    note: ''
  });

  const [discountForm, setDiscountForm] = useState({
    targetScope: 'student',
    studentId: '',
    studentMembershipId: '',
    classId: '',
    academicYearId: '',
    discountType: 'discount',
    coverageMode: 'fixed',
    amount: '',
    percentage: '',
    durationMode: 'academic_year',
    startDate: '',
    endDate: '',
    reason: ''
  });

  const [exemptionForm, setExemptionForm] = useState({
    studentId: '',
    studentMembershipId: '',
    classId: '',
    academicYearId: '',
    exemptionType: 'full',
    scope: 'all',
    amount: '',
    percentage: '',
    reason: '',
    note: ''
  });

  const [paymentDeskForm, setPaymentDeskForm] = useState({
    studentId: '',
    classId: '',
    academicYearId: '',
    feeType: 'tuition',
    amount: '',
    paidAt: toInputDate(new Date()),
    paymentMethod: 'cash',
    allocationMode: 'auto_oldest_due',
    referenceNo: '',
    note: '',
    selectedFeeOrderIds: [],
    manualAllocations: {}
  });
  const [paymentPreview, setPaymentPreview] = useState(null);
  const [advanceBillingPreview, setAdvanceBillingPreview] = useState(null);
  const [advanceBillingPayload, setAdvanceBillingPayload] = useState(null);

  const paymentDeskStudent = useMemo(
    () => students.find((item) => String(item?._id || '') === String(paymentDeskForm.studentId || '')) || null,
    [students, paymentDeskForm.studentId]
  );
  const paymentDeskClass = useMemo(
    () => classOptions.find((item) => String(item?.classId || '') === String(paymentDeskForm.classId || '')) || null,
    [classOptions, paymentDeskForm.classId]
  );
  const paymentDeskAcademicYear = useMemo(
    () => academicYears.find((item) => String(item?.id || '') === String(paymentDeskForm.academicYearId || '')) || null,
    [academicYears, paymentDeskForm.academicYearId]
  );
  const currentAcademicYearId = useMemo(
    () => academicYears.find((item) => item?.isCurrent || item?.isActive)?.id || academicYears[0]?.id || '',
    [academicYears]
  );
  const paymentDeskOpenOrders = useMemo(() => (
    bills
      .filter((item) => (
        String(item?.student?.userId || '') === String(paymentDeskForm.studentId || '')
        && String(item?.schoolClass?.id || item?.classId?._id || '') === String(paymentDeskForm.classId || '')
        && getFinanceRecordAcademicYearId(item) === String(paymentDeskForm.academicYearId || '')
        && getBillFeeScopeSummary(item, paymentDeskForm.feeType).outstanding > 0
        && OPEN_ORDER_STATUSES.has(String(item?.status || '').trim())
        && Number(item?.outstandingAmount || 0) > 0
      ))
      .sort((left, right) => {
        const leftTime = new Date(left?.dueDate || 0).getTime();
        const rightTime = new Date(right?.dueDate || 0).getTime();
        const safeLeft = Number.isNaN(leftTime) ? Number.MAX_SAFE_INTEGER : leftTime;
        const safeRight = Number.isNaN(rightTime) ? Number.MAX_SAFE_INTEGER : rightTime;
        return safeLeft - safeRight;
      })
  ), [bills, paymentDeskForm.studentId, paymentDeskForm.classId, paymentDeskForm.academicYearId, paymentDeskForm.feeType]);
  const paymentDeskStudentOpenOrders = useMemo(() => (
    bills
      .filter((item) => (
        String(item?.student?.userId || '') === String(paymentDeskForm.studentId || '')
        && OPEN_ORDER_STATUSES.has(String(item?.status || '').trim())
        && getBillFeeScopeSummary(item, 'tuition').outstanding > 0
      ))
      .sort((left, right) => {
        const leftTime = new Date(left?.dueDate || 0).getTime();
        const rightTime = new Date(right?.dueDate || 0).getTime();
        const safeLeft = Number.isNaN(leftTime) ? Number.MAX_SAFE_INTEGER : leftTime;
        const safeRight = Number.isNaN(rightTime) ? Number.MAX_SAFE_INTEGER : rightTime;
        return safeLeft - safeRight;
      })
  ), [bills, paymentDeskForm.studentId]);
  const paymentDeskSelectedOrderIds = useMemo(() => {
    const validIds = new Set(paymentDeskOpenOrders.map(getFeeOrderRowId).filter(Boolean));
    return paymentDeskForm.selectedFeeOrderIds.filter((item) => validIds.has(String(item || '')));
  }, [paymentDeskForm.selectedFeeOrderIds, paymentDeskOpenOrders]);
  const paymentDeskManualAllocated = useMemo(() => (
    paymentDeskOpenOrders.reduce((sum, item) => sum + (Number(paymentDeskForm.manualAllocations?.[getFeeOrderRowId(item)] || 0) || 0), 0)
  ), [paymentDeskForm.manualAllocations, paymentDeskOpenOrders]);
  const paymentDeskTotalOutstanding = useMemo(() => (
    paymentDeskOpenOrders.reduce((sum, item) => sum + getBillFeeScopeSummary(item, paymentDeskForm.feeType).outstanding, 0)
  ), [paymentDeskOpenOrders, paymentDeskForm.feeType]);
  const paymentDeskStudentTotalOutstanding = useMemo(() => (
    paymentDeskStudentOpenOrders.reduce((sum, item) => sum + getBillFeeScopeSummary(item, 'tuition').outstanding, 0)
  ), [paymentDeskStudentOpenOrders]);
  const paymentDeskMonthlyArrears = useMemo(() => {
    const grouped = new Map();
    paymentDeskStudentOpenOrders.forEach((item) => {
      const tuitionSummary = getBillFeeScopeSummary(item, 'tuition');
      const classId = getFinanceRecordClassId(item);
      const academicYearId = getFinanceRecordAcademicYearId(item);
      const bucket = String(item?.periodLabel || '').trim()
        || (item?.dueDate ? getMonthBucket(item.dueDate) : '')
        || getFeeOrderRowId(item)
        || String(grouped.size + 1);
      const groupId = [bucket, classId, academicYearId].filter(Boolean).join(':');
      const groupKey = groupId || bucket;
      const existing = grouped.get(groupKey) || {
        id: groupId || bucket,
        label: getFinanceBillMonthLabel(item),
        classTitle: item?.schoolClass?.title || item?.classId?.title || '',
        academicYearTitle: item?.academicYear?.title || item?.academicYearId?.title || '',
        dueDate: item?.dueDate || '',
        amountOriginal: 0,
        discountAmount: 0,
        penaltyAmount: 0,
        amountDue: 0,
        amountPaid: 0,
        outstandingAmount: 0,
        count: 0,
        bills: []
      };
      existing.amountOriginal += tuitionSummary.gross;
      existing.discountAmount += tuitionSummary.discount;
      existing.penaltyAmount += tuitionSummary.penalty;
      existing.amountDue += tuitionSummary.due;
      existing.amountPaid += tuitionSummary.paid;
      existing.outstandingAmount += tuitionSummary.outstanding;
      const itemDueTime = new Date(item?.dueDate || 0).getTime();
      const existingDueTime = new Date(existing.dueDate || 0).getTime();
      if (!existing.dueDate || (!Number.isNaN(itemDueTime) && (Number.isNaN(existingDueTime) || itemDueTime < existingDueTime))) {
        existing.dueDate = item?.dueDate || existing.dueDate;
      }
      existing.count += 1;
      existing.bills.push(item);
      grouped.set(groupKey, existing);
    });
    return [...grouped.values()].sort((left, right) => {
      const leftTime = new Date(left.dueDate || 0).getTime();
      const rightTime = new Date(right.dueDate || 0).getTime();
      const safeLeft = Number.isNaN(leftTime) ? Number.MAX_SAFE_INTEGER : leftTime;
      const safeRight = Number.isNaN(rightTime) ? Number.MAX_SAFE_INTEGER : rightTime;
      return safeLeft - safeRight;
    });
  }, [paymentDeskStudentOpenOrders]);
  const paymentDeskRemainingAmount = useMemo(() => (
    Number(paymentDeskForm.amount || 0) - paymentDeskManualAllocated
  ), [paymentDeskForm.amount, paymentDeskManualAllocated]);
  const paymentDeskManualMismatch = useMemo(() => (
    paymentDeskForm.allocationMode === 'manual'
      && Math.abs(Number(paymentDeskRemainingAmount || 0)) > 0.009
  ), [paymentDeskForm.allocationMode, paymentDeskRemainingAmount]);
  const paymentDeskRequiresReference = paymentDeskForm.paymentMethod !== 'cash';
  const paymentDeskCanSubmit = Boolean(
    Number(paymentDeskForm.amount || 0) > 0
    && paymentDeskForm.paidAt
    && paymentDeskOpenOrders.length
    && (!paymentDeskRequiresReference || String(paymentDeskForm.referenceNo || '').trim())
    && !(paymentDeskForm.allocationMode === 'auto_selected' && !paymentDeskSelectedOrderIds.length)
    && !(paymentDeskForm.allocationMode === 'manual' && (paymentDeskManualAllocated <= 0 || paymentDeskManualMismatch))
  );
  const openBillsCount = useMemo(() => (
    bills.filter((item) => OPEN_ORDER_STATUSES.has(String(item?.status || '').trim())).length
  ), [bills]);
  const totalOutstandingBalance = useMemo(() => (
    bills
      .filter((item) => String(item?.status || '').trim() !== 'void')
      .reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0)
  ), [bills]);
  const activeFinanceReliefCount = useMemo(() => (
    reliefs.length || (discountRegistry.length + exemptions.length)
  ), [reliefs.length, discountRegistry.length, exemptions.length]);
  const financeSections = useMemo(() => ([
    {
      key: 'overview',
      label: FINANCE_SECTION_LABELS.overview,
      hint: `${summary?.pendingReceipts || 0} در انتظار`
    },
    {
      key: 'payments',
      label: FINANCE_SECTION_LABELS.payments,
      hint: `${pendingReceipts.length} رسید`
    },
    {
      key: 'orders',
      label: FINANCE_SECTION_LABELS.orders,
      hint: `${openBillsCount} بدهی باز`
    },
    {
      key: 'expenses',
      label: FINANCE_SECTION_LABELS.expenses,
      hint: `${expenses.filter((item) => item.status === 'pending_review').length} در انتظار`
    },
    {
      key: 'discounts',
      label: FINANCE_SECTION_LABELS.discounts,
      hint: `${activeFinanceReliefCount} ثبت فعال`
    },
    {
      key: 'anomalies',
      label: FINANCE_SECTION_LABELS.anomalies,
      hint: `${anomalies.length || anomalySummary?.total || 0} مورد بررسی`
    },
    {
      key: 'reports',
      label: FINANCE_SECTION_LABELS.reports,
      hint: `${financeOverview?.byClass?.length || 0} ردیف تحلیلی`
    },
    {
      key: 'settings',
      label: FINANCE_SECTION_LABELS.settings,
      hint: `${feePlans.length} پلان فیس`
    }
  ]), [summary?.pendingReceipts, pendingReceipts.length, openBillsCount, expenses, activeFinanceReliefCount, anomalies.length, anomalySummary?.total, financeOverview?.byClass?.length, feePlans.length]);
  const indexedStudents = useMemo(() => (
    students.map((student) => ({
      student,
      searchBlob: buildStudentSearchBlob(student)
    }))
  ), [students]);
  const financeMembershipStudents = useMemo(
    () => buildFinanceMembershipStudentOptions(studentMemberships),
    [studentMemberships]
  );
  const financeMembershipStudentCount = useMemo(
    () => countFinanceMembershipStudents(studentMemberships),
    [studentMemberships]
  );
  const financeMembershipClassCounts = useMemo(() => {
    const grouped = new Map();
    (Array.isArray(studentMemberships) ? studentMemberships : [])
      .filter(isCurrentFinanceMembership)
      .forEach((item) => {
        const classId = toFinanceOptionId(item?.classId);
        if (!classId) return;
        if (!grouped.has(classId)) grouped.set(classId, new Set());
        grouped.get(classId).add(
          toFinanceOptionId(item?.studentCoreId)
          || toFinanceOptionId(item?.studentId || item?.student?._id)
          || toFinanceOptionId(item?._id || item?.id)
        );
      });
    return new Map(Array.from(grouped.entries()).map(([classId, studentIds]) => [classId, studentIds.size]));
  }, [studentMemberships]);
  const currentFinanceClassByStudentId = useMemo(() => {
    const grouped = new Map();
    (Array.isArray(studentMemberships) ? studentMemberships : [])
      .filter(isCurrentFinanceMembership)
      .forEach((item) => {
        const classId = toFinanceOptionId(item?.classId);
        if (!classId) return;
        const currentClass = {
          classId,
          classTitle: item?.classTitle || item?.class?.title || item?.schoolClass?.title || '---'
        };
        [
          item?.studentId,
          item?.student?._id,
          item?.studentCoreId,
          item?.afghanStudentId
        ].map(toFinanceOptionId).filter(Boolean).forEach((studentId) => grouped.set(studentId, currentClass));
      });
    return grouped;
  }, [studentMemberships]);
  const getPreviousClassDebtLabel = (bill = {}) => {
    const billClassId = getFinanceRecordClassId(bill);
    if (!billClassId) return '';
    const studentIds = [
      bill?.student?.userId,
      bill?.student?._id,
      bill?.student?.studentId,
      bill?.studentId
    ].map(toFinanceOptionId).filter(Boolean);
    const currentClass = studentIds.map((studentId) => currentFinanceClassByStudentId.get(studentId)).find(Boolean);
    if (!currentClass || currentClass.classId === billClassId) return '';
    return `قرض مربوط به صنف قبلی · صنف فعلی: ${currentClass.classTitle}`;
  };
  const bulkAcademicYearsByClass = useMemo(() => {
    const grouped = new Map();
    (Array.isArray(studentMemberships) ? studentMemberships : [])
      .filter(isCurrentFinanceMembership)
      .forEach((item) => {
        const classId = toFinanceOptionId(item?.classId);
        const academicYearId = toFinanceOptionId(item?.academicYearId || item?.academicYear);
        if (!classId || !academicYearId) return;
        if (!grouped.has(classId)) grouped.set(classId, []);
        const years = grouped.get(classId);
        if (!years.includes(academicYearId)) years.push(academicYearId);
      });
    return grouped;
  }, [studentMemberships]);
  const bulkFeePlanByClass = useMemo(() => {
    const grouped = new Map();
    (Array.isArray(feePlans) ? feePlans : [])
      .filter((plan) => plan?.isActive !== false && String(plan?.lifecycleStatus || 'active') === 'active')
      .forEach((plan) => {
        const classId = toFinanceOptionId(plan?.classId || plan?.schoolClass?.id || plan?.schoolClass?._id);
        if (!classId || grouped.has(classId)) return;
        grouped.set(classId, plan);
      });
    return grouped;
  }, [feePlans]);
  const selectedManualFeePlan = useMemo(() => {
    const classId = String(manualForm.classId || '').trim();
    const academicYearId = String(manualForm.academicYearId || '').trim();
    return selectActiveFeePlanForScope({
      plans: feePlans,
      classId,
      academicYearId,
      effectiveAt: manualForm.dueDate
    });
  }, [feePlans, manualForm.academicYearId, manualForm.classId, manualForm.dueDate]);
  const selectedManualPlanAmount = useMemo(() => {
    if (!selectedManualFeePlan) return 0;
    const field = MANUAL_BILL_PLAN_FIELDS[manualForm.feeType] || 'tuitionFee';
    return toSafeNumber(
      field === 'tuitionFee'
        ? (selectedManualFeePlan.tuitionFee ?? selectedManualFeePlan.amount)
        : selectedManualFeePlan[field]
    );
  }, [manualForm.feeType, selectedManualFeePlan]);
  const paymentDeskMembershipStudent = useMemo(
    () => financeMembershipStudents.find((item) => String(item?._id || '') === String(paymentDeskForm.studentId || '')) || null,
    [financeMembershipStudents, paymentDeskForm.studentId]
  );
  const indexedFinanceMembershipStudents = useMemo(() => (
    financeMembershipStudents.map((student) => ({
      student,
      searchBlob: buildStudentSearchBlob(student)
    }))
  ), [financeMembershipStudents]);
  const studentSearchBlobById = useMemo(() => (
    new Map(
      indexedFinanceMembershipStudents.flatMap((entry) => {
        const keys = [entry?.student?._id, entry?.student?.studentCoreId, entry?.student?.membershipId]
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        return keys.map((key) => [key, entry.searchBlob]);
      })
    )
  ), [indexedFinanceMembershipStudents]);
  const billsByStudentUserId = useMemo(() => buildFinanceItemsByStudentMap(bills), [bills]);
  const pendingReceiptsByStudentUserId = useMemo(() => buildFinanceItemsByStudentMap(pendingReceipts), [pendingReceipts]);
  const reliefsByStudentUserId = useMemo(() => buildFinanceItemsByStudentMap(reliefs), [reliefs]);
  const manualStudentOptions = useMemo(() => (
    buildStudentOptionList({
      indexedStudents: indexedFinanceMembershipStudents,
      term: activeSection === 'orders' && orderFormMode === 'manual' ? deferredManualStudentSearch : '',
      selectedId: manualForm.studentId
    })
  ), [indexedFinanceMembershipStudents, activeSection, orderFormMode, deferredManualStudentSearch, manualForm.studentId]);
  const paymentStudentOptions = useMemo(() => (
    buildStudentOptionList({
      indexedStudents: indexedFinanceMembershipStudents,
      term: activeSection === 'payments' ? deferredPaymentStudentSearch : '',
      selectedId: paymentDeskForm.studentId
    })
  ), [indexedFinanceMembershipStudents, activeSection, deferredPaymentStudentSearch, paymentDeskForm.studentId]);
  const discountStudentOptions = useMemo(() => (
    buildStudentOptionList({
      indexedStudents: indexedFinanceMembershipStudents,
      term: activeSection === 'discounts' && reliefFormMode === 'discount' ? deferredDiscountStudentSearch : '',
      selectedId: discountForm.studentId
    })
  ), [indexedFinanceMembershipStudents, activeSection, reliefFormMode, deferredDiscountStudentSearch, discountForm.studentId]);
  const exemptionStudentOptions = useMemo(() => (
    buildStudentOptionList({
      indexedStudents: indexedFinanceMembershipStudents,
      term: activeSection === 'discounts' && reliefFormMode === 'exemption' ? deferredExemptionStudentSearch : '',
      selectedId: exemptionForm.studentId
    })
  ), [indexedFinanceMembershipStudents, activeSection, reliefFormMode, deferredExemptionStudentSearch, exemptionForm.studentId]);
  const billMonthOptions = useMemo(() => {
    const monthMap = new Map();
    bills.forEach((bill) => {
      const key = getFinanceBillMonthFilterKey(bill);
      if (!key || monthMap.has(key)) return;
      monthMap.set(key, formatFinanceBillMonthFilterLabel(key, bill));
    });
    return [...monthMap.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((left, right) => String(right.key).localeCompare(String(left.key), 'fa'));
  }, [bills]);
  const hasBillIssuanceCriteria = Boolean(
    normalizeFinanceSearchTerm(orderSearchTerm)
    || orderClassFilter !== 'all'
    || orderFeeTypeFilter !== 'all'
    || orderMonthFilter !== 'all'
    || billIssuanceFilter !== 'all'
  );
  const billScopeRows = useMemo(() => (
    bills.filter((bill) => (
      (orderFeeTypeFilter === 'all' || getBillFeeTypes(bill).includes(orderFeeTypeFilter))
      && (orderClassFilter === 'all' || getFinanceRecordClassId(bill) === orderClassFilter)
      && (orderMonthFilter === 'all' || getFinanceBillMonthFilterKey(bill) === orderMonthFilter)
      && includesFinanceSearch([
        bill?.billNumber,
        bill?.title,
        bill?.periodLabel,
        getBillTypeLabel(bill),
        bill?.student?.name,
        bill?.student?.fullName,
        bill?.student?.email,
        bill?.student?.userId,
        bill?.student?.studentId,
        studentSearchBlobById.get(String(bill?.student?.userId || '').trim()),
        studentSearchBlobById.get(String(bill?.student?.studentId || '').trim()),
        bill?.classId?.title,
        bill?.schoolClass?.title,
        bill?.course?.title,
        bill?.status
      ], orderSearchTerm)
    ))
  ), [bills, orderSearchTerm, orderFeeTypeFilter, orderClassFilter, orderMonthFilter, studentSearchBlobById]);
  const filteredBills = useMemo(() => (
    billScopeRows.filter((bill) => (
      orderStatusFilter === 'all'
      || (orderStatusFilter === 'official' && String(bill?.status || '').trim() !== 'void')
      || String(bill?.status || '').trim() === orderStatusFilter
    ))
  ), [billScopeRows, orderStatusFilter]);
  const orderRecordStats = useMemo(() => {
    const officialBills = billScopeRows.filter((item) => String(item?.status || '').trim() !== 'void');
    const voidBills = billScopeRows.filter((item) => String(item?.status || '').trim() === 'void');
    return {
      officialCount: officialBills.length,
      voidCount: voidBills.length,
      totalCount: billScopeRows.length,
      filteredCount: filteredBills.length,
      officialTypeSummary: summarizeBillTypes(officialBills)
    };
  }, [billScopeRows, filteredBills.length]);
  const billIssuanceRows = useMemo(() => {
    const rows = new Map();
    (Array.isArray(studentMemberships) ? studentMemberships : [])
      .filter(isCurrentFinanceMembership)
      .forEach((membership) => {
        const classId = toFinanceOptionId(membership?.classId);
        const studentUserId = toFinanceOptionId(membership?.studentId || membership?.student?._id);
        const studentCoreId = toFinanceOptionId(membership?.studentCoreId);
        if (!classId || (!studentUserId && !studentCoreId)) return;
        const key = `${classId}:${studentUserId || studentCoreId}`;
        const studentBills = bills.filter((bill) => {
          const billUserId = toFinanceOptionId(bill?.student?.userId || bill?.student?._id);
          const billCoreId = toFinanceOptionId(bill?.student?.studentId);
          return getFinanceRecordClassId(bill) === classId
            && ((studentUserId && billUserId === studentUserId) || (studentCoreId && billCoreId === studentCoreId))
            && (orderFeeTypeFilter === 'all' || getBillFeeTypes(bill).includes(orderFeeTypeFilter))
            && (orderMonthFilter === 'all' || getFinanceBillMonthFilterKey(bill) === orderMonthFilter);
        });
        const officialBills = studentBills.filter((bill) => String(bill?.status || '').trim() !== 'void');
        const voidBills = studentBills.filter((bill) => String(bill?.status || '').trim() === 'void');
        const billDetails = officialBills.map((bill) => ({
          number: String(bill?.billNumber || '').trim(),
          type: getBillTypeLabel(bill),
          monthLabel: formatFinanceBillMonthFilterLabel(getFinanceBillMonthFilterKey(bill), bill),
          status: String(bill?.status || '').trim()
        }));
        rows.set(key, {
          key,
          classId,
          classTitle: membership?.classTitle || membership?.class?.title || membership?.schoolClass?.title || classOptions.find((item) => item.classId === classId)?.title || '---',
          studentName: membership?.studentName || membership?.student?.name || membership?.fullName || '---',
          admissionNo: membership?.asasNumber || membership?.admissionNo || membership?.studentCode || '',
          issued: officialBills.length > 0,
          billCount: officialBills.length,
          voidCount: voidBills.length,
          billTypeSummary: summarizeBillTypes(officialBills),
          billNumbers: studentBills.map((bill) => bill.billNumber).filter(Boolean),
          billDetails
        });
      });
    return [...rows.values()].filter((row) => (
      (orderClassFilter === 'all' || row.classId === orderClassFilter)
      && (billIssuanceFilter === 'all' || (billIssuanceFilter === 'issued' ? row.issued : !row.issued))
      && includesFinanceSearch([row.studentName, row.admissionNo, row.classTitle, ...row.billNumbers], orderSearchTerm)
    ));
  }, [studentMemberships, bills, classOptions, orderClassFilter, orderFeeTypeFilter, orderMonthFilter, billIssuanceFilter, orderSearchTerm]);
  const orderWorkspaceStats = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const openBills = bills.filter((item) => OPEN_ORDER_STATUSES.has(String(item?.status || '').trim()));
    const officialBills = bills.filter((item) => String(item?.status || '').trim() !== 'void');
    const voidBills = bills.filter((item) => String(item?.status || '').trim() === 'void');
    const monthBills = officialBills.filter((item) => {
      const rawDate = item?.dueDate || item?.createdAt || item?.updatedAt;
      const date = rawDate ? new Date(rawDate) : null;
      if (!date || Number.isNaN(date.getTime())) return false;
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === monthKey;
    });
    const overdueBills = bills.filter((item) => String(item?.status || '').trim() === 'overdue');
    const partialBills = bills.filter((item) => String(item?.status || '').trim() === 'partial');
    const activeCommitments = openBills.filter((item) => toSafeNumber(item?.outstandingAmount ?? (toSafeNumber(item?.amountDue) - toSafeNumber(item?.amountPaid))) > 0);
    return {
      totalOutstanding: openBills.reduce((sum, item) => sum + Math.max(0, toSafeNumber(item?.outstandingAmount ?? (toSafeNumber(item?.amountDue) - toSafeNumber(item?.amountPaid)))), 0),
      openCount: openBills.length,
      overdueCount: overdueBills.length,
      monthCount: monthBills.length,
      partialCount: partialBills.length,
      activeCommitments: activeCommitments.length,
      officialCount: officialBills.length,
      voidCount: voidBills.length,
      filteredCount: filteredBills.length
    };
  }, [bills, filteredBills.length]);
  const filteredDiscountRegistry = useMemo(() => (
    discountRegistry.filter((item) => (
      !String(item?.reason || '').trim().toLowerCase().startsWith('[discount:')
      && String(item?.source || '').trim().toLowerCase() !== 'finance_adjustment'
      && (discountRegistryClassFilter === 'all' || getFinanceRecordClassId(item) === discountRegistryClassFilter)
      && includesFinanceSearch([
        item?.student?.fullName,
        item?.student?.name,
        item?.student?.asasNumber,
        item?.student?.admissionNo,
        studentSearchBlobById.get(String(item?.studentMembershipId || '').trim()),
        studentSearchBlobById.get(String(item?.student?.userId || item?.student || '').trim()),
        studentSearchBlobById.get(String(item?.student?.studentId || item?.studentId || '').trim()),
        item?.schoolClass?.title,
        item?.academicYear?.title,
        item?.reason,
        item?.discountType
      ], discountRegistrySearch)
    ))
  ), [discountRegistry, discountRegistryClassFilter, discountRegistrySearch, studentSearchBlobById]);
  const discountRegistryByClass = useMemo(() => {
    const groups = new Map();
    filteredDiscountRegistry.forEach((item) => {
      const classId = getFinanceRecordClassId(item) || 'unknown';
      const classTitle = String(item?.schoolClass?.title || '').trim() || 'صنف نامشخص';
      if (!groups.has(classId)) {
        groups.set(classId, {
          classId,
          classTitle,
          count: 0,
          studentIds: new Set(),
          totalAmount: 0,
          percentCount: 0
        });
      }
      const group = groups.get(classId);
      group.count += 1;
      group.totalAmount += Number(item?.amount || 0) || 0;
      if (String(item?.coverageMode || '').trim() === 'percent') group.percentCount += 1;
      const studentId = String(item?.studentMembershipId || '').trim()
        || String(item?.student?.studentId || '').trim()
        || getFinanceRecordStudentUserId(item)
        || String(item?.student?.fullName || item?.id || '').trim();
      if (studentId) group.studentIds.add(studentId);
    });
    return Array.from(groups.values())
      .map((item) => ({
        ...item,
        discountStudentCount: item.studentIds.size,
        classStudentCount: financeMembershipClassCounts.get(item.classId) || item.studentIds.size
      }))
      .sort((left, right) => right.classStudentCount - left.classStudentCount || right.count - left.count || left.classTitle.localeCompare(right.classTitle));
  }, [filteredDiscountRegistry, financeMembershipClassCounts]);
  const discountRegistryTotalPages = Math.max(1, Math.ceil(filteredDiscountRegistry.length / Math.max(1, Number(discountRegistryPageSize) || 10)));
  const pagedDiscountRegistry = useMemo(() => {
    const pageSize = Math.max(1, Number(discountRegistryPageSize) || 10);
    const safePage = Math.min(Math.max(1, Number(discountRegistryPage) || 1), discountRegistryTotalPages);
    const start = (safePage - 1) * pageSize;
    return filteredDiscountRegistry.slice(start, start + pageSize);
  }, [discountRegistryPage, discountRegistryPageSize, discountRegistryTotalPages, filteredDiscountRegistry]);
  const filteredExemptionRegistry = useMemo(() => (
    exemptions.filter((item) => includesFinanceSearch([
      item?.student?.fullName,
      item?.student?.name,
      item?.student?.asasNumber,
      item?.student?.admissionNo,
      studentSearchBlobById.get(String(item?.studentMembershipId || '').trim()),
      studentSearchBlobById.get(String(item?.student?.userId || item?.student || '').trim()),
      studentSearchBlobById.get(String(item?.student?.studentId || item?.studentId || '').trim()),
      item?.schoolClass?.title,
      item?.academicYear?.title,
      item?.reason,
      item?.scope,
      item?.exemptionType
    ], exemptionRegistrySearch))
  ), [exemptions, exemptionRegistrySearch, studentSearchBlobById]);
  const exemptionRegistryTotalPages = Math.max(1, Math.ceil(filteredExemptionRegistry.length / Math.max(1, Number(exemptionRegistryPageSize) || 10)));
  const pagedExemptionRegistry = useMemo(() => {
    const pageSize = Math.max(1, Number(exemptionRegistryPageSize) || 10);
    const safePage = Math.min(Math.max(1, Number(exemptionRegistryPage) || 1), exemptionRegistryTotalPages);
    const start = (safePage - 1) * pageSize;
    return filteredExemptionRegistry.slice(start, start + pageSize);
  }, [exemptionRegistryPage, exemptionRegistryPageSize, exemptionRegistryTotalPages, filteredExemptionRegistry]);
  const reliefRegistryTypeOptions = useMemo(() => (
    Array.from(new Set(reliefs.map((item) => String(item?.reliefType || '').trim()).filter(Boolean)))
  ), [reliefs]);
  const filteredReliefRegistry = useMemo(() => (
    reliefs.filter((item) => (
      (reliefRegistryTypeFilter === 'all' || String(item?.reliefType || '').trim() === reliefRegistryTypeFilter)
      && includesFinanceSearch([
        item?.student?.fullName,
        item?.student?.name,
        item?.student?.asasNumber,
        item?.student?.admissionNo,
        studentSearchBlobById.get(String(item?.studentMembershipId || '').trim()),
        studentSearchBlobById.get(String(item?.student?.userId || item?.student || '').trim()),
        studentSearchBlobById.get(String(item?.student?.studentId || item?.studentId || '').trim()),
        item?.schoolClass?.title,
        item?.academicYear?.title,
        item?.reason,
        item?.scope,
        item?.reliefType,
        item?.coverageMode,
        item?.sponsorName,
        item?.sourceModel
      ], reliefRegistrySearch)
    ))
  ), [reliefs, reliefRegistrySearch, reliefRegistryTypeFilter, studentSearchBlobById]);
  const reliefRegistryTotalPages = Math.max(1, Math.ceil(filteredReliefRegistry.length / Math.max(1, Number(reliefRegistryPageSize) || 10)));
  const pagedReliefRegistry = useMemo(() => {
    const pageSize = Math.max(1, Number(reliefRegistryPageSize) || 10);
    const safePage = Math.min(Math.max(1, Number(reliefRegistryPage) || 1), reliefRegistryTotalPages);
    const start = (safePage - 1) * pageSize;
    return filteredReliefRegistry.slice(start, start + pageSize);
  }, [filteredReliefRegistry, reliefRegistryPage, reliefRegistryPageSize, reliefRegistryTotalPages]);
  const reliefRegistrySummary = useMemo(() => ({
    fixedAmount: reliefs.reduce((sum, item) => (
      String(item?.coverageMode || '').trim() === 'fixed' ? sum + toSafeNumber(item?.amount) : sum
    ), 0),
    fullCount: reliefs.filter((item) => String(item?.coverageMode || '').trim() === 'full').length,
    percentCount: reliefs.filter((item) => String(item?.coverageMode || '').trim() === 'percent').length,
    discountCount: reliefs.filter((item) => ['discount', 'sibling_discount', 'manual'].includes(String(item?.reliefType || '').trim())).length,
    exemptionCount: reliefs.filter((item) => ['waiver', 'free_student', 'scholarship_partial', 'scholarship_full', 'charity_support'].includes(String(item?.reliefType || '').trim())).length
  }), [reliefs]);
  const paymentDeskFinanceSnapshot = useMemo(() => (
    buildStudentFinanceSnapshot({
      bills,
      reliefs,
      studentId: paymentDeskForm.studentId
    })
  ), [bills, reliefs, paymentDeskForm.studentId]);
  const paymentDeskScopeSnapshot = paymentDeskFinanceSnapshot.byFeeType?.[paymentDeskForm.feeType]
    || { gross: 0, discount: 0, penalty: 0, net: 0, due: 0, paid: 0, outstanding: 0 };
  const reliefFocusStudentId = reliefFormMode === 'discount' ? discountForm.studentId : exemptionForm.studentId;
  const reliefFocusClassId = reliefFormMode === 'discount' ? discountForm.classId : exemptionForm.classId;
  const reliefFocusAcademicYearId = reliefFormMode === 'discount' ? discountForm.academicYearId : exemptionForm.academicYearId;
  const reliefFocusStudent = useMemo(
    () => students.find((item) => String(item?._id || '') === String(reliefFocusStudentId || '')) || null,
    [students, reliefFocusStudentId]
  );
  const reliefFocusClass = useMemo(
    () => classOptions.find((item) => String(item?.classId || '') === String(reliefFocusClassId || '')) || null,
    [classOptions, reliefFocusClassId]
  );
  const reliefFocusAcademicYear = useMemo(
    () => academicYears.find((item) => String(item?.id || '') === String(reliefFocusAcademicYearId || '')) || null,
    [academicYears, reliefFocusAcademicYearId]
  );
  const reliefFocusSnapshot = useMemo(() => (
    buildStudentFinanceSnapshot({
      bills,
      reliefs,
      studentId: reliefFocusStudentId,
      classId: reliefFocusClassId,
      academicYearId: reliefFocusAcademicYearId
    })
  ), [bills, reliefs, reliefFocusStudentId, reliefFocusClassId, reliefFocusAcademicYearId]);
  const reliefFocusFeeScope = reliefFormMode === 'discount' ? 'tuition' : exemptionForm.scope;
  const reliefFocusLedgerSnapshot = reliefFocusFeeScope === 'all'
    ? {
        due: reliefFocusSnapshot.totalDue,
        paid: reliefFocusSnapshot.totalPaid,
        outstanding: reliefFocusSnapshot.outstanding
      }
    : reliefFocusSnapshot.byFeeType?.[reliefFocusFeeScope] || { due: 0, paid: 0, outstanding: 0 };
  const reliefFocusTotalPages = Math.max(1, Math.ceil((reliefFocusSnapshot.scopedReliefs?.length || 0) / Math.max(1, Number(reliefFocusPageSize) || 5)));
  const pagedReliefFocusItems = useMemo(() => {
    const pageSize = Math.max(1, Number(reliefFocusPageSize) || 5);
    const safePage = Math.min(Math.max(1, Number(reliefFocusPage) || 1), reliefFocusTotalPages);
    const start = (safePage - 1) * pageSize;
    return (reliefFocusSnapshot.scopedReliefs || []).slice(start, start + pageSize);
  }, [reliefFocusPage, reliefFocusPageSize, reliefFocusSnapshot.scopedReliefs, reliefFocusTotalPages]);
  const paymentDeskStudentSearchBlob = useMemo(
    () => studentSearchBlobById.get(String(paymentDeskForm.studentId || '').trim()) || '',
    [studentSearchBlobById, paymentDeskForm.studentId]
  );
  const hasPaymentStudentSearchTerm = Boolean(normalizeFinanceSearchTerm(paymentStudentSearch));
  const highlightedPaymentStudentOptions = useMemo(
    () => (hasPaymentStudentSearchTerm ? paymentStudentOptions.slice(0, 8) : []),
    [hasPaymentStudentSearchTerm, paymentStudentOptions]
  );
  const hasDiscountStudentSearchTerm = Boolean(normalizeFinanceSearchTerm(discountStudentSearch));
  const highlightedDiscountStudentOptions = useMemo(
    () => (hasDiscountStudentSearchTerm ? discountStudentOptions.slice(0, 8) : []),
    [hasDiscountStudentSearchTerm, discountStudentOptions]
  );
  const paymentDeskActionHint = useMemo(() => {
    if (!paymentDeskForm.studentId) return 'برای فعال شدن کارت مالی و دکمه‌های پرداخت، ابتدا متعلم را از نتیجه‌های جستجو انتخاب کنید.';
    if (!paymentDeskOpenOrders.length) return 'برای این متعلم در صنف و سال تعلیمی انتخاب‌شده بدهی باز پیدا نشد.';
    if (Number(paymentDeskForm.amount || 0) <= 0) return 'مبلغ پرداخت را وارد کنید تا پیش‌نمایش پرداخت فعال شود.';
    if (paymentDeskForm.allocationMode === 'auto_selected' && !paymentDeskSelectedOrderIds.length) return 'حداقل یک بدهی را برای تخصیص انتخاب کنید.';
    if (paymentDeskForm.allocationMode === 'manual' && paymentDeskManualMismatch) return 'مجموع تخصیص دستی باید با مبلغ پرداخت برابر باشد.';
    if (!paymentPreview?.allocations?.length) return 'پیش‌نمایش پرداخت را بگیرید، سپس ثبت یا ثبت و چاپ رسید فعال می‌شود.';
    return 'پرداخت آماده ثبت است.';
  }, [
    paymentDeskForm.studentId,
    paymentDeskForm.amount,
    paymentDeskForm.allocationMode,
    paymentDeskOpenOrders.length,
    paymentDeskSelectedOrderIds.length,
    paymentDeskManualMismatch,
    paymentPreview?.allocations?.length
  ]);

  const resetPaymentDeskSelection = ({
    studentId = '',
    classId = '',
    academicYearId = ''
  } = {}) => {
    setPaymentDeskForm((prev) => ({
      ...prev,
      studentId,
      classId,
      academicYearId,
      selectedFeeOrderIds: [],
      manualAllocations: {}
    }));
    setPaymentPreview(null);
  };

  const handlePaymentStudentSearchChange = (value = '') => {
    setPaymentStudentSearch(value);
    const normalized = normalizeFinanceSearchTerm(value);
    if (!normalized) return;
    if (!paymentDeskForm.studentId) return;
    if (paymentDeskStudentSearchBlob.includes(normalized)) return;
    resetPaymentDeskSelection({
      studentId: '',
      classId: '',
      academicYearId: currentAcademicYearId
    });
  };

  const handlePaymentStudentSearchKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    if (highlightedPaymentStudentOptions.length !== 1) return;
    event.preventDefault();
    handlePaymentDeskStudentChange(highlightedPaymentStudentOptions[0]?._id || '');
  };

  const handlePaymentDeskStudentChange = (studentId = '') => {
    const normalizedStudentId = String(studentId || '').trim();
    if (!normalizedStudentId) {
      resetPaymentDeskSelection({
        studentId: '',
        classId: '',
        academicYearId: currentAcademicYearId
      });
      return;
    }

    const openBills = (billsByStudentUserId.get(normalizedStudentId) || [])
      .filter((item) => (
        OPEN_ORDER_STATUSES.has(String(item?.status || '').trim())
        && Number(item?.outstandingAmount || 0) > 0
      ))
      .sort((left, right) => {
        const leftTime = new Date(left?.dueDate || left?.issuedAt || 0).getTime();
        const rightTime = new Date(right?.dueDate || right?.issuedAt || 0).getTime();
        const safeLeft = Number.isNaN(leftTime) ? Number.MAX_SAFE_INTEGER : leftTime;
        const safeRight = Number.isNaN(rightTime) ? Number.MAX_SAFE_INTEGER : rightTime;
        if (safeLeft !== safeRight) return safeLeft - safeRight;
        return String(getFeeOrderRowId(left) || '').localeCompare(String(getFeeOrderRowId(right) || ''));
      });
    const membershipStudent = financeMembershipStudents.find((item) => String(item?._id || '') === normalizedStudentId) || null;
    const firstClassId = openBills[0]?.schoolClass?.id || openBills[0]?.classId?._id || '';
    const firstAcademicYearId = openBills[0]?.academicYear?.id || membershipStudent?.academicYearId || currentAcademicYearId || '';

    resetPaymentDeskSelection({
      studentId: normalizedStudentId,
      classId: firstClassId || membershipStudent?.classId || '',
      academicYearId: firstAcademicYearId
    });
  };

  const openDebtorInPaymentDesk = (row = {}) => {
    const match = financeMembershipStudents.find((item) => (
      String(item?._id || '') === String(row?.studentUserId || '')
      || String(item?.studentCoreId || '') === String(row?.studentCoreId || row?.studentId || '')
    ));
    if (!match?._id) {
      setMessage('عضویت مالی فعال این شاگرد برای باز کردن میز پرداخت پیدا نشد.');
      return;
    }
    handlePaymentDeskStudentChange(match._id);
    setPaymentStudentSearch(match.name || match.fullName || row?.name || '');
    setActiveSection('payments');
  };

  // Write-off entry point for the "بدهی راکد شاگردان خارج‌شده" card. Reuses
  // the existing, permission-gated void action (finance_lead/general_president
  // only, and it itself rejects voiding an order with any payment on it -
  // see voidFeeOrderAction in backend/services/financeAdminActionService.js)
  // rather than inventing a parallel write-off mechanism. The void reason is
  // tagged [dormant_writeoff:<status>] so these stay distinguishable from
  // ordinary corrections in reports/audit logs.
  const markDebtorDormant = async (row = {}) => {
    const orderIds = Array.isArray(row?.unpaidOrderIds) ? row.unpaidOrderIds : [];
    if (!orderIds.length) {
      setMessage('این شاگرد بدهی بدون‌پرداخت ندارد؛ برای بدهی‌هایی که رویشان پول نشسته از «بررسی بازپرداخت» استفاده کنید.');
      return;
    }
    const reason = window.prompt(
      `دلیل راکد اعلام‌کردن بدهی «${row?.name || 'شاگرد'}» (وضعیت: ${row?.lifecycleStatusLabel || '---'}):`,
      'شاگرد از مکتب خارج شده و پیگیری این بدهی عملی نیست'
    ) || '';
    if (!reason.trim()) return;
    const tag = `[dormant_writeoff:${row?.lifecycleStatus || 'unknown'}] ${reason.trim()}`;
    try {
      setBusy(true);
      let succeeded = 0;
      let failed = 0;
      for (const orderId of orderIds) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await postJson(`${API_BASE}/api/student-finance/orders/${orderId}/void`, { reason: tag });
          succeeded += 1;
        } catch {
          failed += 1;
        }
      }
      setMessage(
        failed
          ? `${succeeded} بل راکد اعلام شد؛ ${failed} بل ثبت نشد (مثلاً ماه مالی بسته است یا سطح دسترسی کافی نیست - باطل‌سازی فقط برای آمریت مالی یا ریاست عمومی مجاز است).`
          : `${succeeded} بل با موفقیت راکد اعلام شد.`
      );
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } finally {
      setBusy(false);
    }
  };

  // Prefills the manual-refund form with this debtor's largest paid-but-open
  // bill instead of just dropping the user on an empty "پرداخت‌ها" tab.
  const openDepartedDebtorRefund = (row = {}) => {
    const refundableIds = new Set(Array.isArray(row?.refundableOrderIds) ? row.refundableOrderIds : []);
    if (!refundableIds.size) {
      setMessage('بدهی این شاگرد پرداختی ندارد که قابل بازپرداخت باشد؛ برای این نوع بدهی از «راکد اعلام کردن» استفاده کنید.');
      setActiveSection('payments');
      return;
    }
    const picked = bills
      .filter((bill) => refundableIds.has(String(bill?._id || '')))
      .sort((a, b) => Number(b?.amountPaid || 0) - Number(a?.amountPaid || 0))[0] || null;
    if (picked?._id) {
      setManualRefundForm({
        feeOrderId: String(picked._id),
        amount: '',
        reason: 'membership_ended',
        reasonNote: `${row?.name || 'شاگرد'} در وضعیت «${row?.lifecycleStatusLabel || '---'}» است؛ بدهی راکد بابت بل ${formatFinanceCode(picked.billNumber, '---')}.`
      });
    }
    setActiveSection('payments');
  };

  const applyManualMembershipStudent = (studentId = '') => {
    const normalizedStudentId = String(studentId || '').trim();
    const membershipStudent = financeMembershipStudents.find((item) => String(item?._id || '') === normalizedStudentId) || null;
    setManualForm((prev) => ({
      ...prev,
      studentId: normalizedStudentId,
      classId: membershipStudent?.classId || prev.classId,
      academicYearId: membershipStudent?.academicYearId || prev.academicYearId,
      academicYear: membershipStudent?.academicYearTitle || prev.academicYear
    }));
  };

  const resolveBulkAcademicYearId = (classId = '', requestedYearId = '') => {
    const normalizedClassId = String(classId || '').trim();
    const normalizedYearId = String(requestedYearId || '').trim();
    const planYearId = toFinanceOptionId(bulkFeePlanByClass.get(normalizedClassId)?.academicYearId);
    if (normalizedYearId && normalizedYearId === planYearId) return normalizedYearId;
    if (planYearId) return planYearId;
    const classYears = bulkAcademicYearsByClass.get(normalizedClassId) || [];
    if (normalizedYearId && (!classYears.length || classYears.includes(normalizedYearId))) return normalizedYearId;
    return classYears[0] || normalizedYearId || currentAcademicYearId || '';
  };

  const applyBulkClassSelection = (classId = '') => {
    const normalizedClassId = String(classId || '').trim();
    const academicYearId = resolveBulkAcademicYearId(normalizedClassId, bulkForm.academicYearId);
    const classPlan = selectActiveFeePlanForScope({
      plans: feePlans,
      classId: normalizedClassId,
      academicYearId,
      effectiveAt: bulkForm.dueDate
    }) || bulkFeePlanByClass.get(normalizedClassId);
    setBulkForm((prev) => ({
      ...prev,
      classId: normalizedClassId,
      academicYearId,
      periodType: classPlan ? getFeePlanBillPeriodType(classPlan) : prev.periodType
    }));
    setBillingPreview(null);
  };

  const buildBulkBillPayload = () => {
    const classId = String(bulkForm.classId || '').trim();
    const academicYearId = resolveBulkAcademicYearId(classId, bulkForm.academicYearId);
    const selectedPlan = selectActiveFeePlanForScope({
      plans: feePlans,
      classId,
      academicYearId,
      effectiveAt: bulkForm.dueDate
    });
    return {
      ...bulkForm,
      classId,
      academicYearId,
      feePlanId: String(selectedPlan?._id || selectedPlan?.id || '').trim(),
      periodType: selectedPlan ? getFeePlanBillPeriodType(selectedPlan) : bulkForm.periodType,
      term: String(bulkForm.term || selectedPlan?.term || '').trim(),
      dueDate: String(bulkForm.dueDate || '').trim()
    };
  };

  const getBulkPreviewEmptyMessage = (data = {}) => {
    const excluded = Array.isArray(data?.excluded) ? data.excluded : [];
    const reasons = excluded.reduce((acc, item) => {
      const reason = String(item?.reason || '').trim();
      if (reason) acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {});
    if (reasons.zero_amount) {
      return 'برای این صنف مبلغ قابل بل‌دهی صفر است؛ مبلغ فیس را در پلان مالی فعال همان صنف و سال تعلیمی تنظیم کنید.';
    }
    if (reasons.not_debtor) {
      return 'گزینه فقط بدهکاران فعال است، اما برای این صنف بدهی باز پیدا نشد.';
    }
    if (!excluded.length) {
      return 'برای این صنف و سال تعلیمی عضویت فعال پیدا نشد. سال تعلیمی یا عضویت شاگردان صنف را بررسی کنید.';
    }
    return 'برای این فیلتر موردی برای پیش‌نمایش بل پیدا نشد.';
  };

  const getBulkPreviewExcludedReasons = (data = {}) => {
    const summaryReasons = data?.summary?.excludedReasons && typeof data.summary.excludedReasons === 'object'
      ? data.summary.excludedReasons
      : null;
    const reasons = summaryReasons || (Array.isArray(data?.excluded) ? data.excluded : []).reduce((acc, item) => {
      const reason = String(item?.reason || 'unknown').trim() || 'unknown';
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {});
    const labels = {
      fee_plan_not_found: 'پلان مالی فعال برای این صنف/سال پیدا نشد',
      zero_amount: 'مبلغ قابل بل‌دهی صفر است',
      outside_membership_period: 'تاریخ انتخاب‌شده خارج از دوره عضویت شاگرد یا ماه فیس‌دار در پلان است',
      not_debtor: 'گزینه فقط بدهکاران فعال است',
      unknown: 'دلیل نامشخص'
    };
    return Object.entries(reasons)
      .filter(([, count]) => Number(count || 0) > 0)
      .map(([reason, count]) => `${labels[reason] || reason}: ${count}`);
  };

  const buildManualBillPayload = () => {
    const normalizedStudentId = String(manualForm.studentId || '').trim();
    const selectedMembership = financeMembershipStudents.find((item) => (
      String(item?._id || '') === normalizedStudentId
      && (!manualForm.classId || String(item?.classId || '') === String(manualForm.classId || ''))
    )) || financeMembershipStudents.find((item) => String(item?._id || '') === normalizedStudentId) || null;
    const selectedAcademicYear = academicYears.find((item) => (
      String(item?.id || '') === String(manualForm.academicYearId || selectedMembership?.academicYearId || '')
    )) || null;

    return {
      ...manualForm,
      studentId: normalizedStudentId,
      classId: String(manualForm.classId || selectedMembership?.classId || '').trim(),
      academicYearId: String(manualForm.academicYearId || selectedMembership?.academicYearId || '').trim(),
      academicYear: String(manualForm.academicYear || selectedAcademicYear?.title || selectedMembership?.academicYearTitle || '').trim(),
      amount: manualForm.amountSource === 'manual' ? String(manualForm.amount || '').trim() : '',
      feePlanId: manualForm.amountSource === 'plan' ? String(selectedManualFeePlan?._id || selectedManualFeePlan?.id || '').trim() : '',
      periodType: manualForm.feeType === 'admission'
        ? 'custom'
        : manualForm.feeType === 'tuition' && manualForm.amountSource === 'plan' && selectedManualFeePlan
          ? getFeePlanBillPeriodType(selectedManualFeePlan)
          : 'term',
      term: String(manualForm.term || selectedManualFeePlan?.term || '').trim(),
      dueDate: String(manualForm.dueDate || '').trim()
    };
  };

  const applyDiscountMembershipStudent = (studentId = '') => {
    const normalizedStudentId = String(studentId || '').trim();
    const membershipStudent = financeMembershipStudents.find((item) => String(item?._id || '') === normalizedStudentId) || null;
    setDiscountForm((prev) => ({
      ...prev,
      studentId: normalizedStudentId,
      studentMembershipId: membershipStudent?.membershipId || '',
      classId: membershipStudent?.classId || '',
      academicYearId: membershipStudent?.academicYearId || ''
    }));
  };

  const applyExemptionMembershipStudent = (studentId = '') => {
    const normalizedStudentId = String(studentId || '').trim();
    const membershipStudent = financeMembershipStudents.find((item) => String(item?._id || '') === normalizedStudentId) || null;
    setExemptionForm((prev) => ({
      ...prev,
      studentId: normalizedStudentId,
      studentMembershipId: membershipStudent?.membershipId || '',
      classId: membershipStudent?.classId || '',
      academicYearId: membershipStudent?.academicYearId || ''
    }));
  };

  const findFinanceMembershipId = ({ studentId = '', classId = '', academicYearId = '' } = {}) => {
    const normalizedStudentId = String(studentId || '').trim();
    const normalizedClassId = String(classId || '').trim();
    const normalizedAcademicYearId = String(academicYearId || '').trim();
    const exact = financeMembershipStudents.find((item) => (
      String(item?._id || '') === normalizedStudentId
      && String(item?.classId || '') === normalizedClassId
      && String(item?.academicYearId || '') === normalizedAcademicYearId
    ));
    const fallback = financeMembershipStudents.find((item) => String(item?._id || '') === normalizedStudentId);
    return String((exact || fallback)?.membershipId || '').trim();
  };

  const selectedDiscountMembershipStudent = useMemo(() => {
    const membershipId = String(discountForm.studentMembershipId || '').trim();
    const studentId = String(discountForm.studentId || '').trim();
    return financeMembershipStudents.find((item) => membershipId && String(item?.membershipId || '') === membershipId)
      || financeMembershipStudents.find((item) => studentId && String(item?._id || '') === studentId)
      || null;
  }, [discountForm.studentId, discountForm.studentMembershipId, financeMembershipStudents]);

  useEffect(() => {
    if (discountForm.targetScope !== 'student' || !discountForm.studentId || !selectedDiscountMembershipStudent) return;
    const nextMembershipId = selectedDiscountMembershipStudent.membershipId || '';
    const nextClassId = selectedDiscountMembershipStudent.classId || '';
    const nextAcademicYearId = selectedDiscountMembershipStudent.academicYearId || '';
    if (
      String(discountForm.studentMembershipId || '') === String(nextMembershipId || '')
      && String(discountForm.classId || '') === String(nextClassId || '')
      && String(discountForm.academicYearId || '') === String(nextAcademicYearId || '')
    ) return;
    setDiscountForm((prev) => ({
      ...prev,
      studentMembershipId: nextMembershipId,
      classId: nextClassId,
      academicYearId: nextAcademicYearId
    }));
  }, [
    discountForm.academicYearId,
    discountForm.classId,
    discountForm.studentId,
    discountForm.studentMembershipId,
    discountForm.targetScope,
    selectedDiscountMembershipStudent
  ]);

  const filteredFeePlans = useMemo(() => (
    feePlans.filter((plan) => includesFinanceSearch([
      plan?.title,
      plan?.planCode,
      FEE_PLAN_TYPE_LABELS[plan?.planType] || plan?.planType,
      plan?.schoolClass?.title,
      plan?.academicYear?.title,
      plan?.academicYear,
      plan?.term,
      plan?.billingFrequency,
      plan?.eligibilityRule
    ], feePlanSearchTerm))
  ), [feePlans, feePlanSearchTerm]);

  const selectedFeePlanClass = useMemo(
    () => classOptions.find((item) => String(item?.classId || '') === String(feePlanForm.classId || '')) || null,
    [classOptions, feePlanForm.classId]
  );
  const selectedFeePlanAcademicYear = useMemo(
    () => academicYears.find((item) => String(item?.id || '') === String(feePlanForm.academicYearId || '')) || null,
    [academicYears, feePlanForm.academicYearId]
  );
  const matchingActiveFeePlan = useMemo(() => {
    const classId = String(feePlanForm.classId || '').trim();
    const academicYearId = String(feePlanForm.academicYearId || '').trim();
    if (!classId || !academicYearId) return null;
    return feePlans
      .filter((plan) => {
        const lifecycleStatus = String(plan?.lifecycleStatus || (plan?.isActive === false ? 'inactive' : 'active')).trim() || 'active';
        const sameClass = String(plan?.classId || plan?.schoolClass?._id || plan?.schoolClass?.id || '') === classId;
        const sameYear = String(plan?.academicYearId || plan?.academicYear?._id || plan?.academicYear?.id || '') === academicYearId;
        const sameFrequency = String(plan?.billingFrequency || 'term') === String(feePlanForm.billingFrequency || 'term');
        const sameTerm = String(plan?.term || '').trim() === String(feePlanForm.term || '').trim();
        return lifecycleStatus === 'active' && sameClass && sameYear && sameFrequency && sameTerm;
      })
      .sort((left, right) => {
        const defaultDelta = (right?.isDefault === true ? 1 : 0) - (left?.isDefault === true ? 1 : 0);
        if (defaultDelta !== 0) return defaultDelta;
        return toSafeNumber(left?.priority ?? 100) - toSafeNumber(right?.priority ?? 100);
      })[0] || null;
  }, [feePlans, feePlanForm.academicYearId, feePlanForm.billingFrequency, feePlanForm.classId, feePlanForm.term]);
  const feePlanFormHasAmounts = useMemo(
    () => FEE_PLAN_LINE_CONFIG.some((item) => toSafeNumber(feePlanForm[item.key]) > 0),
    [feePlanForm]
  );
  const feePlanPreviewSource = !feePlanFormHasAmounts && matchingActiveFeePlan ? matchingActiveFeePlan : feePlanForm;
  const feePlanLineItems = useMemo(() => (
    FEE_PLAN_LINE_CONFIG.map((item) => {
      const amount = toSafeNumber(
        item.key === 'tuitionFee'
          ? (feePlanPreviewSource?.tuitionFee ?? feePlanPreviewSource?.amount)
          : feePlanPreviewSource?.[item.key]
      );
      return {
        ...item,
        amount,
        active: amount > 0
      };
    })
  ), [feePlanPreviewSource]);
  const feePlanActiveLineItems = useMemo(
    () => feePlanLineItems.filter((item) => item.active),
    [feePlanLineItems]
  );
  const feePlanTotalAmount = useMemo(
    () => feePlanLineItems.reduce((sum, item) => sum + item.amount, 0),
    [feePlanLineItems]
  );
  const sameScopeFeePlans = useMemo(() => (
    feePlans.filter((plan) => {
      const sameClass = String(plan?.classId || plan?.schoolClass?._id || plan?.schoolClass?.id || '') === String(feePlanForm.classId || '');
      const sameYear = String(plan?.academicYearId || plan?.academicYear?._id || plan?.academicYear?.id || '') === String(feePlanForm.academicYearId || '');
      const sameFrequency = String(plan?.billingFrequency || 'term') === String(feePlanForm.billingFrequency || 'term');
      const sameTerm = String(plan?.term || '').trim() === String(feePlanForm.term || '').trim();
      return sameClass && sameYear && sameFrequency && sameTerm;
    })
  ), [feePlans, feePlanForm.academicYearId, feePlanForm.billingFrequency, feePlanForm.classId, feePlanForm.term]);

  const canReviewReceipt = (receipt) => {
    if (!receipt || receipt.status !== 'pending') return false;
    if (financeRole === 'general_president') return true;
    if (financeRole === 'finance_manager') return true;
    return false;
  };

  const getApproveLabel = (receipt) => {
    return 'تایید نهایی';
  };

  const defaultMonthKey = useMemo(() => {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${m}`;
  }, []);
  const defaultCashierDate = useMemo(() => toInputDate(new Date()), []);
  const [monthKey, setMonthKey] = useState(defaultMonthKey);
  const [documentBatchForm, setDocumentBatchForm] = useState({
    classId: '',
    academicYearId: '',
    monthKey: defaultMonthKey
  });
  const [cashierReportDate, setCashierReportDate] = useState(defaultCashierDate);
  const [cashierReport, setCashierReport] = useState(null);
  const [reportClassId, setReportClassId] = useState('');
  const [reportAcademicYearId, setReportAcademicYearId] = useState('');
  const [auditTimeline, setAuditTimeline] = useState([]);
  const [auditTimelineSummary, setAuditTimelineSummary] = useState(null);
  const [auditTimelineSearch, setAuditTimelineSearch] = useState('');
  const [auditTimelineKindFilter, setAuditTimelineKindFilter] = useState('all');
  const [auditTimelineSeverityFilter, setAuditTimelineSeverityFilter] = useState('all');
  const [selectedAuditEntryId, setSelectedAuditEntryId] = useState('');
  const financeFlowTrendSeries = useMemo(() => (
    buildFinanceFlowTrendSeries(financeOverview?.series?.daily || [], incomeTrendRange)
  ), [financeOverview?.series?.daily, incomeTrendRange]);
  const financeFlowTrendChart = useMemo(() => (
    buildFinanceMultiLineChart(financeFlowTrendSeries)
  ), [financeFlowTrendSeries]);
  const overviewDebtors = useMemo(() => (
    Array.isArray(financeOverview?.topDebtors) ? financeOverview.topDebtors : []
  ), [financeOverview?.topDebtors]);
  // Legacy/dormant arrears: open balance of students who have already left
  // (منفک/تبدیل/محروم/...) - kept as a separate list from overviewDebtors so
  // it never mixes into the "follow up normally" active-debtor list. See
  // buildDebtorGroups in backend/services/financeDashboardService.js.
  const departedDebtors = useMemo(() => (
    Array.isArray(financeOverview?.departedDebtors) ? financeOverview.departedDebtors : []
  ), [financeOverview?.departedDebtors]);
  const filteredDepartedDebtors = useMemo(() => departedDebtors.filter((row) => includesFinanceSearch([
    row?.name,
    row?.classTitle,
    row?.studentId,
    row?.asasNumber,
    row?.admissionNo,
    studentSearchBlobById.get(String(row?.studentUserId || '').trim()),
    studentSearchBlobById.get(String(row?.studentCoreId || row?.studentId || '').trim())
  ], debtorSearchTerm)), [departedDebtors, debtorSearchTerm, studentSearchBlobById]);
  const filteredOverviewDebtors = useMemo(() => overviewDebtors.filter((row) => {
    if (!includesFinanceSearch([
      row?.name,
      row?.classTitle,
      row?.studentId,
      row?.asasNumber,
      row?.admissionNo,
      studentSearchBlobById.get(String(row?.studentUserId || '').trim()),
      studentSearchBlobById.get(String(row?.studentCoreId || row?.studentId || '').trim())
    ], debtorSearchTerm)) return false;
    const lateDays = Number(row?.maxLateDays || 0);
    if (debtorDelayFilter === '1') return lateDays >= 1;
    if (debtorDelayFilter === '30') return lateDays >= 30;
    if (debtorDelayFilter === '60') return lateDays >= 60;
    return true;
  }), [overviewDebtors, debtorDelayFilter, debtorSearchTerm, studentSearchBlobById]);
  const debtorPageCount = Math.max(1, Math.ceil(filteredOverviewDebtors.length / 10));
  const paginatedOverviewDebtors = useMemo(() => (
    filteredOverviewDebtors.slice((debtorPage - 1) * 10, debtorPage * 10)
  ), [filteredOverviewDebtors, debtorPage]);
  const problemStudents = useMemo(() => (
    overviewDebtors
      .filter((row) => Number(row?.maxLateDays || 0) > 0)
      .sort((left, right) => {
        const delayDelta = Number(right?.maxLateDays || 0) - Number(left?.maxLateDays || 0);
        return delayDelta || Number(right?.amount || 0) - Number(left?.amount || 0);
      })
      .slice(0, 5)
  ), [overviewDebtors]);
  const problemStudentSummary = useMemo(() => ({
    count: overviewDebtors.filter((row) => Number(row?.maxLateDays || 0) > 0).length,
    amount: overviewDebtors
      .filter((row) => Number(row?.maxLateDays || 0) > 0)
      .reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    overdueOrders: overviewDebtors.reduce((sum, row) => sum + Number(row?.overdueOrderCount || 0), 0),
    critical: overviewDebtors.filter((row) => row?.risk === 'critical').length
  }), [overviewDebtors]);
  const financeOverviewKpis = financeOverview?.kpis || {};
  const openRefundItems = refunds.filter((item) => ['pending_review', 'approved'].includes(String(item?.status || '')));
  const financeSmartCards = [
    {
      key: 'issued',
      label: 'بل‌های صادرشده',
      value: financeOverviewKpis?.issuedBills?.amount,
      meta: `${fmt(financeOverviewKpis?.issuedBills?.count || 0)} بل · ${fmt(financeOverviewKpis?.issuedBills?.studentCount || 0)} شاگرد`,
      tone: 'sky',
      section: 'orders'
    },
    {
      key: 'revenue',
      label: 'عواید تاییدشده',
      value: financeOverviewKpis?.approvedRevenue?.amount,
      meta: `${fmt(financeOverviewKpis?.approvedRevenue?.count || 0)} پرداخت`,
      tone: 'emerald',
      section: 'payments'
    },
    {
      key: 'outstanding',
      label: 'مجموع باقیات',
      value: financeOverviewKpis?.outstanding?.amount,
      meta: `${fmt(financeOverviewKpis?.outstanding?.count || 0)} بل باز`,
      tone: 'rose',
      section: 'reports'
    },
    {
      key: 'reliefs',
      label: 'تخفیف و معافیت',
      value: financeOverviewKpis?.reliefs?.amount,
      meta: `${fmt(financeOverviewKpis?.reliefs?.count || 0)} بل دارای تسهیلات`,
      tone: 'amber',
      section: 'discounts'
    },
    {
      key: 'expenses',
      label: 'مصارف تاییدشده',
      value: financeOverviewKpis?.expenses?.amount,
      meta: `${fmt(financeOverviewKpis?.expenses?.count || 0)} سند مصرف`,
      tone: 'violet',
      section: 'reports'
    },
    {
      key: 'net',
      label: 'خالص عواید',
      value: financeOverviewKpis?.netCash?.amount,
      meta: 'عواید منهای مصارف تاییدشده',
      tone: Number(financeOverviewKpis?.netCash?.amount || 0) >= 0 ? 'cyan' : 'rose',
      section: 'reports'
    },
    {
      key: 'pending',
      label: 'رسیدهای در انتظار',
      value: financeOverviewKpis?.pendingReceipts?.amount,
      meta: `${fmt(financeOverviewKpis?.pendingReceipts?.count || 0)} رسید`,
      tone: 'slate',
      section: 'payments'
    },
    {
      key: 'overdue',
      label: 'باقیات سررسید گذشته',
      value: financeOverviewKpis?.overdue?.amount,
      meta: `${fmt(financeOverviewKpis?.overdue?.count || 0)} بل`,
      tone: 'orange',
      section: 'reports'
    },
    {
      key: 'refunds',
      label: 'بازپرداخت‌های باز',
      value: openRefundItems.reduce((sum, item) => sum + Number(item?.amount || 0), 0),
      meta: `${fmt(openRefundItems.length)} مورد`,
      tone: 'rose',
      section: 'payments'
    },
    {
      key: 'legacyArrears',
      label: 'بدهی راکد خارج‌شدگان',
      value: financeOverviewKpis?.legacyArrears?.amount,
      meta: `${fmt(financeOverviewKpis?.legacyArrears?.count || 0)} شاگرد منفک/تبدیل/محروم`,
      tone: 'amber',
      section: 'overview'
    }
  ];

  const fetchJson = async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), ...getAuthHeaders() }
    });
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text();
    if (!contentType.includes('application/json')) {
      const message = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')
        ? 'مسیر API روی سرور فعال نیست یا هنوز نسخه جدید backend deploy نشده است.'
        : (text.trim() || 'پاسخ سرور JSON معتبر نیست.');
      throw new Error(message);
    }
    try {
      return JSON.parse(text || '{}');
    } catch {
      throw new Error('پاسخ سرور JSON معتبر نیست.');
    }
  };

  const buildScopedReportUrl = (path) => {
    const url = new URL(`${API_BASE}${path}`, window.location.origin);
    if (reportClassId) {
      url.searchParams.set('classId', reportClassId);
    }
    if (reportAcademicYearId) {
      url.searchParams.set('academicYearId', reportAcademicYearId);
    }
    return url.toString();
  };

  const buildFinanceOverviewUrl = () => {
    const url = new URL(`${API_BASE}/api/finance/admin/dashboard/overview`, window.location.origin);
    if (financeOverviewRange.from) url.searchParams.set('from', financeOverviewRange.from);
    if (financeOverviewRange.to) url.searchParams.set('to', financeOverviewRange.to);
    if (reportClassId) url.searchParams.set('classId', reportClassId);
    if (reportAcademicYearId) url.searchParams.set('academicYearId', reportAcademicYearId);
    url.searchParams.set('recentLimit', '10');
    url.searchParams.set('debtorLimit', '200');
    return url.toString();
  };

  const buildDeliveryOperationsQuery = ({ includeLimit = false } = {}) => {
    const searchParams = new URLSearchParams();
    if (deliveryRetryChannelFilter !== 'all') {
      searchParams.set('channel', deliveryRetryChannelFilter);
    }
    if (deliveryOpsStatusFilter !== 'all') {
      searchParams.set('status', deliveryOpsStatusFilter);
    }
    if (deliveryOpsProviderFilter !== 'all') {
      searchParams.set('provider', deliveryOpsProviderFilter);
    }
    if (deliveryOpsFailureFilter !== 'all') {
      searchParams.set('failureCode', deliveryOpsFailureFilter);
    }
    if (deliveryOpsRetryableFilter === 'retryable') {
      searchParams.set('retryable', 'true');
    } else if (deliveryOpsRetryableFilter === 'blocked') {
      searchParams.set('retryable', 'false');
    }
    if (includeLimit) {
      searchParams.set('limit', '12');
    }
    const query = searchParams.toString();
    return query ? `?${query}` : '';
  };

  const buildDeliveryRecoveryQuery = ({ includeLimit = false } = {}) => {
    const searchParams = new URLSearchParams();
    if (deliveryRetryChannelFilter !== 'all') {
      searchParams.set('channel', deliveryRetryChannelFilter);
    }
    if (deliveryOpsStatusFilter !== 'all') {
      searchParams.set('status', deliveryOpsStatusFilter);
    }
    if (deliveryOpsProviderFilter !== 'all') {
      searchParams.set('provider', deliveryOpsProviderFilter);
    }
    if (deliveryOpsFailureFilter !== 'all') {
      searchParams.set('failureCode', deliveryOpsFailureFilter);
    }
    if (deliveryOpsRetryableFilter === 'retryable') {
      searchParams.set('retryable', 'true');
    } else if (deliveryOpsRetryableFilter === 'blocked') {
      searchParams.set('retryable', 'false');
    }
    if (deliveryRecoveryStateFilter !== 'all') {
      searchParams.set('recoveryState', deliveryRecoveryStateFilter);
    }
    if (includeLimit) {
      searchParams.set('limit', '12');
    }
    const query = searchParams.toString();
    return query ? `?${query}` : '';
  };

  const loadAll = async () => {
    const paymentWorkspaceRefreshId = ++paymentWorkspaceRefreshIdRef.current;
    setBusy(true);
    try {
      const requestedFullOrders = fullOrdersLoadedRef.current;
      const ordersRequestUrl = `${API_BASE}/api/student-finance/orders${requestedFullOrders ? '' : '?view=open'}`;
      const safeFetchJson = async (url, fallback = { success: false }) => {
        try {
          return await fetchJson(url);
        } catch (error) {
          return {
            ...fallback,
            success: false,
            _loadError: error?.message || 'دریافت اطلاعات از سرور ناموفق بود.'
          };
        }
      };
      const [
        refData,
        membershipData,
        summaryData,
        overviewData,
        ordersData,
        paymentsData,
        feePlansData,
        monthsData,
        discountRegistryData,
        reliefsData,
        exemptionsData,
        deliveryProviderData,
        deliveryCampaignData,
        deliveryTemplateData,
        deliveryAnalyticsData,
        deliveryRetryQueueData,
        deliveryRecoveryQueueData,
        documentArchiveData,
        auditTimelineData,
        anomaliesData,
        refundsData,
        monthlyTrendData,
        expensesData,
        expenseCategoriesData,
        treasuryAnalyticsData
      ] = await Promise.all([
        safeFetchJson(`${API_BASE}/api/finance/admin/reference-data`, { success: false, students: [], classes: [], academicYears: [] }),
        safeFetchJson(`${API_BASE}/api/finance/admin/student-memberships`, { success: true, items: [] }),
        safeFetchJson(`${API_BASE}/api/finance/admin/summary`, { success: false, summary: null, topDebtors: [] }),
        safeFetchJson(buildFinanceOverviewUrl(), { success: false, overview: null }),
        safeFetchJson(ordersRequestUrl, { success: true, items: [] }),
        safeFetchJson(`${API_BASE}/api/student-finance/payments?view=all`, { success: true, items: [] }),
        safeFetchJson(`${API_BASE}/api/finance/admin/fee-plans`, { success: true, items: [] }),
        safeFetchJson(`${API_BASE}/api/finance/admin/month-close`, { success: true, items: [] }),
        safeFetchJson(`${API_BASE}/api/student-finance/discounts?status=active&registryOnly=true&discountType=discount`, { success: true, items: [], duplicateSummary: null }),
        safeFetchJson(`${API_BASE}/api/student-finance/reliefs?status=active&registryOnly=true`, { success: true, items: [] }),
        safeFetchJson(`${API_BASE}/api/student-finance/exemptions?status=active`, { success: true, items: [] }),
        Promise.resolve({ success: true, items: [] }),
        Promise.resolve({ success: true, items: [] }),
        Promise.resolve({ success: true, items: [], variables: [] }),
        Promise.resolve({ success: true, analytics: null }),
        Promise.resolve({ success: true, items: [] }),
        Promise.resolve({ success: true, items: [] }),
        safeFetchJson(`${API_BASE}/api/finance/admin/document-archive?limit=12`, { success: true, items: [] }),
        safeFetchJson(buildScopedReportUrl('/api/finance/admin/reports/audit-timeline'), { success: true, items: [], summary: null }),
        safeFetchJson(buildScopedReportUrl('/api/finance/admin/reports/anomalies'), { success: true, items: [], summary: null }),
        safeFetchJson(`${API_BASE}/api/student-finance/refunds?limit=200`, { success: true, items: [] }),
        safeFetchJson(`${API_BASE}/api/finance/admin/dashboard/monthly-trend?months=12`, { success: true, months: [] }),
        safeFetchJson(`${API_BASE}/api/finance/admin/expenses`, { success: true, items: [] }),
        safeFetchJson(`${API_BASE}/api/finance/admin/expense-categories`, { success: true, items: [] }),
        safeFetchJson(`${API_BASE}/api/finance/admin/treasury/analytics`, { success: true, analytics: null })
      ]);

      if (!refData?.success) {
        setMessage(refData?.message || 'خطا در دریافت اطلاعات مالی');
        return;
      }

      const nextClassOptions = normalizeClassOptions(refData);
      const nextAcademicYears = normalizeAcademicYearOptions(refData);
      const defaultAcademicYearId = refData?.currentAcademicYearId || nextAcademicYears[0]?.id || '';
      const nextBills = ordersData?.success ? (ordersData.items || []).map(toLegacyLikeBillRow) : [];
      const nextPendingReceipts = paymentsData?.success ? (paymentsData.items || []).map(toLegacyLikeReceiptRow) : [];
      const nextStudentMemberships = membershipData?.success ? (membershipData.items || []) : [];
      const nextMembershipStudents = buildFinanceMembershipStudentOptions(nextStudentMemberships);
      const shouldApplyOrdersResult = requestedFullOrders || !fullOrdersLoadedRef.current;
      const shouldApplyPaymentWorkspace = paymentWorkspaceRefreshId === paymentWorkspaceRefreshIdRef.current;
      if (shouldApplyPaymentWorkspace) {
        setFinanceDataErrors({
          orders: ordersData?.success ? '' : (ordersData?._loadError || ordersData?.message || 'دریافت بل‌ها و باقیات ناموفق بود.'),
          payments: paymentsData?.success ? '' : (paymentsData?._loadError || paymentsData?.message || 'دریافت پرداخت‌ها و رسیدها ناموفق بود.')
        });
        if (!shouldApplyOrdersResult) {
          setFinanceDataErrors((previous) => ({ ...previous, orders: '' }));
        }
      }
      setStudents(refData.students || []);
      setStudentMemberships(nextStudentMemberships);
      setClassOptions(nextClassOptions);
      setAcademicYears(nextAcademicYears);
      if (shouldApplyPaymentWorkspace && summaryData?.success) {
        setSummary(summaryData.summary || null);
      }
      if (shouldApplyPaymentWorkspace && overviewData?.success) {
        setFinanceOverview(overviewData.overview || null);
      }
      if (shouldApplyPaymentWorkspace && shouldApplyOrdersResult && ordersData?.success) setBills(nextBills);
      if (shouldApplyPaymentWorkspace && paymentsData?.success) setPendingReceipts(nextPendingReceipts);
      setFeePlans(feePlansData?.success ? (feePlansData.items || []) : []);
      setClosedMonths(monthsData?.success ? (monthsData.items || []) : []);
      if (shouldApplyPaymentWorkspace) {
        if (discountRegistryData?.success) {
          setDiscountRegistry(discountRegistryData.items || []);
          setDiscountDuplicateSummary(discountRegistryData.duplicateSummary
            || { scanned: 0, duplicateGroups: 0, duplicateRecords: 0, affectedStudents: 0, affectedClasses: 0, mirroredDiscountRecords: 0, mirroredActiveReliefs: 0 });
        }
        if (reliefsData?.success) setReliefs(reliefsData.items || []);
        if (exemptionsData?.success) setExemptions(exemptionsData.items || []);
      }
        setDeliveryProviderConfigs(deliveryProviderData?.success ? (deliveryProviderData.items || []) : []);
        setDeliveryCampaigns(deliveryCampaignData?.success ? (deliveryCampaignData.items || []) : []);
        setDeliveryTemplates(deliveryTemplateData?.success ? (deliveryTemplateData.items || []) : []);
        setDeliveryTemplateVariables(deliveryTemplateData?.success ? (deliveryTemplateData.variables || []) : []);
        setDeliveryAnalytics(deliveryAnalyticsData?.success ? (deliveryAnalyticsData.analytics || null) : null);
        setDeliveryRetryQueue(deliveryRetryQueueData?.success ? (deliveryRetryQueueData.items || []) : []);
        setDeliveryRecoveryQueue(deliveryRecoveryQueueData?.success ? (deliveryRecoveryQueueData.items || []) : []);
      setDocumentArchiveItems(documentArchiveData?.success ? (documentArchiveData.items || []) : []);
      setAuditTimeline(auditTimelineData?.success ? (auditTimelineData.items || []) : []);
      setAuditTimelineSummary(auditTimelineData?.success ? (auditTimelineData.summary || null) : null);
      if (shouldApplyPaymentWorkspace && anomaliesData?.success) {
        setAnomalies(anomaliesData.items || []);
        setAnomalySummary(anomaliesData.summary || null);
      }
      if (shouldApplyPaymentWorkspace && refundsData?.success) {
        setRefunds(refundsData.items || []);
      }
      if (shouldApplyPaymentWorkspace && monthlyTrendData?.success) {
        setMonthlyTrend(monthlyTrendData.months || []);
      }
      if (shouldApplyPaymentWorkspace && expensesData?.success) {
        setExpenses(expensesData.items || []);
      }
      if (shouldApplyPaymentWorkspace && expenseCategoriesData?.success) {
        setExpenseCategories(expenseCategoriesData.items || []);
      }
      if (shouldApplyPaymentWorkspace && treasuryAnalyticsData?.success) {
        setTreasuryAccounts(treasuryAnalyticsData.analytics?.accounts || []);
      }

      // Finance operation forms must follow current memberships, not every student user in the system.
      if (nextMembershipStudents.length === 1) {
        const onlyStudent = nextMembershipStudents[0];
        const onlyStudentId = onlyStudent._id;
        if (!manualForm.studentId) setManualForm((prev) => ({
          ...prev,
          studentId: onlyStudentId,
          classId: onlyStudent.classId || prev.classId,
          academicYearId: onlyStudent.academicYearId || prev.academicYearId,
          academicYear: onlyStudent.academicYearTitle || prev.academicYear
        }));
        if (!paymentDeskForm.studentId) setPaymentDeskForm((prev) => ({
          ...prev,
          studentId: onlyStudentId,
          classId: onlyStudent.classId || prev.classId,
          academicYearId: onlyStudent.academicYearId || prev.academicYearId
        }));
        if (!discountForm.studentId) setDiscountForm((prev) => ({
          ...prev,
          studentId: onlyStudentId,
          studentMembershipId: onlyStudent.membershipId || '',
          classId: onlyStudent.classId || prev.classId,
          academicYearId: onlyStudent.academicYearId || prev.academicYearId
        }));
        if (!exemptionForm.studentId) setExemptionForm((prev) => ({
          ...prev,
          studentId: onlyStudentId,
          studentMembershipId: onlyStudent.membershipId || '',
          classId: onlyStudent.classId || prev.classId,
          academicYearId: onlyStudent.academicYearId || prev.academicYearId
        }));
      } else {
        // If multiple membership students, leave studentId empty for user selection.
        if (!manualForm.studentId) setManualForm((prev) => ({ ...prev, studentId: '' }));
        if (!paymentDeskForm.studentId) setPaymentDeskForm((prev) => ({ ...prev, studentId: '' }));
        if (!discountForm.studentId) setDiscountForm((prev) => ({ ...prev, studentId: '', studentMembershipId: '' }));
        if (!exemptionForm.studentId) setExemptionForm((prev) => ({ ...prev, studentId: '', studentMembershipId: '' }));
      }
      if (nextClassOptions.length && !manualForm.classId) {
        const firstClassId = nextClassOptions[0].classId;
        const firstClassMembershipYear = nextMembershipStudents.find((item) => String(item?.classId || '') === String(firstClassId || ''))?.academicYearId || defaultAcademicYearId;
        setManualForm((prev) => ({
          ...prev,
          classId: firstClassId,
          academicYearId: prev.academicYearId || firstClassMembershipYear || defaultAcademicYearId
        }));
        setBulkForm((prev) => ({ ...prev, classId: firstClassId, academicYearId: prev.academicYearId || firstClassMembershipYear || defaultAcademicYearId }));
        setFeePlanForm((prev) => ({ ...prev, classId: firstClassId }));
        setPaymentDeskForm((prev) => ({ ...prev, classId: prev.classId || firstClassId }));
        setDiscountForm((prev) => ({ ...prev, classId: prev.classId || firstClassId }));
        setExemptionForm((prev) => ({ ...prev, classId: prev.classId || firstClassId }));
      }
      if (defaultAcademicYearId && !feePlanForm.academicYearId) {
        setFeePlanForm((prev) => ({ ...prev, academicYearId: defaultAcademicYearId }));
      }
      if (defaultAcademicYearId && !bulkForm.academicYearId) {
        const membershipYear = nextMembershipStudents.find((item) => String(item?.classId || '') === String((bulkForm.classId || nextClassOptions[0]?.classId || '') || ''))?.academicYearId || '';
        setBulkForm((prev) => ({ ...prev, academicYearId: membershipYear || defaultAcademicYearId }));
      }
      if (defaultAcademicYearId && !paymentDeskForm.academicYearId) {
        setPaymentDeskForm((prev) => ({ ...prev, academicYearId: defaultAcademicYearId }));
      }
      if (defaultAcademicYearId && !discountForm.academicYearId) {
        setDiscountForm((prev) => ({ ...prev, academicYearId: defaultAcademicYearId }));
      }
      if (defaultAcademicYearId && !exemptionForm.academicYearId) {
        setExemptionForm((prev) => ({ ...prev, academicYearId: defaultAcademicYearId }));
      }
      if (nextClassOptions.length && !documentBatchForm.classId) {
        setDocumentBatchForm((prev) => ({ ...prev, classId: nextClassOptions[0].classId }));
      }
      if (defaultAcademicYearId && !documentBatchForm.academicYearId) {
        setDocumentBatchForm((prev) => ({ ...prev, academicYearId: defaultAcademicYearId }));
      }
      if (nextClassOptions.length && !deliveryCampaignForm.classId) {
        setDeliveryCampaignForm((prev) => ({ ...prev, classId: nextClassOptions[0].classId }));
      }
      if (defaultAcademicYearId && !deliveryCampaignForm.academicYearId) {
        setDeliveryCampaignForm((prev) => ({ ...prev, academicYearId: defaultAcademicYearId }));
      }
      if ((defaultMonthKey || monthKey) && !deliveryCampaignForm.monthKey) {
        setDeliveryCampaignForm((prev) => ({ ...prev, monthKey: prev.monthKey || defaultMonthKey || monthKey }));
      }
      if (shouldApplyPaymentWorkspace && paymentsData?.success) {
        setSelectedReceiptId((current) => (
          nextPendingReceipts.some((item) => String(item?._id || '') === String(current || ''))
            ? current
            : (nextPendingReceipts[0]?._id || '')
        ));
      }
      if (!selectedAuditEntryId && auditTimelineData?.success && auditTimelineData.items?.[0]?.id) {
        setSelectedAuditEntryId(auditTimelineData.items[0].id);
      }
      if (!selectedMonthCloseId && monthsData?.success && monthsData.items?.[0]?._id) {
        setSelectedMonthCloseId(monthsData.items[0]._id);
      }
      setMessage('');
    } catch {
      setMessage('خطا در ارتباط با سرور');
    } finally {
      if (paymentWorkspaceRefreshId === paymentWorkspaceRefreshIdRef.current) {
        setBusy(false);
      }
    }
  };

  const fetchReceiptDetailRow = async (paymentId) => {
    const data = await fetchJson(`${API_BASE}/api/student-finance/payments/${paymentId}/receipt`);
    if (!data?.success || !data?.item) {
      throw new Error(data?.message || 'جزئیات رسید پرداخت دریافت نشد.');
    }
    return toDetailedReceiptRow(data);
  };

  const refreshPaymentWorkspace = async ({
    includeAnomalies = false,
    includeRegistries = false,
    invalidatePreview = true
  } = {}) => {
    const refreshId = ++paymentWorkspaceRefreshIdRef.current;
    setBusy(true);
    if (invalidatePreview) setPaymentPreview(null);

    const safeFetchJson = async (url, fallback = { success: false }) => {
      try {
        return await fetchJson(url);
      } catch (error) {
        return {
          ...fallback,
          success: false,
          _loadError: error?.message || 'دریافت اطلاعات از سرور ناموفق بود.'
        };
      }
    };

    try {
      const requestedFullOrders = fullOrdersLoadedRef.current;
      const ordersRequestUrl = `${API_BASE}/api/student-finance/orders${requestedFullOrders ? '' : '?view=open'}`;
      const [
        summaryData,
        overviewData,
        ordersData,
        paymentsData,
        anomaliesData,
        discountRegistryData,
        reliefsData,
        exemptionsData,
        refundsData,
        monthlyTrendData,
        expensesData
      ] = await Promise.all([
        safeFetchJson(`${API_BASE}/api/finance/admin/summary`, { success: false, summary: null, topDebtors: [] }),
        safeFetchJson(buildFinanceOverviewUrl(), { success: false, overview: null }),
        safeFetchJson(ordersRequestUrl, { success: false, items: [] }),
        safeFetchJson(`${API_BASE}/api/student-finance/payments?view=all`, { success: false, items: [] }),
        includeAnomalies
          ? safeFetchJson(buildScopedReportUrl('/api/finance/admin/reports/anomalies'), { success: false, items: [], summary: null })
          : Promise.resolve(null),
        includeRegistries
          ? safeFetchJson(`${API_BASE}/api/student-finance/discounts?status=active&registryOnly=true&discountType=discount`, { success: false, items: [], duplicateSummary: null })
          : Promise.resolve(null),
        includeRegistries
          ? safeFetchJson(`${API_BASE}/api/student-finance/reliefs?status=active&registryOnly=true`, { success: false, items: [] })
          : Promise.resolve(null),
        includeRegistries
          ? safeFetchJson(`${API_BASE}/api/student-finance/exemptions?status=active`, { success: false, items: [] })
          : Promise.resolve(null),
        safeFetchJson(`${API_BASE}/api/student-finance/refunds?limit=200`, { success: false, items: [] }),
        safeFetchJson(`${API_BASE}/api/finance/admin/dashboard/monthly-trend?months=12`, { success: false, months: [] }),
        safeFetchJson(`${API_BASE}/api/finance/admin/expenses`, { success: false, items: [] })
      ]);

      if (refreshId !== paymentWorkspaceRefreshIdRef.current) return false;

      if (summaryData?.success) {
        setSummary(summaryData.summary || null);
      }
      if (overviewData?.success) {
        setFinanceOverview(overviewData.overview || null);
      }
      const shouldApplyOrdersResult = requestedFullOrders || !fullOrdersLoadedRef.current;
      if (ordersData?.success && shouldApplyOrdersResult) {
        setBills((ordersData.items || []).map(toLegacyLikeBillRow));
      }
      setFinanceDataErrors((prev) => ({
        ...prev,
        orders: ordersData?.success || !shouldApplyOrdersResult ? '' : (ordersData?._loadError || ordersData?.message || 'تازه‌سازی بل‌ها و باقیات ناموفق بود.'),
        payments: paymentsData?.success ? '' : (paymentsData?._loadError || paymentsData?.message || 'تازه‌سازی پرداخت‌ها و رسیدها ناموفق بود.')
      }));
      if (paymentsData?.success) {
        const nextPendingReceipts = (paymentsData.items || []).map(toLegacyLikeReceiptRow);
        setPendingReceipts(nextPendingReceipts);
        setSelectedReceiptDetail(null);
        setSelectedReceiptId((current) => (
          nextPendingReceipts.some((item) => String(item?._id || '') === String(current || ''))
            ? current
            : (nextPendingReceipts[0]?._id || '')
        ));
      }
      if (anomaliesData?.success) {
        setAnomalies(anomaliesData.items || []);
        setAnomalySummary(anomaliesData.summary || null);
      }
      if (discountRegistryData?.success) {
        setDiscountRegistry(discountRegistryData.items || []);
        setDiscountDuplicateSummary(discountRegistryData.duplicateSummary
          || { scanned: 0, duplicateGroups: 0, duplicateRecords: 0, affectedStudents: 0, affectedClasses: 0, mirroredDiscountRecords: 0, mirroredActiveReliefs: 0 });
      }
      if (reliefsData?.success) setReliefs(reliefsData.items || []);
      if (exemptionsData?.success) setExemptions(exemptionsData.items || []);
      if (refundsData?.success) setRefunds(refundsData.items || []);
      if (monthlyTrendData?.success) setMonthlyTrend(monthlyTrendData.months || []);
      if (expensesData?.success) setExpenses(expensesData.items || []);
      return true;
    } finally {
      if (refreshId === paymentWorkspaceRefreshIdRef.current) {
        setBusy(false);
      }
    }
  };

  const loadCashierReport = async () => {
    try {
      const cashierReportData = await fetchJson(`${API_BASE}/api/student-finance/reports/daily-cashier?date=${encodeURIComponent(cashierReportDate)}`);
      setCashierReport(cashierReportData?.success ? cashierReportData : null);
    } catch {
      setCashierReport(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    resolveActiveSchoolContext()
      .then((context) => {
        if (mounted) setActiveSchoolContext(context || null);
      })
      .catch(() => {
        if (mounted) setActiveSchoolContext(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    reportClassId,
    reportAcademicYearId,
    deliveryRetryChannelFilter,
    deliveryOpsStatusFilter,
    deliveryOpsProviderFilter,
    deliveryOpsFailureFilter,
    deliveryOpsRetryableFilter,
    deliveryRecoveryStateFilter
  ]);

  // Without this, the finance dashboard only reloads on mount or after its
  // own mutations - a status change recorded from the academic lifecycle
  // screen (a separate page/component with no shared client cache) stays
  // invisible here until the user manually refreshes. The backend broadcasts
  // finance:lifecycle-changed after every transfer/dropout/expulsion/
  // suspension/resume/... (see broadcastFinanceLifecycleChange in
  // backend/utils/financeLifecycleNotifications.js).
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return () => {};
    const socket = io(API_BASE, { auth: { token } });
    let debounceTimer = null;
    socket.on('finance:lifecycle-changed', () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => { loadAll(); }, 600);
    });
    return () => {
      window.clearTimeout(debounceTimer);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;
    setFinanceOverviewLoading(true);
    fetchJson(buildFinanceOverviewUrl())
      .then((data) => {
        if (mounted && data?.success) setFinanceOverview(data.overview || null);
      })
      .catch((error) => {
        if (mounted) setMessage(error?.message || 'تازه‌سازی داشبورد مالی ناموفق بود.');
      })
      .finally(() => {
        if (mounted) setFinanceOverviewLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financeOverviewRange.from, financeOverviewRange.to, reportClassId, reportAcademicYearId]);

  useEffect(() => {
    if (activeSection !== 'orders'
      || fullOrdersLoadedRef.current
      || fullOrdersLoadInFlightRef.current) {
      return undefined;
    }

    const controller = new AbortController();
    const refreshId = paymentWorkspaceRefreshIdRef.current;
    fullOrdersLoadInFlightRef.current = true;
    setOrdersCatalogLoading(true);
    fetchJson(`${API_BASE}/api/student-finance/orders`, { signal: controller.signal })
      .then((data) => {
        if (!data?.success) throw new Error(data?.message || 'دریافت فهرست کامل بل‌ها ناموفق بود.');
        if (refreshId !== paymentWorkspaceRefreshIdRef.current) return;
        fullOrdersLoadedRef.current = true;
        setBills((data.items || []).map(toLegacyLikeBillRow));
        setFinanceDataErrors((previous) => ({ ...previous, orders: '' }));
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        if (refreshId !== paymentWorkspaceRefreshIdRef.current) return;
        setFinanceDataErrors((previous) => ({
          ...previous,
          orders: error?.message || 'دریافت فهرست کامل بل‌ها ناموفق بود.'
        }));
      })
      .finally(() => {
        fullOrdersLoadInFlightRef.current = false;
        setOrdersCatalogLoading(false);
      });

    return () => {
      controller.abort();
      fullOrdersLoadInFlightRef.current = false;
    };
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== 'payments') return undefined;
    void refreshPaymentWorkspace({ includeRegistries: true });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  useEffect(() => {
    setBillVisibleCount(5);
  }, [orderSearchTerm, orderStatusFilter, orderFeeTypeFilter, orderClassFilter, orderMonthFilter]);

  useEffect(() => {
    setDebtorPage(1);
  }, [debtorDelayFilter, debtorSearchTerm, reportClassId, reportAcademicYearId]);

  useEffect(() => {
    if (debtorPage > debtorPageCount) setDebtorPage(debtorPageCount);
  }, [debtorPage, debtorPageCount]);

  useEffect(() => {
    loadCashierReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashierReportDate]);

  useEffect(() => {
    const classId = String(admissionBatchForm.classId || '').trim();
    if (!classId) {
      setAdmissionBatchPreview({ loading: false, items: [], error: '' });
      return undefined;
    }

    const controller = new AbortController();
    setAdmissionBatchPreview((prev) => ({ ...prev, loading: true, error: '' }));
    const query = new URLSearchParams({
      classId,
      type: 'admission_missing',
      limit: '500'
    });
    fetchJson(`${API_BASE}/api/finance/admin/reports/anomalies?${query.toString()}`, {
      signal: controller.signal
    })
      .then((data) => {
        if (!data?.success) {
          setAdmissionBatchPreview({ loading: false, items: [], error: data?.message || 'بررسی داخله صنف ممکن نشد.' });
          return;
        }
        const items = (Array.isArray(data.items) ? data.items : [])
          .filter((item) => String(item?.anomalyType || '').trim() === 'admission_missing');
        setAdmissionBatchPreview({ loading: false, items, error: '' });
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setAdmissionBatchPreview({ loading: false, items: [], error: error?.message || 'بررسی داخله صنف ممکن نشد.' });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admissionBatchForm.classId, admissionBatchRefreshKey]);

  useEffect(() => {
    const classId = String(admissionReceiptCorrectionForm.classId || '').trim();
    if (!classId) {
      setAdmissionReceiptCorrectionPreview({ loading: false, items: [], summary: null, error: '' });
      return undefined;
    }

    const controller = new AbortController();
    setAdmissionReceiptCorrectionPreview((prev) => ({ ...prev, loading: true, error: '' }));
    const query = new URLSearchParams({ classId });
    fetchJson(`${API_BASE}/api/finance/admin/admission-receipt-corrections/preview?${query.toString()}`, {
      signal: controller.signal
    })
      .then((data) => {
        if (!data?.success) {
          setAdmissionReceiptCorrectionPreview({
            loading: false,
            items: [],
            summary: null,
            error: data?.message || 'پیش‌نمایش اصلاح رسیدهای داخله ممکن نشد.'
          });
          return;
        }
        setAdmissionReceiptCorrectionPreview({
          loading: false,
          items: Array.isArray(data.items) ? data.items : [],
          summary: data.summary || null,
          error: ''
        });
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setAdmissionReceiptCorrectionPreview({
          loading: false,
          items: [],
          summary: null,
          error: error?.message || 'پیش‌نمایش اصلاح رسیدهای داخله ممکن نشد.'
        });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admissionReceiptCorrectionForm.classId, admissionReceiptCorrectionRefreshKey]);

  useEffect(() => {
    const classId = String(paymentScopeRepairForm.classId || '').trim();
    if (!classId) {
      setPaymentScopeRepairPreview({ loading: false, items: [], summary: null, error: '' });
      return undefined;
    }

    const controller = new AbortController();
    setPaymentScopeRepairPreview((prev) => ({ ...prev, loading: true, error: '' }));
    const query = new URLSearchParams({ classId });
    fetchJson(`${API_BASE}/api/finance/admin/payment-scope-repairs/preview?${query.toString()}`, {
      signal: controller.signal
    })
      .then((data) => {
        if (!data?.success) {
          setPaymentScopeRepairPreview({
            loading: false,
            items: [],
            summary: null,
            error: data?.message || 'بررسی تفکیک پرداخت‌های فیس و داخله ممکن نشد.'
          });
          return;
        }
        setPaymentScopeRepairPreview({
          loading: false,
          items: Array.isArray(data.items) ? data.items : [],
          summary: data.summary || null,
          error: ''
        });
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setPaymentScopeRepairPreview({
          loading: false,
          items: [],
          summary: null,
          error: error?.message || 'بررسی تفکیک پرداخت‌های فیس و داخله ممکن نشد.'
        });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentScopeRepairForm.classId, paymentScopeRepairRefreshKey]);

  useEffect(() => {
    const classId = String(classPaymentApprovalForm.classId || '').trim();
    const feeType = String(classPaymentApprovalForm.feeType || 'all').trim();
    if (!classId) {
      setClassPaymentApprovalPreview({ loading: false, items: [], summary: null, error: '' });
      return undefined;
    }

    const controller = new AbortController();
    setClassPaymentApprovalPreview((prev) => ({ ...prev, loading: true, error: '' }));
    const query = new URLSearchParams({ classId, feeType });
    fetchJson(`${API_BASE}/api/finance/admin/payment-approvals/preview?${query.toString()}`, {
      signal: controller.signal
    })
      .then((data) => {
        if (!data?.success) {
          setClassPaymentApprovalPreview({
            loading: false,
            items: [],
            summary: null,
            error: data?.message || 'پیش‌نمایش تأیید نهایی گروهی ممکن نشد.'
          });
          return;
        }
        setClassPaymentApprovalPreview({
          loading: false,
          items: Array.isArray(data.items) ? data.items : [],
          summary: data.summary || null,
          error: ''
        });
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setClassPaymentApprovalPreview({
          loading: false,
          items: [],
          summary: null,
          error: error?.message || 'پیش‌نمایش تأیید نهایی گروهی ممکن نشد.'
        });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classPaymentApprovalForm.classId, classPaymentApprovalForm.feeType, classPaymentApprovalRefreshKey]);

  useEffect(() => {
    setDiscountRegistryPage(1);
  }, [discountRegistryClassFilter, discountRegistryPageSize, discountRegistrySearch]);

  useEffect(() => {
    if (discountRegistryPage > discountRegistryTotalPages) {
      setDiscountRegistryPage(discountRegistryTotalPages);
    }
  }, [discountRegistryPage, discountRegistryTotalPages]);

  useEffect(() => {
    setReliefRegistryPage(1);
  }, [reliefRegistryPageSize, reliefRegistrySearch, reliefRegistryTypeFilter]);

  useEffect(() => {
    if (reliefRegistryPage > reliefRegistryTotalPages) {
      setReliefRegistryPage(reliefRegistryTotalPages);
    }
  }, [reliefRegistryPage, reliefRegistryTotalPages]);

  useEffect(() => {
    setExemptionRegistryPage(1);
  }, [exemptionRegistryPageSize, exemptionRegistrySearch]);

  useEffect(() => {
    if (exemptionRegistryPage > exemptionRegistryTotalPages) {
      setExemptionRegistryPage(exemptionRegistryTotalPages);
    }
  }, [exemptionRegistryPage, exemptionRegistryTotalPages]);

  useEffect(() => {
    setReliefFocusPage(1);
  }, [reliefFocusAcademicYearId, reliefFocusClassId, reliefFocusPageSize, reliefFocusStudentId]);

  useEffect(() => {
    if (reliefFocusPage > reliefFocusTotalPages) {
      setReliefFocusPage(reliefFocusTotalPages);
    }
  }, [reliefFocusPage, reliefFocusTotalPages]);

  useEffect(() => {
    if (!closedMonths.length) {
      if (selectedMonthCloseId) setSelectedMonthCloseId('');
      setSelectedMonthCloseDetail(null);
      return;
    }
    if (!selectedMonthCloseId || !closedMonths.some((item) => String(item?._id || item?.id || '') === String(selectedMonthCloseId))) {
      setSelectedMonthCloseId(String(closedMonths[0]?._id || closedMonths[0]?.id || ''));
    }
  }, [closedMonths, selectedMonthCloseId]);

  useEffect(() => {
    if (!deliveryCampaigns.length) {
      if (selectedDeliveryCampaignId) setSelectedDeliveryCampaignId('');
      return;
    }
    if (!selectedDeliveryCampaignId || !deliveryCampaigns.some((item) => String(item?._id || '') === String(selectedDeliveryCampaignId))) {
      setSelectedDeliveryCampaignId(String(deliveryCampaigns[0]?._id || ''));
    }
  }, [deliveryCampaigns, selectedDeliveryCampaignId]);

  useEffect(() => {
    if (!deliveryProviderConfigs.length) {
      if (selectedDeliveryProviderChannel) setSelectedDeliveryProviderChannel('sms');
      return;
    }
    if (!selectedDeliveryProviderChannel || !deliveryProviderConfigs.some((item) => String(item?.channel || '') === String(selectedDeliveryProviderChannel))) {
      setSelectedDeliveryProviderChannel(String(deliveryProviderConfigs[0]?.channel || 'sms'));
    }
  }, [deliveryProviderConfigs, selectedDeliveryProviderChannel]);

  useEffect(() => {
    if (!documentArchiveItems.length) {
      if (selectedDocumentArchiveId) setSelectedDocumentArchiveId('');
      return;
    }
    if (!selectedDocumentArchiveId || !documentArchiveItems.some((item) => String(item?._id || item?.documentNo || '') === String(selectedDocumentArchiveId))) {
      setSelectedDocumentArchiveId(String(documentArchiveItems[0]?._id || documentArchiveItems[0]?.documentNo || ''));
    }
  }, [documentArchiveItems, selectedDocumentArchiveId]);

  useEffect(() => {
    const activeDocument = documentArchiveItems.find((item) => String(item?._id || item?.documentNo || '') === String(selectedDocumentArchiveId || ''))
      || documentArchiveItems[0]
      || null;
    if (!activeDocument?.documentNo) return;
    setDocumentDeliveryForm((prev) => ({
      ...prev,
      subject: prev.subject && prev.subject.includes(String(activeDocument.documentNo || '').trim())
        ? prev.subject
        : `Finance document ${String(activeDocument.documentNo || '').trim()}`
    }));
  }, [documentArchiveItems, selectedDocumentArchiveId]);

  useEffect(() => {
    let active = true;
    if (!selectedMonthCloseId) {
      setSelectedMonthCloseDetail(null);
      return () => {};
    }
    const loadMonthCloseDetail = async () => {
      const data = await fetchJson(`${API_BASE}/api/finance/admin/month-close/${selectedMonthCloseId}`);
      if (!active) return;
      if (data?.success && data?.item) {
        setSelectedMonthCloseDetail(data.item);
        return;
      }
      setSelectedMonthCloseDetail(null);
    };
    loadMonthCloseDetail();
    return () => {
      active = false;
    };
  }, [selectedMonthCloseId, closedMonths]);

  const receiptInboxSummary = useMemo(() => ({
    total: pendingReceipts.length,
    pending: pendingReceipts.filter((item) => item.status === 'pending').length,
    approved: pendingReceipts.filter((item) => item.status === 'approved').length,
    rejected: pendingReceipts.filter((item) => item.status === 'rejected').length,
    escalated: pendingReceipts.filter((item) => getReceiptFollowUpStatus(item) === 'escalated').length
  }), [pendingReceipts]);

  const filteredReceipts = useMemo(() => (
    pendingReceipts.filter((item) => (
      (receiptStatusFilter === 'all'
        ? true
        : String(item?.status || '').trim() === receiptStatusFilter)
      && (receiptSourceFilter === 'all'
        ? true
        : String(item?.sourceKey || '').trim() === receiptSourceFilter)
      && (receiptStageFilter === 'all'
        ? true
        : normalizeReceiptStage(item.approvalStage || '') === receiptStageFilter)
      && (receiptFollowUpFilter === 'all'
        ? true
        : getReceiptFollowUpStatus(item) === receiptFollowUpFilter)
      && (receiptAcademicYearFilter === 'all'
        ? true
        : String(item?.academicYear?.id || item?.academicYear?._id || '').trim() === receiptAcademicYearFilter)
      && (receiptClassFilter === 'all'
        ? true
        : String(item?.classId?._id || item?.classId?.id || '').trim() === receiptClassFilter)
      && includesFinanceSearch([
        item?.student?.name,
        item?.student?.fullName,
        item?.student?.asasNumber,
        item?.student?.admissionNo,
        item?.asasNumber,
        item?.admissionNo,
        studentSearchBlobById.get(String(item?.student?.userId || item?.student || '').trim()),
        studentSearchBlobById.get(String(item?.student?.studentId || item?.studentId || '').trim()),
        studentSearchBlobById.get(String(item?.studentMembershipId || '').trim()),
        item?.bill?.billNumber,
        item?.paymentNumber,
        item?.referenceNo,
        item?.paymentMethod,
        item?.status,
        PAYMENT_SOURCE_UI_LABELS[item?.sourceKey] || item?.sourceKey || ''
      ], receiptSearchTerm)
    ))
  ), [
    pendingReceipts,
    receiptStatusFilter,
    receiptSourceFilter,
    receiptStageFilter,
    receiptFollowUpFilter,
    receiptAcademicYearFilter,
    receiptClassFilter,
    receiptSearchTerm,
    studentSearchBlobById
  ]);

  const receiptTotalPages = Math.max(1, Math.ceil(filteredReceipts.length / RECEIPT_PAGE_SIZE));
  const effectiveReceiptPage = Math.min(Math.max(1, receiptPage), receiptTotalPages);
  const paginatedReceipts = useMemo(() => {
    const start = (effectiveReceiptPage - 1) * RECEIPT_PAGE_SIZE;
    return filteredReceipts.slice(start, start + RECEIPT_PAGE_SIZE);
  }, [filteredReceipts, effectiveReceiptPage]);
  const receiptPageStart = filteredReceipts.length
    ? ((effectiveReceiptPage - 1) * RECEIPT_PAGE_SIZE) + 1
    : 0;
  const receiptPageEnd = Math.min(effectiveReceiptPage * RECEIPT_PAGE_SIZE, filteredReceipts.length);

  useEffect(() => {
    setReceiptPage(1);
  }, [
    receiptStatusFilter,
    receiptSourceFilter,
    receiptStageFilter,
    receiptFollowUpFilter,
    receiptAcademicYearFilter,
    receiptClassFilter,
    receiptSearchTerm
  ]);

  useEffect(() => {
    setReceiptPage((current) => Math.min(Math.max(1, current), receiptTotalPages));
  }, [receiptTotalPages]);

  useEffect(() => {
    if (!activePaymentTool) return;
    const anchor = PAYMENT_TOOL_OPTIONS.find((item) => item.value === activePaymentTool);
    if (!anchor) return;
    const el = document.querySelector(`[data-testid="${anchor.anchorTestId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activePaymentTool]);

  useEffect(() => {
    if (!paginatedReceipts.length) {
      if (selectedReceiptId) setSelectedReceiptId('');
      setSelectedReceiptDetail(null);
      return;
    }
    if (!selectedReceiptId || !paginatedReceipts.some((item) => item._id === selectedReceiptId)) {
      setSelectedReceiptId(paginatedReceipts[0]._id);
      setSelectedReceiptDetail(null);
    }
  }, [paginatedReceipts, selectedReceiptId]);

  const selectedReportClass = useMemo(() => (
    classOptions.find((item) => item.classId === reportClassId) || null
  ), [classOptions, reportClassId]);

  const filteredAuditTimeline = useMemo(() => (
    auditTimeline.filter((item) => (
      (!reportClassId
        ? true
        : !String(item?.classTitle || '').trim()
          || String(item?.classTitle || '').trim() === String(selectedReportClass?.title || '').trim())
      && (
      (auditTimelineKindFilter === 'all'
        ? true
        : String(item?.kind || '').trim() === auditTimelineKindFilter)
      && (auditTimelineSeverityFilter === 'all'
        ? true
        : String(item?.severity || '').trim() === auditTimelineSeverityFilter)
      && includesFinanceSearch([
        item?.title,
        item?.description,
        item?.studentName,
        item?.asasNumber,
        item?.admissionNo,
        studentSearchBlobById.get(String(item?.studentUserId || '').trim()),
        studentSearchBlobById.get(String(item?.studentCoreId || item?.studentId || '').trim()),
        studentSearchBlobById.get(String(item?.studentMembershipId || '').trim()),
        item?.classTitle,
        item?.academicYearTitle,
        item?.referenceNumber,
        item?.secondaryReference,
        item?.actorName,
        item?.status,
        item?.sourceLabel,
        item?.note,
        item?.reason,
        ...(Array.isArray(item?.tags) ? item.tags : [])
      ], auditTimelineSearch)
      )
    ))
  ), [auditTimeline, reportClassId, selectedReportClass, auditTimelineKindFilter, auditTimelineSeverityFilter, auditTimelineSearch, studentSearchBlobById]);

  const auditTimelineStats = useMemo(() => ({
    total: filteredAuditTimeline.length,
    actionRequired: filteredAuditTimeline.filter((item) => item?.actionRequired).length,
    critical: filteredAuditTimeline.filter((item) => item?.severity === 'critical').length,
    payments: filteredAuditTimeline.filter((item) => item?.kind === 'payment').length
  }), [filteredAuditTimeline]);

  const selectedAuditEntry = useMemo(() => (
    filteredAuditTimeline.find((item) => item.id === selectedAuditEntryId)
    || auditTimeline.find((item) => item.id === selectedAuditEntryId)
    || filteredAuditTimeline[0]
    || null
  ), [filteredAuditTimeline, auditTimeline, selectedAuditEntryId]);
  const selectedMonthClose = useMemo(() => (
    closedMonths.find((item) => String(item?._id || item?.id || '') === String(selectedMonthCloseId || ''))
    || closedMonths[0]
    || null
  ), [closedMonths, selectedMonthCloseId]);
  const monthCloseSnapshot = selectedMonthCloseDetail?.snapshot || selectedMonthClose?.snapshot || null;
  const selectedMonthCloseStatus = normalizeMonthCloseStatus(selectedMonthCloseDetail?.status || selectedMonthClose?.status || '');
  const selectedMonthCloseStage = normalizeMonthCloseApprovalStage(
    selectedMonthCloseDetail?.approvalStage
    || selectedMonthClose?.approvalStage
    || (selectedMonthCloseStatus === 'closed' || selectedMonthCloseStatus === 'reopened' ? 'completed' : '')
  );
  const monthCloseReadiness = monthCloseSnapshot?.readiness || selectedMonthCloseDetail?.readiness || selectedMonthClose?.readiness || {
    readyToApprove: true,
    blockingIssues: [],
    warningIssues: []
  };
  const monthCloseApprovalTrail = useMemo(() => (
    Array.isArray(selectedMonthCloseDetail?.approvalTrail)
      ? selectedMonthCloseDetail.approvalTrail
      : Array.isArray(selectedMonthClose?.approvalTrail)
        ? selectedMonthClose.approvalTrail
        : []
  ), [selectedMonthCloseDetail?.approvalTrail, selectedMonthClose?.approvalTrail]);
  const canApproveSelectedMonthClose = Boolean(selectedMonthCloseDetail?.canApprove || selectedMonthClose?.canApprove)
    || (selectedMonthCloseStatus === 'pending_review' && canReviewMonthCloseForRole(financeRole, selectedMonthCloseStage));
  const canRejectSelectedMonthClose = Boolean(selectedMonthCloseDetail?.canReject || selectedMonthClose?.canReject)
    || (selectedMonthCloseStatus === 'pending_review' && canReviewMonthCloseForRole(financeRole, selectedMonthCloseStage));
  const canReopenSelectedMonthClose = Boolean(selectedMonthCloseDetail?.canReopen || selectedMonthClose?.canReopen)
    || (financeRole === 'general_president' && selectedMonthCloseStatus === 'closed');
  const filteredDeliveryCampaigns = useMemo(() => (
    deliveryCampaignStatusFilter === 'all'
      ? deliveryCampaigns
      : deliveryCampaigns.filter((item) => String(item?.status || '').trim() === deliveryCampaignStatusFilter)
  ), [deliveryCampaignStatusFilter, deliveryCampaigns]);
  const selectedDeliveryCampaign = useMemo(() => (
    deliveryCampaigns.find((item) => String(item?._id || '') === String(selectedDeliveryCampaignId || ''))
    || filteredDeliveryCampaigns[0]
    || deliveryCampaigns[0]
    || null
  ), [deliveryCampaigns, filteredDeliveryCampaigns, selectedDeliveryCampaignId]);
  const selectedDeliveryCampaignLiveSummary = useMemo(() => (
    buildDeliveryLiveSummary(selectedDeliveryCampaign?.targets || [], selectedDeliveryCampaign)
  ), [selectedDeliveryCampaign]);
  const selectedDeliveryTemplate = useMemo(() => (
    deliveryTemplates.find((item) => String(item?.key || '') === String(deliveryCampaignForm.messageTemplateKey || ''))
    || null
  ), [deliveryTemplates, deliveryCampaignForm.messageTemplateKey]);
  const selectedDeliveryTemplateVersion = useMemo(() => (
    (selectedDeliveryTemplate?.versions || []).find((item) => (
      String(item?.versionNumber || '') === String(selectedDeliveryTemplateVersionNumber || '')
    ))
    || selectedDeliveryTemplate?.draftVersion
    || selectedDeliveryTemplate?.publishedVersion
    || null
  ), [selectedDeliveryTemplate, selectedDeliveryTemplateVersionNumber]);
  const selectedDeliveryTemplateApprovalStage = String(selectedDeliveryTemplateVersion?.approvalStage || 'draft').trim() || 'draft';
  const selectedDeliveryTemplateRolloutMetrics = selectedDeliveryTemplate?.rolloutMetrics || {
    totalCampaigns: 0,
    activeCampaigns: 0,
    automatedCampaigns: 0,
    deliveredTargets: 0,
    failedTargets: 0,
    lastUsedAt: null,
    byChannel: {}
  };
  const selectedDeliveryProviderConfig = useMemo(() => (
    deliveryProviderConfigs.find((item) => String(item?.channel || '') === String(selectedDeliveryProviderChannel || ''))
    || deliveryProviderConfigs[0]
    || null
  ), [deliveryProviderConfigs, selectedDeliveryProviderChannel]);
  const selectedDeliveryProviderModeOptions = useMemo(() => (
    DELIVERY_PROVIDER_CHANNEL_MODE_OPTIONS[selectedDeliveryProviderChannel] || DELIVERY_PROVIDER_CHANNEL_MODE_OPTIONS.sms
  ), [selectedDeliveryProviderChannel]);
  const selectedDeliveryProviderMissingFields = selectedDeliveryProviderConfig?.readiness?.missingRequiredFields || [];
  const selectedDeliveryProviderAuditEntries = selectedDeliveryProviderConfig?.auditTrail || [];
  const providerFormMode = String(deliveryProviderForm.mode || 'webhook').trim() || 'webhook';
  const showDeliveryProviderWebhookFields = providerFormMode === 'webhook';
  const showDeliveryProviderTwilioFields = providerFormMode === 'twilio';
  const showDeliveryProviderMetaFields = providerFormMode === 'meta';
  useEffect(() => {
    setDeliveryProviderForm(buildDeliveryProviderForm(selectedDeliveryProviderConfig, selectedDeliveryProviderChannel || 'sms'));
  }, [selectedDeliveryProviderConfig, selectedDeliveryProviderChannel]);
  const deliveryProviderOptions = useMemo(() => Array.from(new Set([
    ...Object.keys(deliveryAnalytics?.summary?.byProvider || {}),
    ...deliveryRetryQueue.map((item) => String(item?.provider || '').trim()).filter(Boolean),
    ...deliveryRecoveryQueue.map((item) => String(item?.provider || '').trim()).filter(Boolean)
  ])).sort((left, right) => left.localeCompare(right)), [deliveryAnalytics?.summary?.byProvider, deliveryRecoveryQueue, deliveryRetryQueue]);
  const deliveryFailureOptions = useMemo(() => Array.from(new Set([
    ...Object.keys(deliveryAnalytics?.summary?.byFailureCode || {}),
    ...deliveryRetryQueue.map((item) => String(item?.lastFailureCode || '').trim()).filter(Boolean),
    ...deliveryRecoveryQueue.map((item) => String(item?.failureCode || '').trim()).filter(Boolean)
  ])).sort((left, right) => left.localeCompare(right)), [deliveryAnalytics?.summary?.byFailureCode, deliveryRecoveryQueue, deliveryRetryQueue]);
  const deliveryProviderBreakdown = useMemo(() => {
    const providerSummary = deliveryAnalytics?.summary?.byProvider || {};
    const providerEntries = sortCountEntries(providerSummary);
    if (providerEntries.length) return providerEntries;
    const retryQueueProviderMap = deliveryRetryQueue.reduce((acc, item) => {
      const key = String(item?.provider || '').trim();
      if (!key) return acc;
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});
    return sortCountEntries(retryQueueProviderMap);
  }, [deliveryAnalytics?.summary?.byProvider, deliveryRetryQueue]);
  const deliveryFailureBreakdown = useMemo(() => {
    const failureSummary = deliveryAnalytics?.summary?.byFailureCode || {};
    const failureEntries = sortCountEntries(failureSummary);
    if (failureEntries.length) return failureEntries;
    const retryQueueFailureMap = deliveryRetryQueue.reduce((acc, item) => {
      const key = String(item?.lastFailureCode || '').trim();
      if (!key) return acc;
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});
    return sortCountEntries(retryQueueFailureMap);
  }, [deliveryAnalytics?.summary?.byFailureCode, deliveryRetryQueue]);
  const deliveryRecentFailures = useMemo(() => (
    Array.isArray(deliveryAnalytics?.recentFailures) ? deliveryAnalytics.recentFailures : []
  ), [deliveryAnalytics?.recentFailures]);
  const deliveryRecoverySummary = useMemo(() => (
    deliveryRecoveryQueue.reduce((acc, item) => {
      const state = String(item?.recoveryState || '').trim();
      if (state) acc[state] = Number(acc[state] || 0) + 1;
      return acc;
    }, {})
  ), [deliveryRecoveryQueue]);
  const deliveryLeadProvider = deliveryProviderBreakdown[0] || null;
  const deliveryLeadFailure = deliveryFailureBreakdown[0] || null;
  const effectiveDeliveryTemplateSubject = useMemo(() => (
    String(
      deliveryCampaignForm.messageTemplateSubject
      || selectedDeliveryTemplateVersion?.subject
      || selectedDeliveryTemplate?.defaultSubject
      || ''
    ).trim()
  ), [
    deliveryCampaignForm.messageTemplateSubject,
    selectedDeliveryTemplate?.defaultSubject,
    selectedDeliveryTemplateVersion?.subject
  ]);
  const effectiveDeliveryTemplateBody = useMemo(() => (
    String(
      deliveryCampaignForm.messageTemplateBody
      || selectedDeliveryTemplateVersion?.body
      || selectedDeliveryTemplate?.defaultBody
      || ''
    ).trim()
  ), [
    deliveryCampaignForm.messageTemplateBody,
    selectedDeliveryTemplate?.defaultBody,
    selectedDeliveryTemplateVersion?.body
  ]);
  const deliveryTemplateUsedVariables = useMemo(() => Array.from(new Set([
    ...extractTemplateVariables(effectiveDeliveryTemplateSubject),
    ...extractTemplateVariables(effectiveDeliveryTemplateBody)
  ])), [effectiveDeliveryTemplateSubject, effectiveDeliveryTemplateBody]);
  const deliveryTemplateUnknownVariables = useMemo(() => (
    deliveryTemplateUsedVariables.filter((item) => !deliveryTemplateVariables.some((entry) => String(entry?.key || '') === String(item || '')))
  ), [deliveryTemplateUsedVariables, deliveryTemplateVariables]);
  const filteredDocumentArchiveItems = useMemo(() => (
    documentArchiveTypeFilter === 'all'
      ? documentArchiveItems
      : documentArchiveItems.filter((item) => String(item?.documentType || '').trim() === documentArchiveTypeFilter)
  ), [documentArchiveItems, documentArchiveTypeFilter]);
  const selectedDocumentArchive = useMemo(() => (
    documentArchiveItems.find((item) => String(item?._id || item?.documentNo || '') === String(selectedDocumentArchiveId || ''))
    || filteredDocumentArchiveItems[0]
    || documentArchiveItems[0]
    || null
  ), [documentArchiveItems, filteredDocumentArchiveItems, selectedDocumentArchiveId]);
  const selectedDocumentArchiveLiveSummary = useMemo(() => (
    buildDeliveryLiveSummary(selectedDocumentArchive?.deliveryLog || [], selectedDocumentArchive)
  ), [selectedDocumentArchive]);
  const selectedDocumentDeliveryChannel = String(documentDeliveryForm.channel || 'email').trim() || 'email';
  const selectedDocumentSupportsLinkedAudience = String(selectedDocumentArchive?.documentType || '').trim() !== 'batch_statement_pack';
  const archiveDeliveryUsesPortal = selectedDocumentDeliveryChannel === 'portal';
  const archiveDeliveryHasManualRecipients = Boolean(String(documentDeliveryForm.recipientHandles || '').trim());
  const archiveDeliveryCanUseLinkedAudience = selectedDocumentSupportsLinkedAudience && documentDeliveryForm.includeLinkedAudience;
  const archiveDeliveryBlocked = archiveDeliveryUsesPortal && !selectedDocumentSupportsLinkedAudience;
  const canSendSelectedDocumentArchive = !archiveDeliveryBlocked && (
    archiveDeliveryUsesPortal
      ? archiveDeliveryCanUseLinkedAudience
      : archiveDeliveryHasManualRecipients || archiveDeliveryCanUseLinkedAudience
  );
  const shouldPreviewDeliveryTemplate = Boolean(
    String(deliveryCampaignForm.messageTemplateKey || '').trim()
    || effectiveDeliveryTemplateSubject
    || effectiveDeliveryTemplateBody
  );
  const visibleAnomalies = useMemo(() => {
    const selectedAnomalyClass = classOptions.find((item) => String(item?.classId || '') === String(anomalyClassFilter)) || null;
    return (anomalyClassFilter
      ? anomalies.filter((item) => (
        String(item?.classId || '').trim() === String(anomalyClassFilter).trim()
        || String(item?.classTitle || '').trim() === String(selectedAnomalyClass?.title || '').trim()
      ))
      : anomalies
    ).filter((item) => {
      if (anomalyTypeFilter !== 'all' && String(item?.anomalyType || '').trim() !== anomalyTypeFilter) return false;
      if (anomalyWorkflowStatusFilter !== 'all' && String(item?.workflowStatus || 'open').trim() !== anomalyWorkflowStatusFilter) return false;
      return includesFinanceSearch([
        item?.studentName,
        item?.asasNumber,
        item?.admissionNo,
        studentSearchBlobById.get(String(item?.studentUserId || '').trim()),
        studentSearchBlobById.get(String(item?.studentCoreId || item?.studentId || '').trim()),
        studentSearchBlobById.get(String(item?.studentMembershipId || '').trim()),
        item?.classTitle,
        item?.referenceNumber,
        item?.secondaryReference,
        item?.title,
        item?.description
      ], anomalySearchTerm);
    });
  }, [anomalies, anomalyClassFilter, classOptions, anomalyTypeFilter, anomalyWorkflowStatusFilter, anomalySearchTerm, studentSearchBlobById]);
  const anomalyTypeOptions = useMemo(() => (
    Object.entries(FINANCE_ANOMALY_UI_LABELS)
      .filter(([type]) => anomalies.some((item) => String(item?.anomalyType || '').trim() === type))
      .map(([value, label]) => ({ value, label }))
  ), [anomalies]);
  const visibleAnomalySummary = useMemo(() => ({
    ...(anomalySummary || { total: 0, critical: 0, warning: 0, info: 0, actionRequired: 0 }),
    total: visibleAnomalies.length,
    critical: visibleAnomalies.filter((item) => item?.severity === 'critical').length,
    warning: visibleAnomalies.filter((item) => item?.severity === 'warning').length,
    actionRequired: visibleAnomalies.filter((item) => item?.actionRequired).length,
    byWorkflow: {
      ...(anomalySummary?.byWorkflow || {}),
      open: visibleAnomalies.filter((item) => item?.workflowStatus === 'open').length,
      assigned: visibleAnomalies.filter((item) => item?.workflowStatus === 'assigned').length,
      snoozed: visibleAnomalies.filter((item) => item?.workflowStatus === 'snoozed').length,
      resolved: visibleAnomalies.filter((item) => item?.workflowStatus === 'resolved').length
    }
  }), [anomalySummary, visibleAnomalies]);
  const selectedAnomaly = useMemo(() => (
    visibleAnomalies.find((item) => item.id === selectedAnomalyId)
    || anomalies.find((item) => item.id === selectedAnomalyId)
    || visibleAnomalies[0]
    || null
  ), [visibleAnomalies, anomalies, selectedAnomalyId]);

  const filteredRefunds = useMemo(() => {
    const term = refundSearchTerm.trim().toLowerCase();
    return refunds.filter((item) => {
      if (refundStatusFilter !== 'all' && String(item?.status || '') !== refundStatusFilter) return false;
      if (!term) return true;
      const haystack = [
        item?.refundNumber,
        item?.student?.name,
        item?.bill?.billNumber,
        item?.feeOrder?.orderNumber
      ].map((value) => String(value || '').toLowerCase()).join(' ');
      return haystack.includes(term);
    });
  }, [refunds, refundStatusFilter, refundSearchTerm]);

  const selectedRefund = useMemo(() => {
    const targetId = String(selectedRefundId || '');
    return filteredRefunds.find((item) => String(item?._id || '') === targetId)
      || refunds.find((item) => String(item?._id || '') === targetId)
      || null;
  }, [filteredRefunds, refunds, selectedRefundId]);

  const refundSummaryStats = useMemo(() => {
    const openItems = refunds.filter((item) => ['pending_review', 'approved'].includes(String(item?.status || '')));
    return {
      openCount: openItems.length,
      openAmount: openItems.reduce((sum, item) => sum + Number(item?.amount || 0), 0)
    };
  }, [refunds]);

  const refundEligibleBills = useMemo(() => (
    bills.filter((item) => Number(item?.amountPaid || 0) > 0)
  ), [bills]);

  const expenseCategoryOptions = useMemo(() => (
    expenseCategories.filter((item) => item.isActive !== false)
  ), [expenseCategories]);

  const expenseSubCategoryOptions = useMemo(() => (
    expenseCategoryOptions.find((item) => item.key === expenseForm.category)?.subCategories || []
  ), [expenseCategoryOptions, expenseForm.category]);

  // Stored records only keep the internal key ('utilities', 'internet', ...);
  // look up the human label from the full category list (not just the
  // active-only options) so an expense against a since-deactivated category
  // still displays correctly instead of the raw key.
  const resolveExpenseCategoryLabel = (categoryKey = '') => (
    expenseCategories.find((item) => item.key === categoryKey)?.label || categoryKey || '---'
  );
  const resolveExpenseSubCategoryLabel = (categoryKey = '', subCategoryKey = '') => {
    if (!subCategoryKey) return 'بدون زیردسته';
    const category = expenseCategories.find((item) => item.key === categoryKey);
    return category?.subCategories?.find((item) => item.key === subCategoryKey)?.label || subCategoryKey;
  };

  const filteredExpenses = useMemo(() => {
    const term = expenseSearchTerm.trim().toLowerCase();
    const rangeStart = financeOverviewRange.from ? new Date(financeOverviewRange.from) : null;
    const rangeEnd = financeOverviewRange.to ? new Date(financeOverviewRange.to) : null;
    if (rangeEnd) rangeEnd.setHours(23, 59, 59, 999);
    return expenses.filter((item) => {
      if (expenseStatusFilter !== 'all' && String(item?.status || '') !== expenseStatusFilter) return false;
      if (expenseCategoryFilter !== 'all' && String(item?.category || '') !== expenseCategoryFilter) return false;
      const expenseDate = item?.expenseDate ? new Date(item.expenseDate) : null;
      if (rangeStart && expenseDate && expenseDate < rangeStart) return false;
      if (rangeEnd && expenseDate && expenseDate > rangeEnd) return false;
      if (!term) return true;
      const haystack = [item?.category, item?.subCategory, item?.vendorName, item?.referenceNo, item?.note]
        .map((value) => String(value || '').toLowerCase()).join(' ');
      return haystack.includes(term);
    });
  }, [expenses, expenseStatusFilter, expenseCategoryFilter, expenseSearchTerm, financeOverviewRange.from, financeOverviewRange.to]);

  const expenseSummary = useMemo(() => ({
    count: filteredExpenses.length,
    total: filteredExpenses.reduce((sum, item) => sum + Number(item?.amount || 0), 0),
    approved: filteredExpenses.filter((item) => item.status === 'approved').reduce((sum, item) => sum + Number(item?.amount || 0), 0),
    pending: filteredExpenses.filter((item) => item.status === 'pending_review').length
  }), [filteredExpenses]);

  // 10 expenses per page (same page size as the receipt inbox), rest on
  // the next page - avoids one long unbroken list once expenses build up.
  const expenseTotalPages = Math.max(1, Math.ceil(filteredExpenses.length / EXPENSE_PAGE_SIZE));
  const effectiveExpensePage = Math.min(Math.max(1, expensePage), expenseTotalPages);
  const paginatedExpenses = useMemo(() => {
    const start = (effectiveExpensePage - 1) * EXPENSE_PAGE_SIZE;
    return filteredExpenses.slice(start, start + EXPENSE_PAGE_SIZE);
  }, [filteredExpenses, effectiveExpensePage]);

  useEffect(() => {
    setExpensePage(1);
  }, [expenseStatusFilter, expenseCategoryFilter, expenseSearchTerm, financeOverviewRange.from, financeOverviewRange.to]);

  useEffect(() => {
    setExpensePage((current) => Math.min(Math.max(1, current), expenseTotalPages));
  }, [expenseTotalPages]);

  // Quick month jump for the Expenses tab - sets the same shared
  // "از تاریخ/تا تاریخ" range the whole finance page reads from, so the
  // user does not need to leave this tab and go to Overview/Reports just to
  // change the month. Buckets are Gregorian calendar months (same convention
  // already used by the monthly-trend report/strip above), labeled in Dari
  // via toFaMonthKey.
  const expenseMonthFilterOptions = useMemo(() => {
    const now = new Date();
    const options = [];
    for (let i = 0; i < 18; i += 1) {
      const cursor = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      options.push({ key, label: toFaMonthKey(key) });
    }
    return options;
  }, []);

  const selectedExpenseMonthKey = useMemo(() => {
    if (!financeOverviewRange.from || !financeOverviewRange.to) return '';
    const from = new Date(financeOverviewRange.from);
    if (Number.isNaN(from.getTime())) return '';
    const monthStart = new Date(from.getFullYear(), from.getMonth(), 1);
    const monthEnd = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    if (
      toGregorianDateInputValue(monthStart) === financeOverviewRange.from
      && toGregorianDateInputValue(monthEnd) === financeOverviewRange.to
    ) {
      return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
    }
    return '';
  }, [financeOverviewRange.from, financeOverviewRange.to]);

  const applyExpenseMonthFilter = (monthKey) => {
    if (!monthKey) return;
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month) return;
    setFinanceOverviewRange({
      from: toGregorianDateInputValue(new Date(year, month - 1, 1)),
      to: toGregorianDateInputValue(new Date(year, month, 0))
    });
  };

  // Same date-range scope as the overview KPI card (from/to only, no
  // status/category filter) - used to break the KPI's single "pending"
  // figure into draft vs actually-submitted-for-review, since those are
  // very different things (a draft has not even been sent anywhere yet).
  const expensesInDateRange = useMemo(() => {
    const rangeStart = financeOverviewRange.from ? new Date(financeOverviewRange.from) : null;
    const rangeEnd = financeOverviewRange.to ? new Date(financeOverviewRange.to) : null;
    if (rangeEnd) rangeEnd.setHours(23, 59, 59, 999);
    return expenses.filter((item) => {
      const expenseDate = item?.expenseDate ? new Date(item.expenseDate) : null;
      if (rangeStart && expenseDate && expenseDate < rangeStart) return false;
      if (rangeEnd && expenseDate && expenseDate > rangeEnd) return false;
      return true;
    });
  }, [expenses, financeOverviewRange.from, financeOverviewRange.to]);

  const expenseStatusBreakdown = useMemo(() => {
    const sumByStatus = (status) => expensesInDateRange
      .filter((item) => item.status === status)
      .reduce((sum, item) => sum + Number(item?.amount || 0), 0);
    return {
      draft: sumByStatus('draft'),
      pendingReview: sumByStatus('pending_review')
    };
  }, [expensesInDateRange]);

  useEffect(() => {
    let active = true;
    if (!selectedReceiptId) {
      setSelectedReceiptDetail(null);
      return () => {};
    }
    const loadReceiptDetail = async () => {
      try {
        const detailRow = await fetchReceiptDetailRow(selectedReceiptId);
        if (!active) return;
        setSelectedReceiptDetail(detailRow);
        return;
      } catch {
        // Fall back to the row already present in the pending list.
      }
      if (active) {
        setSelectedReceiptDetail(null);
      }
    };
    loadReceiptDetail();
    return () => {
      active = false;
    };
  }, [selectedReceiptId]);

  useEffect(() => {
    if (!filteredAuditTimeline.length) {
      if (selectedAuditEntryId) setSelectedAuditEntryId('');
      return;
    }
    if (!selectedAuditEntryId || !filteredAuditTimeline.some((item) => item.id === selectedAuditEntryId)) {
      setSelectedAuditEntryId(filteredAuditTimeline[0].id);
    }
  }, [filteredAuditTimeline, selectedAuditEntryId]);

  useEffect(() => {
    if (!visibleAnomalies.length) {
      if (selectedAnomalyId) setSelectedAnomalyId('');
      return;
    }
    if (!selectedAnomalyId || !visibleAnomalies.some((item) => item.id === selectedAnomalyId)) {
      setSelectedAnomalyId(visibleAnomalies[0].id);
    }
  }, [visibleAnomalies, selectedAnomalyId]);

  useEffect(() => {
    if (!selectedAnomaly) {
      setAnomalyWorkflowForm({
        assignedLevel: 'finance_manager',
        snoozedUntil: '',
        note: ''
      });
      return;
    }
    setAnomalyWorkflowForm({
      assignedLevel: selectedAnomaly?.workflowAssignedLevel || 'finance_manager',
      snoozedUntil: toInputDate(selectedAnomaly?.workflowSnoozedUntil),
      note: selectedAnomaly?.workflowLatestNote || ''
    });
  }, [
    selectedAnomaly?.id,
    selectedAnomaly?.workflowAssignedLevel,
    selectedAnomaly?.workflowSnoozedUntil,
    selectedAnomaly?.workflowLatestNote,
    selectedAnomaly?.workflowLastActionAt
  ]);

  useEffect(() => {
    const selectedClassId = String(selectedAnomaly?.classId || '').trim();
    if (selectedAnomaly?.anomalyType !== 'admission_missing' || !selectedClassId) return;
    setAdmissionBatchForm((prev) => (
      prev.classId === selectedClassId ? prev : { ...prev, classId: selectedClassId }
    ));
  }, [selectedAnomaly?.id, selectedAnomaly?.anomalyType, selectedAnomaly?.classId]);

  const selectedReceiptBase = useMemo(() => {
    if (!paginatedReceipts.length) return null;
    return paginatedReceipts.find((item) => item._id === selectedReceiptId) || paginatedReceipts[0];
  }, [paginatedReceipts, selectedReceiptId]);

  const selectedReceipt = useMemo(() => {
    if (!selectedReceiptBase) return null;
    if (selectedReceiptDetail && selectedReceiptDetail._id === selectedReceiptBase._id) {
      return { ...selectedReceiptBase, ...selectedReceiptDetail };
    }
    return selectedReceiptBase;
  }, [selectedReceiptBase, selectedReceiptDetail]);

  const activeSchoolPrintInfo = useMemo(() => {
    const school = activeSchoolContext?.school || {};
    const title = school.nameDari || school.name || 'مکتب فعال';
    const code = school.schoolCode || school.ministryCode || '';
    const address = school.contactInfo?.address || [school.district, school.province].filter(Boolean).join('، ');
    const phone = school.contactInfo?.phone || school.contactInfo?.mobile || school.principal?.phone || '';
    const email = school.contactInfo?.email || school.principal?.email || '';
    return {
      title,
      subtitle: [code ? `کد: ${code}` : '', address, phone ? `تماس: ${phone}` : ''].filter(Boolean).join(' | '),
      code,
      address,
      phone,
      email,
      principal: school.principal?.name || ''
    };
  }, [activeSchoolContext]);
  const printLogoUrls = useMemo(() => getPrintLogoUrls(siteSettings), [siteSettings]);
  const handlePrintSheetError = (error) => {
    setPrintMode('');
    setMessage(`آماده‌سازی چاپ با خطا مواجه شد: ${error?.message || error}`);
  };
  const schedulePrint = async (mode, selector = '.finance-print-sheet') => {
    setPrintMode(mode);
    const root = await waitForPrintableSheet(selector);
    if (!root) {
      // The requested print data never rendered (e.g. the report/receipt was still loading or
      // failed to load) — printing now would produce a blank/white page, so bail out instead.
      setPrintMode('');
      setMessage('داده‌ای برای چاپ آماده نشد؛ لطفاً دوباره تلاش کنید.');
      return;
    }
    await Promise.all([waitForPrintableImages(root), waitForPrintableFonts()]);
    window.print();
  };

  useEffect(() => {
    if (!selectedReceipt) {
      setReceiptFollowUpForm({
        assignedLevel: 'finance_manager',
        status: 'new',
        note: ''
      });
      return;
    }
    setReceiptFollowUpForm({
      assignedLevel: selectedReceipt?.followUp?.assignedLevel || getStageDefaultLevel(selectedReceipt?.approvalStage || ''),
      status: getReceiptFollowUpStatus(selectedReceipt),
      note: selectedReceipt?.followUp?.note || ''
    });
  }, [
    selectedReceipt?._id,
    selectedReceipt?.approvalStage,
    selectedReceipt?.status,
    selectedReceipt?.followUp?.assignedLevel,
    selectedReceipt?.followUp?.status,
    selectedReceipt?.followUp?.note,
    selectedReceipt?.followUp?.updatedAt
  ]);

  const cashierReportPrintModel = useMemo(() => {
    if (!cashierReport) return null;
    return {
      date: cashierReport.date || cashierReportDate,
      summary: cashierReport.summary || {},
      methodTotals: Array.isArray(cashierReport.methodTotals) ? cashierReport.methodTotals : [],
      cashiers: Array.isArray(cashierReport.cashiers) ? cashierReport.cashiers : [],
      items: Array.isArray(cashierReport.items) ? cashierReport.items : []
    };
  }, [cashierReport, cashierReportDate]);

  // Freeze the data for the sheet the instant printing starts (see printSnapshot above). This
  // must depend only on printMode, not on the live values themselves - depending on them would
  // re-snapshot (and thus re-expose the sheet to) every later refresh, defeating the point.
  useEffect(() => {
    if (printMode === 'overview') {
      setPrintSnapshot({ financeOverview, financeOverviewKpis });
    } else if (printMode === 'cashier') {
      setPrintSnapshot(cashierReportPrintModel);
    } else {
      setPrintSnapshot(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printMode]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintMode('');
      setPrintSnapshot(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  useEffect(() => {
    setPaymentDeskForm((prev) => {
      const validIds = new Set(paymentDeskOpenOrders.map(getFeeOrderRowId).filter(Boolean));
      const nextSelected = prev.selectedFeeOrderIds.filter((item) => validIds.has(String(item || '')));
      const nextManual = Object.fromEntries(
        Object.entries(prev.manualAllocations || {}).filter(([key]) => validIds.has(String(key || '')))
      );
      const sameSelected = nextSelected.length === prev.selectedFeeOrderIds.length
        && nextSelected.every((item, index) => item === prev.selectedFeeOrderIds[index]);
      const prevManualKeys = Object.keys(prev.manualAllocations || {});
      const nextManualKeys = Object.keys(nextManual);
      const sameManual = prevManualKeys.length === nextManualKeys.length
        && nextManualKeys.every((key) => String(prev.manualAllocations?.[key] || '') === String(nextManual[key] || ''));
      if (sameSelected && sameManual) {
        return prev;
      }
      return {
        ...prev,
        selectedFeeOrderIds: nextSelected,
        manualAllocations: nextManual
      };
    });
  }, [paymentDeskOpenOrders]);

  useEffect(() => {
    setPaymentPreview(null);
  }, [bills]);

  useEffect(() => {
    setAdvanceBillingPreview(null);
    setAdvanceBillingPayload(null);
  }, [paymentDeskForm.studentId, paymentDeskForm.classId, paymentDeskForm.academicYearId]);

  const postJson = async (url, body) => {
    const data = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    if (!data?.success) {
      throw new Error(data?.message || 'عملیات ناموفق بود');
    }
    return data;
  };

  const previewAdvanceStudentBilling = async (monthCount) => {
    const membershipId = String(paymentDeskMembershipStudent?.membershipId || '').trim();
    if (!membershipId || !paymentDeskForm.classId || !paymentDeskForm.academicYearId) {
      setMessage('ابتدا شاگرد، صنف و سال تعلیمی را در میز پرداخت انتخاب کنید.');
      return;
    }
    const payload = {
      classId: paymentDeskForm.classId,
      academicYearId: paymentDeskForm.academicYearId,
      studentMembershipId: membershipId,
      dueDate: paymentDeskForm.paidAt || toInputDate(new Date()),
      periodType: 'monthly',
      includeFutureMonths: true,
      futureMonthCount: Math.max(1, Math.min(12, Number(monthCount || 1))),
      includeAdmission: false,
      includeTransport: false,
      onlyDebtors: false,
      currency: 'AFN'
    };
    setBusy(true);
    try {
      const data = await postJson(`${API_BASE}/api/finance/admin/bills/preview`, payload);
      setAdvanceBillingPayload(payload);
      setAdvanceBillingPreview(data);
      setMessage(data?.summary?.candidateCount
        ? `پیش‌نمایش آماده شد: ${fmt(data.summary.candidateCount)} بل به مبلغ ${fmt(data.summary.totalAmountDue || 0)} افغانی.`
        : 'برای این بازه بل جدید قابل صدور پیدا نشد؛ ماه‌ها ممکن است قبلاً صادر شده باشند.');
    } catch (error) {
      setAdvanceBillingPreview(null);
      setAdvanceBillingPayload(null);
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const generateAdvanceStudentBilling = async () => {
    if (!advanceBillingPayload || !advanceBillingPreview?.summary?.candidateCount) return;
    setBusy(true);
    try {
      const data = await postJson(`${API_BASE}/api/finance/admin/bills/generate`, advanceBillingPayload);
      setMessage(data.message || 'بل‌های ماه‌های انتخاب‌شده صادر شد. اکنون مبلغ را پیش‌نمایش و میان بل‌ها تخصیص دهید.');
      setAdvanceBillingPreview(null);
      setAdvanceBillingPayload(null);
      await refreshPaymentWorkspace({ includeAnomalies: true });
      const createdFeeOrderIds = Array.isArray(data?.createdFeeOrderIds) ? data.createdFeeOrderIds.map(String) : [];
      if (createdFeeOrderIds.length) {
        setPaymentDeskForm((previous) => ({
          ...previous,
          amount: String(data?.createdAmount || ''),
          allocationMode: 'auto_selected',
          selectedFeeOrderIds: createdFeeOrderIds,
          manualAllocations: {}
        }));
        setMessage(`${data.message || 'بل‌ها صادر شد.'} مبلغ و بل‌های جدید برای پیش‌نمایش پرداخت انتخاب شدند.`);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const requestDeliveryTemplatePreview = async (payload = {}) => {
    const data = await fetchJson(`${API_BASE}/api/finance/admin/delivery-campaigns/template-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    if (!data?.success) {
      const error = new Error(data?.message || 'پیش‌نمایش template ناموفق بود');
      error.meta = data?.meta || null;
      throw error;
    }
    return data?.preview || null;
  };

  useEffect(() => {
    let active = true;
    if (!shouldPreviewDeliveryTemplate) {
      setDeliveryTemplatePreview(null);
      setDeliveryTemplatePreviewError('');
      setDeliveryTemplatePreviewBusy(false);
      return () => {};
    }

    setDeliveryTemplatePreviewBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const preview = await requestDeliveryTemplatePreview({
          name: deliveryCampaignForm.name,
          documentType: deliveryCampaignForm.documentType,
          channel: deliveryCampaignForm.channel,
          classId: deliveryCampaignForm.classId,
          academicYearId: deliveryCampaignForm.academicYearId,
          monthKey: deliveryCampaignForm.monthKey,
          note: deliveryCampaignForm.note,
          messageTemplateKey: deliveryCampaignForm.messageTemplateKey,
          templateVersionNumber: Number(selectedDeliveryTemplateVersionNumber || 0) || null,
          messageTemplateSubject: effectiveDeliveryTemplateSubject,
          messageTemplateBody: effectiveDeliveryTemplateBody
        });
        if (!active) return;
        setDeliveryTemplatePreview(preview);
        setDeliveryTemplatePreviewError('');
      } catch (error) {
        if (!active) return;
        setDeliveryTemplatePreview(null);
        setDeliveryTemplatePreviewError(error.message || 'پیش‌نمایش template ناموفق بود');
      } finally {
        if (active) setDeliveryTemplatePreviewBusy(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    shouldPreviewDeliveryTemplate,
    deliveryCampaignForm.name,
    deliveryCampaignForm.documentType,
    deliveryCampaignForm.channel,
    deliveryCampaignForm.classId,
    deliveryCampaignForm.academicYearId,
    deliveryCampaignForm.monthKey,
    deliveryCampaignForm.note,
    deliveryCampaignForm.messageTemplateKey,
    selectedDeliveryTemplateVersionNumber,
    effectiveDeliveryTemplateSubject,
    effectiveDeliveryTemplateBody
  ]);

  useEffect(() => {
    if (!selectedDeliveryTemplate) {
      setSelectedDeliveryTemplateVersionNumber('');
      setDeliveryTemplateChangeNote('');
      return;
    }
    const availableVersions = Array.isArray(selectedDeliveryTemplate.versions)
      ? selectedDeliveryTemplate.versions.map((item) => String(item?.versionNumber || ''))
      : [];
    const preferredVersion = String(
      selectedDeliveryTemplate.draftVersionNumber
      || selectedDeliveryTemplate.publishedVersionNumber
      || selectedDeliveryTemplate.versions?.[0]?.versionNumber
      || ''
    );
    setSelectedDeliveryTemplateVersionNumber((current) => (
      current && availableVersions.includes(String(current)) ? current : preferredVersion
    ));
    setDeliveryTemplateChangeNote('');
  }, [
    selectedDeliveryTemplate?.key,
    selectedDeliveryTemplate?.draftVersionNumber,
    selectedDeliveryTemplate?.publishedVersionNumber
  ]);

  const createManualBill = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      const payload = buildManualBillPayload();
      if (!payload.studentId || !payload.classId || !payload.dueDate) {
        setMessage('برای صدور بل دستی، شاگرد، صنف و مهلت پرداخت را انتخاب کنید.');
        setBusy(false);
        return;
      }
      if (payload.amountSource === 'manual' && toSafeNumber(payload.amount) <= 0) {
        setMessage('برای مبلغ دستی، مقدار بیشتر از صفر وارد کنید.');
        setBusy(false);
        return;
      }
      if (payload.amountSource === 'plan' && payload.feePlanId && selectedManualPlanAmount <= 0) {
        setMessage(`مبلغ ${FEE_LINE_TYPE_LABELS[payload.feeType] || 'فیس'} در پلان فعال این صنف و سال تعیین نشده است.`);
        setBusy(false);
        return;
      }
      const data = await postJson(`${API_BASE}/api/finance/admin/bills`, payload);
      setMessage([data.message || 'بل ایجاد شد', data.studentStatusWarning].filter(Boolean).join(' — '));
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const generateBulkBills = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      const payload = buildBulkBillPayload();
      if (!payload.classId || !payload.dueDate) {
        setMessage('برای صدور گروهی، صنف و مهلت پرداخت را انتخاب کنید.');
        setBusy(false);
        return;
      }
      const data = await postJson(`${API_BASE}/api/finance/admin/bills/generate`, payload);
      setBillingPreview(null);
      setMessage(data.message || 'بل گروهی ایجاد شد');
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const previewBulkBills = async () => {
    try {
      setBusy(true);
      const payload = buildBulkBillPayload();
      if (!payload.classId || !payload.dueDate) {
        setMessage('برای پیش‌نمایش بل گروهی، صنف و مهلت پرداخت را انتخاب کنید.');
        setBusy(false);
        return;
      }
      const data = await postJson(`${API_BASE}/api/finance/admin/bills/preview`, payload);
      setBillingPreview(data);
      if (!data?.summary?.candidateCount) {
        setMessage(getBulkPreviewEmptyMessage(data));
        setBusy(false);
        return;
      }
      setMessage(data?.summary?.candidateCount ? 'پیش‌نمایش بل‌ها آماده شد' : 'برای این فیلتر موردی برای پیش‌نمایش بل پیدا نشد');
      setBusy(false);
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const buildDeskPaymentPayload = () => ({
    student: paymentDeskForm.studentId,
    classId: paymentDeskForm.classId,
    academicYearId: paymentDeskForm.academicYearId,
    amount: Number(paymentDeskForm.amount || 0),
    feeType: paymentDeskForm.feeType,
    paidAt: paymentDeskForm.paidAt,
    paymentMethod: paymentDeskForm.paymentMethod,
    allocationMode: paymentDeskForm.allocationMode,
    selectedFeeOrderIds: paymentDeskForm.allocationMode === 'auto_selected' ? paymentDeskSelectedOrderIds : [],
    allocations: paymentDeskForm.allocationMode === 'manual'
      ? paymentDeskOpenOrders
        .map((item) => ({
          feeOrderId: getFeeOrderRowId(item),
          feeType: paymentDeskForm.feeType,
          amount: Number(paymentDeskForm.manualAllocations?.[getFeeOrderRowId(item)] || 0)
        }))
        .filter((item) => item.amount > 0)
      : [],
    referenceNo: paymentDeskForm.paymentMethod === 'cash' ? '' : paymentDeskForm.referenceNo,
    note: paymentDeskForm.note
  });

  const toggleDeskOrderSelection = (feeOrderId) => {
    setPaymentDeskForm((prev) => {
      const nextIds = prev.selectedFeeOrderIds.includes(feeOrderId)
        ? prev.selectedFeeOrderIds.filter((item) => item !== feeOrderId)
        : [...prev.selectedFeeOrderIds, feeOrderId];
      return { ...prev, selectedFeeOrderIds: nextIds };
    });
    setPaymentPreview(null);
  };

  const updateDeskManualAllocation = (feeOrderId, value) => {
    setPaymentDeskForm((prev) => ({
      ...prev,
      manualAllocations: {
        ...(prev.manualAllocations || {}),
        [feeOrderId]: value
      }
    }));
    setPaymentPreview(null);
  };

  const previewDeskPayment = async () => {
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/payments/preview-allocation`, buildDeskPaymentPayload());
      setPaymentPreview(data);
      setMessage(Array.isArray(data?.allocations) && data.allocations.length ? 'پیش‌نمایش پرداخت آماده شد' : 'برای این عضویت، تخصیص پرداختی پیدا نشد');
      setBusy(false);
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const createDeskPayment = async (e) => {
    e.preventDefault();
    // Must open synchronously, before any await, or the browser's popup blocker treats the later
    // window.open (after the payment API call resolves) as not user-initiated and silently blocks
    // it. Opened up front whenever printing was requested; filled in or closed once we know the
    // outcome below.
    const wantsPrint = deskPaymentSubmitMode === 'save_print';
    const printWindow = wantsPrint ? window.open('', '_blank') : null;
    if (wantsPrint && !printWindow) {
      setMessage('مرورگر بازشدن پنجرهٔ چاپ را مسدود کرد؛ لطفاً پنجره‌های بازشو (popup) را برای این سایت مجاز کنید.');
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/payments`, buildDeskPaymentPayload());
      const createdReceipt = data?.item ? toLegacyLikeReceiptRow(data.item) : null;
      setMessage(data.message || 'پرداخت ثبت شد');
      if (createdReceipt?._id) {
        setPendingReceipts((prev) => {
          const existing = Array.isArray(prev) ? prev : [];
          const exists = existing.some((item) => item?._id === createdReceipt._id);
          if (exists) {
            return existing.map((item) => (item?._id === createdReceipt._id ? createdReceipt : item));
          }
          return [createdReceipt, ...existing];
        });
        setSelectedReceiptId(createdReceipt._id);
        setSelectedReceiptDetail(createdReceipt);
        setReceiptSearchTerm('');
        setReceiptStatusFilter('pending');
        setReceiptStageFilter('all');
        setReceiptSourceFilter('all');
        setReceiptFollowUpFilter('all');
        setReceiptAcademicYearFilter('all');
        setReceiptClassFilter('all');
        setReceiptPage(1);
      }
      setPaymentPreview(null);
      setPaymentDeskForm((prev) => ({
        ...prev,
        amount: '',
        paidAt: toInputDate(new Date()),
        referenceNo: '',
        note: '',
        selectedFeeOrderIds: [],
        manualAllocations: {}
      }));
      if (wantsPrint && createdReceipt?._id) {
        setActiveSection('payments');
        let detailedReceipt = createdReceipt;
        try {
          detailedReceipt = await fetchReceiptDetailRow(createdReceipt._id);
          setSelectedReceiptDetail(detailedReceipt);
        } catch {
          // The newly created row is still printable from what we already have if the detail
          // request is temporarily unavailable.
        }
        if (printWindow) {
          const model = buildReceiptPrintModel(detailedReceipt);
          if (model) {
            printWindow.document.open();
            printWindow.document.write(buildReceiptPrintHtml(model, activeSchoolPrintInfo, printLogoUrls));
            printWindow.document.close();
          } else {
            printWindow.close();
          }
        }
      } else if (printWindow) {
        printWindow.close();
      }
      setDeskPaymentSubmitMode('save');
      await refreshPaymentWorkspace();
    } catch (err) {
      setMessage(err.message);
      setDeskPaymentSubmitMode('save');
      setBusy(false);
      if (printWindow) printWindow.close();
    }
  };

  const saveFeePlan = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      if (!feePlanForm.classId || !feePlanForm.academicYearId) {
        throw new Error('برای تعریف پلان مالی، صنف و سال تعلیمی را انتخاب کنید.');
      }
      const data = await postJson(`${API_BASE}/api/finance/admin/fee-plans`, feePlanForm);
      setMessage(data.message || 'پلان فیس ذخیره شد');
      setFeePlanForm((prev) => ({
        ...prev,
        title: '',
        planCode: '',
        planType: 'standard',
        priority: '',
        isDefault: false,
        effectiveFrom: '',
        effectiveTo: '',
        eligibilityRule: '',
        tuitionFee: '',
        admissionFee: '',
        examFee: '',
        documentFee: '',
        transportDefaultFee: '',
        otherFee: '',
        note: ''
      }));
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const toggleAcademicYearBillingMonth = (monthNumber) => {
    setAcademicYears((prev) => prev.map((year) => {
      if (year.id !== feePlanForm.academicYearId) return year;
      const current = new Set(year.feeBillingMonths || [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      if (current.has(monthNumber)) current.delete(monthNumber);
      else current.add(monthNumber);
      return { ...year, feeBillingMonths: [...current].sort((left, right) => left - right) };
    }));
  };

  const saveAcademicYearBillingMonths = async () => {
    const selectedYear = academicYears.find((year) => year.id === feePlanForm.academicYearId);
    if (!selectedYear?.id || !selectedYear.feeBillingMonths?.length) {
      setMessage('حداقل یک ماه فیس‌دار را انتخاب کنید.');
      return;
    }
    try {
      setBusy(true);
      const data = await fetchJson(`${API_BASE}/api/academic-years/${selectedYear.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feeBillingMonths: selectedYear.feeBillingMonths })
      });
      if (!data?.success) throw new Error(data?.message || 'ذخیره ماه‌های فیس‌دار ناموفق بود.');
      setMessage('ماه‌های فیس‌دار سال تعلیمی ذخیره شد.');
      setBusy(false);
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const loadFeePlanIntoForm = (plan = {}) => {
    setFeePlanForm((prev) => ({
      ...prev,
      title: plan.title || '',
      classId: String(plan.classId || plan.schoolClass?._id || plan.schoolClass?.id || prev.classId || ''),
      academicYearId: String(plan.academicYearId || plan.academicYear?._id || plan.academicYear?.id || prev.academicYearId || ''),
      term: plan.term || '',
      planCode: String(plan.planCode || '').toUpperCase(),
      planType: plan.planType || 'standard',
      priority: plan.priority ?? '',
      isDefault: plan.isDefault === true,
      effectiveFrom: plan.effectiveFrom || '',
      effectiveTo: plan.effectiveTo || '',
      eligibilityRule: plan.eligibilityRule || '',
      billingFrequency: plan.billingFrequency || 'term',
      tuitionFee: plan.tuitionFee || plan.amount || '',
      admissionFee: plan.admissionFee || '',
      examFee: plan.examFee || '',
      documentFee: plan.documentFee || '',
      transportDefaultFee: plan.transportDefaultFee || '',
      otherFee: plan.otherFee || '',
      currency: plan.currency || prev.currency || 'AFN',
      dueDay: plan.dueDay || prev.dueDay || 10,
      note: plan.note || ''
    }));
    setActiveSection('settings');
  };

  const updateFeePlanLifecycle = async (plan = {}, action = '') => {
    const planId = String(plan?._id || plan?.id || '').trim();
    if (!planId || busy) return;
    try {
      setBusy(true);
      const data = await fetchJson(`${API_BASE}/api/finance/admin/fee-plans/${encodeURIComponent(planId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (!data?.success) {
        throw new Error(data?.message || 'تغییر وضعیت پلان فیس ناموفق بود');
      }
      if (data.item) {
        setFeePlans((prev) => (Array.isArray(prev) ? prev : []).map((item) => (
          String(item?._id || item?.id || '') === planId ? data.item : item
        )));
      }
      setMessage(data.message || 'وضعیت پلان فیس تنظیم شد');
      setBusy(false);
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const deleteFeePlanSafely = async (plan = {}) => {
    const planId = String(plan?._id || plan?.id || '').trim();
    if (!planId || busy) return;
    const planTitle = String(plan?.title || plan?.planCode || 'این پلان فیس').trim();
    const ok = window.confirm(`حذف امن ${planTitle}؟ اگر این پلان در بل‌ها استفاده شده باشد حذف نمی‌شود و فقط می‌توانید آن را غیرفعال یا آرشیف کنید.`);
    if (!ok) return;
    try {
      setBusy(true);
      const data = await fetchJson(`${API_BASE}/api/finance/admin/fee-plans/${encodeURIComponent(planId)}`, {
        method: 'DELETE'
      });
      if (!data?.success) {
        throw new Error(data?.message || 'حذف پلان فیس ناموفق بود');
      }
      setFeePlans((prev) => (Array.isArray(prev) ? prev : []).filter((item) => (
        String(item?._id || item?.id || '') !== planId
      )));
      setMessage(data.message || 'پلان فیس حذف شد');
      setBusy(false);
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const saveDiscountRegistry = async (e) => {
    e.preventDefault();
    if (discountSubmitInFlightRef.current) return;
    discountSubmitInFlightRef.current = true;
    try {
      setBusy(true);
      const isClassDiscount = discountForm.targetScope === 'class';
      const membershipStudent = isClassDiscount ? null : selectedDiscountMembershipStudent;
      const resolvedMembershipId = isClassDiscount ? '' : (membershipStudent?.membershipId || discountForm.studentMembershipId || findFinanceMembershipId(discountForm));
      const resolvedClassId = isClassDiscount ? discountForm.classId : (membershipStudent?.classId || discountForm.classId);
      const resolvedAcademicYearId = isClassDiscount ? discountForm.academicYearId : (membershipStudent?.academicYearId || discountForm.academicYearId);
      if (!resolvedClassId || !resolvedAcademicYearId || (!isClassDiscount && (!discountForm.studentId || !resolvedMembershipId))) {
        throw new Error('برای ثبت تخفیف، متعلم، صنف و سال تعلیمی مربوط به همان عضویت را انتخاب کنید.');
      }
      const normalizedDiscountCoverageMode = discountForm.coverageMode === 'full' ? 'percent' : discountForm.coverageMode;
      const normalizedDiscountPercentage = discountForm.coverageMode === 'full' ? 100 : discountForm.percentage;
      const normalizedDiscountAmount = discountForm.coverageMode === 'full' ? '' : discountForm.amount;
      if (normalizedDiscountCoverageMode === 'percent' && toSafeNumber(normalizedDiscountPercentage) <= 0) {
        throw new Error('برای تخفیف فیصدی، فیصدی معتبر بزرگ‌تر از صفر وارد کنید.');
      }
      if (normalizedDiscountCoverageMode === 'fixed' && toSafeNumber(normalizedDiscountAmount) <= 0) {
        throw new Error('برای تخفیف پولی، مبلغ معتبر بزرگ‌تر از صفر وارد کنید.');
      }
      if (discountForm.durationMode === 'custom_period' && (!discountForm.startDate || !discountForm.endDate)) {
        throw new Error('برای تخفیف دوره‌ای، تاریخ شروع و ختم را انتخاب کنید.');
      }
      const data = await postJson(`${API_BASE}/api/student-finance/discounts`, {
        targetScope: discountForm.targetScope,
        student: isClassDiscount ? '' : discountForm.studentId,
        studentMembershipId: resolvedMembershipId,
        classId: resolvedClassId,
        academicYearId: resolvedAcademicYearId,
        discountType: discountForm.discountType,
        coverageMode: normalizedDiscountCoverageMode,
        amount: normalizedDiscountAmount,
        percentage: normalizedDiscountPercentage,
        durationMode: discountForm.durationMode,
        startDate: discountForm.durationMode === 'custom_period' ? discountForm.startDate : '',
        endDate: discountForm.durationMode === 'custom_period' ? discountForm.endDate : '',
        reason: discountForm.reason
      });
      const selectedStudent = students.find((item) => String(item?._id || '') === String(discountForm.studentId || ''));
      const selectedClass = classOptions.find((item) => item.classId === resolvedClassId);
      const selectedAcademicYear = academicYears.find((item) => item.id === resolvedAcademicYearId);
      const createdDiscount = {
        ...(data?.item || {}),
        id: data?.item?.id || data?.item?._id || `discount-${Date.now()}`,
        discountType: data?.item?.discountType || discountForm.discountType,
        coverageMode: data?.item?.coverageMode || normalizedDiscountCoverageMode,
        amount: Number(data?.item?.amount || normalizedDiscountAmount || 0),
        percentage: Number(data?.item?.percentage || normalizedDiscountPercentage || 0),
        durationMode: data?.item?.durationMode || discountForm.durationMode || 'academic_year',
        startDate: data?.item?.startDate || (discountForm.durationMode === 'custom_period' ? discountForm.startDate : null),
        endDate: data?.item?.endDate || (discountForm.durationMode === 'custom_period' ? discountForm.endDate : null),
        reason: data?.item?.reason || discountForm.reason,
        status: data?.item?.status || 'active',
        student: data?.item?.student || {
          userId: discountForm.studentId,
          fullName: selectedStudent?.fullName || selectedStudent?.name || membershipStudent?.fullName || membershipStudent?.name || '',
          name: selectedStudent?.name || selectedStudent?.fullName || membershipStudent?.name || membershipStudent?.fullName || ''
        },
        schoolClass: data?.item?.schoolClass || {
          id: resolvedClassId,
          title: membershipStudent?.classTitle || selectedClass?.title || ''
        },
        academicYear: data?.item?.academicYear || {
          id: resolvedAcademicYearId,
          title: membershipStudent?.academicYearTitle || selectedAcademicYear?.title || ''
        }
      };
      if (createdDiscount.discountType === 'discount') {
        setDiscountRegistry((prev) => [createdDiscount, ...prev.filter((item) => item.id !== createdDiscount.id)]);
      }
      setMessage(data.message || 'تخفیف متعلم ثبت شد');
      setDiscountForm((prev) => ({
        ...prev,
        amount: '',
        percentage: '',
        durationMode: 'academic_year',
        startDate: '',
        endDate: '',
        reason: ''
      }));
      await refreshPaymentWorkspace({
        includeAnomalies: true,
        includeRegistries: true
      });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    } finally {
      discountSubmitInFlightRef.current = false;
    }
  };

  const cancelDiscountRegistry = async (discountId) => {
    const reason = window.prompt('دلیل لغو تخفیف:', '') || '';
    if (!reason.trim()) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/discounts/${discountId}/cancel`, { reason });
      setDiscountRegistry((prev) => prev.filter((item) => item.id !== discountId));
      setMessage(data.message || 'تخفیف لغو شد');
      await refreshPaymentWorkspace({
        includeAnomalies: true,
        includeRegistries: true
      });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const saveExemptionRegistry = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      const membershipStudent = financeMembershipStudents.find((item) => (
        String(item?._id || '') === String(exemptionForm.studentId || '')
        && (!exemptionForm.studentMembershipId || String(item?.membershipId || '') === String(exemptionForm.studentMembershipId))
      )) || null;
      const resolvedMembershipId = membershipStudent?.membershipId || exemptionForm.studentMembershipId || findFinanceMembershipId(exemptionForm);
      const resolvedClassId = membershipStudent?.classId || exemptionForm.classId;
      const resolvedAcademicYearId = membershipStudent?.academicYearId || exemptionForm.academicYearId;
      if (!exemptionForm.studentId || !resolvedClassId || !resolvedAcademicYearId || !resolvedMembershipId) {
        throw new Error('برای ثبت معافیت، متعلم، صنف و سال تعلیمی مربوط به همان عضویت را انتخاب کنید.');
      }
      if (exemptionForm.exemptionType === 'partial'
        && toSafeNumber(exemptionForm.amount) <= 0
        && toSafeNumber(exemptionForm.percentage) <= 0) {
        throw new Error('برای معافیت جزئی، مبلغ یا فیصدی معتبر بزرگ‌تر از صفر وارد کنید.');
      }
      const data = await postJson(`${API_BASE}/api/student-finance/exemptions`, {
        student: exemptionForm.studentId,
        studentMembershipId: resolvedMembershipId,
        classId: resolvedClassId,
        academicYearId: resolvedAcademicYearId,
        exemptionType: exemptionForm.exemptionType,
        scope: exemptionForm.scope,
        amount: exemptionForm.exemptionType === 'partial' ? exemptionForm.amount : '',
        percentage: exemptionForm.exemptionType === 'partial' ? exemptionForm.percentage : '',
        reason: exemptionForm.reason,
        note: exemptionForm.note
      });
      const selectedStudent = students.find((item) => String(item?._id || '') === String(exemptionForm.studentId || ''));
      const selectedClass = classOptions.find((item) => item.classId === resolvedClassId);
      const selectedAcademicYear = academicYears.find((item) => item.id === resolvedAcademicYearId);
      const createdExemption = {
        ...(data?.item || {}),
        id: data?.item?.id || data?.item?._id || `exemption-${Date.now()}`,
        exemptionType: data?.item?.exemptionType || exemptionForm.exemptionType,
        scope: data?.item?.scope || exemptionForm.scope,
        amount: Number(data?.item?.amount || exemptionForm.amount || 0),
        percentage: Number(data?.item?.percentage || (exemptionForm.exemptionType === 'partial' ? exemptionForm.percentage || 0 : 100)),
        reason: data?.item?.reason || exemptionForm.reason,
        note: data?.item?.note || exemptionForm.note,
        status: data?.item?.status || 'active',
        student: data?.item?.student || {
          userId: exemptionForm.studentId,
          fullName: selectedStudent?.fullName || selectedStudent?.name || '',
          name: selectedStudent?.name || selectedStudent?.fullName || ''
        },
        schoolClass: data?.item?.schoolClass || {
          id: resolvedClassId,
          title: selectedClass?.title || ''
        },
        academicYear: data?.item?.academicYear || {
          id: resolvedAcademicYearId,
          title: selectedAcademicYear?.title || ''
        }
      };
      setExemptions((prev) => [createdExemption, ...prev.filter((item) => item.id !== createdExemption.id)]);
      setMessage(data.message || 'معافیت/رایگان‌بودن متعلم ثبت شد');
      setExemptionForm((prev) => ({
        ...prev,
        amount: '',
        percentage: '',
        reason: '',
        note: ''
      }));
      await refreshPaymentWorkspace({
        includeAnomalies: true,
        includeRegistries: true
      });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const cancelExemptionRegistry = async (exemptionId) => {
    const cancelReason = window.prompt('دلیل لغو معافیت:', '') || '';
    if (!cancelReason.trim()) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/exemptions/${exemptionId}/cancel`, { cancelReason });
      setExemptions((prev) => prev.filter((item) => item.id !== exemptionId));
      setMessage(data.message || 'معافیت لغو شد');
      await refreshPaymentWorkspace({
        includeAnomalies: true,
        includeRegistries: true
      });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const cancelReliefRegistryItem = async (item) => {
    const sourceModel = String(item?.sourceModel || '').trim();
    const sourceEntityId = getReliefSourceEntityId(item);
    if (!sourceEntityId) {
      setMessage('شناسه مرجع این تسهیل مالی پیدا نشد.');
      return;
    }
    if (sourceModel === 'discount') {
      await cancelDiscountRegistry(sourceEntityId);
      return;
    }
    if (sourceModel === 'fee_exemption') {
      await cancelExemptionRegistry(sourceEntityId);
      return;
    }
    setMessage('لغو مستقیم فعلاً فقط برای تخفیف‌ها و معافیت‌های رسمی پشتیبانی می‌شود.');
  };

  const approveReceipt = async (id) => {
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/payments/${id}/approve`, {});
      setMessage(data.message || 'رسید تایید شد');
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const rejectReceipt = async (id) => {
    const reason = window.prompt('دلیل رد رسید:', '') || '';
    if (!reason.trim()) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/payments/${id}/reject`, { reason });
      setMessage(data.message || 'رسید رد شد');
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const refreshRefunds = async () => {
    try {
      const data = await fetchJson(`${API_BASE}/api/student-finance/refunds?limit=200`);
      if (data?.success) setRefunds(data.items || []);
    } catch {
      // keep the previously loaded list on a transient error
    }
  };

  const createRefundCase = async (payload) => {
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/refunds`, payload);
      setMessage(data.message || 'درخواست بازپرداخت ثبت شد.');
      await refreshRefunds();
      if (data?.item?._id) setSelectedRefundId(String(data.item._id));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createManualRefundCase = async () => {
    if (!manualRefundForm.feeOrderId) {
      setMessage('یک بل را برای بازپرداخت انتخاب کنید.');
      return;
    }
    await createRefundCase({
      feeOrderId: manualRefundForm.feeOrderId,
      amount: manualRefundForm.amount ? Number(manualRefundForm.amount) : undefined,
      reason: manualRefundForm.reason,
      reasonNote: manualRefundForm.reasonNote
    });
    setManualRefundForm({ feeOrderId: '', amount: '', reason: 'membership_ended', reasonNote: '' });
  };

  const createRefundFromAnomaly = async () => {
    if (!selectedAnomaly) return;
    await createRefundCase({
      billId: selectedAnomaly.billId || undefined,
      feeOrderId: selectedAnomaly.orderId || undefined,
      reason: 'membership_ended',
      reasonNote: selectedAnomaly.description || ''
    });
    await refreshPaymentWorkspace({ includeAnomalies: true });
  };

  const approveRefund = async () => {
    if (!selectedRefund) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/refunds/${selectedRefund._id}/approve`, { note: refundReviewNote });
      setMessage(data.message || 'درخواست بازپرداخت تایید شد.');
      setRefundReviewNote('');
      await refreshRefunds();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const rejectRefund = async () => {
    if (!selectedRefund) return;
    const reason = refundReviewNote.trim() || window.prompt('دلیل رد درخواست بازپرداخت:', '') || '';
    if (!reason.trim()) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/refunds/${selectedRefund._id}/reject`, { reason });
      setMessage(data.message || 'درخواست بازپرداخت رد شد.');
      setRefundReviewNote('');
      await refreshRefunds();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const markRefundAsPaid = async () => {
    if (!selectedRefund) return;
    if (!refundPayForm.proofReference.trim()) {
      setMessage('شماره سند/رسید بازپرداخت را وارد کنید.');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/refunds/${selectedRefund._id}/mark-paid`, {
        refundMethod: refundPayForm.refundMethod,
        proofReference: refundPayForm.proofReference,
        accountId: refundPayForm.accountId || undefined
      });
      setMessage(data.message || 'بازپرداخت با موفقیت ثبت شد.');
      setRefundPayForm({ refundMethod: 'cash', proofReference: '', accountId: '' });
      await refreshRefunds();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const refreshExpenses = async () => {
    try {
      const data = await fetchJson(`${API_BASE}/api/finance/admin/expenses`);
      if (data?.success) setExpenses(data.items || []);
    } catch {
      // keep the previously loaded list on a transient error
    }
  };

  const createExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.category) {
      setMessage('دسته‌بندی مصرف را انتخاب کنید.');
      return;
    }
    if (!expenseForm.academicYearId) {
      setMessage('سال تعلیمی را برای ثبت مصرف انتخاب کنید.');
      return;
    }
    if (!expenseForm.expenseDate || toSafeNumber(expenseForm.amount) <= 0) {
      setMessage('تاریخ و مبلغ معتبر برای مصرف وارد کنید.');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/expenses`, {
        academicYearId: expenseForm.academicYearId,
        classId: expenseForm.classId || undefined,
        category: expenseForm.category,
        subCategory: expenseForm.subCategory,
        amount: expenseForm.amount,
        currency: expenseForm.currency,
        expenseDate: expenseForm.expenseDate,
        paymentMethod: expenseForm.paymentMethod,
        treasuryAccountId: expenseForm.treasuryAccountId || undefined,
        vendorName: expenseForm.vendorName,
        referenceNo: expenseForm.referenceNo,
        note: expenseForm.note,
        status: expenseForm.submitForReview ? 'pending_review' : 'draft'
      });
      setMessage(data.message || 'مصرف ثبت شد.');
      setExpenseForm((prev) => ({
        ...prev,
        subCategory: '',
        amount: '',
        vendorName: '',
        referenceNo: '',
        note: ''
      }));
      await refreshExpenses();
      await refreshPaymentWorkspace();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitExpenseForReview = async (expenseId) => {
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/expenses/${expenseId}/submit`, {});
      setMessage(data.message || 'مصرف برای بررسی ارسال شد.');
      await refreshExpenses();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reviewExpenseEntry = async (expenseId, action = 'approve') => {
    let reason = '';
    if (action === 'reject') {
      reason = window.prompt('دلیل رد مصرف:', '') || '';
      if (!reason.trim()) return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/expenses/${expenseId}/review`, {
        action,
        reason,
        note: action === 'reject' ? 'از مرکز مالی مکتب رد شد.' : 'از مرکز مالی مکتب تایید شد.'
      });
      setMessage(data.message || (action === 'reject' ? 'مصرف رد شد.' : 'مصرف بررسی و ثبت شد.'));
      await refreshExpenses();
      await refreshPaymentWorkspace();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const voidExpenseEntry = async (expenseId) => {
    const reason = window.prompt('دلیل باطل‌سازی مصرف:', '') || '';
    if (!reason.trim()) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/expenses/${expenseId}/void`, { note: reason });
      setMessage(data.message || 'مصرف باطل شد.');
      await refreshExpenses();
      await refreshPaymentWorkspace();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteExpenseEntry = async (expenseId) => {
    if (!window.confirm('این مصرفِ پیش‌نویس کاملاً حذف شود؟ این کار قابل بازگشت نیست.')) return;
    try {
      setBusy(true);
      const data = await fetchJson(`${API_BASE}/api/finance/admin/expenses/${expenseId}`, { method: 'DELETE' });
      if (!data?.success) throw new Error(data?.message || 'حذف مصرف ناموفق بود');
      setMessage(data.message || 'مصرف پیش‌نویس حذف شد.');
      await refreshExpenses();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createExpenseCategory = async (e) => {
    e.preventDefault();
    if (!newExpenseCategoryForm.label.trim()) {
      setMessage('نام دسته را وارد کنید.');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/expense-categories`, {
        label: newExpenseCategoryForm.label
      });
      setMessage(data.message || 'دسته‌بندی مصرف ثبت شد.');
      setExpenseCategories((prev) => [...prev, data.item]);
      setExpenseForm((prev) => ({ ...prev, category: data.item?.key || prev.category }));
      setNewExpenseCategoryForm({ label: '' });
      setShowAddExpenseCategory(false);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const applyClassPaymentApprovals = async () => {
    const classId = String(classPaymentApprovalForm.classId || '').trim();
    const feeType = String(classPaymentApprovalForm.feeType || 'all').trim();
    const eligibleItems = classPaymentApprovalPreview.items.filter((item) => item?.eligible);
    if (!classId) {
      setMessage('ابتدا صنف مربوط به رسیدها را انتخاب کنید.');
      return;
    }
    if (!eligibleItems.length) {
      setMessage('برای این صنف رسید قابل تأیید نهایی پیدا نشد.');
      return;
    }

    const selectedClass = classOptions.find((item) => item.classId === classId);
    const feeTypeLabel = feeType === 'admission'
      ? 'داخله'
      : feeType === 'tuition'
        ? 'فیس/شهریه'
        : 'داخله و فیس/شهریه';
    const totalAmount = eligibleItems.reduce((sum, item) => sum + toSafeNumber(item?.amount), 0);
    const confirmed = window.confirm(
      `${eligibleItems.length} رسید ${feeTypeLabel} در صنف ${getClassOptionLabel(selectedClass || {})} تأیید نهایی شود؟\n`
      + `مجموع قابل تأیید: ${fmt(totalAmount)} AFN\n`
      + 'پس از تأیید، مبلغ هر رسید روی بل مربوط ثبت و به حساب خزانه منتقل می‌شود.'
    );
    if (!confirmed) return;

    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/payment-approvals/apply`, {
        classId,
        feeType,
        paymentIds: eligibleItems.map((item) => item.paymentId),
        note: String(classPaymentApprovalForm.note || '').trim()
      });
      const approved = Number(data?.summary?.approved || 0);
      const failed = Number(data?.summary?.failed || 0);
      setMessage(
        data?.message
        || `${approved} رسید تأیید نهایی شد${failed ? ` و ${failed} مورد برای بررسی باقی ماند` : ''}.`
      );
      setClassPaymentApprovalRefreshKey((value) => value + 1);
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const applyAdmissionReceiptCorrections = async () => {
    const classId = String(admissionReceiptCorrectionForm.classId || '').trim();
    const eligibleItems = admissionReceiptCorrectionPreview.items.filter((item) => item?.eligible);
    if (!classId) {
      setMessage('ابتدا صنف مربوط به رسیدهای داخله را انتخاب کنید.');
      return;
    }
    if (!eligibleItems.length) {
      setMessage('برای این صنف رسید نادرست و قابل اصلاح پیدا نشد.');
      return;
    }
    const selectedClass = classOptions.find((item) => item.classId === classId);
    const totalOld = eligibleItems.reduce((sum, item) => sum + toSafeNumber(item?.currentPaymentAmount), 0);
    const totalNew = eligibleItems.reduce((sum, item) => sum + toSafeNumber(item?.plannedAmount), 0);
    const confirmed = window.confirm(
      `${eligibleItems.length} رسید داخله در صنف ${getClassOptionLabel(selectedClass || {})} اصلاح شود؟\n`
      + `مجموع فعلی: ${fmt(totalOld)} AFN\nمجموع صحیح پلان: ${fmt(totalNew)} AFN\n`
      + 'رسیدهای قبلی رد و بل‌های قبلی باطل می‌شوند؛ سپس سندهای جایگزین دوباره به صف تأیید می‌آیند.'
    );
    if (!confirmed) return;

    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/admission-receipt-corrections/apply`, {
        classId,
        paymentIds: eligibleItems.map((item) => item.paymentId),
        note: String(admissionReceiptCorrectionForm.note || '').trim()
      });
      const corrected = Number(data?.summary?.corrected || 0);
      const failed = Number(data?.summary?.failed || 0);
      setMessage(
        data?.message
        || `${corrected} رسید اصلاح شد${failed ? ` و ${failed} مورد نیازمند بررسی باقی ماند` : ''}.`
      );
      setAdmissionReceiptCorrectionRefreshKey((value) => value + 1);
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const applyPaymentScopeRepair = async () => {
    const classId = String(paymentScopeRepairForm.classId || '').trim();
    const eligibleItems = paymentScopeRepairPreview.items.filter((item) => item?.repairable);
    if (!classId) {
      setMessage('ابتدا صنف مربوط به پرداخت‌ها را انتخاب کنید.');
      return;
    }
    if (!eligibleItems.length) {
      setMessage('برای این صنف پرداخت قابل ترمیم خودکار پیدا نشد.');
      return;
    }
    const selectedClass = classOptions.find((item) => item.classId === classId);
    const confirmed = window.confirm(
      `${eligibleItems.length} پرداخت صنف ${getClassOptionLabel(selectedClass || {})} بر اساس نوع فیس تفکیک شود؟\n`
      + `مجموع مبلغ مورد بررسی: ${fmt(eligibleItems.reduce((sum, item) => sum + toSafeNumber(item?.amount), 0))} AFN\n`
      + 'مبلغ صندوق، شماره رسید و مجموع پرداخت تغییر نمی‌کند؛ فقط انتساب فیس/داخله بازسازی می‌شود.'
    );
    if (!confirmed) return;

    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/payment-scope-repairs/apply`, {
        classId,
        paymentIds: eligibleItems.map((item) => item.paymentId),
        note: String(paymentScopeRepairForm.note || '').trim()
      });
      setMessage(data?.message || `${Number(data?.summary?.repaired || 0)} پرداخت تفکیک شد.`);
      setPaymentScopeRepairRefreshKey((value) => value + 1);
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const saveReceiptFollowUp = async () => {
    if (!selectedReceipt?._id) return;
    if (!receiptFollowUpForm.assignedLevel || !receiptFollowUpForm.status) {
      setMessage('سطح ارجاع و وضعیت پیگیری را تکمیل کنید.');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/payments/${selectedReceipt._id}/follow-up`, {
        assignedLevel: receiptFollowUpForm.assignedLevel,
        status: receiptFollowUpForm.status,
        note: receiptFollowUpForm.note
      });
      setMessage(data.message || 'پیگیری پرداخت به‌روزرسانی شد');
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const printSelectedReceipt = async () => {
    // The backend has been observed taking 5-10+ seconds to answer this exact endpoint under
    // load, with nothing on screen telling the admin a print is even in progress. Without this
    // guard/feedback, an admin who doesn't see anything happen for several seconds naturally
    // clicks the button again, firing a second overlapping fetch+print for the same receipt (as
    // seen in a real production log) instead of just waiting for the first one to finish.
    if (!selectedReceipt?._id || busy) return;
    setBusy(true);
    try {
      // Open the window synchronously, in direct response to the click - not after the await
      // below. Opening it later (once the fetch resolves) is what most browsers' popup blockers
      // treat as "not user-initiated" and silently block.
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setMessage('مرورگر بازشدن پنجرهٔ چاپ را مسدود کرد؛ لطفاً پنجره‌های بازشو (popup) را برای این سایت مجاز کنید.');
        return;
      }
      const detailedReceipt = await fetchReceiptDetailRow(selectedReceipt._id);
      setSelectedReceiptDetail(detailedReceipt);
      const model = buildReceiptPrintModel({ ...selectedReceipt, ...detailedReceipt });
      if (!model) {
        printWindow.close();
        setMessage('داده‌ای برای چاپ آماده نشد؛ لطفاً دوباره تلاش کنید.');
        return;
      }
      const html = buildReceiptPrintHtml(model, activeSchoolPrintInfo, printLogoUrls);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (err) {
      setMessage(err.message || 'جزئیات رسید برای چاپ دریافت نشد.');
    } finally {
      setBusy(false);
    }
  };

  const printCashierReport = async () => {
    if (!cashierReportPrintModel || busy) return;
    setBusy(true);
    try {
      await schedulePrint('cashier');
    } finally {
      setBusy(false);
    }
  };

  const exportCashierReportCsv = () => {
    if (!cashierReportPrintModel) return;
    const header = [
      'شماره پرداخت',
      'متعلم',
      'صنف',
      'سال تعلیمی',
      'مبلغ',
      'روش پرداخت',
      'مرجع',
      'وضعیت',
      'ثبت‌کننده',
      'تاریخ پرداخت'
    ];
    const rows = cashierReportPrintModel.items.map((item) => ([
      formatFinanceCode(item?.paymentNumber || item?.id, ''),
      item?.student?.fullName || item?.student?.name || '',
      item?.schoolClass?.title || '',
      item?.academicYear?.title || item?.receiptDetails?.academicYearTitle || '',
      Number(item?.amount || 0),
      PAYMENT_METHOD_UI_LABELS[item?.paymentMethod] || item?.paymentMethod || '',
      item?.referenceNo || '',
      item?.status || '',
      item?.receivedBy?.name || 'ثبت سیستمی',
      toFaDate(item?.paidAt)
    ]));
    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsvValue).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-cashier-${cashierReportPrintModel.date || 'report'}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const addDiscount = async (billId) => {
    const amount = Number(window.prompt('مبلغ تخفیف/معافیت:', '0') || 0);
    if (!amount) return;
    const typeInput = (window.prompt('نوع تعدیل را بنویسید: تخفیف، معافیت یا جریمه', 'تخفیف') || 'تخفیف').trim().toLowerCase();
    const type = ({ تخفیف: 'discount', معافیت: 'waiver', جریمه: 'penalty' }[typeInput] || typeInput || 'discount');
    const reason = window.prompt('دلیل:', '') || '';
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/orders/${billId}/discount`, { type, amount, reason });
      setMessage(data.message || 'تعدیل ثبت شد');
      await refreshPaymentWorkspace({ includeAnomalies: true, includeRegistries: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const setInstallments = async (billId) => {
    const count = Number(window.prompt('تعداد اقساط:', '3') || 0);
    if (!count) return;
    const startDate = window.prompt('تاریخ شروع قسط را به فرمت ثبت سیستم وارد کنید، مانند 2026-05-08:', '') || '';
    if (!startDate) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/orders/${billId}/installments`, { count, startDate, stepDays: 30 });
      setMessage(data.message || 'قسط‌بندی ثبت شد');
      await refreshPaymentWorkspace();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const voidBill = async (billId) => {
    const reason = window.prompt('دلیل باطل‌سازی:', '') || '';
    if (!reason.trim()) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/orders/${billId}/void`, { reason });
      setMessage(data.message || 'بل باطل شد');
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const requestMonthClose = async () => {
    const note = window.prompt('یادداشت بستن ماه مالی (اختیاری):', '') || '';
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/month-close`, { monthKey, note });
      if (data?.item?._id) setSelectedMonthCloseId(data.item._id);
      setMessage(data.message || 'ماه مالی بسته شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const approveMonthClose = async (item = null) => {
    const targetId = String(item?._id || item?.id || selectedMonthClose?._id || selectedMonthClose?.id || '').trim();
    if (!targetId) return;
    const note = window.prompt('یادداشت تایید این مرحله (اختیاری):', '') || '';
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/month-close/${targetId}/approve`, { note });
      if (data?.item?._id) setSelectedMonthCloseId(data.item._id);
      setMessage(data.message || 'مرحله بستن ماه مالی تایید شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const rejectMonthClose = async (item = null) => {
    const targetId = String(item?._id || item?.id || selectedMonthClose?._id || selectedMonthClose?.id || '').trim();
    if (!targetId) return;
    const reason = window.prompt('دلیل رد یا برگشت درخواست بستن ماه مالی:', '') || '';
    if (!reason.trim()) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/month-close/${targetId}/reject`, { reason });
      if (data?.item?._id) setSelectedMonthCloseId(data.item._id);
      setMessage(data.message || 'درخواست بستن ماه مالی رد شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const reopenMonthClose = async (item = null) => {
    const targetId = String(item?._id || item?.id || selectedMonthClose?._id || selectedMonthClose?.id || '').trim();
    if (!targetId) return;
    const note = window.prompt('دلیل بازگشایی کنترل‌شده ماه مالی:', '') || '';
    if (!note.trim()) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/month-close/${targetId}/reopen`, { note });
      if (data?.item?._id) setSelectedMonthCloseId(data.item._id);
      setMessage(data.message || 'ماه مالی بازگشایی شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const exportMonthCloseSnapshot = async (item = null) => {
    const targetId = String(item?._id || item?.id || selectedMonthClose?._id || selectedMonthClose?.id || '').trim();
    if (!targetId) return;
    try {
      const res = await fetch(`${API_BASE}/api/finance/admin/month-close/${targetId}/export.csv`, {
        headers: { ...getAuthHeaders() }
      });
      if (!res.ok) throw new Error('دانلود snapshot ماه مالی ناموفق بود');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-month-close-${selectedMonthClose?.monthKey || 'snapshot'}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const exportMonthClosePdfPack = async (item = null) => {
    const targetId = String(item?._id || item?.id || selectedMonthClose?._id || selectedMonthClose?.id || '').trim();
    if (!targetId) return;
    try {
      const res = await fetch(`${API_BASE}/api/finance/admin/month-close/${targetId}/export.pdf`, {
        headers: { ...getAuthHeaders() }
      });
      if (!res.ok) throw new Error('دانلود بسته PDF ماه مالی ناموفق بود');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-month-close-${selectedMonthClose?.monthKey || 'snapshot'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      await loadAll();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const verifyFinanceDocumentCode = async (code = documentVerificationCode) => {
    const normalizedCode = String(code || '').trim();
    if (!normalizedCode) {
      setMessage('کد اعتبارسنجی سند مالی را وارد کنید');
      return;
    }
    try {
      setBusy(true);
      const data = await fetchJson(`${API_BASE}/api/finance/documents/verify/${encodeURIComponent(normalizedCode)}`);
      if (!data?.success || !data?.item) {
        throw new Error(data?.message || 'اعتبارسنجی سند مالی ناموفق بود');
      }
      setVerifiedDocument(data?.item || null);
      setDocumentVerificationCode(normalizedCode);
      setMessage(data?.item?.documentNo ? `سند ${data.item.documentNo} اعتبارسنجی شد` : 'سند مالی اعتبارسنجی شد');
      await loadAll();
    } catch (err) {
      setVerifiedDocument(null);
      setMessage(err.message || 'اعتبارسنجی سند مالی ناموفق بود');
      setBusy(false);
    }
  };

  const runFinanceDocumentVerification = async (code = documentVerificationCode) => {
    const normalizedCode = String(code || '').trim();
    if (!normalizedCode) {
      setMessage('کد اعتبارسنجی سند مالی را وارد کنید');
      return;
    }
    try {
      setBusy(true);
      const data = await fetchJson(`${API_BASE}/api/finance/documents/verify/${encodeURIComponent(normalizedCode)}`);
      if (!data?.success || !data?.item) {
        throw new Error(data?.message || 'اعتبارسنجی سند مالی ناموفق بود');
      }
      const nextVerifiedDocument = data.item;
      setVerifiedDocument(nextVerifiedDocument);
      setDocumentVerificationCode(normalizedCode);
      setDocumentArchiveItems((prev) => prev.map((item) => {
        const matchesCode = String(item?.verification?.code || '').trim() === normalizedCode;
        const matchesDocumentNo = nextVerifiedDocument?.documentNo
          && String(item?.documentNo || '').trim() === String(nextVerifiedDocument.documentNo || '').trim();
        if (!matchesCode && !matchesDocumentNo) return item;
        return {
          ...item,
          status: nextVerifiedDocument?.status || item?.status || 'active',
          verifyCount: Number(nextVerifiedDocument?.verifyCount || item?.verifyCount || 0),
          lastVerifiedAt: nextVerifiedDocument?.lastVerifiedAt || item?.lastVerifiedAt || new Date().toISOString(),
          verification: {
            ...(item?.verification || {}),
            ...(nextVerifiedDocument?.verification || {})
          }
        };
      }));
      setMessage(nextVerifiedDocument?.documentNo ? `سند ${nextVerifiedDocument.documentNo} اعتبارسنجی شد` : 'سند مالی اعتبارسنجی شد');
    } catch (err) {
      setVerifiedDocument(null);
      setMessage(err.message || 'اعتبارسنجی سند مالی ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const downloadBatchStatementZip = async () => {
    const payload = {
      classId: String(documentBatchForm.classId || '').trim(),
      academicYearId: String(documentBatchForm.academicYearId || '').trim(),
      monthKey: String(documentBatchForm.monthKey || monthKey || '').trim()
    };
    if (!payload.classId) {
      setMessage('برای بسته گروهی، صنف را انتخاب کنید');
      return;
    }
    try {
      setBusy(true);
      const res = await fetch(`${API_BASE}/api/finance/admin/documents/batch-statements.zip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        let responseMessage = 'دانلود بسته گروهی استیتمنت ناموفق بود';
        try {
          const data = await res.json();
          responseMessage = data?.message || responseMessage;
        } catch {
          responseMessage = 'دانلود بسته گروهی استیتمنت ناموفق بود';
        }
        throw new Error(responseMessage);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const classLabel = classOptions.find((item) => item.classId === payload.classId)?.title || payload.classId;
      const link = document.createElement('a');
      link.href = url;
      link.download = `finance-batch-statements-${payload.monthKey || 'all'}-${classLabel}.zip`;
      link.click();
      window.URL.revokeObjectURL(url);
      setMessage('بسته گروهی استیتمنت مالی دانلود شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const sendDocumentArchiveDelivery = async () => {
    const archiveId = String(selectedDocumentArchive?._id || '').trim();
    if (!archiveId) {
      setMessage('ابتدا یک سند را از آرشیف انتخاب کنید');
      return;
    }
    if (archiveDeliveryBlocked) {
      setMessage('ارسال پرتال برای سندهای گروهی پشتیبانی نمی‌شود.');
      return;
    }
    try {
      setBusy(true);
      const res = await fetch(`${API_BASE}/api/finance/admin/document-archive/${archiveId}/deliver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          channel: documentDeliveryForm.channel,
          recipientHandles: documentDeliveryForm.recipientHandles,
          includeLinkedAudience: documentDeliveryForm.includeLinkedAudience,
          subject: documentDeliveryForm.subject,
          note: documentDeliveryForm.note
        })
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || 'ارسال سند مالی ناموفق بود');
      }
      setMessage(data?.message || 'ارسال سند مالی ثبت شد');
      setDocumentDeliveryForm((prev) => ({
        ...prev,
        recipientHandles: '',
        note: ''
      }));
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const saveDeliveryProviderConfig = async () => {
    const channel = String(selectedDeliveryProviderChannel || deliveryProviderForm.channel || '').trim() || 'sms';
    const payload = {
      mode: String(deliveryProviderForm.mode || 'webhook').trim() || 'webhook',
      provider: String(deliveryProviderForm.provider || '').trim(),
      isActive: deliveryProviderForm.isActive,
      webhookUrl: String(deliveryProviderForm.webhookUrl || '').trim(),
      statusWebhookUrl: String(deliveryProviderForm.statusWebhookUrl || '').trim(),
      fromHandle: String(deliveryProviderForm.fromHandle || '').trim(),
      apiBaseUrl: String(deliveryProviderForm.apiBaseUrl || '').trim(),
      accountSid: String(deliveryProviderForm.accountSid || '').trim(),
      authToken: String(deliveryProviderForm.authToken || '').trim(),
      accessToken: String(deliveryProviderForm.accessToken || '').trim(),
      phoneNumberId: String(deliveryProviderForm.phoneNumberId || '').trim(),
      webhookToken: String(deliveryProviderForm.webhookToken || '').trim(),
      note: String(deliveryProviderForm.note || '').trim()
    };
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-providers/${encodeURIComponent(channel)}`, payload);
      setMessage(data?.message || 'تنظیمات ارایه‌کننده ذخیره شد');
      await loadAll();
      if (data?.item?.channel) {
        setSelectedDeliveryProviderChannel(String(data.item.channel));
      }
    } catch (err) {
      setMessage(err.message || 'ذخیره تنظیمات ارایه‌کننده ناموفق بود');
      setBusy(false);
    }
  };

  const rotateDeliveryProviderCredentials = async () => {
    const channel = String(selectedDeliveryProviderChannel || deliveryProviderForm.channel || '').trim() || 'sms';
    const payload = {
      accountSid: String(deliveryProviderForm.accountSid || '').trim(),
      authToken: String(deliveryProviderForm.authToken || '').trim(),
      accessToken: String(deliveryProviderForm.accessToken || '').trim(),
      phoneNumberId: String(deliveryProviderForm.phoneNumberId || '').trim(),
      webhookToken: String(deliveryProviderForm.webhookToken || '').trim(),
      note: String(deliveryProviderForm.rotationNote || '').trim()
    };
    const providedFields = ['accountSid', 'authToken', 'accessToken', 'phoneNumberId', 'webhookToken']
      .filter((field) => String(payload[field] || '').trim());
    if (!providedFields.length) {
      setMessage('برای چرخش دسترسی، حداقل یک اعتبارنامه جدید وارد کنید');
      return;
    }
    if (!payload.note) {
      setMessage('برای چرخش اعتبارنامه، یادداشت ثبت کنید');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-providers/${encodeURIComponent(channel)}/rotate`, payload);
      setMessage(data?.message || 'چرخش اعتبارنامه‌ها ثبت شد');
      await loadAll();
      setDeliveryProviderForm((prev) => ({
        ...prev,
        accountSid: '',
        authToken: '',
        accessToken: '',
        phoneNumberId: '',
        webhookToken: '',
        rotationNote: ''
      }));
      if (data?.item?.channel) {
        setSelectedDeliveryProviderChannel(String(data.item.channel));
      }
    } catch (err) {
      setMessage(err.message || 'چرخش اعتبارنامه‌ها ناموفق بود');
      setBusy(false);
    }
  };

  const loadSelectedTemplateVersionIntoForm = () => {
    if (!selectedDeliveryTemplateVersion) {
      setMessage('نسخه قالب پیام انتخاب نشده است');
      return;
    }
    setDeliveryCampaignForm((prev) => ({
      ...prev,
      messageTemplateSubject: String(selectedDeliveryTemplateVersion.subject || '').trim(),
      messageTemplateBody: String(selectedDeliveryTemplateVersion.body || '').trim()
    }));
    setDeliveryTemplateChangeNote(String(selectedDeliveryTemplateVersion.changeNote || '').trim());
    setMessage('نسخه قالب پیام در ویرایشگر بارگذاری شد');
  };

  const saveDeliveryTemplateDraft = async () => {
    const templateKey = String(deliveryCampaignForm.messageTemplateKey || '').trim();
    if (!templateKey) {
      setMessage('ابتدا یک قالب پیام انتخاب کنید');
      return;
    }
    if (deliveryTemplateUnknownVariables.length) {
      setMessage(`جای‌نگهدار نامعتبر: ${deliveryTemplateUnknownVariables.join('، ')}`);
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/draft`, {
        subject: effectiveDeliveryTemplateSubject,
        body: effectiveDeliveryTemplateBody,
        changeNote: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'نسخه پیش‌نویس قالب ذخیره شد');
      await loadAll();
      if (data?.item?.draftVersionNumber) {
        setSelectedDeliveryTemplateVersionNumber(String(data.item.draftVersionNumber));
      }
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const requestDeliveryTemplateReview = async () => {
    const templateKey = String(deliveryCampaignForm.messageTemplateKey || '').trim();
    const versionNumber = Number(selectedDeliveryTemplate?.draftVersionNumber || 0) || Number(selectedDeliveryTemplateVersion?.versionNumber || 0) || 0;
    if (!templateKey || !versionNumber) {
      setMessage('نسخه پیش‌نویس برای بازبینی موجود نیست');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/review`, {
        versionNumber,
        note: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'نسخه قالب برای بازبینی ارسال شد');
      await loadAll();
      setSelectedDeliveryTemplateVersionNumber(String(versionNumber));
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const approveDeliveryTemplateVersion = async () => {
    const templateKey = String(deliveryCampaignForm.messageTemplateKey || '').trim();
    const versionNumber = Number(selectedDeliveryTemplateVersion?.versionNumber || 0) || 0;
    if (!templateKey || !versionNumber) {
      setMessage('نسخه قالب برای تایید انتخاب نشده است');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/approve`, {
        versionNumber,
        note: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'نسخه قالب تایید شد');
      await loadAll();
      setSelectedDeliveryTemplateVersionNumber(String(versionNumber));
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const rejectDeliveryTemplateVersion = async () => {
    const templateKey = String(deliveryCampaignForm.messageTemplateKey || '').trim();
    const versionNumber = Number(selectedDeliveryTemplateVersion?.versionNumber || 0) || 0;
    if (!templateKey || !versionNumber) {
      setMessage('نسخه قالب برای رد انتخاب نشده است');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/reject`, {
        versionNumber,
        note: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'نسخه قالب رد شد');
      await loadAll();
      setSelectedDeliveryTemplateVersionNumber(String(versionNumber));
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const publishDeliveryTemplateDraft = async () => {
    const templateKey = String(deliveryCampaignForm.messageTemplateKey || '').trim();
    const versionNumber = Number(selectedDeliveryTemplateVersion?.versionNumber || 0)
      || Number(selectedDeliveryTemplate?.draftVersionNumber || 0)
      || 0;
    if (!templateKey || !versionNumber) {
      setMessage('نسخه پیش‌نویس برای نشر موجود نیست');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/publish`, {
        versionNumber,
        note: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'نسخه قالب منتشر شد');
      await loadAll();
      if (data?.item?.publishedVersionNumber) {
        setSelectedDeliveryTemplateVersionNumber(String(data.item.publishedVersionNumber));
      }
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const archiveSelectedDeliveryTemplateVersion = async () => {
    const templateKey = String(deliveryCampaignForm.messageTemplateKey || '').trim();
    const versionNumber = Number(selectedDeliveryTemplateVersion?.versionNumber || 0) || 0;
    if (!templateKey || versionNumber <= 1) {
      setMessage('این نسخه قابل آرشیف نیست');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/archive`, {
        versionNumber,
        note: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'نسخه قالب آرشیف شد');
      await loadAll();
      setSelectedDeliveryTemplateVersionNumber(String(data?.item?.publishedVersionNumber || 1));
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const rollbackDeliveryTemplateVersion = async () => {
    const templateKey = String(deliveryCampaignForm.messageTemplateKey || '').trim();
    const versionNumber = Number(selectedDeliveryTemplateVersion?.versionNumber || 0) || 0;
    if (!templateKey || !versionNumber) {
      setMessage('نسخه قالب برای برگشت انتخاب نشده است');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/rollback`, {
        versionNumber,
        note: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'برگشت قالب انجام شد');
      await loadAll();
      setSelectedDeliveryTemplateVersionNumber(String(data?.item?.publishedVersionNumber || versionNumber));
      if (selectedDeliveryTemplateVersion) {
        setDeliveryCampaignForm((prev) => ({
          ...prev,
          messageTemplateSubject: String(selectedDeliveryTemplateVersion.subject || '').trim(),
          messageTemplateBody: String(selectedDeliveryTemplateVersion.body || '').trim()
        }));
      }
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const createDeliveryCampaign = async () => {
    const payload = {
      name: String(deliveryCampaignForm.name || '').trim(),
      documentType: String(deliveryCampaignForm.documentType || '').trim(),
      channel: String(deliveryCampaignForm.channel || 'email').trim() || 'email',
      classId: String(deliveryCampaignForm.classId || '').trim(),
      academicYearId: String(deliveryCampaignForm.academicYearId || '').trim(),
      monthKey: String(deliveryCampaignForm.monthKey || '').trim(),
      messageTemplateKey: String(deliveryCampaignForm.messageTemplateKey || '').trim(),
      templateVersionNumber: Number(selectedDeliveryTemplateVersionNumber || 0) || null,
      messageTemplateSubject: String(deliveryCampaignForm.messageTemplateSubject || '').trim(),
      messageTemplateBody: String(deliveryCampaignForm.messageTemplateBody || '').trim(),
      recipientHandles: String(deliveryCampaignForm.recipientHandles || '').trim(),
      includeLinkedAudience: deliveryCampaignForm.includeLinkedAudience,
      automationEnabled: deliveryCampaignForm.automationEnabled,
      intervalHours: Number(deliveryCampaignForm.intervalHours || 24),
      retryFailed: deliveryCampaignForm.retryFailed,
      maxDocumentsPerRun: Number(deliveryCampaignForm.maxDocumentsPerRun || 5),
      note: String(deliveryCampaignForm.note || '').trim()
    };
    if (!payload.name) {
      setMessage('نام کمپاین ارسال را وارد کنید');
      return;
    }
    if (payload.channel === 'portal' && payload.documentType === 'batch_statement_pack') {
      setMessage('کمپاین استیتمنت گروهی با کانال پرتال قابل اجرا نیست.');
      return;
    }
    try {
      setBusy(true);
      const preview = await requestDeliveryTemplatePreview(payload);
      setDeliveryTemplatePreview(preview);
      setDeliveryTemplatePreviewError('');
      if (preview && preview.valid === false && Array.isArray(preview.unknownVariables) && preview.unknownVariables.length) {
        setMessage(`جای‌نگهدار نامعتبر در قالب پیام: ${preview.unknownVariables.join('، ')}`);
        setBusy(false);
        return;
      }
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns`, payload);
      setMessage(data?.message || 'کمپاین ارسال ایجاد شد');
      setDeliveryCampaignForm((prev) => ({
        ...prev,
        name: '',
        messageTemplateKey: '',
        messageTemplateSubject: '',
        messageTemplateBody: '',
        recipientHandles: '',
        note: '',
        includeLinkedAudience: prev.documentType === 'batch_statement_pack' ? false : prev.includeLinkedAudience
      }));
      setDeliveryTemplatePreview(null);
      setDeliveryTemplatePreviewError('');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const runDeliveryCampaignQueue = async () => {
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/run-due`, {});
      const executed = Number(data?.result?.executed || 0);
      setMessage(data?.message || `صف کمپاین‌های ارسال اجرا شد (${fmt(executed)})`);
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const runDeliveryCampaign = async (campaign = selectedDeliveryCampaign) => {
    const campaignId = String(campaign?._id || '').trim();
    if (!campaignId) {
      setMessage('کمپاین ارسال انتخاب نشده است');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/${campaignId}/run`, {});
      setMessage(data?.message || 'کمپاین ارسال اجرا شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const toggleDeliveryCampaignStatus = async (campaign = selectedDeliveryCampaign) => {
    const campaignId = String(campaign?._id || '').trim();
    if (!campaignId) {
      setMessage('کمپاین ارسال انتخاب نشده است');
      return;
    }
    const nextStatus = String(campaign?.status || '').trim() === 'active' ? 'paused' : 'active';
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/${campaignId}/status`, {
        status: nextStatus
      });
      setMessage(data?.message || 'وضعیت کمپاین ارسال به‌روزرسانی شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const retryDeliveryQueueItem = async (item = {}) => {
    const campaignId = String(item?.campaignId || '').trim();
    const archiveId = String(item?.archiveId || '').trim();
    if (!campaignId || !archiveId) {
      setMessage('برای تلاش دوباره، کمپاین یا سند آرشیف کامل نیست.');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/${campaignId}/retry-target`, {
        archiveId
      });
      setMessage(data?.message || 'ارسال دوباره اجرا شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const replayDeliveryRecoveryItem = async (item = {}, providerStatus = 'delivered') => {
    const providerMessageId = String(item?.providerMessageId || '').trim();
    if (!providerMessageId) {
      setMessage('برای بازپخش وضعیت، شناسه پیام ارایه‌کننده موجود نیست.');
      return;
    }
    try {
      setBusy(true);
      const isFailureReplay = String(providerStatus || '').trim() === 'failed';
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/recovery-queue/replay`, {
        provider: item?.provider || '',
        providerMessageId,
        providerStatus,
        recipient: item?.recipient || '',
        failureCode: isFailureReplay ? (item?.failureCode || 'provider_rejected') : '',
        errorMessage: isFailureReplay ? (item?.errorMessage || 'manual recovery replay') : '',
        occurredAt: new Date().toISOString()
      });
      setMessage(data?.message || 'بازپخش وضعیت ارایه‌کننده انجام شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const runReminders = async () => {
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/reminders/run`, {});
      setMessage(data.message || 'یادآوری‌ها ارسال شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const saveAnomalyNote = async () => {
    if (!selectedAnomaly) return;
    try {
      setBusy(true);
      const data = await postJson(
        `${API_BASE}/api/finance/admin/anomalies/${encodeURIComponent(selectedAnomaly.id)}/note`,
        buildAnomalyActionPayload(selectedAnomaly, { note: anomalyWorkflowForm.note })
      );
      setMessage(data.message || 'یادداشت ناهنجاری مالی ذخیره شد');
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const assignAnomaly = async () => {
    if (!selectedAnomaly) return;
    try {
      setBusy(true);
      const data = await postJson(
        `${API_BASE}/api/finance/admin/anomalies/${encodeURIComponent(selectedAnomaly.id)}/assign`,
        buildAnomalyActionPayload(selectedAnomaly, {
          assignedLevel: anomalyWorkflowForm.assignedLevel,
          note: anomalyWorkflowForm.note
        })
      );
      setMessage(data.message || 'ناهجاری مالی ارجاع شد');
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const snoozeAnomaly = async () => {
    if (!selectedAnomaly) return;
    try {
      setBusy(true);
      const data = await postJson(
        `${API_BASE}/api/finance/admin/anomalies/${encodeURIComponent(selectedAnomaly.id)}/snooze`,
        buildAnomalyActionPayload(selectedAnomaly, {
          snoozedUntil: anomalyWorkflowForm.snoozedUntil,
          note: anomalyWorkflowForm.note
        })
      );
      setMessage(data.message || 'ناهجاری مالی معطل شد');
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const resolveAnomaly = async () => {
    if (!selectedAnomaly) return;
    try {
      setBusy(true);
      const data = await postJson(
        `${API_BASE}/api/finance/admin/anomalies/${encodeURIComponent(selectedAnomaly.id)}/resolve`,
        buildAnomalyActionPayload(selectedAnomaly, { note: anomalyWorkflowForm.note })
      );
      setMessage(data.message || 'ناهجاری مالی حل شد');
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const settleAdmissionAnomaly = async (mode = 'paid') => {
    if (!selectedAnomaly) return;
    try {
      setBusy(true);
      const data = await postJson(
        `${API_BASE}/api/finance/admin/anomalies/${encodeURIComponent(selectedAnomaly.id)}/settle-admission`,
        buildAnomalyActionPayload(selectedAnomaly, {
          mode,
          note: anomalyWorkflowForm.note
        })
      );
      setMessage(data.message || 'داخله ثبت شد و ناهنجاری مالی حل شد');
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const settleAdmissionAnomaliesByClass = async () => {
    const classId = String(admissionBatchForm.classId || '').trim();
    const candidateCount = admissionBatchPreview.items.length;
    if (!classId) {
      setMessage('برای ثبت گروهی داخله، ابتدا صنف را انتخاب کنید.');
      return;
    }
    if (!candidateCount) {
      setMessage('در صنف انتخاب‌شده شاگردی با بل داخله صادرنشده پیدا نشد.');
      return;
    }

    const actionLabel = admissionBatchForm.mode === 'paid'
      ? 'ثبت دریافت داخله در حالت انتظار تأیید'
      : admissionBatchForm.mode === 'waived'
        ? 'ثبت معافیت کامل داخله'
        : 'صدور بل باز داخله';
    const selectedClass = classOptions.find((item) => item.classId === classId);
    const confirmed = window.confirm(
      `${actionLabel} برای ${candidateCount} شاگرد صنف ${selectedClass?.uiLabel || selectedClass?.title || ''} انجام شود؟`
    );
    if (!confirmed) return;

    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/anomalies/settle-admission-batch`, {
        classId,
        mode: admissionBatchForm.mode,
        note: admissionBatchForm.note
      });
      const failed = Number(data?.summary?.failed || 0);
      const failureNames = (Array.isArray(data?.failures) ? data.failures : [])
        .slice(0, 3)
        .map((item) => item.studentName)
        .filter(Boolean)
        .join('، ');
      setMessage(`${data.message || 'ثبت گروهی داخله انجام شد'}${failed && failureNames ? ` موارد خطادار: ${failureNames}` : ''}`);
      setAdmissionBatchRefreshKey((value) => value + 1);
      await refreshPaymentWorkspace({ includeAnomalies: true });
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const repairDuplicateDiscountRegistry = async () => {
    const duplicateCount = Number(discountDuplicateSummary?.duplicateRecords || 0);
    const mirroredCount = Number(discountDuplicateSummary?.mirroredDiscountRecords || 0);
    const mirroredReliefCount = Number(discountDuplicateSummary?.mirroredActiveReliefs || 0);
    const detectedCount = duplicateCount + mirroredCount + mirroredReliefCount;
    const confirmed = window.confirm(
      detectedCount > 0
        ? `${duplicateCount} رکورد مستقیم تکراری و ${mirroredCount} تصویر تخفیف روی بل پیدا شده است. رکورد اصلی حفظ و محاسبه بل‌ها بازسازی شود؟`
        : 'تمام تخفیف‌های فعال بررسی شوند؟ رکوردهای یک شاگرد با صنف، سال، نوع و مبلغ یکسان تکراری شمرده می‌شوند؛ رکورد اصلی و سابقه مالی حفظ خواهد شد.'
    );
    if (!confirmed) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/discounts/deduplicate`, {
        apply: true,
        discountType: 'discount'
      });
      const successMessage = data.message || `${Number(data?.summary?.cancelled || 0)} رکورد تکراری اصلاح شد.`;
      await loadAll();
      setMessage(successMessage);
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    try {
      const res = await fetch(buildScopedReportUrl('/api/finance/admin/reports/export.csv'), {
        headers: { ...getAuthHeaders() }
      });
      if (!res.ok) throw new Error('دانلود گزارش ناموفق بود');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'finance-report.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const exportAuditPackageCsv = async () => {
    try {
      const url = new URL(buildScopedReportUrl('/api/finance/admin/reports/audit-package.csv'));
      if (auditTimelineKindFilter !== 'all') {
        url.searchParams.set('kind', auditTimelineKindFilter);
      }
      if (auditTimelineSeverityFilter !== 'all') {
        url.searchParams.set('severity', auditTimelineSeverityFilter);
      }
      if (auditTimelineSearch.trim()) {
        url.searchParams.set('q', auditTimelineSearch.trim());
      }

      const res = await fetch(url.toString(), {
        headers: { ...getAuthHeaders() }
      });
      if (!res.ok) throw new Error('دانلود پکیج حسابرسی ناموفق بود');
      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'finance-audit-package.csv';
      link.click();
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <section className="finance-page" data-active-section={activeSection} data-form-layout={formLayoutMode}>
      <div className="card-back">
        <button type="button" onClick={() => window.history.back()}>بازگشت</button>
      </div>
      <h2>مرکز مالی مکتب</h2>
      <p className="muted">سطح فعال مالی: {ADMIN_LEVEL_UI_LABELS[financeRole] || financeRole}</p>
      {message && (
        <div className="finance-msg" role="status" data-testid="finance-toast">
          <span>{message}</span>
          <button type="button" className="finance-msg-close" onClick={() => setMessageState('')} aria-label="بستن پیام">×</button>
        </div>
      )}

      <div className="finance-shell-tabs" role="tablist" aria-label="بخش‌های مرکز مالی">
        {financeSections.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            title={item.hint}
            data-testid={`finance-section-${item.key}`}
            aria-selected={activeSection === item.key}
            className={`finance-shell-tab ${activeSection === item.key ? 'active' : ''}`}
            onClick={() => setActiveSection(item.key)}
          >
            <strong>{item.label}</strong>
            <span>{item.hint}</span>
          </button>
        ))}
        <Link
          to="/academy"
          className="finance-shell-tab finance-shell-link"
          data-testid="finance-academy-link"
          title="سیستم جدا برای شاگرد، فیس، بل و مصارف"
        >
          <strong>آموزشگاه</strong>
          <span>سیستم جدا برای شاگرد، فیس، بل و مصارف</span>
        </Link>
        <Link
          to="/short-term-center"
          className="finance-shell-tab finance-shell-link"
          data-testid="finance-short-term-center-link"
          title="سیستم جدا برای شاگردان موقت: صنف، فیس، بل و رسید، حاضری و مصارف"
        >
          <strong>مرکز آموزش کوتاه‌مدت</strong>
          <span>سیستم جدا برای شاگردان موقت</span>
        </Link>
      </div>

      <div className="finance-section-head">
        <div>
          <h3>{FINANCE_SECTION_LABELS[activeSection]}</h3>
          <p className="muted">{FINANCE_SECTION_DESCRIPTIONS[activeSection]}</p>
        </div>
        <div className="finance-chip-group">
          <span className="finance-chip finance-chip-emerald">{fmt(summary?.monthCollection || 0)} AFN</span>
          <span className="finance-chip">{pendingReceipts.length} رسید</span>
          <span className="finance-chip finance-chip-muted">{openBillsCount} بدهی باز</span>
          <span className="finance-chip finance-chip-rose">{fmt(totalOutstandingBalance)} AFN</span>
        </div>
      </div>

      {activeSchoolContext?.school ? (
        <div className="finance-card finance-school-scope-card" title="تمام پلان‌های فیس، بل‌ها، پرداخت‌ها و گزارش‌ها باید مربوط همین مکتب باشند.">
          <span className="finance-eyebrow">مکتب فعال</span>
          <strong>{activeSchoolContext.school.nameDari || activeSchoolContext.school.name || 'مکتب'}</strong>
          <div className="finance-chip-group">
            <span className="finance-chip">کد: {activeSchoolContext.school.schoolCode || '-'}</span>
            <span className="finance-chip finance-chip-muted">شاگردان: {fmt(activeSchoolContext.scopeSummary?.students?.count || financeMembershipStudentCount || 0)}</span>
            <span className="finance-chip finance-chip-muted">سال تعلیمی: {fmt(activeSchoolContext.scopeSummary?.academicYears?.count || 0)}</span>
            <span className="finance-chip finance-chip-muted">صنف‌ها: {fmt(activeSchoolContext.scopeSummary?.classes?.count || 0)}</span>
            <span className="finance-chip finance-chip-emerald">بل‌ها: {fmt(activeSchoolContext.scopeSummary?.financeBills?.count || 0)}</span>
            <span className="finance-chip finance-chip-sky">پرداخت‌ها: {fmt(activeSchoolContext.scopeSummary?.feePayments?.count || 0)}</span>
          </div>
        </div>
      ) : null}

      <div className="finance-control-rail">
        {/* حذف دکمه‌های لندسکیپ و پورتریت */}
        {activeSection === 'orders' && (
          <div className="finance-subsection-tabs" role="group" aria-label="فورم‌های بل و تعهدات">
            <button type="button" className={orderFormMode === 'manual' ? 'secondary is-active' : 'secondary'} onClick={() => setOrderFormMode('manual')}>بل دستی</button>
            <button type="button" className={orderFormMode === 'bulk' ? 'secondary is-active' : 'secondary'} onClick={() => setOrderFormMode('bulk')}>صدور گروهی</button>
          </div>
        )}
      </div>

      <div className="finance-card finance-overview-filter" data-finance-section="overview reports">
        <div>
          <span className="finance-eyebrow">گزارش هوشمند مالی</span>
          <strong>یک بازه، یک منبع ارقام</strong>
          <p className="muted">بل، پرداخت، تخفیف، مصرف و خزانه در همین بازه با هم محاسبه می‌شوند.</p>
        </div>
        <label>
          <span>از تاریخ</span>
          <AfghanDateInput
            value={financeOverviewRange.from}
            onChange={(value) => setFinanceOverviewRange((previous) => ({ ...previous, from: value }))}
            showGregorianEquivalent
          />
        </label>
        <label>
          <span>تا تاریخ</span>
          <AfghanDateInput
            value={financeOverviewRange.to}
            onChange={(value) => setFinanceOverviewRange((previous) => ({ ...previous, to: value }))}
            showGregorianEquivalent
          />
        </label>
        <label>
          <span>سال تعلیمی</span>
          <select value={reportAcademicYearId} onChange={(event) => setReportAcademicYearId(event.target.value)}>
            <option value="">همه سال‌ها</option>
            {academicYears.map((item) => (
              <option key={`finance-report-year-${item.id}`} value={item.id}>{item.title}</option>
            ))}
          </select>
        </label>
        <label>
          <span>صنف</span>
          <select value={reportClassId} onChange={(event) => setReportClassId(event.target.value)}>
            <option value="">همه صنف‌ها</option>
            {classOptions.map((item) => (
              <option key={`finance-report-class-${item.classId}`} value={item.classId}>{item.title}</option>
            ))}
          </select>
        </label>
        <div className="finance-overview-filter-actions">
          <button type="button" className="secondary" onClick={() => void loadAll()} disabled={busy || financeOverviewLoading}>
            {financeOverviewLoading ? 'در حال تازه‌سازی…' : 'تازه‌سازی'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (!financeOverview) {
                setMessage('پیش از چاپ، گزارش را بارگذاری کنید.');
                return;
              }
              schedulePrint('overview');
            }}
            disabled={financeOverviewLoading || !financeOverview}
          >
            چاپ / پی‌دی‌اف
          </button>
        </div>
      </div>

      <div className="finance-smart-kpi-grid" data-finance-section="overview">
        {financeSmartCards.map((item) => (
          <button
            key={`finance-smart-${item.key}`}
            type="button"
            className={`finance-smart-kpi finance-smart-kpi-${item.tone}`}
            onClick={() => setActiveSection(item.section)}
          >
            <span>{item.label}</span>
            <strong>{fmt(item.value || 0)} <small>AFN</small></strong>
            <small>{item.meta}</small>
          </button>
        ))}
      </div>

      <div className="finance-summary" data-finance-section="overview">
        <div><span>رسیدهای در انتظار</span><strong>{financeOverviewKpis?.pendingReceipts?.count ?? summary?.pendingReceipts ?? 0}</strong></div>
        <div><span>بل‌های سررسید گذشته</span><strong>{financeOverviewKpis?.overdue?.count ?? summary?.overdueBills ?? 0}</strong></div>
        <div><span>نرخ وصول کل</span><strong>{fmt(financeOverviewKpis?.rates?.collection || summary?.collectionRate || 0)}%</strong></div>
        <div><span>نرخ باقیات</span><strong>{fmt(financeOverviewKpis?.rates?.outstanding || 0)}%</strong></div>
        <div><span>نرخ تخفیف</span><strong>{fmt(financeOverviewKpis?.rates?.relief || 0)}%</strong></div>
        <div><span>نسبت مصرف به عاید</span><strong>{fmt(financeOverviewKpis?.rates?.expenseToIncome || 0)}%</strong></div>
        <div><span>خالص خزانه</span><strong>{fmt(financeOverviewKpis?.treasury?.net || 0)} AFN</strong></div>
        <div><span>مرحله مدیر مالی</span><strong>{summary?.receiptWorkflow?.financeManager || 0}</strong></div>
        <div><span>مرحله ریاست عمومی</span><strong>{(summary?.receiptWorkflow?.generalPresident || 0) + (summary?.receiptWorkflow?.financeLead || 0)}</strong></div>
      </div>

      <div className="finance-grid finance-dashboard-grid" data-finance-section="overview reports">
        <FinanceDonutCard
          title="وضعیت تعهدات مالی"
          subtitle="پرداخت، باقیات، تخفیف و جریمه تا پایان بازه انتخاب‌شده"
          rows={financeOverview?.distributions?.obligations || []}
        />
        <FinanceDonutCard
          title="عواید در برابر مصارف"
          subtitle="فقط پرداخت‌ها و مصارف تاییدشده در بازه انتخاب‌شده"
          rows={financeOverview?.distributions?.incomeExpense || []}
        />
        <FinanceDonutCard
          title="روش‌های پرداخت"
          subtitle="سهم هر روش از پرداخت‌های تاییدشده"
          rows={financeOverview?.distributions?.paymentMethods || []}
        />
        <FinanceDonutCard
          title="عمر باقیات"
          subtitle="باقیات جاری، ۳۰ روز، ۶۰ روز و بیشتر"
          rows={financeOverview?.distributions?.aging || []}
        />
      </div>

      <div className="finance-grid finance-recent-finance-grid" data-finance-section="overview reports">
        <div className="finance-card">
          <div className="finance-card-head">
            <div><h3>آخرین بل‌ها</h3><p className="muted">۱۰ بل اخیر در بازه انتخاب‌شده</p></div>
            <button type="button" className="secondary" onClick={() => setActiveSection('orders')}>همه بل‌ها</button>
          </div>
          <div className="finance-subcard-list">
            {(financeOverview?.recent?.bills || []).map((item) => (
              <div key={`overview-recent-bill-${item.id}`} className="mini-row">
                <span className="finance-cell-stack"><strong>{item.studentName} <FinanceStudentStatusBadge label={item.lifecycleStatusLabel} tone={item.lifecycleStatusTone} /></strong><small>{item.title} · {item.classTitle}</small></span>
                <span className="finance-cell-stack"><strong>{fmt(item.amount)} AFN</strong><small>باقیات: {fmt(item.outstanding)} · {toFaDate(item.occurredAt)}</small></span>
              </div>
            ))}
            {!financeOverview?.recent?.bills?.length && <p className="muted">در این بازه بل تازه‌ای صادر نشده است.</p>}
          </div>
        </div>
        <div className="finance-card">
          <div className="finance-card-head">
            <div><h3>آخرین پرداخت‌ها</h3><p className="muted">فقط پرداخت‌های تاییدشده</p></div>
            <button type="button" className="secondary" onClick={() => setActiveSection('payments')}>همه پرداخت‌ها</button>
          </div>
          <div className="finance-subcard-list">
            {(financeOverview?.recent?.payments || []).map((item) => (
              <div key={`overview-recent-payment-${item.id}`} className="mini-row">
                <span className="finance-cell-stack"><strong>{item.studentName} <FinanceStudentStatusBadge label={item.lifecycleStatusLabel} tone={item.lifecycleStatusTone} /></strong><small>{item.classTitle} · {PAYMENT_METHOD_UI_LABELS[item.paymentMethod] || item.paymentMethod}</small></span>
                <span className="finance-cell-stack"><strong>{fmt(item.amount)} AFN</strong><small>{toFaDate(item.occurredAt)}</small></span>
              </div>
            ))}
            {!financeOverview?.recent?.payments?.length && <p className="muted">در این بازه پرداخت تاییدشده ثبت نشده است.</p>}
          </div>
        </div>
        <div className="finance-card">
          <div className="finance-card-head">
            <div><h3>آخرین مصارف</h3><p className="muted">مصارف تاییدشده متصل به گزارش</p></div>
            <Link className="secondary" to="/admin-government-finance">مرکز مصارف</Link>
          </div>
          <div className="finance-subcard-list">
            {(financeOverview?.recent?.expenses || []).map((item) => (
              <div key={`overview-recent-expense-${item.id}`} className="mini-row">
                <span className="finance-cell-stack"><strong>{item.title}</strong><small>{item.vendorName || item.referenceNo || 'بدون مرجع'}</small></span>
                <span className="finance-cell-stack"><strong>{fmt(item.amount)} AFN</strong><small>{toFaDate(item.occurredAt)}</small></span>
              </div>
            ))}
            {!financeOverview?.recent?.expenses?.length && <p className="muted">در این بازه مصرف تاییدشده ثبت نشده است.</p>}
          </div>
        </div>
      </div>

      <div className="finance-grid finance-dashboard-grid" data-finance-section="overview">
        <div className="finance-card finance-smart-problem-card">
          <div className="finance-card-head">
            <div>
              <h3>شاگردان نیازمند پیگیری</h3>
              <p className="muted">اولویت‌بندی خودکار بر اساس مدت تاخیر، تعداد بل سررسید گذشته و مبلغ باقیات.</p>
            </div>
            <span className="finance-chip finance-chip-rose">{fmt(problemStudentSummary.critical)} مورد بحرانی</span>
          </div>
          <div className="finance-kpi-grid finance-kpi-grid-dense">
            <div className="finance-kpi-item"><span>شاگرد نیازمند پیگیری</span><strong>{fmt(problemStudentSummary.count)}</strong></div>
            <div className="finance-kpi-item"><span>مجموع باقیات</span><strong>{fmt(problemStudentSummary.amount)} AFN</strong></div>
            <div className="finance-kpi-item"><span>بل سررسید گذشته</span><strong>{fmt(problemStudentSummary.overdueOrders)}</strong></div>
            <div className="finance-kpi-item finance-kpi-item-accent"><span>بحرانی ۶۰+ روز</span><strong>{fmt(problemStudentSummary.critical)}</strong></div>
          </div>
          <div className="finance-problem-list">
            {problemStudents.map((row) => (
              <div key={row.studentId || row.name} className="finance-problem-row">
                <span className="finance-cell-stack">
                  <strong>{row.name}</strong>
                  <small>{row.classTitle} · {fmt(row.overdueOrderCount)} بل · {fmt(row.maxLateDays)} روز تاخیر</small>
                </span>
                <span className="finance-cell-stack">
                  <strong>{fmt(row.amount)} AFN</strong>
                  <span className={`finance-risk-badge ${row.risk}`}>{row.risk === 'critical' ? 'بحرانی' : row.risk === 'high' ? 'زیاد' : 'پیگیری'}</span>
                </span>
                <button type="button" className="secondary" onClick={() => openDebtorInPaymentDesk(row)}>میز پرداخت</button>
              </div>
            ))}
            {!problemStudents.length && <p className="muted">در بازه انتخاب‌شده شاگرد دارای باقیات سررسید گذشته وجود ندارد.</p>}
          </div>
          <div className="finance-kpi-card-footer">
            <button type="button" className="secondary" onClick={() => setActiveSection('reports')}>مشاهده گزارش بدهکاران</button>
          </div>
        </div>
      </div>

      <div className="finance-grid finance-dashboard-grid" data-finance-section="overview">
        <div className="finance-card finance-chart-card finance-chart-card-wide" data-testid="income-trend-card">
          <div className="finance-card-head">
            <div>
              <h3>نمودار هوشمند عواید، مصارف و خالص</h3>
              <p className="muted">مقایسه پرداخت‌ها و مصارف تاییدشده؛ خط خالص تفاوت واقعی عواید و مصارف را نشان می‌دهد.</p>
            </div>
            <div className="finance-layout-toggle" role="group" aria-label="بازه زمانی نمودار عواید و مصارف">
              <button type="button" className={incomeTrendRange === 'daily' ? 'secondary is-active' : 'secondary'} onClick={() => setIncomeTrendRange('daily')}>روزانه</button>
              <button type="button" className={incomeTrendRange === 'weekly' ? 'secondary is-active' : 'secondary'} onClick={() => setIncomeTrendRange('weekly')}>هفته‌ای</button>
              <button type="button" className={incomeTrendRange === 'monthly' ? 'secondary is-active' : 'secondary'} onClick={() => setIncomeTrendRange('monthly')}>ماهانه</button>
            </div>
          </div>
          <div className="finance-flow-chart-summary">
            <span><i className="income" />عواید: <strong>{fmt(financeOverviewKpis?.approvedRevenue?.amount || 0)} AFN</strong></span>
            <span><i className="expense" />مصارف: <strong>{fmt(financeOverviewKpis?.expenses?.amount || 0)} AFN</strong></span>
            <span><i className="net" />خالص: <strong>{fmt(financeOverviewKpis?.netCash?.amount || 0)} AFN</strong></span>
          </div>
          {financeFlowTrendSeries.length ? (
            <div className="finance-line-chart">
              <svg viewBox="0 0 520 220" className="finance-line-chart-svg" role="img" aria-label="نمودار عواید، مصارف و خالص">
                {[0, 1, 2, 3].map((step) => {
                  const y = 20 + ((180 / 3) * step);
                  return <line key={`income-grid-${step}`} x1="20" y1={y} x2="500" y2={y} className="finance-line-grid" />;
                })}
                <line x1="20" y1={financeFlowTrendChart.zeroY} x2="500" y2={financeFlowTrendChart.zeroY} className="finance-zero-line" />
                <path d={financeFlowTrendChart.paths.income} className="finance-flow-line income" />
                <path d={financeFlowTrendChart.paths.expense} className="finance-flow-line expense" />
                <path d={financeFlowTrendChart.paths.net} className="finance-flow-line net" />
              </svg>
              <div className="finance-line-chart-legend">
                {financeFlowTrendSeries.slice(-6).map((item) => (
                  <div key={`income-legend-${item.bucket}`} className="finance-line-legend-item">
                    <span>{item.label}</span>
                    <small>عاید {fmt(item.income)} · مصرف {fmt(item.expense)}</small>
                    <strong className={Number(item.net || 0) < 0 ? 'finance-negative' : ''}>خالص {fmt(item.net)} AFN</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted finance-chart-empty">برای بازه انتخاب‌شده عاید یا مصرف تاییدشده‌ای ثبت نشده است.</p>
          )}
        </div>
      </div>

      <div className="finance-grid finance-dashboard-grid" data-finance-section="overview">
        <div className="finance-card" data-testid="finance-monthly-trend-card">
          <div className="finance-card-head">
            <div>
              <h3>روند ماهانه مرکز مالی</h3>
              <p className="muted">عاید، بازپرداخت، مصرف، بل صادرشده و باقیات هر ماه در ۱۲ ماه اخیر - مستقل از فیلتر بازه‌ی بالا.</p>
            </div>
          </div>
          {monthlyTrend.length ? (
            <div className="finance-table monthly-trend-table">
              <div className="head">
                <span>ماه</span>
                <span>عاید</span>
                <span>بازپرداخت</span>
                <span>مصرف</span>
                <span>خالص</span>
                <span>بل صادرشده</span>
                <span>باقیات</span>
              </div>
              {monthlyTrend.map((item) => (
                <div key={`monthly-trend-${item.monthKey}`} className="row">
                  <span>{toFaMonthKey(item.monthKey)}</span>
                  <span>{fmt(item.income)}</span>
                  <span>{fmt(item.refunds)}</span>
                  <span>{fmt(item.expense)}</span>
                  <span className={Number(item.netCash || 0) < 0 ? 'finance-negative' : ''}>{fmt(item.netCash)}</span>
                  <span>{fmt(item.billsIssuedAmount)} ({fmt(item.billsIssuedCount)})</span>
                  <span>{fmt(item.arrearsAmount)} ({fmt(item.arrearsCount)})</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted finance-chart-empty">هنوز داده‌ای برای روند ماهانه ثبت نشده است.</p>
          )}
        </div>
      </div>

      <div className="finance-grid finance-payment-workspace" data-finance-section="payments orders settings">
        <div className="finance-card finance-arrears-card" data-finance-section="payments" data-testid="student-monthly-arrears">
          <div className="finance-card-head">
            <div>
              <h3>صندوق باقیات ماهانه شاگرد</h3>
              <p className="muted">ماه‌های باقی‌دار شاگرد انتخاب‌شده در میز پرداخت را همراه با مبلغ، پرداخت‌شده و مهلت پرداخت ببینید.</p>
            </div>
            {(paymentDeskMembershipStudent || paymentDeskStudent) ? (
              <div className="finance-chip-group">
                <span className="finance-chip finance-chip-emerald">{paymentDeskMonthlyArrears.length} ماه</span>
                <span className="finance-chip finance-chip-rose">{fmt(paymentDeskStudentTotalOutstanding)} AFN</span>
              </div>
            ) : null}
          </div>
          {financeDataErrors.orders ? (
            <div className="finance-data-error" role="alert">
              اطلاعات بل‌ها و باقیات دریافت نشد: {financeDataErrors.orders}
            </div>
          ) : null}
          <div className="finance-summary finance-summary-compact">
            <div><span>شاگرد</span><strong>{paymentDeskMembershipStudent?.fullName || paymentDeskMembershipStudent?.name || paymentDeskStudent?.fullName || paymentDeskStudent?.name || '-'}</strong></div>
            <div><span>صنف انتخاب‌شده</span><strong>{paymentDeskClass?.title || '-'}</strong></div>
            <div><span>سال انتخاب‌شده</span><strong>{paymentDeskAcademicYear?.title || '-'}</strong></div>
            <div><span>کل باقیات</span><strong>{fmt(paymentDeskStudentTotalOutstanding)} AFN</strong></div>
          </div>
          <div className="finance-subcard-list">
            {!financeDataErrors.orders && paymentDeskMonthlyArrears.map((item) => (
              <div key={`student-arrears-${item.id}`} className="mini-row finance-arrears-month-row">
                <div className="finance-arrears-month-head">
                  <span>
                    <strong>{item.label}</strong>
                    <small>
                      {item.dueDate ? `مهلت: ${toFaDate(item.dueDate)}` : 'مهلت ثبت نشده'}
                      {item.classTitle ? ` | ${item.classTitle}` : ''}
                      {item.academicYearTitle ? ` | ${item.academicYearTitle}` : ''}
                      {item.count > 1 ? ` | ${item.count} بل` : ''}
                    </small>
                  </span>
                  <span className="finance-cell-stack">
                    <strong>{fmt(item.outstandingAmount)} AFN</strong>
                    <small>{getArrearsTimingLabel(item.dueDate)}</small>
                  </span>
                </div>
                <div className="finance-arrears-breakdown">
                  <span><b>مبلغ اصلی</b>{fmt(item.amountOriginal)} AFN</span>
                  <span><b>تخفیف/معافیت</b>{fmt(item.discountAmount)} AFN</span>
                  <span><b>فیس بعد از تخفیف</b>{fmt(item.amountDue)} AFN</span>
                  <span><b>پرداخت‌شده</b>{fmt(item.amountPaid)} AFN</span>
                  <span><b>باقی‌مانده</b>{fmt(item.outstandingAmount)} AFN</span>
                </div>
                {item.bills?.length ? (
                  <div className="finance-arrears-bill-list">
                    {item.bills.map((bill) => (
                      <div key={`arrears-bill-${getFeeOrderRowId(bill)}`} className="finance-arrears-bill-row">
                        <span className="finance-cell-stack">
                          <strong>{bill.title || getBillTypeLabel(bill) || 'بل مالی'}</strong>
                          <small className="finance-latin-code">{formatFinanceCode(bill.billNumber, 'بدون شماره')}</small>
                          {!!getPreviousClassDebtLabel(bill) && <small>{getPreviousClassDebtLabel(bill)}</small>}
                        </span>
                        <small>
                          {bill.dueDate ? toFaDate(bill.dueDate) : 'بدون مهلت'}
                          {' | '}
                          پرداخت فیس: {fmt(getBillFeeScopeSummary(bill, 'tuition').paid)} AFN
                        </small>
                        <strong>{fmt(getBillFeeScopeSummary(bill, 'tuition').outstanding)} AFN</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {!financeDataErrors.orders && (paymentDeskMembershipStudent || paymentDeskStudent) && !paymentDeskMonthlyArrears.length ? (
              <p className="muted">برای این شاگرد باقیات ماهانه ثبت نشده است.</p>
            ) : null}
            {!financeDataErrors.orders && !(paymentDeskMembershipStudent || paymentDeskStudent) ? (
              <p className="muted">برای دیدن باقیات ماهانه، ابتدا شاگرد را در میز پرداخت انتخاب کنید.</p>
            ) : null}
          </div>
        </div>

        <section className="finance-card finance-order-overview-card" data-finance-section="orders" data-testid="orders-command-summary">
          <div className="finance-card-head">
            <div>
              <h3>بل‌ها و تعهدات مالی</h3>
              <p className="muted">نمای سریع بدهی‌ها، بل‌های سررسید گذشته و تعهدات فعال پیش از صدور یا پیگیری بل.</p>
            </div>
            <div className="finance-chip-group">
              <span className="finance-chip">{orderWorkspaceStats.officialCount} بل رسمی</span>
              <span className="finance-chip finance-chip-emerald">{orderWorkspaceStats.openCount} بدهی باز</span>
              <span className="finance-chip finance-chip-rose">{orderWorkspaceStats.overdueCount} سررسید گذشته</span>
              {!!orderWorkspaceStats.voidCount && (
                <span className="finance-chip finance-chip-muted">{orderWorkspaceStats.voidCount} بل باطل (جدا از رسمی)</span>
              )}
            </div>
          </div>
          <div className="finance-kpi-grid finance-kpi-grid-dense finance-order-kpis">
            <div className="finance-kpi-item finance-kpi-item-accent">
              <span>کل بدهی باز</span>
              <strong>{fmt(orderWorkspaceStats.totalOutstanding)} AFN</strong>
            </div>
            <div className="finance-kpi-item">
              <span>بل‌های رسمی این ماه</span>
              <strong>{orderWorkspaceStats.monthCount}</strong>
            </div>
            <div className="finance-kpi-item">
              <span>پرداخت ناقص</span>
              <strong>{orderWorkspaceStats.partialCount}</strong>
            </div>
            <div className="finance-kpi-item">
              <span>تعهدات فعال</span>
              <strong>{orderWorkspaceStats.activeCommitments}</strong>
            </div>
          </div>
        </section>

        {orderFormMode === 'manual' && (
          <form className="finance-card finance-order-action-card" data-finance-section="orders" onSubmit={createManualBill} data-testid="manual-bill-form">
            <div className="finance-card-head">
              <div>
                <h3>صدور بل دستی</h3>
                <p className="muted">برای یک متعلم مشخص بل جداگانه بسازید و مهلت پرداخت، ترم و عنوان دوره را خودتان تعیین کنید.</p>
              </div>
              <span className="finance-chip finance-chip-muted">{manualStudentOptions.length} متعلم</span>
            </div>
            <label className="finance-inline-filter finance-inline-filter-wide">
              <span>جستجوی متعلم</span>
              <input
                value={manualStudentSearch}
                onChange={(e) => setManualStudentSearch(e.target.value)}
               placeholder="نام، ایمیل یا نمبر اساس شاگرد"
              />
            </label>
            <select value={manualForm.studentId} onChange={(e) => applyManualMembershipStudent(e.target.value)} required>
              <option value="">شاگرد را انتخاب کنید</option>
              {manualStudentOptions.length ? manualStudentOptions.map((student) => (
                <option key={student.membershipId || student._id} value={student._id}>{getFinanceStudentOptionLabel(student)}</option>
              )) : (
                <option value="">متعلمی پیدا نشد</option>
              )}
            </select>
            <div className="finance-split-grid">
              <select value={manualForm.classId} onChange={(e) => {
                const classId = e.target.value;
                const membership = financeMembershipStudents.find((item) => (
                  String(item?._id || '') === String(manualForm.studentId || '')
                  && String(item?.classId || '') === String(classId || '')
                )) || null;
                setManualForm((p) => ({
                  ...p,
                  classId,
                  academicYearId: membership?.academicYearId || p.academicYearId,
                  academicYear: membership?.academicYearTitle || p.academicYear
                }));
              }} required>
                <option value="">صنف را انتخاب کنید</option>
                {classOptions.map((item) => <option key={item.classId} value={item.classId}>{getClassOptionLabel(item)}</option>)}
              </select>
              <select
                value={manualForm.feeType}
                onChange={(e) => {
                  const feeType = e.target.value;
                  setManualForm((p) => ({
                    ...p,
                    feeType,
                    periodLabel: !p.periodLabel || MANUAL_BILL_FEE_TYPES.some((item) => FEE_LINE_TYPE_LABELS[item] === p.periodLabel)
                      ? (FEE_LINE_TYPE_LABELS[feeType] || '')
                      : p.periodLabel
                  }));
                }}
                aria-label="نوع فیس بل دستی"
                required
              >
                {MANUAL_BILL_FEE_TYPES.map((feeType) => (
                  <option key={feeType} value={feeType}>{FEE_LINE_TYPE_LABELS[feeType] || feeType}</option>
                ))}
              </select>
            </div>
            <div className="finance-split-grid">
              <select
                value={manualForm.amountSource}
                onChange={(e) => setManualForm((p) => ({ ...p, amountSource: e.target.value }))}
                aria-label="منبع مبلغ بل دستی"
              >
                <option value="plan">مبلغ از پلان مالی</option>
                <option value="manual">مبلغ دستی</option>
              </select>
              {manualForm.amountSource === 'manual' ? (
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={manualForm.amount}
                  onChange={(e) => setManualForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="مبلغ دستی AFN"
                  aria-label="مبلغ دستی بل"
                  required
                />
              ) : (
                <div className="finance-cell-stack">
                  <input
                    value={selectedManualFeePlan ? `${fmt(selectedManualPlanAmount)} ${selectedManualFeePlan.currency || 'AFN'}` : ''}
                    placeholder="از پلان فعال صنف خوانده می‌شود"
                    aria-label="مبلغ از پلان مالی"
                    readOnly
                  />
                  <small>
                    {selectedManualFeePlan
                      ? `${selectedManualFeePlan.title || 'پلان فعال'} — ${FEE_LINE_TYPE_LABELS[manualForm.feeType] || 'فیس'}`
                      : 'سیستم هنگام صدور، پلان فعال همین صنف و سال را بررسی می‌کند.'}
                  </small>
                </div>
              )}
            </div>
            <div className="finance-split-grid">
              <div className="finance-cell-stack">
                <span className="finance-field-label">مهلت پرداخت</span>
                <AfghanDateInput value={manualForm.dueDate} onChange={(value) => setManualForm((p) => ({ ...p, dueDate: value }))} showGregorianEquivalent required />
                <small>{manualForm.dueDate ? `مهلت پرداخت: ${toFaDate(manualForm.dueDate)}` : 'مهلت پرداخت انتخاب نشده است.'}</small>
              </div>
              <input value={manualForm.periodLabel} onChange={(e) => setManualForm((p) => ({ ...p, periodLabel: e.target.value }))} placeholder="عنوان بل / دوره" />
            </div>
            <button type="button" className="secondary finance-advanced-toggle" onClick={() => setBillingAdvancedOpen((value) => !value)}>
              {billingAdvancedOpen ? 'بستن تنظیمات پیشرفته' : 'تنظیمات پیشرفته'}
            </button>
            {billingAdvancedOpen && (
              <div className="finance-split-grid">
                <input value={manualForm.academicYear} onChange={(e) => setManualForm((p) => ({ ...p, academicYear: e.target.value }))} placeholder="سال آموزشی متنی" />
                <input value={manualForm.term} onChange={(e) => setManualForm((p) => ({ ...p, term: e.target.value }))} placeholder="ترم" />
              </div>
            )}
            <button type="submit" disabled={busy}>ایجاد بل</button>
          </form>
        )}

        <form className="finance-card finance-payment-desk-card" data-finance-section="payments" onSubmit={createDeskPayment} data-testid="finance-payment-desk">
          <div className="finance-card-head">
            <div>
              <h3>ثبت پرداخت دفتر مالی</h3>
              <p className="muted">متعلم، صنف و سال تعلیمی را انتخاب کنید؛ بعد سیستم بدهی‌های باز را پیدا و تخصیص پرداخت را پیش‌نمایش می‌کند.</p>
            </div>
            <span className="finance-chip finance-chip-emerald">{paymentPreview?.membership?.student?.fullName || paymentDeskMembershipStudent?.name || paymentDeskStudent?.name || 'عضویت مالی'}</span>
          </div>
          <div className="finance-payment-form-grid">
          <div className="finance-payment-section-title">
            <span>انتخاب متعلم</span>
            <small>جستجو، صنف و سال تعلیمی</small>
          </div>
          <div className="finance-payment-row finance-payment-row-primary">
          <label className="finance-inline-filter finance-inline-filter-wide finance-payment-search-field">
            <span>جستجوی متعلم</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                value={paymentStudentSearch}
                onChange={(e) => handlePaymentStudentSearchChange(e.target.value)}
                onKeyDown={handlePaymentStudentSearchKeyDown}
                placeholder="نام، ایمیل یا نمبر اساس شاگرد"
                autoFocus
                style={{ flex: 1 }}
              />
              {paymentStudentSearch && (
                <button
                  type="button"
                  aria-label="پاک کردن جستجو"
                  onClick={() => setPaymentStudentSearch('')}
                  style={{ marginRight: 2, cursor: 'pointer' }}
                >✕</button>
              )}
            </div>
          </label>
          {highlightedPaymentStudentOptions.length > 0 && (
            <div className="finance-student-search-results finance-payment-search-results" data-testid="payment-student-search-results">
              {highlightedPaymentStudentOptions.map((student) => {
                const selected = String(student?._id || '') === String(paymentDeskForm.studentId || '');
                return (
                  <button
                    key={`payment-student-card-${student.membershipId || student._id}`}
                    type="button"
                    className={`finance-student-result ${selected ? 'is-selected' : ''}`}
                    onClick={() => handlePaymentDeskStudentChange(student._id)}
                    data-testid={`payment-student-result-${student._id}`}
                  >
                    <span>
                      <strong>{student.name || student.fullName || 'متعلم'}</strong>
                      <small className="finance-student-identity-grid">
                        {getFinanceStudentIdentityRows(student).map(([label, value]) => (
                          <span key={`payment-student-${student.membershipId || student._id}-${label}`}>
                            <b>{label}:</b> {value}
                          </span>
                        ))}
                      </small>
                    </span>
                    <span className="finance-chip finance-chip-muted">{selected ? 'انتخاب شده' : 'انتخاب'}</span>
                  </button>
                );
              })}
            </div>
          )}
          {hasPaymentStudentSearchTerm && !highlightedPaymentStudentOptions.length && (
            <p className="muted finance-order-empty finance-payment-search-results">برای این جستجو متعلم فعال در دفتر ممبرشیپ پیدا نشد.</p>
          )}
          <label className="finance-inline-filter">
            <span>متعلم</span>
            <select data-testid="desk-student-select" value={paymentDeskForm.studentId} onChange={(e) => handlePaymentDeskStudentChange(e.target.value)}>
              <option value="">ابتدا شاگرد را انتخاب کنید</option>
              {paymentStudentOptions.length ? paymentStudentOptions.map((student) => (
                <option key={`payment-student-${student.membershipId || student._id}`} value={student._id}>{getFinanceStudentOptionLabel(student)}</option>
              )) : (
                <option value="" disabled>متعلمی پیدا نشد</option>
              )}
            </select>
          </label>
          <label className="finance-inline-filter">
            <span>صنف</span>
            <select data-testid="desk-class-select" value={paymentDeskForm.classId} onChange={(e) => {
              setPaymentDeskForm((p) => ({
                ...p,
                classId: e.target.value,
                selectedFeeOrderIds: [],
                manualAllocations: {}
              }));
              setPaymentPreview(null);
            }}>
              <option value="">صنف را انتخاب کنید</option>
              {classOptions.map((item) => <option key={`payment-class-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>)}
            </select>
          </label>
          <label className="finance-inline-filter">
            <span>سال تعلیمی</span>
            <select data-testid="desk-academic-year-select" value={paymentDeskForm.academicYearId} onChange={(e) => {
              setPaymentDeskForm((p) => ({
                ...p,
                academicYearId: e.target.value,
                selectedFeeOrderIds: [],
                manualAllocations: {}
              }));
              setPaymentPreview(null);
            }}>
              {academicYears.map((item) => <option key={`payment-year-${item.id}`} value={item.id}>{getAcademicYearOptionLabel(item)}</option>)}
            </select>
          </label>
          </div>
          {!!paymentDeskMembershipStudent && (
            <div className="finance-payment-identity-strip">
              <strong>{paymentDeskMembershipStudent.name || paymentDeskMembershipStudent.fullName || 'متعلم'}</strong>
              {getFinanceStudentIdentityRows(paymentDeskMembershipStudent).map(([label, value]) => (
                <span key={`payment-identity-${label}`}>
                  <b>{label}:</b> {value}
                </span>
              ))}
            </div>
          )}
          <div className="finance-advance-payment-panel" data-testid="advance-month-payment-panel">
            <div>
              <strong>پرداخت چندماهه یا یک‌جای سال</strong>
              <small>ابتدا بل ماه‌های موردنظر را پیش‌نمایش کنید؛ بل‌های تکراری دوباره ساخته نمی‌شوند.</small>
            </div>
            <div className="finance-advance-payment-actions">
              {[1, 3, 6, 9, 12].map((count) => (
                <button
                  key={`advance-month-${count}`}
                  type="button"
                  className="secondary"
                  disabled={busy || !paymentDeskMembershipStudent}
                  onClick={() => previewAdvanceStudentBilling(count)}
                >
                  {count === 12 ? 'تا پایان سال' : `${fmt(count)} ماه`}
                </button>
              ))}
            </div>
            {advanceBillingPreview ? (
              <div className="finance-advance-preview">
                <span>
                  قابل صدور: <strong>{fmt(advanceBillingPreview?.summary?.candidateCount || 0)} بل</strong>
                  {' · '}
                  مبلغ: <strong>{fmt(advanceBillingPreview?.summary?.totalAmountDue || 0)} AFN</strong>
                  {' · '}
                  تکراری: <strong>{fmt(advanceBillingPreview?.summary?.duplicateCount || 0)}</strong>
                </span>
                <div>
                  <button type="button" className="secondary" onClick={() => { setAdvanceBillingPreview(null); setAdvanceBillingPayload(null); }}>لغو پیش‌نمایش</button>
                  <button type="button" onClick={generateAdvanceStudentBilling} disabled={busy || !advanceBillingPreview?.summary?.candidateCount}>تایید صدور بل‌ها</button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="finance-payment-section-title">
            <span>مشخصات پرداخت</span>
            <small>مبلغ، نوع پرداخت و تاریخ</small>
          </div>
          <div className="finance-payment-row finance-payment-row-money">
            <label className="finance-inline-filter">
              <span>نوع فیس</span>
              <select
                data-testid="desk-fee-type-select"
                value={paymentDeskForm.feeType}
                onChange={(e) => {
                  setPaymentDeskForm((prev) => ({
                    ...prev,
                    feeType: e.target.value,
                    selectedFeeOrderIds: [],
                    manualAllocations: {}
                  }));
                  setPaymentPreview(null);
                }}
              >
                {MANUAL_BILL_FEE_TYPES.map((feeType) => (
                  <option key={`desk-fee-type-${feeType}`} value={feeType}>{FEE_LINE_TYPE_LABELS[feeType] || feeType}</option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>مبلغ پرداخت</span>
              <input value={paymentDeskForm.amount} onChange={(e) => { setPaymentDeskForm((p) => ({ ...p, amount: e.target.value })); setPaymentPreview(null); }} placeholder="مبلغ پرداخت" />
            </label>
            <label className="finance-inline-filter">
              <span>روش پرداخت</span>
              <select data-testid="desk-payment-method-select" value={paymentDeskForm.paymentMethod} onChange={(e) => {
                const nextMethod = e.target.value;
                setPaymentDeskForm((p) => ({
                  ...p,
                  paymentMethod: nextMethod,
                  referenceNo: nextMethod === 'cash' ? '' : p.referenceNo
                }));
                setPaymentPreview(null);
              }}>
                <option value="cash">نقدی</option>
                <option value="bank_transfer">بانکی</option>
                <option value="hawala">حواله</option>
                <option value="manual">دستی</option>
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>تاریخ پرداخت</span>
              <div className="finance-payment-date-field">
              <AfghanDateInput value={paymentDeskForm.paidAt} onChange={(value) => setPaymentDeskForm((p) => ({ ...p, paidAt: value }))} />
              </div>
            </label>
          {paymentDeskRequiresReference && (
            <label className="finance-inline-filter">
              <span>شماره رسید / مرجع</span>
              <input
                value={paymentDeskForm.referenceNo}
                onChange={(e) => {
                  setPaymentDeskForm((p) => ({ ...p, referenceNo: e.target.value }));
                  setPaymentPreview(null);
                }}
                placeholder="شماره رسید / مرجع"
                required
              />
            </label>
          )}
          </div>
          <div className="finance-payment-section-title">
            <span>خلاصه مالی سریع</span>
            <small>مانده و بدهی‌های باز</small>
          </div>
          <div className="finance-chip-group finance-payment-summary-chips">
            <span className="finance-chip">{paymentDeskClass?.title || 'صنف'}</span>
            <span className="finance-chip finance-chip-muted">{paymentDeskAcademicYear?.title || 'سال تعلیمی'}</span>
            <span className="finance-chip finance-chip-emerald">{fmt(paymentDeskTotalOutstanding)} AFN مانده دامنه انتخاب‌شده</span>
            <span className="finance-chip">{paymentDeskOpenOrders.length} بدهی باز</span>
            {paymentDeskFinanceSnapshot.nextDueOrder?.dueDate && (
              <span className="finance-chip finance-chip-muted">مهلت بعدی: {toFaDate(paymentDeskFinanceSnapshot.nextDueOrder.dueDate)}</span>
            )}
            {paymentDeskForm.allocationMode === 'auto_selected' && <span className="finance-chip finance-chip-muted">{paymentDeskSelectedOrderIds.length} مورد انتخاب شده</span>}
            {paymentDeskForm.allocationMode === 'manual' && <span className="finance-chip finance-chip-muted">{fmt(paymentDeskManualAllocated)} AFN تخصیص دستی</span>}
            {paymentDeskForm.allocationMode === 'manual' && Number(paymentDeskForm.amount || 0) > 0 && (
              <span className={`finance-chip ${paymentDeskRemainingAmount < 0 ? 'finance-chip-rose' : 'finance-chip-muted'}`}>{fmt(paymentDeskRemainingAmount)} AFN اختلاف با مبلغ پرداخت</span>
            )}
          </div>
          <div className="finance-payment-section-title">
            <span>تخصیص پرداخت</span>
            <small>روش تخصیص و یادداشت مالی</small>
          </div>
          <div className="finance-payment-row finance-payment-row-allocation">
          <button type="button" className="secondary finance-advanced-toggle" onClick={() => setPaymentAdvancedOpen((value) => !value)}>
            {paymentAdvancedOpen ? 'بستن تنظیمات تخصیص' : 'تخصیص پیشرفته'}
          </button>
            <label className="finance-inline-filter">
              <span>روش تخصیص</span>
              <select data-testid="desk-allocation-mode-select" value={paymentDeskForm.allocationMode} onChange={(e) => {
                setPaymentDeskForm((p) => ({
                  ...p,
                  allocationMode: e.target.value,
                  selectedFeeOrderIds: [],
                  manualAllocations: {}
                }));
                setPaymentPreview(null);
              }}>
                <option value="auto_oldest_due">تخصیص خودکار به قدیمی‌ترین بدهی‌ها</option>
                <option value="auto_selected">تخصیص فقط به بدهی‌های انتخاب‌شده</option>
                <option value="manual">تخصیص دستی روی هر بدهی</option>
              </select>
            </label>
          <label className="finance-inline-filter finance-inline-filter-note">
            <span>یادداشت پرداخت</span>
            <textarea value={paymentDeskForm.note} onChange={(e) => setPaymentDeskForm((p) => ({ ...p, note: e.target.value }))} rows={2} placeholder="یادداشت پرداخت" />
          </label>
          </div>
          {!!paymentDeskForm.studentId && (
            <div className="finance-subcard finance-student-spotlight finance-payment-student-card-row">
              <div className="finance-card-head">
                <div>
                  <h4>کارت مالی متعلم</h4>
                  <p className="muted">جمع تمام عضویت‌ها، صنف‌ها و سال‌های تعلیمی همین شاگرد.</p>
                </div>
                <div className="finance-chip-group">
                  <span className="finance-chip finance-chip-emerald">{paymentDeskFinanceSnapshot.reliefCount} تسهیل فعال</span>
                  {!!paymentDeskFinanceSnapshot.fullReliefCount && <span className="finance-chip">کامل: {paymentDeskFinanceSnapshot.fullReliefCount}</span>}
                  {!!paymentDeskFinanceSnapshot.percentReliefCount && <span className="finance-chip finance-chip-muted">درصدی: {paymentDeskFinanceSnapshot.percentReliefCount}</span>}
                  <Link className="finance-chip finance-chip-muted" to={`/admin-finance/profile/${encodeURIComponent(paymentDeskForm.studentId)}`}>
                    تاریخچه کامل شاگرد
                  </Link>
                </div>
              </div>
              {financeDataErrors.orders ? (
                <div className="finance-data-error" role="alert">
                  کارت مالی قابل محاسبه نیست: {financeDataErrors.orders}
                </div>
              ) : null}
              <div className="finance-kpi-grid finance-kpi-grid-dense">
                <div className="finance-kpi-item">
                  <span>مبلغ اصلی {FEE_LINE_TYPE_LABELS[paymentDeskForm.feeType] || 'تعهد'}</span>
                  <strong>{fmt(paymentDeskScopeSnapshot.gross)} AFN</strong>
                </div>
                <div className="finance-kpi-item">
                  <span>تخفیف/معافیت تطبیق‌شده</span>
                  <strong>{fmt(paymentDeskScopeSnapshot.discount)} AFN</strong>
                </div>
                <div className="finance-kpi-item">
                  <span>مبلغ خالص {FEE_LINE_TYPE_LABELS[paymentDeskForm.feeType] || 'تعهد'}</span>
                  <strong>{fmt(paymentDeskScopeSnapshot.net)} AFN</strong>
                </div>
                <div className="finance-kpi-item">
                  <span>پرداخت {FEE_LINE_TYPE_LABELS[paymentDeskForm.feeType] || 'تعهد'}</span>
                  <strong>{fmt(paymentDeskScopeSnapshot.paid)} AFN</strong>
                </div>
                <div className="finance-kpi-item finance-kpi-item-accent">
                  <span>باقی {FEE_LINE_TYPE_LABELS[paymentDeskForm.feeType] || 'تعهد'}</span>
                  <strong>{fmt(paymentDeskScopeSnapshot.outstanding)} AFN</strong>
                </div>
              </div>
              <div className="finance-subcard-list">
                <div className="mini-row">
                  <span>فیس/شهریه</span>
                  <span>پرداخت {fmt(paymentDeskFinanceSnapshot.byFeeType?.tuition?.paid || 0)} | باقی {fmt(paymentDeskFinanceSnapshot.byFeeType?.tuition?.outstanding || 0)} AFN</span>
                </div>
                <div className="mini-row">
                  <span>داخله</span>
                  <span>پرداخت {fmt(paymentDeskFinanceSnapshot.byFeeType?.admission?.paid || 0)} | باقی {fmt(paymentDeskFinanceSnapshot.byFeeType?.admission?.outstanding || 0)} AFN</span>
                </div>
                <div className="mini-row">
                  <span>بدهی‌های باز</span>
                  <span>{paymentDeskFinanceSnapshot.openOrders}</span>
                </div>
                <div className="mini-row">
                  <span>نزدیک‌ترین مهلت پرداخت</span>
                  <span>{paymentDeskFinanceSnapshot.nextDueOrder?.dueDate ? toFaDate(paymentDeskFinanceSnapshot.nextDueOrder.dueDate) : '-'}</span>
                </div>
                {paymentDeskFinanceSnapshot.topReliefs.map((item) => (
                  <div key={`desk-relief-${item.id}`} className="mini-row">
                    <span>{RELIEF_TYPE_UI_LABELS[item.reliefType] || item.reliefType || 'تسهیل'}</span>
                    <span>{getReliefValueLabel(item)}</span>
                  </div>
                ))}
                {!paymentDeskFinanceSnapshot.topReliefs.length && (
                  <div className="mini-row">
                    <span>تسهیلات فعال</span>
                    <span className="finance-chip finance-chip-muted">0 مورد</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {paymentDeskOpenOrders.length > 0 && (paymentAdvancedOpen || paymentDeskForm.allocationMode !== 'auto_oldest_due') ? (
            <div className="finance-order-pick-list finance-payment-open-orders-row" data-testid="desk-open-orders">
              {paymentDeskOpenOrders.map((item) => {
                const orderId = getFeeOrderRowId(item);
                const scopedBalance = getBillFeeScopeSummary(item, paymentDeskForm.feeType).outstanding;
                return (
                <div key={`pick-${orderId}`} className="finance-flag finance-order-pick-row">
                  <div className="finance-order-pick-copy">
                    {paymentDeskForm.allocationMode === 'auto_selected' ? (
                      <label className="finance-order-pick-toggle">
                        <input
                          type="checkbox"
                          checked={paymentDeskSelectedOrderIds.includes(orderId)}
                          onChange={() => toggleDeskOrderSelection(orderId)}
                        />
                        <span>{item.title || formatFinanceCode(item.billNumber, '') || 'بدهی مالی'}</span>
                      </label>
                    ) : (
                      <strong>{item.title || formatFinanceCode(item.billNumber, '') || 'بدهی مالی'}</strong>
                    )}
                    <small>{FEE_LINE_TYPE_LABELS[paymentDeskForm.feeType] || paymentDeskForm.feeType} | مهلت پرداخت: {toFaDate(item.dueDate)} | مانده: {fmt(scopedBalance)} AFN</small>
                  </div>
                  {paymentDeskForm.allocationMode === 'manual' ? (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      max={scopedBalance}
                      value={paymentDeskForm.manualAllocations?.[orderId] || ''}
                      onChange={(e) => updateDeskManualAllocation(orderId, e.target.value)}
                      placeholder="مبلغ تخصیص"
                      data-testid={`desk-manual-allocation-${orderId}`}
                    />
                  ) : (
                    <span className={`finance-chip ${paymentDeskSelectedOrderIds.includes(orderId) ? 'finance-chip-emerald' : 'finance-chip-muted'}`}>
                      {paymentDeskForm.allocationMode === 'auto_selected'
                        ? (paymentDeskSelectedOrderIds.includes(orderId) ? 'انتخاب شده' : 'انتخاب نشده')
                        : `${fmt(scopedBalance)} AFN`}
                    </span>
                  )}
                </div>
              );})}
            </div>
          ) : paymentDeskOpenOrders.length <= 0 ? (
            <p className="muted finance-order-empty">برای متعلم، صنف و سال تعلیمی انتخاب‌شده هیچ بدهی باز پیدا نشد.</p>
          ) : null}
          {false && paymentPreview?.membership && (
            <div className="finance-chip-group">
              <span className="finance-chip">{paymentPreview.membership?.schoolClass?.title || 'صنف'}</span>
              <span className="finance-chip finance-chip-muted">{paymentPreview.membership?.academicYear?.title || 'سال تعلیمی'}</span>
              <span className="finance-chip finance-chip-emerald">{fmt(paymentPreview.totalOutstanding || 0)} AFN مانده کل</span>
            </div>
          )}
          {false && Array.isArray(paymentPreview?.openOrders) && paymentPreview.openOrders.length > 0 && (
            <div className="finance-order-pick-list">
              {paymentPreview.openOrders.map((item) => (
                <label key={`pick-${item.id}`} className="finance-flag">
                  <input
                    type="checkbox"
                    checked={paymentDeskForm.selectedFeeOrderIds.includes(item.id)}
                    disabled={paymentDeskForm.allocationMode !== 'auto_selected'}
                    onChange={() => toggleDeskOrderSelection(item.id)}
                  />
                  <span>{item.title || formatFinanceCode(item.orderNumber, '') || 'بدهی مالی'} - {fmt(item.outstandingAmount || 0)} AFN</span>
                </label>
              ))}
            </div>
          )}
          {Array.isArray(paymentPreview?.allocations) && paymentPreview.allocations.length > 0 && (
            <div className="finance-preview-list finance-payment-preview-row" data-testid="desk-payment-preview">
              <div className="finance-chip-group">
                <span className="finance-chip">{paymentPreview.allocations.length} تخصیص</span>
                <span className="finance-chip finance-chip-emerald">{fmt(paymentPreview.totalAllocated || 0)} AFN</span>
                <span className="finance-chip finance-chip-muted">{fmt(paymentPreview.remainingAmount || 0)} AFN باقی‌مانده</span>
              </div>
              {paymentPreview.allocations.map((item) => (
                <div key={`allocation-${item.feeOrderId}`} className="finance-plan-row">
                  <strong>{item.title || formatFinanceCode(item.orderNumber, '') || 'بدهی مالی'}</strong>
                  <span>{fmt(item.amount || 0)} AFN</span>
                  <small className="finance-latin-code">{formatFinanceCode(item.orderNumber || item.feeOrderId, '-')}</small>
                </div>
              ))}
            </div>
          )}
          <div className="finance-payment-actions-row">
          <p className="finance-payment-action-hint">{paymentDeskCanSubmit && !paymentPreview?.allocations?.length ? 'پرداخت آماده ثبت است؛ تخصیص هنگام ثبت محاسبه می‌شود.' : paymentDeskActionHint}</p>
          <div className="row-actions finance-payment-action-buttons">
            <button
              type="button"
              onClick={previewDeskPayment}
              disabled={
                busy
                || Number(paymentDeskForm.amount || 0) <= 0
                || !paymentDeskForm.paidAt
                || !paymentDeskOpenOrders.length
                || (paymentDeskForm.allocationMode === 'auto_selected' && !paymentDeskSelectedOrderIds.length)
                || (paymentDeskForm.allocationMode === 'manual' && (paymentDeskManualAllocated <= 0 || paymentDeskManualMismatch))
              }
              data-testid="preview-desk-payment"
            >
              پیش‌نمایش پرداخت
            </button>
            <button
              type="submit"
              className="secondary"
              onClick={() => setDeskPaymentSubmitMode('save_print')}
              disabled={busy || !paymentDeskCanSubmit}
              data-testid="submit-print-desk-payment"
            >
              ثبت و چاپ رسید
            </button>
            <button
              type="submit"
              onClick={() => setDeskPaymentSubmitMode('save')}
              disabled={busy || !paymentDeskCanSubmit}
              data-testid="submit-desk-payment"
            >
              ثبت پرداخت
            </button>
          </div>
          </div>
          </div>
        </form>

        {orderFormMode === 'bulk' && (
          <form className="finance-card finance-order-action-card" data-finance-section="orders" onSubmit={generateBulkBills} data-testid="bulk-billing-form">
            <div className="finance-card-head">
              <div>
                <h3>صدور گروهی بل</h3>
                <p className="muted">برای یک صنف و سال تعلیمی مشخص، بل‌های ماهانه یا دوره‌ای را یک‌جا بسازید و قبل از ثبت، پیش‌نمایش بگیرید.</p>
              </div>
              <span className="finance-chip">{classOptions.length} صنف</span>
            </div>
            <select value={bulkForm.classId} onChange={(e) => applyBulkClassSelection(e.target.value)} required>
              <option value="">صنف را انتخاب کنید</option>
              {classOptions.map((item) => <option key={item.classId} value={item.classId}>{getClassOptionLabel(item)}</option>)}
            </select>
            <div className="finance-split-grid">
              <select value={bulkForm.academicYearId} onChange={(e) => setBulkForm((p) => ({ ...p, academicYearId: e.target.value }))}>
                <option value="">سال تعلیمی عضویت‌ها</option>
                {academicYears.map((item) => <option key={`bulk-year-${item.id}`} value={item.id}>{getAcademicYearOptionLabel(item)}</option>)}
              </select>
              <div className="finance-info-note">مبلغ فیس و داخله فقط از پلان مالی فعال همین صنف و سال تعلیمی گرفته می‌شود.</div>
            </div>
            <div className="finance-split-grid">
              <div className="finance-cell-stack">
                <span className="finance-field-label">مهلت پرداخت</span>
                <AfghanDateInput value={bulkForm.dueDate} onChange={(value) => setBulkForm((p) => ({ ...p, dueDate: value }))} showGregorianEquivalent required />
                <small>{bulkForm.dueDate ? `مهلت پرداخت: ${toFaDate(bulkForm.dueDate)}` : 'مهلت پرداخت گروهی انتخاب نشده است.'}</small>
              </div>
              <input value={bulkForm.periodLabel} onChange={(e) => setBulkForm((p) => ({ ...p, periodLabel: e.target.value }))} placeholder="عنوان بل / دوره" />
            </div>
            <label className="finance-flag">
              <input type="checkbox" checked={bulkForm.includeAdmission} onChange={(e) => setBulkForm((p) => ({ ...p, includeAdmission: e.target.checked }))} />
              <span>شامل داخله از پلان مالی</span>
            </label>
            <p className="muted">اگر این گزینه خاموش باشد، صدور گروهی فقط فیس/شهریه را ایجاد می‌کند و داخله جداگانه صادر نمی‌شود.</p>
            <button type="button" className="secondary finance-advanced-toggle" onClick={() => setBillingAdvancedOpen((value) => !value)}>
              {billingAdvancedOpen ? 'بستن تنظیمات پیشرفته' : 'تنظیمات پیشرفته'}
            </button>
            {billingAdvancedOpen && (
              <>
                <div className="finance-split-grid">
                  <select value={bulkForm.periodType} onChange={(e) => setBulkForm((p) => ({ ...p, periodType: e.target.value }))}>
                    <option value="monthly">بل ماهانه</option>
                    <option value="term">بل دوره‌ای</option>
                  </select>
                  <input value={bulkForm.academicYear} onChange={(e) => setBulkForm((p) => ({ ...p, academicYear: e.target.value }))} placeholder="سال آموزشی متنی" />
                  <input value={bulkForm.term} onChange={(e) => setBulkForm((p) => ({ ...p, term: e.target.value }))} placeholder="ترم" />
                </div>
                <div className="finance-flag-grid">
                  <label className="finance-flag">
                    <input type="checkbox" checked={bulkForm.includeTransport} onChange={(e) => setBulkForm((p) => ({ ...p, includeTransport: e.target.checked }))} />
                    <span>شامل ترانسپورت</span>
                  </label>
                  <label className="finance-flag">
                    <input type="checkbox" checked={bulkForm.onlyDebtors} onChange={(e) => setBulkForm((p) => ({ ...p, onlyDebtors: e.target.checked }))} />
                    <span>فقط بدهکاران</span>
                  </label>
                </div>
              </>
            )}
            <div className="row-actions">
              <button type="button" onClick={previewBulkBills} disabled={busy}>پیش‌نمایش بل‌ها</button>
              <button type="submit" disabled={busy}>صدور گروهی</button>
            </div>
            {billingPreview && (
              <div className="finance-preview-list" data-testid="bulk-billing-preview">
                <div className="finance-chip-group">
                  <span className="finance-chip">{billingPreview.summary?.billCount || billingPreview.summary?.candidateCount || 0} بل قابل صدور</span>
                  <span className="finance-chip finance-chip-muted">{billingPreview.summary?.studentCount || 0} شاگرد</span>
                  <span className="finance-chip finance-chip-muted">{billingPreview.summary?.membershipCount || 0} عضویت مالی</span>
                  <span className="finance-chip finance-chip-muted">{billingPreview.summary?.duplicateCount || 0} بل تکراری</span>
                  <span className="finance-chip finance-chip-emerald">{fmt(billingPreview.summary?.totalAmountDue || 0)} AFN</span>
                </div>
                {(billingPreview.items || []).slice(0, 5).map((item) => (
                  <div key={`preview-${item.studentMembershipId || item.studentId}`} className="finance-plan-row">
                    <strong>{students.find((student) => String(student._id) === String(item.studentId))?.name || item.studentId || 'متعلم'}</strong>
                    <span>{fmt(item.amountDue)} AFN - {(item.feeScopes || []).join(', ')}</span>
                    {!!formatFeeLineSummary(item.lineItems).length && <small>{formatFeeLineSummary(item.lineItems)}</small>}
                    <small>{item.duplicate ? `duplicate: ${formatFinanceCode(item.duplicate.billNumber, '-')}` : `${item.adjustments?.length || 0} adjustment`}</small>
                  </div>
                ))}
                {!!billingPreview.excluded?.length && (
                  <p className="finance-warning-note" dir="rtl">
                    هشدار: {billingPreview.excluded.length} مورد قابل صدور نیست.
                    {getBulkPreviewExcludedReasons(billingPreview).length ? ` - ${getBulkPreviewExcludedReasons(billingPreview).join('، ')}` : ''}
                  </p>
                )}
              </div>
            )}
          </form>
        )}

        <form className="finance-card finance-plan-builder" data-finance-section="settings" onSubmit={saveFeePlan}>
          <div className="finance-card-head">
            <div>
              <h3>تنظیم ساختار اصلی فیس</h3>
              <p className="muted">پلان فیس را مرحله‌به‌مرحله بسازید، اقلام فعال را ببینید و قبل از ذخیره با پلان‌های موجود مقایسه کنید.</p>
            </div>
            <div className="finance-chip-group">
              <span className="finance-chip finance-chip-muted">{filteredFeePlans.length} پلان</span>
              <span className="finance-chip finance-chip-emerald">{fmt(feePlanTotalAmount)} {feePlanForm.currency || 'AFN'}</span>
              <span className="finance-chip finance-chip-sky">{feePlanActiveLineItems.length} قلم فعال</span>
            </div>
          </div>
          <div className="finance-plan-builder-layout">
            <div className="finance-plan-builder-main">
              <section className="finance-plan-builder-section">
                <div className="finance-plan-step-head">
                  <span className="finance-plan-step">۱</span>
                  <div>
                    <h4>محدوده پلان</h4>
                    <p className="muted">صنف، سال تعلیمی و دوره پرداخت را مشخص کنید.</p>
                  </div>
                </div>
                <div className="finance-split-grid">
                  <label className="finance-field">
                    <span>عنوان پلان</span>
                    <input value={feePlanForm.title} onChange={(e) => setFeePlanForm((p) => ({ ...p, title: e.target.value }))} placeholder="مثلاً فیس صنف اول - ۱۴۰۵" />
                  </label>
                  <label className="finance-field">
                    <span>کد پلان</span>
                    <input
                      value={feePlanForm.planCode}
                      onChange={(e) => setFeePlanForm((p) => ({ ...p, planCode: e.target.value.toUpperCase() }))}
                      placeholder="STANDARD"
                    />
                  </label>
                  <label className="finance-field">
                    <span>صنف</span>
                    <select value={feePlanForm.classId} onChange={(e) => setFeePlanForm((p) => ({ ...p, classId: e.target.value }))}>
                      {classOptions.map((item) => <option key={item.classId} value={item.classId}>{getClassOptionLabel(item)}</option>)}
                    </select>
                  </label>
                  <label className="finance-field">
                    <span>سال تعلیمی</span>
                    <select value={feePlanForm.academicYearId} onChange={(e) => setFeePlanForm((p) => ({ ...p, academicYearId: e.target.value }))}>
                      {academicYears.map((item) => <option key={item.id} value={item.id}>{getAcademicYearOptionLabel(item)}</option>)}
                    </select>
                  </label>
                  <label className="finance-field">
                    <span>دوره پرداخت</span>
                    <select value={feePlanForm.billingFrequency} onChange={(e) => setFeePlanForm((p) => ({ ...p, billingFrequency: e.target.value }))}>
                      {Object.entries(FEE_PLAN_FREQUENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="finance-field">
                    <span>ترم / دوره</span>
                    <input value={feePlanForm.term} onChange={(e) => setFeePlanForm((p) => ({ ...p, term: e.target.value }))} placeholder="مثلاً ترم اول" />
                  </label>
                </div>
                <div className="finance-field">
                  <span>ماه‌های فیس‌دار سال تعلیمی</span>
                  <div className="finance-flag-grid">
                    {AFGHAN_SCHOOL_MONTHS.map((label, index) => {
                      const monthNumber = index + 1;
                      const selectedYear = academicYears.find((year) => year.id === feePlanForm.academicYearId);
                      return (
                        <label className="finance-flag" key={`billing-month-${monthNumber}`}>
                          <input
                            type="checkbox"
                            checked={(selectedYear?.feeBillingMonths || [1, 2, 3, 4, 5, 6, 7, 8, 9]).includes(monthNumber)}
                            onChange={() => toggleAcademicYearBillingMonth(monthNumber)}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <button type="button" className="secondary" onClick={saveAcademicYearBillingMonths} disabled={busy || !feePlanForm.academicYearId}>ذخیره ماه‌های فیس‌دار</button>
                </div>
              </section>

              <section className="finance-plan-builder-section">
                <div className="finance-plan-step-head">
                  <span className="finance-plan-step">۲</span>
                  <div>
                    <h4>اقلام فیس</h4>
                    <p className="muted">هر قلم با مبلغ بیشتر از صفر در بل‌های آینده فعال می‌شود.</p>
                  </div>
                </div>
                <div className="finance-fee-line-grid">
                  {feePlanLineItems.map((item) => (
                    <label key={item.key} className={`finance-fee-line ${item.active ? 'is-active' : ''}`}>
                      <div className="finance-fee-line-head">
                        <span>{item.label}</span>
                        <small>{item.cadence} / {item.required ? 'اصلی' : 'اختیاری'}</small>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={feePlanForm[item.key]}
                        onChange={(e) => setFeePlanForm((p) => ({ ...p, [item.key]: e.target.value }))}
                        placeholder="۰"
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="finance-plan-builder-section">
                <div className="finance-plan-step-head">
                  <span className="finance-plan-step">۳</span>
                  <div>
                    <h4>پالیسی پرداخت</h4>
                    <p className="muted">مهلت پرداخت، واحد پول و تاریخ تطبیق را برای پلان تنظیم کنید.</p>
                  </div>
                </div>
                <div className="finance-split-grid">
                  <label className="finance-field">
                    <span>واحد پول</span>
                    <input value={feePlanForm.currency} onChange={(e) => setFeePlanForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} placeholder="AFN" />
                  </label>
                  <label className="finance-field">
                    <span>روز مهلت پرداخت</span>
                    <input type="number" min="1" max="28" value={feePlanForm.dueDay} onChange={(e) => setFeePlanForm((p) => ({ ...p, dueDay: e.target.value }))} placeholder="۱۰" />
                  </label>
                  <div className="finance-cell-stack">
                    <span className="finance-field-label">شروع مؤثر</span>
                    <AfghanDateInput
                      value={feePlanForm.effectiveFrom}
                      onChange={(value) => setFeePlanForm((p) => ({ ...p, effectiveFrom: value }))}
                      showGregorianEquivalent
                    />
                    <small>{feePlanForm.effectiveFrom ? `هجری شمسی: ${toFaDate(feePlanForm.effectiveFrom)}` : 'تاریخ شروع انتخاب نشده است.'}</small>
                  </div>
                  <div className="finance-cell-stack">
                    <span className="finance-field-label">ختم مؤثر</span>
                    <AfghanDateInput
                      value={feePlanForm.effectiveTo}
                      onChange={(value) => setFeePlanForm((p) => ({ ...p, effectiveTo: value }))}
                      showGregorianEquivalent
                    />
                    <small>{feePlanForm.effectiveTo ? `هجری شمسی: ${toFaDate(feePlanForm.effectiveTo)}` : 'بدون تاریخ ختم.'}</small>
                  </div>
                </div>
              </section>

              <section className="finance-plan-builder-section">
                <div className="finance-plan-step-head">
                  <span className="finance-plan-step">۴</span>
                  <div>
                    <h4>قواعد و یادداشت</h4>
                    <p className="muted">نوع پلان، اولویت و قاعده اهلیت برای انتخاب خودکار پلان استفاده می‌شود.</p>
                  </div>
                </div>
                <div className="finance-split-grid">
                  <label className="finance-field">
                    <span>نوع پلان</span>
                    <select value={feePlanForm.planType} onChange={(e) => setFeePlanForm((p) => ({ ...p, planType: e.target.value }))}>
                      {Object.entries(FEE_PLAN_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="finance-field">
                    <span>اولویت</span>
                    <input
                      type="number"
                      min="0"
                      value={feePlanForm.priority}
                      onChange={(e) => setFeePlanForm((p) => ({ ...p, priority: e.target.value }))}
                      placeholder="عدد کمتر = ارجح"
                    />
                  </label>
                </div>
                <label className="finance-field">
                  <span>قاعده اهلیت</span>
                  <input
                    value={feePlanForm.eligibilityRule}
                    onChange={(e) => setFeePlanForm((p) => ({ ...p, eligibilityRule: e.target.value }))}
                    placeholder="مثلاً خواهر/برادر دوم، بورسیه یا حمایت خیریه"
                  />
                </label>
                <div className="finance-flag-grid">
                  <label className="finance-flag">
                    <input
                      type="checkbox"
                      checked={feePlanForm.isDefault}
                      onChange={(e) => setFeePlanForm((p) => ({ ...p, isDefault: e.target.checked }))}
                    />
                    <span>پلان پیش‌فرض این دامنه</span>
                  </label>
                </div>
                <textarea value={feePlanForm.note} onChange={(e) => setFeePlanForm((p) => ({ ...p, note: e.target.value }))} rows={3} placeholder="یادداشت پلان" />
                <button type="submit" disabled={busy}>ذخیره پلان فیس</button>
              </section>
            </div>

            <aside className="finance-plan-builder-aside">
              <div className="finance-plan-preview">
                <div className="finance-card-head">
                  <div>
                    <h4>پیش‌نمایش پلان</h4>
                    <p className="muted">قبل از ذخیره، دامنه و مبلغ کل را کنترل کنید.</p>
                  </div>
                </div>
                <div className="receipt-meta-grid audit-meta-grid">
                  <div><span>صنف</span><strong>{selectedFeePlanClass ? getClassOptionLabel(selectedFeePlanClass) : '-'}</strong></div>
                  <div><span>سال</span><strong>{selectedFeePlanAcademicYear ? getAcademicYearOptionLabel(selectedFeePlanAcademicYear) : '-'}</strong></div>
                  <div><span>دوره</span><strong>{FEE_PLAN_FREQUENCY_LABELS[feePlanForm.billingFrequency] || feePlanForm.billingFrequency}</strong></div>
                  <div><span>مهلت پرداخت</span><strong>روز {fmt(feePlanForm.dueDay || 10)}</strong></div>
                  <div><span>اقلام فعال</span><strong>{fmt(feePlanActiveLineItems.length)}</strong></div>
                  <div><span>مبلغ کل</span><strong>{fmt(feePlanTotalAmount)} {feePlanForm.currency || 'AFN'}</strong></div>
                </div>
                {!feePlanFormHasAmounts && matchingActiveFeePlan && (
                  <div className="finance-plan-warning">
                    <strong>پیش‌نمایش از پلان فعال موجود</strong>
                    <span>{matchingActiveFeePlan.title || 'پلان مالی'} برای این صنف و سال پیدا شد. برای ویرایش یا ذخیره مجدد، آن را به فرم کپی کنید.</span>
                    <button type="button" className="secondary" onClick={() => loadFeePlanIntoForm(matchingActiveFeePlan)} disabled={busy}>کپی پلان موجود به فرم</button>
                  </div>
                )}
                <div className="finance-plan-line-summary">
                  {feePlanActiveLineItems.map((item) => (
                    <div key={`preview-${item.key}`} className="mini-row">
                      <span>{item.label}</span>
                      <strong>{fmt(item.amount)} {feePlanForm.currency || 'AFN'}</strong>
                    </div>
                  ))}
                  {!feePlanActiveLineItems.length && <p className="muted">هنوز قلم فعال ثبت نشده است.</p>}
                </div>
                {!!sameScopeFeePlans.length && (
                  <div className="finance-plan-warning">
                    <strong>{fmt(sameScopeFeePlans.length)} پلان مشابه</strong>
                    <span>برای همین صنف، سال، دوره پرداخت و ترم قبلاً پلان ثبت شده است.</span>
                  </div>
                )}
              </div>

              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>جستجوی پلان فیس</span>
                <input
                  value={feePlanSearchTerm}
                  onChange={(e) => setFeePlanSearchTerm(e.target.value)}
                  placeholder="عنوان، کد پلان، صنف، سال یا نوع پلان"
                />
              </label>
              <div className="finance-plan-list">
                {filteredFeePlans.slice(0, planVisibleCount).map((plan) => {
                  const lifecycleStatus = String(plan.lifecycleStatus || (plan.isActive === false ? 'inactive' : 'active')).trim() || 'active';
                  const lifecycleLabel = FEE_PLAN_LIFECYCLE_LABELS[lifecycleStatus] || lifecycleStatus;
                  return (
                  <div key={plan._id} className={`finance-plan-row finance-plan-row-enhanced ${lifecycleStatus !== 'active' ? `is-${lifecycleStatus}` : ''}`}>
                    <div className="finance-plan-row-head">
                      <strong>{plan.title || 'Fee plan'}</strong>
                      <span className={`finance-plan-state ${plan.isDefault ? 'default' : lifecycleStatus}`}>{plan.isDefault ? 'پیش‌فرض' : lifecycleLabel}</span>
                    </div>
                    <span>{plan.schoolClass?.title || 'صنف نامشخص'} - {plan.academicYear?.title || plan.academicYear || 'سال نامشخص'}</span>
                    <span>
                      {(FEE_PLAN_TYPE_LABELS[plan.planType] || plan.planType || 'عادی')}
                      {plan.planCode ? ` - ${plan.planCode}` : ''}
                      {' | '}
                      {(FEE_PLAN_FREQUENCY_LABELS[plan.billingFrequency] || plan.billingFrequency || 'دوره‌ای')}
                      {plan.term ? ` | ${plan.term}` : ''}
                    </span>
                    <small>
                      فیس/شهریه: {fmt(plan.tuitionFee || plan.amount)} | داخله: {fmt(plan.admissionFee)} | امتحان: {fmt(plan.examFee)}
                    </small>
                    <small>
                      ترانسپورت: {fmt(plan.transportDefaultFee)} | اسناد: {fmt(plan.documentFee)} | اولویت: {plan.priority ?? '-'}
                    </small>
                    <small>
                      {plan.effectiveFrom ? `از: ${toFaDate(plan.effectiveFrom)}` : 'بدون شروع'}
                      {plan.effectiveTo ? ` | تا: ${toFaDate(plan.effectiveTo)}` : ''}
                    </small>
                    {lifecycleStatus === 'archived' && plan.archivedAt && <small>آرشیف شده: {toFaDate(plan.archivedAt)}</small>}
                    {!!plan.eligibilityRule && <small>قاعده: {plan.eligibilityRule}</small>}
                    <div className="finance-plan-row-actions">
                      <button type="button" className="secondary" onClick={() => loadFeePlanIntoForm(plan)} disabled={busy}>کپی به فرم</button>
                      {lifecycleStatus !== 'active' && (
                        <button type="button" className="secondary" onClick={() => updateFeePlanLifecycle(plan, 'active')} disabled={busy}>فعال‌سازی</button>
                      )}
                      {lifecycleStatus === 'active' && (
                        <button type="button" className="secondary" onClick={() => updateFeePlanLifecycle(plan, 'inactive')} disabled={busy}>غیرفعال‌سازی</button>
                      )}
                      {lifecycleStatus !== 'archived' && (
                        <button type="button" className="secondary" onClick={() => updateFeePlanLifecycle(plan, 'archive')} disabled={busy}>آرشیف</button>
                      )}
                      <button type="button" className="danger" onClick={() => deleteFeePlanSafely(plan)} disabled={busy}>حذف امن</button>
                    </div>
                  </div>
                  );
                })}
                {!filteredFeePlans.length && <p className="muted">برای این جستجو یا تنظیمات، پلانی پیدا نشد.</p>}
                {filteredFeePlans.length > 5 && (
                  <div className="row-actions">
                    {planVisibleCount < filteredFeePlans.length && <button type="button" className="secondary" onClick={() => setPlanVisibleCount((value) => value + 5)}>نمایش بیشتر</button>}
                    {planVisibleCount > 5 && <button type="button" className="secondary" onClick={() => setPlanVisibleCount(5)}>نمایش کمتر</button>}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </form>
      </div>

      <div className="finance-card" data-finance-section="expenses" data-testid="expense-treasury-impact-card">
        <div className="finance-card-head">
          <div>
            <h3>اثر مصارف روی عواید و خزانه مکتب</h3>
            <p className="muted">همان بازه‌ی «از تاریخ/تا تاریخ» بالای صفحه؛ مصرفِ تاییدشده مستقیم از عواید کم و در صندوق خزانه ثبت می‌شود.</p>
          </div>
        </div>
        <div className="finance-kpi-grid finance-kpi-grid-dense">
          <div className="finance-kpi-item"><span>عواید تاییدشده</span><strong>{fmt(financeOverviewKpis?.approvedRevenue?.amount || 0)} AFN</strong></div>
          <div className="finance-kpi-item finance-kpi-item-accent"><span>مصارف تاییدشده (کسرشده از عواید)</span><strong>−{fmt(financeOverviewKpis?.expenses?.amount || 0)} AFN</strong></div>
          <div className="finance-kpi-item"><span>خالص عواید (عواید − مصارف)</span><strong>{fmt(financeOverviewKpis?.netCash?.amount || 0)} AFN</strong></div>
          <div className="finance-kpi-item"><span>نسبت مصرف به عاید</span><strong>{fmt(financeOverviewKpis?.rates?.expenseToIncome || 0)}٪</strong></div>
          <div className="finance-kpi-item"><span>ورودی خزانه/صندوق</span><strong>{fmt(financeOverviewKpis?.treasury?.inflow || 0)} AFN</strong></div>
          <div className="finance-kpi-item"><span>خروجی خزانه/صندوق</span><strong>{fmt(financeOverviewKpis?.treasury?.outflow || 0)} AFN</strong></div>
          <div className="finance-kpi-item finance-kpi-item-accent"><span>خالص صندوق</span><strong>{fmt(financeOverviewKpis?.treasury?.net || 0)} AFN</strong></div>
          <div className="finance-kpi-item"><span>مصارف پیش‌نویس (هنوز ارسال نشده، کم نشده)</span><strong>{fmt(expenseStatusBreakdown.draft)} AFN</strong></div>
          <div className="finance-kpi-item"><span>مصارف در انتظار بررسی (ارسال‌شده، هنوز کم نشده)</span><strong>{fmt(expenseStatusBreakdown.pendingReview)} AFN</strong></div>
        </div>
        <p className="muted">فقط مصرفِ «تاییدشده» از عواید/خالص کسر می‌شود؛ پیش‌نویس و در‌انتظارِ‌بررسی هنوز اثری روی این ارقام ندارند. انتخاب «حساب خزانه» هنگام ثبت مصرف کافی است: به‌محض تایید مصرف، همان لحظه هم از عواید و هم از «خروجی صندوق» همین حساب کم می‌شود و در فهرست «مصارف بدون حساب خزانه» دیگر نمی‌آید — نیازی به ثبت دوباره‌ی آن از مرکز مالی دولت نیست. تنها استثنا مصارفی‌اند که از «تعهدات تدارکاتی» تسویه می‌شوند؛ اثر خروجیِ آن‌ها با تراکنش تسویه‌ی همان تعهد ثبت می‌شود، نه اینجا.</p>
      </div>

      <div className="finance-card" data-finance-section="expenses" data-testid="finance-expenses-card">
        <div className="finance-toolbar finance-expenses-filter-toolbar">
          <div className="finance-expenses-toolbar-intro">
            <h3>مصارف مکتب</h3>
            <p className="muted">ثبت، بررسی، تایید و باطل‌سازی مصارف - با فلتر «ماه» همین‌جا یا بازه‌ی «از تاریخ/تا تاریخ» بالای صفحه (یک ماه، چند ماه یا کل سال).</p>
          </div>
          <div className="finance-expenses-filter-row">
            <label className="finance-inline-filter">
              <span>جستجو</span>
              <input
                value={expenseSearchTerm}
                onChange={(e) => setExpenseSearchTerm(e.target.value)}
                placeholder="دسته، فروشنده، شماره سند یا یادداشت"
                data-testid="expense-search-input"
              />
            </label>
            <label className="finance-inline-filter">
              <span>ماه</span>
              <select
                value={selectedExpenseMonthKey}
                onChange={(e) => applyExpenseMonthFilter(e.target.value)}
                data-testid="expense-month-filter"
              >
                <option value="">{selectedExpenseMonthKey ? 'بازه سفارشی' : 'یک ماه را انتخاب کنید'}</option>
                {expenseMonthFilterOptions.map((item) => (
                  <option key={`expense-month-filter-${item.key}`} value={item.key}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>دسته</span>
              <select value={expenseCategoryFilter} onChange={(e) => setExpenseCategoryFilter(e.target.value)} data-testid="expense-category-filter">
                <option value="all">همه دسته‌ها</option>
                {expenseCategoryOptions.map((item) => (
                  <option key={`expense-cat-filter-${item.key}`} value={item.key}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>وضعیت</span>
              <select value={expenseStatusFilter} onChange={(e) => setExpenseStatusFilter(e.target.value)} data-testid="expense-status-filter">
                <option value="all">همه</option>
                {Object.entries(EXPENSE_STATUS_LABELS).map(([value, label]) => (
                  <option key={`expense-status-${value}`} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="finance-chip-group receipt-inbox-summary">
          <span className="finance-chip">در این بازه: {fmt(expenseSummary.count)}</span>
          <span className="finance-chip">مجموع مبلغ: {fmt(expenseSummary.total)} AFN</span>
          <span className="finance-chip finance-chip-emerald">تاییدشده: {fmt(expenseSummary.approved)} AFN</span>
          <span className="finance-chip finance-chip-amber">در انتظار بررسی: {fmt(expenseSummary.pending)}</span>
        </div>

        {monthlyTrend.length ? (
          <div className="finance-chip-group finance-expense-monthly-strip" data-testid="expense-monthly-strip">
            {monthlyTrend.slice(-6).map((item) => (
              <span key={`expense-month-${item.monthKey}`} className="finance-chip">
                {toFaMonthKey(item.monthKey)}: {fmt(item.expense)} AFN
              </span>
            ))}
          </div>
        ) : null}

        <div className="row-actions finance-expense-toggle-row">
          <button
            type="button"
            className={showExpenseForm ? '' : 'secondary'}
            onClick={() => setShowExpenseForm((value) => !value)}
            data-testid="expense-form-toggle"
          >
            {showExpenseForm ? 'بستن فورم مصرف' : '+ مصرف جدید'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowAddExpenseCategory((value) => !value)}
            data-testid="expense-category-toggle"
          >
            {showAddExpenseCategory ? 'بستن' : '+ دسته جدید'}
          </button>
        </div>

        {showAddExpenseCategory && (
          <form className="finance-toolbar" onSubmit={createExpenseCategory} data-testid="create-expense-category-form">
            <label className="finance-inline-filter finance-inline-filter-wide">
              <span>نام دسته جدید</span>
              <input
                value={newExpenseCategoryForm.label}
                onChange={(e) => setNewExpenseCategoryForm({ label: e.target.value })}
                placeholder="مثلاً: اجاره یا بیمه"
                data-testid="new-expense-category-label"
              />
            </label>
            <button type="submit" className="secondary" disabled={busy} data-testid="new-expense-category-submit">ثبت دسته</button>
          </form>
        )}

        {showExpenseForm && (
          <form className="receipt-follow-up-form finance-compact-form" onSubmit={createExpense} data-testid="create-expense-form">
            <div className="receipt-follow-up-grid finance-expense-form-grid">
              <label className="finance-inline-filter">
                <span>دسته</span>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, category: e.target.value, subCategory: '' }))}
                  data-testid="expense-form-category"
                >
                  <option value="">انتخاب دسته</option>
                  {expenseCategoryOptions.map((item) => (
                    <option key={`expense-form-cat-${item.key}`} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>زیردسته</span>
                <select
                  value={expenseForm.subCategory}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, subCategory: e.target.value }))}
                  data-testid="expense-form-subcategory"
                >
                  <option value="">بدون زیردسته</option>
                  {expenseSubCategoryOptions.map((item) => (
                    <option key={`expense-form-subcat-${item.key}`} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>سال تعلیمی</span>
                <select
                  value={expenseForm.academicYearId}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, academicYearId: e.target.value }))}
                  data-testid="expense-form-academic-year"
                >
                  <option value="">انتخاب سال تعلیمی</option>
                  {academicYears.map((item) => (
                    <option key={`expense-form-year-${item.id}`} value={item.id}>{getAcademicYearOptionLabel(item)}</option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>صنف (اختیاری)</span>
                <select
                  value={expenseForm.classId}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, classId: e.target.value }))}
                  data-testid="expense-form-class"
                >
                  <option value="">مربوط به کل مکتب</option>
                  {classOptions.map((item) => (
                    <option key={`expense-form-class-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>مبلغ</span>
                <input
                  type="number"
                  min="0"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                  data-testid="expense-form-amount"
                />
              </label>
              <label className="finance-inline-filter">
                <span>تاریخ مصرف</span>
                <AfghanDateInput
                  value={expenseForm.expenseDate}
                  onChange={(value) => setExpenseForm((prev) => ({ ...prev, expenseDate: value }))}
                  showGregorianEquivalent
                  data-testid="expense-form-date"
                />
              </label>
              <label className="finance-inline-filter">
                <span>روش پرداخت</span>
                <select
                  value={expenseForm.paymentMethod}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                  data-testid="expense-form-payment-method"
                >
                  {Object.entries(EXPENSE_PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={`expense-form-method-${value}`} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>حساب خزانه (اختیاری)</span>
                <select
                  value={expenseForm.treasuryAccountId}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, treasuryAccountId: e.target.value }))}
                  data-testid="expense-form-treasury-account"
                >
                  <option value="">بدون اتصال به خزانه</option>
                  {treasuryAccounts.map((item) => (
                    <option key={`expense-form-treasury-${item._id || item.id}`} value={item._id || item.id}>
                      {item.title || item.code || 'حساب خزانه'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>فروشنده/دریافت‌کننده</span>
                <input
                  value={expenseForm.vendorName}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, vendorName: e.target.value }))}
                  data-testid="expense-form-vendor"
                />
              </label>
              <label className="finance-inline-filter">
                <span>شماره سند/رسید</span>
                <input
                  value={expenseForm.referenceNo}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, referenceNo: e.target.value }))}
                  data-testid="expense-form-reference"
                />
              </label>
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>یادداشت</span>
                <input
                  value={expenseForm.note}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="توضیح کوتاه مصرف"
                  data-testid="expense-form-note"
                />
              </label>
            </div>
            <div className="row-actions">
              <label className="finance-inline-filter finance-expense-submit-toggle">
                <input
                  type="checkbox"
                  checked={expenseForm.submitForReview}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, submitForReview: e.target.checked }))}
                  data-testid="expense-form-submit-toggle"
                />
                <span>همین حالا ارسال شود (وگرنه پیش‌نویس می‌ماند)</span>
              </label>
              <button type="submit" disabled={busy} data-testid="expense-form-submit">ثبت مصرف</button>
            </div>
          </form>
        )}

        {!filteredExpenses.length && <p className="muted">با این فیلتر مصرفی پیدا نشد.</p>}
        {!!filteredExpenses.length && (
          <div className="finance-table expenses-table">
            <div className="head"><span>دسته</span><span>فروشنده</span><span>مبلغ</span><span>تاریخ</span><span>وضعیت</span><span>مرحله</span><span>عملیات</span></div>
            {paginatedExpenses.map((item) => (
              <div key={item._id} className="row">
                <div className="receipt-cell-stack">
                  <strong>{resolveExpenseCategoryLabel(item.category)}</strong>
                  <small>{resolveExpenseSubCategoryLabel(item.category, item.subCategory)}</small>
                </div>
                <span>{item.vendorName || '-'}</span>
                <span>{fmt(item.amount)} {item.currency || 'AFN'}</span>
                <span>{toFaDate(item.expenseDate)}</span>
                <span className={`receipt-status-badge ${item.status || 'draft'}`}>
                  {EXPENSE_STATUS_LABELS[item.status] || item.status}
                </span>
                <span>{EXPENSE_STAGE_LABELS[item.approvalStage] || item.approvalStage || '-'}</span>
                <div className="row-actions">
                  {(item.status === 'draft' || item.status === 'rejected') && (
                    <button type="button" onClick={() => submitExpenseForReview(item._id)} disabled={busy}>ارسال برای بررسی</button>
                  )}
                  {item.status === 'pending_review' && (
                    <>
                      <button type="button" onClick={() => reviewExpenseEntry(item._id, 'approve')} disabled={busy}>تایید مرحله</button>
                      <button type="button" className="danger" onClick={() => reviewExpenseEntry(item._id, 'reject')} disabled={busy}>رد</button>
                    </>
                  )}
                  {item.status === 'draft' && (
                    <button type="button" className="danger" onClick={() => deleteExpenseEntry(item._id)} disabled={busy}>حذف</button>
                  )}
                  {item.status !== 'void' && (
                    <button type="button" className="danger" onClick={() => voidExpenseEntry(item._id)} disabled={busy}>باطل‌سازی</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {!!filteredExpenses.length && (
          <div className="finance-pagination" data-testid="expense-pagination">
            <button
              type="button"
              className="secondary"
              onClick={() => setExpensePage((current) => Math.max(1, current - 1))}
              disabled={effectiveExpensePage <= 1}
            >
              قبلی
            </button>
            <span>صفحه {fmt(effectiveExpensePage)} از {fmt(expenseTotalPages)}</span>
            <button
              type="button"
              className="secondary"
              onClick={() => setExpensePage((current) => Math.min(expenseTotalPages, current + 1))}
              disabled={effectiveExpensePage >= expenseTotalPages}
            >
              بعدی
            </button>
          </div>
        )}
      </div>

      <section className="finance-relief-entry-workspace" data-finance-section="discounts" data-testid="relief-entry-workspace">
        <div className="finance-subsection-tabs finance-relief-mode-tabs" role="group" aria-label="فورم‌های تخفیف و معافیت">
          <button type="button" className={reliefFormMode === 'discount' ? 'secondary is-active' : 'secondary'} onClick={() => setReliefFormMode('discount')}>فورم تخفیف</button>
          <button type="button" className={reliefFormMode === 'exemption' ? 'secondary is-active' : 'secondary'} onClick={() => setReliefFormMode('exemption')}>فورم معافیت</button>
        </div>
        <div className="finance-relief-entry-grid">
          <div className="finance-relief-form-pane">
        {reliefFormMode === 'discount' && (
          <form className="finance-card finance-relief-entry-form" data-finance-section="discounts" onSubmit={saveDiscountRegistry} data-testid="discount-registry-form">
            <div className="finance-card-head">
              <div>
                <h3>ثبت تخفیف متعلم</h3>
                <p className="muted">تخفیف عادی فقط روی فیس/شهریه اعمال می‌شود؛ داخله، امتحان، ترانسپورت و سایر فیس‌ها تغییر نمی‌کنند.</p>
              </div>
              <span className="finance-chip">{discountRegistry.length} فعال</span>
            </div>
            <div className="finance-split-grid">
              <label className="finance-field">
                <span>دامنه تخفیف</span>
                <select value={discountForm.targetScope} onChange={(e) => setDiscountForm((prev) => ({
                  ...prev,
                  targetScope: e.target.value,
                  studentId: e.target.value === 'class' ? '' : prev.studentId,
                  studentMembershipId: e.target.value === 'class' ? '' : prev.studentMembershipId
                }))}>
                  <option value="student">یک شاگرد</option>
                  <option value="class">تمام شاگردان صنف</option>
                </select>
              </label>
              <label className="finance-field">
                <span>روش محاسبه</span>
                <select value={discountForm.coverageMode} onChange={(e) => setDiscountForm((prev) => ({ ...prev, coverageMode: e.target.value }))}>
                  <option value="fixed">مبلغ ثابت</option>
                  <option value="percent">درصدی</option>
                  <option value="full">صد درصد / کامل</option>
                </select>
              </label>
            </div>
            {discountForm.targetScope === 'student' && <label className="finance-inline-filter finance-inline-filter-wide">
              <span>جستجوی متعلم</span>
              <input
                value={discountStudentSearch}
                onChange={(e) => setDiscountStudentSearch(e.target.value)}
                placeholder="نام، ایمیل یا نمبر اساس شاگرد"
              />
            </label>}
            {discountForm.targetScope === 'student' && highlightedDiscountStudentOptions.length > 0 && (
              <div className="finance-student-search-results" data-testid="discount-student-search-results">
                {highlightedDiscountStudentOptions.map((student) => {
                  const selected = String(student?._id || '') === String(discountForm.studentId || '');
                  return (
                    <button
                      key={`discount-student-card-${student.membershipId || student._id}`}
                      type="button"
                      className={`finance-student-result ${selected ? 'is-selected' : ''}`}
                      onClick={() => applyDiscountMembershipStudent(student._id)}
                      data-testid={`discount-student-result-${student._id}`}
                    >
                      <span>
                        <strong>{student.name || student.fullName || 'متعلم'}</strong>
                        <small className="finance-student-identity-grid">
                          {getFinanceStudentIdentityRows(student).map(([label, value]) => (
                            <span key={`discount-student-${student.membershipId || student._id}-${label}`}>
                              <b>{label}:</b> {value}
                            </span>
                          ))}
                        </small>
                      </span>
                      <span className="finance-chip finance-chip-muted">{selected ? 'انتخاب شده' : 'انتخاب'}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {discountForm.targetScope === 'student' && hasDiscountStudentSearchTerm && !highlightedDiscountStudentOptions.length && (
              <p className="muted finance-order-empty">برای این جستجو متعلم فعال در دفتر ممبرشیپ پیدا نشد.</p>
            )}
            {discountForm.targetScope === 'student' && <select value={discountForm.studentId} onChange={(e) => applyDiscountMembershipStudent(e.target.value)}>
              <option value="">متعلم را انتخاب کنید</option>
              {discountStudentOptions.length ? discountStudentOptions.map((student) => (
                <option key={`discount-student-${student.membershipId || student._id}`} value={student._id}>{getFinanceStudentOptionLabel(student)}</option>
              )) : (
                <option value="">متعلمی پیدا نشد</option>
              )}
            </select>}
            <div className="finance-split-grid">
              <select value={discountForm.classId} disabled={discountForm.targetScope === 'student'} onChange={(e) => setDiscountForm((prev) => {
                const next = { ...prev, classId: e.target.value };
                return { ...next, studentMembershipId: findFinanceMembershipId(next) };
              })}>
                {discountForm.targetScope === 'student' && !discountForm.classId ? <option value="">صنف اتوماتیک</option> : null}
                {classOptions.map((item) => <option key={`discount-class-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>)}
              </select>
              <select value={discountForm.academicYearId} disabled={discountForm.targetScope === 'student'} onChange={(e) => setDiscountForm((prev) => {
                const next = { ...prev, academicYearId: e.target.value };
                return { ...next, studentMembershipId: findFinanceMembershipId(next) };
              })}>
                {discountForm.targetScope === 'student' && !discountForm.academicYearId ? <option value="">سال اتوماتیک</option> : null}
                {academicYears.map((item) => <option key={`discount-year-${item.id}`} value={item.id}>{getAcademicYearOptionLabel(item)}</option>)}
              </select>
            </div>
            <div className="finance-split-grid">
              <select value={discountForm.discountType} onChange={(e) => setDiscountForm((prev) => ({ ...prev, discountType: e.target.value }))}>
                {Object.entries(DISCOUNT_TYPE_UI_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {discountForm.coverageMode === 'full' ? (
                <div className="finance-readonly-field">100% تخفیف فقط روی فیس/شهریه</div>
              ) : discountForm.coverageMode === 'fixed' ? (
                <input type="number" min="0" value={discountForm.amount} onChange={(e) => setDiscountForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="مبلغ تخفیف" required />
              ) : (
                <input type="number" min="1" max="100" value={discountForm.percentage} onChange={(e) => setDiscountForm((prev) => ({ ...prev, percentage: e.target.value }))} placeholder="درصد تخفیف" required />
              )}
            </div>
            <select
              value={discountForm.durationMode}
              onChange={(e) => setDiscountForm((prev) => ({
                ...prev,
                durationMode: e.target.value,
                startDate: e.target.value === 'custom_period' ? prev.startDate : '',
                endDate: e.target.value === 'custom_period' ? prev.endDate : ''
              }))}
            >
              <option value="academic_year">تا ختم سال تعلیمی</option>
              <option value="custom_period">دوره مشخص</option>
            </select>
            {discountForm.durationMode === 'custom_period' && (
              <div className="finance-split-grid">
                <AfghanDateInput
                  value={discountForm.startDate}
                  onChange={(value) => setDiscountForm((prev) => ({ ...prev, startDate: value }))}
                  showGregorianEquivalent
                  required
                />
                <AfghanDateInput
                  value={discountForm.endDate}
                  onChange={(value) => setDiscountForm((prev) => ({ ...prev, endDate: value }))}
                  showGregorianEquivalent
                  required
                />
              </div>
            )}
            <textarea value={discountForm.reason} onChange={(e) => setDiscountForm((prev) => ({ ...prev, reason: e.target.value }))} rows={3} placeholder="دلیل تخفیف، معافیت یا تعدیل" />
            <button type="submit" disabled={busy} data-testid="save-discount-registry">ثبت تخفیف</button>
          </form>
        )}

        {reliefFormMode === 'exemption' && (
          <form className="finance-card finance-relief-entry-form" data-finance-section="discounts" onSubmit={saveExemptionRegistry} data-testid="exemption-registry-form">
            <div className="finance-card-head">
              <div>
                <h3>متعلمین رایگان / معاف</h3>
                <p className="muted">معافیت کامل یا جزئی را به‌صورت وابسته به عضویت ثبت کنید تا بعداً هم قابل لغو باشد.</p>
              </div>
              <span className="finance-chip finance-chip-emerald">{exemptions.length} فعال</span>
            </div>
            <label className="finance-inline-filter finance-inline-filter-wide">
              <span>جستجوی متعلم</span>
              <input
                value={exemptionStudentSearch}
                onChange={(e) => setExemptionStudentSearch(e.target.value)}
                placeholder="نام، ایمیل یا نمبر اساس شاگرد"
              />
            </label>
            <select value={exemptionForm.studentId} onChange={(e) => applyExemptionMembershipStudent(e.target.value)} required>
              <option value="">متعلم را انتخاب کنید</option>
              {exemptionStudentOptions.length ? exemptionStudentOptions.map((student) => (
                <option key={`exemption-student-${student.membershipId || student._id}`} value={student._id}>{getFinanceStudentOptionLabel(student)}</option>
              )) : (
                <option value="">متعلمی پیدا نشد</option>
              )}
            </select>
            <div className="finance-split-grid">
              <select value={exemptionForm.classId} onChange={(e) => setExemptionForm((prev) => {
                const next = { ...prev, classId: e.target.value };
                return { ...next, studentMembershipId: findFinanceMembershipId(next) };
              })}>
                {classOptions.map((item) => <option key={`exemption-class-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>)}
              </select>
              <select value={exemptionForm.academicYearId} onChange={(e) => setExemptionForm((prev) => {
                const next = { ...prev, academicYearId: e.target.value };
                return { ...next, studentMembershipId: findFinanceMembershipId(next) };
              })}>
                {academicYears.map((item) => <option key={`exemption-year-${item.id}`} value={item.id}>{getAcademicYearOptionLabel(item)}</option>)}
              </select>
            </div>
            <div className="finance-split-grid">
              <select value={exemptionForm.exemptionType} onChange={(e) => setExemptionForm((prev) => ({ ...prev, exemptionType: e.target.value }))}>
                {Object.entries(EXEMPTION_TYPE_UI_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select value={exemptionForm.scope} onChange={(e) => setExemptionForm((prev) => ({ ...prev, scope: e.target.value }))}>
                {Object.entries(EXEMPTION_SCOPE_UI_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="finance-split-grid">
              <input
                value={exemptionForm.amount}
                onChange={(e) => setExemptionForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="مبلغ معافیت جزئی"
                disabled={exemptionForm.exemptionType !== 'partial'}
              />
              <input
                value={exemptionForm.percentage}
                onChange={(e) => setExemptionForm((prev) => ({ ...prev, percentage: e.target.value }))}
                placeholder="درصد معافیت جزئی"
                disabled={exemptionForm.exemptionType !== 'partial'}
              />
            </div>
            <textarea value={exemptionForm.reason} onChange={(e) => setExemptionForm((prev) => ({ ...prev, reason: e.target.value }))} rows={2} placeholder="دلیل معافیت" />
            <textarea value={exemptionForm.note} onChange={(e) => setExemptionForm((prev) => ({ ...prev, note: e.target.value }))} rows={2} placeholder="ملاحظات اداری / حمایوی" />
            <button type="submit" disabled={busy} data-testid="save-exemption-registry">ثبت معافیت</button>
          </form>
        )}
          </div>

          <aside className="finance-card finance-spotlight-card finance-relief-profile-pane" data-finance-section="discounts" data-testid="relief-student-spotlight">
            <div className="finance-card-head">
              <div>
                <h3>پروفایل مالی متعلم</h3>
                <p className="muted">هم‌زمان با ثبت تخفیف یا معافیت، سوابق و اثر تصمیم مالی را بررسی کنید.</p>
              </div>
              <div className="finance-chip-group">
                <span className="finance-chip finance-chip-emerald">{getStudentDisplayName(reliefFocusStudent)}</span>
                <span className="finance-chip">{reliefFormMode === 'discount' ? 'فورم تخفیف' : 'فورم معافیت'}</span>
              </div>
            </div>
            <div className="finance-chip-group">
              <span className="finance-chip">{reliefFocusClass?.title || 'صنف'}</span>
              <span className="finance-chip finance-chip-muted">{reliefFocusAcademicYear?.title || 'سال تعلیمی'}</span>
              <span className="finance-chip finance-chip-emerald">{reliefFocusSnapshot.reliefCount} تسهیل در همین دامنه</span>
            </div>
            <label className="finance-inline-filter">
              <span>نمایش تسهیلات</span>
              <select value={reliefFocusPageSize} onChange={(e) => setReliefFocusPageSize(Number(e.target.value) || 5)}>
                <option value={3}>3 مورد</option>
                <option value={5}>5 مورد</option>
                <option value={10}>10 مورد</option>
              </select>
            </label>
            <div className="finance-kpi-grid finance-kpi-grid-dense">
              <div className="finance-kpi-item">
                <span>اصل {reliefFocusFeeScope === 'all' ? 'تعهدات' : (FEE_LINE_TYPE_LABELS[reliefFocusFeeScope] || 'تعهد')}</span>
                <strong>{fmt(reliefFocusLedgerSnapshot.due)} AFN</strong>
              </div>
              <div className="finance-kpi-item">
                <span>پرداخت {reliefFocusFeeScope === 'all' ? 'تعهدات' : (FEE_LINE_TYPE_LABELS[reliefFocusFeeScope] || 'تعهد')}</span>
                <strong>{fmt(reliefFocusLedgerSnapshot.paid)} AFN</strong>
              </div>
              <div className="finance-kpi-item finance-kpi-item-accent">
                <span>باقی {reliefFocusFeeScope === 'all' ? 'تعهدات' : (FEE_LINE_TYPE_LABELS[reliefFocusFeeScope] || 'تعهد')}</span>
                <strong>{fmt(reliefFocusLedgerSnapshot.outstanding)} AFN</strong>
              </div>
              <div className="finance-kpi-item">
                <span>تسهیلات مبلغی</span>
                <strong>{fmt(reliefFocusSnapshot.fixedReliefAmount)} AFN</strong>
              </div>
            </div>
            <div className="finance-subcard-list">
              <div className="mini-row">
                <span>فیس/شهریه</span>
                <span>پرداخت {fmt(reliefFocusSnapshot.byFeeType?.tuition?.paid || 0)} | باقی {fmt(reliefFocusSnapshot.byFeeType?.tuition?.outstanding || 0)} AFN</span>
              </div>
              <div className="mini-row">
                <span>داخله</span>
                <span>پرداخت {fmt(reliefFocusSnapshot.byFeeType?.admission?.paid || 0)} | باقی {fmt(reliefFocusSnapshot.byFeeType?.admission?.outstanding || 0)} AFN</span>
              </div>
              <div className="mini-row">
                <span>بدهی‌های باز</span>
                <span>{reliefFocusSnapshot.openOrders}</span>
              </div>
              <div className="mini-row">
                <span>پوشش کامل / درصدی</span>
                <span>{reliefFocusSnapshot.fullReliefCount} / {reliefFocusSnapshot.percentReliefCount}</span>
              </div>
              <div className="mini-row">
                <span>نزدیک‌ترین مهلت پرداخت</span>
                <span>{reliefFocusSnapshot.nextDueOrder?.dueDate ? toFaDate(reliefFocusSnapshot.nextDueOrder.dueDate) : '-'}</span>
              </div>
              {pagedReliefFocusItems.map((item) => (
                <div key={`focus-relief-${item.id}`} className="mini-row">
                  <span>{RELIEF_TYPE_UI_LABELS[item.reliefType] || item.reliefType || 'تسهیل'}</span>
                  <span>{getReliefValueLabel(item)}</span>
                </div>
              ))}
              {!reliefFocusSnapshot.scopedReliefs.length && (
                <div className="mini-row">
                  <span>تسهیلات فعال</span>
                  <span className="finance-chip finance-chip-muted">0 مورد</span>
                </div>
              )}
              {reliefFocusSnapshot.scopedReliefs.length > reliefFocusPageSize && (
                <div className="finance-pagination">
                  <button type="button" className="secondary" disabled={reliefFocusPage <= 1} onClick={() => setReliefFocusPage((value) => Math.max(1, value - 1))}>قبلی</button>
                  <span>صفحه {reliefFocusPage} از {reliefFocusTotalPages}</span>
                  <button type="button" className="secondary" disabled={reliefFocusPage >= reliefFocusTotalPages} onClick={() => setReliefFocusPage((value) => Math.min(reliefFocusTotalPages, value + 1))}>بعدی</button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      <div className="finance-grid" data-finance-section="discounts">
        <div className="finance-card finance-spotlight-card" data-finance-section="discounts" data-testid="relief-registry-hub">
          <div className="finance-card-head">
            <div>
              <h3>همه تسهیلات مالی</h3>
              <p className="muted">نمای مشترک تخفیف، معافیت، بورسیه، شاگردان رایگان و حمایت خیریه؛ این لیست فقط مخصوص تخفیف نیست.</p>
            </div>
            <div className="finance-chip-group">
              <span className="finance-chip">{filteredReliefRegistry.length} مورد</span>
              <span className="finance-chip finance-chip-emerald">{activeFinanceReliefCount} فعال</span>
              <span className="finance-chip finance-chip-muted">{fmt(reliefRegistrySummary.fixedAmount)} AFN مبلغی</span>
            </div>
          </div>
          <div className="finance-summary finance-summary-compact">
            <div><span>پوشش کامل</span><strong>{reliefRegistrySummary.fullCount}</strong></div>
            <div><span>درصدی</span><strong>{reliefRegistrySummary.percentCount}</strong></div>
            <div><span>تخفیف و تعدیل</span><strong>{reliefRegistrySummary.discountCount}</strong></div>
            <div><span>معافیت و بورسیه</span><strong>{reliefRegistrySummary.exemptionCount}</strong></div>
          </div>
          <div className="finance-inline-controls">
            <label className="finance-inline-filter finance-inline-filter-wide">
              <span>جستجو در رجیستر</span>
              <input
                value={reliefRegistrySearch}
                onChange={(e) => setReliefRegistrySearch(e.target.value)}
                placeholder="نام یا نمبر اساس متعلم، صنف، سال، دلیل، نوع یا دامنه"
              />
            </label>
            <label className="finance-inline-filter">
              <span>نوع تسهیل</span>
              <select value={reliefRegistryTypeFilter} onChange={(e) => setReliefRegistryTypeFilter(e.target.value)}>
                <option value="all">همه</option>
                {reliefRegistryTypeOptions.map((value) => (
                  <option key={`relief-type-${value}`} value={value}>
                    {RELIEF_TYPE_UI_LABELS[value] || value}
                  </option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>تعداد در صفحه</span>
              <select value={reliefRegistryPageSize} onChange={(e) => setReliefRegistryPageSize(Number(e.target.value) || 10)}>
                <option value={5}>5 مورد</option>
                <option value={10}>10 مورد</option>
                <option value={20}>20 مورد</option>
                <option value={50}>50 مورد</option>
              </select>
            </label>
          </div>
          <div className="finance-registry-list">
            {pagedReliefRegistry.map((item) => {
              const sourceEntityId = getReliefSourceEntityId(item);
              const canCancel = !!sourceEntityId && (item.sourceModel === 'discount' || item.sourceModel === 'fee_exemption');
              return (
                <div key={`relief-row-${item.id}`} className="finance-registry-row">
                  <div>
                    <strong>{item.student?.fullName || item.student?.name || 'متعلم'}</strong>
                    <span>{item.schoolClass?.title || 'صنف'} - {item.academicYear?.title || 'سال'}</span>
                    <small>
                      {RELIEF_TYPE_UI_LABELS[item.reliefType] || item.reliefType || 'تسهیل'}
                      {' · '}
                      {(EXEMPTION_SCOPE_UI_LABELS[item.scope] || item.scope || 'همه موارد')}
                      {' · '}
                      {RELIEF_COVERAGE_MODE_UI_LABELS[item.coverageMode] || item.coverageMode || 'پوشش'}
                      {item.reason ? ` · ${item.reason}` : ''}
                    </small>
                  </div>
                  <div className="finance-registry-meta">
                    <span className={`finance-chip ${item.coverageMode === 'full' ? 'finance-chip-emerald' : item.reliefType === 'penalty' ? 'finance-chip-rose' : ''}`}>
                      {item.sourceModel === 'discount' ? 'تخفیف' : item.sourceModel === 'fee_exemption' ? 'معافیت' : 'سیستمی'}
                    </span>
                    <strong>{getReliefValueLabel(item)}</strong>
                  </div>
                  <div className="row-actions">
                    {canCancel ? (
                      <button type="button" className="danger" disabled={busy} onClick={() => cancelReliefRegistryItem(item)}>
                        لغو
                      </button>
                    ) : (
                      <button type="button" className="secondary" disabled>
                        فقط نمایش
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!filteredReliefRegistry.length && <p className="muted">برای این جستجو یا فیلتر، تسهیل مالی فعالی پیدا نشد.</p>}
            {filteredReliefRegistry.length > reliefRegistryPageSize && (
              <div className="finance-pagination">
                <button type="button" className="secondary" disabled={reliefRegistryPage <= 1} onClick={() => setReliefRegistryPage((value) => Math.max(1, value - 1))}>قبلی</button>
                <span>صفحه {reliefRegistryPage} از {reliefRegistryTotalPages}</span>
                <button type="button" className="secondary" disabled={reliefRegistryPage >= reliefRegistryTotalPages} onClick={() => setReliefRegistryPage((value) => Math.min(reliefRegistryTotalPages, value + 1))}>بعدی</button>
              </div>
            )}
          </div>
        </div>

        <div className="finance-card" data-finance-section="discounts" data-testid="discount-registry-list">
          <div className="finance-card-head">
            <div>
              <h3>فقط تخفیف‌های ثبت‌شده</h3>
              <p className="muted">فقط رکوردهای تخفیف مستقیم را نشان می‌دهد؛ معافیت، رایگان، بورسیه و حمایت خیریه در لیست همه تسهیلات مالی دیده می‌شوند.</p>
            </div>
            <div className="finance-chip-group">
              <span className="finance-chip">{filteredDiscountRegistry.length} مورد</span>
              <span className="finance-chip finance-chip-muted">{fmt(filteredDiscountRegistry.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))} AFN</span>
            </div>
          </div>
          <label className="finance-inline-filter finance-inline-filter-wide">
            <span>جستجو در تخفیف‌های ثبت‌شده</span>
            <input
              value={discountRegistrySearch}
              onChange={(e) => setDiscountRegistrySearch(e.target.value)}
              placeholder="نام یا نمبر اساس متعلم، صنف، سال، دلیل یا نوع تخفیف"
            />
          </label>
          <div className="finance-split-grid">
            <label className="finance-field">
              <span>نمایش بر اساس صنف</span>
              <select value={discountRegistryClassFilter} onChange={(e) => setDiscountRegistryClassFilter(e.target.value)}>
                <option value="all">همه صنف‌ها</option>
                {classOptions.map((item) => (
                  <option key={`discount-registry-class-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>
                ))}
              </select>
            </label>
            <label className="finance-field">
              <span>تعداد در هر صفحه</span>
              <select value={discountRegistryPageSize} onChange={(e) => setDiscountRegistryPageSize(Number(e.target.value) || 10)}>
                <option value={5}>5 مورد</option>
                <option value={10}>10 مورد</option>
                <option value={20}>20 مورد</option>
                <option value={50}>50 مورد</option>
              </select>
            </label>
          </div>
          <div className="finance-anomaly-alert" data-testid="discount-duplicate-alert">
            {(Number(discountDuplicateSummary?.duplicateRecords || 0)
              + Number(discountDuplicateSummary?.mirroredDiscountRecords || 0)
              + Number(discountDuplicateSummary?.mirroredActiveReliefs || 0)) > 0 ? (
              <div>
                <strong>{fmt(discountDuplicateSummary.duplicateRecords)} تکرار مستقیم و {fmt(discountDuplicateSummary.mirroredDiscountRecords)} تصویر بل پیدا شد</strong>
                <p className="muted">
                  رکورد اصلی و سابقه مالی حفظ می‌شود؛ تصاویر <code>Relief (tuition)</code> از رجیستر مستقیم جدا و محاسبه بل‌های مرتبط بازسازی می‌گردد.
                </p>
              </div>
            ) : (
              <div>
                <strong>بررسی و رفع تکرارهای تخفیف</strong>
                <p className="muted">اگر تعداد رکوردهای فعال از شاگردان دارای تخفیف بیشتر است، بررسی را اجرا کنید.</p>
              </div>
            )}
            <button type="button" className="danger" disabled={busy} onClick={repairDuplicateDiscountRegistry}>
              بررسی، رفع تکرارها و اصلاح بل‌ها
            </button>
          </div>
          {!!discountRegistryByClass.length && (
            <div className="finance-class-discount-summary">
              {discountRegistryByClass.slice(0, 8).map((item) => (
                <button
                  type="button"
                  key={`discount-class-summary-${item.classId}`}
                  className={`finance-class-discount-card ${discountRegistryClassFilter === item.classId ? 'is-active' : ''}`}
                  onClick={() => setDiscountRegistryClassFilter(item.classId)}
                >
                  <span>{item.classTitle}</span>
                  <strong>{fmt(item.classStudentCount)} شاگرد در صنف</strong>
                  <small>{fmt(item.discountStudentCount)} شاگرد دارای تخفیف | {fmt(item.count)} رکورد فعال | {fmt(item.totalAmount)} AFN</small>
                </button>
              ))}
            </div>
          )}
          <div className="finance-registry-list">
            {pagedDiscountRegistry.map((item) => (
              <div key={item.id} className="finance-registry-row">
                <div>
                  <strong>{item.student?.fullName || item.student?.name || 'متعلم'}</strong>
                  <span>{item.schoolClass?.title || 'صنف'} - {item.academicYear?.title || 'سال'}</span>
                  <small>{item.reason || 'بدون توضیح'}</small>
                </div>
                <div className="finance-registry-meta">
                  <span className="finance-chip">{DISCOUNT_TYPE_UI_LABELS[item.discountType] || item.discountType || 'تخفیف'}</span>
                  <strong>{item.coverageMode === 'percent' ? `${fmt(item.percentage)}%` : `${fmt(item.amount)} AFN`}</strong>
                </div>
                <div className="row-actions">
                  <button type="button" className="danger" disabled={busy} onClick={() => cancelDiscountRegistry(item.id)} data-testid={`cancel-discount-${item.id}`}>لغو</button>
                </div>
              </div>
            ))}
            {!filteredDiscountRegistry.length && <p className="muted">برای این جستجو، تخفیفی پیدا نشد.</p>}
            {filteredDiscountRegistry.length > discountRegistryPageSize && (
              <div className="finance-pagination">
                <button type="button" className="secondary" disabled={discountRegistryPage <= 1} onClick={() => setDiscountRegistryPage((value) => Math.max(1, value - 1))}>قبلی</button>
                <span>صفحه {discountRegistryPage} از {discountRegistryTotalPages}</span>
                <button type="button" className="secondary" disabled={discountRegistryPage >= discountRegistryTotalPages} onClick={() => setDiscountRegistryPage((value) => Math.min(discountRegistryTotalPages, value + 1))}>بعدی</button>
              </div>
            )}
          </div>
        </div>

        <div className="finance-card" data-finance-section="discounts" data-testid="exemption-registry-list">
          <div className="finance-card-head">
            <div>
              <h3>رجیستر متعلمین رایگان</h3>
              <p className="muted">لیست معافیت‌های کامل و جزئی، همراه با دامنه‌ی اثر و دلیل تصویب.</p>
            </div>
            <div className="finance-chip-group">
              <span className="finance-chip finance-chip-emerald">{filteredExemptionRegistry.length} مورد</span>
              <span className="finance-chip finance-chip-muted">{filteredExemptionRegistry.filter((item) => item.exemptionType === 'full').length} کامل</span>
            </div>
          </div>
          <label className="finance-inline-filter finance-inline-filter-wide">
            <span>جستجو در رجیستر معافیت‌ها</span>
            <input
              value={exemptionRegistrySearch}
              onChange={(e) => setExemptionRegistrySearch(e.target.value)}
              placeholder="نام یا نمبر اساس متعلم، صنف، سال، دلیل یا دامنه معافیت"
            />
          </label>
          <label className="finance-inline-filter">
            <span>تعداد در صفحه</span>
            <select value={exemptionRegistryPageSize} onChange={(e) => setExemptionRegistryPageSize(Number(e.target.value) || 10)}>
              <option value={5}>5 مورد</option>
              <option value={10}>10 مورد</option>
              <option value={20}>20 مورد</option>
              <option value={50}>50 مورد</option>
            </select>
          </label>
          <div className="finance-registry-list">
            {pagedExemptionRegistry.map((item) => (
              <div key={item.id} className="finance-registry-row">
                <div>
                  <strong>{item.student?.fullName || item.student?.name || 'متعلم'}</strong>
                  <span>{item.schoolClass?.title || 'صنف'} - {item.academicYear?.title || 'سال'}</span>
                  <small>{item.reason || 'بدون توضیح'} · {EXEMPTION_SCOPE_UI_LABELS[item.scope] || item.scope || 'همه موارد'}</small>
                </div>
                <div className="finance-registry-meta">
                  <span className="finance-chip finance-chip-emerald">{EXEMPTION_TYPE_UI_LABELS[item.exemptionType] || item.exemptionType || 'معافیت'}</span>
                  <strong>{item.exemptionType === 'partial' ? `${fmt(item.amount)} AFN / ${fmt(item.percentage)}%` : '100%'}</strong>
                </div>
                <div className="row-actions">
                  <button type="button" className="danger" disabled={busy} onClick={() => cancelExemptionRegistry(item.id)} data-testid={`cancel-exemption-${item.id}`}>لغو</button>
                </div>
              </div>
            ))}
            {!filteredExemptionRegistry.length && <p className="muted">برای این جستجو، معافیتی پیدا نشد.</p>}
            {filteredExemptionRegistry.length > exemptionRegistryPageSize && (
              <div className="finance-pagination">
                <button type="button" className="secondary" disabled={exemptionRegistryPage <= 1} onClick={() => setExemptionRegistryPage((value) => Math.max(1, value - 1))}>قبلی</button>
                <span>صفحه {exemptionRegistryPage} از {exemptionRegistryTotalPages}</span>
                <button type="button" className="secondary" disabled={exemptionRegistryPage >= exemptionRegistryTotalPages} onClick={() => setExemptionRegistryPage((value) => Math.min(exemptionRegistryTotalPages, value + 1))}>بعدی</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="finance-actions" data-finance-section="reports settings">
        <Link className="finance-launch-link" to="/admin-government-finance">فرماندهی مالی دولت</Link>
        <label className="finance-inline-filter">
          <span>فیلتر گزارش</span>
          <select data-testid="report-class-filter" value={reportClassId} onChange={(e) => setReportClassId(e.target.value)}>
            <option value="">همه صنف‌ها</option>
            {classOptions.map((item) => <option key={`report-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>)}
          </select>
        </label>
        <button type="button" onClick={runReminders} disabled={busy}>اجرای یادآوری</button>
        <button type="button" onClick={exportCsv}>خروجی CSV</button>
        <button type="button" className="secondary" onClick={exportAuditPackageCsv} data-testid="export-audit-package">پکیج حسابرسی CSV</button>
        <div className="finance-cell-stack">
          <input value={monthKey} onChange={(e) => setMonthKey(e.target.value)} placeholder="YYYY-MM" />
          <small>{monthKey ? `هجری شمسی: ${toFaMonthKey(monthKey)}` : 'ماه مالی را به شکل YYYY-MM وارد کنید؛ نمایش رسمی به هجری شمسی نشان داده می‌شود.'}</small>
        </div>
        <button type="button" onClick={requestMonthClose} disabled={busy}>درخواست بستن ماه مالی</button>
      </div>

      <div className="finance-card finance-payment-tools-card" data-finance-section="payments" data-testid="payment-tools-card">
        <label className="finance-inline-filter finance-inline-filter-wide">
          <span>ابزارهای گروهی و ویژه</span>
          <select
            value={activePaymentTool}
            onChange={(e) => setActivePaymentTool(e.target.value)}
            data-testid="payment-tools-select"
          >
            <option value="">— انتخاب ابزار (بسته) —</option>
            {PAYMENT_TOOL_OPTIONS.map((item) => (
              <option key={`payment-tool-${item.value}`} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div id="pending-receipts" className="finance-card" data-finance-section="payments">
        <div className="finance-toolbar finance-receipts-filter-toolbar">
          <div className="finance-receipts-toolbar-intro">
            <h3>تمام رسیدهای پرداخت</h3>
            <p className="muted">رسیدهای در انتظار، تاییدشده و ردشده را همراه با فایل، مرحله و ردپای تایید بررسی کنید.</p>
          </div>
          <div className="finance-receipts-filter-row">
            <label className="finance-inline-filter">
              <span>جستجو در رسیدها</span>
              <input
                value={receiptSearchTerm}
                onChange={(e) => setReceiptSearchTerm(e.target.value)}
                placeholder="نام یا نمبر اساس شاگرد، شماره بل، مرجع یا روش پرداخت"
              />
            </label>
            <label className="finance-inline-filter">
              <span>فیلتر مرحله</span>
              <select value={receiptStageFilter} onChange={(e) => setReceiptStageFilter(e.target.value)}>
                <option value="all">همه مراحل</option>
                <option value="finance_manager_review">مدیر مالی</option>
                <option value="general_president_review">ریاست عمومی</option>
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>وضعیت</span>
              <select value={receiptStatusFilter} onChange={(e) => setReceiptStatusFilter(e.target.value)}>
                <option value="all">همه</option>
                <option value="pending">در انتظار</option>
                <option value="approved">تاییدشده</option>
                <option value="rejected">ردشده</option>
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>منبع</span>
              <select value={receiptSourceFilter} onChange={(e) => setReceiptSourceFilter(e.target.value)}>
                <option value="all">همه</option>
                <option value="legacy_receipt">رسید قدیمی</option>
                <option value="guardian_upload">ارسال ولی/متعلم</option>
                <option value="cashier_manual">ثبت صندوق</option>
                <option value="canonical_manual">پرداخت رسمی دستی</option>
                <option value="gateway">درگاه آنلاین</option>
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>پیگیری</span>
              <select value={receiptFollowUpFilter} onChange={(e) => setReceiptFollowUpFilter(e.target.value)}>
                <option value="all">همه</option>
                {FOLLOW_UP_STATUS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>سال تعلیمی</span>
              <select
                value={receiptAcademicYearFilter}
                onChange={(e) => setReceiptAcademicYearFilter(e.target.value)}
                data-testid="receipt-academic-year-filter"
              >
                <option value="all">همه سال‌ها</option>
                {academicYears.map((item) => (
                  <option key={`receipt-year-${item.id}`} value={item.id}>{getAcademicYearOptionLabel(item)}</option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>صنف</span>
              <select
                value={receiptClassFilter}
                onChange={(e) => setReceiptClassFilter(e.target.value)}
                data-testid="receipt-class-filter"
              >
                <option value="all">همه صنف‌ها</option>
                {classOptions.map((item) => (
                  <option key={`receipt-class-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {activePaymentTool === 'class_bulk_approval' && (
        <div className="class-payment-approval-panel" data-testid="class-payment-approval-panel">
          <div className="finance-card-head">
            <div>
              <h4>تأیید نهایی گروهی رسیدها بر اساس صنف</h4>
              <p className="muted">
                صنف و نوع رسید را انتخاب کنید. فقط رسیدهای در انتظارِ بل داخله و فیس/شهریه که در مرحله تأیید نهایی باشند نمایش داده و تأیید می‌شوند.
              </p>
            </div>
            <span className="finance-chip finance-chip-emerald" data-testid="class-payment-approval-count">
              {classPaymentApprovalPreview.loading
                ? 'در حال بررسی…'
                : `${fmt(classPaymentApprovalPreview.summary?.eligible || 0)} قابل تأیید`}
            </span>
          </div>
          <div className="receipt-follow-up-grid class-payment-approval-controls">
            <label className="finance-inline-filter">
              <span>صنف</span>
              <select
                value={classPaymentApprovalForm.classId}
                onChange={(e) => setClassPaymentApprovalForm((prev) => ({ ...prev, classId: e.target.value }))}
                data-testid="class-payment-approval-class"
              >
                <option value="">انتخاب صنف</option>
                {classOptions.map((item) => (
                  <option key={`class-payment-approval-${item.classId}`} value={item.classId}>
                    {getClassOptionLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>نوع رسید</span>
              <select
                value={classPaymentApprovalForm.feeType}
                onChange={(e) => setClassPaymentApprovalForm((prev) => ({ ...prev, feeType: e.target.value }))}
                data-testid="class-payment-approval-type"
              >
                <option value="all">داخله و فیس/شهریه</option>
                <option value="admission">فقط داخله</option>
                <option value="tuition">فقط فیس/شهریه</option>
              </select>
            </label>
            <label className="finance-inline-filter finance-inline-filter-wide">
              <span>یادداشت تأیید</span>
              <input
                value={classPaymentApprovalForm.note}
                onChange={(e) => setClassPaymentApprovalForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="مثلاً: تأیید نهایی رسیدهای صنف پس از بررسی"
                data-testid="class-payment-approval-note"
              />
            </label>
          </div>
          {classPaymentApprovalPreview.summary ? (
            <div className="finance-chip-group">
              <span className="finance-chip finance-chip-emerald">قابل تأیید: {fmt(classPaymentApprovalPreview.summary.eligible || 0)}</span>
              <span className="finance-chip">مجموع: {fmt(classPaymentApprovalPreview.summary.eligibleAmount || 0)} AFN</span>
              <span className="finance-chip">داخله: {fmt(classPaymentApprovalPreview.summary.admission?.count || 0)}</span>
              <span className="finance-chip">فیس/شهریه: {fmt(classPaymentApprovalPreview.summary.tuition?.count || 0)}</span>
              {!!classPaymentApprovalPreview.summary.mixed?.count && (
                <span className="finance-chip finance-chip-amber">رسید مشترک: {fmt(classPaymentApprovalPreview.summary.mixed.count)}</span>
              )}
              {!!classPaymentApprovalPreview.summary.blocked && (
                <span className="finance-chip finance-chip-rose">نیازمند بررسی دستی: {fmt(classPaymentApprovalPreview.summary.blocked)}</span>
              )}
            </div>
          ) : null}
          {classPaymentApprovalPreview.error ? (
            <p className="admission-batch-error">{classPaymentApprovalPreview.error}</p>
          ) : null}
          {!!classPaymentApprovalPreview.items.length && (
            <div className="class-payment-approval-list">
              {classPaymentApprovalPreview.items.slice(0, 12).map((item) => (
                <div className={`class-payment-approval-row ${item.eligible ? '' : 'blocked'}`} key={item.paymentId}>
                  <span className="finance-cell-stack">
                    <strong>{item.studentName || 'شاگرد'}</strong>
                    <small className="finance-latin-code">{formatFinanceCode(item.paymentNumber, '-')}</small>
                  </span>
                  <span>{item.category === 'admission' ? 'داخله' : item.category === 'tuition' ? 'فیس/شهریه' : 'داخله و فیس'}</span>
                  <span><strong>{fmt(item.amount)} {item.currency || 'AFN'}</strong></span>
                  <span className={item.eligible ? 'correction-ready' : 'correction-blocked'}>
                    {item.eligible ? 'آماده تأیید نهایی' : item.blockedReason}
                  </span>
                </div>
              ))}
              {classPaymentApprovalPreview.items.length > 12 ? (
                <p className="muted">و {fmt(classPaymentApprovalPreview.items.length - 12)} مورد دیگر…</p>
              ) : null}
            </div>
          )}
          <div className="row-actions">
            <button
              type="button"
              onClick={() => setClassPaymentApprovalRefreshKey((value) => value + 1)}
              disabled={busy || classPaymentApprovalPreview.loading || !classPaymentApprovalForm.classId}
              className="secondary"
            >
              تازه‌سازی پیش‌نمایش
            </button>
            <button
              type="button"
              onClick={applyClassPaymentApprovals}
              disabled={busy || classPaymentApprovalPreview.loading || !(classPaymentApprovalPreview.summary?.eligible > 0)}
              data-testid="class-payment-approval-submit"
            >
              تأیید نهایی رسیدهای این صنف
            </button>
          </div>
        </div>
        )}
        {activePaymentTool === 'admission_bulk_correction' && (
        <div className="admission-receipt-correction-panel" data-testid="admission-receipt-correction-panel">
          <div className="finance-card-head">
            <div>
              <h4>اصلاح گروهی مبلغ رسیدهای داخله</h4>
              <p className="muted">
                فقط رسیدهای داخلهٔ در انتظار که مبلغ‌شان با پلان فعلی صنف برابر نیست بررسی می‌شوند. سند قبلی حذف نمی‌شود؛ رد و با سند صحیح جایگزین می‌گردد.
              </p>
            </div>
            <span className="finance-chip finance-chip-amber" data-testid="admission-receipt-correction-count">
              {admissionReceiptCorrectionPreview.loading
                ? 'در حال بررسی…'
                : `${admissionReceiptCorrectionPreview.summary?.eligible || 0} قابل اصلاح`}
            </span>
          </div>
          <div className="receipt-follow-up-grid admission-receipt-correction-controls">
            <label className="finance-inline-filter">
              <span>صنف</span>
              <select
                value={admissionReceiptCorrectionForm.classId}
                onChange={(e) => setAdmissionReceiptCorrectionForm((prev) => ({ ...prev, classId: e.target.value }))}
                data-testid="admission-receipt-correction-class"
              >
                <option value="">انتخاب صنف</option>
                {classOptions.map((item) => (
                  <option key={`admission-receipt-correction-${item.classId}`} value={item.classId}>
                    {getClassOptionLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter finance-inline-filter-wide">
              <span>یادداشت اصلاح</span>
              <input
                value={admissionReceiptCorrectionForm.note}
                onChange={(e) => setAdmissionReceiptCorrectionForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="مثلاً: مبلغ پلان داخله اصلاح شد"
                data-testid="admission-receipt-correction-note"
              />
            </label>
          </div>
          {admissionReceiptCorrectionPreview.summary ? (
            <div className="finance-chip-group">
              <span className="finance-chip">رسیدهای داخله در انتظار: {fmt(admissionReceiptCorrectionPreview.summary.totalPendingAdmission || 0)}</span>
              <span className="finance-chip finance-chip-amber">نیازمند اصلاح: {fmt(admissionReceiptCorrectionPreview.summary.correctionRequired || 0)}</span>
              <span className="finance-chip finance-chip-emerald">قابل اصلاح: {fmt(admissionReceiptCorrectionPreview.summary.eligible || 0)}</span>
              <span className="finance-chip finance-chip-muted">از قبل صحیح: {fmt(admissionReceiptCorrectionPreview.summary.alreadyCorrect || 0)}</span>
              {!!admissionReceiptCorrectionPreview.summary.blocked && (
                <span className="finance-chip finance-chip-rose">نیازمند بررسی دستی: {fmt(admissionReceiptCorrectionPreview.summary.blocked)}</span>
              )}
            </div>
          ) : null}
          {admissionReceiptCorrectionPreview.error ? (
            <p className="admission-batch-error">{admissionReceiptCorrectionPreview.error}</p>
          ) : null}
          {!!admissionReceiptCorrectionPreview.items.length && (
            <div className="admission-receipt-correction-list">
              {admissionReceiptCorrectionPreview.items.slice(0, 12).map((item) => (
                <div className={`admission-receipt-correction-row ${item.eligible ? '' : 'blocked'}`} key={item.paymentId}>
                  <span className="finance-cell-stack">
                    <strong>{item.studentName || 'شاگرد'}</strong>
                    <small className="finance-latin-code">{formatFinanceCode(item.paymentNumber, '-')}</small>
                  </span>
                  <span>فعلی: <strong>{fmt(item.currentPaymentAmount)} AFN</strong></span>
                  <span>پلان: <strong>{fmt(item.plannedAmount)} AFN</strong></span>
                  <span className={item.eligible ? 'correction-ready' : 'correction-blocked'}>
                    {item.eligible ? `اختلاف: ${fmt(Math.abs(toSafeNumber(item.plannedAmount) - toSafeNumber(item.currentPaymentAmount)))} AFN` : item.blockedReason}
                  </span>
                </div>
              ))}
              {admissionReceiptCorrectionPreview.items.length > 12 ? (
                <p className="muted">و {fmt(admissionReceiptCorrectionPreview.items.length - 12)} مورد دیگر…</p>
              ) : null}
            </div>
          )}
          <div className="row-actions">
            <button
              type="button"
              onClick={() => setAdmissionReceiptCorrectionRefreshKey((value) => value + 1)}
              disabled={busy || admissionReceiptCorrectionPreview.loading || !admissionReceiptCorrectionForm.classId}
              className="secondary"
            >
              تازه‌سازی پیش‌نمایش
            </button>
            <button
              type="button"
              onClick={applyAdmissionReceiptCorrections}
              disabled={busy || admissionReceiptCorrectionPreview.loading || !(admissionReceiptCorrectionPreview.summary?.eligible > 0)}
              data-testid="admission-receipt-correction-submit"
            >
              اصلاح و صدور رسیدهای جایگزین
            </button>
          </div>
        </div>
        )}
        {activePaymentTool === 'payment_scope_repair' && (
        <div className="admission-receipt-correction-panel" data-testid="payment-scope-repair-panel">
          <div className="finance-card-head">
            <div>
              <h4>ترمیم تفکیک پرداخت فیس و داخله</h4>
              <p className="muted">
                پرداخت‌های قبلی را بررسی می‌کند و فقط انتساب آن‌ها به فیس یا داخله را بازسازی می‌کند. مبلغ صندوق، شماره رسید و مجموع پول دریافت‌شده تغییر نمی‌کند.
              </p>
            </div>
            <span className="finance-chip finance-chip-amber" data-testid="payment-scope-repair-count">
              {paymentScopeRepairPreview.loading
                ? 'در حال بررسی…'
                : `${paymentScopeRepairPreview.summary?.repairable || 0} قابل ترمیم`}
            </span>
          </div>
          <div className="receipt-follow-up-grid admission-receipt-correction-controls">
            <label className="finance-inline-filter">
              <span>صنف</span>
              <select
                value={paymentScopeRepairForm.classId}
                onChange={(e) => setPaymentScopeRepairForm((prev) => ({ ...prev, classId: e.target.value }))}
                data-testid="payment-scope-repair-class"
              >
                <option value="">انتخاب صنف</option>
                {classOptions.map((item) => (
                  <option key={`payment-scope-repair-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter finance-inline-filter-wide">
              <span>یادداشت ترمیم</span>
              <input
                value={paymentScopeRepairForm.note}
                onChange={(e) => setPaymentScopeRepairForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="مثلاً: تفکیک پرداخت‌های داخله رفع ناهنجاری"
                data-testid="payment-scope-repair-note"
              />
            </label>
          </div>
          {paymentScopeRepairPreview.summary ? (
            <div className="finance-chip-group">
              <span className="finance-chip">بررسی‌شده: {fmt(paymentScopeRepairPreview.summary.payments || 0)}</span>
              <span className="finance-chip finance-chip-emerald">قابل ترمیم: {fmt(paymentScopeRepairPreview.summary.repairable || 0)}</span>
              <span className="finance-chip finance-chip-muted">از قبل تفکیک‌شده: {fmt(paymentScopeRepairPreview.summary.alreadyTyped || 0)}</span>
              {!!paymentScopeRepairPreview.summary.blocked && (
                <span className="finance-chip finance-chip-rose">نیازمند بررسی دستی: {fmt(paymentScopeRepairPreview.summary.blocked)}</span>
              )}
              <span className="finance-chip finance-chip-amber">مبلغ قابل ترمیم: {fmt(paymentScopeRepairPreview.summary.amount || 0)} AFN</span>
            </div>
          ) : null}
          {paymentScopeRepairPreview.error ? <p className="admission-batch-error">{paymentScopeRepairPreview.error}</p> : null}
          {!!paymentScopeRepairPreview.items.length && (
            <div className="admission-receipt-correction-list">
              {paymentScopeRepairPreview.items.filter((item) => item.repairable || item.blocked).slice(0, 12).map((item) => (
                <div className={`admission-receipt-correction-row ${item.repairable ? '' : 'blocked'}`} key={`scope-repair-${item.paymentId}`}>
                  <span className="finance-cell-stack">
                    <strong>{item.studentName || 'متعلم'}</strong>
                    <small className="finance-latin-code">{formatFinanceCode(item.paymentNumber, '-')}</small>
                  </span>
                  <span>مبلغ: <strong>{fmt(item.amount)} AFN</strong></span>
                  <span>{item.allocations.map((allocation) => FEE_LINE_TYPE_LABELS[allocation.proposedFeeType] || allocation.proposedFeeType || 'نامشخص').join(' + ')}</span>
                  <span className={item.repairable ? 'correction-ready' : 'correction-blocked'}>
                    {item.repairable ? 'آماده ترمیم امن' : 'بل مرکب مبهم؛ بررسی دستی لازم است'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="row-actions">
            <button
              type="button"
              onClick={() => setPaymentScopeRepairRefreshKey((value) => value + 1)}
              disabled={busy || paymentScopeRepairPreview.loading || !paymentScopeRepairForm.classId}
              className="secondary"
            >
              تازه‌سازی پیش‌نمایش
            </button>
            <button
              type="button"
              onClick={applyPaymentScopeRepair}
              disabled={busy || paymentScopeRepairPreview.loading || !(paymentScopeRepairPreview.summary?.repairable > 0)}
              data-testid="payment-scope-repair-submit"
            >
              ترمیم انتساب پرداخت‌ها
            </button>
          </div>
        </div>
        )}
        <div className="finance-chip-group receipt-inbox-summary">
          <span className="finance-chip">کل: {receiptInboxSummary.total}</span>
          <span className="finance-chip finance-chip-emerald">در انتظار: {receiptInboxSummary.pending}</span>
          <span className="finance-chip">تاییدشده: {receiptInboxSummary.approved}</span>
          <span className="finance-chip finance-chip-rose">ردشده: {receiptInboxSummary.rejected}</span>
          <span className="finance-chip finance-chip-muted">ارجاع‌شده: {receiptInboxSummary.escalated}</span>
        </div>
        {!financeDataErrors.payments && filteredReceipts.length ? (
          <div className="receipt-page-summary" data-testid="receipt-page-summary">
            نمایش {fmt(receiptPageStart)} تا {fmt(receiptPageEnd)} از {fmt(filteredReceipts.length)} رسید
          </div>
        ) : null}
        {financeDataErrors.payments ? (
          <div className="finance-data-error" role="alert">
            دریافت پرداخت‌ها و رسیدها ناموفق بود: {financeDataErrors.payments}
          </div>
        ) : null}
        {!financeDataErrors.payments && !filteredReceipts.length && <p className="muted">پرداختی با این فیلتر پیدا نشد.</p>}
        {!!filteredReceipts.length && (
          <div className="receipt-review-layout">
            <div className="finance-table receipts-table">
              <div className="head"><span>متعلم</span><span>سند / منبع</span><span>مبلغ</span><span>وضعیت</span><span>مرحله / پیگیری</span><span>عملیات</span></div>
              {paginatedReceipts.map((item) => {
                const stage = normalizeReceiptStage(item.approvalStage || '');
                const canReview = canReviewReceipt(item);
                return (
                  <div
                    key={item._id}
                    className={`row selectable-row ${selectedReceipt?._id === item._id ? 'selected' : ''}`}
                    onClick={() => setSelectedReceiptId(item._id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedReceiptId(item._id);
                      }
                    }}
                  >
                    <div className="receipt-cell-stack">
                      <strong>{item.student?.name || '---'}</strong>
                      <small className="finance-latin-code">{formatFinanceCode(item.paymentNumber || item._id, '-')}</small>
                    </div>
                    <div className="receipt-cell-stack">
                      <strong className="finance-latin-code">{formatFinanceCode(item.bill?.billNumber, '---')}</strong>
                      <span className="receipt-source-badge">{PAYMENT_SOURCE_UI_LABELS[item.sourceKey] || item.sourceKey || 'پرداخت'}</span>
                    </div>
                    <span>{fmt(item.amount)}</span>
                    <div className="receipt-cell-stack">
                      <span className={`receipt-status-badge ${String(item.status || '').trim() || 'pending'}`}>
                        {PAYMENT_STATUS_UI_LABELS[item.status] || item.status || '---'}
                      </span>
                      <small>{toFaDate(item.paidAt)}</small>
                    </div>
                    <div className="receipt-cell-stack">
                      <span className={`workflow-badge ${stage}`}>{RECEIPT_STAGE_UI_LABELS[stage] || stage}</span>
                      <small>{FOLLOW_UP_STATUS_LABELS[getReceiptFollowUpStatus(item)] || getReceiptFollowUpStatus(item)}</small>
                    </div>
                    <div className="row-actions">
                      <button type="button" onClick={(e) => { e.stopPropagation(); approveReceipt(item._id); }} disabled={busy || !canReview}>{getApproveLabel(item)}</button>
                      <button type="button" className="danger" onClick={(e) => { e.stopPropagation(); rejectReceipt(item._id); }} disabled={busy || !canReview}>رد</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedReceipt && (
              <aside className="receipt-inspector">
                <div className="receipt-inspector-head">
                  <div>
                    <strong>{selectedReceipt.student?.name || '---'}</strong>
                    <span className="finance-latin-code">{formatFinanceCode(selectedReceipt.bill?.billNumber, '---')}</span>
                  </div>
                  <span className={`workflow-badge ${normalizeReceiptStage(selectedReceipt.approvalStage || '')}`}>
                    {RECEIPT_STAGE_UI_LABELS[normalizeReceiptStage(selectedReceipt.approvalStage || '')] || selectedReceipt.approvalStage}
                  </span>
                </div>

                <div className="receipt-meta-grid">
                  <div><span>مبلغ</span><strong>{fmt(selectedReceipt.amount)} AFN</strong></div>
                  <div><span>تاریخ پرداخت</span><strong>{toFaDate(selectedReceipt.paidAt)}</strong></div>
                  <div><span>روش پرداخت</span><strong>{PAYMENT_METHOD_UI_LABELS[selectedReceipt.paymentMethod] || selectedReceipt.paymentMethod || '-'}</strong></div>
                  <div><span>مرجع</span><strong>{selectedReceipt.referenceNo || '-'}</strong></div>
                  <div><span>شماره پرداخت</span><strong className="finance-latin-code">{formatFinanceCode(selectedReceipt.paymentNumber || selectedReceipt._id, '-')}</strong></div>
                  <div><span>منبع</span><strong>{PAYMENT_SOURCE_UI_LABELS[selectedReceipt.sourceKey] || selectedReceipt.sourceKey || '-'}</strong></div>
                  <div><span>وضعیت بل</span><strong>{selectedReceipt.bill?.status || '-'}</strong></div>
                  <div><span>ثبت‌کننده</span><strong>{selectedReceipt.receivedBy?.name || 'ثبت سیستمی'}</strong></div>
                  <div><span>وضعیت پیگیری</span><strong>{FOLLOW_UP_STATUS_LABELS[getReceiptFollowUpStatus(selectedReceipt)] || getReceiptFollowUpStatus(selectedReceipt)}</strong></div>
                </div>

                <div className="receipt-inspector-actions">
                  {selectedReceipt.fileUrl ? (
                    <a className="receipt-file-link" href={toFileUrl(selectedReceipt.fileUrl)} target="_blank" rel="noreferrer">
                      نمایش فایل رسید
                    </a>
                  ) : (
                    <span className="muted">فایل رسید ثبت نشده است.</span>
                  )}
                  <button type="button" className="secondary" onClick={printSelectedReceipt} disabled={busy} data-testid="print-selected-receipt">
                    {busy ? 'در حال آماده‌سازی چاپ…' : 'چاپ رسید'}
                  </button>
                  <div className="row-actions">
                    <button type="button" onClick={() => approveReceipt(selectedReceipt._id)} disabled={busy || !canReviewReceipt(selectedReceipt)}>
                      {getApproveLabel(selectedReceipt)}
                    </button>
                    <button type="button" className="danger" onClick={() => rejectReceipt(selectedReceipt._id)} disabled={busy || !canReviewReceipt(selectedReceipt)}>
                      رد
                    </button>
                  </div>
                </div>

                {selectedReceipt.note ? (
                  <div className="receipt-note-box">
                    <span>یادداشت شاگرد</span>
                    <p>{selectedReceipt.note}</p>
                  </div>
                ) : null}

                {selectedReceipt.reviewNote ? (
                  <div className="receipt-note-box">
                    <span>یادداشت بررسی مالی</span>
                    <p>{selectedReceipt.reviewNote}</p>
                  </div>
                ) : null}

                {selectedReceipt.rejectReason ? (
                  <div className="receipt-note-box">
                    <span>دلیل رد</span>
                    <p>{selectedReceipt.rejectReason}</p>
                  </div>
                ) : null}

                {!!selectedReceipt.receiptDetails?.allocations?.length && (
                  <div className="receipt-note-box">
                    <span>تخصیص پرداخت روی بدهی‌ها</span>
                    <div className="trail-list">
                      {selectedReceipt.receiptDetails.allocations.map((allocation, index) => (
                        <div key={`${selectedReceipt._id}-allocation-${index}`} className="trail-item">
                          <div className="trail-item-head">
                            <strong>{allocation.title || formatFinanceCode(allocation.orderNumber, '') || 'بدهی'}</strong>
                            <span>{fmt(allocation.amount)} AFN</span>
                          </div>
                          <div className="trail-item-meta">
                            <span className="finance-latin-code">{formatFinanceCode(allocation.orderNumber, '-')}</span>
                            <span>باقی‌مانده: {fmt(allocation.outstandingAmount || 0)} AFN</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="receipt-note-box">
                  <span>پیگیری مورد</span>
                  <div className="receipt-follow-up-form">
                    <div className="receipt-follow-up-grid">
                      <label className="finance-inline-filter">
                        <span>ارجاع به</span>
                        <select
                          value={receiptFollowUpForm.assignedLevel}
                          onChange={(e) => setReceiptFollowUpForm((prev) => ({ ...prev, assignedLevel: e.target.value }))}
                        >
                          {FOLLOW_UP_LEVEL_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="finance-inline-filter">
                        <span>وضعیت پیگیری</span>
                        <select
                          value={receiptFollowUpForm.status}
                          onChange={(e) => setReceiptFollowUpForm((prev) => ({ ...prev, status: e.target.value }))}
                        >
                          {FOLLOW_UP_STATUS_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="finance-inline-filter finance-inline-filter-wide">
                      <span>یادداشت پیگیری</span>
                      <textarea
                        rows="3"
                        value={receiptFollowUpForm.note}
                        onChange={(e) => setReceiptFollowUpForm((prev) => ({ ...prev, note: e.target.value }))}
                        placeholder="خلاصه اقدام، ارجاع یا دلیل توقف را اینجا ثبت کنید"
                      />
                    </label>
                    <div className="receipt-follow-up-actions">
                      <button type="button" className="secondary" onClick={saveReceiptFollowUp} disabled={busy}>
                        ذخیره پیگیری
                      </button>
                      <span className="muted">
                        ارجاع فعلی: {FOLLOW_UP_LEVEL_LABELS[receiptFollowUpForm.assignedLevel] || receiptFollowUpForm.assignedLevel || '---'}
                      </span>
                    </div>
                  </div>
                  {!!selectedReceipt.followUp?.history?.length && (
                    <div className="trail-list">
                      {selectedReceipt.followUp.history.map((entry, index) => (
                        <div key={`${selectedReceipt._id}-follow-up-${index}`} className="trail-item">
                          <div className="trail-item-head">
                            <strong>{FOLLOW_UP_LEVEL_LABELS[entry.assignedLevel] || entry.assignedLevel || '---'}</strong>
                            <span>{FOLLOW_UP_STATUS_LABELS[entry.status] || entry.status || '---'}</span>
                          </div>
                          <div className="trail-item-meta">
                            <span>{entry.updatedBy?.name || 'ادمین'}</span>
                            <span>{toFaDate(entry.updatedAt)}</span>
                          </div>
                          {entry.note ? <p>{entry.note}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="receipt-trail">
                  <h4>سابقه تایید</h4>
                  {!selectedReceipt.approvalTrail?.length && <p className="muted">هنوز اقدامی روی این رسید ثبت نشده است.</p>}
                  {!!selectedReceipt.approvalTrail?.length && (
                    <div className="trail-list">
                      {selectedReceipt.approvalTrail.map((entry, index) => (
                        <div key={`${selectedReceipt._id}-trail-${index}`} className="trail-item">
                          <div className="trail-item-head">
                            <strong>{ADMIN_LEVEL_UI_LABELS[entry.level] || entry.level}</strong>
                            <span>{entry.action === 'reject' ? 'رد' : 'تایید'}</span>
                          </div>
                          <div className="trail-item-meta">
                            <span>{entry.by?.name || 'ادمین'}</span>
                            <span>{toFaDate(entry.at)}</span>
                          </div>
                          {entry.note ? <p>{entry.note}</p> : null}
                          {entry.reason ? <p>{entry.reason}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </aside>
            )}
          </div>
        )}
        {!financeDataErrors.payments && filteredReceipts.length ? (
          <div className="finance-pagination" data-testid="receipt-pagination">
            <button
              type="button"
              className="secondary"
              onClick={() => setReceiptPage((current) => Math.max(1, current - 1))}
              disabled={effectiveReceiptPage <= 1}
            >
              قبلی
            </button>
            <span>صفحه {fmt(effectiveReceiptPage)} از {fmt(receiptTotalPages)}</span>
            <button
              type="button"
              className="secondary"
              onClick={() => setReceiptPage((current) => Math.min(receiptTotalPages, current + 1))}
              disabled={effectiveReceiptPage >= receiptTotalPages}
            >
              بعدی
            </button>
          </div>
        ) : null}
      </div>

      {activePaymentTool === 'refund_requests' && (
      <div id="finance-refunds" className="finance-card" data-finance-section="payments" data-testid="finance-refunds-card">
        <div className="finance-toolbar">
          <div>
            <h3>درخواست‌های بازپرداخت</h3>
            <p className="muted">پرداخت‌هایی که باید به شاگرد برگردانده شود - مثلاً پولی که بعد از منفک/تبدیل‌شدن شاگرد اشتباهاً دریافت شده.</p>
          </div>
          <label className="finance-inline-filter finance-inline-filter-wide">
            <span>جستجو</span>
            <input
              value={refundSearchTerm}
              onChange={(e) => setRefundSearchTerm(e.target.value)}
              placeholder="نام شاگرد، شماره بازپرداخت یا شماره بل"
              data-testid="refund-search-input"
            />
          </label>
          <label className="finance-inline-filter">
            <span>وضعیت</span>
            <select value={refundStatusFilter} onChange={(e) => setRefundStatusFilter(e.target.value)} data-testid="refund-status-filter">
              <option value="all">همه</option>
              {Object.entries(FINANCE_REFUND_STATUS_LABELS).map(([value, label]) => (
                <option key={`refund-status-${value}`} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="finance-chip-group receipt-inbox-summary">
          <span className="finance-chip">کل: {refunds.length}</span>
          <span className="finance-chip finance-chip-emerald">باز (در انتظار/تاییدشده): {refundSummaryStats.openCount}</span>
          <span className="finance-chip">مجموع مبلغ باز: {fmt(refundSummaryStats.openAmount)}</span>
        </div>

        <div className="receipt-follow-up-form" data-testid="manual-refund-form">
          <h4>ثبت دستی درخواست بازپرداخت</h4>
          <div className="receipt-follow-up-grid">
            <label className="finance-inline-filter finance-inline-filter-wide">
              <span>بل / بدهی مالی</span>
              <select
                value={manualRefundForm.feeOrderId}
                onChange={(e) => setManualRefundForm((prev) => ({ ...prev, feeOrderId: e.target.value }))}
                data-testid="manual-refund-bill-select"
              >
                <option value="">یک بل با مبلغ پرداخت‌شده انتخاب کنید</option>
                {refundEligibleBills.map((item) => (
                  <option key={`manual-refund-bill-${item.id}`} value={item.id}>
                    {formatFinanceCode(item.billNumber, '---')} - {item.student?.name || '---'} - {fmt(item.amountPaid)}
                  </option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>مبلغ (خالی = تمام مبلغ پرداخت‌شده)</span>
              <input
                type="number"
                min="0"
                value={manualRefundForm.amount}
                onChange={(e) => setManualRefundForm((prev) => ({ ...prev, amount: e.target.value }))}
                data-testid="manual-refund-amount"
              />
            </label>
            <label className="finance-inline-filter">
              <span>دلیل</span>
              <select
                value={manualRefundForm.reason}
                onChange={(e) => setManualRefundForm((prev) => ({ ...prev, reason: e.target.value }))}
                data-testid="manual-refund-reason"
              >
                {Object.entries(FINANCE_REFUND_REASON_LABELS).map(([value, label]) => (
                  <option key={`manual-refund-reason-${value}`} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="finance-inline-filter finance-inline-filter-wide">
            <span>یادداشت</span>
            <textarea
              value={manualRefundForm.reasonNote}
              onChange={(e) => setManualRefundForm((prev) => ({ ...prev, reasonNote: e.target.value }))}
              placeholder="توضیح کوتاه دلیل بازپرداخت"
              data-testid="manual-refund-note"
            />
          </label>
          <div className="row-actions">
            <button type="button" onClick={createManualRefundCase} disabled={busy || !manualRefundForm.feeOrderId} data-testid="manual-refund-submit">
              ثبت درخواست بازپرداخت
            </button>
          </div>
        </div>

        {!filteredRefunds.length && <p className="muted">با این فیلتر درخواست بازپرداختی پیدا نشد.</p>}
        {!!filteredRefunds.length && (
          <div className="receipt-review-layout">
            <div className="finance-table refunds-table">
              <div className="head"><span>شاگرد</span><span>شماره بازپرداخت</span><span>مبلغ</span><span>دلیل</span><span>وضعیت</span><span>عملیات</span></div>
              {filteredRefunds.map((item) => (
                <div
                  key={item._id}
                  className={`row selectable-row ${selectedRefund?._id === item._id ? 'selected' : ''}`}
                  onClick={() => setSelectedRefundId(String(item._id))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedRefundId(String(item._id));
                    }
                  }}
                >
                  <div className="receipt-cell-stack">
                    <strong>{item.student?.name || '---'}</strong>
                    <small>{item.bill?.billNumber ? formatFinanceCode(item.bill.billNumber, '-') : (item.feeOrder?.orderNumber ? formatFinanceCode(item.feeOrder.orderNumber, '-') : '-')}</small>
                  </div>
                  <span className="finance-latin-code">{formatFinanceCode(item.refundNumber, '-')}</span>
                  <span>{fmt(item.amount)}</span>
                  <span>{FINANCE_REFUND_REASON_LABELS[item.reason] || item.reason || '-'}</span>
                  <span className={`receipt-status-badge ${item.status || 'pending_review'}`}>
                    {FINANCE_REFUND_STATUS_LABELS[item.status] || item.status || '-'}
                  </span>
                  <div className="row-actions">
                    {item.status === 'pending_review' && (
                      <>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedRefundId(String(item._id)); approveRefund(); }} disabled={busy}>تایید</button>
                        <button type="button" className="danger" onClick={(e) => { e.stopPropagation(); setSelectedRefundId(String(item._id)); rejectRefund(); }} disabled={busy}>رد</button>
                      </>
                    )}
                    {item.status === 'approved' && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedRefundId(String(item._id)); }} disabled={busy}>ثبت پرداخت</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {selectedRefund && (
              <aside className="receipt-inspector" data-testid="refund-inspector">
                <div className="receipt-inspector-head">
                  <div>
                    <strong>{selectedRefund.student?.name || '---'}</strong>
                    <span className="finance-latin-code">{formatFinanceCode(selectedRefund.refundNumber, '-')}</span>
                  </div>
                  <span className={`receipt-status-badge ${selectedRefund.status || 'pending_review'}`}>
                    {FINANCE_REFUND_STATUS_LABELS[selectedRefund.status] || selectedRefund.status}
                  </span>
                </div>

                <div className="receipt-meta-grid">
                  <div><span>مبلغ</span><strong>{fmt(selectedRefund.amount)} {selectedRefund.currency || 'AFN'}</strong></div>
                  <div><span>دلیل</span><strong>{FINANCE_REFUND_REASON_LABELS[selectedRefund.reason] || selectedRefund.reason || '-'}</strong></div>
                  <div><span>بل/بدهی مرجع</span><strong className="finance-latin-code">{formatFinanceCode(selectedRefund.bill?.billNumber || selectedRefund.feeOrder?.orderNumber, '-')}</strong></div>
                  <div><span>تاریخ ثبت</span><strong>{toFaDate(selectedRefund.createdAt)}</strong></div>
                  {selectedRefund.status === 'paid' && (
                    <>
                      <div><span>روش بازپرداخت</span><strong>{FINANCE_REFUND_METHOD_LABELS[selectedRefund.refundMethod] || selectedRefund.refundMethod || '-'}</strong></div>
                      <div><span>شماره سند</span><strong>{selectedRefund.proofReference || '-'}</strong></div>
                      <div><span>تاریخ پرداخت</span><strong>{toFaDate(selectedRefund.paidAt)}</strong></div>
                    </>
                  )}
                  {selectedRefund.status === 'rejected' && (
                    <div><span>دلیل رد</span><strong>{selectedRefund.rejectReason || '-'}</strong></div>
                  )}
                </div>

                {selectedRefund.reasonNote ? (
                  <div className="receipt-note-box">
                    <span>یادداشت</span>
                    <p>{selectedRefund.reasonNote}</p>
                  </div>
                ) : null}

                {selectedRefund.status === 'pending_review' && (
                  <div className="receipt-follow-up-form">
                    <label className="finance-inline-filter finance-inline-filter-wide">
                      <span>یادداشت بررسی (برای رد، دلیل الزامی است)</span>
                      <textarea
                        value={refundReviewNote}
                        onChange={(e) => setRefundReviewNote(e.target.value)}
                        placeholder="نتیجه بررسی یا دلیل رد را بنویسید"
                        data-testid="refund-review-note"
                      />
                    </label>
                    <div className="row-actions">
                      <button type="button" onClick={approveRefund} disabled={busy} data-testid="refund-approve-button">تایید درخواست</button>
                      <button type="button" className="danger" onClick={rejectRefund} disabled={busy} data-testid="refund-reject-button">رد درخواست</button>
                    </div>
                  </div>
                )}

                {selectedRefund.status === 'approved' && (
                  <div className="receipt-follow-up-form">
                    <div className="receipt-follow-up-grid">
                      <label className="finance-inline-filter">
                        <span>روش بازپرداخت</span>
                        <select
                          value={refundPayForm.refundMethod}
                          onChange={(e) => setRefundPayForm((prev) => ({ ...prev, refundMethod: e.target.value }))}
                          data-testid="refund-pay-method"
                        >
                          {Object.entries(FINANCE_REFUND_METHOD_LABELS).map(([value, label]) => (
                            <option key={`refund-pay-method-${value}`} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="finance-inline-filter">
                        <span>شماره سند/رسید</span>
                        <input
                          value={refundPayForm.proofReference}
                          onChange={(e) => setRefundPayForm((prev) => ({ ...prev, proofReference: e.target.value }))}
                          data-testid="refund-pay-reference"
                        />
                      </label>
                    </div>
                    <div className="row-actions">
                      <button type="button" onClick={markRefundAsPaid} disabled={busy || !refundPayForm.proofReference.trim()} data-testid="refund-pay-button">
                        ثبت پرداخت
                      </button>
                    </div>
                  </div>
                )}

                {Array.isArray(selectedRefund.approvalTrail) && selectedRefund.approvalTrail.length ? (
                  <div className="receipt-trail">
                    <h4>تاریخچه بازپرداخت</h4>
                    <div className="trail-list">
                      {selectedRefund.approvalTrail.map((entry, index) => (
                        <div key={`refund-trail-${selectedRefund._id}-${index}`} className="trail-item">
                          <div className="trail-item-head">
                            <strong>{entry.action === 'approve' ? 'تایید' : 'رد'}</strong>
                            <span>{toFaDateTime(entry.at)}</span>
                          </div>
                          {entry.note ? <p>{entry.note}</p> : null}
                          {entry.reason ? <p>{entry.reason}</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </aside>
            )}
          </div>
        )}
      </div>
      )}

      <div className="finance-card finance-orders-table-card" data-finance-section="orders" data-testid="finance-orders-table-card">
        <div className="finance-toolbar finance-orders-filter-toolbar">
          <div className="finance-orders-toolbar-intro">
            <h3>بل‌ها و تعهدات</h3>
            <p className="muted">بل‌ها را با جستجو و فلترهای صنف، ماه، نوع و وضعیت مرور کنید.</p>
          </div>
          <div className="finance-orders-filter-row">
            <label className="finance-inline-filter finance-orders-search-filter">
              <span>جستجو در بل‌ها</span>
              <input
                value={orderSearchTerm}
                onChange={(e) => setOrderSearchTerm(e.target.value)}
                placeholder="شماره بل، نام یا نمبر اساس شاگرد، یا صنف"
                data-testid="bill-search-input"
              />
            </label>
            <label className="finance-inline-filter">
              <span>وضعیت بل</span>
              <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)} data-testid="bill-status-filter">
                <option value="official">رسمی (بدون باطل)</option>
                <option value="all">همه بل‌ها</option>
                <option value="new">جدید</option>
                <option value="pending">در انتظار</option>
                <option value="partial">پرداخت ناقص</option>
                <option value="paid">پرداخت‌شده</option>
                <option value="waived">معاف/کامل</option>
                <option value="overdue">سررسید گذشته</option>
                <option value="void">باطل</option>
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>نوع بل</span>
              <select value={orderFeeTypeFilter} onChange={(e) => setOrderFeeTypeFilter(e.target.value)} data-testid="bill-fee-type-filter">
                <option value="all">همه انواع</option>
                {MANUAL_BILL_FEE_TYPES.map((feeType) => (
                  <option key={`bill-fee-filter-${feeType}`} value={feeType}>{FEE_LINE_TYPE_LABELS[feeType] || feeType}</option>
                ))}
                <option value="service">خدمت</option>
                <option value="penalty">جریمه</option>
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>صنف</span>
              <select value={orderClassFilter} onChange={(e) => setOrderClassFilter(e.target.value)} data-testid="bill-class-filter">
                <option value="all">همه صنف‌ها</option>
                {classOptions.map((item) => (
                  <option key={`bill-filter-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>ماه بل</span>
              <select value={orderMonthFilter} onChange={(e) => setOrderMonthFilter(e.target.value)} data-testid="bill-month-filter">
                <option value="all">همه ماه‌ها</option>
                {billMonthOptions.map((item) => (
                  <option key={`bill-month-filter-${item.key}`} value={item.key}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>وضعیت صدور</span>
              <select value={billIssuanceFilter} onChange={(e) => setBillIssuanceFilter(e.target.value)} data-testid="bill-issuance-filter">
                <option value="all">همه شاگردان</option>
                <option value="issued">صادر شده</option>
                <option value="not-issued">صادر نشده</option>
              </select>
            </label>
          </div>
        </div>
        {ordersCatalogLoading && (
          <p className="muted" role="status">در حال دریافت فهرست کامل بل‌ها برای جست‌وجو و فیلتر...</p>
        )}
        <div className="finance-chip-group finance-order-record-summary" data-testid="bill-record-summary">
          <span className="finance-chip finance-chip-emerald">{fmt(orderRecordStats.officialCount)} بل رسمی در محدوده انتخاب‌شده</span>
          <span className="finance-chip">{fmt(orderRecordStats.filteredCount)} بل مطابق همه فیلترها</span>
          {!!orderRecordStats.voidCount && (
            <span className="finance-chip finance-chip-muted">{fmt(orderRecordStats.voidCount)} بل باطل؛ در شمارش رسمی نیست</span>
          )}
          {!!orderRecordStats.officialTypeSummary && (
            <span className="finance-chip finance-chip-muted">تفکیک رسمی: {orderRecordStats.officialTypeSummary}</span>
          )}
        </div>
        <div className="finance-issuance-summary" data-testid="bill-issuance-results">
          <div className="finance-card-head">
            <div>
              <h4>وضعیت صدور بل شاگردان</h4>
              <p className="muted">برای نمایش شاگردان، نام، صنف، ماه، نوع بل یا وضعیت صدور را مشخص کنید.</p>
            </div>
            {hasBillIssuanceCriteria && (
              <div className="finance-chip-group">
                <span className="finance-chip">{billIssuanceRows.length} شاگرد</span>
                <span className="finance-chip finance-chip-emerald">{billIssuanceRows.filter((row) => row.issued).length} صادر شده</span>
                <span className="finance-chip finance-chip-muted">{billIssuanceRows.filter((row) => !row.issued).length} صادر نشده</span>
                {!!billIssuanceRows.reduce((sum, row) => sum + Number(row.voidCount || 0), 0) && (
                  <span className="finance-chip finance-chip-muted">
                    {fmt(billIssuanceRows.reduce((sum, row) => sum + Number(row.voidCount || 0), 0))} سند باطل جداگانه
                  </span>
                )}
              </div>
            )}
          </div>
          {!hasBillIssuanceCriteria && (
            <p className="muted finance-issuance-guidance" data-testid="bill-issuance-guidance">
              هنوز معیاری انتخاب نشده است؛ برای دیدن وضعیت صدور، از فلترهای بالا استفاده کنید.
            </p>
          )}
          {hasBillIssuanceCriteria && !billIssuanceRows.length && <p className="muted">شاگردی مطابق این فلتر پیدا نشد.</p>}
          {hasBillIssuanceCriteria && !!billIssuanceRows.length && (
            <div className="finance-issuance-list">
              {billIssuanceRows.slice(0, 100).map((row) => (
                <div key={row.key} className="mini-row">
                  <span className="finance-cell-stack">
                    <strong>{row.studentName}</strong>
                    <small>{row.admissionNo || 'بدون شماره ثبت'} · {row.classTitle}</small>
                    {row.billTypeSummary ? <small>بابت: {row.billTypeSummary}</small> : null}
                    {!!row.billDetails?.length && (
                      <small>
                        بل‌ها: {row.billDetails.slice(0, 5).map((bill) => `${formatFinanceCode(bill.number, '---')} (${[bill.type, bill.monthLabel].filter(Boolean).join(' · ')})`).join('، ')}
                        {row.billDetails.length > 5 ? ` و ${fmt(row.billDetails.length - 5)} بل دیگر` : ''}
                      </small>
                    )}
                  </span>
                  <span className="finance-cell-stack finance-issuance-status-stack">
                    <span className={`finance-order-status ${row.issued ? 'paid' : 'void'}`}>
                      {row.issued ? `${fmt(row.billCount)} بل رسمی` : 'بل رسمی صادر نشده'}
                    </span>
                    {!!row.voidCount && <small>{fmt(row.voidCount)} بل باطل (حساب نشده)</small>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {financeDataErrors.orders ? (
          <div className="finance-data-error" role="alert">
            دریافت بل‌ها ناموفق بود: {financeDataErrors.orders}
          </div>
        ) : null}
        {!financeDataErrors.orders && !filteredBills.length && <p className="muted">برای این فیلتر، بلی پیدا نشد.</p>}
        <div className="finance-orders-table-head"><span>سند</span><span>متعلم</span><span>صنف / دوره</span><span>مبلغ</span><span>مهلت پرداخت</span><span>وضعیت</span><span>عملیات</span></div>
        <div className="finance-table bills-table finance-orders-table">
          <div className="head"><span>شماره</span><span>شاگرد</span><span>صنف</span><span>وضعیت</span><span>باقیمانده</span><span>عملیات</span></div>
          {filteredBills.slice(0, billVisibleCount).map((bill) => (
            <div key={bill._id} className="row">
              <span className="finance-cell-stack">
                <strong className="finance-latin-code">{formatFinanceCode(bill.billNumber, '-')}</strong>
                <small>بابت: <strong>{getBillTypeLabel(bill)}</strong></small>
                {!!bill.periodLabel && <small>دوره: {bill.periodLabel}</small>}
                {!!bill.feeLineSummary && <small>{bill.feeLineSummary}</small>}
              </span>
              <span className="finance-cell-stack">
                <span>{bill.student?.name || '---'}</span>
                <FinanceStudentStatusBadge label={bill.lifecycleStatusLabel} tone={bill.lifecycleStatusTone} />
              </span>
              <span className="finance-cell-stack">
                <strong>{bill.classId?.title || bill.schoolClass?.title || bill.course?.title || '---'}</strong>
                {!!bill.lineItems?.length && <small>{bill.lineItems.length} ردیف مالی</small>}
                {!!getPreviousClassDebtLabel(bill) && <small>{getPreviousClassDebtLabel(bill)}</small>}
              </span>
              <span className="finance-cell-stack">
                <strong>{fmt(getBillDisplayAmount(bill))} AFN</strong>
                {getBillReliefAmount(bill) > 0 && (
                  <small>تخفیف/معافیت: {fmt(getBillReliefAmount(bill))} AFN</small>
                )}
                <small>پرداخت: {fmt(bill.amountPaid || 0)} AFN</small>
              </span>
              <span className="finance-cell-stack">
                <strong>{bill.dueDate ? toFaDate(bill.dueDate) : '-'}</strong>
                <small>باقی: {fmt(Math.max(0, (bill.outstandingAmount ?? ((bill.amountDue || 0) - (bill.amountPaid || 0)))))} AFN</small>
              </span>
              <span className="finance-cell-stack">
                <span className={`finance-order-status ${String(bill.status || '').trim()}`}>{ORDER_STATUS_UI_LABELS[String(bill.status || '').trim()] || bill.status || '-'}</span>
                {bill.status === 'void' && <small>{bill.voidReason || 'این سند در شمارش رسمی و مبالغ کارت‌ها حساب نمی‌شود.'}</small>}
              </span>
              <div className="row-actions">
                {bill.status !== 'void' && (
                  <>
                    <button type="button" onClick={() => addDiscount(bill._id)} disabled={busy}>تخفیف/تعدیل</button>
                    <button type="button" onClick={() => setInstallments(bill._id)} disabled={busy}>قسط‌بندی</button>
                    <button type="button" className="danger" onClick={() => voidBill(bill._id)} disabled={busy}>باطل</button>
                  </>
                )}
                {bill.status === 'void' && <span className="muted">بدون عملیات مالی</span>}
              </div>
            </div>
          ))}
        </div>
        {filteredBills.length > 5 && (
          <div className="row-actions">
            {billVisibleCount < filteredBills.length && <button type="button" className="secondary" onClick={() => setBillVisibleCount((value) => value + 5)}>نمایش بیشتر</button>}
            {billVisibleCount > 5 && <button type="button" className="secondary" onClick={() => setBillVisibleCount(5)}>نمایش کمتر</button>}
          </div>
        )}
      </div>

      <div className="finance-grid" data-finance-section="overview reports">
        <div className="finance-card finance-smart-debtors-card" data-finance-section="overview reports" data-testid="top-debtors-card">
          <div className="finance-card-head">
            <div>
              <h3>بدهکاران اصلی</h3>
              <p className="muted">فهرست هوشمند باقیات با ۱۰ شاگرد در هر صفحه؛ فیلتر سال و صنف از بالای داشبورد اعمال می‌شود.</p>
            </div>
            <div className="finance-chip-group">
              <span className="finance-chip">{fmt(filteredOverviewDebtors.length)} شاگرد</span>
              <span className="finance-chip finance-chip-rose">{fmt(filteredOverviewDebtors.reduce((sum, row) => sum + Number(row?.amount || 0), 0))} AFN</span>
            </div>
          </div>
          <div className="finance-debtor-controls">
            <label><span>جستجو</span><input value={debtorSearchTerm} onChange={(event) => setDebtorSearchTerm(event.target.value)} placeholder="نام یا نمبر اساس شاگرد، یا صنف" /></label>
            <label>
              <span>مدت تاخیر</span>
              <select value={debtorDelayFilter} onChange={(event) => setDebtorDelayFilter(event.target.value)}>
                <option value="all">همه باقیات</option>
                <option value="1">سررسید گذشته</option>
                <option value="30">۳۰ روز و بیشتر</option>
                <option value="60">۶۰ روز و بیشتر</option>
              </select>
            </label>
          </div>
          <div className="finance-smart-debtor-list">
            {paginatedOverviewDebtors.map((row) => (
              <div key={`smart-debtor-${row.studentId || row.name}`} className="finance-smart-debtor-row">
                <span className="finance-cell-stack">
                  <strong>{row.name} <FinanceStudentStatusBadge label={row.lifecycleStatusLabel} tone={row.lifecycleStatusTone} /></strong>
                  <small>{row.classTitle} · {fmt(row.orderCount)} بل باز</small>
                </span>
                <span className="finance-cell-stack"><strong>{fmt(row.amount)} AFN</strong><small>{fmt(row.overdueOrderCount)} بل سررسید گذشته</small></span>
                <span className={`finance-risk-badge ${row.risk}`}>{row.maxLateDays ? `${fmt(row.maxLateDays)} روز تاخیر` : 'جاری'}</span>
                <button type="button" className="secondary" onClick={() => openDebtorInPaymentDesk(row)}>باز کردن میز پرداخت</button>
              </div>
            ))}
            {!paginatedOverviewDebtors.length && <p className="muted">بدهکاری مطابق این فیلتر پیدا نشد.</p>}
          </div>
          <div className="finance-pagination">
            <button type="button" className="secondary" onClick={() => setDebtorPage((page) => Math.max(1, page - 1))} disabled={debtorPage <= 1}>صفحه قبلی</button>
            <span>صفحه {fmt(debtorPage)} از {fmt(debtorPageCount)} · نمایش {fmt(filteredOverviewDebtors.length ? ((debtorPage - 1) * 10) + 1 : 0)} تا {fmt(Math.min(debtorPage * 10, filteredOverviewDebtors.length))}</span>
            <button type="button" className="secondary" onClick={() => setDebtorPage((page) => Math.min(debtorPageCount, page + 1))} disabled={debtorPage >= debtorPageCount}>صفحه بعدی</button>
          </div>
        </div>

        <div className="finance-card finance-smart-debtors-card finance-legacy-arrears-card" data-finance-section="overview reports" data-testid="legacy-arrears-card">
          <div className="finance-card-head">
            <div>
              <h3>بدهی راکد شاگردان خارج‌شده</h3>
              <p className="muted">شاگردانی که منفک، تبدیل یا محروم شده‌اند اما هنوز بدهی باز دارند؛ جدا از پیگیری عادی — برای هرکدام بازپرداخت، انتقال بدهی، یا راکد اعلام کردن با تأیید مدیر مالی تصمیم بگیرید.</p>
            </div>
            <div className="finance-chip-group">
              <span className="finance-chip">{fmt(filteredDepartedDebtors.length)} شاگرد</span>
              <span className="finance-chip finance-chip-amber">{fmt(financeOverviewKpis?.legacyArrears?.amount || 0)} AFN</span>
            </div>
          </div>
          <div className="finance-smart-debtor-list">
            {filteredDepartedDebtors.map((row) => (
              <div key={`legacy-debtor-${row.studentId || row.name}`} className="finance-smart-debtor-row">
                <span className="finance-cell-stack">
                  <strong>{row.name} <FinanceStudentStatusBadge label={row.lifecycleStatusLabel} tone={row.lifecycleStatusTone} /></strong>
                  <small>{row.classTitle} · {fmt(row.orderCount)} بل باز</small>
                </span>
                <span className="finance-cell-stack"><strong>{fmt(row.amount)} AFN</strong><small>{fmt(row.overdueOrderCount)} بل سررسید گذشته</small></span>
                <div className="finance-inline-actions">
                  <button type="button" className="secondary" onClick={() => openDebtorInPaymentDesk(row)}>باز کردن میز پرداخت</button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => openDepartedDebtorRefund(row)}
                    disabled={!row?.refundableOrderIds?.length}
                    title={row?.refundableOrderIds?.length ? '' : 'بدهی این شاگرد پرداختی ندارد که قابل بازپرداخت باشد'}
                  >
                    بررسی بازپرداخت
                  </button>
                  <button
                    type="button"
                    className="secondary danger"
                    onClick={() => markDebtorDormant(row)}
                    disabled={busy || !row?.unpaidOrderIds?.length}
                    title={row?.unpaidOrderIds?.length ? '' : 'بدهی این شاگرد فقط شامل بل‌های دارای پرداخت است'}
                  >
                    راکد اعلام کردن
                  </button>
                </div>
              </div>
            ))}
            {!filteredDepartedDebtors.length && <p className="muted">بدهی راکدی برای شاگردان خارج‌شده پیدا نشد.</p>}
          </div>
        </div>
      </div>

      <div className="finance-grid" data-finance-section="reports settings">
        <div className="finance-card" data-finance-section="reports settings">
          <h3>ماه‌های بسته شده</h3>
          {closedMonths.slice(0, 8).map((item) => (
            <div key={item._id} className="mini-row">
              <span>{toFaMonthKey(item.monthKey)}</span>
              <span>{item.closedBy?.name || 'ادمین'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="finance-grid" data-finance-section="anomalies">
        <div className="finance-card" data-finance-section="anomalies" data-testid="finance-anomalies-card">
          <div className="finance-card-head">
            <div>
              <h3>ناهنجاری‌های مالی</h3>
              <p className="muted">مرکز واحد بررسی و رفع همه هشدارها و مغایرت‌های مالی؛ این موارد در بخش‌های دیگر تکرار نمی‌شوند.</p>
            </div>
            <div className="finance-chip-group">
              <span className="finance-chip">مجموع: {visibleAnomalySummary.total}</span>
              <span className="finance-chip finance-chip-rose">بحرانی: {visibleAnomalySummary.critical}</span>
              <span className="finance-chip finance-chip-amber">هشدار: {visibleAnomalySummary.warning}</span>
              <span className="finance-chip finance-chip-muted">{visibleAnomalySummary.byWorkflow?.assigned || 0} ارجاع</span>
              <span className="finance-chip finance-chip-emerald">{visibleAnomalySummary.byWorkflow?.resolved || 0} حل‌شده</span>
            </div>
          </div>
          <div className="receipt-follow-up-grid">
            <label className="finance-inline-filter">
              <span>نوع ناهنجاری</span>
              <select
                value={anomalyTypeFilter}
                onChange={(e) => setAnomalyTypeFilter(e.target.value)}
                data-testid="anomaly-type-filter"
              >
                <option value="all">همه ناهنجاری‌ها</option>
                {anomalyTypeOptions.map((item) => (
                  <option key={`anomaly-type-filter-${item.value}`} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>وضعیت</span>
              <select
                value={anomalyWorkflowStatusFilter}
                onChange={(e) => setAnomalyWorkflowStatusFilter(e.target.value)}
                data-testid="anomaly-workflow-filter"
              >
                <option value="open">باز</option>
                <option value="assigned">ارجاع‌شده</option>
                <option value="snoozed">معطل</option>
                <option value="resolved">حل‌شده</option>
                <option value="all">همه وضعیت‌ها</option>
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>صنف</span>
              <select
                value={anomalyClassFilter}
                onChange={(e) => setAnomalyClassFilter(e.target.value)}
                data-testid="anomaly-class-filter"
              >
                <option value="">همه صنف‌ها</option>
                {classOptions.map((item) => (
                  <option key={`anomaly-class-filter-${item.classId}`} value={item.classId}>
                    {item.uiLabel || item.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="finance-inline-filter">
              <span>جستجو</span>
              <input
                type="search"
                value={anomalySearchTerm}
                onChange={(e) => setAnomalySearchTerm(e.target.value)}
                placeholder="نام یا نمبر اساس شاگرد، صنف یا مرجع"
                data-testid="anomaly-search"
              />
            </label>
          </div>
          <div className="admission-batch-panel" data-testid="admission-batch-panel">
            <div className="finance-card-head">
              <div>
                <h4>رفع گروهی مشکل داخله بر اساس صنف</h4>
                <p className="muted">سیستم فقط شاگردانی را ثبت می‌کند که پلان فعال داخله دارند و هنوز بل یا سند داخله برای‌شان موجود نیست.</p>
              </div>
              <span className="finance-chip finance-chip-amber" data-testid="admission-batch-count">
                {admissionBatchPreview.loading ? 'در حال بررسی…' : `${admissionBatchPreview.items.length} شاگرد`}
              </span>
            </div>
            <div className="receipt-follow-up-grid admission-batch-controls">
              <label className="finance-inline-filter">
                <span>صنف مربوطه</span>
                <select
                  value={admissionBatchForm.classId}
                  onChange={(e) => setAdmissionBatchForm((prev) => ({ ...prev, classId: e.target.value }))}
                  data-testid="admission-batch-class"
                >
                  <option value="">انتخاب صنف</option>
                  {classOptions.map((item) => (
                    <option key={`admission-batch-class-${item.classId}`} value={item.classId}>
                      {item.uiLabel || item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>نوع ثبت گروهی</span>
                <select
                  value={admissionBatchForm.mode}
                  onChange={(e) => setAdmissionBatchForm((prev) => ({ ...prev, mode: e.target.value }))}
                  data-testid="admission-batch-mode"
                >
                  <option value="open">صدور بل باز داخله</option>
                  <option value="paid">داخله دریافت شده — انتظار تأیید</option>
                  <option value="waived">معافیت کامل داخله</option>
                </select>
              </label>
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>یادداشت گروهی</span>
                <input
                  value={admissionBatchForm.note}
                  onChange={(e) => setAdmissionBatchForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="مثلاً ثبت داخله صنف از اسناد قبلی"
                  data-testid="admission-batch-note"
                />
              </label>
            </div>
            {admissionBatchPreview.error ? <p className="admission-batch-error">{admissionBatchPreview.error}</p> : null}
            {!!admissionBatchPreview.items.length && (
              <p className="muted admission-batch-sample">
                شامل: {admissionBatchPreview.items.slice(0, 5).map((item) => item.studentName).filter(Boolean).join('، ')}
                {admissionBatchPreview.items.length > 5 ? ` و ${admissionBatchPreview.items.length - 5} شاگرد دیگر` : ''}
              </p>
            )}
            {admissionBatchForm.mode === 'paid' ? (
              <p className="muted">پرداخت‌های گروهی ابتدا در حالت «در انتظار تأیید مالی» ثبت می‌شوند و مستقیماً تأیید نخواهند شد.</p>
            ) : null}
            <div className="row-actions">
              <button
                type="button"
                onClick={settleAdmissionAnomaliesByClass}
                disabled={busy || admissionBatchPreview.loading || !admissionBatchForm.classId || !admissionBatchPreview.items.length}
                data-testid="admission-batch-submit"
              >
                ثبت داخله تمام شاگردان این صنف
              </button>
            </div>
          </div>
          {!!visibleAnomalies.length && (
            <div className="anomaly-workflow-layout">
              <div className="anomaly-workflow-list" data-testid="finance-anomaly-list">
                {visibleAnomalies.map((item) => (
                  <article
                    key={`anomaly-workflow-${item.id}`}
                    className={`anomaly-workflow-item ${selectedAnomaly?.id === item.id ? 'selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedAnomalyId(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedAnomalyId(item.id);
                      }
                    }}
                  >
                    <div className="anomaly-workflow-item-head">
                      <span className="finance-cell-stack">
                        <strong>{FINANCE_ANOMALY_UI_LABELS[item.anomalyType] || item.anomalyType || 'ناهنجاری'}</strong>
                        <small>{item.studentName || item.classTitle || item.referenceNumber || '—'}</small>
                      </span>
                      <div className="finance-chip-group anomaly-chip-cluster">
                        <span className={`finance-chip ${item.severity === 'critical' ? 'finance-chip-rose' : item.severity === 'warning' ? 'finance-chip-amber' : 'finance-chip-muted'}`}>
                          {AUDIT_SEVERITY_UI_LABELS[item.severity] || item.severity || 'اطلاع'}
                        </span>
                        <span className={`finance-chip ${item.workflowStatus === 'resolved' ? 'finance-chip-emerald' : item.workflowStatus === 'snoozed' ? 'finance-chip-amber' : item.workflowStatus === 'assigned' ? 'finance-chip-muted' : 'finance-chip-rose'}`}>
                          {FINANCE_ANOMALY_WORKFLOW_LABELS[item.workflowStatus] || item.workflowStatus || 'باز'}
                        </span>
                      </div>
                    </div>
                    <div className="anomaly-workflow-item-meta">
                      <span>{item.referenceNumber || item.secondaryReference || 'بدون مرجع'}</span>
                      <span>{item.amountLabel || 'بدون مبلغ'}</span>
                    </div>
                    {item.workflowLatestNote ? <p>{item.workflowLatestNote}</p> : null}
                  </article>
                ))}
              </div>

              {selectedAnomaly ? (
                <div className="anomaly-workflow-inspector" data-testid="finance-anomaly-inspector">
                  <div className="receipt-inspector-head">
                    <div>
                      <strong>{selectedAnomaly.title || FINANCE_ANOMALY_UI_LABELS[selectedAnomaly.anomalyType] || 'ناهنجاری مالی'}</strong>
                      <span>{selectedAnomaly.studentName || selectedAnomaly.classTitle || selectedAnomaly.referenceNumber || 'پرونده مالی'}</span>
                    </div>
                    <div className="finance-chip-group anomaly-chip-cluster">
                      <span className={`finance-chip ${selectedAnomaly.severity === 'critical' ? 'finance-chip-rose' : selectedAnomaly.severity === 'warning' ? 'finance-chip-amber' : 'finance-chip-muted'}`}>
                        {AUDIT_SEVERITY_UI_LABELS[selectedAnomaly.severity] || selectedAnomaly.severity || 'اطلاع'}
                      </span>
                      <span className={`finance-chip ${selectedAnomaly.workflowStatus === 'resolved' ? 'finance-chip-emerald' : selectedAnomaly.workflowStatus === 'snoozed' ? 'finance-chip-amber' : selectedAnomaly.workflowStatus === 'assigned' ? 'finance-chip-muted' : 'finance-chip-rose'}`}>
                        {FINANCE_ANOMALY_WORKFLOW_LABELS[selectedAnomaly.workflowStatus] || selectedAnomaly.workflowStatus || 'باز'}
                      </span>
                    </div>
                  </div>

                  <p className="muted anomaly-workflow-description">{selectedAnomaly.description || 'برای این ناهنجاری توضیحی ثبت نشده است.'}</p>

                  <div className="receipt-meta-grid">
                    <div>
                      <span>مرجع مالی</span>
                      <strong>{selectedAnomaly.referenceNumber || selectedAnomaly.secondaryReference || '—'}</strong>
                    </div>
                    <div>
                      <span>مبلغ / اثر</span>
                      <strong>{selectedAnomaly.amountLabel || 'مشخص نیست'}</strong>
                    </div>
                    <div>
                      <span>ارجاع فعلی</span>
                      <strong>{ADMIN_LEVEL_UI_LABELS[selectedAnomaly.workflowAssignedLevel] || 'ثبت نشده'}</strong>
                    </div>
                    <div>
                      <span>تعویق تا</span>
                      <strong>{selectedAnomaly.workflowSnoozedUntil ? toFaDate(selectedAnomaly.workflowSnoozedUntil) : 'تعویق ندارد'}</strong>
                    </div>
                    <div>
                      <span>آخرین اقدام</span>
                      <strong>{selectedAnomaly.workflowLastActionAt ? `${toFaDateTime(selectedAnomaly.workflowLastActionAt)}${selectedAnomaly.workflowLastActionByName ? ` - ${selectedAnomaly.workflowLastActionByName}` : ''}` : 'ثبت نشده'}</strong>
                    </div>
                    <div>
                      <span>حل‌شده توسط</span>
                      <strong>{selectedAnomaly.workflowResolvedByName || 'فعلاً باز است'}</strong>
                    </div>
                  </div>

                  <div className="receipt-follow-up-form anomaly-workflow-form">
                    <div className="receipt-follow-up-grid">
                      <label className="finance-inline-filter">
                        <span>ارجاع به سطح</span>
                        <select
                          value={anomalyWorkflowForm.assignedLevel}
                          onChange={(e) => setAnomalyWorkflowForm((prev) => ({ ...prev, assignedLevel: e.target.value }))}
                          data-testid="anomaly-assigned-level"
                        >
                          {FOLLOW_UP_LEVEL_OPTIONS.map((item) => (
                            <option key={`anomaly-level-${item.value}`} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="finance-inline-filter">
                        <span>تعویق تا</span>
                        <AfghanDateInput
                          value={anomalyWorkflowForm.snoozedUntil}
                          onChange={(value) => setAnomalyWorkflowForm((prev) => ({ ...prev, snoozedUntil: value }))}
                          data-testid="anomaly-snooze-until"
                          showGregorianEquivalent
                        />
                        <small>{anomalyWorkflowForm.snoozedUntil ? `هجری شمسی: ${toFaDate(anomalyWorkflowForm.snoozedUntil)}` : 'تاریخ تعویق انتخاب نشده است.'}</small>
                      </label>
                    </div>

                    <label className="finance-inline-filter finance-inline-filter-wide">
                      <span>یادداشت پیگیری</span>
                      <textarea
                        value={anomalyWorkflowForm.note}
                        onChange={(e) => setAnomalyWorkflowForm((prev) => ({ ...prev, note: e.target.value }))}
                        placeholder="نتیجه تماس، تصمیم مالی، دلیل تعویق یا جمع‌بندی رفع ناهنجاری را اینجا بنویسید"
                        data-testid="anomaly-note-input"
                      />
                    </label>

                    <div className="receipt-follow-up-actions">
                      <div className="finance-chip-group anomaly-chip-cluster">
                        <span className="finance-chip finance-chip-muted">نیازمند اقدام: {selectedAnomaly.actionRequired ? 'بله' : 'خیر'}</span>
                        <span className="finance-chip">{(selectedAnomaly.workflowHistory || []).length} رخداد</span>
                      </div>
                      <div className="row-actions">
                        <button type="button" className="secondary" onClick={saveAnomalyNote} disabled={busy || !selectedAnomaly} data-testid="anomaly-note-button">ثبت یادداشت</button>
                        <button type="button" className="secondary" onClick={assignAnomaly} disabled={busy || !selectedAnomaly} data-testid="anomaly-assign-button">ارجاع</button>
                        <button type="button" className="secondary" onClick={snoozeAnomaly} disabled={busy || !selectedAnomaly || !anomalyWorkflowForm.snoozedUntil} data-testid="anomaly-snooze-button">تعویق</button>
                        {selectedAnomaly.anomalyType === 'admission_missing' && (
                          <>
                            <button type="button" onClick={() => settleAdmissionAnomaly('open')} disabled={busy || !selectedAnomaly} data-testid="anomaly-admission-open-button">صدور بل داخله</button>
                            <button type="button" className="secondary" onClick={() => settleAdmissionAnomaly('paid')} disabled={busy || !selectedAnomaly} data-testid="anomaly-admission-paid-button">داخله پرداخت شده</button>
                            <button type="button" className="secondary" onClick={() => settleAdmissionAnomaly('waived')} disabled={busy || !selectedAnomaly} data-testid="anomaly-admission-waived-button">معاف/تخفیف کامل</button>
                          </>
                        )}
                        {selectedAnomaly.anomalyType === 'payment_after_membership_end' && (
                          <button type="button" onClick={createRefundFromAnomaly} disabled={busy || !selectedAnomaly} data-testid="anomaly-create-refund-button">ایجاد درخواست بازپرداخت</button>
                        )}
                        <button type="button" onClick={resolveAnomaly} disabled={busy || !selectedAnomaly} data-testid="anomaly-resolve-button">ثبت حل‌شدن</button>
                      </div>
                    </div>
                  </div>

                  <div className="receipt-trail">
                    <h4>تاریخچه ناهنجاری مالی</h4>
                    <div className="trail-list">
                      {(selectedAnomaly.workflowHistory || []).slice(0, 8).map((entry, index) => (
                        <div key={`anomaly-history-${selectedAnomaly.id}-${index}`} className="trail-item">
                          <div className="trail-item-head">
                            <strong>{FINANCE_ANOMALY_WORKFLOW_LABELS[entry.status] || entry.status || 'به‌روزرسانی'}</strong>
                            <span>{toFaDateTime(entry.at)}</span>
                          </div>
                          <div className="trail-item-meta">
                            <span>{entry.byName || 'سیستم مالی'}</span>
                            <span>{ADMIN_LEVEL_UI_LABELS[entry.assignedLevel] || entry.assignedLevel || '—'}</span>
                          </div>
                          {entry.note ? <p>{entry.note}</p> : null}
                        </div>
                      ))}
                      {!(selectedAnomaly.workflowHistory || []).length && (
                        <p className="muted">برای این ناهنجاری هنوز تاریخچه ثبت نشده است.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {!visibleAnomalies.length && <p className="muted">در این محدوده فعلاً ناهنجاری مالی فعالی دیده نشد.</p>}
        </div>
        {selectedMonthClose ? (
          <div className="finance-card" data-finance-section="overview settings reports" data-testid="month-close-snapshot-card">
            <div className="finance-card-head">
              <div>
                <h3>snapshot ماه مالی {toFaMonthKey(selectedMonthClose.monthKey)}</h3>
                <p className="muted">نمای ثابت از ارقام ماه، بل‌های سررسید گذشته و تسهیلات مالی همان بستن ماه.</p>
              </div>
              <div className="finance-chip-group">
                <label className="finance-inline-filter">
                  <span>ماه بسته</span>
                  <select value={String(selectedMonthCloseId || '')} onChange={(e) => setSelectedMonthCloseId(e.target.value)}>
                    {closedMonths.map((item) => (
                      <option key={`month-close-select-${item._id || item.id}`} value={String(item._id || item.id || '')}>
                        {toFaMonthKey(item.monthKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className={`finance-chip ${selectedMonthCloseStatus === 'closed' ? 'finance-chip-emerald' : selectedMonthCloseStatus === 'rejected' || selectedMonthCloseStatus === 'reopened' ? 'finance-chip-rose' : 'finance-chip-amber'}`}>
                  {MONTH_CLOSE_STATUS_UI_LABELS[selectedMonthCloseStatus] || selectedMonthCloseStatus}
                </span>
                <span className="finance-chip finance-chip-muted">
                  {MONTH_CLOSE_STAGE_UI_LABELS[selectedMonthCloseStage] || selectedMonthCloseStage}
                </span>
                <button type="button" className="secondary" onClick={() => exportMonthCloseSnapshot(selectedMonthClose)} disabled={busy} data-testid="export-month-close-snapshot">خروجی CSV</button>
                <button type="button" className="secondary" onClick={() => exportMonthClosePdfPack(selectedMonthClose)} disabled={busy} data-testid="export-month-close-pdf">بسته پی‌دی‌اف</button>
                {canApproveSelectedMonthClose ? (
                  <button type="button" onClick={() => approveMonthClose(selectedMonthClose)} disabled={busy} data-testid="approve-month-close">تایید مرحله</button>
                ) : null}
                {canRejectSelectedMonthClose ? (
                  <button type="button" className="danger" onClick={() => rejectMonthClose(selectedMonthClose)} disabled={busy} data-testid="reject-month-close">برگشت برای اصلاح</button>
                ) : null}
                {canReopenSelectedMonthClose ? (
                  <button type="button" className="secondary" onClick={() => reopenMonthClose(selectedMonthClose)} disabled={busy}>بازگشایی</button>
                ) : null}
              </div>
            </div>
            <div className="finance-kpi-grid finance-kpi-grid-dense">
              <div className="finance-kpi-item">
                <span>بل‌های ماه</span>
                <strong>{fmt(monthCloseSnapshot?.totals?.ordersIssuedCount || 0)}</strong>
              </div>
              <div className="finance-kpi-item">
                <span>وصول تاییدشده</span>
                <strong>{fmt(monthCloseSnapshot?.totals?.approvedPaymentAmount || 0)} AFN</strong>
              </div>
              <div className="finance-kpi-item finance-kpi-item-accent">
                <span>مانده ایستا</span>
                <strong>{fmt(monthCloseSnapshot?.totals?.standingOutstandingAmount || 0)} AFN</strong>
              </div>
            </div>
            <div className="finance-subcard-list">
              <div className="mini-row">
                <span>سررسید گذشته</span>
                <span>{fmt(monthCloseSnapshot?.aging?.totalRemaining || 0)} AFN</span>
              </div>
              <div className="mini-row">
                <span>تسهیلات فعال</span>
                <span>{fmt(monthCloseSnapshot?.totals?.activeReliefs || 0)} / {fmt(monthCloseSnapshot?.totals?.fixedReliefAmount || 0)} AFN</span>
              </div>
              <div className="mini-row">
                <span>در انتظار تایید</span>
                <span>{fmt(monthCloseSnapshot?.totals?.pendingPaymentCount || 0)} / {fmt(monthCloseSnapshot?.totals?.pendingPaymentAmount || 0)} AFN</span>
              </div>
              <div className="mini-row">
                <span>مصارف تاییدشده ماه</span>
                <span>{fmt(monthCloseSnapshot?.totals?.approvedExpenseCount || 0)} / {fmt(monthCloseSnapshot?.totals?.approvedExpenseAmount || 0)} AFN</span>
              </div>
              <div className="mini-row">
                <span>مصارف در انتظار</span>
                <span>{fmt(monthCloseSnapshot?.totals?.pendingExpenseCount || 0)} / {fmt(monthCloseSnapshot?.totals?.pendingExpenseAmount || 0)} AFN</span>
              </div>
              <div className="mini-row">
                <span>خالص نقد ماه</span>
                <span>{fmt(monthCloseSnapshot?.totals?.netCashAmount || 0)} AFN</span>
              </div>
              <div className="mini-row">
                <span>خالص ثبت خزانه</span>
                <span>{fmt(monthCloseSnapshot?.totals?.treasuryNetAmount || 0)} AFN</span>
              </div>
              <div className="mini-row">
                <span>یادداشت بستن ماه</span>
                <span>{selectedMonthCloseDetail?.requestNote || selectedMonthClose?.requestNote || selectedMonthClose.note || selectedMonthClose.reopenNote || 'بدون یادداشت'}</span>
              </div>
              <div className="mini-row">
                <span>وضعیت آمادگی</span>
                <span>{monthCloseReadiness.readyToApprove ? 'آماده برای تایید' : 'دارای مانع فعال'}</span>
              </div>
              <div className="mini-row">
                <span>ثبت‌کننده درخواست</span>
                <span>{selectedMonthCloseDetail?.requestedBy?.name || selectedMonthClose?.requestedBy?.name || selectedMonthCloseDetail?.closedBy?.name || selectedMonthClose?.closedBy?.name || 'ثبت نشده'}</span>
              </div>
              <div className="mini-row">
                <span>مرحله جاری</span>
                <span>{MONTH_CLOSE_STAGE_UI_LABELS[selectedMonthCloseStage] || selectedMonthCloseStage}</span>
              </div>
              {(monthCloseSnapshot?.classes || []).slice(0, 4).map((row) => (
                <div key={`month-close-class-${row.classId || row.title}`} className="mini-row">
                  <span>{row.title || 'صنف'}</span>
                  <span>{fmt(row.totalOutstanding || 0)} AFN</span>
                </div>
              ))}
            </div>
            {!!monthCloseReadiness.blockingIssues?.length && (
              <div className="finance-subcard-list">
                {monthCloseReadiness.blockingIssues.map((issue, index) => (
                  <div key={`month-close-blocking-${issue.code || index}`} className="mini-row">
                    <span>{issue.label || 'مانع تایید'}</span>
                    <span>{issue.count != null ? fmt(issue.count) : fmt(issue.amount || 0)}{issue.amount != null ? ' AFN' : ''}</span>
                  </div>
                ))}
              </div>
            )}
            {!!monthCloseReadiness.warningIssues?.length && (
              <div className="finance-subcard-list">
                {monthCloseReadiness.warningIssues.map((issue, index) => (
                  <div key={`month-close-warning-${issue.code || index}`} className="mini-row">
                    <span>{issue.label || 'هشدار ماه مالی'}</span>
                    <span>{issue.count != null ? fmt(issue.count) : fmt(issue.amount || 0)}{issue.amount != null ? ' AFN' : ''}</span>
                  </div>
                ))}
              </div>
            )}
            {!!monthCloseApprovalTrail.length && (
              <div className="finance-subcard-list" data-testid="month-close-approval-trail">
                {monthCloseApprovalTrail.slice().reverse().map((entry, index) => (
                  <div key={`month-close-trail-${index}`} className="mini-row">
                    <span>{ADMIN_LEVEL_UI_LABELS[entry?.level] || entry?.level || 'مدیریت مالی'}</span>
                    <span>
                      {[entry?.action || '', entry?.by?.name || '', entry?.note || entry?.reason || '']
                        .filter(Boolean)
                        .join(' | ') || 'بدون جزئیات'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {false && <div className="finance-card" data-finance-section="reports settings" data-testid="finance-delivery-provider-config-card">
        <div className="finance-card-head">
          <div>
            <h3>تنظیمات ارایه‌کننده و وب‌هوک</h3>
            <p className="muted">برای SMS و WhatsApp، حالت ارسال، اعتبارنامه‌ها، رمز ورودی و مسیر بازگشت وضعیت را از همین بخش تنظیم کنید.</p>
          </div>
          <div className="finance-chip-group">
            <span className="finance-chip">{deliveryProviderConfigs.length} کانال</span>
            <span className={`finance-chip ${(selectedDeliveryProviderConfig?.readiness?.configured && selectedDeliveryProviderConfig?.isActive !== false) ? 'finance-chip-emerald' : 'finance-chip-amber'}`}>
              {(selectedDeliveryProviderConfig?.readiness?.configured && selectedDeliveryProviderConfig?.isActive !== false) ? 'آماده ارسال' : 'نیازمند تکمیل'}
            </span>
          </div>
        </div>
        <div className="delivery-provider-layout">
          <div className="delivery-provider-summary-panel">
            <div className="delivery-provider-channel-list">
              {(deliveryProviderConfigs.length ? deliveryProviderConfigs : [
                { channel: 'sms', mode: 'webhook', provider: 'generic_sms_gateway', readiness: { configured: false, missingRequiredFields: [] }, source: 'environment', isActive: true },
                { channel: 'whatsapp', mode: 'webhook', provider: 'generic_whatsapp_gateway', readiness: { configured: false, missingRequiredFields: [] }, source: 'environment', isActive: true }
              ]).map((item) => (
                <button
                  key={`delivery-provider-channel-${item.channel}`}
                  type="button"
                  className={`delivery-provider-channel-item ${String(selectedDeliveryProviderChannel || '') === String(item.channel || '') ? 'selected' : ''}`}
                  onClick={() => setSelectedDeliveryProviderChannel(String(item.channel || 'sms'))}
                  data-testid={`finance-delivery-provider-channel-${item.channel}`}
                >
                  <div className="document-archive-item-head">
                    <div>
                      <strong>{DELIVERY_CHANNEL_LABELS[item.channel] || item.channel || 'کانال'}</strong>
                      <span>{DELIVERY_PROVIDER_MODE_LABELS[item.mode] || item.mode || 'provider'}</span>
                    </div>
                    <span className={`finance-chip ${(item?.readiness?.configured && item?.isActive !== false) ? 'finance-chip-emerald' : 'finance-chip-amber'}`}>
                      {(item?.readiness?.configured && item?.isActive !== false) ? 'ready' : 'draft'}
                    </span>
                  </div>
                  <div className="document-archive-meta">
                    <span>{item.provider || '-'}</span>
                    <span>{item.source === 'database' ? 'DB config' : 'ENV fallback'}</span>
                  </div>
                  {!!item?.readiness?.missingRequiredFields?.length && (
                    <div className="document-archive-meta">
                      <span>فیلدهای ناتکمیل</span>
                      <span>{item.readiness.missingRequiredFields.map((field) => DELIVERY_PROVIDER_REQUIRED_FIELD_LABELS[field] || field).join('، ')}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
            {selectedDeliveryProviderConfig ? (
              <div className="document-delivery-history delivery-provider-status-panel" data-testid="finance-delivery-provider-status">
                <div className="document-archive-item-head">
                  <div>
                    <strong>خلاصه کانال {DELIVERY_CHANNEL_LABELS[selectedDeliveryProviderConfig.channel] || selectedDeliveryProviderConfig.channel}</strong>
                    <span>{DELIVERY_PROVIDER_MODE_LABELS[selectedDeliveryProviderConfig.mode] || selectedDeliveryProviderConfig.mode || '-'}</span>
                  </div>
                  <span className="finance-chip finance-chip-muted">{selectedDeliveryProviderConfig.provider || '-'}</span>
                </div>
                <div className="receipt-meta-grid audit-meta-grid">
                  <div><span>منبع</span><strong>{selectedDeliveryProviderConfig.source === 'database' ? 'پایگاه‌داده' : 'محیط'} </strong></div>
                  <div><span>مسیر وب‌هوک</span><strong>{selectedDeliveryProviderConfig.readiness?.webhookPath || '-'}</strong></div>
                  <div><span>آدرس وب‌هوک</span><strong>{selectedDeliveryProviderConfig.readiness?.webhookUrl || '-'}</strong></div>
                  <div><span>آدرس بازگشت وضعیت</span><strong>{selectedDeliveryProviderConfig.readiness?.providerCallbackUrl || '-'}</strong></div>
                  <div><span>نسخه اعتبارنامه</span><strong>v{fmt(selectedDeliveryProviderConfig.credentialVersion || 1)}</strong></div>
                  <div><span>آخرین چرخش</span><strong>{toFaDateTime(selectedDeliveryProviderConfig.lastRotatedAt)}</strong></div>
                  <div><span>آخرین به‌روزرسانی</span><strong>{toFaDateTime(selectedDeliveryProviderConfig.updatedAt)}</strong></div>
                  <div><span>توسط</span><strong>{selectedDeliveryProviderConfig.updatedBy?.name || '-'}</strong></div>
                </div>
                <div className="finance-chip-group audit-chip-wrap">
                  {selectedDeliveryProviderConfig.isActive !== false ? (
                    <span className="finance-chip finance-chip-emerald">فعال</span>
                  ) : (
                    <span className="finance-chip finance-chip-muted">غیرفعال</span>
                  )}
                  {Object.entries(selectedDeliveryProviderConfig.fields || {}).map(([key, value]) => (
                    <span key={`delivery-provider-secret-${key}`} className={`finance-chip ${value?.configured ? 'finance-chip-muted' : 'finance-chip-amber'}`}>
                      {(DELIVERY_PROVIDER_REQUIRED_FIELD_LABELS[key] || key)}: {value?.configured ? (value?.masked || 'configured') : 'ندارد'}
                    </span>
                  ))}
                </div>
                {!!selectedDeliveryProviderMissingFields.length && (
                  <div className="delivery-template-warning-list">
                    <strong>فیلدهای ضروری تکمیل نشده</strong>
                    <p>{selectedDeliveryProviderMissingFields.map((field) => DELIVERY_PROVIDER_REQUIRED_FIELD_LABELS[field] || field).join('، ')}</p>
                  </div>
                )}
                <div className="document-delivery-history" data-testid="finance-delivery-provider-audit-trail">
                  <div className="document-archive-item-head">
                    <div>
                      <strong>تاریخچه چرخش و حسابرسی</strong>
                      <span>{selectedDeliveryProviderAuditEntries.length} رویداد</span>
                    </div>
                    <span className="finance-chip finance-chip-muted">{selectedDeliveryProviderConfig.lastRotatedBy?.name || '-'}</span>
                  </div>
                  {selectedDeliveryProviderAuditEntries.length ? (
                    <div className="document-archive-list">
                      {selectedDeliveryProviderAuditEntries.slice(0, 8).map((entry, index) => (
                        <article key={`provider-audit-${selectedDeliveryProviderConfig.channel}-${index}`} className="document-archive-item">
                          <div className="document-archive-item-head">
                            <div>
                              <strong>{DELIVERY_PROVIDER_AUDIT_ACTION_LABELS[entry.action] || entry.action || 'رویداد'}</strong>
                              <span>{toFaDateTime(entry.at)}</span>
                            </div>
                            <span className="finance-chip finance-chip-muted">v{fmt(entry.credentialVersion || selectedDeliveryProviderConfig.credentialVersion || 1)}</span>
                          </div>
                          <div className="document-archive-meta">
                            <span>{entry.by?.name || '-'}</span>
                            <span>{entry.note || 'بدون یادداشت'}</span>
                          </div>
                          <div className="finance-chip-group audit-chip-wrap">
                            {(entry.changedFields || []).map((field) => (
                              <span key={`provider-audit-change-${field}-${index}`} className="finance-chip finance-chip-muted">
                                تنظیم: {DELIVERY_PROVIDER_REQUIRED_FIELD_LABELS[field] || field}
                              </span>
                            ))}
                            {(entry.rotatedFields || []).map((field) => (
                              <span key={`provider-audit-rotate-${field}-${index}`} className="finance-chip finance-chip-amber">
                                rotation: {DELIVERY_PROVIDER_REQUIRED_FIELD_LABELS[field] || field}
                              </span>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">هنوز رویداد چرخش یا حسابرسی برای این کانال ثبت نشده است.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="muted">هنوز تنظیمات ارایه‌کننده برای این بخش دریافت نشده است.</p>
            )}
          </div>

          <div className="delivery-provider-form-panel" data-testid="finance-delivery-provider-form">
            <div className="finance-toolbar">
              <label className="finance-inline-filter">
                <span>کانال</span>
                <select
                  value={selectedDeliveryProviderChannel}
                  onChange={(e) => setSelectedDeliveryProviderChannel(e.target.value)}
                  data-testid="finance-delivery-provider-channel-select"
                >
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>حالت</span>
                <select
                  value={deliveryProviderForm.mode}
                  onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, mode: e.target.value }))}
                  data-testid="finance-delivery-provider-mode"
                >
                  {selectedDeliveryProviderModeOptions.map((item) => (
                    <option key={`delivery-provider-mode-${selectedDeliveryProviderChannel}-${item}`} value={item}>
                      {DELIVERY_PROVIDER_MODE_LABELS[item] || item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter finance-inline-check">
                <span>فعال</span>
                <input
                  type="checkbox"
                  checked={deliveryProviderForm.isActive}
                  onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  data-testid="finance-delivery-provider-active"
                />
              </label>
            </div>

            <div className="finance-toolbar">
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>نام ارایه‌کننده</span>
                <input
                  value={deliveryProviderForm.provider}
                  onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, provider: e.target.value }))}
                  placeholder={selectedDeliveryProviderConfig?.provider || 'مثلاً twilio_sms_gateway'}
                  data-testid="finance-delivery-provider-name"
                />
              </label>
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>شناسه فرستنده</span>
                <input
                  value={deliveryProviderForm.fromHandle}
                  onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, fromHandle: e.target.value }))}
                  placeholder={selectedDeliveryProviderConfig?.fromHandle || '+93700111222'}
                  data-testid="finance-delivery-provider-from-handle"
                />
              </label>
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>آدرس خدمات</span>
                <input
                  value={deliveryProviderForm.apiBaseUrl}
                  onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, apiBaseUrl: e.target.value }))}
                  placeholder={selectedDeliveryProviderConfig?.apiBaseUrl || 'https://...'}
                  data-testid="finance-delivery-provider-api-base"
                />
              </label>
            </div>

            {showDeliveryProviderWebhookFields ? (
              <div className="finance-toolbar">
                <label className="finance-inline-filter finance-inline-filter-wide">
                  <span>آدرس وب‌هوک</span>
                  <input
                    value={deliveryProviderForm.webhookUrl}
                    onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, webhookUrl: e.target.value }))}
                    placeholder={selectedDeliveryProviderConfig?.webhookUrl || 'https://provider.example.com/send'}
                    data-testid="finance-delivery-provider-webhook-url"
                  />
                </label>
                <label className="finance-inline-filter finance-inline-filter-wide">
                  <span>آدرس بازگشت وضعیت</span>
                  <input
                    value={deliveryProviderForm.statusWebhookUrl}
                    onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, statusWebhookUrl: e.target.value }))}
                    placeholder={selectedDeliveryProviderConfig?.statusWebhookUrl || (selectedDeliveryProviderConfig?.readiness?.providerCallbackUrl || '')}
                    data-testid="finance-delivery-provider-status-webhook-url"
                  />
                </label>
              </div>
            ) : null}

            {showDeliveryProviderTwilioFields ? (
              <div className="finance-toolbar">
                <label className="finance-inline-filter finance-inline-filter-wide">
                  <span>شناسه حساب</span>
                  <input
                    value={deliveryProviderForm.accountSid}
                    onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, accountSid: e.target.value }))}
                    placeholder={selectedDeliveryProviderConfig?.fields?.accountSid?.masked || 'بدون تغییر'}
                    data-testid="finance-delivery-provider-account-sid"
                  />
                </label>
                <label className="finance-inline-filter finance-inline-filter-wide">
                  <span>رمز احراز هویت</span>
                  <input
                    value={deliveryProviderForm.authToken}
                    onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, authToken: e.target.value }))}
                    placeholder={selectedDeliveryProviderConfig?.fields?.authToken?.masked || 'بدون تغییر'}
                    data-testid="finance-delivery-provider-auth-token"
                  />
                </label>
              </div>
            ) : null}

            {showDeliveryProviderMetaFields ? (
              <div className="finance-toolbar">
                <label className="finance-inline-filter finance-inline-filter-wide">
                  <span>رمز دسترسی</span>
                  <input
                    value={deliveryProviderForm.accessToken}
                    onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, accessToken: e.target.value }))}
                    placeholder={selectedDeliveryProviderConfig?.fields?.accessToken?.masked || 'بدون تغییر'}
                    data-testid="finance-delivery-provider-access-token"
                  />
                </label>
                <label className="finance-inline-filter finance-inline-filter-wide">
                  <span>شناسه شماره</span>
                  <input
                    value={deliveryProviderForm.phoneNumberId}
                    onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, phoneNumberId: e.target.value }))}
                    placeholder={selectedDeliveryProviderConfig?.fields?.phoneNumberId?.masked || 'بدون تغییر'}
                    data-testid="finance-delivery-provider-phone-number-id"
                  />
                </label>
              </div>
            ) : null}

            <div className="finance-toolbar">
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>رمز وب‌هوک</span>
                <input
                  value={deliveryProviderForm.webhookToken}
                  onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, webhookToken: e.target.value }))}
                  placeholder={selectedDeliveryProviderConfig?.fields?.webhookToken?.masked || 'در صورت نیاز برای callback امن'}
                  data-testid="finance-delivery-provider-webhook-token"
                />
              </label>
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>یادداشت</span>
                <input
                  value={deliveryProviderForm.note}
                  onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="مثلاً provider اصلی ماه جدید"
                  data-testid="finance-delivery-provider-note"
                />
              </label>
            </div>

            <div className="finance-toolbar">
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>یادداشت چرخش</span>
                <input
                  value={deliveryProviderForm.rotationNote}
                  onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, rotationNote: e.target.value }))}
                  placeholder="مثلاً تعویض credential برای شروع ماه جدید"
                  data-testid="finance-delivery-provider-rotation-note"
                />
              </label>
            </div>

            <div className="finance-toolbar">
              <button
                type="button"
                className="primary"
                onClick={saveDeliveryProviderConfig}
                disabled={busy}
                data-testid="finance-delivery-provider-save"
              >
                ذخیره تنظیمات provider
              </button>
              <button
                type="button"
                className="secondary"
                onClick={rotateDeliveryProviderCredentials}
                disabled={busy}
                data-testid="finance-delivery-provider-rotate"
              >
                ثبت Rotation Credential
              </button>
            </div>
          </div>
        </div>
      </div>}

      {false && <div className="finance-card" data-finance-section="reports settings" data-testid="finance-delivery-campaign-card">
        <div className="finance-card-head">
          <div>
            <h3>کمپاین و اتوماسیون ارسال</h3>
            <p className="muted">ارسال زمان‌بندی‌شده اسناد آرشیف‌شده، تلاش دوباره روی موارد ناموفق، و اجرای صف آماده را از همین‌جا مدیریت کنید.</p>
          </div>
          <div className="finance-chip-group">
            <span className="finance-chip">{deliveryCampaigns.length} کمپاین</span>
            <span className="finance-chip finance-chip-muted">{deliveryCampaigns.filter((item) => item?.status === 'active').length} فعال</span>
          </div>
        </div>
        <div className="finance-toolbar">
          <label className="finance-inline-filter">
            <span>وضعیت ارسال</span>
            <select
              value={deliveryOpsStatusFilter}
              onChange={(e) => setDeliveryOpsStatusFilter(e.target.value)}
              data-testid="finance-delivery-status-filter"
            >
              <option value="all">همه</option>
              {Object.entries(DELIVERY_EVENT_STATUS_LABELS).map(([value, label]) => (
                <option key={`delivery-status-filter-${value}`} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="finance-inline-filter">
            <span>ارایه‌کننده</span>
            <select
              value={deliveryOpsProviderFilter}
              onChange={(e) => setDeliveryOpsProviderFilter(e.target.value)}
              data-testid="finance-delivery-provider-filter"
            >
              <option value="all">همه</option>
              {deliveryProviderOptions.map((item) => (
                <option key={`delivery-provider-filter-${item}`} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="finance-inline-filter">
            <span>کد خطا</span>
            <select
              value={deliveryOpsFailureFilter}
              onChange={(e) => setDeliveryOpsFailureFilter(e.target.value)}
              data-testid="finance-delivery-failure-filter"
            >
              <option value="all">همه</option>
              {deliveryFailureOptions.map((item) => (
                <option key={`delivery-failure-filter-${item}`} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="finance-inline-filter">
            <span>قابلیت تلاش دوباره</span>
            <select
              value={deliveryOpsRetryableFilter}
              onChange={(e) => setDeliveryOpsRetryableFilter(e.target.value)}
              data-testid="finance-delivery-retryability-filter"
            >
              <option value="all">همه</option>
              <option value="retryable">قابل تلاش دوباره</option>
              <option value="blocked">مسدود</option>
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            onClick={runDeliveryCampaignQueue}
            disabled={busy}
            data-testid="finance-delivery-campaign-run-due"
          >
            اجرای صف آماده
          </button>
        </div>
        {deliveryAnalytics?.summary ? (
          <div className="delivery-analytics-grid" data-testid="finance-delivery-analytics">
            <article className="delivery-analytics-card">
              <span>کمپاین‌ها</span>
              <strong>{fmt(deliveryAnalytics.summary.campaignsTotal || 0)}</strong>
              <small>{fmt(deliveryAnalytics.summary.campaignsActive || 0)} فعال / {fmt(deliveryAnalytics.summary.campaignsPaused || 0)} متوقف</small>
            </article>
            <article className="delivery-analytics-card">
              <span>تحویل‌ها</span>
              <strong>{fmt(deliveryAnalytics.summary.deliveriesTotal || 0)}</strong>
              <small>{fmt(deliveryAnalytics.summary.failedQueueCount || 0)} مورد در صف retry / {fmt(deliveryAnalytics.summary.recoveryQueueCount || 0)} مورد در recovery</small>
            </article>
            <article className="delivery-analytics-card">
              <span>کانال‌ها</span>
              <strong>{fmt(deliveryAnalytics.summary.byChannel?.email || 0)} Email</strong>
              <small>
                {fmt(deliveryAnalytics.summary.byChannel?.sms || 0)} SMS / {fmt(deliveryAnalytics.summary.byChannel?.whatsapp || 0)} WhatsApp / {fmt(deliveryAnalytics.summary.byChannel?.portal || 0)} Portal
              </small>
            </article>
            <article className="delivery-analytics-card">
              <span>وضعیت اجرا</span>
              <strong>{fmt(deliveryAnalytics.summary.byStatus?.failed || 0)} ناموفق</strong>
              <small>{fmt(deliveryAnalytics.summary.awaitingWebhookCount || 0)} مورد در انتظار callback / {fmt(deliveryAnalytics.summary.dueCampaigns || 0)} کمپاین آماده اجرا</small>
            </article>
          </div>
        ) : null}
        {deliveryAnalytics?.summary ? (
          <div className="delivery-operations-grid">
            <div className="delivery-operations-panel" data-testid="finance-delivery-provider-breakdown">
              <div className="document-archive-item-head">
                <div>
                  <strong>برش ارایه‌کننده</strong>
                  <span>توزیع ارسال‌ها به تفکیک درگاه یا ارایه‌کننده</span>
                </div>
                <span className="finance-chip finance-chip-muted">{fmt(deliveryProviderBreakdown.length)} ارایه‌کننده</span>
              </div>
              <div className="finance-subcard-list">
                <div className="mini-row">
                  <span>آماده تلاش دوباره</span>
                  <strong>{fmt(deliveryAnalytics.summary.readyToRetryCount || 0)}</strong>
                </div>
                <div className="mini-row">
                  <span>در انتظار تلاش دوباره</span>
                  <strong>{fmt(deliveryAnalytics.summary.waitingRetryCount || 0)}</strong>
                </div>
                <div className="mini-row">
                  <span>تلاش دوباره مسدود</span>
                  <strong>{fmt(deliveryAnalytics.summary.blockedRetryCount || 0)}</strong>
                </div>
                <div className="mini-row">
                  <span>در انتظار بازگشت وضعیت</span>
                  <strong>{fmt(deliveryAnalytics.summary.awaitingWebhookCount || 0)}</strong>
                </div>
                {deliveryProviderBreakdown.slice(0, 4).map(([key, count]) => (
                  <div key={`delivery-provider-breakdown-${key}`} className="mini-row">
                    <span>{key}</span>
                    <strong>{fmt(count)}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="delivery-operations-panel" data-testid="finance-delivery-failure-breakdown">
              <div className="document-archive-item-head">
                <div>
                  <strong>ناحیه‌های خطا</strong>
                  <span>کدهای خطای غالب برای تیم عملیاتی</span>
                </div>
                <span className={`finance-chip ${deliveryLeadFailure ? 'finance-chip-amber' : 'finance-chip-muted'}`}>
                  {deliveryLeadFailure ? `${deliveryLeadFailure[0]} | ${fmt(deliveryLeadFailure[1])}` : 'بدون failure code'}
                </span>
              </div>
              {!deliveryFailureBreakdown.length ? (
                <p className="muted">در فیلتر فعلی، خطای ثبت‌شده‌ای دیده نمی‌شود.</p>
              ) : (
                <div className="finance-subcard-list">
                  {deliveryFailureBreakdown.slice(0, 6).map(([key, count]) => (
                    <div key={`delivery-failure-breakdown-${key}`} className="mini-row">
                      <span>{key}</span>
                      <strong>{fmt(count)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="delivery-operations-panel" data-testid="finance-delivery-recent-failures">
              <div className="document-archive-item-head">
                <div>
                  <strong>موارد اخیر عملیاتی</strong>
                  <span>آخرین موارد صف برای ارسال دوباره یا رفع اشکال</span>
                </div>
                <span className="finance-chip finance-chip-muted">{fmt(deliveryRecentFailures.length)} مورد</span>
              </div>
              {!deliveryRecentFailures.length ? (
                <p className="muted">مورد عملیاتی برای فیلتر فعلی موجود نیست.</p>
              ) : (
                <div className="finance-subcard-list">
                  {deliveryRecentFailures.slice(0, 5).map((item, index) => (
                    <div key={`delivery-recent-failure-${item.archiveId || index}-${index}`} className="delivery-ops-entry">
                      <div className="document-archive-item-head">
                        <div>
                          <strong>{item.documentNo || 'سند مالی'}</strong>
                          <span>{item.campaignName || item.provider || 'delivery'}</span>
                        </div>
                        <span className={`finance-chip ${item.retryable ? 'finance-chip-amber' : 'finance-chip-muted'}`}>
                          {item.retryable ? 'retryable' : 'blocked'}
                        </span>
                      </div>
                      <div className="document-archive-meta">
                        <span>{item.provider || 'provider'}</span>
                        <span>{item.lastFailureCode || item.providerStatus || '-'}</span>
                      </div>
                      <div className="document-archive-meta">
                        <span>{item.recipient || 'بدون گیرنده مشخص'}</span>
                        <span>{toFaDateTime(item.nextRetryAt || item.lastAttemptAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        <div className="delivery-campaign-layout">
          <div className="delivery-campaign-panel">
            <div className="finance-card-head">
              <div>
                <h4>کمپاین جدید</h4>
                <p className="muted">برای استیتمنت گروهی، بسته بستن ماه یا استیتمنت‌های انفرادی کمپاین بسازید.</p>
              </div>
            </div>
            <div className="delivery-template-workspace">
              <div className="delivery-template-catalog" data-testid="finance-delivery-template-variable-catalog">
                <div className="document-archive-item-head">
                  <div>
                    <strong>کاتالوگ متغیرهای قالب</strong>
                    <span>{fmt(deliveryTemplateVariables.length)} متغیر قابل استفاده</span>
                  </div>
                  {!!deliveryTemplateUsedVariables.length && (
                    <span className="finance-chip finance-chip-muted">استفاده‌شده: {fmt(deliveryTemplateUsedVariables.length)}</span>
                  )}
                </div>
                {!deliveryTemplateVariables.length ? (
                  <p className="muted">هنوز کاتالوگ متغیرهای قالب دریافت نشده است.</p>
                ) : (
                  <div className="delivery-template-variable-list">
                    {deliveryTemplateVariables.map((item) => {
                      const isUsed = deliveryTemplateUsedVariables.includes(String(item?.key || ''));
                      return (
                        <article
                          key={`delivery-template-variable-${item.key}`}
                          className={`delivery-template-variable-item ${isUsed ? 'used' : ''}`}
                        >
                          <div className="document-archive-item-head">
                            <div>
                              <strong>{item.label || item.key}</strong>
                              <span className="document-archive-code">{`{{${item.key}}}`}</span>
                            </div>
                            {isUsed ? <span className="finance-chip finance-chip-emerald">استفاده شده</span> : null}
                          </div>
                          <p>{item.description || 'بدون شرح'}</p>
                          {item.sample ? <span className="muted">نمونه: {item.sample}</span> : null}
                        </article>
                      );
                    })}
                  </div>
                )}
                {!!deliveryTemplateUnknownVariables.length && (
                  <div className="delivery-template-warning-list" data-testid="finance-delivery-template-preview-errors">
                    <strong>جای‌نگهدار نامعتبر</strong>
                    <p>{deliveryTemplateUnknownVariables.join('، ')}</p>
                  </div>
                )}
              </div>

              <div className="delivery-template-preview-panel" data-testid="finance-delivery-template-preview">
                <div className="document-archive-item-head">
                  <div>
                    <strong>پیش‌نمایش زنده پیام</strong>
                    <span>{deliveryTemplatePreview?.sampleSource === 'archive' ? 'نمونه از آرشیف واقعی' : 'نمونه synthetic'}</span>
                  </div>
                  {deliveryTemplatePreviewBusy ? <span className="finance-chip finance-chip-muted">در حال به‌روزرسانی</span> : null}
                </div>
                {!shouldPreviewDeliveryTemplate ? (
                  <p className="muted">برای دیدن پیش‌نمایش، یک قالب انتخاب کنید یا موضوع/متن را وارد کنید.</p>
                ) : deliveryTemplatePreviewError ? (
                  <div className="delivery-template-warning-list" data-testid="finance-delivery-template-preview-errors">
                    <strong>خطا در پیش‌نمایش</strong>
                    <p>{deliveryTemplatePreviewError}</p>
                  </div>
                ) : !deliveryTemplatePreview ? (
                  <p className="muted">پیش‌نمایش آماده نشده است.</p>
                ) : (
                  <>
                    <div className="receipt-meta-grid audit-meta-grid">
                      <div><span>سند نمونه</span><strong>{deliveryTemplatePreview.sample?.documentNo || '-'}</strong></div>
                      <div><span>نوع سند</span><strong>{deliveryTemplatePreview.sample?.documentType || '-'}</strong></div>
                      <div><span>موضوع</span><strong>{deliveryTemplatePreview.sample?.subjectName || '-'}</strong></div>
                      <div><span>صنف</span><strong>{deliveryTemplatePreview.sample?.classTitle || '-'}</strong></div>
                      <div><span>سال تعلیمی</span><strong>{deliveryTemplatePreview.sample?.academicYearTitle || '-'}</strong></div>
                      <div><span>ماه</span><strong>{deliveryTemplatePreview.sample?.monthKey ? toFaMonthKey(deliveryTemplatePreview.sample.monthKey) : '-'}</strong></div>
                    </div>
                    <div className="receipt-meta-grid audit-meta-grid" data-testid="finance-delivery-template-preview-rollout">
                      <div><span>رکورد آرشیف</span><strong>{fmt(deliveryTemplatePreview.rolloutPreview?.matchedArchiveCount || 0)}</strong></div>
                      <div><span>محدوده</span><strong>{deliveryTemplatePreview.rolloutPreview?.scope?.documentType || deliveryTemplatePreview.sample?.documentType || '-'}</strong></div>
                      <div>
                        <span>کانال‌های پیشنهادی</span>
                        <strong>
                          {(deliveryTemplatePreview.rolloutPreview?.recommendedChannels || []).map((item) => (
                            DELIVERY_CHANNEL_LABELS[item] || item
                          )).join('، ') || 'همه'}
                        </strong>
                      </div>
                    </div>
                    <div className="receipt-note-box">
                      <span>موضوع رندرشده</span>
                      <p>{deliveryTemplatePreview.renderedSubject || '-'}</p>
                    </div>
                    <div className="receipt-note-box">
                      <span>متن رندرشده</span>
                      <p className="delivery-template-preview-body">{deliveryTemplatePreview.renderedBody || '-'}</p>
                    </div>
                    {!!deliveryTemplatePreview.usedVariables?.length && (
                      <div className="finance-chip-group audit-chip-wrap">
                        {deliveryTemplatePreview.usedVariables.map((item) => (
                          <span key={`delivery-template-used-${item}`} className="finance-chip finance-chip-muted">{`{{${item}}}`}</span>
                        ))}
                      </div>
                    )}
                    {!!deliveryTemplatePreview.warnings?.length && (
                      <div className="delivery-template-warning-list">
                        <strong>یادداشت‌های پیش‌نمایش</strong>
                        {deliveryTemplatePreview.warnings.map((item, index) => (
                          <p key={`delivery-template-warning-${index}`}>{item}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="finance-toolbar">
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>نام کمپاین</span>
                <input
                  value={deliveryCampaignForm.name}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="مثلاً ارسال ماهانه استیتمنت صنف دهم"
                  data-testid="finance-delivery-campaign-name"
                />
              </label>
              <label className="finance-inline-filter">
                <span>نوع سند</span>
                <select
                  value={deliveryCampaignForm.documentType}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    setDeliveryCampaignForm((prev) => ({
                      ...prev,
                      documentType: nextType,
                      includeLinkedAudience: nextType === 'batch_statement_pack' ? false : prev.includeLinkedAudience
                    }));
                  }}
                  data-testid="finance-delivery-campaign-document-type"
                >
                  {Object.entries(DOCUMENT_ARCHIVE_TYPE_LABELS).map(([value, label]) => (
                    <option key={`delivery-campaign-type-${value}`} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>کانال ارسال</span>
                <select
                  value={deliveryCampaignForm.channel}
                  onChange={(e) => {
                    const nextChannel = e.target.value;
                    setDeliveryCampaignForm((prev) => ({
                      ...prev,
                      channel: nextChannel,
                      includeLinkedAudience: nextChannel === 'portal'
                        ? (prev.documentType === 'batch_statement_pack' ? false : true)
                        : prev.includeLinkedAudience
                    }));
                  }}
                  data-testid="finance-delivery-campaign-channel"
                >
                  {Object.entries(DELIVERY_CHANNEL_LABELS).map(([value, label]) => (
                    <option key={`delivery-campaign-channel-${value}`} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="finance-toolbar">
              <label className="finance-inline-filter">
                <span>صنف</span>
                <select
                  value={deliveryCampaignForm.classId}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, classId: e.target.value }))}
                >
                  <option value="">بدون محدودیت</option>
                  {classOptions.map((item) => (
                    <option key={`delivery-campaign-class-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>سال تعلیمی</span>
                <select
                  value={deliveryCampaignForm.academicYearId}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, academicYearId: e.target.value }))}
                >
                  <option value="">بدون محدودیت</option>
                  {academicYears.map((item) => (
                    <option key={`delivery-campaign-year-${item.id}`} value={item.id}>{getAcademicYearOptionLabel(item)}</option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>ماه</span>
                <input
                  value={deliveryCampaignForm.monthKey}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, monthKey: e.target.value }))}
                  placeholder="YYYY-MM"
                />
                <small>{deliveryCampaignForm.monthKey ? `هجری شمسی: ${toFaMonthKey(deliveryCampaignForm.monthKey)}` : 'ماه را به شکل YYYY-MM وارد کنید.'}</small>
              </label>
            </div>
            <div className="finance-toolbar">
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>{DELIVERY_CHANNEL_INPUT_LABELS[deliveryCampaignForm.channel] || 'گیرنده‌های مقصد'}</span>
                <input
                  value={deliveryCampaignForm.recipientHandles}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, recipientHandles: e.target.value }))}
                  placeholder={DELIVERY_CHANNEL_INPUT_PLACEHOLDERS[deliveryCampaignForm.channel] || ''}
                  disabled={deliveryCampaignForm.channel === 'portal'}
                  data-testid="finance-delivery-campaign-handles"
                />
              </label>
              <label className="finance-inline-filter">
                <span>قالب پیام</span>
                <select
                  value={deliveryCampaignForm.messageTemplateKey}
                  onChange={(e) => {
                    const nextKey = e.target.value;
                    const nextTemplate = deliveryTemplates.find((item) => String(item?.key || '') === nextKey) || null;
                    const nextVersion = String(nextTemplate?.draftVersionNumber || nextTemplate?.publishedVersionNumber || nextTemplate?.versions?.[0]?.versionNumber || '');
                    const nextVersionItem = (nextTemplate?.versions || []).find((item) => (
                      String(item?.versionNumber || '') === nextVersion
                    )) || nextTemplate?.publishedVersion || nextTemplate?.draftVersion || null;
                    setDeliveryCampaignForm((prev) => ({
                      ...prev,
                      messageTemplateKey: nextKey,
                      messageTemplateSubject: nextVersionItem?.subject || nextTemplate?.defaultSubject || '',
                      messageTemplateBody: nextVersionItem?.body || nextTemplate?.defaultBody || ''
                    }));
                    setSelectedDeliveryTemplateVersionNumber(nextVersion);
                    setDeliveryTemplateChangeNote('');
                  }}
                  data-testid="finance-delivery-campaign-template"
                >
                  <option value="">عمومی</option>
                  {deliveryTemplates.map((item) => (
                    <option key={`delivery-template-${item.key}`} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>یادداشت کمپاین</span>
                <input
                  value={deliveryCampaignForm.note}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="مثلاً ارسال خودکار پایان هر ماه"
                />
              </label>
            </div>
            {selectedDeliveryTemplate ? (
              <p className="muted">
                {selectedDeliveryTemplate.description}
                {' '}| کانال‌های پیشنهادی: {(selectedDeliveryTemplate.recommendedChannels || []).map((item) => DELIVERY_CHANNEL_LABELS[item] || item).join('، ') || 'همه'}
              </p>
            ) : null}
            {selectedDeliveryTemplate ? (
              <div className="document-delivery-history delivery-template-version-panel" data-testid="finance-delivery-template-version-manager">
                <div className="document-archive-item-head">
                  <div>
                    <strong>مدیریت نسخه‌های قالب</strong>
                    <span>
                      published v{fmt(selectedDeliveryTemplate.publishedVersionNumber || 1)}
                      {selectedDeliveryTemplate.draftVersionNumber ? ` | draft v${fmt(selectedDeliveryTemplate.draftVersionNumber)}` : ''}
                    </span>
                  </div>
                  <div className="finance-chip-group">
                    <span className="finance-chip finance-chip-muted">{(selectedDeliveryTemplate.versions || []).length} نسخه</span>
                    {selectedDeliveryTemplate.hasCustomizations ? (
                      <span className="finance-chip finance-chip-emerald">سفارشی</span>
                    ) : (
                      <span className="finance-chip finance-chip-muted">سیستمی</span>
                    )}
                  </div>
                </div>
                {selectedDeliveryTemplateVersion ? (
                  <div className="finance-chip-group delivery-live-status-summary" data-testid="finance-delivery-template-governance-summary">
                    <span className="finance-chip finance-chip-muted">پیش‌نویس: {fmt(selectedDeliveryTemplate.approvalSummary?.draft || 0)}</span>
                    <span className="finance-chip finance-chip-amber">بازبینی: {fmt(selectedDeliveryTemplate.approvalSummary?.pendingReview || 0)}</span>
                    <span className="finance-chip finance-chip-emerald">تایید: {fmt(selectedDeliveryTemplate.approvalSummary?.approved || 0)}</span>
                    <span className="finance-chip finance-chip-rose">رد: {fmt(selectedDeliveryTemplate.approvalSummary?.rejected || 0)}</span>
                  </div>
                ) : null}
                <div className="finance-toolbar">
                  <label className="finance-inline-filter">
                    <span>نسخه انتخابی</span>
                    <select
                      value={selectedDeliveryTemplateVersionNumber}
                      onChange={(e) => setSelectedDeliveryTemplateVersionNumber(e.target.value)}
                      data-testid="finance-delivery-template-version-select"
                    >
                      {(selectedDeliveryTemplate.versions || []).map((item) => (
                        <option key={`delivery-template-version-${selectedDeliveryTemplate.key}-${item.versionNumber}`} value={String(item.versionNumber)}>
                          {`v${item.versionNumber} | ${DELIVERY_TEMPLATE_VERSION_STATUS_LABELS[item.status] || item.status || '-'} | ${DELIVERY_TEMPLATE_APPROVAL_STAGE_LABELS[item.approvalStage] || item.approvalStage || '-'}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="finance-inline-filter finance-inline-filter-wide">
                    <span>نوت تغییر</span>
                    <input
                      value={deliveryTemplateChangeNote}
                      onChange={(e) => setDeliveryTemplateChangeNote(e.target.value)}
                      placeholder="خلاصه تغییرات یا دلیل publish/rollback"
                      data-testid="finance-delivery-template-change-note"
                    />
                  </label>
                </div>
                {selectedDeliveryTemplateVersion ? (
                  <div className="receipt-meta-grid audit-meta-grid">
                    <div><span>وضعیت</span><strong>{DELIVERY_TEMPLATE_VERSION_STATUS_LABELS[selectedDeliveryTemplateVersion.status] || selectedDeliveryTemplateVersion.status || '-'}</strong></div>
                    <div><span>نسخه</span><strong>{`v${fmt(selectedDeliveryTemplateVersion.versionNumber || 0)}`}</strong></div>
                    <div><span>مرحله تایید</span><strong>{DELIVERY_TEMPLATE_APPROVAL_STAGE_LABELS[selectedDeliveryTemplateApprovalStage] || selectedDeliveryTemplateApprovalStage || '-'}</strong></div>
                    <div><span>سازنده</span><strong>{selectedDeliveryTemplateVersion.createdBy?.name || '-'}</strong></div>
                    <div><span>تاریخ</span><strong>{toFaDateTime(selectedDeliveryTemplateVersion.createdAt || selectedDeliveryTemplateVersion.publishedAt || selectedDeliveryTemplateVersion.archivedAt)}</strong></div>
                    <div><span>درخواست بازبینی</span><strong>{selectedDeliveryTemplateVersion.reviewRequestedBy?.name || toFaDateTime(selectedDeliveryTemplateVersion.reviewRequestedAt)}</strong></div>
                    <div><span>تاییدکننده</span><strong>{selectedDeliveryTemplateVersion.approvedBy?.name || '-'}</strong></div>
                    <div><span>ردکننده</span><strong>{selectedDeliveryTemplateVersion.rejectedBy?.name || '-'}</strong></div>
                  </div>
                ) : null}
                <div className="finance-toolbar">
                  <button
                    type="button"
                    className="secondary"
                    onClick={loadSelectedTemplateVersionIntoForm}
                    disabled={!selectedDeliveryTemplateVersion}
                    data-testid="finance-delivery-template-load-version"
                  >
                    بارگذاری نسخه
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={saveDeliveryTemplateDraft}
                    disabled={busy || !deliveryCampaignForm.messageTemplateKey || !!deliveryTemplateUnknownVariables.length}
                    data-testid="finance-delivery-template-save-draft"
                  >
                    ذخیره draft
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={requestDeliveryTemplateReview}
                    disabled={busy || !selectedDeliveryTemplateVersion || selectedDeliveryTemplateVersion.canRequestReview !== true}
                    data-testid="finance-delivery-template-request-review"
                  >
                    ارسال برای بازبینی
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={approveDeliveryTemplateVersion}
                    disabled={busy || !selectedDeliveryTemplateVersion || selectedDeliveryTemplateVersion.canApprove !== true}
                    data-testid="finance-delivery-template-approve"
                  >
                    تایید نسخه
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={rejectDeliveryTemplateVersion}
                    disabled={busy || !selectedDeliveryTemplateVersion || selectedDeliveryTemplateVersion.canReject !== true}
                    data-testid="finance-delivery-template-reject"
                  >
                    رد نسخه
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={publishDeliveryTemplateDraft}
                    disabled={busy || !selectedDeliveryTemplateVersion || selectedDeliveryTemplateVersion.canPublish !== true}
                    data-testid="finance-delivery-template-publish-draft"
                  >
                    انتشار نسخه تاییدشده
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={rollbackDeliveryTemplateVersion}
                    disabled={busy || !selectedDeliveryTemplateVersion || String(selectedDeliveryTemplateVersion.status || '') === 'draft' || Number(selectedDeliveryTemplateVersion.versionNumber || 0) === Number(selectedDeliveryTemplate.publishedVersionNumber || 1)}
                    data-testid="finance-delivery-template-rollback"
                  >
                    rollback
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={archiveSelectedDeliveryTemplateVersion}
                    disabled={busy || !selectedDeliveryTemplateVersion || Number(selectedDeliveryTemplateVersion.versionNumber || 0) <= 1 || String(selectedDeliveryTemplateVersion.status || '') === 'published'}
                    data-testid="finance-delivery-template-archive"
                  >
                    archive version
                  </button>
                </div>
                <div className="receipt-meta-grid audit-meta-grid" data-testid="finance-delivery-template-rollout-metrics">
                  <div><span>کمپاین‌ها</span><strong>{fmt(selectedDeliveryTemplateRolloutMetrics.totalCampaigns || 0)}</strong></div>
                  <div><span>فعال</span><strong>{fmt(selectedDeliveryTemplateRolloutMetrics.activeCampaigns || 0)}</strong></div>
                  <div><span>خودکار</span><strong>{fmt(selectedDeliveryTemplateRolloutMetrics.automatedCampaigns || 0)}</strong></div>
                  <div><span>تحویل موفق</span><strong>{fmt(selectedDeliveryTemplateRolloutMetrics.deliveredTargets || 0)}</strong></div>
                  <div><span>ناموفق</span><strong>{fmt(selectedDeliveryTemplateRolloutMetrics.failedTargets || 0)}</strong></div>
                  <div><span>آخرین استفاده</span><strong>{toFaDateTime(selectedDeliveryTemplateRolloutMetrics.lastUsedAt)}</strong></div>
                </div>
                {!!Object.keys(selectedDeliveryTemplateRolloutMetrics.byChannel || {}).length && (
                  <div className="finance-chip-group delivery-live-status-summary">
                    {Object.entries(selectedDeliveryTemplateRolloutMetrics.byChannel || {}).map(([key, count]) => (
                      <span key={`delivery-template-rollout-${selectedDeliveryTemplate.key}-${key}`} className="finance-chip finance-chip-muted">
                        {(DELIVERY_CHANNEL_LABELS[key] || key)}: {fmt(count)}
                      </span>
                    ))}
                  </div>
                )}
                {(selectedDeliveryTemplate.history || []).length ? (
                  <div className="finance-subcard-list">
                    {(selectedDeliveryTemplate.history || []).slice(0, 4).map((entry, index) => (
                      <div key={`delivery-template-history-${selectedDeliveryTemplate.key}-${index}`} className="mini-row">
                        <span>
                          {[
                            DELIVERY_TEMPLATE_HISTORY_ACTION_LABELS[entry?.action] || entry?.action || '',
                            entry?.versionNumber ? `v${entry.versionNumber}` : '',
                            entry?.by?.name || ''
                          ].filter(Boolean).join(' | ')}
                        </span>
                        <span>{toFaDateTime(entry?.at)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="finance-toolbar finance-toolbar-stack">
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>موضوع قالب</span>
                <input
                  value={deliveryCampaignForm.messageTemplateSubject}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, messageTemplateSubject: e.target.value }))}
                  placeholder="مثلاً Finance statement {{documentNo}}"
                  data-testid="finance-delivery-campaign-template-subject"
                />
              </label>
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>متن قالب</span>
                <textarea
                  rows={4}
                  value={deliveryCampaignForm.messageTemplateBody}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, messageTemplateBody: e.target.value }))}
                  placeholder="از متغیرهایی مثل {{documentNo}}، {{subjectName}}، {{verificationUrl}} و {{note}} استفاده کنید."
                  data-testid="finance-delivery-campaign-template-body"
                />
              </label>
            </div>
            <div className="finance-toolbar">
                <label className="finance-inline-filter finance-inline-check">
                  <span>اطلاع به گیرندگان مرتبط</span>
                  <input
                    type="checkbox"
                    checked={deliveryCampaignForm.includeLinkedAudience}
                    disabled={deliveryCampaignForm.documentType === 'batch_statement_pack' || deliveryCampaignForm.channel === 'portal'}
                    onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, includeLinkedAudience: e.target.checked }))}
                  />
                </label>
              <label className="finance-inline-filter finance-inline-check">
                <span>اتوماسیون فعال</span>
                <input
                  type="checkbox"
                  checked={deliveryCampaignForm.automationEnabled}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, automationEnabled: e.target.checked }))}
                />
              </label>
              <label className="finance-inline-filter finance-inline-check">
                <span>تلاش دوباره موارد ناموفق</span>
                <input
                  type="checkbox"
                  checked={deliveryCampaignForm.retryFailed}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, retryFailed: e.target.checked }))}
                />
              </label>
              <label className="finance-inline-filter">
                <span>فاصله اجرا (ساعت)</span>
                <input
                  type="number"
                  min="6"
                  max="720"
                  value={deliveryCampaignForm.intervalHours}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, intervalHours: e.target.value }))}
                />
              </label>
              <label className="finance-inline-filter">
                <span>حداکثر سند در هر اجرا</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={deliveryCampaignForm.maxDocumentsPerRun}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, maxDocumentsPerRun: e.target.value }))}
                />
              </label>
              <button
                type="button"
                onClick={createDeliveryCampaign}
                disabled={busy}
                data-testid="finance-delivery-campaign-save"
              >
                ثبت کمپاین
              </button>
            </div>
          </div>

          <div className="delivery-campaign-panel">
            <div className="finance-toolbar">
              <label className="finance-inline-filter">
                <span>وضعیت</span>
                <select
                  value={deliveryCampaignStatusFilter}
                  onChange={(e) => setDeliveryCampaignStatusFilter(e.target.value)}
                >
                  <option value="all">همه</option>
                  <option value="active">فعال</option>
                  <option value="paused">متوقف</option>
                </select>
              </label>
            </div>

            {!filteredDeliveryCampaigns.length ? (
              <p className="muted">هنوز کمپاین ارسال ثبت نشده است.</p>
            ) : (
              <div className="delivery-campaign-list" data-testid="finance-delivery-campaign-list">
                {filteredDeliveryCampaigns.map((item) => {
                  const liveSummary = buildDeliveryLiveSummary(item.targets || [], item);
                  const latestLiveStatus = buildDeliveryLiveStatus(item.liveStatus || liveSummary.latest || {});
                  return (
                    <article
                      key={item._id || item.name}
                      className={`delivery-campaign-item ${String(selectedDeliveryCampaign?._id || '') === String(item._id || '') ? 'selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDeliveryCampaignId(String(item._id || ''))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedDeliveryCampaignId(String(item._id || ''));
                        }
                      }}
                    >
                      <div className="document-archive-item-head">
                        <div>
                          <strong>{item.name || 'کمپاین delivery'}</strong>
                          <span>{DOCUMENT_ARCHIVE_TYPE_LABELS[item.documentType] || item.documentType || 'سند مالی'}</span>
                        </div>
                        <span className="finance-chip finance-chip-muted">{DELIVERY_CAMPAIGN_STATUS_LABELS[item.status] || item.status || 'فعال'}</span>
                      </div>
                      <div className="document-archive-meta">
                        <span>{item.classTitle || 'همه صنف‌ها'}{item.academicYearTitle ? ` | ${item.academicYearTitle}` : ''}</span>
                        <span>{item.monthKey ? toFaMonthKey(item.monthKey) : 'همه ماه‌ها'}</span>
                      </div>
                      <div className="document-archive-meta">
                        <span>{DELIVERY_CHANNEL_LABELS[item.channel] || item.channel || 'ایمیل'}</span>
                        <span>{fmt((item.recipientHandles || []).length)} گیرنده دستی</span>
                      </div>
                      <div className="document-archive-meta">
                        <span>{DELIVERY_CAMPAIGN_RUN_STATUS_LABELS[item.lastRunStatus] || item.lastRunStatus || 'بدون اجرا'}</span>
                        <span>{toFaDateTime(item.lastRunAt)}</span>
                      </div>
                      <div className="delivery-live-status-row">
                        <span className={DELIVERY_LIVE_STATUS_CHIP_CLASS[latestLiveStatus.stage] || DELIVERY_LIVE_STATUS_CHIP_CLASS.unknown}>
                          {DELIVERY_LIVE_STATUS_LABELS[latestLiveStatus.stage] || latestLiveStatus.stage || 'نامشخص'}
                        </span>
                        <span>
                          {latestLiveStatus.provider
                            ? `${latestLiveStatus.provider}${latestLiveStatus.providerMessageId ? ` | ${latestLiveStatus.providerMessageId}` : ''}`
                            : 'provider live status'}
                        </span>
                      </div>
                      <div className="finance-chip-group delivery-live-status-summary">
                        {liveSummary.inFlight ? <span className="finance-chip finance-chip-muted">در جریان: {fmt(liveSummary.inFlight)}</span> : null}
                        {liveSummary.successful ? <span className="finance-chip finance-chip-emerald">موفق: {fmt(liveSummary.successful)}</span> : null}
                        {liveSummary.read ? <span className="finance-chip finance-chip-sky">دیده‌شده: {fmt(liveSummary.read)}</span> : null}
                        {liveSummary.failed ? <span className="finance-chip finance-chip-rose">ناموفق: {fmt(liveSummary.failed)}</span> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {selectedDeliveryCampaign ? (
              <div className="document-delivery-history" data-testid="finance-delivery-campaign-detail">
                <div className="mini-row">
                  <span>اجرای بعدی</span>
                  <span>{toFaDateTime(selectedDeliveryCampaign.nextRunAt)}</span>
                </div>
                <div className="mini-row">
                  <span>کانال</span>
                  <span>{DELIVERY_CHANNEL_LABELS[selectedDeliveryCampaign.channel] || selectedDeliveryCampaign.channel || 'ایمیل'}</span>
                </div>
                <div className="mini-row">
                  <span>قالب</span>
                  <span>{deliveryTemplates.find((item) => item.key === selectedDeliveryCampaign.messageTemplateKey)?.label || selectedDeliveryCampaign.messageTemplateKey || 'عمومی'}</span>
                </div>
                <div className="mini-row">
                  <span>اتوماسیون</span>
                  <span>{selectedDeliveryCampaign.automationEnabled ? 'فعال' : 'دستی'}</span>
                </div>
                <div className="mini-row">
                  <span>خلاصه</span>
                  <span>
                    {fmt(selectedDeliveryCampaign.targetSummary?.successful || 0)} موفق / {fmt(selectedDeliveryCampaign.targetSummary?.failed || 0)} ناموفق
                  </span>
                </div>
                <div className="mini-row">
                  <span>وضعیت زنده</span>
                  <span className={DELIVERY_LIVE_STATUS_CHIP_CLASS[selectedDeliveryCampaignLiveSummary?.latest?.stage] || DELIVERY_LIVE_STATUS_CHIP_CLASS.unknown}>
                    {DELIVERY_LIVE_STATUS_LABELS[selectedDeliveryCampaignLiveSummary?.latest?.stage] || selectedDeliveryCampaignLiveSummary?.latest?.stage || 'نامشخص'}
                  </span>
                </div>
                <div className="finance-chip-group delivery-live-status-summary" data-testid="finance-delivery-campaign-live-status">
                  {selectedDeliveryCampaignLiveSummary?.inFlight ? <span className="finance-chip finance-chip-muted">در جریان: {fmt(selectedDeliveryCampaignLiveSummary.inFlight)}</span> : null}
                  {selectedDeliveryCampaignLiveSummary?.successful ? <span className="finance-chip finance-chip-emerald">موفق: {fmt(selectedDeliveryCampaignLiveSummary.successful)}</span> : null}
                  {selectedDeliveryCampaignLiveSummary?.read ? <span className="finance-chip finance-chip-sky">دیده‌شده: {fmt(selectedDeliveryCampaignLiveSummary.read)}</span> : null}
                  {selectedDeliveryCampaignLiveSummary?.failed ? <span className="finance-chip finance-chip-rose">ناموفق: {fmt(selectedDeliveryCampaignLiveSummary.failed)}</span> : null}
                </div>
                <div className="finance-toolbar">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => runDeliveryCampaign(selectedDeliveryCampaign)}
                    disabled={busy}
                    data-testid="finance-delivery-campaign-run"
                  >
                    اجرای کمپاین
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => toggleDeliveryCampaignStatus(selectedDeliveryCampaign)}
                    disabled={busy}
                    data-testid="finance-delivery-campaign-toggle"
                  >
                    {String(selectedDeliveryCampaign.status || '') === 'active' ? 'توقف' : 'فعال‌سازی'}
                  </button>
                </div>
                {(selectedDeliveryCampaign.recipientHandles || []).length ? (
                  <div className="mini-row">
                    <span>گیرنده‌های دستی</span>
                    <span>{(selectedDeliveryCampaign.recipientHandles || []).join('، ')}</span>
                  </div>
                ) : null}
                {selectedDeliveryCampaign.messageTemplateSubject ? (
                  <div className="mini-row">
                    <span>موضوع</span>
                    <span>{selectedDeliveryCampaign.messageTemplateSubject}</span>
                  </div>
                ) : null}
                {!!selectedDeliveryCampaign.targets?.length && (
                  <div className="delivery-live-status-targets" data-testid="finance-delivery-target-status-list">
                    {(selectedDeliveryCampaign.targets || []).slice(0, 5).map((target, index) => {
                      const liveStatus = buildDeliveryLiveStatus(target.liveStatus || target);
                      return (
                        <div key={`delivery-target-live-${selectedDeliveryCampaign._id || index}-${target.archiveId || target.documentNo || index}`} className="delivery-live-status-target">
                          <div>
                            <strong>{target.documentNo || 'سند مالی'}</strong>
                            <span>{target.recipient || target.providerMessageId || '-'}</span>
                          </div>
                          <div className="delivery-live-status-target-meta">
                            <span className={DELIVERY_LIVE_STATUS_CHIP_CLASS[liveStatus.stage] || DELIVERY_LIVE_STATUS_CHIP_CLASS.unknown}>
                              {DELIVERY_LIVE_STATUS_LABELS[liveStatus.stage] || liveStatus.stage || 'نامشخص'}
                            </span>
                            <span>{target.provider || liveStatus.provider || '-'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(selectedDeliveryCampaign.runLog || []).slice(0, 4).map((entry, index) => (
                  <div key={`delivery-campaign-run-log-${selectedDeliveryCampaign._id || index}-${index}`} className="mini-row">
                    <span>
                      {[DELIVERY_CAMPAIGN_RUN_STATUS_LABELS[entry?.status] || entry?.status || '', entry?.mode || '', entry?.actorName || '']
                        .filter(Boolean)
                        .join(' | ') || 'run'}
                    </span>
                    <span>{toFaDateTime(entry?.runAt)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="document-delivery-history" data-testid="finance-delivery-retry-queue">
              <div className="finance-toolbar">
                <label className="finance-inline-filter">
                  <span>فیلتر کانال</span>
                  <select
                    value={deliveryRetryChannelFilter}
                    onChange={(e) => setDeliveryRetryChannelFilter(e.target.value)}
                    data-testid="finance-delivery-retry-channel"
                  >
                    <option value="all">همه</option>
                    {Object.entries(DELIVERY_CHANNEL_LABELS).map(([value, label]) => (
                      <option key={`delivery-retry-channel-${value}`} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {!deliveryRetryQueue.length ? (
                <p className="muted">در حال حاضر مورد ناموفق برای تلاش دوباره وجود ندارد.</p>
              ) : deliveryRetryQueue.map((item, index) => (
                <article key={`delivery-retry-${item.campaignId || index}-${item.archiveId || index}`} className="delivery-retry-item">
                  <div className="document-archive-item-head">
                    <div>
                      <strong>{item.documentNo || 'سند بدون شماره'}</strong>
                      <span>{item.campaignName || 'کمپاین delivery'}</span>
                    </div>
                    <span className="finance-chip finance-chip-muted">{DELIVERY_CHANNEL_LABELS[item.channel] || item.channel || 'email'}</span>
                  </div>
                  <div className="document-archive-meta">
                    <span>{item.recipient || 'بدون گیرنده مشخص'}</span>
                    <span>{fmt(item.recipientCount || 0)} گیرنده</span>
                  </div>
                  <div className="document-archive-meta">
                    <span>{fmt(item.attempts || 0)} تلاش</span>
                    <span>{toFaDateTime(item.lastAttemptAt)}</span>
                  </div>
                  {(item.provider || item.providerMessageId) ? (
                    <div className="document-archive-meta">
                      <span>{item.provider || 'provider'}</span>
                      <span>{item.providerMessageId || item.providerStatus || '-'}</span>
                    </div>
                  ) : null}
                  <div className="delivery-live-status-row">
                    <span className={DELIVERY_LIVE_STATUS_CHIP_CLASS[buildDeliveryLiveStatus(item).stage] || DELIVERY_LIVE_STATUS_CHIP_CLASS.unknown}>
                      {DELIVERY_LIVE_STATUS_LABELS[buildDeliveryLiveStatus(item).stage] || buildDeliveryLiveStatus(item).stage || 'نامشخص'}
                    </span>
                    <span>{String(item.providerStatus || item.lastFailureCode || item.lastError || '-').trim() || '-'}</span>
                  </div>
                  {item.lastError ? (
                    <p className="muted">{item.lastError}</p>
                  ) : null}
                  {(item.lastFailureCode || item.nextRetryAt) ? (
                    <div className="document-archive-meta">
                      <span>{item.lastFailureCode || 'بدون کد خطا'}</span>
                      <span>{item.nextRetryAt ? `retry: ${toFaDateTime(item.nextRetryAt)}` : (item.retryable ? 'retryable' : 'بدون retry خودکار')}</span>
                    </div>
                  ) : null}
                  <div className="finance-toolbar">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => retryDeliveryQueueItem(item)}
                      disabled={busy}
                      data-testid={`finance-delivery-retry-button-${index}`}
                    >
                      retry delivery
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="document-delivery-history" data-testid="finance-delivery-recovery-queue">
              <div className="finance-toolbar">
                <label className="finance-inline-filter">
                  <span>وضعیت بازیابی</span>
                  <select
                    value={deliveryRecoveryStateFilter}
                    onChange={(e) => setDeliveryRecoveryStateFilter(e.target.value)}
                    data-testid="finance-delivery-recovery-state-filter"
                  >
                    <option value="all">همه</option>
                    {Object.entries(DELIVERY_RECOVERY_STATE_LABELS).map(([value, label]) => (
                      <option key={`delivery-recovery-state-${value}`} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <div className="finance-chip-group delivery-live-status-summary">
                  <span className="finance-chip finance-chip-muted">queue: {fmt(deliveryRecoveryQueue.length)}</span>
                  {Object.entries(deliveryRecoverySummary).slice(0, 2).map(([key, count]) => (
                    <span key={`delivery-recovery-summary-${key}`} className="finance-chip finance-chip-amber">
                      {(DELIVERY_RECOVERY_STATE_LABELS[key] || key)}: {fmt(count)}
                    </span>
                  ))}
                </div>
              </div>
              {!deliveryRecoveryQueue.length ? (
                <p className="muted">در حال حاضر موردی برای بازپخش و بازیابی وضعیت ارایه‌کننده وجود ندارد.</p>
              ) : deliveryRecoveryQueue.map((item, index) => {
                const liveStatus = buildDeliveryLiveStatus(item.liveStatus || item);
                const recoveryLabel = DELIVERY_RECOVERY_STATE_LABELS[item.recoveryState] || item.recoveryState || 'recovery';
                return (
                  <article key={`delivery-recovery-${item.providerMessageId || index}`} className="delivery-retry-item delivery-recovery-item">
                    <div className="document-archive-item-head">
                      <div>
                        <strong>{(item.documentNos || []).join('، ') || 'سند مالی'}</strong>
                        <span>{(item.campaignNames || []).join('، ') || item.provider || 'provider recovery'}</span>
                      </div>
                      <span className={`finance-chip ${item.retryable ? 'finance-chip-amber' : 'finance-chip-muted'}`}>{recoveryLabel}</span>
                    </div>
                    <div className="document-archive-meta">
                      <span>{item.recipient || 'بدون گیرنده مشخص'}</span>
                      <span>{DELIVERY_CHANNEL_LABELS[item.channel] || item.channel || 'email'}</span>
                    </div>
                    <div className="document-archive-meta">
                      <span>{item.provider || 'provider'}</span>
                      <span>{item.providerMessageId || '-'}</span>
                    </div>
                    <div className="document-archive-meta">
                      <span>{fmt(item.archiveCount || 0)} آرشیف / {fmt(item.campaignCount || 0)} کمپاین</span>
                      <span>{item.ageMinutes != null ? `${fmt(item.ageMinutes)} دقیقه` : toFaDateTime(item.lastEventAt)}</span>
                    </div>
                    <div className="delivery-live-status-row">
                      <span className={DELIVERY_LIVE_STATUS_CHIP_CLASS[liveStatus.stage] || DELIVERY_LIVE_STATUS_CHIP_CLASS.unknown}>
                        {DELIVERY_LIVE_STATUS_LABELS[liveStatus.stage] || liveStatus.stage || 'نامشخص'}
                      </span>
                      <span>{String(item.providerStatus || item.failureCode || item.errorMessage || '-').trim() || '-'}</span>
                    </div>
                    {item.errorMessage ? (
                      <p className="muted">{item.errorMessage}</p>
                    ) : null}
                    {(item.failureCode || item.nextRetryAt) ? (
                      <div className="document-archive-meta">
                        <span>{item.failureCode || 'بدون failure code'}</span>
                        <span>{item.nextRetryAt ? `retry: ${toFaDateTime(item.nextRetryAt)}` : (item.retryable ? 'retryable' : 'manual replay')}</span>
                      </div>
                    ) : null}
                    <div className="finance-toolbar">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => replayDeliveryRecoveryItem(item, item.replayRecommendedStatus || 'delivered')}
                        disabled={busy}
                        data-testid={`finance-delivery-recovery-replay-${index}`}
                      >
                        replay as {item.replayRecommendedStatus || 'delivered'}
                      </button>
                      {item.channel === 'whatsapp' ? (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => replayDeliveryRecoveryItem(item, 'read')}
                          disabled={busy}
                          data-testid={`finance-delivery-recovery-read-${index}`}
                        >
                          replay as read
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => replayDeliveryRecoveryItem(item, 'failed')}
                        disabled={busy}
                        data-testid={`finance-delivery-recovery-failed-${index}`}
                      >
                        replay as failed
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>}

      <div className="finance-card" data-finance-section="reports settings" data-testid="finance-document-archive-card">
        <div className="finance-card-head">
          <div>
            <h3>آرشیف و اعتبارسنجی اسناد مالی</h3>
            <p className="muted">شماره سند، کد اعتبارسنجی، بسته گروهی استیتمنت و تاریخچه دانلود اسناد رسمی را از همین بخش مدیریت کنید.</p>
          </div>
          <div className="finance-chip-group">
            <span className="finance-chip">{documentArchiveItems.length} سند اخیر</span>
            <span className="finance-chip finance-chip-muted">{filteredDocumentArchiveItems.length} در فیلتر</span>
          </div>
        </div>
        <div className="document-archive-layout">
          <div className="document-archive-panel">
            <div className="finance-toolbar">
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>کد اعتبارسنجی</span>
                <input
                  value={documentVerificationCode}
                  onChange={(e) => setDocumentVerificationCode(e.target.value)}
                  placeholder="مثلاً FV-SFP-ABC123"
                  data-testid="finance-document-verify-input"
                />
              </label>
              <button
                type="button"
                onClick={() => runFinanceDocumentVerification()}
                disabled={busy || !documentVerificationCode.trim()}
                data-testid="finance-document-verify-button"
              >
                اعتبارسنجی
              </button>
            </div>

            {verifiedDocument ? (
              <div className="document-verify-result" data-testid="finance-document-verify-result">
                <div className="mini-row">
                  <span>شماره سند</span>
                  <strong>{verifiedDocument.documentNo || '---'}</strong>
                </div>
                <div className="mini-row">
                  <span>نوع سند</span>
                  <span>{DOCUMENT_ARCHIVE_TYPE_LABELS[verifiedDocument.documentType] || verifiedDocument.documentType || '---'}</span>
                </div>
                <div className="mini-row">
                  <span>صاحب سند</span>
                  <span>{verifiedDocument.subjectName || verifiedDocument.batchLabel || '---'}</span>
                </div>
                <div className="mini-row">
                  <span>وضعیت</span>
                  <span>{verifiedDocument.status || 'active'}</span>
                </div>
                <div className="mini-row">
                  <span>هش سند</span>
                  <span className="document-archive-code">{verifiedDocument.sha256 || '---'}</span>
                </div>
                <div className="mini-row">
                  <span>آخرین اعتبارسنجی</span>
                  <span>{toFaDateTime(verifiedDocument.lastVerifiedAt)}</span>
                </div>
              </div>
            ) : (
              <p className="muted">برای راستی‌آزمایی سند رسمی، کد اعتبارسنجی را وارد کنید. نتیجه در همین بخش با شماره سند و هش نمایش داده می‌شود.</p>
            )}

            <div className="finance-subcard-list">
              <div className="mini-row">
                <span>بسته گروهی استیتمنت</span>
                <span>ZIP رسمی برای صنف و ماه</span>
              </div>
            </div>
            <div className="finance-toolbar">
              <label className="finance-inline-filter">
                <span>صنف</span>
                <select
                  value={documentBatchForm.classId}
                  onChange={(e) => setDocumentBatchForm((prev) => ({ ...prev, classId: e.target.value }))}
                  data-testid="finance-document-batch-class"
                >
                  <option value="">انتخاب صنف</option>
                  {classOptions.map((item) => (
                    <option key={`document-batch-class-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>سال تعلیمی</span>
                <select
                  value={documentBatchForm.academicYearId}
                  onChange={(e) => setDocumentBatchForm((prev) => ({ ...prev, academicYearId: e.target.value }))}
                >
                  <option value="">بدون محدودیت</option>
                  {academicYears.map((item) => (
                    <option key={`document-batch-year-${item.id}`} value={item.id}>{getAcademicYearOptionLabel(item)}</option>
                  ))}
                </select>
              </label>
              <label className="finance-inline-filter">
                <span>ماه</span>
                <input
                  value={documentBatchForm.monthKey}
                  onChange={(e) => setDocumentBatchForm((prev) => ({ ...prev, monthKey: e.target.value }))}
                  placeholder="YYYY-MM"
                />
                <small>{documentBatchForm.monthKey ? `هجری شمسی: ${toFaMonthKey(documentBatchForm.monthKey)}` : 'ماه را به شکل YYYY-MM وارد کنید.'}</small>
              </label>
              <button
                type="button"
                className="secondary"
                onClick={downloadBatchStatementZip}
                disabled={busy || !documentBatchForm.classId}
                data-testid="finance-document-batch-download"
              >
                دانلود ZIP
              </button>
            </div>

            {selectedDocumentArchive ? (
              <div className="document-delivery-panel" data-testid="finance-document-delivery-panel">
                <div className="finance-card-head">
                  <div>
                    <h4>ارسال سند از آرشیف</h4>
                    <p className="muted">ارسال دستی به ایمیل، یا اطلاع‌رسانی به گیرندگان مرتبط با همین سند.</p>
                  </div>
                  <div className="finance-chip-group">
                    <span className="finance-chip">{selectedDocumentArchive.documentNo || '---'}</span>
                    <span className="finance-chip finance-chip-muted">{DOCUMENT_ARCHIVE_TYPE_LABELS[selectedDocumentArchive.documentType] || selectedDocumentArchive.documentType || 'سند مالی'}</span>
                    <span className={DELIVERY_LIVE_STATUS_CHIP_CLASS[selectedDocumentArchiveLiveSummary?.latest?.stage] || DELIVERY_LIVE_STATUS_CHIP_CLASS.unknown}>
                      {DELIVERY_LIVE_STATUS_LABELS[selectedDocumentArchiveLiveSummary?.latest?.stage] || selectedDocumentArchiveLiveSummary?.latest?.stage || 'نامشخص'}
                    </span>
                  </div>
                </div>
                <div className="finance-toolbar">
                  <label className="finance-inline-filter">
                    <span>کانال ارسال</span>
                    <select
                      value={documentDeliveryForm.channel}
                      onChange={(e) => {
                        const nextChannel = e.target.value;
                        setDocumentDeliveryForm((prev) => ({
                          ...prev,
                          channel: nextChannel,
                          includeLinkedAudience: nextChannel === 'portal' ? true : prev.includeLinkedAudience
                        }));
                      }}
                      data-testid="finance-document-delivery-channel"
                    >
                      {Object.entries(DELIVERY_CHANNEL_LABELS).map(([value, label]) => (
                        <option key={`finance-document-delivery-channel-${value}`} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="finance-inline-filter finance-inline-filter-wide">
                    <span>{DELIVERY_CHANNEL_INPUT_LABELS[selectedDocumentDeliveryChannel] || 'گیرنده مقصد'}</span>
                    <input
                      value={documentDeliveryForm.recipientHandles}
                      onChange={(e) => setDocumentDeliveryForm((prev) => ({ ...prev, recipientHandles: e.target.value }))}
                      placeholder={DELIVERY_CHANNEL_INPUT_PLACEHOLDERS[selectedDocumentDeliveryChannel] || ''}
                      disabled={selectedDocumentDeliveryChannel === 'portal'}
                      data-testid="finance-document-delivery-emails"
                    />
                  </label>
                  <label className="finance-inline-filter finance-inline-filter-wide">
                    <span>عنوان/موضوع</span>
                    <input
                      value={documentDeliveryForm.subject}
                      onChange={(e) => setDocumentDeliveryForm((prev) => ({ ...prev, subject: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="finance-toolbar">
                  <label className="finance-inline-filter finance-inline-filter-wide">
                    <span>یادداشت ارسال</span>
                    <input
                      value={documentDeliveryForm.note}
                      onChange={(e) => setDocumentDeliveryForm((prev) => ({ ...prev, note: e.target.value }))}
                      placeholder="مثلاً ارسال ماهانه برای ولی و مدیریت"
                    />
                  </label>
                  <label className="finance-inline-filter finance-inline-check">
                    <span>اعلان به گیرندگان مرتبط</span>
                    <input
                      type="checkbox"
                      checked={documentDeliveryForm.includeLinkedAudience}
                      disabled={!selectedDocumentSupportsLinkedAudience || selectedDocumentDeliveryChannel === 'portal'}
                      onChange={(e) => setDocumentDeliveryForm((prev) => ({ ...prev, includeLinkedAudience: e.target.checked }))}
                      data-testid="finance-document-delivery-linked-audience"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={sendDocumentArchiveDelivery}
                    disabled={busy || !canSendSelectedDocumentArchive}
                    data-testid="finance-document-delivery-send"
                  >
                    ارسال سند
                  </button>
                </div>
                {archiveDeliveryBlocked ? (
                  <p className="muted">سندهای گروهی فقط از کانال‌های دستی مثل ایمیل، SMS و WhatsApp پشتیبانی می‌کنند.</p>
                ) : null}

                <div className="document-delivery-history" data-testid="finance-document-delivery-history">
                  <div className="mini-row">
                    <span>وضعیت آخرین ارسال</span>
                    <span>{selectedDocumentArchive.lastDeliveryStatus || 'ثبت نشده'}</span>
                  </div>
                  <div className="mini-row">
                    <span>وضعیت زنده ارایه‌کننده</span>
                    <span className={DELIVERY_LIVE_STATUS_CHIP_CLASS[selectedDocumentArchiveLiveSummary?.latest?.stage] || DELIVERY_LIVE_STATUS_CHIP_CLASS.unknown}>
                      {DELIVERY_LIVE_STATUS_LABELS[selectedDocumentArchiveLiveSummary?.latest?.stage] || selectedDocumentArchiveLiveSummary?.latest?.stage || 'نامشخص'}
                    </span>
                  </div>
                  <div className="mini-row">
                    <span>آخرین ارسال</span>
                    <span>{toFaDateTime(selectedDocumentArchive.lastDeliveredAt)}</span>
                  </div>
                  <div className="mini-row">
                    <span>تعداد ارسال</span>
                    <span>{fmt(selectedDocumentArchive.deliveryCount || 0)}</span>
                  </div>
                  <div className="finance-chip-group delivery-live-status-summary" data-testid="finance-document-live-status">
                    {selectedDocumentArchiveLiveSummary?.inFlight ? <span className="finance-chip finance-chip-muted">در جریان: {fmt(selectedDocumentArchiveLiveSummary.inFlight)}</span> : null}
                    {selectedDocumentArchiveLiveSummary?.successful ? <span className="finance-chip finance-chip-emerald">موفق: {fmt(selectedDocumentArchiveLiveSummary.successful)}</span> : null}
                    {selectedDocumentArchiveLiveSummary?.read ? <span className="finance-chip finance-chip-sky">دیده‌شده: {fmt(selectedDocumentArchiveLiveSummary.read)}</span> : null}
                    {selectedDocumentArchiveLiveSummary?.failed ? <span className="finance-chip finance-chip-rose">ناموفق: {fmt(selectedDocumentArchiveLiveSummary.failed)}</span> : null}
                  </div>
                  {(selectedDocumentArchive.deliveryLog || []).slice().reverse().slice(0, 4).map((entry, index) => (
                    <div key={`document-delivery-log-${selectedDocumentArchive._id || selectedDocumentArchive.documentNo}-${index}`} className="mini-row">
                      <span>
                        {[
                          DELIVERY_CHANNEL_LABELS[entry?.channel] || entry?.channel || '',
                          DELIVERY_LIVE_STATUS_LABELS[buildDeliveryLiveStatus(entry.liveStatus || entry).stage] || buildDeliveryLiveStatus(entry.liveStatus || entry).stage || '',
                          entry?.provider || '',
                          entry?.providerMessageId || '',
                          entry?.recipient || '',
                          entry?.failureCode || '',
                          entry?.linkedAudienceNotified ? 'linked audience' : ''
                        ]
                          .filter(Boolean)
                          .join(' | ') || 'delivery'}
                      </span>
                      <span>{entry?.nextRetryAt ? `${toFaDateTime(entry?.sentAt)} -> ${toFaDateTime(entry?.nextRetryAt)}` : toFaDateTime(entry?.sentAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="document-archive-panel">
            <div className="finance-toolbar">
              <label className="finance-inline-filter">
                <span>نوع سند</span>
                <select
                  value={documentArchiveTypeFilter}
                  onChange={(e) => setDocumentArchiveTypeFilter(e.target.value)}
                  data-testid="finance-document-type-filter"
                >
                  <option value="all">همه</option>
                  {Object.entries(DOCUMENT_ARCHIVE_TYPE_LABELS).map(([value, label]) => (
                    <option key={`document-type-${value}`} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            {!filteredDocumentArchiveItems.length ? (
              <p className="muted">هنوز سند رسمی در آرشیف اخیر ثبت نشده است.</p>
            ) : (
              <div className="document-archive-list" data-testid="finance-document-archive-list">
                {filteredDocumentArchiveItems.map((item) => {
                  const liveSummary = buildDeliveryLiveSummary(item.deliveryLog || [], item);
                  const latestLiveStatus = buildDeliveryLiveStatus(item.liveStatus || liveSummary.latest || {});
                  return (
                    <article
                      key={item._id || item.documentNo}
                      className={`document-archive-item ${String(selectedDocumentArchive?._id || selectedDocumentArchive?.documentNo || '') === String(item._id || item.documentNo || '') ? 'selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDocumentArchiveId(String(item._id || item.documentNo || ''))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedDocumentArchiveId(String(item._id || item.documentNo || ''));
                        }
                      }}
                    >
                      <div className="document-archive-item-head">
                        <div>
                          <strong>{item.documentNo || '---'}</strong>
                          <span>{DOCUMENT_ARCHIVE_TYPE_LABELS[item.documentType] || item.documentType || 'سند مالی'}</span>
                        </div>
                        <button
                          type="button"
                          className="ghost-inline"
                          onClick={() => runFinanceDocumentVerification(item?.verification?.code || '')}
                        >
                          verify
                        </button>
                      </div>
                      <div className="document-archive-meta">
                        <span>{item.subjectName || item.batchLabel || item.membershipLabel || '---'}</span>
                        <span>{toFaDateTime(item.generatedAt)}</span>
                      </div>
                      <div className="document-archive-meta">
                        <span className="document-archive-code">{item?.verification?.code || '---'}</span>
                        <span>{fmt(item.downloadCount || 0)} دانلود / {fmt(item.verifyCount || 0)} verify</span>
                      </div>
                      <div className="delivery-live-status-row">
                        <span className={DELIVERY_LIVE_STATUS_CHIP_CLASS[latestLiveStatus.stage] || DELIVERY_LIVE_STATUS_CHIP_CLASS.unknown}>
                          {DELIVERY_LIVE_STATUS_LABELS[latestLiveStatus.stage] || latestLiveStatus.stage || 'نامشخص'}
                        </span>
                        <span>
                          {latestLiveStatus.provider
                            ? `${latestLiveStatus.provider}${latestLiveStatus.providerMessageId ? ` | ${latestLiveStatus.providerMessageId}` : ''}`
                            : 'provider live status'}
                        </span>
                      </div>
                      <div className="finance-chip-group delivery-live-status-summary">
                        {liveSummary.inFlight ? <span className="finance-chip finance-chip-muted">در جریان: {fmt(liveSummary.inFlight)}</span> : null}
                        {liveSummary.successful ? <span className="finance-chip finance-chip-emerald">موفق: {fmt(liveSummary.successful)}</span> : null}
                        {liveSummary.read ? <span className="finance-chip finance-chip-sky">دیده‌شده: {fmt(liveSummary.read)}</span> : null}
                        {liveSummary.failed ? <span className="finance-chip finance-chip-rose">ناموفق: {fmt(liveSummary.failed)}</span> : null}
                      </div>
                      {!!item.childDocuments?.length && (
                        <div className="document-archive-meta">
                          <span>اسناد داخل بسته</span>
                          <span>{fmt(item.childDocuments.length)}</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="finance-card" data-finance-section="reports" data-testid="finance-audit-timeline-card">
        <div className="finance-card-head">
          <div>
            <h3>خط زمانی حسابرسی مالی</h3>
            <p className="muted">ردپای واحد بل، پرداخت، تسهیلات مالی، یادآوری و کنترل‌های سیستمی را از همین بخش مرور کنید.</p>
          </div>
          <div className="finance-chip-group">
            <span className="finance-chip">فید: {auditTimelineSummary?.total || auditTimelineStats.total}</span>
            <span className="finance-chip finance-chip-amber">فیلتر: {auditTimelineStats.total}</span>
            <span className="finance-chip finance-chip-rose">حساس: {auditTimelineStats.critical}</span>
            <span className="finance-chip finance-chip-muted">نیازمند اقدام: {auditTimelineStats.actionRequired}</span>
          </div>
        </div>
        <div className="finance-toolbar audit-timeline-toolbar">
          <label className="finance-inline-filter finance-inline-filter-wide">
            <span>جستجو در حسابرسی</span>
            <input
              value={auditTimelineSearch}
              onChange={(e) => setAuditTimelineSearch(e.target.value)}
              placeholder="شماره بل، پرداخت، نام یا نمبر اساس متعلم، صنف، اقدام‌کننده یا توضیح"
              data-testid="audit-timeline-search"
            />
          </label>
          <label className="finance-inline-filter">
            <span>نوع رویداد</span>
            <select value={auditTimelineKindFilter} onChange={(e) => setAuditTimelineKindFilter(e.target.value)} data-testid="audit-timeline-kind-filter">
              <option value="all">همه</option>
              {Object.entries(AUDIT_KIND_UI_LABELS).map(([value, label]) => (
                <option key={`audit-kind-${value}`} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="finance-inline-filter">
            <span>سطح حساسیت</span>
            <select value={auditTimelineSeverityFilter} onChange={(e) => setAuditTimelineSeverityFilter(e.target.value)} data-testid="audit-timeline-severity-filter">
              <option value="all">همه</option>
              {Object.entries(AUDIT_SEVERITY_UI_LABELS).map(([value, label]) => (
                <option key={`audit-severity-${value}`} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        {!filteredAuditTimeline.length && <p className="muted">برای این فیلتر خط زمانی حسابرسی پیدا نشد.</p>}
        {!!filteredAuditTimeline.length && (
          <div className="audit-timeline-layout">
            <div className="audit-timeline-list" data-testid="audit-timeline-list">
              {filteredAuditTimeline.slice(0, 80).map((item) => (
                <article
                  key={item.id}
                  className={`audit-timeline-item ${selectedAuditEntry?.id === item.id ? 'selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedAuditEntryId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedAuditEntryId(item.id);
                    }
                  }}
                >
                  <div className="audit-timeline-item-head">
                    <div className="audit-timeline-copy">
                      <strong>{item.title}</strong>
                      <span>{item.description || item.referenceNumber || 'بدون شرح'}</span>
                    </div>
                    <div className="audit-timeline-item-badges">
                      <span className={`audit-badge kind ${item.kind}`}>{AUDIT_KIND_UI_LABELS[item.kind] || item.kind}</span>
                      <span className={`audit-badge severity ${item.severity}`}>{AUDIT_SEVERITY_UI_LABELS[item.severity] || item.severity}</span>
                      {item.actionRequired ? <span className="audit-badge action">نیازمند اقدام</span> : null}
                    </div>
                  </div>
                  <div className="audit-timeline-item-meta">
                    <span>{toFaDateTime(item.at)}</span>
                    {item.studentName ? <span>{item.studentName}</span> : null}
                    {item.referenceNumber ? <span>{item.referenceNumber}</span> : null}
                    {item.actorName ? <span>{item.actorName}</span> : null}
                  </div>
                </article>
              ))}
            </div>

            {selectedAuditEntry && (
              <aside className="audit-timeline-inspector" data-testid="audit-timeline-inspector">
                <div className="audit-timeline-item-head">
                  <div className="audit-timeline-copy">
                    <strong>{selectedAuditEntry.title}</strong>
                    <span>{selectedAuditEntry.description || selectedAuditEntry.referenceNumber || 'بدون شرح'}</span>
                  </div>
                  <div className="audit-timeline-item-badges">
                    <span className={`audit-badge kind ${selectedAuditEntry.kind}`}>{AUDIT_KIND_UI_LABELS[selectedAuditEntry.kind] || selectedAuditEntry.kind}</span>
                    <span className={`audit-badge severity ${selectedAuditEntry.severity}`}>{AUDIT_SEVERITY_UI_LABELS[selectedAuditEntry.severity] || selectedAuditEntry.severity}</span>
                    {selectedAuditEntry.actionRequired ? <span className="audit-badge action">نیازمند اقدام</span> : null}
                  </div>
                </div>

                <div className="receipt-meta-grid audit-meta-grid">
                  <div><span>تاریخ و زمان</span><strong>{toFaDateTime(selectedAuditEntry.at)}</strong></div>
                  <div><span>اقدام‌کننده</span><strong>{selectedAuditEntry.actorName || '-'}</strong></div>
                  <div><span>متعلم</span><strong>{selectedAuditEntry.studentName || '-'}</strong></div>
                  <div><span>صنف</span><strong>{selectedAuditEntry.classTitle || '-'}</strong></div>
                  <div><span>سال تعلیمی</span><strong>{selectedAuditEntry.academicYearTitle || '-'}</strong></div>
                  <div><span>مرجع اصلی</span><strong>{selectedAuditEntry.referenceNumber || '-'}</strong></div>
                  <div><span>مرجع دوم</span><strong>{selectedAuditEntry.secondaryReference || '-'}</strong></div>
                  <div><span>مبلغ / پوشش</span><strong>{selectedAuditEntry.amountLabel || '-'}</strong></div>
                  <div><span>وضعیت</span><strong>{selectedAuditEntry.status || '-'}</strong></div>
                  <div><span>منبع</span><strong>{selectedAuditEntry.sourceLabel || '-'}</strong></div>
                </div>

                {!!selectedAuditEntry.tags?.length && (
                  <div className="finance-chip-group audit-chip-wrap">
                    {selectedAuditEntry.tags.map((tag, index) => (
                      <span key={`${selectedAuditEntry.id}-tag-${index}`} className="finance-chip finance-chip-muted">{tag}</span>
                    ))}
                  </div>
                )}

                {selectedAuditEntry.note ? (
                  <div className="receipt-note-box">
                    <span>یادداشت</span>
                    <p>{selectedAuditEntry.note}</p>
                  </div>
                ) : null}

                {selectedAuditEntry.reason ? (
                  <div className="receipt-note-box">
                    <span>دلیل / نتیجه</span>
                    <p>{selectedAuditEntry.reason}</p>
                  </div>
                ) : null}

                <div className="receipt-inspector-actions">
                  {selectedAuditEntry.attachment?.hasFile ? (
                    <a className="receipt-file-link" href={toFileUrl(selectedAuditEntry.attachment.fileUrl)} target="_blank" rel="noreferrer">
                      نمایش ضمیمه
                    </a>
                  ) : (
                    <span className="muted">برای این رویداد ضمیمه‌ای ثبت نشده است.</span>
                  )}
                  {selectedAuditEntry.jumpSection ? (
                    <button type="button" className="secondary" onClick={() => setActiveSection(selectedAuditEntry.jumpSection)}>
                      باز کردن بخش مرتبط
                    </button>
                  ) : null}
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
      {printMode === 'overview' && printSnapshot && (() => {
        const { financeOverview, financeOverviewKpis } = printSnapshot;
        return (
      <PrintSheetErrorBoundary onError={handlePrintSheetError}>
        <div className="finance-print-sheet" data-testid="printable-finance-overview">
          <div className="finance-print-school-header">
            <div className="finance-print-logo-box">
              {printLogoUrls.schoolLogoUrl ? <img className={getOfficialPrintLogoImageClass(printLogoUrls.schoolLogoUrl)} src={printLogoUrls.schoolLogoUrl} alt="لوگوی مکتب" /> : <span>لوگوی مکتب</span>}
            </div>
            <div className="finance-print-school-center">
              <span>امارت اسلامی افغانستان</span>
              <span>وزارت معارف</span>
              <strong>{activeSchoolPrintInfo.title}</strong>
            </div>
            <div className="finance-print-logo-box">
              {printLogoUrls.ministryLogoUrl ? <img className={getOfficialPrintLogoImageClass(printLogoUrls.ministryLogoUrl)} src={printLogoUrls.ministryLogoUrl} alt="لوگوی وزارت معارف" /> : <span>لوگوی وزارت</span>}
            </div>
          </div>
          <h3>گزارش مالی بازه انتخاب‌شده</h3>
          <p className="muted">
            از {toFaDate(financeOverview?.period?.startAt)} تا {toFaDate(financeOverview?.period?.endAt)}
            {reportClassId ? ` · صنف: ${classOptions.find((item) => String(item.classId) === String(reportClassId))?.title || '-'}` : ' · همه صنف‌ها'}
          </p>
          <div className="receipt-meta-grid">
            <div><span>تعداد بل صادرشده</span><strong>{fmt(financeOverviewKpis?.issuedBills?.count || 0)}</strong></div>
            <div><span>تعداد شاگرد</span><strong>{fmt(financeOverviewKpis?.issuedBills?.studentCount || 0)}</strong></div>
            <div><span>مبلغ ناخالص بل‌ها</span><strong>{fmt(financeOverviewKpis?.issuedBills?.grossAmount || 0)} AFN</strong></div>
            <div><span>مبلغ پس از تخفیف</span><strong>{fmt(financeOverviewKpis?.issuedBills?.amount || 0)} AFN</strong></div>
            <div><span>عواید تاییدشده</span><strong>{fmt(financeOverviewKpis?.approvedRevenue?.amount || 0)} AFN</strong></div>
            <div><span>تخفیف و معافیت</span><strong>{fmt(financeOverviewKpis?.reliefs?.amount || 0)} AFN</strong></div>
            <div><span>مصارف تاییدشده</span><strong>{fmt(financeOverviewKpis?.expenses?.amount || 0)} AFN</strong></div>
            <div><span>باقیات پایان بازه</span><strong>{fmt(financeOverviewKpis?.outstanding?.amount || 0)} AFN</strong></div>
            <div><span>خالص عواید</span><strong>{fmt(financeOverviewKpis?.netCash?.amount || 0)} AFN</strong></div>
            <div><span>نرخ وصول</span><strong>{fmt(financeOverviewKpis?.rates?.collection || 0)}%</strong></div>
            <div><span>رسید در انتظار</span><strong>{fmt(financeOverviewKpis?.pendingReceipts?.count || 0)}</strong></div>
          </div>
          <div className="receipt-trail">
            <h4>تفکیک بر اساس صنف</h4>
            <div className="trail-list">
              {(financeOverview?.byClass || []).slice(0, 20).map((item) => (
                <div key={`overview-print-class-${item.classId || item.title}`} className="mini-row">
                  <span>{item.title}</span>
                  <span>تعهد: {fmt(item.due)} · پرداخت: {fmt(item.paid)} · باقیات: {fmt(item.outstanding)} AFN</span>
                </div>
              ))}
              {!financeOverview?.byClass?.length && <p className="muted">رقم صنفی ثبت نشده است.</p>}
            </div>
          </div>
          <div className="receipt-trail">
            <h4>تفکیک روش پرداخت</h4>
            <div className="trail-list">
              {(financeOverview?.distributions?.paymentMethods || []).map((item) => (
                <div key={`overview-print-method-${item.key}`} className="mini-row">
                  <span>{item.label}</span>
                  <span>{fmt(item.value)} AFN · {fmt(item.percent)}%</span>
                </div>
              ))}
              {!financeOverview?.distributions?.paymentMethods?.length && <p className="muted">پرداخت تاییدشده ثبت نشده است.</p>}
            </div>
          </div>
          <div className="finance-print-signatures">
            <div><span>ترتیب‌کننده</span><strong>امضا: __________________</strong></div>
            <div><span>مدیر مالی</span><strong>امضا: __________________</strong></div>
            <div><span>مدیر مکتب</span><strong>امضا و مهر: __________________</strong></div>
          </div>
        </div>
      </PrintSheetErrorBoundary>
        );
      })()}
      {printMode === 'cashier' && printSnapshot && (() => {
        const cashierReportPrintModel = printSnapshot;
        return (
      <PrintSheetErrorBoundary onError={handlePrintSheetError}>
        <div className="finance-print-sheet" data-testid="printable-cashier-report-sheet">
          <div className="finance-print-school-header">
            <div className="finance-print-logo-box">
              {printLogoUrls.schoolLogoUrl ? <img className={getOfficialPrintLogoImageClass(printLogoUrls.schoolLogoUrl)} src={printLogoUrls.schoolLogoUrl} alt="لوگوی مکتب" /> : <span>لوگو مکتب</span>}
            </div>
            <div className="finance-print-school-center">
              <span>امارت اسلامی افغانستان</span>
              <span>وزارت معارف</span>
              <span>ریاست معارف شهر کابل</span>
              <span>آمریت معارف حوزه (     ) تعلیمی</span>
              <strong>{activeSchoolPrintInfo.title}</strong>
            </div>
            <div className="finance-print-logo-box">
              {printLogoUrls.ministryLogoUrl ? <img className={getOfficialPrintLogoImageClass(printLogoUrls.ministryLogoUrl)} src={printLogoUrls.ministryLogoUrl} alt="لوگوی وزارت معارف" /> : <span>لوگو وزارت</span>}
            </div>
          </div>
          <h3>گزارش صندوق روزانه</h3>
          <p className="muted">تاریخ گزارش: {toFaDate(cashierReportPrintModel.date)}</p>
          <div className="receipt-meta-grid">
            <div><span>کل پرداخت‌ها</span><strong>{cashierReportPrintModel.summary.totalPayments || 0}</strong></div>
            <div><span>جمع ثبت‌شده</span><strong>{fmt(cashierReportPrintModel.summary.totalCollected || 0)} AFN</strong></div>
            <div><span>تاییدشده</span><strong>{fmt(cashierReportPrintModel.summary.approvedAmount || 0)} AFN</strong></div>
            <div><span>در انتظار</span><strong>{fmt(cashierReportPrintModel.summary.pendingAmount || 0)} AFN</strong></div>
          </div>
          {!!cashierReportPrintModel.methodTotals.length && (
            <div className="receipt-trail">
              <h4>تفکیک روش پرداخت تاییدشده</h4>
              <div className="trail-list">
                {cashierReportPrintModel.methodTotals.map((item) => (
                  <div key={`print-cashier-method-${item.method}`} className="mini-row">
                    <span>{PAYMENT_METHOD_UI_LABELS[item.method] || item.method}</span>
                    <span>{fmt(item.amount)} AFN / {item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!!cashierReportPrintModel.cashiers.length && (
            <div className="receipt-trail">
              <h4>ثبت‌کنندگان پرداخت تاییدشده</h4>
              <div className="trail-list">
                {cashierReportPrintModel.cashiers.map((item) => (
                  <div key={`print-cashier-user-${item.id}`} className="mini-row">
                    <span>{item.name}</span>
                    <span>{fmt(item.amount)} AFN / {item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!!cashierReportPrintModel.items.length && (
            <div className="receipt-trail">
              <h4>جزئیات پرداخت‌های روز</h4>
              <div className="trail-list">
                {cashierReportPrintModel.items.map((item) => (
                  <div key={`print-cashier-item-${item.id || item.paymentNumber}`} className="trail-item">
                    <div className="trail-item-head">
                      <strong>{item.student?.fullName || item.student?.name || 'متعلم'}</strong>
                      <span>{fmt(item.amount)} AFN</span>
                    </div>
                    <div className="trail-item-meta">
                      <span className="finance-latin-code">{formatFinanceCode(item.paymentNumber || item.referenceNo, '-')}</span>
                      <span>{PAYMENT_METHOD_UI_LABELS[item.paymentMethod] || item.paymentMethod || '-'}</span>
                    </div>
                    <div className="trail-item-meta">
                      <span>{item.schoolClass?.title || '-'}</span>
                      <span>{item.receivedBy?.name || 'ثبت سیستمی'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="finance-print-footer">
            <span><strong>شماره تماس مکتب:</strong> {activeSchoolPrintInfo.phone || '-'}</span>
            <span><strong>ایمیل مکتب:</strong> {activeSchoolPrintInfo.email || '-'}</span>
            <span><strong>آدرس مکتب:</strong> {activeSchoolPrintInfo.address || '-'}</span>
          </div>
        </div>
      </PrintSheetErrorBoundary>
        );
      })()}
    </section>
  );
}
