const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const FinanceMonthClose = require('../models/FinanceMonthClose');
const FinanceAnomalyCase = require('../models/FinanceAnomalyCase');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const FinancialYear = require('../models/FinancialYear');
const ExpenseEntry = require('../models/ExpenseEntry');
const ExpenseCategoryDefinition = require('../models/ExpenseCategoryDefinition');
const GovernmentFinanceSnapshot = require('../models/GovernmentFinanceSnapshot');
const User = require('../models/User');
const StudentCore = require('../models/StudentCore');
const StudentProfile = require('../models/StudentProfile');
const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const AcademicYear = require('../models/AcademicYear');
const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceRelief = require('../models/FinanceRelief');
const ActivityLog = require('../models/ActivityLog');
const UserNotification = require('../models/UserNotification');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { sendMail } = require('../utils/mailer');
const { normalizeAdminLevel } = require('../utils/permissions');
const { resolveAdminOrgRole } = require('../utils/userRole');
const {
  roundMoney,
  getBillRemainingAmount,
  getReceiptSubmissionAvailability,
  findPendingReceiptForBill,
  findDuplicateReceiptSubmission
} = require('../utils/financeReceiptValidation');
const {
  syncStudentFinanceFromFinanceBill,
  syncStudentFinanceFromFinanceReceipt
} = require('../utils/studentFinanceSync');
const {
  listCourseMemberships,
  findClassMemberships,
  resolveMembershipTransactionLink
} = require('../utils/studentMembershipLookup');
const {
  normalizeText: normalizeScopeText,
  resolveClassCourseReference,
  serializeSchoolClassLite
} = require('../utils/classScope');
const {
  assertDateWithinFinancialYear,
  assertFinancialYearDates,
  assertFinancialYearWritable,
  ensureFinancialYearNoOverlap,
  ensureFinancialYearUniqueness,
  ensureSingleActiveFinancialYear,
  resolveAcademicYearFinancialContext
} = require('../services/financialYearService');
const {
  buildFeePlanIdentityFilter,
  getFeePlanPrimaryAmount,
  normalizeFeePlanPayload,
  resolveAcademicYearForFeePlan
} = require('../services/financeFeePlanService');
const {
  buildExpenseGovernanceAnalytics,
  buildFinancialYearCloseReadiness,
  ensureDefaultExpenseCategories,
  normalizeExpenseCategoryKey,
  resolveExpenseCategorySelection
} = require('../services/expenseGovernanceService');
const {
  buildTreasuryAnalytics,
  createTreasuryAccount,
  createTreasuryManualTransaction,
  createTreasuryTransfer,
  reconcileTreasuryAccount,
  resolveTreasuryAccountSelection,
  updateTreasuryAccount
} = require('../services/treasuryGovernanceService');
const {
  buildGroupedBillCandidates
} = require('../services/feeBillingService');
const { normalizeFinanceLineItems } = require('../utils/financeLineItems');
const {
  addBillAdjustmentAction,
  setBillInstallmentsAction,
  voidBillAction,
  approveReceiptAction,
  rejectReceiptAction,
  updateReceiptFollowUpAction
} = require('../services/financeAdminActionService');
const {
  createFeePayment,
  getMembershipFinanceStatement,
  listFeePayments
} = require('../services/studentFinanceService');
const { resolveQuarterForDate } = require('../services/financialPeriodService');
const { runReport } = require('../services/reportEngineService');
const {
  buildFinanceAnomalyReport,
  buildAnomalySummary
} = require('../services/financeAnomalyService');
const {
  buildFinanceMonthCloseSnapshot,
  toMonthDateRange
} = require('../services/financeCloseService');
const {
  approveFinanceDeliveryTemplateVersion,
  archiveFinanceDeliveryTemplateVersion,
  buildFinanceDeliveryAnalytics,
  createFinanceDeliveryCampaign,
  deliverFinanceDocumentArchive,
  ingestFinanceDeliveryProviderWebhook,
  listFinanceDeliveryCampaigns,
  listFinanceDeliveryProviderConfigs,
  listFinanceDeliveryProviderWebhookTokens,
  listFinanceDeliveryRecoveryQueue,
  listFinanceDeliveryTemplates,
  listFinanceDeliveryTemplateVariables,
  listFinanceDeliveryRetryQueue,
  publishFinanceDeliveryTemplateVersion,
  previewFinanceDeliveryTemplate,
  replayFinanceDeliveryProviderStatus,
  rejectFinanceDeliveryTemplateVersion,
  requestFinanceDeliveryTemplateReview,
  rollbackFinanceDeliveryTemplateVersion,
  rotateFinanceDeliveryProviderCredentials,
  saveFinanceDeliveryProviderConfig,
  syncFinanceDeliveryProviderStatus,
  retryFinanceDeliveryTarget,
  runDueFinanceDeliveryCampaigns,
  runFinanceDeliveryCampaign,
  saveFinanceDeliveryTemplateDraft,
  setFinanceDeliveryCampaignStatus
} = require('../services/financeDeliveryService');
const {
  buildMonthClosePdfBuffer,
  buildStatementPackPdfBuffer
} = require('../utils/financePdfDocuments');
const {
  buildFinanceDocumentDescriptor,
  buildFinanceDocumentZipBuffer,
  createFinanceDocumentArchive,
  getFinanceDocumentArchiveById,
  listFinanceDocumentArchives,
  recordFinanceDocumentDelivery,
  verifyFinanceDocumentArchive
} = require('../utils/financeDocumentArchive');
const {
  normalizeFinanceAnomalyWorkflowStatus,
  buildFinanceAnomalyCaseSnapshot,
  mergeFinanceAnomalyCases,
  buildFinanceAnomalyWorkflowSummary
} = require('../utils/financeAnomalyWorkflow');

const router = express.Router();
const FINANCE_FOUR_EYES_ENABLED = String(process.env.FINANCE_FOUR_EYES_ENABLED || 'true').toLowerCase() !== 'false';

const receiptsDir = path.join(__dirname, '..', 'uploads', 'finance-receipts');
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

const safeName = (name = '') => String(name).replace(/[^a-zA-Z0-9.\-_]/g, '_');
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, receiptsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext);
    if (!ok) return cb(new Error('ÙÙ‚Ø· ÙØ§ÛŒÙ„ ØªØµÙˆÛŒØ± ÛŒØ§ PDF Ù…Ø¬Ø§Ø² Ø§Ø³Øª'), false);
    cb(null, true);
  }
});

const toMonthKey = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const parseDateSafe = (value, fallback = null) => {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
};

const isMonthClosed = async (dateValue) => {
  const monthKey = toMonthKey(dateValue);
  if (!monthKey) return false;
  const exists = await FinanceMonthClose.exists({ monthKey, status: 'closed' });
  return !!exists;
};

const listBillableMembershipsForCourse = async (courseId, academicYear = '') => listCourseMemberships({
  courseId,
  academicYear,
  statuses: ['active'],
  currentOnly: true
});

const sumAdjustments = (bill, types = []) => (bill.adjustments || [])
  .filter((item) => types.includes(item.type))
  .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

const applyPaymentToInstallments = (bill, paymentAmount = 0, paidAt = new Date()) => {
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
};

const recalculateBill = (bill) => {
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
};

const generateBillNumber = async () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const mm = String(m + 1).padStart(2, '0');
  const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
  const monthEnd = new Date(y, m + 1, 1, 0, 0, 0, 0);
  const serial = await FinanceBill.countDocuments({ createdAt: { $gte: monthStart, $lt: monthEnd } }) + 1;
  return `BL-${y}${mm}-${String(serial).padStart(4, '0')}`;
};

const normalizeBillPeriodType = (value = '') => {
  if (value === 'monthly') return 'monthly';
  if (value === 'custom') return 'custom';
  return 'term';
};

const resolveBillIdentityLabel = ({ periodType = 'term', periodLabel = '', dueDate = null } = {}) => {
  const normalizedLabel = String(periodLabel || '').trim();
  if (normalizedLabel) return normalizedLabel;

  const dueDateValue = parseDateSafe(dueDate, null);
  if (periodType === 'monthly') {
    return `month:${toMonthKey(dueDateValue) || 'unspecified'}`;
  }
  if (periodType === 'custom') {
    return dueDateValue ? `custom:${dueDateValue.toISOString().slice(0, 10)}` : 'custom:open';
  }
  return '';
};

const buildBillObligationKey = ({
  studentId = '',
  courseId = '',
  academicYear = '',
  term = '',
  periodType = 'term',
  periodLabel = '',
  dueDate = null
} = {}) => {
  const normalizedPeriodType = normalizeBillPeriodType(periodType);
  return [
    String(studentId || '').trim(),
    String(courseId || '').trim(),
    String(academicYear || '').trim(),
    String(term || '').trim(),
    normalizedPeriodType,
    resolveBillIdentityLabel({
      periodType: normalizedPeriodType,
      periodLabel,
      dueDate
    })
  ].join('|');
};

const getBillObligationKey = (bill = {}) => buildBillObligationKey({
  studentId: bill.student,
  courseId: bill.course,
  academicYear: bill.academicYear,
  term: bill.term,
  periodType: bill.periodType,
  periodLabel: bill.periodLabel,
  dueDate: bill.dueDate
});

const findConflictingBill = async ({
  studentId = '',
  courseId = '',
  academicYear = '',
  term = '',
  periodType = 'term',
  periodLabel = '',
  dueDate = null,
  excludeBillId = ''
} = {}) => {
  if (!studentId || !courseId) return null;

  const targetKey = buildBillObligationKey({
    studentId,
    courseId,
    academicYear,
    term,
    periodType,
    periodLabel,
    dueDate
  });

  const filter = {
    student: studentId,
    course: courseId,
    status: { $ne: 'void' }
  };

  if (excludeBillId) {
    filter._id = { $ne: excludeBillId };
  }

  const candidates = await FinanceBill.find(filter)
    .select('billNumber student course academicYear term periodType periodLabel dueDate status');

  return candidates.find((item) => getBillObligationKey(item) === targetKey) || null;
};

const resolveFinanceAudienceUserIds = async ({ studentId, studentCoreId } = {}) => {
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
};

const notifyFinanceAudience = async ({
  req,
  userIds = [],
  title,
  message,
  type = 'finance',
  emailSubject,
  emailHtml,
  emailText
}) => {
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
    if (!user?.email || String(user.status || '').trim().toLowerCase() === 'inactive') return;
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
  }));

  return notifications;
};

const notifyStudent = async ({
  req,
  studentId,
  studentCoreId,
  title,
  message,
  emailSubject,
  emailHtml,
  emailText
}) => {
  const userIds = await resolveFinanceAudienceUserIds({ studentId, studentCoreId });
  await notifyFinanceAudience({
    req,
    userIds,
    title,
    message,
    type: 'finance',
    emailSubject,
    emailHtml,
    emailText
  });
};

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

const sanitizeCsv = (value) => {
  const text = String(value == null ? '' : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

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

const normalizeReceiptStage = (stage = '') => {
  const value = String(stage || '').trim();
  if (OPEN_RECEIPT_STAGES.includes(value)) return value;
  if (value === RECEIPT_STAGES.completed || value === RECEIPT_STAGES.rejected) return value;
  return RECEIPT_STAGES.financeManager;
};

const getRequiredLevelForStage = (stage = '') => {
  const normalized = normalizeReceiptStage(stage);
  if (normalized === RECEIPT_STAGES.financeLead) return 'finance_lead';
  if (normalized === RECEIPT_STAGES.generalPresident) return 'general_president';
  return 'finance_manager';
};

const canReviewReceiptStage = (adminLevel = '', stage = '') => {
  const level = normalizeAdminLevel(adminLevel || '');
  const normalizedStage = normalizeReceiptStage(stage);
  if (!OPEN_RECEIPT_STAGES.includes(normalizedStage)) return false;
  if (level === 'general_president') return true;
  return getRequiredLevelForStage(normalizedStage) === level;
};

const getNextReceiptStage = (adminLevel = '', currentStage = '') => {
  const level = normalizeAdminLevel(adminLevel || '');
  const stage = normalizeReceiptStage(currentStage);
  if (level === 'general_president') return RECEIPT_STAGES.completed;
  if (level === 'finance_manager' && stage === RECEIPT_STAGES.financeManager) return RECEIPT_STAGES.financeLead;
  if (level === 'finance_lead' && stage === RECEIPT_STAGES.financeLead) return RECEIPT_STAGES.generalPresident;
  return '';
};

const actorAlreadyReviewed = (trail = [], actorId = '') => Array.isArray(trail)
  && trail.some((entry) => String(entry?.by || '') === String(actorId || ''));

const getReceiptStageMessage = (stage = '') => {
  const normalized = normalizeReceiptStage(stage);
  if (normalized === RECEIPT_STAGES.financeLead) {
    return 'Ø±Ø³ÛŒØ¯ Ø¨Ø±Ø§ÛŒ Ø¨Ø±Ø±Ø³ÛŒ Ø¢Ù…Ø±ÛŒØª Ù…Ø§Ù„ÛŒ Ø§Ø±Ø³Ø§Ù„ Ø´Ø¯';
  }
  if (normalized === RECEIPT_STAGES.generalPresident) {
    return 'Ø±Ø³ÛŒØ¯ Ø¨Ø±Ø§ÛŒ ØªØ§ÛŒÛŒØ¯ Ù†Ù‡Ø§ÛŒÛŒ Ø±ÛŒØ§Ø³Øª Ø¹Ù…ÙˆÙ…ÛŒ Ø§Ø±Ø³Ø§Ù„ Ø´Ø¯';
  }
  return 'Ø±Ø³ÛŒØ¯ Ø¨Ø±Ø§ÛŒ Ø¨Ø±Ø±Ø³ÛŒ Ù…Ø¯ÛŒØ± Ù…Ø§Ù„ÛŒ Ø«Ø¨Øª Ø´Ø¯';
};

const FOLLOW_UP_LEVELS = ['finance_manager', 'finance_lead', 'general_president'];
const FOLLOW_UP_STATUSES = ['new', 'in_progress', 'on_hold', 'escalated', 'resolved'];

const normalizeFollowUpLevel = (value = '') => {
  const normalized = normalizeAdminLevel(value || '');
  return FOLLOW_UP_LEVELS.includes(normalized) ? normalized : 'finance_manager';
};

const normalizeFollowUpStatus = (value = '', fallback = 'new') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (FOLLOW_UP_STATUSES.includes(normalized)) return normalized;
  return FOLLOW_UP_STATUSES.includes(fallback) ? fallback : 'new';
};

const findAdminsByLevels = async (levels = [], excludeUserId = '') => {
  if (!Array.isArray(levels) || !levels.length) return [];
  const admins = await User.find({ role: 'admin' }).select('_id role orgRole adminLevel');
  return admins.filter((item) => {
    if (!item?._id) return false;
    if (excludeUserId && String(item._id) === String(excludeUserId)) return false;
    return levels.includes(resolveAdminOrgRole(item));
  });
};

const notifyAdmins = async ({ req, admins = [], title = '', message = '', type = 'finance' }) => {
  if (!Array.isArray(admins) || !admins.length) return;
  const records = await UserNotification.insertMany(
    admins.map((admin) => ({
      user: admin._id,
      title,
      message,
      type
    }))
  );
  const io = req?.app?.get?.('io');
  if (io) {
    records.forEach((record) => {
      io.to(`user:${record.user}`).emit('notify:new', record.toObject());
    });
  }
};

const resolveAdminActorLevel = async (userId = '') => {
  if (!userId) return '';
  const actor = await User.findById(userId).select('role orgRole adminLevel');
  if (!actor || actor.role !== 'admin') return '';
  return resolveAdminOrgRole(actor);
};

const createRouteError = (status = 500, message = 'Finance route error', extra = {}) => {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
};

const mapCanonicalPaymentErrorStatus = (code = '') => ({
  student_finance_membership_not_found: 404,
  student_finance_open_orders_not_found: 404,
  student_finance_payment_amount_invalid: 400,
  student_finance_payment_date_invalid: 400,
  student_finance_payment_allocations_required: 400,
  student_finance_payment_selected_orders_required: 400,
  student_finance_payment_order_not_found: 404,
  student_finance_payment_allocation_exceeds_balance: 400,
  student_finance_payment_duplicate_allocations: 400,
  student_finance_payment_allocation_invalid: 400,
  student_finance_payment_unallocated_amount: 400,
  student_finance_payment_exceeds_open_balance: 400,
  student_finance_payment_reference_duplicate: 409,
  student_finance_payment_duplicate: 409
}[code] || 500);

const mapCanonicalPaymentErrorMessage = (code = '') => ({
  student_finance_membership_not_found: 'عضویت مالی معتبر پیدا نشد.',
  student_finance_open_orders_not_found: 'برای این عضویت بدهی باز پیدا نشد.',
  student_finance_payment_amount_invalid: 'مبلغ پرداخت معتبر نیست.',
  student_finance_payment_date_invalid: 'تاریخ پرداخت معتبر نیست.',
  student_finance_payment_allocations_required: 'حداقل یک تخصیص پرداخت لازم است.',
  student_finance_payment_selected_orders_required: 'برای این حالت باید حداقل یک بدهی انتخاب شود.',
  student_finance_payment_order_not_found: 'یکی از بدهی‌های انتخاب‌شده پیدا نشد.',
  student_finance_payment_allocation_exceeds_balance: 'مبلغ تخصیص از مانده بدهی بیشتر است.',
  student_finance_payment_duplicate_allocations: 'یک بدهی نمی‌تواند بیش از یک بار در همان پرداخت تخصیص شود.',
  student_finance_payment_allocation_invalid: 'تخصیص‌های پرداخت معتبر نیستند.',
  student_finance_payment_unallocated_amount: 'کل مبلغ پرداخت روی بدهی‌ها تخصیص نشده است.',
  student_finance_payment_exceeds_open_balance: 'مبلغ پرداخت از مجموع بدهی‌های باز بیشتر است.',
  student_finance_payment_reference_duplicate: 'پرداخت دیگری با همین مرجع قبلاً ثبت شده است.',
  student_finance_payment_duplicate: 'پرداخت مشابهی قبلاً ثبت شده است.'
}[code] || 'ثبت پرداخت مالی ناموفق بود.');

const normalizeReceiptSubmissionPaymentMethod = (value = '') => (
  ['cash', 'bank_transfer', 'hawala', 'manual', 'other'].includes(value)
    ? value
    : 'manual'
);

const resolveBillStudentCoreId = async (bill = {}) => {
  const directStudentCoreId = String(bill?.studentId || '').trim();
  if (directStudentCoreId) return directStudentCoreId;
  const studentUserId = String(bill?.student || '').trim();
  if (!studentUserId) return '';
  const studentCore = await StudentCore.findOne({ userId: studentUserId }).select('_id').lean();
  return studentCore?._id ? String(studentCore._id) : '';
};

const parentCanAccessStudentCore = async (parentUserId = '', studentCoreId = '') => {
  const guardianUserId = String(parentUserId || '').trim();
  const normalizedStudentCoreId = String(studentCoreId || '').trim();
  if (!guardianUserId || !normalizedStudentCoreId) return false;
  const profile = await StudentProfile.findOne({
    studentId: normalizedStudentCoreId,
    guardians: {
      $elemMatch: {
        userId: guardianUserId,
        status: { $ne: 'inactive' }
      }
    }
  }).select('_id').lean();
  return !!profile;
};

const parentCanSubmitReceiptForBill = async (parentUserId = '', bill = {}) => {
  const studentCoreId = await resolveBillStudentCoreId(bill);
  return parentCanAccessStudentCore(parentUserId, studentCoreId);
};

const loadParentCanonicalPaymentContext = async (req) => {
  const studentMembershipId = String(req.body?.studentMembershipId || '').trim();
  const feeOrderId = String(req.body?.feeOrderId || '').trim();
  if (!studentMembershipId) {
    throw createRouteError(400, 'شناسه عضویت مالی الزامی است');
  }
  if (!feeOrderId) {
    throw createRouteError(400, 'شناسه بدهی مالی الزامی است');
  }
  if (!req.file) {
    throw createRouteError(400, 'فایل رسید الزامی است');
  }

  const membership = await StudentMembership.findById(studentMembershipId)
    .populate('studentId')
    .populate('student', 'name email')
    .populate('classId')
    .populate('academicYearId');
  if (!membership) {
    throw createRouteError(404, 'عضویت مالی پیدا نشد');
  }

  const studentCoreId = String(membership.studentId?._id || membership.studentId || '').trim();
  const hasAccess = await parentCanAccessStudentCore(req.user?.id || '', studentCoreId);
  if (!hasAccess) {
    throw createRouteError(403, 'این عضویت مربوط به متعلم وصل‌شده به حساب شما نیست');
  }

  const [feeOrder] = await FeeOrder.find({
    _id: feeOrderId,
    studentMembershipId: membership._id
  })
    .populate('studentId')
    .populate('student', 'name email')
    .populate('course', 'title kind')
    .populate('classId')
    .populate('academicYearId')
    .populate('assessmentPeriodId')
    .limit(1);

  if (!feeOrder) {
    throw createRouteError(404, 'بدهی مالی انتخاب‌شده پیدا نشد');
  }
  if (feeOrder.sourceBillId) {
    throw createRouteError(400, 'این بدهی هنوز به بل legacy وصل است و باید از مسیر receipt قبلی ثبت شود');
  }
  if (!['new', 'partial', 'overdue'].includes(String(feeOrder.status || ''))) {
    throw createRouteError(400, 'این بدهی برای ثبت پرداخت جدید باز نیست');
  }
  if (Number(feeOrder.outstandingAmount || 0) <= 0) {
    throw createRouteError(400, 'این بدهی قبلاً تصفیه شده است');
  }

  return { membership, feeOrder };
};

const createCanonicalPaymentSubmissionRecord = async ({
  req,
  membership,
  feeOrder,
  draft,
  actorType = 'parent'
} = {}) => {
  const item = await createFeePayment({
    studentMembershipId: String(membership?._id || ''),
    selectedOrderIds: [String(feeOrder?._id || '')],
    allocationMode: 'auto_selected',
    amount: draft.amount,
    currency: String(feeOrder?.currency || 'AFN'),
    paymentMethod: draft.normalizedMethod,
    paidAt: draft.paidAt,
    referenceNo: draft.referenceNo,
    note: draft.note,
    payerType: 'student_guardian',
    source: 'manual',
    fileUrl: `uploads/finance-receipts/${req.file.filename}`
  });

  let targetAdmins = await findAdminsByLevels(['finance_manager']);
  if (!targetAdmins.length) {
    targetAdmins = await findAdminsByLevels(['finance_lead', 'general_president']);
  }

  const actorLabel = actorType === 'parent' ? 'ولی/سرپرست' : 'متعلم';
  await notifyAdmins({
    req,
    admins: targetAdmins,
    title: 'پرداخت canonical جدید برای بررسی',
    message: `پرداخت ${item.paymentNumber} توسط ${actorLabel} برای بدهی ${feeOrder.orderNumber} ثبت شد و در انتظار بررسی است.`,
    type: 'finance'
  });

  await logActivity({
    req,
    action: actorType === 'parent' ? 'finance_submit_canonical_payment_parent' : 'finance_submit_canonical_payment',
    targetType: 'FeePayment',
    targetId: String(item?.id || ''),
    targetUser: String(item?.student?.userId || ''),
    meta: {
      studentMembershipId: String(membership?._id || ''),
      feeOrderId: String(feeOrder?._id || ''),
      amount: Number(item?.amount || 0),
      paymentMethod: String(item?.paymentMethod || ''),
      actorType
    }
  });

  return item;
};

const loadReceiptSubmissionBill = async (req) => {
  const billId = String(req.body?.billId || '').trim();
  if (!billId) {
    throw createRouteError(400, 'شناسه بل الزامی است');
  }
  if (!req.file) {
    throw createRouteError(400, 'فایل رسید الزامی است');
  }

  const bill = await FinanceBill.findById(billId);
  if (!bill) {
    throw createRouteError(404, 'بل یافت نشد');
  }
  if (bill.status === 'void') {
    throw createRouteError(400, 'بل باطل شده و ثبت رسید برای آن ممکن نیست');
  }

  return bill;
};

const parseReceiptSubmissionDraft = async (req) => {
  const paidAt = parseDateSafe(req.body?.paidAt, new Date());
  if (await isMonthClosed(paidAt)) {
    throw createRouteError(400, 'ماه مالی بسته شده و ثبت رسید برای این تاریخ مجاز نیست');
  }

  const amount = roundMoney(req.body?.amount);
  if (!amount) {
    throw createRouteError(400, 'مبلغ رسید معتبر نیست');
  }

  return {
    paidAt,
    amount,
    normalizedMethod: normalizeReceiptSubmissionPaymentMethod(req.body?.paymentMethod),
    referenceNo: String(req.body?.referenceNo || '').trim(),
    note: String(req.body?.note || '').trim()
  };
};

const ensureReceiptSubmissionAvailability = async ({
  bill,
  amount,
  paymentMethod,
  paidAt,
  referenceNo
} = {}) => {
  const pendingReceipt = await findPendingReceiptForBill(bill._id);
  if (pendingReceipt) {
    throw createRouteError(409, 'برای این بل یک رسید دیگر در حال بررسی است. تا پایان بررسی رسید جدید ثبت نمی‌شود.', {
      pendingReceiptId: pendingReceipt._id
    });
  }

  const duplicateReceipt = await findDuplicateReceiptSubmission({
    billId: bill._id,
    amount,
    paymentMethod,
    paidAt,
    referenceNo
  });
  if (duplicateReceipt) {
    throw createRouteError(409, 'رسیدی با همین مشخصات قبلاً برای این بل ثبت شده است', {
      duplicateReceiptId: duplicateReceipt._id
    });
  }

  const availability = await getReceiptSubmissionAvailability(bill);
  if (availability.approvedRemaining <= 0) {
    throw createRouteError(400, 'این بل قبلاً تسویه شده است');
  }
  if (availability.availableToSubmit <= 0) {
    throw createRouteError(409, 'برای این بل رسید دیگری در حال بررسی است. لطفاً تا پایان بررسی صبر کنید.', {
      availableAmount: availability.availableToSubmit
    });
  }
  if (amount > availability.availableToSubmit) {
    throw createRouteError(400, `مبلغ رسید از مانده قابل ثبت بیشتر است. حداکثر مجاز: ${availability.availableToSubmit}`, {
      availableAmount: availability.availableToSubmit
    });
  }

  return availability;
};

const createReceiptSubmissionRecord = async ({
  req,
  bill,
  paidAt,
  amount,
  paymentMethod,
  referenceNo,
  note,
  actorType = 'student'
} = {}) => {
  const receipt = await FinanceReceipt.create({
    bill: bill._id,
    student: bill.student,
    studentId: bill.studentId || null,
    studentMembershipId: bill.studentMembershipId || null,
    linkScope: bill.linkScope || null,
    course: bill.course,
    classId: bill.classId || null,
    academicYearId: bill.academicYearId || null,
    amount,
    paymentMethod,
    referenceNo,
    paidAt,
    fileUrl: `uploads/finance-receipts/${req.file.filename}`,
    note,
    approvalStage: RECEIPT_STAGES.financeManager
  });
  await syncStudentFinanceFromFinanceReceipt(receipt).catch(() => null);

  let targetAdmins = await findAdminsByLevels(['finance_manager']);
  if (!targetAdmins.length) {
    targetAdmins = await findAdminsByLevels(['finance_lead', 'general_president']);
  }

  const actorLabel = actorType === 'parent' ? 'ولی/سرپرست' : 'متعلم';
  await notifyAdmins({
    req,
    admins: targetAdmins,
    title: 'رسید جدید برای بررسی',
    message: `رسید جدید توسط ${actorLabel} برای بل ${bill.billNumber} ثبت شده و در انتظار بررسی است.`,
    type: 'finance'
  });

  await logActivity({
    req,
    action: actorType === 'parent' ? 'finance_submit_receipt_parent' : 'finance_submit_receipt',
    targetType: 'FinanceReceipt',
    targetId: receipt._id.toString(),
    meta: {
      billId: bill._id.toString(),
      amount,
      actorType
    }
  });

  return receipt;
};

const EXPENSE_APPROVAL_STAGES = {
  draft: 'draft',
  financeManager: 'finance_manager_review',
  financeLead: 'finance_lead_review',
  generalPresident: 'general_president_review',
  completed: 'completed',
  rejected: 'rejected',
  void: 'void'
};

const OPEN_EXPENSE_APPROVAL_STAGES = [
  EXPENSE_APPROVAL_STAGES.financeManager,
  EXPENSE_APPROVAL_STAGES.financeLead,
  EXPENSE_APPROVAL_STAGES.generalPresident
];

const normalizeExpenseApprovalStage = (value = '') => {
  const normalized = String(value || '').trim();
  if (OPEN_EXPENSE_APPROVAL_STAGES.includes(normalized)) return normalized;
  if ([EXPENSE_APPROVAL_STAGES.completed, EXPENSE_APPROVAL_STAGES.rejected, EXPENSE_APPROVAL_STAGES.void].includes(normalized)) {
    return normalized;
  }
  return EXPENSE_APPROVAL_STAGES.draft;
};

const getRequiredLevelForExpenseStage = (stage = '') => {
  const normalized = normalizeExpenseApprovalStage(stage);
  if (normalized === EXPENSE_APPROVAL_STAGES.financeLead) return 'finance_lead';
  if (normalized === EXPENSE_APPROVAL_STAGES.generalPresident) return 'general_president';
  return 'finance_manager';
};

const canReviewExpenseStage = (adminLevel = '', stage = '') => {
  const level = normalizeAdminLevel(adminLevel || '');
  const normalizedStage = normalizeExpenseApprovalStage(stage);
  if (!OPEN_EXPENSE_APPROVAL_STAGES.includes(normalizedStage)) return false;
  if (level === 'general_president') return true;
  return getRequiredLevelForExpenseStage(normalizedStage) === level;
};

const getNextExpenseStage = (adminLevel = '', currentStage = '') => {
  const level = normalizeAdminLevel(adminLevel || '');
  const stage = normalizeExpenseApprovalStage(currentStage);
  if (level === 'general_president') return EXPENSE_APPROVAL_STAGES.completed;
  if (level === 'finance_manager' && stage === EXPENSE_APPROVAL_STAGES.financeManager) return EXPENSE_APPROVAL_STAGES.financeLead;
  if (level === 'finance_lead' && stage === EXPENSE_APPROVAL_STAGES.financeLead) return EXPENSE_APPROVAL_STAGES.generalPresident;
  return '';
};

const actorAlreadyReviewedExpense = (trail = [], actorId = '') => Array.isArray(trail)
  && trail.some((entry) => (
    String(entry?.by || '') === String(actorId || '')
    && ['approve', 'reject'].includes(String(entry?.action || '').trim().toLowerCase())
  ));

const appendExpenseApprovalTrail = (item, { level = '', action = '', by = '', note = '', reason = '' } = {}) => {
  if (!Array.isArray(item.approvalTrail)) item.approvalTrail = [];
  item.approvalTrail.push({
    level: String(level || '').trim(),
    action: String(action || '').trim(),
    by: by || null,
    at: new Date(),
    note: String(note || '').trim(),
    reason: String(reason || '').trim()
  });
};

const MONTH_CLOSE_APPROVAL_STAGES = {
  draft: 'draft',
  financeManager: 'finance_manager_review',
  financeLead: 'finance_lead_review',
  generalPresident: 'general_president_review',
  completed: 'completed',
  rejected: 'rejected'
};

const OPEN_MONTH_CLOSE_APPROVAL_STAGES = [
  MONTH_CLOSE_APPROVAL_STAGES.financeManager,
  MONTH_CLOSE_APPROVAL_STAGES.financeLead,
  MONTH_CLOSE_APPROVAL_STAGES.generalPresident
];

const normalizeMonthCloseApprovalStage = (value = '') => {
  const normalized = String(value || '').trim();
  if (OPEN_MONTH_CLOSE_APPROVAL_STAGES.includes(normalized)) return normalized;
  if ([MONTH_CLOSE_APPROVAL_STAGES.completed, MONTH_CLOSE_APPROVAL_STAGES.rejected].includes(normalized)) {
    return normalized;
  }
  return MONTH_CLOSE_APPROVAL_STAGES.draft;
};

const getRequiredLevelForMonthCloseStage = (stage = '') => {
  const normalized = normalizeMonthCloseApprovalStage(stage);
  if (normalized === MONTH_CLOSE_APPROVAL_STAGES.financeLead) return 'finance_lead';
  if (normalized === MONTH_CLOSE_APPROVAL_STAGES.generalPresident) return 'general_president';
  return 'finance_manager';
};

const canReviewMonthCloseStage = (adminLevel = '', stage = '') => {
  const level = normalizeAdminLevel(adminLevel || '');
  const normalizedStage = normalizeMonthCloseApprovalStage(stage);
  if (!OPEN_MONTH_CLOSE_APPROVAL_STAGES.includes(normalizedStage)) return false;
  if (level === 'general_president') return true;
  return getRequiredLevelForMonthCloseStage(normalizedStage) === level;
};

const getNextMonthCloseStage = (adminLevel = '', currentStage = '') => {
  const level = normalizeAdminLevel(adminLevel || '');
  const stage = normalizeMonthCloseApprovalStage(currentStage);
  if (level === 'general_president') return MONTH_CLOSE_APPROVAL_STAGES.completed;
  if (level === 'finance_manager' && stage === MONTH_CLOSE_APPROVAL_STAGES.financeManager) return MONTH_CLOSE_APPROVAL_STAGES.financeLead;
  if (level === 'finance_lead' && stage === MONTH_CLOSE_APPROVAL_STAGES.financeLead) return MONTH_CLOSE_APPROVAL_STAGES.generalPresident;
  return '';
};

const actorAlreadyReviewedMonthClose = (trail = [], actorId = '') => Array.isArray(trail)
  && trail.some((entry) => (
    String(entry?.by || '') === String(actorId || '')
    && ['approve', 'reject'].includes(String(entry?.action || '').trim().toLowerCase())
  ));

const appendMonthCloseApprovalTrail = (item, { level = '', action = '', by = '', note = '', reason = '' } = {}) => {
  if (!Array.isArray(item.approvalTrail)) item.approvalTrail = [];
  item.approvalTrail.push({
    level: String(level || '').trim(),
    action: String(action || '').trim(),
    by: by || null,
    at: new Date(),
    note: String(note || '').trim(),
    reason: String(reason || '').trim()
  });
};

const serializeMonthCloseUser = (value = null) => {
  if (!value) return null;
  if (value?._id) {
    return {
      _id: value._id,
      name: String(value?.name || '').trim()
    };
  }
  return value;
};

const populateFinanceMonthCloseQuery = (query) => query
  .populate('requestedBy', 'name')
  .populate('approvedBy', 'name')
  .populate('rejectedBy', 'name')
  .populate('closedBy', 'name')
  .populate('reopenedBy', 'name')
  .populate('approvalTrail.by', 'name')
  .populate('history.by', 'name');

const serializeFinanceMonthClose = (value = null, actorLevel = '') => {
  if (!value) return null;
  const plain = value?.toObject ? value.toObject() : { ...(value || {}) };
  const approvalStage = normalizeMonthCloseApprovalStage(plain?.approvalStage || '');
  const status = String(plain?.status || '').trim() || 'draft';
  const readiness = plain?.snapshot?.readiness || { readyToApprove: true, blockingIssues: [], warningIssues: [] };
  return {
    ...plain,
    status,
    approvalStage,
    requestedBy: serializeMonthCloseUser(plain?.requestedBy || null),
    approvedBy: serializeMonthCloseUser(plain?.approvedBy || null),
    rejectedBy: serializeMonthCloseUser(plain?.rejectedBy || null),
    closedBy: serializeMonthCloseUser(plain?.closedBy || null),
    reopenedBy: serializeMonthCloseUser(plain?.reopenedBy || null),
    approvalTrail: Array.isArray(plain?.approvalTrail)
      ? plain.approvalTrail.map((entry) => ({
          ...entry,
          by: serializeMonthCloseUser(entry?.by || null)
        }))
      : [],
    history: Array.isArray(plain?.history)
      ? plain.history.map((entry) => ({
          ...entry,
          by: serializeMonthCloseUser(entry?.by || null)
        }))
      : [],
    canApprove: status === 'pending_review' && canReviewMonthCloseStage(actorLevel, approvalStage),
    canReject: status === 'pending_review' && canReviewMonthCloseStage(actorLevel, approvalStage),
    canReopen: status === 'closed' && normalizeAdminLevel(actorLevel || '') === 'general_president',
    canResubmit: ['rejected', 'reopened', 'draft'].includes(status),
    readiness: {
      readyToApprove: readiness?.readyToApprove !== false,
      blockingIssues: Array.isArray(readiness?.blockingIssues) ? readiness.blockingIssues : [],
      warningIssues: Array.isArray(readiness?.warningIssues) ? readiness.warningIssues : []
    }
  };
};

const getMonthCloseStageMessage = (stage = '') => {
  const normalized = normalizeMonthCloseApprovalStage(stage);
  if (normalized === MONTH_CLOSE_APPROVAL_STAGES.financeLead) {
    return 'درخواست بستن ماه مالی برای آمریت مالی ارسال شد.';
  }
  if (normalized === MONTH_CLOSE_APPROVAL_STAGES.generalPresident) {
    return 'درخواست بستن ماه مالی برای تایید نهایی ریاست عمومی ارسال شد.';
  }
  if (normalized === MONTH_CLOSE_APPROVAL_STAGES.completed) {
    return 'ماه مالی با تایید نهایی بسته شد.';
  }
  return 'درخواست بستن ماه مالی ثبت شد.';
};

const buildFinanceClassOption = (value = null) => {
  const plain = value?.toObject ? value.toObject() : { ...(value || {}) };
  const title = String(plain.title || '').trim();
  const code = String(plain.code || '').trim();
  const gradeLevel = plain.gradeLevel || '';
  const section = String(plain.section || '').trim();
  const summary = [gradeLevel, section].filter(Boolean).join(' / ');

  return {
    _id: plain._id || plain.id || null,
    id: plain._id || plain.id || null,
    classId: plain._id || plain.id || null,
    courseId: plain.legacyCourseId || plain.courseId || null,
    legacyCourseId: plain.legacyCourseId || plain.courseId || null,
    title,
    code,
    gradeLevel,
    section,
    uiLabel: [title, code ? `(${code})` : '', summary ? `- ${summary}` : ''].filter(Boolean).join(' ').trim() || title || 'Class'
  };
};

const serializeFinanceFeePlan = (value = null) => {
  if (!value) return null;
  const plain = value?.toObject ? value.toObject() : { ...(value || {}) };
  const academicYear = plain.academicYearId?._id
    ? {
        _id: plain.academicYearId._id,
        title: plain.academicYearId.title || '',
        code: plain.academicYearId.code || '',
        isActive: plain.academicYearId.isActive === true
      }
    : null;

  return {
    ...plain,
    schoolClass: serializeSchoolClassLite(plain.classId || null),
    classId: plain.classId?._id || plain.classId || null,
    courseId: plain.course?._id || plain.course || null,
    academicYearId: plain.academicYearId?._id || plain.academicYearId || null,
    academicYear,
    planCode: String(plain.planCode || 'STANDARD').trim().toUpperCase(),
    planType: String(plain.planType || 'standard').trim() || 'standard',
    priority: Number(plain.priority != null ? plain.priority : 100) || 100,
    isDefault: plain.isDefault === true,
    effectiveFrom: plain.effectiveFrom ? new Date(plain.effectiveFrom).toISOString() : null,
    effectiveTo: plain.effectiveTo ? new Date(plain.effectiveTo).toISOString() : null,
    eligibilityRule: String(plain.eligibilityRule || '').trim(),
    billingFrequency: plain.billingFrequency || plain.periodType || 'term',
    tuitionFee: Number(plain.tuitionFee != null ? plain.tuitionFee : plain.amount) || 0,
    admissionFee: Number(plain.admissionFee || 0),
    examFee: Number(plain.examFee || 0),
    documentFee: Number(plain.documentFee || 0),
    transportDefaultFee: Number(plain.transportDefaultFee || 0),
    otherFee: Number(plain.otherFee || 0),
    feeBreakdown: {
      tuitionFee: Number(plain.tuitionFee != null ? plain.tuitionFee : plain.amount) || 0,
      admissionFee: Number(plain.admissionFee || 0),
      examFee: Number(plain.examFee || 0),
      documentFee: Number(plain.documentFee || 0),
      transportDefaultFee: Number(plain.transportDefaultFee || 0),
      otherFee: Number(plain.otherFee || 0)
    }
  };
};

const serializeFinancialYear = (value = null) => {
  if (!value) return null;
  const plain = value?.toObject ? value.toObject() : { ...(value || {}) };
  return {
    ...plain,
    academicYearId: plain.academicYearId?._id || plain.academicYearId || null,
    academicYear: plain.academicYearId?._id
      ? {
          _id: plain.academicYearId._id,
          title: plain.academicYearId.title || '',
          code: plain.academicYearId.code || ''
        }
      : null,
    closedBy: plain.closedBy?._id
      ? { _id: plain.closedBy._id, name: plain.closedBy.name || '' }
      : (plain.closedBy || null),
    createdBy: plain.createdBy?._id
      ? { _id: plain.createdBy._id, name: plain.createdBy.name || '' }
      : (plain.createdBy || null),
    updatedBy: plain.updatedBy?._id
      ? { _id: plain.updatedBy._id, name: plain.updatedBy.name || '' }
      : (plain.updatedBy || null)
  };
};

const serializeExpenseEntry = (value = null) => {
  if (!value) return null;
  const plain = value?.toObject ? value.toObject() : { ...(value || {}) };
  return {
    ...plain,
    financialYearId: plain.financialYearId?._id || plain.financialYearId || null,
    academicYearId: plain.academicYearId?._id || plain.academicYearId || null,
    classId: plain.classId?._id || plain.classId || null,
    schoolClass: serializeSchoolClassLite(plain.classId || null),
    financialYear: plain.financialYearId?._id
      ? {
          _id: plain.financialYearId._id,
          title: plain.financialYearId.title || '',
          status: plain.financialYearId.status || '',
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
    treasuryAccountId: plain.treasuryAccountId?._id || plain.treasuryAccountId || null,
    treasuryAccount: plain.treasuryAccountId?._id
      ? {
          _id: plain.treasuryAccountId._id,
          title: plain.treasuryAccountId.title || '',
          code: plain.treasuryAccountId.code || '',
          accountType: plain.treasuryAccountId.accountType || '',
          currency: plain.treasuryAccountId.currency || 'AFN',
          isActive: plain.treasuryAccountId.isActive !== false
        }
      : null,
    approvalTrail: Array.isArray(plain.approvalTrail)
      ? plain.approvalTrail.map((entry) => ({
          ...entry,
          by: entry?.by?._id
            ? { _id: entry.by._id, name: entry.by.name || '' }
            : (entry?.by || null)
        }))
      : [],
    createdBy: plain.createdBy?._id
      ? { _id: plain.createdBy._id, name: plain.createdBy.name || '' }
      : (plain.createdBy || null),
    submittedBy: plain.submittedBy?._id
      ? { _id: plain.submittedBy._id, name: plain.submittedBy.name || '' }
      : (plain.submittedBy || null),
    approvedBy: plain.approvedBy?._id
      ? { _id: plain.approvedBy._id, name: plain.approvedBy.name || '' }
      : (plain.approvedBy || null),
    rejectedBy: plain.rejectedBy?._id
      ? { _id: plain.rejectedBy._id, name: plain.rejectedBy.name || '' }
      : (plain.rejectedBy || null),
    updatedBy: plain.updatedBy?._id
      ? { _id: plain.updatedBy._id, name: plain.updatedBy.name || '' }
      : (plain.updatedBy || null)
  };
};

const populateExpenseEntryQuery = (query) => query
  .populate('financialYearId', 'title status isClosed')
  .populate('academicYearId', 'title code')
  .populate('classId', 'title code gradeLevel section')
  .populate('treasuryAccountId', 'title code accountType currency isActive')
  .populate('approvalTrail.by', 'name')
  .populate('createdBy', 'name')
  .populate('submittedBy', 'name')
  .populate('approvedBy', 'name')
  .populate('rejectedBy', 'name')
  .populate('updatedBy', 'name');

const serializeGovernmentFinanceSnapshot = (value = null) => {
  if (!value) return null;
  const plain = value?.toObject ? value.toObject() : { ...(value || {}) };
  return {
    ...plain,
    financialYearId: plain.financialYearId?._id || plain.financialYearId || null,
    academicYearId: plain.academicYearId?._id || plain.academicYearId || null,
    classId: plain.classId?._id || plain.classId || null,
    schoolClass: serializeSchoolClassLite(plain.classId || null),
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
};

const parseBooleanInput = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const normalizeGovernmentSnapshotType = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'annual' ? 'annual' : 'quarterly';
};

const resolveGovernmentReportKey = (reportType = '') => (
  normalizeGovernmentSnapshotType(reportType) === 'annual'
    ? 'government_finance_annual'
    : 'government_finance_quarterly'
);

const resolveFinancialYearErrorStatus = (error) => {
  if (Number.isFinite(Number(error?.statusCode)) && Number(error?.statusCode) > 0) {
    return Number(error.statusCode);
  }
  if (Number(error?.code) === 11000) return 409;
  if (String(error?.name || '') === 'ValidationError') return 400;
  if (String(error?.name || '') === 'CastError') return 400;
  return 500;
};

const resolveFinancialYearMessage = (error, fallback = 'عملیات سال مالی ناموفق بود.') => {
  const code = String(error?.message || '');
  const duplicateMessage = String(error?.errmsg || error?.message || '');
  const duplicateKeys = Object.keys(error?.keyPattern || {});
  if (code === 'finance_financial_year_invalid_dates') return 'تاریخ شروع و ختم سال مالی الزامی است.';
  if (code === 'finance_financial_year_invalid_range') return 'تاریخ ختم سال مالی باید بعد از تاریخ شروع باشد.';
  if (code === 'finance_financial_year_academic_year_required') return 'انتخاب سال تعلیمی الزامی است.';
  if (code === 'finance_financial_year_academic_year_not_found') return 'سال تعلیمی پیدا نشد.';
  if (code === 'finance_financial_year_academic_year_missing_school') return 'سال تعلیمی انتخاب‌شده هنوز به مکتب معتبر وصل نشده است.';
  if (code === 'finance_financial_year_overlap') return 'بازه سال مالی با یک سال مالی دیگر تداخل دارد.';
  if (code === 'finance_financial_year_active_conflict') return 'در هر مکتب فقط یک سال مالی می‌تواند فعال باشد.';
  if (code === 'finance_financial_year_duplicate_academic_year') return 'برای این سال تعلیمی قبلاً سال مالی ثبت شده است.';
  if (code === 'finance_financial_year_duplicate_title') return 'سال مالی دیگری با همین عنوان از قبل ثبت شده است.';
  if (code === 'finance_financial_year_duplicate_code') return 'سال مالی دیگری با همین کد از قبل ثبت شده است.';
  if (code === 'finance_financial_year_not_found') return 'سال مالی پیدا نشد.';
  if (code === 'finance_financial_year_closed') return 'این سال مالی بسته شده و قابل ویرایش نیست.';
  if (code === 'finance_financial_year_date_out_of_range') return 'تاریخ انتخاب‌شده خارج از بازه سال مالی است.';
  if (code === 'finance_financial_year_close_blocked') return 'تا رفع موانع بخش مصارف، بستن سال مالی ممکن نیست.';
  if (code === 'finance_expense_category_invalid') return 'یک کتگوری رسمی و معتبر برای مصرف انتخاب کنید.';
  if (code === 'finance_expense_subcategory_invalid') return 'یک زیرکتگوری رسمی و معتبر برای مصرف انتخاب کنید.';
  if (code === 'finance_expense_review_level_invalid') return 'سطح مدیریتی شما برای بازبینی این مصرف در این مرحله مجاز نیست.';
  if (code === 'finance_expense_review_stage_invalid') return 'این مصرف در مرحله قابل بازبینی قرار ندارد.';
  if (code === 'finance_expense_already_reviewed') return 'این مرحله قبلاً توسط همین مدیر بازبینی شده است.';
  if (code === 'finance_treasury_account_invalid') return 'حساب خزانه معتبر پیدا نشد یا با سال مالی انتخابی سازگار نیست.';
  if (code === 'finance_treasury_account_inactive') return 'حساب خزانه غیرفعال است و برای ثبت جدید قابل استفاده نیست.';
  if (code === 'finance_treasury_account_type_invalid') return 'نوع حساب خزانه معتبر نیست.';
  if (code === 'finance_treasury_account_duplicate_code') return 'کد این حساب خزانه قبلاً در همین سال مالی ثبت شده است.';
  if (code === 'finance_treasury_transaction_type_invalid') return 'نوع حرکت خزانه معتبر نیست.';
  if (code === 'finance_treasury_amount_invalid') return 'مبلغ حرکت خزانه باید بیشتر از صفر باشد.';
  if (code === 'finance_treasury_source_destination_same') return 'حساب مبدا و مقصد انتقال نمی‌توانند یکسان باشند.';
  if (code === 'finance_treasury_transfer_cross_financial_year') return 'انتقال خزانه فقط بین حساب‌های همان سال مالی مجاز است.';
  if (code === 'finance_treasury_reconciliation_balance_required') return 'برای تطبیق حساب، مبلغ صورتحساب الزامی است.';
  if (Number(error?.code) === 11000) {
    if (duplicateKeys.includes('academicYearId')) return 'برای این سال تعلیمی قبلاً سال مالی ثبت شده است.';
    if (duplicateKeys.includes('title')) return 'سال مالی دیگری با همین عنوان از قبل ثبت شده است.';
    if (duplicateKeys.includes('code')) return 'سال مالی دیگری با همین کد از قبل ثبت شده است.';
    if (duplicateKeys.includes('isActive')) return 'در هر مکتب فقط یک سال مالی می‌تواند فعال باشد.';
    return 'رکورد تکراری سال مالی از قبل وجود دارد.';
  }
  if (duplicateMessage.includes('schoolId_1_academicYearId_1')) return 'برای این سال تعلیمی قبلاً سال مالی ثبت شده است.';
  if (duplicateMessage.includes('schoolId_1_title_1')) return 'سال مالی دیگری با همین عنوان از قبل ثبت شده است.';
  if (duplicateMessage.includes('schoolId_1_code_1')) return 'سال مالی دیگری با همین کد از قبل ثبت شده است.';
  if (duplicateMessage.includes('schoolId_1_isActive_1')) return 'در هر مکتب فقط یک سال مالی می‌تواند فعال باشد.';
  if (String(error?.name || '') === 'ValidationError') {
    if (error?.errors?.schoolId) return 'سال تعلیمی انتخاب‌شده به مکتب معتبر وصل نیست.';
    if (error?.errors?.academicYearId) return 'یک سال تعلیمی معتبر انتخاب کنید.';
    if (error?.errors?.title) return 'عنوان سال مالی الزامی است.';
    if (error?.errors?.startDate || error?.errors?.endDate) return 'تاریخ شروع و ختم سال مالی الزامی است.';
  }
  if (String(error?.name || '') === 'CastError') {
    const path = String(error?.path || '').trim();
    if (path === 'schoolId') return 'سال تعلیمی انتخاب‌شده به مکتب معتبر وصل نیست.';
    if (path === 'academicYearId') return 'یک سال تعلیمی معتبر انتخاب کنید.';
    if (path === 'startDate' || path === 'endDate') return 'تاریخ شروع و ختم سال مالی معتبر نیست.';
  }
  return fallback;
};

const normalizeMoneyInput = (value, fallback = 0) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;
  return Math.max(0, Number(amount.toFixed(2)));
};

async function findFinanceAcademicYearById(id = '') {
  const normalized = String(id || '').trim();
  if (!normalized) return null;
  return AcademicYear.findById(normalized);
}

async function resolveGovernmentSnapshotFinancialYear({ financialYearId = '', academicYearId = '' } = {}) {
  const normalizedFinancialYearId = String(financialYearId || '').trim();
  const normalizedAcademicYearId = String(academicYearId || '').trim();

  let financialYear = null;
  if (normalizedFinancialYearId) {
    financialYear = await FinancialYear.findById(normalizedFinancialYearId);
  }
  if (!financialYear && normalizedAcademicYearId) {
    financialYear = await FinancialYear.findOne({ academicYearId: normalizedAcademicYearId, status: { $ne: 'archived' } })
      .sort({ isActive: -1, createdAt: -1 });
  }
  if (!financialYear) {
    financialYear = await FinancialYear.findOne({ isActive: true, status: { $ne: 'archived' } }).sort({ createdAt: -1 });
  }
  if (!financialYear) {
    const error = new Error('finance_financial_year_not_found');
    error.statusCode = 404;
    throw error;
  }
  return financialYear;
}

const listFinanceClassReportItems = async (scope = {}) => {
  const filter = { status: { $ne: 'void' } };
  addFilterClause(filter, buildScopedCourseFilter(scope));

  const rows = await FinanceBill.find(filter)
    .select('classId course amountDue amountPaid')
    .lean();

  const courseIds = [...new Set(rows.map((row) => String(row.course || '')).filter(Boolean))];
  const courses = courseIds.length
    ? await Course.find({ _id: { $in: courseIds } }).select('_id title schoolClassRef').lean()
    : [];
  const courseById = new Map(courses.map((item) => [String(item._id), item]));

  const classIds = [...new Set([
    ...rows.map((row) => String(row.classId || '')).filter(Boolean),
    ...courses.map((item) => String(item.schoolClassRef || '')).filter(Boolean)
  ])];
  const schoolClasses = classIds.length
    ? await SchoolClass.find({ _id: { $in: classIds } }).select('_id title code gradeLevel section legacyCourseId').lean()
    : [];
  const classById = new Map(schoolClasses.map((item) => [String(item._id), item]));

  const grouped = new Map();
  rows.forEach((row) => {
    const compatCourse = courseById.get(String(row.course || '')) || null;
    const resolvedClassId = String(row.classId || compatCourse?.schoolClassRef || '');
    const key = resolvedClassId || String(row.course || '') || 'unscoped';

    if (!grouped.has(key)) {
      grouped.set(key, {
        classId: resolvedClassId || '',
        schoolClass: resolvedClassId ? serializeSchoolClassLite(classById.get(resolvedClassId) || { _id: resolvedClassId }) : null,
        courseId: compatCourse?._id ? String(compatCourse._id) : String(row.course || ''),
        course: compatCourse?.title || 'ØµÙ†Ù',
        bills: 0,
        due: 0,
        paid: 0,
        remaining: 0
      });
    }

    const bucket = grouped.get(key);
    bucket.bills += 1;
    bucket.due += Number(row.amountDue) || 0;
    bucket.paid += Number(row.amountPaid) || 0;
    bucket.remaining = Math.max(0, bucket.due - bucket.paid);
    if (!bucket.schoolClass && resolvedClassId) {
      bucket.schoolClass = serializeSchoolClassLite(classById.get(resolvedClassId) || { _id: resolvedClassId });
    }
  });

  return [...grouped.values()].sort((left, right) => (Number(right.due) || 0) - (Number(left.due) || 0));
};

const serializeExpenseCategoryDefinition = (value = null) => {
  if (!value) return null;
  const plain = value?.toObject ? value.toObject() : { ...(value || {}) };
  return {
    ...plain,
    createdBy: plain.createdBy?._id
      ? { _id: plain.createdBy._id, name: plain.createdBy.name || '' }
      : (plain.createdBy || null),
    updatedBy: plain.updatedBy?._id
      ? { _id: plain.updatedBy._id, name: plain.updatedBy.name || '' }
      : (plain.updatedBy || null),
    subCategories: Array.isArray(plain.subCategories)
      ? plain.subCategories.map((item) => ({
          key: item.key,
          label: item.label,
          description: item.description || '',
          isActive: item.isActive !== false,
          order: Number(item.order || 0)
        }))
      : []
  };
};

router.get('/admin/reference-data', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const [students, studentCores, studentProfiles, schoolClasses, academicYears] = await Promise.all([
      User.find({ role: 'student' }).select('name email grade').sort({ name: 1 }),
      StudentCore.find({ status: { $ne: 'archived' } }).select('userId fullName admissionNo phone email').lean(),
      StudentProfile.find({}).select('studentId family contact guardians').lean(),
      SchoolClass.find({ status: { $ne: 'archived' } })
        .select('title code gradeLevel section legacyCourseId')
        .sort({ gradeLevel: 1, section: 1, title: 1 }),
      AcademicYear.find({ status: { $ne: 'archived' } })
        .select('title code isActive isCurrent status')
        .sort({ isCurrent: -1, isActive: -1, sequence: 1, createdAt: 1 })
    ]);
    const studentCoreByUserId = new Map(
      studentCores
        .filter((item) => item?.userId)
        .map((item) => [String(item.userId), item])
    );
    const studentProfileByStudentId = new Map(
      studentProfiles
        .filter((item) => item?.studentId)
        .map((item) => [String(item.studentId), item])
    );
    const classes = schoolClasses.map((item) => buildFinanceClassOption(item));
    const academicYearOptions = academicYears.map((item) => ({
      _id: item._id,
      id: item._id,
      title: item.title || '',
      code: item.code || '',
      isActive: item.isActive === true,
      isCurrent: item.isCurrent === true,
      status: item.status || 'planning'
    }));
    const enrichedStudents = students.map((item) => {
      const core = studentCoreByUserId.get(String(item._id)) || null;
      const profile = core ? studentProfileByStudentId.get(String(core._id)) || null : null;
      const primaryGuardian = Array.isArray(profile?.guardians)
        ? profile.guardians.find((guardian) => guardian?.isPrimary) || profile.guardians[0] || null
        : null;
      return {
        _id: item._id,
        userId: item._id,
        studentId: core?._id || '',
        name: item.name || '',
        fullName: core?.fullName || item.name || '',
        email: core?.email || item.email || '',
        grade: item.grade || '',
        admissionNo: core?.admissionNo || '',
        phone: core?.phone || profile?.contact?.primaryPhone || '',
        primaryPhone: profile?.contact?.primaryPhone || core?.phone || '',
        alternatePhone: profile?.contact?.alternatePhone || '',
        guardianName: primaryGuardian?.name || profile?.family?.guardianName || '',
        guardianRelation: primaryGuardian?.relation || profile?.family?.guardianRelation || '',
        guardianPhone: primaryGuardian?.phone || '',
        fatherName: profile?.family?.fatherName || ''
      };
    });

    res.json({
      success: true,
      students: enrichedStudents,
      academicYears: academicYearOptions,
      currentAcademicYearId: academicYearOptions.find((item) => item.isCurrent || item.isActive)?._id || '',
      classes,
      courses: classes.map((item) => ({
        _id: item.courseId || item.classId,
        title: item.title,
        category: '',
        classId: item.classId,
        legacyCourseId: item.courseId || '',
        uiLabel: item.uiLabel
      }))
    });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø¯Ø±ÛŒØ§ÙØª Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ÛŒ Ù…Ø±Ø¬Ø¹ Ù…Ø§Ù„ÛŒ' });
  }
});

router.get('/admin/treasury/analytics', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const analytics = await buildTreasuryAnalytics({
      financialYearId: String(req.query?.financialYearId || '').trim(),
      academicYearId: String(req.query?.academicYearId || '').trim(),
      accountId: String(req.query?.accountId || '').trim()
    });
    return res.json({
      success: true,
      analytics
    });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت تحلیل خزانه ناموفق بود.' });
  }
});

router.post('/admin/treasury/accounts', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const financialYear = await resolveGovernmentSnapshotFinancialYear({
      financialYearId: req.body?.financialYearId,
      academicYearId: req.body?.academicYearId
    });
    assertFinancialYearWritable(financialYear);

    const item = await createTreasuryAccount({
      financialYear,
      payload: req.body || {},
      actorId: req.user.id
    });

    await logActivity({
      req,
      action: 'finance_create_treasury_account',
      targetType: 'FinanceTreasuryAccount',
      targetId: String(item?._id || ''),
      meta: {
        financialYearId: String(financialYear._id || ''),
        accountType: item?.accountType || '',
        openingBalance: Number(item?.openingBalance || 0)
      }
    });

    return res.status(201).json({
      success: true,
      item,
      message: 'حساب خزانه ثبت شد.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'ایجاد حساب خزانه ناموفق بود.')
    });
  }
});

router.patch('/admin/treasury/accounts/:id', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const account = await resolveTreasuryAccountSelection({
      accountId: req.params.id,
      allowInactive: true
    });
    const financialYear = await FinancialYear.findById(account.financialYearId);
    assertFinancialYearWritable(financialYear);

    const item = await updateTreasuryAccount({
      account,
      payload: req.body || {},
      actorId: req.user.id
    });

    await logActivity({
      req,
      action: 'finance_update_treasury_account',
      targetType: 'FinanceTreasuryAccount',
      targetId: String(item?._id || ''),
      meta: {
        financialYearId: String(financialYear?._id || ''),
        accountType: item?.accountType || '',
        isActive: item?.isActive !== false
      }
    });

    return res.json({
      success: true,
      item,
      message: 'حساب خزانه ویرایش شد.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'ویرایش حساب خزانه ناموفق بود.')
    });
  }
});

router.post('/admin/treasury/transactions', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const account = await resolveTreasuryAccountSelection({
      accountId: req.body?.accountId
    });
    const financialYear = await FinancialYear.findById(account.financialYearId);
    assertFinancialYearWritable(financialYear);

    const item = await createTreasuryManualTransaction({
      financialYear,
      account,
      payload: req.body || {},
      actorId: req.user.id
    });

    await logActivity({
      req,
      action: 'finance_create_treasury_transaction',
      targetType: 'FinanceTreasuryTransaction',
      targetId: String(item?._id || ''),
      meta: {
        accountId: String(item?.accountId || ''),
        transactionType: item?.transactionType || '',
        amount: Number(item?.amount || 0)
      }
    });

    return res.status(201).json({
      success: true,
      item,
      message: 'حرکت خزانه ثبت شد.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'ثبت حرکت خزانه ناموفق بود.')
    });
  }
});

router.post('/admin/treasury/transfers', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const sourceAccount = await resolveTreasuryAccountSelection({
      accountId: req.body?.sourceAccountId
    });
    const destinationAccount = await resolveTreasuryAccountSelection({
      accountId: req.body?.destinationAccountId
    });
    const financialYear = await FinancialYear.findById(sourceAccount.financialYearId);
    assertFinancialYearWritable(financialYear);

    const result = await createTreasuryTransfer({
      financialYear,
      sourceAccount,
      destinationAccount,
      payload: req.body || {},
      actorId: req.user.id
    });

    await logActivity({
      req,
      action: 'finance_create_treasury_transfer',
      targetType: 'FinanceTreasuryTransaction',
      targetId: String(result?.transactionGroupKey || ''),
      meta: {
        sourceAccountId: String(sourceAccount?._id || ''),
        destinationAccountId: String(destinationAccount?._id || ''),
        amount: Number(req.body?.amount || 0)
      }
    });

    return res.status(201).json({
      success: true,
      ...result,
      message: 'انتقال بین حساب‌های خزانه ثبت شد.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'ثبت انتقال خزانه ناموفق بود.')
    });
  }
});

router.post('/admin/treasury/accounts/:id/reconcile', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const account = await resolveTreasuryAccountSelection({
      accountId: req.params.id,
      allowInactive: true
    });
    const financialYear = await FinancialYear.findById(account.financialYearId);
    assertFinancialYearWritable(financialYear);

    const result = await reconcileTreasuryAccount({
      account,
      payload: req.body || {},
      actorId: req.user.id
    });

    await logActivity({
      req,
      action: 'finance_reconcile_treasury_account',
      targetType: 'FinanceTreasuryAccount',
      targetId: String(account?._id || ''),
      meta: {
        statementBalance: Number(result?.statementBalance || 0),
        variance: Number(result?.variance || 0),
        adjustmentId: String(result?.adjustment?._id || '')
      }
    });

    return res.json({
      success: true,
      ...result,
      message: 'تطبیق حساب خزانه ثبت شد.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'تطبیق حساب خزانه ناموفق بود.')
    });
  }
});

router.get('/admin/expense-categories', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await ensureDefaultExpenseCategories();
    return res.json({
      success: true,
      items: items.map((item) => serializeExpenseCategoryDefinition(item))
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load official expense categories.' });
  }
});

router.post('/admin/expense-categories', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const payload = req.body || {};
    const key = normalizeExpenseCategoryKey(payload.key || payload.label || 'other');
    const exists = await ExpenseCategoryDefinition.findOne({ key });
    if (exists) {
      return res.status(409).json({ success: false, message: 'کلید این دسته‌بندی مصرف قبلاً ثبت شده است.' });
    }

    const item = await ExpenseCategoryDefinition.create({
      key,
      label: String(payload.label || key).trim(),
      description: String(payload.description || '').trim(),
      colorTone: String(payload.colorTone || 'teal').trim() || 'teal',
      isActive: parseBooleanInput(payload.isActive, true),
      isSystem: false,
      order: Number(payload.order || 0),
      subCategories: Array.isArray(payload.subCategories) ? payload.subCategories : [],
      createdBy: req.user.id,
      updatedBy: req.user.id
    });

    const saved = await ExpenseCategoryDefinition.findById(item._id)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    await logActivity({
      req,
      action: 'finance_create_expense_category',
      targetType: 'ExpenseCategoryDefinition',
      targetId: item._id.toString(),
      meta: { key }
    });

    return res.status(201).json({
      success: true,
      item: serializeExpenseCategoryDefinition(saved),
      message: 'دسته‌بندی مصرف ثبت شد.'
    });
  } catch {
    return res.status(500).json({ success: false, message: 'ایجاد دسته‌بندی مصرف ناموفق بود.' });
  }
});

router.patch('/admin/expense-categories/:id', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await ExpenseCategoryDefinition.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'دسته‌بندی مصرف پیدا نشد.' });
    }

    const payload = req.body || {};
    if (!item.isSystem && String(payload.key || '').trim()) {
      const nextKey = normalizeExpenseCategoryKey(payload.key, item.key);
      if (nextKey !== item.key) {
        const exists = await ExpenseCategoryDefinition.findOne({ key: nextKey, _id: { $ne: item._id } });
        if (exists) {
          return res.status(409).json({ success: false, message: 'کلید این دسته‌بندی مصرف قبلاً ثبت شده است.' });
        }
        item.key = nextKey;
      }
    }

    item.label = String(payload.label ?? item.label ?? '').trim() || item.key;
    item.description = String(payload.description ?? item.description ?? '').trim();
    item.colorTone = String(payload.colorTone ?? item.colorTone ?? 'teal').trim() || 'teal';
    item.isActive = parseBooleanInput(payload.isActive, item.isActive !== false);
    item.order = Number.isFinite(Number(payload.order)) ? Number(payload.order) : item.order;
    if (Array.isArray(payload.subCategories)) {
      item.subCategories = payload.subCategories;
    }
    item.updatedBy = req.user.id;
    await item.save();

    const saved = await ExpenseCategoryDefinition.findById(item._id)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    await logActivity({
      req,
      action: 'finance_update_expense_category',
      targetType: 'ExpenseCategoryDefinition',
      targetId: item._id.toString(),
      meta: { key: item.key }
    });

    return res.json({
      success: true,
      item: serializeExpenseCategoryDefinition(saved),
      message: 'دسته‌بندی مصرف ویرایش شد.'
    });
  } catch {
    return res.status(500).json({ success: false, message: 'ویرایش دسته‌بندی مصرف ناموفق بود.' });
  }
});

router.get('/admin/financial-years', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const filter = {};
    const academicYearId = String(req.query?.academicYearId || '').trim();
    const status = String(req.query?.status || '').trim();
    if (academicYearId) filter.academicYearId = academicYearId;
    if (status) filter.status = status;
    if (parseBooleanInput(req.query?.activeOnly, false)) filter.isActive = true;

    const items = await FinancialYear.find(filter)
      .populate('academicYearId', 'title code startDate endDate')
      .populate('closedBy', 'name')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ isActive: -1, createdAt: -1 });

    return res.json({
      success: true,
      items: items.map((item) => serializeFinancialYear(item))
    });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت سال‌های مالی ناموفق بود.' });
  }
});

router.post('/admin/financial-years', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const payload = req.body || {};
    const academicYear = await resolveAcademicYearFinancialContext(String(payload.academicYearId || '').trim());
    const { startDate, endDate } = assertFinancialYearDates({
      startDate: payload.startDate || academicYear.startDate,
      endDate: payload.endDate || academicYear.endDate
    });
    const title = String(payload.title || academicYear.title || '').trim();
    const code = String(payload.code || academicYear.code || '').trim();
    const isActive = parseBooleanInput(payload.isActive, false);
    if (isActive) {
      await ensureSingleActiveFinancialYear({ schoolId: academicYear.schoolId });
    }
    await ensureFinancialYearUniqueness({
      schoolId: academicYear.schoolId,
      academicYearId: academicYear._id,
      title,
      code
    });
    await ensureFinancialYearNoOverlap({
      schoolId: academicYear.schoolId,
      startDate,
      endDate
    });

    const item = await FinancialYear.create({
      schoolId: academicYear.schoolId,
      academicYearId: academicYear._id,
      code,
      title,
      startDate,
      endDate,
      startDateLocal: String(payload.startDateLocal || academicYear.startDateLocal || '').trim(),
      endDateLocal: String(payload.endDateLocal || academicYear.endDateLocal || '').trim(),
      dailyFeePercent: normalizeMoneyInput(payload.dailyFeePercent, 0),
      yearlyFeePercent: normalizeMoneyInput(payload.yearlyFeePercent, 0),
      note: String(payload.note || '').trim(),
      isActive,
      status: isActive ? 'active' : 'planning',
      createdBy: req.user.id,
      updatedBy: req.user.id
    });

    const saved = await FinancialYear.findById(item._id)
      .populate('academicYearId', 'title code startDate endDate')
      .populate('closedBy', 'name')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    await logActivity({
      req,
      action: 'finance_create_financial_year',
      targetType: 'FinancialYear',
      targetId: item._id.toString(),
      meta: {
        academicYearId: String(academicYear._id),
        isActive
      }
    });

    return res.status(201).json({
      success: true,
      item: serializeFinancialYear(saved),
      message: 'سال مالی ثبت شد.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'ایجاد سال مالی ناموفق بود.')
    });
  }
});

router.patch('/admin/financial-years/:id', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const payload = req.body || {};
    const item = await FinancialYear.findById(req.params.id);
    assertFinancialYearWritable(item);

    const academicYear = payload.academicYearId
      ? await resolveAcademicYearFinancialContext(String(payload.academicYearId || '').trim())
      : await resolveAcademicYearFinancialContext(String(item.academicYearId || '').trim());

    const { startDate, endDate } = assertFinancialYearDates({
      startDate: payload.startDate || item.startDate || academicYear.startDate,
      endDate: payload.endDate || item.endDate || academicYear.endDate
    });
    const code = String(payload.code ?? item.code ?? academicYear.code ?? '').trim();
    const title = String(payload.title ?? item.title ?? academicYear.title ?? '').trim();

    await ensureFinancialYearUniqueness({
      schoolId: academicYear.schoolId,
      academicYearId: academicYear._id,
      title,
      code,
      excludeId: item._id
    });
    await ensureFinancialYearNoOverlap({
      schoolId: academicYear.schoolId,
      startDate,
      endDate,
      excludeId: item._id
    });

    item.schoolId = academicYear.schoolId;
    item.academicYearId = academicYear._id;
    item.code = code;
    item.title = title;
    item.startDate = startDate;
    item.endDate = endDate;
    item.startDateLocal = String(payload.startDateLocal ?? item.startDateLocal ?? academicYear.startDateLocal ?? '').trim();
    item.endDateLocal = String(payload.endDateLocal ?? item.endDateLocal ?? academicYear.endDateLocal ?? '').trim();
    item.dailyFeePercent = normalizeMoneyInput(payload.dailyFeePercent, item.dailyFeePercent);
    item.yearlyFeePercent = normalizeMoneyInput(payload.yearlyFeePercent, item.yearlyFeePercent);
    item.note = String(payload.note ?? item.note ?? '').trim();
    if (String(payload.status || '').trim() && payload.status !== 'active' && payload.status !== 'closed') {
      item.status = payload.status;
    }
    item.updatedBy = req.user.id;
    await item.save();

    const saved = await FinancialYear.findById(item._id)
      .populate('academicYearId', 'title code startDate endDate')
      .populate('closedBy', 'name')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    await logActivity({
      req,
      action: 'finance_update_financial_year',
      targetType: 'FinancialYear',
      targetId: item._id.toString(),
      meta: {
        academicYearId: String(academicYear._id)
      }
    });

    return res.json({
      success: true,
      item: serializeFinancialYear(saved),
      message: 'Financial year updated.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'ویرایش سال مالی ناموفق بود.')
    });
  }
});

router.post('/admin/financial-years/:id/activate', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await FinancialYear.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Financial year not found.' });
    }
    if (item.isClosed || item.status === 'closed') {
      return res.status(409).json({ success: false, message: 'سال مالی بسته‌شده قابل فعال‌سازی نیست.' });
    }

    await FinancialYear.updateMany(
      { schoolId: item.schoolId, _id: { $ne: item._id }, isActive: true },
      { $set: { isActive: false, status: 'planning', updatedBy: req.user.id } }
    );

    item.isActive = true;
    item.status = 'active';
    item.updatedBy = req.user.id;
    await item.save();

    const saved = await FinancialYear.findById(item._id)
      .populate('academicYearId', 'title code startDate endDate')
      .populate('closedBy', 'name')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    await logActivity({
      req,
      action: 'finance_activate_financial_year',
      targetType: 'FinancialYear',
      targetId: item._id.toString(),
      meta: {
        academicYearId: String(item.academicYearId || '')
      }
    });

    return res.json({
      success: true,
      item: serializeFinancialYear(saved),
      message: 'سال مالی فعال شد.'
    });
  } catch {
    return res.status(500).json({ success: false, message: 'فعال‌سازی سال مالی ناموفق بود.' });
  }
});

router.get('/admin/financial-years/:id/close-readiness', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await FinancialYear.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Financial year not found.' });
    }

    const readiness = await buildFinancialYearCloseReadiness({ financialYearId: String(item._id) });
    return res.json({
      success: true,
      item: serializeFinancialYear(item),
      readiness
    });
  } catch {
    return res.status(500).json({ success: false, message: 'بررسی آمادگی بستن سال مالی ناموفق بود.' });
  }
});

router.post('/admin/financial-years/:id/close', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await FinancialYear.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Financial year not found.' });
    }
    if (item.isClosed || item.status === 'closed') {
      const current = await FinancialYear.findById(item._id)
        .populate('academicYearId', 'title code startDate endDate')
        .populate('closedBy', 'name')
        .populate('createdBy', 'name')
        .populate('updatedBy', 'name');
      return res.json({
        success: true,
        item: serializeFinancialYear(current),
        message: 'Financial year was already closed.'
      });
    }

    const readiness = await buildFinancialYearCloseReadiness({ financialYearId: String(item._id) });
    if (readiness && !readiness.canClose) {
      return res.status(409).json({
        success: false,
        code: 'finance_financial_year_close_blocked',
        readiness,
        message: resolveFinancialYearMessage({ message: 'finance_financial_year_close_blocked' })
      });
    }

    item.isClosed = true;
    item.isActive = false;
    item.status = 'closed';
    item.closedAt = new Date();
    item.closedBy = req.user.id;
    item.updatedBy = req.user.id;
    if (String(req.body?.note || '').trim()) {
      item.note = String(req.body.note).trim();
    }
    await item.save();

    const saved = await FinancialYear.findById(item._id)
      .populate('academicYearId', 'title code startDate endDate')
      .populate('closedBy', 'name')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    await logActivity({
      req,
      action: 'finance_close_financial_year',
      targetType: 'FinancialYear',
      targetId: item._id.toString(),
      meta: {
        academicYearId: String(item.academicYearId || '')
      }
    });

    return res.json({
      success: true,
      item: serializeFinancialYear(saved),
      message: 'سال مالی بسته شد.'
    });
  } catch {
    return res.status(500).json({ success: false, message: 'بستن سال مالی ناموفق بود.' });
  }
});

router.get('/admin/expenses/analytics', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const { classId = '', courseId = '', financialYearId = '', academicYearId = '' } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/expenses/analytics?classId=${scope.classId}`);
    }

    const analytics = await buildExpenseGovernanceAnalytics({
      financialYearId: String(financialYearId || '').trim(),
      academicYearId: String(academicYearId || '').trim(),
      classId: scope.classId || ''
    });

    return res.json({
      success: true,
      analytics
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load expense governance analytics.' });
  }
});

const submitExpenseEntryForReview = (item, actorId = '', note = '') => {
  if (!item) return;
  item.status = 'pending_review';
  item.approvalStage = EXPENSE_APPROVAL_STAGES.financeManager;
  item.submittedBy = actorId || item.submittedBy || null;
  item.submittedAt = item.submittedAt || new Date();
  item.rejectedBy = null;
  item.rejectedAt = null;
  item.rejectReason = '';
  item.updatedBy = actorId || item.updatedBy || null;
  appendExpenseApprovalTrail(item, {
    level: 'finance_manager',
    action: 'submit',
    by: actorId,
    note: note || 'Submitted for expense review.'
  });
};

const reviewExpenseEntryTransition = ({
  item,
  actorId = '',
  actorLevel = '',
  action = 'approve',
  note = '',
  reason = ''
} = {}) => {
  if (!item) {
    const error = new Error('finance_expense_review_stage_invalid');
    error.statusCode = 409;
    throw error;
  }

  const currentStage = normalizeExpenseApprovalStage(item.approvalStage);
  if (!OPEN_EXPENSE_APPROVAL_STAGES.includes(currentStage)) {
    const error = new Error('finance_expense_review_stage_invalid');
    error.statusCode = 409;
    throw error;
  }
  if (!canReviewExpenseStage(actorLevel, currentStage)) {
    const error = new Error('finance_expense_review_level_invalid');
    error.statusCode = 403;
    throw error;
  }
  if (actorAlreadyReviewedExpense(item.approvalTrail, actorId)) {
    const error = new Error('finance_expense_already_reviewed');
    error.statusCode = 409;
    throw error;
  }

  const normalizedLevel = normalizeAdminLevel(actorLevel || '');
  const normalizedAction = String(action || 'approve').trim().toLowerCase() === 'reject'
    ? 'reject'
    : 'approve';

  if (normalizedAction === 'reject') {
    item.status = 'rejected';
    item.approvalStage = EXPENSE_APPROVAL_STAGES.rejected;
    item.rejectedBy = actorId || null;
    item.rejectedAt = new Date();
    item.rejectReason = String(reason || '').trim();
    item.updatedBy = actorId || null;
    appendExpenseApprovalTrail(item, {
      level: normalizedLevel,
      action: 'reject',
      by: actorId,
      note,
      reason
    });
    return {
      nextStage: EXPENSE_APPROVAL_STAGES.rejected,
      completed: false
    };
  }

  const nextStage = getNextExpenseStage(normalizedLevel, currentStage);
  if (!nextStage) {
    const error = new Error('finance_expense_review_stage_invalid');
    error.statusCode = 409;
    throw error;
  }

  item.updatedBy = actorId || null;
  appendExpenseApprovalTrail(item, {
    level: normalizedLevel,
    action: 'approve',
    by: actorId,
    note
  });

  if (nextStage === EXPENSE_APPROVAL_STAGES.completed) {
    item.status = 'approved';
    item.approvalStage = EXPENSE_APPROVAL_STAGES.completed;
    item.approvedBy = actorId || null;
    item.approvedAt = new Date();
    return {
      nextStage,
      completed: true
    };
  }

  item.status = 'pending_review';
  item.approvalStage = nextStage;
  return {
    nextStage,
    completed: false
  };
};

router.get('/admin/expenses', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const { classId = '', courseId = '', financialYearId = '', academicYearId = '', status = '', stage = '' } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/expenses?classId=${scope.classId}`);
    }

    const filter = {};
    if (String(financialYearId || '').trim()) filter.financialYearId = String(financialYearId).trim();
    if (String(academicYearId || '').trim()) filter.academicYearId = String(academicYearId).trim();
    if (String(status || '').trim()) filter.status = String(status).trim();
    if (String(stage || '').trim()) filter.approvalStage = normalizeExpenseApprovalStage(stage);
    if (scope.classId) filter.classId = scope.classId;

    const items = await ExpenseEntry.find(filter)
      .populate('treasuryAccountId', 'title code accountType currency isActive')
      .populate('financialYearId', 'title status isClosed')
      .populate('academicYearId', 'title code')
      .populate('classId', 'title code gradeLevel section')
      .populate('approvalTrail.by', 'name')
      .populate('createdBy', 'name')
      .populate('submittedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('rejectedBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ expenseDate: -1, createdAt: -1 });

    return res.json({
      success: true,
      items: items.map((item) => serializeExpenseEntry(item))
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load expenses.' });
  }
});

router.post('/admin/expenses', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const payload = req.body || {};
    const scope = await resolveFinanceScope({
      classId: payload.classId,
      courseId: payload.courseId
    });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });

    const financialYearId = String(payload.financialYearId || '').trim();
    const financialYear = financialYearId
      ? await FinancialYear.findById(financialYearId)
      : await FinancialYear.findOne({ academicYearId: payload.academicYearId, status: { $ne: 'archived' } }).sort({ isActive: -1, createdAt: -1 });

    assertFinancialYearWritable(financialYear);

    const expenseDate = parseDateSafe(payload.expenseDate, null);
    assertDateWithinFinancialYear(financialYear, expenseDate);
    const categorySelection = await resolveExpenseCategorySelection({
      category: payload.category,
      subCategory: payload.subCategory
    });
    const treasuryAccount = await resolveTreasuryAccountSelection({
      accountId: payload.treasuryAccountId,
      schoolId: financialYear.schoolId,
      financialYearId: financialYear._id,
      academicYearId: financialYear.academicYearId
    });
    const requestedStatus = String(payload.status || '').trim().toLowerCase() === 'pending_review'
      ? 'pending_review'
      : 'draft';
    const item = await ExpenseEntry.create({
      schoolId: financialYear.schoolId,
      financialYearId: financialYear._id,
      academicYearId: financialYear.academicYearId,
      classId: scope.classId || null,
      category: categorySelection.category,
      subCategory: categorySelection.subCategory,
      amount: normalizeMoneyInput(payload.amount, 0),
      currency: String(payload.currency || 'AFN').trim().toUpperCase() || 'AFN',
      expenseDate,
      periodQuarter: resolveQuarterForDate(financialYear, expenseDate),
      paymentMethod: String(payload.paymentMethod || 'manual').trim() || 'manual',
      treasuryAccountId: treasuryAccount?._id || null,
      vendorName: String(payload.vendorName || '').trim(),
      referenceNo: String(payload.referenceNo || '').trim(),
      note: String(payload.note || '').trim(),
      status: requestedStatus,
      approvalStage: requestedStatus === 'pending_review'
        ? EXPENSE_APPROVAL_STAGES.financeManager
        : EXPENSE_APPROVAL_STAGES.draft,
      submittedBy: requestedStatus === 'pending_review' ? req.user.id : null,
      submittedAt: requestedStatus === 'pending_review' ? new Date() : null,
      createdBy: req.user.id,
      updatedBy: req.user.id,
      approvalTrail: requestedStatus === 'pending_review'
        ? [{
            level: 'finance_manager',
            action: 'submit',
            by: req.user.id,
            at: new Date(),
            note: 'Submitted from expense command center.',
            reason: ''
          }]
        : []
    });

    const saved = await populateExpenseEntryQuery(ExpenseEntry.findById(item._id));

    await logActivity({
      req,
      action: 'finance_create_expense_entry',
      targetType: 'ExpenseEntry',
      targetId: item._id.toString(),
      meta: {
        financialYearId: String(financialYear._id),
        classId: scope.classId || '',
        amount: Number(item.amount || 0),
        status: requestedStatus
      }
    });

    return res.status(201).json({
      success: true,
      item: serializeExpenseEntry(saved),
      message: 'مصرف ثبت شد.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'ایجاد مصرف ناموفق بود.')
    });
  }
});

router.patch('/admin/expenses/:id', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const payload = req.body || {};
    const item = await ExpenseEntry.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'رکورد مصرف پیدا نشد.' });
    if (['pending_review', 'approved', 'void'].includes(String(item.status || '').trim())) {
      return res.status(409).json({
        success: false,
        message: 'فقط مصرف‌های پیش‌نویس یا ردشده قابل ویرایش هستند.'
      });
    }

    const scope = await resolveFinanceScope({
      classId: payload.classId || item.classId,
      courseId: payload.courseId
    });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });

    const financialYear = payload.financialYearId
      ? await FinancialYear.findById(String(payload.financialYearId || '').trim())
      : await FinancialYear.findById(item.financialYearId);
    assertFinancialYearWritable(financialYear);

    const expenseDate = parseDateSafe(payload.expenseDate || item.expenseDate, null);
    assertDateWithinFinancialYear(financialYear, expenseDate);
    const categorySelection = await resolveExpenseCategorySelection({
      category: payload.category ?? item.category,
      subCategory: payload.subCategory ?? item.subCategory
    });
    if (Object.prototype.hasOwnProperty.call(payload, 'treasuryAccountId')) {
      const treasuryAccount = await resolveTreasuryAccountSelection({
        accountId: payload.treasuryAccountId,
        schoolId: financialYear.schoolId,
        financialYearId: financialYear._id,
        academicYearId: financialYear.academicYearId
      });
      item.treasuryAccountId = treasuryAccount?._id || null;
    }

    item.schoolId = financialYear.schoolId;
    item.financialYearId = financialYear._id;
    item.academicYearId = financialYear.academicYearId;
    item.classId = scope.classId || null;
    item.category = categorySelection.category;
    item.subCategory = categorySelection.subCategory;
    item.amount = normalizeMoneyInput(payload.amount, item.amount);
    item.currency = String(payload.currency ?? item.currency ?? 'AFN').trim().toUpperCase() || 'AFN';
    item.expenseDate = expenseDate;
    item.periodQuarter = resolveQuarterForDate(financialYear, expenseDate);
    item.paymentMethod = String(payload.paymentMethod ?? item.paymentMethod ?? 'manual').trim() || 'manual';
    item.vendorName = String(payload.vendorName ?? item.vendorName ?? '').trim();
    item.referenceNo = String(payload.referenceNo ?? item.referenceNo ?? '').trim();
    item.note = String(payload.note ?? item.note ?? '').trim();
    item.updatedBy = req.user.id;
    await item.save();

    const saved = await populateExpenseEntryQuery(ExpenseEntry.findById(item._id));

    await logActivity({
      req,
      action: 'finance_update_expense_entry',
      targetType: 'ExpenseEntry',
      targetId: item._id.toString(),
      meta: {
        financialYearId: String(financialYear._id),
        classId: scope.classId || '',
        amount: Number(item.amount || 0),
        status: item.status || ''
      }
    });

    return res.json({
      success: true,
      item: serializeExpenseEntry(saved),
      message: 'مصرف ویرایش شد.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'ویرایش مصرف ناموفق بود.')
    });
  }
});

router.post('/admin/expenses/:id/submit', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await ExpenseEntry.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'رکورد مصرف پیدا نشد.' });

    const financialYear = await FinancialYear.findById(item.financialYearId);
    assertFinancialYearWritable(financialYear);

    if (item.status === 'approved' || item.status === 'void') {
      return res.status(409).json({ success: false, message: 'مصرف تاییدشده یا باطل دوباره برای بررسی فرستاده نمی‌شود.' });
    }

    submitExpenseEntryForReview(item, req.user.id, String(req.body?.note || '').trim());
    await item.save();

    const saved = await populateExpenseEntryQuery(ExpenseEntry.findById(item._id));

    await logActivity({
      req,
      action: 'finance_submit_expense_entry',
      targetType: 'ExpenseEntry',
      targetId: item._id.toString(),
      meta: {
        financialYearId: String(item.financialYearId || ''),
        amount: Number(item.amount || 0),
        stage: item.approvalStage || ''
      }
    });

    return res.json({
      success: true,
      item: serializeExpenseEntry(saved),
      nextStage: item.approvalStage,
      message: 'مصرف برای بررسی ارسال شد.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'ارسال مصرف برای بررسی ناموفق بود.')
    });
  }
});

router.post('/admin/expenses/:id/review', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await ExpenseEntry.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'رکورد مصرف پیدا نشد.' });

    const financialYear = await FinancialYear.findById(item.financialYearId);
    assertFinancialYearWritable(financialYear);

    const actorLevel = await resolveAdminActorLevel(req.user.id);
    const outcome = reviewExpenseEntryTransition({
      item,
      actorId: req.user.id,
      actorLevel,
      action: req.body?.action,
      note: String(req.body?.note || '').trim(),
      reason: String(req.body?.reason || '').trim()
    });
    await item.save();

    const saved = await populateExpenseEntryQuery(ExpenseEntry.findById(item._id));

    await logActivity({
      req,
      action: req.body?.action === 'reject' ? 'finance_reject_expense_entry' : 'finance_review_expense_entry',
      targetType: 'ExpenseEntry',
      targetId: item._id.toString(),
      meta: {
        financialYearId: String(item.financialYearId || ''),
        amount: Number(item.amount || 0),
        nextStage: outcome.nextStage || '',
        actorLevel
      }
    });

    return res.json({
      success: true,
      item: serializeExpenseEntry(saved),
      nextStage: outcome.nextStage,
      message: req.body?.action === 'reject'
        ? 'مصرف رد شد.'
        : (outcome.completed ? 'مصرف به‌صورت کامل تایید شد.' : 'مصرف به مرحله بعدی بررسی منتقل شد.')
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'بررسی مصرف ناموفق بود.')
    });
  }
});

router.post('/admin/expenses/:id/approve', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await ExpenseEntry.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'رکورد مصرف پیدا نشد.' });

    const financialYear = await FinancialYear.findById(item.financialYearId);
    assertFinancialYearWritable(financialYear);

    if (item.status === 'draft' || item.status === 'rejected') {
      submitExpenseEntryForReview(item, req.user.id, 'Submitted through legacy approve shortcut.');
    }

    const actorLevel = await resolveAdminActorLevel(req.user.id);
    const outcome = reviewExpenseEntryTransition({
      item,
      actorId: req.user.id,
      actorLevel,
      action: 'approve',
      note: String(req.body?.note || '').trim()
    });
    await item.save();

    const saved = await populateExpenseEntryQuery(ExpenseEntry.findById(item._id));

    await logActivity({
      req,
      action: 'finance_approve_expense_entry',
      targetType: 'ExpenseEntry',
      targetId: item._id.toString(),
      meta: {
        financialYearId: String(item.financialYearId || ''),
        amount: Number(item.amount || 0),
        nextStage: outcome.nextStage || '',
        actorLevel
      }
    });

    return res.json({
      success: true,
      item: serializeExpenseEntry(saved),
      nextStage: outcome.nextStage,
      message: outcome.completed
        ? 'مصرف به‌صورت کامل تایید شد.'
        : 'مصرف به مرحله بعدی بررسی منتقل شد.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'تایید مصرف ناموفق بود.')
    });
  }
});

router.post('/admin/expenses/:id/void', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await ExpenseEntry.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'رکورد مصرف پیدا نشد.' });

    const financialYear = await FinancialYear.findById(item.financialYearId);
    assertFinancialYearWritable(financialYear);
    item.status = 'void';
    item.approvalStage = EXPENSE_APPROVAL_STAGES.void;
    item.updatedBy = req.user.id;
    appendExpenseApprovalTrail(item, {
      level: normalizeAdminLevel(await resolveAdminActorLevel(req.user.id)),
      action: 'void',
      by: req.user.id,
      note: String(req.body?.note || '').trim()
    });
    await item.save();

    const saved = await populateExpenseEntryQuery(ExpenseEntry.findById(item._id));

    await logActivity({
      req,
      action: 'finance_void_expense_entry',
      targetType: 'ExpenseEntry',
      targetId: item._id.toString(),
      meta: {
        financialYearId: String(item.financialYearId || ''),
        amount: Number(item.amount || 0)
      }
    });

    return res.json({
      success: true,
      item: serializeExpenseEntry(saved),
      message: 'مصرف باطل شد.'
    });
  } catch (error) {
    return res.status(resolveFinancialYearErrorStatus(error)).json({
      success: false,
      message: resolveFinancialYearMessage(error, 'باطل‌سازی مصرف ناموفق بود.')
    });
  }
});

router.get('/admin/government-snapshots', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const filter = {};
    const financialYearId = String(req.query?.financialYearId || '').trim();
    const academicYearId = String(req.query?.academicYearId || '').trim();
    const classId = String(req.query?.classId || '').trim();
    const reportType = String(req.query?.reportType || '').trim().toLowerCase();
    const quarter = Math.max(0, Math.min(4, Number(req.query?.quarter) || 0));

    if (financialYearId) filter.financialYearId = financialYearId;
    if (academicYearId) filter.academicYearId = academicYearId;
    if (classId) filter.classId = classId;
    if (reportType) filter.reportType = normalizeGovernmentSnapshotType(reportType);
    if (quarter) filter.quarter = quarter;

    const items = await GovernmentFinanceSnapshot.find(filter)
      .populate('financialYearId', 'title code status isActive isClosed')
      .populate('academicYearId', 'title code')
      .populate('classId', 'title code gradeLevel section')
      .populate('generatedBy', 'name')
      .sort({ generatedAt: -1, version: -1 });

    return res.json({
      success: true,
      items: items.map((item) => serializeGovernmentFinanceSnapshot(item))
    });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت آرشیف مالی دولت ناموفق بود.' });
  }
});

router.post('/admin/government-snapshots', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const payload = req.body || {};
    const reportType = normalizeGovernmentSnapshotType(payload.reportType);
    const quarter = reportType === 'quarterly'
      ? Math.max(1, Math.min(4, Number(payload.quarter) || 1))
      : null;
    const classId = String(payload.classId || '').trim() || null;

    const financialYear = await resolveGovernmentSnapshotFinancialYear({
      financialYearId: payload.financialYearId,
      academicYearId: payload.academicYearId
    });

    const filters = {
      financialYearId: String(financialYear._id),
      academicYearId: String(financialYear.academicYearId || ''),
      classId: classId || '',
      quarter: quarter || undefined
    };
    if (!classId) delete filters.classId;
    if (!quarter) delete filters.quarter;

    const reportKey = resolveGovernmentReportKey(reportType);
    const report = await runReport(reportKey, filters);

    const latest = await GovernmentFinanceSnapshot.findOne({
      financialYearId: financialYear._id,
      reportType,
      quarter: quarter || null,
      classId: classId || null
    }).sort({ version: -1 });

    const version = Number(latest?.version || 0) + 1;
    const sourceDigest = crypto
      .createHash('sha1')
      .update(JSON.stringify({
        reportKey,
        filters,
        summary: report?.summary || {},
        rowCount: Array.isArray(report?.rows) ? report.rows.length : 0
      }))
      .digest('hex');

    const snapshot = await GovernmentFinanceSnapshot.create({
      schoolId: financialYear.schoolId,
      financialYearId: financialYear._id,
      academicYearId: financialYear.academicYearId,
      reportType,
      quarter: quarter || null,
      classId: classId || null,
      reportKey,
      title: report?.report?.title || reportKey,
      filters,
      columns: Array.isArray(report?.columns) ? report.columns : [],
      summary: report?.summary || {},
      rows: Array.isArray(report?.rows) ? report.rows : [],
      sourceDigest,
      version,
      isOfficial: parseBooleanInput(payload.isOfficial, true),
      generatedAt: new Date(),
      generatedBy: req.user.id
    });

    const saved = await GovernmentFinanceSnapshot.findById(snapshot._id)
      .populate('financialYearId', 'title code status isActive isClosed')
      .populate('academicYearId', 'title code')
      .populate('classId', 'title code gradeLevel section')
      .populate('generatedBy', 'name');

    await logActivity({
      req,
      action: 'finance_generate_government_snapshot',
      targetType: 'GovernmentFinanceSnapshot',
      targetId: snapshot._id.toString(),
      meta: {
        reportType,
        reportKey,
        financialYearId: String(financialYear._id),
        classId: classId || '',
        quarter: quarter || '',
        version,
        rowCount: Array.isArray(report?.rows) ? report.rows.length : 0
      }
    });

    return res.status(201).json({
      success: true,
      item: serializeGovernmentFinanceSnapshot(saved),
      report,
      message: 'Government finance snapshot generated.'
    });
  } catch (error) {
    const code = String(error?.message || '');
    const status = Number(error?.statusCode || (code.startsWith('report_') ? 400 : 500));
    return res.status(status).json({
      success: false,
      message: resolveFinancialYearMessage(error, code || 'Failed to generate government finance snapshot.')
    });
  }
});

router.get('/admin/fee-plans', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const { classId = '', courseId = '', academicYearId = '', planType = '', planCode = '' } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/fee-plans?classId=${scope.classId}`);
    }

    const filter = {};
    if (normalizeScopeText(academicYearId)) {
      filter.academicYearId = normalizeScopeText(academicYearId);
    }
    if (normalizeScopeText(planType)) {
      filter.planType = String(planType).trim().toLowerCase();
    }
    if (normalizeScopeText(planCode)) {
      filter.planCode = String(planCode).trim().toUpperCase();
    }
    addFilterClause(filter, buildScopedCourseFilter(scope));

    const items = await FinanceFeePlan.find(filter)
      .populate('course', 'title category')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code isActive isCurrent status')
      .sort({ isDefault: -1, priority: 1, updatedAt: -1, createdAt: -1 });
    res.json({ success: true, items: items.map((item) => serializeFinanceFeePlan(item)) });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø¯Ø±ÛŒØ§ÙØª Ù¾Ù„Ø§Ù†â€ŒÙ‡Ø§ÛŒ ÙÛŒØ³' });
  }
});

router.post('/admin/fee-plans', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const payload = req.body || {};
    const scope = await resolveFinanceScope({
      classId: payload.classId,
      courseId: payload.courseId
    });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(payload.courseId) && !normalizeScopeText(payload.classId)) {
      setLegacyScopeFieldHeaders(res);
    }
    const courseId = scope.courseId;
    if (!scope.classId) return res.status(400).json({ success: false, message: 'Class mapping is required for fee plans.' });
    if (!courseId) return res.status(400).json({ success: false, message: 'Ø´Ù†Ø§Ø³Ù‡ ØµÙ†Ù Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª' });

    const academicYear = await resolveAcademicYearForFeePlan({
      academicYearId: payload.academicYearId,
      academicYear: payload.academicYear,
      academicYearCode: payload.academicYearCode
    });
    if (!academicYear) {
      return res.status(400).json({ success: false, message: 'Academic year is required for canonical fee plans.' });
    }

    const planQuery = buildFeePlanIdentityFilter(payload, {
      classId: scope.classId,
      courseId,
      schoolClass: scope.schoolClass,
      academicYear
    });
    addFilterClause(planQuery, buildScopedCourseFilter(scope));

    const update = normalizeFeePlanPayload(payload, {
      classId: scope.classId,
      courseId,
      schoolClass: scope.schoolClass,
      academicYear
    });

    const item = await FinanceFeePlan.findOneAndUpdate(planQuery, { $set: update }, {
      new: true,
      upsert: true
    });

    if (update.isDefault && item?._id) {
      await FinanceFeePlan.updateMany({
        _id: { $ne: item._id },
        classId: scope.classId,
        academicYearId: update.academicYearId || null,
        term: update.term,
        billingFrequency: update.billingFrequency,
        isDefault: true
      }, {
        $set: { isDefault: false }
      });
    }

    const refreshed = await FinanceFeePlan.findById(item._id)
      .populate('course', 'title category')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code isActive isCurrent status');

    await logActivity({
      req,
      action: 'finance_upsert_fee_plan',
      targetType: 'FinanceFeePlan',
      targetId: refreshed._id.toString(),
      meta: {
        classId: scope.classId,
        courseId,
        academicYearId: String(update.academicYearId || ''),
        planCode: String(update.planCode || ''),
        planType: String(update.planType || 'standard'),
        billingFrequency: update.billingFrequency,
        tuitionFee: update.tuitionFee,
        isDefault: update.isDefault === true
      }
    });
    return res.json({
      success: true,
      item: serializeFinanceFeePlan(refreshed),
      message: 'Canonical fee plan saved successfully.'
    });

  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø°Ø®ÛŒØ±Ù‡ Ù¾Ù„Ø§Ù† ÙÛŒØ³' });
  }
});

router.get('/admin/summary', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [pendingReceipts, overdueBills, billTotals, today, monthly, topDebtorsAgg, pendingByStageAgg, reliefRows] = await Promise.all([
      FeePayment.countDocuments({ status: 'pending' }),
      FeeOrder.countDocuments({
        status: { $in: ['new', 'partial', 'overdue'] },
        dueDate: { $lt: now },
        outstandingAmount: { $gt: 0 }
      }),
      FeeOrder.aggregate([
        { $match: { status: { $ne: 'void' } } },
        {
          $group: {
            _id: null,
            totalDue: { $sum: '$amountDue' },
            totalPaid: { $sum: '$amountPaid' },
            totalOutstanding: { $sum: '$outstandingAmount' }
          }
        }
      ]),
      FeePayment.aggregate([
        { $match: { status: 'approved', paidAt: { $gte: startOfDay } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      FeePayment.aggregate([
        { $match: { status: 'approved', paidAt: { $gte: startOfMonth, $lt: endOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      FeeOrder.aggregate([
        { $match: { status: { $ne: 'void' } } },
        {
          $project: {
            student: 1,
            remaining: '$outstandingAmount'
          }
        },
        { $match: { remaining: { $gt: 0 } } },
        { $group: { _id: '$student', amount: { $sum: '$remaining' } } },
        { $sort: { amount: -1 } },
        { $limit: 10 }
      ]),
      FeePayment.aggregate([
        { $match: { status: 'pending' } },
        {
          $group: {
            _id: { $ifNull: ['$approvalStage', RECEIPT_STAGES.financeManager] },
            count: { $sum: 1 }
          }
        }
      ]),
      FinanceRelief.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: '$coverageMode',
            count: { $sum: 1 },
            total: { $sum: '$amount' }
          }
        }
      ])
    ]);

    const totalDue = billTotals[0]?.totalDue || 0;
    const totalPaid = billTotals[0]?.totalPaid || 0;
    const totalOutstanding = billTotals[0]?.totalOutstanding || 0;
    const collectionRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;
    const todayCollection = today[0]?.total || 0;
    const monthCollection = monthly[0]?.total || 0;
    const receiptWorkflow = {
      financeManager: 0,
      financeLead: 0,
      generalPresident: 0
    };
    pendingByStageAgg.forEach((row) => {
      const stage = normalizeReceiptStage(row?._id || '');
      const count = Number(row?.count || 0);
      if (stage === RECEIPT_STAGES.financeLead) {
        receiptWorkflow.financeLead += count;
      } else if (stage === RECEIPT_STAGES.generalPresident) {
        receiptWorkflow.generalPresident += count;
      } else {
        receiptWorkflow.financeManager += count;
      }
    });

    const topDebtorIds = topDebtorsAgg.map((item) => item._id).filter(Boolean);
    const debtors = await User.find({ _id: { $in: topDebtorIds } }).select('name');
    const debtorMap = new Map(debtors.map((item) => [String(item._id), item.name]));
    const reliefSummary = {
      activeReliefs: 0,
      fixedReliefAmount: 0,
      percentReliefs: 0,
      fullReliefs: 0
    };
    reliefRows.forEach((row) => {
      const mode = String(row?._id || '').trim();
      const count = Number(row?.count || 0);
      const total = Number(row?.total || 0);
      reliefSummary.activeReliefs += count;
      if (mode === 'fixed') reliefSummary.fixedReliefAmount += total;
      else if (mode === 'percent') reliefSummary.percentReliefs += count;
      else if (mode === 'full') reliefSummary.fullReliefs += count;
    });
    const topDebtors = topDebtorsAgg.map((item) => ({
      studentId: item._id,
      name: debtorMap.get(String(item._id)) || 'Student',
      amount: item.amount
    }));

    res.json({
      success: true,
      summary: {
        pendingReceipts,
        overdueBills,
        todayCollection,
        monthCollection,
        totalDue,
        totalPaid,
        totalOutstanding,
        collectionRate,
        receiptWorkflow,
        ...reliefSummary
      },
      topDebtors
    });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø¯Ø±ÛŒØ§ÙØª Ø®Ù„Ø§ØµÙ‡ Ù…Ø§Ù„ÛŒ' });
  }
});

router.get('/admin/bills', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    setDeprecatedRouteHeaders(res, '/api/student-finance/orders');
    const { status = '', studentId = '', classId = '', courseId = '', q = '', dateFrom = '', dateTo = '' } = req.query || {};

    const filter = {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (status) filter.status = status;
    if (studentId) filter.student = studentId;
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/bills?classId=${scope.classId}`);
    }
    addFilterClause(filter, buildScopedCourseFilter(scope));
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    if (q) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      addFilterClause(filter, { $or: [{ billNumber: rx }, { periodLabel: rx }, { academicYear: rx }, { term: rx }] });
    }

    const items = await FinanceBill.find(filter)
      .populate('student', 'name email grade')
      .populate('course', 'title category')
      .populate('classId', 'title code gradeLevel section')
      .sort({ createdAt: -1 })
      .limit(500);

    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø¯Ø±ÛŒØ§ÙØª Ø¨Ù„â€ŒÙ‡Ø§' });
  }
});

router.post('/admin/bills', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const { studentId, classId = '', courseId: inputCourseId = '', amount, dueDate, issuedAt, periodType, periodLabel, academicYear, term, currency, note } = req.body || {};
    if (!studentId || (!classId && !inputCourseId) || !dueDate) {
      return res.status(400).json({ success: false, message: 'Ø´Ø§Ú¯Ø±Ø¯ØŒ ØµÙ†Ù Ùˆ Ø³Ø±Ø±Ø³ÛŒØ¯ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª' });
    }
    const dueDateValue = parseDateSafe(dueDate, null);
    if (!dueDateValue) {
      return res.status(400).json({ success: false, message: 'ØªØ§Ø±ÛŒØ® Ø³Ø±Ø±Ø³ÛŒØ¯ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª' });
    }
    const issueDateValue = parseDateSafe(issuedAt, new Date());
    if (await isMonthClosed(issueDateValue)) {
      return res.status(400).json({ success: false, message: 'Ù…Ø§Ù‡ Ù…Ø§Ù„ÛŒ Ø¨Ø³ØªÙ‡ Ø´Ø¯Ù‡ Ø§Ø³Øª Ùˆ ØµØ¯ÙˆØ± Ø¨Ù„ Ø¬Ø¯ÛŒØ¯ Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª' });
    }

    const normalizedPeriodType = normalizeBillPeriodType(periodType);
    const normalizedPeriodLabel = String(periodLabel || '').trim();
    const normalizedAcademicYear = String(academicYear || '').trim();
    const normalizedTerm = String(term || '').trim();
    const scope = await resolveFinanceScope({ classId, courseId: inputCourseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (!scope.courseId) {
      return res.status(400).json({ success: false, message: 'Class mapping is required for finance bill creation.' });
    }
    if (normalizeScopeText(inputCourseId) && !normalizeScopeText(classId)) {
      setLegacyScopeFieldHeaders(res);
    }
    const courseId = scope.courseId;
    const { membership, linkFields, courseContext } = await resolveMembershipTransactionLink({
      studentUserId: studentId,
      courseId,
      academicYear: normalizedAcademicYear,
      statuses: null
    });

    if (courseContext.kind === 'academic_class' && !membership) {
      return res.status(400).json({ success: false, message: '???? ??? ???????? ?? ???? ?? ????? ???? ?? ?????? ????? ??? ????' });
    }

    const duplicateBill = await findConflictingBill({
      studentId,
      courseId,
      academicYear: normalizedAcademicYear,
      term: normalizedTerm,
      periodType: normalizedPeriodType,
      periodLabel: normalizedPeriodLabel,
      dueDate: dueDateValue
    });
    if (duplicateBill) {
      return res.status(409).json({
        success: false,
        message: `Ø¨Ù„ ØªÚ©Ø±Ø§Ø±ÛŒ Ø¨Ø±Ø§ÛŒ Ø§ÛŒÙ† ØªØ¹Ù‡Ø¯ Ù…Ø§Ù„ÛŒ Ù‚Ø¨Ù„Ø§Ù‹ Ø¨Ø§ Ø´Ù…Ø§Ø±Ù‡ ${duplicateBill.billNumber} Ø«Ø¨Øª Ø´Ø¯Ù‡ Ø§Ø³Øª`,
        duplicateBillId: duplicateBill._id
      });
    }

    const bill = new FinanceBill({
      billNumber: await generateBillNumber(),
      student: studentId,
      studentId: linkFields.studentId,
      studentMembershipId: linkFields.studentMembershipId,
      linkScope: linkFields.linkScope,
      course: courseId,
      classId: linkFields.classId,
      academicYearId: linkFields.academicYearId,
      amountOriginal: roundMoney(amount),
      amountDue: roundMoney(amount),
      amountPaid: 0,
      feeScopes: ['tuition'],
      feeBreakdown: {
        tuition: roundMoney(amount),
        admission: 0,
        transport: 0,
        exam: 0,
        document: 0,
        service: 0,
        other: 0
      },
      lineItems: normalizeFinanceLineItems({
        amountOriginal: roundMoney(amount),
        feeBreakdown: { tuition: roundMoney(amount) },
        feeScopes: ['tuition'],
        amountPaid: 0,
        adjustments: [],
        defaultType: 'tuition',
        periodKey: normalizedPeriodLabel || normalizedTerm
      }),
      dueDate: dueDateValue,
      issuedAt: issueDateValue,
      periodType: normalizedPeriodType,
      periodLabel: normalizedPeriodLabel,
      academicYear: normalizedAcademicYear,
      term: normalizedTerm,
      currency: String(currency || 'AFN').trim().toUpperCase(),
      note: String(note || '').trim(),
      createdBy: req.user.id
    });
    recalculateBill(bill);
    await bill.save();
    await syncStudentFinanceFromFinanceBill(bill).catch(() => null);

    await notifyStudent({
      req,
      studentId,
      studentCoreId: linkFields.studentId,
      title: 'Ø¨Ù„ Ø¬Ø¯ÛŒØ¯ ØµØ§Ø¯Ø± Ø´Ø¯',
      message: `ÛŒÚ© Ø¨Ù„ Ø¬Ø¯ÛŒØ¯ Ø¨Ø§ Ø´Ù…Ø§Ø±Ù‡ ${bill.billNumber} Ø¨Ø±Ø§ÛŒ Ø´Ù…Ø§ ØµØ§Ø¯Ø± Ø´Ø¯.`,
      emailSubject: 'ØµØ¯ÙˆØ± Ø¨Ù„ Ø¬Ø¯ÛŒØ¯'
    });

    await logActivity({
      req,
      action: 'finance_create_bill',
      targetType: 'FinanceBill',
      targetId: bill._id.toString(),
      meta: { studentId: String(studentId), courseId: String(courseId), amount: bill.amountOriginal }
    });

    const item = await FinanceBill.findById(bill._id)
      .populate('student', 'name email grade')
      .populate('course', 'title category')
      .populate('classId', 'title code gradeLevel section');
    res.status(201).json({ success: true, item, message: 'Ø¨Ù„ Ø¨Ø§ Ù…ÙˆÙÙ‚ÛŒØª Ø§ÛŒØ¬Ø§Ø¯ Ø´Ø¯' });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø§ÛŒØ¬Ø§Ø¯ Ø¨Ù„' });
  }
});

router.post('/admin/bills/preview', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const {
      classId = '',
      courseId: inputCourseId = '',
      amount,
      dueDate,
      issuedAt,
      periodType,
      periodLabel,
      academicYear,
      academicYearId,
      term,
      currency,
      feePlanId,
      includeAdmission,
      includeTransport,
      includeExam,
      includeDocument,
      includeOther,
      onlyDebtors
    } = req.body || {};

    if ((!classId && !inputCourseId) || !dueDate) {
      return res.status(400).json({ success: false, message: 'Ø´Ù†Ø§Ø³Ù‡ ØµÙ†Ù Ùˆ Ø³Ø±Ø±Ø³ÛŒØ¯ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª' });
    }

    const dueDateValue = parseDateSafe(dueDate, null);
    if (!dueDateValue) return res.status(400).json({ success: false, message: 'ØªØ§Ø±ÛŒØ® Ø³Ø±Ø±Ø³ÛŒØ¯ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª' });
    const issueDateValue = parseDateSafe(issuedAt, new Date());
    if (await isMonthClosed(issueDateValue)) {
      return res.status(400).json({ success: false, message: 'Ù…Ø§Ù‡ Ù…Ø§Ù„ÛŒ Ø¨Ø³ØªÙ‡ Ø´Ø¯Ù‡ Ø§Ø³Øª Ùˆ Ù¾ÛŒØ´â€ŒÙ†Ù…Ø§ÛŒØ´ ØµØ¯ÙˆØ± Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª' });
    }

    const normalizedPeriodType = normalizeBillPeriodType(periodType);
    const normalizedPeriodLabel = String(periodLabel || '').trim();
    const normalizedAcademicYear = String(academicYear || '').trim();
    const normalizedTerm = String(term || '').trim();
    const scope = await resolveFinanceScope({ classId, courseId: inputCourseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (!scope.courseId) {
      return res.status(400).json({ success: false, message: 'Class mapping is required for bill generation.' });
    }
    if (normalizeScopeText(inputCourseId) && !normalizeScopeText(classId)) {
      setLegacyScopeFieldHeaders(res);
    }

    const preview = await buildGroupedBillCandidates({
      courseId: scope.courseId,
      classId: scope.classId,
      academicYear: normalizedAcademicYear,
      academicYearId,
      term: normalizedTerm,
      feePlanId,
      amount,
      currency,
      periodType: normalizedPeriodType,
      periodLabel: normalizedPeriodLabel,
      includeAdmission,
      includeTransport,
      includeExam,
      includeDocument,
      includeOther,
      onlyDebtors
    });

    const items = [];
    let duplicateCount = 0;
    for (const candidate of preview.items) {
      const duplicate = await findConflictingBill({
        studentId: candidate.student,
        courseId: scope.courseId,
        academicYear: normalizedAcademicYear,
        term: normalizedTerm,
        periodType: normalizedPeriodType,
        periodLabel: normalizedPeriodLabel,
        dueDate: dueDateValue
      });
      if (duplicate) duplicateCount += 1;
      items.push({
        studentId: candidate.student,
        studentMembershipId: candidate.studentMembershipId,
        classId: candidate.classId,
        amountOriginal: candidate.amountOriginal,
        amountDue: candidate.amountDue,
        feeScopes: candidate.feeScopes,
        feeBreakdown: candidate.feeBreakdown,
        lineItems: candidate.lineItems,
        adjustments: candidate.adjustments,
        duplicate: duplicate ? { id: String(duplicate._id || ''), billNumber: String(duplicate.billNumber || '') } : null
      });
    }

    return res.json({
      success: true,
      feePlan: preview.feePlan,
      items,
      excluded: preview.excluded,
      summary: {
        ...preview.summary,
        duplicateCount
      }
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ù¾ÛŒØ´â€ŒÙ†Ù…Ø§ÛŒØ´ ØµØ¯ÙˆØ± Ø¨Ù„â€ŒÙ‡Ø§' });
  }
});

router.post('/admin/bills/generate', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const {
      classId = '',
      courseId: inputCourseId = '',
      amount,
      dueDate,
      issuedAt,
      periodType,
      periodLabel,
      academicYear,
      academicYearId,
      term,
      currency,
      feePlanId,
      includeAdmission,
      includeTransport,
      includeExam,
      includeDocument,
      includeOther,
      onlyDebtors
    } = req.body || {};
    if ((!classId && !inputCourseId) || !dueDate) {
      return res.status(400).json({ success: false, message: 'Ø´Ù†Ø§Ø³Ù‡ ØµÙ†Ù Ùˆ Ø³Ø±Ø±Ø³ÛŒØ¯ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª' });
    }
    const dueDateValue = parseDateSafe(dueDate, null);
    if (!dueDateValue) return res.status(400).json({ success: false, message: 'ØªØ§Ø±ÛŒØ® Ø³Ø±Ø±Ø³ÛŒØ¯ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª' });
    const issueDateValue = parseDateSafe(issuedAt, new Date());
    if (await isMonthClosed(issueDateValue)) {
      return res.status(400).json({ success: false, message: 'Ù…Ø§Ù‡ Ù…Ø§Ù„ÛŒ Ø¨Ø³ØªÙ‡ Ø´Ø¯Ù‡ Ø§Ø³Øª Ùˆ ØµØ¯ÙˆØ± Ú¯Ø±ÙˆÙ‡ÛŒ Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª' });
    }

    const normalizedPeriodType = normalizeBillPeriodType(periodType);
    const normalizedPeriodLabel = String(periodLabel || '').trim();
    const normalizedAcademicYear = String(academicYear || '').trim();
    const normalizedTerm = String(term || '').trim();
    const scope = await resolveFinanceScope({ classId, courseId: inputCourseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (!scope.courseId) {
      return res.status(400).json({ success: false, message: 'Class mapping is required for bill generation.' });
    }
    if (normalizeScopeText(inputCourseId) && !normalizeScopeText(classId)) {
      setLegacyScopeFieldHeaders(res);
    }

    const preview = await buildGroupedBillCandidates({
      courseId: scope.courseId,
      classId: scope.classId,
      academicYear: normalizedAcademicYear,
      academicYearId,
      term: normalizedTerm,
      feePlanId,
      amount,
      currency,
      periodType: normalizedPeriodType,
      periodLabel: normalizedPeriodLabel,
      includeAdmission,
      includeTransport,
      includeExam,
      includeDocument,
      includeOther,
      onlyDebtors
    });

    if (!preview.items.length) {
      return res.status(400).json({ success: false, message: 'Ù‡ÛŒÚ† Ù…ØªØ¹Ù„Ù… billable Ø¨Ø±Ø§ÛŒ ØªÙˆÙ„ÛŒØ¯ Ø¨Ù„ ÛŒØ§ÙØª Ù†Ø´Ø¯' });
    }

    let created = 0;
    let skipped = preview.excluded.length;
    const createdIds = [];
    for (const candidate of preview.items) {
      const exists = await findConflictingBill({
        studentId: candidate.student,
        courseId: scope.courseId,
        academicYear: normalizedAcademicYear,
        term: normalizedTerm,
        periodType: normalizedPeriodType,
        periodLabel: normalizedPeriodLabel,
        dueDate: dueDateValue
      });
      if (exists) {
        skipped += 1;
        continue;
      }

      const bill = new FinanceBill({
        billNumber: await generateBillNumber(),
        student: candidate.student,
        studentId: candidate.studentId || null,
        studentMembershipId: candidate.studentMembershipId,
        linkScope: 'membership',
        course: scope.courseId,
        classId: candidate.classId || null,
        academicYearId: candidate.academicYearId || null,
        amountOriginal: candidate.amountOriginal,
        amountDue: candidate.amountDue,
        dueDate: dueDateValue,
        issuedAt: issueDateValue,
        periodType: normalizedPeriodType,
        periodLabel: normalizedPeriodLabel,
        academicYear: normalizedAcademicYear,
        term: normalizedTerm,
        currency: String(currency || 'AFN').trim().toUpperCase(),
        feeScopes: candidate.feeScopes,
        feeBreakdown: candidate.feeBreakdown,
        lineItems: candidate.lineItems,
        adjustments: candidate.adjustments,
        note: candidate.note,
        createdBy: req.user.id
      });
      recalculateBill(bill);
      await bill.save();
      await syncStudentFinanceFromFinanceBill(bill).catch(() => null);
      created += 1;
      createdIds.push(bill._id);

      await notifyStudent({
        req,
        studentId: candidate.student,
        studentCoreId: candidate.studentId,
        title: 'Ø¨Ù„ Ø¬Ø¯ÛŒØ¯ ØµÙ†Ù ØµØ§Ø¯Ø± Ø´Ø¯',
        message: `Ø¨Ù„ Ø¬Ø¯ÛŒØ¯ Ø´Ù…Ø§ Ø¨Ø±Ø§ÛŒ ØµÙ†Ù ØµØ§Ø¯Ø± Ø´Ø¯. Ø´Ù…Ø§Ø±Ù‡ Ø¨Ù„: ${bill.billNumber}`,
        emailSubject: 'ØµØ¯ÙˆØ± Ø¨Ù„ Ø¬Ø¯ÛŒØ¯'
      });
    }

    await logActivity({
      req,
      action: 'finance_generate_bills',
      targetType: 'FinanceBill',
      targetId: createdIds[0] ? String(createdIds[0]) : '',
      meta: {
        courseId: String(scope.courseId),
        created,
        skipped,
        requestedAmount: Math.max(0, Number(amount) || 0),
        totalPreviewAmount: Number(preview.summary?.totalAmountDue || 0)
      }
    });

    res.json({
      success: true,
      message: `ØµØ¯ÙˆØ± Ú¯Ø±ÙˆÙ‡ÛŒ Ø§Ù†Ø¬Ø§Ù… Ø´Ø¯: ${created} Ø¨Ù„ Ø§ÛŒØ¬Ø§Ø¯ Ø´Ø¯ØŒ ${skipped} Ù…ÙˆØ±Ø¯ Ø±Ø¯/ØªÚ©Ø±Ø§Ø±ÛŒ Ø¨ÙˆØ¯.`,
      created,
      skipped,
      feePlan: preview.feePlan
    });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± ØµØ¯ÙˆØ± Ú¯Ø±ÙˆÙ‡ÛŒ Ø¨Ù„â€ŒÙ‡Ø§' });
  }
});

router.put('/admin/bills/:id', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await FinanceBill.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Ø¨Ù„ ÛŒØ§ÙØª Ù†Ø´Ø¯' });
    if (item.status === 'void') return res.status(400).json({ success: false, message: 'Ø¨Ù„ Ø¨Ø§Ø·Ù„ Ù‚Ø§Ø¨Ù„ ÙˆÛŒØ±Ø§ÛŒØ´ Ù†ÛŒØ³Øª' });
    if (await isMonthClosed(item.issuedAt)) {
      return res.status(400).json({ success: false, message: 'Ù…Ø§Ù‡ Ù…Ø§Ù„ÛŒ Ø¨Ø³ØªÙ‡ Ø´Ø¯Ù‡ Ø§Ø³Øª Ùˆ ÙˆÛŒØ±Ø§ÛŒØ´ Ø¨Ù„ Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª' });
    }

    const reason = String(req.body?.reason || '').trim();
    if (req.body?.amountOriginal !== undefined && !reason) {
      return res.status(400).json({ success: false, message: 'Ø¨Ø±Ø§ÛŒ ØªØºÛŒÛŒØ± Ù…Ø¨Ù„ØºØŒ Ø«Ø¨Øª Ø¯Ù„ÛŒÙ„ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª' });
    }

    if (req.body?.amountOriginal !== undefined) item.amountOriginal = roundMoney(req.body.amountOriginal);
    if (req.body?.dueDate) item.dueDate = parseDateSafe(req.body.dueDate, item.dueDate);
    if (req.body?.periodLabel !== undefined) item.periodLabel = String(req.body.periodLabel || '').trim();
    if (req.body?.periodType) item.periodType = normalizeBillPeriodType(req.body.periodType);
    if (req.body?.academicYear !== undefined) item.academicYear = String(req.body.academicYear || '').trim();
    if (req.body?.term !== undefined) item.term = String(req.body.term || '').trim();
    if (req.body?.note !== undefined) item.note = String(req.body.note || '').trim();

    const duplicateBill = await findConflictingBill({
      studentId: item.student,
      courseId: item.course,
      academicYear: item.academicYear,
      term: item.term,
      periodType: item.periodType,
      periodLabel: item.periodLabel,
      dueDate: item.dueDate,
      excludeBillId: item._id
    });
    if (duplicateBill) {
      return res.status(409).json({
        success: false,
        message: `Ø¨Ø±ÙˆØ²Ø±Ø³Ø§Ù†ÛŒ Ù…ÙˆØ¬Ø¨ ØªÚ©Ø±Ø§Ø± Ø¨Ù„ ${duplicateBill.billNumber} Ù…ÛŒâ€ŒØ´ÙˆØ¯`,
        duplicateBillId: duplicateBill._id
      });
    }

    recalculateBill(item);
    await item.save();
    await syncStudentFinanceFromFinanceBill(item).catch(() => null);

    await logActivity({
      req,
      action: 'finance_edit_bill',
      targetType: 'FinanceBill',
      targetId: item._id.toString(),
      meta: { reason }
    });

    const full = await FinanceBill.findById(item._id)
      .populate('student', 'name email grade')
      .populate('course', 'title category');
    res.json({ success: true, item: full, message: 'Ø¨Ù„ Ø¨Ø±ÙˆØ²Ø±Ø³Ø§Ù†ÛŒ Ø´Ø¯' });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± ÙˆÛŒØ±Ø§ÛŒØ´ Ø¨Ù„' });
  }
});

router.post('/admin/bills/:id/discount', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  setDeprecatedRouteHeaders(res, '/api/student-finance/orders/:feeOrderId/discount');
  return res.status(410).json({
    success: false,
    retired: true,
    message: 'Legacy finance bill discount route is retired. Use /api/student-finance/orders/:feeOrderId/discount instead.',
    replacementEndpoint: '/api/student-finance/orders/:feeOrderId/discount'
  });
});

router.post('/admin/bills/:id/installments', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  setDeprecatedRouteHeaders(res, '/api/student-finance/orders/:feeOrderId/installments');
  return res.status(410).json({
    success: false,
    retired: true,
    message: 'Legacy finance bill installments route is retired. Use /api/student-finance/orders/:feeOrderId/installments instead.',
    replacementEndpoint: '/api/student-finance/orders/:feeOrderId/installments'
  });
});

router.post('/admin/bills/:id/void', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  setDeprecatedRouteHeaders(res, '/api/student-finance/orders/:feeOrderId/void');
  return res.status(410).json({
    success: false,
    retired: true,
    message: 'Legacy finance bill void route is retired. Use /api/student-finance/orders/:feeOrderId/void instead.',
    replacementEndpoint: '/api/student-finance/orders/:feeOrderId/void'
  });
});

router.get('/admin/receipts', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    setDeprecatedRouteHeaders(res, '/api/student-finance/payments?status=pending');
    const { status = '', studentId = '', classId = '', courseId = '', billId = '', stage = '' } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/receipts?classId=${scope.classId}`);
    }
    const filter = {
      status: status || '',
      student: studentId || '',
      classId: scope.classId || ''
    };
    if (stage) {
      const normalizedStage = normalizeReceiptStage(stage);
      if (OPEN_RECEIPT_STAGES.includes(normalizedStage) || normalizedStage === RECEIPT_STAGES.completed || normalizedStage === RECEIPT_STAGES.rejected) {
        filter.approvalStage = normalizedStage;
      }
    }

    let items = await listFeePayments(filter);
    if (billId) {
      items = items.filter((item) => (
        String(item?.feeOrder?.sourceBillId || '') === String(billId || '')
        || String(item?.receipt?.bill?._id || '') === String(billId || '')
      ));
    }

    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø¯Ø±ÛŒØ§ÙØª Ø±Ø³ÛŒØ¯Ù‡Ø§' });
  }
});

router.post('/admin/receipts/:id/follow-up', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  setDeprecatedRouteHeaders(res, '/api/student-finance/payments/:feePaymentId/follow-up');
  return res.status(410).json({
    success: false,
    retired: true,
    message: 'Legacy finance receipt follow-up route is retired. Use /api/student-finance/payments/:feePaymentId/follow-up instead.',
    replacementEndpoint: '/api/student-finance/payments/:feePaymentId/follow-up'
  });
});

const setLegacyScopeHeaders = (res, replacementEndpoint = '') => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('X-Deprecated-Route', 'true');
  if (replacementEndpoint) {
    res.setHeader('X-Replacement-Endpoint', replacementEndpoint);
    res.setHeader('Link', `<${replacementEndpoint}>; rel="successor-version"`);
  }
};

const setDeprecatedRouteHeaders = (res, replacementEndpoint = '') => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('X-Deprecated-Route', 'true');
  if (replacementEndpoint) {
    res.setHeader('X-Replacement-Endpoint', replacementEndpoint);
    res.setHeader('Link', `<${replacementEndpoint}>; rel="successor-version"`);
  }
};

const setLegacyScopeFieldHeaders = (res) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('X-Deprecated-Field', 'courseId');
  res.setHeader('X-Replacement-Field', 'classId');
};

const addFilterClause = (filter, clause) => {
  if (!clause || !Object.keys(clause).length) return;
  filter.$and = Array.isArray(filter.$and) ? filter.$and : [];
  filter.$and.push(clause);
};

const buildScopedCourseFilter = (scope = {}, options = {}) => {
  const { classField = 'classId', courseField = 'course' } = options;
  const clauses = [];

  if (scope.classId) {
    clauses.push({ [classField]: scope.classId });
  }
  if (scope.courseId) {
    clauses.push({ [courseField]: scope.courseId, [classField]: null });
    clauses.push({ [courseField]: scope.courseId, [classField]: { $exists: false } });
  }

  if (!clauses.length) return {};
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
};

async function resolveFinanceScope({ classId = '', courseId = '' } = {}) {
  const normalizedClassId = normalizeScopeText(classId);
  const normalizedCourseId = normalizeScopeText(courseId);

  if (!normalizedClassId && !normalizedCourseId) {
    return {
      classId: '',
      courseId: '',
      schoolClass: null,
      course: null
    };
  }

  const scope = await resolveClassCourseReference({
    classId: normalizedClassId,
    courseId: normalizedCourseId
  });

  if (scope.error) return scope;

  return {
    ...scope,
    classId: scope.classId || '',
    courseId: scope.courseId || ''
  };
}

const FINANCE_AUDIT_KIND_VALUES = new Set(['order', 'payment', 'relief', 'system']);
const FINANCE_AUDIT_SEVERITY_VALUES = new Set(['info', 'warning', 'critical']);

const getTimelineTimestamp = (value) => {
  const date = parseDateSafe(value, null);
  return date ? date.getTime() : 0;
};

const resolveAuditActorName = (actor = null, fallback = 'سیستم') => {
  if (!actor) return fallback;
  return String(actor?.fullName || actor?.name || actor?.email || '').trim() || fallback;
};

const resolveFinanceStudentName = (doc = {}) => (
  String(doc?.studentId?.fullName || doc?.student?.name || doc?.student?.fullName || '').trim() || 'متعلم'
);

const resolveFinanceAcademicYearTitle = (doc = {}) => (
  String(doc?.academicYearId?.title || doc?.academicYear?.title || '').trim()
);

const resolveFinanceClassTitle = (doc = {}) => (
  String(doc?.classId?.title || doc?.schoolClass?.title || '').trim() || 'صنف'
);

const normalizeAuditKind = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return FINANCE_AUDIT_KIND_VALUES.has(normalized) ? normalized : 'all';
};

const normalizeAuditSeverity = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return FINANCE_AUDIT_SEVERITY_VALUES.has(normalized) ? normalized : 'all';
};

const FINANCE_ANOMALY_ASSIGNABLE_LEVELS = new Set(['finance_manager', 'finance_lead', 'general_president']);

const normalizeAnomalyAssignedLevel = (value = '', fallback = 'finance_manager') => {
  const normalized = normalizeAdminLevel(String(value || '').trim());
  if (FINANCE_ANOMALY_ASSIGNABLE_LEVELS.has(normalized)) return normalized;
  return FINANCE_ANOMALY_ASSIGNABLE_LEVELS.has(fallback) ? fallback : 'finance_manager';
};

const populateFinanceAnomalyCaseQuery = (query) => query
  .populate('assignedTo', 'name email adminLevel orgRole')
  .populate('resolvedBy', 'name email adminLevel orgRole')
  .populate('latestActionBy', 'name email adminLevel orgRole')
  .populate('history.by', 'name email adminLevel orgRole');

const buildFinanceAnomalyCaseFilter = ({ scope = {}, academicYearId = '', studentMembershipId = '', anomalyIds = [] } = {}) => {
  const filter = {};
  if (scope?.classId) filter.classId = String(scope.classId).trim();
  if (String(academicYearId || '').trim()) filter.academicYearId = String(academicYearId).trim();
  if (String(studentMembershipId || '').trim()) filter.studentMembershipId = String(studentMembershipId).trim();
  if (Array.isArray(anomalyIds) && anomalyIds.length) {
    filter.anomalyId = { $in: anomalyIds.map((entry) => String(entry || '').trim()).filter(Boolean) };
  }
  return filter;
};

const buildFinanceAnomalySummary = (items = []) => ({
  ...buildAnomalySummary(items),
  byWorkflow: buildFinanceAnomalyWorkflowSummary(items)
});

const appendFinanceAnomalyHistory = (item, {
  action = 'noted',
  actorId = null,
  status = 'open',
  note = '',
  assignedLevel = '',
  snoozedUntil = null,
  at = new Date()
} = {}) => {
  item.history = Array.isArray(item.history) ? item.history : [];
  item.history.push({
    action,
    by: actorId,
    at,
    status,
    note: String(note || '').trim(),
    assignedLevel: String(assignedLevel || '').trim(),
    snoozedUntil: snoozedUntil || null
  });
};

const hydrateFinanceAnomalyCase = (item, snapshot = {}) => {
  const normalizedSnapshot = buildFinanceAnomalyCaseSnapshot(snapshot);
  if (normalizedSnapshot.anomalyId) item.anomalyId = normalizedSnapshot.anomalyId;
  item.anomalyType = normalizedSnapshot.anomalyType || item.anomalyType || 'finance_signal';
  item.title = normalizedSnapshot.title || item.title || 'ناهنجاری مالی';
  item.description = normalizedSnapshot.description || item.description || '';
  item.severity = normalizeAuditSeverity(normalizedSnapshot.severity || item.severity || 'info');
  item.signalActionRequired = normalizedSnapshot.signalActionRequired === true || item.signalActionRequired === true;
  item.studentMembershipId = normalizedSnapshot.studentMembershipId || item.studentMembershipId || '';
  item.studentUserId = normalizedSnapshot.studentUserId || item.studentUserId || '';
  item.studentName = normalizedSnapshot.studentName || item.studentName || '';
  item.classId = normalizedSnapshot.classId || item.classId || '';
  item.classTitle = normalizedSnapshot.classTitle || item.classTitle || '';
  item.academicYearId = normalizedSnapshot.academicYearId || item.academicYearId || '';
  item.academicYearTitle = normalizedSnapshot.academicYearTitle || item.academicYearTitle || '';
  item.targetType = normalizedSnapshot.targetType || item.targetType || '';
  item.targetId = normalizedSnapshot.targetId || item.targetId || '';
  item.referenceNumber = normalizedSnapshot.referenceNumber || item.referenceNumber || '';
  item.secondaryReference = normalizedSnapshot.secondaryReference || item.secondaryReference || '';
  item.amount = Number(normalizedSnapshot.amount || item.amount || 0) || 0;
  item.amountLabel = normalizedSnapshot.amountLabel || item.amountLabel || '';
  item.status = normalizeFinanceAnomalyWorkflowStatus(item.status || 'open');
  item.dueDate = normalizedSnapshot.dueDate || item.dueDate || null;
  item.occurredAt = normalizedSnapshot.at || item.occurredAt || null;
  item.currentSnapshot = normalizedSnapshot.currentSnapshot || item.currentSnapshot || {};
  return item;
};

const buildFinanceAnomalyResponseItem = async (item) => populateFinanceAnomalyCaseQuery(
  FinanceAnomalyCase.findById(item._id)
).lean();

const mapFinanceAnomalyActionToTitle = (action = '') => ({
  assigned: 'ناهجاری مالی ارجاع شد',
  snoozed: 'ناهجاری مالی موقتاً معطل شد',
  resolved: 'ناهجاری مالی حل‌شده ثبت شد',
  noted: 'یادداشت برای ناهنجاری مالی ثبت شد',
  reopened: 'ناهجاری مالی دوباره باز شد',
  created: 'پرونده ناهنجاری مالی ایجاد شد'
}[String(action || '').trim()] || 'به‌روزرسانی ناهنجاری مالی');

const mapFinanceAnomalyActionSeverity = (action = '', fallback = 'warning') => {
  const normalized = String(action || '').trim();
  if (normalized === 'resolved') return 'info';
  if (normalized === 'snoozed') return 'warning';
  if (normalized === 'assigned' || normalized === 'reopened') return 'critical';
  return normalizeAuditSeverity(fallback || 'warning');
};

const buildFinanceAnomalyTimelineItems = (cases = []) => {
  const items = [];
  (Array.isArray(cases) ? cases : []).forEach((caseItem) => {
    const history = Array.isArray(caseItem?.history) ? caseItem.history : [];
    history.forEach((entry, index) => {
      const at = entry?.at || caseItem?.updatedAt || caseItem?.createdAt || null;
      if (!at) return;
      const action = String(entry?.action || '').trim() || 'noted';
      items.push({
        id: `anomaly-case-${String(caseItem?._id || caseItem?.anomalyId || 'item')}-${index}`,
        kind: 'system',
        eventKey: `anomaly_${action}`,
        severity: mapFinanceAnomalyActionSeverity(action, caseItem?.severity),
        actionRequired: normalizeFinanceAnomalyWorkflowStatus(entry?.status || caseItem?.status || 'open') !== 'resolved',
        title: mapFinanceAnomalyActionToTitle(action),
        description: `${String(caseItem?.title || 'ناهنجاری مالی').trim()}${caseItem?.studentName ? ` - ${caseItem.studentName}` : ''}`,
        at,
        actorName: resolveAuditActorName(entry?.by, 'ادمین مالی'),
        studentName: String(caseItem?.studentName || '').trim(),
        classTitle: String(caseItem?.classTitle || '').trim(),
        academicYearTitle: String(caseItem?.academicYearTitle || '').trim(),
        referenceNumber: String(caseItem?.referenceNumber || '').trim(),
        secondaryReference: String(caseItem?.secondaryReference || '').trim(),
        amount: Number(caseItem?.amount || 0) || 0,
        amountLabel: String(caseItem?.amountLabel || '').trim(),
        status: normalizeFinanceAnomalyWorkflowStatus(entry?.status || caseItem?.status || 'open'),
        sourceLabel: 'مدیریت ناهنجاری',
        note: String(entry?.note || '').trim(),
        reason: '',
        jumpSection: 'reports',
        targetType: 'FinanceAnomalyCase',
        targetId: String(caseItem?._id || '').trim(),
        tags: ['anomaly', String(caseItem?.anomalyType || '').trim(), action, String(entry?.assignedLevel || '').trim()].filter(Boolean),
        attachment: { fileUrl: '' }
      });
    });
  });
  return items;
};

const ensureFinanceAnomalyCase = async ({ anomalyId = '', snapshot = {} } = {}) => {
  const normalizedAnomalyId = String(anomalyId || snapshot?.id || '').trim();
  if (!normalizedAnomalyId) {
    throw new Error('finance_anomaly_id_required');
  }

  const existing = await FinanceAnomalyCase.findOne({ anomalyId: normalizedAnomalyId });
  if (existing) {
    return hydrateFinanceAnomalyCase(existing, { ...snapshot, id: normalizedAnomalyId });
  }

  const next = new FinanceAnomalyCase({
    anomalyId: normalizedAnomalyId,
    status: 'open'
  });
  return hydrateFinanceAnomalyCase(next, { ...snapshot, id: normalizedAnomalyId });
};

const resolveFinanceAnomalyActionTitle = (action = '') => ({
  assign: 'finance_anomaly_assign',
  snooze: 'finance_anomaly_snooze',
  resolve: 'finance_anomaly_resolve',
  note: 'finance_anomaly_note'
}[String(action || '').trim()] || 'finance_anomaly_update');

const mapFeeOrderSourceLabel = (value = '') => ({
  finance_bill: 'بل مالی',
  transport_plan: 'پلان ترانسپورت',
  manual: 'ثبت دستی',
  migration: 'مهاجرت',
  system: 'سیستمی'
}[String(value || '').trim()] || 'بل مالی');

const mapFeePaymentSourceLabel = (value = '', payment = {}) => {
  const normalized = String(value || '').trim();
  if (normalized === 'finance_receipt') {
    return String(payment?.fileUrl || payment?.sourceReceiptId?.fileUrl || '').trim()
      ? 'ارسال ولی/متعلم'
      : 'رسید legacy';
  }
  return ({
    manual: 'ثبت صندوق',
    gateway: 'درگاه آنلاین',
    migration: 'مهاجرت'
  }[normalized] || 'پرداخت مالی');
};

const mapReliefSourceLabel = (value = '') => ({
  discount: 'تخفیف',
  fee_exemption: 'معافیت',
  manual: 'ثبت دستی',
  migration: 'مهاجرت',
  system: 'سیستمی'
}[String(value || '').trim()] || 'تسهیل مالی');

const buildFinanceAuditSearchText = (item = {}) => (
  [
    item?.title,
    item?.description,
    item?.studentName,
    item?.classTitle,
    item?.academicYearTitle,
    item?.referenceNumber,
    item?.secondaryReference,
    item?.actorName,
    item?.status,
    item?.sourceLabel,
    item?.note,
    item?.reason,
    ...(Array.isArray(item?.tags) ? item.tags : [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
);

const buildFinanceAuditSummary = (items = []) => {
  const rows = Array.isArray(items) ? items : [];
  const byKind = { order: 0, payment: 0, relief: 0, system: 0 };
  const bySeverity = { info: 0, warning: 0, critical: 0 };
  let actionRequired = 0;
  rows.forEach((item) => {
    const kind = normalizeAuditKind(item?.kind);
    const severity = normalizeAuditSeverity(item?.severity);
    if (FINANCE_AUDIT_KIND_VALUES.has(kind)) byKind[kind] += 1;
    if (FINANCE_AUDIT_SEVERITY_VALUES.has(severity)) bySeverity[severity] += 1;
    if (item?.actionRequired) actionRequired += 1;
  });
  return {
    total: rows.length,
    actionRequired,
    byKind,
    bySeverity
  };
};

async function buildFinanceAuditTimeline({ scope = {}, limit = 80, q = '', kind = 'all', severity = 'all' } = {}) {
  const normalizedKind = normalizeAuditKind(kind);
  const normalizedSeverity = normalizeAuditSeverity(severity);
  const searchTerm = String(q || '').trim().toLowerCase();
  const safeLimit = Math.max(20, Math.min(Number(limit) || 80, 500));
  const queryLimit = Math.min(Math.max(safeLimit * 3, 120), 480);

  const classFilter = scope?.classId ? { classId: scope.classId } : {};
  const activityFilter = {
    action: {
      $in: [
        'finance_run_reminders',
        'finance_submit_month_close',
        'finance_approve_month_close',
        'finance_reject_month_close',
        'finance_close_month',
        'finance_reopen_month'
      ]
    }
  };

  const [orders, payments, reliefs, activities, anomalyCases] = await Promise.all([
    FeeOrder.find(classFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .populate('createdBy', 'name email')
      .populate('voidedBy', 'name email')
      .populate('adjustments.createdBy', 'name email')
      .sort({ updatedAt: -1, issuedAt: -1 })
      .limit(queryLimit)
      .lean(),
    FeePayment.find(classFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .populate('feeOrderId', 'orderNumber title status')
      .populate('receivedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .populate('sourceReceiptId', 'fileUrl')
      .populate('approvalTrail.by', 'name email')
      .populate('followUp.updatedBy', 'name email')
      .populate('followUp.history.updatedBy', 'name email')
      .sort({ updatedAt: -1, paidAt: -1 })
      .limit(queryLimit)
      .lean(),
    FinanceRelief.find(classFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .populate('approvedBy', 'name email')
      .populate('createdBy', 'name email')
      .populate('cancelledBy', 'name email')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(queryLimit)
      .lean(),
    scope?.classId
      ? Promise.resolve([])
      : ActivityLog.find(activityFilter)
        .populate('actor', 'name email orgRole adminLevel')
        .sort({ createdAt: -1 })
        .limit(queryLimit)
        .lean(),
    populateFinanceAnomalyCaseQuery(
      FinanceAnomalyCase.find(buildFinanceAnomalyCaseFilter({ scope }))
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(queryLimit)
    ).lean()
  ]);

  const items = [];
  const addItem = (payload = {}) => {
    const at = payload?.at || null;
    if (!at) return;
    const item = {
      id: String(payload?.id || `${payload?.kind || 'system'}-${payload?.eventKey || 'item'}-${items.length + 1}`).trim(),
      kind: normalizeAuditKind(payload?.kind),
      eventKey: String(payload?.eventKey || '').trim() || 'finance_event',
      severity: normalizeAuditSeverity(payload?.severity),
      actionRequired: payload?.actionRequired === true,
      title: String(payload?.title || '').trim() || 'رویداد مالی',
      description: String(payload?.description || '').trim(),
      at,
      actorName: String(payload?.actorName || '').trim() || 'سیستم',
      studentName: String(payload?.studentName || '').trim(),
      classTitle: String(payload?.classTitle || '').trim(),
      academicYearTitle: String(payload?.academicYearTitle || '').trim(),
      referenceNumber: String(payload?.referenceNumber || '').trim(),
      secondaryReference: String(payload?.secondaryReference || '').trim(),
      amount: Number(payload?.amount || 0) || 0,
      amountLabel: String(payload?.amountLabel || '').trim(),
      status: String(payload?.status || '').trim(),
      sourceLabel: String(payload?.sourceLabel || '').trim(),
      note: String(payload?.note || '').trim(),
      reason: String(payload?.reason || '').trim(),
      jumpSection: String(payload?.jumpSection || '').trim(),
      targetType: String(payload?.targetType || '').trim(),
      targetId: String(payload?.targetId || '').trim(),
      tags: Array.isArray(payload?.tags) ? payload.tags.filter(Boolean).map((tag) => String(tag).trim()) : [],
      attachment: {
        hasFile: Boolean(String(payload?.attachment?.fileUrl || '').trim()),
        fileUrl: String(payload?.attachment?.fileUrl || '').trim()
      }
    };
    item.searchText = buildFinanceAuditSearchText(item);
    items.push(item);
  };

  orders.forEach((order) => {
    const studentName = resolveFinanceStudentName(order);
    const classTitle = resolveFinanceClassTitle(order);
    const academicYearTitle = resolveFinanceAcademicYearTitle(order);
    const referenceNumber = String(order?.orderNumber || order?.title || '').trim() || 'بل';
    const amountDue = Number(order?.amountDue || 0) || 0;
    const outstandingAmount = Number(order?.outstandingAmount || 0) || 0;
    const basePayload = {
      kind: 'order',
      studentName,
      classTitle,
      academicYearTitle,
      referenceNumber,
      sourceLabel: mapFeeOrderSourceLabel(order?.source),
      status: String(order?.status || '').trim(),
      jumpSection: 'orders',
      targetType: 'FeeOrder',
      targetId: String(order?._id || '').trim()
    };

    addItem({
      ...basePayload,
      id: `order-issued-${order?._id || referenceNumber}`,
      eventKey: 'order_issued',
      severity: order?.status === 'overdue' ? 'warning' : 'info',
      actionRequired: false,
      title: 'بل صادر شد',
      description: `${studentName} - ${referenceNumber}`,
      at: order?.issuedAt || order?.createdAt,
      actorName: resolveAuditActorName(order?.createdBy, 'سیستم مالی'),
      amount: amountDue,
      amountLabel: formatFinanceAmountLabel(amountDue),
      note: order?.note || '',
      tags: [order?.orderType, order?.status]
    });

    if (outstandingAmount > 0 && order?.status === 'overdue' && order?.dueDate) {
      addItem({
        ...basePayload,
        id: `order-overdue-${order?._id || referenceNumber}`,
        eventKey: 'order_overdue',
        severity: 'critical',
        actionRequired: true,
        title: 'بل معوق شد',
        description: `${studentName} هنوز ${formatFinanceAmountLabel(outstandingAmount)} باقی‌مانده دارد`,
        at: order.dueDate,
        actorName: 'سیستم مالی',
        amount: outstandingAmount,
        amountLabel: formatFinanceAmountLabel(outstandingAmount),
        tags: ['overdue']
      });
    }

    (Array.isArray(order?.adjustments) ? order.adjustments : []).forEach((adjustment, index) => {
      const amount = Number(adjustment?.amount || 0) || 0;
      const type = String(adjustment?.type || '').trim() || 'manual';
      addItem({
        ...basePayload,
        id: `order-adjustment-${order?._id || referenceNumber}-${index}`,
        eventKey: 'order_adjustment',
        severity: type === 'penalty' ? 'warning' : 'info',
        actionRequired: false,
        title: type === 'penalty' ? 'افزایش یا جریمه ثبت شد' : 'تعدیل بل ثبت شد',
        description: `${referenceNumber} - ${adjustment?.reason || 'بدون توضیح'}`,
        at: adjustment?.createdAt || order?.updatedAt || order?.issuedAt,
        actorName: resolveAuditActorName(adjustment?.createdBy, 'ادمین مالی'),
        amount,
        amountLabel: formatFinanceAmountLabel(amount),
        note: adjustment?.reason || '',
        tags: [type]
      });
    });

    if (Array.isArray(order?.installments) && order.installments.length) {
      addItem({
        ...basePayload,
        id: `order-installments-${order?._id || referenceNumber}`,
        eventKey: 'order_installments',
        severity: 'info',
        actionRequired: order.installments.some((item) => String(item?.status || '').trim() !== 'paid'),
        title: 'قسط‌بندی بل تنظیم شد',
        description: `${order.installments.length} قسط برای ${referenceNumber} تعریف شد`,
        at: order?.updatedAt || order?.createdAt,
        actorName: resolveAuditActorName(order?.createdBy, 'ادمین مالی'),
        amount: amountDue,
        amountLabel: formatFinanceAmountLabel(amountDue),
        tags: ['installments']
      });
    }

    if (order?.voidedAt) {
      addItem({
        ...basePayload,
        id: `order-voided-${order?._id || referenceNumber}`,
        eventKey: 'order_voided',
        severity: 'warning',
        actionRequired: false,
        title: 'بل باطل شد',
        description: `${referenceNumber} باطل شد`,
        at: order.voidedAt,
        actorName: resolveAuditActorName(order?.voidedBy, 'ادمین مالی'),
        reason: order?.voidReason || '',
        tags: ['void']
      });
    }
  });

  payments.forEach((payment) => {
    const studentName = resolveFinanceStudentName(payment);
    const classTitle = resolveFinanceClassTitle(payment);
    const academicYearTitle = resolveFinanceAcademicYearTitle(payment);
    const referenceNumber = String(payment?.paymentNumber || '').trim() || 'پرداخت';
    const feeOrderNumber = String(payment?.feeOrderId?.orderNumber || '').trim();
    const fileUrl = String(payment?.fileUrl || payment?.sourceReceiptId?.fileUrl || '').trim();
    const paymentSourceLabel = mapFeePaymentSourceLabel(payment?.source, { ...payment, fileUrl });
    const paymentStatus = String(payment?.status || '').trim() || 'pending';
    const basePayload = {
      kind: 'payment',
      studentName,
      classTitle,
      academicYearTitle,
      referenceNumber,
      secondaryReference: feeOrderNumber,
      sourceLabel: paymentSourceLabel,
      status: paymentStatus,
      jumpSection: 'payments',
      targetType: 'FeePayment',
      targetId: String(payment?._id || '').trim(),
      attachment: { fileUrl }
    };

    addItem({
      ...basePayload,
      id: `payment-submitted-${payment?._id || referenceNumber}`,
      eventKey: 'payment_submitted',
      severity: paymentStatus === 'rejected' ? 'critical' : paymentStatus === 'pending' ? 'warning' : 'info',
      actionRequired: paymentStatus !== 'approved',
      title: 'پرداخت ثبت شد',
      description: `${studentName} - ${referenceNumber}`,
      at: payment?.paidAt || payment?.createdAt,
      actorName: resolveAuditActorName(payment?.receivedBy, payment?.payerType === 'student_guardian' ? 'ولی/متعلم' : 'کاربر مالی'),
      amount: Number(payment?.amount || 0) || 0,
      amountLabel: formatFinanceAmountLabel(payment?.amount || 0),
      note: payment?.note || '',
      reason: payment?.rejectReason || '',
      tags: [payment?.paymentMethod, paymentStatus, payment?.approvalStage]
    });

    (Array.isArray(payment?.approvalTrail) ? payment.approvalTrail : []).forEach((entry, index) => {
      const action = String(entry?.action || '').trim() || 'approve';
      addItem({
        ...basePayload,
        id: `payment-approval-${payment?._id || referenceNumber}-${index}`,
        eventKey: action === 'reject' ? 'payment_rejected' : 'payment_approved',
        severity: action === 'reject' ? 'critical' : 'info',
        actionRequired: action === 'reject',
        title: action === 'reject' ? 'پرداخت رد شد' : 'پرداخت تایید شد',
        description: `${referenceNumber} در سطح ${entry?.level || 'finance_manager'} بررسی شد`,
        at: entry?.at || payment?.reviewedAt || payment?.updatedAt,
        actorName: resolveAuditActorName(entry?.by, 'ادمین مالی'),
        amount: Number(payment?.amount || 0) || 0,
        amountLabel: formatFinanceAmountLabel(payment?.amount || 0),
        note: entry?.note || '',
        reason: entry?.reason || '',
        tags: [action, entry?.level]
      });
    });

    (Array.isArray(payment?.followUp?.history) ? payment.followUp.history : []).forEach((entry, index) => {
      const followUpStatus = String(entry?.status || '').trim() || 'new';
      addItem({
        ...basePayload,
        id: `payment-followup-${payment?._id || referenceNumber}-${index}`,
        eventKey: 'payment_follow_up',
        severity: followUpStatus === 'escalated' ? 'critical' : followUpStatus === 'resolved' ? 'info' : 'warning',
        actionRequired: followUpStatus !== 'resolved',
        title: 'پیگیری پرداخت به‌روزرسانی شد',
        description: `${referenceNumber} به ${entry?.assignedLevel || 'finance_manager'} ارجاع شد`,
        at: entry?.updatedAt || payment?.updatedAt,
        actorName: resolveAuditActorName(entry?.updatedBy, 'ادمین مالی'),
        note: entry?.note || '',
        tags: [followUpStatus, entry?.assignedLevel]
      });
    });
  });

  reliefs.forEach((relief) => {
    const studentName = resolveFinanceStudentName(relief);
    const classTitle = resolveFinanceClassTitle(relief);
    const academicYearTitle = resolveFinanceAcademicYearTitle(relief);
    const referenceNumber = String(relief?.sourceKey || relief?._id || '').trim();
    const amount = relief?.coverageMode === 'percent'
      ? Number(relief?.percentage || 0) || 0
      : Number(relief?.amount || 0) || 0;
    const amountLabel = relief?.coverageMode === 'full'
      ? '100%'
      : relief?.coverageMode === 'percent'
        ? `${Number(relief?.percentage || 0).toLocaleString('fa-AF-u-ca-persian')}%`
        : formatFinanceAmountLabel(relief?.amount || 0);
    const basePayload = {
      kind: 'relief',
      studentName,
      classTitle,
      academicYearTitle,
      referenceNumber,
      sourceLabel: mapReliefSourceLabel(relief?.sourceModel),
      status: String(relief?.status || '').trim() || 'active',
      jumpSection: 'discounts',
      targetType: 'FinanceRelief',
      targetId: String(relief?._id || '').trim()
    };

    addItem({
      ...basePayload,
      id: `relief-created-${relief?._id || referenceNumber}`,
      eventKey: 'relief_created',
      severity: 'info',
      actionRequired: false,
      title: `${getReliefTypeLabel(relief?.reliefType)} فعال شد`,
      description: `${studentName} - ${amountLabel}`,
      at: relief?.startDate || relief?.createdAt,
      actorName: resolveAuditActorName(relief?.approvedBy || relief?.createdBy, 'مدیریت مالی'),
      amount,
      amountLabel,
      note: relief?.note || '',
      reason: relief?.reason || '',
      tags: [relief?.reliefType, relief?.scope, relief?.coverageMode]
    });

    if (relief?.lastReminderAt) {
      addItem({
        ...basePayload,
        id: `relief-reminder-${relief?._id || referenceNumber}`,
        eventKey: 'relief_reminder',
        severity: 'warning',
        actionRequired: true,
        title: 'یادآوری ختم تسهیل ارسال شد',
        description: `${getReliefTypeLabel(relief?.reliefType)} برای ${studentName}`,
        at: relief.lastReminderAt,
        actorName: 'سیستم مالی',
        amount,
        amountLabel,
        tags: ['reminder', relief?.reliefType]
      });
    }

    if (relief?.cancelledAt) {
      addItem({
        ...basePayload,
        id: `relief-cancelled-${relief?._id || referenceNumber}`,
        eventKey: 'relief_cancelled',
        severity: 'warning',
        actionRequired: false,
        title: 'تسهیل مالی لغو شد',
        description: `${getReliefTypeLabel(relief?.reliefType)} برای ${studentName} لغو شد`,
        at: relief.cancelledAt,
        actorName: resolveAuditActorName(relief?.cancelledBy, 'مدیریت مالی'),
        reason: relief?.cancelReason || '',
        amount,
        amountLabel,
        tags: ['cancelled', relief?.reliefType]
      });
    }
  });

  activities.forEach((log) => {
    const action = String(log?.action || '').trim();
    if (action === 'finance_run_reminders') {
      addItem({
        id: `activity-${log?._id || action}`,
        kind: 'system',
        eventKey: 'reminders_run',
        severity: 'info',
        actionRequired: false,
        title: 'یادآوری‌های مالی اجرا شد',
        description: `${Number(log?.meta?.notified || 0)} اعلان برای بدهی‌ها و تسهیلات ارسال شد`,
        at: log?.createdAt,
        actorName: resolveAuditActorName(log?.actor, log?.meta?.automated ? 'اتوماسیون مالی' : 'مدیریت مالی'),
        status: 'completed',
        sourceLabel: 'اتوماسیون',
        jumpSection: 'settings',
        targetType: String(log?.targetType || '').trim() || 'ActivityLog',
        targetId: String(log?.targetId || log?._id || '').trim(),
        tags: ['reminders', log?.meta?.automated ? 'automated' : 'manual']
      });
    }

    if (action === 'finance_close_month') {
      addItem({
        id: `activity-${log?._id || action}`,
        kind: 'system',
        eventKey: 'month_closed',
        severity: 'warning',
        actionRequired: false,
        title: 'ماه مالی بسته شد',
        description: `ماه ${String(log?.meta?.monthKey || '').trim() || 'مالی'} بسته شد`,
        at: log?.createdAt,
        actorName: resolveAuditActorName(log?.actor, 'ریاست عمومی'),
        status: 'completed',
        sourceLabel: 'حاکمیت مالی',
        jumpSection: 'settings',
        targetType: String(log?.targetType || '').trim() || 'ActivityLog',
        targetId: String(log?.targetId || log?._id || '').trim(),
        tags: ['month_close']
      });
    }

    if (action === 'finance_submit_month_close') {
      addItem({
        id: `activity-${log?._id || action}`,
        kind: 'system',
        eventKey: 'month_close_requested',
        severity: 'warning',
        actionRequired: true,
        title: 'درخواست بستن ماه مالی ثبت شد',
        description: `ماه ${String(log?.meta?.monthKey || '').trim() || 'مالی'} برای بررسی ارسال شد`,
        at: log?.createdAt,
        actorName: resolveAuditActorName(log?.actor, 'مدیریت مالی'),
        status: 'pending_review',
        sourceLabel: 'حاکمیت مالی',
        note: String(log?.meta?.note || '').trim(),
        jumpSection: 'settings',
        targetType: String(log?.targetType || '').trim() || 'ActivityLog',
        targetId: String(log?.targetId || log?._id || '').trim(),
        tags: ['month_close', 'request']
      });
    }

    if (action === 'finance_approve_month_close') {
      addItem({
        id: `activity-${log?._id || action}`,
        kind: 'system',
        eventKey: 'month_close_reviewed',
        severity: String(log?.meta?.closed || '') === 'true' || log?.meta?.closed === true ? 'warning' : 'info',
        actionRequired: !(log?.meta?.closed === true || String(log?.meta?.closed || '').trim() === 'true'),
        title: log?.meta?.closed ? 'ماه مالی بسته شد' : 'درخواست بستن ماه مالی تایید شد',
        description: log?.meta?.closed
          ? `ماه ${String(log?.meta?.monthKey || '').trim() || 'مالی'} پس از تایید نهایی بسته شد`
          : `درخواست بستن ماه ${String(log?.meta?.monthKey || '').trim() || 'مالی'} به مرحله بعد رفت`,
        at: log?.createdAt,
        actorName: resolveAuditActorName(log?.actor, 'مدیریت مالی'),
        status: log?.meta?.closed ? 'completed' : String(log?.meta?.nextStage || '').trim() || 'pending_review',
        sourceLabel: 'حاکمیت مالی',
        note: String(log?.meta?.note || '').trim(),
        jumpSection: 'settings',
        targetType: String(log?.targetType || '').trim() || 'ActivityLog',
        targetId: String(log?.targetId || log?._id || '').trim(),
        tags: ['month_close', 'approve', String(log?.meta?.actorLevel || '').trim()]
      });
    }

    if (action === 'finance_reject_month_close') {
      addItem({
        id: `activity-${log?._id || action}`,
        kind: 'system',
        eventKey: 'month_close_rejected',
        severity: 'critical',
        actionRequired: true,
        title: 'درخواست بستن ماه مالی رد شد',
        description: `ماه ${String(log?.meta?.monthKey || '').trim() || 'مالی'} برای اصلاح برگردانده شد`,
        at: log?.createdAt,
        actorName: resolveAuditActorName(log?.actor, 'مدیریت مالی'),
        status: 'rejected',
        sourceLabel: 'حاکمیت مالی',
        reason: String(log?.meta?.reason || '').trim(),
        jumpSection: 'settings',
        targetType: String(log?.targetType || '').trim() || 'ActivityLog',
        targetId: String(log?.targetId || log?._id || '').trim(),
        tags: ['month_close', 'reject']
      });
    }

    if (action === 'finance_reopen_month') {
      addItem({
        id: `activity-${log?._id || action}`,
        kind: 'system',
        eventKey: 'month_reopened',
        severity: 'critical',
        actionRequired: true,
        title: 'ماه مالی بازگشایی شد',
        description: `ماه ${String(log?.meta?.monthKey || '').trim() || 'مالی'} دوباره برای اصلاحات باز شد`,
        at: log?.createdAt,
        actorName: resolveAuditActorName(log?.actor, 'ریاست عمومی'),
        status: 'reopened',
        sourceLabel: 'حاکمیت مالی',
        note: String(log?.meta?.note || '').trim(),
        jumpSection: 'settings',
        targetType: String(log?.targetType || '').trim() || 'ActivityLog',
        targetId: String(log?.targetId || log?._id || '').trim(),
        tags: ['month_reopen']
      });
    }
  });

  buildFinanceAnomalyTimelineItems(anomalyCases).forEach((entry) => {
    addItem(entry);
  });

  const filtered = items
    .sort((left, right) => getTimelineTimestamp(right?.at) - getTimelineTimestamp(left?.at))
    .filter((item) => {
      if (normalizedKind !== 'all' && item.kind !== normalizedKind) return false;
      if (normalizedSeverity !== 'all' && item.severity !== normalizedSeverity) return false;
      if (searchTerm && !String(item.searchText || '').includes(searchTerm)) return false;
      return true;
    });

  const limited = filtered.slice(0, safeLimit);

  return {
    items: limited,
    summary: buildFinanceAuditSummary(limited),
    appliedFilters: {
      classId: scope?.classId || '',
      courseId: scope?.courseId || '',
      q: String(q || '').trim(),
      kind: normalizedKind,
      severity: normalizedSeverity,
      limit: safeLimit
    }
  };
}

router.post('/admin/receipts/:id/approve', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  setDeprecatedRouteHeaders(res, '/api/student-finance/payments/:feePaymentId/approve');
  return res.status(410).json({
    success: false,
    retired: true,
    message: 'Legacy finance receipt approval route is retired. Use /api/student-finance/payments/:feePaymentId/approve instead.',
    replacementEndpoint: '/api/student-finance/payments/:feePaymentId/approve'
  });
});

router.post('/admin/receipts/:id/reject', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  setDeprecatedRouteHeaders(res, '/api/student-finance/payments/:feePaymentId/reject');
  return res.status(410).json({
    success: false,
    retired: true,
    message: 'Legacy finance receipt rejection route is retired. Use /api/student-finance/payments/:feePaymentId/reject instead.',
    replacementEndpoint: '/api/student-finance/payments/:feePaymentId/reject'
  });
});

router.get('/student/me', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'ÙÙ‚Ø· Ø´Ø§Ú¯Ø±Ø¯ Ø¨Ù‡ Ø§ÛŒÙ† Ø¨Ø®Ø´ Ø¯Ø³ØªØ±Ø³ÛŒ Ø¯Ø§Ø±Ø¯' });
    }
    setLegacyScopeHeaders(res, '/api/student-finance/me/overviews');
    return res.status(410).json({
      success: false,
      retired: true,
      message: 'Legacy student finance summary has been retired. Use /api/student-finance/me/overviews instead.',
      replacementEndpoint: '/api/student-finance/me/overviews'
    });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø¯Ø±ÛŒØ§ÙØª ÙˆØ¶Ø¹ÛŒØª Ù…Ø§Ù„ÛŒ Ø´Ø§Ú¯Ø±Ø¯' });
  }
});

router.post('/student/receipts', requireAuth, (req, res, next) => {
  upload.single('receipt')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'ÙÙ‚Ø· Ø´Ø§Ú¯Ø±Ø¯ Ù…ÛŒâ€ŒØªÙˆØ§Ù†Ø¯ Ø±Ø³ÛŒØ¯ Ø«Ø¨Øª Ú©Ù†Ø¯' });
    }
    const bill = await loadReceiptSubmissionBill(req);
    if (String(bill.student) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Ø§ÛŒÙ† Ø¨Ù„ Ù…Ø±Ø¨ÙˆØ· Ø¨Ù‡ Ø­Ø³Ø§Ø¨ Ø´Ù…Ø§ Ù†ÛŒØ³Øª' });
    }
    const draft = await parseReceiptSubmissionDraft(req);
    await ensureReceiptSubmissionAvailability({
      bill,
      amount: draft.amount,
      paymentMethod: draft.normalizedMethod,
      paidAt: draft.paidAt,
      referenceNo: draft.referenceNo
    });
    const receipt = await createReceiptSubmissionRecord({
      req,
      bill,
      paidAt: draft.paidAt,
      amount: draft.amount,
      paymentMethod: draft.normalizedMethod,
      referenceNo: draft.referenceNo,
      note: draft.note,
      actorType: 'student'
    });

    res.status(201).json({ success: true, receipt, message: 'Ø±Ø³ÛŒØ¯ Ø«Ø¨Øª Ø´Ø¯ Ùˆ Ø¯Ø± Ø§Ù†ØªØ¸Ø§Ø± ØªØ§ÛŒÛŒØ¯ Ø§Ø³Øª' });
  } catch (error) {
    res.status(error?.status || 500).json({
      success: false,
      message: error?.message || 'Ø®Ø·Ø§ Ø¯Ø± Ø«Ø¨Øª Ø±Ø³ÛŒØ¯',
      ...(error?.availableAmount != null ? { availableAmount: error.availableAmount } : {}),
      ...(error?.pendingReceiptId ? { pendingReceiptId: error.pendingReceiptId } : {}),
      ...(error?.duplicateReceiptId ? { duplicateReceiptId: error.duplicateReceiptId } : {})
    });
  }
});

router.post('/parent/receipts', requireAuth, (req, res, next) => {
  upload.single('receipt')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ success: false, message: 'فقط ولی/سرپرست می‌تواند رسید ثبت کند' });
    }

    const bill = await loadReceiptSubmissionBill(req);
    const hasAccess = await parentCanSubmitReceiptForBill(req.user.id, bill);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'این بل مربوط به متعلم وصل‌شده به حساب شما نیست' });
    }

    const draft = await parseReceiptSubmissionDraft(req);
    await ensureReceiptSubmissionAvailability({
      bill,
      amount: draft.amount,
      paymentMethod: draft.normalizedMethod,
      paidAt: draft.paidAt,
      referenceNo: draft.referenceNo
    });

    const receipt = await createReceiptSubmissionRecord({
      req,
      bill,
      paidAt: draft.paidAt,
      amount: draft.amount,
      paymentMethod: draft.normalizedMethod,
      referenceNo: draft.referenceNo,
      note: draft.note,
      actorType: 'parent'
    });

    return res.status(201).json({
      success: true,
      receipt,
      message: 'رسید توسط ولی/سرپرست ثبت شد و در انتظار تایید مالی است'
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      success: false,
      message: error?.message || 'خطا در ثبت رسید توسط ولی/سرپرست',
      ...(error?.availableAmount != null ? { availableAmount: error.availableAmount } : {}),
      ...(error?.pendingReceiptId ? { pendingReceiptId: error.pendingReceiptId } : {}),
      ...(error?.duplicateReceiptId ? { duplicateReceiptId: error.duplicateReceiptId } : {})
    });
  }
});

router.post('/parent/payments', requireAuth, (req, res, next) => {
  upload.single('receipt')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({ success: false, message: 'فقط ولی/سرپرست می‌تواند پرداخت canonical ثبت کند' });
    }

    const context = await loadParentCanonicalPaymentContext(req);
    const draft = await parseReceiptSubmissionDraft(req);
    const item = await createCanonicalPaymentSubmissionRecord({
      req,
      membership: context.membership,
      feeOrder: context.feeOrder,
      draft,
      actorType: 'parent'
    });

    return res.status(201).json({
      success: true,
      item,
      message: 'پرداخت مالی ثبت شد و در انتظار تایید مالی قرار گرفت'
    });
  } catch (error) {
    const code = String(error?.message || '');
    const mappedStatus = mapCanonicalPaymentErrorStatus(code);
    return res.status(error?.status || mappedStatus).json({
      success: false,
      message: error?.status ? error.message : mapCanonicalPaymentErrorMessage(code)
    });
  }
});

router.get('/admin/reports/aging', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const { classId = '', courseId = '' } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/reports/aging?classId=${scope.classId}`);
    }

    const now = new Date();
    const filter = { status: { $ne: 'void' } };
    if (scope.classId) filter.classId = scope.classId;

    const [items, reliefRows] = await Promise.all([
      FeeOrder.find(filter)
      .populate('student', 'name')
      .populate('studentId', 'fullName')
      .populate('classId', 'title code gradeLevel section')
      .sort({ dueDate: 1 }),
      FinanceRelief.aggregate([
        { $match: { status: 'active', ...(scope.classId ? { classId: scope.classId } : {}) } },
        {
          $group: {
            _id: '$coverageMode',
            count: { $sum: 1 },
            total: { $sum: '$amount' }
          }
        }
      ])
    ]);

    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_plus: 0 };
    const rows = [];
    let totalRemaining = 0;

    for (const bill of items) {
      const remaining = Math.max(0, Number(bill.outstandingAmount || 0));
      if (remaining <= 0) continue;
      totalRemaining += remaining;
      const lateDays = bill.dueDate ? Math.floor((now.getTime() - new Date(bill.dueDate).getTime()) / (24 * 60 * 60 * 1000)) : 0;
      if (lateDays <= 0) buckets.current += remaining;
      else if (lateDays <= 30) buckets.d1_30 += remaining;
      else if (lateDays <= 60) buckets.d31_60 += remaining;
      else buckets.d61_plus += remaining;

      rows.push({
        billId: bill._id,
        billNumber: bill.orderNumber,
        classId: bill.classId?._id || bill.classId || '',
        schoolClass: serializeSchoolClassLite(bill.classId || null),
        class: bill.classId?.title || 'Class',
        student: bill.studentId?.fullName || bill.student?.name || 'شاگرد',
        course: bill.classId?.title || 'صنف',
        dueDate: bill.dueDate,
        lateDays: Math.max(0, lateDays),
        remaining
      });
    }

    const reliefSummary = {
      activeCount: 0,
      fixedAmount: 0,
      percentCount: 0,
      fullCount: 0
    };
    reliefRows.forEach((row) => {
      const mode = String(row?._id || '').trim();
      const count = Number(row?.count || 0);
      const total = Number(row?.total || 0);
      reliefSummary.activeCount += count;
      if (mode === 'fixed') reliefSummary.fixedAmount += total;
      else if (mode === 'percent') reliefSummary.percentCount += count;
      else if (mode === 'full') reliefSummary.fullCount += count;
    });

    res.json({ success: true, buckets, totalRemaining, rows: rows.slice(0, 300), reliefSummary });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ú¯Ø²Ø§Ø±Ø´ Ù…Ø¹ÙˆÙ‚Ø§Øª' });
  }
});

router.get('/admin/reports/cashflow', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const { classId = '', courseId = '' } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/reports/cashflow?classId=${scope.classId}`);
    }

    const from = parseDateSafe(req.query?.from, new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)));
    const to = parseDateSafe(req.query?.to, new Date());
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);

    const approvedMatch = { status: 'approved', paidAt: { $gte: from, $lte: end } };
    const pendingMatch = { status: 'pending', paidAt: { $gte: from, $lte: end } };
    const reliefMatch = { status: 'active', createdAt: { $gte: from, $lte: end } };
    if (scope.classId) {
      approvedMatch.classId = scope.classId;
      pendingMatch.classId = scope.classId;
      reliefMatch.classId = scope.classId;
    }

    const [rows, pendingRows, reliefRows] = await Promise.all([
      FeePayment.aggregate([
        { $match: approvedMatch },
        {
          $group: {
            _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' }, d: { $dayOfMonth: '$paidAt' } },
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } }
      ]),
      FeePayment.aggregate([
        { $match: pendingMatch },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      FinanceRelief.aggregate([
        { $match: reliefMatch },
        { $group: { _id: '$coverageMode', total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ])
    ]);

    const items = rows.map((row) => ({
      date: `${row._id.y}-${String(row._id.m).padStart(2, '0')}-${String(row._id.d).padStart(2, '0')}`,
      total: row.total,
      count: row.count
    }));
    const total = items.reduce((sum, item) => sum + item.total, 0);
    const reliefSummary = {
      activeCount: 0,
      fixedAmount: 0,
      percentCount: 0,
      fullCount: 0
    };
    reliefRows.forEach((row) => {
      const mode = String(row?._id || '').trim();
      const count = Number(row?.count || 0);
      const value = Number(row?.total || 0);
      reliefSummary.activeCount += count;
      if (mode === 'fixed') reliefSummary.fixedAmount += value;
      else if (mode === 'percent') reliefSummary.percentCount += count;
      else if (mode === 'full') reliefSummary.fullCount += count;
    });
    res.json({
      success: true,
      from,
      to: end,
      total,
      items,
      pendingTotal: Number(pendingRows[0]?.total || 0),
      pendingCount: Number(pendingRows[0]?.count || 0),
      reliefSummary
    });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ú¯Ø²Ø§Ø±Ø´ Ø¬Ø±ÛŒØ§Ù† Ù†Ù‚Ø¯ÛŒ' });
  }
});

router.get('/admin/reports/by-class', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const { classId = '', courseId = '' } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/reports/by-class?classId=${scope.classId}`);
    }

    const report = await runReport('fee_collection_by_class', { classId: scope.classId || '' });
    const items = Array.isArray(report?.rows)
      ? report.rows.map((row) => ({
          classId: row.classId || row.schoolClass?.id || '',
          schoolClass: { title: row.classTitle || 'صنف' },
          course: row.classTitle || 'صنف',
          bills: Number(row.orderCount || 0),
          due: Number(row.totalDue || 0),
          paid: Number(row.approvedAmount || 0),
          remaining: Number(row.totalOutstanding || 0),
          reliefCount: Number(row.reliefCount || 0),
          fixedReliefAmount: Number(row.fixedReliefAmount || 0),
          fullReliefCount: Number(row.fullReliefCount || 0)
        }))
      : await listFinanceClassReportItems(scope);
    res.json({ success: true, items, summary: report?.summary || null });
  } catch {
    res.status(500).json({ success: false, message: 'Error while loading class finance report' });
  }
});

router.get('/admin/reports/by-course', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    setLegacyScopeHeaders(res, '/api/finance/admin/reports/by-class');
    return res.status(410).json({
      success: false,
      retired: true,
      message: 'Legacy course finance report has been retired. Use /api/finance/admin/reports/by-class instead.',
      replacementEndpoint: '/api/finance/admin/reports/by-class'
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error while loading legacy course finance report' });
  }
});

router.get('/admin/reports/discounts', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const { classId = '', courseId = '' } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/reports/discounts?classId=${scope.classId}`);
    }
    const report = await runReport('fee_discount_exemption_overview', { classId: scope.classId || '' });
    const grouped = new Map();
    (Array.isArray(report?.rows) ? report.rows : []).forEach((row) => {
      const key = String(row?.benefitType || row?.recordType || 'relief').trim() || 'relief';
      const current = grouped.get(key) || { _id: key, total: 0, count: 0 };
      current.total += Number(row?.amount || 0);
      current.count += 1;
      grouped.set(key, current);
    });
    const items = Array.from(grouped.values()).sort((left, right) => right.total - left.total);
    res.json({ success: true, items, summary: report?.summary || null });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ú¯Ø²Ø§Ø±Ø´ ØªØ®ÙÛŒÙâ€ŒÙ‡Ø§' });
  }
});

router.get('/admin/reports/audit-timeline', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const {
      classId = '',
      courseId = '',
      q = '',
      kind = 'all',
      severity = 'all',
      limit = 120
    } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/reports/audit-timeline?classId=${scope.classId}`);
    }

    const timeline = await buildFinanceAuditTimeline({
      scope,
      limit,
      q,
      kind,
      severity
    });

    res.json({
      success: true,
      items: timeline.items,
      summary: timeline.summary,
      appliedFilters: timeline.appliedFilters,
      generatedAt: new Date().toISOString()
    });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در گزارش timeline حسابرسی مالی' });
  }
});

router.get('/admin/reports/anomalies', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const {
      classId = '',
      courseId = '',
      severity = 'all',
      type = 'all',
      q = '',
      limit = 120
    } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/reports/anomalies?classId=${scope.classId}`);
    }

    const asOf = parseDateSafe(req.query?.asOf, new Date());
    const report = await buildFinanceAnomalyReport({
      classId: scope.classId || '',
      academicYearId: String(req.query?.academicYearId || '').trim(),
      studentMembershipId: String(req.query?.studentMembershipId || '').trim(),
      asOf,
      limit
    });

    const searchTerm = String(q || '').trim().toLowerCase();
    const normalizedSeverity = String(severity || 'all').trim().toLowerCase();
    const normalizedType = String(type || 'all').trim();
    const filteredItems = (Array.isArray(report?.items) ? report.items : []).filter((item) => {
      if (normalizedSeverity !== 'all' && String(item?.severity || '').trim().toLowerCase() !== normalizedSeverity) return false;
      if (normalizedType !== 'all' && String(item?.anomalyType || '').trim() !== normalizedType) return false;
      if (!searchTerm) return true;
      const haystack = [
        item?.title,
        item?.description,
        item?.studentName,
        item?.classTitle,
        item?.academicYearTitle,
        item?.referenceNumber,
        item?.secondaryReference,
        ...(Array.isArray(item?.tags) ? item.tags : [])
      ].map((entry) => String(entry || '').toLowerCase());
      return haystack.some((entry) => entry.includes(searchTerm));
    });
    const anomalyCases = await populateFinanceAnomalyCaseQuery(
      FinanceAnomalyCase.find(buildFinanceAnomalyCaseFilter({
        scope,
        academicYearId: String(req.query?.academicYearId || '').trim(),
        studentMembershipId: String(req.query?.studentMembershipId || '').trim(),
        anomalyIds: filteredItems.map((item) => item?.id)
      }))
    ).lean();
    const items = mergeFinanceAnomalyCases(filteredItems, anomalyCases, { asOf });

    return res.json({
      success: true,
      items,
      summary: buildFinanceAnomalySummary(items),
      appliedFilters: {
        ...(report?.appliedFilters || {}),
        q: String(q || '').trim(),
        severity: normalizedSeverity,
        type: normalizedType,
        limit: Math.max(1, Math.min(Number(limit) || 120, 500))
      },
      generatedAt: report?.generatedAt || new Date().toISOString()
    });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(code === 'finance_month_key_invalid' ? 400 : 500).json({
      success: false,
      message: code === 'finance_month_key_invalid' ? 'فرمت تاریخ یا ماه برای anomalies معتبر نیست.' : 'خطا در تحلیل ناهنجاری‌های مالی'
    });
  }
});

router.post('/admin/anomalies/:id/assign', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const actorLevel = normalizeAnomalyAssignedLevel(await resolveAdminActorLevel(req.user.id), 'finance_manager');
    const note = String(req.body?.note || '').trim();
    const assignedLevel = normalizeAnomalyAssignedLevel(req.body?.assignedLevel, actorLevel);
    const snapshot = req.body?.snapshot || {};
    const item = await ensureFinanceAnomalyCase({ anomalyId: req.params.id, snapshot });
    const now = new Date();

    if (item.status === 'resolved') {
      item.resolvedAt = null;
      item.resolvedBy = null;
      item.resolutionNote = '';
    }
    item.status = 'assigned';
    item.assignedLevel = assignedLevel;
    item.snoozedUntil = null;
    item.latestNote = note;
    item.latestActionAt = now;
    item.latestActionBy = req.user.id;
    appendFinanceAnomalyHistory(item, {
      action: 'assigned',
      actorId: req.user.id,
      status: 'assigned',
      note,
      assignedLevel,
      at: now
    });
    await item.save();

    await logActivity({
      req,
      action: resolveFinanceAnomalyActionTitle('assign'),
      targetType: 'FinanceAnomalyCase',
      targetId: item._id.toString(),
      meta: {
        anomalyId: item.anomalyId,
        anomalyType: item.anomalyType,
        assignedLevel,
        note,
        classId: item.classId,
        studentMembershipId: item.studentMembershipId
      }
    });

    const refreshed = await buildFinanceAnomalyResponseItem(item);
    return res.json({
      success: true,
      item: refreshed,
      message: 'ناهجاری مالی برای پیگیری ارجاع شد'
    });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(code === 'finance_anomaly_id_required' ? 400 : 500).json({
      success: false,
      message: code === 'finance_anomaly_id_required' ? 'شناسه ناهنجاری مالی معتبر نیست.' : 'ثبت ارجاع ناهنجاری مالی ممکن نشد'
    });
  }
});

router.post('/admin/anomalies/:id/snooze', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const note = String(req.body?.note || '').trim();
    const snoozedUntil = parseDateSafe(req.body?.snoozedUntil, null);
    if (!snoozedUntil) {
      return res.status(400).json({ success: false, message: 'تاریخ تعویق ناهنجاری مالی معتبر نیست.' });
    }
    const snapshot = req.body?.snapshot || {};
    const item = await ensureFinanceAnomalyCase({ anomalyId: req.params.id, snapshot });
    const now = new Date();

    if (item.status === 'resolved') {
      item.resolvedAt = null;
      item.resolvedBy = null;
      item.resolutionNote = '';
    }
    item.status = 'snoozed';
    item.snoozedUntil = snoozedUntil;
    item.latestNote = note;
    item.latestActionAt = now;
    item.latestActionBy = req.user.id;
    appendFinanceAnomalyHistory(item, {
      action: 'snoozed',
      actorId: req.user.id,
      status: 'snoozed',
      note,
      assignedLevel: item.assignedLevel || '',
      snoozedUntil,
      at: now
    });
    await item.save();

    await logActivity({
      req,
      action: resolveFinanceAnomalyActionTitle('snooze'),
      targetType: 'FinanceAnomalyCase',
      targetId: item._id.toString(),
      meta: {
        anomalyId: item.anomalyId,
        anomalyType: item.anomalyType,
        snoozedUntil: snoozedUntil.toISOString(),
        note,
        classId: item.classId,
        studentMembershipId: item.studentMembershipId
      }
    });

    const refreshed = await buildFinanceAnomalyResponseItem(item);
    return res.json({
      success: true,
      item: refreshed,
      message: 'ناهجاری مالی تا زمان تعیین‌شده معطل شد'
    });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(code === 'finance_anomaly_id_required' ? 400 : 500).json({
      success: false,
      message: code === 'finance_anomaly_id_required' ? 'شناسه ناهنجاری مالی معتبر نیست.' : 'تعویق ناهنجاری مالی ممکن نشد'
    });
  }
});

router.post('/admin/anomalies/:id/resolve', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const note = String(req.body?.note || '').trim();
    const snapshot = req.body?.snapshot || {};
    const item = await ensureFinanceAnomalyCase({ anomalyId: req.params.id, snapshot });
    const now = new Date();

    item.status = 'resolved';
    item.snoozedUntil = null;
    item.resolvedAt = now;
    item.resolvedBy = req.user.id;
    item.resolutionNote = note;
    item.latestNote = note;
    item.latestActionAt = now;
    item.latestActionBy = req.user.id;
    appendFinanceAnomalyHistory(item, {
      action: 'resolved',
      actorId: req.user.id,
      status: 'resolved',
      note,
      assignedLevel: item.assignedLevel || '',
      at: now
    });
    await item.save();

    await logActivity({
      req,
      action: resolveFinanceAnomalyActionTitle('resolve'),
      targetType: 'FinanceAnomalyCase',
      targetId: item._id.toString(),
      meta: {
        anomalyId: item.anomalyId,
        anomalyType: item.anomalyType,
        note,
        classId: item.classId,
        studentMembershipId: item.studentMembershipId
      }
    });

    const refreshed = await buildFinanceAnomalyResponseItem(item);
    return res.json({
      success: true,
      item: refreshed,
      message: 'ناهجاری مالی به‌عنوان حل‌شده ثبت شد'
    });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(code === 'finance_anomaly_id_required' ? 400 : 500).json({
      success: false,
      message: code === 'finance_anomaly_id_required' ? 'شناسه ناهنجاری مالی معتبر نیست.' : 'حل ناهنجاری مالی ممکن نشد'
    });
  }
});

router.post('/admin/anomalies/:id/note', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const note = String(req.body?.note || '').trim();
    if (!note) {
      return res.status(400).json({ success: false, message: 'یادداشت ناهنجاری مالی نمی‌تواند خالی باشد.' });
    }
    const snapshot = req.body?.snapshot || {};
    const item = await ensureFinanceAnomalyCase({ anomalyId: req.params.id, snapshot });
    const now = new Date();

    item.latestNote = note;
    item.latestActionAt = now;
    item.latestActionBy = req.user.id;
    appendFinanceAnomalyHistory(item, {
      action: 'noted',
      actorId: req.user.id,
      status: normalizeFinanceAnomalyWorkflowStatus(item.status, 'open'),
      note,
      assignedLevel: item.assignedLevel || '',
      snoozedUntil: item.snoozedUntil || null,
      at: now
    });
    await item.save();

    await logActivity({
      req,
      action: resolveFinanceAnomalyActionTitle('note'),
      targetType: 'FinanceAnomalyCase',
      targetId: item._id.toString(),
      meta: {
        anomalyId: item.anomalyId,
        anomalyType: item.anomalyType,
        note,
        classId: item.classId,
        studentMembershipId: item.studentMembershipId
      }
    });

    const refreshed = await buildFinanceAnomalyResponseItem(item);
    return res.json({
      success: true,
      item: refreshed,
      message: 'یادداشت ناهنجاری مالی ذخیره شد'
    });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(code === 'finance_anomaly_id_required' ? 400 : 500).json({
      success: false,
      message: code === 'finance_anomaly_id_required' ? 'شناسه ناهنجاری مالی معتبر نیست.' : 'ثبت یادداشت ناهنجاری مالی ممکن نشد'
    });
  }
});

router.get('/admin/reports/audit-package.csv', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const {
      classId = '',
      courseId = '',
      q = '',
      kind = 'all',
      severity = 'all',
      limit = 500
    } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/reports/audit-package.csv?classId=${scope.classId}`);
    }

    const timeline = await buildFinanceAuditTimeline({
      scope,
      limit,
      q,
      kind,
      severity
    });

    const rows = [[
      'At',
      'Kind',
      'Event',
      'Severity',
      'ActionRequired',
      'Student',
      'Class',
      'AcademicYear',
      'Reference',
      'SecondaryReference',
      'Amount',
      'Status',
      'Source',
      'Actor',
      'Title',
      'Description',
      'Reason',
      'Note',
      'Tags',
      'AttachmentUrl'
    ]];

    timeline.items.forEach((item) => {
      rows.push([
        item.at ? new Date(item.at).toISOString() : '',
        item.kind || '',
        item.eventKey || '',
        item.severity || '',
        item.actionRequired ? 'yes' : 'no',
        item.studentName || '',
        item.classTitle || '',
        item.academicYearTitle || '',
        item.referenceNumber || '',
        item.secondaryReference || '',
        item.amountLabel || '',
        item.status || '',
        item.sourceLabel || '',
        item.actorName || '',
        item.title || '',
        item.description || '',
        item.reason || '',
        item.note || '',
        Array.isArray(item.tags) ? item.tags.join(' | ') : '',
        item.attachment?.fileUrl || ''
      ]);
    });

    const csv = rows.map((row) => row.map((col) => sanitizeCsv(col)).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="finance-audit-package.csv"');
    res.status(200).send(`\uFEFF${csv}`);
  } catch {
    res.status(500).json({ success: false, message: 'خطا در خروجی حسابرسی مالی' });
  }
});

router.get('/admin/reports/export.csv', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const { status = '', classId = '', courseId = '' } = req.query || {};
    const scope = await resolveFinanceScope({ classId, courseId });
    if (scope.error) return res.status(400).json({ success: false, message: scope.error });
    if (normalizeScopeText(courseId) && !normalizeScopeText(classId) && scope.classId) {
      setLegacyScopeHeaders(res, `/api/finance/admin/reports/export.csv?classId=${scope.classId}`);
    }
    const filter = {};
    if (status) filter.status = status;
    addFilterClause(filter, buildScopedCourseFilter(scope));
    const items = await FinanceBill.find(filter)
      .populate('student', 'name email')
      .populate('course', 'title')
      .populate('classId', 'title code gradeLevel section')
      .sort({ createdAt: -1 })
      .limit(5000);

    const rows = [['BillNumber', 'Student', 'Email', 'Class', 'Course', 'Status', 'AmountDue', 'AmountPaid', 'Remaining', 'DueDate', 'IssuedAt']];
    items.forEach((item) => {
      rows.push([
        item.billNumber,
        item.student?.name || '',
        item.student?.email || '',
        item.classId?.title || '',
        item.course?.title || '',
        item.status,
        item.amountDue,
        item.amountPaid,
        Math.max(0, (item.amountDue || 0) - (item.amountPaid || 0)),
        item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : '',
        item.issuedAt ? new Date(item.issuedAt).toISOString().slice(0, 10) : ''
      ]);
    });

    const csv = rows.map((row) => row.map((col) => sanitizeCsv(col)).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=\"finance-report.csv\"');
    res.status(200).send(`\uFEFF${csv}`);
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø®Ø±ÙˆØ¬ÛŒ CSV' });
  }
});

router.get('/admin/month-close', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const actorLevel = await resolveAdminActorLevel(req.user.id);
    const items = await populateFinanceMonthCloseQuery(
      FinanceMonthClose.find()
    )
      .sort({ monthKey: -1 })
      .limit(36);
    res.json({ success: true, items: items.map((item) => serializeFinanceMonthClose(item, actorLevel)) });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø¯Ø±ÛŒØ§ÙØª Ù…Ø§Ù‡â€ŒÙ‡Ø§ÛŒ Ø¨Ø³ØªÙ‡ Ø´Ø¯Ù‡' });
  }
});

router.get('/admin/month-close/:id', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const actorLevel = await resolveAdminActorLevel(req.user.id);
    const item = await populateFinanceMonthCloseQuery(
      FinanceMonthClose.findById(req.params.id)
    );
    if (!item) {
      return res.status(404).json({ success: false, message: 'ماه مالی موردنظر پیدا نشد.' });
    }
    return res.json({ success: true, item: serializeFinanceMonthClose(item, actorLevel) });
  } catch {
    return res.status(500).json({ success: false, message: 'خطا در دریافت جزئیات بستن ماه مالی' });
  }
});

router.post('/admin/month-close', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const actorLevel = await resolveAdminActorLevel(req.user.id);
    const monthKey = String(req.body?.monthKey || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
      return res.status(400).json({ success: false, message: 'ÙØ±Ù…Øª Ù…Ø§Ù‡ Ø¨Ø§ÛŒØ¯ YYYY-MM Ø¨Ø§Ø´Ø¯' });
    }
    const requestNote = String(req.body?.note || '').trim();
    const { startAt, endAt } = toMonthDateRange(monthKey);
    let snapshotFallback = false;
    let snapshot = null;
    const anomalyCases = await populateFinanceAnomalyCaseQuery(
      FinanceAnomalyCase.find({}).sort({ updatedAt: -1 }).limit(500)
    ).lean();
    try {
      snapshot = await buildFinanceMonthCloseSnapshot(monthKey, { anomalyCases });
    } catch {
      snapshotFallback = true;
      snapshot = {
        generatedAt: new Date().toISOString(),
        monthKey,
        window: {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString()
        },
        totals: {
          ordersIssuedCount: 0,
          ordersIssuedAmount: 0,
          approvedPaymentCount: 0,
          approvedPaymentAmount: 0,
          pendingPaymentCount: 0,
          pendingPaymentAmount: 0,
          standingDueAmount: 0,
          standingPaidAmount: 0,
          standingOutstandingAmount: 0,
          overdueOrders: 0,
          activeMemberships: 0,
          activeReliefs: 0,
          fixedReliefAmount: 0,
          percentReliefs: 0,
          fullReliefs: 0
        },
        aging: {
          buckets: { current: 0, d1_30: 0, d31_60: 0, d61_plus: 0 },
          totalRemaining: 0,
          rows: []
        },
        cashflow: {
          approvedTotal: 0,
          approvedCount: 0,
          pendingTotal: 0,
          pendingCount: 0,
          items: []
        },
        readiness: {
          readyToApprove: true,
          blockingIssues: [],
          warningIssues: []
        },
        classes: [],
        anomalies: {
          summary: { total: 0, critical: 0, warning: 0, info: 0, actionRequired: 0, byType: {} },
          items: []
        }
      };
    }
    const exists = await FinanceMonthClose.findOne({ monthKey });
    if (exists && exists.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Ø§ÛŒÙ† Ù…Ø§Ù‡ Ù‚Ø¨Ù„Ø§ Ø¨Ø³ØªÙ‡ Ø´Ø¯Ù‡ Ø§Ø³Øª' });
    }
    if (exists && exists.status === 'pending_review') {
      return res.status(409).json({ success: false, message: 'این ماه مالی قبلاً برای بررسی ثبت شده و هنوز در جریان تایید است.' });
    }

    let item = exists;
    if (item) {
      item.status = 'pending_review';
      item.approvalStage = MONTH_CLOSE_APPROVAL_STAGES.financeManager;
      item.requestedBy = req.user.id;
      item.requestedAt = new Date();
      item.requestNote = requestNote;
      item.note = requestNote;
      item.closeWindow = { startAt, endAt };
      item.snapshot = snapshot;
      item.closedBy = null;
      item.closedAt = null;
      item.approvedBy = null;
      item.approvedAt = null;
      item.rejectedBy = null;
      item.rejectedAt = null;
      item.rejectReason = '';
      item.approvalTrail = [{
        level: normalizeAdminLevel(actorLevel || 'finance_manager'),
        action: 'submit',
        by: req.user.id,
        at: new Date(),
        note: requestNote,
        reason: ''
      }];
      item.history = Array.isArray(item.history) ? item.history : [];
      item.history.push({
        action: 'requested',
        by: req.user.id,
        at: new Date(),
        note: requestNote
      });
      await item.save();
    } else {
      item = await FinanceMonthClose.create({
        monthKey,
        status: 'pending_review',
        approvalStage: MONTH_CLOSE_APPROVAL_STAGES.financeManager,
        requestedBy: req.user.id,
        requestedAt: new Date(),
        requestNote,
        note: requestNote,
        closeWindow: { startAt, endAt },
        snapshot,
        approvalTrail: [{
          level: normalizeAdminLevel(actorLevel || 'finance_manager'),
          action: 'submit',
          by: req.user.id,
          at: new Date(),
          note: requestNote,
          reason: ''
        }],
        history: [{
          action: 'requested',
          by: req.user.id,
          at: new Date(),
          note: requestNote
        }]
      });
    }

    let targetAdmins = await findAdminsByLevels(['finance_manager'], req.user.id);
    if (!targetAdmins.length) {
      targetAdmins = await findAdminsByLevels(['finance_lead', 'general_president'], req.user.id);
    }
    await notifyAdmins({
      req,
      admins: targetAdmins,
      title: 'درخواست بستن ماه مالی',
      message: `ماه ${monthKey} برای بررسی و بستن مالی ثبت شد.`,
      type: 'finance'
    });

    await logActivity({
      req,
      action: 'finance_submit_month_close',
      targetType: 'FinanceMonthClose',
      targetId: item._id.toString(),
      meta: {
        monthKey,
        level: actorLevel,
        note: requestNote,
        snapshotStatus: snapshotFallback ? 'fallback' : 'ready',
        totals: snapshot?.totals || {},
        readiness: snapshot?.readiness || {}
      }
    });

    const refreshed = await populateFinanceMonthCloseQuery(
      FinanceMonthClose.findById(item._id)
    );

    res.status(201).json({
      success: true,
      item: serializeFinanceMonthClose(refreshed, actorLevel),
      message: getMonthCloseStageMessage(MONTH_CLOSE_APPROVAL_STAGES.financeManager)
    });
  } catch (error) {
    const code = String(error?.message || '');
    res.status(code === 'finance_month_key_invalid' ? 400 : 500).json({
      success: false,
      message: code === 'finance_month_key_invalid' ? 'فرمت ماه مالی معتبر نیست.' : 'Ø®Ø·Ø§ Ø¯Ø± Ø¨Ø³ØªÙ† Ù…Ø§Ù‡ Ù…Ø§Ù„ÛŒ'
    });
  }
});

router.post('/admin/month-close/:id/approve', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const actorLevel = await resolveAdminActorLevel(req.user.id);
    const item = await FinanceMonthClose.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'ماه مالی موردنظر پیدا نشد.' });
    }
    if (String(item.status || '').trim() !== 'pending_review') {
      return res.status(400).json({ success: false, message: 'این ماه مالی در مرحله قابل تایید قرار ندارد.' });
    }

    const currentStage = normalizeMonthCloseApprovalStage(item.approvalStage || '');
    if (!canReviewMonthCloseStage(actorLevel, currentStage)) {
      return res.status(403).json({ success: false, message: 'سطح مدیریتی شما برای این مرحله مجاز نیست.' });
    }
    if (actorAlreadyReviewedMonthClose(item.approvalTrail, req.user.id)) {
      return res.status(409).json({ success: false, message: 'این ماه مالی قبلاً توسط شما بازبینی شده است.' });
    }

    const note = String(req.body?.note || '').trim();
    appendMonthCloseApprovalTrail(item, {
      level: normalizeAdminLevel(actorLevel || 'finance_manager'),
      action: 'approve',
      by: req.user.id,
      note
    });
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({
      action: 'approved',
      by: req.user.id,
      at: new Date(),
      note
    });

    const nextStage = getNextMonthCloseStage(actorLevel, currentStage);
    let message = 'درخواست بستن ماه مالی تایید شد.';
    if (!nextStage || nextStage === MONTH_CLOSE_APPROVAL_STAGES.completed) {
      item.status = 'closed';
      item.approvalStage = MONTH_CLOSE_APPROVAL_STAGES.completed;
      item.approvedBy = req.user.id;
      item.approvedAt = new Date();
      item.closedBy = req.user.id;
      item.closedAt = new Date();
      item.history.push({
        action: 'closed',
        by: req.user.id,
        at: new Date(),
        note
      });
      message = `ماه مالی ${item.monthKey} بسته شد`;
    } else {
      item.status = 'pending_review';
      item.approvalStage = nextStage;
      let targetAdmins = await findAdminsByLevels([getRequiredLevelForMonthCloseStage(nextStage)], req.user.id);
      if (!targetAdmins.length) {
        targetAdmins = await findAdminsByLevels(['general_president'], req.user.id);
      }
      await notifyAdmins({
        req,
        admins: targetAdmins,
        title: 'مرحله بعدی بستن ماه مالی',
        message: `ماه ${item.monthKey} به مرحله ${nextStage} رسید و در انتظار بررسی شما است.`,
        type: 'finance'
      });
      message = getMonthCloseStageMessage(nextStage);
    }

    await item.save();

    await logActivity({
      req,
      action: nextStage === MONTH_CLOSE_APPROVAL_STAGES.completed ? 'finance_close_month' : 'finance_approve_month_close',
      targetType: 'FinanceMonthClose',
      targetId: item._id.toString(),
      meta: {
        monthKey: item.monthKey,
        actorLevel,
        nextStage,
        closed: nextStage === MONTH_CLOSE_APPROVAL_STAGES.completed,
        note
      }
    });

    const refreshed = await populateFinanceMonthCloseQuery(
      FinanceMonthClose.findById(item._id)
    );
    return res.json({
      success: true,
      item: serializeFinanceMonthClose(refreshed, actorLevel),
      message
    });
  } catch {
    return res.status(500).json({ success: false, message: 'خطا در تایید ماه مالی' });
  }
});

router.post('/admin/month-close/:id/reject', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const actorLevel = await resolveAdminActorLevel(req.user.id);
    const item = await FinanceMonthClose.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'ماه مالی موردنظر پیدا نشد.' });
    }
    if (String(item.status || '').trim() !== 'pending_review') {
      return res.status(400).json({ success: false, message: 'این ماه مالی در مرحله قابل رد قرار ندارد.' });
    }

    const currentStage = normalizeMonthCloseApprovalStage(item.approvalStage || '');
    if (!canReviewMonthCloseStage(actorLevel, currentStage)) {
      return res.status(403).json({ success: false, message: 'سطح مدیریتی شما برای رد این مرحله مجاز نیست.' });
    }
    if (actorAlreadyReviewedMonthClose(item.approvalTrail, req.user.id)) {
      return res.status(409).json({ success: false, message: 'این ماه مالی قبلاً توسط شما بازبینی شده است.' });
    }

    const reason = String(req.body?.reason || req.body?.note || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'برای رد درخواست بستن ماه مالی، دلیل الزامی است.' });
    }

    appendMonthCloseApprovalTrail(item, {
      level: normalizeAdminLevel(actorLevel || 'finance_manager'),
      action: 'reject',
      by: req.user.id,
      reason
    });
    item.status = 'rejected';
    item.approvalStage = MONTH_CLOSE_APPROVAL_STAGES.rejected;
    item.rejectedBy = req.user.id;
    item.rejectedAt = new Date();
    item.rejectReason = reason;
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({
      action: 'rejected',
      by: req.user.id,
      at: new Date(),
      note: reason
    });
    await item.save();

    const requestAudience = [item.requestedBy].filter(Boolean).map((userId) => ({ _id: userId }));
    await notifyAdmins({
      req,
      admins: requestAudience,
      title: 'درخواست بستن ماه مالی رد شد',
      message: `ماه ${item.monthKey} برای اصلاحات برگشت داده شد.`,
      type: 'finance'
    });

    await logActivity({
      req,
      action: 'finance_reject_month_close',
      targetType: 'FinanceMonthClose',
      targetId: item._id.toString(),
      meta: {
        monthKey: item.monthKey,
        actorLevel,
        reason
      }
    });

    const refreshed = await populateFinanceMonthCloseQuery(
      FinanceMonthClose.findById(item._id)
    );
    return res.json({
      success: true,
      item: serializeFinanceMonthClose(refreshed, actorLevel),
      message: `درخواست بستن ماه مالی ${item.monthKey} رد شد`
    });
  } catch {
    return res.status(500).json({ success: false, message: 'خطا در رد درخواست بستن ماه مالی' });
  }
});

router.get('/admin/month-close/:id/export.csv', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await FinanceMonthClose.findById(req.params.id).lean();
    if (!item) {
      return res.status(404).json({ success: false, message: 'ماه مالی موردنظر پیدا نشد.' });
    }
    const snapshot = item?.snapshot || {};
    const rows = [
      ['MonthKey', item.monthKey || ''],
      ['Status', item.status || ''],
      ['ApprovalStage', item.approvalStage || ''],
      ['GeneratedAt', snapshot?.generatedAt || ''],
      ['OrdersIssuedCount', snapshot?.totals?.ordersIssuedCount || 0],
      ['OrdersIssuedAmount', snapshot?.totals?.ordersIssuedAmount || 0],
      ['ApprovedPaymentCount', snapshot?.totals?.approvedPaymentCount || 0],
      ['ApprovedPaymentAmount', snapshot?.totals?.approvedPaymentAmount || 0],
      ['PendingPaymentCount', snapshot?.totals?.pendingPaymentCount || 0],
      ['PendingPaymentAmount', snapshot?.totals?.pendingPaymentAmount || 0],
      ['StandingOutstandingAmount', snapshot?.totals?.standingOutstandingAmount || 0],
      ['OverdueOrders', snapshot?.totals?.overdueOrders || 0],
      ['CriticalAnomalies', snapshot?.anomalies?.summary?.critical || 0],
      ['ActionRequiredAnomalies', snapshot?.anomalies?.summary?.actionRequired || 0],
      ['ReadyToApprove', snapshot?.readiness?.readyToApprove === false ? 'false' : 'true']
    ];

    (Array.isArray(snapshot?.readiness?.blockingIssues) ? snapshot.readiness.blockingIssues : []).forEach((entry, index) => {
      rows.push([
        `BlockingIssue${index + 1}`,
        [entry?.label || '', entry?.count != null ? `count=${entry.count}` : '', entry?.amount != null ? `amount=${entry.amount}` : '']
          .filter(Boolean)
          .join(' | ')
      ]);
    });

    (Array.isArray(snapshot?.classes) ? snapshot.classes : []).slice(0, 12).forEach((row, index) => {
      rows.push([
        `Class${index + 1}`,
        [row?.title || 'Class', `due=${row?.totalDue || 0}`, `paid=${row?.totalPaid || 0}`, `outstanding=${row?.totalOutstanding || 0}`].join(' | ')
      ]);
    });

    const csv = rows.map((row) => row.map((col) => sanitizeCsv(col)).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="finance-month-close-${item.monthKey || 'snapshot'}.csv"`);
    return res.status(200).send(`\uFEFF${csv}`);
  } catch {
    return res.status(500).json({ success: false, message: 'خطا در خروجی snapshot ماه مالی' });
  }
});

router.get('/admin/month-close/:id/export.pdf', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await populateFinanceMonthCloseQuery(
      FinanceMonthClose.findById(req.params.id)
    );
    if (!item) {
      return res.status(404).json({ success: false, message: 'ماه مالی موردنظر پیدا نشد.' });
    }

    const descriptor = await buildFinanceDocumentDescriptor({
      req,
      documentType: 'month_close_pack'
    });
    const pdfBuffer = await buildMonthClosePdfBuffer(item, {
      documentNo: descriptor.documentNo,
      generatedByName: req.user?.name || req.user?.email || req.user?.role || 'system',
      verificationCode: descriptor.verificationCode,
      verificationUrl: descriptor.verificationUrl,
      verificationQrBuffer: descriptor.verificationQrBuffer
    });
    const filename = `finance-month-close-${item.monthKey || 'snapshot'}.pdf`;
    const archivedDocument = await createFinanceDocumentArchive({
      req,
      descriptor,
      documentType: 'month_close_pack',
      filename,
      buffer: pdfBuffer,
      title: `Finance month close ${String(item.monthKey || '').trim() || 'snapshot'}`,
      subjectName: `Month close ${String(item.monthKey || '').trim() || 'snapshot'}`,
      sourceMonthCloseId: item?._id || null,
      monthKey: item?.monthKey || '',
      meta: {
        status: item?.status || '',
        approvalStage: item?.approvalStage || '',
        approvedPaymentAmount: Number(item?.snapshot?.totals?.approvedPaymentAmount || 0),
        outstandingAmount: Number(item?.snapshot?.totals?.standingOutstandingAmount || 0)
      }
    });

    await logActivity({
      req,
      action: 'export_finance_month_close_pdf',
      targetType: 'FinanceMonthClose',
      targetId: String(item._id || ''),
      meta: {
        monthKey: String(item.monthKey || ''),
        filename
      }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Finance-Document-No', String(archivedDocument?.documentNo || descriptor.documentNo || ''));
    res.setHeader('X-Finance-Verification-Code', String(archivedDocument?.verification?.code || descriptor.verificationCode || ''));
    return res.status(200).send(pdfBuffer);
  } catch {
    return res.status(500).json({ success: false, message: 'خطا در خروجی PDF ماه مالی' });
  }
});

router.get('/documents/verify/:verificationCode', async (req, res) => {
  try {
    const item = await verifyFinanceDocumentArchive({
      verificationCode: req.params.verificationCode,
      req
    });
    if (!item) {
      return res.status(404).json({ success: false, message: 'سند مالی با این کد اعتبارسنجی پیدا نشد.' });
    }

    return res.json({
      success: true,
      item: {
        documentNo: item.documentNo,
        documentType: item.documentType,
        title: item.title,
        subjectName: item.subjectName,
        membershipLabel: item.membershipLabel,
        batchLabel: item.batchLabel,
        filename: item.filename,
        status: item.status,
        generatedAt: item.generatedAt,
        generatedBy: item.generatedBy,
        sizeBytes: item.sizeBytes,
        sha256: item.sha256,
        classTitle: item.classTitle,
        academicYearTitle: item.academicYearTitle,
        monthKey: item.monthKey,
        childDocuments: Array.isArray(item.childDocuments) ? item.childDocuments : [],
        verification: item.verification,
        verifyCount: Number(item.verifyCount || 0),
        downloadCount: Number(item.downloadCount || 0),
        lastDownloadedAt: item.lastDownloadedAt || null,
        lastVerifiedAt: item.lastVerifiedAt || null
      }
    });
  } catch {
    return res.status(500).json({ success: false, message: 'اعتبارسنجی سند مالی ناموفق بود.' });
  }
});

router.post('/delivery/providers/:provider/status', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const expectedToken = normalizeScopeText(process.env.FINANCE_DELIVERY_PROVIDER_WEBHOOK_TOKEN || '');
    const providerTokens = await listFinanceDeliveryProviderWebhookTokens(req.params.provider);
    const providedToken = normalizeScopeText(
      req.headers['x-finance-webhook-token']
      || req.query?.token
      || req.body?.token
      || ''
    );
    const acceptedTokens = Array.from(new Set([expectedToken, ...providerTokens].filter(Boolean)));
    if (acceptedTokens.length && !acceptedTokens.includes(providedToken)) {
      return res.status(403).json({ success: false, message: 'Webhook token معتبر نیست.' });
    }
    const result = await ingestFinanceDeliveryProviderWebhook({
      providerKey: req.params.provider,
      payload: req.body || {},
      req
    });
    return res.status(result?.processedCount ? 200 : 202).json({
      success: true,
      result,
      message: result?.processedCount
        ? 'وضعیت delivery provider همگام شد.'
        : 'Webhook دریافت شد اما موردی برای همگام‌سازی پیدا نشد.'
    });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'Webhook delivery provider ناموفق بود.'
    });
  }
});

router.get('/admin/delivery-providers', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await listFinanceDeliveryProviderConfigs({ req });
    return res.json({ success: true, items });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت تنظیمات providerهای delivery ناموفق بود.' });
  }
});

router.post('/admin/delivery-providers/:channel', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await saveFinanceDeliveryProviderConfig(req.params.channel, req.body || {}, req);
    await logActivity({
      req,
      action: 'save_finance_delivery_provider_config',
      targetType: 'FinanceDeliveryProviderConfig',
      targetId: String(item?.channel || req.params.channel || ''),
      meta: {
        channel: String(item?.channel || req.params.channel || ''),
        mode: String(item?.mode || ''),
        provider: String(item?.provider || ''),
        configured: item?.readiness?.configured === true
      }
    });
    return res.json({ success: true, item, message: 'تنظیمات provider ذخیره شد.' });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'ذخیره تنظیمات provider ناموفق بود.',
      ...(error?.meta && typeof error.meta === 'object' ? { meta: error.meta } : {})
    });
  }
});

router.post('/admin/delivery-providers/:channel/rotate', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await rotateFinanceDeliveryProviderCredentials(req.params.channel, req.body || {}, req);
    await logActivity({
      req,
      action: 'rotate_finance_delivery_provider_credentials',
      targetType: 'FinanceDeliveryProviderConfig',
      targetId: String(item?.channel || req.params.channel || ''),
      meta: {
        channel: String(item?.channel || req.params.channel || ''),
        credentialVersion: Number(item?.credentialVersion || 1) || 1,
        rotatedFields: Array.isArray(req.body?.clearSecrets)
          ? req.body.clearSecrets
          : ['accountSid', 'authToken', 'accessToken', 'phoneNumberId', 'webhookToken'].filter((field) => String(req.body?.[field] || '').trim())
      }
    });
    return res.json({ success: true, item, message: 'rotation credentialها ثبت شد.' });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'rotation credentialها ناموفق بود.',
      ...(error?.meta && typeof error.meta === 'object' ? { meta: error.meta } : {})
    });
  }
});

router.get('/admin/document-archive', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await listFinanceDocumentArchives(req.query || {});
    return res.json({ success: true, items });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت آرشیف اسناد مالی ناموفق بود.' });
  }
});

router.get('/admin/delivery-campaigns', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await listFinanceDeliveryCampaigns(req.query || {});
    return res.json({ success: true, items });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت کمپاین‌های delivery ناموفق بود.' });
  }
});

router.get('/admin/delivery-campaigns/templates', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (_req, res) => {
  try {
    return res.json({
      success: true,
      items: await listFinanceDeliveryTemplates(),
      variables: listFinanceDeliveryTemplateVariables()
    });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت templateهای delivery ناموفق بود.' });
  }
});

router.post('/admin/delivery-campaigns/provider-status/sync', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const payload = req.body?.providerPayload && typeof req.body.providerPayload === 'object'
      ? await ingestFinanceDeliveryProviderWebhook({
        providerKey: req.body?.provider || 'generic',
        payload: req.body.providerPayload,
        req
      })
      : {
        results: [await syncFinanceDeliveryProviderStatus({
          provider: req.body?.provider || '',
          providerMessageId: req.body?.providerMessageId || '',
          providerStatus: req.body?.providerStatus || '',
          failureCode: req.body?.failureCode || '',
          errorMessage: req.body?.errorMessage || '',
          statusCode: req.body?.statusCode || 0,
          occurredAt: req.body?.occurredAt || null,
          recipient: req.body?.recipient || '',
          req
        })]
      };
    const matchedArchive = (payload?.results || []).reduce((sum, item) => sum + Number(item?.matchedArchive || 0), 0);
    const matchedCampaigns = (payload?.results || []).reduce((sum, item) => sum + Number(item?.matchedCampaigns || 0), 0);
    if (!matchedArchive && !matchedCampaigns) {
      return res.status(404).json({ success: false, message: 'هیچ delivery با این provider message id پیدا نشد.', result: payload });
    }
    await logActivity({
      req,
      action: 'sync_finance_delivery_provider_status',
      targetType: 'FinanceDeliveryProvider',
      targetId: String(req.body?.providerMessageId || req.body?.provider || req.params.provider || ''),
      meta: {
        provider: String(req.body?.provider || 'generic'),
        matchedArchive,
        matchedCampaigns
      }
    });
    return res.json({
      success: true,
      result: payload,
      message: 'وضعیت delivery provider همگام شد.'
    });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'همگام‌سازی وضعیت provider ناموفق بود.'
    });
  }
});

router.post('/admin/delivery-campaigns/templates/:key/draft', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await saveFinanceDeliveryTemplateDraft(req.params.key, req.body || {}, req);
    await logActivity({
      req,
      action: 'save_finance_delivery_template_draft',
      targetType: 'FinanceDeliveryTemplate',
      targetId: String(req.params.key || ''),
      meta: {
        key: String(item?.key || ''),
        draftVersionNumber: Number(item?.draftVersionNumber || 0) || null
      }
    });
    return res.json({ success: true, item, message: 'نسخه پیش‌نویس template ذخیره شد.' });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'ذخیره پیش‌نویس template ناموفق بود.',
      ...(error?.meta && typeof error.meta === 'object' ? { meta: error.meta } : {})
    });
  }
});

router.post('/admin/delivery-campaigns/templates/:key/review', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await requestFinanceDeliveryTemplateReview(req.params.key, req.body || {}, req);
    await logActivity({
      req,
      action: 'request_finance_delivery_template_review',
      targetType: 'FinanceDeliveryTemplate',
      targetId: String(req.params.key || ''),
      meta: {
        key: String(item?.key || ''),
        versionNumber: Number(req.body?.versionNumber || item?.draftVersionNumber || 0) || null
      }
    });
    return res.json({ success: true, item, message: 'نسخه template برای بازبینی ارسال شد.' });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'ارسال نسخه برای بازبینی ناموفق بود.',
      ...(error?.meta && typeof error.meta === 'object' ? { meta: error.meta } : {})
    });
  }
});

router.post('/admin/delivery-campaigns/templates/:key/approve', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await approveFinanceDeliveryTemplateVersion(req.params.key, req.body || {}, req);
    await logActivity({
      req,
      action: 'approve_finance_delivery_template_version',
      targetType: 'FinanceDeliveryTemplate',
      targetId: String(req.params.key || ''),
      meta: {
        key: String(item?.key || ''),
        versionNumber: Number(req.body?.versionNumber || item?.draftVersionNumber || 0) || null
      }
    });
    return res.json({ success: true, item, message: 'نسخه template تایید شد.' });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'تایید نسخه template ناموفق بود.',
      ...(error?.meta && typeof error.meta === 'object' ? { meta: error.meta } : {})
    });
  }
});

router.post('/admin/delivery-campaigns/templates/:key/reject', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await rejectFinanceDeliveryTemplateVersion(req.params.key, req.body || {}, req);
    await logActivity({
      req,
      action: 'reject_finance_delivery_template_version',
      targetType: 'FinanceDeliveryTemplate',
      targetId: String(req.params.key || ''),
      meta: {
        key: String(item?.key || ''),
        versionNumber: Number(req.body?.versionNumber || item?.draftVersionNumber || 0) || null
      }
    });
    return res.json({ success: true, item, message: 'نسخه template رد شد.' });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'رد نسخه template ناموفق بود.',
      ...(error?.meta && typeof error.meta === 'object' ? { meta: error.meta } : {})
    });
  }
});

router.post('/admin/delivery-campaigns/templates/:key/publish', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await publishFinanceDeliveryTemplateVersion(req.params.key, req.body || {}, req);
    await logActivity({
      req,
      action: 'publish_finance_delivery_template_version',
      targetType: 'FinanceDeliveryTemplate',
      targetId: String(req.params.key || ''),
      meta: {
        key: String(item?.key || ''),
        publishedVersionNumber: Number(item?.publishedVersionNumber || 0) || null
      }
    });
    return res.json({ success: true, item, message: 'نسخه template منتشر شد.' });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'انتشار template ناموفق بود.',
      ...(error?.meta && typeof error.meta === 'object' ? { meta: error.meta } : {})
    });
  }
});

router.post('/admin/delivery-campaigns/templates/:key/archive', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await archiveFinanceDeliveryTemplateVersion(req.params.key, req.body || {}, req);
    await logActivity({
      req,
      action: 'archive_finance_delivery_template_version',
      targetType: 'FinanceDeliveryTemplate',
      targetId: String(req.params.key || ''),
      meta: {
        key: String(item?.key || ''),
        versionNumber: Number(req.body?.versionNumber || 0) || null
      }
    });
    return res.json({ success: true, item, message: 'نسخه template آرشیف شد.' });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'آرشیف template ناموفق بود.',
      ...(error?.meta && typeof error.meta === 'object' ? { meta: error.meta } : {})
    });
  }
});

router.post('/admin/delivery-campaigns/templates/:key/rollback', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await rollbackFinanceDeliveryTemplateVersion(req.params.key, req.body || {}, req);
    await logActivity({
      req,
      action: 'rollback_finance_delivery_template_version',
      targetType: 'FinanceDeliveryTemplate',
      targetId: String(req.params.key || ''),
      meta: {
        key: String(item?.key || ''),
        publishedVersionNumber: Number(item?.publishedVersionNumber || 0) || null
      }
    });
    return res.json({ success: true, item, message: 'rollback template انجام شد.' });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'rollback template ناموفق بود.',
      ...(error?.meta && typeof error.meta === 'object' ? { meta: error.meta } : {})
    });
  }
});

router.post('/admin/delivery-campaigns/template-preview', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const preview = await previewFinanceDeliveryTemplate(req.body || {});
    return res.json({ success: true, preview });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'پیش‌نمایش template delivery ناموفق بود.',
      ...(error?.meta && typeof error.meta === 'object' ? { meta: error.meta } : {})
    });
  }
});

router.get('/admin/delivery-campaigns/analytics', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const analytics = await buildFinanceDeliveryAnalytics(req.query || {});
    return res.json({ success: true, analytics });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت analytics delivery ناموفق بود.' });
  }
});

router.get('/admin/delivery-campaigns/retry-queue', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await listFinanceDeliveryRetryQueue(req.query || {});
    return res.json({ success: true, items });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت صف retry delivery ناموفق بود.' });
  }
});

router.get('/admin/delivery-campaigns/recovery-queue', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await listFinanceDeliveryRecoveryQueue(req.query || {});
    return res.json({ success: true, items });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت صف recovery delivery ناموفق بود.' });
  }
});

router.post('/admin/delivery-campaigns/recovery-queue/replay', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const result = await replayFinanceDeliveryProviderStatus(req.body || {}, req);
    await logActivity({
      req,
      action: 'replay_finance_delivery_provider_status',
      targetType: 'FinanceDeliveryProvider',
      targetId: String(result?.providerMessageId || req.body?.providerMessageId || ''),
      meta: {
        provider: String(result?.provider || req.body?.provider || ''),
        providerStatus: String(result?.providerStatus || req.body?.providerStatus || ''),
        matchedArchive: Number(result?.matchedArchive || 0),
        matchedCampaigns: Number(result?.matchedCampaigns || 0)
      }
    });
    return res.json({
      success: true,
      result,
      message: 'replay وضعیت provider انجام شد.'
    });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'replay وضعیت provider ناموفق بود.'
    });
  }
});

router.post('/admin/delivery-campaigns', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await createFinanceDeliveryCampaign(req.body || {}, req);
    await logActivity({
      req,
      action: 'create_finance_delivery_campaign',
      targetType: 'FinanceDeliveryCampaign',
      targetId: String(item?._id || ''),
      meta: {
        name: String(item?.name || ''),
        documentType: String(item?.documentType || ''),
        automationEnabled: item?.automationEnabled === true
      }
    });
    return res.status(201).json({ success: true, item, message: 'کمپاین delivery مالی ایجاد شد.' });
  } catch (error) {
    return res.status(Number(error?.statusCode || 500)).json({
      success: false,
      message: error?.message || 'ایجاد کمپاین delivery مالی ناموفق بود.',
      ...(error?.meta && typeof error.meta === 'object' ? { meta: error.meta } : {})
    });
  }
});

router.post('/admin/delivery-campaigns/run-due', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const result = await runDueFinanceDeliveryCampaigns(req.app, { force: true });
    return res.json({
      success: true,
      result,
      message: 'صف کمپاین‌های آماده اجرا شد.'
    });
  } catch {
    return res.status(500).json({ success: false, message: 'اجرای صف کمپاین‌های delivery ناموفق بود.' });
  }
});

router.post('/admin/delivery-campaigns/:id/retry-target', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const result = await retryFinanceDeliveryTarget({
      campaignId: req.params.id,
      archiveId: req.body?.archiveId || '',
      req,
      app: req.app
    });
    if (!result) {
      return res.status(404).json({ success: false, message: 'کمپاین delivery یا سند آرشیف پیدا نشد.' });
    }
    if (result?.ok !== true) {
      return res.status(Number(result?.statusCode || 409)).json({
        success: false,
        message: result?.message || 'retry delivery ناموفق بود.',
        item: result?.item || null,
        summary: result?.summary || null
      });
    }
    return res.json({
      success: true,
      item: result?.item || null,
      summary: result?.summary || null,
      message: result?.message || 'retry delivery انجام شد.'
    });
  } catch {
    return res.status(500).json({ success: false, message: 'retry delivery ناموفق بود.' });
  }
});

router.post('/admin/delivery-campaigns/:id/run', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const result = await runFinanceDeliveryCampaign({
      campaignId: req.params.id,
      req,
      app: req.app,
      mode: 'manual',
      allowPaused: true
    });
    if (!result) {
      return res.status(404).json({ success: false, message: 'کمپاین delivery پیدا نشد.' });
    }
    return res.json({
      success: true,
      item: result.item,
      summary: result.summary || null,
      message: 'کمپاین delivery اجرا شد.'
    });
  } catch {
    return res.status(500).json({ success: false, message: 'اجرای کمپاین delivery ناموفق بود.' });
  }
});

router.post('/admin/delivery-campaigns/:id/status', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await setFinanceDeliveryCampaignStatus(req.params.id, req.body?.status || 'active', req);
    if (!item) {
      return res.status(404).json({ success: false, message: 'کمپاین delivery پیدا نشد.' });
    }
    await logActivity({
      req,
      action: 'update_finance_delivery_campaign_status',
      targetType: 'FinanceDeliveryCampaign',
      targetId: String(item?._id || ''),
      meta: {
        name: String(item?.name || ''),
        status: String(item?.status || '')
      }
    });
    return res.json({ success: true, item, message: 'وضعیت کمپاین delivery به‌روزرسانی شد.' });
  } catch {
    return res.status(500).json({ success: false, message: 'به‌روزرسانی وضعیت کمپاین delivery ناموفق بود.' });
  }
});

router.post('/admin/document-archive/:id/deliver', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const result = await deliverFinanceDocumentArchive({
      archiveId: req.params.id,
      req,
      channel: req.body?.channel || 'email',
      recipientHandles: req.body?.recipientHandles || req.body?.emails || req.body?.recipient || '',
      includeLinkedAudience: req.body?.includeLinkedAudience !== false,
      subject: req.body?.subject || '',
      note: req.body?.note || ''
    });

    await logActivity({
      req,
      action: 'deliver_finance_document_archive',
      targetType: 'FinanceDocumentArchive',
      targetId: String(req.params.id || ''),
      meta: {
        documentNo: String(result?.item?.documentNo || ''),
        documentType: String(result?.item?.documentType || ''),
        channel: String(req.body?.channel || 'email').trim().toLowerCase() || 'email',
        deliveredManualCount: Number(result?.deliveredManualCount || 0),
        failedRecipientCount: Array.isArray(result?.failedRecipients) ? result.failedRecipients.length : 0,
        linkedAudienceNotified: result?.linkedAudienceNotified === true
      }
    });

    if (!result?.ok) {
      return res.status(Number(result?.statusCode || 503)).json({
        success: false,
        message: result?.message || 'ارسال سند مالی ناموفق بود.',
        item: result?.item || null,
        failedRecipients: result?.failedRecipients || []
      });
    }

    return res.json({
      success: true,
      item: result?.item || null,
      failedRecipients: result?.failedRecipients || [],
      message: result?.message || 'سند مالی برای ارسال ثبت شد.'
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 0) || 500;
    return res.status(statusCode).json({ success: false, message: error?.message || 'ارسال سند مالی از آرشیف ناموفق بود.' });
  }
});

router.post('/admin/documents/batch-statements.zip', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const classId = String(req.body?.classId || '').trim();
    const academicYearId = String(req.body?.academicYearId || '').trim();
    const monthKey = String(req.body?.monthKey || '').trim();

    if (!classId) {
      return res.status(400).json({ success: false, message: 'classId الزامی است.' });
    }

    const memberships = await findClassMemberships({
      classId,
      academicYearId: academicYearId || null,
      statuses: ['active'],
      currentOnly: true
    });

    if (!Array.isArray(memberships) || !memberships.length) {
      return res.status(404).json({ success: false, message: 'برای این صنف متعلم فعال پیدا نشد.' });
    }

    const descriptor = await buildFinanceDocumentDescriptor({
      req,
      documentType: 'batch_statement_pack'
    });
    const entries = [];
    const childDocuments = [];
    let classTitle = '';
    let academicYearTitle = '';

    for (const membership of memberships) {
      const membershipId = String(membership?._id || membership?.id || '').trim();
      if (!membershipId) continue;

      let statementData = null;
      try {
        statementData = await getMembershipFinanceStatement(membershipId);
      } catch {
        statementData = null;
      }
      if (!statementData?.membership) continue;

      const childDescriptor = await buildFinanceDocumentDescriptor({
        req,
        documentType: 'student_statement'
      });
      const statement = statementData.statement || {};
      const childMembershipId = String(statementData.membership?.id || membershipId);
      const childFilename = safeName(`student-finance-statement-${childMembershipId}.pdf`);
      const subjectName = statementData.membership?.student?.fullName
        || statementData.membership?.student?.name
        || 'Student';
      classTitle = classTitle || String(statementData.membership?.schoolClass?.title || '').trim();
      academicYearTitle = academicYearTitle || String(statementData.membership?.academicYear?.title || '').trim();

      const pdfBuffer = await buildStatementPackPdfBuffer({
        title: 'Official student finance statement pack',
        subtitle: monthKey ? `Batch export for ${monthKey}` : 'Batch export for active class members',
        subjectName,
        classTitle: statementData.membership?.schoolClass?.title || '-',
        academicYearTitle: statementData.membership?.academicYear?.title || '-',
        membershipId: childMembershipId,
        generatedAt: statement.generatedAt || new Date().toISOString(),
        currency: statement.currency || 'AFN',
        totals: statement.totals || {},
        pack: statement.pack || null,
        latestApprovedPayment: statement.latestApprovedPayment || null,
        latestPendingPayment: statement.latestPendingPayment || null,
        orders: Array.isArray(statementData.orders) ? statementData.orders : [],
        payments: Array.isArray(statementData.payments) ? statementData.payments : [],
        reliefs: Array.isArray(statementData.reliefs) ? statementData.reliefs : [],
        documentNo: childDescriptor.documentNo,
        generatedByName: req.user?.name || req.user?.email || req.user?.role || 'system',
        verificationCode: childDescriptor.verificationCode,
        verificationUrl: childDescriptor.verificationUrl,
        verificationQrBuffer: childDescriptor.verificationQrBuffer
      });

      const childArchive = await createFinanceDocumentArchive({
        req,
        descriptor: childDescriptor,
        documentType: 'student_statement',
        filename: childFilename,
        buffer: pdfBuffer,
        title: 'Student finance statement pack',
        subjectName,
        membershipLabel: childMembershipId,
        studentMembershipId: childMembershipId,
        studentId: statementData.membership?.student?.studentId || null,
        classId: statementData.membership?.schoolClass?.id || classId,
        academicYearId: statementData.membership?.academicYear?.id || academicYearId || null,
        monthKey,
        meta: {
          batchDocumentNo: descriptor.documentNo,
          currency: statement.currency || 'AFN',
          totalOrders: Number(statement?.totals?.totalOrders || 0),
          totalOutstanding: Number(statement?.totals?.totalOutstanding || 0)
        },
        accessEvents: ['generated']
      });

      entries.push({ name: childFilename, buffer: pdfBuffer });
      childDocuments.push({
        documentNo: childArchive?.documentNo || childDescriptor.documentNo,
        verificationCode: childArchive?.verification?.code || childDescriptor.verificationCode,
        documentType: 'student_statement',
        filename: childFilename,
        studentMembershipId: childMembershipId,
        subjectName
      });
    }

    if (!entries.length) {
      return res.status(404).json({ success: false, message: 'برای این صنف استیتمنت مالی قابل تولید پیدا نشد.' });
    }

    const batchLabel = [classTitle || classId, academicYearTitle || academicYearId, monthKey].filter(Boolean).join(' | ');
    const zipFilename = safeName(`finance-batch-statements-${monthKey || 'all'}-${classTitle || classId}.zip`);
    const manifest = {
      documentNo: descriptor.documentNo,
      verificationCode: descriptor.verificationCode,
      generatedAt: new Date().toISOString(),
      generatedBy: req.user?.name || req.user?.email || req.user?.role || 'system',
      classId,
      classTitle,
      academicYearId: academicYearId || '',
      academicYearTitle,
      monthKey,
      totalDocuments: childDocuments.length,
      documents: childDocuments
    };
    const zipBuffer = await buildFinanceDocumentZipBuffer({
      entries,
      manifest,
      manifestName: 'finance-batch-manifest.json'
    });

    const archivedDocument = await createFinanceDocumentArchive({
      req,
      descriptor,
      documentType: 'batch_statement_pack',
      filename: zipFilename,
      contentType: 'application/zip',
      buffer: zipBuffer,
      title: 'Finance batch statement pack',
      subjectName: classTitle || 'Class statement pack',
      batchLabel,
      classId,
      academicYearId: academicYearId || null,
      monthKey,
      childDocuments,
      meta: {
        manifestName: 'finance-batch-manifest.json',
        totalDocuments: childDocuments.length
      }
    });

    await logActivity({
      req,
      action: 'export_finance_batch_statement_pack',
      targetType: 'SchoolClass',
      targetId: classId,
      meta: {
        classId,
        academicYearId,
        monthKey,
        totalDocuments: childDocuments.length,
        filename: zipFilename
      }
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('X-Finance-Document-No', String(archivedDocument?.documentNo || descriptor.documentNo || ''));
    res.setHeader('X-Finance-Verification-Code', String(archivedDocument?.verification?.code || descriptor.verificationCode || ''));
    return res.status(200).send(zipBuffer);
  } catch {
    return res.status(500).json({ success: false, message: 'تولید بسته گروهی استیتمنت مالی ناموفق بود.' });
  }
});

router.post('/admin/month-close/:id/reopen', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const actorLevel = await resolveAdminActorLevel(req.user.id);
    if (actorLevel !== 'general_president') {
      return res.status(403).json({ success: false, message: 'فقط ریاست عمومی می‌تواند ماه مالی را دوباره باز کند.' });
    }

    const item = await FinanceMonthClose.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'ماه مالی موردنظر پیدا نشد.' });
    }
    if (item.status !== 'closed') {
      return res.status(400).json({ success: false, message: 'این ماه مالی قبلاً بازگشایی شده یا هنوز بسته نیست.' });
    }

    const reopenNote = String(req.body?.note || '').trim();
    if (!reopenNote) {
      return res.status(400).json({ success: false, message: 'برای بازگشایی ماه مالی، دلیل یا توضیح الزامی است.' });
    }

    item.status = 'reopened';
    item.reopenedBy = req.user.id;
    item.reopenedAt = new Date();
    item.reopenNote = reopenNote;
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({
      action: 'reopened',
      by: req.user.id,
      at: new Date(),
      note: reopenNote
    });
    await item.save();

    await logActivity({
      req,
      action: 'finance_reopen_month',
      targetType: 'FinanceMonthClose',
      targetId: item._id.toString(),
      meta: {
        monthKey: item.monthKey,
        note: reopenNote,
        level: actorLevel
      }
    });

    const refreshed = await populateFinanceMonthCloseQuery(
      FinanceMonthClose.findById(item._id)
    );

    return res.json({
      success: true,
      item: serializeFinanceMonthClose(refreshed, actorLevel),
      message: `ماه مالی ${item.monthKey} برای اصلاحات کنترل‌شده دوباره باز شد`
    });
  } catch {
    return res.status(500).json({ success: false, message: 'خطا در بازگشایی ماه مالی' });
  }
});

router.post('/admin/reminders/run', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const { runFinanceReminderSweep } = require('../services/financeReminderAutomation');
    const result = await runFinanceReminderSweep(req.app, {
      force: true,
      req,
      actorUserId: req.user?.id || null
    });

    res.json({
      success: true,
      notified: Number(result?.notified || 0),
      summary: result?.summary || {
        orderReminders: 0,
        reliefReminders: 0
      },
      runsAt: result?.runsAt || new Date().toISOString(),
      message: `یادآوری مالی برای ${Number(result?.notified || 0).toLocaleString('fa-AF-u-ca-persian')} مورد اجرا شد`
    });
  } catch {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø§Ø¬Ø±Ø§ÛŒ ÛŒØ§Ø¯Ø¢ÙˆØ±ÛŒ Ù…Ø§Ù„ÛŒ' });
  }
});

module.exports = router;
