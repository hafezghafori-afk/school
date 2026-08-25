import React, { useEffect, useMemo, useState } from 'react';
import './AdminUsers.css';

import { API_BASE } from '../config/api';
import {
  PERMISSION_GROUPS,
  PERMISSION_OPTIONS as CATALOG_PERMISSION_OPTIONS,
  expandLegacyPermissions
} from '../config/permissionCatalog';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const createEditUserForm = (user = {}) => ({
  name: user?.name || '',
  email: user?.email || '',
  password: '',
  orgRole: normalizeOrgRole(user?.orgRole || '', 'student'),
  status: normalizeUserStatus(user?.status || '', 'active'),
  grade: user?.grade || '',
  subject: user?.subject || '',
  permissions: Array.isArray(user?.permissions) ? [...user.permissions] : []
});

const readApiResponse = async (res, fallbackMessage) => {
  let data = null;
  let text = '';

  try {
    text = await res.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (res.ok) {
    return { success: true, data };
  }

  if (data?.message) {
    return { success: false, message: data.message, status: res.status };
  }

  if (res.status === 404) {
    return {
      success: false,
      status: 404,
      message: 'مسیر مدیریت کاربران در backend فعال نیست. لطفاً backend را بازآغاز کنید.'
    };
  }

  return {
    success: false,
    status: res.status,
    message: fallbackMessage
  };
};

const ORG_ROLE_OPTIONS = [
  { key: 'student', label: 'شاگرد', role: 'student' },
  { key: 'parent', label: 'والد/سرپرست', role: 'parent' },
  { key: 'instructor', label: 'استاد', role: 'instructor' },
  { key: 'finance_manager', label: 'مدیر مالی', role: 'admin' },
  { key: 'school_manager', label: 'مدیر مکتب', role: 'admin' },
  { key: 'academic_manager', label: 'مدیر تدریسی', role: 'admin' },
  { key: 'head_teacher', label: 'سر معلم مکتب', role: 'admin' },
  { key: 'general_president', label: 'ریاست عمومی', role: 'admin' }
];

const USER_STATUS_OPTIONS = [
  { key: 'active', label: 'فعال' },
  { key: 'inactive', label: 'غیرفعال' },
  { key: 'suspended', label: 'تعلیق' }
];

const PERMISSION_OPTIONS = CATALOG_PERMISSION_OPTIONS;

const PERMISSION_GROUP_MODES = [
  { key: 'none', label: 'بدون دسترسی' },
  { key: 'view', label: 'مشاهده فقط' },
  { key: 'manage', label: 'مدیریت کامل' }
];

const VIEW_PERMISSION_PATTERNS = [
  '.view',
  'view_',
  '_view',
  'dashboard.view',
  'profile.view',
  'notifications.view',
  'chat.use',
  'recordings.view',
  'schedule.public.view',
  'quiz.take'
];

const PERMISSION_PRESETS = [
  {
    key: 'student_basic',
    label: 'قالب شاگرد عادی',
    orgRoles: ['student'],
    permissions: ['grades.my.view', 'attendance.my.view', 'homework.my.view', 'finance.my.view', 'timetable.student_view.access', 'chat.use', 'schedule.public.view']
  },
  {
    key: 'teacher_basic',
    label: 'قالب استاد عادی',
    orgRoles: ['instructor'],
    permissions: ['teachers.dashboard.access', 'teachers.timetable.view', 'attendance.students.manage', 'grades.manage', 'homework.manage', 'quiz.manage', 'reports.students.view', 'chat.use', 'recordings.view']
  },
  {
    key: 'teacher_lead',
    label: 'قالب استاد مسئول صنف',
    orgRoles: ['instructor'],
    permissions: ['teachers.dashboard.access', 'teachers.timetable.view', 'teachers.students.add', 'attendance.students.manage', 'grades.manage', 'homework.manage', 'quiz.manage', 'students.profile.view', 'reports.students.view', 'chat.use', 'recordings.view']
  },
  {
    key: 'registration_manager',
    label: 'قالب مدیر ثبت‌نام',
    orgRoles: ['school_manager', 'academic_manager', 'head_teacher', 'general_president'],
    permissions: ['students.register', 'enrollments.online.manage', 'enrollments.manage', 'enrollments.detail.view', 'enrollments.print', 'students.manage', 'students.profile.view']
  },
  {
    key: 'finance_operator',
    label: 'قالب مدیر مالی',
    orgRoles: ['finance_manager', 'finance_lead', 'school_manager', 'general_president'],
    permissions: ['finance.center.manage', 'shortterm.center.manage', 'finance.bills.manage', 'finance.payments.manage', 'finance.receipts.approve', 'finance.receipts.reject', 'finance.reports.view', 'finance.student_profile.view']
  },
  {
    key: 'head_teacher',
    label: 'قالب سرمعلم',
    orgRoles: ['head_teacher', 'academic_manager', 'school_manager', 'general_president'],
    permissions: ['education.core.manage', 'education.classes.manage', 'education.subjects.manage', 'teachers.manage', 'teachers.reports.view', 'attendance.students.manage', 'grades.manage', 'homework.manage', 'timetable.view', 'timetable.teacher_assignments.manage']
  },
  {
    key: 'school_manager',
    label: 'قالب مدیر مکتب',
    orgRoles: ['school_manager', 'general_president'],
    permissions: ['users.manage', 'users.create', 'users.edit', 'users.roles.manage', 'users.permissions.manage', 'users.access_requests.manage', 'students.manage', 'students.register', 'enrollments.manage', 'education.core.manage', 'reports.builder.view', 'reports.students.view', 'reports.teachers.view', 'timetable.view', 'timetable.editor.manage']
  }
];

const ROLE_OPTIONS = [
  { key: 'student', label: 'شاگرد' },
  { key: 'parent', label: 'والد/سرپرست' },
  { key: 'instructor', label: 'استاد' },
  { key: 'admin', label: 'ادمین' }
];

const ADMIN_LEVEL_OPTIONS = [
  { key: 'finance_manager', label: 'مدیر مالی' },
  { key: 'school_manager', label: 'مدیر مکتب' },
  { key: 'academic_manager', label: 'مدیر تدریسی' },
  { key: 'head_teacher', label: 'سر معلم مکتب' },
  { key: 'general_president', label: 'ریاست عمومی' }
];

const ORG_ROLE_DEFAULT_PERMISSIONS = {
  student: [],
  parent: [],
  instructor: ['manage_content', 'view_reports'],
  finance_manager: ['manage_finance'],
  finance_lead: ['manage_finance', 'view_reports'],
  school_manager: ['manage_users', 'manage_enrollments', 'manage_memberships', 'manage_content', 'view_reports', 'view_schedule', 'manage_schedule', 'access_school_manager'],
  academic_manager: ['users.manage', 'users.create', 'users.edit', 'users.deactivate', 'users.roles.manage', 'users.permissions.manage', 'users.access_requests.manage', 'users.profile_requests.manage', 'students.manage', 'students.register', 'students.documents.manage', 'students.guardians.manage', 'teachers.manage', 'manage_enrollments', 'manage_memberships', 'view_schedule'],
  head_teacher: ['users.manage', 'users.create', 'users.edit', 'users.deactivate', 'users.roles.manage', 'users.permissions.manage', 'users.access_requests.manage', 'users.profile_requests.manage', 'students.manage', 'students.register', 'students.documents.manage', 'students.guardians.manage', 'teachers.manage', 'manage_content', 'view_reports', 'view_schedule', 'manage_schedule', 'access_head_teacher'],
  general_president: ['manage_users', 'manage_enrollments', 'manage_memberships', 'manage_finance', 'manage_content', 'view_reports', 'view_schedule', 'manage_schedule', 'access_school_manager', 'access_head_teacher']
};

const LOCKED_PERMISSION_ORG_ROLES = new Set(['finance_manager', 'finance_lead']);
const KNOWN_ORG_ROLES = new Set([...ORG_ROLE_OPTIONS.map((item) => item.key), 'finance_lead']);
const KNOWN_USER_STATUSES = new Set(USER_STATUS_OPTIONS.map((item) => item.key));

const ACCESS_STATUS_LABELS = {
  pending: 'در انتظار',
  approved: 'تایید شده',
  rejected: 'رد شده'
};

const USER_WORKSPACE_TABS = [
  {
    key: 'directory',
    label: 'فهرست کاربران',
    description: 'ایجاد، جستجو و ویرایش حساب‌های سیستم'
  },
  {
    key: 'access',
    label: 'دسترسی‌ها',
    description: 'ویرایش نقش، مجوزهای جزئی و درخواست‌های دسترسی'
  }
];

const MANAGEMENT_ORG_ROLES = new Set(['finance_manager', 'finance_lead', 'school_manager', 'academic_manager', 'head_teacher', 'general_president']);
const DEACTIVATABLE_ORG_ROLES = new Set(['student', 'instructor', 'finance_manager', 'finance_lead', 'school_manager', 'academic_manager', 'head_teacher']);
const ACCESS_EDITOR_FOCUS_ROLES = new Set(['school_manager', 'academic_manager', 'head_teacher', 'parent']);
const ACCESS_EDITOR_ROLE_FILTER_OPTIONS = [
  { key: 'focus', label: 'مدیر مکتب، مدیر تدریسی، سرمعلم و والدین' },
  { key: 'all', label: 'همه کاربران' },
  ...ORG_ROLE_OPTIONS.map((item) => ({ key: item.key, label: item.label }))
];

const USER_DIRECTORY_SECTIONS = [
  {
    key: 'all',
    label: 'همه کاربران',
    description: 'نمایش تمام نقش‌ها در یک نمای مرکزی',
    matches: () => true
  },
  {
    key: 'students',
    label: 'شاگردان',
    description: 'حساب‌های آموزشی با تمرکز بر صنف و وضعیت آموزشی',
    matches: (user) => user?.orgRole === 'student'
  },
  {
    key: 'instructors',
    label: 'استادان',
    description: 'حساب‌های تدریسی با تمرکز بر مضمون و گزارش‌ها',
    matches: (user) => user?.orgRole === 'instructor'
  },
  {
    key: 'guardians',
    label: 'والدین/سرپرستان',
    description: 'حساب‌های همراه برای پیگیری شاگردان',
    matches: (user) => user?.orgRole === 'parent'
  },
  {
    key: 'management',
    label: 'مدیریت و کارمندان',
    description: 'نقش‌های اداری، مالی و رهبری مجموعه',
    matches: (user) => MANAGEMENT_ORG_ROLES.has(user?.orgRole)
  }
];

const DIRECTORY_CREATE_SECTIONS = new Set(['students', 'instructors', 'guardians', 'management']);
const DIRECTORY_LIST_INITIAL_COUNT = 6;
const DIRECTORY_LIST_STEP = 6;

const DIRECTORY_CREATE_CONFIG = {
  students: {
    label: 'ثبت شاگرد جدید',
    submitLabel: 'ثبت شاگرد',
    orgRole: 'student',
    helper: 'این فورم فقط برای ساخت حساب شاگرد است و صنف/پایه را مستقیماً از همین‌جا می‌گیرد.'
  },
  instructors: {
    label: 'ثبت استاد جدید',
    submitLabel: 'ثبت استاد',
    orgRole: 'instructor',
    helper: 'این فورم مخصوص استادان است و مضمون تدریس را به‌عنوان فیلد اصلی نگه می‌دارد.'
  },
  guardians: {
    label: 'ثبت والد/سرپرست جدید',
    submitLabel: 'ثبت والد/سرپرست',
    orgRole: 'parent',
    helper: 'پس از ثبت حساب والد/سرپرست، می‌توانید او را به یک یا چند شاگرد وصل کنید.'
  },
  management: {
    label: 'ثبت حساب اداری',
    submitLabel: 'ثبت حساب اداری',
    orgRole: 'finance_manager',
    helper: 'در این بخش فقط نقش‌های اداری و مدیریتی ساخته می‌شوند و نوع نقش اداری از همین فورم تعیین می‌شود؛ از مدیر مالی تا مدیر مکتب، مدیر تدریسی و سر معلم مکتب.'
  }
};

const resolveWorkspaceTabFromHash = (hash = '') => (
  String(hash || '').trim().toLowerCase() === '#access-requests' ? 'access' : 'directory'
);

const normalizeAdminLevel = (level = '') => {
  const value = String(level || '').trim().toLowerCase();
  if (value === 'finance_manager' || value === 'finance_lead' || value === 'school_manager' || value === 'academic_manager' || value === 'head_teacher' || value === 'general_president') return value;
  return 'finance_manager';
};

const normalizeOrgRole = (value = '', fallback = 'student') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (KNOWN_ORG_ROLES.has(normalized)) return normalized;
  const nextFallback = String(fallback || '').trim().toLowerCase();
  if (KNOWN_ORG_ROLES.has(nextFallback)) return nextFallback;
  return fallback === '' ? '' : 'student';
};

const normalizeUserStatus = (value = '', fallback = 'active') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (KNOWN_USER_STATUSES.has(normalized)) return normalized;
  const nextFallback = String(fallback || '').trim().toLowerCase();
  if (KNOWN_USER_STATUSES.has(nextFallback)) return nextFallback;
  return fallback === '' ? '' : 'active';
};

const compatibilityRoleForOrgRole = (orgRole = 'student') => {
  const normalized = normalizeOrgRole(orgRole, 'student');
  if (normalized === 'student') return 'student';
  if (normalized === 'parent') return 'parent';
  if (normalized === 'instructor') return 'instructor';
  return 'admin';
};

const buildRoleRequestPayload = (orgRole = 'student') => {
  const normalizedOrgRole = normalizeOrgRole(orgRole, 'student');
  const role = compatibilityRoleForOrgRole(normalizedOrgRole);
  return {
    role,
    orgRole: normalizedOrgRole,
    adminLevel: role === 'admin' ? normalizeAdminLevel(normalizedOrgRole) : ''
  };
};

const deriveOrgRole = ({ orgRole = '', role = '', adminLevel = '' } = {}) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'admin') {
    const normalizedAdminLevel = normalizeAdminLevel(adminLevel || '');
    if (normalizedAdminLevel) return normalizedAdminLevel;
    const explicitAdminRole = normalizeOrgRole(orgRole, '');
    if (
      explicitAdminRole === 'finance_manager'
      || explicitAdminRole === 'finance_lead'
      || explicitAdminRole === 'school_manager'
      || explicitAdminRole === 'academic_manager'
      || explicitAdminRole === 'head_teacher'
      || explicitAdminRole === 'general_president'
    ) {
      return explicitAdminRole;
    }
    return 'finance_manager';
  }

  const explicitOrgRole = normalizeOrgRole(orgRole, '');
  if (explicitOrgRole) return explicitOrgRole;

  if (normalizedRole === 'parent') return 'parent';
  if (normalizedRole === 'instructor' || normalizedRole === 'teacher' || normalizedRole === 'professor') return 'instructor';
  return 'student';
};

const roleLabel = (role) => ROLE_OPTIONS.find((item) => item.key === role)?.label || role;
const orgRoleLabel = (orgRole) => (
  String(orgRole || '').trim().toLowerCase() === 'finance_lead'
    ? 'آمر مالی (قدیمی)'
    : ORG_ROLE_OPTIONS.find((item) => item.key === orgRole)?.label || orgRole
);

// تن رنگی و نشان هر پست برای نشان‌دادن سلسله‌مراتب به‌صورت بصری در فهرست کاربران و پنل‌های ویرایش.
const POST_BADGE_TONES = {
  general_president: { tone: 'pres', glyph: '★' },
  finance_manager: { tone: 'fin', glyph: '◈' },
  finance_lead: { tone: 'fin', glyph: '◈' },
  school_manager: { tone: 'sch', glyph: '◧' },
  academic_manager: { tone: 'aca', glyph: '▤' },
  head_teacher: { tone: 'head', glyph: '◔' }
};

function PostBadge({ orgRole = '' }) {
  const normalized = String(orgRole || '').trim().toLowerCase();
  const spec = POST_BADGE_TONES[normalized];
  const label = orgRoleLabel(normalized);
  if (!spec) {
    return <span className="post-badge post-badge--neu">{label}</span>;
  }
  return (
    <span className={`post-badge post-badge--${spec.tone}`}>
      <span aria-hidden="true">{spec.glyph}</span> {label}
    </span>
  );
}

const getInitials = (name = '', email = '') => {
  const source = String(name || '').trim() || String(email || '').trim();
  if (!source) return '؟';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] || '') + (parts[1][0] || '');
  return source.slice(0, 2);
};
// سلسله‌مراتب واگذاری پست (باید با ORG_ROLE_ASSIGNABLE_TARGETS در backend/routes/adminRoutes.js
// یکسان بماند): هر پست فقط پست‌های پایین‌تر از خودش را می‌تواند بسازد/ویرایش کند، نه هم‌سطح یا
// بالاتر. این‌جا فقط برای فیلترکردن گزینه‌های نمایشی است؛ اجرای واقعیِ محدودیت در بک‌اند است.
const ORG_ROLE_ASSIGNABLE_TARGETS = {
  general_president: ['general_president', 'finance_manager', 'finance_lead', 'school_manager', 'academic_manager', 'head_teacher', 'instructor', 'student', 'parent'],
  school_manager: ['academic_manager', 'head_teacher', 'instructor', 'student', 'parent'],
  academic_manager: ['instructor', 'student', 'parent'],
  head_teacher: ['instructor', 'student', 'parent'],
  finance_manager: [],
  finance_lead: [],
  instructor: [],
  parent: [],
  student: []
};
const orgRoleSelectOptions = (current = '', viewerOrgRole = '') => {
  const normalized = String(current || '').trim().toLowerCase();
  const normalizedViewer = String(viewerOrgRole || '').trim().toLowerCase();
  const assignable = ORG_ROLE_ASSIGNABLE_TARGETS[normalizedViewer] || [];
  const base = ORG_ROLE_OPTIONS.map((item) => ({
    ...item,
    disabled: item.key !== normalized && !assignable.includes(item.key)
  }));
  if (normalized === 'finance_lead') {
    return [
      { key: 'finance_lead', label: 'آمر مالی (قدیمی)', role: 'admin', disabled: false },
      ...base
    ];
  }
  return base;
};
const isDeactivatableUser = (user) => DEACTIVATABLE_ORG_ROLES.has(String(user?.orgRole || '').trim().toLowerCase());
const adminLevelLabel = (level) => (
  String(level || '').trim().toLowerCase() === 'finance_lead'
    ? 'آمر مالی (قدیمی)'
    : ADMIN_LEVEL_OPTIONS.find((item) => item.key === level)?.label || '-'
);
const userStatusLabel = (status) => USER_STATUS_OPTIONS.find((item) => item.key === status)?.label || status;
const permissionLabel = (permission) => PERMISSION_OPTIONS.find((item) => item.key === permission)?.label || permission;
const accessStatusLabel = (status) => ACCESS_STATUS_LABELS[String(status || '').trim().toLowerCase()] || '-';

const toDateTime = (value) => {
  if (!value) return '-';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('fa-AF-u-ca-persian');
  } catch {
    return '-';
  }
};

const uniquePermissions = (permissions = []) => Array.from(new Set((permissions || []).filter(Boolean)));

const isViewPermission = (permissionKey = '') => {
  const key = String(permissionKey || '').trim();
  if (!key) return false;
  return VIEW_PERMISSION_PATTERNS.some((pattern) => key.includes(pattern));
};

const groupModeFor = (groupPermissions = [], selected = new Set()) => {
  const permissions = groupPermissions.map((permission) => permission.key);
  const selectedCount = permissions.filter((permission) => selected.has(permission)).length;
  if (!selectedCount) return 'none';
  if (selectedCount === permissions.length) return 'manage';
  const viewPermissions = permissions.filter(isViewPermission);
  const selectedViewCount = viewPermissions.filter((permission) => selected.has(permission)).length;
  if (viewPermissions.length && selectedCount === selectedViewCount) return 'view';
  return 'custom';
};

const permissionsForGroupMode = (groupPermissions = [], mode = 'none') => {
  if (mode === 'manage') return groupPermissions.map((permission) => permission.key);
  if (mode === 'view') return groupPermissions.filter((permission) => isViewPermission(permission.key)).map((permission) => permission.key);
  return [];
};

const summarizePermissions = (permissions = [], max = 4) => {
  const selected = new Set(permissions || []);
  const groups = PERMISSION_GROUPS
    .map((group) => ({
      group,
      selectedCount: (group.permissions || []).filter((permission) => selected.has(permission.key)).length
    }))
    .filter((item) => item.selectedCount > 0);
  return {
    total: uniquePermissions(permissions).length,
    groups,
    visibleGroups: groups.slice(0, max),
    extraGroupsCount: Math.max(0, groups.length - max)
  };
};

function PermissionSummary({ permissions = [], compact = false }) {
  const summary = summarizePermissions(permissions, compact ? 3 : 5);
  if (!summary.total) return <span className="permission-summary-empty">بدون مجوز اضافی</span>;

  return (
    <div className={`permission-summary${compact ? ' compact' : ''}`}>
      <strong>{summary.total} مجوز</strong>
      <div className="permission-summary-groups">
        {summary.visibleGroups.map(({ group, selectedCount }) => (
          <span key={`summary-${group.key}`}>{group.label}: {selectedCount}</span>
        ))}
        {summary.extraGroupsCount > 0 && <span>+{summary.extraGroupsCount} گروه</span>}
      </div>
    </div>
  );
}

function PermissionManager({
  value = [],
  onChange,
  disabled = false,
  compact = false,
  idPrefix = 'permission',
  orgRole = 'student',
  users = [],
  currentUserId = ''
}) {
  const selected = useMemo(() => new Set(value || []), [value]);
  const [openGroups, setOpenGroups] = useState(() => new Set(compact ? [] : PERMISSION_GROUPS.slice(0, 2).map((group) => group.key)));
  const [showDetails, setShowDetails] = useState(!compact);
  const [query, setQuery] = useState('');
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const normalizedRole = normalizeOrgRole(orgRole, 'student');
  const availablePresets = useMemo(
    () => PERMISSION_PRESETS.filter((preset) => !preset.orgRoles?.length || preset.orgRoles.includes(normalizedRole)),
    [normalizedRole]
  );
  const copyCandidates = useMemo(() => (
    (Array.isArray(users) ? users : [])
      .filter((user) => user?._id && String(user._id) !== String(currentUserId || ''))
      .filter((user) => normalizeOrgRole(user.orgRole || '', '') === normalizedRole)
      .slice(0, 80)
  ), [users, currentUserId, normalizedRole]);

  const emit = (nextSet) => {
    if (typeof onChange === 'function') onChange(Array.from(nextSet));
  };

  const toggleGroupOpen = (groupKey) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const togglePermission = (permissionKey, checked) => {
    const next = new Set(selected);
    if (checked) next.add(permissionKey);
    else next.delete(permissionKey);
    emit(next);
  };

  const toggleGroupPermissions = (permissions = [], checked) => {
    const next = new Set(selected);
    permissions.forEach((permission) => {
      if (checked) next.add(permission.key);
      else next.delete(permission.key);
    });
    emit(next);
  };

  const setGroupMode = (groupPermissions = [], mode = 'none') => {
    const groupKeys = new Set(groupPermissions.map((permission) => permission.key));
    const next = new Set(selected);
    groupKeys.forEach((permission) => next.delete(permission));
    permissionsForGroupMode(groupPermissions, mode).forEach((permission) => next.add(permission));
    emit(next);
  };

  const applyPreset = (presetKey = '') => {
    const preset = PERMISSION_PRESETS.find((item) => item.key === presetKey);
    if (preset) emit(new Set(preset.permissions || []));
  };

  const copyFromUser = (userId = '') => {
    const source = (Array.isArray(users) ? users : []).find((user) => String(user?._id || '') === String(userId || ''));
    if (source) emit(new Set(source.permissions || []));
  };

  const clearAll = () => emit(new Set());
  const expandSelectedGroups = () => {
    const next = new Set();
    PERMISSION_GROUPS.forEach((group) => {
      if ((group.permissions || []).some((permission) => selected.has(permission.key))) next.add(group.key);
    });
    setOpenGroups(next);
    setShowDetails(true);
  };

  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return PERMISSION_GROUPS;
    return PERMISSION_GROUPS
      .map((group) => {
        const labelMatch = String(group.label || '').toLowerCase().includes(normalizedQuery);
        const permissions = (group.permissions || []).filter((permission) => (
          labelMatch
          || String(permission.label || '').toLowerCase().includes(normalizedQuery)
          || String(permission.key || '').toLowerCase().includes(normalizedQuery)
        ));
        return labelMatch ? group : { ...group, permissions };
      })
      .filter((group) => (group.permissions || []).length > 0);
  }, [normalizedQuery]);

  return (
    <div className={`permission-manager${compact ? ' compact' : ''}`}>
      <div className="permission-manager-toolbar">
        <PermissionSummary permissions={value} compact={compact} />
        <div className="permission-manager-actions">
          <select value="" disabled={disabled || !availablePresets.length} onChange={(event) => { applyPreset(event.target.value); event.target.value = ''; }}>
            <option value="">قالب آماده</option>
            {availablePresets.map((preset) => (
              <option key={`${idPrefix}-preset-${preset.key}`} value={preset.key}>{preset.label}</option>
            ))}
          </select>
          <select value="" disabled={disabled || !copyCandidates.length} onChange={(event) => { copyFromUser(event.target.value); event.target.value = ''; }}>
            <option value="">کپی از کاربر</option>
            {copyCandidates.map((user) => (
              <option key={`${idPrefix}-copy-${user._id}`} value={user._id}>{(user.name || user.email || 'کاربر')} - {orgRoleLabel(user.orgRole)}</option>
            ))}
          </select>
          <button type="button" onClick={clearAll} disabled={disabled || !value.length}>پاک‌سازی</button>
          <button type="button" onClick={() => setShowDetails((prev) => !prev)}>{showDetails ? 'بستن جزئیات' : 'تنظیم جزئی'}</button>
        </div>
      </div>

      {showDetails ? (
        <div className="permission-manager-details">
          <div className="permission-manager-search">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجو در صلاحیت‌ها: مالی، نمره، حاضری، ثبت‌نام..." />
            <button type="button" onClick={expandSelectedGroups}>نمایش انتخاب‌شده‌ها</button>
          </div>
          <div className={`permission-tree${compact ? ' compact' : ''}`}>
            {visibleGroups.map((group) => {
              const groupPermissions = group.permissions || [];
              const selectedCount = groupPermissions.filter((permission) => selected.has(permission.key)).length;
              const allSelected = selectedCount > 0 && selectedCount === groupPermissions.length;
              const isPartial = selectedCount > 0 && selectedCount < groupPermissions.length;
              const isOpen = openGroups.has(group.key);
              const mode = groupModeFor(groupPermissions, selected);

              return (
                <div key={`${idPrefix}-${group.key}`} className={`permission-group${isOpen ? ' is-open' : ''}`}>
                  <div className="permission-group-head">
                    <button type="button" className="permission-group-toggle" onClick={() => toggleGroupOpen(group.key)} aria-expanded={isOpen}>
                      <span className="permission-group-caret">{isOpen ? '-' : '+'}</span>
                      <span>{group.label}</span>
                      <small>{selectedCount}/{groupPermissions.length}</small>
                    </button>
                    <div className="permission-group-controls">
                      <select value={mode} disabled={disabled} onChange={(event) => setGroupMode(groupPermissions, event.target.value)}>
                        {PERMISSION_GROUP_MODES.map((item) => (
                          <option key={`${idPrefix}-${group.key}-${item.key}`} value={item.key}>{item.label}</option>
                        ))}
                        {mode === 'custom' && <option value="custom">تنظیم جزئی</option>}
                      </select>
                      <label className="permission-group-select">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          disabled={disabled}
                          ref={(node) => {
                            if (node) node.indeterminate = isPartial;
                          }}
                          onChange={(event) => toggleGroupPermissions(groupPermissions, event.target.checked)}
                        />
                        <span>همه</span>
                      </label>
                    </div>
                  </div>
                  {isOpen ? (
                    <div className="permission-group-body">
                      {groupPermissions.map((permission) => (
                        <label key={`${idPrefix}-${permission.key}`} className="permission-option">
                          <input type="checkbox" checked={selected.has(permission.key)} disabled={disabled} onChange={(event) => togglePermission(permission.key, event.target.checked)} />
                          <span>{permission.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!visibleGroups.length && <div className="permission-search-empty">موردی با این جست‌وجو پیدا نشد.</div>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const normalizeManagedUser = (user = {}) => {
  const resolvedOrgRole = deriveOrgRole(user);
  const compatibilityRole = compatibilityRoleForOrgRole(resolvedOrgRole);
  return {
    ...user,
    orgRole: resolvedOrgRole,
    role: compatibilityRole,
    adminLevel: compatibilityRole === 'admin' ? normalizeAdminLevel(user.adminLevel || resolvedOrgRole) : '',
    status: normalizeUserStatus(user.status || '', 'active'),
    permissions: uniquePermissions(user.permissions || [])
  };
};

const isPermissionsLocked = (orgRole = '') => LOCKED_PERMISSION_ORG_ROLES.has(normalizeOrgRole(orgRole, 'student'));

const sanitizePermissionsForOrgRole = (orgRole = '', permissions = []) => (
  isPermissionsLocked(orgRole) ? [] : uniquePermissions(permissions)
);

const resolveEffectivePermissions = (user = {}, explicitPermissions = []) => {
  const identity = typeof user === 'string'
    ? normalizeManagedUser({ orgRole: user, permissions: explicitPermissions })
    : normalizeManagedUser({
        ...user,
        permissions: explicitPermissions.length ? explicitPermissions : user.permissions
      });
  const defaults = ORG_ROLE_DEFAULT_PERMISSIONS[identity.orgRole] || [];
  if (isPermissionsLocked(identity.orgRole)) return expandLegacyPermissions(uniquePermissions(defaults));
  return expandLegacyPermissions(uniquePermissions([...defaults, ...identity.permissions]));
};

const matchesDirectorySection = (user = {}, sectionKey = 'all') => {
  const section = USER_DIRECTORY_SECTIONS.find((item) => item.key === sectionKey);
  if (!section) return true;
  return section.matches(user);
};

const adaptDraftForOrgRole = (draft = {}, orgRole = 'student') => {
  const nextOrgRole = normalizeOrgRole(orgRole, 'student');
  const nextDraft = {
    ...draft,
    orgRole: nextOrgRole,
    permissions: sanitizePermissionsForOrgRole(nextOrgRole, draft.permissions || [])
  };

  if (nextOrgRole !== 'student') nextDraft.grade = '';
  if (nextOrgRole !== 'instructor') nextDraft.subject = '';

  return nextDraft;
};

const createDraftForDirectorySection = (sectionKey = 'students', viewerOrgRole = '') => {
  const fallbackConfig = DIRECTORY_CREATE_CONFIG.students;
  const config = DIRECTORY_CREATE_CONFIG[sectionKey] || fallbackConfig;
  let defaultOrgRole = config.orgRole;
  if (sectionKey === 'management') {
    const assignable = ORG_ROLE_ASSIGNABLE_TARGETS[String(viewerOrgRole || '').trim().toLowerCase()] || [];
    const firstAssignable = ORG_ROLE_OPTIONS.find((item) => MANAGEMENT_ORG_ROLES.has(item.key) && assignable.includes(item.key));
    if (firstAssignable) defaultOrgRole = firstAssignable.key;
  }
  return createEditUserForm({ orgRole: defaultOrgRole });
};

const createGuardianLinkDraft = () => ({
  guardianUserId: '',
  guardianQuery: '',
  guardianName: '',
  guardianEmail: '',
  guardianPhone: '',
  guardianLinkedStudentCount: 0,
  guardianLinkedStudents: [],
  guardianHasMoreLinkedStudents: false,
  studentRef: '',
  studentQuery: '',
  studentName: '',
  studentEmail: '',
  studentMeta: '',
  relation: '',
  note: '',
  isPrimary: false
});

const roleGuideFor = (orgRole = 'student') => {
  const normalized = normalizeOrgRole(orgRole, 'student');

  if (normalized === 'student') {
    return {
      tone: 'student',
      eyebrow: 'بخش شاگردان',
      title: 'فرم ثبت شاگرد',
      description: 'برای شاگردان تمرکز اصلی روی نام، ایمیل، رمز موقت، صنف و وضعیت حساب است. فیلد مضمون در این نقش پنهان می‌شود.',
      focusItems: ['صنف / پایه', 'وضعیت حساب', 'آغاز دسترسی'],
      showPermissions: false,
      showGrade: true,
      gradeLabel: 'صنف / پایه',
      gradePlaceholder: 'مثل صنف ۷ یا پایه هشتم',
      showSubject: false
    };
  }

  if (normalized === 'instructor') {
    return {
      tone: 'instructor',
      eyebrow: 'بخش استادان',
      title: 'فرم ثبت استاد',
      description: 'برای استادان، مضمون و نقش سازمانی مهم‌تر است. فیلد صنف حذف می‌شود تا تمرکز روی امور تدریس و دسترسی‌ها بماند.',
      focusItems: ['مضمون', 'گزارش‌ها', 'نقش تدریسی'],
      showPermissions: true,
      showGrade: false,
      showSubject: true,
      subjectLabel: 'مضمون اصلی',
      subjectPlaceholder: 'مثل ریاضی، فزیک یا زبان'
    };
  }

  if (normalized === 'parent') {
    return {
      tone: 'parent',
      eyebrow: 'بخش سرپرستان',
      title: 'فرم حساب والد/سرپرست',
      description: 'برای سرپرستان، اطلاعات تماس و وضعیت حساب اهمیت دارد. فیلدهای آموزشی پنهان می‌شوند تا فرم ساده و متمرکز بماند.',
      focusItems: ['اطلاعات تماس', 'وضعیت حساب', 'پیوند با شاگرد'],
      showPermissions: false,
      showGrade: false,
      showSubject: false
    };
  }

  if (normalized === 'school_manager') {
    return {
      tone: 'management',
      eyebrow: 'بخش مدیریت و کارمندان',
      title: 'فرم حساب مدیر مکتب',
      description: 'برای مدیر مکتب تمرکز اصلی روی مدیریت کاربران، هماهنگی اجرایی، گزارش‌ها و نظارت عمومی بر نظم مکتب است. فیلدهای آموزشی پنهان می‌ماند و مجوزهای جزئی برای همین پست هم قابل تنظیم است.',
      focusItems: ['مدیریت کاربران', 'گزارش‌ها', 'تقسیم اوقات', 'دسترسی پست مدیر مکتب'],
      dutiesTitle: 'وظایف کلیدی مدیر مکتب',
      duties: [
        'نظارت بر نظم عمومی مکتب و هماهنگی امور روزانه میان بخش‌های اداری و آموزشی.',
        'پیگیری وضعیت کارمندان، شاگردان و نیازهای اجرایی مکتب با تکیه بر گزارش‌ها.',
        'هماهنگی با والدین و رهبری مکتب برای تصمیم‌های اجرایی و انضباطی.',
        'همراهی در مدیریت تقسیم اوقات، برنامه‌های عمومی و جریان خدمات اداری.'
      ],
      showPermissions: true,
      showGrade: false,
      showSubject: false
    };
  }

  if (normalized === 'academic_manager') {
    return {
      tone: 'management',
      eyebrow: 'بخش مدیریت و کارمندان',
      title: 'فرم حساب مدیر تدریسی',
      description: 'برای مدیر تدریسی تمرکز اصلی روی ثبت‌نام شاگردان، بررسی نتایج، هماهنگی امور درسی و مدیریت تقسیم اوقات است. این نقش می‌تواند کارهای آموزشی روزمره را بدون نیاز به دسترسی مالی پیش ببرد.',
      focusItems: ['ثبت‌نام شاگردان', 'نتایج و شقه‌ها', 'تقسیم اوقات', 'گزارش‌های آموزشی'],
      dutiesTitle: 'وظایف کلیدی مدیر تدریسی',
      duties: [
        'ثبت‌نام و پیگیری امور شاگردان در بخش‌های ثبت‌نام، مدیریت شاگردان و کارتابل آموزشی.',
        'بررسی نتایج امتحانات، شقه‌ها و گزارش‌های آموزشی برای نظارت بر کیفیت درسی.',
        'همکاری در تنظیم، بازبینی و نشر تقسیم اوقات روزانه و هفتگی استادان و صنف‌ها.',
        'هماهنگی با مدیر مکتب و سرمعلم برای اجرای منظم امور آموزشی و رفع نیازهای درسی.'
      ],
      showPermissions: true,
      showGrade: false,
      showSubject: false
    };
  }

  if (normalized === 'head_teacher') {
    return {
      tone: 'management',
      eyebrow: 'بخش مدیریت و کارمندان',
      title: 'فرم حساب سر معلم مکتب',
      description: 'برای سر معلم مکتب تمرکز اصلی روی کیفیت تدریس، نظارت درسی، گزارش‌های آموزشی و هماهنگی تقسیم اوقات است. این نقش می‌تواند مجوز پست سر معلم را هم در دسترسی‌های جزئی دریافت کند.',
      focusItems: ['مدیریت محتوا', 'گزارش‌های آموزشی', 'تقسیم اوقات', 'دسترسی پست سر معلم'],
      dutiesTitle: 'وظایف کلیدی سر معلم مکتب',
      duties: [
        'نظارت بر کیفیت تدریس، پلان درسی و آمادگی استادان در صنف‌ها.',
        'بررسی نتایج آموزشی، گزارش‌های درسی و نقاط نیازمند تقویت در مضامین.',
        'همکاری در تنظیم تقسیم اوقات، امتحانات و برنامه‌های آموزشی مکتب.',
        'راهنمایی استادان در بهبود روش تدریس و پیگیری معیارهای علمی.'
      ],
      showPermissions: true,
      showGrade: false,
      showSubject: false
    };
  }

  return {
    tone: 'management',
    eyebrow: 'بخش مدیریت و کارمندان',
    title: 'فرم حساب مدیریتی',
    description: 'در نقش‌های مدیریتی تمرکز اصلی روی نقش سازمانی، وضعیت حساب و مجوزها است. فیلدهای آموزشی به صورت خودکار حذف می‌شوند.',
    focusItems: ['مجوزها', 'نقش سازمانی', 'وضعیت حساب'],
    showPermissions: true,
    showGrade: false,
    showSubject: false
  };
};

function RoleGuidePanel({ guide, compact = false }) {
  if (!guide) return null;

  return (
    <div className={`role-guide-panel tone-${guide.tone || 'student'}${compact ? ' compact' : ''}`}>
      <span className="role-guide-eyebrow">{guide.eyebrow}</span>
      <strong>{guide.title}</strong>
      <p>{guide.description}</p>
      {Array.isArray(guide.focusItems) && guide.focusItems.length > 0 ? (
        <div className="role-guide-tags">
          {guide.focusItems.map((item) => (
            <span key={`${guide.title}-${item}`} className="role-guide-tag">{item}</span>
          ))}
        </div>
      ) : null}
      {Array.isArray(guide.duties) && guide.duties.length > 0 ? (
        <div className="role-guide-duties">
          <span className="role-guide-duties-title">{guide.dutiesTitle || 'شرح وظایف'}</span>
          <ul className="role-guide-duty-list">
            {guide.duties.map((item) => (
              <li key={`${guide.title}-duty-${item}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminUsers() {
  const viewerOrgRole = useMemo(
    () => String(localStorage.getItem('orgRole') || '').trim().toLowerCase(),
    []
  );
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const showMessage = (text = '', tone = 'info') => {
    setMessage(text);
    setMessageTone(text ? tone : 'info');
  };
  useEffect(() => {
    if (!message || messageTone === 'error' || messageTone === 'warning') return undefined;
    const timer = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [message, messageTone]);
  const [busyId, setBusyId] = useState('');
  const [openRowMenu, setOpenRowMenu] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState(() => (
    typeof window !== 'undefined' ? resolveWorkspaceTabFromHash(window.location.hash) : 'directory'
  ));
  const [activeDirectorySection, setActiveDirectorySection] = useState('all');
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [filters, setFilters] = useState({ q: '', orgRole: '', status: '' });
  const [form, setForm] = useState(() => createDraftForDirectorySection('students', viewerOrgRole));
  const [guardianLinkForm, setGuardianLinkForm] = useState(() => createGuardianLinkDraft());
  const [guardianLinkBusy, setGuardianLinkBusy] = useState(false);
  const [guardianUserOptions, setGuardianUserOptions] = useState([]);
  const [guardianUserBusy, setGuardianUserBusy] = useState(false);
  const [guardianUserMessage, setGuardianUserMessage] = useState('');
  const [guardianStudentOptions, setGuardianStudentOptions] = useState([]);
  const [guardianStudentBusy, setGuardianStudentBusy] = useState(false);
  const [guardianStudentMessage, setGuardianStudentMessage] = useState('');
  const [directoryVisibleCount, setDirectoryVisibleCount] = useState(DIRECTORY_LIST_INITIAL_COUNT);
  const [accessRequests, setAccessRequests] = useState([]);
  const [accessEditorRoleFilter, setAccessEditorRoleFilter] = useState('focus');
  const [accessEditorQuery, setAccessEditorQuery] = useState('');
  const [accessStatusFilter, setAccessStatusFilter] = useState('pending');
  const [accessBusyId, setAccessBusyId] = useState('');
  const [accessBulkBusy, setAccessBulkBusy] = useState(false);
  const [selectedAccessIds, setSelectedAccessIds] = useState([]);
  const [bulkDecisionNote, setBulkDecisionNote] = useState('');
  const [accessMessage, setAccessMessage] = useState('');
  const [accessDecisionModal, setAccessDecisionModal] = useState({
    open: false,
    mode: 'approve',
    item: null,
    note: ''
  });
  const [editModal, setEditModal] = useState({
    open: false,
    userId: '',
    busy: false,
    form: createEditUserForm()
  });

  const loadUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        headers: { ...getAuthHeaders() }
      });
      const result = await readApiResponse(res, 'خطا در دریافت کاربران');
      if (!result.success || !result.data?.success) {
        showMessage(result.message || result.data?.message || 'خطا در دریافت کاربران', 'error');
        setItems([]);
        return;
      }
      setItems((Array.isArray(result.data.items) ? result.data.items : []).map(normalizeManagedUser));
    } catch {
      showMessage('خطا در اتصال به سرور', 'error');
      setItems([]);
    }
  };

  const loadAccessRequests = async (status = accessStatusFilter) => {
    try {
      const query = encodeURIComponent(status || 'pending');
      const res = await fetch(`${API_BASE}/api/admin/access-requests?status=${query}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setAccessRequests([]);
        setSelectedAccessIds([]);
        setAccessMessage(data?.message || 'خطا در دریافت درخواست‌های دسترسی');
        return;
      }
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setAccessRequests(nextItems);
      setSelectedAccessIds((prev) => prev.filter((id) => nextItems.some(
        (item) => String(item?._id) === String(id) && String(item?.status || '') === 'pending'
      )));
      setAccessMessage('');
    } catch {
      setAccessRequests([]);
      setSelectedAccessIds([]);
      setAccessMessage('خطا در اتصال به سرور (درخواست دسترسی)');
    }
  };

  useEffect(() => {
    loadUsers();
    loadAccessRequests('pending');
  }, []);

  useEffect(() => {
    const syncWorkspaceTabFromHash = () => {
      setWorkspaceTab(resolveWorkspaceTabFromHash(window.location.hash));
    };

    syncWorkspaceTabFromHash();
    window.addEventListener('hashchange', syncWorkspaceTabFromHash);
    return () => window.removeEventListener('hashchange', syncWorkspaceTabFromHash);
  }, []);

  useEffect(() => {
    if (!accessDecisionModal.open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setAccessDecisionModal({ open: false, mode: 'approve', item: null, note: '' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [accessDecisionModal.open]);

  useEffect(() => {
    if (!editModal.open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setEditModal({ open: false, userId: '', busy: false, form: createEditUserForm() });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editModal.open]);

  useEffect(() => {
    if (!DIRECTORY_CREATE_SECTIONS.has(activeDirectorySection)) return;
    setForm(createDraftForDirectorySection(activeDirectorySection, viewerOrgRole));
    if (activeDirectorySection !== 'guardians') {
      setGuardianLinkForm(createGuardianLinkDraft());
    }
  }, [activeDirectorySection]);

  useEffect(() => {
    if (activeDirectorySection === 'all') return;
    setFilters((prev) => (prev.orgRole ? { ...prev, orgRole: '' } : prev));
  }, [activeDirectorySection]);

  useEffect(() => {
    setDirectoryVisibleCount(DIRECTORY_LIST_INITIAL_COUNT);
  }, [activeDirectorySection, filters.q, filters.orgRole, filters.status]);

  useEffect(() => {
    const query = String(guardianLinkForm.guardianQuery || '').trim();
    const selectedGuardianId = String(guardianLinkForm.guardianUserId || '').trim();
    const selectedGuardianLabel = String(guardianLinkForm.guardianName || guardianLinkForm.guardianQuery || '').trim();

    if (workspaceTab !== 'directory' || activeDirectorySection !== 'guardians') {
      setGuardianUserOptions([]);
      setGuardianUserBusy(false);
      setGuardianUserMessage('');
      return undefined;
    }

    if (!query) {
      setGuardianUserOptions([]);
      setGuardianUserBusy(false);
      setGuardianUserMessage('');
      return undefined;
    }

    if (query.length < 2) {
      setGuardianUserOptions([]);
      setGuardianUserBusy(false);
      setGuardianUserMessage('برای جستجوی والد/سرپرست حداقل دو حرف یا دو رقم بنویسید.');
      return undefined;
    }

    if (selectedGuardianId && query === selectedGuardianLabel) {
      setGuardianUserOptions([]);
      setGuardianUserBusy(false);
      setGuardianUserMessage('');
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    const loadGuardianUserOptions = async () => {
      setGuardianUserBusy(true);
      setGuardianUserMessage('');
      try {
        const encodedQuery = encodeURIComponent(query);
        const res = await fetch(`${API_BASE}/api/student-profiles/guardian-users/search?q=${encodedQuery}`, {
          headers: { ...getAuthHeaders() },
          signal: controller.signal
        });
        const result = await readApiResponse(res, 'دریافت فهرست والدین/سرپرستان ناموفق بود.');
        if (cancelled) return;
        if (!result.success || !result.data?.success) {
          setGuardianUserOptions([]);
          setGuardianUserMessage(result.message || result.data?.message || 'دریافت فهرست والدین/سرپرستان ناموفق بود.');
          return;
        }

        const nextItems = (Array.isArray(result.data.items) ? result.data.items : []).map((item) => ({
          id: String(item?.id || item?._id || ''),
          name: String(item?.name || '').trim(),
          email: String(item?.email || '').trim(),
          phone: String(item?.phone || '').trim(),
          linkedStudentCount: Number(item?.linkedStudentCount || 0),
          linkedStudents: Array.isArray(item?.linkedStudents) ? item.linkedStudents.map((student) => ({
            id: String(student?.id || ''),
            name: String(student?.name || '').trim(),
            classTitle: String(student?.classTitle || '').trim(),
            relation: String(student?.relation || '').trim(),
            isPrimary: Boolean(student?.isPrimary)
          })) : [],
          hasMoreLinkedStudents: Boolean(item?.hasMoreLinkedStudents)
        })).filter((item) => item.id);

        setGuardianUserOptions(nextItems);
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        setGuardianUserOptions([]);
        setGuardianUserMessage('خطا در دریافت فهرست والدین/سرپرستان');
      } finally {
        if (!cancelled) {
          setGuardianUserBusy(false);
        }
      }
    };

    loadGuardianUserOptions();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    workspaceTab,
    activeDirectorySection,
    guardianLinkForm.guardianQuery,
    guardianLinkForm.guardianUserId,
    guardianLinkForm.guardianName
  ]);

  useEffect(() => {
    const query = String(guardianLinkForm.studentQuery || '').trim();
    if (workspaceTab !== 'directory' || activeDirectorySection !== 'guardians' || !query) {
      setGuardianStudentOptions([]);
      setGuardianStudentBusy(false);
      setGuardianStudentMessage('');
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    const loadGuardianStudentOptions = async () => {
      setGuardianStudentBusy(true);
      setGuardianStudentMessage('');
      try {
        const encodedQuery = encodeURIComponent(query);
        const res = await fetch(`${API_BASE}/api/student-profiles/linkable-students/search?q=${encodedQuery}`, {
          headers: { ...getAuthHeaders() },
          signal: controller.signal
        });
        const result = await readApiResponse(res, 'دریافت فهرست متعلم‌ها ناموفق بود.');
        if (cancelled) return;
        if (!result.success || !result.data?.success) {
          setGuardianStudentOptions([]);
          setGuardianStudentMessage(result.message || result.data?.message || 'دریافت فهرست متعلم‌ها ناموفق بود.');
          return;
        }

        const nextItems = (Array.isArray(result.data.items) ? result.data.items : []).map((item) => ({
          studentRef: String(item?.studentId || ''),
          userId: String(item?.userId || ''),
          name: String(item?.fullName || '').trim(),
          email: String(item?.email || '').trim(),
          admissionNo: String(item?.admissionNo || '').trim(),
          meta: [
            item?.currentMembership?.schoolClass?.title,
            item?.currentMembership?.academicYear?.label || item?.currentMembership?.academicYear?.name,
            item?.admissionNo ? `نمبر اساس: ${item.admissionNo}` : ''
          ].filter(Boolean).join(' | '),
          grade: String(
            item?.currentMembership?.schoolClass?.title
            || item?.currentMembership?.academicYear?.label
            || item?.currentMembership?.academicYear?.name
            || item?.admissionNo
            || ''
          ).trim()
        })).filter((item) => item.studentRef);

        setGuardianStudentOptions(nextItems);
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        setGuardianStudentOptions([]);
        setGuardianStudentMessage('خطا در دریافت فهرست متعلم‌ها');
      } finally {
        if (!cancelled) {
          setGuardianStudentBusy(false);
        }
      }
    };

    loadGuardianStudentOptions();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [workspaceTab, activeDirectorySection, guardianLinkForm.studentQuery]);

  const switchWorkspaceTab = (nextTab) => {
    setWorkspaceTab(nextTab);
    if (typeof window === 'undefined') return;

    const { pathname, search } = window.location;
    const nextHash = nextTab === 'access' ? '#access-requests' : '';
    window.history.replaceState(null, '', `${pathname}${search}${nextHash}`);
  };

  const togglePermissionInForm = (permission) => {
    setForm((prev) => {
      if (isPermissionsLocked(prev.orgRole)) return prev;
      const next = new Set(prev.permissions || []);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return { ...prev, permissions: Array.from(next) };
    });
  };

  const togglePermissionInEditForm = (permission) => {
    setEditModal((prev) => {
      if (isPermissionsLocked(prev.form.orgRole)) return prev;
      const next = new Set(prev.form.permissions || []);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return {
        ...prev,
        form: {
          ...prev.form,
          permissions: Array.from(next)
        }
      };
    });
  };

  const handleCreate = async () => {
    showMessage('');
    const rolePayload = buildRoleRequestPayload(form.orgRole);
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      showMessage('نام، ایمیل و رمز عبور الزامی است.', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          email: form.email.trim(),
          ...rolePayload,
          status: normalizeUserStatus(form.status, 'active'),
          permissions: sanitizePermissionsForOrgRole(form.orgRole, form.permissions || [])
        })
      });
      const result = await readApiResponse(res, 'ایجاد کاربر ناموفق بود.');
      if (!result.success || !result.data?.success) {
        showMessage(result.message || result.data?.message || 'ایجاد کاربر ناموفق بود.', 'error');
        return;
      }
      setForm(createEditUserForm());
      showMessage('کاربر جدید ایجاد شد.', 'success');
      loadUsers();
    } catch {
      showMessage('خطا در ایجاد کاربر', 'error');
    }
  };

  const handleSectionCreate = async () => {
    showMessage('');
    const createSection = DIRECTORY_CREATE_SECTIONS.has(activeDirectorySection) ? activeDirectorySection : '';
    const config = DIRECTORY_CREATE_CONFIG[createSection] || null;

    if (!config) {
      showMessage('برای ساخت کاربر، یکی از بخش‌های شاگردان، استادان، والدین/سرپرستان یا مدیریت را انتخاب کنید.', 'error');
      return;
    }

    const requestedOrgRole = createSection === 'management'
      ? normalizeOrgRole(form.orgRole, config.orgRole)
      : config.orgRole;
    const draft = adaptDraftForOrgRole(form, requestedOrgRole);
    const rolePayload = buildRoleRequestPayload(requestedOrgRole);

    if (!draft.name.trim() || !draft.email.trim() || !draft.password.trim()) {
      showMessage('نام، ایمیل و رمز عبور الزامی است.', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          ...draft,
          name: draft.name.trim(),
          email: draft.email.trim(),
          ...rolePayload,
          status: normalizeUserStatus(draft.status, 'active'),
          grade: requestedOrgRole === 'student' ? String(draft.grade || '').trim() : '',
          subject: requestedOrgRole === 'instructor' ? String(draft.subject || '').trim() : '',
          permissions: sanitizePermissionsForOrgRole(requestedOrgRole, draft.permissions || [])
        })
      });
      const result = await readApiResponse(res, 'ایجاد کاربر ناموفق بود.');
      if (!result.success || !result.data?.success) {
        showMessage(result.message || result.data?.message || 'ایجاد کاربر ناموفق بود.', 'error');
        return;
      }

      const createdItem = normalizeManagedUser(result.data?.item || {});
      setForm(createDraftForDirectorySection(createSection, viewerOrgRole));
      if (createSection === 'guardians' && createdItem?._id) {
        setGuardianLinkForm({
          ...createGuardianLinkDraft(),
          guardianUserId: String(createdItem._id || ''),
          guardianQuery: String(createdItem.name || '').trim(),
          guardianName: String(createdItem.name || '').trim(),
          guardianEmail: String(createdItem.email || '').trim()
        });
        showMessage('حساب والد/سرپرست ساخته شد. حالا شاگرد مربوط را جستجو و ارتباط را ثبت کنید.', 'success');
      } else {
        showMessage(result.data?.message || 'کاربر جدید ایجاد شد.', 'success');
      }
      setCreateFormOpen(false);
      await loadUsers();
    } catch {
      showMessage('خطا در ایجاد کاربر', 'error');
    }
  };

  const handleGuardianLinkFieldChange = (field, value) => {
    setGuardianLinkForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectGuardianUser = (guardian = {}) => {
    const guardianId = String(guardian?.id || guardian?._id || '').trim();
    if (!guardianId) return;

    setGuardianUserOptions([]);
    setGuardianUserMessage('');
    setGuardianLinkForm((prev) => ({
      ...prev,
      guardianUserId: guardianId,
      guardianQuery: String(guardian?.name || '').trim() || String(guardian?.email || '').trim(),
      guardianName: String(guardian?.name || '').trim(),
      guardianEmail: String(guardian?.email || '').trim(),
      guardianPhone: String(guardian?.phone || '').trim(),
      guardianLinkedStudentCount: Number(guardian?.linkedStudentCount || 0),
      guardianLinkedStudents: Array.isArray(guardian?.linkedStudents) ? guardian.linkedStudents : [],
      guardianHasMoreLinkedStudents: Boolean(guardian?.hasMoreLinkedStudents)
    }));
  };

  const clearSelectedGuardianUser = () => {
    setGuardianLinkForm((prev) => ({
      ...prev,
      guardianUserId: '',
      guardianQuery: '',
      guardianName: '',
      guardianEmail: '',
      guardianPhone: '',
      guardianLinkedStudentCount: 0,
      guardianLinkedStudents: [],
      guardianHasMoreLinkedStudents: false
    }));
    setGuardianUserOptions([]);
    setGuardianUserMessage('');
  };

  const handleSelectStudentForGuardianLink = (student) => {
    const nextStudentRef = String(student?.studentRef || student?.studentId || '');
    if (!nextStudentRef) return;
    const studentLabel = String(student?.name || '').trim() || String(student?.email || '').trim();
    setGuardianLinkForm((prev) => ({
      ...prev,
      studentRef: nextStudentRef,
      studentQuery: studentLabel,
      studentName: studentLabel,
      studentEmail: String(student?.email || '').trim(),
      studentMeta: String(student?.meta || '').trim()
    }));
  };

  const clearSelectedGuardianStudent = () => {
    setGuardianLinkForm((prev) => ({
      ...prev,
      studentRef: '',
      studentQuery: '',
      studentName: '',
      studentEmail: '',
      studentMeta: ''
    }));
  };

  const handleLinkGuardianToStudent = async () => {
    const guardianUserId = String(guardianLinkForm.guardianUserId || '').trim();
    const studentRef = String(guardianLinkForm.studentRef || '').trim();
    const relation = String(guardianLinkForm.relation || '').trim();
    const note = String(guardianLinkForm.note || '').trim();

    showMessage('');
    if (!guardianUserId) {
      showMessage('ابتدا حساب والد/سرپرست را انتخاب کنید.', 'error');
      return;
    }
    if (!studentRef) {
      showMessage('ابتدا شاگرد را از فهرست جستجو انتخاب کنید.', 'error');
      return;
    }

    setGuardianLinkBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/student-profiles/${encodeURIComponent(studentRef)}/guardians/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          userId: guardianUserId,
          relation,
          note,
          isPrimary: Boolean(guardianLinkForm.isPrimary)
        })
      });
      const result = await readApiResponse(res, 'وصل‌کردن والد/سرپرست به شاگرد ناموفق بود.');
      if (!result.success || !result.data?.success) {
        showMessage(result.message || result.data?.message || 'وصل‌کردن والد/سرپرست به شاگرد ناموفق بود.', 'error');
        return;
      }

      const selectedStudentSummary = {
        id: studentRef,
        name: String(guardianLinkForm.studentName || guardianLinkForm.studentQuery || '').trim(),
        classTitle: String(guardianLinkForm.studentMeta || '').trim(),
        relation,
        isPrimary: Boolean(guardianLinkForm.isPrimary)
      };

      setGuardianLinkForm((prev) => ({
        ...createGuardianLinkDraft(),
        guardianUserId: prev.guardianUserId,
        guardianQuery: prev.guardianName || prev.guardianQuery,
        guardianName: prev.guardianName,
        guardianEmail: prev.guardianEmail,
        guardianPhone: prev.guardianPhone,
        guardianLinkedStudentCount: Array.isArray(prev.guardianLinkedStudents)
          && prev.guardianLinkedStudents.some((item) => String(item?.id || '') === studentRef)
          ? Number(prev.guardianLinkedStudentCount || prev.guardianLinkedStudents.length || 0)
          : Number(prev.guardianLinkedStudentCount || prev.guardianLinkedStudents.length || 0) + 1,
        guardianLinkedStudents: Array.isArray(prev.guardianLinkedStudents)
          && prev.guardianLinkedStudents.some((item) => String(item?.id || '') === studentRef)
          ? prev.guardianLinkedStudents
          : [selectedStudentSummary, ...(Array.isArray(prev.guardianLinkedStudents) ? prev.guardianLinkedStudents : [])].slice(0, 3),
        guardianHasMoreLinkedStudents: Boolean(prev.guardianHasMoreLinkedStudents)
          || (
            Array.isArray(prev.guardianLinkedStudents)
            && !prev.guardianLinkedStudents.some((item) => String(item?.id || '') === studentRef)
            && Number(prev.guardianLinkedStudentCount || prev.guardianLinkedStudents.length || 0) + 1 > 3
          )
      }));
      showMessage(result.data?.message || 'والد/سرپرست با موفقیت به شاگرد وصل شد.', 'success');
      await loadUsers();
    } catch {
      showMessage('خطا در وصل‌کردن والد/سرپرست به شاگرد', 'error');
    } finally {
      setGuardianLinkBusy(false);
    }
  };

  const updateRole = async (id, orgRole) => {
    const nextOrgRole = normalizeOrgRole(orgRole, 'student');
    const rolePayload = buildRoleRequestPayload(nextOrgRole);
    setBusyId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(rolePayload)
      });
      const data = await res.json();
      if (!data?.success) {
        showMessage(data?.message || 'تغییر نقش ناموفق بود.', 'error');
        return;
      }

      if (isPermissionsLocked(nextOrgRole)) {
        const permissionsRes = await fetch(`${API_BASE}/api/admin/users/${id}/permissions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ permissions: [] })
        });
        const permissionsData = await permissionsRes.json();
        if (!permissionsData?.success) {
          showMessage(permissionsData?.message || 'نقش تغییر کرد اما پاک‌سازی مجوزها ناموفق بود.', 'warning');
          return;
        }
      }

      showMessage('نقش کاربر به‌روزرسانی شد.', 'success');
      loadUsers();
    } catch {
      showMessage('خطا در تغییر نقش', 'error');
    } finally {
      setBusyId('');
    }
  };

  const updatePermissions = async (id, permissions, orgRole = 'student') => {
    setBusyId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ permissions: sanitizePermissionsForOrgRole(orgRole, permissions) })
      });
      const data = await res.json();
      if (!data?.success) {
        showMessage(data?.message || 'به‌روزرسانی دسترسی‌ها ناموفق بود.', 'error');
        return;
      }
      showMessage('دسترسی‌های کاربر به‌روزرسانی شد.', 'success');
      loadUsers();
    } catch {
      showMessage('خطا در به‌روزرسانی دسترسی‌ها', 'error');
    } finally {
      setBusyId('');
    }
  };

  const updateStatus = async (id, status) => {
    setBusyId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status: normalizeUserStatus(status, 'active') })
      });
      const data = await res.json();
      if (!data?.success) {
        showMessage(data?.message || 'به‌روزرسانی وضعیت کاربر ناموفق بود.', 'error');
        return;
      }
      showMessage('وضعیت کاربر به‌روزرسانی شد.', 'success');
      loadUsers();
    } catch {
      showMessage('خطا در به‌روزرسانی وضعیت کاربر', 'error');
    } finally {
      setBusyId('');
    }
  };

  const openEditModal = (user) => {
    setEditModal({
      open: true,
      userId: String(user?._id || ''),
      busy: false,
      form: createEditUserForm(user)
    });
  };

  const closeEditModal = () => {
    setEditModal({ open: false, userId: '', busy: false, form: createEditUserForm() });
  };

  const submitUserEdit = async () => {
    const userId = String(editModal.userId || '').trim();
    const draft = editModal.form || {};
    if (!userId) return;

    const requestedOrgRole = normalizeOrgRole(draft.orgRole, 'student');
    const requiresEmail = requestedOrgRole !== 'student';

    if (!String(draft.name || '').trim()) {
      showMessage('نام کاربر الزامی است.', 'error');
      return;
    }

    if (requiresEmail && !String(draft.email || '').trim()) {
      showMessage('ایمیل برای این نقش الزامی است.', 'error');
      return;
    }

    setEditModal((prev) => ({ ...prev, busy: true }));
    const rolePayload = buildRoleRequestPayload(draft.orgRole);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: String(draft.name || '').trim(),
          email: String(draft.email || '').trim(),
          password: String(draft.password || '').trim(),
          ...rolePayload,
          status: normalizeUserStatus(draft.status, 'active'),
          grade: String(draft.grade || '').trim(),
          subject: String(draft.subject || '').trim(),
          permissions: sanitizePermissionsForOrgRole(draft.orgRole, draft.permissions || [])
        })
      });
      const result = await readApiResponse(res, 'به‌روزرسانی مشخصات کاربر ناموفق بود.');
      if (!result.success || !result.data?.success) {
        showMessage(result.message || result.data?.message || 'به‌روزرسانی مشخصات کاربر ناموفق بود.', 'error');
        setEditModal((prev) => ({ ...prev, busy: false }));
        return;
      }

      showMessage(result.data?.message || 'مشخصات کاربر به‌روزرسانی شد.', 'success');
      closeEditModal();
      loadUsers();
    } catch {
      showMessage('خطا در به‌روزرسانی مشخصات کاربر', 'error');
      setEditModal((prev) => ({ ...prev, busy: false }));
    }
  };

  const deactivateManagedUser = async (user) => {
    const userId = String(user?._id || '').trim();
    if (!userId) return;

    const role = String(user?.orgRole || '').trim().toLowerCase();
    const roleLabel = orgRoleLabel(role) || 'کاربر';
    const name = String(user?.name || `این ${roleLabel}`).trim();
    const impactNote = role === 'student'
      ? 'این عملیات در بخش مالی هم اعمال می‌شود.'
      : 'این عملیات در بخش کاربران اعمال می‌شود.';
    const confirmed = window.confirm(`آیا از غیرفعال‌سازی ${name} مطمئن هستید؟ ${impactNote}`);
    if (!confirmed) return;

    setBusyId(userId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/deactivate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ note: `غیرفعال‌سازی ${roleLabel} از پنل کاربران` })
      });
      const result = await readApiResponse(res, 'غیرفعال‌سازی کاربر ناموفق بود.');
      if (!result.success || !result.data?.success) {
        showMessage(result.message || result.data?.message || 'غیرفعال‌سازی کاربر ناموفق بود.', 'error');
        return;
      }

      showMessage(result.data?.message || 'کاربر غیرفعال شد.', 'success');
      await loadUsers();
    } catch {
      showMessage('خطا در غیرفعال‌سازی کاربر', 'error');
    } finally {
      setBusyId('');
    }
  };

  const pendingAccessIds = useMemo(
    () => accessRequests
      .filter((item) => String(item?.status || '').toLowerCase() === 'pending' && item?._id)
      .map((item) => String(item._id)),
    [accessRequests]
  );

  const selectedPendingAccessIds = useMemo(
    () => selectedAccessIds.filter((id) => pendingAccessIds.includes(String(id))),
    [selectedAccessIds, pendingAccessIds]
  );

  const allPendingAccessSelected = pendingAccessIds.length > 0 && selectedPendingAccessIds.length === pendingAccessIds.length;

  const toggleAccessRequestSelection = (id, checked) => {
    const value = String(id || '');
    if (!value) return;
    setSelectedAccessIds((prev) => {
      const next = new Set(prev.map((item) => String(item)));
      if (checked) next.add(value);
      else next.delete(value);
      return Array.from(next);
    });
  };

  const toggleSelectAllPendingAccess = () => {
    if (!pendingAccessIds.length) {
      setSelectedAccessIds([]);
      return;
    }
    setSelectedAccessIds(allPendingAccessSelected ? [] : pendingAccessIds);
  };

  const openAccessDecisionModal = (mode, item) => {
    if (!item?._id) return;
    setAccessDecisionModal({
      open: true,
      mode: mode === 'reject' ? 'reject' : 'approve',
      item,
      note: ''
    });
  };

  const closeAccessDecisionModal = () => {
    setAccessDecisionModal({ open: false, mode: 'approve', item: null, note: '' });
  };

  const submitAccessDecision = async () => {
    const item = accessDecisionModal.item;
    if (!item?._id) return;
    const mode = accessDecisionModal.mode === 'reject' ? 'reject' : 'approve';
    const note = String(accessDecisionModal.note || '').trim();

    if (mode === 'reject' && !note) {
      setAccessMessage('لطفاً دلیل رد را وارد کنید');
      return;
    }

    setAccessBusyId(item._id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/access-requests/${item._id}/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ note })
      });
      const data = await res.json();
      if (!data?.success) {
        setAccessMessage(data?.message || (mode === 'approve' ? 'تایید درخواست ناموفق بود' : 'رد درخواست ناموفق بود'));
        return;
      }

      setAccessMessage(mode === 'approve' ? 'درخواست دسترسی تایید شد' : 'درخواست دسترسی رد شد');
      closeAccessDecisionModal();
      loadAccessRequests(accessStatusFilter);
      if (mode === 'approve') loadUsers();
    } catch {
      setAccessMessage(mode === 'approve' ? 'خطا در تایید درخواست' : 'خطا در رد درخواست');
    } finally {
      setAccessBusyId('');
    }
  };

  const submitBulkAccessDecision = async (action) => {
    const mode = action === 'reject' ? 'reject' : 'approve';
    const ids = selectedPendingAccessIds;
    const note = String(bulkDecisionNote || '').trim();

    if (!ids.length) {
      setAccessMessage('حداقل یک درخواست در حالت در انتظار را انتخاب کنید');
      return;
    }
    if (mode === 'reject' && !note) {
      setAccessMessage('برای رد گروهی، دلیل رد را وارد کنید');
      return;
    }

    setAccessBulkBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/access-requests/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: mode, ids, note })
      });
      const data = await res.json();
      if (!data?.success) {
        setAccessMessage(data?.message || (mode === 'approve' ? 'تایید گروهی ناموفق بود' : 'رد گروهی ناموفق بود'));
        return;
      }

      const summary = data?.summary || {};
      const changed = Number(summary?.changedPermissionsCount || 0);
      const skipped = Number(summary?.skippedCount || 0);
      const done = mode === 'approve'
        ? Number(summary?.approvedCount || 0)
        : Number(summary?.rejectedCount || 0);

      setAccessMessage(
        mode === 'approve'
          ? `تایید گروهی انجام شد (تایید: ${done}${changed ? `، تغییر مجوز: ${changed}` : ''}${skipped ? `، رد یا رد خودکار: ${skipped}` : ''})`
          : `رد گروهی انجام شد (رد: ${done}${skipped ? `، رد یا رد خودکار: ${skipped}` : ''})`
      );

      setSelectedAccessIds([]);
      if (mode === 'reject') setBulkDecisionNote('');
      await loadAccessRequests(accessStatusFilter);
      if (mode === 'approve') await loadUsers();
    } catch {
      setAccessMessage(mode === 'approve' ? 'خطا در تایید گروهی' : 'خطا در رد گروهی');
    } finally {
      setAccessBulkBusy(false);
    }
  };

  const filteredItems = useMemo(() => {
    const query = String(filters.q || '').trim().toLowerCase();
    return items.filter((item) => {
      const orgRoleOk = !filters.orgRole || item.orgRole === filters.orgRole;
      const statusOk = !filters.status || item.status === filters.status;
      if (!query) return orgRoleOk && statusOk;
      const text = `${item.name || ''} ${item.email || ''}`.toLowerCase();
      return orgRoleOk && statusOk && text.includes(query);
    });
  }, [items, filters]);

  const directorySectionCounts = useMemo(
    () => USER_DIRECTORY_SECTIONS.reduce((summary, section) => {
      summary[section.key] = items.filter((item) => matchesDirectorySection(item, section.key)).length;
      return summary;
    }, {}),
    [items]
  );

  const activeDirectorySectionMeta = useMemo(
    () => USER_DIRECTORY_SECTIONS.find((section) => section.key === activeDirectorySection) || USER_DIRECTORY_SECTIONS[0],
    [activeDirectorySection]
  );

  const activeCreateSection = useMemo(
    () => (DIRECTORY_CREATE_SECTIONS.has(activeDirectorySection) ? activeDirectorySection : ''),
    [activeDirectorySection]
  );

  const activeCreateConfig = useMemo(
    () => (activeCreateSection ? DIRECTORY_CREATE_CONFIG[activeCreateSection] || null : null),
    [activeCreateSection]
  );

  const visibleUsers = useMemo(
    () => filteredItems.filter((item) => matchesDirectorySection(item, activeDirectorySection)),
    [filteredItems, activeDirectorySection]
  );

  const displayedUsers = useMemo(
    () => visibleUsers.slice(0, directoryVisibleCount),
    [visibleUsers, directoryVisibleCount]
  );

  const canShowMoreUsers = visibleUsers.length > displayedUsers.length;
  const canShowLessUsers = displayedUsers.length > DIRECTORY_LIST_INITIAL_COUNT;

  const managementRoleOptions = useMemo(
    () => {
      const assignable = ORG_ROLE_ASSIGNABLE_TARGETS[viewerOrgRole] || [];
      return ORG_ROLE_OPTIONS
        .filter((item) => MANAGEMENT_ORG_ROLES.has(item.key))
        .map((item) => ({ ...item, disabled: !assignable.includes(item.key) }));
    },
    [viewerOrgRole]
  );
  const managementRoleHasDisabled = managementRoleOptions.some((item) => item.disabled);

  const accessEditorMatchedUsers = useMemo(() => {
    const query = String(accessEditorQuery || '').trim().toLowerCase();
    return items.filter((user) => {
      const orgRole = String(user?.orgRole || '').trim().toLowerCase();
      const roleOk = accessEditorRoleFilter === 'all'
        ? true
        : accessEditorRoleFilter === 'focus'
          ? ACCESS_EDITOR_FOCUS_ROLES.has(orgRole)
          : orgRole === accessEditorRoleFilter;

      if (!roleOk) return false;
      if (!query) return true;

      const searchText = [
        user?.name,
        user?.email,
        orgRoleLabel(orgRole),
        roleLabel(user?.role),
        adminLevelLabel(user?.adminLevel)
      ].filter(Boolean).join(' ').toLowerCase();

      return searchText.includes(query);
    });
  }, [accessEditorQuery, accessEditorRoleFilter, items]);

  const accessEditorUsers = useMemo(
    () => accessEditorMatchedUsers.slice(0, 80),
    [accessEditorMatchedUsers]
  );

  const normalizedGuardianQuery = useMemo(
    () => String(guardianLinkForm.guardianQuery || '').trim().toLowerCase(),
    [guardianLinkForm.guardianQuery]
  );

  const guardianUserCandidates = guardianUserOptions;

  const normalizedStudentQuery = useMemo(
    () => String(guardianLinkForm.studentQuery || '').trim().toLowerCase(),
    [guardianLinkForm.studentQuery]
  );

  const studentLinkCandidates = guardianStudentOptions;

  const formRoleGuide = useMemo(() => roleGuideFor(form.orgRole), [form.orgRole]);
  const editFormRoleGuide = useMemo(() => roleGuideFor(editModal.form.orgRole), [editModal.form.orgRole]);

  const formEffectivePermissions = useMemo(
    () => resolveEffectivePermissions({ orgRole: form.orgRole, permissions: form.permissions || [] }),
    [form.orgRole, form.permissions]
  );

  const selectedGuardianUser = useMemo(
    () => (guardianLinkForm.guardianUserId
      ? {
          id: guardianLinkForm.guardianUserId,
          name: guardianLinkForm.guardianName || guardianLinkForm.guardianQuery,
          email: guardianLinkForm.guardianEmail,
          phone: guardianLinkForm.guardianPhone,
          linkedStudentCount: Number(guardianLinkForm.guardianLinkedStudentCount || 0),
          linkedStudents: Array.isArray(guardianLinkForm.guardianLinkedStudents) ? guardianLinkForm.guardianLinkedStudents : [],
          hasMoreLinkedStudents: Boolean(guardianLinkForm.guardianHasMoreLinkedStudents)
        }
      : null),
    [
      guardianLinkForm.guardianUserId,
      guardianLinkForm.guardianName,
      guardianLinkForm.guardianQuery,
      guardianLinkForm.guardianEmail,
      guardianLinkForm.guardianPhone,
      guardianLinkForm.guardianLinkedStudentCount,
      guardianLinkForm.guardianLinkedStudents,
      guardianLinkForm.guardianHasMoreLinkedStudents
    ]
  );

  const selectedGuardianStudent = useMemo(
    () => (guardianLinkForm.studentRef
      ? {
          id: guardianLinkForm.studentRef,
          name: guardianLinkForm.studentName || guardianLinkForm.studentQuery,
          email: guardianLinkForm.studentEmail,
          grade: guardianLinkForm.studentMeta,
          meta: guardianLinkForm.studentMeta
        }
      : null),
    [
      guardianLinkForm.studentRef,
      guardianLinkForm.studentName,
      guardianLinkForm.studentQuery,
      guardianLinkForm.studentEmail,
      guardianLinkForm.studentMeta
    ]
  );

  return (
    <div className="adminusers-page">
      <div className="adminusers-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>

        <h2>مدیریت کاربران</h2>
        <p>ایجاد کاربر جدید، تغییر نقش سازمانی، وضعیت کاربر و مدیریت دسترسی‌های جزئی.</p>

        {message && (
          <div className={`adminusers-toast adminusers-toast--${messageTone}`} role="status">
            <span className="adminusers-toast-icon" aria-hidden="true">
              {messageTone === 'success' ? '✓' : messageTone === 'error' ? '⛔' : messageTone === 'warning' ? '!' : 'ⓘ'}
            </span>
            <span className="adminusers-toast-text">{message}</span>
            <button type="button" className="adminusers-toast-close" onClick={() => setMessage('')} aria-label="بستن پیام">×</button>
          </div>
        )}

        <div className="adminusers-workspace-tabs">
          {USER_WORKSPACE_TABS.map((tab) => {
            const tabCount = tab.key === 'directory' ? items.length : accessRequests.length;
            const active = workspaceTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                className={`adminusers-workspace-tab${active ? ' is-active' : ''}`}
                onClick={() => switchWorkspaceTab(tab.key)}
              >
                <span className="workspace-tab-title">{tab.label}</span>
                <strong className="workspace-tab-count">{tabCount}</strong>
                <small className="workspace-tab-description">{tab.description}</small>
              </button>
            );
          })}
        </div>

        {workspaceTab === 'directory' && (
          <>
            <div className="directory-sections">
              {USER_DIRECTORY_SECTIONS.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  className={`directory-section-tab${activeDirectorySection === section.key ? ' is-active' : ''}`}
                  onClick={() => setActiveDirectorySection(section.key)}
                >
                  <span>{section.label}</span>
                  <strong>{directorySectionCounts[section.key] || 0}</strong>
                  <small>{section.description}</small>
                </button>
              ))}
            </div>

            <div className="directory-section-head">
              <div>
                <h3>{activeDirectorySectionMeta.label}</h3>
                <p>{activeDirectorySectionMeta.description}</p>
              </div>
              <div className="directory-section-stat">
                <strong>{visibleUsers.length}</strong>
                <span>نمایش‌شده از {directorySectionCounts[activeDirectorySectionMeta.key] || 0}</span>
              </div>
              <button
                type="button"
                className={`create-form-toggle${createFormOpen ? ' is-open' : ''}`}
                onClick={() => setCreateFormOpen((prev) => !prev)}
              >
                {createFormOpen ? '× بستن فرم' : '+ کاربر جدید'}
              </button>
            </div>

            {createFormOpen && (activeCreateConfig ? (
              <div className="adminusers-form">
                <div className="directory-form-head">
                  <div>
                    <h4>{activeCreateConfig.label}</h4>
                    <p>{activeCreateConfig.helper}</p>
                  </div>
                  <span className={`directory-form-fixed-role${activeCreateSection === 'guardians' ? ' highlight' : ''}`}>
                    {activeCreateSection === 'management'
                      ? `نقش اداری: ${orgRoleLabel(form.orgRole)}`
                      : `نقش ثابت: ${orgRoleLabel(activeCreateConfig.orgRole)}`}
                  </span>
                </div>

                <RoleGuidePanel guide={formRoleGuide} compact />

                <div className="form-grid">
                  <input
                    type="text"
                    placeholder="نام کامل"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  <input
                    type="email"
                    placeholder="ایمیل"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                  <input
                    type="password"
                    placeholder="رمز عبور موقت"
                    value={form.password}
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  />
                  {activeCreateSection === 'management' ? (
                    <>
                      <select
                        value={form.orgRole}
                        onChange={(e) => setForm((prev) => adaptDraftForOrgRole(prev, e.target.value))}
                      >
                        {managementRoleOptions.map((opt) => (
                          <option key={opt.key} value={opt.key} disabled={opt.disabled}>
                            {opt.label}{opt.disabled ? ' (بالاتر از پست شما)' : ''}
                          </option>
                        ))}
                      </select>
                      {managementRoleHasDisabled ? (
                        <p className="postpick-hint">پست‌های خاکستری بالاتر یا هم‌سطح پست شما هستند و فقط ریاست عمومی می‌تواند آن‌ها را واگذار کند.</p>
                      ) : null}
                    </>
                  ) : null}
                  <select
                    value={form.status}
                    onChange={(e) => setForm((prev) => ({ ...prev, status: normalizeUserStatus(e.target.value, 'active') }))}
                  >
                    {USER_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                  {formRoleGuide.showGrade ? (
                    <input
                      type="text"
                      placeholder={formRoleGuide.gradePlaceholder || 'صنف / پایه'}
                      value={form.grade}
                      onChange={(e) => setForm((prev) => ({ ...prev, grade: e.target.value }))}
                    />
                  ) : null}
                  {formRoleGuide.showSubject ? (
                    <input
                      type="text"
                      placeholder={formRoleGuide.subjectPlaceholder || 'مضمون'}
                      value={form.subject}
                      onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                    />
                  ) : null}
                </div>

                {formRoleGuide.showPermissions ? (
                  <>
                    <div className="permissions-box">
                      <span>دسترسی‌های جزئی</span>
                      <div className="permissions-note">
                        {isPermissionsLocked(form.orgRole)
                          ? 'برای نقش‌های مالی، مجوزها از خود نقش سازمانی تعیین می‌شود و این بخش دستی نیست.'
                          : form.orgRole === 'general_president'
                            ? 'برای ریاست عمومی، مجوزهای پیش‌فرض فعال است و در کنار آن می‌توانید مجوزهای تکمیلی را هم انتخاب کنید.'
                            : 'مجوزهای انتخابی به مجوزهای پیش‌فرض همین نقش افزوده می‌شود.'}
                      </div>
                      {!isPermissionsLocked(form.orgRole) ? (
                        <PermissionManager
                          idPrefix="dedicated-form"
                          orgRole={form.orgRole}
                          users={items}
                          value={form.permissions || []}
                          onChange={(permissions) => setForm((prev) => ({ ...prev, permissions }))}
                        />
                      ) : null}
                    </div>

                    <div className="effective-permissions-preview">
                      <span>مجوزهای موثر کاربر جدید:</span>
                      <div className="effective-chip-wrap">
                        {formEffectivePermissions.map((permission) => (
                          <span key={`dedicated-form-${permission}`} className="effective-chip">
                            {permissionLabel(permission)}
                          </span>
                        ))}
                        {!formEffectivePermissions.length && (
                          <span className="effective-chip muted">بدون مجوز ویژه</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="form-actions">
                  <button type="button" onClick={handleSectionCreate}>{activeCreateConfig.submitLabel}</button>
                </div>
              </div>
            ) : (
              <div className="adminusers-form directory-create-placeholder">
                <strong>ثبت کاربر از تب تخصصی انجام می‌شود</strong>
                <p>برای جلوگیری از اشتباه، هر نوع حساب فقط از داخل بخش خودش ساخته می‌شود. یکی از بخش‌های زیر را انتخاب کنید.</p>
                <div className="directory-create-actions">
                  {USER_DIRECTORY_SECTIONS.filter((section) => DIRECTORY_CREATE_SECTIONS.has(section.key)).map((section) => (
                    <button
                      key={`jump-${section.key}`}
                      type="button"
                      className="directory-create-action"
                      onClick={() => setActiveDirectorySection(section.key)}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {activeDirectorySection === 'guardians' && (
              <div className="adminusers-form guardian-link-panel">
                <div className="directory-form-head">
                  <div>
                    <h4>وصل‌کردن والد به شاگرد</h4>
                    <p>پس از ساخت حساب والد/سرپرست، از همین بخش او را به شاگرد مربوط وصل کنید و نسبت خانوادگی را هم ثبت کنید.</p>
                  </div>
                  <span className="directory-form-fixed-role highlight">
                    {selectedGuardianUser ? `انتخاب‌شده: ${selectedGuardianUser.name}` : 'پیوند والد و شاگرد'}
                  </span>
                </div>

                <div className="guardian-link-grid">
                  <div className="guardian-link-block">
                    <label className="guardian-link-label" htmlFor="guardian-link-user-query">
                      جست‌وجوی والد/سرپرست
                    </label>
                    <input
                      id="guardian-link-user-query"
                      type="text"
                      placeholder="نام، ایمیل یا شماره تماس والد را بنویسید"
                      value={guardianLinkForm.guardianQuery}
                      onChange={(e) => setGuardianLinkForm((prev) => ({
                        ...prev,
                        guardianQuery: e.target.value,
                        guardianUserId: '',
                        guardianName: '',
                        guardianEmail: '',
                        guardianPhone: '',
                        guardianLinkedStudentCount: 0,
                        guardianLinkedStudents: [],
                        guardianHasMoreLinkedStudents: false
                      }))}
                    />
                    {selectedGuardianUser ? (
                      <div className="guardian-link-selected-card guardian-link-selected-card-rich">
                        <strong>{selectedGuardianUser.name}</strong>
                        <small>{selectedGuardianUser.email || selectedGuardianUser.phone || 'بدون راه تماس'}</small>
                        <div className="guardian-link-summary-line">
                          <span>
                            {selectedGuardianUser.linkedStudentCount
                              ? `${selectedGuardianUser.linkedStudentCount} شاگرد از قبل وصل است`
                              : 'هنوز شاگردی به این والد وصل نشده است'}
                          </span>
                          {selectedGuardianUser.phone ? <span>{selectedGuardianUser.phone}</span> : null}
                        </div>
                        {selectedGuardianUser.linkedStudents?.length ? (
                          <div className="guardian-user-linked-preview">
                            {selectedGuardianUser.linkedStudents.map((student) => (
                              <span key={`selected-guardian-student-${student.id || student.name}`}>
                                {student.name}
                              </span>
                            ))}
                            {selectedGuardianUser.hasMoreLinkedStudents ? <span>...</span> : null}
                          </div>
                        ) : null}
                        <button type="button" className="guardian-link-clear" onClick={clearSelectedGuardianUser}>
                          تغییر والد
                        </button>
                      </div>
                    ) : !normalizedGuardianQuery ? (
                      <div className="guardian-link-hint">
                        برای پیدا کردن والد، بخشی از نام، ایمیل یا شماره تماس را بنویسید.
                      </div>
                    ) : null}
                    {guardianUserBusy ? (
                      <div className="guardian-link-hint">در حال دریافت فهرست والدین/سرپرستان...</div>
                    ) : null}
                    {guardianUserMessage ? (
                      <div className="guardian-link-hint">{guardianUserMessage}</div>
                    ) : null}
                    {guardianUserCandidates.length ? (
                      <div className="guardian-user-candidates">
                        {guardianUserCandidates.map((item) => (
                          <button
                            key={`guardian-candidate-${item.id}`}
                            type="button"
                            className={`guardian-user-card${String(selectedGuardianUser?.id || '') === String(item.id) ? ' is-selected' : ''}`}
                            onClick={() => handleSelectGuardianUser(item)}
                          >
                            <strong>{item.name}</strong>
                            <small>{item.email || item.phone || 'بدون راه تماس'}</small>
                            <div className="guardian-user-card-meta">
                              {item.phone ? <span>{item.phone}</span> : null}
                              <span>{item.linkedStudentCount ? `${item.linkedStudentCount} شاگرد وصل است` : 'بدون شاگرد وصل‌شده'}</span>
                            </div>
                            {item.linkedStudents?.length ? (
                              <div className="guardian-user-linked-preview">
                                {item.linkedStudents.map((student) => (
                                  <span key={`guardian-linked-${item.id}-${student.id || student.name}`}>
                                    {student.name}
                                  </span>
                                ))}
                                {item.hasMoreLinkedStudents ? <span>...</span> : null}
                              </div>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {normalizedGuardianQuery && normalizedGuardianQuery.length >= 2 && !guardianUserBusy && !guardianUserMessage && !guardianUserCandidates.length && !selectedGuardianUser ? (
                      <div className="guardian-link-hint">والدی با این جست‌وجو پیدا نشد.</div>
                    ) : null}
                  </div>

                  <div className="guardian-link-block">
                    <label className="guardian-link-label" htmlFor="guardian-link-student-query">
                      جستجوی شاگرد
                    </label>
                    <input
                      id="guardian-link-student-query"
                      type="text"
                      placeholder="نام، ایمیل، صنف یا نمبر اساس شاگرد را بنویسید"
                      value={guardianLinkForm.studentQuery}
                      onChange={(e) => setGuardianLinkForm((prev) => ({
                        ...prev,
                        studentQuery: e.target.value,
                        studentRef: '',
                        studentName: '',
                        studentEmail: '',
                        studentMeta: ''
                      }))}
                    />
                    {selectedGuardianStudent ? (
                      <div className="guardian-link-selected-card">
                        <strong>{selectedGuardianStudent.name}</strong>
                        <small>
                          {selectedGuardianStudent.grade || selectedGuardianStudent.email || 'بدون مشخصات تکمیلی'}
                        </small>
                        <button type="button" className="guardian-link-clear" onClick={clearSelectedGuardianStudent}>
                          تغییر شاگرد
                        </button>
                      </div>
                    ) : null}
                    {!selectedGuardianStudent && !normalizedStudentQuery ? (
                      <div className="guardian-link-hint">
                        برای پیدا کردن شاگرد، بخشی از نام، ایمیل یا صنف را وارد کنید.
                      </div>
                    ) : null}
                    {guardianStudentBusy ? (
                      <div className="guardian-link-hint">در حال دریافت فهرست متعلم‌ها...</div>
                    ) : null}
                    {guardianStudentMessage ? (
                      <div className="guardian-link-hint">{guardianStudentMessage}</div>
                    ) : null}
                    {guardianStudentOptions.length ? (
                      <div className="guardian-student-candidates">
                        {guardianStudentOptions.map((item) => (
                          <button
                            key={`candidate-${item.studentRef}`}
                            type="button"
                            className={`guardian-student-card${String(selectedGuardianStudent?.id || '') === String(item.studentRef) ? ' is-selected' : ''}`}
                            onClick={() => handleSelectStudentForGuardianLink(item)}
                          >
                            <strong>{item.name}</strong>
                            <small>{item.grade || item.email || 'بدون مشخصات تکمیلی'}</small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {normalizedStudentQuery && !guardianStudentBusy && !guardianStudentMessage && !studentLinkCandidates.length && !selectedGuardianStudent ? (
                      <div className="guardian-link-hint">شاگردی با این جستجو پیدا نشد.</div>
                    ) : null}
                  </div>
                </div>

                <div className="guardian-link-fields">
                  <input
                    type="text"
                    placeholder="نسبت مثل پدر، مادر، برادر، سرپرست"
                    value={guardianLinkForm.relation}
                    onChange={(e) => handleGuardianLinkFieldChange('relation', e.target.value)}
                  />
                  <textarea
                    rows="3"
                    placeholder="یادداشت کوتاه درباره این ارتباط"
                    value={guardianLinkForm.note}
                    onChange={(e) => handleGuardianLinkFieldChange('note', e.target.value)}
                  />
                  <label className="guardian-primary-option">
                    <input
                      type="checkbox"
                      checked={guardianLinkForm.isPrimary}
                      onChange={(e) => handleGuardianLinkFieldChange('isPrimary', e.target.checked)}
                    />
                    <span>این والد به‌عنوان سرپرست اصلی ثبت شود</span>
                  </label>
                </div>

                <div className="form-actions">
                  <button type="button" onClick={handleLinkGuardianToStudent} disabled={guardianLinkBusy}>
                    {guardianLinkBusy ? 'در حال ثبت ارتباط...' : 'ثبت ارتباط والد با شاگرد'}
                  </button>
                </div>
              </div>
            )}

            <div className="adminusers-form legacy-adminusers-form" hidden>
              <RoleGuidePanel guide={formRoleGuide} />

              <div className="form-grid">
            <input
              type="text"
              placeholder="نام کامل"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              type="email"
              placeholder="ایمیل"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />
            <input
              type="password"
              placeholder="رمز عبور موقت"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            />
            <select
              value={form.orgRole}
              onChange={(e) => setForm((prev) => adaptDraftForOrgRole(prev, e.target.value))}
            >
              {ORG_ROLE_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            <select
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: normalizeUserStatus(e.target.value, 'active') }))}
            >
              {USER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="پایه یا صنف"
              hidden={!formRoleGuide.showGrade}
              disabled={!formRoleGuide.showGrade}
              value={form.grade}
              onChange={(e) => setForm((prev) => ({ ...prev, grade: e.target.value }))}
            />
            <input
              type="text"
              placeholder="مضمون"
              hidden={!formRoleGuide.showSubject}
              disabled={!formRoleGuide.showSubject}
              value={form.subject}
              onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
            />
          </div>

          <div className="permissions-box">
            <span>دسترسی‌های جزئی (اختیاری)</span>
            <div className="permissions-note">
              {isPermissionsLocked(form.orgRole)
                ? 'برای نقش‌های مالی، مجوزها از خود نقش سازمانی تعیین می‌شود و در این بخش دستی نیست.'
                : form.orgRole === 'general_president'
                  ? 'برای ریاست عمومی، مجوزهای پیش‌فرض اعمال می‌شود و مجوزهای اضافی هم قابل انتخاب است.'
                  : 'برای شاگرد و استاد، مجوزهای انتخابی به مجوزهای پیش‌فرض نقش اضافه می‌شود.'}
            </div>
            {!isPermissionsLocked(form.orgRole) ? (
              <PermissionManager
                idPrefix="legacy-form"
                orgRole={form.orgRole}
                users={items}
                value={form.permissions || []}
                onChange={(permissions) => setForm((prev) => ({ ...prev, permissions }))}
              />
            ) : null}
          </div>

          <div className="effective-permissions-preview">
            <span>مجوزهای موثر کاربر جدید:</span>
            <div className="effective-chip-wrap">
              {formEffectivePermissions.map((permission) => (
                <span key={`form-${permission}`} className="effective-chip">
                  {permissionLabel(permission)}
                </span>
              ))}
              {!formEffectivePermissions.length && (
                <span className="effective-chip muted">بدون مجوز ویژه</span>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={handleCreate}>ایجاد کاربر</button>
          </div>
        </div>

        <div className="adminusers-search">
          <div className={`search-grid${activeDirectorySection === 'all' ? '' : ' compact'}`}>
            <input
              type="text"
              placeholder="جستجو بر اساس نام یا ایمیل"
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
            />
            <select
              value={filters.orgRole}
              hidden={activeDirectorySection !== 'all'}
              disabled={activeDirectorySection !== 'all'}
              onChange={(e) => setFilters((prev) => ({ ...prev, orgRole: e.target.value }))}
            >
              <option value="">همه نقش‌های سازمانی</option>
              {ORG_ROLE_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="">همه وضعیت‌ها</option>
              {USER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
          </>
        )}

        {workspaceTab === 'access' && (
          <>
            <div className="access-editor-card">
              <div className="access-editor-head">
                <div>
                  <h3>ویرایش سطح دسترسی کاربران</h3>
                  <p>نقش سازمانی و مجوزهای جزئی کاربران را از همین بخش تنظیم کنید.</p>
                </div>
                <span className="active-level-pill">
                  {accessEditorMatchedUsers.length} کاربر
                </span>
              </div>

              <div className="access-editor-tools">
                <select
                  value={accessEditorRoleFilter}
                  onChange={(e) => setAccessEditorRoleFilter(e.target.value)}
                >
                  {ACCESS_EDITOR_ROLE_FILTER_OPTIONS.map((opt) => (
                    <option key={`access-editor-role-${opt.key}`} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
                <input
                  type="search"
                  value={accessEditorQuery}
                  onChange={(e) => setAccessEditorQuery(e.target.value)}
                  placeholder="جستجوی نام، ایمیل یا نقش"
                />
              </div>

              <div className="access-editor-list">
                {accessEditorUsers.map((user) => {
                  const permissionsLocked = isPermissionsLocked(user.orgRole);
                  const rowBusy = busyId === user._id;
                  const rowEffectivePermissions = resolveEffectivePermissions(user);

                  return (
                    <div key={`access-editor-${user._id}`} className="access-editor-row">
                      <div className="access-editor-user">
                        <strong>{user.name || '-'}</strong>
                        <small>{user.email || '-'}</small>
                        <PostBadge orgRole={user.orgRole} />
                      </div>

                      <label className="access-editor-role-select">
                        <span>سطح دسترسی</span>
                        <select
                          value={user.orgRole}
                          disabled={rowBusy}
                          onChange={(e) => updateRole(user._id, e.target.value)}
                        >
                          {orgRoleSelectOptions(user.orgRole, viewerOrgRole).map((opt) => (
                            <option key={`access-role-${user._id}-${opt.key}`} value={opt.key} disabled={opt.disabled}>
                              {opt.label}{opt.disabled ? ' (بالاتر از پست شما)' : ''}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="access-editor-permissions">
                        {!permissionsLocked ? (
                          <PermissionManager
                            compact
                            idPrefix={`access-editor-${user._id}`}
                            orgRole={user.orgRole}
                            users={items}
                            currentUserId={user._id}
                            value={user.permissions || []}
                            disabled={rowBusy}
                            onChange={(permissions) => updatePermissions(user._id, permissions, user.orgRole)}
                          />
                        ) : null}
                        <small className="adminlevel-hint">
                          {permissionsLocked
                            ? 'مجوزهای نقش مالی ثابت است و از همین نقش محاسبه می‌شود.'
                            : 'مجوزهای انتخابی به مجوزهای پیش‌فرض همین نقش افزوده می‌شود.'}
                        </small>
                      </div>

                      <div className="access-editor-effective">
                        <span>مجوزهای موثر</span>
                        <div className="effective-chip-wrap mini">
                          {rowEffectivePermissions.map((permission) => (
                            <span key={`access-editor-effective-${user._id}-${permission}`} className="effective-chip">
                              {permissionLabel(permission)}
                            </span>
                          ))}
                          {!rowEffectivePermissions.length && (
                            <span className="effective-chip muted">بدون مجوز ویژه</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!accessEditorUsers.length && (
                  <div className="access-editor-empty">کاربری با این فیلتر پیدا نشد.</div>
                )}
              </div>

              {accessEditorMatchedUsers.length > accessEditorUsers.length ? (
                <div className="access-editor-limit">
                  نمایش {accessEditorUsers.length} از {accessEditorMatchedUsers.length} کاربر. برای محدودتر شدن، جستجو یا فیلتر نقش را دقیق‌تر کنید.
                </div>
              ) : null}
            </div>

            <div id="access-requests" className="access-requests-card">
          <div className="access-requests-head">
            <h3>درخواست‌های دسترسی</h3>
            <div className="access-requests-tools">
              <select
                value={accessStatusFilter}
                onChange={(e) => {
                  const nextStatus = e.target.value;
                  setAccessStatusFilter(nextStatus);
                  setSelectedAccessIds([]);
                  loadAccessRequests(nextStatus);
                }}
              >
                <option value="pending">در انتظار</option>
                <option value="approved">تایید شده</option>
                <option value="rejected">رد شده</option>
                <option value="all">همه موارد</option>
              </select>
              <button type="button" className="matrix-ghost-btn" onClick={() => loadAccessRequests(accessStatusFilter)}>
                بروزرسانی
              </button>
            </div>
          </div>

          {accessMessage && <div className="access-requests-message">{accessMessage}</div>}

          <div className="access-bulk-panel">
            <label className="access-bulk-select-all">
              <input
                type="checkbox"
                checked={allPendingAccessSelected}
                disabled={!pendingAccessIds.length || accessBulkBusy}
                onChange={toggleSelectAllPendingAccess}
              />
              انتخاب همه موارد در انتظار ({pendingAccessIds.length})
            </label>
            <span className="access-bulk-count">انتخاب‌شده: {selectedPendingAccessIds.length}</span>
            <textarea
              rows="2"
              value={bulkDecisionNote}
              onChange={(e) => setBulkDecisionNote(e.target.value)}
              placeholder="یادداشت تصمیم گروهی (برای رد، الزامی)"
            />
            <div className="access-bulk-actions">
              <button
                type="button"
                className="access-action approve"
                disabled={!selectedPendingAccessIds.length || accessBulkBusy}
                onClick={() => submitBulkAccessDecision('approve')}
              >
                {accessBulkBusy ? 'در حال اجرا...' : 'تایید انتخاب‌شده'}
              </button>
              <button
                type="button"
                className="access-action reject"
                disabled={!selectedPendingAccessIds.length || accessBulkBusy}
                onClick={() => submitBulkAccessDecision('reject')}
              >
                {accessBulkBusy ? 'در حال اجرا...' : 'رد انتخاب‌شده'}
              </button>
            </div>
          </div>

          <div className="access-requests-list">
            <div className="access-request-row head">
              <span>انتخاب</span>
              <span>درخواست‌دهنده</span>
              <span>دسترسی</span>
              <span>مسیر</span>
              <span>وضعیت</span>
              <span>زمان</span>
              <span>اقدام</span>
            </div>

            {accessRequests.map((item) => {
              const isPending = String(item?.status || '') === 'pending';
              const rowBusy = accessBusyId === item?._id || accessBulkBusy;
              const requesterName = item?.requester?.name || '-';
              const requesterEmail = item?.requester?.email || '';
              const checked = selectedPendingAccessIds.includes(String(item?._id || ''));

              return (
                <div key={item._id} className="access-request-row">
                  <span className="access-request-select">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!isPending || rowBusy}
                      onChange={(e) => toggleAccessRequestSelection(item._id, e.target.checked)}
                    />
                  </span>
                  <div className="access-request-user">
                    <strong>{requesterName}</strong>
                    {requesterEmail ? <small>{requesterEmail}</small> : null}
                  </div>
                  <span>{permissionLabel(item.permission)}</span>
                  <span className="access-request-route">{item.route || '/'}</span>
                  <span className={`access-status-pill status-${item.status || 'pending'}`}>
                    {accessStatusLabel(item.status)}
                  </span>
                  <span>{toDateTime(item.createdAt)}</span>
                  <div className="access-request-actions">
                    <button
                      type="button"
                      className="access-action approve"
                      disabled={!isPending || rowBusy}
                      onClick={() => openAccessDecisionModal('approve', item)}
                    >
                      تایید
                    </button>
                    <button
                      type="button"
                      className="access-action reject"
                      disabled={!isPending || rowBusy}
                      onClick={() => openAccessDecisionModal('reject', item)}
                    >
                      رد
                    </button>
                  </div>
                </div>
              );
            })}

            {!accessRequests.length && (
              <div className="access-requests-empty">درخواستی برای نمایش وجود ندارد.</div>
            )}
          </div>
          {visibleUsers.length > DIRECTORY_LIST_INITIAL_COUNT && (
            <div className="adminusers-list-footer" hidden>
              <span className="adminusers-list-summary">
                نمایش {displayedUsers.length} از {visibleUsers.length} کاربر
              </span>
              <div className="adminusers-list-actions">
                {canShowMoreUsers && (
                  <button
                    type="button"
                    className="adminusers-list-toggle more"
                    onClick={() => setDirectoryVisibleCount((prev) => prev + DIRECTORY_LIST_STEP)}
                  >
                    بیشتر
                  </button>
                )}
                {canShowLessUsers && (
                  <button
                    type="button"
                    className="adminusers-list-toggle less"
                    onClick={() => setDirectoryVisibleCount(DIRECTORY_LIST_INITIAL_COUNT)}
                  >
                    کمتر
                  </button>
                )}
              </div>
            </div>
          )}
            </div>
          </>
        )}

        {workspaceTab === 'directory' && (
          <div className="adminusers-list adminusers-list--compact">
          {displayedUsers.map((user) => {
            const rowEffectivePermissions = resolveEffectivePermissions(user);
            const permissionsLocked = isPermissionsLocked(user.orgRole);
            const roleMeta = user.role === 'admin'
              ? `${roleLabel(user.role)} / ${adminLevelLabel(user.adminLevel)}`
              : roleLabel(user.role);
            const menuOpen = openRowMenu === user._id;
            const toggleMenu = () => setOpenRowMenu((prev) => (prev === user._id ? '' : user._id));

            return (
              <div key={user._id} className={`user-row-compact${menuOpen ? ' is-open' : ''}`}>
                <div className="user-row-main">
                  <span className="user-avatar" aria-hidden="true">{getInitials(user.name, user.email)}</span>
                  <div className="user-row-identity">
                    <strong>{user.name || '-'}</strong>
                    <small>{user.email || '-'}</small>
                  </div>
                  <PostBadge orgRole={user.orgRole} />
                  <span className={`user-status-badge status-${user.status}`}>{userStatusLabel(user.status)}</span>
                  <button
                    type="button"
                    className="user-row-kebab"
                    disabled={busyId === user._id}
                    onClick={toggleMenu}
                    aria-label="گزینه‌های کاربر"
                    aria-expanded={menuOpen}
                  >
                    ⋮
                  </button>
                </div>

                {menuOpen && (
                  <div className="user-row-menu">
                    <div className="user-row-menu-head">
                      <span>گزینه‌ها · سازگاری: {roleMeta}</span>
                      <button type="button" className="user-row-menu-close" onClick={toggleMenu} aria-label="بستن">×</button>
                    </div>

                    <div className="user-row-menu-grid">
                      <label className="user-row-menu-field">
                        <span>پست</span>
                        <select
                          value={user.orgRole}
                          disabled={busyId === user._id}
                          onChange={(e) => updateRole(user._id, e.target.value)}
                        >
                          {orgRoleSelectOptions(user.orgRole, viewerOrgRole).map((opt) => (
                            <option key={opt.key} value={opt.key} disabled={opt.disabled}>
                              {opt.label}{opt.disabled ? ' (بالاتر از پست شما)' : ''}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="user-row-menu-field">
                        <span>وضعیت</span>
                        <select
                          value={user.status}
                          disabled={busyId === user._id}
                          onChange={(e) => updateStatus(user._id, e.target.value)}
                        >
                          {USER_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>{opt.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="permissions-mini">
                      {!permissionsLocked ? (
                        <PermissionManager
                          compact
                          idPrefix={`user-row-${user._id}`}
                          orgRole={user.orgRole}
                          users={items}
                          currentUserId={user._id}
                          value={user.permissions || []}
                          disabled={busyId === user._id}
                          onChange={(permissions) => updatePermissions(user._id, permissions, user.orgRole)}
                        />
                      ) : null}
                      <small className="adminlevel-hint">
                        {permissionsLocked
                          ? `مجوزهای ${orgRoleLabel(user.orgRole)} از خود نقش سازمانی محاسبه می‌شود.`
                          : 'مجوزهای انتخابی به مجوزهای پیش‌فرض نقش افزوده می‌شود.'}
                      </small>
                      <div className="effective-chip-wrap mini">
                        {rowEffectivePermissions.map((permission) => (
                          <span key={`${user._id}-eff-${permission}`} className="effective-chip">
                            {permissionLabel(permission)}
                          </span>
                        ))}
                        {!rowEffectivePermissions.length && (
                          <span className="effective-chip muted">بدون مجوز ویژه</span>
                        )}
                      </div>
                    </div>

                    <div className="user-row-menu-actions">
                      <button
                        type="button"
                        className="user-edit-btn"
                        disabled={busyId === user._id}
                        onClick={() => openEditModal(user)}
                      >
                        ویرایش مشخصات
                      </button>
                      {isDeactivatableUser(user) && (
                        <button
                          type="button"
                          className="user-delete-btn"
                          disabled={busyId === user._id}
                          onClick={() => deactivateManagedUser(user)}
                        >
                          حذف کاربر (غیرفعال)
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {!visibleUsers.length && (
            <div className="adminusers-message">کاربری برای نمایش پیدا نشد.</div>
          )}
          </div>
        )}

        {workspaceTab === 'directory' && visibleUsers.length > DIRECTORY_LIST_INITIAL_COUNT && (
          <div className="adminusers-list-footer">
            <span className="adminusers-list-summary">
              نمایش {displayedUsers.length} از {visibleUsers.length} کاربر
            </span>
            <div className="adminusers-list-actions">
              {canShowMoreUsers && (
                <button
                  type="button"
                  className="adminusers-list-toggle more"
                  onClick={() => setDirectoryVisibleCount((prev) => prev + DIRECTORY_LIST_STEP)}
                >
                  بیشتر
                </button>
              )}
              {canShowLessUsers && (
                <button
                  type="button"
                  className="adminusers-list-toggle less"
                  onClick={() => setDirectoryVisibleCount(DIRECTORY_LIST_INITIAL_COUNT)}
                >
                  کمتر
                </button>
              )}
            </div>
          </div>
        )}

        {editModal.open && (
          <div className="access-modal-backdrop" onClick={closeEditModal}>
            <div className="access-modal-card edit-user-modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="access-modal-head">
                <h3>ویرایش مشخصات کاربر</h3>
                <button type="button" className="access-modal-close" onClick={closeEditModal}>
                  ×
                </button>
              </div>
              <div className="access-modal-body">
                <RoleGuidePanel guide={editFormRoleGuide} compact />
                <div className="edit-user-modal-note">
                  از این بخش می‌توانید نام، ایمیل، رمز جدید، نقش سازمانی، وضعیت، پایه، مضمون و مجوزهای کاربر را یک‌جا اصلاح کنید.
                </div>
                <div className="edit-user-modal-form">
                  <input
                    type="text"
                    placeholder="نام کامل"
                    value={editModal.form.name}
                    onChange={(e) => setEditModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, name: e.target.value }
                    }))}
                  />
                  <input
                    type="email"
                    placeholder="ایمیل"
                    value={editModal.form.email}
                    onChange={(e) => setEditModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, email: e.target.value }
                    }))}
                  />
                  <input
                    type="password"
                    placeholder="رمز جدید (اختیاری)"
                    value={editModal.form.password}
                    onChange={(e) => setEditModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, password: e.target.value }
                    }))}
                  />
                  <select
                    value={editModal.form.orgRole}
                    onChange={(e) => setEditModal((prev) => ({
                      ...prev,
                      form: adaptDraftForOrgRole(prev.form, e.target.value)
                    }))}
                  >
                    {orgRoleSelectOptions(editModal.form.orgRole, viewerOrgRole).map((opt) => (
                      <option key={`edit-${opt.key}`} value={opt.key} disabled={opt.disabled}>
                        {opt.label}{opt.disabled ? ' (بالاتر از پست شما)' : ''}
                      </option>
                    ))}
                  </select>
                  <select
                    value={editModal.form.status}
                    onChange={(e) => setEditModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, status: normalizeUserStatus(e.target.value, 'active') }
                    }))}
                  >
                    {USER_STATUS_OPTIONS.map((opt) => (
                      <option key={`edit-status-${opt.key}`} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="پایه یا صنف"
                    hidden={!editFormRoleGuide.showGrade}
                    disabled={!editFormRoleGuide.showGrade}
                    value={editModal.form.grade}
                    onChange={(e) => setEditModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, grade: e.target.value }
                    }))}
                  />
                  <input
                    type="text"
                    placeholder="مضمون"
                    hidden={!editFormRoleGuide.showSubject}
                    disabled={!editFormRoleGuide.showSubject}
                    value={editModal.form.subject}
                    onChange={(e) => setEditModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, subject: e.target.value }
                    }))}
                  />
                </div>

                <div className="permissions-box edit-user-permissions-box">
                  <span>مجوزهای دسترسی</span>
                  <div className="permissions-note">
                    {isPermissionsLocked(editModal.form.orgRole)
                      ? 'برای نقش‌های مالی، مجوزها از خود نقش سازمانی تعیین می‌شود و در این بخش دستی نیست.'
                      : 'مجوزهای انتخابی به مجوزهای پیش‌فرض نقش افزوده می‌شود.'}
                  </div>
                  {!isPermissionsLocked(editModal.form.orgRole) ? (
                    <PermissionManager
                      idPrefix="edit-permission"
                      orgRole={editModal.form.orgRole}
                      users={items}
                      currentUserId={editModal.user?._id || ''}
                      value={editModal.form.permissions || []}
                      onChange={(permissions) => setEditModal((prev) => ({
                        ...prev,
                        form: { ...prev.form, permissions }
                      }))}
                    />
                  ) : null}
                  <div className="effective-permissions-preview">
                    <span>مجوزهای موثر:</span>
                    <div className="effective-chip-wrap">
                      {resolveEffectivePermissions({
                        orgRole: editModal.form.orgRole,
                        permissions: editModal.form.permissions || []
                      }).map((permission) => (
                        <span key={`edit-effective-${permission}`} className="effective-chip">
                          {permissionLabel(permission)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="access-modal-actions">
                <button type="button" className="access-modal-btn ghost" onClick={closeEditModal}>
                  انصراف
                </button>
                <button
                  type="button"
                  className="access-modal-btn approve"
                  onClick={submitUserEdit}
                  disabled={editModal.busy}
                >
                  {editModal.busy ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
                </button>
              </div>
            </div>
          </div>
        )}

        {accessDecisionModal.open && accessDecisionModal.item && (
          <div className="access-modal-backdrop" onClick={closeAccessDecisionModal}>
            <div className="access-modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="access-modal-head">
                <h3>{accessDecisionModal.mode === 'approve' ? 'تایید درخواست دسترسی' : 'رد درخواست دسترسی'}</h3>
                <button type="button" className="access-modal-close" onClick={closeAccessDecisionModal}>
                  ×
                </button>
              </div>
              <div className="access-modal-body">
                <div className="access-modal-grid">
                  <div>
                    <span>درخواست‌دهنده:</span>
                    <strong>{accessDecisionModal.item?.requester?.name || '-'}</strong>
                  </div>
                  <div>
                    <span>ایمیل:</span>
                    <strong>{accessDecisionModal.item?.requester?.email || '-'}</strong>
                  </div>
                  <div>
                    <span>دسترسی:</span>
                    <strong>{permissionLabel(accessDecisionModal.item?.permission)}</strong>
                  </div>
                  <div>
                    <span>مسیر:</span>
                    <strong className="mono">{accessDecisionModal.item?.route || '/'}</strong>
                  </div>
                  <div>
                    <span>زمان درخواست:</span>
                    <strong>{toDateTime(accessDecisionModal.item?.createdAt)}</strong>
                  </div>
                  <div>
                    <span>وضعیت:</span>
                    <strong>{accessStatusLabel(accessDecisionModal.item?.status)}</strong>
                  </div>
                </div>
                {accessDecisionModal.item?.requestNote ? (
                  <div className="access-modal-note access-modal-note--request">
                    <span>یادداشت کاربر:</span>
                    <p>{accessDecisionModal.item.requestNote}</p>
                  </div>
                ) : null}
                <label className="access-modal-note-field">
                  <span>{accessDecisionModal.mode === 'approve' ? 'یادداشت تایید (اختیاری)' : 'دلیل رد (الزامی)'}</span>
                  <textarea
                    rows="4"
                    value={accessDecisionModal.note}
                    onChange={(e) => setAccessDecisionModal((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder={accessDecisionModal.mode === 'approve' ? 'مثلاً: برای وظیفه جدید تایید شد.' : 'دلیل رد را بنویسید...'}
                  />
                </label>
              </div>
              <div className="access-modal-actions">
                <button type="button" className="access-modal-btn ghost" onClick={closeAccessDecisionModal}>
                  انصراف
                </button>
                <button
                  type="button"
                  className={`access-modal-btn ${accessDecisionModal.mode === 'approve' ? 'approve' : 'reject'}`}
                  onClick={submitAccessDecision}
                  disabled={accessBusyId === accessDecisionModal.item?._id}
                >
                  {accessBusyId === accessDecisionModal.item?._id
                    ? 'در حال اجرا...'
                    : accessDecisionModal.mode === 'approve'
                      ? 'تایید نهایی'
                      : 'رد نهایی'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
