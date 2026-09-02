const assert = require('assert');
const { resolvePermissions } = require('../utils/permissions');
const { hasPermissionMatch } = require('../middleware/auth');

// Phase 0 of the "مرکز مالی دولت" review — lock down who passes the finance
// permission gate.
//
// Every route in backend/routes/financeRoutes.js (plus academyRoutes,
// academySupplyRoutes, notifyRoutes finance endpoints) guards on
// requirePermission('manage_finance'). Before the fix, hasPermissionMatch let
// "holds any fine-grained child of manage_finance" satisfy the umbrella, and
// school_manager / academic_manager / head_teacher all carry
// finance.reports.view + reports.government_finance.view +
// finance.reports.consolidated.view via `view_reports`. Result: those three
// admin tiers had full finance WRITE access (bills, payments, treasury moves,
// month close, expense delete). This script pins the intended matrix so a
// regression fails `npm run test:smoke`.

const perms = (context) => resolvePermissions(context);

// ---------------------------------------------------------------------------
// 1. manage_finance is satisfied ONLY by holding the umbrella token itself.
// ---------------------------------------------------------------------------
const FINANCE_STAFF = ['finance_manager', 'finance_lead', 'general_president'];
const NON_FINANCE_ADMINS = ['school_manager', 'academic_manager', 'head_teacher'];

FINANCE_STAFF.forEach((orgRole) => {
  assert.strictEqual(
    hasPermissionMatch(perms({ orgRole }), 'manage_finance'),
    true,
    `${orgRole} must retain manage_finance access`
  );
});

NON_FINANCE_ADMINS.forEach((orgRole) => {
  assert.strictEqual(
    hasPermissionMatch(perms({ orgRole }), 'manage_finance'),
    false,
    `${orgRole} must NOT pass the manage_finance gate (had it only via view_reports children)`
  );
});

// A bare legacy admin (no orgRole / adminLevel) still resolves to the finance
// baseline and must keep access, so we don't lock out pre-cutover accounts.
assert.strictEqual(
  hasPermissionMatch(perms({ role: 'admin' }), 'manage_finance'),
  true,
  'bare role:admin must retain manage_finance access'
);

// ---------------------------------------------------------------------------
// 2. The exact P1 scenario: a lone granular finance grant does NOT escalate.
// ---------------------------------------------------------------------------
[
  'finance.reports.view',
  'reports.government_finance.view',
  'finance.reports.consolidated.view',
  'finance.government.view',
  'finance.student_profile.view'
].forEach((granular) => {
  assert.strictEqual(
    hasPermissionMatch(perms({ role: 'admin', orgRole: 'school_manager', permissions: [granular] }), 'manage_finance'),
    false,
    `lone "${granular}" must not satisfy manage_finance`
  );
});

// ---------------------------------------------------------------------------
// 3. Read-only finance surfaces that non-finance admins legitimately keep,
//    reached via their own granular key (path 1), not the umbrella.
// ---------------------------------------------------------------------------
assert.strictEqual(
  hasPermissionMatch(perms({ orgRole: 'school_manager' }), 'finance.reports.consolidated.view'),
  true,
  'school_manager must keep the consolidated finance report (granted via view_reports)'
);

// ---------------------------------------------------------------------------
// 4. sawaneh.* backward matching is unchanged — those keys still resolve
//    through their grantor list in LEGACY_PERMISSION_MAP.
// ---------------------------------------------------------------------------
assert.strictEqual(
  hasPermissionMatch(perms({ orgRole: 'academic_manager' }), 'sawaneh.transcript.view'),
  true,
  'academic_manager must still satisfy sawaneh.transcript.view via manage_content'
);

// ---------------------------------------------------------------------------
// 5. requireAnyPermission([umbrella, granularKey]) — the supported replacement
//    for the removed backward match — still admits a lone granular grant on a
//    route that opts in, while manage_finance-only routes stay closed to it.
// ---------------------------------------------------------------------------
const loneGovView = perms({ role: 'admin', orgRole: 'school_manager', permissions: ['finance.government.view'] });
const govViewGate = ['manage_finance', 'finance.government.view'];

assert.strictEqual(
  govViewGate.some((permission) => hasPermissionMatch(loneGovView, permission)),
  true,
  'requireAnyPermission([manage_finance, finance.government.view]) admits a lone finance.government.view grant'
);
assert.strictEqual(
  hasPermissionMatch(loneGovView, 'manage_finance'),
  false,
  'that same grant must NOT reach a bare requirePermission(manage_finance) route'
);

console.log('[check:finance-access-control] ok');
