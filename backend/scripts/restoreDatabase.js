const fs = require('node:fs');
const path = require('node:path');
const {
  uploadsDir,
  repoRoot,
  parseArgs,
  connectDatabase,
  disconnectDatabase,
  copyDirectory,
  removeDirectory,
  resolveInputDirectory
} = require('./backupRestoreShared');
const {
  databaseFingerprint,
  verifyDatabaseBackup,
  verifyUploadInventory
} = require('../services/databaseBackupService');
const {
  assertEmptyDatabase,
  restoreManifestIntoEmptyDatabase
} = require('../services/databaseRestoreService');

const RESTORE_CONFIRMATION = 'RESTORE_VERIFIED_BACKUP_TO_NEW_TARGET';
const STAGE_DATABASE_PREFIX = 'restore_stage_';

function isOutsideDirectory(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== '' && (relative.startsWith('..') || path.isAbsolute(relative));
}

function validateRestoreArgs(args = {}, verification = null) {
  const includeDatabase = !args['uploads-only'];
  const includeUploads = !args['db-only'];
  const dryRun = args['dry-run'] === true;
  if (!includeDatabase && !includeUploads) throw new Error('Choose at least one restore target.');

  const config = {
    dryRun,
    includeDatabase,
    includeUploads,
    targetDatabase: String(args['target-database'] || '').trim(),
    uploadsOut: String(args['uploads-out'] || '').trim(),
    expectedManifestSha256: String(args['expected-manifest-sha256'] || '').trim().toLowerCase()
  };
  if (dryRun) return config;
  if (args.force !== true) throw new Error('Restore staging requires --force.');
  if (String(args.confirm || '') !== RESTORE_CONFIRMATION) {
    throw new Error(`Restore staging requires --confirm=${RESTORE_CONFIRMATION}.`);
  }
  if (!/^[a-f0-9]{64}$/.test(config.expectedManifestSha256)) {
    throw new Error('Restore staging requires --expected-manifest-sha256=<sha256-from-dry-run>.');
  }
  if (!verification || config.expectedManifestSha256 !== verification.manifestSha256) {
    throw new Error('Backup manifest changed or does not match --expected-manifest-sha256.');
  }
  if (includeDatabase && (
    !new RegExp(`^${STAGE_DATABASE_PREFIX}[a-z0-9_-]+$`, 'i').test(config.targetDatabase)
    || config.targetDatabase.length > 63
  )) {
    throw new Error(`--target-database must be a new name beginning with ${STAGE_DATABASE_PREFIX}.`);
  }
  if (
    includeDatabase
    && config.targetDatabase.toLowerCase() === String(verification.manifest.database?.name || '').toLowerCase()
  ) {
    throw new Error('The staging database must differ from the backup source database.');
  }
  if (includeUploads) {
    if (!config.uploadsOut || !path.isAbsolute(config.uploadsOut)) {
      throw new Error('--uploads-out must be a new absolute staging directory.');
    }
    if (!isOutsideDirectory(config.uploadsOut, repoRoot) || !isOutsideDirectory(config.uploadsOut, uploadsDir)) {
      throw new Error('The staged uploads directory must be outside the repository and live uploads directory.');
    }
    if (fs.existsSync(config.uploadsOut)) {
      throw new Error(`The staged uploads directory already exists: ${config.uploadsOut}`);
    }
  }
  return config;
}

function restoreUploadsToEmptyDirectory({ backupDir, manifest, targetDir }) {
  if (fs.existsSync(targetDir)) throw new Error(`Restore uploads target already exists: ${targetDir}`);
  const sourceDir = path.join(backupDir, 'uploads');
  try {
    if (!copyDirectory(sourceDir, targetDir)) throw new Error('Verified uploads source is missing.');
    return verifyUploadInventory(targetDir, manifest.uploads.files);
  } catch (error) {
    if (fs.existsSync(targetDir)) removeDirectory(targetDir);
    throw error;
  }
}

function printRestorePlan(verification, config) {
  const manifest = verification.manifest;
  console.log(`Restore directory: ${verification.backupDir}`);
  console.log(`Manifest SHA-256: ${verification.manifestSha256}`);
  console.log(`Backup source database: ${manifest.database?.name || '(not included)'}`);
  console.log(`Backup source fingerprint: ${manifest.database?.fingerprint || '(not included)'}`);
  console.log(`Database collections: ${(manifest.database?.collections || []).length}`);
  console.log(`Database views: ${(manifest.database?.views || []).length}`);
  console.log(`Upload files: ${(manifest.uploads?.files || []).length}`);
  console.log(`Include database: ${config.includeDatabase ? 'yes' : 'no'}`);
  console.log(`Include uploads: ${config.includeUploads ? 'yes' : 'no'}`);
  if (config.targetDatabase) console.log(`New staging database: ${config.targetDatabase}`);
  if (config.uploadsOut) console.log(`New staged uploads directory: ${config.uploadsOut}`);
}

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const backupDir = resolveInputDirectory(args.in);
  if (!backupDir) throw new Error('Provide --in <backup-directory>.');

  const includeDatabase = !args['uploads-only'];
  const includeUploads = !args['db-only'];
  const verification = verifyDatabaseBackup({
    backupDir,
    requireDatabase: includeDatabase,
    requireUploads: includeUploads
  });
  const config = validateRestoreArgs(args, verification);
  printRestorePlan(verification, config);
  if (config.dryRun) {
    console.log('Verified dry run complete. No database connection or file write was performed.');
    return { dryRun: true, verification };
  }

  let targetDb = null;
  let stagedUploads = false;
  try {
    let databaseResult = null;
    if (config.includeDatabase) {
      const connection = await connectDatabase();
      if (config.targetDatabase.toLowerCase() === String(connection.name || '').toLowerCase()) {
        throw new Error('Refusing to restore over the connected/live database. Choose a new staging database.');
      }
      targetDb = connection.getClient().db(config.targetDatabase);
      await assertEmptyDatabase(targetDb);
      console.log(`Connected server fingerprint: ${databaseFingerprint(connection)}`);
      databaseResult = await restoreManifestIntoEmptyDatabase({
        targetDb,
        backupDir: verification.backupDir,
        manifest: verification.manifest
      });
    }

    let uploadResult = null;
    if (config.includeUploads) {
      uploadResult = restoreUploadsToEmptyDirectory({
        backupDir: verification.backupDir,
        manifest: verification.manifest,
        targetDir: config.uploadsOut
      });
      stagedUploads = true;
    }

    const result = {
      ok: true,
      mode: 'staged-only',
      manifestSha256: verification.manifestSha256,
      targetDatabase: config.includeDatabase ? config.targetDatabase : '',
      uploadsOut: config.includeUploads ? config.uploadsOut : '',
      database: databaseResult,
      uploads: uploadResult
    };
    console.log(`Restore staging completed: ${JSON.stringify(result, null, 2)}`);
    console.log('No live database or live uploads were replaced. Validate the staged copy before a controlled cutover.');
    return result;
  } catch (error) {
    if (stagedUploads && config.uploadsOut && fs.existsSync(config.uploadsOut)) {
      removeDirectory(config.uploadsOut);
    }
    if (targetDb) {
      console.error(`The incomplete staging database ${config.targetDatabase} was left in place for forensic review; never cut over to it.`);
    }
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  RESTORE_CONFIRMATION,
  STAGE_DATABASE_PREFIX,
  isOutsideDirectory,
  printRestorePlan,
  restoreUploadsToEmptyDirectory,
  run,
  validateRestoreArgs
};
