const mongoose = require('mongoose');
const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const FinanceRefund = require('../models/FinanceRefund');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Discount = require('../models/Discount');
const StudentCore = require('../models/StudentCore');
const StudentProfile = require('../models/StudentProfile');
const FinancialYear = require('../models/FinancialYear');
const User = require('../models/User');
const UserNotification = require('../models/UserNotification');
const { logActivity } = require('../utils/activity');
const { sendMail } = require('../utils/mailer');
const { normalizeAdminLevel } = require('../utils/permissions');
const { resolveAdminOrgRole } = require('../utils/userRole');
const { roundMoney, getBillRemainingAmount } = require('../utils/financeReceiptValidation');
const { createFinanceRefundCase, findOpenRefundForDocument } = require('../utils/financeRefundCase');
const {
  LINE_ITEM_TYPES,
  applyFinanceOrderStatus,
  getFinanceFeeScopeBalanceAmount,
  getFinanceFeeScopeGrossAmount,
  normalizeAdjustmentScope,
  normalizeFinanceFeeType,
  normalizePaymentBreakdown,
  normalizeFinanceLineItems
} = require('../utils/financeLineItems');
const {
  syncStudentFinanceFromFinanceBill,
  syncStudentFinanceFromFinanceReceipt,
  syncFinanceBillPaymentFromFeeOrder
} = require('../utils/studentFinanceSync');
const { formatFinanceCode } = require('../utils/latinFinanceCode');
const {
  syncApprovedFeePaymentToTreasury,
  createTreasuryManualTransaction,
  resolveTreasuryAccountSelection
} = require('./treasuryGovernanceService');
const { assertFinancePeriodWritable, isFinanceMonthClosed } = require('./financePeriodGuardService');
const {
  isFinanceVersionConflict,
  suppressAutomaticFinanceBillSync
} = require('../utils/financeSyncControl');

const FINANCE_FOUR_EYES_ENABLED = String(process.env.FINANCE_FOUR_EYES_ENABLED || 'false').toLowerCase() !== 'false';

function supportsMongoTransactions() {
  const topologyType = String(mongoose.connection?.client?.topology?.description?.type || '');
  return ['ReplicaSetWithPrimary', 'ReplicaSetNoPrimary', 'Sharded', 'LoadBalanced'].includes(topologyType);
}

function scheduleFinanceBackgroundTask(label, task) {
  const run = () => {
    Promise.resolve()
      .then(task)
      .catch((error) => {
        console.error(`[finance-background:${label}]`, error?.message || error);
      });
  };
  if (typeof setImmediate === 'function') {
    setImmediate(run);
  } else {
    setTimeout(run, 0);
  }
}

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

async function isMonthClosed(dateValue, scope = {}) {
  return isFinanceMonthClosed(dateValue, scope);
}

function parseDateSafe(value, fallback = null) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
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
  bill.amountPaid = Math.max(0, Number(bill.amountPaid) || 0);
  bill.lineItems = normalizeFinanceLineItems({
    lineItems: bill.lineItems,
    feeBreakdown: bill.feeBreakdown,
    feeScopes: bill.feeScopes,
    amountOriginal: bill.amountOriginal,
    adjustments: bill.adjustments,
    amountPaid: bill.amountPaid,
    paymentBreakdown: bill.paymentBreakdown,
    defaultType: bill.orderType || 'tuition'
  });
  bill.amountDue = Math.max(0, roundMoney(
    bill.lineItems.reduce((sum, item) => sum + Number(item?.netAmount || 0), 0)
  ));
  const remaining = Math.max(0, bill.amountDue - bill.amountPaid);

  applyFinanceOrderStatus(bill);

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

function getPayableFeeTypes(order = {}) {
  const lineItemTypes = (Array.isArray(order?.lineItems) ? order.lineItems : [])
    .filter((item) => Number(item?.grossAmount ?? item?.netAmount ?? item?.balanceAmount ?? 0) > 0)
    .map((item) => normalizeFinanceFeeType(item?.feeType, order?.orderType || 'tuition'));
  const breakdownTypes = Object.entries(
    order?.feeBreakdown && typeof order.feeBreakdown === 'object' ? order.feeBreakdown : {}
  )
    .filter(([, amount]) => Number(amount || 0) > 0)
    .map(([key]) => normalizeFinanceFeeType(key, order?.orderType || 'tuition'));
  const scopeTypes = (Array.isArray(order?.feeScopes) ? order.feeScopes : [])
    .map((item) => normalizeFinanceFeeType(item, order?.orderType || 'tuition'));
  const normalizedOrderType = String(order?.orderType || '').trim()
    ? normalizeFinanceFeeType(order.orderType, 'tuition')
    : '';
  const candidateTypes = normalizedOrderType === 'admission'
      && lineItemTypes.length
      && lineItemTypes.every((item) => item === 'tuition')
    ? ['admission']
    : lineItemTypes.length
      ? lineItemTypes
      : breakdownTypes.length
        ? breakdownTypes
        : scopeTypes.length
          ? scopeTypes
          : normalizedOrderType
            ? [normalizedOrderType]
            : [];
  return Array.from(new Set(candidateTypes)).filter((feeType) => (
    LINE_ITEM_TYPES.includes(feeType) && getFinanceFeeScopeBalanceAmount(order, feeType) > 0
  ));
}

function resolveApprovedPaymentFeeType({ order = {}, requestedFeeType = '', note = '' } = {}) {
  const requested = String(requestedFeeType || '').trim().toLowerCase();
  if (requested) {
    if (!LINE_ITEM_TYPES.includes(requested)) return '';
    if (getFinanceFeeScopeBalanceAmount(order, requested) > 0) return requested;
    return '';
  }
  const payableTypes = getPayableFeeTypes(order);
  if (payableTypes.length === 1) return payableTypes[0];
  const normalizedNote = String(note || '').trim().toLowerCase();
  if ((normalizedNote.includes('داخله') || normalizedNote.includes('admission'))
    && payableTypes.includes('admission')) return 'admission';
  if (String(order?.orderType || '').trim() === 'admission' && payableTypes.includes('admission')) return 'admission';
  return '';
}

function addScopedPayment(order = {}, feeType = '', amount = 0) {
  const normalizedFeeType = normalizeFinanceFeeType(feeType, order?.orderType || 'tuition');
  const breakdown = normalizePaymentBreakdown(order?.paymentBreakdown);
  breakdown[normalizedFeeType] = roundMoney((Number(breakdown[normalizedFeeType]) || 0) + Number(amount || 0));
  order.paymentBreakdown = breakdown;
  order.amountPaid = roundMoney((Number(order.amountPaid) || 0) + Number(amount || 0));
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
      feeType: String(item?.feeType || '').trim().toLowerCase(),
      amount: roundMoney(item?.amount),
      title: String(item?.title || '').trim(),
      orderNumber: formatFinanceCode(item?.orderNumber)
    }))
    .filter((item) => item.feeOrderId && item.amount > 0);
}

function normalizeReferenceId(value = null) {
  return String(value?._id || value || '').trim();
}

function releaseIssuanceKeyForVoid(document = null) {
  const originalIssuanceKey = String(document?.issuanceKey || '').trim();
  if (document) document.issuanceKey = undefined;
  return originalIssuanceKey;
}

function isVoidedFinanceDocument(document = null) {
  return String(document?.status || '').trim().toLowerCase() === 'void';
}

async function buildAlreadyVoidedBillResult(item) {
  await syncStudentFinanceFromFinanceBill(item._id);
  const syncedOrder = await FeeOrder.findOne({ sourceBillId: item._id }).select('_id');
  if (syncedOrder?._id) await syncTreasuryForFeeOrderPayments(syncedOrder._id);
  return {
    item,
    alreadyVoided: true,
    message: '\u0627\u06cc\u0646 \u0628\u0644 \u0642\u0628\u0644\u0627\u064b \u0628\u0627\u0637\u0644 \u0634\u062f\u0647 \u0627\u0633\u062a.'
  };
}

function resolveActiveFinanceSchoolId(req = {}) {
  if (req.user?.isDemo === true && req.user?.schoolId) {
    return normalizeReferenceId(req.user.schoolId);
  }
  return normalizeReferenceId(
    req.headers?.['x-school-id']
    || req.user?.activeSchoolId
    || req.user?.schoolId
    || req.user?.school_id
    || ''
  );
}

function requireActiveFinanceSchoolId(req = {}) {
  const schoolId = resolveActiveFinanceSchoolId(req);
  if (!schoolId) {
    throw createActionError(400, 'برای بررسی امور مالی، انتخاب مکتب فعال الزامی است.');
  }
  return schoolId;
}

function assertDocumentInActiveSchool(document = null, activeSchoolId = '', label = 'سند مالی') {
  const documentSchoolId = normalizeReferenceId(document?.schoolId);
  if (!document || !activeSchoolId || !documentSchoolId || documentSchoolId !== activeSchoolId) {
    throw createActionError(404, `${label} در مکتب فعال پیدا نشد.`);
  }
  return document;
}

function isSameStudentFinanceIdentity(payment = {}, order = {}) {
  const paymentUserId = normalizeReferenceId(payment.student);
  const orderUserId = normalizeReferenceId(order.student);
  const paymentStudentId = normalizeReferenceId(payment.studentId);
  const orderStudentId = normalizeReferenceId(order.studentId);

  if (paymentUserId && orderUserId && paymentUserId === orderUserId) return true;
  if (paymentStudentId && orderStudentId && paymentStudentId === orderStudentId) return true;

  const paymentMembershipId = normalizeReferenceId(payment.studentMembershipId);
  const orderMembershipId = normalizeReferenceId(order.studentMembershipId);
  return Boolean(paymentMembershipId && orderMembershipId && paymentMembershipId === orderMembershipId);
}

async function assertCanonicalPaymentReviewScope({ req, payment = null } = {}) {
  const activeSchoolId = requireActiveFinanceSchoolId(req);
  assertDocumentInActiveSchool(payment, activeSchoolId, 'پرداخت فیس');

  const allocations = normalizeFeePaymentAllocations(payment);
  const orderIds = Array.from(new Set(
    allocations.map((item) => normalizeReferenceId(item.feeOrderId)).filter(Boolean)
  ));
  const orders = orderIds.length
    ? await FeeOrder.find({ _id: { $in: orderIds } })
    : [];
  if (orders.length !== orderIds.length) {
    throw createActionError(404, 'یک یا چند بل تخصیص‌یافته پیدا نشد.');
  }
  for (const order of orders) {
    assertDocumentInActiveSchool(order, activeSchoolId, 'بل تخصیص‌یافته');
    if (!isSameStudentFinanceIdentity(payment, order)) {
      throw createActionError(400, 'بل تخصیص‌یافته مربوط به همین شاگرد نیست.');
    }
  }

  let sourceReceipt = null;
  let sourceBill = null;
  if (payment?.sourceReceiptId) {
    sourceReceipt = await FinanceReceipt.findById(payment.sourceReceiptId);
    assertDocumentInActiveSchool(sourceReceipt, activeSchoolId, 'رسید مالی مرتبط');
    sourceBill = await FinanceBill.findById(sourceReceipt.bill);
    assertDocumentInActiveSchool(sourceBill, activeSchoolId, 'بل مالی مرتبط');
    if (!isSameStudentFinanceIdentity(payment, sourceReceipt)
      || !isSameStudentFinanceIdentity(payment, sourceBill)) {
      throw createActionError(400, 'رسید یا بل مرتبط مربوط به همین شاگرد نیست.');
    }
  }

  return { activeSchoolId, allocations, orders, sourceReceipt, sourceBill };
}

async function assertReceiptReviewScope({ req, receipt = null } = {}) {
  const activeSchoolId = requireActiveFinanceSchoolId(req);
  assertDocumentInActiveSchool(receipt, activeSchoolId, 'رسید مالی');
  const bill = await FinanceBill.findById(receipt.bill);
  assertDocumentInActiveSchool(bill, activeSchoolId, 'بل مالی مرتبط');
  if (!isSameStudentFinanceIdentity(receipt, bill)) {
    throw createActionError(400, 'بل مرتبط مربوط به شاگرد همین رسید نیست.');
  }
  return { activeSchoolId, bill };
}

async function hasApprovedPaymentForFeeOrder(feeOrderId = '') {
  const normalizedOrderId = normalizeReferenceId(feeOrderId);
  if (!normalizedOrderId) return false;
  return Boolean(await FeePayment.exists({
    status: 'approved',
    $or: [
      { feeOrderId: normalizedOrderId },
      { 'allocations.feeOrderId': normalizedOrderId }
    ]
  }));
}

async function syncTreasuryForFeeOrderPayments(feeOrderId = '') {
  const normalizedOrderId = String(feeOrderId || '').trim();
  if (!normalizedOrderId) return 0;
  const payments = await FeePayment.find({
    status: 'approved',
    $or: [
      { feeOrderId: normalizedOrderId },
      { 'allocations.feeOrderId': normalizedOrderId }
    ]
  });
  for (const payment of payments) {
    await syncApprovedFeePaymentToTreasury(payment);
  }
  return payments.length;
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

  scheduleFinanceBackgroundTask('notification-email', async () => {
    const users = await User.find({ _id: { $in: audienceUserIds } }).select('email status').lean();
    await Promise.allSettled(users.map((user) => {
      if (!user?.email || String(user.status || '').trim().toLowerCase() === 'inactive') return Promise.resolve();
      return sendMail({
        to: user.email,
        subject: normalizedEmailSubject,
        text: normalizedEmailText,
        html: normalizedEmailHtml
      });
    }));
  });
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

function getFinanceReviewLevelLabel(level = '') {
  const normalized = normalizeAdminLevel(level || '');
  if (normalized === 'general_president') return 'ریاست عمومی';
  if (normalized === 'finance_lead') return 'آمریت مالی';
  return 'مدیر مالی';
}

function canReviewReceiptStage(adminLevel = '', stage = '') {
  const level = normalizeAdminLevel(adminLevel || '');
  const normalizedStage = normalizeReceiptStage(stage);
  if (!OPEN_RECEIPT_STAGES.includes(normalizedStage)) return false;
  return level === 'finance_manager' || level === 'general_president';
}

function getNextReceiptStage(adminLevel = '', currentStage = '') {
  const level = normalizeAdminLevel(adminLevel || '');
  const stage = normalizeReceiptStage(currentStage);
  if (OPEN_RECEIPT_STAGES.includes(stage) && (level === 'finance_manager' || level === 'general_president')) {
    return RECEIPT_STAGES.completed;
  }
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

const FOLLOW_UP_LEVELS = ['finance_manager', 'general_president'];
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
  if (await isMonthClosed(item.issuedAt, item)) {
    throw createActionError(400, 'Ù…Ø§Ù‡ Ù…Ø§Ù„ÛŒ Ø¨Ø³ØªÙ‡ Ø´Ø¯Ù‡ Ø§Ø³Øª Ùˆ ØªØºÛŒÛŒØ±Ø§Øª Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª');
  }

  const type = ['discount', 'waiver', 'penalty', 'manual'].includes(body?.type) ? body.type : 'discount';
  const amount = roundMoney(body?.amount);
  const scope = type === 'discount'
    ? 'tuition'
    : normalizeAdjustmentScope({ type, scope: body?.scope }, 'all');
  const tuitionGross = type === 'discount' ? getFinanceFeeScopeGrossAmount(item, 'tuition') : 0;
  if (type === 'discount' && tuitionGross <= 0) {
    throw createActionError(400, 'تخفیف عادی فقط روی فیس/شهریه قابل اعمال است و این بل ردیف فیس ندارد.');
  }
  const effectiveAmount = type === 'discount' ? Math.min(amount, tuitionGross) : amount;
  if (!amount) throw createActionError(400, 'Ù…Ø¨Ù„Øº Ù…Ø¹ØªØ¨Ø± Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª');

  item.adjustments.push({
    type,
    scope,
    amount: effectiveAmount,
    reason: String(body?.reason || '').trim(),
    createdBy: req.user.id
  });
  recalculateBill(item);
  suppressAutomaticFinanceBillSync(item);
  await item.save();
  await syncStudentFinanceFromFinanceBill(item._id);
  const syncedOrder = await FeeOrder.findOne({ sourceBillId: item._id }).select('_id');
  if (syncedOrder?._id) await syncTreasuryForFeeOrderPayments(syncedOrder._id);

  await logActivity({
    req,
    action: 'finance_add_adjustment',
    targetType: 'FinanceBill',
    targetId: item._id.toString(),
    meta: { type, scope, amount: effectiveAmount }
  });

  return { item, message: 'ØªØ¹Ø¯ÛŒÙ„ Ù…Ø§Ù„ÛŒ Ø«Ø¨Øª Ø´Ø¯' };
}

async function addFeeOrderAdjustmentAction({ req, feeOrderId = '', body = {} } = {}) {
  const item = await FeeOrder.findById(feeOrderId);
  if (!item) throw createActionError(404, 'بل مالی پیدا نشد.');

  if (item.sourceBillId) {
    const result = await addBillAdjustmentAction({ req, billId: item.sourceBillId, body });
    const refreshed = await FeeOrder.findById(feeOrderId);
    return {
      ...result,
      item: refreshed || item,
      sourceBillId: String(item.sourceBillId || '')
    };
  }

  if (item.status === 'void') throw createActionError(400, 'بل باطل‌شده قابل تعدیل نیست.');
  if (await isMonthClosed(item.issuedAt, item)) {
    throw createActionError(400, 'ماه مالی بسته شده است و تعدیل بل مجاز نیست.');
  }

  const type = ['discount', 'waiver', 'penalty', 'manual'].includes(body?.type) ? body.type : 'discount';
  const amount = roundMoney(body?.amount);
  const scope = type === 'discount'
    ? 'tuition'
    : normalizeAdjustmentScope({ type, scope: body?.scope }, 'all');
  const tuitionGross = type === 'discount' ? getFinanceFeeScopeGrossAmount(item, 'tuition') : 0;
  if (type === 'discount' && tuitionGross <= 0) {
    throw createActionError(400, 'تخفیف عادی فقط روی فیس/شهریه قابل اعمال است و این بل ردیف فیس ندارد.');
  }
  const effectiveAmount = type === 'discount' ? Math.min(amount, tuitionGross) : amount;
  if (!amount) throw createActionError(400, 'مبلغ تعدیل الزامی است.');

  item.adjustments = Array.isArray(item.adjustments) ? item.adjustments : [];
  item.adjustments.push({
    type,
    scope,
    amount: effectiveAmount,
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
    amount: effectiveAmount,
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
    meta: { type, scope, amount: effectiveAmount }
  });

  return { item, message: 'تعدیل بل مالی ثبت شد.' };
}

async function setBillInstallmentsAction({ req, billId = '', body = {} } = {}) {
  const item = await FinanceBill.findById(billId);
  if (!item) throw createActionError(404, 'Ø¨Ù„ ÛŒØ§ÙØª Ù†Ø´Ø¯');
  if (item.status === 'void') throw createActionError(400, 'Ø¨Ù„ Ø¨Ø§Ø·Ù„ Ù‚Ø§Ø¨Ù„ Ù‚Ø³Ø·â€ŒØ¨Ù†Ø¯ÛŒ Ù†ÛŒØ³Øª');
  if (await isMonthClosed(item.issuedAt, item)) {
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
  suppressAutomaticFinanceBillSync(item);
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
  if (!item) throw createActionError(404, 'بل مالی پیدا نشد.');

  if (item.sourceBillId) {
    const result = await setBillInstallmentsAction({ req, billId: item.sourceBillId, body });
    const refreshed = await FeeOrder.findById(feeOrderId);
    return {
      ...result,
      item: refreshed || item,
      sourceBillId: String(item.sourceBillId || '')
    };
  }

  if (item.status === 'void') throw createActionError(400, 'بل باطل‌شده قابل قسط‌بندی نیست.');
  if (await isMonthClosed(item.issuedAt, item)) {
    throw createActionError(400, 'ماه مالی بسته شده است و قسط‌بندی مجاز نیست.');
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
      throw createActionError(400, 'تنظیمات قسط‌بندی معتبر نیست.');
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
    throw createActionError(400, 'حداقل یک قسط معتبر الزامی است.');
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

  return { item, message: 'قسط‌بندی بل مالی ثبت شد.' };
}

async function voidBillAction({ req, billId = '', body = {} } = {}) {
  const actorLevel = await resolveAdminActorLevel(req.user.id);
  if (!['finance_manager', 'finance_lead', 'general_president'].includes(actorLevel)) {
    throw createActionError(403, '\u0628\u0627\u0637\u0644\u200c\u0633\u0627\u0632\u06cc \u0628\u0644 \u0641\u0642\u0637 \u0628\u0631\u0627\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a \u0645\u0627\u0644\u06cc\u060c \u0622\u0645\u0631\u06cc\u062a \u0645\u0627\u0644\u06cc \u06cc\u0627 \u0631\u06cc\u0627\u0633\u062a \u0639\u0645\u0648\u0645\u06cc \u0645\u062c\u0627\u0632 \u0627\u0633\u062a.');
  }

  const item = await FinanceBill.findById(billId);
  if (item && isVoidedFinanceDocument(item)) {
    return buildAlreadyVoidedBillResult(item);
  }
  if (!item) throw createActionError(404, 'Ø¨Ù„ ÛŒØ§ÙØª Ù†Ø´Ø¯');
  if (await isMonthClosed(item.issuedAt, item)) {
    throw createActionError(400, 'Ù…Ø§Ù‡ Ù…Ø§Ù„ÛŒ Ø¨Ø³ØªÙ‡ Ø´Ø¯Ù‡ Ø§Ø³Øª Ùˆ Ø¨Ø§Ø·Ù„â€ŒØ³Ø§Ø²ÛŒ Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª');
  }
  const reason = String(body?.reason || '').trim();
  if (!reason) {
    throw createActionError(400, 'Ø¨Ø±Ø§ÛŒ Ø¨Ø§Ø·Ù„â€ŒØ³Ø§Ø²ÛŒØŒ Ø«Ø¨Øª Ø¯Ù„ÛŒÙ„ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª');
  }

  const canonicalOrder = await FeeOrder.findOne({ sourceBillId: item._id }).select('_id amountPaid issuanceKey');
  if (
    Number(item.amountPaid || 0) > 0
    || Number(canonicalOrder?.amountPaid || 0) > 0
    || await hasApprovedPaymentForFeeOrder(canonicalOrder?._id)
  ) {
    throw createActionError(409, 'بل دارای پرداخت تأییدشده است؛ نخست باید سند برگشت/اصلاح پرداخت ثبت شود و ابطال مستقیم مجاز نیست.');
  }

  const originalIssuanceKey = releaseIssuanceKeyForVoid(item);
  const originalCanonicalIssuanceKey = String(canonicalOrder?.issuanceKey || '').trim();
  item.status = 'void';
  item.voidReason = reason;
  item.voidedBy = req.user.id;
  item.voidedAt = new Date();
  suppressAutomaticFinanceBillSync(item);
  try {
    await item.save();
  } catch (error) {
    if (!isFinanceVersionConflict(error)) throw error;
    const refreshed = await FinanceBill.findById(billId);
    if (!isVoidedFinanceDocument(refreshed)) throw error;
    return buildAlreadyVoidedBillResult(refreshed);
  }
  await logActivity({
    req,
    action: 'finance_void_bill',
    targetType: 'FinanceBill',
    targetId: item._id.toString(),
    meta: {
      reason,
      level: actorLevel,
      originalIssuanceKey: originalIssuanceKey || null,
      originalCanonicalIssuanceKey: originalCanonicalIssuanceKey || null
    }
  });
  await syncStudentFinanceFromFinanceBill(item._id);
  const syncedOrder = await FeeOrder.findOne({ sourceBillId: item._id }).select('_id');
  if (syncedOrder?._id) await syncTreasuryForFeeOrderPayments(syncedOrder._id);

  await notifyStudent({
    req,
    studentId: item.student,
    studentCoreId: item.studentId,
    title: 'Ø¨Ù„ Ø¨Ø§Ø·Ù„ Ø´Ø¯',
    message: `Ø¨Ù„ Ø´Ù…Ø§Ø±Ù‡ ${item.billNumber} Ø¨Ø§ Ø¯Ù„ÛŒÙ„ Ø²ÛŒØ± Ø¨Ø§Ø·Ù„ Ø´Ø¯: ${reason}`,
    emailSubject: 'Ø§Ø¨Ø·Ø§Ù„ Ø¨Ù„'
  });

  return { item, message: 'Ø¨Ù„ Ø¨Ø§ Ù…ÙˆÙÙ‚ÛŒØª Ø¨Ø§Ø·Ù„ Ø´Ø¯' };
}

async function voidFeeOrderAction({ req, feeOrderId = '', body = {} } = {}) {
  const actorLevel = await resolveAdminActorLevel(req.user.id);
  if (!['finance_manager', 'finance_lead', 'general_president'].includes(actorLevel)) {
    throw createActionError(403, 'باطل‌سازی بل فقط برای مدیریت مالی، آمریت مالی یا ریاست عمومی مجاز است.');
  }

  const item = await FeeOrder.findById(feeOrderId);
  if (item && isVoidedFinanceDocument(item) && !item.sourceBillId) {
    return { item, alreadyVoided: true, message: 'این بل قبلاً باطل شده است.' };
  }
  if (!item) throw createActionError(404, 'بل مالی پیدا نشد.');

  if (Number(item.amountPaid || 0) > 0 || await hasApprovedPaymentForFeeOrder(item._id)) {
    throw createActionError(409, 'این تعهد دارای پرداخت تأییدشده است؛ ابطال مستقیم مجاز نیست و باید سند برگشت/اصلاح پرداخت ثبت شود.');
  }

  if (item.sourceBillId) {
    const result = await voidBillAction({ req, billId: item.sourceBillId, body });
    const refreshed = await FeeOrder.findById(feeOrderId);
    return {
      ...result,
      item: refreshed || item,
      sourceBillId: String(item.sourceBillId || '')
    };
  }

  if (await isMonthClosed(item.issuedAt, item)) {
    throw createActionError(400, 'ماه مالی بسته شده است و باطل‌سازی بل مجاز نیست.');
  }
  const reason = String(body?.reason || '').trim();
  if (!reason) throw createActionError(400, 'برای باطل‌سازی بل، نوشتن دلیل الزامی است.');

  const originalIssuanceKey = releaseIssuanceKeyForVoid(item);
  item.status = 'void';
  item.voidReason = reason;
  item.voidedBy = req.user.id;
  item.voidedAt = new Date();
  try {
    await item.save();
  } catch (error) {
    if (!isFinanceVersionConflict(error)) throw error;
    const refreshed = await FeeOrder.findById(feeOrderId);
    if (!isVoidedFinanceDocument(refreshed)) throw error;
    return { item: refreshed, alreadyVoided: true, message: 'این بل قبلاً باطل شده است.' };
  }
  await logActivity({
    req,
    action: 'fee_order_void',
    targetType: 'FeeOrder',
    targetId: item._id.toString(),
    meta: {
      reason,
      level: actorLevel,
      originalIssuanceKey: originalIssuanceKey || null
    }
  });
  await syncTreasuryForFeeOrderPayments(item._id);

  await notifyStudent({
    req,
    studentId: item.student,
    studentCoreId: item.studentId,
    title: 'بل مالی باطل شد',
    message: `بل شماره ${formatFinanceCode(item.orderNumber || '')} باطل شد. دلیل: ${reason}`,
    emailSubject: 'باطل‌شدن بل مالی'
  });

  return { item, message: 'بل مالی با موفقیت باطل شد.' };
}

async function approveReceiptAction({ req, receiptId = '', body = {} } = {}) {
  const [receipt, actor] = await Promise.all([
    FinanceReceipt.findById(receiptId)
      .populate('student', 'name email')
      .populate('course', 'title'),
    User.findById(req.user.id).select('name role orgRole adminLevel')
  ]);

  if (!receipt) throw createActionError(404, 'رسید پیدا نشد.');
  const receiptScope = await assertReceiptReviewScope({ req, receipt });
  if (!actor || actor.role !== 'admin') {
    throw createActionError(403, 'فقط مدیران اجازه بررسی رسیدها را دارند.');
  }
  if (receipt.status !== 'pending') {
    throw createActionError(400, 'این رسید قبلاً بررسی شده است.');
  }

  const actorLevel = resolveAdminOrgRole(actor);
  const currentStage = normalizeReceiptStage(receipt.approvalStage || '');
  if (!canReviewReceiptStage(actorLevel, currentStage)) {
    throw createActionError(403, `این رسید در انتظار بررسی ${getFinanceReviewLevelLabel(getRequiredLevelForStage(currentStage))} است.`);
  }
  if (FINANCE_FOUR_EYES_ENABLED && actorAlreadyReviewed(receipt.approvalTrail, req.user.id)) {
    throw createActionError(400, 'اصل تأیید دوگانه فعال است؛ یک مدیر نمی‌تواند همین رسید را در چند مرحله تأیید کند.');
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
    throw createActionError(400, 'مرحله بعدی تأیید برای این سطح تعریف نشده است.');
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
      title: 'رسید به مرحله بعدی بررسی فرستاده شد',
      message: `رسید ${receipt.student?.name || 'شاگرد'} برای بررسی ${getFinanceReviewLevelLabel(nextLevel)} فرستاده شد.`,
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

  if (await isMonthClosed(receipt.paidAt || new Date(), receipt)) {
    throw createActionError(400, 'ماه مالی بسته شده است و تأیید نهایی مجاز نیست.');
  }

  const bill = receiptScope.bill;
  await assertFinancePeriodWritable({
    schoolId: bill.schoolId,
    academicYearId: bill.academicYearId,
    dateValue: receipt.paidAt || bill.issuedAt || new Date()
  });
  if (bill.status === 'void') {
    throw createActionError(400, 'بل باطل است و رسید آن قابل تأیید نیست.');
  }
  if (await isMonthClosed(bill.issuedAt, bill)) {
    throw createActionError(400, 'ماه مربوط به بل بسته شده است و تغییر مجاز نیست.');
  }

  const approvalAmount = roundMoney(receipt.amount);
  const approvalFeeType = resolveApprovedPaymentFeeType({
    order: bill,
    requestedFeeType: receipt.feeType,
    note: receipt.note
  });
  if (!approvalFeeType) {
    throw createActionError(400, 'نوع پرداخت این رسید مشخص نیست. برای بل‌های چندبخشی باید فیس، داخله یا نوع مربوطه پیش از تأیید تعیین شود.');
  }
  const remainingBeforeApproval = getFinanceFeeScopeBalanceAmount(bill, approvalFeeType);
  if (remainingBeforeApproval <= 0) {
    throw createActionError(400, 'این بل در نوع فیس انتخاب‌شده دیگر مانده باز ندارد و تأیید رسید مجاز نیست.');
  }
  if (approvalAmount > remainingBeforeApproval) {
    throw createActionError(400, `مبلغ این رسید از مانده نوع فیس انتخاب‌شده بیشتر است. مانده فعلی: ${remainingBeforeApproval}`);
  }

  receipt.amount = approvalAmount;
  receipt.feeType = approvalFeeType;
  receipt.status = 'approved';
  receipt.approvalStage = RECEIPT_STAGES.completed;

  addScopedPayment(bill, approvalFeeType, approvalAmount);
  applyPaymentToInstallments(bill, approvalAmount, receipt.paidAt || new Date());
  recalculateBill(bill);
  suppressAutomaticFinanceBillSync(bill);
  if (supportsMongoTransactions()) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      await receipt.save({ session });
      await bill.save({ session });
      await session.commitTransaction();
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      if (error?.name === 'VersionError' || error?.code === 112) {
        throw createActionError(409, 'این رسید هم‌زمان تغییر کرده است؛ صفحه را تازه کنید و دوباره بررسی نمایید.');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  } else {
    // Local standalone MongoDB does not support transactions. Optimistic
    // concurrency still prevents a second approval from applying twice.
    await receipt.save();
    await bill.save();
  }
  await syncStudentFinanceFromFinanceReceipt(receipt._id);
  await syncStudentFinanceFromFinanceBill(bill._id);
  const syncedPayment = await FeePayment.findOne({
    sourceReceiptId: receipt._id,
    schoolId: receiptScope.activeSchoolId
  });
  if (syncedPayment?.status === 'approved') {
    await syncApprovedFeePaymentToTreasury(syncedPayment);
  }

  await notifyStudent({
    req,
    studentId: bill.student,
    studentCoreId: bill.studentId,
    title: 'رسید پرداخت تأیید شد',
    message: `رسید پرداخت بل شماره ${formatFinanceCode(bill.billNumber || '')} تأیید شد.`,
    emailSubject: 'تأیید رسید پرداخت'
  });

  await logActivity({
    req,
    action: 'finance_approve_receipt',
    targetType: 'FinanceReceipt',
    targetId: receipt._id.toString(),
    meta: { billId: String(bill._id), amount: receipt.amount, level: actorLevel }
  });

  return {
    message: 'رسید پرداخت به‌صورت نهایی تأیید شد.',
    billStatus: bill.status,
    nextStage: RECEIPT_STAGES.completed
  };
}

async function approveFeePaymentAction({ req, feePaymentId = '', body = {} } = {}) {
  const payment = await FeePayment.findById(feePaymentId);
  if (!payment) throw createActionError(404, 'پرداخت فیس پیدا نشد.');
  const reviewScope = await assertCanonicalPaymentReviewScope({ req, payment });

  if (payment.sourceReceiptId) {
    const result = await approveReceiptAction({ req, receiptId: payment.sourceReceiptId, body });
    const refreshed = await FeePayment.findById(feePaymentId);
    assertDocumentInActiveSchool(refreshed, reviewScope.activeSchoolId, 'پرداخت فیس');
    if (refreshed?.status === 'approved') {
      await syncApprovedFeePaymentToTreasury(refreshed);
    }
    return {
      ...result,
      item: refreshed || payment,
      sourceReceiptId: String(payment.sourceReceiptId || '')
    };
  }

  const actor = await User.findById(req.user.id).select('name role orgRole adminLevel');
  if (!actor || actor.role !== 'admin') {
    throw createActionError(403, 'فقط مدیران اجازه بررسی پرداخت‌های فیس را دارند.');
  }
  if (payment.status !== 'pending') {
    throw createActionError(400, 'این پرداخت فیس قبلاً بررسی شده است.');
  }

  const actorLevel = resolveAdminOrgRole(actor);
  const currentStage = normalizeReceiptStage(payment.approvalStage || '');
  if (!canReviewReceiptStage(actorLevel, currentStage)) {
    throw createActionError(403, `این پرداخت در انتظار بررسی ${getFinanceReviewLevelLabel(getRequiredLevelForStage(currentStage))} است.`);
  }
  if (FINANCE_FOUR_EYES_ENABLED && actorAlreadyReviewed(payment.approvalTrail, req.user.id)) {
    throw createActionError(400, 'اصل تأیید دوگانه فعال است؛ یک مدیر نمی‌تواند همین پرداخت را در چند مرحله تأیید کند.');
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
    throw createActionError(400, 'مرحله بعدی تأیید برای این پرداخت تعریف نشده است.');
  }

  if (nextStage !== RECEIPT_STAGES.completed) {
    payment.approvalStage = nextStage;
    await payment.save();

    const nextLevel = getRequiredLevelForStage(nextStage);
    const nextAdmins = await findAdminsByLevels([nextLevel], req.user.id);
    await notifyAdmins({
      req,
      admins: nextAdmins,
      title: 'پرداخت به مرحله بعدی بررسی فرستاده شد',
      message: `پرداخت شماره ${formatFinanceCode(payment.paymentNumber || '')} برای بررسی ${getFinanceReviewLevelLabel(nextLevel)} فرستاده شد.`,
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

  await assertFinancePeriodWritable({
    schoolId: payment.schoolId,
    academicYearId: payment.academicYearId,
    dateValue: payment.paidAt || new Date()
  });
  if (await isMonthClosed(payment.paidAt || new Date(), payment)) {
    throw createActionError(400, 'ماه مالی بسته شده است و تأیید نهایی مجاز نیست.');
  }

  const approvalAmount = roundMoney(payment.amount);
  const allocations = reviewScope.allocations;
  if (!allocations.length) {
    throw createActionError(400, 'هیچ بل تخصیص‌یافته‌ای برای این پرداخت پیدا نشد.');
  }

  const orders = reviewScope.orders;

  for (const order of orders) {
    await assertFinancePeriodWritable({
      schoolId: order.schoolId || payment.schoolId,
      academicYearId: order.academicYearId || payment.academicYearId,
      dateValue: order.issuedAt || payment.paidAt || new Date()
    });
  }

  const orderMap = new Map(orders.map((item) => [String(item._id || ''), item]));
  const updatedOrders = [];
  for (const allocation of allocations) {
    const order = orderMap.get(String(allocation.feeOrderId || ''));
    if (!order) throw createActionError(404, 'بل تخصیص‌یافته پیدا نشد.');
    const paymentSchoolId = normalizeReferenceId(payment.schoolId);
    const orderSchoolId = normalizeReferenceId(order.schoolId);
    if (!paymentSchoolId || !orderSchoolId || paymentSchoolId !== orderSchoolId) {
      throw createActionError(400, 'بل تخصیص‌یافته مربوط به مکتب فعال نیست.');
    }
    if (!isSameStudentFinanceIdentity(payment, order)) {
      throw createActionError(400, 'بل تخصیص‌یافته مربوط به همین شاگرد نیست.');
    }
    if (order.status === 'void') {
      throw createActionError(400, 'بل باطل است و پرداخت آن قابل تأیید نیست.');
    }
    // Rebuild line balances from the obligation and approved paid amount before
    // validating this allocation; stored line/status snapshots may be stale.
    recalculateBill(order);
    allocation.feeType = resolveApprovedPaymentFeeType({
      order,
      requestedFeeType: allocation.feeType,
      note: payment.note
    });
    if (!allocation.feeType) {
      throw createActionError(400, 'نوع فیس یکی از تخصیص‌های پرداخت مشخص نیست. پرداخت بل چندبخشی بدون تعیین نوع فیس قابل تأیید نیست.');
    }
    const remainingBeforeApproval = getFinanceFeeScopeBalanceAmount(order, allocation.feeType);
    if (remainingBeforeApproval <= 0) {
      throw createActionError(400, 'یکی از بل‌های تخصیص‌یافته قبلاً به‌طور کامل پرداخت شده است.');
    }
    if (allocation.amount > remainingBeforeApproval) {
      throw createActionError(400, `مبلغ تخصیص از باقی‌مانده بل بیشتر است. باقی‌مانده فعلی: ${remainingBeforeApproval}`);
    }
  }

  payment.amount = approvalAmount;
  payment.allocations = allocations.map((item) => ({
    feeOrderId: item.feeOrderId,
    feeType: item.feeType,
    amount: item.amount,
    title: item.title,
    orderNumber: item.orderNumber
  }));
  if (!payment.feeOrderId && allocations.length === 1) {
    payment.feeOrderId = allocations[0].feeOrderId;
  }
  payment.status = 'approved';
  payment.approvalStage = RECEIPT_STAGES.completed;

  for (const allocation of allocations) {
    const order = orderMap.get(String(allocation.feeOrderId || ''));
    addScopedPayment(order, allocation.feeType, allocation.amount);
    applyPaymentToInstallments(order, allocation.amount, payment.paidAt || new Date());
    recalculateBill(order);
    updatedOrders.push(order);
  }

  const scopeOrder = updatedOrders[0] || null;
  if (!payment.schoolId && scopeOrder?.schoolId) {
    payment.schoolId = scopeOrder.schoolId;
  }
  if (!payment.academicYearId && scopeOrder?.academicYearId) {
    payment.academicYearId = scopeOrder.academicYearId;
  }
  if (!payment.classId && scopeOrder?.classId) {
    payment.classId = scopeOrder.classId;
  }
  if (supportsMongoTransactions()) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      await payment.save({ session });
      for (const order of updatedOrders) {
        await order.save({ session });
      }
      await session.commitTransaction();
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      if (error?.name === 'VersionError' || error?.code === 112) {
        throw createActionError(409, 'این پرداخت هم‌زمان توسط کاربر دیگری تغییر کرده است؛ صفحه را تازه کنید.');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  } else {
    await payment.save();
    for (const order of updatedOrders) await order.save();
  }
  await syncApprovedFeePaymentToTreasury(payment);

  // Best-effort, never blocks/fails the already-committed approval: keeps
  // the source FinanceBill's amountPaid from going stale relative to this
  // canonical FeeOrder, which is what ensureReceiptSubmissionAvailability
  // (financeRoutes.js) trusts when deciding how much more can still be
  // collected on that bill. See syncFinanceBillPaymentFromFeeOrder for why.
  for (const order of updatedOrders) {
    // eslint-disable-next-line no-await-in-loop
    await syncFinanceBillPaymentFromFeeOrder(order).catch((error) => {
      console.error('[finance][sync-bill-from-order]', error?.message || error);
    });
  }

  scheduleFinanceBackgroundTask('payment-approved-notification', () => notifyStudent({
    req,
    studentId: payment.student,
    studentCoreId: payment.studentId,
    title: 'پرداخت فیس تأیید شد',
    message: `پرداخت شماره ${formatFinanceCode(payment.paymentNumber || '')} تأیید شد.`,
    emailSubject: 'تأیید پرداخت فیس'
  }));

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
    message: 'پرداخت فیس به‌صورت نهایی تأیید شد.',
    billStatus: updatedOrders[0]?.status || 'approved',
    nextStage: RECEIPT_STAGES.completed
  };
}

async function rejectReceiptAction({ req, receiptId = '', body = {} } = {}) {
  const [receipt, actor] = await Promise.all([
    FinanceReceipt.findById(receiptId),
    User.findById(req.user.id).select('name role orgRole adminLevel')
  ]);

  if (!receipt) throw createActionError(404, 'رسید پیدا نشد.');
  await assertReceiptReviewScope({ req, receipt });
  if (!actor || actor.role !== 'admin') {
    throw createActionError(403, 'فقط مدیران اجازه رد رسیدها را دارند.');
  }
  if (receipt.status !== 'pending') {
    throw createActionError(400, 'این رسید قبلاً بررسی شده است.');
  }

  const actorLevel = resolveAdminOrgRole(actor);
  const currentStage = normalizeReceiptStage(receipt.approvalStage || '');
  if (!canReviewReceiptStage(actorLevel, currentStage)) {
    throw createActionError(403, `این رسید در انتظار بررسی ${getFinanceReviewLevelLabel(getRequiredLevelForStage(currentStage))} است.`);
  }
  if (FINANCE_FOUR_EYES_ENABLED && actorAlreadyReviewed(receipt.approvalTrail, req.user.id)) {
    throw createActionError(400, 'اصل تأیید دوگانه فعال است؛ یک مدیر نمی‌تواند همین رسید را در مرحله بعد دوباره بررسی کند.');
  }

  const reason = String(body?.reason || '').trim() || 'ردشده توسط مدیریت مالی';
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
    title: 'رسید پرداخت رد شد',
    message: `رسید پرداخت رد شد. دلیل: ${reason}`,
    emailSubject: 'رد رسید پرداخت'
  });

  await logActivity({
    req,
    action: 'finance_reject_receipt',
    targetType: 'FinanceReceipt',
    targetId: receipt._id.toString(),
    meta: { reason, level: actorLevel, stage: currentStage }
  });

  return {
    message: 'رسید پرداخت رد شد.',
    nextStage: RECEIPT_STAGES.rejected
  };
}

async function rejectFeePaymentAction({ req, feePaymentId = '', body = {} } = {}) {
  const payment = await FeePayment.findById(feePaymentId);
  if (!payment) throw createActionError(404, 'پرداخت فیس پیدا نشد.');
  const reviewScope = await assertCanonicalPaymentReviewScope({ req, payment });

  if (payment.sourceReceiptId) {
    const result = await rejectReceiptAction({ req, receiptId: payment.sourceReceiptId, body });
    const refreshed = await FeePayment.findById(feePaymentId);
    assertDocumentInActiveSchool(refreshed, reviewScope.activeSchoolId, 'پرداخت فیس');
    return {
      ...result,
      item: refreshed || payment,
      sourceReceiptId: String(payment.sourceReceiptId || '')
    };
  }

  const actor = await User.findById(req.user.id).select('name role orgRole adminLevel');
  if (!actor || actor.role !== 'admin') {
    throw createActionError(403, 'فقط مدیران اجازه رد پرداخت‌های فیس را دارند.');
  }
  if (payment.status !== 'pending') {
    throw createActionError(400, 'این پرداخت فیس قبلاً بررسی شده است.');
  }

  const actorLevel = resolveAdminOrgRole(actor);
  const currentStage = normalizeReceiptStage(payment.approvalStage || '');
  if (!canReviewReceiptStage(actorLevel, currentStage)) {
    throw createActionError(403, `این پرداخت در انتظار بررسی ${getFinanceReviewLevelLabel(getRequiredLevelForStage(currentStage))} است.`);
  }
  if (FINANCE_FOUR_EYES_ENABLED && actorAlreadyReviewed(payment.approvalTrail, req.user.id)) {
    throw createActionError(400, 'اصل تأیید دوگانه فعال است؛ یک مدیر نمی‌تواند همین پرداخت را در مرحله بعد دوباره بررسی کند.');
  }

  const reason = String(body?.reason || '').trim() || 'ردشده توسط مدیریت مالی';
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
    title: 'پرداخت فیس رد شد',
    message: `پرداخت شماره ${formatFinanceCode(payment.paymentNumber || '')} رد شد. دلیل: ${reason}`,
    emailSubject: 'رد پرداخت فیس'
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
    message: 'پرداخت فیس رد شد.',
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

  if (!receipt) throw createActionError(404, 'رسید پیدا نشد.');
  if (!actor || actor.role !== 'admin') {
    throw createActionError(403, 'فقط مدیران اجازه به‌روزرسانی پیگیری رسید را دارند.');
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
    title: 'پیگیری رسید مالی به‌روزرسانی شد',
    message: `پیگیری رسید ${receipt.student?.name || 'شاگرد'} در ${receipt.course?.title || 'صنف نامشخص'} به ${getFinanceReviewLevelLabel(assignedLevel)} سپرده شد.`,
    type: 'finance'
  });

  await logActivity({
    req,
    action: 'finance_receipt_follow_up_update',
    targetType: 'FinanceReceipt',
    targetId: receipt._id.toString(),
    meta: { assignedLevel, status }
  });

  return { followUp: receipt.followUp, message: 'پیگیری رسید مالی به‌روزرسانی شد.' };
}

async function updateFeePaymentFollowUpAction({ req, feePaymentId = '', body = {} } = {}) {
  const payment = await FeePayment.findById(feePaymentId);
  if (!payment) throw createActionError(404, 'پرداخت فیس پیدا نشد.');

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
    throw createActionError(403, 'فقط مدیران اجازه به‌روزرسانی پیگیری پرداخت را دارند.');
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
    title: 'پیگیری پرداخت فیس به‌روزرسانی شد',
    message: `پیگیری پرداخت شماره ${formatFinanceCode(payment.paymentNumber || '')} به ${getFinanceReviewLevelLabel(assignedLevel)} سپرده شد.`,
    type: 'finance'
  });

  await logActivity({
    req,
    action: 'fee_payment_follow_up_update',
    targetType: 'FeePayment',
    targetId: payment._id.toString(),
    meta: { assignedLevel, status }
  });

  return { followUp: payment.followUp, message: 'پیگیری پرداخت فیس به‌روزرسانی شد.' };
}

const REFUND_REASONS = ['membership_ended', 'overpayment', 'billing_error', 'other'];
const REFUND_METHODS = ['cash', 'bank_transfer', 'hawala', 'credit_next_bill', 'other'];
const REFUND_STATUSES_FOR_FILTER = ['pending_review', 'approved', 'rejected', 'paid'];

async function createRefundCaseAction({ req, body = {} } = {}) {
  const actorLevel = await resolveAdminActorLevel(req.user.id);
  if (!actorLevel) throw createActionError(403, 'فقط مدیران مالی اجازه ثبت درخواست بازپرداخت را دارند.');

  const billId = String(body?.billId || '').trim();
  const feeOrderId = String(body?.feeOrderId || '').trim();
  if (!billId && !feeOrderId) throw createActionError(400, 'بل یا بدهی مالی مبدأ این بازپرداخت مشخص نیست.');

  const sourceDoc = billId ? await FinanceBill.findById(billId) : await FeeOrder.findById(feeOrderId);
  if (!sourceDoc) throw createActionError(404, 'سند مالی مبدأ پیدا نشد.');

  const existing = await findOpenRefundForDocument({ bill: billId || null, feeOrder: feeOrderId || null });
  if (existing) throw createActionError(409, `برای این سند از قبل درخواست بازپرداخت ${existing.refundNumber} باز است.`);

  const amountPaid = roundMoney(sourceDoc.amountPaid);
  if (amountPaid <= 0) throw createActionError(400, 'این سند هیچ مبلغ پرداخت‌شده‌ای ندارد که قابل بازپرداخت باشد.');

  const requestedAmount = body?.amount !== undefined && body?.amount !== null && body?.amount !== ''
    ? roundMoney(body.amount)
    : amountPaid;
  if (requestedAmount <= 0 || requestedAmount > amountPaid) {
    throw createActionError(400, `مبلغ بازپرداخت باید بین ۱ تا ${amountPaid} باشد.`);
  }

  const reason = REFUND_REASONS.includes(String(body?.reason || '').trim()) ? String(body.reason).trim() : 'other';

  const item = await createFinanceRefundCase({
    student: sourceDoc.student,
    studentId: sourceDoc.studentId || null,
    studentMembershipId: sourceDoc.studentMembershipId || null,
    bill: billId || null,
    feeOrder: feeOrderId || null,
    schoolId: sourceDoc.schoolId || null,
    classId: sourceDoc.classId || null,
    academicYearId: sourceDoc.academicYearId || null,
    currency: sourceDoc.currency || 'AFN',
    amount: requestedAmount,
    reason,
    reasonNote: String(body?.reasonNote || '').trim(),
    detectionSource: 'manual',
    createdBy: req.user.id
  });

  await logActivity({
    req,
    action: 'finance_create_refund_case',
    targetType: 'FinanceRefund',
    targetId: item._id.toString(),
    meta: { billId, feeOrderId, amount: item.amount, reason }
  });

  return { item, message: 'درخواست بازپرداخت ثبت شد.' };
}

async function approveRefundAction({ req, refundId = '', body = {} } = {}) {
  const [refund, actor] = await Promise.all([
    FinanceRefund.findById(refundId),
    User.findById(req.user.id).select('name role orgRole adminLevel')
  ]);
  if (!refund) throw createActionError(404, 'درخواست بازپرداخت پیدا نشد.');
  if (!actor || actor.role !== 'admin') throw createActionError(403, 'فقط مدیران اجازه بررسی بازپرداخت را دارند.');

  const actorLevel = resolveAdminOrgRole(actor);
  if (!['finance_manager', 'finance_lead', 'general_president'].includes(actorLevel)) {
    throw createActionError(403, 'تایید بازپرداخت فقط برای مدیریت مالی، آمریت مالی یا ریاست عمومی مجاز است.');
  }
  if (refund.status !== 'pending_review') {
    throw createActionError(400, 'این درخواست بازپرداخت قبلاً بررسی شده است.');
  }

  const note = String(body?.note || '').trim();
  const now = new Date();
  refund.status = 'approved';
  refund.reviewedBy = req.user.id;
  refund.reviewedAt = now;
  refund.reviewNote = note;
  refund.approvalTrail = Array.isArray(refund.approvalTrail) ? refund.approvalTrail : [];
  refund.approvalTrail.push({ action: 'approve', by: req.user.id, at: now, note, reason: '' });
  await refund.save();

  await notifyStudent({
    req,
    studentId: refund.student,
    studentCoreId: refund.studentId,
    title: 'درخواست بازپرداخت تایید شد',
    message: `درخواست بازپرداخت شماره ${formatFinanceCode(refund.refundNumber || '')} تایید شد و به‌زودی پرداخت می‌شود.`,
    emailSubject: 'تایید درخواست بازپرداخت'
  });

  await logActivity({
    req,
    action: 'finance_approve_refund',
    targetType: 'FinanceRefund',
    targetId: refund._id.toString(),
    meta: { amount: refund.amount, level: actorLevel }
  });

  return { item: refund, message: 'درخواست بازپرداخت تایید شد.' };
}

async function rejectRefundAction({ req, refundId = '', body = {} } = {}) {
  const [refund, actor] = await Promise.all([
    FinanceRefund.findById(refundId),
    User.findById(req.user.id).select('name role orgRole adminLevel')
  ]);
  if (!refund) throw createActionError(404, 'درخواست بازپرداخت پیدا نشد.');
  if (!actor || actor.role !== 'admin') throw createActionError(403, 'فقط مدیران اجازه بررسی بازپرداخت را دارند.');

  const actorLevel = resolveAdminOrgRole(actor);
  if (!['finance_manager', 'finance_lead', 'general_president'].includes(actorLevel)) {
    throw createActionError(403, 'رد بازپرداخت فقط برای مدیریت مالی، آمریت مالی یا ریاست عمومی مجاز است.');
  }
  if (refund.status !== 'pending_review') {
    throw createActionError(400, 'این درخواست بازپرداخت قبلاً بررسی شده است.');
  }
  const reason = String(body?.reason || '').trim();
  if (!reason) throw createActionError(400, 'برای رد درخواست بازپرداخت، ثبت دلیل الزامی است.');

  const now = new Date();
  refund.status = 'rejected';
  refund.reviewedBy = req.user.id;
  refund.reviewedAt = now;
  refund.rejectReason = reason;
  refund.approvalTrail = Array.isArray(refund.approvalTrail) ? refund.approvalTrail : [];
  refund.approvalTrail.push({ action: 'reject', by: req.user.id, at: now, note: '', reason });
  await refund.save();

  await logActivity({
    req,
    action: 'finance_reject_refund',
    targetType: 'FinanceRefund',
    targetId: refund._id.toString(),
    meta: { reason, level: actorLevel }
  });

  return { item: refund, message: 'درخواست بازپرداخت رد شد.' };
}

async function markRefundPaidAction({ req, refundId = '', body = {} } = {}) {
  const refund = await FinanceRefund.findById(refundId);
  if (!refund) throw createActionError(404, 'درخواست بازپرداخت پیدا نشد.');
  const actorLevel = await resolveAdminActorLevel(req.user.id);
  if (!actorLevel) throw createActionError(403, 'فقط مدیران مالی اجازه ثبت پرداخت بازپرداخت را دارند.');
  if (refund.status !== 'approved') {
    throw createActionError(400, 'فقط درخواست‌های تاییدشده قابل پرداخت‌اند.');
  }

  const refundMethod = String(body?.refundMethod || '').trim();
  if (!REFUND_METHODS.includes(refundMethod)) {
    throw createActionError(400, 'روش بازپرداخت معتبر نیست.');
  }
  const proofReference = String(body?.proofReference || '').trim();
  if (!proofReference) throw createActionError(400, 'شماره سند/رسید بازپرداخت الزامی است.');

  let treasuryTransactionId = null;
  const accountId = String(body?.accountId || '').trim();
  if (accountId) {
    const account = await resolveTreasuryAccountSelection({ accountId, schoolId: refund.schoolId });
    const financialYear = account ? await FinancialYear.findById(account.financialYearId) : null;
    if (!account || !financialYear) throw createActionError(404, 'حساب خزانه یا سال مالی آن پیدا نشد.');
    await assertFinancePeriodWritable({
      schoolId: financialYear.schoolId,
      financialYearId: financialYear._id,
      academicYearId: financialYear.academicYearId,
      dateValue: new Date()
    });
    const transaction = await createTreasuryManualTransaction({
      financialYear,
      account,
      payload: {
        transactionType: 'withdrawal',
        amount: refund.amount,
        currency: refund.currency,
        referenceNo: proofReference,
        note: `بازپرداخت ${refund.refundNumber}`,
        idempotencyKey: `finance-refund:${refund._id}`
      },
      actorId: req.user.id
    });
    treasuryTransactionId = transaction?._id || transaction?.id || null;
  }

  refund.status = 'paid';
  refund.refundMethod = refundMethod;
  refund.proofReference = proofReference;
  refund.paidAt = new Date();
  refund.paidBy = req.user.id;
  if (treasuryTransactionId) refund.treasuryTransactionId = treasuryTransactionId;
  await refund.save();

  await notifyStudent({
    req,
    studentId: refund.student,
    studentCoreId: refund.studentId,
    title: 'بازپرداخت انجام شد',
    message: `مبلغ بازپرداخت شماره ${formatFinanceCode(refund.refundNumber || '')} به شما پرداخت شد.`,
    emailSubject: 'بازپرداخت انجام شد'
  });

  await logActivity({
    req,
    action: 'finance_mark_refund_paid',
    targetType: 'FinanceRefund',
    targetId: refund._id.toString(),
    meta: { amount: refund.amount, refundMethod, proofReference }
  });

  return { item: refund, message: 'بازپرداخت با موفقیت ثبت شد.' };
}

async function listFinanceRefunds(filters = {}) {
  const query = {};
  if (String(filters.schoolId || '').trim()) query.schoolId = filters.schoolId;
  if (REFUND_STATUSES_FOR_FILTER.includes(String(filters.status || '').trim())) query.status = filters.status;
  if (String(filters.studentMembershipId || '').trim()) query.studentMembershipId = filters.studentMembershipId;
  const studentId = String(filters.studentId || filters.student || '').trim();
  if (studentId) query.$or = [{ student: studentId }, { studentId }];

  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
  const items = await FinanceRefund.find(query)
    .sort({ status: 1, createdAt: -1 })
    .limit(limit)
    .populate('student', 'name email')
    .populate('bill', 'billNumber dueDate amountPaid')
    .populate('feeOrder', 'orderNumber dueDate amountPaid')
    .lean();

  return { items, count: items.length };
}

function wrapAction(action) {
  return async function wrappedAction(args = {}) {
    try {
      const result = await action(args);
      if (result && typeof result.message === 'string') {
        result.message = repairDisplayText(result.message);
      }
      return result;
    } catch (error) {
      if (isFinanceVersionConflict(error)) {
        throw createActionError(
          409,
          '\u0633\u0646\u062f \u0645\u0627\u0644\u06cc \u0647\u0645\u200c\u0632\u0645\u0627\u0646 \u062a\u063a\u06cc\u06cc\u0631 \u06a9\u0631\u062f\u0647 \u0627\u0633\u062a\u061b \u0635\u0641\u062d\u0647 \u0631\u0627 \u062a\u0627\u0632\u0647 \u06a9\u0646\u06cc\u062f \u0648 \u0648\u0636\u0639\u06cc\u062a \u0622\u0646 \u0631\u0627 \u062f\u0648\u0628\u0627\u0631\u0647 \u0628\u0631\u0631\u0633\u06cc \u06a9\u0646\u06cc\u062f.'
        );
      }
      throw error;
    }
  };
}

module.exports = {
  __financeVoidTestUtils: {
    isVoidedFinanceDocument,
    releaseIssuanceKeyForVoid
  },
  __financeSchoolScopeTestUtils: {
    assertCanonicalPaymentReviewScope,
    assertDocumentInActiveSchool,
    resolveActiveFinanceSchoolId
  },
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
  updateFeePaymentFollowUpAction: wrapAction(updateFeePaymentFollowUpAction),
  createRefundCaseAction: wrapAction(createRefundCaseAction),
  approveRefundAction: wrapAction(approveRefundAction),
  rejectRefundAction: wrapAction(rejectRefundAction),
  markRefundPaidAction: wrapAction(markRefundPaidAction),
  listFinanceRefunds
};
