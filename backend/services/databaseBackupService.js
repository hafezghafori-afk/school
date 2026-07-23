const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const {
  uploadsDir,
  backupRoot,
  ensureDir,
  getMongoUri,
  connectDatabase,
  copyDirectory,
  resolveBackupDirectory,
  getDatabaseName
} = require('../scripts/backupRestoreShared');

const TRANSIENT_COLLECTIONS = new Set(['financemaintenancelocks']);
const RESTORE_TEST_PREFIX = 'finance_reset_restore_test_';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const safeFileName = (value = '') => `${encodeURIComponent(String(value || ''))}.json`;

function normalizeRelativeFile(value = '') {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Unsafe backup relative path: ${value}`);
  }
  return normalized;
}

function inventoryDirectory(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const result = [];
  const visit = (currentDir, relativeDir = '') => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(currentDir, entry.name);
      const relative = path.posix.join(relativeDir.replace(/\\/g, '/'), entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed in backup uploads: ${relative}`);
      }
      if (stat.isDirectory()) {
        visit(absolute, relative);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`Unsupported file type in backup uploads: ${relative}`);
      }
      result.push({
        file: relative,
        size: stat.size,
        sha256: sha256(fs.readFileSync(absolute))
      });
    }
  };
  visit(rootDir);
  return result.sort((left, right) => left.file.localeCompare(right.file));
}

function databaseFingerprint(connection) {
  const host = String(connection?.host || '').trim().toLowerCase();
  const port = String(connection?.port || '').trim();
  const name = String(connection?.name || '').trim();
  return sha256(`${host}:${port}/${name}`);
}

function normalizeIndex(index = {}) {
  const { v, ns, background, ...rest } = index || {};
  return rest;
}

function resolveManifestFile(backupDir, relativeFile) {
  const normalized = normalizeRelativeFile(relativeFile);
  const resolvedRoot = path.resolve(backupDir);
  const root = `${resolvedRoot}${path.sep}`.toLowerCase();
  const resolved = path.resolve(resolvedRoot, normalized);
  if (!resolved.toLowerCase().startsWith(root)) {
    throw new Error(`Unsafe backup manifest path: ${relativeFile}`);
  }
  if (!fs.existsSync(resolved)) throw new Error(`Backup file not found: ${normalized}`);
  const realRoot = `${fs.realpathSync(resolvedRoot)}${path.sep}`.toLowerCase();
  const realFile = fs.realpathSync(resolved);
  if (!realFile.toLowerCase().startsWith(realRoot)) {
    throw new Error(`Backup file escapes its directory: ${normalized}`);
  }
  return resolved;
}

function readBackupManifest(backupDir = '') {
  const resolvedBackupDir = path.resolve(backupDir || '');
  const manifestPath = path.join(resolvedBackupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Backup manifest not found: ${manifestPath}`);
  const serialized = fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
  return {
    backupDir: resolvedBackupDir,
    manifestPath,
    manifestSha256: sha256(serialized),
    manifest: EJSON.parse(serialized, { relaxed: false })
  };
}

function validateCollectionName(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.includes('\0') || normalized.startsWith('system.') || normalized.includes('$')) {
    throw new Error(`Invalid collection name in backup: ${value || 'unknown'}`);
  }
  return normalized;
}

function verifyUploadInventory(uploadsPath, expectedFiles = []) {
  if (!Array.isArray(expectedFiles)) throw new Error('backup_upload_inventory_missing');
  const expected = [...expectedFiles]
    .map((entry) => ({
      file: normalizeRelativeFile(entry?.file),
      size: Number(entry?.size),
      sha256: String(entry?.sha256 || '').toLowerCase()
    }))
    .sort((left, right) => left.file.localeCompare(right.file));
  const seen = new Set();
  for (const entry of expected) {
    const key = entry.file.toLowerCase();
    if (seen.has(key) || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Invalid upload inventory entry: ${entry.file}`);
    }
    seen.add(key);
  }
  const actual = inventoryDirectory(uploadsPath);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('backup_upload_inventory_mismatch');
  }
  return { files: actual.length, bytes: actual.reduce((sum, item) => sum + item.size, 0) };
}

async function createDatabaseBackup({
  backupDir = '',
  label = '',
  includeDatabase = true,
  includeUploads = true,
  log = () => {}
} = {}) {
  if (!includeDatabase && !includeUploads) throw new Error('Choose at least one backup target.');

  ensureDir(backupRoot);
  const resolvedBackupDir = backupDir ? path.resolve(backupDir) : resolveBackupDirectory({ label });
  if (fs.existsSync(resolvedBackupDir)) {
    throw new Error(`Backup directory already exists: ${resolvedBackupDir}`);
  }
  ensureDir(resolvedBackupDir);

  const manifest = {
    formatVersion: 2,
    completed: false,
    createdAt: new Date().toISOString(),
    database: {
      name: getDatabaseName(getMongoUri()),
      fingerprint: '',
      included: includeDatabase,
      collections: [],
      views: [],
      excludedCollections: [...TRANSIENT_COLLECTIONS]
    },
    uploads: {
      included: includeUploads,
      copied: false,
      source: path.relative(path.resolve(__dirname, '..'), uploadsDir).replace(/\\/g, '/'),
      files: []
    }
  };

  if (includeDatabase) {
    const dataDir = path.join(resolvedBackupDir, 'database');
    ensureDir(dataDir);
    const connection = await connectDatabase();
    manifest.database.name = connection.name;
    manifest.database.fingerprint = databaseFingerprint(connection);
    const listed = await connection.db.listCollections({}, { nameOnly: false }).toArray();
    const uniqueNames = new Set();
    const uniqueFiles = new Set();

    for (const definition of listed.sort((left, right) => String(left.name).localeCompare(String(right.name)))) {
      const collectionName = String(definition?.name || '').trim();
      if (!collectionName || collectionName.startsWith('system.') || TRANSIENT_COLLECTIONS.has(collectionName)) continue;
      if (uniqueNames.has(collectionName)) throw new Error(`Duplicate collection in backup inventory: ${collectionName}`);
      uniqueNames.add(collectionName);

      if (definition.type === 'view') {
        manifest.database.views.push({
          collection: collectionName,
          viewOn: definition.options?.viewOn || '',
          pipeline: definition.options?.pipeline || [],
          collation: definition.options?.collation || null
        });
        continue;
      }

      const collection = connection.db.collection(collectionName);
      const docs = await collection.find({}).toArray();
      const serialized = `${EJSON.stringify(docs, null, 2, { relaxed: false })}\n`;
      const relativeFile = `database/${safeFileName(collectionName)}`;
      const fileKey = relativeFile.toLowerCase();
      if (uniqueFiles.has(fileKey)) throw new Error(`Backup filename collision: ${relativeFile}`);
      uniqueFiles.add(fileKey);
      fs.writeFileSync(path.join(resolvedBackupDir, relativeFile), serialized, 'utf8');
      const indexes = await collection.indexes();
      manifest.database.collections.push({
        collection: collectionName,
        count: docs.length,
        sha256: sha256(serialized),
        file: relativeFile,
        options: definition.options || {},
        indexes: indexes.map(normalizeIndex)
      });
      log(`BACKUP ${collectionName} (${docs.length})`);
    }
  }

  if (includeUploads) {
    const backupInsideUploads = path.relative(path.resolve(uploadsDir), resolvedBackupDir);
    if (backupInsideUploads === '' || (!backupInsideUploads.startsWith('..') && !path.isAbsolute(backupInsideUploads))) {
      throw new Error('Backup directory cannot be inside the uploads directory.');
    }
    const backupUploadsDir = path.join(resolvedBackupDir, 'uploads');
    if (fs.existsSync(uploadsDir)) copyDirectory(uploadsDir, backupUploadsDir);
    else ensureDir(backupUploadsDir);
    manifest.uploads.copied = true;
    manifest.uploads.files = inventoryDirectory(backupUploadsDir);
    log(`BACKUP uploads (${manifest.uploads.files.length} files)`);
  }

  manifest.completed = true;
  manifest.completedAt = new Date().toISOString();
  const manifestPath = path.join(resolvedBackupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, `${EJSON.stringify(manifest, null, 2, { relaxed: false })}\n`, 'utf8');
  return { backupDir: resolvedBackupDir, manifestPath, manifest };
}

function verifyDatabaseBackup({
  backupDir = '',
  manifest = null,
  requireUploads = true,
  requireDatabase = true
} = {}) {
  const resolvedBackupDir = path.resolve(backupDir || '');
  const manifestRead = readBackupManifest(resolvedBackupDir);
  const resolvedManifest = manifest || manifestRead.manifest;
  if (
    manifest
    && EJSON.stringify(manifest, null, 0, { relaxed: false })
      !== EJSON.stringify(manifestRead.manifest, null, 0, { relaxed: false })
  ) {
    throw new Error('backup_manifest_memory_disk_mismatch');
  }
  if (Number(resolvedManifest?.formatVersion) !== 2 || resolvedManifest?.completed !== true) {
    throw new Error('finance_ledger_reset_backup_incomplete');
  }
  if (requireDatabase && (
    resolvedManifest.database?.included !== true
    || !/^[a-f0-9]{64}$/i.test(String(resolvedManifest.database?.fingerprint || ''))
  )) {
    throw new Error('backup_database_inventory_required');
  }
  const collections = Array.isArray(resolvedManifest.database?.collections)
    ? resolvedManifest.database.collections
    : [];
  const seen = new Set();
  const seenFiles = new Set();
  for (const entry of collections) {
    const collectionName = validateCollectionName(entry?.collection);
    const collectionKey = collectionName.toLowerCase();
    if (seen.has(collectionKey) || TRANSIENT_COLLECTIONS.has(collectionName)) {
      throw new Error(`finance_ledger_reset_backup_collection_invalid:${entry?.collection || 'unknown'}`);
    }
    seen.add(collectionKey);
    const relativeFile = normalizeRelativeFile(entry.file);
    const fileKey = relativeFile.toLowerCase();
    if (seenFiles.has(fileKey)) throw new Error(`backup_collection_file_duplicate:${relativeFile}`);
    seenFiles.add(fileKey);
    if (!Number.isSafeInteger(Number(entry.count)) || Number(entry.count) < 0 || !/^[a-f0-9]{64}$/i.test(String(entry.sha256 || ''))) {
      throw new Error(`backup_collection_metadata_invalid:${collectionName}`);
    }
    const filePath = resolveManifestFile(resolvedBackupDir, entry.file);
    const serialized = fs.readFileSync(filePath, 'utf8');
    if (sha256(serialized) !== String(entry.sha256).toLowerCase()) {
      throw new Error(`finance_ledger_reset_backup_checksum_failed:${collectionName}`);
    }
    const docs = EJSON.parse(serialized, { relaxed: false });
    if (!Array.isArray(docs) || docs.length !== Number(entry.count)) {
      throw new Error(`finance_ledger_reset_backup_count_failed:${collectionName}`);
    }
    if (!Array.isArray(entry.indexes) || !entry.options || typeof entry.options !== 'object' || Array.isArray(entry.options)) {
      throw new Error(`backup_collection_definition_invalid:${collectionName}`);
    }
  }
  const views = Array.isArray(resolvedManifest.database?.views) ? resolvedManifest.database.views : [];
  for (const view of views) {
    const viewName = validateCollectionName(view?.collection);
    const viewKey = viewName.toLowerCase();
    if (seen.has(viewKey) || !view.viewOn || !Array.isArray(view.pipeline || [])) {
      throw new Error(`backup_view_definition_invalid:${viewName}`);
    }
    seen.add(viewKey);
  }
  let uploadVerification = null;
  if (requireUploads && (
    resolvedManifest.uploads?.included !== true
    || resolvedManifest.uploads?.copied !== true
    || !fs.existsSync(path.join(resolvedBackupDir, 'uploads'))
  )) {
    throw new Error('finance_ledger_reset_upload_backup_required');
  }
  if (requireUploads && resolvedManifest.uploads?.included === true && resolvedManifest.uploads?.copied === true) {
    uploadVerification = verifyUploadInventory(
      path.join(resolvedBackupDir, 'uploads'),
      resolvedManifest.uploads.files
    );
  }
  return {
    ok: true,
    collections: collections.length,
    views: views.length,
    backupDir: resolvedBackupDir,
    manifest: resolvedManifest,
    manifestPath: manifestRead.manifestPath,
    manifestSha256: manifestRead.manifestSha256,
    uploads: uploadVerification
  };
}

async function proveDatabaseBackupRestore({ backupDir = '', manifest = null, testDatabaseName = '' } = {}) {
  const verification = verifyDatabaseBackup({ backupDir, manifest, requireUploads: true, requireDatabase: true });
  const sourceName = String(mongooseConnectionName() || '').trim();
  const targetName = String(testDatabaseName || '').trim();
  if (!targetName.startsWith(RESTORE_TEST_PREFIX) || targetName === sourceName) {
    throw new Error(`Restore-test database must start with ${RESTORE_TEST_PREFIX} and differ from the source database.`);
  }

  const resolvedBackupDir = verification.backupDir;
  const resolvedManifest = verification.manifest;
  const client = require('mongoose').connection.getClient();
  const targetDb = client.db(targetName);
  const existing = await targetDb.listCollections({}, { nameOnly: true }).toArray();
  if (existing.length) throw new Error(`Restore-test database is not empty: ${targetName}`);
  try {
    const { restoreManifestIntoEmptyDatabase } = require('./databaseRestoreService');
    const result = await restoreManifestIntoEmptyDatabase({
      targetDb,
      backupDir: resolvedBackupDir,
      manifest: resolvedManifest
    });
    return { ok: true, testDatabaseName: targetName, ...result };
  } finally {
    await targetDb.dropDatabase().catch(() => {});
  }
}

function mongooseConnectionName() {
  return require('mongoose').connection.name;
}

module.exports = {
  RESTORE_TEST_PREFIX,
  TRANSIENT_COLLECTIONS,
  createDatabaseBackup,
  databaseFingerprint,
  inventoryDirectory,
  proveDatabaseBackupRestore,
  readBackupManifest,
  resolveManifestFile,
  sha256,
  validateCollectionName,
  verifyUploadInventory,
  verifyDatabaseBackup
};
