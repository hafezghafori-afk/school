require('dotenv').config();
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const FinanceMonthClose = require('../models/FinanceMonthClose');
const FinanceAnomalyCase = require('../models/FinanceAnomalyCase');
const FinancialYear = require('../models/FinancialYear');
const StudentMembership = require('../models/StudentMembership');

const shouldApply = process.argv.includes('--apply');

function monthWindow(monthKey = '') {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return {
    startAt: new Date(year, month - 1, 1),
    endAt: new Date(year, month, 0, 23, 59, 59, 999)
  };
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', {
    autoIndex: false,
    autoCreate: false
  });
  const summary = {
    mode: shouldApply ? 'apply' : 'dry-run',
    scanned: 0,
    inferable: 0,
    updated: 0,
    ambiguous: 0,
    invalidMonthKey: 0,
    duplicateConflicts: 0,
    legacyMonthKeyIndexFound: false,
    legacyMonthKeyIndexDropped: false,
    anomalyCasesScanned: 0,
    anomalyCasesInferable: 0,
    anomalyCasesUpdated: 0,
    anomalyCasesUnresolved: 0,
    anomalyCaseDuplicateConflicts: 0,
    legacyAnomalyIdIndexFound: false,
    legacyAnomalyIdIndexDropped: false,
    samples: []
  };

  try {
    const rows = await FinanceMonthClose.find({
      $or: [
        { schoolId: null }, { schoolId: { $exists: false } },
        { financialYearId: null }, { financialYearId: { $exists: false } },
        { academicYearId: null }, { academicYearId: { $exists: false } }
      ]
    });
    summary.scanned = rows.length;

    for (const row of rows) {
      const window = monthWindow(row.monthKey);
      if (!window) {
        summary.invalidMonthKey += 1;
        continue;
      }
      const candidates = await FinancialYear.find({
        ...(row.academicYearId ? { academicYearId: row.academicYearId } : {}),
        startDate: { $lte: window.endAt },
        endDate: { $gte: window.startAt },
        status: { $ne: 'archived' }
      }).select('_id schoolId academicYearId').lean();
      if (candidates.length !== 1) {
        summary.ambiguous += 1;
        if (summary.samples.length < 20) summary.samples.push({ id: String(row._id), monthKey: row.monthKey, candidates: candidates.length });
        continue;
      }
      const candidate = candidates[0];
      const duplicate = await FinanceMonthClose.exists({
        _id: { $ne: row._id },
        schoolId: candidate.schoolId,
        financialYearId: candidate._id,
        monthKey: row.monthKey
      });
      if (duplicate) {
        summary.duplicateConflicts += 1;
        continue;
      }
      summary.inferable += 1;
      if (!shouldApply) continue;
      row.schoolId = candidate.schoolId;
      row.financialYearId = candidate._id;
      row.academicYearId = candidate.academicYearId;
      await row.save();
      summary.updated += 1;
    }

    const indexes = await FinanceMonthClose.collection.indexes();
    const legacyIndex = indexes.find((index) => index.unique && Object.keys(index.key || {}).length === 1 && index.key.monthKey === 1);
    summary.legacyMonthKeyIndexFound = Boolean(legacyIndex);
    if (shouldApply && legacyIndex && summary.ambiguous === 0 && summary.duplicateConflicts === 0) {
      await FinanceMonthClose.collection.dropIndex(legacyIndex.name);
      summary.legacyMonthKeyIndexDropped = true;
    }
    if (shouldApply && summary.ambiguous === 0 && summary.duplicateConflicts === 0) {
      await FinanceMonthClose.syncIndexes();
    }

    const anomalyCases = await FinanceAnomalyCase.find({
      $or: [{ schoolId: null }, { schoolId: { $exists: false } }]
    });
    summary.anomalyCasesScanned = anomalyCases.length;
    for (const anomalyCase of anomalyCases) {
      const membershipId = String(anomalyCase.studentMembershipId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(membershipId)) {
        summary.anomalyCasesUnresolved += 1;
        continue;
      }
      const membership = await StudentMembership.findById(membershipId).select('schoolId').lean();
      if (!membership?.schoolId) {
        summary.anomalyCasesUnresolved += 1;
        continue;
      }
      const duplicate = await FinanceAnomalyCase.exists({
        _id: { $ne: anomalyCase._id },
        schoolId: membership.schoolId,
        anomalyId: anomalyCase.anomalyId
      });
      if (duplicate) {
        summary.anomalyCaseDuplicateConflicts += 1;
        continue;
      }
      summary.anomalyCasesInferable += 1;
      if (!shouldApply) continue;
      anomalyCase.schoolId = membership.schoolId;
      await anomalyCase.save();
      summary.anomalyCasesUpdated += 1;
    }

    const anomalyIndexes = await FinanceAnomalyCase.collection.indexes();
    const legacyAnomalyIndex = anomalyIndexes.find((index) => (
      index.unique && Object.keys(index.key || {}).length === 1 && index.key.anomalyId === 1
    ));
    summary.legacyAnomalyIdIndexFound = Boolean(legacyAnomalyIndex);
    if (
      shouldApply
      && legacyAnomalyIndex
      && summary.anomalyCasesUnresolved === 0
      && summary.anomalyCaseDuplicateConflicts === 0
    ) {
      await FinanceAnomalyCase.collection.dropIndex(legacyAnomalyIndex.name);
      summary.legacyAnomalyIdIndexDropped = true;
    }
    if (shouldApply && summary.anomalyCasesUnresolved === 0 && summary.anomalyCaseDuplicateConflicts === 0) {
      await FinanceAnomalyCase.syncIndexes();
    }

    console.log(JSON.stringify(summary, null, 2));
    if (
      summary.ambiguous
      || summary.duplicateConflicts
      || summary.invalidMonthKey
      || summary.anomalyCasesUnresolved
      || summary.anomalyCaseDuplicateConflicts
    ) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[migrate:finance-period-scope] failed:', error?.stack || error);
  process.exitCode = 1;
});
