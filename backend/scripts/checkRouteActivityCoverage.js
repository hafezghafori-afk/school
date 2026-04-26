const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '..', 'routes');
const routeFiles = fs.readdirSync(routesDir).filter((file) => file.endsWith('.js'));

const missing = [];

for (const file of routeFiles) {
  const fullPath = path.join(routesDir, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  const hasWriteRoute = /router\.(post|put|patch|delete)\(/.test(content);
  if (!hasWriteRoute) continue;

  const hasAuditHook = /logActivity\(|attachWriteActivityAudit\(/.test(content);
  if (!hasAuditHook) {
    missing.push(file);
  }
}

if (missing.length) {
  console.error('[check:route-activity-coverage] missing audit coverage in route files:');
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log(`[check:route-activity-coverage] ok: ${routeFiles.length} route files scanned`);
