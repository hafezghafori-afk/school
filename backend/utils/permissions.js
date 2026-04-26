const ROLE_DEFAULT_PERMISSIONS = Object.freeze({
  admin: [
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
  ],
  instructor: [
    'manage_content',
    'view_reports'
  ],
  parent: [],
  student: []
});

const ORG_ROLE_DEFAULT_PERMISSIONS = Object.freeze({
  student: ROLE_DEFAULT_PERMISSIONS.student,
  parent: ROLE_DEFAULT_PERMISSIONS.parent,
  instructor: ROLE_DEFAULT_PERMISSIONS.instructor,
  finance_manager: ['manage_finance'],
  finance_lead: ['manage_finance', 'view_reports'],
  school_manager: ['manage_users', 'manage_enrollments', 'manage_memberships', 'manage_content', 'view_reports', 'view_schedule', 'manage_schedule', 'access_school_manager'],
  academic_manager: ['manage_enrollments', 'manage_memberships', 'view_schedule'],
  head_teacher: ['manage_content', 'view_reports', 'view_schedule', 'manage_schedule', 'access_head_teacher'],
  general_president: ROLE_DEFAULT_PERMISSIONS.admin
});

const ADMIN_LEVEL_DEFAULT_PERMISSIONS = Object.freeze({
  finance_manager: ORG_ROLE_DEFAULT_PERMISSIONS.finance_manager,
  finance_lead: ORG_ROLE_DEFAULT_PERMISSIONS.finance_lead,
  school_manager: ORG_ROLE_DEFAULT_PERMISSIONS.school_manager,
  academic_manager: ORG_ROLE_DEFAULT_PERMISSIONS.academic_manager,
  head_teacher: ORG_ROLE_DEFAULT_PERMISSIONS.head_teacher,
  general_president: ORG_ROLE_DEFAULT_PERMISSIONS.general_president
});

const ADMIN_LEVELS = ['finance_manager', 'finance_lead', 'school_manager', 'academic_manager', 'head_teacher', 'general_president'];
const INSTRUCTOR_ROLE_ALIASES = new Set(['instructor', 'teacher', 'professor']);

function normalizeAdminLevel(adminLevel = '', fallback = 'finance_manager') {
  const value = String(adminLevel || '').trim().toLowerCase();
  if (ADMIN_LEVELS.includes(value)) {
    return value;
  }
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  if (ADMIN_LEVELS.includes(normalizedFallback)) {
    return normalizedFallback;
  }
  return 'finance_manager';
}

function normalizeCompatibilityRole(role = '', fallback = 'student') {
  const normalized = String(role || '').trim().toLowerCase();
  if (INSTRUCTOR_ROLE_ALIASES.has(normalized)) return 'instructor';
  if (normalized === 'student' || normalized === 'parent' || normalized === 'admin') return normalized;

  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  if (INSTRUCTOR_ROLE_ALIASES.has(normalizedFallback)) return 'instructor';
  if (normalizedFallback === 'student' || normalizedFallback === 'parent' || normalizedFallback === 'admin') return normalizedFallback;
  return 'student';
}

function normalizeOrgRole(orgRole = '', fallback = '') {
  const normalized = String(orgRole || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ORG_ROLE_DEFAULT_PERMISSIONS, normalized)) {
    return normalized;
  }

  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ORG_ROLE_DEFAULT_PERMISSIONS, normalizedFallback)
    ? normalizedFallback
    : '';
}

function normalizeExplicitPermissions(explicitPermissions = []) {
  if (!Array.isArray(explicitPermissions)) return [];

  return explicitPermissions
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function buildPermissionContext(roleOrContext = 'student', explicitPermissions = [], adminLevel = '') {
  const input = roleOrContext && typeof roleOrContext === 'object' && !Array.isArray(roleOrContext)
    ? roleOrContext
    : {
        role: roleOrContext,
        explicitPermissions,
        adminLevel
      };

  const normalizedRole = normalizeCompatibilityRole(input.role || '', 'student');
  let normalizedOrgRole = normalizeOrgRole(input.orgRole || '');

  if (normalizedRole === 'admin') {
    const normalizedAdminLevel = String(input.adminLevel || '').trim().toLowerCase();
    if (ADMIN_LEVELS.includes(normalizedAdminLevel)) {
      normalizedOrgRole = normalizeOrgRole(normalizedAdminLevel, 'finance_manager');
    }
  }

  if (!normalizedOrgRole) {
    if (normalizedRole === 'admin') {
      normalizedOrgRole = normalizeOrgRole(
        normalizeAdminLevel(input.adminLevel || '', 'finance_manager'),
        'finance_manager'
      );
    } else if (normalizedRole === 'instructor') {
      normalizedOrgRole = 'instructor';
    } else if (normalizedRole === 'parent') {
      normalizedOrgRole = 'parent';
    } else {
      normalizedOrgRole = 'student';
    }
  }

  return {
    role: normalizedRole,
    orgRole: normalizedOrgRole,
    adminLevel: normalizedRole === 'admin'
      ? normalizeAdminLevel(input.adminLevel || normalizedOrgRole, 'finance_manager')
      : '',
    explicitPermissions: normalizeExplicitPermissions(
      input.explicitPermissions !== undefined ? input.explicitPermissions : input.permissions
    )
  };
}

function resolvePermissions(roleOrContext = 'student', explicitPermissions = [], adminLevel = '') {
  const context = buildPermissionContext(roleOrContext, explicitPermissions, adminLevel);
  const defaults = ORG_ROLE_DEFAULT_PERMISSIONS[context.orgRole] || [];

  if (context.orgRole === 'finance_manager' || context.orgRole === 'finance_lead') {
    return Array.from(new Set(defaults));
  }

  return Array.from(new Set([...defaults, ...context.explicitPermissions]));
}

module.exports = {
  ROLE_DEFAULT_PERMISSIONS,
  ORG_ROLE_DEFAULT_PERMISSIONS,
  ADMIN_LEVEL_DEFAULT_PERMISSIONS,
  ADMIN_LEVELS,
  normalizeAdminLevel,
  normalizeCompatibilityRole,
  normalizeOrgRole,
  buildPermissionContext,
  resolvePermissions
};
