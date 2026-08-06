// Tells finance staff, the moment the academic manager records a
// transfer/dropout/expulsion/suspension, that a student's balance now needs
// attention - instead of finance only discovering it later while a bill
// still looks "open" for someone who has already left. Complements the
// badges in financeStudentLifecycleStatus.js: this is the push, that's the
// pull.
const User = require('../models/User');
const UserNotification = require('../models/UserNotification');
const FinanceBill = require('../models/FinanceBill');
const FeeOrder = require('../models/FeeOrder');
const { normalizeAdminLevel } = require('./permissions');

const NOTIFIABLE_ACTIONS = Object.freeze(['transfer_out', 'dropout', 'expulsion', 'suspension']);
const FINANCE_LEVELS = Object.freeze(['finance_manager', 'finance_lead']);

const ACTION_LABELS = Object.freeze({
  transfer_out: 'تبدیل (منفک شده و به مکتب دیگر منتقل شد)',
  dropout: 'منفک شده (ترک تحصیل)',
  expulsion: 'محروم شده',
  suspension: 'معلق شده'
});

const OPEN_BILL_STATUSES = Object.freeze(['new', 'partial', 'overdue']);

function roundMoney(value = 0) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function computeStudentOutstandingBalance(studentUserId) {
  if (!studentUserId) return 0;
  const [bills, orders] = await Promise.all([
    FinanceBill.find({ student: studentUserId, status: { $in: OPEN_BILL_STATUSES } })
      .select('amountDue amountPaid')
      .lean(),
    FeeOrder.find({ student: studentUserId, status: { $in: OPEN_BILL_STATUSES } })
      .select('outstandingAmount')
      .lean()
  ]);
  const billTotal = bills.reduce((sum, item) => sum + Math.max(0, Number(item?.amountDue || 0) - Number(item?.amountPaid || 0)), 0);
  const orderTotal = orders.reduce((sum, item) => sum + Number(item?.outstandingAmount || 0), 0);
  return roundMoney(billTotal + orderTotal);
}

/**
 * Notifies finance_manager/finance_lead admins that a student's academic
 * status just changed in a way that affects finance, and how much of their
 * balance is still outstanding after the automatic future-billing cleanup.
 * Best-effort: failures are logged, never thrown, so a notification hiccup
 * can't fail the lifecycle transaction that already committed.
 */
async function notifyFinanceOfLifecycleChange({ app, membership, action, effectiveAt, stoppedFutureBills } = {}) {
  try {
    if (!NOTIFIABLE_ACTIONS.includes(action) || !membership?.student) return;

    const [studentUser, outstanding] = await Promise.all([
      User.findById(membership.student).select('name').lean(),
      computeStudentOutstandingBalance(membership.student)
    ]);
    const studentName = studentUser?.name || 'شاگرد';
    const actionLabel = ACTION_LABELS[action] || action;
    const dateLabel = (effectiveAt instanceof Date ? effectiveAt : new Date(effectiveAt || Date.now()))
      .toISOString().slice(0, 10);

    const admins = await User.find({ role: 'admin' }).select('_id adminLevel').lean();
    const targets = admins.filter((item) => FINANCE_LEVELS.includes(normalizeAdminLevel(item.adminLevel || '')));
    if (!targets.length) return;

    const title = `تغییر وضعیت مالی-اثرگذار: ${studentName}`;
    const message = outstanding > 0
      ? `${studentName} در تاریخ ${dateLabel} وضعیت «${actionLabel}» را گرفت. این شاگرد ${roundMoney(outstanding)} افغانی بدهی باز دارد که باید بررسی و پیگیری (بازپرداخت یا راکد اعلام) شود.`
      : `${studentName} در تاریخ ${dateLabel} وضعیت «${actionLabel}» را گرفت. بدهی باز ثبت‌شده‌ای برای این شاگرد یافت نشد.`;

    const rows = await UserNotification.insertMany(
      targets.map((admin) => ({
        user: admin._id,
        title,
        message,
        type: 'finance'
      }))
    );

    const io = app?.get?.('io');
    if (io) {
      rows.forEach((item) => io.to(`user:${item.user}`).emit('notify:new', item.toObject()));
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('notifyFinanceOfLifecycleChange failed:', error?.message || error);
  }
}

/**
 * Fires a lightweight, no-payload-beyond-ids broadcast so any open Finance
 * dashboard tab knows to refetch. Without this, AdminFinance.jsx only loads
 * data on mount/its-own-actions, so a status change made from the academic
 * lifecycle screen (a different page/component, no shared client cache)
 * stays invisible in finance until the user manually refreshes.
 * Fires for every lifecycle action, not just the finance-notifiable ones -
 * resume/re_enrollment/transfer_in/class_transfer also change the status
 * the finance badges read.
 */
function broadcastFinanceLifecycleChange({ app, membership, action, effectiveAt } = {}) {
  try {
    const io = app?.get?.('io');
    if (!io || !membership?.student) return;
    io.emit('finance:lifecycle-changed', {
      studentId: String(membership.student),
      membershipId: String(membership._id || ''),
      action: action || '',
      effectiveAt: effectiveAt || null
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('broadcastFinanceLifecycleChange failed:', error?.message || error);
  }
}

module.exports = {
  notifyFinanceOfLifecycleChange,
  broadcastFinanceLifecycleChange,
  computeStudentOutstandingBalance,
  NOTIFIABLE_ACTIONS
};
