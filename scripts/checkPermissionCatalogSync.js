#!/usr/bin/env node
// Guards against frontend/src/config/permissionCatalog.js and
// backend/utils/permissionCatalog.js silently drifting apart.
//
// They are two hand-maintained files describing the same data (which
// granular permissions satisfy which legacy/umbrella permission) in two
// different shapes - the frontend keeps a `legacy: [...]` tag per granular
// permission and derives the umbrella->granular map by inversion; the
// backend keeps the umbrella->granular map directly. Nothing stops someone
// from editing one and forgetting the other. When that happens, the
// frontend shows/hides UI based on one answer while the backend's
// requirePermission() middleware enforces a different one - a user can see
// a feature the API then 403s on, or the reverse.
//
// This script loads both, expands the frontend's per-permission `legacy`
// tags into the same umbrella->granular shape the backend already uses,
// and fails (exit 1) if the two disagree on any umbrella key's granular
// permission set. Run via `node scripts/checkPermissionCatalogSync.js`;
// wired into CI (.github/workflows/ci.yml) so drift fails the build
// instead of shipping silently.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FRONTEND_CATALOG_PATH = path.join(ROOT, 'frontend', 'src', 'config', 'permissionCatalog.js');
const BACKEND_CATALOG_PATH = path.join(ROOT, 'backend', 'utils', 'permissionCatalog.js');

function loadFrontendCatalog() {
  // The frontend file is an ES module (`export const ...`); this repo has
  // no build step wired to run a plain Node script against it, so we strip
  // the `export` keywords and evaluate it as a CommonJS module body. The
  // file is self-contained (no imports), so this is safe.
  const source = fs.readFileSync(FRONTEND_CATALOG_PATH, 'utf8').replace(/^export /gm, '');
  const moduleShim = { exports: {} };
  const factory = new Function(
    'module',
    'exports',
    `${source}\nmodule.exports = { PERMISSION_GROUPS, PERMISSION_OPTIONS, LEGACY_PERMISSION_MAP };`
  );
  factory(moduleShim, moduleShim.exports);
  return moduleShim.exports;
}

function loadBackendCatalog() {
  delete require.cache[require.resolve(BACKEND_CATALOG_PATH)];
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(BACKEND_CATALOG_PATH);
}

function sortedUnique(list = []) {
  return Array.from(new Set(list)).sort();
}

function main() {
  const frontend = loadFrontendCatalog();
  const backend = loadBackendCatalog();

  const problems = [];

  // 1. Every umbrella -> granular mapping must match exactly on both sides.
  const allUmbrellaKeys = sortedUnique([
    ...Object.keys(frontend.LEGACY_PERMISSION_MAP),
    ...Object.keys(backend.LEGACY_PERMISSION_MAP)
  ]);
  allUmbrellaKeys.forEach((umbrellaKey) => {
    const feGranted = sortedUnique(frontend.LEGACY_PERMISSION_MAP[umbrellaKey] || []);
    const beGranted = sortedUnique(backend.LEGACY_PERMISSION_MAP[umbrellaKey] || []);
    if (JSON.stringify(feGranted) !== JSON.stringify(beGranted)) {
      const onlyFrontend = feGranted.filter((key) => !beGranted.includes(key));
      const onlyBackend = beGranted.filter((key) => !feGranted.includes(key));
      problems.push(
        `Umbrella "${umbrellaKey}" disagrees:\n`
        + (onlyFrontend.length ? `  only in frontend: ${onlyFrontend.join(', ')}\n` : '')
        + (onlyBackend.length ? `  only in backend:  ${onlyBackend.join(', ')}\n` : '')
      );
    }
  });

  // 2. The set of granular permission keys itself must match.
  const feKeys = sortedUnique(frontend.PERMISSION_OPTIONS.map((permission) => permission.key));
  const beKeys = sortedUnique(backend.PERMISSION_KEYS.filter((key) => !backend.LEGACY_PERMISSION_MAP[key]));
  if (JSON.stringify(feKeys) !== JSON.stringify(beKeys)) {
    const onlyFrontend = feKeys.filter((key) => !beKeys.includes(key));
    const onlyBackend = beKeys.filter((key) => !feKeys.includes(key));
    problems.push(
      'Granular permission key sets disagree:\n'
      + (onlyFrontend.length ? `  only in frontend: ${onlyFrontend.join(', ')}\n` : '')
      + (onlyBackend.length ? `  only in backend:  ${onlyBackend.join(', ')}\n` : '')
    );
  }

  if (problems.length) {
    console.error('\n✗ frontend/src/config/permissionCatalog.js and backend/utils/permissionCatalog.js have drifted apart:\n');
    problems.forEach((problem) => console.error(problem));
    console.error('Fix: bring both files back into agreement (usually by adding the missing entry to whichever side is missing it).');
    process.exitCode = 1;
    return;
  }

  console.log('✓ Frontend and backend permission catalogs agree.');
}

main();
