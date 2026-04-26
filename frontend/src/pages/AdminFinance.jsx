import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './AdminFinance.css';
import { API_BASE } from '../config/api';
import { formatAfghanDate, formatAfghanDateTime, toGregorianDateInputValue } from '../utils/afghanDate';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
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

const normalizeFinanceSearchTerm = (value = '') => String(value || '').trim().toLowerCase();

const includesFinanceSearch = (values, term) => {
  const normalizedTerm = normalizeFinanceSearchTerm(term);
  if (!normalizedTerm) return true;
  return values.some((value) => String(value || '').toLowerCase().includes(normalizedTerm));
};

const buildFinanceSearchBlob = (values = []) => (
  values
    .map((value) => normalizeFinanceSearchTerm(value))
    .filter(Boolean)
    .join(' | ')
);

const buildStudentSearchBlob = (student = {}) => buildFinanceSearchBlob([
  student?.name,
  student?.fullName,
  student?.email,
  student?._id,
  student?.studentId,
  student?.admissionNo,
  student?.phone,
  student?.primaryPhone,
  student?.alternatePhone,
  student?.guardianName,
  student?.guardianPhone,
  student?.fatherName
]);

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

const getMonthBucket = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

const buildFinanceLineChartPaths = (series = [], width = 520, height = 220, padding = 20) => {
  if (!Array.isArray(series) || !series.length) {
    return { linePath: '', areaPath: '', points: [] };
  }
  const max = Math.max(...series.map((item) => toSafeNumber(item?.total)), 1);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const step = series.length > 1 ? innerWidth / (series.length - 1) : 0;
  const points = series.map((item, index) => {
    const x = padding + step * index;
    const y = padding + innerHeight - ((toSafeNumber(item?.total) / max) * innerHeight);
    return {
      ...item,
      x,
      y
    };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${(height - padding).toFixed(2)} L ${points[0].x.toFixed(2)} ${(height - padding).toFixed(2)} Z`;
  return { linePath, areaPath, points };
};

const getFinanceDeltaPercent = (current, previous) => {
  const safeCurrent = toSafeNumber(current);
  const safePrevious = toSafeNumber(previous);
  if (!safePrevious) return safeCurrent > 0 ? 100 : 0;
  return Number((((safeCurrent - safePrevious) / safePrevious) * 100).toFixed(1));
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
      status: String(item?.status || '').trim()
    }))
    .filter((item) => item.id)
);

const getClassOptionLabel = (item = {}) => String(item?.uiLabel || item?.title || '').trim() || 'صنف';
const getStudentOptionLabel = (item = {}) => (
  [item?.fullName || item?.name || item?.email || '', item?.admissionNo ? `(${item.admissionNo})` : '']
    .filter(Boolean)
    .join(' ')
    .trim() || 'متعلم'
);
const getAcademicYearOptionLabel = (item = {}) => (
  [item?.title, item?.code && item.code !== item.title ? `(${item.code})` : '', item?.isCurrent ? 'جاری' : '']
    .filter(Boolean)
    .join(' ')
    .trim()
);

const RECEIPT_STAGE_LABELS = {
  finance_manager_review: 'در انتظار مدیر مالی',
  finance_lead_review: 'در انتظار آمریت مالی',
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
  tuition: 'شهریه',
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

const getStudentDisplayName = (student = {}) => (
  String(student?.fullName || student?.name || student?.email || '').trim() || 'متعلم'
);

const RECEIPT_STAGE_UI_LABELS = {
  finance_manager_review: 'در انتظار مدیر مالی',
  finance_lead_review: 'در انتظار آمریت مالی',
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
  { value: 'finance_lead', label: 'آمریت مالی' },
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
  tuition: 'شهریه',
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

const FEE_LINE_TYPE_LABELS = {
  tuition: 'شهریه',
  admission: 'داخله',
  transport: 'ترانسپورت',
  exam: 'امتحان',
  document: 'اسناد',
  service: 'خدمت',
  other: 'سایر',
  penalty: 'جریمه'
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
  long_overdue_balance: 'معوق بیش از سه ماه',
  pending_payment_stalled: 'پرداخت معطل در بررسی',
  admission_missing: 'داخله ثبت نشده'
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
  draft: 'Ù¾ÛŒØ´â€ŒÙ†ÙˆÛŒØ³',
  published: 'Ù…Ù†ØªØ´Ø±Ø´Ø¯Ù‡',
  archived: 'Ø¢Ø±Ø´ÛŒÙ'
};

const DELIVERY_TEMPLATE_HISTORY_ACTION_LABELS = {
  draft_saved: 'Ø°Ø®ÛŒØ±Ù‡ Ù¾ÛŒØ´â€ŒÙ†ÙˆÛŒØ³',
  published: 'Ø§Ù†ØªØ´Ø§Ø±',
  archived: 'Ø¢Ø±Ø´ÛŒÙ',
  rolled_back: 'Ø¨Ø§Ø²Ú¯Ø´Øª Ø¨Ù‡ Ù†Ø³Ø®Ù‡'
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
  discounts: 'تخفیف و معافیت',
  reports: 'گزارش‌ها',
  settings: 'تنظیمات'
};

const FINANCE_SECTION_DESCRIPTIONS = {
  overview: 'نمای کلان از وصول، معوقات، صندوق و وضعیت عملیات مالی.',
  payments: 'ثبت پرداخت، بررسی رسیدها و مدیریت صندوق روزانه.',
  orders: 'صدور بل، بازبینی بدهی‌ها و مدیریت تعهدات مالی متعلمین.',
  discounts: 'تخفیف‌ها، معافیت‌ها و رجیستر مزایای مالی متعلمین.',
  reports: 'گزارش‌های تحلیلی، کاش‌فلو، بدهکاران و خروجی مدیریتی.',
  settings: 'پلان فیس، بستن ماه مالی، یادآوری و پیوند به فرماندهی دولت.'
};

const OPEN_ORDER_STATUSES = new Set(['new', 'partial', 'overdue']);

const getFinanceRecordStudentUserId = (item = {}) => (
  String(item?.student?.userId || item?.student?._id || item?.student?.id || '').trim()
);

const getFinanceRecordClassId = (item = {}) => (
  String(item?.schoolClass?.id || item?.classId?._id || item?.classId?.id || item?.classId || '').trim()
);

const getFinanceRecordAcademicYearId = (item = {}) => (
  String(item?.academicYear?.id || item?.academicYearId?.id || item?.academicYearId || '').trim()
);

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

const buildStudentFinanceSnapshot = ({ bills = [], reliefs = [], studentId = '', classId = '', academicYearId = '' } = {}) => {
  const scopedBills = (Array.isArray(bills) ? bills : []).filter((item) => matchesFinanceScope(item, { studentId, classId, academicYearId }));
  const scopedReliefs = (Array.isArray(reliefs) ? reliefs : [])
    .filter((item) => matchesFinanceScope(item, { studentId, classId, academicYearId }))
    .sort((left, right) => new Date(right?.createdAt || right?.startDate || 0).getTime() - new Date(left?.createdAt || left?.startDate || 0).getTime());
  const totalDue = scopedBills.reduce((sum, item) => sum + toSafeNumber(item?.amountDue), 0);
  const totalPaid = scopedBills.reduce((sum, item) => sum + toSafeNumber(item?.amountPaid), 0);
  const outstanding = scopedBills.reduce((sum, item) => sum + toSafeNumber(item?.outstandingAmount), 0);
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

const formatFeeLineSummary = (lineItems = []) => (
  (Array.isArray(lineItems) ? lineItems : [])
    .filter((item) => Number(item?.netAmount || item?.grossAmount || 0) > 0)
    .slice(0, 3)
    .map((item) => `${FEE_LINE_TYPE_LABELS[item?.feeType] || item?.label || item?.feeType || 'آیتم'}: ${fmt(item?.netAmount || item?.grossAmount || 0)}`)
    .join(' | ')
);

const toLegacyLikeBillRow = (order = {}) => {
  const canonicalId = String(order?.id || '').trim();
  const legacyBillId = String(order?.sourceBillId || '').trim();
  const classTitle = String(order?.schoolClass?.title || order?.course?.title || '').trim() || '---';
  const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];
  return {
    id: canonicalId,
    _id: canonicalId,
    legacyBillId,
    legacyCompatible: Boolean(legacyBillId),
    billNumber: String(order?.orderNumber || order?.title || '').trim() || '---',
    title: String(order?.title || '').trim(),
    student: {
      userId: String(order?.student?.userId || '').trim(),
      studentId: String(order?.student?.studentId || '').trim(),
      name: getStudentDisplayName(order?.student),
      fullName: String(order?.student?.fullName || '').trim(),
      email: String(order?.student?.email || '').trim()
    },
    classId: order?.schoolClass?.id ? { _id: order.schoolClass.id, title: classTitle } : null,
    schoolClass: order?.schoolClass?.id ? { id: order.schoolClass.id, title: classTitle } : null,
    academicYear: order?.academicYear?.id ? { id: order.academicYear.id, title: String(order?.academicYear?.title || '').trim() } : null,
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
    voidedAt: order?.voidedAt || null
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
    paymentNumber: String(payment?.paymentNumber || canonicalId).trim(),
    legacyReceiptId,
    legacyCompatible: Boolean(legacyReceiptId),
    source: String(payment?.source || '').trim(),
    sourceKey,
    student: {
      userId: String(payment?.student?.userId || '').trim(),
      studentId: String(payment?.student?.studentId || '').trim(),
      name: getStudentDisplayName(payment?.student),
      fullName: String(payment?.student?.fullName || '').trim(),
      email: String(payment?.student?.email || '').trim()
    },
    classId: payment?.schoolClass?.id ? { _id: payment.schoolClass.id, title: classTitle } : null,
    academicYear: payment?.academicYear?.id ? { id: payment.academicYear.id, title: String(payment?.academicYear?.title || '').trim() } : null,
    course: classTitle !== '---' ? { title: classTitle } : null,
    bill: {
      _id: String(payment?.feeOrderId || payment?.feeOrder?.id || payment?.feeOrder?.sourceBillId || '').trim(),
      billNumber: String(payment?.feeOrder?.orderNumber || '').trim() || '---',
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

const buildAnomalyActionPayload = (item = {}, extras = {}) => ({
  ...extras,
  snapshot: {
    id: String(item?.id || '').trim(),
    anomalyType: String(item?.anomalyType || '').trim(),
    title: String(item?.title || '').trim(),
    description: String(item?.description || '').trim(),
    severity: String(item?.severity || '').trim(),
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

export default function AdminFinance() {
  const [summary, setSummary] = useState(null);
  const [topDebtors, setTopDebtors] = useState([]);
  const [students, setStudents] = useState([]);
  const [classOptions, setClassOptions] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [feePlans, setFeePlans] = useState([]);
  const [bills, setBills] = useState([]);
  const [pendingReceipts, setPendingReceipts] = useState([]);
  const [aging, setAging] = useState(null);
  const [cashflow, setCashflow] = useState([]);
  const [byClass, setByClass] = useState([]);
  const [discountTotals, setDiscountTotals] = useState([]);
  const [discountRegistry, setDiscountRegistry] = useState([]);
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
  const [anomalyWorkflowForm, setAnomalyWorkflowForm] = useState({
    assignedLevel: 'finance_manager',
    snoozedUntil: '',
    note: ''
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [receiptStatusFilter, setReceiptStatusFilter] = useState('pending');
  const [receiptStageFilter, setReceiptStageFilter] = useState('all');
  const [receiptSourceFilter, setReceiptSourceFilter] = useState('all');
  const [receiptFollowUpFilter, setReceiptFollowUpFilter] = useState('all');
  const [selectedReceiptId, setSelectedReceiptId] = useState('');
  const [selectedReceiptDetail, setSelectedReceiptDetail] = useState(null);
  const [receiptFollowUpForm, setReceiptFollowUpForm] = useState({
    assignedLevel: 'finance_manager',
    status: 'new',
    note: ''
  });
  const [printMode, setPrintMode] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [formLayoutMode, setFormLayoutMode] = useState('landscape');
  const [orderFormMode, setOrderFormMode] = useState('manual');
  const [reliefFormMode, setReliefFormMode] = useState('discount');
  const [incomeTrendRange, setIncomeTrendRange] = useState('daily');
  const [manualStudentSearch, setManualStudentSearch] = useState('');
  const [paymentStudentSearch, setPaymentStudentSearch] = useState('');
  const [discountStudentSearch, setDiscountStudentSearch] = useState('');
  const [exemptionStudentSearch, setExemptionStudentSearch] = useState('');
  const [globalFinanceSearch, setGlobalFinanceSearch] = useState('');
  const [receiptSearchTerm, setReceiptSearchTerm] = useState('');
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
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
  const deferredGlobalFinanceSearch = useDeferredValue(globalFinanceSearch);

  const [manualForm, setManualForm] = useState({
    studentId: '',
    classId: '',
    amount: '',
    dueDate: '',
    academicYear: '',
    term: '',
    periodLabel: '',
    note: ''
  });

  const [bulkForm, setBulkForm] = useState({
    classId: '',
    amount: '',
    dueDate: '',
    academicYear: '',
    academicYearId: '',
    term: '',
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
    billingFrequency: 'term',
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
    studentId: '',
    classId: '',
    academicYearId: '',
    discountType: 'discount',
    amount: '',
    reason: ''
  });

  const [exemptionForm, setExemptionForm] = useState({
    studentId: '',
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
        && String(item?.academicYear?.id || '') === String(paymentDeskForm.academicYearId || '')
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
  ), [bills, paymentDeskForm.studentId, paymentDeskForm.classId, paymentDeskForm.academicYearId]);
  const paymentDeskSelectedOrderIds = useMemo(() => {
    const validIds = new Set(paymentDeskOpenOrders.map((item) => String(item?.id || '')));
    return paymentDeskForm.selectedFeeOrderIds.filter((item) => validIds.has(String(item || '')));
  }, [paymentDeskForm.selectedFeeOrderIds, paymentDeskOpenOrders]);
  const paymentDeskManualAllocated = useMemo(() => (
    paymentDeskOpenOrders.reduce((sum, item) => sum + (Number(paymentDeskForm.manualAllocations?.[item.id] || 0) || 0), 0)
  ), [paymentDeskForm.manualAllocations, paymentDeskOpenOrders]);
  const paymentDeskTotalOutstanding = useMemo(() => (
    paymentDeskOpenOrders.reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0)
  ), [paymentDeskOpenOrders]);
  const paymentDeskRemainingAmount = useMemo(() => (
    Number(paymentDeskForm.amount || 0) - paymentDeskManualAllocated
  ), [paymentDeskForm.amount, paymentDeskManualAllocated]);
  const paymentDeskManualMismatch = useMemo(() => (
    paymentDeskForm.allocationMode === 'manual'
      && Math.abs(Number(paymentDeskRemainingAmount || 0)) > 0.009
  ), [paymentDeskForm.allocationMode, paymentDeskRemainingAmount]);
  const openBillsCount = useMemo(() => (
    bills.filter((item) => OPEN_ORDER_STATUSES.has(String(item?.status || '').trim())).length
  ), [bills]);
  const totalOutstandingBalance = useMemo(() => (
    bills.reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0)
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
      hint: `${pendingReceipts.length} رسید باز`
    },
    {
      key: 'orders',
      label: FINANCE_SECTION_LABELS.orders,
      hint: `${openBillsCount} بدهی باز`
    },
    {
      key: 'discounts',
      label: FINANCE_SECTION_LABELS.discounts,
      hint: `${activeFinanceReliefCount} ثبت فعال`
    },
    {
      key: 'reports',
      label: FINANCE_SECTION_LABELS.reports,
      hint: `${byClass.length} ردیف تحلیلی`
    },
    {
      key: 'settings',
      label: FINANCE_SECTION_LABELS.settings,
      hint: `${feePlans.length} پلان فیس`
    }
  ]), [summary?.pendingReceipts, pendingReceipts.length, openBillsCount, activeFinanceReliefCount, byClass.length, feePlans.length]);
  const indexedStudents = useMemo(() => (
    students.map((student) => ({
      student,
      searchBlob: buildStudentSearchBlob(student)
    }))
  ), [students]);
  const studentSearchBlobById = useMemo(() => (
    new Map(
      indexedStudents.map((entry) => [String(entry?.student?._id || '').trim(), entry.searchBlob])
    )
  ), [indexedStudents]);
  const billsByStudentUserId = useMemo(() => buildFinanceItemsByStudentMap(bills), [bills]);
  const pendingReceiptsByStudentUserId = useMemo(() => buildFinanceItemsByStudentMap(pendingReceipts), [pendingReceipts]);
  const reliefsByStudentUserId = useMemo(() => buildFinanceItemsByStudentMap(reliefs), [reliefs]);
  const manualStudentOptions = useMemo(() => (
    buildStudentOptionList({
      indexedStudents,
      term: activeSection === 'orders' && orderFormMode === 'manual' ? deferredManualStudentSearch : '',
      selectedId: manualForm.studentId
    })
  ), [indexedStudents, activeSection, orderFormMode, deferredManualStudentSearch, manualForm.studentId]);
  const paymentStudentOptions = useMemo(() => (
    buildStudentOptionList({
      indexedStudents,
      term: activeSection === 'payments' ? deferredPaymentStudentSearch : '',
      selectedId: paymentDeskForm.studentId
    })
  ), [indexedStudents, activeSection, deferredPaymentStudentSearch, paymentDeskForm.studentId]);
  const discountStudentOptions = useMemo(() => (
    buildStudentOptionList({
      indexedStudents,
      term: activeSection === 'discounts' && reliefFormMode === 'discount' ? deferredDiscountStudentSearch : '',
      selectedId: discountForm.studentId
    })
  ), [indexedStudents, activeSection, reliefFormMode, deferredDiscountStudentSearch, discountForm.studentId]);
  const exemptionStudentOptions = useMemo(() => (
    buildStudentOptionList({
      indexedStudents,
      term: activeSection === 'discounts' && reliefFormMode === 'exemption' ? deferredExemptionStudentSearch : '',
      selectedId: exemptionForm.studentId
    })
  ), [indexedStudents, activeSection, reliefFormMode, deferredExemptionStudentSearch, exemptionForm.studentId]);
  const filteredBills = useMemo(() => (
    bills.filter((bill) => (
      (orderStatusFilter === 'all' || String(bill?.status || '').trim() === orderStatusFilter)
      && includesFinanceSearch([
        bill?.billNumber,
        bill?.title,
        bill?.student?.name,
        bill?.student?.fullName,
        bill?.classId?.title,
        bill?.schoolClass?.title,
        bill?.course?.title,
        bill?.status
      ], orderSearchTerm)
    ))
  ), [bills, orderSearchTerm, orderStatusFilter]);
  const filteredDiscountRegistry = useMemo(() => (
    discountRegistry.filter((item) => includesFinanceSearch([
      item?.student?.fullName,
      item?.student?.name,
      item?.schoolClass?.title,
      item?.academicYear?.title,
      item?.reason,
      item?.discountType
    ], discountRegistrySearch))
  ), [discountRegistry, discountRegistrySearch]);
  const filteredExemptionRegistry = useMemo(() => (
    exemptions.filter((item) => includesFinanceSearch([
      item?.student?.fullName,
      item?.student?.name,
      item?.schoolClass?.title,
      item?.academicYear?.title,
      item?.reason,
      item?.scope,
      item?.exemptionType
    ], exemptionRegistrySearch))
  ), [exemptions, exemptionRegistrySearch]);
  const reliefRegistryTypeOptions = useMemo(() => (
    Array.from(new Set(reliefs.map((item) => String(item?.reliefType || '').trim()).filter(Boolean)))
  ), [reliefs]);
  const filteredReliefRegistry = useMemo(() => (
    reliefs.filter((item) => (
      (reliefRegistryTypeFilter === 'all' || String(item?.reliefType || '').trim() === reliefRegistryTypeFilter)
      && includesFinanceSearch([
        item?.student?.fullName,
        item?.student?.name,
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
  ), [reliefs, reliefRegistrySearch, reliefRegistryTypeFilter]);
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
      studentId: paymentDeskForm.studentId,
      classId: paymentDeskForm.classId,
      academicYearId: paymentDeskForm.academicYearId
    })
  ), [bills, reliefs, paymentDeskForm.studentId, paymentDeskForm.classId, paymentDeskForm.academicYearId]);
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
  const globalFinanceSearchResults = useMemo(() => {
    const term = String(deferredGlobalFinanceSearch || '').trim();
    if (!term) return [];
    const normalizedTerm = normalizeFinanceSearchTerm(term);

    return indexedStudents
      .map(({ student, searchBlob }) => {
        const studentUserId = String(student?._id || '').trim();
        if (!studentUserId) return null;

        const studentBills = billsByStudentUserId.get(studentUserId) || [];
        const studentReceipts = pendingReceiptsByStudentUserId.get(studentUserId) || [];
        const studentReliefs = reliefsByStudentUserId.get(studentUserId) || [];
        const matchedBills = studentBills.filter((item) => includesFinanceSearch([
          item?.billNumber,
          item?.title,
          item?.feeLineSummary,
          item?.schoolClass?.title,
          item?.academicYear?.title,
          item?.note
        ], term));
        const matchedReceipts = studentReceipts.filter((item) => includesFinanceSearch([
          item?.bill?.billNumber,
          item?.referenceNo,
          item?.paymentMethod,
          item?.note,
          item?.student?.name
        ], term));
        const matchedReliefs = studentReliefs.filter((item) => includesFinanceSearch([
          item?.reliefType,
          item?.scope,
          item?.coverageMode,
          item?.reason,
          item?.sponsorName,
          item?.sourceModel
        ], term));
        const directMatch = searchBlob.includes(normalizedTerm);

        if (!directMatch && !matchedBills.length && !matchedReceipts.length && !matchedReliefs.length) {
          return null;
        }

        const snapshot = buildStudentFinanceSnapshot({ bills, reliefs, studentId: studentUserId });
        const primaryMatch = matchedBills[0] || matchedReliefs[0] || matchedReceipts[0] || snapshot.scopedBills[0] || null;
        const classTitle = primaryMatch?.schoolClass?.title || primaryMatch?.classId?.title || studentBills[0]?.schoolClass?.title || 'بدون صنف';
        const academicYearTitle = primaryMatch?.academicYear?.title || studentBills[0]?.academicYear?.title || 'نامشخص';
        const score = [
          directMatch ? 20 : 0,
          matchedBills.length * 6,
          matchedReceipts.length * 5,
          matchedReliefs.length * 4,
          snapshot.openOrders > 0 ? 2 : 0
        ].reduce((sum, value) => sum + value, 0);

        return {
          id: studentUserId,
          student,
          snapshot,
          classTitle,
          academicYearTitle,
          matchedBills,
          matchedReceipts,
          matchedReliefs,
          primaryMatch,
          score
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.snapshot.outstanding - left.snapshot.outstanding;
      })
      .slice(0, 6);
  }, [deferredGlobalFinanceSearch, indexedStudents, billsByStudentUserId, pendingReceiptsByStudentUserId, reliefsByStudentUserId, bills, reliefs]);
  const globalFinanceSpotlight = useMemo(() => globalFinanceSearchResults[0] || null, [globalFinanceSearchResults]);
  const paymentDeskStudentSearchBlob = useMemo(
    () => studentSearchBlobById.get(String(paymentDeskForm.studentId || '').trim()) || '',
    [studentSearchBlobById, paymentDeskForm.studentId]
  );

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

    const openBills = (billsByStudentUserId.get(normalizedStudentId) || []).filter((item) => (
      OPEN_ORDER_STATUSES.has(String(item?.status || '').trim())
      && Number(item?.outstandingAmount || 0) > 0
    ));
    const firstClassId = openBills[0]?.schoolClass?.id || openBills[0]?.classId?._id || '';
    const firstAcademicYearId = openBills[0]?.academicYear?.id || currentAcademicYearId || '';

    resetPaymentDeskSelection({
      studentId: normalizedStudentId,
      classId: firstClassId,
      academicYearId: firstAcademicYearId
    });
  };

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
  const canReviewReceipt = (receipt) => {
    if (!receipt || receipt.status !== 'pending') return false;
    const stage = normalizeReceiptStage(receipt.approvalStage || '');
    if (financeRole === 'general_president') return true;
    if (financeRole === 'finance_manager') return stage === 'finance_manager_review';
    if (financeRole === 'finance_lead') return stage === 'finance_lead_review';
    return false;
  };

  const getApproveLabel = (receipt) => {
    const stage = normalizeReceiptStage(receipt?.approvalStage || '');
    if (financeRole === 'finance_manager') return 'ارسال به آمریت';
    if (financeRole === 'finance_lead') return 'ارسال به ریاست';
    if (stage === 'general_president_review') return 'تایید نهایی';
    return 'تایید مستقیم';
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
  const [cashflowReport, setCashflowReport] = useState(null);
  const [discountAnalytics, setDiscountAnalytics] = useState(null);
  const [auditTimeline, setAuditTimeline] = useState([]);
  const [auditTimelineSummary, setAuditTimelineSummary] = useState(null);
  const [auditTimelineSearch, setAuditTimelineSearch] = useState('');
  const [auditTimelineKindFilter, setAuditTimelineKindFilter] = useState('all');
  const [auditTimelineSeverityFilter, setAuditTimelineSeverityFilter] = useState('all');
  const [selectedAuditEntryId, setSelectedAuditEntryId] = useState('');
  const financeHeadlineStats = useMemo(() => {
    const totalDue = bills.reduce((sum, item) => sum + toSafeNumber(item?.amountDue), 0);
    const totalPaid = bills.reduce((sum, item) => sum + toSafeNumber(item?.amountPaid), 0);
    const outstanding = bills.reduce((sum, item) => sum + toSafeNumber(item?.outstandingAmount ?? Math.max(0, toSafeNumber(item?.amountDue) - toSafeNumber(item?.amountPaid))), 0);
    const todayPayments = cashierReport?.summary?.totalPayments || cashierReport?.items?.length || 0;
    const todayReceipts = cashierReport?.items?.length || 0;
    const todayCash = (cashierReport?.methodTotals || [])
      .filter((item) => String(item?.method || '').trim() === 'cash')
      .reduce((sum, item) => sum + toSafeNumber(item?.amount), 0);
    return {
      totalDue,
      totalPaid,
      outstanding,
      todayPayments,
      todayReceipts,
      todayCash
    };
  }, [bills, cashierReport]);
  const incomeTrendSeries = useMemo(() => (
    buildFinanceTrendSeries(cashflow, incomeTrendRange)
  ), [cashflow, incomeTrendRange]);
  const incomeTrendChart = useMemo(() => (
    buildFinanceLineChartPaths(incomeTrendSeries)
  ), [incomeTrendSeries]);
  const monthlyIncomeSeries = useMemo(() => (
    buildFinanceTrendSeries(cashflow, 'monthly')
  ), [cashflow]);
  const monthlyComparison = useMemo(() => {
    const currentMonth = toSafeNumber(summary?.monthCollection || monthlyIncomeSeries[monthlyIncomeSeries.length - 1]?.total || 0);
    const previousMonth = toSafeNumber(monthlyIncomeSeries[monthlyIncomeSeries.length - 2]?.total || 0);
    const deltaAmount = currentMonth - previousMonth;
    const deltaPercent = getFinanceDeltaPercent(currentMonth, previousMonth);
    return {
      currentMonth,
      previousMonth,
      deltaAmount,
      deltaPercent
    };
  }, [summary?.monthCollection, monthlyIncomeSeries]);
  const paidVsDueRows = useMemo(() => (
    (Array.isArray(byClass) ? byClass : []).slice(0, 5).map((row) => {
      const due = toSafeNumber(row?.due);
      const paid = toSafeNumber(row?.paid);
      return {
        key: row?.classId || row?.courseId || row?.course,
        label: row?.schoolClass?.title || row?.course || 'صنف',
        due,
        paid,
        outstanding: Math.max(0, due - paid),
        collectionRate: due > 0 ? Math.round((paid / due) * 100) : 0
      };
    })
  ), [byClass]);
  const paidVsDueMax = useMemo(() => (
    Math.max(...paidVsDueRows.map((row) => row.due), 1)
  ), [paidVsDueRows]);
  const problemStudents = useMemo(() => (
    topDebtors.slice(0, 4).map((row, index) => ({
      id: row?.studentId || row?.name || `debtor-${index}`,
      name: row?.name || 'متعلم',
      amount: toSafeNumber(row?.amount)
    }))
  ), [topDebtors]);

  const fetchJson = async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), ...getAuthHeaders() }
    });
    return res.json();
  };

  const buildScopedReportUrl = (path) => {
    const url = new URL(`${API_BASE}${path}`, window.location.origin);
    if (reportClassId) {
      url.searchParams.set('classId', reportClassId);
    }
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
    setBusy(true);
    try {
      const [
        refData,
        summaryData,
        ordersData,
        paymentsData,
        feePlansData,
        monthsData,
        agingData,
        cashflowData,
        byClassData,
        discountsData,
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
        anomaliesData
      ] = await Promise.all([
        fetchJson(`${API_BASE}/api/finance/admin/reference-data`),
        fetchJson(`${API_BASE}/api/finance/admin/summary`),
        fetchJson(`${API_BASE}/api/student-finance/orders`),
        fetchJson(`${API_BASE}/api/student-finance/payments?view=inbox`),
        fetchJson(`${API_BASE}/api/finance/admin/fee-plans`),
        fetchJson(`${API_BASE}/api/finance/admin/month-close`),
        fetchJson(buildScopedReportUrl('/api/finance/admin/reports/aging')),
        fetchJson(buildScopedReportUrl('/api/finance/admin/reports/cashflow')),
        fetchJson(buildScopedReportUrl('/api/finance/admin/reports/by-class')),
        fetchJson(`${API_BASE}/api/finance/admin/reports/discounts`),
        fetchJson(`${API_BASE}/api/student-finance/discounts?status=active`),
        fetchJson(`${API_BASE}/api/student-finance/reliefs?status=active`),
        fetchJson(`${API_BASE}/api/student-finance/exemptions?status=active`),
        fetchJson(`${API_BASE}/api/finance/admin/delivery-providers`),
        fetchJson(`${API_BASE}/api/finance/admin/delivery-campaigns?limit=12`),
        fetchJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates`),
        fetchJson(`${API_BASE}/api/finance/admin/delivery-campaigns/analytics${buildDeliveryOperationsQuery()}`),
        fetchJson(`${API_BASE}/api/finance/admin/delivery-campaigns/retry-queue${buildDeliveryOperationsQuery({ includeLimit: true })}`),
        fetchJson(`${API_BASE}/api/finance/admin/delivery-campaigns/recovery-queue${buildDeliveryRecoveryQuery({ includeLimit: true })}`),
        fetchJson(`${API_BASE}/api/finance/admin/document-archive?limit=12`),
        fetchJson(buildScopedReportUrl('/api/finance/admin/reports/audit-timeline')),
        fetchJson(buildScopedReportUrl('/api/finance/admin/reports/anomalies'))
      ]);

      if (!refData?.success || !summaryData?.success) {
        setMessage(refData?.message || summaryData?.message || 'خطا در دریافت اطلاعات مالی');
        return;
      }

      const nextClassOptions = normalizeClassOptions(refData);
      const nextAcademicYears = normalizeAcademicYearOptions(refData);
      const defaultAcademicYearId = refData?.currentAcademicYearId || nextAcademicYears[0]?.id || '';
      const nextBills = ordersData?.success ? (ordersData.items || []).map(toLegacyLikeBillRow) : [];
      const nextPendingReceipts = paymentsData?.success ? (paymentsData.items || []).map(toLegacyLikeReceiptRow) : [];
      setStudents(refData.students || []);
      setClassOptions(nextClassOptions);
      setAcademicYears(nextAcademicYears);
      setSummary(summaryData.summary || null);
      setTopDebtors(summaryData.topDebtors || []);
      setBills(nextBills);
      setPendingReceipts(nextPendingReceipts);
      setFeePlans(feePlansData?.success ? (feePlansData.items || []) : []);
      setClosedMonths(monthsData?.success ? (monthsData.items || []) : []);
      setAging(agingData?.success ? agingData : null);
      setCashflowReport(cashflowData?.success ? cashflowData : null);
      setCashflow(cashflowData?.success ? (cashflowData.items || []) : []);
      setByClass(byClassData?.success ? (byClassData.items || []) : []);
      setDiscountAnalytics(discountsData?.success ? discountsData : null);
      setDiscountTotals(discountsData?.success ? (discountsData.items || []) : []);
        setDiscountRegistry(discountRegistryData?.success ? (discountRegistryData.items || []) : []);
        setReliefs(reliefsData?.success ? (reliefsData.items || []) : []);
        setExemptions(exemptionsData?.success ? (exemptionsData.items || []) : []);
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
      setAnomalies(anomaliesData?.success ? (anomaliesData.items || []) : []);
      setAnomalySummary(anomaliesData?.success ? (anomaliesData.summary || null) : null);

      // Only auto-select student if there is exactly one student
      if (refData.students?.length === 1) {
        const onlyStudentId = refData.students[0]._id;
        if (!manualForm.studentId) setManualForm((prev) => ({ ...prev, studentId: onlyStudentId }));
        if (!paymentDeskForm.studentId) setPaymentDeskForm((prev) => ({ ...prev, studentId: onlyStudentId }));
        if (!discountForm.studentId) setDiscountForm((prev) => ({ ...prev, studentId: onlyStudentId }));
        if (!exemptionForm.studentId) setExemptionForm((prev) => ({ ...prev, studentId: onlyStudentId }));
      } else {
        // If multiple students, leave studentId empty for user selection
        if (!manualForm.studentId) setManualForm((prev) => ({ ...prev, studentId: '' }));
        if (!paymentDeskForm.studentId) setPaymentDeskForm((prev) => ({ ...prev, studentId: '' }));
        if (!discountForm.studentId) setDiscountForm((prev) => ({ ...prev, studentId: '' }));
        if (!exemptionForm.studentId) setExemptionForm((prev) => ({ ...prev, studentId: '' }));
      }
      if (nextClassOptions.length && !manualForm.classId) {
        const firstClassId = nextClassOptions[0].classId;
        setManualForm((prev) => ({ ...prev, classId: firstClassId }));
        setBulkForm((prev) => ({ ...prev, classId: firstClassId }));
        setFeePlanForm((prev) => ({ ...prev, classId: firstClassId }));
        setPaymentDeskForm((prev) => ({ ...prev, classId: prev.classId || firstClassId }));
        setDiscountForm((prev) => ({ ...prev, classId: prev.classId || firstClassId }));
        setExemptionForm((prev) => ({ ...prev, classId: prev.classId || firstClassId }));
      }
      if (defaultAcademicYearId && !feePlanForm.academicYearId) {
        setFeePlanForm((prev) => ({ ...prev, academicYearId: defaultAcademicYearId }));
      }
      if (defaultAcademicYearId && !bulkForm.academicYearId) {
        setBulkForm((prev) => ({ ...prev, academicYearId: defaultAcademicYearId }));
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
      if (!selectedReceiptId && nextPendingReceipts[0]?._id) {
        setSelectedReceiptId(nextPendingReceipts[0]._id);
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
      setBusy(false);
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

  const applyFinanceSearchScope = (result = {}, callback) => {
    if (!result?.student?._id) return;
    const scopeSource = result.primaryMatch || result.snapshot?.scopedBills?.[0] || null;
    callback({
      studentId: String(result.student._id || '').trim(),
      classId: getFinanceRecordClassId(scopeSource),
      academicYearId: getFinanceRecordAcademicYearId(scopeSource)
    });
  };

  const openFinanceSearchInPayments = (result = {}) => {
    applyFinanceSearchScope(result, ({ studentId, classId, academicYearId }) => {
      resetPaymentDeskSelection({
        studentId,
        classId: classId || '',
        academicYearId: academicYearId || currentAcademicYearId
      });
      setPaymentStudentSearch(result?.student?.fullName || result?.student?.name || '');
      setActiveSection('payments');
    });
  };

  const openFinanceSearchInReliefs = (result = {}) => {
    applyFinanceSearchScope(result, ({ studentId, classId, academicYearId }) => {
      setDiscountForm((prev) => ({
        ...prev,
        studentId,
        classId: classId || prev.classId,
        academicYearId: academicYearId || prev.academicYearId
      }));
      setExemptionForm((prev) => ({
        ...prev,
        studentId,
        classId: classId || prev.classId,
        academicYearId: academicYearId || prev.academicYearId
      }));
      setDiscountStudentSearch(result?.student?.fullName || result?.student?.name || '');
      setExemptionStudentSearch(result?.student?.fullName || result?.student?.name || '');
      setActiveSection('discounts');
    });
  };

  const openFinanceSearchInOrders = (result = {}) => {
    const studentName = result?.student?.fullName || result?.student?.name || '';
    if (!studentName) return;
    setOrderSearchTerm(studentName);
    setActiveSection('orders');
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    reportClassId,
    deliveryRetryChannelFilter,
    deliveryOpsStatusFilter,
    deliveryOpsProviderFilter,
    deliveryOpsFailureFilter,
    deliveryOpsRetryableFilter,
    deliveryRecoveryStateFilter
  ]);

  useEffect(() => {
    loadCashierReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashierReportDate]);

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

  useEffect(() => {
    if (!pendingReceipts.length) {
      if (selectedReceiptId) setSelectedReceiptId('');
      setSelectedReceiptDetail(null);
      return;
    }
    if (!selectedReceiptId || !pendingReceipts.some((item) => item._id === selectedReceiptId)) {
      setSelectedReceiptId(pendingReceipts[0]._id);
    }
  }, [pendingReceipts, selectedReceiptId]);

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
      && includesFinanceSearch([
        item?.student?.name,
        item?.student?.fullName,
        item?.bill?.billNumber,
        item?.paymentNumber,
        item?.referenceNo,
        item?.paymentMethod,
        item?.status,
        PAYMENT_SOURCE_UI_LABELS[item?.sourceKey] || item?.sourceKey || ''
      ], receiptSearchTerm)
    ))
  ), [pendingReceipts, receiptStatusFilter, receiptSourceFilter, receiptStageFilter, receiptFollowUpFilter, receiptSearchTerm]);

  const selectedReportClass = useMemo(() => (
    classOptions.find((item) => item.classId === reportClassId) || null
  ), [classOptions, reportClassId]);

  const visibleAging = useMemo(() => {
    if (!aging || !reportClassId || !Array.isArray(aging?.rows)) return aging;
    const rows = aging.rows.filter((row) => String(row?.classId || '').trim() === reportClassId);
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_plus: 0 };
    rows.forEach((row) => {
      const remaining = toSafeNumber(row?.remaining);
      const lateDays = toSafeNumber(row?.lateDays);
      if (lateDays <= 0) buckets.current += remaining;
      else if (lateDays <= 30) buckets.d1_30 += remaining;
      else if (lateDays <= 60) buckets.d31_60 += remaining;
      else buckets.d61_plus += remaining;
    });
    return {
      ...aging,
      rows,
      buckets,
      totalRemaining: rows.reduce((sum, row) => sum + toSafeNumber(row?.remaining), 0)
    };
  }, [aging, reportClassId]);

  const visibleByClass = useMemo(() => (
    reportClassId
      ? byClass.filter((row) => String(row?.classId || row?.schoolClass?._id || row?.schoolClass?.id || '').trim() === reportClassId)
      : byClass
  ), [byClass, reportClassId]);

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
  ), [auditTimeline, reportClassId, selectedReportClass, auditTimelineKindFilter, auditTimelineSeverityFilter, auditTimelineSearch]);

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
  const visibleAnomalies = useMemo(() => (
    reportClassId
      ? anomalies.filter((item) => String(item?.classTitle || '').trim() === String(selectedReportClass?.title || '').trim())
      : anomalies
  ), [anomalies, reportClassId, selectedReportClass]);
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

  useEffect(() => {
    let active = true;
    if (!selectedReceiptId) {
      setSelectedReceiptDetail(null);
      return () => {};
    }
    const loadReceiptDetail = async () => {
      try {
        const data = await fetchJson(`${API_BASE}/api/student-finance/payments/${selectedReceiptId}/receipt`);
        if (!active) return;
        if (data?.success && data?.item) {
          setSelectedReceiptDetail(toLegacyLikeReceiptRow(data.item));
          return;
        }
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

  const selectedReceiptBase = useMemo(() => {
    if (!filteredReceipts.length) return null;
    return filteredReceipts.find((item) => item._id === selectedReceiptId) || filteredReceipts[0];
  }, [filteredReceipts, selectedReceiptId]);

  const selectedReceipt = useMemo(() => {
    if (!selectedReceiptBase) return null;
    if (selectedReceiptDetail && selectedReceiptDetail._id === selectedReceiptBase._id) {
      return { ...selectedReceiptBase, ...selectedReceiptDetail };
    }
    return selectedReceiptBase;
  }, [selectedReceiptBase, selectedReceiptDetail]);

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

  const selectedReceiptPrintModel = useMemo(() => {
    if (!selectedReceipt) return null;
    const details = selectedReceipt.receiptDetails || {};
    return {
      title: details.title || selectedReceipt.bill?.billNumber || 'رسید مالی',
      paymentNumber: details.paymentNumber || selectedReceipt.id || '',
      studentName: selectedReceipt.student?.name || '---',
      classTitle: selectedReceipt.classId?.title || selectedReceipt.course?.title || '---',
      academicYearTitle: details.academicYearTitle || '-',
      amount: Number(selectedReceipt.amount || 0),
      currency: details.currency || 'AFN',
      paymentMethod: selectedReceipt.paymentMethod || '-',
      referenceNo: selectedReceipt.referenceNo || '-',
      paidAt: selectedReceipt.paidAt || null,
      note: selectedReceipt.note || '',
      receivedBy: selectedReceipt.receivedBy?.name || 'ثبت سیستمی',
      remainingBeforePayment: details.remainingBeforePayment,
      remainingAfterPayment: details.remainingAfterPayment,
      allocations: Array.isArray(details.allocations) ? details.allocations : []
    };
  }, [selectedReceipt]);

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

  useEffect(() => {
    const handleAfterPrint = () => setPrintMode('');
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  useEffect(() => {
    setPaymentDeskForm((prev) => {
      const validIds = new Set(paymentDeskOpenOrders.map((item) => String(item?.id || '')));
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
      const data = await postJson(`${API_BASE}/api/finance/admin/bills`, manualForm);
      setMessage(data.message || 'بل ایجاد شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const generateBulkBills = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/bills/generate`, bulkForm);
      setBillingPreview(null);
      setMessage(data.message || 'بل گروهی ایجاد شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const previewBulkBills = async () => {
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/bills/preview`, bulkForm);
      setBillingPreview(data);
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
    paidAt: paymentDeskForm.paidAt,
    paymentMethod: paymentDeskForm.paymentMethod,
    allocationMode: paymentDeskForm.allocationMode,
    selectedFeeOrderIds: paymentDeskForm.allocationMode === 'auto_selected' ? paymentDeskSelectedOrderIds : [],
    allocations: paymentDeskForm.allocationMode === 'manual'
      ? paymentDeskOpenOrders
        .map((item) => ({
          feeOrderId: item.id,
          amount: Number(paymentDeskForm.manualAllocations?.[item.id] || 0)
        }))
        .filter((item) => item.amount > 0)
      : [],
    referenceNo: paymentDeskForm.referenceNo,
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
      if (deskPaymentSubmitMode === 'save_print' && createdReceipt?._id) {
        setActiveSection('payments');
        setPrintMode('receipt');
        window.setTimeout(() => window.print(), 0);
      }
      setDeskPaymentSubmitMode('save');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setDeskPaymentSubmitMode('save');
      setBusy(false);
    }
  };

  const saveFeePlan = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
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

  const saveDiscountRegistry = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/discounts`, {
        student: discountForm.studentId,
        classId: discountForm.classId,
        academicYearId: discountForm.academicYearId,
        discountType: discountForm.discountType,
        amount: discountForm.amount,
        reason: discountForm.reason
      });
      const selectedStudent = students.find((item) => String(item?._id || '') === String(discountForm.studentId || ''));
      const selectedClass = classOptions.find((item) => item.classId === discountForm.classId);
      const selectedAcademicYear = academicYears.find((item) => item.id === discountForm.academicYearId);
      const createdDiscount = {
        ...(data?.item || {}),
        id: data?.item?.id || data?.item?._id || `discount-${Date.now()}`,
        discountType: data?.item?.discountType || discountForm.discountType,
        amount: Number(data?.item?.amount || discountForm.amount || 0),
        reason: data?.item?.reason || discountForm.reason,
        status: data?.item?.status || 'active',
        student: data?.item?.student || {
          userId: discountForm.studentId,
          fullName: selectedStudent?.fullName || selectedStudent?.name || '',
          name: selectedStudent?.name || selectedStudent?.fullName || ''
        },
        schoolClass: data?.item?.schoolClass || {
          id: discountForm.classId,
          title: selectedClass?.title || ''
        },
        academicYear: data?.item?.academicYear || {
          id: discountForm.academicYearId,
          title: selectedAcademicYear?.title || ''
        }
      };
      setDiscountRegistry((prev) => [createdDiscount, ...prev.filter((item) => item.id !== createdDiscount.id)]);
      setMessage(data.message || 'تخفیف متعلم ثبت شد');
      setDiscountForm((prev) => ({
        ...prev,
        amount: '',
        reason: ''
      }));
      await loadAll();
      setDiscountRegistry((prev) => [createdDiscount, ...prev.filter((item) => item.id !== createdDiscount.id)]);
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
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
      await loadAll();
      setDiscountRegistry((prev) => prev.filter((item) => item.id !== discountId));
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const saveExemptionRegistry = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/exemptions`, {
        student: exemptionForm.studentId,
        classId: exemptionForm.classId,
        academicYearId: exemptionForm.academicYearId,
        exemptionType: exemptionForm.exemptionType,
        scope: exemptionForm.scope,
        amount: exemptionForm.exemptionType === 'partial' ? exemptionForm.amount : '',
        percentage: exemptionForm.exemptionType === 'partial' ? exemptionForm.percentage : '',
        reason: exemptionForm.reason,
        note: exemptionForm.note
      });
      const selectedStudent = students.find((item) => String(item?._id || '') === String(exemptionForm.studentId || ''));
      const selectedClass = classOptions.find((item) => item.classId === exemptionForm.classId);
      const selectedAcademicYear = academicYears.find((item) => item.id === exemptionForm.academicYearId);
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
          id: exemptionForm.classId,
          title: selectedClass?.title || ''
        },
        academicYear: data?.item?.academicYear || {
          id: exemptionForm.academicYearId,
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
      await loadAll();
      setExemptions((prev) => [createdExemption, ...prev.filter((item) => item.id !== createdExemption.id)]);
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
      await loadAll();
      setExemptions((prev) => prev.filter((item) => item.id !== exemptionId));
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
      await loadAll();
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
      await loadAll();
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
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const printSelectedReceipt = () => {
    if (!selectedReceiptPrintModel) return;
    setPrintMode('receipt');
    window.setTimeout(() => window.print(), 0);
  };

  const printCashierReport = () => {
    if (!cashierReportPrintModel) return;
    setPrintMode('cashier');
    window.setTimeout(() => window.print(), 0);
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
      item?.paymentNumber || item?.id || '',
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
    const type = (window.prompt('نوع (discount/waiver/penalty):', 'discount') || 'discount').trim();
    const reason = window.prompt('دلیل:', '') || '';
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/orders/${billId}/discount`, { type, amount, reason });
      setMessage(data.message || 'تعدیل ثبت شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const setInstallments = async (billId) => {
    const count = Number(window.prompt('تعداد اقساط:', '3') || 0);
    if (!count) return;
    const startDate = window.prompt('تاریخ شروع قسط (YYYY-MM-DD):', '') || '';
    if (!startDate) return;
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/student-finance/orders/${billId}/installments`, { count, startDate, stepDays: 30 });
      setMessage(data.message || 'قسط‌بندی ثبت شد');
      await loadAll();
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
      await loadAll();
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
      setMessage('ارسال پرتال برای سندهای batch پشتیبانی نمی‌شود.');
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
      setMessage(data?.message || 'تنظیمات provider ذخیره شد');
      await loadAll();
      if (data?.item?.channel) {
        setSelectedDeliveryProviderChannel(String(data.item.channel));
      }
    } catch (err) {
      setMessage(err.message || 'ذخیره تنظیمات provider ناموفق بود');
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
      setMessage('برای rotation حداقل یک credential جدید وارد کنید');
      return;
    }
    if (!payload.note) {
      setMessage('برای rotation credential یادداشت ثبت کنید');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-providers/${encodeURIComponent(channel)}/rotate`, payload);
      setMessage(data?.message || 'rotation credentialها ثبت شد');
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
      setMessage(err.message || 'rotation credentialها ناموفق بود');
      setBusy(false);
    }
  };

  const loadSelectedTemplateVersionIntoForm = () => {
    if (!selectedDeliveryTemplateVersion) {
      setMessage('نسخه template انتخاب نشده است');
      return;
    }
    setDeliveryCampaignForm((prev) => ({
      ...prev,
      messageTemplateSubject: String(selectedDeliveryTemplateVersion.subject || '').trim(),
      messageTemplateBody: String(selectedDeliveryTemplateVersion.body || '').trim()
    }));
    setDeliveryTemplateChangeNote(String(selectedDeliveryTemplateVersion.changeNote || '').trim());
    setMessage('نسخه template داخل editor بارگذاری شد');
  };

  const saveDeliveryTemplateDraft = async () => {
    const templateKey = String(deliveryCampaignForm.messageTemplateKey || '').trim();
    if (!templateKey) {
      setMessage('ابتدا یک template پیام انتخاب کنید');
      return;
    }
    if (deliveryTemplateUnknownVariables.length) {
      setMessage(`placeholder نامعتبر: ${deliveryTemplateUnknownVariables.join('، ')}`);
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/draft`, {
        subject: effectiveDeliveryTemplateSubject,
        body: effectiveDeliveryTemplateBody,
        changeNote: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'نسخه پیش‌نویس template ذخیره شد');
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
      setMessage('نسخه draft برای بازبینی موجود نیست');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/review`, {
        versionNumber,
        note: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'نسخه template برای بازبینی ارسال شد');
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
      setMessage('نسخه template برای تایید انتخاب نشده است');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/approve`, {
        versionNumber,
        note: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'نسخه template تایید شد');
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
      setMessage('نسخه template برای رد انتخاب نشده است');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/reject`, {
        versionNumber,
        note: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'نسخه template رد شد');
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
      setMessage('نسخه پیش‌نویس برای publish موجود نیست');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/publish`, {
        versionNumber,
        note: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'نسخه template منتشر شد');
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
      setMessage(data?.message || 'نسخه template آرشیف شد');
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
      setMessage('نسخه template برای rollback انتخاب نشده است');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/templates/${encodeURIComponent(templateKey)}/rollback`, {
        versionNumber,
        note: String(deliveryTemplateChangeNote || '').trim()
      });
      setMessage(data?.message || 'rollback template انجام شد');
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
      setMessage('نام کمپاین delivery را وارد کنید');
      return;
    }
    if (payload.channel === 'portal' && payload.documentType === 'batch_statement_pack') {
      setMessage('کمپاین batch statement با کانال پرتال قابل اجرا نیست.');
      return;
    }
    try {
      setBusy(true);
      const preview = await requestDeliveryTemplatePreview(payload);
      setDeliveryTemplatePreview(preview);
      setDeliveryTemplatePreviewError('');
      if (preview && preview.valid === false && Array.isArray(preview.unknownVariables) && preview.unknownVariables.length) {
        setMessage(`placeholder نامعتبر در template پیام: ${preview.unknownVariables.join('، ')}`);
        setBusy(false);
        return;
      }
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns`, payload);
      setMessage(data?.message || 'کمپاین delivery ایجاد شد');
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
      setMessage(data?.message || `صف کمپاین‌های delivery اجرا شد (${fmt(executed)})`);
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const runDeliveryCampaign = async (campaign = selectedDeliveryCampaign) => {
    const campaignId = String(campaign?._id || '').trim();
    if (!campaignId) {
      setMessage('کمپاین delivery انتخاب نشده است');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/${campaignId}/run`, {});
      setMessage(data?.message || 'کمپاین delivery اجرا شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const toggleDeliveryCampaignStatus = async (campaign = selectedDeliveryCampaign) => {
    const campaignId = String(campaign?._id || '').trim();
    if (!campaignId) {
      setMessage('کمپاین delivery انتخاب نشده است');
      return;
    }
    const nextStatus = String(campaign?.status || '').trim() === 'active' ? 'paused' : 'active';
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/${campaignId}/status`, {
        status: nextStatus
      });
      setMessage(data?.message || 'وضعیت کمپاین delivery به‌روزرسانی شد');
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
      setMessage('برای retry، کمپاین یا سند آرشیف کامل نیست.');
      return;
    }
    try {
      setBusy(true);
      const data = await postJson(`${API_BASE}/api/finance/admin/delivery-campaigns/${campaignId}/retry-target`, {
        archiveId
      });
      setMessage(data?.message || 'delivery دوباره اجرا شد');
      await loadAll();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  const replayDeliveryRecoveryItem = async (item = {}, providerStatus = 'delivered') => {
    const providerMessageId = String(item?.providerMessageId || '').trim();
    if (!providerMessageId) {
      setMessage('برای replay، provider message id موجود نیست.');
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
      setMessage(data?.message || 'replay وضعیت provider انجام شد');
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
        `${API_BASE}/api/finance/admin/anomalies/${selectedAnomaly.id}/note`,
        buildAnomalyActionPayload(selectedAnomaly, { note: anomalyWorkflowForm.note })
      );
      setMessage(data.message || 'یادداشت ناهنجاری مالی ذخیره شد');
      await loadAll();
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
        `${API_BASE}/api/finance/admin/anomalies/${selectedAnomaly.id}/assign`,
        buildAnomalyActionPayload(selectedAnomaly, {
          assignedLevel: anomalyWorkflowForm.assignedLevel,
          note: anomalyWorkflowForm.note
        })
      );
      setMessage(data.message || 'ناهجاری مالی ارجاع شد');
      await loadAll();
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
        `${API_BASE}/api/finance/admin/anomalies/${selectedAnomaly.id}/snooze`,
        buildAnomalyActionPayload(selectedAnomaly, {
          snoozedUntil: anomalyWorkflowForm.snoozedUntil,
          note: anomalyWorkflowForm.note
        })
      );
      setMessage(data.message || 'ناهجاری مالی معطل شد');
      await loadAll();
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
        `${API_BASE}/api/finance/admin/anomalies/${selectedAnomaly.id}/resolve`,
        buildAnomalyActionPayload(selectedAnomaly, { note: anomalyWorkflowForm.note })
      );
      setMessage(data.message || 'ناهجاری مالی حل شد');
      await loadAll();
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
      {message && <div className="finance-msg">{message}</div>}

      <div className="finance-shell-tabs" role="tablist" aria-label="بخش‌های مرکز مالی">
        {financeSections.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            data-testid={`finance-section-${item.key}`}
            aria-selected={activeSection === item.key}
            className={`finance-shell-tab ${activeSection === item.key ? 'active' : ''}`}
            onClick={() => setActiveSection(item.key)}
          >
            <strong>{item.label}</strong>
            <span>{item.hint}</span>
          </button>
        ))}
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

      <div className="finance-card finance-global-search-card">
        <div className="finance-card-head">
          <div>
            <h3>جستجوی سراسری مالی</h3>
            <p className="muted">نام متعلم، شماره بل، نمبر رسید، نام پدر، شماره تماس یا تمویل‌کننده را جستجو کنید.</p>
          </div>
          {globalFinanceSpotlight ? (
            <div className="finance-chip-group">
              <span className="finance-chip finance-chip-emerald">{globalFinanceSpotlight.snapshot.openOrders} بدهی باز</span>
              <span className="finance-chip">{globalFinanceSpotlight.snapshot.reliefCount} تسهیل</span>
              <span className="finance-chip finance-chip-rose">{fmt(globalFinanceSpotlight.snapshot.outstanding)} AFN</span>
            </div>
          ) : null}
        </div>
        <div className="finance-inline-controls">
          <label className="finance-inline-filter finance-inline-filter-wide">
            <span>کلید جستجو</span>
            <input
              value={globalFinanceSearch}
              onChange={(e) => setGlobalFinanceSearch(e.target.value)}
              placeholder="نام متعلم، شماره بل/رسید، نام پدر، تماس یا خیریه"
            />
          </label>
        </div>
        {globalFinanceSearch && !globalFinanceSearchResults.length ? (
          <p className="muted">برای این جستجو نتیجه‌ای پیدا نشد.</p>
        ) : null}
        {globalFinanceSpotlight ? (
          <div className="finance-subcard finance-student-spotlight">
            <div className="finance-card-head">
              <div>
                <h4>
                  <Link to={`/admin-finance/profile/${globalFinanceSpotlight.student.userId || globalFinanceSpotlight.student._id || globalFinanceSpotlight.student.id || ''}`}
                    className="finance-student-profile-link"
                  >
                    {globalFinanceSpotlight.student.fullName || globalFinanceSpotlight.student.name || 'متعلم'}
                  </Link>
                </h4>
                <p className="muted">{globalFinanceSpotlight.classTitle} - {globalFinanceSpotlight.academicYearTitle}</p>
              </div>
              <div className="finance-chip-group">
                {globalFinanceSpotlight.student.admissionNo ? <span className="finance-chip">{globalFinanceSpotlight.student.admissionNo}</span> : null}
                {globalFinanceSpotlight.student.primaryPhone ? <span className="finance-chip finance-chip-muted">{globalFinanceSpotlight.student.primaryPhone}</span> : null}
              </div>
            </div>
            <div className="finance-kpi-grid finance-kpi-grid-dense">
              <div className="finance-kpi-item">
                <span>جمع بدهی</span>
                <strong>{fmt(globalFinanceSpotlight.snapshot.totalDue)} AFN</strong>
              </div>
              <div className="finance-kpi-item">
                <span>پرداخت‌شده</span>
                <strong>{fmt(globalFinanceSpotlight.snapshot.totalPaid)} AFN</strong>
              </div>
              <div className="finance-kpi-item finance-kpi-item-accent">
                <span>باقی‌مانده</span>
                <strong>{fmt(globalFinanceSpotlight.snapshot.outstanding)} AFN</strong>
              </div>
              <div className="finance-kpi-item">
                <span>تسهیلات فعال</span>
                <strong>{globalFinanceSpotlight.snapshot.reliefCount}</strong>
              </div>
            </div>
            <div className="finance-inline-controls">
              <button type="button" className="secondary" onClick={() => openFinanceSearchInPayments(globalFinanceSpotlight)}>باز کردن در میز پرداخت</button>
              <button type="button" className="secondary" onClick={() => openFinanceSearchInReliefs(globalFinanceSpotlight)}>باز کردن در تسهیلات</button>
              <button type="button" className="secondary" onClick={() => openFinanceSearchInOrders(globalFinanceSpotlight)}>فیلتر بل‌ها</button>
            </div>
            {globalFinanceSpotlight.student.guardianName || globalFinanceSpotlight.student.fatherName || globalFinanceSpotlight.student.guardianPhone ? (
              <div className="finance-meta-grid">
                {globalFinanceSpotlight.student.fatherName ? <div><span>نام پدر</span><strong>{globalFinanceSpotlight.student.fatherName}</strong></div> : null}
                {globalFinanceSpotlight.student.guardianName ? <div><span>سرپرست</span><strong>{globalFinanceSpotlight.student.guardianName}</strong></div> : null}
                {globalFinanceSpotlight.student.guardianPhone ? <div><span>تماس سرپرست</span><strong>{globalFinanceSpotlight.student.guardianPhone}</strong></div> : null}
                {globalFinanceSpotlight.snapshot.nextDueOrder?.dueDate ? <div><span>سررسید بعدی</span><strong>{toFaDate(globalFinanceSpotlight.snapshot.nextDueOrder.dueDate)}</strong></div> : null}
              </div>
            ) : null}
            {globalFinanceSearchResults.length > 1 ? (
              <div className="finance-search-results">
                {globalFinanceSearchResults.slice(1, 5).map((result) => (
                  <div key={result.id} className="mini-row">
                    <span>
                      <Link to={`/admin-finance/profile/${result.student.userId || result.student._id || result.student.id || ''}`}
                        className="finance-student-profile-link"
                      >
                        {result.student.fullName || result.student.name || 'متعلم'}
                      </Link>
                    </span>
                    <span>{fmt(result.snapshot.outstanding)} AFN</span>
                    <button type="button" className="secondary" onClick={() => openFinanceSearchInPayments(result)}>انتخاب</button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="finance-control-rail">
        {/* حذف دکمه‌های لندسکیپ و پورتریت */}
        {activeSection === 'orders' && (
          <div className="finance-subsection-tabs" role="group" aria-label="فورم‌های بل و تعهدات">
            <button type="button" className={orderFormMode === 'manual' ? 'secondary is-active' : 'secondary'} onClick={() => setOrderFormMode('manual')}>بل دستی</button>
            <button type="button" className={orderFormMode === 'bulk' ? 'secondary is-active' : 'secondary'} onClick={() => setOrderFormMode('bulk')}>صدور گروهی</button>
          </div>
        )}
        {activeSection === 'discounts' && (
          <div className="finance-subsection-tabs" role="group" aria-label="فورم‌های تخفیف و معافیت">
            <button type="button" className={reliefFormMode === 'discount' ? 'secondary is-active' : 'secondary'} onClick={() => setReliefFormMode('discount')}>فورم تخفیف</button>
            <button type="button" className={reliefFormMode === 'exemption' ? 'secondary is-active' : 'secondary'} onClick={() => setReliefFormMode('exemption')}>فورم معافیت</button>
          </div>
        )}
      </div>

      <div className="finance-summary" data-finance-section="overview">
        <div><span>رسیدهای در انتظار</span><strong>{summary?.pendingReceipts || 0}</strong></div>
        <div><span>بل‌های معوق</span><strong>{summary?.overdueBills || 0}</strong></div>
        <div><span>وصول امروز</span><strong>{fmt(summary?.todayCollection)} AFN</strong></div>
        <div><span>وصول ماه</span><strong>{fmt(summary?.monthCollection)} AFN</strong></div>
        <div><span>تسهیلات فعال</span><strong>{summary?.activeReliefs || activeFinanceReliefCount}</strong></div>
        <div><span>تسهیلات ثابت</span><strong>{fmt(summary?.fixedReliefAmount || 0)} AFN</strong></div>
        <div><span>نرخ وصول</span><strong>{summary?.collectionRate || 0}%</strong></div>
        <div><span>مرحله مدیر مالی</span><strong>{summary?.receiptWorkflow?.financeManager || 0}</strong></div>
        <div><span>مرحله آمریت مالی</span><strong>{summary?.receiptWorkflow?.financeLead || 0}</strong></div>
        <div><span>مرحله ریاست عمومی</span><strong>{summary?.receiptWorkflow?.generalPresident || 0}</strong></div>
      </div>

      <div className="finance-grid finance-dashboard-grid" data-finance-section="overview">
        <div className="finance-card finance-kpi-card">
          <div className="finance-card-head">
            <div>
              <h3>وضعیت فیس شاگردان</h3>
              <p className="muted">نمای فوری تعهدات مالی شاگردان بر اساس بل‌های ثبت‌شده.</p>
            </div>
            <span className="finance-chip finance-chip-emerald">{openBillsCount} بدهی باز</span>
          </div>
          <div className="finance-kpi-grid">
            <div className="finance-kpi-item">
              <span>کل بدهی</span>
              <strong>{fmt(financeHeadlineStats.totalDue)} AFN</strong>
            </div>
            <div className="finance-kpi-item">
              <span>کل پرداخت‌شده</span>
              <strong>{fmt(financeHeadlineStats.totalPaid)} AFN</strong>
            </div>
            <div className="finance-kpi-item finance-kpi-item-accent">
              <span>باقی‌مانده</span>
              <strong>{fmt(financeHeadlineStats.outstanding)} AFN</strong>
            </div>
          </div>
          <div className="finance-kpi-card-footer">
            <button type="button" className="secondary" onClick={() => setActiveSection('orders')}>باز کردن بل‌ها و تعهدات</button>
          </div>
        </div>

        <div className="finance-card finance-kpi-card">
          <div className="finance-card-head">
            <div>
              <h3>وضعیت امروز</h3>
              <p className="muted">فعالیت روز جاری صندوق و ثبت رسیدها در یک نگاه.</p>
            </div>
            <span className="finance-chip">{toFaDate(cashierReportDate)}</span>
          </div>
          <div className="finance-kpi-grid">
            <div className="finance-kpi-item">
              <span>پرداخت‌های امروز</span>
              <strong>{financeHeadlineStats.todayPayments}</strong>
            </div>
            <div className="finance-kpi-item">
              <span>تعداد رسیدها</span>
              <strong>{financeHeadlineStats.todayReceipts}</strong>
            </div>
            <div className="finance-kpi-item finance-kpi-item-accent">
              <span>مجموع نقدی</span>
              <strong>{fmt(financeHeadlineStats.todayCash)} AFN</strong>
            </div>
          </div>
          <div className="finance-kpi-card-footer">
            <button type="button" className="secondary" onClick={() => setActiveSection('payments')}>باز کردن میز پرداخت</button>
          </div>
        </div>

        <div className="finance-card finance-kpi-card">
          <div className="finance-card-head">
            <div>
              <h3>وضعیت ماه</h3>
              <p className="muted">درآمد این ماه و مقایسه با ماه گذشته.</p>
            </div>
            <span className={`finance-chip ${monthlyComparison.deltaAmount >= 0 ? 'finance-chip-emerald' : 'finance-chip-rose'}`}>
              {monthlyComparison.deltaAmount >= 0 ? 'رشد' : 'افت'} {fmt(Math.abs(monthlyComparison.deltaAmount))} AFN
            </span>
          </div>
          <div className="finance-kpi-grid">
            <div className="finance-kpi-item">
              <span>درآمد این ماه</span>
              <strong>{fmt(monthlyComparison.currentMonth)} AFN</strong>
            </div>
            <div className="finance-kpi-item">
              <span>ماه قبل</span>
              <strong>{fmt(monthlyComparison.previousMonth)} AFN</strong>
            </div>
            <div className="finance-kpi-item finance-kpi-item-accent">
              <span>مقایسه ماهانه</span>
              <strong>{fmt(Math.abs(monthlyComparison.deltaPercent))}% {monthlyComparison.deltaAmount >= 0 ? 'بیشتر' : 'کمتر'}</strong>
            </div>
          </div>
          <div className="finance-kpi-card-footer">
            <button type="button" className="secondary" onClick={() => setActiveSection('reports')}>باز کردن گزارش‌های ماهانه</button>
          </div>
        </div>

        <div className="finance-card finance-kpi-card">
          <div className="finance-card-head">
            <div>
              <h3>شاگردان مشکل‌دار</h3>
              <p className="muted">شاگردانی که بیشترین بدهی یا وضعیت معوق دارند.</p>
            </div>
            <span className="finance-chip finance-chip-rose">{summary?.overdueBills || 0} بل معوق</span>
          </div>
          <div className="finance-problem-list">
            {problemStudents.map((row) => (
              <div key={row.id} className="finance-problem-row">
                <strong>{row.name}</strong>
                <span>{fmt(row.amount)} AFN</span>
              </div>
            ))}
            {!problemStudents.length && <p className="muted">فعلاً شاگرد بدهکار شاخصی ثبت نشده است.</p>}
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
              <h3>نمودار درآمد</h3>
              <p className="muted">نمای روزانه، هفته‌ای یا ماهانه‌ی وصول مالی بر پایه جریان نقدی ثبت‌شده.</p>
            </div>
            <div className="finance-layout-toggle" role="group" aria-label="بازه زمانی نمودار درآمد">
              <button type="button" className={incomeTrendRange === 'daily' ? 'secondary is-active' : 'secondary'} onClick={() => setIncomeTrendRange('daily')}>روزانه</button>
              <button type="button" className={incomeTrendRange === 'weekly' ? 'secondary is-active' : 'secondary'} onClick={() => setIncomeTrendRange('weekly')}>هفته‌ای</button>
              <button type="button" className={incomeTrendRange === 'monthly' ? 'secondary is-active' : 'secondary'} onClick={() => setIncomeTrendRange('monthly')}>ماهانه</button>
            </div>
          </div>
          {incomeTrendSeries.length ? (
            <div className="finance-line-chart">
              <svg viewBox="0 0 520 220" className="finance-line-chart-svg" role="img" aria-label="نمودار درآمد">
                <defs>
                  <linearGradient id="financeIncomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(56, 189, 248, 0.34)" />
                    <stop offset="100%" stopColor="rgba(56, 189, 248, 0.02)" />
                  </linearGradient>
                </defs>
                {[0, 1, 2, 3].map((step) => {
                  const y = 20 + ((180 / 3) * step);
                  return <line key={`income-grid-${step}`} x1="20" y1={y} x2="500" y2={y} className="finance-line-grid" />;
                })}
                <path d={incomeTrendChart.areaPath} className="finance-line-fill" />
                <path d={incomeTrendChart.linePath} className="finance-line-path" />
                {incomeTrendChart.points.map((point) => (
                  <circle key={`income-point-${point.bucket}`} cx={point.x} cy={point.y} r="4.5" className="finance-line-point" />
                ))}
              </svg>
              <div className="finance-line-chart-legend">
                {incomeTrendSeries.slice(-6).map((item) => (
                  <div key={`income-legend-${item.bucket}`} className="finance-line-legend-item">
                    <span>{item.label}</span>
                    <strong>{fmt(item.total)} AFN</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted finance-chart-empty">برای نمودار درآمد هنوز داده کافی ثبت نشده است.</p>
          )}
        </div>

        <div className="finance-card finance-chart-card" data-testid="paid-vs-due-card">
          <div className="finance-card-head">
            <div>
              <h3>پرداخت در برابر بدهی</h3>
              <p className="muted">مقایسه وصول و تعهد هر صنف برای تشخیص شکاف پرداخت.</p>
            </div>
            <span className="finance-chip finance-chip-muted">{paidVsDueRows.length} صنف</span>
          </div>
          <div className="finance-compare-list">
            {paidVsDueRows.map((row) => (
              <div key={row.key} className="finance-compare-row">
                <div className="finance-compare-head">
                  <strong>{row.label}</strong>
                  <span>{row.collectionRate}% وصول</span>
                </div>
                <div className="finance-compare-bars">
                  <div className="finance-compare-track">
                    <span className="finance-compare-bar finance-compare-bar-due" style={{ width: `${(row.due / paidVsDueMax) * 100}%` }} />
                  </div>
                  <div className="finance-compare-track">
                    <span className="finance-compare-bar finance-compare-bar-paid" style={{ width: `${(row.paid / paidVsDueMax) * 100}%` }} />
                  </div>
                </div>
                <div className="finance-compare-meta">
                  <span>بدهی: {fmt(row.due)} AFN</span>
                  <span>پرداخت: {fmt(row.paid)} AFN</span>
                  <span>باقی‌مانده: {fmt(row.outstanding)} AFN</span>
                </div>
              </div>
            ))}
            {!paidVsDueRows.length && <p className="muted finance-chart-empty">برای مقایسه پرداخت و بدهی هنوز داده‌ای موجود نیست.</p>}
          </div>
        </div>
      </div>

      <div className="finance-grid" data-finance-section="overview">
        <div className="finance-card finance-spotlight-card">
          <div className="finance-card-head">
            <div>
              <h3>میانبرهای عملیاتی</h3>
              <p className="muted">از اینجا مستقیم به میز پرداخت، بل‌ها، تخفیف‌ها، گزارش‌ها و تنظیمات بروید.</p>
            </div>
          </div>
          <div className="finance-shell-shortcuts">
            <button type="button" onClick={() => setActiveSection('payments')}>ثبت پرداخت و رسید</button>
            <button type="button" className="secondary" onClick={() => setActiveSection('orders')}>بل‌ها و تعهدات</button>
            <button type="button" className="secondary" onClick={() => setActiveSection('discounts')}>تخفیف و معافیت</button>
            <button type="button" className="secondary" onClick={() => setActiveSection('reports')}>گزارش‌های مالی</button>
            <button type="button" className="secondary" onClick={() => setActiveSection('settings')}>پلان فیس و تنظیمات</button>
            <Link className="finance-launch-link" to="/admin-government-finance">فرماندهی مالی دولت</Link>
          </div>
          <div className="finance-subcard-list">
            <div className="mini-row">
              <span>جمع تخفیف و معافیت فعال</span>
              <span>{activeFinanceReliefCount}</span>
            </div>
            <div className="mini-row">
              <span>پلان‌های فیس ثبت‌شده</span>
              <span>{feePlans.length}</span>
            </div>
            <div className="mini-row">
              <span>ماه‌های مالی بسته‌شده</span>
              <span>{closedMonths.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="finance-grid" data-finance-section="overview payments orders settings">
        <div className="finance-card" data-finance-section="overview payments" data-testid="cashier-daily-report">
          <div className="finance-card-head">
            <div>
              <h3>گزارش صندوق روزانه</h3>
              <p className="muted">وصول همان روز، تفکیک روش پرداخت، و سهم هر مسئول ثبت را از اینجا ببینید.</p>
            </div>
            <label className="finance-inline-filter">
              <span>تاریخ گزارش</span>
              <input type="date" value={cashierReportDate} onChange={(e) => setCashierReportDate(e.target.value)} />
              <small>{cashierReportDate ? `هجری شمسی: ${toFaDate(cashierReportDate)}` : 'تاریخ انتخاب نشده است.'}</small>
            </label>
            <button type="button" className="secondary" onClick={exportCashierReportCsv}>CSV</button>
            <button type="button" className="secondary" onClick={printCashierReport}>چاپ</button>
          </div>
          <div className="finance-summary finance-summary-compact">
            <div><span>کل پرداخت‌ها</span><strong>{cashierReport?.summary?.totalPayments || 0}</strong></div>
            <div><span>ثبت‌شده</span><strong>{fmt(cashierReport?.summary?.totalCollected || 0)} AFN</strong></div>
            <div><span>تاییدشده</span><strong>{fmt(cashierReport?.summary?.approvedAmount || 0)} AFN</strong></div>
            <div><span>در انتظار</span><strong>{fmt(cashierReport?.summary?.pendingAmount || 0)} AFN</strong></div>
          </div>
          <div className="finance-grid finance-grid-tight">
            <div className="finance-subcard">
              <h4>روش‌های پرداخت تاییدشده</h4>
              {(cashierReport?.methodTotals || []).map((item) => (
                <div key={`cashier-method-${item.method}`} className="mini-row">
                  <span>{PAYMENT_METHOD_UI_LABELS[item.method] || item.method}</span>
                  <span>{fmt(item.amount)} AFN / {item.count}</span>
                </div>
              ))}
              {!cashierReport?.methodTotals?.length && <p className="muted">برای این روز پرداخت تاییدشده‌ای ثبت نشده است.</p>}
            </div>
            <div className="finance-subcard">
              <h4>ثبت‌کنندگان پرداخت تاییدشده</h4>
              {(cashierReport?.cashiers || []).map((item) => (
                <div key={`cashier-user-${item.id}`} className="mini-row">
                  <span>{item.name}</span>
                  <span>{fmt(item.amount)} AFN / {item.count}</span>
                </div>
              ))}
              {!cashierReport?.cashiers?.length && <p className="muted">برای این روز ثبت‌کننده تاییدشده‌ای دیده نشد.</p>}
            </div>
          </div>
        </div>

        {!!cashierReport?.items?.length && (
          <div className="finance-card" data-finance-section="overview payments">
            <h3>آخرین ثبت‌های روز</h3>
            <div className="finance-subcard-list">
              {cashierReport.items.slice(0, 5).map((item) => (
                <div key={`cashier-row-${item.id || item.paymentNumber}`} className="mini-row">
                  <span>{item.student?.fullName || item.student?.name || 'متعلم'}</span>
                  <span>{fmt(item.amount)} AFN / {PAYMENT_METHOD_UI_LABELS[item.paymentMethod] || item.paymentMethod || '-'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {orderFormMode === 'manual' && (
          <form className="finance-card" data-finance-section="orders" onSubmit={createManualBill} data-testid="manual-bill-form">
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
                placeholder="نام، ایمیل یا شناسه متعلم"
              />
            </label>
            <select value={manualForm.studentId} onChange={(e) => setManualForm((p) => ({ ...p, studentId: e.target.value }))}>
              {manualStudentOptions.length ? manualStudentOptions.map((student) => (
                <option key={student._id} value={student._id}>{getStudentOptionLabel(student)}</option>
              )) : (
                <option value="">متعلمی پیدا نشد</option>
              )}
            </select>
            <div className="finance-split-grid">
              <select value={manualForm.classId} onChange={(e) => setManualForm((p) => ({ ...p, classId: e.target.value }))}>
                {classOptions.map((item) => <option key={item.classId} value={item.classId}>{getClassOptionLabel(item)}</option>)}
              </select>
              <input value={manualForm.amount} onChange={(e) => setManualForm((p) => ({ ...p, amount: e.target.value }))} placeholder="مبلغ AFN" />
            </div>
            <div className="finance-split-grid">
              <div className="finance-cell-stack">
                <input type="date" value={manualForm.dueDate} onChange={(e) => setManualForm((p) => ({ ...p, dueDate: e.target.value }))} />
                <small>{manualForm.dueDate ? `هجری شمسی: ${toFaDate(manualForm.dueDate)}` : 'سررسید انتخاب نشده است.'}</small>
              </div>
              <input value={manualForm.academicYear} onChange={(e) => setManualForm((p) => ({ ...p, academicYear: e.target.value }))} placeholder="سال آموزشی" />
            </div>
            <div className="finance-split-grid">
              <input value={manualForm.term} onChange={(e) => setManualForm((p) => ({ ...p, term: e.target.value }))} placeholder="ترم" />
              <input value={manualForm.periodLabel} onChange={(e) => setManualForm((p) => ({ ...p, periodLabel: e.target.value }))} placeholder="عنوان دوره" />
            </div>
            <button type="submit" disabled={busy}>ایجاد بل</button>
          </form>
        )}

        <form className="finance-card" data-finance-section="payments" onSubmit={createDeskPayment} data-testid="finance-payment-desk">
          <div className="finance-card-head">
            <div>
              <h3>ثبت پرداخت دفتر مالی</h3>
              <p className="muted">متعلم، صنف و سال تعلیمی را انتخاب کنید؛ بعد سیستم بدهی‌های باز را پیدا و تخصیص پرداخت را پیش‌نمایش می‌کند.</p>
            </div>
            <span className="finance-chip finance-chip-emerald">{paymentPreview?.membership?.student?.fullName || paymentDeskStudent?.name || 'عضویت مالی'}</span>
          </div>
          <label className="finance-inline-filter finance-inline-filter-wide">
            <span>جستجوی متعلم</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                value={paymentStudentSearch}
                onChange={(e) => handlePaymentStudentSearchChange(e.target.value)}
                placeholder="نام، ایمیل یا شناسه متعلم"
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
          <select data-testid="desk-student-select" value={paymentDeskForm.studentId} onChange={(e) => handlePaymentDeskStudentChange(e.target.value)}>
            <option value="">ابتدا شاگرد را انتخاب کنید</option>
            {paymentStudentOptions.length ? paymentStudentOptions.map((student) => (
              <option key={`payment-student-${student._id}`} value={student._id}>{getStudentOptionLabel(student)}</option>
            )) : (
              <option value="" disabled>متعلمی پیدا نشد</option>
            )}
          </select>
          <div className="finance-split-grid">
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
          </div>
          <div className="finance-split-grid">
            <input value={paymentDeskForm.amount} onChange={(e) => { setPaymentDeskForm((p) => ({ ...p, amount: e.target.value })); setPaymentPreview(null); }} placeholder="مبلغ پرداخت" />
            <select data-testid="desk-payment-method-select" value={paymentDeskForm.paymentMethod} onChange={(e) => setPaymentDeskForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
              <option value="cash">نقدی</option>
              <option value="bank_transfer">بانکی</option>
              <option value="hawala">حواله</option>
              <option value="manual">دستی</option>
            </select>
          </div>
          <div className="finance-split-grid">
            <input type="date" value={paymentDeskForm.paidAt} onChange={(e) => setPaymentDeskForm((p) => ({ ...p, paidAt: e.target.value }))} />
            <span className="finance-chip finance-chip-muted">{paymentDeskForm.paidAt ? `تاریخ پرداخت: ${toFaDate(paymentDeskForm.paidAt)}` : 'تاریخ پرداخت انتخاب نشده'}</span>
          </div>
          <div className="finance-split-grid">
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
            <input value={paymentDeskForm.referenceNo} onChange={(e) => setPaymentDeskForm((p) => ({ ...p, referenceNo: e.target.value }))} placeholder="شماره رسید / مرجع" />
          </div>
          <textarea value={paymentDeskForm.note} onChange={(e) => setPaymentDeskForm((p) => ({ ...p, note: e.target.value }))} rows={3} placeholder="یادداشت پرداخت" />
          <div className="finance-chip-group">
            <span className="finance-chip">{paymentDeskClass?.title || 'صنف'}</span>
            <span className="finance-chip finance-chip-muted">{paymentDeskAcademicYear?.title || 'سال تعلیمی'}</span>
            <span className="finance-chip finance-chip-emerald">{fmt(paymentDeskTotalOutstanding)} AFN مانده کل</span>
            <span className="finance-chip">{paymentDeskOpenOrders.length} بدهی باز</span>
            {paymentDeskForm.allocationMode === 'auto_selected' && <span className="finance-chip finance-chip-muted">{paymentDeskSelectedOrderIds.length} مورد انتخاب شده</span>}
            {paymentDeskForm.allocationMode === 'manual' && <span className="finance-chip finance-chip-muted">{fmt(paymentDeskManualAllocated)} AFN تخصیص دستی</span>}
            {paymentDeskForm.allocationMode === 'manual' && Number(paymentDeskForm.amount || 0) > 0 && (
              <span className={`finance-chip ${paymentDeskRemainingAmount < 0 ? 'finance-chip-rose' : 'finance-chip-muted'}`}>{fmt(paymentDeskRemainingAmount)} AFN اختلاف با مبلغ پرداخت</span>
            )}
          </div>
          {!!paymentDeskForm.studentId && (
            <div className="finance-subcard finance-student-spotlight">
              <div className="finance-card-head">
                <div>
                  <h4>کارت مالی متعلم</h4>
                  <p className="muted">خلاصه بدهی، وصول و تسهیلات فعال برای همین دامنه انتخاب‌شده.</p>
                </div>
                <div className="finance-chip-group">
                  <span className="finance-chip finance-chip-emerald">{paymentDeskFinanceSnapshot.reliefCount} تسهیل فعال</span>
                  {!!paymentDeskFinanceSnapshot.fullReliefCount && <span className="finance-chip">کامل: {paymentDeskFinanceSnapshot.fullReliefCount}</span>}
                  {!!paymentDeskFinanceSnapshot.percentReliefCount && <span className="finance-chip finance-chip-muted">درصدی: {paymentDeskFinanceSnapshot.percentReliefCount}</span>}
                </div>
              </div>
              <div className="finance-kpi-grid finance-kpi-grid-dense">
                <div className="finance-kpi-item">
                  <span>کل بدهی</span>
                  <strong>{fmt(paymentDeskFinanceSnapshot.totalDue)} AFN</strong>
                </div>
                <div className="finance-kpi-item">
                  <span>کل پرداخت</span>
                  <strong>{fmt(paymentDeskFinanceSnapshot.totalPaid)} AFN</strong>
                </div>
                <div className="finance-kpi-item finance-kpi-item-accent">
                  <span>باقی‌مانده</span>
                  <strong>{fmt(paymentDeskFinanceSnapshot.outstanding)} AFN</strong>
                </div>
                <div className="finance-kpi-item">
                  <span>تسهیلات مبلغی</span>
                  <strong>{fmt(paymentDeskFinanceSnapshot.fixedReliefAmount)} AFN</strong>
                </div>
              </div>
              <div className="finance-subcard-list">
                <div className="mini-row">
                  <span>بدهی‌های باز</span>
                  <span>{paymentDeskFinanceSnapshot.openOrders}</span>
                </div>
                <div className="mini-row">
                  <span>نزدیک‌ترین سررسید</span>
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
          {paymentDeskOpenOrders.length > 0 ? (
            <div className="finance-order-pick-list" data-testid="desk-open-orders">
              {paymentDeskOpenOrders.map((item) => (
                <div key={`pick-${item.id}`} className="finance-flag finance-order-pick-row">
                  <div className="finance-order-pick-copy">
                    {paymentDeskForm.allocationMode === 'auto_selected' ? (
                      <label className="finance-order-pick-toggle">
                        <input
                          type="checkbox"
                          checked={paymentDeskSelectedOrderIds.includes(item.id)}
                          onChange={() => toggleDeskOrderSelection(item.id)}
                        />
                        <span>{item.title || item.billNumber || 'بدهی مالی'}</span>
                      </label>
                    ) : (
                      <strong>{item.title || item.billNumber || 'بدهی مالی'}</strong>
                    )}
                    <small>سررسید: {toFaDate(item.dueDate)} | مانده: {fmt(item.outstandingAmount || 0)} AFN</small>
                  </div>
                  {paymentDeskForm.allocationMode === 'manual' ? (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      max={item.outstandingAmount || 0}
                      value={paymentDeskForm.manualAllocations?.[item.id] || ''}
                      onChange={(e) => updateDeskManualAllocation(item.id, e.target.value)}
                      placeholder="مبلغ تخصیص"
                      data-testid={`desk-manual-allocation-${item.id}`}
                    />
                  ) : (
                    <span className={`finance-chip ${paymentDeskSelectedOrderIds.includes(item.id) ? 'finance-chip-emerald' : 'finance-chip-muted'}`}>
                      {paymentDeskForm.allocationMode === 'auto_selected'
                        ? (paymentDeskSelectedOrderIds.includes(item.id) ? 'انتخاب شده' : 'انتخاب نشده')
                        : `${fmt(item.outstandingAmount || 0)} AFN`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted finance-order-empty">برای متعلم، صنف و سال تعلیمی انتخاب‌شده هیچ بدهی باز پیدا نشد.</p>
          )}
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
                  <span>{item.title || item.orderNumber || 'بدهی مالی'} - {fmt(item.outstandingAmount || 0)} AFN</span>
                </label>
              ))}
            </div>
          )}
          {Array.isArray(paymentPreview?.allocations) && paymentPreview.allocations.length > 0 && (
            <div className="finance-preview-list" data-testid="desk-payment-preview">
              <div className="finance-chip-group">
                <span className="finance-chip">{paymentPreview.allocations.length} تخصیص</span>
                <span className="finance-chip finance-chip-emerald">{fmt(paymentPreview.totalAllocated || 0)} AFN</span>
                <span className="finance-chip finance-chip-muted">{fmt(paymentPreview.remainingAmount || 0)} AFN باقی‌مانده</span>
              </div>
              {paymentPreview.allocations.map((item) => (
                <div key={`allocation-${item.feeOrderId}`} className="finance-plan-row">
                  <strong>{item.title || item.orderNumber || 'بدهی مالی'}</strong>
                  <span>{fmt(item.amount || 0)} AFN</span>
                  <small>{item.orderNumber || item.feeOrderId}</small>
                </div>
              ))}
            </div>
          )}
          <div className="row-actions">
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
              disabled={busy || !paymentPreview?.allocations?.length || !paymentDeskForm.paidAt || paymentDeskManualMismatch}
              data-testid="submit-print-desk-payment"
            >
              ثبت و چاپ رسید
            </button>
            <button
              type="submit"
              onClick={() => setDeskPaymentSubmitMode('save')}
              disabled={busy || !paymentPreview?.allocations?.length || !paymentDeskForm.paidAt || paymentDeskManualMismatch}
              data-testid="submit-desk-payment"
            >
              ثبت پرداخت
            </button>
          </div>
        </form>

        {orderFormMode === 'bulk' && (
          <form className="finance-card" data-finance-section="orders" onSubmit={generateBulkBills} data-testid="bulk-billing-form">
            <div className="finance-card-head">
              <div>
                <h3>صدور گروهی بل</h3>
                <p className="muted">برای یک صنف و سال تعلیمی مشخص، بل‌های ماهانه یا دوره‌ای را یک‌جا بسازید و قبل از ثبت، پیش‌نمایش بگیرید.</p>
              </div>
              <span className="finance-chip">{classOptions.length} صنف</span>
            </div>
            <select value={bulkForm.classId} onChange={(e) => setBulkForm((p) => ({ ...p, classId: e.target.value }))}>
              {classOptions.map((item) => <option key={item.classId} value={item.classId}>{getClassOptionLabel(item)}</option>)}
            </select>
            <div className="finance-split-grid">
              <select value={bulkForm.academicYearId} onChange={(e) => setBulkForm((p) => ({ ...p, academicYearId: e.target.value }))}>
                {academicYears.map((item) => <option key={`bulk-year-${item.id}`} value={item.id}>{getAcademicYearOptionLabel(item)}</option>)}
              </select>
              <input value={bulkForm.amount} onChange={(e) => setBulkForm((p) => ({ ...p, amount: e.target.value }))} placeholder="مبلغ شهریه (اختیاری)" />
            </div>
            <div className="finance-split-grid">
              <div className="finance-cell-stack">
                <input type="date" value={bulkForm.dueDate} onChange={(e) => setBulkForm((p) => ({ ...p, dueDate: e.target.value }))} />
                <small>{bulkForm.dueDate ? `هجری شمسی: ${toFaDate(bulkForm.dueDate)}` : 'سررسید گروهی انتخاب نشده است.'}</small>
              </div>
              <input value={bulkForm.academicYear} onChange={(e) => setBulkForm((p) => ({ ...p, academicYear: e.target.value }))} placeholder="سال آموزشی" />
            </div>
            <div className="finance-split-grid">
              <input value={bulkForm.term} onChange={(e) => setBulkForm((p) => ({ ...p, term: e.target.value }))} placeholder="ترم" />
              <input value={bulkForm.periodLabel} onChange={(e) => setBulkForm((p) => ({ ...p, periodLabel: e.target.value }))} placeholder="عنوان دوره" />
            </div>
            <div className="finance-flag-grid">
              <label className="finance-flag">
                <input type="checkbox" checked={bulkForm.includeAdmission} onChange={(e) => setBulkForm((p) => ({ ...p, includeAdmission: e.target.checked }))} />
                <span>شامل داخله</span>
              </label>
              <label className="finance-flag">
                <input type="checkbox" checked={bulkForm.includeTransport} onChange={(e) => setBulkForm((p) => ({ ...p, includeTransport: e.target.checked }))} />
                <span>شامل ترانسپورت</span>
              </label>
              <label className="finance-flag">
                <input type="checkbox" checked={bulkForm.onlyDebtors} onChange={(e) => setBulkForm((p) => ({ ...p, onlyDebtors: e.target.checked }))} />
                <span>فقط بدهکاران</span>
              </label>
            </div>
            <div className="row-actions">
              <button type="button" onClick={previewBulkBills} disabled={busy}>پیش‌نمایش بل‌ها</button>
              <button type="submit" disabled={busy}>صدور گروهی</button>
            </div>
            {billingPreview && (
              <div className="finance-preview-list" data-testid="bulk-billing-preview">
                <div className="finance-chip-group">
                  <span className="finance-chip">{billingPreview.summary?.candidateCount || 0} مورد قابل صدور</span>
                  <span className="finance-chip finance-chip-muted">{billingPreview.summary?.duplicateCount || 0} duplicate</span>
                  <span className="finance-chip finance-chip-emerald">{fmt(billingPreview.summary?.totalAmountDue || 0)} AFN</span>
                </div>
                {(billingPreview.items || []).slice(0, 5).map((item) => (
                  <div key={`preview-${item.studentMembershipId || item.studentId}`} className="finance-plan-row">
                    <strong>{students.find((student) => String(student._id) === String(item.studentId))?.name || item.studentId || 'متعلم'}</strong>
                    <span>{fmt(item.amountDue)} AFN - {(item.feeScopes || []).join(', ')}</span>
                    {!!formatFeeLineSummary(item.lineItems).length && <small>{formatFeeLineSummary(item.lineItems)}</small>}
                    <small>{item.duplicate ? `duplicate: ${item.duplicate.billNumber}` : `${item.adjustments?.length || 0} adjustment`}</small>
                  </div>
                ))}
                {!!billingPreview.excluded?.length && <p className="muted">Excluded: {billingPreview.excluded.length}</p>}
              </div>
            )}
          </form>
        )}

        <form className="finance-card" data-finance-section="settings" onSubmit={saveFeePlan}>
          <div className="finance-card-head">
            <div>
              <h3>تنظیم ساختار اصلی فیس</h3>
              <p className="muted">پلان فیس را برای صنف و سال تعلیمی مشخص بسازید و بعداً از همین‌جا جستجو و مرور کنید.</p>
            </div>
            <span className="finance-chip finance-chip-muted">{filteredFeePlans.length} پلان</span>
          </div>
          <label className="finance-inline-filter finance-inline-filter-wide">
            <span>جستجوی پلان فیس</span>
            <input
              value={feePlanSearchTerm}
              onChange={(e) => setFeePlanSearchTerm(e.target.value)}
              placeholder="عنوان، کد پلان، صنف، سال یا نوع پلان"
            />
          </label>
          <input value={feePlanForm.title} onChange={(e) => setFeePlanForm((p) => ({ ...p, title: e.target.value }))} placeholder="عنوان پلان" />
          <select value={feePlanForm.classId} onChange={(e) => setFeePlanForm((p) => ({ ...p, classId: e.target.value }))}>
            {classOptions.map((item) => <option key={item.classId} value={item.classId}>{getClassOptionLabel(item)}</option>)}
          </select>
          <select value={feePlanForm.academicYearId} onChange={(e) => setFeePlanForm((p) => ({ ...p, academicYearId: e.target.value }))}>
            {academicYears.map((item) => <option key={item.id} value={item.id}>{getAcademicYearOptionLabel(item)}</option>)}
          </select>
          <select value={feePlanForm.billingFrequency} onChange={(e) => setFeePlanForm((p) => ({ ...p, billingFrequency: e.target.value }))}>
            {Object.entries(FEE_PLAN_FREQUENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div className="finance-split-grid">
            <input value={feePlanForm.term} onChange={(e) => setFeePlanForm((p) => ({ ...p, term: e.target.value }))} placeholder="ترم / دوره" />
            <input
              value={feePlanForm.planCode}
              onChange={(e) => setFeePlanForm((p) => ({ ...p, planCode: e.target.value.toUpperCase() }))}
              placeholder="کد پلان (اختیاری)"
            />
          </div>
          <div className="finance-split-grid">
            <select value={feePlanForm.planType} onChange={(e) => setFeePlanForm((p) => ({ ...p, planType: e.target.value }))}>
              {Object.entries(FEE_PLAN_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input
              type="number"
              min="0"
              value={feePlanForm.priority}
              onChange={(e) => setFeePlanForm((p) => ({ ...p, priority: e.target.value }))}
              placeholder="اولویت (عدد کمتر = ارجح)"
            />
          </div>
          <div className="finance-split-grid">
            <div className="finance-cell-stack">
              <input
                type="date"
                value={feePlanForm.effectiveFrom}
                onChange={(e) => setFeePlanForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
              />
              <small>{feePlanForm.effectiveFrom ? `هجری شمسی: ${toFaDate(feePlanForm.effectiveFrom)}` : 'تاریخ شروع مؤثر انتخاب نشده است.'}</small>
            </div>
            <div className="finance-cell-stack">
              <input
                type="date"
                value={feePlanForm.effectiveTo}
                onChange={(e) => setFeePlanForm((p) => ({ ...p, effectiveTo: e.target.value }))}
              />
              <small>{feePlanForm.effectiveTo ? `هجری شمسی: ${toFaDate(feePlanForm.effectiveTo)}` : 'تاریخ ختم مؤثر انتخاب نشده است.'}</small>
            </div>
          </div>
          <div className="finance-split-grid">
            <input value={feePlanForm.tuitionFee} onChange={(e) => setFeePlanForm((p) => ({ ...p, tuitionFee: e.target.value }))} placeholder="شهریه" />
            <input value={feePlanForm.admissionFee} onChange={(e) => setFeePlanForm((p) => ({ ...p, admissionFee: e.target.value }))} placeholder="داخله" />
            <input value={feePlanForm.examFee} onChange={(e) => setFeePlanForm((p) => ({ ...p, examFee: e.target.value }))} placeholder="فیس امتحان" />
            <input value={feePlanForm.documentFee} onChange={(e) => setFeePlanForm((p) => ({ ...p, documentFee: e.target.value }))} placeholder="فیس اسناد" />
            <input value={feePlanForm.transportDefaultFee} onChange={(e) => setFeePlanForm((p) => ({ ...p, transportDefaultFee: e.target.value }))} placeholder="ترانسپورت پیش فرض" />
            <input value={feePlanForm.otherFee} onChange={(e) => setFeePlanForm((p) => ({ ...p, otherFee: e.target.value }))} placeholder="سایر" />
          </div>
          <div className="finance-split-grid">
            <input value={feePlanForm.currency} onChange={(e) => setFeePlanForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} placeholder="واحد پول" />
            <input type="number" min="1" max="28" value={feePlanForm.dueDay} onChange={(e) => setFeePlanForm((p) => ({ ...p, dueDay: e.target.value }))} placeholder="روز سررسید" />
          </div>
          <input
            value={feePlanForm.eligibilityRule}
            onChange={(e) => setFeePlanForm((p) => ({ ...p, eligibilityRule: e.target.value }))}
            placeholder="قاعده اهلیت (مثلاً خواهر-برادر دوم یا حمایت خیریه)"
          />
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
          <div className="finance-plan-list">
            {filteredFeePlans.slice(0, 8).map((plan) => (
              <div key={plan._id} className="finance-plan-row">
                <strong>{plan.title || 'Fee plan'}</strong>
                <span>{plan.schoolClass?.title || 'صنف نامشخص'} - {plan.academicYear?.title || plan.academicYear || 'سال نامشخص'}</span>
                <span>
                  {(FEE_PLAN_TYPE_LABELS[plan.planType] || plan.planType || 'عادی')}
                  {plan.planCode ? ` - ${plan.planCode}` : ''}
                  {' | '}
                  {(FEE_PLAN_FREQUENCY_LABELS[plan.billingFrequency] || plan.billingFrequency || 'دوره‌ای')}
                  {plan.term ? ` | ${plan.term}` : ''}
                </span>
                <small>
                  شهریه: {fmt(plan.tuitionFee || plan.amount)} | داخله: {fmt(plan.admissionFee)} | امتحان: {fmt(plan.examFee)}
                </small>
                <small>
                  ترانسپورت: {fmt(plan.transportDefaultFee)} | اسناد: {fmt(plan.documentFee)} | اولویت: {plan.priority ?? '-'}
                </small>
                <small>
                  {plan.isDefault ? 'پیش‌فرض' : 'غیرپیش‌فرض'}
                  {plan.effectiveFrom ? ` | از: ${toFaDate(plan.effectiveFrom)}` : ''}
                  {plan.effectiveTo ? ` | تا: ${toFaDate(plan.effectiveTo)}` : ''}
                </small>
                {!!plan.eligibilityRule && <small>قاعده: {plan.eligibilityRule}</small>}
              </div>
            ))}
            {!filteredFeePlans.length && <p className="muted">برای این جستجو یا تنظیمات، پلانی پیدا نشد.</p>}
          </div>
        </form>
      </div>

      <div className="finance-grid" data-finance-section="discounts">
        {reliefFormMode === 'discount' && (
          <form className="finance-card" data-finance-section="discounts" onSubmit={saveDiscountRegistry} data-testid="discount-registry-form">
            <div className="finance-card-head">
              <div>
                <h3>ثبت تخفیف متعلم</h3>
                <p className="muted">تخفیف‌های رسمی و ثبت‌شده را بر اساس متعلم، صنف و سال تعلیمی قفل کنید.</p>
              </div>
              <span className="finance-chip">{discountRegistry.length} فعال</span>
            </div>
            <label className="finance-inline-filter finance-inline-filter-wide">
              <span>جستجوی متعلم</span>
              <input
                value={discountStudentSearch}
                onChange={(e) => setDiscountStudentSearch(e.target.value)}
                placeholder="نام، ایمیل یا شناسه متعلم"
              />
            </label>
            <select value={discountForm.studentId} onChange={(e) => setDiscountForm((prev) => ({ ...prev, studentId: e.target.value }))}>
              {discountStudentOptions.length ? discountStudentOptions.map((student) => (
                <option key={`discount-student-${student._id}`} value={student._id}>{getStudentOptionLabel(student)}</option>
              )) : (
                <option value="">متعلمی پیدا نشد</option>
              )}
            </select>
            <div className="finance-split-grid">
              <select value={discountForm.classId} onChange={(e) => setDiscountForm((prev) => ({ ...prev, classId: e.target.value }))}>
                {classOptions.map((item) => <option key={`discount-class-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>)}
              </select>
              <select value={discountForm.academicYearId} onChange={(e) => setDiscountForm((prev) => ({ ...prev, academicYearId: e.target.value }))}>
                {academicYears.map((item) => <option key={`discount-year-${item.id}`} value={item.id}>{getAcademicYearOptionLabel(item)}</option>)}
              </select>
            </div>
            <div className="finance-split-grid">
              <select value={discountForm.discountType} onChange={(e) => setDiscountForm((prev) => ({ ...prev, discountType: e.target.value }))}>
                {Object.entries(DISCOUNT_TYPE_UI_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input value={discountForm.amount} onChange={(e) => setDiscountForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="مبلغ تخفیف / تعدیل" />
            </div>
            <textarea value={discountForm.reason} onChange={(e) => setDiscountForm((prev) => ({ ...prev, reason: e.target.value }))} rows={3} placeholder="دلیل تخفیف، معافیت یا تعدیل" />
            <button type="submit" disabled={busy} data-testid="save-discount-registry">ثبت تخفیف</button>
          </form>
        )}

        {reliefFormMode === 'exemption' && (
          <form className="finance-card" data-finance-section="discounts" onSubmit={saveExemptionRegistry} data-testid="exemption-registry-form">
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
                placeholder="نام، ایمیل یا شناسه متعلم"
              />
            </label>
            <select value={exemptionForm.studentId} onChange={(e) => setExemptionForm((prev) => ({ ...prev, studentId: e.target.value }))}>
              {exemptionStudentOptions.length ? exemptionStudentOptions.map((student) => (
                <option key={`exemption-student-${student._id}`} value={student._id}>{getStudentOptionLabel(student)}</option>
              )) : (
                <option value="">متعلمی پیدا نشد</option>
              )}
            </select>
            <div className="finance-split-grid">
              <select value={exemptionForm.classId} onChange={(e) => setExemptionForm((prev) => ({ ...prev, classId: e.target.value }))}>
                {classOptions.map((item) => <option key={`exemption-class-${item.classId}`} value={item.classId}>{getClassOptionLabel(item)}</option>)}
              </select>
              <select value={exemptionForm.academicYearId} onChange={(e) => setExemptionForm((prev) => ({ ...prev, academicYearId: e.target.value }))}>
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

      <div className="finance-grid" data-finance-section="discounts">
        <div className="finance-card finance-spotlight-card" data-finance-section="discounts" data-testid="relief-registry-hub">
          <div className="finance-card-head">
            <div>
              <h3>رجیستر یکپارچه تسهیلات مالی</h3>
              <p className="muted">تخفیف، معافیت، بورسیه و حمایت خیریه را در یک لیست واحد ببینید و از همین‌جا پیگیری کنید.</p>
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
                placeholder="نام متعلم، صنف، سال، دلیل، نوع یا دامنه"
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
          </div>
          <div className="finance-registry-list">
            {filteredReliefRegistry.map((item) => {
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
          </div>
        </div>

        <div className="finance-card finance-spotlight-card" data-finance-section="discounts" data-testid="relief-student-spotlight">
          <div className="finance-card-head">
            <div>
              <h3>پروفایل مالی متعلم</h3>
              <p className="muted">هم‌زمان با ثبت تخفیف یا معافیت، اثر همان تصمیم را روی وضعیت مالی متعلم ببینید.</p>
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
          <div className="finance-kpi-grid finance-kpi-grid-dense">
            <div className="finance-kpi-item">
              <span>کل بدهی</span>
              <strong>{fmt(reliefFocusSnapshot.totalDue)} AFN</strong>
            </div>
            <div className="finance-kpi-item">
              <span>کل پرداخت</span>
              <strong>{fmt(reliefFocusSnapshot.totalPaid)} AFN</strong>
            </div>
            <div className="finance-kpi-item finance-kpi-item-accent">
              <span>باقی‌مانده</span>
              <strong>{fmt(reliefFocusSnapshot.outstanding)} AFN</strong>
            </div>
            <div className="finance-kpi-item">
              <span>تسهیلات مبلغی</span>
              <strong>{fmt(reliefFocusSnapshot.fixedReliefAmount)} AFN</strong>
            </div>
          </div>
          <div className="finance-subcard-list">
            <div className="mini-row">
              <span>بدهی‌های باز</span>
              <span>{reliefFocusSnapshot.openOrders}</span>
            </div>
            <div className="mini-row">
              <span>پوشش کامل / درصدی</span>
              <span>{reliefFocusSnapshot.fullReliefCount} / {reliefFocusSnapshot.percentReliefCount}</span>
            </div>
            <div className="mini-row">
              <span>نزدیک‌ترین سررسید</span>
              <span>{reliefFocusSnapshot.nextDueOrder?.dueDate ? toFaDate(reliefFocusSnapshot.nextDueOrder.dueDate) : '-'}</span>
            </div>
            {reliefFocusSnapshot.topReliefs.map((item) => (
              <div key={`focus-relief-${item.id}`} className="mini-row">
                <span>{RELIEF_TYPE_UI_LABELS[item.reliefType] || item.reliefType || 'تسهیل'}</span>
                <span>{getReliefValueLabel(item)}</span>
              </div>
            ))}
            {!reliefFocusSnapshot.topReliefs.length && (
              <div className="mini-row">
                <span>تسهیلات فعال</span>
                <span className="finance-chip finance-chip-muted">0 مورد</span>
              </div>
            )}
          </div>
        </div>

        <div className="finance-card" data-finance-section="discounts" data-testid="discount-registry-list">
          <div className="finance-card-head">
            <div>
              <h3>رجیستر تخفیف‌ها</h3>
              <p className="muted">وضعیت تخفیف‌های فعال، مبلغ، دلیل و ساحه‌ی مالی هر متعلم را از اینجا ببینید.</p>
            </div>
            <div className="finance-chip-group">
              <span className="finance-chip">{filteredDiscountRegistry.length} مورد</span>
              <span className="finance-chip finance-chip-muted">{fmt(filteredDiscountRegistry.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))} AFN</span>
            </div>
          </div>
          <label className="finance-inline-filter finance-inline-filter-wide">
            <span>جستجو در رجیستر تخفیف‌ها</span>
            <input
              value={discountRegistrySearch}
              onChange={(e) => setDiscountRegistrySearch(e.target.value)}
              placeholder="نام متعلم، صنف، سال، دلیل یا نوع تخفیف"
            />
          </label>
          <div className="finance-registry-list">
            {filteredDiscountRegistry.map((item) => (
              <div key={item.id} className="finance-registry-row">
                <div>
                  <strong>{item.student?.fullName || item.student?.name || 'متعلم'}</strong>
                  <span>{item.schoolClass?.title || 'صنف'} - {item.academicYear?.title || 'سال'}</span>
                  <small>{item.reason || 'بدون توضیح'}</small>
                </div>
                <div className="finance-registry-meta">
                  <span className="finance-chip">{DISCOUNT_TYPE_UI_LABELS[item.discountType] || item.discountType || 'تخفیف'}</span>
                  <strong>{fmt(item.amount)} AFN</strong>
                </div>
                <div className="row-actions">
                  <button type="button" className="danger" disabled={busy} onClick={() => cancelDiscountRegistry(item.id)} data-testid={`cancel-discount-${item.id}`}>لغو</button>
                </div>
              </div>
            ))}
            {!filteredDiscountRegistry.length && <p className="muted">برای این جستجو، تخفیفی پیدا نشد.</p>}
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
              placeholder="نام متعلم، صنف، سال، دلیل یا دامنه معافیت"
            />
          </label>
          <div className="finance-registry-list">
            {filteredExemptionRegistry.map((item) => (
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

      <div id="pending-receipts" className="finance-card" data-finance-section="payments">
        <div className="finance-toolbar">
          <div>
            <h3>رسیدهای در انتظار تایید</h3>
            <p className="muted">فایل رسید، مرحله فعلی و trail تایید را از همین بخش بررسی کنید.</p>
          </div>
          <label className="finance-inline-filter finance-inline-filter-wide">
            <span>جستجو در رسیدها</span>
            <input
              value={receiptSearchTerm}
              onChange={(e) => setReceiptSearchTerm(e.target.value)}
              placeholder="نام شاگرد، شماره بل، مرجع یا روش پرداخت"
            />
          </label>
          <label className="finance-inline-filter">
            <span>فیلتر مرحله</span>
            <select value={receiptStageFilter} onChange={(e) => setReceiptStageFilter(e.target.value)}>
              <option value="all">همه مراحل</option>
              <option value="finance_manager_review">مدیر مالی</option>
              <option value="finance_lead_review">آمریت مالی</option>
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
              <option value="legacy_receipt">رسید legacy</option>
              <option value="guardian_upload">ارسال ولی/متعلم</option>
              <option value="cashier_manual">ثبت صندوق</option>
              <option value="canonical_manual">پرداخت canonical</option>
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
        </div>
        <div className="finance-chip-group receipt-inbox-summary">
          <span className="finance-chip">کل: {receiptInboxSummary.total}</span>
          <span className="finance-chip finance-chip-emerald">در انتظار: {receiptInboxSummary.pending}</span>
          <span className="finance-chip">تاییدشده: {receiptInboxSummary.approved}</span>
          <span className="finance-chip finance-chip-rose">ردشده: {receiptInboxSummary.rejected}</span>
          <span className="finance-chip finance-chip-muted">ارجاع‌شده: {receiptInboxSummary.escalated}</span>
        </div>
        {!filteredReceipts.length && <p className="muted">پرداختی با این فیلتر پیدا نشد.</p>}
        {!!filteredReceipts.length && (
          <div className="receipt-review-layout">
            <div className="finance-table receipts-table">
              <div className="head"><span>متعلم</span><span>سند / منبع</span><span>مبلغ</span><span>وضعیت</span><span>مرحله / پیگیری</span><span>عملیات</span></div>
              {filteredReceipts.map((item) => {
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
                      <small>{item.paymentNumber || item._id}</small>
                    </div>
                    <div className="receipt-cell-stack">
                      <strong>{item.bill?.billNumber || '---'}</strong>
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
                    <span>{selectedReceipt.bill?.billNumber || '---'}</span>
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
                  <div><span>شماره پرداخت</span><strong>{selectedReceipt.paymentNumber || selectedReceipt._id || '-'}</strong></div>
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
                  <button type="button" className="secondary" onClick={printSelectedReceipt} data-testid="print-selected-receipt">
                    چاپ رسید
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
                            <strong>{allocation.title || allocation.orderNumber || 'بدهی'}</strong>
                            <span>{fmt(allocation.amount)} AFN</span>
                          </div>
                          <div className="trail-item-meta">
                            <span>{allocation.orderNumber || '-'}</span>
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
      </div>

      <div className="finance-card" data-finance-section="orders">
        <div className="finance-toolbar">
          <div>
            <h3>بل‌ها و تعهدات</h3>
            <p className="muted">بل‌ها را با جستجو و فیلتر وضعیت مرور کنید و عملیات لازم را از همین‌جا انجام دهید.</p>
          </div>
          <label className="finance-inline-filter finance-inline-filter-wide">
            <span>جستجو در بل‌ها</span>
            <input
              value={orderSearchTerm}
              onChange={(e) => setOrderSearchTerm(e.target.value)}
              placeholder="شماره بل، عنوان، نام شاگرد یا صنف"
            />
          </label>
          <label className="finance-inline-filter">
            <span>وضعیت بل</span>
            <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)}>
              <option value="all">همه وضعیت‌ها</option>
              <option value="new">جدید</option>
              <option value="pending">در انتظار</option>
              <option value="partial">نیمه‌پرداخت</option>
              <option value="paid">تصفیه‌شده</option>
              <option value="overdue">معوق</option>
              <option value="void">باطل</option>
            </select>
          </label>
        </div>
        {!filteredBills.length && <p className="muted">برای این فیلتر، بلی پیدا نشد.</p>}
        <div className="finance-table bills-table">
          <div className="head"><span>شماره</span><span>شاگرد</span><span>صنف</span><span>وضعیت</span><span>باقیمانده</span><span>عملیات</span></div>
          {filteredBills.slice(0, 120).map((bill) => (
            <div key={bill._id} className="row">
              <span className="finance-cell-stack">
                <strong>{bill.billNumber}</strong>
                {!!bill.feeLineSummary && <small>{bill.feeLineSummary}</small>}
              </span>
              <span>{bill.student?.name || '---'}</span>
              <span className="finance-cell-stack">
                <strong>{bill.classId?.title || bill.schoolClass?.title || bill.course?.title || '---'}</strong>
                {!!bill.lineItems?.length && <small>{bill.lineItems.length} ردیف مالی</small>}
              </span>
              <span>{bill.status}</span>
              <span>{fmt(Math.max(0, (bill.amountDue || 0) - (bill.amountPaid || 0)))}</span>
              <div className="row-actions">
                <button type="button" onClick={() => addDiscount(bill._id)} disabled={busy}>تخفیف/تعدیل</button>
                <button type="button" onClick={() => setInstallments(bill._id)} disabled={busy}>قسط‌بندی</button>
                {bill.status !== 'void' && (
                  <button type="button" className="danger" onClick={() => voidBill(bill._id)} disabled={busy}>باطل</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="finance-grid" data-finance-section="overview reports">
        <div className="finance-card" data-finance-section="overview reports" data-testid="aging-report-card">
          <h3>گزارش معوقات</h3>
          <p>جاری: {fmt(visibleAging?.buckets?.current || 0)} | 1-30: {fmt(visibleAging?.buckets?.d1_30 || 0)} | 31-60: {fmt(visibleAging?.buckets?.d31_60 || 0)} | 60+: {fmt(visibleAging?.buckets?.d61_plus || 0)}</p>
          <p>مجموع معوق: {fmt(visibleAging?.totalRemaining || 0)} AFN</p>
          <p className="muted">تسهیلات فعال: {visibleAging?.reliefSummary?.activeCount || aging?.reliefSummary?.activeCount || 0} | ثابت: {fmt(visibleAging?.reliefSummary?.fixedAmount || aging?.reliefSummary?.fixedAmount || 0)} AFN</p>
        </div>
        <div className="finance-card" data-finance-section="overview reports" data-testid="by-class-report-card">
          <h3>وصول به تفکیک صنف</h3>
          {visibleByClass.slice(0, 6).map((row) => (
            <div key={row.classId || row.courseId || row.course} className="mini-row">
              <span className="finance-cell-stack">
                <strong>{row.schoolClass?.title || row.course}</strong>
                {!!row.reliefCount && <small>{row.reliefCount} تسهیل | {fmt(row.fixedReliefAmount || 0)} AFN</small>}
              </span>
              <span>{fmt(row.paid)} / {fmt(row.due)}</span>
            </div>
          ))}
        </div>
        <div className="finance-card" data-finance-section="overview reports" data-testid="top-debtors-card">
          <h3>بدهکاران اصلی</h3>
          {topDebtors.slice(0, 6).map((row) => (
            <div key={row.studentId || row.name} className="mini-row">
              <span>{row.name}</span>
              <span>{fmt(row.amount)} AFN</span>
            </div>
          ))}
        </div>
      </div>

      <div className="finance-grid" data-finance-section="overview reports settings discounts">
        <div className="finance-card" data-finance-section="overview settings">
          <h3>ماه‌های بسته شده</h3>
          {closedMonths.slice(0, 8).map((item) => (
            <div key={item._id} className="mini-row">
              <span>{toFaMonthKey(item.monthKey)}</span>
              <span>{item.closedBy?.name || 'ادمین'}</span>
            </div>
          ))}
        </div>
        <div className="finance-card" data-finance-section="overview reports">
          <h3>جریان نقدی روزانه</h3>
          {cashflow.slice(-7).map((row) => (
            <div key={row.date} className="mini-row">
              <span>{toFaDate(row.date)}</span>
              <span>{fmt(row.total)}</span>
            </div>
          ))}
          <p className="muted">در انتظار: {fmt(cashflowReport?.pendingTotal || 0)} AFN | تسهیلات دوره: {cashflowReport?.reliefSummary?.activeCount || 0}</p>
        </div>
        <div className="finance-card" data-finance-section="overview reports discounts">
          <h3>جمع تخفیف‌ها</h3>
          {discountTotals.map((row) => (
            <div key={row._id} className="mini-row">
              <span>{row._id}</span>
              <span>{fmt(row.total)}</span>
            </div>
          ))}
          <p className="muted">تسهیلات فعال: {discountAnalytics?.summary?.activeReliefs || activeFinanceReliefCount} | بورسیه فعال: {discountAnalytics?.summary?.activeScholarships || 0}</p>
          <p className="muted">تعداد پلان‌های فیس: {feePlans.length}</p>
        </div>
      </div>

      <div className="finance-grid" data-finance-section="overview reports settings">
        <div className="finance-card" data-finance-section="overview reports settings" data-testid="finance-anomalies-card">
          <div className="finance-card-head">
            <div>
              <h3>ناهجاری‌های مالی</h3>
              <p className="muted">هشدارهای هوشمند برای بیش‌پرداخت، معوقات طولانی، ختم تسهیلات و مغایرت‌های مالی.</p>
            </div>
            <div className="finance-chip-group">
              <span className="finance-chip">{visibleAnomalySummary.total}</span>
              <span className="finance-chip finance-chip-rose">{visibleAnomalySummary.critical}</span>
              <span className="finance-chip finance-chip-amber">{visibleAnomalySummary.warning}</span>
              <span className="finance-chip finance-chip-muted">{visibleAnomalySummary.byWorkflow?.assigned || 0} ارجاع</span>
              <span className="finance-chip finance-chip-emerald">{visibleAnomalySummary.byWorkflow?.resolved || 0} حل‌شده</span>
            </div>
          </div>
          {visibleAnomalies.slice(0, 6).map((item) => (
            <div key={item.id} className="mini-row">
              <span className="finance-cell-stack">
                <strong>{FINANCE_ANOMALY_UI_LABELS[item.anomalyType] || item.anomalyType || 'ناهنجاری'}</strong>
                <small>{item.studentName || item.classTitle || item.referenceNumber || '—'}</small>
              </span>
              <span className={`finance-chip ${item.severity === 'critical' ? 'finance-chip-rose' : item.severity === 'warning' ? 'finance-chip-amber' : 'finance-chip-muted'}`}>
                {AUDIT_SEVERITY_UI_LABELS[item.severity] || item.severity || 'اطلاع'}
              </span>
            </div>
          ))}
          {!!visibleAnomalies.length && (
            <div className="anomaly-workflow-layout">
              <div className="anomaly-workflow-list" data-testid="finance-anomaly-list">
                {visibleAnomalies.slice(0, 12).map((item) => (
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
                        <input
                          type="date"
                          value={anomalyWorkflowForm.snoozedUntil}
                          onChange={(e) => setAnomalyWorkflowForm((prev) => ({ ...prev, snoozedUntil: e.target.value }))}
                          data-testid="anomaly-snooze-until"
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
                        <button type="button" onClick={resolveAnomaly} disabled={busy || !selectedAnomaly} data-testid="anomaly-resolve-button">ثبت حل‌شدن</button>
                      </div>
                    </div>
                  </div>

                  <div className="receipt-trail">
                    <h4>history ناهنجاری مالی</h4>
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
                        <p className="muted">برای این ناهنجاری هنوز history ثبت نشده است.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {!visibleAnomalies.length && <p className="muted">در این scope فعلاً ناهنجاری مالی فعالی دیده نشد.</p>}
        </div>
        {selectedMonthClose ? (
          <div className="finance-card" data-finance-section="overview settings reports" data-testid="month-close-snapshot-card">
            <div className="finance-card-head">
              <div>
                <h3>snapshot ماه مالی {toFaMonthKey(selectedMonthClose.monthKey)}</h3>
                <p className="muted">نمای ثابت از ارقام ماه، معوقات، reliefها و ناهنجاری‌های همان close.</p>
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
                <button type="button" className="secondary" onClick={() => exportMonthClosePdfPack(selectedMonthClose)} disabled={busy} data-testid="export-month-close-pdf">بسته PDF</button>
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
              <div className="finance-kpi-item">
                <span>ناهجاری حساس</span>
                <strong>{fmt(monthCloseSnapshot?.anomalies?.summary?.critical || 0)}</strong>
              </div>
            </div>
            <div className="finance-subcard-list">
              <div className="mini-row">
                <span>معوقات</span>
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
                <span>وضعیت ناهنجاری‌ها</span>
                <span>{fmt(monthCloseSnapshot?.anomalies?.summary?.byWorkflow?.open || 0)} باز / {fmt(monthCloseSnapshot?.anomalies?.summary?.byWorkflow?.resolved || 0)} حل‌شده</span>
              </div>
              <div className="mini-row">
                <span>یادداشت close</span>
                <span>{selectedMonthCloseDetail?.requestNote || selectedMonthClose?.requestNote || selectedMonthClose.note || selectedMonthClose.reopenNote || 'بدون یادداشت'}</span>
              </div>
              <div className="mini-row">
                <span>وضعیت readiness</span>
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

      <div className="finance-card" data-finance-section="reports settings" data-testid="finance-delivery-provider-config-card">
        <div className="finance-card-head">
          <div>
            <h3>تنظیمات Provider و Webhook</h3>
            <p className="muted">برای SMS و WhatsApp، mode ارسال، credentialها، token ورودی و مسیر callback را از همین بخش تنظیم کنید.</p>
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
                  <div><span>مسیر Webhook</span><strong>{selectedDeliveryProviderConfig.readiness?.webhookPath || '-'}</strong></div>
                  <div><span>آدرس Webhook</span><strong>{selectedDeliveryProviderConfig.readiness?.webhookUrl || '-'}</strong></div>
                  <div><span>آدرس callback وضعیت</span><strong>{selectedDeliveryProviderConfig.readiness?.providerCallbackUrl || '-'}</strong></div>
                  <div><span>نسخه credential</span><strong>v{fmt(selectedDeliveryProviderConfig.credentialVersion || 1)}</strong></div>
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
                      <strong>تاریخچه rotation و audit</strong>
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
                    <p className="muted">هنوز رویداد rotation یا audit برای این کانال ثبت نشده است.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="muted">هنوز تنظیمات provider برای این بخش دریافت نشده است.</p>
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
                <span>Mode</span>
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
                <span>نام Provider</span>
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
                <span>آدرس API</span>
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
                  <span>آدرس Webhook</span>
                  <input
                    value={deliveryProviderForm.webhookUrl}
                    onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, webhookUrl: e.target.value }))}
                    placeholder={selectedDeliveryProviderConfig?.webhookUrl || 'https://provider.example.com/send'}
                    data-testid="finance-delivery-provider-webhook-url"
                  />
                </label>
                <label className="finance-inline-filter finance-inline-filter-wide">
                  <span>آدرس callback وضعیت</span>
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
                  <span>شناسه حساب (Account SID)</span>
                  <input
                    value={deliveryProviderForm.accountSid}
                    onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, accountSid: e.target.value }))}
                    placeholder={selectedDeliveryProviderConfig?.fields?.accountSid?.masked || 'بدون تغییر'}
                    data-testid="finance-delivery-provider-account-sid"
                  />
                </label>
                <label className="finance-inline-filter finance-inline-filter-wide">
                  <span>رمز احراز هویت (Auth Token)</span>
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
                  <span>رمز دسترسی (Access Token)</span>
                  <input
                    value={deliveryProviderForm.accessToken}
                    onChange={(e) => setDeliveryProviderForm((prev) => ({ ...prev, accessToken: e.target.value }))}
                    placeholder={selectedDeliveryProviderConfig?.fields?.accessToken?.masked || 'بدون تغییر'}
                    data-testid="finance-delivery-provider-access-token"
                  />
                </label>
                <label className="finance-inline-filter finance-inline-filter-wide">
                  <span>شناسه شماره (Phone Number ID)</span>
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
                <span>Webhook Token</span>
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
                <span>یادداشت Rotation</span>
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
      </div>

      <div className="finance-card" data-finance-section="reports settings" data-testid="finance-delivery-campaign-card">
        <div className="finance-card-head">
          <div>
            <h3>کمپاین و اتوماسیون Delivery</h3>
            <p className="muted">ارسال زمان‌بندی‌شده اسناد آرشیف‌شده، retry روی موارد ناموفق، و اجرای صف آماده را از همین‌جا مدیریت کنید.</p>
          </div>
          <div className="finance-chip-group">
            <span className="finance-chip">{deliveryCampaigns.length} کمپاین</span>
            <span className="finance-chip finance-chip-muted">{deliveryCampaigns.filter((item) => item?.status === 'active').length} فعال</span>
          </div>
        </div>
        <div className="finance-toolbar">
          <label className="finance-inline-filter">
            <span>وضعیت delivery</span>
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
            <span>provider</span>
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
            <span>failure code</span>
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
            <span>retryability</span>
            <select
              value={deliveryOpsRetryableFilter}
              onChange={(e) => setDeliveryOpsRetryableFilter(e.target.value)}
              data-testid="finance-delivery-retryability-filter"
            >
              <option value="all">همه</option>
              <option value="retryable">retryable</option>
              <option value="blocked">blocked</option>
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
                  <strong>برش provider</strong>
                  <span>توزیع ارسال‌ها به تفکیک gateway یا provider</span>
                </div>
                <span className="finance-chip finance-chip-muted">{fmt(deliveryProviderBreakdown.length)} provider</span>
              </div>
              <div className="finance-subcard-list">
                <div className="mini-row">
                  <span>retry ready</span>
                  <strong>{fmt(deliveryAnalytics.summary.readyToRetryCount || 0)}</strong>
                </div>
                <div className="mini-row">
                  <span>waiting retry</span>
                  <strong>{fmt(deliveryAnalytics.summary.waitingRetryCount || 0)}</strong>
                </div>
                <div className="mini-row">
                  <span>blocked retry</span>
                  <strong>{fmt(deliveryAnalytics.summary.blockedRetryCount || 0)}</strong>
                </div>
                <div className="mini-row">
                  <span>awaiting callback</span>
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
                  <span>failure codeهای غالب برای تیم عملیاتی</span>
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
                  <span>آخرین موارد queue برای resend یا رفع‌اشکال</span>
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
                <p className="muted">برای batch statement، month-close pack یا statementهای انفرادی کمپاین بسازید.</p>
              </div>
            </div>
            <div className="delivery-template-workspace">
              <div className="delivery-template-catalog" data-testid="finance-delivery-template-variable-catalog">
                <div className="document-archive-item-head">
                  <div>
                    <strong>کاتالوگ متغیرهای template</strong>
                    <span>{fmt(deliveryTemplateVariables.length)} متغیر قابل استفاده</span>
                  </div>
                  {!!deliveryTemplateUsedVariables.length && (
                    <span className="finance-chip finance-chip-muted">استفاده‌شده: {fmt(deliveryTemplateUsedVariables.length)}</span>
                  )}
                </div>
                {!deliveryTemplateVariables.length ? (
                  <p className="muted">هنوز کاتالوگ متغیرهای template دریافت نشده است.</p>
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
                    <strong>placeholder نامعتبر</strong>
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
                  <p className="muted">برای دیدن preview، یک template انتخاب کنید یا subject/body را وارد کنید.</p>
                ) : deliveryTemplatePreviewError ? (
                  <div className="delivery-template-warning-list" data-testid="finance-delivery-template-preview-errors">
                    <strong>خطا در preview</strong>
                    <p>{deliveryTemplatePreviewError}</p>
                  </div>
                ) : !deliveryTemplatePreview ? (
                  <p className="muted">preview آماده نشده است.</p>
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
                      <div><span>scope</span><strong>{deliveryTemplatePreview.rolloutPreview?.scope?.documentType || deliveryTemplatePreview.sample?.documentType || '-'}</strong></div>
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
                      <span>subject رندرشده</span>
                      <p>{deliveryTemplatePreview.renderedSubject || '-'}</p>
                    </div>
                    <div className="receipt-note-box">
                      <span>body رندرشده</span>
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
                        <strong>یادداشت‌های preview</strong>
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
                <span>template پیام</span>
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
                    <strong>Ù…Ø¯ÛŒØ±ÛŒØª Ù†Ø³Ø®Ù‡â€ŒÙ‡Ø§ÛŒ template</strong>
                    <span>
                      published v{fmt(selectedDeliveryTemplate.publishedVersionNumber || 1)}
                      {selectedDeliveryTemplate.draftVersionNumber ? ` | draft v${fmt(selectedDeliveryTemplate.draftVersionNumber)}` : ''}
                    </span>
                  </div>
                  <div className="finance-chip-group">
                    <span className="finance-chip finance-chip-muted">{(selectedDeliveryTemplate.versions || []).length} Ù†Ø³Ø®Ù‡</span>
                    {selectedDeliveryTemplate.hasCustomizations ? (
                      <span className="finance-chip finance-chip-emerald">custom</span>
                    ) : (
                      <span className="finance-chip finance-chip-muted">system</span>
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
                    <span>Ù†Ø³Ø®Ù‡ Ø§Ù†ØªØ®Ø§Ø¨ÛŒ</span>
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
                    <span>Ù†ÙˆØª ØªØºÛŒÛŒØ±</span>
                    <input
                      value={deliveryTemplateChangeNote}
                      onChange={(e) => setDeliveryTemplateChangeNote(e.target.value)}
                      placeholder="Ø®Ù„Ø§ØµÙ‡ ØªØºÛŒÛŒØ±Ø§Øª ÛŒØ§ Ø¯Ù„ÛŒÙ„ publish/rollback"
                      data-testid="finance-delivery-template-change-note"
                    />
                  </label>
                </div>
                {selectedDeliveryTemplateVersion ? (
                  <div className="receipt-meta-grid audit-meta-grid">
                    <div><span>ÙˆØ¶Ø¹ÛŒØª</span><strong>{DELIVERY_TEMPLATE_VERSION_STATUS_LABELS[selectedDeliveryTemplateVersion.status] || selectedDeliveryTemplateVersion.status || '-'}</strong></div>
                    <div><span>Ù†Ø³Ø®Ù‡</span><strong>{`v${fmt(selectedDeliveryTemplateVersion.versionNumber || 0)}`}</strong></div>
                    <div><span>مرحله تایید</span><strong>{DELIVERY_TEMPLATE_APPROVAL_STAGE_LABELS[selectedDeliveryTemplateApprovalStage] || selectedDeliveryTemplateApprovalStage || '-'}</strong></div>
                    <div><span>Ø³Ø§Ø²Ù†Ø¯Ù‡</span><strong>{selectedDeliveryTemplateVersion.createdBy?.name || '-'}</strong></div>
                    <div><span>ØªØ§Ø±ÛŒØ®</span><strong>{toFaDateTime(selectedDeliveryTemplateVersion.createdAt || selectedDeliveryTemplateVersion.publishedAt || selectedDeliveryTemplateVersion.archivedAt)}</strong></div>
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
                    Ø¨Ø§Ø±Ú¯Ø°Ø§Ø±ÛŒ Ù†Ø³Ø®Ù‡
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={saveDeliveryTemplateDraft}
                    disabled={busy || !deliveryCampaignForm.messageTemplateKey || !!deliveryTemplateUnknownVariables.length}
                    data-testid="finance-delivery-template-save-draft"
                  >
                    Ø°Ø®ÛŒØ±Ù‡ draft
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
                <span>subject template</span>
                <input
                  value={deliveryCampaignForm.messageTemplateSubject}
                  onChange={(e) => setDeliveryCampaignForm((prev) => ({ ...prev, messageTemplateSubject: e.target.value }))}
                  placeholder="مثلاً Finance statement {{documentNo}}"
                  data-testid="finance-delivery-campaign-template-subject"
                />
              </label>
              <label className="finance-inline-filter finance-inline-filter-wide">
                <span>body template</span>
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
                  <span>اطلاع به audience مرتبط</span>
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
                <span>retry موارد ناموفق</span>
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
              <p className="muted">هنوز کمپاین delivery ثبت نشده است.</p>
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
                  <span>next run</span>
                  <span>{toFaDateTime(selectedDeliveryCampaign.nextRunAt)}</span>
                </div>
                <div className="mini-row">
                  <span>کانال</span>
                  <span>{DELIVERY_CHANNEL_LABELS[selectedDeliveryCampaign.channel] || selectedDeliveryCampaign.channel || 'ایمیل'}</span>
                </div>
                <div className="mini-row">
                  <span>template</span>
                  <span>{deliveryTemplates.find((item) => item.key === selectedDeliveryCampaign.messageTemplateKey)?.label || selectedDeliveryCampaign.messageTemplateKey || 'عمومی'}</span>
                </div>
                <div className="mini-row">
                  <span>اتوماسیون</span>
                  <span>{selectedDeliveryCampaign.automationEnabled ? 'فعال' : 'دستی'}</span>
                </div>
                <div className="mini-row">
                  <span>summary</span>
                  <span>
                    {fmt(selectedDeliveryCampaign.targetSummary?.successful || 0)} موفق / {fmt(selectedDeliveryCampaign.targetSummary?.failed || 0)} ناموفق
                  </span>
                </div>
                <div className="mini-row">
                  <span>live status</span>
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
                    <span>subject</span>
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
                  <span>فیلتر channel</span>
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
                <p className="muted">در حال حاضر مورد ناموفق برای retry وجود ندارد.</p>
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
                  <span>recovery state</span>
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
                <p className="muted">در حال حاضر موردی برای replay و recovery وضعیت provider وجود ندارد.</p>
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
      </div>

      <div className="finance-card" data-finance-section="reports settings" data-testid="finance-document-archive-card">
        <div className="finance-card-head">
          <div>
            <h3>آرشیف و اعتبارسنجی اسناد مالی</h3>
            <p className="muted">شماره سند، کد verify، بسته گروهی استیتمنت و تاریخچه دانلود اسناد رسمی را از همین بخش مدیریت کنید.</p>
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
                  <span>آخرین verify</span>
                  <span>{toFaDateTime(verifiedDocument.lastVerifiedAt)}</span>
                </div>
              </div>
            ) : (
              <p className="muted">برای راستی‌آزمایی سند رسمی، کد verification را وارد کنید. نتیجه در همین بخش با شماره سند و هش نمایش داده می‌شود.</p>
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
                    <p className="muted">ارسال دستی به ایمیل، یا اطلاع‌رسانی به audience مرتبط با همین سند.</p>
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
                    <span>اعلان به audience مرتبط</span>
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
                  <p className="muted">سندهای batch فقط از کانال‌های دستی مثل email، SMS و WhatsApp پشتیبانی می‌کنند.</p>
                ) : null}

                <div className="document-delivery-history" data-testid="finance-document-delivery-history">
                  <div className="mini-row">
                    <span>وضعیت آخرین delivery</span>
                    <span>{selectedDocumentArchive.lastDeliveryStatus || 'ثبت نشده'}</span>
                  </div>
                  <div className="mini-row">
                    <span>provider live status</span>
                    <span className={DELIVERY_LIVE_STATUS_CHIP_CLASS[selectedDocumentArchiveLiveSummary?.latest?.stage] || DELIVERY_LIVE_STATUS_CHIP_CLASS.unknown}>
                      {DELIVERY_LIVE_STATUS_LABELS[selectedDocumentArchiveLiveSummary?.latest?.stage] || selectedDocumentArchiveLiveSummary?.latest?.stage || 'نامشخص'}
                    </span>
                  </div>
                  <div className="mini-row">
                    <span>آخرین ارسال</span>
                    <span>{toFaDateTime(selectedDocumentArchive.lastDeliveredAt)}</span>
                  </div>
                  <div className="mini-row">
                    <span>تعداد delivery</span>
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
            <h3>timeline حسابرسی مالی</h3>
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
            <span>جستجو در audit</span>
            <input
              value={auditTimelineSearch}
              onChange={(e) => setAuditTimelineSearch(e.target.value)}
              placeholder="شماره بل، پرداخت، متعلم، صنف، اقدام‌کننده یا توضیح"
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
        {!filteredAuditTimeline.length && <p className="muted">برای این فیلتر timeline حسابرسی پیدا نشد.</p>}
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
      {printMode === 'receipt' && selectedReceiptPrintModel && (
        <div className="finance-print-sheet" data-testid="printable-receipt-sheet">
          <h3>رسید رسمی پرداخت فیس</h3>
          <div className="receipt-meta-grid">
            <div><span>شماره پرداخت</span><strong>{selectedReceiptPrintModel.paymentNumber || '-'}</strong></div>
            <div><span>متعلم</span><strong>{selectedReceiptPrintModel.studentName}</strong></div>
            <div><span>صنف</span><strong>{selectedReceiptPrintModel.classTitle}</strong></div>
            <div><span>سال تعلیمی</span><strong>{selectedReceiptPrintModel.academicYearTitle}</strong></div>
            <div><span>مبلغ</span><strong>{fmt(selectedReceiptPrintModel.amount)} {selectedReceiptPrintModel.currency}</strong></div>
            <div><span>روش پرداخت</span><strong>{PAYMENT_METHOD_UI_LABELS[selectedReceiptPrintModel.paymentMethod] || selectedReceiptPrintModel.paymentMethod}</strong></div>
            <div><span>مرجع</span><strong>{selectedReceiptPrintModel.referenceNo}</strong></div>
            <div><span>تاریخ پرداخت</span><strong>{toFaDate(selectedReceiptPrintModel.paidAt)}</strong></div>
            <div><span>ثبت‌کننده</span><strong>{selectedReceiptPrintModel.receivedBy}</strong></div>
            <div><span>باقی‌مانده قبل</span><strong>{fmt(selectedReceiptPrintModel.remainingBeforePayment || 0)} AFN</strong></div>
            <div><span>باقی‌مانده بعد</span><strong>{fmt(selectedReceiptPrintModel.remainingAfterPayment || 0)} AFN</strong></div>
          </div>
          {!!selectedReceiptPrintModel.note && (
            <div className="receipt-note-box">
              <span>یادداشت</span>
              <p>{selectedReceiptPrintModel.note}</p>
            </div>
          )}
          {!!selectedReceiptPrintModel.allocations?.length && (
            <div className="receipt-trail">
              <h4>جزئیات تخصیص پرداخت</h4>
              <div className="trail-list">
                {selectedReceiptPrintModel.allocations.map((allocation, index) => (
                  <div key={`print-allocation-${index}`} className="trail-item">
                    <div className="trail-item-head">
                      <strong>{allocation.title || allocation.orderNumber || 'بدهی'}</strong>
                      <span>{fmt(allocation.amount)} AFN</span>
                    </div>
                    <div className="trail-item-meta">
                      <span>{allocation.orderNumber || '-'}</span>
                      <span>باقی‌مانده: {fmt(allocation.outstandingAmount || 0)} AFN</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {printMode === 'cashier' && cashierReportPrintModel && (
        <div className="finance-print-sheet" data-testid="printable-cashier-report-sheet">
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
                      <span>{item.paymentNumber || item.referenceNo || '-'}</span>
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
        </div>
      )}
    </section>
  );
}
