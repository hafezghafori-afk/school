const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config();

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');
const modelsDir = path.join(backendRoot, 'models');
const uploadsDir = path.join(backendRoot, 'uploads');
const backupRoot = path.join(backendRoot, 'backups');

const formatTimestamp = (value = new Date()) =>
  value.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function requireModels() {
  const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    require(path.join(modelsDir, entry.name));
  }
}

function getRegisteredModels() {
  requireModels();
  return mongoose.modelNames().sort().map((name) => {
    const model = mongoose.model(name);
    return {
      name,
      model,
      collectionName: model.collection.collectionName
    };
  });
}

function getMongoUri() {
  return process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
}

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(getMongoUri());
  return mongoose.connection;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}

function copyDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return false;
  ensureDir(path.dirname(targetDir));
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  return true;
}

function removeDirectory(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function normalizeLabel(value = '') {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveBackupDirectory(options = {}) {
  if (options.out) {
    return path.resolve(backendRoot, options.out);
  }
  const label = normalizeLabel(options.label);
  const suffix = label ? `-${label}` : '';
  return path.join(backupRoot, `${formatTimestamp()}${suffix}`);
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function getDatabaseName(uri) {
  const clean = String(uri || '').split('?')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1] || 'school_db';
}

function resolveInputDirectory(inputPath = '') {
  if (!inputPath) return '';
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(backendRoot, inputPath);
}

module.exports = {
  backendRoot,
  repoRoot,
  uploadsDir,
  backupRoot,
  formatTimestamp,
  parseArgs,
  ensureDir,
  getRegisteredModels,
  getMongoUri,
  connectDatabase,
  disconnectDatabase,
  copyDirectory,
  removeDirectory,
  resolveBackupDirectory,
  writeJsonFile,
  getDatabaseName,
  resolveInputDirectory
};
