const AUTOMATIC_BILL_SYNC_SUPPRESSION_KEY = 'suppressAutomaticStudentFinanceSyncOnce';

function suppressAutomaticFinanceBillSync(document = null) {
  if (!document || typeof document !== 'object') return document;
  document.$locals = document.$locals || {};
  document.$locals[AUTOMATIC_BILL_SYNC_SUPPRESSION_KEY] = true;
  return document;
}

function consumeAutomaticFinanceBillSyncSuppression(document = null) {
  if (!document?.$locals?.[AUTOMATIC_BILL_SYNC_SUPPRESSION_KEY]) return false;
  delete document.$locals[AUTOMATIC_BILL_SYNC_SUPPRESSION_KEY];
  return true;
}

function isFinanceVersionConflict(error = null) {
  return error?.name === 'VersionError' || Number(error?.code) === 112;
}

module.exports = {
  consumeAutomaticFinanceBillSyncSuppression,
  isFinanceVersionConflict,
  suppressAutomaticFinanceBillSync
};
