const ADMIN_LEVELS = new Set(['finance_manager', 'finance_lead', 'school_manager', 'academic_manager', 'head_teacher', 'general_president']);
const GENERAL_PRESIDENT_PERMISSIONS = [
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

const normalizeAdminLevel = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ADMIN_LEVELS.has(normalized) ? normalized : '';
};

export const persistAuthSession = (data = {}) => {
  const role = String(data.role || '').trim().toLowerCase();
  const adminLevel = role === 'admin' ? normalizeAdminLevel(data.adminLevel || '') : '';
  const orgRole = role === 'admin'
    ? (adminLevel || String(data.orgRole || '').trim().toLowerCase() || '')
    : String(data.orgRole || '').trim().toLowerCase();

  const incomingPermissions = Array.isArray(data.effectivePermissions) ? data.effectivePermissions : [];
  const normalizedPermissions = role === 'admin' && adminLevel === 'general_president'
    ? Array.from(new Set([...GENERAL_PRESIDENT_PERMISSIONS, ...incomingPermissions]))
    : incomingPermissions;

  localStorage.setItem('token', data.token || '');
  localStorage.setItem('userId', String(data.userId || ''));
  localStorage.setItem('userName', data.name || '');
  localStorage.setItem('role', role);
  localStorage.setItem('orgRole', orgRole);
  localStorage.setItem('status', data.status || '');
  localStorage.setItem('adminLevel', adminLevel);
  localStorage.setItem('avatarUrl', data.avatarUrl || '');
  localStorage.setItem('effectivePermissions', JSON.stringify(normalizedPermissions));
  localStorage.setItem('lastLoginAt', data.lastLoginAt || '');
};
