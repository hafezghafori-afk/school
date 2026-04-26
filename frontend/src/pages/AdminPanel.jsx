import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './AdminPanel.css';
import '../components/dashboard/dashboard.css';
import NotificationBell from '../components/NotificationBell';
import KpiRingCard from '../components/dashboard/KpiRingCard';
import QuickActionRail from '../components/dashboard/QuickActionRail';
import TaskAlertPanel from '../components/dashboard/TaskAlertPanel';
import TrendBars from '../components/dashboard/TrendBars';

import { API_BASE } from '../config/api';
import { formatAfghanDate, formatAfghanDateTime, formatAfghanTime } from '../utils/afghanDate';
import {
  buildAdminScheduleFromDraft,
  readDailyTimetableDraft,
  resolveTimetableSchoolId,
  writeDailyTimetableDraft
} from '../utils/dailyTimetableDraft';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getName = () => localStorage.getItem('userName') || 'مدیر';
const getLastLogin = () => localStorage.getItem('lastLoginAt') || '';

const toDate = (value) => {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const toDateTime = (value) => {
  return formatAfghanDateTime(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getScheduleClassLabel = (item) => item?.schoolClass?.title || item?.course?.title || 'Class';
const normalizeScheduleVisibility = (value = '') => (
  String(value || 'published').trim().toLowerCase() === 'draft' ? 'draft' : 'published'
);
const SCHEDULE_VISIBILITY_LABELS = {
  published: 'منتشرشده',
  draft: 'پیش‌نویس'
};
const SCHEDULE_WIDGET_FILTER_OPTIONS = [
  { value: 'all', label: 'همه' },
  { value: 'published', label: 'فقط منتشرشده' },
  { value: 'draft', label: 'فقط پیش‌نویس' }
];
const SCHEDULE_AUTO_REFRESH_MS = 60000;
const HERO_INLINE_ACTION_LIMIT = 4;
const ADMIN_SCHEDULE_ROUTE = '/timetable/editor';
const ADMIN_SCHEDULE_VIEW_ROUTE = '/timetable/viewer';

const DEFAULT_WIZARD_SHIFTS = [
  { name: 'صبح', code: 'morning', startTime: '07:30', endTime: '12:00', enabled: true },
  { name: 'بعد از ظهر', code: 'afternoon', startTime: '12:30', endTime: '17:00', enabled: true }
];

const parseClockToMinutes = (value = '') => {
  const text = String(value || '').trim();
  const [hourText, minuteText] = text.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return (hour * 60) + minute;
};

const doTimeRangesOverlap = (leftStart, leftEnd, rightStart, rightEnd) => {
  if (![leftStart, leftEnd, rightStart, rightEnd].every(Number.isFinite)) return false;
  return Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd);
};

const getScheduleRowId = (item = {}, fallback = '') => String(item?._id || item?.id || fallback);
const getCourseTargetId = (item = {}) => String(
  item?.classId
  || item?.schoolClass?.id
  || item?.schoolClass?._id
  || item?.schoolClassRef?._id
  || item?.schoolClassRef
  || item?.courseId
  || item?._id
  || ''
).trim();

const formatSlaMinutes = (value) => {
  const minutes = Number(value || 0);
  if (!minutes) return '-';
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  if (days > 0 && hours > 0) return `${days} روز و ${hours} ساعت`;
  if (days > 0) return `${days} روز`;
  if (hours > 0) return `${hours} ساعت`;
  return `${minutes} دقیقه`;
};

const normalizeSlaTimeouts = (payload = null) => {
  const source = payload?.timeouts || payload?.config?.timeouts || null;
  if (!source || typeof source !== 'object') return null;
  return {
    finance_manager: Number(source.finance_manager || 0),
    finance_lead: Number(source.finance_lead || 0),
    general_president: Number(source.general_president || 0)
  };
};

const formatAlertAge = (value) => {
  const minutes = Number(value || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return 'کمتر از یک دقیقه';
  if (minutes < 60) return `${minutes.toLocaleString('fa-AF-u-ca-persian')} دقیقه`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours.toLocaleString('fa-AF-u-ca-persian')} ساعت`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (!remainingHours) return `${days.toLocaleString('fa-AF-u-ca-persian')} روز`;
  return `${days.toLocaleString('fa-AF-u-ca-persian')} روز و ${remainingHours.toLocaleString('fa-AF-u-ca-persian')} ساعت`;
};

const getAlertTrendLabel = (alert = {}) => {
  const direction = String(alert?.trendDirection || 'steady').trim().toLowerCase();
  const percent = Number(alert?.trendPercent || 0);
  const absPercent = Math.abs(percent).toLocaleString('fa-AF-u-ca-persian');
  if (direction === 'up') return `افزایش ${absPercent}%`;
  if (direction === 'down') return `کاهش ${absPercent}%`;
  return 'بدون تغییر';
};

const normalizeSnoozeState = (raw = {}) => {
  const now = Date.now();
  return Object.entries(raw || {}).reduce((acc, [key, value]) => {
    const expiresAt = Number(value || 0);
    if (!key || !Number.isFinite(expiresAt) || expiresAt <= now) return acc;
    acc[key] = expiresAt;
    return acc;
  }, {});
};

const resolveAlertDomain = (alert = {}) => {
  const explicitDomain = String(alert?.domain || '').trim().toLowerCase();
  if (explicitDomain) return explicitDomain;
  return ALERT_KEY_DOMAIN_MAP[String(alert?.key || '').trim()] || 'general';
};

const resolveAlertSnoozeDuration = (alert = {}) => {
  const level = String(alert?.level || '').trim().toLowerCase();
  return Number(ALERT_SNOOZE_MINUTES_BY_LEVEL[level] || 0);
};

const normalizeAdminLevel = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'finance_manager'
    || normalized === 'finance_lead'
    || normalized === 'school_manager'
    || normalized === 'academic_manager'
    || normalized === 'head_teacher'
    || normalized === 'general_president'
  ) {
    return normalized;
  }
  return 'finance_manager';
};

const getFinanceStudentName = (student = {}) => (
  String(student?.fullName || student?.name || student?.email || '').trim() || '---'
);

const getStoredPermissions = () => {
  try {
    const raw = localStorage.getItem('effectivePermissions');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const PERMISSION_ORDER = [
  'manage_users',
  'manage_enrollments',
  'manage_memberships',
  'manage_finance',
  'manage_content',
  'view_reports',
  'view_schedule',
  'manage_schedule',
  'access_school_manager',
  'access_head_teacher'
];

const PERMISSION_LABELS = {
  manage_users: 'مدیریت کاربران',
  manage_enrollments: 'مدیریت ثبت‌نام‌ها',
  manage_memberships: 'مدیریت ممبرشیپ آموزشی',
  manage_finance: 'مدیریت مالی',
  manage_content: 'مدیریت محتوا',
  view_reports: 'مشاهده گزارشات',
  view_schedule: 'مشاهده تقسیم اوقات',
  manage_schedule: 'مدیریت تقسیم اوقات',
  access_school_manager: 'دسترسی پست مدیر مکتب',
  access_head_teacher: 'دسترسی پست سر معلم مکتب'
};

const ADMIN_LEVEL_LABELS = {
  finance_manager: 'مدیر مالی',
  finance_lead: 'آمریت مالی',
  school_manager: 'مدیر مکتب',
  academic_manager: 'مدیر تدریسی',
  head_teacher: 'سر معلم مکتب',
  general_president: 'ریاست عمومی'
};

const formatWorkflowNote = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^SLA auto escalation from ([a-z_]+) to ([a-z_]+) after (\d+) minutes$/i);
  if (!match) return text;
  const [, fromLevel, toLevel, minutes] = match;
  const fromLabel = ADMIN_LEVEL_LABELS[fromLevel] || fromLevel;
  const toLabel = ADMIN_LEVEL_LABELS[toLevel] || toLevel;
  const localizedMinutes = Number(minutes || 0).toLocaleString('fa-AF-u-ca-persian');
  return `\u0627\u0631\u062c\u0627\u0639 \u062e\u0648\u062f\u06a9\u0627\u0631 SLA \u0627\u0632 ${fromLabel} \u0628\u0647 ${toLabel} \u067e\u0633 \u0627\u0632 ${localizedMinutes} \u062f\u0642\u06cc\u0642\u0647`;
};

const ADMIN_LEVEL_PERMISSION_MATRIX = [
  { level: 'finance_manager', permissions: ['manage_finance'] },
  { level: 'finance_lead', permissions: ['manage_finance', 'view_reports'] },
  { level: 'school_manager', permissions: ['manage_users', 'manage_enrollments', 'manage_memberships', 'manage_content', 'view_reports', 'view_schedule', 'manage_schedule', 'access_school_manager'] },
  { level: 'academic_manager', permissions: ['manage_enrollments', 'manage_memberships', 'view_schedule'] },
  { level: 'head_teacher', permissions: ['manage_content', 'view_reports', 'view_schedule', 'manage_schedule', 'access_head_teacher'] },
  { level: 'general_president', permissions: PERMISSION_ORDER }
];

const emptySearchResults = {
  users: [],
  orders: [],
  financeBills: [],
  financeReceipts: [],
  courses: [],
  schedules: [],
  homework: [],
  grades: [],
  subjects: [],
  requests: [],
  accessRequests: [],
  contacts: [],
  news: [],
  logs: [],
  enrollments: [],
  settings: []
};

const SEARCH_SECTION_CONFIG = [
  {
    key: 'users',
    title: 'کاربران',
    to: () => '/admin-users',
    primary: (item) => item.name || 'کاربر',
    secondary: (item) => [item.email, item.orgRole || item.role].filter(Boolean).join(' | ')
  },
  {
    key: 'financeBills',
    title: 'بل‌های مالی',
    to: () => '/admin-finance',
    primary: (item) => item.billNumber || 'بل مالی',
    secondary: (item) => [item.student?.name, item.course?.title, item.status].filter(Boolean).join(' | ')
  },
  {
    key: 'financeReceipts',
    title: 'رسیدهای مالی',
    to: () => '/admin-finance#pending-receipts',
    primary: (item) => item.bill?.billNumber || item.referenceNo || 'رسید مالی',
    secondary: (item) => [item.student?.name, item.course?.title, item.approvalStage || item.status].filter(Boolean).join(' | ')
  },
  {
    key: 'courses',
    title: 'صنف‌ها',
    to: (item) => `/courses/${getCourseTargetId(item)}`,
    primary: (item) => item.title || 'صنف',
    secondary: (item) => [item.category, item.level].filter(Boolean).join(' | ')
  },
  {
    key: 'schedules',
    title: 'تقسیم اوقات',
    to: () => ADMIN_SCHEDULE_ROUTE,
    primary: (item) => `${getScheduleClassLabel(item)} | ${item.subject || 'Subject'}`,
    secondary: (item) => [item.date, `${item.startTime || '--'} - ${item.endTime || '--'}`, item.visibility].filter(Boolean).join(' | ')
  },
  {
    key: 'homework',
    title: 'کارخانگی',
    to: () => '/homework-manager',
    primary: (item) => item.title || 'کارخانگی',
    secondary: (item) => [item.course?.title, toDate(item.dueDate)].filter(Boolean).join(' | ')
  },
  {
    key: 'grades',
    title: 'نمرات',
    to: () => '/grade-manager',
    primary: (item) => `${item.student?.name || 'شاگرد'} | ${item.course?.title || 'صنف'}`,
    secondary: (item) => [`مجموع: ${Number(item.totalScore || 0).toLocaleString('fa-AF-u-ca-persian')}`]
  },
  {
    key: 'subjects',
    title: 'مضامین',
    to: () => '/admin-education',
    primary: (item) => item.name || 'مضمون',
    secondary: (item) => [item.code, item.grade].filter(Boolean).join(' | ')
  },
  {
    key: 'requests',
    title: 'درخواست‌های مشخصات',
    to: () => '/admin#profile-requests',
    primary: (item) => item.user?.name || 'درخواست تغییر مشخصات',
    secondary: (item) => [item.requestedData?.email, item.status].filter(Boolean).join(' | ')
  },
  {
    key: 'accessRequests',
    title: 'درخواست‌های دسترسی',
    to: () => '/admin-users#access-requests',
    primary: (item) => item.requester?.name || 'درخواست دسترسی',
    secondary: (item) => [item.permission, item.status].filter(Boolean).join(' | ')
  },
  {
    key: 'contacts',
    title: 'پیام‌ها',
    to: () => '/admin-contact',
    primary: (item) => item.name || item.email || 'پیام پشتیبانی',
    secondary: (item) => [item.status, toDate(item.createdAt)].filter(Boolean).join(' | ')
  },
  {
    key: 'news',
    title: 'اخبار',
    to: () => '/admin-news',
    primary: (item) => item.title || 'خبر',
    secondary: (item) => toDate(item.createdAt)
  },
  {
    key: 'logs',
    title: 'لاگ‌ها',
    to: () => '/admin-logs',
    primary: (item) => item.action || 'لاگ',
    secondary: (item) => [item.actorRole, item.route, toDateTime(item.createdAt)].filter(Boolean).join(' | ')
  },
  {
    key: 'enrollments',
    title: 'ثبت‌نام‌ها',
    to: () => '/admin-enrollments',
    primary: (item) => item.studentName || 'ثبت‌نام',
    secondary: (item) => [item.grade, item.status].filter(Boolean).join(' | ')
  },
  {
    key: 'settings',
    title: 'تنظیمات سایت',
    to: () => '/admin-settings',
    primary: (item) => item.brandName || 'تنظیمات سایت',
    secondary: (item) => [item.brandSubtitle, item.contactEmail || item.contactPhone].filter(Boolean).join(' | ')
  }
];

const ALERT_LINKS = {
  finance_receipts: '/admin-finance#pending-receipts',
  finance_overdue: '/admin-finance',
  orders: '/admin-finance#pending-receipts',
  schedule_drafts: ADMIN_SCHEDULE_ROUTE,
  schedule_conflicts: ADMIN_SCHEDULE_ROUTE,
  profile: '#profile-requests',
  access: '/admin-users#access-requests',
  contacts: '/admin-contact'
};

const ALERT_DOMAIN_OPTIONS = [
  { value: 'all', label: 'همه حوزه‌ها' },
  { value: 'finance', label: 'مالی' },
  { value: 'users', label: 'کاربران' },
  { value: 'education', label: 'آموزشی' },
  { value: 'support', label: 'پشتیبانی' }
];

const ALERT_KEY_DOMAIN_MAP = {
  finance_receipts: 'finance',
  finance_overdue: 'finance',
  orders: 'finance',
  schedule_drafts: 'education',
  schedule_conflicts: 'education',
  profile: 'users',
  access: 'users',
  contacts: 'support'
};

const ALERT_SNOOZE_MINUTES_BY_LEVEL = {
  medium: 240,
  low: 720
};

const ALERT_SNOOZE_STORAGE_KEY = 'admin_alert_snooze_map_v1';
const SCHEDULE_WIDGET_FILTER_STORAGE_KEY = 'admin_schedule_widget_filter_v1';
const SCHEDULE_WIDGET_ISSUE_FILTER_STORAGE_KEY = 'admin_schedule_widget_issue_filter_v1';
const SCHEDULE_WIDGET_HELP_OPEN_STORAGE_KEY = 'admin_schedule_widget_help_open_v1';

const QUICK_LINK_ITEMS = [
  { to: '/admin-government-finance', label: 'فرماندهی مالی دولت', permission: 'manage_finance' },
  { to: '/admin-education', label: 'مرکز مدیریت آموزش', permission: 'manage_content' },
  { to: '/admin-users', label: 'کاربران', permission: 'manage_users' },
  { to: '/admin-enrollments', label: 'ثبت‌نام‌ها', permission: 'manage_enrollments' },
  { to: '/admin-education?section=enrollments', label: 'ممبرشیپ آموزشی', permission: 'manage_memberships' },
  { to: '/admin-financial-memberships', label: 'عضویت‌ها', permission: 'manage_finance' },
  { to: '/admin-finance', label: 'مرکز مالی', permission: 'manage_finance' },
  { to: '/admin-reports', label: 'گزارش‌ساز', permission: 'view_reports' },
  { to: '/admin-promotions', label: 'ارتقا صنف', permission: 'manage_users' },
  { to: '/admin-result-tables', label: 'جدول نتایج', permission: 'manage_content' },
  { to: '/admin-logs', label: 'لاگ‌ها', permission: 'view_reports' },
  { to: '/admin-news', label: 'اخبار', permission: 'manage_content' },
  { to: '/admin-gallery', label: 'گالری', permission: 'manage_content' },
  { to: '/admin-contact', label: 'پیام‌ها', permission: 'manage_content' },
  { to: ADMIN_SCHEDULE_VIEW_ROUTE, label: 'تقسیم اوقات', permission: 'view_schedule' }
];
const ALLOWED_QUICK_LINK_PERMISSIONS = new Set([
  'manage_users',
  'manage_enrollments',
  'manage_memberships',
  'manage_finance',
  'manage_content',
  'view_reports',
  'view_schedule',
  'manage_schedule'
]);

const normalizeQuickLinkItems = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const to = String(item?.to || item?.href || '').trim();
      const label = String(item?.label || item?.title || '').trim();
      const permission = String(item?.permission || '').trim();
      const enabled = item?.enabled !== false;
      if (!to || !label) return null;
      return {
        to,
        label,
        permission: ALLOWED_QUICK_LINK_PERMISSIONS.has(permission) ? permission : '',
        enabled
      };
    })
    .filter(Boolean);
};

const getQuickLinkPermissionLabel = (permission = '') => (
  permission ? (PERMISSION_LABELS[permission] || permission) : 'عمومی'
);

const permissionAllows = (permission = '', permissions = []) => {
  if (!permission) return true;
  if (permissions.includes(permission)) return true;
  if (permission === 'manage_enrollments' && permissions.includes('manage_users')) return true;
  if (permission === 'manage_memberships' && permissions.includes('manage_users')) return true;
  if (permission === 'view_schedule' && permissions.includes('manage_schedule')) return true;
  return false;
};

const isQuickLinkActiveForUser = (item, permissions = []) => (
  item?.enabled !== false && permissionAllows(item?.permission || '', permissions)
);

const getQuickLinkStatusLabel = (item, permissions = []) => {
  if (item?.enabled === false) return 'غیرفعال (تنظیمات)';
  return isQuickLinkActiveForUser(item, permissions) ? 'فعال' : 'غیرفعال';
};

const normalizeScheduleWidgetFilter = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return SCHEDULE_WIDGET_FILTER_OPTIONS.some((item) => item.value === normalized) ? normalized : 'all';
};

const normalizeScheduleIssueFilter = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'draft' || normalized === 'conflict' || normalized === 'room') return normalized;
  return 'all';
};

const ACTION_STRIP_ITEMS = [
  { href: '/admin-enrollments', label: 'تایید ثبت‌نام‌های آنلاین و صدور شماره اساس', tone: 'primary', permission: 'manage_enrollments' },
  { href: '/admin-settings?menu=auth', label: 'تنظیمات شماره شناسایی', tone: 'info', permission: 'manage_users' },
  { href: '/admin-finance#pending-receipts', label: 'تایید رسیدهای مالی', tone: 'teal', permission: 'manage_finance' },
  { href: '/admin-education?section=enrollments', label: 'مدیریت ممبرشیپ آموزشی', tone: 'success', permission: 'manage_memberships' },
  { href: '/admin-education', label: 'مدیریت سال تعلیمی و صنف', tone: 'success', permission: 'manage_content' },
  { href: '#profile-requests', label: 'تایید تغییر مشخصات', tone: 'warning', permission: 'manage_users' },
  { href: '/admin-users#access-requests', label: 'درخواست‌های دسترسی', tone: 'warning', permission: 'manage_users' },
  { href: '/admin-notifications', label: 'مرکز اعلان‌های مالی', tone: 'info', permission: 'manage_finance' },
  { href: '/admin-education', label: 'مدیریت صنوف', tone: 'success', permission: 'manage_content' }
];

const VIRTUAL_ITEMS = [
  { key: 'chat', to: '/chat?tab=live', title: 'چت و صنف‌های آنلاین', subtitle: 'ورود مستقیم' },
  { key: 'recordings', to: '/recordings', title: 'آرشیف ضبط جلسات', subtitle: 'مشاهده/مدیریت' },
  { key: 'schedule', to: ADMIN_SCHEDULE_VIEW_ROUTE, title: 'زمان‌بندی کلاس‌ها', subtitle: 'تقسیم اوقات', permission: 'view_schedule' }
];

const REPORT_ACTIVITY_ACTIONS = [
  'admin_access_matrix_export_csv',
  'admin_access_matrix_print',
  'admin_users_access_matrix_export_csv',
  'admin_users_access_matrix_print',
  'admin_users_org_role_matrix_export_csv',
  'admin_users_org_role_matrix_print'
];

const REPORT_ACTIVITY_LABELS = {
  admin_access_matrix_export_csv: 'خروجی CSV ماتریس دسترسی (داشبورد)',
  admin_access_matrix_print: 'چاپ ماتریس دسترسی (داشبورد)',
  admin_users_access_matrix_export_csv: 'خروجی CSV ماتریس نقش سازمانی (کاربران)',
  admin_users_access_matrix_print: 'چاپ ماتریس نقش سازمانی (کاربران)',
  admin_users_org_role_matrix_export_csv: 'خروجی CSV ماتریس نقش سازمانی (کاربران)',
  admin_users_org_role_matrix_print: 'چاپ ماتریس نقش سازمانی (کاربران)'
};

const reportActionLabel = (action = '') => REPORT_ACTIVITY_LABELS[action] || action;

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
  { value: 'resolved', label: 'تکمیل شد' }
];

const TIMELINE_STATUS_OPTIONS = [{ value: 'all', label: '\u0647\u0645\u0647 \u0648\u0636\u0639\u06cc\u062a\u200c\u0647\u0627' }, ...FOLLOW_UP_STATUS_OPTIONS];
const WORKFLOW_TYPE_OPTIONS = [
  { value: 'all', label: '\u0647\u0645\u0647 \u0645\u0648\u0627\u0631\u062f' },
  { value: 'receipt', label: '\u0631\u0633\u06cc\u062f\u0647\u0627\u06cc \u0645\u0627\u0644\u06cc' },
  { value: 'profile', label: '\u062f\u0631\u062e\u0648\u0627\u0633\u062a\u200c\u0647\u0627\u06cc \u0645\u0634\u062e\u0635\u0627\u062a' },
  { value: 'support', label: '\u067e\u06cc\u0627\u0645\u200c\u0647\u0627\u06cc \u067e\u0634\u062a\u06cc\u0628\u0627\u0646\u06cc' }
];
const WORKFLOW_TYPE_LABELS = Object.fromEntries(WORKFLOW_TYPE_OPTIONS.map((item) => [item.value, item.label]));
const FOLLOW_UP_LEVEL_LABELS = Object.fromEntries(FOLLOW_UP_LEVEL_OPTIONS.map((item) => [item.value, item.label]));
const FOLLOW_UP_STATUS_LABELS = Object.fromEntries(FOLLOW_UP_STATUS_OPTIONS.map((item) => [item.value, item.label]));

const sanitizeCsvCell = (value) => {
  const text = String(value ?? '');
  const escaped = text.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const shortText = (value, max = 90) => {
  const text = String(value || '').trim();
  if (!text) return '---';
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toDayStartTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const toDayEndTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const defaultHealthState = {
  status: 'checking',
  latencyMs: null,
  checkedAt: ''
};

export default function AdminPanel() {
  const [orders, setOrders] = useState([]);
  const [profileRequests, setProfileRequests] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [alertDomainFilter, setAlertDomainFilter] = useState('all');
  const [snoozedAlerts, setSnoozedAlerts] = useState(() => {
    try {
      const raw = localStorage.getItem(ALERT_SNOOZE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return normalizeSnoozeState(parsed);
    } catch {
      return {};
    }
  });
  const [adminDashboard, setAdminDashboard] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchToolOpen, setSearchToolOpen] = useState(false);
  const [searchToolMenuStyle, setSearchToolMenuStyle] = useState({});
  const [inboxFilter, setInboxFilter] = useState('all');
  const [searchResults, setSearchResults] = useState(emptySearchResults);
  const [orderMessage, setOrderMessage] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [searchMessage, setSearchMessage] = useState('');
  const [supportMessages, setSupportMessages] = useState([]);
  const [followUpDrafts, setFollowUpDrafts] = useState({});
  const [followUpBusy, setFollowUpBusy] = useState({});
  const [expandedHistory, setExpandedHistory] = useState({});
  const [timelineStatusFilter, setTimelineStatusFilter] = useState('all');
  const [timelineFromDate, setTimelineFromDate] = useState('');
  const [timelineToDate, setTimelineToDate] = useState('');
  const [workflowReport, setWorkflowReport] = useState(null);
  const [workflowTypeFilter, setWorkflowTypeFilter] = useState('all');
  const [workflowMessage, setWorkflowMessage] = useState('');
  const [slaConfig, setSlaConfig] = useState(null);
  const [slaMessage, setSlaMessage] = useState('');
  const [slaResult, setSlaResult] = useState(null);
  const [slaBusy, setSlaBusy] = useState(false);
  const [apiHealth, setApiHealth] = useState(defaultHealthState);
  const [apiHealthLoading, setApiHealthLoading] = useState(false);
  const [busy, setBusy] = useState({});
  const [selectedProfileIds, setSelectedProfileIds] = useState([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState({
    profileApprove: false,
    profileReject: false,
    orderApprove: false,
    orderReject: false
  });
  const [user, setUser] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [todayScheduleBusy, setTodayScheduleBusy] = useState(false);
  const [todayScheduleCheckedAt, setTodayScheduleCheckedAt] = useState('');
  const [todayScheduleScopeLabel, setTodayScheduleScopeLabel] = useState('امروز');
  const [todayScheduleSource, setTodayScheduleSource] = useState('api');
  const [todayScheduleFilter, setTodayScheduleFilter] = useState(() => {
    try {
      return normalizeScheduleWidgetFilter(localStorage.getItem(SCHEDULE_WIDGET_FILTER_STORAGE_KEY) || 'all');
    } catch {
      return 'all';
    }
  });
  const [todayScheduleIssueFilter, setTodayScheduleIssueFilter] = useState(() => {
    try {
      return normalizeScheduleIssueFilter(localStorage.getItem(SCHEDULE_WIDGET_ISSUE_FILTER_STORAGE_KEY) || 'all');
    } catch {
      return 'all';
    }
  });
  const [todayScheduleHelpOpen, setTodayScheduleHelpOpen] = useState(() => {
    try {
      return localStorage.getItem(SCHEDULE_WIDGET_HELP_OPEN_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [reportActivityItems, setReportActivityItems] = useState([]);
  const [settingsQuickLinks, setSettingsQuickLinks] = useState([]);
  const [stats, setStats] = useState({
    users: 0,
    courses: 0,
    todayPayments: 0,
    pendingOrders: 0
  });
  // ===== Wizard: ایجاد مکتب (4 مرحله) =====
  const [createSchoolOpen, setCreateSchoolOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1-4 + 5=done
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardMsg, setWizardMsg] = useState({ text: '', error: false });
  const [wizardSchoolId, setWizardSchoolId] = useState('');
  const [wizardAcademicYearId, setWizardAcademicYearId] = useState('');
  const [wizardCreatedShifts, setWizardCreatedShifts] = useState([]);
  // Step 1: فرم مکتب
  const [createSchoolForm, setCreateSchoolForm] = useState({
    name: '',
    nameDari: '',
    schoolCode: '',
    province: 'kabul',
    district: '',
    schoolType: 'primary',
    schoolLevel: 'grade1_6',
    ownership: 'government',
    establishmentDate: new Date().toISOString().split('T')[0]
  });
  // Step 2: سال تعلیمی
  const [wizardYearForm, setWizardYearForm] = useState({
    title: '1404-1405',
    code: '',
    startDate: '',
    endDate: '',
    isCurrent: true
  });
  // Step 3: نوبت‌ها
  const [wizardShiftRows, setWizardShiftRows] = useState(() => DEFAULT_WIZARD_SHIFTS.map((item) => ({ ...item })));
  // Step 4: صنف‌ها
  const [wizardClassRows, setWizardClassRows] = useState([]);
  const [wizardClassDraft, setWizardClassDraft] = useState({
    gradeLevel: 10,
    section: 'الف',
    genderType: 'mixed',
    shiftId: '',
    capacity: 40
  });
  // alias برای سازگاری با کد قبلی
  const createSchoolBusy = wizardBusy;
  const setCreateSchoolBusy = setWizardBusy;
  const createSchoolMessage = wizardMsg.text;
  const setCreateSchoolMessage = (t) => setWizardMsg({ text: t, error: t.includes('خطا') || t.includes('ناموفق') });
  const generateSchoolCodeSuggestion = (currentCode = '') => {
    const base = String(currentCode || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12) || 'SCH';
    const suffix = String(Date.now()).slice(-4);
    return `${base}-${suffix}`;
  };
  const lastLogin = getLastLogin();
  const searchToolRef = useRef(null);
  const searchToolButtonRef = useRef(null);
  const searchToolInputRef = useRef(null);

  const effectivePermissions = useMemo(() => {
    const fromUser = Array.isArray(user?.effectivePermissions) ? user.effectivePermissions : [];
    if (fromUser.length) return Array.from(new Set(fromUser));
    return getStoredPermissions();
  }, [user?.effectivePermissions]);

  const adminLevel = useMemo(
    () => normalizeAdminLevel(
      user?.adminLevel
        || user?.orgRole
        || localStorage.getItem('adminLevel')
        || localStorage.getItem('orgRole')
        || ''
    ),
    [user?.orgRole, user?.adminLevel]
  );

  const canManageUsers = effectivePermissions.includes('manage_users');
  const canManageFinance = effectivePermissions.includes('manage_finance');
  const canManageContent = effectivePermissions.includes('manage_content');
  const canViewReports = effectivePermissions.includes('view_reports');
  const canManageSchedule = effectivePermissions.includes('manage_schedule');
  const canManageEnrollments = permissionAllows('manage_enrollments', effectivePermissions);
  const canManageMemberships = permissionAllows('manage_memberships', effectivePermissions);
  const canViewSchedule = permissionAllows('view_schedule', effectivePermissions);
  const apiHealthCheckedLabel = useMemo(() => {
    return formatAfghanTime(apiHealth.checkedAt, { hour: '2-digit', minute: '2-digit' });
  }, [apiHealth.checkedAt]);
  const apiHealthStatusLabel = useMemo(() => {
    if (apiHealth.status === 'online') return 'سالم';
    if (apiHealth.status === 'offline') return 'قطع ارتباط';
    return 'در حال بررسی';
  }, [apiHealth.status]);
  const localizedLastLogin = useMemo(() => {
    if (!lastLogin) return '';
    return formatAfghanDateTime(lastLogin, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) || lastLogin;
  }, [lastLogin]);
  const heroResponsibilitySummary = useMemo(() => {
    const permissionLabels = PERMISSION_ORDER
      .filter((key) => effectivePermissions.includes(key))
      .map((key) => PERMISSION_LABELS[key])
      .filter(Boolean);
    const contextualLabels = [user?.subject, user?.grade]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const values = Array.from(new Set([...permissionLabels, ...contextualLabels]));
    return values.length
      ? values.join('ØŒ ')
      : '\u0645\u0631\u06a9\u0632 \u0641\u0631\u0645\u0627\u0646\u062f\u0647\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a';
  }, [effectivePermissions, user?.subject, user?.grade]);
  const currentLevelLabel = ADMIN_LEVEL_LABELS[adminLevel] || adminLevel;
  const normalizedHeroResponsibilitySummary = useMemo(() => (
    String(heroResponsibilitySummary || '')
      .replace(/[^\u0600-\u06FF0-9A-Za-z\s]+/g, '\u060c ')
      .replace(/\s+\u060c\s+/g, '\u060c ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  ), [heroResponsibilitySummary]);
  const heroMetaItems = useMemo(() => {
    const items = [];

    if (adminLevel !== 'general_president') {
      items.push({
        key: 'responsibilities',
        label: '\u062d\u0648\u0632\u0647\u200c\u0647\u0627\u06cc \u0645\u0633\u0626\u0648\u0644\u06cc\u062a',
        value: normalizedHeroResponsibilitySummary
      });
    }

    items.push(
      {
        key: 'role',
        label: '\u0646\u0642\u0634 \u0633\u0627\u0632\u0645\u0627\u0646\u06cc \u0641\u0639\u0627\u0644',
        value: currentLevelLabel
      },
      {
        key: 'last-login',
        label: '\u0622\u062e\u0631\u06cc\u0646 \u0648\u0631\u0648\u062f',
        value: localizedLastLogin || '\u062b\u0628\u062a \u0646\u0634\u062f\u0647'
      }
    );

    return items;
  }, [adminLevel, currentLevelLabel, localizedLastLogin, normalizedHeroResponsibilitySummary]);
  const accountName = user?.name || getName();
  const accountInitial = useMemo(() => {
    const normalized = String(accountName || '').trim();
    return normalized.charAt(0) || 'A';
  }, [accountName]);
  const accountAvatarSrc = useMemo(() => {
    const value = String(user?.avatarUrl || '').trim();
    if (!value) return '';
    return value.startsWith('http') ? value : `${API_BASE}/${value.replace(/^\/+/, '')}`;
  }, [user?.avatarUrl]);
  const heroActions = useMemo(() => ([
    canManageUsers ? { key: 'users', to: '/admin-users', label: 'مدیریت کاربران' } : null,
    canManageEnrollments ? { key: 'enrollments', to: '/admin-enrollments', label: 'ثبت‌نام‌ها' } : null,
    canManageMemberships ? { key: 'academic-memberships', to: '/admin-education?section=enrollments', label: 'ممبرشیپ آموزشی' } : null,
    canViewSchedule ? { key: 'schedule', to: canManageSchedule ? ADMIN_SCHEDULE_ROUTE : ADMIN_SCHEDULE_VIEW_ROUTE, label: canManageSchedule ? 'مدیریت تقسیم اوقات' : 'مشاهده تقسیم اوقات' } : null,
    canManageFinance ? { key: 'membership', to: '/admin-financial-memberships', label: 'عضویت‌ها' } : null,
    canManageContent ? {
      key: 'create-school',
      label: 'ایجاد مکتب جدید',
      onClick: () => setCreateSchoolOpen(true),
      title: 'ایجاد یک مکتب جدید و دریافت شناسه برای شروع'
    } : null,
    canManageFinance ? { key: 'finance', to: '/admin-finance', label: 'مرکز مالی' } : null,
    canManageContent ? { key: 'education', to: '/admin-education', label: 'مرکز مدیریت آموزش' } : null,
    canManageFinance ? { key: 'gov-finance', to: '/admin-government-finance', label: 'فرماندهی مالی دولت' } : null,
    canManageContent ? { key: 'settings', to: '/admin-settings', label: 'تنظیمات سایت' } : null,
    canManageContent ? { key: 'exams', to: '/admin-exams-dashboard', label: 'داشبورد امتحانات' } : null,
    canViewReports ? { key: 'reports', to: '/admin-reports', label: 'گزارش‌ها' } : null
  ].filter(Boolean)), [canManageUsers, canManageEnrollments, canManageMemberships, canViewSchedule, canManageSchedule, canManageFinance, canManageContent, canViewReports]);
  const heroPrimaryActions = useMemo(
    () => heroActions.slice(0, HERO_INLINE_ACTION_LIMIT),
    [heroActions]
  );
  const heroSecondaryActions = useMemo(
    () => heroActions.slice(HERO_INLINE_ACTION_LIMIT),
    [heroActions]
  );

  const quickLinkItems = useMemo(() => {
    const fromSettings = normalizeQuickLinkItems(settingsQuickLinks);
    return fromSettings.length ? fromSettings : QUICK_LINK_ITEMS;
  }, [settingsQuickLinks]);

  const visibleQuickLinks = useMemo(
    () => quickLinkItems.filter((item) => isQuickLinkActiveForUser(item, effectivePermissions)),
    [quickLinkItems, effectivePermissions]
  );
  const hasSheetTemplatesQuickLink = useMemo(
    () => visibleQuickLinks.some((item) => String(item?.to || '').trim() === '/admin-sheet-templates'),
    [visibleQuickLinks]
  );

  const visibleActionItems = useMemo(
    () => ACTION_STRIP_ITEMS.filter((item) => permissionAllows(item.permission, effectivePermissions)),
    [effectivePermissions]
  );

  const searchSections = useMemo(() => (
    SEARCH_SECTION_CONFIG.map((section) => {
      const items = Array.isArray(searchResults[section.key]) ? searchResults[section.key] : [];
      return {
        ...section,
        items,
        count: items.length
      };
    }).filter((section) => section.count > 0)
  ), [searchResults]);

  const totalSearchHits = useMemo(
    () => searchSections.reduce((sum, section) => sum + section.count, 0),
    [searchSections]
  );

  // ===== Wizard helpers =====
  const wizardReset = () => {
    setWizardStep(1);
    setWizardBusy(false);
    setWizardMsg({ text: '', error: false });
    setWizardSchoolId('');
    setWizardAcademicYearId('');
    setWizardCreatedShifts([]);
    setCreateSchoolForm({ name: '', nameDari: '', schoolCode: '', province: 'kabul', district: '', schoolType: 'primary', schoolLevel: 'grade1_6', ownership: 'government', establishmentDate: new Date().toISOString().split('T')[0] });
    setWizardYearForm({ title: '1404-1405', code: '', startDate: '', endDate: '', isCurrent: true });
    setWizardShiftRows(DEFAULT_WIZARD_SHIFTS.map((item) => ({ ...item })));
    setWizardClassRows([]);
    setWizardClassDraft({ gradeLevel: 10, section: 'الف', genderType: 'mixed', shiftId: '', capacity: 40 });
  };
  const wizardClose = () => {
    if (wizardBusy) return;
    setCreateSchoolOpen(false);
    wizardReset();
  };

  // مرحله ۱: ایجاد مکتب
  const wizardStep1Submit = async () => {
    if (wizardBusy) return;
    if (!createSchoolForm.name?.trim() || !createSchoolForm.nameDari?.trim() || !createSchoolForm.schoolCode?.trim() || !createSchoolForm.district?.trim()) {
      setWizardMsg({ text: 'لطفاً تمام فیلدهای الزامی (*) را پر کنید', error: true });
      return;
    }
    setWizardBusy(true);
    setWizardMsg({ text: '', error: false });
    try {
      const timestamp = Date.now();
      const provinceCode = `${createSchoolForm.province.substring(0, 3).toUpperCase()}-${timestamp}`;
      const ministryCode = `MS-${createSchoolForm.province.substring(0, 2).toUpperCase()}-${timestamp}`;
      const res = await fetch(`${API_BASE}/api/afghan-schools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ ...createSchoolForm, namePashto: createSchoolForm.name, provinceCode, ministryCode })
      });
      const data = await res.json();
      if (!data?.success) {
        const rawMessage = String(data?.message || '').trim();
        const normalized = rawMessage.toLowerCase();
        let friendlyMessage = rawMessage || 'ایجاد مکتب ناموفق بود';

        if (normalized.includes('school code already exists') || normalized.includes('duplicate') || rawMessage.includes('کد مکتب')) {
          const suggestedCode = generateSchoolCodeSuggestion(createSchoolForm.schoolCode);
          setCreateSchoolForm((prev) => ({ ...prev, schoolCode: suggestedCode }));
          friendlyMessage = `کد مکتب تکراری بود. کد پیشنهادی خودکار: ${suggestedCode} — دوباره روی «ایجاد مکتب» بزنید.`;
        }

        setWizardMsg({ text: friendlyMessage, error: true });
        return;
      }
      const newSchoolId = data?._id || data?.id || data?.data?._id || data?.data?.id || data?.school?._id || data?.data?.school?._id;
      if (!newSchoolId) {
        setWizardMsg({ text: 'شناسه مکتب از سرور دریافت نشد', error: true });
        return;
      }
      localStorage.setItem('schoolId', newSchoolId);
      localStorage.setItem('school_id', newSchoolId);
      localStorage.setItem('selectedSchoolId', newSchoolId);
      setWizardSchoolId(newSchoolId);
      setWizardStep(2);
    } catch (err) {
      setWizardMsg({ text: `خطا: ${err?.message || 'ناشناخته'}`, error: true });
    } finally {
      setWizardBusy(false);
    }
  };

  // مرحله ۲: سال تعلیمی
  const wizardStep2Submit = async () => {
    if (wizardBusy) return;
    if (!wizardYearForm.title?.trim()) {
      setWizardMsg({ text: 'عنوان سال تعلیمی الزامی است', error: true });
      return;
    }
    setWizardBusy(true);
    setWizardMsg({ text: '', error: false });
    try {
      const body = {
        schoolId: wizardSchoolId,
        title: wizardYearForm.title.trim(),
        calendarType: 'solar_hijri',
        isCurrent: wizardYearForm.isCurrent,
        isActive: wizardYearForm.isCurrent,
        status: wizardYearForm.isCurrent ? 'active' : 'planning'
      };
      if (wizardYearForm.code.trim()) body.code = wizardYearForm.code.trim();
      if (wizardYearForm.startDate) body.startDate = wizardYearForm.startDate;
      if (wizardYearForm.endDate) body.endDate = wizardYearForm.endDate;
      const res = await fetch(`${API_BASE}/api/academic-years`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data?.success) {
        setWizardMsg({ text: data?.message || 'ایجاد سال تعلیمی ناموفق بود', error: true });
        return;
      }
      setWizardAcademicYearId(data?.data?._id || data?._id || '');
      setWizardStep(3);
    } catch (err) {
      setWizardMsg({ text: `خطا: ${err?.message || 'ناشناخته'}`, error: true });
    } finally {
      setWizardBusy(false);
    }
  };

  // مرحله ۳: نوبت‌ها
  const wizardStep3Submit = async () => {
    if (wizardBusy) return;
    const selectedShiftRows = wizardShiftRows.filter((item) => item.enabled);
    if (!selectedShiftRows.length) {
      setWizardMsg({ text: 'حداقل یک نوبت را انتخاب کنید', error: true });
      return;
    }
    for (const row of selectedShiftRows) {
      if (!row.name.trim() || !row.startTime || !row.endTime) {
        setWizardMsg({ text: 'نام، ساعت شروع و پایان برای همه نوبت‌ها الزامی است', error: true });
        return;
      }
    }
    setWizardBusy(true);
    setWizardMsg({ text: '', error: false });
    const created = [];
    try {
      for (let i = 0; i < selectedShiftRows.length; i++) {
        const row = selectedShiftRows[i];
        const res = await fetch(`${API_BASE}/api/school-shifts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            schoolId: wizardSchoolId,
            name: row.name.trim(),
            code: row.code.trim() || row.name.toLowerCase().replace(/\s+/g, '_'),
            startTime: row.startTime,
            endTime: row.endTime,
            sortOrder: i,
            isActive: true
          })
        });
        const data = await res.json();
        if (!data?.success) {
          setWizardMsg({ text: `نوبت "${row.name}": ${data?.message || 'ناموفق'}`, error: true });
          return;
        }
        created.push(data.data);
      }
      const validCreated = created.filter(s => s?._id);
      setWizardCreatedShifts(validCreated);
      if (validCreated.length > 0) {
        setWizardClassDraft(d => ({ ...d, shiftId: validCreated[0]._id }));
      } else {
        // Fallback: اگر پاسخ سرور ساختار غیرمنتظره داشت، مستقیم از API فچ کن
        try {
          const fallbackRes = await fetch(`${API_BASE}/api/school-shifts/school/${wizardSchoolId}`, { headers: getAuthHeaders() });
          const fallbackData = await fallbackRes.json();
          const fallbackShifts = (fallbackData?.data || []).filter(s => s?._id);
          setWizardCreatedShifts(fallbackShifts);
          if (fallbackShifts.length > 0) setWizardClassDraft(d => ({ ...d, shiftId: fallbackShifts[0]._id }));
        } catch (_) {}
      }
      setWizardStep(4);
    } catch (err) {
      setWizardMsg({ text: `خطا: ${err?.message || 'ناشناخته'}`, error: true });
    } finally {
      setWizardBusy(false);
    }
  };

  // مرحله ۴: اضافه کردن صنف به لیست (محلی، هنوز ذخیره نشده)
  const wizardAddClassDraft = () => {
    if (!wizardClassDraft.shiftId) {
      setWizardMsg({ text: 'نوبت صنف را انتخاب کنید', error: true });
      return;
    }
    const duplicateDraft = wizardClassRows.some((item) => (
      Number(item.gradeLevel) === Number(wizardClassDraft.gradeLevel)
      && String(item.section) === String(wizardClassDraft.section)
      && String(item.genderType) === String(wizardClassDraft.genderType)
      && String(item.shiftId || '') === String(wizardClassDraft.shiftId || '')
      && String(item.academicYearId || '') === String(wizardAcademicYearId || '')
    ));
    if (duplicateDraft) {
      setWizardMsg({ text: 'این صنف با همین پایه/بخش/جنسیت/شیفت قبلاً در لیست اضافه شده است.', error: true });
      return;
    }

    const shift = wizardCreatedShifts.find(s => s._id === wizardClassDraft.shiftId);
    const genderText = { male: 'ذکور', female: 'اناث', mixed: 'مختلط' }[wizardClassDraft.genderType] || 'مختلط';
    setWizardClassRows(r => [...r, {
      ...wizardClassDraft,
      academicYearId: wizardAcademicYearId,
      title: `Grade ${wizardClassDraft.gradeLevel} ${wizardClassDraft.section}`,
      titleDari: `صنف ${wizardClassDraft.gradeLevel} ${wizardClassDraft.section} - ${genderText}`,
      titlePashto: `ټولګی ${wizardClassDraft.gradeLevel} ${wizardClassDraft.section} - ${genderText}`,
      _shiftName: shift?.name || ''
    }]);
    if (wizardCreatedShifts.length > 1) {
      const currentIndex = wizardCreatedShifts.findIndex((item) => String(item?._id) === String(wizardClassDraft.shiftId));
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextShift = wizardCreatedShifts[(safeIndex + 1) % wizardCreatedShifts.length];
      if (nextShift?._id) {
        setWizardClassDraft((prev) => ({ ...prev, shiftId: String(nextShift._id) }));
      }
    }
    setWizardMsg({ text: '', error: false });
  };
  const wizardRemoveClassDraft = (idx) => setWizardClassRows(r => r.filter((_, i) => i !== idx));

  // مرحله ۴: ارسال صنف‌ها به سرور
  const wizardStep4Submit = async () => {
    if (wizardBusy) return;
    if (!wizardClassRows.length) {
      // اجازه رد شدن
      setWizardStep(5);
      if (canViewReports) { loadAdminDashboard(); loadAlerts(); loadReportActivities(); }
      return;
    }
    setWizardBusy(true);
    setWizardMsg({ text: '', error: false });
    try {
      const existingRes = await fetch(`${API_BASE}/api/school-classes/school/${wizardSchoolId}`, {
        headers: { ...getAuthHeaders() }
      });
      const existingData = await existingRes.json();
      const existingRows = Array.isArray(existingData?.data) ? existingData.data : [];
      const existingKeys = new Set(
        existingRows
          .filter((item) => String(item?.academicYearId?._id || item?.academicYearId || '') === String(wizardAcademicYearId || ''))
          .map((item) => `${Number(item.gradeLevel)}|${String(item.section || '')}|${String(item.genderType || '')}|${String(item?.shiftId?._id || item?.shiftId || '')}`)
      );

      for (const cls of wizardClassRows) {
        const key = `${Number(cls.gradeLevel)}|${String(cls.section || '')}|${String(cls.genderType || '')}|${String(cls.shiftId || '')}`;
        const shiftLabel = cls._shiftName || wizardCreatedShifts.find((item) => String(item?._id) === String(cls.shiftId || ''))?.name || 'نامشخص';
        if (existingKeys.has(key)) {
          setWizardMsg({ text: `صنف "${cls.titleDari}" در شیفت "${shiftLabel}" قبلاً در همین سال تعلیمی ثبت شده است.`, error: true });
          return;
        }

        const { _shiftName, ...classData } = cls;
        const res = await fetch(`${API_BASE}/api/school-classes/school/${wizardSchoolId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(classData)
        });
        const data = await res.json();
        if (!data?.success) {
          const normalized = String(data?.message || '').toLowerCase();
          const duplicateMessage = normalized.includes('قبلاً') || normalized.includes('duplicate')
            ? `این صنف در شیفت "${shiftLabel}" قبلاً ثبت شده است. لطفاً شیفت یا بخش متفاوت انتخاب کنید.`
            : (data?.message || 'ناموفق');
          setWizardMsg({ text: `صنف "${cls.titleDari}": ${duplicateMessage}`, error: true });
          return;
        }
        existingKeys.add(key);
      }
      setWizardStep(5);
      if (canViewReports) { loadAdminDashboard(); loadAlerts(); loadReportActivities(); }
    } catch (err) {
      setWizardMsg({ text: `خطا: ${err?.message || 'ناشناخته'}`, error: true });
    } finally {
      setWizardBusy(false);
    }
  };

  // alias برای سازگاری (createSchool قدیمی)
  const createSchool = wizardStep1Submit;

  const virtualItems = useMemo(() => (
    VIRTUAL_ITEMS.map((item) => {
      if (item.key === 'schedule') {
        return {
          ...item,
          to: canManageSchedule ? ADMIN_SCHEDULE_ROUTE : ADMIN_SCHEDULE_VIEW_ROUTE,
          subtitle: canManageSchedule ? item.subtitle : 'نمایش برنامه',
          permission: canManageSchedule ? 'manage_schedule' : 'view_schedule'
        };
      }
      return item;
    }).filter((item) => !item.permission || permissionAllows(item.permission, effectivePermissions))
  ), [canManageSchedule, effectivePermissions]);

  useEffect(() => {
    try {
      const normalized = normalizeSnoozeState(snoozedAlerts);
      localStorage.setItem(ALERT_SNOOZE_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // ignore storage write issues
    }
  }, [snoozedAlerts]);

  useEffect(() => {
    try {
      localStorage.setItem(SCHEDULE_WIDGET_FILTER_STORAGE_KEY, normalizeScheduleWidgetFilter(todayScheduleFilter));
    } catch {
      // ignore storage write issues
    }
  }, [todayScheduleFilter]);

  useEffect(() => {
    try {
      localStorage.setItem(SCHEDULE_WIDGET_ISSUE_FILTER_STORAGE_KEY, normalizeScheduleIssueFilter(todayScheduleIssueFilter));
    } catch {
      // ignore storage write issues
    }
  }, [todayScheduleIssueFilter]);

  useEffect(() => {
    try {
      localStorage.setItem(SCHEDULE_WIDGET_HELP_OPEN_STORAGE_KEY, todayScheduleHelpOpen ? '1' : '0');
    } catch {
      // ignore storage write issues
    }
  }, [todayScheduleHelpOpen]);

  const activeSnoozedAlerts = useMemo(
    () => normalizeSnoozeState(snoozedAlerts),
    [snoozedAlerts]
  );

  const alertsInDomain = useMemo(() => {
    const normalized = todaySchedule.map((item, index) => ({
      id: String(item?._id || item?.id || `row-${index}`),
      start: parseClockToMinutes(item?.startTime),
      end: parseClockToMinutes(item?.endTime),
      instructorKey: String(item?.instructor?._id || item?.instructor?.name || '').trim().toLowerCase(),
      classKey: String(item?.classId || item?.schoolClass?._id || item?.schoolClass?.title || item?.course?.title || '').trim().toLowerCase(),
      roomKey: String(item?.room || '').trim().toLowerCase()
    }));

    let scheduleConflictCount = 0;
    const severeReasons = new Set();
    for (let i = 0; i < normalized.length; i += 1) {
      for (let j = i + 1; j < normalized.length; j += 1) {
        const left = normalized[i];
        const right = normalized[j];
        if (!doTimeRangesOverlap(left.start, left.end, right.start, right.end)) continue;

        const reasons = [];
        if (left.instructorKey && left.instructorKey === right.instructorKey) reasons.push('استاد');
        if (left.classKey && left.classKey === right.classKey) reasons.push('صنف');
        if (left.roomKey && left.roomKey === right.roomKey) reasons.push('اتاق');
        if (!reasons.length) continue;

        scheduleConflictCount += 1;
        reasons.forEach((reason) => {
          if (reason === 'استاد' || reason === 'صنف') severeReasons.add(reason);
        });
      }
    }

    const baseAlerts = Array.isArray(alerts) ? [...alerts] : [];
    if (scheduleConflictCount > 0) {
      const severe = severeReasons.size > 0;
      baseAlerts.push({
        key: 'schedule_conflicts',
        title: severe ? 'تداخل‌های شدید امروز تقسیم اوقات' : 'تداخل‌های امروز تقسیم اوقات',
        domain: 'education',
        owner: 'تیم آموزشی',
        level: severe ? 'high' : 'medium',
        count: scheduleConflictCount,
        oldestPendingMinutes: 0,
        overSla: severe,
        requiresImmediateAction: severe,
        trendDirection: 'steady',
        trendPercent: 0
      });
    }

    return baseAlerts.filter((item) => alertDomainFilter === 'all' || resolveAlertDomain(item) === alertDomainFilter);
  }, [alerts, alertDomainFilter, todaySchedule]);

  const visibleAlerts = useMemo(
    () => alertsInDomain.filter((item) => !activeSnoozedAlerts[item.key]),
    [alertsInDomain, activeSnoozedAlerts]
  );

  const snoozedAlertsInDomainCount = useMemo(
    () => alertsInDomain.filter((item) => !!activeSnoozedAlerts[item.key]).length,
    [alertsInDomain, activeSnoozedAlerts]
  );

  const urgentAlerts = useMemo(
    () => visibleAlerts.filter((item) => item?.requiresImmediateAction || item?.overSla || item?.level === 'high'),
    [visibleAlerts]
  );

  const normalAlerts = useMemo(
    () => visibleAlerts.filter((item) => !(item?.requiresImmediateAction || item?.overSla || item?.level === 'high')),
    [visibleAlerts]
  );

  const alertsOverSlaCount = useMemo(
    () => visibleAlerts.filter((item) => item?.overSla).length,
    [visibleAlerts]
  );

  const todayScheduleSummary = useMemo(() => {
    const summary = {
      total: 0,
      published: 0,
      draft: 0
    };
    todaySchedule.forEach((item) => {
      const visibility = normalizeScheduleVisibility(item?.visibility);
      summary.total += 1;
      if (visibility === 'draft') {
        summary.draft += 1;
      } else {
        summary.published += 1;
      }
    });
    return summary;
  }, [todaySchedule]);

  const filteredTodaySchedule = useMemo(() => (
    todaySchedule.filter((item) => {
      if (todayScheduleFilter === 'all') return true;
      return normalizeScheduleVisibility(item?.visibility) === todayScheduleFilter;
    })
  ), [todaySchedule, todayScheduleFilter]);

  const todayScheduleConflictsById = useMemo(() => {
    const map = {};
    const normalized = todaySchedule.map((item, index) => {
      const id = getScheduleRowId(item, `row-${index}`);
      return {
        id,
        start: parseClockToMinutes(item?.startTime),
        end: parseClockToMinutes(item?.endTime),
        instructorKey: String(item?.instructor?._id || item?.instructor?.name || '').trim().toLowerCase(),
        classKey: String(item?.classId || item?.schoolClass?._id || item?.schoolClass?.title || item?.course?.title || '').trim().toLowerCase(),
        roomKey: String(item?.room || '').trim().toLowerCase()
      };
    });

    for (let i = 0; i < normalized.length; i += 1) {
      for (let j = i + 1; j < normalized.length; j += 1) {
        const left = normalized[i];
        const right = normalized[j];
        if (!doTimeRangesOverlap(left.start, left.end, right.start, right.end)) continue;

        const reasons = [];
        if (left.instructorKey && left.instructorKey === right.instructorKey) reasons.push('استاد');
        if (left.classKey && left.classKey === right.classKey) reasons.push('صنف');
        if (left.roomKey && left.roomKey === right.roomKey) reasons.push('اتاق');
        if (!reasons.length) continue;

        if (!map[left.id]) map[left.id] = new Set();
        if (!map[right.id]) map[right.id] = new Set();
        reasons.forEach((reason) => {
          map[left.id].add(reason);
          map[right.id].add(reason);
        });
      }
    }

    return Object.fromEntries(
      Object.entries(map).map(([id, values]) => [id, Array.from(values)])
    );
  }, [todaySchedule]);

  const issueFilteredTodaySchedule = useMemo(() => (
    filteredTodaySchedule.filter((item, index) => {
      if (todayScheduleIssueFilter === 'all') return true;
      const rowId = getScheduleRowId(item, `row-${index}`);
      if (todayScheduleIssueFilter === 'draft') return normalizeScheduleVisibility(item?.visibility) === 'draft';
      if (todayScheduleIssueFilter === 'conflict') return (todayScheduleConflictsById[rowId] || []).length > 0;
      if (todayScheduleIssueFilter === 'room') return !String(item?.room || '').trim();
      return true;
    })
  ), [filteredTodaySchedule, todayScheduleIssueFilter, todayScheduleConflictsById]);

  useEffect(() => {
    if (todayScheduleIssueFilter === 'all') return;
    if (issueFilteredTodaySchedule.length > 0) return;
    setTodayScheduleIssueFilter('all');
  }, [issueFilteredTodaySchedule.length, todayScheduleIssueFilter]);

  const todayScheduleHealth = useMemo(() => {
    const total = Number(todayScheduleSummary.total || 0);
    const draftCount = Number(todayScheduleSummary.draft || 0);
    const conflictedRows = Object.keys(todayScheduleConflictsById || {}).length;
    const roomMissingRows = todaySchedule.filter((item) => !String(item?.room || '').trim()).length;

    if (!total) {
      return {
        score: 100,
        tone: 'good',
        conflictedRows,
        roomMissingRows,
        penalties: {
          draft: 0,
          conflict: 0,
          room: 0
        }
      };
    }

    const draftPenalty = (draftCount / total) * 30;
    const conflictPenalty = (conflictedRows / total) * 45;
    const roomPenalty = (roomMissingRows / total) * 25;
    const rawScore = Math.round(Math.max(0, Math.min(100, 100 - draftPenalty - conflictPenalty - roomPenalty)));

    let tone = 'good';
    if (rawScore < 65) tone = 'risk';
    else if (rawScore < 85) tone = 'medium';

    return {
      score: rawScore,
      tone,
      conflictedRows,
      roomMissingRows,
      penalties: {
        draft: Math.round(draftPenalty),
        conflict: Math.round(conflictPenalty),
        room: Math.round(roomPenalty)
      }
    };
  }, [todaySchedule, todayScheduleConflictsById, todayScheduleSummary.draft, todayScheduleSummary.total]);

  const todayScheduleHealthBreakdown = useMemo(() => {
    const draftCount = Number(todayScheduleSummary.draft || 0);
    const conflictCount = Number(todayScheduleHealth?.conflictedRows || 0);
    const roomCount = Number(todayScheduleHealth?.roomMissingRows || 0);
    return [
      {
        key: 'draft',
        label: `پیش‌نویس: ${draftCount.toLocaleString('fa-AF-u-ca-persian')} (-${Number(todayScheduleHealth?.penalties?.draft || 0).toLocaleString('fa-AF-u-ca-persian')})`,
        count: draftCount,
        hint: 'جریمه پیش‌نویس = (تعداد پیش‌نویس / کل جلسات) × 30'
      },
      {
        key: 'conflict',
        label: `تداخل: ${conflictCount.toLocaleString('fa-AF-u-ca-persian')} (-${Number(todayScheduleHealth?.penalties?.conflict || 0).toLocaleString('fa-AF-u-ca-persian')})`,
        count: conflictCount,
        hint: 'جریمه تداخل = (تعداد ردیف‌های دارای تداخل / کل جلسات) × 45'
      },
      {
        key: 'room',
        label: `اتاق نامشخص: ${roomCount.toLocaleString('fa-AF-u-ca-persian')} (-${Number(todayScheduleHealth?.penalties?.room || 0).toLocaleString('fa-AF-u-ca-persian')})`,
        count: roomCount,
        hint: 'جریمه اتاق نامشخص = (تعداد ردیف‌های بدون اتاق / کل جلسات) × 25'
      }
    ];
  }, [todayScheduleHealth, todayScheduleSummary.draft]);

  const todayScheduleHealthFormulaText = 'فرمول شاخص: 100 - جریمه پیش‌نویس - جریمه تداخل - جریمه اتاق نامشخص';

  const hasActiveScheduleFilters = useMemo(
    () => todayScheduleFilter !== 'all' || todayScheduleIssueFilter !== 'all',
    [todayScheduleFilter, todayScheduleIssueFilter]
  );

  const resetScheduleFilters = useCallback(() => {
    setTodayScheduleFilter('all');
    setTodayScheduleIssueFilter('all');
  }, []);

  const scheduleResetShortcutHint = 'میانبر بازنشانی: Alt+Shift+R';

  useEffect(() => {
    const onKeyDown = (event) => {
      const shortcutPressed = event.altKey && event.shiftKey && String(event.key || '').toLowerCase() === 'r';
      if (!shortcutPressed) return;
      event.preventDefault();
      resetScheduleFilters();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [resetScheduleFilters]);

  const todayScheduleCheckedLabel = useMemo(() => {
    if (!todayScheduleCheckedAt) return '';
    return formatAfghanTime(todayScheduleCheckedAt, {
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [todayScheduleCheckedAt]);
  const todayScheduleCardLabel = todayScheduleSource === 'draft' ? todayScheduleScopeLabel : 'امروز';
  const todayScheduleCardTitle = `تقسیم اوقات ${todayScheduleCardLabel}`;
  const todayScheduleSourceLabel = todayScheduleSource === 'draft' ? 'متصل به ادیتور جدید' : 'متصل به سیستم رسمی';
  const todayScheduleHeroNote = todayScheduleSource === 'draft'
    ? `منبع داده: تقسیم اوقات جدید ${todayScheduleCardLabel}`
    : 'منبع داده: سیستم رسمی امروز';
  const todayScheduleHealthLabel = todayScheduleHealth.tone === 'risk'
    ? 'نیازمند رسیدگی فوری'
    : todayScheduleHealth.tone === 'medium'
      ? 'وضعیت قابل قبول'
      : 'وضعیت پایدار';

  const snoozeAlert = useCallback((alert) => {
    const durationMinutes = resolveAlertSnoozeDuration(alert);
    if (!alert?.key || durationMinutes <= 0) return;
    const expiresAt = Date.now() + (durationMinutes * 60000);
    setSnoozedAlerts((prev) => ({
      ...normalizeSnoozeState(prev),
      [alert.key]: expiresAt
    }));
  }, []);

  const clearAllSnoozes = useCallback(() => {
    setSnoozedAlerts({});
  }, []);

  const logout = () => {
    localStorage.clear();
    window.location.href = '/';
  };

  const loadPendingOrders = async () => {
    if (!canManageFinance) return;
    try {
      const res = await fetch(`${API_BASE}/api/student-finance/payments?status=pending`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!data?.success) {
        setOrders([]);
        setOrderMessage(data?.message || 'خطا در دریافت رسیدها');
        return;
      }
      const items = Array.isArray(data.items)
        ? data.items
            .map((payment) => {
              const receipt = payment?.receipt || {};
              const stage = String(receipt?.approvalStage || payment?.approvalStage || '').trim();
              const status = String(receipt?.status || payment?.status || '').trim() || 'pending';
              return {
                ...payment,
                _id: String(payment?.id || '').trim(),
                sourceReceiptId: String(receipt?.id || payment?.sourceReceiptId || '').trim(),
                user: {
                  ...(payment?.student || {}),
                  name: getFinanceStudentName(payment?.student)
                },
                student: {
                  ...(payment?.student || {}),
                  name: getFinanceStudentName(payment?.student)
                },
                course: payment?.schoolClass?.title ? { title: payment.schoolClass.title } : payment?.course || null,
                bill: {
                  _id: String(
                    payment?.feeOrder?.id
                    || payment?.feeOrderId
                    || payment?.feeOrder?.sourceBillId
                    || ''
                  ).trim(),
                  billNumber: String(payment?.feeOrder?.orderNumber || '').trim(),
                  amountDue: Number(payment?.feeOrder?.amountDue || 0),
                  amountPaid: Number(payment?.feeOrder?.amountPaid || 0),
                  status: String(payment?.feeOrder?.status || '').trim()
                },
                amount: Number(payment?.amount || 0),
                paidAt: payment?.paidAt || receipt?.paidAt || null,
                status,
                approvalStage: stage,
                fileUrl: String(receipt?.fileUrl || payment?.fileUrl || '').trim(),
                note: String(receipt?.note || payment?.note || '').trim(),
                referenceNo: String(receipt?.referenceNo || payment?.referenceNo || '').trim(),
                approvalTrail: Array.isArray(payment?.approvalTrail)
                  ? payment.approvalTrail
                  : (Array.isArray(receipt?.approvalTrail) ? receipt.approvalTrail : []),
                followUp: payment?.followUp || receipt?.followUp || null
              };
            })
            .filter((payment) => payment._id && payment.status === 'pending')
            .filter((payment) => {
              if (adminLevel === 'finance_manager') return payment.approvalStage === 'finance_manager_review';
              if (adminLevel === 'finance_lead') return payment.approvalStage === 'finance_lead_review';
              return true;
            })
        : [];
      setOrders(items);
      setOrderMessage('');
    } catch {
      setOrders([]);
      setOrderMessage('خطا در ارتباط با سرور');
    }
  };

  const loadProfileRequests = async () => {
    if (!canManageUsers) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/profile-update-requests?status=pending`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setProfileRequests([]);
        setRequestMessage(data?.message || 'خطا در دریافت درخواست‌ها');
        return;
      }
      setProfileRequests(data.items || []);
      setRequestMessage('');
    } catch {
      setProfileRequests([]);
      setRequestMessage('خطا در ارتباط با سرور');
    }
  };

  const loadSupportMessages = async () => {
    if (!canManageContent) return;
    try {
      const res = await fetch(`${API_BASE}/api/contact/admin`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setSupportMessages([]);
        setSupportMessage(data?.message || 'خطا در دریافت پیام‌های پشتیبانی');
        return;
      }
      const rows = Array.isArray(data.items) ? data.items : [];
      setSupportMessages(rows.filter((item) => {
        const followUpStatus = String(item?.followUp?.status || '').trim().toLowerCase();
        const effectiveStatus = followUpStatus || (item?.status === 'read' ? 'resolved' : 'new');
        return effectiveStatus !== 'resolved';
      }));
      setSupportMessage('');
    } catch {
      setSupportMessages([]);
      setSupportMessage('خطا در ارتباط با سرور');
    }
  };

  const loadAlerts = async () => {
    if (!canViewReports) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/alerts`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!data?.success) {
        setAlerts([]);
        return;
      }
      const rows = Array.isArray(data.alerts) ? data.alerts : [];
      setAlerts(rows.map((item) => ({
        ...item,
        domain: resolveAlertDomain(item)
      })));
    } catch {
      setAlerts([]);
    }
  };

  const loadStats = async () => {
    if (!canViewReports) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/stats`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!data?.success) return;
      setStats({
        users: data.users || 0,
        courses: data.courses || 0,
        todayPayments: data.todayPayments || 0,
        pendingOrders: data.pendingOrders || 0
      });
    } catch {
      // ignore
    }
  };

  const loadAdminDashboard = async () => {
    if (!canViewReports) return;
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/admin`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      setAdminDashboard(data?.success ? data : null);
    } catch {
      setAdminDashboard(null);
    }
  };

  const loadSettingsQuickLinks = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/public`);
      const data = await res.json();
      if (!data?.success) return;
      const links = normalizeQuickLinkItems(data?.settings?.adminQuickLinks || []);
      if (links.length) setSettingsQuickLinks(links);
    } catch {
      // keep fallback quick links
    }
  };

  const loadReportActivities = async () => {
    if (!canViewReports) return;
    try {
      const actionIn = encodeURIComponent(REPORT_ACTIVITY_ACTIONS.join(','));
      const res = await fetch(`${API_BASE}/api/admin-logs?action_in=${actionIn}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setReportActivityItems([]);
        return;
      }
      const rows = Array.isArray(data.items) ? data.items : [];
      setReportActivityItems(rows.slice(0, 8));
    } catch {
      setReportActivityItems([]);
    }
  };

  const loadWorkflowReport = async () => {
    if (!canViewReports) return;
    try {
      const params = new URLSearchParams();
      if (workflowTypeFilter && workflowTypeFilter !== 'all') {
        params.set('type', workflowTypeFilter);
      }
      const query = params.toString();
      const endpoint = query
        ? `${API_BASE}/api/admin/workflow-report?${query}`
        : `${API_BASE}/api/admin/workflow-report`;
      const res = await fetch(endpoint, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setWorkflowReport(null);
        setWorkflowMessage(data?.message || 'خطا در دریافت گزارش جریان کار');
        return;
      }
      setWorkflowReport(data);
      setWorkflowMessage('');
    } catch {
      setWorkflowReport(null);
      setWorkflowMessage('خطا در دریافت گزارش جریان کار');
    }
  };

  const loadSlaConfig = async () => {
    if (!canViewReports) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/sla/config`, {
        cache: 'no-store',
        headers: {
          ...getAuthHeaders(),
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });
      if (res.status === 304) {
        setSlaMessage('تنظیمات SLA تغییری نداشته است.');
        return;
      }
      const data = await res.json();
      if (!data?.success) {
        setSlaConfig(null);
        setSlaMessage(data?.message || 'خطا در دریافت تنظیمات SLA');
        return;
      }
      const resolvedTimeouts = normalizeSlaTimeouts(data);
      if (!resolvedTimeouts) {
        setSlaConfig(null);
        setSlaMessage('تنظیمات SLA دریافت شد اما داده قابل نمایش ندارد.');
        return;
      }
      setSlaConfig({
        ...data,
        timeouts: resolvedTimeouts
      });
      setSlaMessage('');
    } catch {
      setSlaConfig(null);
      setSlaMessage('خطا در دریافت تنظیمات SLA');
    }
  };

  const currentSlaTimeouts = useMemo(() => {
    const normalized = normalizeSlaTimeouts(slaConfig);
    if (normalized) return normalized;
    return {
      finance_manager: 0,
      finance_lead: 0,
      general_president: 0
    };
  }, [slaConfig]);

  const runSlaNow = async () => {
    if (!canViewReports || slaBusy) return;
    setSlaBusy(true);
    setSlaMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/sla/run`, {
        method: 'POST',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setSlaResult(null);
        setSlaMessage(data?.message || 'اجرای SLA ناموفق بود');
        return;
      }
      const result = data.result || null;
      setSlaResult(result);
      const totalEscalated = Number(result?.summary?.totals?.escalated || 0);
      const totalNotifications = Number(result?.summary?.totals?.notifications || 0);
      setSlaMessage(`اجرای SLA انجام شد. ارجاع: ${totalEscalated} | اعلان: ${totalNotifications}`);

      loadAlerts();
      loadWorkflowReport();
      if (canManageFinance) loadPendingOrders();
      if (canManageUsers) loadProfileRequests();
      if (canManageContent) loadSupportMessages();
    } catch {
      setSlaResult(null);
      setSlaMessage('خطا در اجرای SLA');
    } finally {
      setSlaBusy(false);
    }
  };

  const loadProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (data?.success) {
        setUser(data.user);
        try {
          localStorage.setItem(
            'effectivePermissions',
            JSON.stringify(Array.isArray(data.user?.effectivePermissions) ? data.user.effectivePermissions : [])
          );
          localStorage.setItem('orgRole', data.user?.orgRole || '');
          localStorage.setItem('adminLevel', data.user?.adminLevel || '');
        } catch {
          // ignore storage errors
        }
      }
    } catch {
      setUser(null);
    }
  };

  const loadTodaySchedule = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setTodayScheduleBusy(true);
    try {
      const schoolId = resolveTimetableSchoolId();
      if (schoolId && schoolId !== 'default-school-id') {
        const draftRes = await fetch(`${API_BASE}/api/timetables/daily-draft?schoolId=${encodeURIComponent(schoolId)}`, {
          headers: { ...getAuthHeaders() }
        });
        const draftData = await draftRes.json();
        const serverDraft = draftRes.ok && draftData?.success && draftData?.item
          ? writeDailyTimetableDraft(draftData.item)
          : null;
        const serverDraftSchedule = buildAdminScheduleFromDraft(serverDraft);

        if (serverDraftSchedule) {
          setTodaySchedule(serverDraftSchedule.items || []);
          setTodayScheduleSource('draft');
          setTodayScheduleScopeLabel(serverDraftSchedule.dayLabel || 'روز انتخاب‌شده');
          setTodayScheduleCheckedAt(serverDraftSchedule.updatedAt || new Date().toISOString());
          return;
        }
      }

      const localDraftSchedule = buildAdminScheduleFromDraft(readDailyTimetableDraft());
      if (localDraftSchedule) {
        setTodaySchedule(localDraftSchedule.items || []);
        setTodayScheduleSource('draft');
        setTodayScheduleScopeLabel(localDraftSchedule.dayLabel || 'روز انتخاب‌شده');
        setTodayScheduleCheckedAt(localDraftSchedule.updatedAt || new Date().toISOString());
        return;
      }

      const res = await fetch(`${API_BASE}/api/schedules/today`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      setTodaySchedule(data?.success ? (data.items || []) : []);
      setTodayScheduleSource('api');
      setTodayScheduleScopeLabel('امروز');
      setTodayScheduleCheckedAt(new Date().toISOString());
    } catch {
      setTodaySchedule([]);
      setTodayScheduleSource('api');
      setTodayScheduleScopeLabel('امروز');
      setTodayScheduleCheckedAt(new Date().toISOString());
    } finally {
      if (!silent) setTodayScheduleBusy(false);
    }
  }, []);

  const runApiHealthCheck = async () => {
    setApiHealthLoading(true);
    const startedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

    try {
      const res = await fetch(`${API_BASE}/api/health`, { headers: { ...getAuthHeaders() } });
      const finishedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
      setApiHealth({
        status: res.ok ? 'online' : 'offline',
        latencyMs: Math.max(0, Math.round(finishedAt - startedAt)),
        checkedAt: new Date().toISOString()
      });
    } catch {
      setApiHealth({
        status: 'offline',
        latencyMs: null,
        checkedAt: new Date().toISOString()
      });
    } finally {
      setApiHealthLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    loadTodaySchedule();
    loadSettingsQuickLinks();
    runApiHealthCheck();
  }, [loadTodaySchedule]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      runApiHealthCheck();
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadTodaySchedule({ silent: true });
    }, SCHEDULE_AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadTodaySchedule]);

  useEffect(() => {
    if (!canManageFinance) {
      setOrders([]);
      setOrderMessage('');
      return;
    }
    loadPendingOrders();
  }, [canManageFinance, adminLevel]);

  useEffect(() => {
    if (!canManageUsers) {
      setProfileRequests([]);
      setRequestMessage('');
      return;
    }
    loadProfileRequests();
  }, [canManageUsers]);

  useEffect(() => {
    if (!canManageContent) {
      setSupportMessages([]);
      setSupportMessage('');
      return;
    }
    loadSupportMessages();
  }, [canManageContent]);

  useEffect(() => {
    if (!canViewReports) {
      setAlerts([]);
      setAdminDashboard(null);
      setReportActivityItems([]);
      setStats({ users: 0, courses: 0, todayPayments: 0, pendingOrders: 0 });
      setSlaConfig(null);
      setSlaResult(null);
      setSlaMessage('');
      return;
    }
    loadAlerts();
    loadStats();
    loadAdminDashboard();
    loadReportActivities();
    loadSlaConfig();
  }, [canViewReports]);

  useEffect(() => {
    if (!canViewReports) {
      setWorkflowReport(null);
      setWorkflowMessage('');
      return;
    }
    loadWorkflowReport();
  }, [canViewReports, workflowTypeFilter]);

  useEffect(() => {
    setSelectedProfileIds((prev) => prev.filter((id) => profileRequests.some((item) => item._id === id)));
  }, [profileRequests]);

  useEffect(() => {
    setSelectedOrderIds((prev) => prev.filter((id) => orders.some((item) => item._id === id)));
  }, [orders]);

  const approveOrder = async (order) => {
    if (!canManageFinance || !order?._id) return;
    setBusy((prev) => ({ ...prev, [order._id]: true }));
    setOrderMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/student-finance/payments/${order._id}/approve`, {
        method: 'POST',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setOrderMessage(data?.message || 'تایید رسید ناموفق بود');
      } else {
        setOrderMessage('رسید تایید شد');
        loadPendingOrders();
        if (canViewReports) loadStats();
      }
    } catch {
      setOrderMessage('خطا در تایید رسید');
    } finally {
      setBusy((prev) => ({ ...prev, [order._id]: false }));
    }
  };

  const rejectOrder = async (order) => {
    if (!canManageFinance || !order?._id) return;
    const reason = window.prompt('دلیل رد رسید (اختیاری):', '');
    setBusy((prev) => ({ ...prev, [order._id]: true }));
    setOrderMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/student-finance/payments/${order._id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ reason: reason || 'رد شد' })
      });
      const data = await res.json();
      if (!data?.success) {
        setOrderMessage(data?.message || 'رد رسید ناموفق بود');
      } else {
        setOrderMessage('رسید رد شد');
        loadPendingOrders();
        if (canViewReports) loadStats();
      }
    } catch {
      setOrderMessage('خطا در رد رسید');
    } finally {
      setBusy((prev) => ({ ...prev, [order._id]: false }));
    }
  };

  const approveProfileRequest = async (item) => {
    if (!canManageUsers || !item?._id) return;
    setBusy((prev) => ({ ...prev, [item._id]: true }));
    setRequestMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/profile-update-requests/${item._id}/approve`, {
        method: 'POST',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setRequestMessage(data?.message || 'تایید درخواست ناموفق بود');
      } else {
        setRequestMessage('درخواست تغییر مشخصات تایید شد');
        loadProfileRequests();
      }
    } catch {
      setRequestMessage('خطا در تایید درخواست');
    } finally {
      setBusy((prev) => ({ ...prev, [item._id]: false }));
    }
  };

  const rejectProfileRequest = async (item) => {
    if (!canManageUsers || !item?._id) return;
    const reason = window.prompt('دلیل رد درخواست (اختیاری):', '') || '';
    setBusy((prev) => ({ ...prev, [item._id]: true }));
    setRequestMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/profile-update-requests/${item._id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!data?.success) {
        setRequestMessage(data?.message || 'رد درخواست ناموفق بود');
      } else {
        setRequestMessage('درخواست تغییر مشخصات رد شد');
        loadProfileRequests();
      }
    } catch {
      setRequestMessage('خطا در رد درخواست');
    } finally {
      setBusy((prev) => ({ ...prev, [item._id]: false }));
    }
  };

  const toggleProfileSelection = (id) => {
    setSelectedProfileIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const toggleAllProfileSelection = () => {
    if (!profileRequests.length) {
      setSelectedProfileIds([]);
      return;
    }
    setSelectedProfileIds((prev) => (
      prev.length === profileRequests.length ? [] : profileRequests.map((item) => item._id)
    ));
  };

  const toggleOrderSelection = (id) => {
    setSelectedOrderIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const toggleAllOrderSelection = () => {
    if (!orders.length) {
      setSelectedOrderIds([]);
      return;
    }
    setSelectedOrderIds((prev) => (
      prev.length === orders.length ? [] : orders.map((item) => item._id)
    ));
  };

  const bulkApproveProfiles = async () => {
    if (!selectedProfileIds.length || !canManageUsers) return;
    setBulkBusy((prev) => ({ ...prev, profileApprove: true }));
    setRequestMessage('');
    let success = 0;
    let failed = 0;
    for (const id of selectedProfileIds) {
      try {
        const res = await fetch(`${API_BASE}/api/admin/profile-update-requests/${id}/approve`, {
          method: 'POST',
          headers: { ...getAuthHeaders() }
        });
        const data = await res.json();
        if (data?.success) success += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setRequestMessage(`نتیجه تایید گروهی: ${success} موفق، ${failed} ناموفق`);
    setSelectedProfileIds([]);
    loadProfileRequests();
    if (canViewReports) loadAlerts();
    setBulkBusy((prev) => ({ ...prev, profileApprove: false }));
  };

  const bulkRejectProfiles = async () => {
    if (!selectedProfileIds.length || !canManageUsers) return;
    const reason = window.prompt('دلیل رد گروهی (اختیاری):', '') || '';
    setBulkBusy((prev) => ({ ...prev, profileReject: true }));
    setRequestMessage('');
    let success = 0;
    let failed = 0;
    for (const id of selectedProfileIds) {
      try {
        const res = await fetch(`${API_BASE}/api/admin/profile-update-requests/${id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ reason })
        });
        const data = await res.json();
        if (data?.success) success += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setRequestMessage(`نتیجه رد گروهی: ${success} موفق، ${failed} ناموفق`);
    setSelectedProfileIds([]);
    loadProfileRequests();
    if (canViewReports) loadAlerts();
    setBulkBusy((prev) => ({ ...prev, profileReject: false }));
  };

  const bulkApproveOrders = async () => {
    if (!selectedOrderIds.length || !canManageFinance) return;
    setBulkBusy((prev) => ({ ...prev, orderApprove: true }));
    setOrderMessage('');
    let success = 0;
    let failed = 0;
    for (const id of selectedOrderIds) {
      try {
        const res = await fetch(`${API_BASE}/api/student-finance/payments/${id}/approve`, {
          method: 'POST',
          headers: { ...getAuthHeaders() }
        });
        const data = await res.json();
        if (data?.success) success += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setOrderMessage(`نتیجه تایید گروهی رسیدها: ${success} موفق، ${failed} ناموفق`);
    setSelectedOrderIds([]);
    loadPendingOrders();
    if (canViewReports) loadStats();
    setBulkBusy((prev) => ({ ...prev, orderApprove: false }));
  };

  const bulkRejectOrders = async () => {
    if (!selectedOrderIds.length || !canManageFinance) return;
    const reason = window.prompt('دلیل رد گروهی رسیدها (اختیاری):', '') || '';
    setBulkBusy((prev) => ({ ...prev, orderReject: true }));
    setOrderMessage('');
    let success = 0;
    let failed = 0;
    for (const id of selectedOrderIds) {
      try {
        const res = await fetch(`${API_BASE}/api/student-finance/payments/${id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ reason: reason || 'رد شد' })
        });
        const data = await res.json();
        if (data?.success) success += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setOrderMessage(`نتیجه رد گروهی رسیدها: ${success} موفق، ${failed} ناموفق`);
    setSelectedOrderIds([]);
    loadPendingOrders();
    if (canViewReports) loadStats();
    setBulkBusy((prev) => ({ ...prev, orderReject: false }));
  };

  const markSupportMessageRead = async (messageItem) => {
    if (!canManageContent || !messageItem?._id) return;
    const busyKey = `contact:${messageItem._id}`;
    setBusy((prev) => ({ ...prev, [busyKey]: true }));
    setSupportMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/contact/${messageItem._id}/read`, {
        method: 'PUT',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setSupportMessage(data?.message || 'علامت‌گذاری پیام ناموفق بود');
      } else {
        setSupportMessage('پیام پشتیبانی خوانده شد');
        loadSupportMessages();
        if (canViewReports) {
          loadAlerts();
          loadWorkflowReport();
        }
      }
    } catch {
      setSupportMessage('خطا در بروزرسانی پیام پشتیبانی');
    } finally {
      setBusy((prev) => ({ ...prev, [busyKey]: false }));
    }
  };

  const getStageDefaultLevel = (stage = '') => {
    const normalized = String(stage || '').trim();
    if (normalized === 'finance_lead_review') return 'finance_lead';
    if (normalized === 'general_president_review') return 'general_president';
    return 'finance_manager';
  };

  const getDefaultFollowUpByKind = (kind, raw) => {
    if (kind === 'receipt') {
      const assignedLevel = getStageDefaultLevel(raw?.approvalStage || '');
      const status = raw?.status === 'pending' ? 'new' : 'resolved';
      const note = formatWorkflowNote(raw?.followUp?.note);
      return {
        assignedLevel: raw?.followUp?.assignedLevel || assignedLevel,
        status: raw?.followUp?.status || status,
        note
      };
    }
    if (kind === 'profile') {
      const assignedLevel = 'finance_manager';
      const status = raw?.status === 'pending' ? 'new' : 'resolved';
      const note = formatWorkflowNote(raw?.followUp?.note);
      return {
        assignedLevel: raw?.followUp?.assignedLevel || assignedLevel,
        status: raw?.followUp?.status || status,
        note
      };
    }
    const assignedLevel = 'finance_manager';
    const status = raw?.status === 'read' ? 'resolved' : 'new';
    const note = formatWorkflowNote(raw?.followUp?.note);
    return {
      assignedLevel: raw?.followUp?.assignedLevel || assignedLevel,
      status: raw?.followUp?.status || status,
      note
    };
  };

  const draftKeyForItem = (item) => `${item.kind}:${item.id}`;

  const getFollowUpDraft = (item) => {
    const key = draftKeyForItem(item);
    return followUpDrafts[key] || item.followUp;
  };

  const setFollowUpDraftField = (item, field, value) => {
    const key = draftKeyForItem(item);
    setFollowUpDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || item.followUp),
        [field]: value
      }
    }));
  };

  const toggleHistory = (key) => {
    setExpandedHistory((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const filterTimelineEntries = (entries = []) => {
    const fromTs = toDayStartTimestamp(timelineFromDate);
    const toTs = toDayEndTimestamp(timelineToDate);
    return entries.filter((entry) => {
      const status = String(entry?.status || '').trim().toLowerCase();
      if (timelineStatusFilter !== 'all' && status !== timelineStatusFilter) return false;
      if (fromTs !== null || toTs !== null) {
        const entryTs = new Date(entry?.updatedAt || entry?.at || 0).getTime();
        if (fromTs !== null && entryTs < fromTs) return false;
        if (toTs !== null && entryTs > toTs) return false;
      }
      return true;
    });
  };

  const clearTimelineFilters = () => {
    setTimelineStatusFilter('all');
    setTimelineFromDate('');
    setTimelineToDate('');
  };
  const hasTimelineFilters = timelineStatusFilter !== 'all' || Boolean(timelineFromDate) || Boolean(timelineToDate);

  const exportWorkflowReportCsv = () => {
    if (!workflowReport?.levels) {
      setWorkflowMessage('\u0627\u0628\u062a\u062f\u0627 \u06af\u0632\u0627\u0631\u0634 \u0639\u0645\u0644\u06a9\u0631\u062f \u0631\u0627 \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u06a9\u0646\u06cc\u062f.');
      return;
    }

    const selectedType = workflowTypeFilter || workflowReport?.type || 'all';
    const selectedTypeLabel = WORKFLOW_TYPE_LABELS[selectedType] || WORKFLOW_TYPE_LABELS.all;
    const rows = [
      ['\u06af\u0632\u0627\u0631\u0634 \u0639\u0645\u0644\u06a9\u0631\u062f \u0633\u0637\u0648\u062d \u0645\u062f\u06cc\u0631\u06cc\u062a\u06cc'],
      ['\u062a\u0627\u0631\u06cc\u062e \u06af\u0632\u0627\u0631\u0634', new Date().toLocaleString('fa-AF-u-ca-persian')],
      ['\u0646\u0648\u0639 \u0627\u0646\u062a\u062e\u0627\u0628\u200c\u0634\u062f\u0647', selectedTypeLabel],
      [],
      ['\u0633\u0637\u062d', '\u062f\u0631\u06cc\u0627\u0641\u062a\u06cc', '\u0628\u0627\u0632', '\u062a\u06a9\u0645\u06cc\u0644\u200c\u0634\u062f\u0647']
    ];

    FOLLOW_UP_LEVEL_OPTIONS.forEach((item) => {
      const row = workflowReport?.levels?.[item.value] || { assigned: 0, open: 0, resolved: 0 };
      rows.push([
        item.label,
        Number(row.assigned || 0),
        Number(row.open || 0),
        Number(row.resolved || 0)
      ]);
    });

    rows.push([]);
    rows.push([
      '\u062c\u0645\u0639 \u06a9\u0644',
      Number(workflowReport?.totals?.assigned || 0),
      Number(workflowReport?.totals?.open || 0),
      Number(workflowReport?.totals?.resolved || 0)
    ]);

    const byTypeEntries = Object.entries(workflowReport?.byType || {});
    if (byTypeEntries.length) {
      rows.push([]);
      rows.push(['\u062a\u0641\u06a9\u06cc\u06a9 \u0628\u0631 \u0627\u0633\u0627\u0633 \u0646\u0648\u0639']);
      rows.push(['\u0646\u0648\u0639', '\u0633\u0637\u062d', '\u062f\u0631\u06cc\u0627\u0641\u062a\u06cc', '\u0628\u0627\u0632', '\u062a\u06a9\u0645\u06cc\u0644\u200c\u0634\u062f\u0647']);
      byTypeEntries.forEach(([type, levelRows]) => {
        FOLLOW_UP_LEVEL_OPTIONS.forEach((level) => {
          const row = levelRows?.[level.value] || { assigned: 0, open: 0, resolved: 0 };
          rows.push([
            WORKFLOW_TYPE_LABELS[type] || type,
            level.label,
            Number(row.assigned || 0),
            Number(row.open || 0),
            Number(row.resolved || 0)
          ]);
        });
      });
    }

    const breakdownRows = Array.isArray(workflowReport?.breakdown) ? workflowReport.breakdown : [];
    if (breakdownRows.length) {
      rows.push([]);
      rows.push(['\u062c\u0632\u0626\u06cc\u0627\u062a \u0648\u0636\u0639\u06cc\u062a']);
      rows.push(['\u0646\u0648\u0639', '\u0633\u0637\u062d', '\u0648\u0636\u0639\u06cc\u062a', '\u062a\u0639\u062f\u0627\u062f']);
      breakdownRows.forEach((entry) => {
        rows.push([
          WORKFLOW_TYPE_LABELS[entry?.type] || entry?.type || '---',
          FOLLOW_UP_LEVEL_LABELS[entry?.level] || entry?.level || '---',
          FOLLOW_UP_STATUS_LABELS[entry?.status] || entry?.status || '---',
          Number(entry?.count || 0)
        ]);
      });
    }

    const csv = rows
      .map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admin-workflow-report-${selectedType}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const updateFollowUp = async (item) => {
    const key = draftKeyForItem(item);
    const draft = getFollowUpDraft(item);
    if (!draft?.assignedLevel || !draft?.status) return;

    setFollowUpBusy((prev) => ({ ...prev, [key]: true }));
    if (item.kind === 'receipt') setOrderMessage('');
    if (item.kind === 'profile') setRequestMessage('');
    if (item.kind === 'support') setSupportMessage('');

    try {
      let url = '';
      let method = 'POST';
      if (item.kind === 'receipt') {
        url = `${API_BASE}/api/student-finance/payments/${item.id}/follow-up`;
      } else if (item.kind === 'profile') {
        url = `${API_BASE}/api/admin/profile-update-requests/${item.id}/follow-up`;
      } else {
        url = `${API_BASE}/api/contact/${item.id}/follow-up`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          assignedLevel: draft.assignedLevel,
          status: draft.status,
          note: draft.note || ''
        })
      });
      const data = await res.json();
      if (!data?.success) {
        const message = data?.message || 'ثبت پیگیری ناموفق بود';
        if (item.kind === 'receipt') setOrderMessage(message);
        if (item.kind === 'profile') setRequestMessage(message);
        if (item.kind === 'support') setSupportMessage(message);
        return;
      }

      if (item.kind === 'receipt') {
        setOrderMessage(data?.message || 'پیگیری مورد مالی بروزرسانی شد');
        await loadPendingOrders();
      } else if (item.kind === 'profile') {
        setRequestMessage(data?.message || 'پیگیری درخواست بروزرسانی شد');
        await loadProfileRequests();
      } else {
        setSupportMessage(data?.message || 'پیگیری پیام بروزرسانی شد');
        await loadSupportMessages();
      }
      setFollowUpDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (canViewReports) {
        await Promise.all([loadAlerts(), loadWorkflowReport()]);
      }
    } catch {
      const message = 'خطا در ثبت پیگیری';
      if (item.kind === 'receipt') setOrderMessage(message);
      if (item.kind === 'profile') setRequestMessage(message);
      if (item.kind === 'support') setSupportMessage(message);
    } finally {
      setFollowUpBusy((prev) => ({ ...prev, [key]: false }));
    }
  };

  const refreshAdminInbox = async () => {
    const jobs = [];
    if (canManageFinance) jobs.push(loadPendingOrders());
    if (canManageUsers) jobs.push(loadProfileRequests());
    if (canManageContent) jobs.push(loadSupportMessages());
    if (canViewReports) jobs.push(loadAlerts(), loadStats(), loadWorkflowReport());
    if (!jobs.length) return;
    await Promise.all(jobs);
  };

  const inboxCounts = useMemo(() => ({
    receipts: canManageFinance ? orders.length : 0,
    profileRequests: canManageUsers ? profileRequests.length : 0,
    supportMessages: canManageContent ? supportMessages.length : 0
  }), [
    canManageFinance,
    canManageUsers,
    canManageContent,
    orders,
    profileRequests,
    supportMessages
  ]);

  const inboxItems = useMemo(() => {
    const items = [];
    if (canManageFinance) {
      orders.forEach((order) => {
        const amountValue = Number(order.amount);
        const followUp = getDefaultFollowUpByKind('receipt', order);
        items.push({
          kind: 'receipt',
          priority: 3,
          id: order._id,
          createdAt: order.createdAt,
          title: `رسید شهریه: ${order.user?.name || '---'}`,
          subtitle: `${order.course?.title || '---'} | مبلغ: ${(Number.isFinite(amountValue) ? amountValue : 0).toLocaleString('fa-AF-u-ca-persian')}`,
          followUp,
          raw: order
        });
      });
    }
    if (canManageUsers) {
      profileRequests.forEach((item) => {
        const followUp = getDefaultFollowUpByKind('profile', item);
        items.push({
          kind: 'profile',
          priority: 2,
          id: item._id,
          createdAt: item.createdAt,
          title: `درخواست تغییر مشخصات: ${item.user?.name || '---'}`,
          subtitle: `${item.requestedData?.email || '---'} | پایه: ${item.requestedData?.grade || '---'}`,
          followUp,
          raw: item
        });
      });
    }
    if (canManageContent) {
      supportMessages.forEach((item) => {
        const followUp = getDefaultFollowUpByKind('support', item);
        items.push({
          kind: 'support',
          priority: 1,
          id: item._id,
          createdAt: item.createdAt,
          title: `پیام پشتیبانی: ${item.name || item.email || 'بدون نام'}`,
          subtitle: shortText(item.message, 110),
          followUp,
          raw: item
        });
      });
    }
    return items
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      })
      .slice(0, 12);
  }, [canManageFinance, canManageUsers, canManageContent, orders, profileRequests, supportMessages]);

  const filteredInboxItems = useMemo(() => {
    if (inboxFilter === 'all') return inboxItems;
    if (inboxFilter === 'receipt') return inboxItems.filter((item) => item.kind === 'receipt');
    if (inboxFilter === 'profile') return inboxItems.filter((item) => item.kind === 'profile');
    if (inboxFilter === 'support') return inboxItems.filter((item) => item.kind === 'support');
    return inboxItems;
  }, [inboxItems, inboxFilter]);

  useEffect(() => {
    const validKeys = new Set(inboxItems.map((item) => draftKeyForItem(item)));
    setFollowUpDrafts((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validKeys.has(key)) next[key] = value;
      });
      return next;
    });
    setFollowUpBusy((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validKeys.has(key)) next[key] = value;
      });
      return next;
    });
    setExpandedHistory((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validKeys.has(key)) next[key] = value;
      });
      return next;
    });
  }, [inboxItems]);

  useEffect(() => {
    if (!searchToolOpen) return () => {};

    const onDocMouseDown = (event) => {
      if (!searchToolRef.current?.contains(event.target)) {
        setSearchToolOpen(false);
      }
    };

    const onEscape = (event) => {
      if (event.key === 'Escape') {
        setSearchToolOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [searchToolOpen]);

  const updateSearchToolMenuPosition = useCallback(() => {
    if (!searchToolOpen || !searchToolButtonRef.current || typeof window === 'undefined') return;

    const triggerRect = searchToolButtonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 720;
    const edgeGap = 10;
    const width = Math.min(720, Math.max(300, viewportWidth - edgeGap * 2));

    let left = triggerRect.right - width;
    if (left < edgeGap) left = edgeGap;
    const maxLeft = viewportWidth - width - edgeGap;
    if (left > maxLeft) left = maxLeft;

    let top = triggerRect.bottom + 10;
    let maxHeight = Math.min(620, Math.floor(viewportHeight - top - edgeGap));

    if (maxHeight < 240) {
      const aboveSpace = Math.floor(triggerRect.top - edgeGap - 10);
      if (aboveSpace > 240) {
        maxHeight = Math.min(620, aboveSpace);
        top = Math.max(edgeGap, triggerRect.top - maxHeight - 10);
      } else {
        maxHeight = Math.max(220, Math.floor(viewportHeight - top - edgeGap));
      }
    }

    setSearchToolMenuStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${Math.max(220, maxHeight)}px`
    });
  }, [searchToolOpen]);

  useEffect(() => {
    if (!searchToolOpen) return () => {};
    updateSearchToolMenuPosition();
    const focusTimer = window.setTimeout(() => {
      searchToolInputRef.current?.focus();
      searchToolInputRef.current?.select();
    }, 0);

    const onWindowChange = () => updateSearchToolMenuPosition();
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
    };
  }, [searchToolOpen, updateSearchToolMenuPosition]);

  useEffect(() => {
    if (!canViewReports) return () => {};
    const onHotkey = (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'k') {
        event.preventDefault();
        setSearchToolOpen(true);
      }
    };
    document.addEventListener('keydown', onHotkey);
    return () => document.removeEventListener('keydown', onHotkey);
  }, [canViewReports]);

  const runSearch = async () => {
    if (!canViewReports) {
      setSearchMessage('\u062F\u0633\u062A\u0631\u0633\u06CC \u062C\u0633\u062A\u062C\u0648\u06CC \u0633\u0631\u0627\u0633\u0631\u06CC \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0646\u0642\u0634 \u0633\u0627\u0632\u0645\u0627\u0646\u06CC \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A.');
      return;
    }
    const q = String(searchQ || '').trim();
    if (!q) {
      setSearchResults(emptySearchResults);
      setSearchMessage('');
      return;
    }
    setSearching(true);
    setSearchMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/search?q=${encodeURIComponent(q)}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setSearchMessage(data?.message || 'جستجو ناموفق بود');
        return;
      }
      setSearchResults({
        users: data.users || [],
        orders: data.orders || [],
        financeBills: data.financeBills || [],
        financeReceipts: data.financeReceipts || [],
        courses: data.courses || [],
        schedules: data.schedules || [],
        homework: data.homework || [],
        grades: data.grades || [],
        subjects: data.subjects || [],
        requests: data.requests || [],
        accessRequests: data.accessRequests || [],
        contacts: data.contacts || [],
        news: data.news || [],
        logs: data.logs || [],
        enrollments: data.enrollments || [],
        settings: data.settings || []
      });
    } catch {
      setSearchMessage('خطا در جستجوی سراسری');
    } finally {
      setSearching(false);
    }
  };

  const onSearchToolSubmit = () => {
    runSearch();
  };

  const renderHighlightedSearchText = (value) => {
    const text = String(value || '').trim();
    if (!text) return '---';
    const query = String(searchQ || '').trim();
    if (!query) return text;

    const safeQuery = escapeRegExp(query);
    if (!safeQuery) return text;
    const regex = new RegExp(`(${safeQuery})`, 'ig');
    const parts = text.split(regex);
    const queryLower = query.toLowerCase();

    return parts.map((part, index) => (
      part.toLowerCase() === queryLower
        ? <mark key={`hl-${index}`}>{part}</mark>
        : <React.Fragment key={`hl-${index}`}>{part}</React.Fragment>
    ));
  };

  const logClientActivity = async (action, context = '') => {
    try {
      await fetch(`${API_BASE}/api/admin/client-activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action, context })
      });
    } catch {
      // no-op: client log should not block UI action
    }
  };

  const buildAccessMatrixRows = () => {
    const now = new Date();
    const reportDate = Number.isNaN(now.getTime()) ? '' : now.toLocaleString('fa-AF-u-ca-persian');
    const currentLevelLabel = ADMIN_LEVEL_LABELS[adminLevel] || adminLevel;
    const currentPermissions = PERMISSION_ORDER
      .filter((permission) => effectivePermissions.includes(permission))
      .map((permission) => PERMISSION_LABELS[permission])
      .join(' | ');

    const rows = [
      ['گزارش ماتریس دسترسی مدیریتی'],
      ['تاریخ گزارش', reportDate],
      ['نام کاربر', user?.name || getName()],
      ['\u0646\u0642\u0634 \u0633\u0627\u0632\u0645\u0627\u0646\u06CC \u0641\u0639\u0627\u0644', currentLevelLabel],
      ['مجوزهای فعال', currentPermissions || 'بدون مجوز ویژه'],
      [],
      ['\u0646\u0642\u0634 \u0633\u0627\u0632\u0645\u0627\u0646\u06CC', ...PERMISSION_ORDER.map((permission) => PERMISSION_LABELS[permission])]
    ];

    ADMIN_LEVEL_PERMISSION_MATRIX.forEach((item) => {
      rows.push([
        ADMIN_LEVEL_LABELS[item.level] || item.level,
        ...PERMISSION_ORDER.map((permission) => (item.permissions.includes(permission) ? 'دارد' : 'ندارد'))
      ]);
    });

    rows.push([]);
    rows.push(['میانبر مدیریتی', 'نیازمند', 'وضعیت برای این حساب']);
    quickLinkItems.forEach((item) => {
      rows.push([
        item.label,
        getQuickLinkPermissionLabel(item.permission),
        getQuickLinkStatusLabel(item, effectivePermissions)
      ]);
    });

    if (rows[0]) rows[0][0] = 'گزارش ماتریس دسترسی مدیریتی';
    if (rows[1]) rows[1][0] = 'تاریخ گزارش';
    if (rows[2]) rows[2][0] = 'نام کاربر';
    if (rows[3]) rows[3][0] = 'نقش سازمانی فعال';
    if (rows[4]) rows[4][0] = 'مجوزهای فعال';
    if (rows[6]) rows[6][0] = 'نقش سازمانی';
    ADMIN_LEVEL_PERMISSION_MATRIX.forEach((item, index) => {
      rows[7 + index] = [
        ADMIN_LEVEL_LABELS[item.level] || item.level,
        ...PERMISSION_ORDER.map((permission) => (item.permissions.includes(permission) ? 'دارد' : 'ندارد'))
      ];
    });
    rows[7 + ADMIN_LEVEL_PERMISSION_MATRIX.length + 1] = ['میانبر مدیریتی', 'نیازمند', 'وضعیت برای این حساب'];

    return rows;
  };

  const exportAccessMatrixCsv = () => {
    try {
      const rows = buildAccessMatrixRows();
      const csv = rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(',')).join('\n');
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'admin-access-matrix.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      logClientActivity('admin_access_matrix_export_csv', 'admin_panel');
      if (canViewReports) {
        setTimeout(() => {
          loadReportActivities();
        }, 220);
      }
    } catch {
      setSearchMessage('خطا در تولید خروجی CSV ماتریس دسترسی');
    }
  };

  const printAccessMatrixReport = () => {
    const currentLevelLabel = ADMIN_LEVEL_LABELS[adminLevel] || adminLevel;
    const currentPermissions = PERMISSION_ORDER
      .filter((permission) => effectivePermissions.includes(permission))
      .map((permission) => PERMISSION_LABELS[permission])
      .join('، ') || 'بدون مجوز ویژه';
    const reportDate = new Date().toLocaleString('fa-AF-u-ca-persian');

    const normalizedCurrentPermissions = PERMISSION_ORDER
      .filter((permission) => effectivePermissions.includes(permission))
      .map((permission) => PERMISSION_LABELS[permission])
      .join('، ') || 'بدون مجوز ویژه';
    const normalizedHeaderCells = PERMISSION_ORDER
      .map((permission) => `<th>${escapeHtml(PERMISSION_LABELS[permission])}</th>`)
      .join('');
    const normalizedMatrixRows = ADMIN_LEVEL_PERMISSION_MATRIX.map((item) => {
      const cells = PERMISSION_ORDER
        .map((permission) => `<td>${item.permissions.includes(permission) ? 'دارد' : '—'}</td>`)
        .join('');
      const rowClass = item.level === adminLevel ? 'current' : '';
      return `<tr class="${rowClass}"><td>${escapeHtml(ADMIN_LEVEL_LABELS[item.level] || item.level)}</td>${cells}</tr>`;
    }).join('');
    const normalizedLinksRows = quickLinkItems.map((item) => (
      `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(getQuickLinkPermissionLabel(item.permission))}</td><td>${escapeHtml(getQuickLinkStatusLabel(item, effectivePermissions))}</td></tr>`
    )).join('');

    const normalizedHtml = `
      <!doctype html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>گزارش ماتریس دسترسی مدیریتی</title>
        <style>
          body { font-family: Tahoma, Arial, sans-serif; color: #0f172a; margin: 20px; }
          h1 { font-size: 20px; margin: 0 0 10px; }
          .meta { margin: 0 0 12px; font-size: 13px; line-height: 1.9; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: center; font-size: 12px; }
          th { background: #e2e8f0; }
          tr.current td { background: #dbeafe; font-weight: 700; }
          .section { margin-top: 16px; }
        </style>
      </head>
      <body>
        <h1>گزارش ماتریس دسترسی مدیریتی</h1>
        <div class="meta">
          <div>نام کاربر: ${escapeHtml(user?.name || getName())}</div>
          <div>نقش سازمانی فعال: ${escapeHtml(currentLevelLabel)}</div>
          <div>تاریخ گزارش: ${escapeHtml(reportDate)}</div>
          <div>مجوزهای فعال: ${escapeHtml(normalizedCurrentPermissions)}</div>
        </div>
        <div class="section">
          <table>
            <thead>
              <tr>
                <th>نقش سازمانی</th>
                ${normalizedHeaderCells}
              </tr>
            </thead>
            <tbody>
              ${normalizedMatrixRows}
            </tbody>
          </table>
        </div>
        <div class="section">
          <table>
            <thead>
              <tr>
                <th>میانبر مدیریتی</th>
                <th>نیازمند</th>
                <th>وضعیت برای این حساب</th>
              </tr>
            </thead>
            <tbody>
              ${normalizedLinksRows}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    const normalizedPopup = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
    if (!normalizedPopup) {
      setSearchMessage('لطفاً اجازه بازشدن پنجره چاپ را بدهید.');
      return;
    }

    normalizedPopup.document.open();
    normalizedPopup.document.write(normalizedHtml);
    normalizedPopup.document.close();
    normalizedPopup.focus();
    setTimeout(() => normalizedPopup.print(), 180);
    logClientActivity('admin_access_matrix_print', 'admin_panel');
    if (canViewReports) {
      setTimeout(() => {
        loadReportActivities();
      }, 250);
    }
    return;

  };

  const executiveSummary = adminDashboard?.summary || {
    totalStudents: stats.users,
    totalInstructors: 0,
    totalRevenue: 0,
    totalDue: 0,
    outstandingAmount: 0,
    attendanceRate: 0,
    todayPayments: stats.todayPayments,
    pendingFinanceReviews: orders.length,
    pendingProfileRequests: profileRequests.length,
    pendingAccessRequests: 0,
    monthlyRevenue: 0,
    previousMonthRevenue: 0,
    monthDeltaPercent: 0
  };

  const executiveQuickActions = [
    ...(canManageEnrollments ? [{ to: '/admin-enrollments', label: 'ثبت‌نام‌ها', caption: 'بررسی و تایید درخواست‌ها', tone: 'mint' }] : []),
    ...(canManageMemberships ? [{ to: '/admin-education?section=enrollments', label: 'ممبرشیپ آموزشی', caption: 'وصل شاگرد به صنف', tone: 'mint' }] : []),
    ...(canViewSchedule ? [{ to: canManageSchedule ? ADMIN_SCHEDULE_ROUTE : ADMIN_SCHEDULE_VIEW_ROUTE, label: 'تقسیم اوقات', caption: canManageSchedule ? 'ویرایش و نشر برنامه' : 'مشاهده برنامه رسمی', tone: 'slate' }] : []),
    ...(canManageFinance ? [{ to: '/admin-finance', label: 'مرکز مالی', caption: 'پرداخت و صندوق', tone: 'copper' }] : []),
    ...(canManageFinance ? [{ to: '/admin-government-finance', label: 'مالی دولت', caption: 'گزارش و آرشیف رسمی', tone: 'teal' }] : []),
    ...(canManageContent ? [{ to: '/admin-education', label: 'مرکز آموزش', caption: 'سال تعلیمی، صنف و مضمون', tone: 'mint' }] : []),
    ...(canManageContent ? [{ to: '/admin-exams-dashboard', label: 'داشبورد امتحانات', caption: 'جلسه‌ها و نتیجه‌ها', tone: 'slate' }] : []),
    ...(canViewReports ? [{ to: '/admin-reports', label: 'گزارش‌ها', caption: 'خروجی و تحلیل', tone: 'teal' }] : [])
  ];

  const executiveTasks = (adminDashboard?.tasks || []).map((item) => ({
    id: item.id,
    title: item.label,
    subtitle: item.meta
  }));

  const executiveAlerts = (adminDashboard?.alerts || []).map((item) => ({
    id: item.id,
    title: item.label,
    subtitle: item.meta
  }));

  const zeroSignalValues = useMemo(() => ([
    Number(executiveSummary.pendingFinanceReviews || 0),
    Number(executiveSummary.pendingAccessRequests || 0),
    Number(executiveSummary.pendingProfileRequests || 0),
    Number(stats.pendingOrders || 0)
  ]), [
    executiveSummary.pendingAccessRequests,
    executiveSummary.pendingFinanceReviews,
    executiveSummary.pendingProfileRequests,
    stats.pendingOrders
  ]);

  const showExecutiveZeroWarning = useMemo(() => {
    if (!canViewReports) return false;
    if (Number(executiveSummary.totalStudents || 0) <= 0) return false;
    const zeroCount = zeroSignalValues.filter((value) => value === 0).length;
    return zeroCount >= 3;
  }, [canViewReports, executiveSummary.totalStudents, zeroSignalValues]);

  return (
    <section className="admin-page">
      <div className="card-back">
        <button type="button" onClick={() => window.history.back()}>بازگشت</button>
      </div>

      <div className="admin-hero">
        <div className="admin-hero-copy">
          <div hidden aria-hidden="true" className={`admin-api-health admin-api-health--${apiHealth.status}`}>
            <div className="admin-api-health__head">
              <span className="admin-api-health__title">ÙˆØ¶Ø¹ÛŒØª Ø³Ø±ÙˆØ±</span>
              <span className="admin-api-health__state">
                <span className="admin-api-health__dot" aria-hidden="true" />
                {apiHealthStatusLabel}
              </span>
            </div>
            <div className="admin-api-health__meta">
              {apiHealth.latencyMs != null ? <span>{`ØªØ£Ø®ÛŒØ±: ${apiHealth.latencyMs} ms`}</span> : <span>Ø§ØªØµØ§Ù„ Ø¯Ø± Ø­Ø§Ù„ Ø¨Ø±Ø±Ø³ÛŒ Ø§Ø³Øª.</span>}
              {!!apiHealthCheckedLabel && <span>{`Ø¢Ø®Ø±ÛŒÙ† Ø¨Ø±Ø±Ø³ÛŒ: ${apiHealthCheckedLabel}`}</span>}
            </div>
            <button
              type="button"
              className="admin-api-health__refresh"
              onClick={runApiHealthCheck}
              disabled={apiHealthLoading}
            >
              {apiHealthLoading ? 'Ø¯Ø± Ø­Ø§Ù„ Ø¨Ø±Ø±Ø³ÛŒ...' : 'Ø¨Ø§Ø²Ø¨ÛŒÙ†ÛŒ'}
            </button>
          </div>
          <p className="admin-hero-subtitle">{'\u0645\u0631\u06a9\u0632 \u0641\u0631\u0645\u0627\u0646\u062f\u0647\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a \u0648 \u062a\u0635\u0645\u06cc\u0645\u200c\u06af\u06cc\u0631\u06cc \u0631\u0648\u0632\u0627\u0646\u0647.'}</p>
          <h2>خوش آمدید، {user?.name || getName()}</h2>
          <p>مدیریت کاربران، مالی، محتوا و تقسیم اوقات.</p>
          {user?.subject && <p>مسوولیت‌ها: {user.subject}</p>}
          {user?.grade && <p>سمت: {user.grade}</p>}
          <p>{'\u0646\u0642\u0634 \u0633\u0627\u0632\u0645\u0627\u0646\u06cc \u0641\u0639\u0627\u0644'}: {ADMIN_LEVEL_LABELS[adminLevel] || adminLevel}</p>
          {lastLogin && <p>آخرین ورود: {lastLogin}</p>}
          <div className={`admin-api-health admin-api-health--${apiHealth.status}`}>
            <div className="admin-api-health__head">
              <span className="admin-api-health__title">وضعیت سرور</span>
              <span className="admin-api-health__state">
                <span className="admin-api-health__dot" aria-hidden="true" />
                {apiHealthStatusLabel}
              </span>
            </div>
            <div className="admin-api-health__meta">
              {apiHealth.latencyMs != null ? <span>{`تأخیر: ${apiHealth.latencyMs} ms`}</span> : <span>اتصال در حال بررسی است.</span>}
              {!!apiHealthCheckedLabel && <span>{`آخرین بررسی: ${apiHealthCheckedLabel}`}</span>}
            </div>
            <button
              type="button"
              className="admin-api-health__refresh"
              onClick={runApiHealthCheck}
              disabled={apiHealthLoading}
            >
              {apiHealthLoading ? 'در حال بررسی...' : 'بازبینی'}
            </button>
          </div>
        </div>
        <div className="admin-hero-side">
          <div className={`admin-hero-meta${heroMetaItems.length === 2 ? ' admin-hero-meta--duo' : ''}`} aria-label="\u062e\u0644\u0627\u0635\u0647 \u0645\u062f\u06cc\u0631\u06cc\u062a">
            {heroMetaItems.map((item) => (
              <div key={item.key} className="admin-hero-meta-card">
                <span className="admin-hero-meta-label">{item.label}</span>
                <strong className="admin-hero-meta-value">{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="admin-hero-actions">
          <div className="admin-topbar-tools">
            {canViewReports && (
              <div className={`admin-dropdown admin-search-tool ${searchToolOpen ? 'open' : ''}`} ref={searchToolRef}>
                <button
                  type="button"
                  ref={searchToolButtonRef}
                  className="admin-search-tool-btn"
                  onClick={() => setSearchToolOpen((prev) => !prev)}
                  aria-expanded={searchToolOpen}
                  aria-label="جستجوی سراسری"
                >
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <span>جستجوی سراسری</span>
                </button>
                {searchToolOpen && (
                  <div className="admin-dropdown-menu admin-search-tool-menu" style={searchToolMenuStyle}>
                    <div className="admin-search-row admin-search-row--toolbar">
                      <input
                        ref={searchToolInputRef}
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            onSearchToolSubmit();
                          }
                        }}
                        placeholder="نام، ایمیل، پیام، خبر..."
                      />
                      <button type="button" className="admin-btn" onClick={onSearchToolSubmit}>
                        {searching ? 'در حال جستجو...' : 'جستجو'}
                      </button>
                    </div>
                    {searchMessage && <div className="admin-empty">{searchMessage}</div>}
                    {!!searchQ.trim() && !searchMessage && (
                      <div className="admin-search-results admin-search-results--toolbar">
                        {!totalSearchHits && (
                          <div className="admin-empty">برای این جستجو نتیجه‌ای پیدا نشد.</div>
                        )}
                        {!!totalSearchHits && searchSections.map((section) => (
                          <div key={section.key} className="admin-search-group">
                            <h4>{section.title} ({section.count})</h4>
                            {section.items.slice(0, 4).map((item, index) => {
                              const itemKey = item?._id || item?.id || `${section.key}-${index}`;
                              const itemLink = section.to(item);
                              const primary = section.primary(item);
                              const secondary = section.secondary(item);
                              return (
                                <Link
                                  key={itemKey}
                                  className="admin-search-item"
                                  to={itemLink}
                                  onClick={() => setSearchToolOpen(false)}
                                >
                                  <strong>{renderHighlightedSearchText(primary)}</strong>
                                  {!!secondary && <span>{renderHighlightedSearchText(secondary)}</span>}
                                </Link>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <NotificationBell apiBase={API_BASE} panelPath="/admin-notifications" showLabel title="اعلان‌ها" />
            <div className="admin-dropdown admin-account-dropdown">
              <button type="button" className="admin-account-btn">
                {accountAvatarSrc ? (
                  <img className="admin-account-avatar" src={accountAvatarSrc} alt={accountName} />
                ) : (
                  <span className="admin-account-avatar admin-account-avatar--fallback" aria-hidden="true">{accountInitial}</span>
                )}
                <span className="admin-account-meta">
                  <strong>{accountName}</strong>
                  <small>{currentLevelLabel}</small>
                </span>
                <span className="admin-account-caret" aria-hidden="true">▾</span>
              </button>
              <div className="admin-dropdown-menu admin-account-menu">
                <Link to="/profile">پروفایل من</Link>
                <Link to="/profile#password">تنظیمات حساب</Link>
                <Link to="/admin-notifications">اعلان‌ها</Link>
                {canViewReports && <Link to="/admin-reports">گزارش‌ها</Link>}
                <button type="button" onClick={logout}>خروج</button>
              </div>
            </div>
          </div>
          <div className="admin-main-actions admin-main-actions--modern">
            {heroPrimaryActions.map((item) => (
              item.to ? (
                <Link key={item.key} className="admin-btn" to={item.to}>{item.label}</Link>
              ) : (
                <button key={item.key} type="button" className="admin-btn" onClick={item.onClick} title={item.title || item.label}>
                  {item.label}
                </button>
              )
            ))}
            {!!heroSecondaryActions.length && (
              <div className="admin-dropdown admin-actions-more">
                <button type="button" className="admin-btn admin-btn--more">
                  بیشتر
                  <span className="admin-account-caret" aria-hidden="true">▾</span>
                </button>
                <div className="admin-dropdown-menu admin-actions-menu">
                  {heroSecondaryActions.map((item) => (
                    item.to ? (
                      <Link key={item.key} to={item.to}>{item.label}</Link>
                    ) : (
                      <button key={item.key} type="button" onClick={item.onClick}>{item.label}</button>
                    )
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="admin-main-actions admin-main-actions--legacy" hidden aria-hidden="true">
            {canManageUsers && <Link className="admin-btn" to="/admin-users">مدیریت کاربران</Link>}
            {canManageFinance && <Link className="admin-btn" to="/admin-finance">مرکز مالی</Link>}
            {canManageFinance && <Link className="admin-btn" to="/admin-government-finance">فرماندهی مالی دولت</Link>}
            {canManageContent && <Link className="admin-btn" to="/admin-education">مرکز مدیریت آموزش</Link>}
            {canManageContent && <Link className="admin-btn" to="/admin-settings">تنظیمات سایت</Link>}
          </div>
          <div className="admin-main-actions admin-main-actions--legacy" hidden aria-hidden="true">
            {canManageUsers && <Link className="admin-btn" to="/admin-users">مدیریت کاربران</Link>}
            {canManageFinance && <Link className="admin-btn" to="/admin-finance">مرکز مالی</Link>}
            {canManageFinance && <Link className="admin-btn ghost" to="/admin-government-finance">فرماندهی مالی دولت</Link>}
            {canManageContent && <Link className="admin-btn ghost" to="/admin-education">مرکز مدیریت آموزش</Link>}
            {canManageContent && <Link className="admin-btn ghost" to="/admin-settings">تنظیمات سایت</Link>}
            <button type="button" className="admin-btn danger" onClick={logout}>خروج</button>
          </div>
          </div>
        </div>
      </div>

      {canViewReports && (
        <div className="admin-executive-strip">
          <div className="admin-executive-strip__head">
            <div>
              <h3>نمای اجرایی مدیریت</h3>
              <p>
                شاخص‌های کلیدی، روند عواید و مهم‌ترین کارهای مدیریتی را در یک نگاه ببینید.
              </p>
              {showExecutiveZeroWarning && (
                <div className="admin-executive-strip__warning" role="status">
                  چند شاخص کلیدی به‌صورت همزمان صفر است؛ در صورت انتظار داشتن داده، لطفاً منابع مالی/پروفایل/دسترسی را بازبینی کنید.
                </div>
              )}
            </div>
            <div className="admin-executive-strip__note">
              {adminDashboard?.generatedAt ? `آخرین بروزرسانی: ${toDateTime(adminDashboard.generatedAt)}` : 'این بخش از لایه تجمیع داشبورد خوانده می‌شود.'}
            </div>
          </div>

          <div className="admin-executive-strip__grid">
            <KpiRingCard
              label="کل شاگردان"
              value={Number(executiveSummary.totalStudents || 0).toLocaleString('fa-AF-u-ca-persian')}
              hint={`${Number(executiveSummary.totalInstructors || 0).toLocaleString('fa-AF-u-ca-persian')} استاد فعال`}
              progress={Math.min(100, Number(executiveSummary.totalStudents || 0) / 5)}
              tone="teal"
            />
            <KpiRingCard
              label="عواید این ماه"
              value={Number(executiveSummary.monthlyRevenue || 0).toLocaleString('fa-AF-u-ca-persian')}
              hint={`${Number(executiveSummary.monthDeltaPercent || 0).toLocaleString('fa-AF-u-ca-persian')}% نسبت به ماه قبل`}
              progress={(Number(executiveSummary.totalDue || 0) || Number(executiveSummary.monthlyRevenue || 0))
                ? Math.min(100, (Number(executiveSummary.monthlyRevenue || 0) / Math.max(Number(executiveSummary.totalDue || 0), Number(executiveSummary.monthlyRevenue || 0), 1)) * 100)
                : 0}
              tone="copper"
            />
            <KpiRingCard
              label="حضور عمومی"
              value={`${Number(executiveSummary.attendanceRate || 0).toLocaleString('fa-AF-u-ca-persian')}%`}
              hint={`${Number(executiveSummary.todayPayments || 0).toLocaleString('fa-AF-u-ca-persian')} پرداخت امروز`}
              progress={executiveSummary.attendanceRate}
              tone="mint"
            />
            <KpiRingCard
              label="بدهی باز"
              value={Number(executiveSummary.outstandingAmount || 0).toLocaleString('fa-AF-u-ca-persian')}
              hint={`${Number(executiveSummary.pendingFinanceReviews || 0).toLocaleString('fa-AF-u-ca-persian')} رسید در انتظار`}
              progress={Number(executiveSummary.totalDue || 0)
                ? Math.min(100, (Number(executiveSummary.outstandingAmount || 0) / Math.max(Number(executiveSummary.totalDue || 0), 1)) * 100)
                : 0}
              tone="rose"
            />
          </div>

          <div className="admin-executive-strip__quick">
            <QuickActionRail actions={executiveQuickActions} />
          </div>

          <div className="admin-executive-strip__panels">
            <TaskAlertPanel
              hideHead
              title="کارهای مدیریتی"
              subtitle="مهم‌ترین صف‌های امروز"
              items={executiveTasks}
              emptyText="مورد فوری تازه‌ای برای مدیریت دیده نشد."
            />
            <TaskAlertPanel
              hideHead
              title="هشدارهای کلیدی"
              subtitle="مواردی که نیاز به پیگیری دارند"
              items={executiveAlerts}
              emptyText="هشدار فعالی برای این لحظه دیده نشد."
            />
            <TrendBars
              title="روند عواید"
              subtitle="در شش ماه اخیر"
              items={adminDashboard?.revenueTrend || []}
              valueFormatter={(value) => `${Number(value || 0).toLocaleString('fa-AF-u-ca-persian')} AFN`}
            />
            <TrendBars
              title="رشد شاگردان"
              subtitle="ثبت عضویت در ماه‌های اخیر"
              items={adminDashboard?.studentGrowth || []}
              valueFormatter={(value) => `${Number(value || 0).toLocaleString('fa-AF-u-ca-persian')} عضویت`}
            />
          </div>
        </div>
      )}

      {canViewReports ? (
        <div className="admin-stats">
          <div>
            <span>کاربران فعال</span>
            <strong>{stats.users}</strong>
          </div>
          <div>
            <span>صنف‌های ثبت شده</span>
            <strong>{stats.courses}</strong>
          </div>
          <div>
            <span>پرداخت‌های امروز</span>
            <strong>{stats.todayPayments}</strong>
          </div>
          <div>
            <span>رسیدهای در انتظار</span>
            <strong>{stats.pendingOrders}</strong>
          </div>
        </div>
      ) : (
        <div className="admin-access-note">
          برای مشاهده آمار مدیریتی، نیاز به مجوز «مشاهده گزارشات» دارید.
        </div>
      )}

      {false && canManageContent && (
        <div className="admin-activity">
          <div className="admin-activity-head">
            <h3>مرکز مدیریت آموزش</h3>
            <Link className="admin-btn ghost" to="/admin-education">باز کردن بخش آموزش</Link>
          </div>
          <div className="admin-empty">
            سال تعلیمی، صنف‌ها، مضمون‌ها، تقسیم مضمون به استاد و ثبت‌نام متعلمین را از همین بخش به‌صورت متمرکز مدیریت کنید.
          </div>
        </div>
      )}

      <div className="admin-access-matrix" hidden>
        <div className="admin-activity-head">
          <div className="admin-matrix-actions">
            <button type="button" className="ghost" onClick={printAccessMatrixReport}>چاپ گزارش</button>
            <button type="button" className="ghost" onClick={exportAccessMatrixCsv}>خروجی CSV</button>
          </div>
          <h3>ماتریس دسترسی مدیریتی</h3>
        </div>
        <div className="admin-level-summary">
          <span className="admin-level-pill">{ADMIN_LEVEL_LABELS[adminLevel] || adminLevel}</span>
          <span className="admin-level-note">مجوزهای فعال شما: {effectivePermissions.length}</span>
        </div>
        <div className="admin-level-note">این نمایش بر اساس نقش سازمانی نهایی فاز 1 محاسبه می‌شود.</div>
        <div className="admin-permission-chips">
          {PERMISSION_ORDER.map((permission) => (
            <span
              key={permission}
              className={`admin-permission-chip ${effectivePermissions.includes(permission) ? 'on' : 'off'}`}
            >
              {PERMISSION_LABELS[permission]}
            </span>
          ))}
        </div>
        <div className="admin-matrix-grid">
          <div className="admin-matrix-row admin-matrix-head">
            <span>{'\u0646\u0642\u0634 \u0633\u0627\u0632\u0645\u0627\u0646\u06cc'}</span>
            {PERMISSION_ORDER.map((permission) => (
              <span key={`head-${permission}`}>{PERMISSION_LABELS[permission]}</span>
            ))}
          </div>
          {ADMIN_LEVEL_PERMISSION_MATRIX.map((item) => (
            <div key={item.level} className={`admin-matrix-row ${item.level === adminLevel ? 'is-current' : ''}`}>
              <span className="admin-matrix-level">{ADMIN_LEVEL_LABELS[item.level]}</span>
              {PERMISSION_ORDER.map((permission) => (
                <span
                  key={`${item.level}-${permission}`}
                  className={`admin-matrix-cell ${item.permissions.includes(permission) ? 'enabled' : 'disabled'}`}
                >
                  {item.permissions.includes(permission) ? 'دارد' : '—'}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {(!!visibleActionItems.length || canViewReports) && (
        <div className="admin-action-strip">
          {visibleActionItems.map((item) => (
            <a key={item.href} className={`admin-chip ${item.tone}`} href={item.href}>{item.label}</a>
          ))}
          {canViewReports && (
            <>
              <button type="button" className="admin-chip slate" onClick={printAccessMatrixReport}>چاپ ماتریس دسترسی</button>
              <button type="button" className="admin-chip info" onClick={exportAccessMatrixCsv}>خروجی CSV دسترسی</button>
            </>
          )}
        </div>
      )}
      {canViewReports && (
        <div className="admin-report-audit">
          <div className="admin-activity-head">
            <h3>{'گزارش خروجی‌های اخیر'}</h3>
            <button type="button" className="ghost" onClick={loadReportActivities}>{'بروزرسانی'}</button>
          </div>
          {!reportActivityItems.length && (
            <div className="admin-empty">{'گزارش جدیدی ثبت نشده است.'}</div>
          )}
          {!!reportActivityItems.length && (
            <div className="admin-activity-list">
              {reportActivityItems.map((item) => (
                <div key={item._id} className="admin-activity-item">
                  <span>{reportActionLabel(item.action)}</span>
                  <span>
                    {(item.actor && item.actor.name ? item.actor.name : 'ادمین')}
                    {' | '}
                    {toDateTime(item.createdAt)}
                    {item.meta?.context ? ` | ${item.meta.context}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canViewReports && (
        <div className="admin-workflow-report">
          <div className="admin-activity-head">
            <h3>{'گزارش عملکرد سطوح مدیریتی'}</h3>
            <div className="admin-workflow-actions">
              <select
                value={workflowTypeFilter}
                onChange={(e) => setWorkflowTypeFilter(e.target.value)}
                aria-label="workflow-type"
              >
                {WORKFLOW_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button type="button" className="ghost" onClick={exportWorkflowReportCsv}>{'خروجی CSV'}</button>
              <button type="button" className="ghost" onClick={loadWorkflowReport}>{'بروزرسانی'}</button>
            </div>
          </div>
          {workflowMessage && <div className="admin-empty">{workflowMessage}</div>}
          {!workflowMessage && (
            <>
              <div className="admin-workflow-grid">
                {FOLLOW_UP_LEVEL_OPTIONS.map((level) => {
                  const row = workflowReport?.levels?.[level.value] || { assigned: 0, open: 0, resolved: 0 };
                  return (
                    <div key={level.value} className="admin-workflow-card">
                      <h4>{level.label}</h4>
                      <div><span>{'دریافتی'}</span><strong>{Number(row.assigned || 0).toLocaleString('fa-AF-u-ca-persian')}</strong></div>
                      <div><span>{'باز'}</span><strong>{Number(row.open || 0).toLocaleString('fa-AF-u-ca-persian')}</strong></div>
                      <div><span>{'تکمیل‌شده'}</span><strong>{Number(row.resolved || 0).toLocaleString('fa-AF-u-ca-persian')}</strong></div>
                    </div>
                  );
                })}
              </div>
              <div className="admin-workflow-total">
                <span>{'جمع کل ارجاع‌ها'}</span>
                <strong>{Number(workflowReport?.totals?.assigned || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
                <span>{'مورد باز'}</span>
                <strong>{Number(workflowReport?.totals?.open || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
                <span>{'مورد تکمیل‌شده'}</span>
                <strong>{Number(workflowReport?.totals?.resolved || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
              </div>
              {!!workflowReport?.breakdown?.length && (
                <div className="admin-workflow-breakdown">
                  <h4>{'تفکیک نوع / سطح / وضعیت'}</h4>
                  <div className="admin-workflow-breakdown-grid">
                    {workflowReport.breakdown.map((entry, index) => (
                      <div
                        key={`breakdown-${entry.type}-${entry.level}-${entry.status}-${index}`}
                        className="admin-workflow-breakdown-item"
                      >
                        <span>{WORKFLOW_TYPE_LABELS[entry.type] || entry.type || '---'}</span>
                        <span>{FOLLOW_UP_LEVEL_LABELS[entry.level] || entry.level || '---'}</span>
                        <span>{FOLLOW_UP_STATUS_LABELS[entry.status] || entry.status || '---'}</span>
                        <strong>{Number(entry.count || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {(canManageFinance || canManageUsers || canManageContent) && (
        <div className="admin-inbox">
          <div className="admin-activity-head">
            <h3>صندوق رسیدگی سریع</h3>
            <button type="button" className="ghost" onClick={refreshAdminInbox}>بروزرسانی</button>
          </div>
          <div className="admin-inbox-summary">
            {canManageFinance && (
              <span className="admin-inbox-chip high">رسیدهای معطل: {inboxCounts.receipts}</span>
            )}
            {canManageUsers && (
              <span className="admin-inbox-chip medium">درخواست تغییر مشخصات: {inboxCounts.profileRequests}</span>
            )}
            {canManageContent && (
              <span className="admin-inbox-chip low">پیام‌های پشتیبانی: {inboxCounts.supportMessages}</span>
            )}
          </div>
          <div className="admin-inbox-filters">
            <button
              type="button"
              className={inboxFilter === 'all' ? 'active' : ''}
              onClick={() => setInboxFilter('all')}
            >
              همه ({inboxItems.length})
            </button>
            {canManageFinance && (
              <button
                type="button"
                className={inboxFilter === 'receipt' ? 'active' : ''}
                onClick={() => setInboxFilter('receipt')}
              >
                رسیدها ({inboxCounts.receipts})
              </button>
            )}
            {canManageUsers && (
              <button
                type="button"
                className={inboxFilter === 'profile' ? 'active' : ''}
                onClick={() => setInboxFilter('profile')}
              >
                مشخصات ({inboxCounts.profileRequests})
              </button>
            )}
            {canManageContent && (
              <button
                type="button"
                className={inboxFilter === 'support' ? 'active' : ''}
                onClick={() => setInboxFilter('support')}
              >
                پشتیبانی ({inboxCounts.supportMessages})
              </button>
            )}
          </div>
          <div className="admin-timeline-filters">
            <select
              value={timelineStatusFilter}
              onChange={(e) => setTimelineStatusFilter(e.target.value)}
            >
              {TIMELINE_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              type="date"
              value={timelineFromDate}
              onChange={(e) => setTimelineFromDate(e.target.value)}
            />
            <input
              type="date"
              value={timelineToDate}
              onChange={(e) => setTimelineToDate(e.target.value)}
            />
            <button type="button" className="ghost" onClick={clearTimelineFilters}>پاک‌کردن فیلتر</button>
          </div>
          {(orderMessage || requestMessage || supportMessage) && (
            <div className="admin-inbox-messages">
              {orderMessage && <span>{orderMessage}</span>}
              {requestMessage && <span>{requestMessage}</span>}
              {supportMessage && <span>{supportMessage}</span>}
            </div>
          )}
          {!filteredInboxItems.length && (
            <div className="admin-empty">موردی برای رسیدگی فوری وجود ندارد.</div>
          )}
          {!!filteredInboxItems.length && (
            <div className="admin-inbox-list">
              {filteredInboxItems.map((item) => {
                const draft = getFollowUpDraft(item);
                const draftKey = draftKeyForItem(item);
                const historyEntriesRaw = Array.isArray(item.raw?.followUp?.history)
                  ? [...item.raw.followUp.history].slice(-30).reverse()
                  : [];
                const historyEntries = filterTimelineEntries(historyEntriesRaw);
                const isHistoryOpen = !!expandedHistory[draftKey];
                return (
                  <div key={`${item.kind}-${item.id}`} className={`admin-inbox-item priority-${item.priority}`}>
                    <div className="admin-inbox-main">
                      <span className="admin-inbox-type">
                        {item.kind === 'receipt' ? 'اولویت ۱ - رسید مالی' : item.kind === 'profile' ? 'اولویت ۲ - مشخصات' : 'اولویت ۳ - پشتیبانی'}
                      </span>
                      <strong>{item.title}</strong>
                      <span>{item.subtitle}</span>
                      <div className="admin-inbox-followup-meta">
                        <span>ارجاع: {FOLLOW_UP_LEVEL_LABELS[draft?.assignedLevel] || draft?.assignedLevel || '---'}</span>
                        <span>وضعیت: {FOLLOW_UP_STATUS_LABELS[draft?.status] || draft?.status || '---'}</span>
                      </div>
                      <button
                        type="button"
                        className="admin-history-toggle"
                        onClick={() => toggleHistory(draftKey)}
                      >
                        {isHistoryOpen
                          ? '\u067e\u0646\u0647\u0627\u0646\u200c\u06a9\u0631\u062f\u0646 \u062a\u0627\u0631\u06cc\u062e\u0686\u0647'
                          : `\u0646\u0645\u0627\u06cc\u0634 \u062a\u0627\u0631\u06cc\u062e\u0686\u0647 (${historyEntries.length}${hasTimelineFilters ? ` / ${historyEntriesRaw.length}` : ''})`}
                      </button>
                      {isHistoryOpen && (
                        <div className="admin-followup-timeline">
                          {!historyEntries.length && <div className="admin-empty">تاریخچه‌ای ثبت نشده است.</div>}
                          {!!historyEntries.length && historyEntries.map((entry, index) => (
                            <div key={`${draftKey}-h-${index}`} className="admin-followup-entry">
                              <span>{FOLLOW_UP_LEVEL_LABELS[entry.assignedLevel] || entry.assignedLevel || '---'}</span>
                              <span>{FOLLOW_UP_STATUS_LABELS[entry.status] || entry.status || '---'}</span>
                              <span>{entry.note ? shortText(formatWorkflowNote(entry.note), 70) : '---'}</span>
                              <span>{entry.updatedBy?.name || 'ادمین'}</span>
                              <span>{toDateTime(entry.updatedAt)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="admin-inbox-side">
                      <span className="admin-inbox-time">{toDateTime(item.createdAt)}</span>
                      <div className="admin-actions">
                        {item.kind === 'receipt' && (
                          <>
                            <Link className="admin-inbox-link" to="/admin-finance#pending-receipts">باز کردن مرکز مالی</Link>
                          </>
                        )}
                        {item.kind === 'profile' && (
                          <>
                            <button
                              type="button"
                              className="admin-approve"
                              disabled={busy[item.id]}
                              onClick={() => approveProfileRequest(item.raw)}
                            >
                              {busy[item.id] ? '...' : 'تایید'}
                            </button>
                            <button
                              type="button"
                              className="admin-reject"
                              disabled={busy[item.id]}
                              onClick={() => rejectProfileRequest(item.raw)}
                            >
                              رد
                            </button>
                            <Link className="admin-inbox-link" to="/admin-users#profile-requests">جزئیات</Link>
                          </>
                        )}
                        {item.kind === 'support' && (
                          <>
                            <button
                              type="button"
                              className="admin-approve"
                              disabled={busy[`contact:${item.id}`]}
                              onClick={() => markSupportMessageRead(item.raw)}
                            >
                              {busy[`contact:${item.id}`] ? '...' : 'خوانده شد'}
                            </button>
                            <Link className="admin-inbox-link" to="/admin-contact">باز کردن پیام‌ها</Link>
                          </>
                        )}
                      </div>
                      <div className="admin-followup-editor">
                        <select
                          value={draft?.assignedLevel || 'finance_manager'}
                          onChange={(e) => setFollowUpDraftField(item, 'assignedLevel', e.target.value)}
                        >
                          {FOLLOW_UP_LEVEL_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <select
                          value={draft?.status || 'new'}
                          onChange={(e) => setFollowUpDraftField(item, 'status', e.target.value)}
                        >
                          {FOLLOW_UP_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={draft?.note || ''}
                          onChange={(e) => setFollowUpDraftField(item, 'note', e.target.value)}
                          placeholder="یادداشت پیگیری"
                        />
                        <button
                          type="button"
                          className="admin-inbox-save"
                          disabled={followUpBusy[draftKey]}
                          onClick={() => updateFollowUp(item)}
                        >
                          {followUpBusy[draftKey] ? '...' : 'ثبت پیگیری'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="admin-columns">
        <div className="admin-activity">
          <div className="admin-activity-head">
            <h3>سیستم مجازی</h3>
          </div>
          <div className="admin-activity-list">
            {virtualItems.map((item) => (
              <Link key={item.key} className="admin-activity-item" to={item.to}>
                <span>{item.title}</span>
                <span>{item.subtitle}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="admin-activity">
          <div className="admin-activity-head">
            <h3>دسترسی سریع مدیریت</h3>
          </div>
          {!!visibleQuickLinks.length ? (
            <div className="admin-quick admin-quick-compact">
              {visibleQuickLinks.map((item) => (
                <Link key={item.to} to={item.to}>{item.label}</Link>
              ))}
              {canManageContent && !hasSheetTemplatesQuickLink && (
                <Link to="/admin-sheet-templates">مدیریت شقه‌ها</Link>
              )}
            </div>
          ) : (
            <div className="admin-empty">برای سطح دسترسی فعلی، میانبر مدیریتی فعالی وجود ندارد.</div>
          )}
        </div>
      </div>

      {canViewReports && (
        <div className="admin-alerts">
          <div className="admin-activity-head">
            <h3>هشدارهای مدیریتی</h3>
            <button type="button" className="ghost" onClick={loadAlerts}>بروزرسانی</button>
          </div>
          {!!alerts.length && (
            <div className="admin-alert-summary">
              <span className="admin-alert-chip danger">اقدام فوری: {Number(urgentAlerts.length).toLocaleString('fa-AF-u-ca-persian')}</span>
              <span className="admin-alert-chip warning">عبور از SLA: {Number(alertsOverSlaCount).toLocaleString('fa-AF-u-ca-persian')}</span>
              <span className="admin-alert-chip info">نمایش‌شده: {Number(visibleAlerts.length).toLocaleString('fa-AF-u-ca-persian')}</span>
              {!!snoozedAlertsInDomainCount && (
                <span className="admin-alert-chip muted">بی‌صدا: {Number(snoozedAlertsInDomainCount).toLocaleString('fa-AF-u-ca-persian')}</span>
              )}
            </div>
          )}
          {!!alerts.length && (
            <div className="admin-alert-toolbar">
              <select
                className="admin-alert-domain-filter"
                value={alertDomainFilter}
                aria-label="فیلتر حوزه هشدار"
                onChange={(e) => setAlertDomainFilter(e.target.value)}
              >
                {ALERT_DOMAIN_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              {!!snoozedAlertsInDomainCount && (
                <button type="button" className="ghost admin-alert-unsnooze-all" onClick={clearAllSnoozes}>
                  نمایش همه هشدارهای بی‌صدا
                </button>
              )}
            </div>
          )}
          {!visibleAlerts.length && <div className="admin-empty">هشدار فعالی برای فیلتر انتخاب‌شده وجود ندارد.</div>}
          {!!urgentAlerts.length && (
            <>
              <div className="admin-alert-subhead">نیازمند اقدام امروز</div>
              <div className="admin-activity-list">
                {urgentAlerts.map((alert) => {
                  const alertLink = ALERT_LINKS[alert.key] || '';
                  return (
                    <div key={`urgent-${alert.key}`} className={`admin-activity-item admin-alert ${alert.level || 'medium'}`}>
                      <div className="admin-alert-main">
                        <span className="admin-alert-title">{alert.title}</span>
                        <span className="admin-alert-meta">
                          مالک: {alert.owner || 'تیم مدیریت'} | قدیمی‌ترین مورد: {formatAlertAge(alert.oldestPendingMinutes)}
                        </span>
                        <span className="admin-alert-meta">
                          {alert.overSla ? 'از SLA عبور کرده' : `SLA: ${formatSlaMinutes(alert.slaMinutes)}`}
                        </span>
                      </div>
                      <div className="admin-alert-side">
                        <span className="admin-alert-count">{Number(alert.count || 0).toLocaleString('fa-AF-u-ca-persian')}</span>
                        <span className={`admin-alert-trend ${alert.trendDirection || 'steady'}`}>
                          {getAlertTrendLabel(alert)}
                        </span>
                        {resolveAlertSnoozeDuration(alert) > 0 && (
                          <button type="button" className="admin-alert-snooze" onClick={() => snoozeAlert(alert)}>
                            بی‌صدا
                          </button>
                        )}
                        {alertLink.startsWith('/') ? (
                          <Link className="admin-alert-link" to={alertLink}>جزئیات</Link>
                        ) : alertLink ? (
                          <a className="admin-alert-link" href={alertLink}>جزئیات</a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {!!normalAlerts.length && (
            <>
              <div className="admin-alert-subhead">سایر هشدارها</div>
              <div className="admin-activity-list">
                {normalAlerts.map((alert) => {
                  const alertLink = ALERT_LINKS[alert.key] || '';
                  return (
                    <div key={alert.key} className={`admin-activity-item admin-alert ${alert.level || 'medium'}`}>
                      <div className="admin-alert-main">
                        <span className="admin-alert-title">{alert.title}</span>
                        <span className="admin-alert-meta">
                          مالک: {alert.owner || 'تیم مدیریت'} | قدیمی‌ترین مورد: {formatAlertAge(alert.oldestPendingMinutes)}
                        </span>
                      </div>
                      <div className="admin-alert-side">
                        <span className="admin-alert-count">{Number(alert.count || 0).toLocaleString('fa-AF-u-ca-persian')}</span>
                        <span className={`admin-alert-trend ${alert.trendDirection || 'steady'}`}>
                          {getAlertTrendLabel(alert)}
                        </span>
                        {resolveAlertSnoozeDuration(alert) > 0 && (
                          <button type="button" className="admin-alert-snooze" onClick={() => snoozeAlert(alert)}>
                            بی‌صدا
                          </button>
                        )}
                        {alertLink.startsWith('/') ? (
                          <Link className="admin-alert-link" to={alertLink}>جزئیات</Link>
                        ) : alertLink ? (
                          <a className="admin-alert-link" href={alertLink}>جزئیات</a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {canViewReports && (
        <div className="admin-alerts admin-sla-box">
          <div className="admin-activity-head">
            <h3>اتوماسیون SLA</h3>
            <div className="admin-sla-actions">
              <button type="button" className="ghost" onClick={loadSlaConfig}>تنظیمات</button>
              <button type="button" className="admin-btn" onClick={runSlaNow} disabled={slaBusy}>
                {slaBusy ? 'در حال اجرا...' : 'اجرای دستی SLA'}
              </button>
            </div>
          </div>

          <div className="admin-sla-grid">
            <div className="admin-activity-item">
              <span>مهلت مدیر مالی</span>
              <span>{formatSlaMinutes(currentSlaTimeouts.finance_manager)}</span>
            </div>
            <div className="admin-activity-item">
              <span>مهلت آمریت مالی</span>
              <span>{formatSlaMinutes(currentSlaTimeouts.finance_lead)}</span>
            </div>
            <div className="admin-activity-item">
              <span>مهلت ریاست عمومی</span>
              <span>{formatSlaMinutes(currentSlaTimeouts.general_president)}</span>
            </div>
          </div>

          {slaMessage && <div className="admin-empty">{slaMessage}</div>}

          {!!slaResult?.summary?.totals && (
            <div className="admin-sla-result">
              <span>ارجاع خودکار: {Number(slaResult.summary.totals.escalated || 0).toLocaleString('fa-AF-u-ca-persian')}</span>
              <span>اعلان‌های ارسال‌شده: {Number(slaResult.summary.totals.notifications || 0).toLocaleString('fa-AF-u-ca-persian')}</span>
              <span>آخرین اجرا: {toDateTime(slaResult.runsAt)}</span>
            </div>
          )}
        </div>
      )}

      <div className="admin-activity admin-schedule-card">
        <div className="admin-schedule-hero">
          <div className="admin-schedule-hero-main">
            <div className="admin-schedule-kicker-row">
              <span className={`admin-schedule-kicker ${todayScheduleSource === 'draft' ? 'draft' : 'api'}`}>
                {todayScheduleSourceLabel}
              </span>
              {todayScheduleCheckedLabel && (
                <span className="admin-schedule-last-sync">آخرین بروزرسانی: {todayScheduleCheckedLabel}</span>
              )}
            </div>
            <div className="admin-schedule-title-wrap">
              <div className="admin-schedule-title-copy">
                <h3>{todayScheduleCardTitle}</h3>
                <p className="admin-schedule-description">{todayScheduleHeroNote}</p>
              </div>
            </div>
          </div>
          <div className="admin-schedule-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => loadTodaySchedule()}
              disabled={todayScheduleBusy}
            >
              {todayScheduleBusy ? 'در حال بروزرسانی...' : 'بروزرسانی'}
            </button>
            <button
              type="button"
              className="ghost admin-schedule-help-btn"
              aria-expanded={todayScheduleHelpOpen}
              aria-label={`راهنمای ${todayScheduleCardTitle}`}
              onClick={() => setTodayScheduleHelpOpen((prev) => !prev)}
            >
              راهنما
            </button>
            <Link className="admin-btn ghost" to={canManageSchedule ? ADMIN_SCHEDULE_ROUTE : (canViewSchedule ? ADMIN_SCHEDULE_VIEW_ROUTE : '/schedule')}>
              {canManageSchedule ? 'مدیریت برنامه' : 'مشاهده برنامه'}
            </Link>
          </div>
        </div>
        {todayScheduleHelpOpen && (
          <div className="admin-schedule-help-popover">
            <p>این ویجت وضعیت اجرایی برنامه {todayScheduleCardLabel} را نشان می‌دهد و برای تصمیم سریع طراحی شده است.</p>
            <p>شاخص سلامت از سه عامل محاسبه می‌شود: پیش‌نویس، تداخل، و اتاق نامشخص.</p>
            <p>با کلیک روی هر آیتم Breakdown می‌توانید فقط همان مشکل را Drill-down کنید.</p>
            <p>بازنشانی سریع: دکمه بازنشانی فیلترها یا میانبر Alt+Shift+R.</p>
          </div>
        )}
        <div className="admin-schedule-stat-grid">
          <div className="admin-schedule-stat-card">
            <span className="admin-schedule-stat-label">کل جلسات</span>
            <strong className="admin-schedule-stat-value">{Number(todayScheduleSummary.total).toLocaleString('fa-AF-u-ca-persian')}</strong>
            <span className="admin-schedule-stat-note">تمام ردیف‌های {todayScheduleCardLabel}</span>
          </div>
          <div className="admin-schedule-stat-card published">
            <span className="admin-schedule-stat-label">منتشرشده</span>
            <strong className="admin-schedule-stat-value">{Number(todayScheduleSummary.published).toLocaleString('fa-AF-u-ca-persian')}</strong>
            <span className="admin-schedule-stat-note">قابل مشاهده برای کاربران</span>
          </div>
          <div className="admin-schedule-stat-card draft">
            <span className="admin-schedule-stat-label">پیش‌نویس</span>
            <strong className="admin-schedule-stat-value">{Number(todayScheduleSummary.draft).toLocaleString('fa-AF-u-ca-persian')}</strong>
            <span className="admin-schedule-stat-note">منتظر نشر یا تکمیل</span>
          </div>
          <div className="admin-schedule-stat-card muted">
            <span className="admin-schedule-stat-label">نمایش فعلی</span>
            <strong className="admin-schedule-stat-value">{Number(issueFilteredTodaySchedule.length).toLocaleString('fa-AF-u-ca-persian')}</strong>
            <span className="admin-schedule-stat-note">بعد از فیلترهای انتخاب‌شده</span>
          </div>
          <div className={`admin-schedule-stat-card health ${todayScheduleHealth.tone}`}>
            <span className="admin-schedule-stat-label">شاخص سلامت</span>
            <strong className="admin-schedule-stat-value">{Number(todayScheduleHealth.score).toLocaleString('fa-AF-u-ca-persian')}/100</strong>
            <span className="admin-schedule-stat-note">{todayScheduleHealthLabel}</span>
          </div>
        </div>
        <div className="admin-schedule-health-breakdown">
          {todayScheduleHealthBreakdown.map((item) => (
            <button
              type="button"
              key={item.key}
              className={`admin-schedule-health-item ${todayScheduleIssueFilter === item.key ? 'active' : ''}`}
              title={item.hint}
              aria-label={item.hint}
              onClick={() => setTodayScheduleIssueFilter((prev) => (prev === item.key ? 'all' : item.key))}
              disabled={!item.count}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="admin-schedule-health-formula">{todayScheduleHealthFormulaText}</div>
        <div className="admin-schedule-shortcut-hint">{scheduleResetShortcutHint}</div>
        {!!todaySchedule.length && (
          <div className="admin-schedule-filters">
            {SCHEDULE_WIDGET_FILTER_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={todayScheduleFilter === item.value ? 'active' : ''}
                onClick={() => setTodayScheduleFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
            {hasActiveScheduleFilters && (
              <button
                type="button"
                className="admin-schedule-reset"
                onClick={resetScheduleFilters}
              >
                بازنشانی فیلترها
              </button>
            )}
          </div>
        )}
        {!todaySchedule.length && !todayScheduleBusy && (
          <div className="admin-empty">برای {todayScheduleCardLabel} برنامه‌ای ثبت نشده است.</div>
        )}
        {todayScheduleBusy && !todaySchedule.length && (
          <div className="admin-empty">در حال دریافت برنامه {todayScheduleCardLabel}...</div>
        )}
        {!!todaySchedule.length && !filteredTodaySchedule.length && (
          <div className="admin-empty">برای فیلتر انتخاب‌شده، برنامه‌ای وجود ندارد.</div>
        )}
        {!!filteredTodaySchedule.length && !issueFilteredTodaySchedule.length && (
          <div className="admin-empty">برای علت انتخاب‌شده، موردی وجود ندارد.</div>
        )}
        {!!issueFilteredTodaySchedule.length && (
          <div className="admin-activity-list">
            {issueFilteredTodaySchedule.map((item, index) => {
              const itemId = getScheduleRowId(item, `row-${index}`);
              const visibility = normalizeScheduleVisibility(item?.visibility);
              const quickDate = String(item?.date || '').trim();
              const quickToBase = canManageSchedule ? ADMIN_SCHEDULE_ROUTE : (canViewSchedule ? ADMIN_SCHEDULE_VIEW_ROUTE : '/schedule');
              const quickTo = quickDate ? `${quickToBase}?date=${encodeURIComponent(quickDate)}` : quickToBase;
              const now = new Date();
              const nowMinutes = (now.getHours() * 60) + now.getMinutes();
              const startMinutes = parseClockToMinutes(item?.startTime);
              const endMinutes = parseClockToMinutes(item?.endTime);
              const minutesToStart = Number.isFinite(startMinutes) ? (startMinutes - nowMinutes) : null;
              const startsSoon = Number.isFinite(minutesToStart) && minutesToStart >= 0 && minutesToStart <= 30;
              const isLive = Number.isFinite(startMinutes) && Number.isFinite(endMinutes)
                && nowMinutes >= startMinutes
                && nowMinutes < endMinutes;
              const roomLabel = String(item?.room || '').trim();
              const roomMissing = !roomLabel;
              const conflictReasons = todayScheduleConflictsById[itemId] || [];
              const hasConflict = conflictReasons.length > 0;
              const classLabel = getScheduleClassLabel(item);
              return (
                <div key={item._id || itemId} className="admin-activity-item admin-schedule-item">
                  <div className="admin-schedule-main">
                    <span className="admin-schedule-subject-line">{item.subject || 'مضمون بدون نام'}</span>
                    <div className="admin-schedule-meta-pills">
                      <span>{item.instructor?.name || 'استاد'}</span>
                      <span>{classLabel}</span>
                      <span>{item.startTime} - {item.endTime}</span>
                      <span>اتاق: {roomLabel || 'نامشخص'}</span>
                    </div>
                  </div>
                  <div className="admin-schedule-side">
                    {isLive && (
                      <span className="admin-schedule-flag live">در حال برگزاری</span>
                    )}
                    {startsSoon && (
                      <span className="admin-schedule-flag soon">
                        نزدیک شروع ({Number(minutesToStart || 0).toLocaleString('fa-AF-u-ca-persian')} دقیقه)
                      </span>
                    )}
                    {roomMissing && (
                      <span className="admin-schedule-flag room-missing">اتاق نامشخص</span>
                    )}
                    {hasConflict && (
                      <span className="admin-schedule-flag conflict">
                        تداخل: {conflictReasons.join('، ')}
                      </span>
                    )}
                    <span className={`admin-schedule-visibility ${visibility}`}>
                      {SCHEDULE_VISIBILITY_LABELS[visibility] || visibility}
                    </span>
                    <Link className="admin-alert-link" to={quickTo}>اقدام سریع</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canManageUsers && (
        <div id="profile-requests" className="admin-orders">
          <h3>درخواست‌های تغییر مشخصات شاگردان</h3>
          {requestMessage && <div className="admin-empty">{requestMessage}</div>}
          {!requestMessage && !profileRequests.length && (
            <div className="admin-empty">درخواست جدیدی وجود ندارد.</div>
          )}
          {!!profileRequests.length && (
            <div className="admin-bulk-bar">
              <span>{selectedProfileIds.length} مورد انتخاب شده</span>
              <div className="admin-actions">
                <button
                  type="button"
                  className="admin-approve"
                  disabled={!selectedProfileIds.length || bulkBusy.profileApprove || bulkBusy.profileReject}
                  onClick={bulkApproveProfiles}
                >
                  {bulkBusy.profileApprove ? '...' : 'تایید گروهی'}
                </button>
                <button
                  type="button"
                  className="admin-reject"
                  disabled={!selectedProfileIds.length || bulkBusy.profileApprove || bulkBusy.profileReject}
                  onClick={bulkRejectProfiles}
                >
                  {bulkBusy.profileReject ? '...' : 'رد گروهی'}
                </button>
              </div>
            </div>
          )}
          {!!profileRequests.length && (
            <div className="admin-table">
              <div className="admin-row admin-head with-select">
                <span className="admin-select-col">
                  <input
                    type="checkbox"
                    checked={profileRequests.length > 0 && selectedProfileIds.length === profileRequests.length}
                    onChange={toggleAllProfileSelection}
                  />
                </span>
                <span>شاگرد</span>
                <span>ایمیل درخواستی</span>
                <span>پایه</span>
                <span>تاریخ</span>
                <span>عملیات</span>
              </div>
              {profileRequests.map((item) => (
                <div key={item._id} className="admin-row with-select">
                  <span className="admin-select-col">
                    <input
                      type="checkbox"
                      checked={selectedProfileIds.includes(item._id)}
                      onChange={() => toggleProfileSelection(item._id)}
                    />
                  </span>
                  <span>{item.user?.name || '---'}</span>
                  <span>{item.requestedData?.email || '---'}</span>
                  <span>{item.requestedData?.grade || '---'}</span>
                  <span>{toDate(item.createdAt)}</span>
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="admin-approve"
                      disabled={busy[item._id]}
                      onClick={() => approveProfileRequest(item)}
                    >
                      {busy[item._id] ? '...' : 'تایید'}
                    </button>
                    <button
                      type="button"
                      className="admin-reject"
                      disabled={busy[item._id]}
                      onClick={() => rejectProfileRequest(item)}
                    >
                      رد
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Wizard: راه‌اندازی مکتب (4 مرحله) ===== */}
      {createSchoolOpen && (
        <div className="admin-modal-backdrop" onClick={wizardClose}>
          <div className="admin-modal-dialog" style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>

            {/* هدر wizard */}
            <div className="admin-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>
                  {wizardStep === 1 && 'مرحله ۱ از ۴ — ثبت مکتب'}
                  {wizardStep === 2 && 'مرحله ۲ از ۴ — سال تعلیمی'}
                  {wizardStep === 3 && 'مرحله ۳ از ۴ — نوبت‌ها'}
                  {wizardStep === 4 && 'مرحله ۴ از ۴ — صنف‌ها'}
                  {wizardStep === 5 && 'راه‌اندازی کامل شد'}
                </h3>
                {wizardStep < 5 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {[1, 2, 3, 4].map(s => (
                      <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= wizardStep ? '#3b82f6' : '#e5e7eb' }} />
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className="admin-modal-close" onClick={wizardClose} disabled={wizardBusy}>✕</button>
            </div>

            <div className="admin-modal-body">

              {/* ======== مرحله ۱: مکتب ======== */}
              {wizardStep === 1 && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>نام مکتب (دری) *</label>
                      <input type="text" value={createSchoolForm.nameDari} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, nameDari: e.target.value })} placeholder="مثال: مکتب عالی کابل" disabled={wizardBusy} />
                    </div>
                    <div className="admin-form-group">
                      <label>نام مکتب (انگلیسی) *</label>
                      <input type="text" value={createSchoolForm.name} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, name: e.target.value })} placeholder="مثال: Kabul High School" disabled={wizardBusy} />
                    </div>
                    <div className="admin-form-group">
                      <label>کد مکتب *</label>
                      <input type="text" value={createSchoolForm.schoolCode} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, schoolCode: e.target.value })} placeholder="مثال: KBL-001" disabled={wizardBusy} />
                    </div>
                    <div className="admin-form-group">
                      <label>ولایت *</label>
                      <select value={createSchoolForm.province} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, province: e.target.value })} disabled={wizardBusy}>
                        <option value="kabul">کابل</option>
                        <option value="herat">هرات</option>
                        <option value="kandahar">قندهار</option>
                        <option value="balkh">بلخ</option>
                        <option value="nangarhar">ننگرهار</option>
                        <option value="badakhshan">بدخشان</option>
                        <option value="takhar">تخار</option>
                        <option value="samangan">سمنگان</option>
                        <option value="kunduz">کندز</option>
                        <option value="baghlan">بغلان</option>
                        <option value="farah">فراه</option>
                        <option value="nimroz">نیمروز</option>
                        <option value="helmand">هلمند</option>
                        <option value="ghor">غور</option>
                        <option value="daykundi">دایکندی</option>
                        <option value="uruzgan">ارزگان</option>
                        <option value="zabul">زابل</option>
                        <option value="paktika">پکتیکا</option>
                        <option value="khost">خوست</option>
                        <option value="paktia">پکتیا</option>
                        <option value="logar">لوگر</option>
                        <option value="parwan">پروان</option>
                        <option value="kapisa">کاپیسا</option>
                        <option value="panjshir">پنجشیر</option>
                        <option value="badghis">بادغیس</option>
                        <option value="faryab">فاریاب</option>
                        <option value="jowzjan">جوزجان</option>
                        <option value="saripul">سریپل</option>
                      </select>
                    </div>
                    <div className="admin-form-group">
                      <label>ناحیه/شهر *</label>
                      <input type="text" value={createSchoolForm.district} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, district: e.target.value })} placeholder="مثال: ناحیه ۳" disabled={wizardBusy} />
                    </div>
                    <div className="admin-form-group">
                      <label>نوع مکتب</label>
                      <select value={createSchoolForm.schoolType} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, schoolType: e.target.value })} disabled={wizardBusy}>
                        <option value="primary">ابتدایی</option>
                        <option value="secondary">متوسطه</option>
                        <option value="high">عالی</option>
                        <option value="mosque">مسجد</option>
                        <option value="madrasa">مدرسه دینی</option>
                        <option value="technical">فنی</option>
                        <option value="private">خصوصی</option>
                      </select>
                    </div>
                    <div className="admin-form-group">
                      <label>سطح تحصیل</label>
                      <select value={createSchoolForm.schoolLevel} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, schoolLevel: e.target.value })} disabled={wizardBusy}>
                        <option value="grade1_6">صنف‌های ۱ تا ۶</option>
                        <option value="grade7_9">صنف‌های ۷ تا ۹</option>
                        <option value="grade10_12">صنف‌های ۱۰ تا ۱۲</option>
                        <option value="grade1_12">صنف‌های ۱ تا ۱۲</option>
                        <option value="grade1_3">صنف‌های ۱ تا ۳</option>
                        <option value="grade4_6">صنف‌های ۴ تا ۶</option>
                      </select>
                    </div>
                    <div className="admin-form-group">
                      <label>نوع مالکیت *</label>
                      <select value={createSchoolForm.ownership} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, ownership: e.target.value })} disabled={wizardBusy}>
                        <option value="government">دولتی</option>
                        <option value="private">خصوصی</option>
                        <option value="ngo">سازمان‌های بین‌المللی</option>
                      </select>
                    </div>
                    <div className="admin-form-group">
                      <label>تاریخ تأسیس</label>
                      <input type="date" value={createSchoolForm.establishmentDate} onChange={(e) => setCreateSchoolForm({ ...createSchoolForm, establishmentDate: e.target.value })} disabled={wizardBusy} />
                    </div>
                  </div>
                </div>
              )}

              {/* ======== مرحله ۲: سال تعلیمی ======== */}
              {wizardStep === 2 && (
                <div>
                  <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>
                    یک سال تعلیمی برای مکتب <strong>{createSchoolForm.nameDari}</strong> تعریف کنید.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>عنوان سال تعلیمی *</label>
                      <input type="text" value={wizardYearForm.title} onChange={(e) => setWizardYearForm({ ...wizardYearForm, title: e.target.value })} placeholder="مثال: ۱۴۰۴-۱۴۰۵" disabled={wizardBusy} />
                    </div>
                    <div className="admin-form-group">
                      <label>کد (اختیاری)</label>
                      <input type="text" value={wizardYearForm.code} onChange={(e) => setWizardYearForm({ ...wizardYearForm, code: e.target.value })} placeholder="مثال: 1404" disabled={wizardBusy} />
                    </div>
                    <div className="admin-form-group">
                      <label>
                        <input type="checkbox" checked={wizardYearForm.isCurrent} onChange={(e) => setWizardYearForm({ ...wizardYearForm, isCurrent: e.target.checked })} disabled={wizardBusy} style={{ marginLeft: 6 }} />
                        سال تعلیمی جاری
                      </label>
                    </div>
                    <div className="admin-form-group">
                      <label>تاریخ شروع (اختیاری)</label>
                      <input type="date" value={wizardYearForm.startDate} onChange={(e) => setWizardYearForm({ ...wizardYearForm, startDate: e.target.value })} disabled={wizardBusy} />
                    </div>
                    <div className="admin-form-group">
                      <label>تاریخ پایان (اختیاری)</label>
                      <input type="date" value={wizardYearForm.endDate} onChange={(e) => setWizardYearForm({ ...wizardYearForm, endDate: e.target.value })} disabled={wizardBusy} />
                    </div>
                  </div>
                </div>
              )}

              {/* ======== مرحله ۳: نوبت‌ها ======== */}
              {wizardStep === 3 && (
                <div>
                  <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>
                    نوبت‌های پیش‌فرض را فقط انتخاب کنید.
                  </p>
                  {wizardShiftRows.map((row, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'center', marginBottom: 10, padding: '12px 14px', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(row.enabled)}
                        onChange={(e) => setWizardShiftRows((list) => list.map((item, itemIndex) => (
                          itemIndex === idx ? { ...item, enabled: e.target.checked } : item
                        )))}
                        disabled={wizardBusy}
                        style={{ width: 18, height: 18 }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{row.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{row.startTime} تا {row.endTime}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ======== مرحله ۴: صنف‌ها ======== */}
              {wizardStep === 4 && (
                <div>
                  <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>
                    صنف‌های مکتب را اضافه کنید. این مرحله اختیاری است — می‌توانید بعداً از صفحه مدیریت صنف‌ها اضافه کنید.
                  </p>

                  {/* فرم اضافه کردن صنف */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end', padding: '12px', background: '#f0f9ff', borderRadius: 6, border: '1px solid #bae6fd', marginBottom: 12 }}>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>صنف (گرید)</label>
                      <select value={wizardClassDraft.gradeLevel} onChange={(e) => setWizardClassDraft({ ...wizardClassDraft, gradeLevel: Number(e.target.value) })} disabled={wizardBusy}>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>بخش</label>
                      <select value={wizardClassDraft.section} onChange={(e) => setWizardClassDraft({ ...wizardClassDraft, section: e.target.value })} disabled={wizardBusy}>
                        {['الف','ب','ج','د','ه','و','ز','ح','ط'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>جنسیت</label>
                      <select value={wizardClassDraft.genderType} onChange={(e) => setWizardClassDraft({ ...wizardClassDraft, genderType: e.target.value })} disabled={wizardBusy}>
                        <option value="male">ذکور</option>
                        <option value="female">اناث</option>
                        <option value="mixed">مختلط</option>
                      </select>
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>نوبت</label>
                      <select value={wizardClassDraft.shiftId} onChange={(e) => setWizardClassDraft({ ...wizardClassDraft, shiftId: e.target.value })} disabled={wizardBusy || wizardCreatedShifts.length === 0}>
                        <option value="">انتخاب...</option>
                        {wizardCreatedShifts.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                      </select>
                      {wizardCreatedShifts.length === 0 && (
                        <span style={{ fontSize: 11, color: '#ef4444', display: 'block', marginTop: 2 }}>← برگردید و نوبت‌ها را ثبت کنید</span>
                      )}
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>ظرفیت</label>
                      <input type="number" min={1} max={100} value={wizardClassDraft.capacity} onChange={(e) => setWizardClassDraft({ ...wizardClassDraft, capacity: Number(e.target.value) })} disabled={wizardBusy} />
                    </div>
                    <button type="button" className="admin-btn primary" style={{ padding: '6px 12px', marginBottom: 0 }} onClick={wizardAddClassDraft} disabled={wizardBusy}>+</button>
                  </div>

                  {/* لیست صنف‌های اضافه‌شده */}
                  {wizardClassRows.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 16 }}>هنوز صنفی اضافه نشده است</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f3f4f6' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>صنف</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>بخش</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>جنسیت</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>نوبت</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>ظرفیت</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {wizardClassRows.map((cls, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '6px 8px' }}>{cls.gradeLevel}</td>
                            <td style={{ padding: '6px 8px' }}>{cls.section}</td>
                            <td style={{ padding: '6px 8px' }}>{{ male: 'ذکور', female: 'اناث', mixed: 'مختلط' }[cls.genderType]}</td>
                            <td style={{ padding: '6px 8px' }}>{cls._shiftName}</td>
                            <td style={{ padding: '6px 8px' }}>{cls.capacity}</td>
                            <td style={{ padding: '6px 8px' }}>
                              <button type="button" onClick={() => wizardRemoveClassDraft(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ======== مرحله ۵: کامل شد ======== */}
              {wizardStep === 5 && (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <h4 style={{ color: '#16a34a', marginBottom: 8 }}>راه‌اندازی مکتب با موفقیت انجام شد</h4>
                  <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
                    مکتب <strong>{createSchoolForm.nameDari}</strong>، سال تعلیمی {wizardYearForm.title}،{' '}
                    {wizardCreatedShifts.length} نوبت و {wizardClassRows.length} صنف ایجاد شدند.
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="admin-btn primary" onClick={() => { wizardClose(); window.location.href = '/admin-education'; }}>رفتن به مدیریت آموزش</button>
                    <button type="button" className="admin-btn ghost" onClick={wizardClose}>بستن</button>
                  </div>
                </div>
              )}

              {/* پیام خطا یا موفقیت */}
              {wizardMsg.text && wizardStep < 5 && (
                <div className={`admin-form-message${wizardMsg.error ? ' error' : ''}`} style={{ marginTop: 12 }}>
                  {wizardMsg.text}
                </div>
              )}

            </div>

            {/* فوتر wizard */}
            {wizardStep < 5 && (
              <div className="admin-modal-footer">
                <button type="button" className="admin-btn ghost" onClick={wizardStep > 1 ? () => { setWizardStep(s => s - 1); setWizardMsg({ text: '', error: false }); } : wizardClose} disabled={wizardBusy}>
                  {wizardStep === 1 ? 'انصراف' : '← قبلی'}
                </button>
                <button
                  type="button"
                  className="admin-btn primary"
                  disabled={wizardBusy}
                  onClick={
                    wizardStep === 1 ? wizardStep1Submit :
                    wizardStep === 2 ? wizardStep2Submit :
                    wizardStep === 3 ? wizardStep3Submit :
                    wizardStep4Submit
                  }
                >
                  {wizardBusy ? 'درحال پردازش...' :
                    wizardStep === 1 ? 'ایجاد مکتب ←' :
                    wizardStep === 2 ? 'ثبت سال تعلیمی ←' :
                    wizardStep === 3 ? 'ثبت نوبت‌ها ←' :
                    wizardClassRows.length === 0 ? 'رد شدن (بعداً) ←' : `ثبت ${wizardClassRows.length} صنف ←`
                  }
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </section>
  );
}

