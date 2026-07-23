require('dotenv').config();
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const FinanceMaintenanceLock = require('../models/FinanceMaintenanceLock');
const {
  collectFinanceLedgerResetPlan,
  compactPlan,
  validateResetActor
} = require('../services/financeLedgerResetService');
const {
  GLOBAL_LOCK_ID,
  RESET_OPERATION,
  releaseFinanceMaintenanceLock
} = require('../services/financeMaintenanceService');
const { databaseFingerprint } = require('../services/databaseBackupService');
const { parseArgs } = require('./backupRestoreShared');

const UNLOCK_CONFIRMATION = 'RELEASE_FINANCE_LOCK_AFTER_MANUAL_VERIFICATION';

function validateUnlockArgs(args = {}) {
  const unlock = args.unlock === true;
  if (!unlock) return { unlock: false };
  const config = {
    unlock: true,
    actorId: String(args['actor-id'] || '').trim(),
    expectedDatabase: String(args['expected-database'] || '').trim(),
    expectedDatabaseFingerprint: String(args['expected-database-fingerprint'] || '').trim().toLowerCase(),
    expectedResetId: String(args['expected-reset-id'] || '').trim(),
    expectedPlanDigest: String(args['expected-plan-digest'] || '').trim().toLowerCase(),
    reviewNote: String(args['review-note'] || '').trim()
  };
  if (!mongoose.Types.ObjectId.isValid(config.actorId)) {
    throw new Error('Unlock requires --actor-id=<authorized-finance-lead-user-id>.');
  }
  if (!config.expectedDatabase) throw new Error('Unlock requires --expected-database=<exact-name>.');
  if (!/^[a-f0-9]{64}$/.test(config.expectedDatabaseFingerprint)) {
    throw new Error('Unlock requires --expected-database-fingerprint=<status-fingerprint>.');
  }
  if (!/^FR-\d{14}-[A-F0-9]{8}$/.test(config.expectedResetId)) {
    throw new Error('Unlock requires --expected-reset-id=<exact-reset-id>.');
  }
  if (!/^[a-f0-9]{64}$/.test(config.expectedPlanDigest)) {
    throw new Error('Unlock requires --expected-plan-digest=<status-plan-digest>.');
  }
  if (config.reviewNote.length < 10) {
    throw new Error('Unlock requires --review-note=<at-least-10-characters>.');
  }
  if (String(args.confirm || '') !== UNLOCK_CONFIRMATION) {
    throw new Error(`Unlock requires --confirm=${UNLOCK_CONFIRMATION}.`);
  }
  return config;
}

function isResetVerificationClean(plan = {}) {
  const counts = plan.counts || {};
  return [
    'financeBills',
    'feeOrders',
    'financeReceipts',
    'feePayments',
    'linkedDiscountsToDelete',
    'managerDiscountsToPreserve',
    'linkedReliefsToDelete',
    'managerReliefsToPreserve',
    'financeAnomalyCases',
    'draftDerivedMonthCloses',
    'nonOfficialGovernmentSnapshots',
    'documentArchivesToRevoke',
    'deliveryCampaignsToPause',
    'postedFeePaymentTreasuryTransactions'
  ]
    .every((key) => Number(counts[key] || 0) === 0)
    && Number(plan.amounts?.postedTreasury || 0) === 0
    && plan.blocked !== true;
}

async function loadStatus() {
  const lock = await FinanceMaintenanceLock.findById(GLOBAL_LOCK_ID).lean();
  if (!lock?.active) return { active: false, lock: lock || null, plan: null, resetAuditFound: false };
  const resetId = String(lock.meta?.resetId || '').trim();
  const allSchools = lock.meta?.allSchools === true;
  const schoolId = allSchools ? '' : String(lock.meta?.targetSchoolId || lock.schoolId || '').trim();
  const plan = lock.operation === RESET_OPERATION && (allSchools || mongoose.Types.ObjectId.isValid(schoolId))
    ? await collectFinanceLedgerResetPlan({ schoolId, allSchools })
    : null;
  const resetAuditFound = resetId
    ? Boolean(await ActivityLog.exists({ action: 'finance_ledger_reset', 'meta.resetId': resetId }))
    : false;
  return {
    active: true,
    lock,
    resetId,
    allSchools,
    schoolId,
    resetAuditFound,
    plan,
    verificationClean: plan ? isResetVerificationClean(plan) : false
  };
}

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const config = validateUnlockArgs(args);
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', {
    autoIndex: false,
    autoCreate: false
  });
  try {
    const connectedDatabase = String(mongoose.connection.name || '').trim();
    const connectedFingerprint = databaseFingerprint(mongoose.connection);
    const status = await loadStatus();
    const printable = {
      database: { name: connectedDatabase, fingerprint: connectedFingerprint },
      active: status.active,
      operation: status.lock?.operation || '',
      phase: status.lock?.meta?.phase || '',
      resetId: status.resetId || '',
      target: status.active ? { allSchools: status.allSchools, schoolId: status.schoolId } : null,
      resetAuditFound: status.resetAuditFound,
      verificationClean: status.verificationClean,
      plan: status.plan ? compactPlan(status.plan) : null
    };
    console.log(`[finance-maintenance][status] ${JSON.stringify(printable, null, 2)}`);
    if (!config.unlock) return printable;

    if (!status.active || status.lock.operation !== RESET_OPERATION) {
      throw new Error('No active finance-ledger-reset lock is available for this recovery command.');
    }
    if (status.lock.meta?.phase !== 'post_commit_review_required') {
      throw new Error('Unlock is allowed only for a post_commit_review_required lock.');
    }
    if (!status.resetId || status.resetId !== config.expectedResetId) {
      throw new Error('Active lock resetId does not match --expected-reset-id.');
    }
    if (connectedDatabase !== config.expectedDatabase) {
      throw new Error('Connected database does not match --expected-database.');
    }
    if (connectedFingerprint !== config.expectedDatabaseFingerprint) {
      throw new Error('Connected database fingerprint does not match status output.');
    }
    if (!status.resetAuditFound) throw new Error('Committed reset audit record was not found.');
    if (!status.verificationClean) {
      throw new Error('Reset verification is not clean; keep the lock and use staged recovery.');
    }
    if (status.plan.planDigest !== config.expectedPlanDigest) {
      throw new Error('Current reset plan digest does not match --expected-plan-digest.');
    }
    const actor = await validateResetActor(config.actorId);

    const finalStatus = await loadStatus();
    if (
      !finalStatus.active
      || finalStatus.resetId !== config.expectedResetId
      || !finalStatus.verificationClean
      || finalStatus.plan?.planDigest !== config.expectedPlanDigest
    ) {
      throw new Error('Maintenance/reset state changed during review; run status again.');
    }

    await ActivityLog.create({
      actor: config.actorId,
      actorRole: 'admin',
      actorOrgRole: String(actor.orgRole || actor.adminLevel || 'finance_lead'),
      action: 'finance_maintenance_unlock_authorized',
      targetType: 'FinanceLedger',
      targetId: config.expectedResetId,
      reason: config.reviewNote,
      meta: {
        resetId: config.expectedResetId,
        planDigest: config.expectedPlanDigest,
        databaseFingerprint: connectedFingerprint,
        verification: compactPlan(finalStatus.plan)
      }
    });
    await releaseFinanceMaintenanceLock({
      schoolId: '',
      force: true,
      meta: {
        phase: 'manually_released_after_verification',
        resetId: config.expectedResetId,
        reviewedBy: config.actorId,
        reviewNote: config.reviewNote,
        planDigest: config.expectedPlanDigest
      }
    });
    console.log(`[finance-maintenance][released] ${config.expectedResetId}`);
    return { ok: true, released: true, resetId: config.expectedResetId };
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error('[finance-maintenance] failed:', error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  UNLOCK_CONFIRMATION,
  isResetVerificationClean,
  loadStatus,
  run,
  validateUnlockArgs
};
