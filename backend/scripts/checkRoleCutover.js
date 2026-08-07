const assert = require('assert');
const {
  ORG_ROLE_DEFAULT_PERMISSIONS,
  ADMIN_LEVEL_DEFAULT_PERMISSIONS,
  buildPermissionContext,
  resolvePermissions
} = require('../utils/permissions');
const {
  ORG_ROLES,
  buildUserRoleState,
  serializeUserIdentity
} = require('../utils/userRole');
const { expandLegacyPermissions } = require('../utils/permissionCatalog');

const sortList = (items = []) => [...items].sort();

assert.deepStrictEqual(
  sortList(ORG_ROLES),
  sortList(Object.keys(ORG_ROLE_DEFAULT_PERMISSIONS)),
  'ORG_ROLES and ORG_ROLE_DEFAULT_PERMISSIONS must stay in sync'
);

assert.deepStrictEqual(
  sortList(Object.keys(ADMIN_LEVEL_DEFAULT_PERMISSIONS)),
  sortList(['finance_manager', 'finance_lead', 'school_manager', 'academic_manager', 'head_teacher', 'general_president']),
  'finance admin levels must stay aligned with canonical org roles'
);

const expectedRoleStates = {
  student: { role: 'student', orgRole: 'student', adminLevel: '' },
  instructor: { role: 'instructor', orgRole: 'instructor', adminLevel: '' },
  finance_manager: { role: 'admin', orgRole: 'finance_manager', adminLevel: 'finance_manager' },
  finance_lead: { role: 'admin', orgRole: 'finance_lead', adminLevel: 'finance_lead' },
  academic_manager: { role: 'admin', orgRole: 'academic_manager', adminLevel: 'academic_manager' },
  general_president: { role: 'admin', orgRole: 'general_president', adminLevel: 'general_president' }
};

Object.entries(expectedRoleStates).forEach(([orgRole, expected]) => {
  assert.deepStrictEqual(
    buildUserRoleState({ orgRole }),
    expected,
    'buildUserRoleState should derive the canonical compatibility tuple from orgRole'
  );
});

assert.strictEqual(
  buildPermissionContext({ role: 'admin', adminLevel: 'finance_lead' }).orgRole,
  'finance_lead',
  'legacy adminLevel should still resolve to the matching orgRole'
);

assert.strictEqual(
  buildPermissionContext({ role: 'instructor' }).orgRole,
  'instructor',
  'legacy instructor role should resolve to instructor orgRole'
);

// Note: resolvePermissions expands each coarse legacy permission (e.g. `manage_finance`)
// into its full set of fine-grained permissions via expandLegacyPermissions, so the
// expected sets below are derived the same way rather than hardcoded, to avoid drifting
// out of sync every time the permission catalog grows.
assert.deepStrictEqual(
  sortList(resolvePermissions({ orgRole: 'finance_manager', explicitPermissions: ['manage_users', 'manage_content'] })),
  sortList(expandLegacyPermissions(ORG_ROLE_DEFAULT_PERMISSIONS.finance_manager)),
  'finance_manager should remain policy-locked to finance permissions only'
);

assert.deepStrictEqual(
  sortList(resolvePermissions({ role: 'admin', adminLevel: 'finance_lead', explicitPermissions: ['manage_users'] })),
  sortList(expandLegacyPermissions(ORG_ROLE_DEFAULT_PERMISSIONS.finance_lead)),
  'finance_lead should ignore extra explicit permissions during compatibility mode'
);

assert.deepStrictEqual(
  sortList(resolvePermissions({ orgRole: 'general_president', explicitPermissions: ['manage_users'] })),
  sortList(expandLegacyPermissions(ORG_ROLE_DEFAULT_PERMISSIONS.general_president)),
  'general_president should retain the full admin permission set'
);

assert.deepStrictEqual(
  serializeUserIdentity({ role: 'admin', adminLevel: 'general_president' }),
  {
    role: 'admin',
    orgRole: 'general_president',
    adminLevel: 'general_president',
    status: 'active',
    firstName: '',
    lastName: ''
  },
  'serializeUserIdentity should emit canonical orgRole and default status'
);

console.log('[check:role-cutover] ok');
