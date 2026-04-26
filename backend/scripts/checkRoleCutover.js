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

const sortList = (items = []) => [...items].sort();

assert.deepStrictEqual(
  sortList(ORG_ROLES),
  sortList(Object.keys(ORG_ROLE_DEFAULT_PERMISSIONS)),
  'ORG_ROLES and ORG_ROLE_DEFAULT_PERMISSIONS must stay in sync'
);

assert.deepStrictEqual(
  sortList(Object.keys(ADMIN_LEVEL_DEFAULT_PERMISSIONS)),
  sortList(['finance_manager', 'finance_lead', 'school_manager', 'head_teacher', 'general_president']),
  'finance admin levels must stay aligned with canonical org roles'
);

const expectedRoleStates = {
  student: { role: 'student', orgRole: 'student', adminLevel: '' },
  instructor: { role: 'instructor', orgRole: 'instructor', adminLevel: '' },
  finance_manager: { role: 'admin', orgRole: 'finance_manager', adminLevel: 'finance_manager' },
  finance_lead: { role: 'admin', orgRole: 'finance_lead', adminLevel: 'finance_lead' },
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

assert.deepStrictEqual(
  sortList(resolvePermissions({ orgRole: 'finance_manager', explicitPermissions: ['manage_users', 'manage_content'] })),
  ['manage_finance'],
  'finance_manager should remain policy-locked to finance permissions only'
);

assert.deepStrictEqual(
  sortList(resolvePermissions({ role: 'admin', adminLevel: 'finance_lead', explicitPermissions: ['manage_users'] })),
  ['manage_finance', 'view_reports'],
  'finance_lead should ignore extra explicit permissions during compatibility mode'
);

assert.deepStrictEqual(
  sortList(resolvePermissions({ orgRole: 'general_president', explicitPermissions: ['manage_users'] })),
  ['access_head_teacher', 'access_school_manager', 'manage_content', 'manage_finance', 'manage_schedule', 'manage_users', 'view_reports'],
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
