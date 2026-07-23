const crypto = require('node:crypto');
const mongoose = require('mongoose');
const FinanceMaintenanceLock = require('../models/FinanceMaintenanceLock');

const GLOBAL_LOCK_ID = 'global';
const RESET_OPERATION = 'finance_ledger_reset';
const ACTIVE_STATE_CACHE_MS = 500;
let activeStateCache = { checkedAt: 0, active: false };

const asId = (value) => String(value?._id || value?.id || value || '').trim();
const lockIdForSchool = (schoolId = '') => {
  const normalized = asId(schoolId);
  return normalized ? `school:${normalized}` : GLOBAL_LOCK_ID;
};
const hashToken = (value = '') => crypto.createHash('sha256').update(String(value || '')).digest('hex');

function validateSchoolId(schoolId = '') {
  const normalized = asId(schoolId);
  if (normalized && !mongoose.Types.ObjectId.isValid(normalized)) {
    throw new Error('finance_maintenance_school_invalid');
  }
  return normalized;
}

async function acquireFinanceMaintenanceLock({
  schoolId = '',
  actorId = '',
  operation = RESET_OPERATION,
  reason = '',
  meta = {}
} = {}) {
  const normalizedSchoolId = validateSchoolId(schoolId);
  // Ledger reset takes a full-database backup, so maintenance is deliberately
  // global even when the deletion scope is one school. A single lock id also
  // removes the race between a global reset and a school-scoped reset.
  const lockId = GLOBAL_LOCK_ID;
  const existing = await FinanceMaintenanceLock.findOne({ active: true }).lean();
  if (existing?.active) {
    const error = new Error('finance_maintenance_already_active');
    error.lock = existing;
    throw error;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  let item;
  try {
    item = await FinanceMaintenanceLock.findOneAndUpdate(
      { _id: lockId, active: { $ne: true } },
      {
        $set: {
          schoolId: normalizedSchoolId || null,
          active: true,
          operation: String(operation || RESET_OPERATION).trim(),
          reason: String(reason || '').trim(),
          tokenHash: hashToken(token),
          actorId: mongoose.Types.ObjectId.isValid(asId(actorId)) ? actorId : null,
          startedAt: now,
          releasedAt: null,
          heartbeatAt: now,
          meta: meta && typeof meta === 'object' ? meta : {}
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (Number(error?.code) !== 11000) throw error;
    const conflict = new Error('finance_maintenance_already_active');
    conflict.lock = await FinanceMaintenanceLock.findById(lockId).lean();
    throw conflict;
  }

  if (!item?.active) throw new Error('finance_maintenance_lock_failed');
  activeStateCache = { checkedAt: Date.now(), active: true };
  return { item, token };
}

async function assertFinanceMaintenanceLock({ schoolId = '', token = '' } = {}) {
  validateSchoolId(schoolId);
  const item = await FinanceMaintenanceLock.findById(GLOBAL_LOCK_ID).lean();
  if (!item?.active || !token || item.tokenHash !== hashToken(token)) {
    throw new Error('finance_maintenance_lock_invalid');
  }
  return item;
}

async function touchFinanceMaintenanceLock({ schoolId = '', token = '', meta = null } = {}) {
  await assertFinanceMaintenanceLock({ schoolId, token });
  const update = { heartbeatAt: new Date() };
  if (meta && typeof meta === 'object') update.meta = meta;
  return FinanceMaintenanceLock.findByIdAndUpdate(
    GLOBAL_LOCK_ID,
    { $set: update },
    { new: true }
  );
}

async function releaseFinanceMaintenanceLock({ schoolId = '', token = '', force = false, meta = null } = {}) {
  validateSchoolId(schoolId);
  const lockId = GLOBAL_LOCK_ID;
  const item = await FinanceMaintenanceLock.findById(lockId);
  if (!item?.active) return item;
  if (!force && (!token || item.tokenHash !== hashToken(token))) {
    throw new Error('finance_maintenance_lock_invalid');
  }
  item.active = false;
  item.releasedAt = new Date();
  item.heartbeatAt = new Date();
  item.tokenHash = '';
  if (meta && typeof meta === 'object') item.meta = meta;
  await item.save();
  activeStateCache = { checkedAt: Date.now(), active: false };
  return item;
}

async function isFinanceMaintenanceActive(schoolId = '') {
  validateSchoolId(schoolId);
  const now = Date.now();
  if ((now - activeStateCache.checkedAt) < ACTIVE_STATE_CACHE_MS) return activeStateCache.active;
  const active = Boolean(await FinanceMaintenanceLock.exists({ active: true }));
  activeStateCache = { checkedAt: now, active };
  return active;
}

module.exports = {
  GLOBAL_LOCK_ID,
  RESET_OPERATION,
  acquireFinanceMaintenanceLock,
  assertFinanceMaintenanceLock,
  hashToken,
  isFinanceMaintenanceActive,
  lockIdForSchool,
  releaseFinanceMaintenanceLock,
  touchFinanceMaintenanceLock
};
