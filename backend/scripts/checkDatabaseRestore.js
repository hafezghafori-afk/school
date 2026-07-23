const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EJSON, ObjectId } = require('bson');
const { parseArgs } = require('./backupRestoreShared');
const {
  inventoryDirectory,
  sha256,
  verifyDatabaseBackup
} = require('../services/databaseBackupService');
const {
  restoreManifestIntoEmptyDatabase
} = require('../services/databaseRestoreService');
const {
  RESTORE_CONFIRMATION,
  restoreUploadsToEmptyDirectory,
  validateRestoreArgs
} = require('./restoreDatabase');

class FakeCollection {
  constructor(name) {
    this.collectionName = name;
    this.docs = [];
    this.indexDefinitions = [{ key: { _id: 1 }, name: '_id_' }];
  }

  async insertMany(docs) {
    this.docs.push(...docs);
  }

  async createIndex(key, options) {
    this.indexDefinitions.push({ key, ...options });
    return options.name;
  }

  find() {
    return { toArray: async () => [...this.docs] };
  }

  async indexes() {
    return [...this.indexDefinitions];
  }
}

class FakeDatabase {
  constructor() {
    this.collections = new Map();
    this.views = new Map();
  }

  listCollections() {
    return {
      toArray: async () => [
        ...[...this.collections.keys()].map((name) => ({ name, type: 'collection' })),
        ...[...this.views.keys()].map((name) => ({ name, type: 'view' }))
      ]
    };
  }

  async createCollection(name, options = {}) {
    if (options.viewOn) {
      this.views.set(name, options);
      return { collectionName: name };
    }
    const collection = new FakeCollection(name);
    this.collections.set(name, collection);
    return collection;
  }
}

async function run() {
  assert.deepEqual(
    parseArgs(['--in=C:\\backup one', '--target-database', 'restore_stage_test', '--force']),
    { in: 'C:\\backup one', 'target-database': 'restore_stage_test', force: true }
  );
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'school-restore-check-'));
  try {
    const backupDir = path.join(tempRoot, 'backup');
    const databaseDir = path.join(backupDir, 'database');
    const uploadsDir = path.join(backupDir, 'uploads');
    fs.mkdirSync(databaseDir, { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });

    const docs = [
      { _id: new ObjectId('507f1f77bcf86cd799439011'), amount: 500, paidAt: new Date('2026-07-20T00:00:00.000Z') },
      { _id: new ObjectId('507f1f77bcf86cd799439012'), amount: 900, type: 'tuition' }
    ];
    const collectionFile = path.join(databaseDir, 'financebills.json');
    const serialized = `${EJSON.stringify(docs, null, 2)}\n`;
    fs.writeFileSync(collectionFile, serialized, 'utf8');
    fs.writeFileSync(path.join(uploadsDir, 'receipt.txt'), 'verified receipt\n', 'utf8');

    const manifest = {
      formatVersion: 2,
      completed: true,
      createdAt: '2026-07-22T00:00:00.000Z',
      database: {
        name: 'school_db',
        fingerprint: 'a'.repeat(64),
        included: true,
        excludedCollections: ['financemaintenancelocks'],
        collections: [{
          collection: 'financebills',
          count: docs.length,
          sha256: sha256(serialized),
          file: 'database/financebills.json',
          options: {},
          indexes: [
            { key: { _id: 1 }, name: '_id_' },
            { key: { amount: 1 }, name: 'amount_1' }
          ]
        }],
        views: [{ collection: 'financebillviews', viewOn: 'financebills', pipeline: [] }]
      },
      uploads: {
        included: true,
        copied: true,
        source: 'uploads',
        files: inventoryDirectory(uploadsDir)
      }
    };
    fs.writeFileSync(path.join(backupDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const verification = verifyDatabaseBackup({
      backupDir,
      requireDatabase: true,
      requireUploads: true
    });
    assert.equal(verifyDatabaseBackup({
      backupDir,
      manifest,
      requireDatabase: true,
      requireUploads: true
    }).ok, true);
    assert.equal(verification.collections, 1);
    assert.equal(verification.views, 1);
    assert.equal(verification.uploads.files, 1);
    assert.match(verification.manifestSha256, /^[a-f0-9]{64}$/);

    const fakeDb = new FakeDatabase();
    const result = await restoreManifestIntoEmptyDatabase({
      targetDb: fakeDb,
      backupDir,
      manifest: verification.manifest
    });
    assert.equal(result.collections, 1);
    assert.equal(result.views, 1);
    assert.equal(fakeDb.collections.get('financebills').docs.length, 2);
    await assert.rejects(
      restoreManifestIntoEmptyDatabase({ targetDb: fakeDb, backupDir, manifest }),
      /restore_target_database_not_empty/
    );

    const uploadsOut = path.join(tempRoot, 'staged-uploads');
    const config = validateRestoreArgs({
      force: true,
      confirm: RESTORE_CONFIRMATION,
      'target-database': 'restore_stage_finance_test',
      'uploads-out': uploadsOut,
      'expected-manifest-sha256': verification.manifestSha256
    }, verification);
    assert.equal(config.targetDatabase, 'restore_stage_finance_test');
    const sameSourceVerification = {
      ...verification,
      manifest: {
        ...verification.manifest,
        database: { ...verification.manifest.database, name: 'restore_stage_finance_test' }
      }
    };
    assert.throws(() => validateRestoreArgs({
      force: true,
      confirm: RESTORE_CONFIRMATION,
      'target-database': 'restore_stage_finance_test',
      'uploads-out': uploadsOut,
      'expected-manifest-sha256': verification.manifestSha256
    }, sameSourceVerification), /differ from the backup source/);
    assert.throws(() => validateRestoreArgs({
      force: true,
      'target-database': 'restore_stage_finance_test',
      'uploads-out': uploadsOut,
      'expected-manifest-sha256': verification.manifestSha256
    }, verification), /confirm/);

    const restoredUploads = restoreUploadsToEmptyDirectory({
      backupDir,
      manifest,
      targetDir: uploadsOut
    });
    assert.deepEqual(restoredUploads, { files: 1, bytes: 17 });
    assert.equal(fs.readFileSync(path.join(uploadsOut, 'receipt.txt'), 'utf8'), 'verified receipt\n');

    fs.writeFileSync(collectionFile, `${serialized} `, 'utf8');
    assert.throws(() => verifyDatabaseBackup({
      backupDir,
      requireDatabase: true,
      requireUploads: true
    }), /checksum_failed/);

    console.log('Database backup/restore safety checks passed.');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
