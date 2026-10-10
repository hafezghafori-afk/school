const fs = require('fs');
const path = require('path');

// Fails when a mounted API route runs with no authentication gate and is not on
// the PUBLIC_ROUTES list below. Added 2026-10-10 after /api/afghan-teachers was
// found serving — and accepting edits and deletes of — the whole staff registry
// to anonymous callers: nothing in the smoke suite noticed a router whose only
// middleware was optionalAuth.
//
// A route counts as gated when requireAuth, or a requireRole / requirePermission /
// requireAnyPermission closure, runs before its handler — on the route itself or
// as router-level middleware registered earlier in the same router (or a parent).

process.env.JWT_SECRET = process.env.JWT_SECRET || 'route-auth-coverage-check';

const backendRoot = path.join(__dirname, '..');
const auth = require(path.join(backendRoot, 'middleware', 'auth.js'));

// Every entry is a deliberate decision: say why the route may answer anonymously.
const PUBLIC_ROUTES = new Map([
  ['POST /api/auth/demo-seed', 'needs DEMO_SEED_SECRET and the demo flag'],
  ['POST /api/auth/demo-login', 'demo accounts only, behind the demo flag'],
  ['POST /api/auth/register', 'public sign-up'],
  ['POST /api/auth/login', 'sign-in'],
  ['POST /api/auth/login/2fa/verify', 'sign-in (disabled stub)'],
  ['POST /api/auth/login/2fa/resend', 'sign-in (disabled stub)'],
  ['POST /api/auth/forgot-password', 'password reset request'],
  ['POST /api/auth/reset-password', 'password reset with a single-use token'],
  ['GET /api/courses/test', 'health text'],
  ['GET /api/courses/all', 'public course catalogue'],
  ['GET /api/courses/:id', 'public course page'],
  ['GET /api/modules/class/:classId', 'public course modules'],
  ['GET /api/modules/course/:courseId', 'public course modules'],
  ['GET /api/payments/bank-info', 'bank details shown on the public payment page'],
  ['GET /api/quizzes/subject/:subject', 'public quiz page (KNOWN ISSUE: the response carries the answer key)'],
  ['GET /api/login-settings', 'login page appearance'],
  ['GET /api/settings/login-page', 'login page appearance'],
  ['GET /api/settings/public', 'public site settings'],
  ['GET /api/news', 'public news'],
  ['GET /api/news/:id', 'public news'],
  ['GET /api/gallery', 'public gallery'],
  ['POST /api/contact', 'public contact form'],
  ['POST /api/enrollments', 'public online registration'],
  ['GET /api/finance/documents/verify/:verificationCode', 'QR verification of printed finance documents'],
  ['POST /api/finance/delivery/providers/:provider/status', 'delivery provider webhook, checked against its token'],
  ['GET /api/education/public-school-classes', 'class list for online registration'],
  ['GET /api/education/public-school-classes/:identifier', 'class detail for online registration'],
  ['GET /api/afghan-schools/dashboard', 'aggregate counts only'],
  ['GET /api/afghan-schools', 'school directory'],
  ['GET /api/afghan-schools/active', 'school picker for online registration'],
  ['GET /api/afghan-schools/:id', 'school directory'],
  ['GET /api/afghan-schools/provinces/stats', 'aggregate counts only'],
  ['GET /api/afghan-schools/map-data', 'school map'],
  ['GET /api/afghan-schools/reports/annual', 'aggregate counts only'],
  ['POST /api/timetable', 'rewrites to /entry, which timetableEditorRoutes gates'],
  ['PUT /api/timetable/:id', 'rewrites to /entry/:id, which timetableEditorRoutes gates'],
  ['DELETE /api/timetable/:id', 'rewrites to /entry/:id, which timetableEditorRoutes gates'],
  ['GET /api/school-websites/public', 'public school website'],
  ['POST /api/school-websites/contact', 'public school website contact form']
]);

const gateFingerprints = new Map([
  [String(auth.requireRole([])), 'requireRole'],
  [String(auth.requirePermission('x')), 'requirePermission'],
  [String(auth.requireAnyPermission(['x'])), 'requireAnyPermission']
]);

function isGate(fn) {
  if (typeof fn !== 'function') return false;
  if (fn === auth.requireAuth) return true;
  if (fn === auth.optionalAuth) return false;
  return gateFingerprints.has(String(fn));
}

function readMounts() {
  const serverSrc = fs.readFileSync(path.join(backendRoot, 'server.js'), 'utf8');
  const required = {};
  for (const match of serverSrc.matchAll(/const (\w+) = require\('\.\/routes\/(\w+)'\)/g)) {
    required[match[1]] = match[2];
  }
  const mounts = [];
  for (const match of serverSrc.matchAll(/app\.use\('([^']+)',\s*(\w+)\)/g)) {
    if (required[match[2]]) mounts.push({ prefix: match[1], file: required[match[2]] });
  }
  // r2ServerBootstrap.js merges these routers in front of the ones server.js mounts.
  mounts.push({ prefix: '/api/settings', file: 'r2SettingsAssetRoutes' });
  mounts.push({ prefix: '/api/student-finance', file: 'studentAccountByStudentRoutes' });
  return mounts;
}

function collectRoutes(router, prefix, inheritedGate, out) {
  let gated = inheritedGate;
  for (const layer of router.stack || []) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods || {}).filter((method) => layer.route.methods[method]);
      const routeGated = gated || (layer.route.stack || []).some((item) => isGate(item.handle));
      const routePath = layer.route.path === '/' ? prefix : `${prefix}${layer.route.path}`;
      methods.forEach((method) => out.push({ key: `${method.toUpperCase()} ${routePath}`, gated: routeGated }));
      continue;
    }
    if (Array.isArray(layer.handle?.stack)) {
      // A nested router mounted with router.use('/', child): same prefix here.
      collectRoutes(layer.handle, prefix, gated, out);
      continue;
    }
    if (isGate(layer.handle)) gated = true;
  }
  return out;
}

function run() {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const routes = [];
  try {
    console.log = () => {};
    console.warn = () => {};
    for (const { prefix, file } of readMounts()) {
      const router = require(path.join(backendRoot, 'routes', `${file}.js`));
      collectRoutes(router, prefix, false, routes);
    }
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }

  const open = routes.filter((route) => !route.gated);
  const unexpected = open.filter((route) => !PUBLIC_ROUTES.has(route.key));
  const openKeys = new Set(open.map((route) => route.key));
  const stale = [...PUBLIC_ROUTES.keys()].filter((key) => !openKeys.has(key));

  if (unexpected.length) {
    console.error('[check:route-auth-coverage] these routes answer without any login:');
    unexpected.forEach((route) => console.error(`- ${route.key}`));
    console.error('Gate them with requireAuth / requirePermission, or add them to PUBLIC_ROUTES with the reason they are public.');
    process.exit(1);
  }
  if (stale.length) {
    console.error('[check:route-auth-coverage] PUBLIC_ROUTES lists routes that no longer exist or are now gated — remove them:');
    stale.forEach((key) => console.error(`- ${key}`));
    process.exit(1);
  }
  console.log(`[check:route-auth-coverage] ok: ${routes.length} routes, ${open.length} deliberately public`);
  process.exit(0);
}

run();
