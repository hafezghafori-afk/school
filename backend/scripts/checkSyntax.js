const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backendRoot = path.resolve(__dirname, '..');
const ignoredDirs = new Set(['node_modules', '.git']);

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const targets = walk(backendRoot).sort();
let failed = 0;

for (const filePath of targets) {
  const relPath = path.relative(backendRoot, filePath).replace(/\\/g, '/');
  const result = spawnSync(process.execPath, ['--check', filePath], {
    encoding: 'utf8'
  });
  if (result.status === 0) {
    console.log(`PASS  ${relPath}`);
    continue;
  }

  failed += 1;
  console.error(`FAIL  ${relPath}`);
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

if (failed > 0) {
  console.error(`\nSyntax check failed: ${failed} file(s).`);
  process.exit(1);
}

console.log(`\nSyntax check passed: ${targets.length} file(s).`);
