const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const backendRoot = path.join(repoRoot, 'backend');
const frontendRoot = path.join(repoRoot, 'frontend');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

const backendPackage = readJson(path.join(backendRoot, 'package.json'));
const frontendPackage = readJson(path.join(frontendRoot, 'package.json'));

const requiredFiles = [
  'backend/scripts/backupDatabase.js',
  'backend/scripts/restoreDatabase.js',
  'backend/scripts/checkOperationalReadiness.js',
  'docs/BACKUP_RESTORE_RUNBOOK.md',
  'docs/DEPLOYMENT_RUNBOOK.md',
  'docs/RELEASE_CHECKLIST.md',
  'docs/USER_GUIDE.md',
  'docs/PHASE10_SIGNOFF.md',
  'docs/PHASE11_EXECUTION_BACKLOG.md',
  'docs/PHASE11_SIGNOFF.md'
];

const requiredBackendScripts = [
  'backup:create',
  'backup:plan',
  'backup:restore',
  'check:operations',
  'release:preflight'
];

const requiredFrontendScripts = [
  'release:verify'
];

let failed = 0;

function pass(label) {
  console.log(`PASS  ${label}`);
}

function fail(label) {
  failed += 1;
  console.error(`FAIL  ${label}`);
}

for (const relPath of requiredFiles) {
  const fullPath = path.join(repoRoot, relPath);
  if (fs.existsSync(fullPath)) {
    pass(relPath);
  } else {
    fail(relPath);
  }
}

for (const scriptName of requiredBackendScripts) {
  if (backendPackage.scripts && backendPackage.scripts[scriptName]) {
    pass(`backend package script: ${scriptName}`);
  } else {
    fail(`backend package script: ${scriptName}`);
  }
}

for (const scriptName of requiredFrontendScripts) {
  if (frontendPackage.scripts && frontendPackage.scripts[scriptName]) {
    pass(`frontend package script: ${scriptName}`);
  } else {
    fail(`frontend package script: ${scriptName}`);
  }
}

const backendGitignorePath = path.join(backendRoot, '.gitignore');
if (fs.existsSync(backendGitignorePath)) {
  const lines = fs.readFileSync(backendGitignorePath, 'utf8').split(/\r?\n/).map((line) => line.trim());
  if (lines.includes('backups')) {
    pass('backend/.gitignore ignores backups');
  } else {
    fail('backend/.gitignore ignores backups');
  }
} else {
  fail('backend/.gitignore exists');
}

if (failed > 0) {
  console.error(`\nOperational readiness check failed: ${failed} issue(s).`);
  process.exit(1);
}

console.log('\nOperational readiness check passed.');
