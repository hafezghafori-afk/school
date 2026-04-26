const { normalizeAdminLevel, ADMIN_LEVELS } = require('./permissions');

const ORG_ROLES = ['student', 'parent', 'instructor', 'finance_manager', 'finance_lead', 'school_manager', 'academic_manager', 'head_teacher', 'general_president'];
const USER_STATUSES = ['active', 'inactive', 'suspended'];
const COMPATIBILITY_ROLES = ['student', 'parent', 'instructor', 'teacher', 'professor', 'admin'];
const INSTRUCTOR_ROLE_ALIASES = new Set(['instructor', 'teacher', 'professor']);
const ADMIN_ORG_ROLES = new Set(['finance_manager', 'finance_lead', 'school_manager', 'academic_manager', 'head_teacher', 'general_president']);
const FINANCE_ORG_ROLES = new Set(['finance_manager', 'finance_lead', 'general_president']);

function normalizeUserStatus(value = '', fallback = 'active') {
  const normalized = String(value || '').trim().toLowerCase();
  if (USER_STATUSES.includes(normalized)) return normalized;
  const nextFallback = String(fallback || '').trim().toLowerCase();
  return USER_STATUSES.includes(nextFallback) ? nextFallback : 'active';
}

function normalizeCompatibilityRole(value = '', fallback = 'student') {
  const normalized = String(value || '').trim().toLowerCase();
  if (INSTRUCTOR_ROLE_ALIASES.has(normalized)) return 'instructor';
  if (normalized === 'student' || normalized === 'parent' || normalized === 'admin') return normalized;

  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  if (INSTRUCTOR_ROLE_ALIASES.has(normalizedFallback)) return 'instructor';
  if (normalizedFallback === 'student' || normalizedFallback === 'parent' || normalizedFallback === 'admin') return normalizedFallback;
  return 'student';
}

function normalizeOrgRole(value = '', fallback = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (ORG_ROLES.includes(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return ORG_ROLES.includes(normalizedFallback) ? normalizedFallback : '';
}

function deriveOrgRole({ orgRole = '', role = 'student', adminLevel = '' } = {}, fallback = 'student') {
  const normalizedRole = normalizeCompatibilityRole(role, fallback);

  if (normalizedRole === 'admin') {
    const normalizedAdminLevel = String(adminLevel || '').trim().toLowerCase();
    if (ADMIN_LEVELS.includes(normalizedAdminLevel)) {
      return normalizeOrgRole(normalizedAdminLevel, 'finance_manager');
    }

    const explicitAdminRole = normalizeOrgRole(orgRole);
    if (ADMIN_ORG_ROLES.has(explicitAdminRole)) return explicitAdminRole;

    return 'finance_manager';
  }

  const explicit = normalizeOrgRole(orgRole);
  if (explicit) return explicit;
  if (normalizedRole === 'instructor') return 'instructor';
  if (normalizedRole === 'parent') return 'parent';
  return 'student';
}

function buildUserRoleState(input = {}) {
  const orgRole = deriveOrgRole(input, 'student');
  if (orgRole === 'student') {
    return { role: 'student', orgRole, adminLevel: '' };
  }
  if (orgRole === 'parent') {
    return { role: 'parent', orgRole, adminLevel: '' };
  }
  if (orgRole === 'instructor') {
    return { role: 'instructor', orgRole, adminLevel: '' };
  }
  return {
    role: 'admin',
    orgRole,
    adminLevel: normalizeAdminLevel(orgRole, 'finance_manager')
  };
}

function serializeUserIdentity(user = {}) {
  const parts = String(user?.name || '').trim().split(/\s+/).filter(Boolean);
  return {
    ...buildUserRoleState(user),
    status: normalizeUserStatus(user?.status || '', 'active'),
    firstName: user?.firstName || parts[0] || '',
    lastName: user?.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : '')
  };
}

function isKnownOrgRole(value = '') {
  return ORG_ROLES.includes(String(value || '').trim().toLowerCase());
}

function isKnownUserStatus(value = '') {
  return USER_STATUSES.includes(String(value || '').trim().toLowerCase());
}

function isKnownCompatibilityRole(value = '') {
  return COMPATIBILITY_ROLES.includes(String(value || '').trim().toLowerCase());
}

function isFinanceOrgRole(value = '') {
  return FINANCE_ORG_ROLES.has(String(value || '').trim().toLowerCase());
}

function normalizeFinanceOrgRole(value = '', fallback = 'finance_manager') {
  const normalized = normalizeOrgRole(value, fallback);
  if (FINANCE_ORG_ROLES.has(normalized)) return normalized;

  const normalizedFallback = normalizeOrgRole(fallback, 'finance_manager');
  return FINANCE_ORG_ROLES.has(normalizedFallback) ? normalizedFallback : 'finance_manager';
}

function resolveAdminOrgRole(user = {}, fallback = '') {
  const identity = serializeUserIdentity(user);
  if (identity.role !== 'admin') {
    return fallback ? normalizeOrgRole(fallback, '') : '';
  }
  return normalizeOrgRole(identity.orgRole || identity.adminLevel || '', '')
    || (fallback ? normalizeOrgRole(fallback, '') : '');
}

module.exports = {
  ORG_ROLES,
  USER_STATUSES,
  COMPATIBILITY_ROLES,
  ADMIN_ORG_ROLES,
  FINANCE_ORG_ROLES,
  normalizeUserStatus,
  normalizeCompatibilityRole,
  normalizeOrgRole,
  deriveOrgRole,
  buildUserRoleState,
  serializeUserIdentity,
  isKnownOrgRole,
  isKnownUserStatus,
  isKnownCompatibilityRole,
  isFinanceOrgRole,
  normalizeFinanceOrgRole,
  resolveAdminOrgRole
};
