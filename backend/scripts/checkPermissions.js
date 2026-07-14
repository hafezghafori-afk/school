const fs = require('fs');
const path = require('path');
const { ACCESS_PERMISSION_KEYS } = require('../utils/permissionCatalog');

const ROUTES_DIR = path.join(__dirname, '..', 'routes');
const KNOWN_PERMISSIONS = ACCESS_PERMISSION_KEYS;

const ADMIN_ROLE_ALLOWLIST = [
  /backend[\\/]routes[\\/]adminRoutes\.js:\d+.*\/client-activity/
];

const routeFiles = fs
  .readdirSync(ROUTES_DIR)
  .filter((file) => file.endsWith('Routes.js'))
  .map((file) => path.join(ROUTES_DIR, file));

const violations = [];
const unknownPermissions = new Set();

const isAllowlisted = (identifier) => ADMIN_ROLE_ALLOWLIST.some((rule) => rule.test(identifier));

for (const filePath of routeFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const normalized = line.trim();
    if (!normalized.includes('router.')) return;

    const permissionMatches = normalized.matchAll(/requirePermission\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
    for (const match of permissionMatches) {
      const permission = String(match?.[1] || '').trim();
      if (permission && !KNOWN_PERMISSIONS.has(permission)) {
        unknownPermissions.add(permission);
      }
    }

    const anyPermissionMatches = normalized.matchAll(/requireAnyPermission\(\s*\[([^\]]*)\]\s*\)/g);
    for (const match of anyPermissionMatches) {
      const listSource = String(match?.[1] || '');
      const keys = Array.from(listSource.matchAll(/['"`]([^'"`]+)['"`]/g))
        .map((item) => String(item?.[1] || '').trim())
        .filter(Boolean);
      keys.forEach((permission) => {
        if (!KNOWN_PERMISSIONS.has(permission)) {
          unknownPermissions.add(permission);
        }
      });
    }

    if (!normalized.includes("requireRole(['admin")) return;

    const routeIdentifier = `${filePath}:${lineNo}:${normalized}`;
    const hasPermissionGuard = normalized.includes('requirePermission(')
      || normalized.includes('requireAnyPermission(')
      || normalized.includes('manageEnrollmentAccess');
    if (!hasPermissionGuard && !isAllowlisted(routeIdentifier)) {
      violations.push({
        file: filePath,
        line: lineNo,
        code: normalized
      });
    }
  });
}

if (unknownPermissions.size) {
  console.error('[check:permissions] Unknown permission keys detected:');
  Array.from(unknownPermissions).sort().forEach((item) => console.error(` - ${item}`));
}

if (violations.length) {
  console.error('[check:permissions] Missing requirePermission on admin routes:');
  violations.forEach((item) => {
    console.error(` - ${item.file}:${item.line}`);
    console.error(`   ${item.code}`);
  });
}

if (unknownPermissions.size || violations.length) {
  process.exit(1);
}

console.log(`[check:permissions] ok: ${routeFiles.length} route files scanned`);
