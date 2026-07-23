require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const {
  createDatabaseBackup,
  databaseFingerprint,
  proveDatabaseBackupRestore,
  verifyDatabaseBackup
} = require('../services/databaseBackupService');
const {
  applyFinanceLedgerReset,
  collectFinanceLedgerResetPlan,
  compactPlan,
  validateResetActor
} = require('../services/financeLedgerResetService');
const {
  acquireFinanceMaintenanceLock,
  releaseFinanceMaintenanceLock,
  touchFinanceMaintenanceLock
} = require('../services/financeMaintenanceService');
const { repoRoot, uploadsDir, writeJsonFile } = require('./backupRestoreShared');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const APPLY_CONFIRMATION = 'DELETE_ALL_FINANCE_BILLS_AND_PAYMENTS';
const ALL_SCHOOLS_CONFIRMATION = 'DELETE_FINANCE_LEDGER_FOR_ALL_SCHOOLS';

function parseArgs(argv = process.argv.slice(2)) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const equalIndex = token.indexOf('=');
    if (equalIndex > 2) {
      result[token.slice(2, equalIndex)] = token.slice(equalIndex + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || String(next).startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function validateApplyArgs(args = {}) {
  const allSchools = args['all-schools'] === true;
  const schoolId = String(args['school-id'] || '').trim();
  const actorId = String(args['actor-id'] || process.env.FINANCE_RESET_ACTOR_ID || '').trim();
  const expectedDatabase = String(args['expected-database'] || '').trim();
  const expectedDatabaseFingerprint = String(args['expected-database-fingerprint'] || '').trim().toLowerCase();
  const expectedPlanDigest = String(args['expected-plan-digest'] || '').trim().toLowerCase();
  const backupDir = String(args['backup-dir'] || '').trim();
  const restoreTestDatabase = String(args['restore-test-database'] || '').trim();
  if (allSchools && schoolId) {
    throw new Error('Choose either --school-id or --all-schools, not both.');
  }
  if (!allSchools && !mongoose.Types.ObjectId.isValid(schoolId)) {
    throw new Error('Apply requires --school-id=<exact-school-id>.');
  }
  if (!mongoose.Types.ObjectId.isValid(actorId)) {
    throw new Error('Apply requires --actor-id=<finance-lead-user-id>.');
  }
  if (!expectedDatabase) {
    throw new Error('Apply requires --expected-database=<exact-database-name>.');
  }
  if (!/^[a-f0-9]{64}$/.test(expectedDatabaseFingerprint)) {
    throw new Error('Apply requires --expected-database-fingerprint=<64-character-dry-run-fingerprint>.');
  }
  if (!/^[a-f0-9]{64}$/.test(expectedPlanDigest)) {
    throw new Error('Apply requires --expected-plan-digest=<64-character-dry-run-digest>.');
  }
  if (!backupDir || !path.isAbsolute(backupDir)) {
    throw new Error('Apply requires --backup-dir=<new-absolute-durable-directory>.');
  }
  const relativeBackupPath = path.relative(repoRoot, path.resolve(backupDir));
  if (relativeBackupPath === '' || (!relativeBackupPath.startsWith('..') && !path.isAbsolute(relativeBackupPath))) {
    throw new Error('The reset backup directory must be outside the application repository.');
  }
  if (!/^finance_reset_restore_test_[a-z0-9_-]+$/i.test(restoreTestDatabase)) {
    throw new Error('Apply requires --restore-test-database=finance_reset_restore_test_<unique-name>.');
  }
  if (restoreTestDatabase.toLowerCase() === expectedDatabase.toLowerCase()) {
    throw new Error('The restore-test database must differ from --expected-database.');
  }
  if (String(args.confirm || '') !== APPLY_CONFIRMATION) {
    throw new Error(`Apply requires --confirm=${APPLY_CONFIRMATION}.`);
  }
  if (allSchools && String(args['confirm-all-schools'] || '') !== ALL_SCHOOLS_CONFIRMATION) {
    throw new Error(`All-schools apply also requires --confirm-all-schools=${ALL_SCHOOLS_CONFIRMATION}.`);
  }
  return {
    allSchools,
    schoolId,
    actorId,
    expectedDatabase,
    expectedDatabaseFingerprint,
    expectedPlanDigest,
    backupDir: path.resolve(backupDir),
    restoreTestDatabase
  };
}

function normalizeUploadPath(fileUrl = '') {
  const raw = String(fileUrl || '').trim();
  if (!raw) return '';
  let pathname = raw;
  try {
    if (/^https?:\/\//i.test(raw)) pathname = new URL(raw).pathname;
  } catch {
    return '';
  }
  const normalized = pathname.replace(/\\/g, '/');
  const match = normalized.match(/(?:^|\/)uploads\/(.+)$/i);
  const relative = String(match?.[1] || '').replace(/^\/+/, '');
  if (!relative) return '';
  const candidate = path.resolve(uploadsDir, relative);
  const root = `${path.resolve(uploadsDir)}${path.sep}`.toLowerCase();
  if (!`${candidate}${path.sep}`.toLowerCase().startsWith(root)) return '';
  return candidate;
}

function quarantineReceiptFiles(fileUrls = [], backupDir = '') {
  const result = { moved: [], missing: [], skipped: [], failed: [] };
  const targetRoot = path.join(backupDir, 'quarantined-finance-receipts');
  for (const fileUrl of fileUrls || []) {
    const source = normalizeUploadPath(fileUrl);
    if (!source) {
      result.skipped.push(fileUrl);
      continue;
    }
    if (!fs.existsSync(source)) {
      result.missing.push(fileUrl);
      continue;
    }
    try {
      if (!fs.statSync(source).isFile()) {
        result.skipped.push(fileUrl);
        continue;
      }
      const relative = path.relative(uploadsDir, source);
      const target = path.resolve(targetRoot, relative);
      const safeRoot = `${path.resolve(targetRoot)}${path.sep}`.toLowerCase();
      if (!`${target}${path.sep}`.toLowerCase().startsWith(safeRoot)) {
        result.skipped.push(fileUrl);
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.existsSync(target)) {
        result.skipped.push(fileUrl);
        continue;
      }
      fs.renameSync(source, target);
      result.moved.push({ fileUrl, relative });
    } catch (error) {
      result.failed.push({ fileUrl, message: String(error?.message || error) });
    }
  }
  return result;
}

function printJson(label, value) {
  console.log(`${label} ${JSON.stringify(value, null, 2)}`);
}

async function run() {
  const args = parseArgs();
  const apply = args.apply === true;
  const allSchools = args['all-schools'] === true;
  const schoolId = String(args['school-id'] || '').trim();
  const reason = String(args.reason || 'پاک‌سازی کنترل‌شده تمام بل‌ها و پرداخت‌ها پیش از شروع دفتر تازه').trim();
  const actorId = String(args['actor-id'] || process.env.FINANCE_RESET_ACTOR_ID || '').trim();
  const applyConfig = apply ? validateApplyArgs(args) : null;

  if (!apply && !allSchools && schoolId && !mongoose.Types.ObjectId.isValid(schoolId)) {
    throw new Error('Dry-run --school-id is not a valid ObjectId.');
  }
  if (!apply && !allSchools && !schoolId) {
    throw new Error('Dry-run requires --school-id=<exact-school-id> or --all-schools.');
  }

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', {
    autoIndex: false,
    autoCreate: false
  });
  const connectedFingerprint = databaseFingerprint(mongoose.connection);
  if (apply) {
    const connectedDatabase = String(mongoose.connection.name || '').trim();
    if (!connectedDatabase || applyConfig.expectedDatabase !== connectedDatabase) {
      throw new Error(`Connected database mismatch: expected ${applyConfig.expectedDatabase || '(missing)'}, received ${connectedDatabase || '(unknown)'}.`);
    }
    if (applyConfig.expectedDatabaseFingerprint !== connectedFingerprint) {
      throw new Error(`Connected database fingerprint mismatch: expected ${applyConfig.expectedDatabaseFingerprint}, received ${connectedFingerprint}.`);
    }
  }

  let lock = null;
  let keepLock = false;
  let result = null;
  let backup = null;
  try {
    if (apply) await validateResetActor(actorId);
    const preflight = await collectFinanceLedgerResetPlan({ schoolId, allSchools });
    printJson('[finance-ledger-reset][preflight]', {
      database: {
        name: mongoose.connection.name,
        fingerprint: connectedFingerprint
      },
      ...compactPlan(preflight)
    });
    if (!apply) {
      if (preflight.blocked) process.exitCode = 2;
      return;
    }
    if (preflight.blocked) {
      const error = new Error('Reset is blocked by closed/official/delivered financial records. Resolve them through the formal workflow first.');
      error.blockers = preflight.blockers;
      throw error;
    }
    if (preflight.planDigest !== applyConfig.expectedPlanDigest) {
      throw new Error(`Preflight changed since dry-run. Expected digest ${applyConfig.expectedPlanDigest}, received ${preflight.planDigest}.`);
    }

    lock = await acquireFinanceMaintenanceLock({
      schoolId: '',
      actorId,
      reason,
      meta: {
        phase: 'quiescence',
        targetSchoolId: allSchools ? '' : schoolId,
        preflight: compactPlan(preflight)
      }
    });

    // Let requests already inside a write handler and setImmediate mirror hooks
    // finish, then prove that the scoped ledger is stable before taking backup.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const lockedPreflight = await collectFinanceLedgerResetPlan({ schoolId, allSchools });
    if (lockedPreflight.planDigest !== applyConfig.expectedPlanDigest) {
      throw new Error(`Ledger changed while entering maintenance. Expected digest ${applyConfig.expectedPlanDigest}, received ${lockedPreflight.planDigest}.`);
    }

    backup = await createDatabaseBackup({
      backupDir: applyConfig.backupDir,
      label: `pre-finance-ledger-reset-${allSchools ? 'all-schools' : schoolId}`,
      includeDatabase: true,
      includeUploads: true,
      log: (message) => console.log(`[finance-ledger-reset] ${message}`)
    });
    const backupVerification = verifyDatabaseBackup({
      backupDir: backup.backupDir,
      manifest: backup.manifest,
      requireUploads: true
    });
    const restoreProof = await proveDatabaseBackupRestore({
      backupDir: backup.backupDir,
      manifest: backup.manifest,
      testDatabaseName: applyConfig.restoreTestDatabase
    });
    await touchFinanceMaintenanceLock({
      schoolId: '',
      token: lock.token,
      meta: {
        phase: 'reset',
        targetSchoolId: allSchools ? '' : schoolId,
        backupManifest: backup.manifestPath,
        backupVerification,
        restoreProof
      }
    });

    result = await applyFinanceLedgerReset({
      schoolId,
      allSchools,
      actorId,
      maintenanceToken: lock.token,
      backup,
      restoreProof,
      expectedPlanDigest: applyConfig.expectedPlanDigest,
      reason
    });
    const quarantine = quarantineReceiptFiles(result.receiptFilesPreservedInBackup, backup.backupDir);
    result.quarantine = quarantine;
    writeJsonFile(path.join(backup.backupDir, 'finance-ledger-reset-result.json'), result);

    await releaseFinanceMaintenanceLock({
      schoolId: '',
      token: lock.token,
      meta: { phase: 'completed', resetId: result.resetId, verification: result.verification }
    });
    lock = null;
    printJson('[finance-ledger-reset][completed]', result);
  } catch (error) {
    // Once the transaction has committed, any failure while quarantining
    // files, writing the result receipt, or releasing the lock must leave the
    // system frozen for manual verification. Never report it as a harmless
    // pre-commit abort.
    if (!error?.resetId && result?.resetId) error.resetId = result.resetId;
    keepLock = Boolean(error?.resetId);
    if (keepLock && lock) {
      await touchFinanceMaintenanceLock({
        schoolId: '',
        token: lock.token,
        meta: {
          phase: 'post_commit_review_required',
          resetId: error.resetId,
          targetSchoolId: allSchools ? '' : schoolId,
          allSchools,
          backupManifest: backup?.manifestPath || '',
          verification: error?.verification || result?.verification || null,
          failure: String(error?.message || error)
        }
      }).catch(() => {});
    }
    if (error?.blockers) printJson('[finance-ledger-reset][blockers]', error.blockers);
    throw error;
  } finally {
    if (lock && !keepLock) {
      await releaseFinanceMaintenanceLock({
        schoolId: '',
        token: lock.token,
        meta: { phase: 'aborted-before-commit' }
      }).catch(() => {});
    }
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error('[finance-ledger-reset] failed:', error?.stack || error);
    if (error?.resetId) {
      console.error(`[finance-ledger-reset] Reset ${error.resetId} committed but verification failed; maintenance lock was intentionally kept active.`);
    }
    process.exitCode = 1;
  });
}

module.exports = {
  ALL_SCHOOLS_CONFIRMATION,
  APPLY_CONFIRMATION,
  normalizeUploadPath,
  parseArgs,
  quarantineReceiptFiles,
  run,
  validateApplyArgs
};
