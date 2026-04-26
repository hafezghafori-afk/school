const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const FinanceMonthClose = require('../models/FinanceMonthClose');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Discount = require('../models/Discount');
const StudentCore = require('../models/StudentCore');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');
const UserNotification = require('../models/UserNotification');
const { logActivity } = require('../utils/activity');
const { sendMail } = require('../utils/mailer');
const { normalizeAdminLevel } = require('../utils/permissions');
const { resolveAdminOrgRole } = require('../utils/userRole');
const { roundMoney, getBillRemainingAmount } = require('../utils/financeReceiptValidation');
const { syncStudentFinanceFromFinanceBill, syncStudentFinanceFromFinanceReceipt } = require('../utils/studentFinanceSync');

const FINANCE_FOUR_EYES_ENABLED = String(process.env.FINANCE_FOUR_EYES_ENABLED || 'true').toLowerCase() !== 'false';

function repairDisplayText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || !/[ØÙÚÛÂâ€]/.test(text)) return text;
  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8').trim();
    return repaired || text;
  } catch {
    return text;
  }
}

function createActionError(status, message) {
  const error = new Error(repairDisplayText(message));
  error.status = status;
  return error;
}

function toMonthKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function isMonthClosed(dateValue) {
  const monthKey = toMonthKey(dateValue);
  if (!monthKey) return false;
  const exists = await FinanceMonthClose.exists({ monthKey, status: 'closed' });
  return !!exists;
}

function parseDateSafe(value, fallback = null) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function sumAdjustments(bill, types = []) {
  return (bill.adjustments || [])
    .filter((item) => types.includes(item.type))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

function applyPaymentToInstallments(bill, paymentAmount = 0, paidAt = new Date()) {
  if (!Array.isArray(bill.installments) || !bill.installments.length) return;
  let remain = Math.max(0, Number(paymentAmount) || 0);
  for (const installment of bill.installments) {
    if (remain <= 0) break;
    const openAmount = Math.max(0, (Number(installment.amount) || 0) - (Number(installment.paidAmount) || 0));
    if (openAmount <= 0) continue;
    const used = Math.min(openAmount, remain);
    installment.paidAmount = (Number(installment.paidAmount) || 0) + used;
    if (installment.paidAmount >= installment.amount) {
      installment.status = 'paid';
      installment.paidAt = paidAt;
    }
    remain -= used;
  }
}

function recalculateBill(bill) {
  const base = Math.max(0, Number(bill.amountOriginal) || 0);
  const discountTotal = sumAdjustments(bill, ['discount', 'waiver']);
  const penaltyTotal = sumAdjustments(bill, ['penalty']);
  bill.amountDue = Math.max(0, base - discountTotal + penaltyTotal);
  bill.amountPaid = Math.max(0, Number(bill.amountPaid) || 0);
  const remaining = Math.max(0, bill.amountDue - bill.amountPaid);

  if (bill.status !== 'void') {
    if (remaining <= 0) {
      bill.status = 'paid';
      if (!bill.paidAt) bill.paidAt = new Date();
    } else if (bill.dueDate && new Date(bill.dueDate).getTime() < Date.now()) {
      bill.status = 'overdue';
      bill.paidAt = null;
    } else if (bill.amountPaid > 0) {
      bill.status = 'partial';
      bill.paidAt = null;
    } else {
      bill.status = 'new';
      bill.paidAt = null;
    }
  }

  if (Array.isArray(bill.installments)) {
    for (const installment of bill.installments) {
      if ((Number(installment.paidAmount) || 0) >= (Number(installment.amount) || 0)) {
        installment.status = 'paid';
      } else if (new Date(installment.dueDate).getTime() < Date.now()) {
        installment.status = 'overdue';
      } else {
        installment.status = 'open';
      }
    }
  }

  return remaining;
}

function normalizeFeePaymentAllocations(payment = {}) {
  const rows = Array.isArray(payment?.allocations) && payment.allocations.length
    ? payment.allocations
    : payment?.feeOrderId
      ? [{ feeOrderId: payment.feeOrderId, amount: payment.amount }]
      : [];

  return rows
    .map((item) => ({
      feeOrderId: String(item?.feeOrderId || '').trim(),
      amount: roundMoney(item?.amount),
      title: String(item?.title || '').trim(),
      orderNumber: String(item?.orderNumber || '').trim()
    }))
    .filter((item) => item.feeOrderId && item.amount > 0);
}

async function resolveFinanceAudienceUserIds({ studentId = '', studentCoreId = '' } = {}) {
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
    if (guardian?.status === 'inactive' || !guardian?.userId) continue;
    audience.add(String(guardian.userId));
  }

  return Array.from(audience);
}

async function notifyStudent({ req, studentId, studentCoreId, title, message, emailSubject, emailHtml, emailText }) {
  const normalizedTitle = repairDisplayText(title);
  const normalizedMessage = repairDisplayText(message);
  const normalizedEmailSubject = repairDisplayText(emailSubject || normalizedTitle);
  const normalizedEmailText = repairDisplayText(emailText || normalizedMessage);
  const normalizedEmailHtml = repairDisplayText(emailHtml || `<p>${normalizedMessage}</p>`);
  const audienceUserIds = await resolveFinanceAudienceUserIds({ studentId, studentCoreId });
  if (!audienceUserIds.length) return;

  const notifications = await UserNotification.insertMany(
    audienceUserIds.map((userId) => ({
      user: userId,
      title: normalizedTitle,
      message: normalizedMessage,
      type: 'finance'
    }))
  );

  const io = req?.app?.get?.('io');
  if (io) {
    notifications.forEach((notification) => {
      io.to(`user:${notification.user}`).emit('notify:new', notification.toObject());
    });
  }

  const users = await User.find({ _id: { $in: audienceUserIds } }).select('email status').lean();
  await Promise.all(users.map(async (user) => {
    if (!user?.email || String(user.status || '').trim().toLowerCase() === 'inactive') return;
    try {
      await sendMail({
        to: user.email,
        subject: normalizedEmailSubject,
        text: normalizedEmailText,
        html: normalizedEmailHtml
      });
    } catch {
      return null;
    }
  }));
}

const RECEIPT_STAGES = {
  financeManager: 'finance_manager_review',
  financeLead: 'finance_lead_review',
  generalPresident: 'general_president_review',
  completed: 'completed',
  rejected: 'rejected'
};

const OPEN_RECEIPT_STAGES = [
  RECEIPT_STAGES.financeManager,
  RECEIPT_STAGES.financeLead,
  RECEIPT_STAGES.generalPresident
];

function normalizeReceiptStage(stage = '') {
  const value = String(stage || '').trim();
  if (OPEN_RECEIPT_STAGES.includes(value)) return value;
  if (value === RECEIPT_STAGES.completed || value === RECEIPT_STAGES.rejected) return value;
  return RECEIPT_STAGES.financeManager;
}

function getRequiredLevelForStage(stage = '') {
  const normalized = normalizeReceiptStage(stage);
  if (normalized === RECEIPT_STAGES.financeLead) return 'finance_lead';
  if (normalized === RECEIPT_STAGES.generalPresident) return 'general_president';
  return 'finance_manager';
}

function canReviewReceiptStage(adminLevel = '', stage = '') {
  const level = normalizeAdminLevel(adminLevel || '');
  const normalizedStage = normalizeReceiptStage(stage);
  if (!OPEN_RECEIPT_STAGES.includes(normalizedStage)) return false;
  if (level === 'general_president') return true;
  return getRequiredLevelForStage(normalizedStage) === level;
}

function getNextReceiptStage(adminLevel = '', currentStage = '') {
  const level = normalizeAdminLevel(adminLevel || '');
  const stage = normalizeReceiptStage(currentStage);
  if (level === 'general_president') return RECEIPT_STAGES.completed;
  if (level === 'finance_manager' && stage === RECEIPT_STAGES.financeManager) return RECEIPT_STAGES.financeLead;
  if (level === 'finance_lead' && stage === RECEIPT_STAGES.financeLead) return RECEIPT_STAGES.generalPresident;
  return '';
}

function actorAlreadyReviewed(trail = [], actorId = '') {
  return Array.isArray(trail)
    && trail.some((entry) => String(entry?.by || '') === String(actorId || ''));
}

function getReceiptStageMessage(stage = '') {
  const normalized = normalizeReceiptStage(stage);
  if (normalized === RECEIPT_STAGES.financeLead) {
    return repairDisplayText('Ø±Ø³ÛŒØ¯ Ø¨Ø±Ø§ÛŒ Ø¨Ø±Ø±Ø³ÛŒ Ø¢Ù…Ø±ÛŒØª Ù…Ø§Ù„ÛŒ Ø§Ø±Ø³Ø§Ù„ Ø´Ø¯');
  }
  if (normalized === RECEIPT_STAGES.generalPresident) {
    return repairDisplayText('Ø±Ø³ÛŒØ¯ Ø¨Ø±Ø§ÛŒ ØªØ§ÛŒÛŒØ¯ Ù†Ù‡Ø§ÛŒÛŒ Ø±ÛŒØ§Ø³Øª Ø¹Ù…ÙˆÙ…ÛŒ Ø§Ø±Ø³Ø§Ù„ Ø´Ø¯');
  }
  return repairDisplayText('Ø±Ø³ÛŒØ¯ Ø¨Ø±Ø§ÛŒ Ø¨Ø±Ø±Ø³ÛŒ Ù…Ø¯ÛŒØ± Ù…Ø§Ù„ÛŒ Ø«Ø¨Øª Ø´Ø¯');
}

const FOLLOW_UP_LEVELS = ['finance_manager', 'finance_lead', 'general_president'];
const FOLLOW_UP_STATUSES = ['new', 'in_progress', 'on_hold', 'escalated', 'resolved'];

function normalizeFollowUpLevel(value = '') {
  const normalized = normalizeAdminLevel(value || '');
  return FOLLOW_UP_LEVELS.includes(normalized) ? normalized : 'finance_manager';
}

function normalizeFollowUpStatus(value = '', fallback = 'new') {
  const normalized = String(value || '').trim().toLowerCase();
  if (FOLLOW_UP_STATUSES.includes(normalized)) return normalized;
  return FOLLOW_UP_STATUSES.includes(fallback) ? fallback : 'new';
}

async function findAdminsByLevels(levels = [], excludeUserId = '') {
  if (!Array.isArray(levels) || !levels.length) return [];
  const admins = await User.find({ role: 'admin' }).select('_id role orgRole adminLevel');
  return admins.filter((item) => {
    if (!item?._id) return false;
    if (excludeUserId && String(item._id) === String(excludeUserId)) return false;
    return levels.includes(resolveAdminOrgRole(item));
  });
}

async function notifyAdmins({ req, admins = [], title = '', message = '', type = 'finance' }) {
  if (!Array.isArray(admins) || !admins.length) return;
  const normalizedTitle = repairDisplayText(title);
  const normalizedMessage = repairDisplayText(message);
  const records = await UserNotification.insertMany(
    admins.map((admin) => ({
      user: admin._id,
      title: normalizedTitle,
      message: normalizedMessage,
      type
    }))
  );
  const io = req?.app?.get?.('io');
  if (io) {
    records.forEach((record) => {
      io.to(`user:${record.user}`).emit('notify:new', record.toObject());
    });
  }
}

async function resolveAdminActorLevel(userId = '') {
  if (!userId) return '';
  const actor = await User.findById(userId).select('role orgRole adminLevel');
  if (!actor || actor.role !== 'admin') return '';
  return resolveAdminOrgRole(actor);
}

function buildCanonicalDiscountSourceKey(feeOrderId = '') {
  return `canonical:${String(feeOrderId || '')}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

async function addBillAdjustmentAction({ req, billId = '', body = {} } = {}) {
  const item = await FinanceBill.findById(billId);
  if (!item) throw createActionError(404, 'Ø¨Ù„ ÛŒØ§ÙØª Ù†Ø´Ø¯');
  if (item.status === 'void') throw createActionError(400, 'Ø¨Ù„ Ø¨Ø§Ø·Ù„ Ù‚Ø§Ø¨Ù„ ØªØºÛŒÛŒØ± Ù†ÛŒØ³Øª');
  if (await isMonthClosed(item.issuedAt)) {
    throw createActionError(400, 'Ù…Ø§Ù‡ Ù…Ø§Ù„ÛŒ Ø¨Ø³ØªÙ‡ Ø´Ø¯Ù‡ Ø§Ø³Øª Ùˆ ØªØºÛŒÛŒØ±Ø§Øª Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª');
  }

  const type = ['discount', 'waiver', 'penalty', 'manual'].includes(body?.type) ? body.type : 'discount';
  const amount = roundMoney(body?.amount);
  if (!amount) throw createActionError(400, 'Ù…Ø¨Ù„Øº Ù…Ø¹ØªØ¨Ø± Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª');

  item.adjustments.push({
    type,
    amount,
    reason: String(body?.reason || '').trim(),
    createdBy: req.user.id
  });
  recalculateBill(item);
  await item.save();
  await syncStudentFinanceFromFinanceBill(item._id);

  await logActivity({
    req,
    action: 'finance_add_adjustment',
    targetType: 'FinanceBill',
    targetId: item._id.toString(),
    meta: { type, amount }
  });

  return { item, message: 'ØªØ¹Ø¯ÛŒÙ„ Ù…Ø§Ù„ÛŒ Ø«Ø¨Øª Ø´Ø¯' };
}

async function addFeeOrderAdjustmentAction({ req, feeOrderId = '', body = {} } = {}) {
  const item = await FeeOrder.findById(feeOrderId);
  if (!item) throw createActionError(404, 'Canonical fee order was not found');

  if (item.sourceBillId) {
    const result = await addBillAdjustmentAction({ req, billId: item.sourceBillId, body });
    const refreshed = await FeeOrder.findById(feeOrderId);
    return {
      ...result,
      item: refreshed || item,
      sourceBillId: String(item.sourceBillId || '')
    };
  }

  if (item.status === 'void') throw createActionError(400, 'Void fee order cannot be adjusted');
  if (await isMonthClosed(item.issuedAt)) {
    throw createActionError(400, 'Financial month is closed and canonical fee order adjustments are blocked');
  }

  const type = ['discount', 'waiver', 'penalty', 'manual'].includes(body?.type) ? body.type : 'discount';
  const amount = roundMoney(body?.amount);
  if (!amount) throw createActionError(400, 'Adjustment amount is required');

  item.adjustments = Array.isArray(item.adjustments) ? item.adjustments : [];
  item.adjustments.push({
    type,
    amount,
    reason: String(body?.reason || '').trim(),
    createdBy: req.user.id,
    createdAt: new Date()
  });
  recalculateBill(item);
  await item.save();

  await Discount.create({
    feeOrderId: item._id,
    sourceKey: buildCanonicalDiscountSourceKey(item._id),
    studentMembershipId: item.studentMembershipId || null,
    linkScope: item.linkScope || 'membership',
    studentId: item.studentId || null,
    student: item.student || null,
    classId: item.classId || null,
    academicYearId: item.academicYearId || null,
    discountType: type,
    amount,
    reason: String(body?.reason || '').trim(),
    status: 'active',
    source: 'manual',
    createdBy: req.user.id
  });

  await logActivity({
    req,
    action: 'fee_order_add_adjustment',
    targetType: 'FeeOrder',
    targetId: item._id.toString(),
    meta: { type, amount }
  });

  return { item, message: 'Canonical fee order adjustment saved' };
}

async function setBillInstallmentsAction({ req, billId = '', body = {} } = {}) {
  const item = await FinanceBill.findById(billId);
  if (!item) throw createActionError(404, 'Ø¨Ù„ ÛŒØ§ÙØª Ù†Ø´Ø¯');
  if (item.status === 'void') throw createActionError(400, 'Ø¨Ù„ Ø¨Ø§Ø·Ù„ Ù‚Ø§Ø¨Ù„ Ù‚Ø³Ø·â€ŒØ¨Ù†Ø¯ÛŒ Ù†ÛŒØ³Øª');
  if (await isMonthClosed(item.issuedAt)) {
    throw createActionError(400, 'Ù…Ø§Ù‡ Ù…Ø§Ù„ÛŒ Ø¨Ø³ØªÙ‡ Ø´Ø¯Ù‡ Ø§Ø³Øª Ùˆ Ù‚Ø³Ø·â€ŒØ¨Ù†Ø¯ÛŒ Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª');
  }

  let installments = [];
  if (Array.isArray(body?.installments) && body.installments.length) {
    installments = body.installments
      .map((row, idx) => ({
        installmentNo: idx + 1,
        dueDate: parseDateSafe(row.dueDate, null),
        amount: Math.max(0, Number(row.amount) || 0),
        paidAmount: 0,
        status: 'open'
      }))
      .filter((row) => row.dueDate && row.amount > 0);
  } else {
    const count = Math.max(1, Number(body?.count) || 0);
    const startDate = parseDateSafe(body?.startDate, item.dueDate);
    const stepDays = Math.max(1, Number(body?.stepDays) || 30);
    if (!count || !startDate) {
      throw createActionError(400, 'Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù‚Ø³Ø·â€ŒØ¨Ù†Ø¯ÛŒ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª');
    }
    const perInstallment = Math.round((item.amountDue / count) * 100) / 100;
    let remain = item.amountDue;
    installments = Array.from({ length: count }).map((_, idx) => {
      const amount = idx === count - 1 ? Math.max(0, Math.round(remain * 100) / 100) : perInstallment;
      remain -= amount;
      return {
        installmentNo: idx + 1,
        dueDate: new Date(startDate.getTime() + (idx * stepDays * 24 * 60 * 60 * 1000)),
        amount,
        paidAmount: 0,
        status: 'open'
      };
    });
  }

  if (!installments.length) {
    throw createActionError(400, 'Ø­Ø¯Ø§Ù‚Ù„ ÛŒÚ© Ù‚Ø³Ø· Ù…Ø¹ØªØ¨Ø± Ù„Ø§Ø²Ù… Ø§Ø³Øª');
  }

  item.installments = installments;
  applyPaymentToInstallments(item, item.amountPaid, item.paidAt || new Date());
  recalculateBill(item);
  await item.save();
  await syncStudentFinanceFromFinanceBill(item._id);

  await logActivity({
    req,
    action: 'finance_set_installments',
    targetType: 'FinanceBill',
    targetId: item._id.toString(),
    meta: { count: installments.length }
  });

  return { item, message: 'Ù‚Ø³Ø·â€ŒØ¨Ù†Ø¯ÛŒ Ø«Ø¨Øª Ø´Ø¯' };
}

async function setFeeOrderInstallmentsAction({ req, feeOrderId = '', body = {} } = {}) {
  const item = await FeeOrder.findById(feeOrderId);
  if (!item) throw createActionError(404, 'Canonical fee order was not found');

  if (item.sourceBillId) {
    const result = await setBillInstallmentsAction({ req, billId: item.sourceBillId, body });
    const refreshed = await FeeOrder.findById(feeOrderId);
    return {
      ...result,
      item: refreshed || item,
      sourceBillId: String(item.sourceBillId || '')
    };
  }

  if (item.status === 'void') throw createActionError(400, 'Void fee order cannot be installmentized');
  if (await isMonthClosed(item.issuedAt)) {
    throw createActionError(400, 'Financial month is closed and canonical installments are blocked');
  }

  let installments = [];
  if (Array.isArray(body?.installments) && body.installments.length) {
    installments = body.installments
      .map((row, idx) => ({
        installmentNo: idx + 1,
        dueDate: parseDateSafe(row.dueDate, null),
        amount: Math.max(0, Number(row.amount) || 0),
        paidAmount: 0,
        status: 'open'
      }))
      .filter((row) => row.dueDate && row.amount > 0);
  } else {
    const count = Math.max(1, Number(body?.count) || 0);
    const startDate = parseDateSafe(body?.startDate, item.dueDate);
    const stepDays = Math.max(1, Number(body?.stepDays) || 30);
    if (!count || !startDate) {
      throw createActionError(400, 'Installment configuration is invalid');
    }
    const perInstallment = Math.round((item.amountDue / count) * 100) / 100;
    let remain = item.amountDue;
    installments = Array.from({ length: count }).map((_, idx) => {
      const amount = idx === count - 1 ? Math.max(0, Math.round(remain * 100) / 100) : perInstallment;
      remain -= amount;
      return {
        installmentNo: idx + 1,
        dueDate: new Date(startDate.getTime() + (idx * stepDays * 24 * 60 * 60 * 1000)),
        amount,
        paidAmount: 0,
        status: 'open'
      };
    });
  }

  if (!installments.length) {
    throw createActionError(400, 'At least one valid installment is required');
  }

  item.installments = installments;
  applyPaymentToInstallments(item, item.amountPaid, item.paidAt || new Date());
  recalculateBill(item);
  await item.save();

  await logActivity({
    req,
    action: 'fee_order_set_installments',
    targetType: 'FeeOrder',
    targetId: item._id.toString(),
    meta: { count: installments.length }
  });

  return { item, message: 'Canonical fee order installments saved' };
}

async function voidBillAction({ req, billId = '', body = {} } = {}) {
  const actorLevel = await resolveAdminActorLevel(req.user.id);
  if (!['finance_lead', 'general_president'].includes(actorLevel)) {
    throw createActionError(403, '\u0628\u0627\u0637\u0644\u200c\u0633\u0627\u0632\u06cc \u0628\u0644 \u0641\u0642\u0637 \u0628\u0631\u0627\u06cc \u0622\u0645\u0631\u06cc\u062a \u0645\u0627\u0644\u06cc \u06cc\u0627 \u0631\u06cc\u0627\u0633\u062a \u0639\u0645\u0648\u0645\u06cc \u0645\u062c\u0627\u0632 \u0627\u0633\u062a');
  }

  const item = await FinanceBill.findById(billId);
  if (!item) throw createActionError(404, 'Ø¨Ù„ ÛŒØ§ÙØª Ù†Ø´Ø¯');
  if (await isMonthClosed(item.issuedAt)) {
    throw createActionError(400, 'Ù…Ø§Ù‡ Ù…Ø§Ù„ÛŒ Ø¨Ø³ØªÙ‡ Ø´Ø¯Ù‡ Ø§Ø³Øª Ùˆ Ø¨Ø§Ø·Ù„â€ŒØ³Ø§Ø²ÛŒ Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª');
  }
  const reason = String(body?.reason || '').trim();
  if (!reason) {
    throw createActionError(400, 'Ø¨Ø±Ø§ÛŒ Ø¨Ø§Ø·Ù„â€ŒØ³Ø§Ø²ÛŒØŒ Ø«Ø¨Øª Ø¯Ù„ÛŒÙ„ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª');
  }

  item.status = 'void';
  item.voidReason = reason;
  item.voidedBy = req.user.id;
  item.voidedAt = new Date();
  await item.save();
  await syncStudentFinanceFromFinanceBill(item._id);

  await notifyStudent({
    req,
    studentId: item.student,
    studentCoreId: item.studentId,
    title: 'Ø¨Ù„ Ø¨Ø§Ø·Ù„ Ø´Ø¯',
    message: `Ø¨Ù„ Ø´Ù…Ø§Ø±Ù‡ ${item.billNumber} Ø¨Ø§ Ø¯Ù„ÛŒÙ„ Ø²ÛŒØ± Ø¨Ø§Ø·Ù„ Ø´Ø¯: ${reason}`,
    emailSubject: 'Ø§Ø¨Ø·Ø§Ù„ Ø¨Ù„'
  });

  await logActivity({
    req,
    action: 'finance_void_bill',
    targetType: 'FinanceBill',
    targetId: item._id.toString(),
    meta: { reason, level: actorLevel }
  });

  return { item, message: 'Ø¨Ù„ Ø¨Ø§ Ù…ÙˆÙÙ‚ÛŒØª Ø¨Ø§Ø·Ù„ Ø´Ø¯' };
}

async function voidFeeOrderAction({ req, feeOrderId = '', body = {} } = {}) {
  const actorLevel = await resolveAdminActorLevel(req.user.id);
  if (!['finance_lead', 'general_president'].includes(actorLevel)) {
    throw createActionError(403, 'Only finance leadership can void canonical fee orders');
  }

  const item = await FeeOrder.findById(feeOrderId);
  if (!item) throw createActionError(404, 'Canonical fee order was not found');

  if (item.sourceBillId) {
    const result = await voidBillAction({ req, billId: item.sourceBillId, body });
    const refreshed = await FeeOrder.findById(feeOrderId);
    return {
      ...result,
      item: refreshed || item,
      sourceBillId: String(item.sourceBillId || '')
    };
  }

  if (await isMonthClosed(item.issuedAt)) {
    throw createActionError(400, 'Financial month is closed and canonical fee order void is blocked');
  }
  const reason = String(body?.reason || '').trim();
  if (!reason) throw createActionError(400, 'Void reason is required');

  item.status = 'void';
  item.voidReason = reason;
  item.voidedBy = req.user.id;
  item.voidedAt = new Date();
  await item.save();

  await notifyStudent({
    req,
    studentId: item.student,
    studentCoreId: item.studentId,
    title: 'Fee order voided',
    message: `Your fee order ${item.orderNumber} was voided. Reason: ${reason}`,
    emailSubject: 'Fee order voided'
  });

  await logActivity({
    req,
    action: 'fee_order_void',
    targetType: 'FeeOrder',
    targetId: item._id.toString(),
    meta: { reason, level: actorLevel }
  });

  return { item, message: 'Canonical fee order voided successfully' };
}

async function approveReceiptAction({ req, receiptId = '', body = {} } = {}) {
  const [receipt, actor] = await Promise.all([
    FinanceReceipt.findById(receiptId)
      .populate('student', 'name email')
      .populate('course', 'title'),
    User.findById(req.user.id).select('name role orgRole adminLevel')
  ]);

  if (!receipt) throw createActionError(404, 'Receipt not found');
  if (!actor || actor.role !== 'admin') {
    throw createActionError(403, 'Only admins can review receipts');
  }
  if (receipt.status !== 'pending') {
    throw createActionError(400, 'This receipt has already been reviewed');
  }

  const actorLevel = resolveAdminOrgRole(actor);
  const currentStage = normalizeReceiptStage(receipt.approvalStage || '');
  if (!canReviewReceiptStage(actorLevel, currentStage)) {
    throw createActionError(403, `Receipt is waiting for ${getRequiredLevelForStage(currentStage)} review`);
  }
  if (FINANCE_FOUR_EYES_ENABLED && actorAlreadyReviewed(receipt.approvalTrail, req.user.id)) {
    throw createActionError(400, 'Four-eyes policy is active: the same admin cannot approve the same receipt in multiple stages.');
  }

  const reviewNote = String(body?.note || '').trim();
  const now = new Date();

  receipt.reviewedBy = req.user.id;
  receipt.reviewedAt = now;
  receipt.reviewNote = reviewNote;
  receipt.rejectReason = '';
  receipt.approvalTrail = Array.isArray(receipt.approvalTrail) ? receipt.approvalTrail : [];
  receipt.approvalTrail.push({
    level: actorLevel,
    action: 'approve',
    by: req.user.id,
    at: now,
    note: reviewNote,
    reason: ''
  });

  const nextStage = getNextReceiptStage(actorLevel, currentStage);
  if (!nextStage) {
    throw createActionError(400, 'No next approval stage is defined for this level');
  }

  if (nextStage !== RECEIPT_STAGES.completed) {
    receipt.approvalStage = nextStage;
    await receipt.save();
    await syncStudentFinanceFromFinanceReceipt(receipt._id);

    const nextLevel = getRequiredLevelForStage(nextStage);
    const nextAdmins = await findAdminsByLevels([nextLevel], req.user.id);
    await notifyAdmins({
      req,
      admins: nextAdmins,
      title: 'Receipt moved to next review stage',
      message: `Receipt for "${receipt.student?.name || 'Student'}" moved to the next stage.`,
      type: 'finance'
    });

    await logActivity({
      req,
      action: 'finance_forward_receipt_stage',
      targetType: 'FinanceReceipt',
      targetId: receipt._id.toString(),
      meta: {
        stageFrom: currentStage,
        stageTo: nextStage,
        level: actorLevel
      }
    });

    return {
      message: getReceiptStageMessage(nextStage),
      nextStage,
      requiresFinalApproval: true
    };
  }

  if (await isMonthClosed(receipt.paidAt || new Date())) {
    throw createActionError(400, 'Financial month is closed; final approval is blocked');
  }

  const bill = await FinanceBill.findById(receipt.bill);
  if (!bill) throw createActionError(404, 'Linked bill not found');
  if (bill.status === 'void') {
    throw createActionError(400, 'Bill is void; receipt cannot be approved');
  }
  if (await isMonthClosed(bill.issuedAt)) {
    throw createActionError(400, 'Bill month is closed; changes are blocked');
  }

  const approvalAmount = roundMoney(receipt.amount);
  const remainingBeforeApproval = getBillRemainingAmount(bill);
  if (remainingBeforeApproval <= 0) {
    throw createActionError(400, 'Ø§ÛŒÙ† Ø¨Ù„ Ø¯ÛŒÚ¯Ø± Ù…Ø§Ù†Ø¯Ù‡ Ø¨Ø§Ø² Ù†Ø¯Ø§Ø±Ø¯ Ùˆ ØªØ§ÛŒÛŒØ¯ Ø§ÛŒÙ† Ø±Ø³ÛŒØ¯ Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª');
  }
  if (approvalAmount > remainingBeforeApproval) {
    throw createActionError(400, `Ù…Ø¨Ù„Øº Ø§ÛŒÙ† Ø±Ø³ÛŒØ¯ Ø§Ø² Ù…Ø§Ù†Ø¯Ù‡ ÙØ¹Ù„ÛŒ Ø¨Ù„ Ø¨ÛŒØ´ØªØ± Ø§Ø³Øª. Ù…Ø§Ù†Ø¯Ù‡ ÙØ¹Ù„ÛŒ: ${remainingBeforeApproval}`);
  }

  receipt.amount = approvalAmount;
  receipt.status = 'approved';
  receipt.approvalStage = RECEIPT_STAGES.completed;
  await receipt.save();

  bill.amountPaid = roundMoney((Number(bill.amountPaid) || 0) + approvalAmount);
  applyPaymentToInstallments(bill, approvalAmount, receipt.paidAt || new Date());
  recalculateBill(bill);
  await bill.save();
  await syncStudentFinanceFromFinanceReceipt(receipt._id);
  await syncStudentFinanceFromFinanceBill(bill._id);

  await notifyStudent({
    req,
    studentId: bill.student,
    studentCoreId: bill.studentId,
    title: 'Payment receipt approved',
    message: `Your receipt for bill ${bill.billNumber} was approved.`,
    emailSubject: 'Payment receipt approved'
  });

  await logActivity({
    req,
    action: 'finance_approve_receipt',
    targetType: 'FinanceReceipt',
    targetId: receipt._id.toString(),
    meta: { billId: String(bill._id), amount: receipt.amount, level: actorLevel }
  });

  return {
    message: 'Receipt fully approved',
    billStatus: bill.status,
    nextStage: RECEIPT_STAGES.completed
  };
}

async function approveFeePaymentAction({ req, feePaymentId = '', body = {} } = {}) {
  const payment = await FeePayment.findById(feePaymentId);
  if (!payment) throw createActionError(404, 'Canonical fee payment was not found');

  if (payment.sourceReceiptId) {
    const result = await approveReceiptAction({ req, receiptId: payment.sourceReceiptId, body });
    const refreshed = await FeePayment.findById(feePaymentId);
    return {
      ...result,
      item: refreshed || payment,
      sourceReceiptId: String(payment.sourceReceiptId || '')
    };
  }

  const actor = await User.findById(req.user.id).select('name role orgRole adminLevel');
  if (!actor || actor.role !== 'admin') {
    throw createActionError(403, 'Only admins can review canonical fee payments');
  }
  if (payment.status !== 'pending') {
    throw createActionError(400, 'This canonical fee payment has already been reviewed');
  }

  const actorLevel = resolveAdminOrgRole(actor);
  const currentStage = normalizeReceiptStage(payment.approvalStage || '');
  if (!canReviewReceiptStage(actorLevel, currentStage)) {
    throw createActionError(403, `Canonical fee payment is waiting for ${getRequiredLevelForStage(currentStage)} review`);
  }
  if (FINANCE_FOUR_EYES_ENABLED && actorAlreadyReviewed(payment.approvalTrail, req.user.id)) {
    throw createActionError(400, 'Four-eyes policy is active: the same admin cannot approve the same payment in multiple stages.');
  }

  const reviewNote = String(body?.note || '').trim();
  const now = new Date();
  payment.reviewedBy = req.user.id;
  payment.reviewedAt = now;
  payment.reviewNote = reviewNote;
  payment.rejectReason = '';
  payment.approvalTrail = Array.isArray(payment.approvalTrail) ? payment.approvalTrail : [];
  payment.approvalTrail.push({
    level: actorLevel,
    action: 'approve',
    by: req.user.id,
    at: now,
    note: reviewNote,
    reason: ''
  });

  const nextStage = getNextReceiptStage(actorLevel, currentStage);
  if (!nextStage) {
    throw createActionError(400, 'No next approval stage is defined for this payment');
  }

  if (nextStage !== RECEIPT_STAGES.completed) {
    payment.approvalStage = nextStage;
    await payment.save();

    const nextLevel = getRequiredLevelForStage(nextStage);
    const nextAdmins = await findAdminsByLevels([nextLevel], req.user.id);
    await notifyAdmins({
      req,
      admins: nextAdmins,
      title: 'Canonical payment moved to next review stage',
      message: `Payment ${payment.paymentNumber} moved to the next stage.`,
      type: 'finance'
    });

    await logActivity({
      req,
      action: 'fee_payment_forward_stage',
      targetType: 'FeePayment',
      targetId: payment._id.toString(),
      meta: { stageFrom: currentStage, stageTo: nextStage, level: actorLevel }
    });

    return {
      item: payment,
      message: getReceiptStageMessage(nextStage),
      nextStage,
      requiresFinalApproval: true
    };
  }

  if (await isMonthClosed(payment.paidAt || new Date())) {
    throw createActionError(400, 'Financial month is closed; final approval is blocked');
  }

  const approvalAmount = roundMoney(payment.amount);
  const allocations = normalizeFeePaymentAllocations(payment);
  if (!allocations.length) {
    throw createActionError(400, 'No fee order allocations were found for this payment');
  }

  const orderIds = Array.from(new Set(allocations.map((item) => String(item.feeOrderId || '')).filter(Boolean)));
  const orders = await FeeOrder.find({ _id: { $in: orderIds } });
  if (orders.length !== orderIds.length) {
    throw createActionError(404, 'One or more allocated fee orders were not found');
  }

  const orderMap = new Map(orders.map((item) => [String(item._id || ''), item]));
  const updatedOrders = [];
  for (const allocation of allocations) {
    const order = orderMap.get(String(allocation.feeOrderId || ''));
    if (!order) throw createActionError(404, 'Allocated fee order was not found');
    if (payment.studentMembershipId && order.studentMembershipId && String(order.studentMembershipId) !== String(payment.studentMembershipId)) {
      throw createActionError(400, 'Allocated fee order does not belong to the same membership');
    }
    if (order.status === 'void') {
      throw createActionError(400, 'Fee order is void; payment cannot be approved');
    }
    if (await isMonthClosed(order.issuedAt)) {
      throw createActionError(400, 'Fee order month is closed; changes are blocked');
    }

    const remainingBeforeApproval = getBillRemainingAmount(order);
    if (remainingBeforeApproval <= 0) {
      throw createActionError(400, 'One of the allocated fee orders is already settled');
    }
    if (allocation.amount > remainingBeforeApproval) {
      throw createActionError(400, `Payment allocation exceeds remaining balance. Remaining: ${remainingBeforeApproval}`);
    }
  }

  payment.amount = approvalAmount;
  payment.allocations = allocations.map((item) => ({
    feeOrderId: item.feeOrderId,
    amount: item.amount,
    title: item.title,
    orderNumber: item.orderNumber
  }));
  if (!payment.feeOrderId && allocations.length === 1) {
    payment.feeOrderId = allocations[0].feeOrderId;
  }
  payment.status = 'approved';
  payment.approvalStage = RECEIPT_STAGES.completed;
  await payment.save();

  for (const allocation of allocations) {
    const order = orderMap.get(String(allocation.feeOrderId || ''));
    order.amountPaid = roundMoney((Number(order.amountPaid) || 0) + allocation.amount);
    applyPaymentToInstallments(order, allocation.amount, payment.paidAt || new Date());
    recalculateBill(order);
    await order.save();
    updatedOrders.push(order);
  }

  await notifyStudent({
    req,
    studentId: payment.student,
    studentCoreId: payment.studentId,
    title: 'Canonical payment approved',
    message: `Your payment ${payment.paymentNumber} was approved.`,
    emailSubject: 'Canonical payment approved'
  });

  await logActivity({
    req,
    action: 'fee_payment_approve',
    targetType: 'FeePayment',
    targetId: payment._id.toString(),
    meta: {
      feeOrderIds: updatedOrders.map((item) => String(item._id || '')),
      allocationCount: allocations.length,
      amount: payment.amount,
      level: actorLevel
    }
  });

  return {
    item: payment,
    feeOrder: updatedOrders[0] || null,
    feeOrders: updatedOrders,
    message: 'Canonical fee payment fully approved',
    billStatus: updatedOrders[0]?.status || 'approved',
    nextStage: RECEIPT_STAGES.completed
  };
}

async function rejectReceiptAction({ req, receiptId = '', body = {} } = {}) {
  const [receipt, actor] = await Promise.all([
    FinanceReceipt.findById(receiptId),
    User.findById(req.user.id).select('name role orgRole adminLevel')
  ]);

  if (!receipt) throw createActionError(404, 'Receipt not found');
  if (!actor || actor.role !== 'admin') {
    throw createActionError(403, 'Only admins can reject receipts');
  }
  if (receipt.status !== 'pending') {
    throw createActionError(400, 'This receipt has already been reviewed');
  }

  const actorLevel = resolveAdminOrgRole(actor);
  const currentStage = normalizeReceiptStage(receipt.approvalStage || '');
  if (!canReviewReceiptStage(actorLevel, currentStage)) {
    throw createActionError(403, `Receipt is waiting for ${getRequiredLevelForStage(currentStage)} review`);
  }
  if (FINANCE_FOUR_EYES_ENABLED && actorAlreadyReviewed(receipt.approvalTrail, req.user.id)) {
    throw createActionError(400, 'Four-eyes policy is active: the same admin cannot re-review the same receipt in later stages.');
  }

  const reason = String(body?.reason || '').trim() || 'Rejected by finance management';
  const now = new Date();

  receipt.status = 'rejected';
  receipt.approvalStage = RECEIPT_STAGES.rejected;
  receipt.reviewedBy = req.user.id;
  receipt.reviewedAt = now;
  receipt.rejectReason = reason;
  receipt.reviewNote = '';
  receipt.approvalTrail = Array.isArray(receipt.approvalTrail) ? receipt.approvalTrail : [];
  receipt.approvalTrail.push({
    level: actorLevel,
    action: 'reject',
    by: req.user.id,
    at: now,
    note: '',
    reason
  });
  await receipt.save();
  await syncStudentFinanceFromFinanceReceipt(receipt._id);

  await notifyStudent({
    req,
    studentId: receipt.student,
    studentCoreId: receipt.studentId,
    title: 'Payment receipt rejected',
    message: `Your receipt was rejected. Reason: ${reason}`,
    emailSubject: 'Payment receipt rejected'
  });

  await logActivity({
    req,
    action: 'finance_reject_receipt',
    targetType: 'FinanceReceipt',
    targetId: receipt._id.toString(),
    meta: { reason, level: actorLevel, stage: currentStage }
  });

  return {
    message: 'Receipt rejected',
    nextStage: RECEIPT_STAGES.rejected
  };
}

async function rejectFeePaymentAction({ req, feePaymentId = '', body = {} } = {}) {
  const payment = await FeePayment.findById(feePaymentId);
  if (!payment) throw createActionError(404, 'Canonical fee payment was not found');

  if (payment.sourceReceiptId) {
    const result = await rejectReceiptAction({ req, receiptId: payment.sourceReceiptId, body });
    const refreshed = await FeePayment.findById(feePaymentId);
    return {
      ...result,
      item: refreshed || payment,
      sourceReceiptId: String(payment.sourceReceiptId || '')
    };
  }

  const actor = await User.findById(req.user.id).select('name role orgRole adminLevel');
  if (!actor || actor.role !== 'admin') {
    throw createActionError(403, 'Only admins can reject canonical fee payments');
  }
  if (payment.status !== 'pending') {
    throw createActionError(400, 'This canonical fee payment has already been reviewed');
  }

  const actorLevel = resolveAdminOrgRole(actor);
  const currentStage = normalizeReceiptStage(payment.approvalStage || '');
  if (!canReviewReceiptStage(actorLevel, currentStage)) {
    throw createActionError(403, `Canonical fee payment is waiting for ${getRequiredLevelForStage(currentStage)} review`);
  }
  if (FINANCE_FOUR_EYES_ENABLED && actorAlreadyReviewed(payment.approvalTrail, req.user.id)) {
    throw createActionError(400, 'Four-eyes policy is active: the same admin cannot re-review the same payment in later stages.');
  }

  const reason = String(body?.reason || '').trim() || 'Rejected by finance management';
  const now = new Date();
  payment.status = 'rejected';
  payment.approvalStage = RECEIPT_STAGES.rejected;
  payment.reviewedBy = req.user.id;
  payment.reviewedAt = now;
  payment.rejectReason = reason;
  payment.reviewNote = '';
  payment.approvalTrail = Array.isArray(payment.approvalTrail) ? payment.approvalTrail : [];
  payment.approvalTrail.push({
    level: actorLevel,
    action: 'reject',
    by: req.user.id,
    at: now,
    note: '',
    reason
  });
  await payment.save();

  await notifyStudent({
    req,
    studentId: payment.student,
    studentCoreId: payment.studentId,
    title: 'Canonical payment rejected',
    message: `Your payment ${payment.paymentNumber} was rejected. Reason: ${reason}`,
    emailSubject: 'Canonical payment rejected'
  });

  await logActivity({
    req,
    action: 'fee_payment_reject',
    targetType: 'FeePayment',
    targetId: payment._id.toString(),
    meta: { reason, level: actorLevel, stage: currentStage }
  });

  return {
    item: payment,
    message: 'Canonical fee payment rejected',
    nextStage: RECEIPT_STAGES.rejected
  };
}

async function updateReceiptFollowUpAction({ req, receiptId = '', body = {} } = {}) {
  const [receipt, actor] = await Promise.all([
    FinanceReceipt.findById(receiptId)
      .populate('student', 'name')
      .populate('course', 'title'),
    User.findById(req.user.id).select('role orgRole adminLevel')
  ]);

  if (!receipt) throw createActionError(404, 'Receipt not found');
  if (!actor || actor.role !== 'admin') {
    throw createActionError(403, 'Only admins can update receipt follow-up');
  }

  const defaultLevel = getRequiredLevelForStage(receipt.approvalStage || '');
  const fallbackStatus = receipt.status === 'pending' ? 'new' : 'resolved';
  const assignedLevel = normalizeFollowUpLevel(body?.assignedLevel || receipt.followUp?.assignedLevel || defaultLevel);
  const status = normalizeFollowUpStatus(body?.status || receipt.followUp?.status || fallbackStatus, fallbackStatus);
  const note = String(body?.note || '').trim().slice(0, 400);
  const now = new Date();
  const history = Array.isArray(receipt.followUp?.history) ? receipt.followUp.history : [];

  receipt.followUp = {
    assignedLevel,
    status,
    note,
    updatedBy: req.user.id,
    updatedAt: now,
    history: [...history, {
      assignedLevel,
      status,
      note,
      updatedBy: req.user.id,
      updatedAt: now
    }].slice(-40)
  };
  await receipt.save();
  await syncStudentFinanceFromFinanceReceipt(receipt._id);

  const admins = await findAdminsByLevels([assignedLevel], req.user.id);
  await notifyAdmins({
    req,
    admins,
    title: 'Finance receipt follow-up updated',
    message: `Follow-up for ${receipt.student?.name || 'Student'} in ${receipt.course?.title || '---'} was assigned to ${assignedLevel}.`,
    type: 'finance'
  });

  await logActivity({
    req,
    action: 'finance_receipt_follow_up_update',
    targetType: 'FinanceReceipt',
    targetId: receipt._id.toString(),
    meta: { assignedLevel, status }
  });

  return { followUp: receipt.followUp, message: 'Receipt follow-up updated' };
}

async function updateFeePaymentFollowUpAction({ req, feePaymentId = '', body = {} } = {}) {
  const payment = await FeePayment.findById(feePaymentId);
  if (!payment) throw createActionError(404, 'Canonical fee payment was not found');

  if (payment.sourceReceiptId) {
    const result = await updateReceiptFollowUpAction({ req, receiptId: payment.sourceReceiptId, body });
    const refreshed = await FeePayment.findById(feePaymentId);
    return {
      ...result,
      item: refreshed || payment,
      sourceReceiptId: String(payment.sourceReceiptId || '')
    };
  }

  const actor = await User.findById(req.user.id).select('role orgRole adminLevel');
  if (!actor || actor.role !== 'admin') {
    throw createActionError(403, 'Only admins can update payment follow-up');
  }

  const defaultLevel = getRequiredLevelForStage(payment.approvalStage || '');
  const fallbackStatus = payment.status === 'pending' ? 'new' : 'resolved';
  const assignedLevel = normalizeFollowUpLevel(body?.assignedLevel || payment.followUp?.assignedLevel || defaultLevel);
  const status = normalizeFollowUpStatus(body?.status || payment.followUp?.status || fallbackStatus, fallbackStatus);
  const note = String(body?.note || '').trim().slice(0, 400);
  const now = new Date();
  const history = Array.isArray(payment.followUp?.history) ? payment.followUp.history : [];

  payment.followUp = {
    assignedLevel,
    status,
    note,
    updatedBy: req.user.id,
    updatedAt: now,
    history: [...history, {
      assignedLevel,
      status,
      note,
      updatedBy: req.user.id,
      updatedAt: now
    }].slice(-40)
  };
  await payment.save();

  const admins = await findAdminsByLevels([assignedLevel], req.user.id);
  await notifyAdmins({
    req,
    admins,
    title: 'Canonical payment follow-up updated',
    message: `Follow-up for payment ${payment.paymentNumber || 'payment'} was assigned to ${assignedLevel}.`,
    type: 'finance'
  });

  await logActivity({
    req,
    action: 'fee_payment_follow_up_update',
    targetType: 'FeePayment',
    targetId: payment._id.toString(),
    meta: { assignedLevel, status }
  });

  return { followUp: payment.followUp, message: 'Canonical payment follow-up updated' };
}

function wrapAction(action) {
  return async function wrappedAction(args = {}) {
    const result = await action(args);
    if (result && typeof result.message === 'string') {
      result.message = repairDisplayText(result.message);
    }
    return result;
  };
}

module.exports = {
  addBillAdjustmentAction: wrapAction(addBillAdjustmentAction),
  addFeeOrderAdjustmentAction: wrapAction(addFeeOrderAdjustmentAction),
  setBillInstallmentsAction: wrapAction(setBillInstallmentsAction),
  setFeeOrderInstallmentsAction: wrapAction(setFeeOrderInstallmentsAction),
  voidBillAction: wrapAction(voidBillAction),
  voidFeeOrderAction: wrapAction(voidFeeOrderAction),
  approveReceiptAction: wrapAction(approveReceiptAction),
  approveFeePaymentAction: wrapAction(approveFeePaymentAction),
  rejectReceiptAction: wrapAction(rejectReceiptAction),
  rejectFeePaymentAction: wrapAction(rejectFeePaymentAction),
  updateReceiptFollowUpAction: wrapAction(updateReceiptFollowUpAction),
  updateFeePaymentFollowUpAction: wrapAction(updateFeePaymentFollowUpAction)
};
