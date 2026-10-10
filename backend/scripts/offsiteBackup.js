/**
 * Encrypted off-site database backup — run every night by
 * .github/workflows/db-backup-nightly.yml, or by hand.
 *
 *   1. a v2 backup of every collection (databaseBackupService), checksummed and verified
 *   2. packed and AES-256-GCM encrypted with DB_BACKUP_PASSPHRASE into one .sbk file
 *   3. uploaded to R2 under db-backups/YYYY/MM/
 *   4. --restore-drill-uri=<mongodb uri>: the uploaded file is decrypted again and
 *      restored into a new, empty database there; every collection's count and
 *      digest must match, then that database is dropped
 *   5. --prune: copies outside the 30-day / 12-month window are deleted — only
 *      after steps 1-4 passed
 *
 * Usage (from backend/):
 *   MONGO_URI=... DB_BACKUP_PASSPHRASE=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *   R2_ENDPOINT=... R2_BACKUP_BUCKET_NAME=... node scripts/offsiteBackup.js --restore-drill-uri=mongodb://127.0.0.1:27017 --prune
 *
 * Restore: see scripts/decryptOffsiteBackup.js and docs/BACKUP_RESTORE_RUNBOOK.md.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');
const { parseArgs, disconnectDatabase } = require('./backupRestoreShared');
const { createDatabaseBackup, readBackupManifest, verifyDatabaseBackup } = require('../services/databaseBackupService');
const { restoreManifestIntoEmptyDatabase } = require('../services/databaseRestoreService');
const offsite = require('../services/offsiteBackupService');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const megabytes = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

async function restoreDrill({ uri, encryptedFile, passphrase, workDir }) {
  const drillDir = path.join(workDir, 'drill');
  await offsite.decryptToDirectory({ inFile: encryptedFile, outDir: drillDir, passphrase });
  const { manifest } = readBackupManifest(drillDir);
  verifyDatabaseBackup({ backupDir: drillDir, manifest, requireUploads: false });

  const connection = await mongoose.createConnection(uri, { autoIndex: false, autoCreate: false }).asPromise();
  const targetDb = connection.getClient().db(`restore_drill_${Date.now()}`);
  try {
    return await restoreManifestIntoEmptyDatabase({ targetDb, backupDir: drillDir, manifest });
  } finally {
    await targetDb.dropDatabase().catch(() => {});
    await connection.close();
  }
}

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const missing = ['MONGO_URI', 'DB_BACKUP_PASSPHRASE'].filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
  const passphrase = process.env.DB_BACKUP_PASSPHRASE;
  const r2 = offsite.getBackupR2();

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-db-backup-'));
  try {
    const startedAt = new Date();
    const backupDir = path.join(workDir, 'backup');
    await createDatabaseBackup({ backupDir, includeDatabase: true, includeUploads: false });
    await disconnectDatabase();
    const verification = verifyDatabaseBackup({ backupDir, requireUploads: false });
    const documents = verification.manifest.database.collections.reduce((sum, item) => sum + Number(item.count || 0), 0);
    console.log(`backup verified: ${verification.collections} collections, ${documents} documents`);

    const encryptedFile = path.join(workDir, 'backup.sbk');
    const packed = await offsite.encryptDirectory({ sourceDir: backupDir, outFile: encryptedFile, passphrase });
    const key = offsite.backupKeyFor(startedAt);
    await offsite.uploadBackupFile(r2, key, encryptedFile, {
      sha256: packed.sha256,
      collections: String(verification.collections),
      documents: String(documents)
    });
    console.log(`uploaded ${key} (${megabytes(packed.size)} MB encrypted, sha256 ${packed.sha256})`);

    if (args['restore-drill-uri']) {
      const drill = await restoreDrill({ uri: String(args['restore-drill-uri']), encryptedFile, passphrase, workDir });
      if (drill.collections !== verification.collections) {
        throw new Error(`Restore drill restored ${drill.collections} collections, expected ${verification.collections}.`);
      }
      console.log(`restore drill: all ${drill.collections} collections restored and verified from the encrypted file`);
    }

    if (args.prune) {
      const result = await offsite.pruneBackups(r2, startedAt);
      console.log(`retention: ${result.kept} kept, ${result.deleted} deleted`);
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    await disconnectDatabase();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`backup failed: ${error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = { run };
