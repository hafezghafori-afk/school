const FinanceBill = require('../models/FinanceBill');
const FeeOrder = require('../models/FeeOrder');
const FinanceRelief = require('../models/FinanceRelief');
const User = require('../models/User');
const StudentCore = require('../models/StudentCore');
const StudentProfile = require('../models/StudentProfile');
const UserNotification = require('../models/UserNotification');
const { logActivity } = require('../utils/activity');
const { sendMail } = require('../utils/mailer');

const FINANCE_REMINDER_ENABLED = String(process.env.FINANCE_REMINDER_AUTOMATION_ENABLED || 'false').toLowerCase() === 'true';
const FINANCE_REMINDER_INTERVAL_MINUTES = Math.max(15, Number(process.env.FINANCE_REMINDER_INTERVAL_MIN || 360));

let running = false;

const createSystemReq = (app, actorUserId = null) => ({
  user: actorUserId ? { id: actorUserId } : null,
  app,
  headers: {},
  method: 'SYSTEM',
  originalUrl: '/system/finance-reminder-automation',
  ip: '127.0.0.1'
});

const formatFinanceAmountLabel = (value = 0) => `${Number(value || 0).toLocaleString('fa-AF-u-ca-persian')} AFN`;

const getReliefTypeLabel = (reliefType = '') => ({
  scholarship_full: 'بورسیه کامل',
  scholarship_partial: 'بورسیه جزئی',
  charity_support: 'حمایت خیریه',
  free_student: 'معافیت کامل',
  sibling_discount: 'تخفیف خواهر و برادر',
  merit_discount: 'تخفیف شایستگی',
  transport_discount: 'تخفیف ترانسپورت',
  admission_discount: 'تخفیف داخله',
  waiver: 'معافیت',
  manual: 'تسهیلات مالی'
}[String(reliefType || '').trim()] || 'تسهیلات مالی');

async function resolveFinanceAudienceUserIds({ studentId, studentCoreId } = {}) {
  const audience = new Set();
  const normalizedStudentId = String(studentId || '').trim();
  let normalizedStudentCoreId = String(studentCoreId || '').trim();

  if (normalizedStudentId) {
    audience.add(normalizedStudentId);
  }

  if (!normalizedStudentCoreId && normalizedStudentId) {
    const studentCore = await StudentCore.findOne({ userId: normalizedStudentId }).select('_id').lean();
    normalizedStudentCoreId = studentCore?._id ? String(studentCore._id) : '';
  }

  if (!normalizedStudentCoreId) {
    return Array.from(audience);
  }

  const profile = await StudentProfile.findOne({ studentId: normalizedStudentCoreId }).select('guardians').lean();
  const guardians = Array.isArray(profile?.guardians) ? profile.guardians : [];
  for (const guardian of guardians) {
    if (!guardian?.userId || guardian?.status === 'inactive') continue;
    audience.add(String(guardian.userId));
  }

  return Array.from(audience);
}

async function notifyFinanceAudience({
  req,
  userIds = [],
  title = '',
  message = '',
  type = 'finance',
  emailSubject,
  emailHtml,
  emailText
} = {}) {
  const normalizedUserIds = Array.from(new Set(
    userIds
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));

  if (!normalizedUserIds.length) return [];

  const notifications = await UserNotification.insertMany(
    normalizedUserIds.map((userId) => ({
      user: userId,
      title,
      message,
      type
    }))
  );

  const io = req?.app?.get?.('io');
  if (io) {
    notifications.forEach((notification) => {
      io.to(`user:${notification.user}`).emit('notify:new', notification.toObject());
    });
  }

  const users = await User.find({ _id: { $in: normalizedUserIds } }).select('email status').lean();
  await Promise.all(users.map(async (user) => {
    if (!user?.email || String(user.status || '').trim().toLowerCase() === 'inactive') return null;
    try {
      await sendMail({
        to: user.email,
        subject: emailSubject || title,
        text: emailText || message,
        html: emailHtml || `<p>${message}</p>`
      });
    } catch {
      return null;
    }
    return null;
  }));

  return notifications;
}

async function notifyFinanceAudienceForStudent({
  req,
  studentId,
  studentCoreId,
  title,
  message,
  emailSubject,
  emailHtml,
  emailText
} = {}) {
  const userIds = await resolveFinanceAudienceUserIds({ studentId, studentCoreId });
  return notifyFinanceAudience({
    req,
    userIds,
    title,
    message,
    type: 'finance',
    emailSubject,
    emailHtml,
    emailText
  });
}

async function runFinanceReminderSweep(app, { force = false, req = null, actorUserId = null } = {}) {
  if (!FINANCE_REMINDER_ENABLED && !force) {
    return { ok: true, skipped: true, reason: 'finance_reminder_disabled' };
  }
  if (running) {
    return { ok: true, skipped: true, reason: 'already_running' };
  }

  running = true;
  try {
    const runtimeReq = req || createSystemReq(app, actorUserId);
    const now = new Date();
    const orderNearDate = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
    const reliefNearDate = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1000));
    const reminderCooldownDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    const [orders, reliefs] = await Promise.all([
      FeeOrder.find({
        status: { $in: ['new', 'partial', 'overdue'] },
        dueDate: { $ne: null, $lte: orderNearDate },
        outstandingAmount: { $gt: 0 },
        $or: [
          { lastReminderAt: null },
          { lastReminderAt: { $lt: reminderCooldownDate } }
        ]
      })
        .select('orderNumber student studentId sourceBillId dueDate outstandingAmount status')
        .populate('student', 'name email'),
      FinanceRelief.find({
        status: 'active',
        endDate: { $ne: null, $lte: reliefNearDate },
        $or: [
          { lastReminderAt: null },
          { lastReminderAt: { $lt: reminderCooldownDate } }
        ]
      })
        .select('reliefType student studentId endDate amount percentage coverageMode sponsorName reason')
        .populate('student', 'name email')
    ]);

    let orderReminders = 0;
    for (const order of orders) {
      const remaining = Math.max(0, Number(order.outstandingAmount || 0));
      if (remaining <= 0) continue;

      const overdue = order.dueDate && new Date(order.dueDate).getTime() < now.getTime();
      const title = overdue ? 'یادآوری بدهی معوق' : 'یادآوری سررسید نزدیک';
      const studentName = order.student?.name || 'متعلم';
      const message = overdue
        ? `بل ${order.orderNumber} برای ${studentName} معوق است. باقی‌مانده: ${formatFinanceAmountLabel(remaining)}`
        : `بل ${order.orderNumber} برای ${studentName} به سررسید نزدیک شده است. باقی‌مانده: ${formatFinanceAmountLabel(remaining)}`;

      await notifyFinanceAudienceForStudent({
        req: runtimeReq,
        studentId: order.student?._id || order.student,
        studentCoreId: order.studentId,
        title,
        message,
        emailSubject: title
      });

      order.lastReminderAt = now;
      await order.save();
      if (order.sourceBillId) {
        await FinanceBill.updateOne({ _id: order.sourceBillId }, { $set: { lastReminderAt: now } });
      }
      orderReminders += 1;
    }

    let reliefReminders = 0;
    for (const relief of reliefs) {
      if (!relief.endDate) continue;

      const expired = new Date(relief.endDate).getTime() < now.getTime();
      const title = expired ? 'پایان تسهیلات مالی' : 'ختم نزدیک تسهیلات مالی';
      const studentName = relief.student?.name || 'متعلم';
      const reliefLabel = getReliefTypeLabel(relief.reliefType);
      const coverageLabel = relief.coverageMode === 'full'
        ? 'پوشش کامل'
        : relief.coverageMode === 'percent'
          ? `${Number(relief.percentage || 0).toLocaleString('fa-AF-u-ca-persian')}%`
          : formatFinanceAmountLabel(relief.amount);
      const sponsorLabel = relief.sponsorName ? ` | تمویل‌کننده: ${relief.sponsorName}` : '';
      const message = expired
        ? `${reliefLabel} برای ${studentName} پایان یافته است. پوشش: ${coverageLabel}${sponsorLabel}`
        : `${reliefLabel} برای ${studentName} تا ${new Date(relief.endDate).toLocaleDateString('fa-AF-u-ca-persian')} معتبر است. پوشش: ${coverageLabel}${sponsorLabel}`;

      await notifyFinanceAudienceForStudent({
        req: runtimeReq,
        studentId: relief.student?._id || relief.student,
        studentCoreId: relief.studentId,
        title,
        message,
        emailSubject: title
      });

      relief.lastReminderAt = now;
      await relief.save();
      reliefReminders += 1;
    }

    const notified = orderReminders + reliefReminders;

    await logActivity({
      req: runtimeReq,
      action: 'finance_run_reminders',
      targetType: 'FeeOrder',
      targetId: '',
      meta: {
        notified,
        orderReminders,
        reliefReminders,
        automated: !req
      }
    });

    return {
      ok: true,
      skipped: false,
      runsAt: now.toISOString(),
      notified,
      summary: {
        orderReminders,
        reliefReminders
      }
    };
  } finally {
    running = false;
  }
}

function startFinanceReminderAutomation(app) {
  if (!FINANCE_REMINDER_ENABLED) {
    return { enabled: false, intervalMinutes: FINANCE_REMINDER_INTERVAL_MINUTES };
  }

  const intervalMs = FINANCE_REMINDER_INTERVAL_MINUTES * 60 * 1000;
  const timer = setInterval(() => {
    runFinanceReminderSweep(app).catch(() => {});
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  runFinanceReminderSweep(app).catch(() => {});

  return {
    enabled: true,
    intervalMinutes: FINANCE_REMINDER_INTERVAL_MINUTES,
    stop: () => clearInterval(timer)
  };
}

module.exports = {
  runFinanceReminderSweep,
  startFinanceReminderAutomation,
  FINANCE_REMINDER_INTERVAL_MINUTES
};
