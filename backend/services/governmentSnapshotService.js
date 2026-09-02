// Phase 3 of the مرکز مالی دولت review (finding P11) — pure logic for the
// official government finance record, lifted out of the 11k-line financeRoutes.js
// so the route handlers stay thin and this can be unit tested directly.

const { serializeSchoolClassLite } = require('../utils/classScope');

const GOVERNMENT_SNAPSHOT_RATIFY_LEVELS = Object.freeze(['finance_lead', 'general_president']);
const GOVERNMENT_SNAPSHOT_STAGES = Object.freeze(['draft', 'ratified', 'rejected']);

function normalizeGovernmentSnapshotType(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'annual') return 'annual';
  if (normalized === 'monthly') return 'monthly';
  return 'quarterly';
}

function resolveGovernmentReportKey(reportType = '') {
  const normalized = normalizeGovernmentSnapshotType(reportType);
  if (normalized === 'annual') return 'government_finance_annual';
  if (normalized === 'monthly') return 'government_finance_monthly';
  return 'government_finance_quarterly';
}

function serializeGovernmentFinanceSnapshotActor(actor = null) {
  if (!actor) return null;
  if (actor?._id) return { _id: actor._id, name: actor.name || '' };
  return actor;
}

// Records created before the two-person flow carry isOfficial:true and no
// meaningful officialStage; surface them as already-ratified so the archive UI
// doesn't mistake them for pending drafts.
function resolveGovernmentSnapshotStage(plain = {}) {
  let stage = GOVERNMENT_SNAPSHOT_STAGES.includes(plain.officialStage) ? plain.officialStage : 'draft';
  if (plain.isOfficial && stage !== 'ratified') stage = 'ratified';
  return stage;
}

function serializeGovernmentFinanceSnapshot(value = null) {
  if (!value) return null;
  const plain = value?.toObject ? value.toObject() : { ...(value || {}) };
  return {
    ...plain,
    officialStage: resolveGovernmentSnapshotStage(plain),
    financialYearId: plain.financialYearId?._id || plain.financialYearId || null,
    academicYearId: plain.academicYearId?._id || plain.academicYearId || null,
    classId: plain.classId?._id || plain.classId || null,
    schoolClass: serializeSchoolClassLite(plain.classId || null),
    ratifiedBy: serializeGovernmentFinanceSnapshotActor(plain.ratifiedBy || null),
    rejectedBy: serializeGovernmentFinanceSnapshotActor(plain.rejectedBy || null),
    financialYear: plain.financialYearId?._id
      ? {
          _id: plain.financialYearId._id,
          title: plain.financialYearId.title || '',
          code: plain.financialYearId.code || '',
          status: plain.financialYearId.status || '',
          isActive: Boolean(plain.financialYearId.isActive),
          isClosed: Boolean(plain.financialYearId.isClosed)
        }
      : null,
    academicYear: plain.academicYearId?._id
      ? {
          _id: plain.academicYearId._id,
          title: plain.academicYearId.title || '',
          code: plain.academicYearId.code || ''
        }
      : null,
    generatedBy: plain.generatedBy?._id
      ? { _id: plain.generatedBy._id, name: plain.generatedBy.name || '' }
      : (plain.generatedBy || null)
  };
}

// P2 — who may ratify/reject a draft into (or out of) the official record.
// Returns null when the actor is allowed, or a { statusCode, code, message }
// object the route can hand straight back.
function checkGovernmentSnapshotRatifier({
  actorLevel = '',
  generatorId = '',
  actorId = '',
  fourEyesEnabled = true,
  action = 'ratify'
} = {}) {
  if (!GOVERNMENT_SNAPSHOT_RATIFY_LEVELS.includes(String(actorLevel || ''))) {
    return {
      statusCode: 403,
      code: 'finance_government_ratify_level_invalid',
      message: action === 'reject'
        ? 'رد پیش‌نویس نسخهٔ رسمی فقط توسط مدیر ارشد مالی یا ریاست عمومی مجاز است.'
        : 'ثبت رسمی نسخهٔ گزارش مالی دولت فقط توسط مدیر ارشد مالی یا ریاست عمومی مجاز است.'
    };
  }
  if (action === 'ratify' && fourEyesEnabled && String(generatorId || '') === String(actorId || '')) {
    return {
      statusCode: 409,
      code: 'finance_government_ratify_self',
      message: 'سازندهٔ پیش‌نویس نمی‌تواند همان نسخه را رسمی ثبت کند؛ به تایید مقام دوم نیاز است.'
    };
  }
  return null;
}

function applyGovernmentSnapshotRatification(doc, { actorId = '', actorLevel = '', note = '', closeReadiness = null } = {}) {
  doc.isOfficial = true;
  doc.officialStage = 'ratified';
  doc.ratifiedBy = actorId || null;
  doc.ratifiedAt = new Date();
  doc.rejectedBy = null;
  doc.rejectedAt = null;
  doc.rejectReason = '';
  doc.readinessAtRatification = closeReadiness || null;
  if (!Array.isArray(doc.officialTrail)) doc.officialTrail = [];
  doc.officialTrail.push({ action: 'ratify', by: actorId || null, at: new Date(), level: String(actorLevel || ''), note: String(note || '').trim() });
  return doc;
}

function applyGovernmentSnapshotRejection(doc, { actorId = '', actorLevel = '', reason = '' } = {}) {
  doc.isOfficial = false;
  doc.officialStage = 'rejected';
  doc.rejectedBy = actorId || null;
  doc.rejectedAt = new Date();
  doc.rejectReason = String(reason || '').trim();
  if (!Array.isArray(doc.officialTrail)) doc.officialTrail = [];
  doc.officialTrail.push({ action: 'reject', by: actorId || null, at: new Date(), level: String(actorLevel || ''), reason: String(reason || '').trim() });
  return doc;
}

module.exports = {
  GOVERNMENT_SNAPSHOT_RATIFY_LEVELS,
  GOVERNMENT_SNAPSHOT_STAGES,
  normalizeGovernmentSnapshotType,
  resolveGovernmentReportKey,
  resolveGovernmentSnapshotStage,
  serializeGovernmentFinanceSnapshotActor,
  serializeGovernmentFinanceSnapshot,
  checkGovernmentSnapshotRatifier,
  applyGovernmentSnapshotRatification,
  applyGovernmentSnapshotRejection
};
