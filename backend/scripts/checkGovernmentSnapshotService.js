const assert = require('assert');
const {
  GOVERNMENT_SNAPSHOT_RATIFY_LEVELS,
  normalizeGovernmentSnapshotType,
  resolveGovernmentReportKey,
  resolveGovernmentSnapshotStage,
  serializeGovernmentFinanceSnapshot,
  checkGovernmentSnapshotRatifier,
  applyGovernmentSnapshotRatification,
  applyGovernmentSnapshotRejection
} = require('../services/governmentSnapshotService');

// Phase 3 of the مرکز مالی دولت review (P10/P11) — unit coverage for the
// government-snapshot pure logic pulled out of financeRoutes.js.

// ---- type / key normalizers ---------------------------------------------
assert.strictEqual(normalizeGovernmentSnapshotType('annual'), 'annual');
assert.strictEqual(normalizeGovernmentSnapshotType('ANNUAL'), 'annual');
assert.strictEqual(normalizeGovernmentSnapshotType('monthly'), 'monthly');
assert.strictEqual(normalizeGovernmentSnapshotType('quarterly'), 'quarterly');
assert.strictEqual(normalizeGovernmentSnapshotType(''), 'quarterly');
assert.strictEqual(normalizeGovernmentSnapshotType('nonsense'), 'quarterly');

assert.strictEqual(resolveGovernmentReportKey('annual'), 'government_finance_annual');
assert.strictEqual(resolveGovernmentReportKey('monthly'), 'government_finance_monthly');
assert.strictEqual(resolveGovernmentReportKey('quarterly'), 'government_finance_quarterly');
assert.strictEqual(resolveGovernmentReportKey('x'), 'government_finance_quarterly');

// ---- legacy stage reconciliation --------------------------------------
assert.strictEqual(resolveGovernmentSnapshotStage({ officialStage: 'draft' }), 'draft');
assert.strictEqual(resolveGovernmentSnapshotStage({ officialStage: 'ratified' }), 'ratified');
assert.strictEqual(resolveGovernmentSnapshotStage({ officialStage: 'rejected' }), 'rejected');
assert.strictEqual(resolveGovernmentSnapshotStage({ isOfficial: true }), 'ratified', 'legacy official rows surface as ratified');
assert.strictEqual(resolveGovernmentSnapshotStage({ isOfficial: true, officialStage: 'draft' }), 'ratified', 'legacy isOfficial wins over a defaulted draft stage');
assert.strictEqual(resolveGovernmentSnapshotStage({ isOfficial: false, officialStage: 'rejected' }), 'rejected');
assert.strictEqual(resolveGovernmentSnapshotStage({}), 'draft');

// ---- serializer -------------------------------------------------------
assert.strictEqual(serializeGovernmentFinanceSnapshot(null), null);
const serialized = serializeGovernmentFinanceSnapshot({
  _id: 's1',
  isOfficial: true,
  generatedBy: { _id: 'u1', name: 'Maker' },
  ratifiedBy: { _id: 'u2', name: 'Checker' },
  financialYearId: { _id: 'fy1', title: 'FY 1404', isActive: true },
  classId: null
});
assert.strictEqual(serialized.officialStage, 'ratified', 'legacy official row serializes as ratified');
assert.deepStrictEqual(serialized.generatedBy, { _id: 'u1', name: 'Maker' });
assert.deepStrictEqual(serialized.ratifiedBy, { _id: 'u2', name: 'Checker' });
assert.strictEqual(serialized.financialYearId, 'fy1', 'populated ref is flattened to its id');
assert.strictEqual(serialized.financialYear.title, 'FY 1404');

// ---- ratifier gate --------------------------------------------------
assert.ok(GOVERNMENT_SNAPSHOT_RATIFY_LEVELS.includes('finance_lead'));
assert.ok(GOVERNMENT_SNAPSHOT_RATIFY_LEVELS.includes('general_president'));

const managerGate = checkGovernmentSnapshotRatifier({ actorLevel: 'finance_manager', generatorId: 'a', actorId: 'b' });
assert.strictEqual(managerGate.statusCode, 403);
assert.strictEqual(managerGate.code, 'finance_government_ratify_level_invalid');

const selfGate = checkGovernmentSnapshotRatifier({ actorLevel: 'finance_lead', generatorId: 'u1', actorId: 'u1', fourEyesEnabled: true });
assert.strictEqual(selfGate.statusCode, 409);
assert.strictEqual(selfGate.code, 'finance_government_ratify_self');

assert.strictEqual(
  checkGovernmentSnapshotRatifier({ actorLevel: 'finance_lead', generatorId: 'u1', actorId: 'u1', fourEyesEnabled: false }),
  null,
  'with four-eyes disabled a single operator may self-ratify'
);
assert.strictEqual(
  checkGovernmentSnapshotRatifier({ actorLevel: 'finance_lead', generatorId: 'u1', actorId: 'u2', fourEyesEnabled: true }),
  null,
  'a different ratifier at the right level is allowed'
);
assert.strictEqual(
  checkGovernmentSnapshotRatifier({ actorLevel: 'general_president', generatorId: 'u1', actorId: 'u1', action: 'reject' }),
  null,
  'the self-check does not apply to reject'
);
const rejectLevelGate = checkGovernmentSnapshotRatifier({ actorLevel: 'finance_manager', actorId: 'x', action: 'reject' });
assert.strictEqual(rejectLevelGate.statusCode, 403);
assert.ok(rejectLevelGate.message.includes('رد'));

// ---- state transitions --------------------------------------------
const toRatify = {};
applyGovernmentSnapshotRatification(toRatify, { actorId: 'u2', actorLevel: 'finance_lead', note: 'ok', closeReadiness: { canClose: true } });
assert.strictEqual(toRatify.isOfficial, true);
assert.strictEqual(toRatify.officialStage, 'ratified');
assert.strictEqual(String(toRatify.ratifiedBy), 'u2');
assert.strictEqual(toRatify.rejectedBy, null);
assert.deepStrictEqual(toRatify.readinessAtRatification, { canClose: true });
assert.strictEqual(toRatify.officialTrail.length, 1);
assert.strictEqual(toRatify.officialTrail[0].action, 'ratify');
assert.strictEqual(toRatify.officialTrail[0].level, 'finance_lead');

const toReject = { officialTrail: [{ action: 'ratify' }] };
applyGovernmentSnapshotRejection(toReject, { actorId: 'u3', actorLevel: 'general_president', reason: 'wrong period' });
assert.strictEqual(toReject.isOfficial, false);
assert.strictEqual(toReject.officialStage, 'rejected');
assert.strictEqual(toReject.rejectReason, 'wrong period');
assert.strictEqual(toReject.officialTrail.length, 2);
assert.strictEqual(toReject.officialTrail[1].action, 'reject');
assert.strictEqual(toReject.officialTrail[1].reason, 'wrong period');

console.log('[check:government-snapshot-service] ok');
