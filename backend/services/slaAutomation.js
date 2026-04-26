const FeePayment = require('../models/FeePayment');
const ProfileUpdateRequest = require('../models/ProfileUpdateRequest');
const ContactMessage = require('../models/ContactMessage');
const User = require('../models/User');
const UserNotification = require('../models/UserNotification');
const { logActivity } = require('../utils/activity');
const { normalizeAdminLevel } = require('../utils/permissions');

const LEVEL_ORDER = ['finance_manager', 'finance_lead', 'general_president'];
const OPEN_STATUSES = new Set(['new', 'in_progress', 'on_hold', 'escalated']);

const SLA_ENABLED = String(process.env.SLA_AUTOMATION_ENABLED || 'true').toLowerCase() !== 'false';
const SLA_INTERVAL_MINUTES = Math.max(1, Number(process.env.SLA_AUTOMATION_INTERVAL_MIN || 10));
const LEVEL_TIMEOUT_MINUTES = {
  finance_manager: Math.max(30, Number(process.env.SLA_FINANCE_MANAGER_MIN || 12 * 60)),
  finance_lead: Math.max(30, Number(process.env.SLA_FINANCE_LEAD_MIN || 24 * 60)),
  general_president: Math.max(30, Number(process.env.SLA_GENERAL_PRESIDENT_MIN || 36 * 60))
};

let running = false;

const normalizeLevel = (value = '', fallback = 'finance_manager') => {
  const normalized = normalizeAdminLevel(value || fallback);
  return LEVEL_ORDER.includes(normalized) ? normalized : 'finance_manager';
};

const normalizeStatus = (value = '', fallback = 'new') => {
  const normalized = String(value || '').trim().toLowerCase();
  return OPEN_STATUSES.has(normalized) || normalized === 'resolved'
    ? normalized
    : fallback;
};

const getNextLevel = (level = '') => {
  const current = normalizeLevel(level);
  const index = LEVEL_ORDER.indexOf(current);
  if (index === -1) return 'finance_manager';
  if (index >= LEVEL_ORDER.length - 1) return current;
  return LEVEL_ORDER[index + 1];
};

const getAgeMinutes = (dateValue) => {
  const date = dateValue ? new Date(dateValue) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return Math.floor((Date.now() - date.getTime()) / (60 * 1000));
};

const systemReq = {
  user: null,
  headers: {},
  method: 'SYSTEM',
  originalUrl: '/system/sla-automation',
  ip: '127.0.0.1'
};

const notifyAdminsByLevel = async (app, level, title, message) => {
  const admins = await User.find({ role: 'admin' }).select('_id adminLevel');
  const targets = admins.filter((item) => normalizeLevel(item.adminLevel || '') === normalizeLevel(level));
  if (!targets.length) return 0;

  const rows = await UserNotification.insertMany(
    targets.map((admin) => ({
      user: admin._id,
      title,
      message,
      type: 'workflow'
    }))
  );

  const io = app?.get?.('io');
  if (io) {
    rows.forEach((item) => io.to(`user:${item.user}`).emit('notify:new', item.toObject()));
  }
  return rows.length;
};

const updateFollowUp = (doc, nextLevel, now, note) => {
  const followUp = doc.followUp || {};
  const history = Array.isArray(followUp.history) ? followUp.history : [];
  const canTrackHistory = !!followUp.updatedBy;
  const nextHistory = canTrackHistory
    ? [...history, {
      assignedLevel: nextLevel,
      status: 'escalated',
      note,
      updatedBy: followUp.updatedBy,
      updatedAt: now
    }].slice(-40)
    : history;

  doc.followUp = {
    assignedLevel: nextLevel,
    status: 'escalated',
    note,
    updatedBy: followUp.updatedBy || null,
    updatedAt: now,
    history: nextHistory
  };
};

const processWorkflow = async ({ app, model, action, targetType, baseFilter }) => {
  const rows = await model.find(baseFilter).select('_id followUp createdAt updatedAt');
  const now = new Date();
  let escalated = 0;
  let notifications = 0;

  for (const row of rows) {
    const level = normalizeLevel(row.followUp?.assignedLevel || 'finance_manager');
    const status = normalizeStatus(row.followUp?.status || 'new');
    if (!OPEN_STATUSES.has(status)) continue;

    const ageMinutes = getAgeMinutes(row.followUp?.updatedAt || row.updatedAt || row.createdAt);
    const timeout = LEVEL_TIMEOUT_MINUTES[level] || LEVEL_TIMEOUT_MINUTES.finance_manager;
    if (ageMinutes < timeout) continue;

    const nextLevel = getNextLevel(level);
    if (nextLevel === level) continue;

    const note = `SLA auto escalation from ${level} to ${nextLevel} after ${ageMinutes} minutes`;
    updateFollowUp(row, nextLevel, now, note);
    await row.save();
    escalated += 1;

    notifications += await notifyAdminsByLevel(
      app,
      nextLevel,
      'ارتقای سطح SLA',
      `برای ${targetType} در نتیجه پایان مهلت SLA از سطح ${level} به ${nextLevel} انتقال یافت.`
    );

    await logActivity({
      req: systemReq,
      action,
      targetType,
      targetId: String(row._id),
      reason: 'sla_timeout',
      meta: {
        fromLevel: level,
        toLevel: nextLevel,
        ageMinutes,
        timeoutMinutes: timeout
      }
    });
  }

  return { escalated, notifications };
};

async function runSlaEscalationSweep(app, { force = false } = {}) {
  if (!SLA_ENABLED && !force) {
    return { ok: true, skipped: true, reason: 'sla_disabled' };
  }
  if (running) {
    return { ok: true, skipped: true, reason: 'already_running' };
  }

  running = true;
  try {
    const [receipts, profiles, contacts] = await Promise.all([
      processWorkflow({
        app,
        model: FeePayment,
        action: 'sla_auto_escalation_receipt',
        targetType: 'FeePayment',
        baseFilter: { status: 'pending' }
      }),
      processWorkflow({
        app,
        model: ProfileUpdateRequest,
        action: 'sla_auto_escalation_profile',
        targetType: 'ProfileUpdateRequest',
        baseFilter: { status: 'pending' }
      }),
      processWorkflow({
        app,
        model: ContactMessage,
        action: 'sla_auto_escalation_contact',
        targetType: 'ContactMessage',
        baseFilter: { status: { $ne: 'read' } }
      })
    ]);

    return {
      ok: true,
      skipped: false,
      runsAt: new Date().toISOString(),
      summary: {
        receipts,
        orders: receipts,
        profiles,
        contacts,
        totals: {
          escalated: receipts.escalated + profiles.escalated + contacts.escalated,
          notifications: receipts.notifications + profiles.notifications + contacts.notifications
        }
      }
    };
  } finally {
    running = false;
  }
}

function startSlaAutomation(app) {
  if (!SLA_ENABLED) {
    return { enabled: false, intervalMinutes: SLA_INTERVAL_MINUTES };
  }
  const intervalMs = SLA_INTERVAL_MINUTES * 60 * 1000;
  const timer = setInterval(() => {
    runSlaEscalationSweep(app).catch(() => {});
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  runSlaEscalationSweep(app).catch(() => {});

  return {
    enabled: true,
    intervalMinutes: SLA_INTERVAL_MINUTES,
    stop: () => clearInterval(timer)
  };
}

module.exports = {
  runSlaEscalationSweep,
  startSlaAutomation,
  LEVEL_TIMEOUT_MINUTES
};
