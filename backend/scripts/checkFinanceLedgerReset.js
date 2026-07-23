const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ALL_SCHOOLS_CONFIRMATION,
  APPLY_CONFIRMATION,
  normalizeUploadPath,
  parseArgs,
  validateApplyArgs
} = require('./resetFinanceLedger');
const { repoRoot } = require('./backupRestoreShared');
const {
  UNLOCK_CONFIRMATION,
  isResetVerificationClean,
  validateUnlockArgs
} = require('./reviewFinanceMaintenanceLock');
const { parseSerial, resolveMonthParts } = require('../utils/financeNumberSequence');

const objectId = '507f1f77bcf86cd799439011';
const fingerprint = 'a'.repeat(64);
const planDigest = 'b'.repeat(64);
const backupDir = path.join(path.parse(repoRoot).root, 'durable-finance-backups', 'reset-check');
const restoreTestDatabase = 'finance_reset_restore_test_check';

const commonApplyArgs = {
  'actor-id': objectId,
  'expected-database': 'school_db',
  'expected-database-fingerprint': fingerprint,
  'expected-plan-digest': planDigest,
  'backup-dir': backupDir,
  'restore-test-database': restoreTestDatabase,
  confirm: APPLY_CONFIRMATION
};

assert.deepEqual(
  parseArgs(['--apply', `--school-id=${objectId}`, '--actor-id', objectId]),
  { apply: true, 'school-id': objectId, 'actor-id': objectId }
);
assert.deepEqual(
  validateApplyArgs({ 'school-id': objectId, ...commonApplyArgs }),
  {
    allSchools: false,
    schoolId: objectId,
    actorId: objectId,
    expectedDatabase: 'school_db',
    expectedDatabaseFingerprint: fingerprint,
    expectedPlanDigest: planDigest,
    backupDir: path.resolve(backupDir),
    restoreTestDatabase
  }
);
assert.deepEqual(
  validateApplyArgs({
    'all-schools': true,
    ...commonApplyArgs,
    'confirm-all-schools': ALL_SCHOOLS_CONFIRMATION
  }),
  {
    allSchools: true,
    schoolId: '',
    actorId: objectId,
    expectedDatabase: 'school_db',
    expectedDatabaseFingerprint: fingerprint,
    expectedPlanDigest: planDigest,
    backupDir: path.resolve(backupDir),
    restoreTestDatabase
  }
);

for (const requiredKey of [
  'expected-database-fingerprint',
  'expected-plan-digest',
  'backup-dir',
  'restore-test-database',
  'confirm'
]) {
  const invalid = { 'school-id': objectId, ...commonApplyArgs };
  delete invalid[requiredKey];
  assert.throws(() => validateApplyArgs(invalid), new RegExp(requiredKey.replace('confirm', 'confirm|confirmation'), 'i'));
}
assert.throws(() => validateApplyArgs({
  'school-id': objectId,
  ...commonApplyArgs,
  'backup-dir': path.join(repoRoot, 'unsafe-backup')
}), /outside the application repository/);
assert.throws(() => validateApplyArgs({
  'school-id': objectId,
  'all-schools': true,
  ...commonApplyArgs,
  'confirm-all-schools': ALL_SCHOOLS_CONFIRMATION
}), /either --school-id or --all-schools/);
assert.throws(() => validateApplyArgs({
  'all-schools': true,
  ...commonApplyArgs
}), /confirm-all-schools/);

const resetId = 'FR-20260722123045-ABCDEF12';
assert.deepEqual(validateUnlockArgs({
  unlock: true,
  'actor-id': objectId,
  'expected-database': 'school_db',
  'expected-database-fingerprint': fingerprint,
  'expected-reset-id': resetId,
  'expected-plan-digest': planDigest,
  'review-note': 'بررسی دستی حساب‌ها تکمیل شد',
  confirm: UNLOCK_CONFIRMATION
}), {
  unlock: true,
  actorId: objectId,
  expectedDatabase: 'school_db',
  expectedDatabaseFingerprint: fingerprint,
  expectedResetId: resetId,
  expectedPlanDigest: planDigest,
  reviewNote: 'بررسی دستی حساب‌ها تکمیل شد'
});
assert.deepEqual(validateUnlockArgs({}), { unlock: false });
assert.throws(() => validateUnlockArgs({ unlock: true }), /actor-id/);
assert.equal(isResetVerificationClean({
  counts: { financeBills: 0, feeOrders: 0, financeReceipts: 0, feePayments: 0 },
  amounts: { postedTreasury: 0 },
  blocked: false
}), true);
assert.equal(isResetVerificationClean({
  counts: { financeBills: 1, feeOrders: 0, financeReceipts: 0, feePayments: 0 },
  amounts: { postedTreasury: 0 },
  blocked: false
}), false);
assert.equal(isResetVerificationClean({
  counts: {
    financeBills: 0,
    feeOrders: 0,
    financeReceipts: 0,
    feePayments: 0,
    managerReliefsToPreserve: 1
  },
  amounts: { postedTreasury: 0 },
  blocked: false
}), false);
assert.equal(isResetVerificationClean({
  counts: {
    financeBills: 0,
    feeOrders: 0,
    financeReceipts: 0,
    feePayments: 0,
    postedFeePaymentTreasuryTransactions: 1
  },
  amounts: { postedTreasury: 0 },
  blocked: false
}), false);

const upload = normalizeUploadPath('/uploads/finance-receipts/sample.pdf');
assert.equal(upload, path.resolve(__dirname, '..', 'uploads', 'finance-receipts', 'sample.pdf'));
assert.equal(normalizeUploadPath('/uploads/../../outside.txt'), '');
assert.equal(
  normalizeUploadPath('https://example.test/uploads/finance-receipts/a.pdf'),
  path.resolve(__dirname, '..', 'uploads', 'finance-receipts', 'a.pdf')
);

assert.equal(parseSerial('BL-202607-0042', 'BL', '202607'), 42);
assert.equal(parseSerial('BL-202607-OLD', 'BL', '202607'), 0);
assert.deepEqual(resolveMonthParts(new Date(2026, 6, 22)), { year: 2026, month: '07', monthKey: '202607' });

const resetSource = fs.readFileSync(path.resolve(__dirname, '../services/financeLedgerResetService.js'), 'utf8');
const resetCliSource = fs.readFileSync(path.resolve(__dirname, './resetFinanceLedger.js'), 'utf8');
const backupSource = fs.readFileSync(path.resolve(__dirname, '../services/databaseBackupService.js'), 'utf8');
const restoreSource = fs.readFileSync(path.resolve(__dirname, './restoreDatabase.js'), 'utf8');
const maintenanceSource = fs.readFileSync(path.resolve(__dirname, '../services/financeMaintenanceService.js'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');

const requiredOperations = [
  'FinanceTreasuryTransaction.updateMany',
  'FinanceDocumentArchive.updateMany',
  'FinanceDeliveryCampaign.updateMany',
  'FeePayment.deleteMany',
  'FinanceReceipt.deleteMany',
  'FeeOrder.deleteMany',
  'FinanceBill.deleteMany',
  'session.withTransaction',
  'finance_ledger_reset_transactions_required',
  "['pending_review', 'closed', 'reopened']",
  'conflictingOwnership',
  'ambiguousLegacyOwnership'
];
for (const operation of requiredOperations) {
  assert.equal(resetSource.includes(operation), true, `Missing reset guard/operation: ${operation}`);
}

const paymentIndex = resetSource.indexOf('FeePayment.deleteMany');
const receiptIndex = resetSource.indexOf('FinanceReceipt.deleteMany');
const orderIndex = resetSource.indexOf('FeeOrder.deleteMany');
const billIndex = resetSource.indexOf('FinanceBill.deleteMany');
assert.equal(paymentIndex < receiptIndex && receiptIndex < orderIndex && orderIndex < billIndex, true);

const lockIndex = resetCliSource.indexOf('lock = await acquireFinanceMaintenanceLock');
const backupIndex = resetCliSource.indexOf('await createDatabaseBackup');
const applyIndex = resetCliSource.indexOf('await applyFinanceLedgerReset');
assert.equal(lockIndex >= 0 && lockIndex < backupIndex && backupIndex < applyIndex, true);
assert.equal(resetCliSource.includes("schoolId: ''"), true, 'Reset lock must be global.');
assert.equal(resetCliSource.includes('lockedPreflight.planDigest'), true, 'Plan digest must be rechecked after freezing writes.');
assert.equal(resetCliSource.includes('keepLock = Boolean(error?.resetId)'), true, 'Post-commit verification failures must keep the lock.');
assert.equal(resetCliSource.includes("phase: 'post_commit_review_required'"), true, 'Post-commit failure must record a reviewable resetId on the lock.');
assert.equal(resetCliSource.includes('proveDatabaseBackupRestore'), true, 'Backup restore proof is required before reset.');

for (const rawBackupGuard of [
  'listCollections',
  'TRANSIENT_COLLECTIONS',
  'EJSON.stringify',
  'sha256(serialized)',
  'inventoryDirectory',
  'Restore-test database is not empty'
]) {
  assert.equal(backupSource.includes(rawBackupGuard), true, `Missing raw backup guard: ${rawBackupGuard}`);
}

assert.equal(maintenanceSource.includes("const GLOBAL_LOCK_ID = 'global'"), true);
assert.equal(maintenanceSource.includes('FinanceMaintenanceLock.findOne({ active: true })'), true);
const globalFreezeIndex = serverSource.indexOf("app.use('/api', blockFinanceWritesDuringMaintenance);");
const firstApiRouteIndex = serverSource.indexOf("app.use('/api/auth', authRoutes);");
assert.equal(globalFreezeIndex >= 0 && globalFreezeIndex < firstApiRouteIndex, true, 'Maintenance must freeze every API route before route handlers.');

for (const stagedRestoreGuard of [
  "const STAGE_DATABASE_PREFIX = 'restore_stage_'",
  'assertEmptyDatabase(targetDb)',
  'Refusing to restore over the connected/live database',
  "mode: 'staged-only'",
  'expected-manifest-sha256'
]) {
  assert.equal(restoreSource.includes(stagedRestoreGuard), true, `Missing staged restore guard: ${stagedRestoreGuard}`);
}
assert.equal(restoreSource.includes('deleteMany('), false, 'Safe restore must never clear the live database.');
assert.equal(restoreSource.includes('removeDirectory(uploadsDir)'), false, 'Safe restore must never clear live uploads.');

console.log('Finance ledger reset safety checks passed.');
