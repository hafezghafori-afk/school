require('dotenv').config();
const mongoose = require('mongoose');

require('../models/ExamType');

const {
  applyPromotions,
  previewPromotions,
  rollbackPromotionTransaction
} = require('../services/promotionService');

function parseArgs(argv = []) {
  const options = {
    apply: false,
    rollback: false,
    allowPending: false,
    allowBlocked: false,
    actorUserId: '',
    effectiveAt: '',
    rollbackReason: '',
    ruleId: '',
    sessionId: '',
    sourceMembershipIds: [],
    targetAcademicYearId: '',
    transactionId: ''
  };

  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (!arg) continue;

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--rollback') {
      options.rollback = true;
      continue;
    }
    if (arg === '--allow-pending') {
      options.allowPending = true;
      continue;
    }
    if (arg === '--allow-blocked') {
      options.allowBlocked = true;
      continue;
    }

    if (!arg.startsWith('--')) continue;
    const eqIndex = arg.indexOf('=');
    const key = eqIndex >= 0 ? arg.slice(2, eqIndex) : arg.slice(2);
    const value = eqIndex >= 0 ? arg.slice(eqIndex + 1) : 'true';

    if (key === 'session') options.sessionId = value;
    else if (key === 'rule') options.ruleId = value;
    else if (key === 'target-year') options.targetAcademicYearId = value;
    else if (key === 'actor') options.actorUserId = value;
    else if (key === 'effective-at') options.effectiveAt = value;
    else if (key === 'transaction') options.transactionId = value;
    else if (key === 'reason') options.rollbackReason = value;
    else if (key === 'memberships') {
      options.sourceMembershipIds = String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return options;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildPayload(options) {
  const payload = {
    sessionId: normalizeText(options.sessionId),
    ruleId: normalizeText(options.ruleId),
    targetAcademicYearId: normalizeText(options.targetAcademicYearId),
    effectiveAt: normalizeText(options.effectiveAt),
    sourceMembershipIds: Array.isArray(options.sourceMembershipIds) ? options.sourceMembershipIds.filter(Boolean) : []
  };

  Object.keys(payload).forEach((key) => {
    const value = payload[key];
    if (value === '' || (Array.isArray(value) && !value.length)) {
      delete payload[key];
    }
  });

  return payload;
}

function hasPendingResults(preview) {
  return Array.isArray(preview?.items) && preview.items.some((item) => normalizeText(item.sourceResultStatus) === 'pending');
}

function hasBlockedItems(preview) {
  return Number(preview?.summary?.blocked || 0) > 0;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  await mongoose.connect(mongoUri);

  if (options.rollback) {
    if (!normalizeText(options.transactionId)) {
      throw new Error('promotion_transaction_not_found');
    }
    const response = {
      mode: 'rollback',
      transactionId: normalizeText(options.transactionId),
      rollback: await rollbackPromotionTransaction(
        options.transactionId,
        {
          effectiveAt: normalizeText(options.effectiveAt),
          rollbackReason: normalizeText(options.rollbackReason)
        },
        normalizeText(options.actorUserId) || null
      )
    };
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  if (!normalizeText(options.sessionId)) {
    throw new Error('promotion_session_required');
  }

  const payload = buildPayload(options);
  const preview = await previewPromotions(payload);
  const response = {
    mode: options.apply ? 'apply' : 'preview',
    payload,
    preview
  };

  if (!options.apply) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  if (!options.allowPending && hasPendingResults(preview)) {
    throw new Error('promotion_pending_results_not_allowed');
  }
  if (!options.allowBlocked && hasBlockedItems(preview)) {
    throw new Error('promotion_blocked_items_not_allowed');
  }

  response.applied = await applyPromotions(payload, normalizeText(options.actorUserId) || null);
  console.log(JSON.stringify(response, null, 2));
}

run()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });