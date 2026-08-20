require('../models/User');
require('../models/StudentCore');
require('../models/AfghanStudent');
require('../models/SchoolClass');
require('../models/AcademicYear');
require('../models/StudentMembership');
require('../models/FeeOrder');
require('../models/FeePayment');
require('../models/FinanceRelief');
require('../models/FinanceFeePlan');
require('../models/FinanceBill');
require('../models/FinanceRefund');

const crypto = require('crypto');
const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceRelief = require('../models/FinanceRelief');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const FinanceBill = require('../models/FinanceBill');
const FinanceRefund = require('../models/FinanceRefund');
const { formatFinanceCode } = require('../utils/latinFinanceCode');
const {
  formatAfghanMonthYearLabel,
  replaceIranianSolarMonthNames
} = require('../utils/afghanDate');
const {
  buildPaymentClassScope,
  buildPaymentOrderLinkFilter
} = require('../utils/paymentClassScope');

function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') {
    return doc.toObject({ virtuals: false });
  }
  return { ...doc };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableId(value) {
  if (!value) return '';
  return String(value);
}

function roundMoney(value) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function formatAmountLabel(value = 0, currency = 'AFN') {
  return `${roundMoney(value).toLocaleString('fa-AF-u-ca-persian')} ${normalizeText(currency) || 'AFN'}`;
}

function getStudentName(item = {}) {
  return normalizeText(
    item?.student?.fullName
    || item?.studentId?.fullName
    || item?.student?.name
    || item?.membership?.student?.fullName
    || item?.membership?.student?.name
    || ''
  ) || 'متعلم';
}

// Same shape-fallback pattern as getStudentName above, for نمبر اساس -
// same-named students are otherwise indistinguishable in this report.
// formatMembershipLite() already resolves StudentCore.admissionNo with an
// AfghanStudent.asasNumber fallback onto membership.student.admissionNo.
function getStudentAdmissionNo(item = {}) {
  return normalizeText(
    item?.studentId?.admissionNo
    || item?.student?.admissionNo
    || item?.membership?.studentId?.admissionNo
    || item?.membership?.student?.admissionNo
    || ''
  );
}

function getClassTitle(item = {}) {
  return normalizeText(
    item?.schoolClass?.title
    || item?.classId?.title
    || item?.membership?.schoolClass?.title
    || item?.membership?.classId?.title
    || ''
  ) || 'صنف';
}

function getAcademicYearTitle(item = {}) {
  return normalizeText(
    item?.academicYear?.title
    || item?.academicYearId?.title
    || item?.membership?.academicYear?.title
    || item?.membership?.academicYearId?.title
    || ''
  ) || 'سال تعلیمی';
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameOrBefore(left, right) {
  const leftDate = toDate(left);
  const rightDate = toDate(right);
  if (!leftDate || !rightDate) return false;
  return leftDate.getTime() <= rightDate.getTime();
}

function isSameOrAfter(left, right) {
  const leftDate = toDate(left);
  const rightDate = toDate(right);
  if (!leftDate || !rightDate) return false;
  return leftDate.getTime() >= rightDate.getTime();
}

function differenceInDays(later, earlier) {
  const laterDate = toDate(later);
  const earlierDate = toDate(earlier);
  if (!laterDate || !earlierDate) return 0;
  return Math.floor((laterDate.getTime() - earlierDate.getTime()) / (24 * 60 * 60 * 1000));
}

function reliefIsActiveAt(relief = {}, asOf = new Date()) {
  if (normalizeText(relief?.status) !== 'active') return false;
  const at = toDate(asOf) || new Date();
  const startDate = toDate(relief?.startDate);
  const endDate = toDate(relief?.endDate);
  if (startDate && startDate.getTime() > at.getTime()) return false;
  if (endDate && endDate.getTime() < at.getTime()) return false;
  return true;
}

function getFinanceDocumentFeeTypes(document = {}) {
  const lineItems = Array.isArray(document?.lineItems) ? document.lineItems : [];
  const rawText = [
    document?.orderType,
    document?.title,
    document?.periodLabel,
    document?.note,
    ...(lineItems.map((entry) => entry?.label))
  ].map((entry) => normalizeText(entry).toLowerCase()).join(' ');
  const feeBreakdown = document?.feeBreakdown && typeof document.feeBreakdown === 'object' ? document.feeBreakdown : {};
  const breakdownTypes = Object.entries(feeBreakdown)
    .filter(([, amount]) => roundMoney(amount) > 0)
    .map(([key]) => normalizeText(key))
    .filter(Boolean);
  const hasAdmissionSignal = normalizeText(document?.orderType) === 'admission'
    || breakdownTypes.includes('admission')
    || rawText.includes('admission')
    || rawText.includes('داخله');
  const lineItemTypes = lineItems
    .filter((entry) => Math.max(0, Number(entry?.grossAmount ?? entry?.netAmount ?? entry?.reductionAmount ?? entry?.balanceAmount ?? 0) || 0) > 0 || normalizeText(entry?.label))
    .map((entry) => normalizeText(entry?.feeType))
    .filter(Boolean);
  if (hasAdmissionSignal && lineItemTypes.length && lineItemTypes.every((type) => type === 'tuition')) {
    return new Set(['admission']);
  }
  if (lineItemTypes.length) return new Set(lineItemTypes);
  if (breakdownTypes.length) return new Set(breakdownTypes);
  const feeScopes = Array.isArray(document?.feeScopes)
    ? document.feeScopes.map((scope) => normalizeText(scope)).filter(Boolean)
    : [];
  if (feeScopes.length) return new Set(feeScopes);
  const orderType = normalizeText(document?.orderType);
  return orderType ? new Set([orderType]) : new Set();
}

function getOrderFeeTypes(order = {}) {
  return getFinanceDocumentFeeTypes(order);
}

function isAdmissionDocument(document = {}) {
  return getFinanceDocumentFeeTypes(document).has('admission');
}

function getFinanceDocumentAmountByType(document = {}, feeType = '') {
  const normalizedType = normalizeText(feeType);
  if (!normalizedType) return 0;
  if (normalizedType === 'tuition' && isAdmissionDocument(document)) return 0;
  const lineItems = Array.isArray(document?.lineItems) ? document.lineItems : [];
  const lineAmount = lineItems
    .filter((entry) => normalizeText(entry?.feeType) === normalizedType)
    .reduce((sum, entry) => sum + roundMoney(entry?.grossAmount ?? entry?.netAmount ?? entry?.reductionAmount ?? 0), 0);
  if (lineAmount > 0) return roundMoney(lineAmount);
  return roundMoney(document?.feeBreakdown?.[normalizedType]);
}

function getFinanceDocumentGrossAmount(document = {}) {
  const lineItems = Array.isArray(document?.lineItems) ? document.lineItems : [];
  const lineTotal = lineItems.reduce((sum, entry) => sum + roundMoney(entry?.grossAmount ?? entry?.netAmount ?? entry?.reductionAmount ?? 0), 0);
  if (lineTotal > 0) return roundMoney(lineTotal);
  const breakdown = document?.feeBreakdown && typeof document.feeBreakdown === 'object' ? document.feeBreakdown : {};
  const breakdownTotal = Object.values(breakdown).reduce((sum, amount) => sum + roundMoney(amount), 0);
  if (breakdownTotal > 0) return roundMoney(breakdownTotal);
  return roundMoney(document?.amountOriginal ?? document?.amountDue ?? document?.amount);
}

function isLikelyAdmissionDocumentForPlan(document = {}, feePlan = null) {
  if (isAdmissionDocument(document)) return true;
  const plannedAdmissionFee = roundMoney(feePlan?.admissionFee);
  const plannedTuitionFee = roundMoney(feePlan?.tuitionFee ?? feePlan?.amount);
  if (plannedAdmissionFee <= 0 || Math.abs(plannedAdmissionFee - plannedTuitionFee) <= 0.009) return false;
  const documentAmount = getFinanceDocumentGrossAmount(document);
  return documentAmount > 0 && Math.abs(documentAmount - plannedAdmissionFee) <= 0.009;
}

function isPlanGeneratedFinanceDocument(document = {}) {
  const lineItems = Array.isArray(document?.lineItems) ? document.lineItems : [];
  if (lineItems.some((entry) => normalizeNullableId(entry?.sourcePlanId))) return true;
  return normalizeText(document?.note).toLowerCase().includes('plan:');
}

function getPlannedFeeAmount(plan = {}, feeType = '') {
  const normalizedType = normalizeText(feeType);
  if (normalizedType === 'tuition') return roundMoney(plan?.tuitionFee ?? plan?.amount);
  if (normalizedType === 'admission') return roundMoney(plan?.admissionFee);
  if (normalizedType === 'exam') return roundMoney(plan?.examFee);
  if (normalizedType === 'transport') return roundMoney(plan?.transportDefaultFee);
  if (normalizedType === 'document') return roundMoney(plan?.documentFee);
  if (normalizedType === 'other') return roundMoney(plan?.otherFee);
  return 0;
}

function getFeeTypeLabel(feeType = '') {
  return ({
    tuition: 'فیس/شهریه',
    admission: 'داخله',
    exam: 'امتحان',
    transport: 'ترانسپورت',
    document: 'اسناد',
    other: 'سایر فیس'
  }[normalizeText(feeType)] || feeType || 'فیس');
}

function normalizeFinancePeriodToken(value = '') {
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  return replaceIranianSolarMonthNames(String(value || '').normalize('NFKC'))
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getFinanceLineItemAmount(lineItem = {}) {
  return roundMoney(lineItem?.grossAmount ?? lineItem?.netAmount ?? lineItem?.reductionAmount ?? 0);
}

function getFinanceDocumentPeriodSlices(document = {}, feeType = '') {
  const normalizedType = normalizeText(feeType);
  if (!normalizedType) return [];

  const periodType = normalizeText(document?.periodType).toLowerCase() || 'period';
  const matchingLines = (Array.isArray(document?.lineItems) ? document.lineItems : [])
    .filter((entry) => normalizeText(entry?.feeType) === normalizedType);
  const normalizedLinePeriods = matchingLines
    .map((entry) => ({
      entry,
      rawKey: normalizeText(entry?.periodKey),
      normalizedKey: normalizeFinancePeriodToken(entry?.periodKey)
    }))
    .filter((item) => item.normalizedKey);
  const distinctLinePeriods = new Set(normalizedLinePeriods.map((item) => item.normalizedKey));
  const dueDate = toDate(document?.dueDate);

  // A monthly due date is the canonical source for ordinary one-period documents.
  // Multiple explicit line periods still represent separate obligations in one document.
  if (periodType === 'monthly' && dueDate && distinctLinePeriods.size <= 1) {
    const dateLabel = formatAfghanMonthYearLabel(dueDate);
    const normalizedDateLabel = normalizeFinancePeriodToken(dateLabel);
    if (normalizedDateLabel) {
      return [{
        key: `${periodType}:${normalizedDateLabel}`,
        label: normalizeText(document?.periodLabel) || dateLabel,
        amount: getFinanceDocumentAmountByType(document, normalizedType)
      }];
    }
  }

  if (normalizedLinePeriods.length) {
    const grouped = new Map();
    normalizedLinePeriods.forEach(({ entry, rawKey, normalizedKey }) => {
      const key = `${periodType}:${normalizedKey}`;
      const current = grouped.get(key) || { key, label: rawKey || normalizedKey, amount: 0 };
      current.amount = roundMoney(current.amount + getFinanceLineItemAmount(entry));
      grouped.set(key, current);
    });
    return [...grouped.values()];
  }

  const periodLabel = normalizeText(document?.periodLabel);
  const normalizedPeriodLabel = normalizeFinancePeriodToken(periodLabel);
  if (normalizedPeriodLabel) {
    return [{
      key: `${periodType}:${normalizedPeriodLabel}`,
      label: periodLabel,
      amount: getFinanceDocumentAmountByType(document, normalizedType)
    }];
  }

  // Term and custom documents without an explicit period are intentionally skipped;
  // sharing only a due-date month is not enough evidence that they are duplicates.
  return [];
}

function getLegacyFinanceDocumentPeriodKey(document = {}) {
  const periodType = normalizeText(document?.periodType).toLowerCase();
  const periodLabel = normalizeText(document?.periodLabel).replace(/\s+/g, ' ').toLowerCase();
  if (periodLabel) return `${periodType || 'period'}:${periodLabel}`;

  const linePeriodKey = (Array.isArray(document?.lineItems) ? document.lineItems : [])
    .map((entry) => normalizeText(entry?.periodKey))
    .find(Boolean);
  if (linePeriodKey) return `${periodType || 'period'}:${linePeriodKey.toLowerCase()}`;

  const dueDate = toDate(document?.dueDate);
  if (dueDate) return `${periodType || 'date'}:${dueDate.toISOString().slice(0, 7)}`;
  return '';
}

function buildDuplicateFeeAnomalyIdentity({
  feeType = '',
  membershipKey = '',
  periodKey = '',
  legacyPeriodKeys = []
} = {}) {
  const normalizedFeeType = normalizeText(feeType) || 'fee';
  const normalizedMembershipKey = normalizeNullableId(membershipKey) || 'unknown-membership';
  const normalizedPeriodKey = normalizeFinancePeriodToken(periodKey);
  const token = crypto
    .createHash('sha256')
    .update(`${normalizedFeeType}|${normalizedMembershipKey}|${normalizedPeriodKey}`)
    .digest('base64url')
    .slice(0, 22);
  const legacyPrefix = `fee-duplicate-${normalizedFeeType}-${normalizedMembershipKey}-`;
  const normalizedLegacyPeriodKeys = [...new Set([
    ...(Array.isArray(legacyPeriodKeys) ? legacyPeriodKeys : []),
    normalizedPeriodKey
  ].map((key) => normalizeText(key)).filter(Boolean))];
  return {
    id: `fee-duplicate-${normalizedFeeType}-${token}`,
    legacyAnomalyIds: [...new Set(normalizedLegacyPeriodKeys.flatMap((key) => [
      `${legacyPrefix}${encodeURIComponent(key)}`,
      `${legacyPrefix}${key}`
    ]))]
  };
}

function reliefAppliesToOrder(relief = {}, order = {}) {
  const scope = normalizeText(relief?.scope) || 'all';
  if (scope === 'all') return true;
  return getOrderFeeTypes(order).has(scope);
}

function isCurrentMembership(membership = {}) {
  return Boolean(membership?.isCurrent) && ['active', 'pending', 'suspended', 'transferred_in'].includes(normalizeText(membership?.status));
}

function feePlanIsActiveAt(plan = {}, asOf = new Date()) {
  if (plan?.isActive === false || normalizeText(plan?.lifecycleStatus || 'active') !== 'active') return false;
  const at = toDate(asOf) || new Date();
  const effectiveFrom = toDate(plan?.effectiveFrom);
  const effectiveTo = toDate(plan?.effectiveTo);
  if (effectiveFrom && effectiveFrom.getTime() > at.getTime()) return false;
  if (effectiveTo && effectiveTo.getTime() < at.getTime()) return false;
  return true;
}

function resolveMembershipFeePlan(membership = {}, feePlans = [], asOf = new Date()) {
  const classId = normalizeNullableId(
    membership?.schoolClass?.id
    || membership?.schoolClass?._id
    || membership?.classId?.id
    || membership?.classId?._id
    || membership?.classId
  );
  const academicYearId = normalizeNullableId(
    membership?.academicYear?.id
    || membership?.academicYear?._id
    || membership?.academicYearId?.id
    || membership?.academicYearId?._id
    || membership?.academicYearId
  );
  const candidates = (Array.isArray(feePlans) ? feePlans : [])
    .filter((plan) => feePlanIsActiveAt(plan, asOf))
    .filter((plan) => {
      const planClassId = normalizeNullableId(plan?.classId?._id || plan?.classId);
      const planYearId = normalizeNullableId(plan?.academicYearId?._id || plan?.academicYearId);
      return (!classId || !planClassId || planClassId === classId)
        && (!academicYearId || !planYearId || planYearId === academicYearId);
    })
    .sort((left, right) => {
      const rightDefault = right?.isDefault === true ? 1 : 0;
      const leftDefault = left?.isDefault === true ? 1 : 0;
      if (rightDefault !== leftDefault) return rightDefault - leftDefault;
      return Number(left?.priority || 100) - Number(right?.priority || 100);
    });
  return candidates[0] || null;
}

function makeFinanceContextKey({ studentId = '', studentUserId = '', classId = '', academicYearId = '' } = {}) {
  const studentKey = normalizeNullableId(studentId) || normalizeNullableId(studentUserId);
  if (!studentKey) return '';
  return [
    studentKey,
    normalizeNullableId(classId) || '*',
    normalizeNullableId(academicYearId) || '*'
  ].join('|');
}

function mergeUniqueById(primary = [], fallback = []) {
  const seen = new Set();
  const merged = [];
  [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(fallback) ? fallback : [])].forEach((item) => {
    const key = normalizeNullableId(item?.id || item?._id || item?.orderNumber || item?.billNumber || item?.referenceNumber);
    const dedupeKey = key || JSON.stringify(item);
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    merged.push(item);
  });
  return merged;
}

function dedupeFinanceDocuments(documents = []) {
  const seen = new Set();
  const sourceBillIds = new Set(
    (Array.isArray(documents) ? documents : [])
      .map((item) => normalizeNullableId(item?.sourceBillId))
      .filter(Boolean)
  );
  const rows = [];
  (Array.isArray(documents) ? documents : []).forEach((item) => {
    const id = normalizeNullableId(item?.id || item?._id);
    if (id && normalizeText(item?.documentKind) === 'bill' && sourceBillIds.has(id)) return;
    const key = normalizeNullableId(item?.sourceBillId) || id || normalizeText(item?.orderNumber || item?.billNumber || item?.title);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    rows.push(item);
  });
  return rows;
}

function buildAnomalySummary(items = []) {
  const rows = Array.isArray(items) ? items : [];
  const byType = {};
  const summary = {
    total: rows.length,
    critical: 0,
    warning: 0,
    info: 0,
    actionRequired: 0,
    byType
  };

  rows.forEach((item) => {
    const severity = normalizeText(item?.severity) || 'info';
    const type = normalizeText(item?.anomalyType) || 'finance_signal';
    if (severity === 'critical') summary.critical += 1;
    else if (severity === 'warning') summary.warning += 1;
    else summary.info += 1;
    if (item?.actionRequired) summary.actionRequired += 1;
    byType[type] = (byType[type] || 0) + 1;
  });

  return summary;
}

function getAnomalySeverityScore(item = {}) {
  const severity = normalizeText(item?.severity);
  if (severity === 'critical') return 300;
  if (severity === 'warning') return 200;
  return 100;
}

function getAnomalyTimeScore(item = {}) {
  const date = toDate(item?.at || item?.dueDate || item?.endDate || item?.paidAt);
  return date ? date.getTime() : 0;
}

function sortAnomalies(items = []) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const severityDelta = getAnomalySeverityScore(right) - getAnomalySeverityScore(left);
    if (severityDelta !== 0) return severityDelta;
    const amountDelta = roundMoney(right?.amount || 0) - roundMoney(left?.amount || 0);
    if (amountDelta !== 0) return amountDelta;
    return getAnomalyTimeScore(right) - getAnomalyTimeScore(left);
  });
}

function buildMembershipFinanceAnomalies({
  membership = null,
  orders = [],
  payments = [],
  reliefs = [],
  bills = [],
  refunds = [],
  admissionDocuments = [],
  feePlans = [],
  asOf = new Date(),
  limit = 20
} = {}) {
  const membershipItem = toPlain(membership) || {};
  const membershipId = normalizeNullableId(membershipItem?.id || membershipItem?._id);
  const now = toDate(asOf) || new Date();
  const studentName = getStudentName({ membership: membershipItem });
  const admissionNo = getStudentAdmissionNo({ membership: membershipItem });
  const classTitle = getClassTitle({ membership: membershipItem });
  const academicYearTitle = getAcademicYearTitle({ membership: membershipItem });
  const studentUserId = normalizeNullableId(
    membershipItem?.student?.userId
    || membershipItem?.student?._id
    || membershipItem?.student
  );
  const classId = normalizeNullableId(
    membershipItem?.schoolClass?.id
    || membershipItem?.schoolClass?._id
    || membershipItem?.classId?.id
    || membershipItem?.classId?._id
  );
  const academicYearId = normalizeNullableId(
    membershipItem?.academicYear?.id
    || membershipItem?.academicYear?._id
    || membershipItem?.academicYearId?.id
    || membershipItem?.academicYearId?._id
  );
  const currency = normalizeText(
    payments.find((item) => normalizeText(item?.currency))?.currency
    || orders.find((item) => normalizeText(item?.currency))?.currency
    || 'AFN'
  ) || 'AFN';

  const normalizedOrders = (Array.isArray(orders) ? orders : []).filter(Boolean);
  const normalizedPayments = (Array.isArray(payments) ? payments : []).filter(Boolean);
  const normalizedReliefs = (Array.isArray(reliefs) ? reliefs : []).filter(Boolean);
  const normalizedBills = (Array.isArray(bills) ? bills : []).filter(Boolean);
  const normalizedRefunds = (Array.isArray(refunds) ? refunds : []).filter(Boolean);
  const documentsWithOpenRefund = new Set(
    normalizedRefunds
      .filter((refund) => normalizeText(refund?.status) !== 'rejected')
      .flatMap((refund) => [normalizeNullableId(refund?.bill), normalizeNullableId(refund?.feeOrder)])
      .filter(Boolean)
  );
  const normalizedAdmissionDocuments = (Array.isArray(admissionDocuments) ? admissionDocuments : []).filter(Boolean);
  const openOrders = normalizedOrders.filter((item) => ['new', 'partial', 'overdue'].includes(normalizeText(item?.status)) && roundMoney(item?.outstandingAmount) > 0);
  const activeReliefs = normalizedReliefs.filter((item) => reliefIsActiveAt(item, now));
  const anomalies = [];

  normalizedOrders.forEach((order) => {
    const amountDue = roundMoney(order?.amountDue);
    const amountPaid = roundMoney(order?.amountPaid);
    const outstandingAmount = roundMoney(order?.outstandingAmount);
    const orderNumber = normalizeText(order?.orderNumber || order?.billNumber || order?.title) || 'بل مالی';
    const dueDate = toDate(order?.dueDate);

    if (amountPaid > amountDue + 0.009) {
      const excess = roundMoney(amountPaid - amountDue);
      anomalies.push({
        id: `overpayment-${normalizeNullableId(order?.id || order?._id || orderNumber)}`,
        anomalyType: 'overpayment',
        severity: 'warning',
        actionRequired: true,
        title: 'بیش‌پرداخت روی بدهی ثبت شده است',
        description: `${orderNumber} برای ${studentName} بیشتر از مبلغ لازم پرداخت شده است.`,
        studentName,
        admissionNo,
        studentUserId,
        classTitle,
        classId,
        academicYearTitle,
        academicYearId,
        membershipId,
        referenceNumber: orderNumber,
        amount: excess,
        amountLabel: formatAmountLabel(excess, currency),
        status: normalizeText(order?.status),
        dueDate: dueDate?.toISOString() || null,
        at: dueDate?.toISOString() || order?.paidAt || order?.updatedAt || order?.createdAt || null,
        orderId: normalizeNullableId(order?.id || order?._id),
        tags: ['order', 'payment_overage']
      });
    }

    if (outstandingAmount > 0) {
      const matchingFullRelief = activeReliefs.find((relief) => (
        normalizeText(relief?.coverageMode) === 'full' && reliefAppliesToOrder(relief, order)
      ));
      if (matchingFullRelief) {
        anomalies.push({
          id: `full-relief-open-order-${normalizeNullableId(order?.id || order?._id || orderNumber)}-${normalizeNullableId(matchingFullRelief?.id || matchingFullRelief?._id)}`,
          anomalyType: 'full_relief_with_open_balance',
          severity: 'critical',
          actionRequired: true,
          title: 'بل باز با وجود تسهیل کامل',
          description: `${studentName} تسهیل کامل فعال دارد اما ${orderNumber} هنوز مانده باز دارد.`,
          studentName,
        admissionNo,
          studentUserId,
          classTitle,
          classId,
          academicYearTitle,
          academicYearId,
          membershipId,
          referenceNumber: orderNumber,
          secondaryReference: normalizeText(matchingFullRelief?.sourceKey || matchingFullRelief?.reliefType),
          amount: outstandingAmount,
          amountLabel: formatAmountLabel(outstandingAmount, currency),
          status: normalizeText(order?.status),
          dueDate: dueDate?.toISOString() || null,
          at: dueDate?.toISOString() || order?.updatedAt || order?.createdAt || null,
          orderId: normalizeNullableId(order?.id || order?._id),
          reliefId: normalizeNullableId(matchingFullRelief?.id || matchingFullRelief?._id),
          tags: ['relief', 'order', normalizeText(matchingFullRelief?.reliefType)]
        });
      }
    }

    if (outstandingAmount > 0 && dueDate && differenceInDays(now, dueDate) >= 90) {
      anomalies.push({
        id: `long-overdue-${normalizeNullableId(order?.id || order?._id || orderNumber)}`,
        anomalyType: 'long_overdue_balance',
        severity: 'critical',
        actionRequired: true,
        title: 'بدهی بیش از سه ماه معوق مانده است',
        description: `${studentName} برای ${orderNumber} بیشتر از سه ماه بدهی باز دارد.`,
        studentName,
        admissionNo,
        studentUserId,
        classTitle,
        classId,
        academicYearTitle,
        academicYearId,
        membershipId,
        referenceNumber: orderNumber,
        amount: outstandingAmount,
        amountLabel: formatAmountLabel(outstandingAmount, currency),
        status: normalizeText(order?.status),
        dueDate: dueDate.toISOString(),
        lateDays: differenceInDays(now, dueDate),
        at: dueDate.toISOString(),
        orderId: normalizeNullableId(order?.id || order?._id),
        tags: ['overdue', 'aging_90_plus']
      });
    }
  });

  activeReliefs.forEach((relief) => {
    const endDate = toDate(relief?.endDate);
    if (!endDate) return;
    const daysLeft = differenceInDays(endDate, now);
    if (daysLeft < 0 || daysLeft > 14) return;
    anomalies.push({
      id: `relief-expiring-${normalizeNullableId(relief?.id || relief?._id || relief?.sourceKey)}`,
      anomalyType: 'relief_expiring',
      severity: 'warning',
      actionRequired: true,
      title: 'تسهیل مالی رو به ختم است',
      description: `${studentName} یک تسهیل مالی دارد که تا ${daysLeft.toLocaleString('fa-AF-u-ca-persian')} روز دیگر ختم می‌شود.`,
      studentName,
      admissionNo,
      studentUserId,
      classTitle,
      classId,
      academicYearTitle,
      academicYearId,
      membershipId,
      referenceNumber: normalizeText(relief?.sourceKey || relief?.reliefType) || 'تسهیل مالی',
      amount: normalizeText(relief?.coverageMode) === 'percent'
        ? roundMoney(relief?.percentage)
        : roundMoney(relief?.amount),
      amountLabel: normalizeText(relief?.coverageMode) === 'full'
        ? '100%'
        : normalizeText(relief?.coverageMode) === 'percent'
          ? `${roundMoney(relief?.percentage).toLocaleString('fa-AF-u-ca-persian')}%`
          : formatAmountLabel(relief?.amount, currency),
      endDate: endDate.toISOString(),
      daysLeft,
      at: endDate.toISOString(),
      reliefId: normalizeNullableId(relief?.id || relief?._id),
      tags: ['relief', normalizeText(relief?.reliefType), 'expiring']
    });
  });

  normalizedPayments
    .filter((payment) => normalizeText(payment?.status) === 'pending')
    .forEach((payment) => {
      const paidAt = toDate(payment?.paidAt || payment?.createdAt);
      if (!paidAt || differenceInDays(now, paidAt) < 7) return;
      const paymentNumber = normalizeText(payment?.paymentNumber) || 'پرداخت';
      anomalies.push({
        id: `pending-payment-stalled-${normalizeNullableId(payment?.id || payment?._id || paymentNumber)}-${membershipId || 'student'}`,
        anomalyType: 'pending_payment_stalled',
        severity: 'warning',
        actionRequired: true,
        title: 'پرداخت در انتظار بیش از حد طول کشیده است',
        description: `${paymentNumber} برای ${studentName} هنوز تایید نشده است.`,
        studentName,
        admissionNo,
        studentUserId,
        classTitle,
        classId,
        academicYearTitle,
        academicYearId,
        membershipId,
        referenceNumber: paymentNumber,
        amount: roundMoney(payment?.amount),
        amountLabel: formatAmountLabel(payment?.amount, normalizeText(payment?.currency) || currency),
        status: normalizeText(payment?.status),
        paidAt: paidAt.toISOString(),
        at: paidAt.toISOString(),
        paymentId: normalizeNullableId(payment?.id || payment?._id),
        tags: ['payment', normalizeText(payment?.approvalStage), 'stalled']
      });
    });

  if (isCurrentMembership(membershipItem)) {
    const feePlan = resolveMembershipFeePlan(membershipItem, feePlans, now);
    const plannedAdmissionFee = roundMoney(feePlan?.admissionFee);
    const financeDocuments = dedupeFinanceDocuments([...normalizedOrders, ...normalizedBills])
      .filter((document) => normalizeText(document?.status) !== 'void');
    const studentAdmissionDocuments = dedupeFinanceDocuments([
      ...normalizedAdmissionDocuments,
      ...normalizedOrders,
      ...normalizedBills
    ]).filter((document) => normalizeText(document?.status) !== 'void');
    const hasAdmissionOrder = studentAdmissionDocuments.some((document) => isLikelyAdmissionDocumentForPlan(document, feePlan));
    const hasActiveCharge = openOrders.some((order) => {
      const feeTypes = getOrderFeeTypes(order);
      return feeTypes.has('tuition') || feeTypes.has('service') || feeTypes.has('exam') || feeTypes.has('transport');
    });

    if (plannedAdmissionFee > 0 && !hasAdmissionOrder && hasActiveCharge) {
      anomalies.push({
        id: `admission-missing-${studentUserId || membershipItem?.student?.studentCoreId || membershipId || normalizeNullableId(membershipItem?.id || membershipItem?._id || studentName)}`,
        anomalyType: 'admission_missing',
        severity: 'warning',
        actionRequired: true,
        title: 'بل داخله از پلان مالی صادر نشده',
        description: `${studentName} عضویت فعال دارد و پلان مالی صنف ${formatAmountLabel(plannedAdmissionFee, currency)} داخله دارد، اما هنوز بل یا سند داخله برای او دیده نشد.`,
        studentName,
        admissionNo,
        studentUserId,
        classTitle,
        classId,
        academicYearTitle,
        academicYearId,
        membershipId,
        referenceNumber: normalizeText(feePlan?.title) || membershipId || normalizeNullableId(membershipItem?.id || membershipItem?._id),
        amount: plannedAdmissionFee,
        amountLabel: formatAmountLabel(plannedAdmissionFee, currency),
        status: normalizeText(membershipItem?.status),
        at: membershipItem?.enrolledAt || membershipItem?.createdAt || null,
        feePlanId: normalizeNullableId(feePlan?._id || feePlan?.id),
        tags: ['membership', 'admission', 'fee_plan']
      });
    }

    if (feePlan) {
      ['tuition', 'exam', 'transport', 'document', 'other'].forEach((feeType) => {
        const plannedAmount = getPlannedFeeAmount(feePlan, feeType);
        if (plannedAmount <= 0) return;
        const matchingDocuments = financeDocuments.filter((document) => {
          if (feeType === 'tuition' && isLikelyAdmissionDocumentForPlan(document, feePlan)) return false;
          return getFinanceDocumentFeeTypes(document).has(feeType);
        });
        const activeDocuments = matchingDocuments.filter((document) => ['new', 'partial', 'overdue', 'paid', 'waived'].includes(normalizeText(document?.status)));
        const totalIssuedAmount = roundMoney(matchingDocuments.reduce((sum, document) => sum + getFinanceDocumentAmountByType(document, feeType), 0));
        const feeLabel = getFeeTypeLabel(feeType);

        if (!matchingDocuments.length) {
          anomalies.push({
            id: `fee-missing-${feeType}-${membershipId || normalizeNullableId(membershipItem?.id || membershipItem?._id || studentName)}`,
            anomalyType: 'planned_fee_missing',
            severity: feeType === 'tuition' ? 'critical' : 'warning',
            actionRequired: true,
            title: `بل ${feeLabel} صادر نشده`,
            description: `${studentName} در پلان مالی صنف ${formatAmountLabel(plannedAmount, currency)} ${feeLabel} دارد، اما برای این عضویت بل معتبر دیده نشد.`,
            studentName,
        admissionNo,
            studentUserId,
            classTitle,
            classId,
            academicYearTitle,
            academicYearId,
            membershipId,
            referenceNumber: normalizeText(feePlan?.title) || membershipId,
            amount: plannedAmount,
            amountLabel: formatAmountLabel(plannedAmount, currency),
            status: normalizeText(membershipItem?.status),
            at: membershipItem?.enrolledAt || membershipItem?.createdAt || null,
            feePlanId: normalizeNullableId(feePlan?._id || feePlan?.id),
            tags: ['membership', feeType, 'fee_plan', 'missing_bill']
          });
          return;
        }

        const activeDocumentsByPeriod = new Map();
        const legacyPeriodCounts = new Map();
        activeDocuments.forEach((document) => {
          const legacyPeriodKey = getLegacyFinanceDocumentPeriodKey(document);
          if (legacyPeriodKey) {
            legacyPeriodCounts.set(legacyPeriodKey, (legacyPeriodCounts.get(legacyPeriodKey) || 0) + 1);
          }
          getFinanceDocumentPeriodSlices(document, feeType).forEach((periodSlice) => {
            const current = activeDocumentsByPeriod.get(periodSlice.key) || [];
            current.push({ document, periodSlice });
            activeDocumentsByPeriod.set(periodSlice.key, current);
          });
        });

        activeDocumentsByPeriod.forEach((periodEntries, periodKey) => {
          if (periodEntries.length <= 1) return;

          const periodDocuments = periodEntries.map((entry) => entry.document);
          const periodAmount = roundMoney(periodEntries.reduce(
            (sum, entry) => sum + roundMoney(entry?.periodSlice?.amount),
            0
          ));
          const displayedPeriod = normalizeText(periodEntries[0]?.periodSlice?.label) || periodKey;
          const membershipKey = membershipId || normalizeNullableId(
            membershipItem?.id || membershipItem?._id || studentName
          );
          const anomalyIdentity = buildDuplicateFeeAnomalyIdentity({
            feeType,
            membershipKey,
            periodKey,
            legacyPeriodKeys: periodDocuments
              .map((document) => getLegacyFinanceDocumentPeriodKey(document))
              .filter((key) => key && legacyPeriodCounts.get(key) > 1)
          });

          anomalies.push({
            id: anomalyIdentity.id,
            legacyAnomalyIds: anomalyIdentity.legacyAnomalyIds,
            anomalyType: 'duplicate_fee_bill',
            severity: 'warning',
            actionRequired: true,
            title: `بل تکراری ${feeLabel}`,
            description: `${studentName} برای ${feeLabel} در دوره ${displayedPeriod} بیش از یک بل دارد. تعداد سندها: ${periodDocuments.length.toLocaleString('fa-AF-u-ca-persian')}.`,
            studentName,
        admissionNo,
            studentUserId,
            classTitle,
            classId,
            academicYearTitle,
            academicYearId,
            membershipId,
            referenceNumber: periodDocuments
              .map((document) => normalizeText(document?.orderNumber || document?.billNumber || document?.title))
              .filter(Boolean)
              .slice(0, 3)
              .join('، '),
            amount: periodAmount,
            amountLabel: formatAmountLabel(periodAmount, currency),
            status: normalizeText(membershipItem?.status),
            at: periodDocuments[0]?.createdAt || periodDocuments[0]?.dueDate || null,
            tags: ['membership', feeType, 'duplicate_bill', periodKey]
          });
        });

        const hasManualOrUnplannedDocument = matchingDocuments.some((document) => !isPlanGeneratedFinanceDocument(document));
        if (hasManualOrUnplannedDocument && totalIssuedAmount > 0 && totalIssuedAmount + 0.009 < plannedAmount) {
          const difference = roundMoney(plannedAmount - totalIssuedAmount);
          anomalies.push({
            id: `fee-underbilled-${feeType}-${membershipId || normalizeNullableId(membershipItem?.id || membershipItem?._id || studentName)}`,
            anomalyType: 'fee_underbilled',
            severity: feeType === 'tuition' ? 'critical' : 'warning',
            actionRequired: true,
            title: `مبلغ بل ${feeLabel} کمتر از پلان است`,
            description: `${studentName} در پلان مالی ${formatAmountLabel(plannedAmount, currency)} ${feeLabel} دارد، اما مبلغ صادرشده ${formatAmountLabel(totalIssuedAmount, currency)} است.`,
            studentName,
        admissionNo,
            studentUserId,
            classTitle,
            classId,
            academicYearTitle,
            academicYearId,
            membershipId,
            referenceNumber: normalizeText(feePlan?.title) || membershipId,
            secondaryReference: matchingDocuments.map((document) => normalizeText(document?.orderNumber || document?.billNumber || document?.title)).filter(Boolean).slice(0, 3).join('، '),
            amount: difference,
            amountLabel: formatAmountLabel(difference, currency),
            status: normalizeText(membershipItem?.status),
            at: matchingDocuments[0]?.createdAt || matchingDocuments[0]?.dueDate || null,
            feePlanId: normalizeNullableId(feePlan?._id || feePlan?.id),
            tags: ['membership', feeType, 'fee_plan', 'underbilled']
          });
        }
      });
    }
  } else {
    // Membership already ended (dropped/transferred/expelled/graduated/...).
    // A bill or order due on/after the month it ended that still shows money
    // paid on it means the student was charged (and paid) for a period they
    // were no longer enrolled in - that money needs a refund case, not a
    // silent "paid" bill sitting in the books.
    const membershipEndedAt = toDate(membershipItem?.endedAt);
    if (membershipEndedAt) {
      const postEndWindowStart = new Date(membershipEndedAt.getFullYear(), membershipEndedAt.getMonth() + 1, 1);
      const postEndDocuments = [...normalizedBills, ...normalizedOrders].filter((document) => {
        if (normalizeText(document?.status) === 'void') return false;
        if (roundMoney(document?.amountPaid) <= 0) return false;
        const dueDate = toDate(document?.dueDate);
        if (!dueDate) return false;
        return dueDate.getTime() >= postEndWindowStart.getTime();
      });

      postEndDocuments.forEach((document) => {
        const documentId = normalizeNullableId(document?.id || document?._id);
        if (documentId && documentsWithOpenRefund.has(documentId)) return;
        const reference = normalizeText(document?.billNumber || document?.orderNumber || document?.title) || 'سند مالی';
        const dueDate = toDate(document?.dueDate);
        anomalies.push({
          id: `payment-after-membership-end-${documentId || reference}`,
          anomalyType: 'payment_after_membership_end',
          severity: 'critical',
          actionRequired: true,
          title: 'پرداخت برای دوره بعد از ختم عضویت ثبت شده',
          description: `${studentName} از عضویت خارج شده، اما ${reference} برای دوره‌ای بعد از آن مبلغ پرداخت‌شده نشان می‌دهد. این مبلغ باید بازپرداخت یا بررسی شود.`,
          studentName,
        admissionNo,
          studentUserId,
          classTitle,
          classId,
          academicYearTitle,
          academicYearId,
          membershipId,
          referenceNumber: reference,
          amount: roundMoney(document?.amountPaid),
          amountLabel: formatAmountLabel(document?.amountPaid, currency),
          status: normalizeText(document?.status),
          dueDate: dueDate?.toISOString() || null,
          membershipEndedAt: membershipEndedAt.toISOString(),
          at: dueDate?.toISOString() || membershipEndedAt.toISOString(),
          billId: document?.documentKind === 'bill' ? documentId : null,
          orderId: document?.documentKind === 'order' ? documentId : null,
          tags: ['membership_ended', 'refund_review', document?.documentKind || 'document']
        });
      });
    }
  }

  const ordered = sortAnomalies(anomalies);
  const limited = ordered.slice(0, Math.max(1, Number(limit) || 20));
  return {
    items: limited,
    summary: buildAnomalySummary(ordered)
  };
}

function formatMembershipLite(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: normalizeNullableId(item._id || item.id),
    status: normalizeText(item.status),
    isCurrent: Boolean(item.isCurrent),
    enrolledAt: item.enrolledAt || null,
    endedAt: item.endedAt || item.leftAt || null,
    createdAt: item.createdAt || null,
    student: item.student ? {
      userId: normalizeNullableId(item.student?._id || item.student),
      studentCoreId: normalizeNullableId(item.studentId?._id || item.studentId),
      fullName: normalizeText(item.studentId?.fullName),
      name: normalizeText(item.student?.name),
      email: normalizeText(item.student?.email),
      // StudentCore.admissionNo is rarely filled in by this school - fall
      // back to AfghanStudent.asasNumber (via the membership's own
      // afghanStudentId link, populated alongside studentId above).
      admissionNo: normalizeText(item.studentId?.admissionNo) || normalizeText(item.afghanStudentId?.asasNumber)
    } : {
      userId: normalizeNullableId(item.student),
      studentCoreId: normalizeNullableId(item.studentId?._id || item.studentId),
      fullName: normalizeText(item.studentId?.fullName),
      name: '',
      email: '',
      admissionNo: normalizeText(item.studentId?.admissionNo) || normalizeText(item.afghanStudentId?.asasNumber)
    },
    schoolClass: item.classId ? {
      id: normalizeNullableId(item.classId?._id || item.classId),
      title: normalizeText(item.classId?.title)
    } : null,
    academicYear: item.academicYearId ? {
      id: normalizeNullableId(item.academicYearId?._id || item.academicYearId),
      title: normalizeText(item.academicYearId?.title)
    } : null
  };
}

function formatOrderLite(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: normalizeNullableId(item._id || item.id),
    documentKind: 'order',
    sourceBillId: normalizeNullableId(item.sourceBillId?._id || item.sourceBillId),
    orderNumber: formatFinanceCode(normalizeText(item.orderNumber)),
    title: normalizeText(item.title),
    orderType: normalizeText(item.orderType),
    periodType: normalizeText(item.periodType),
    periodLabel: normalizeText(item.periodLabel),
    note: normalizeText(item.note),
    lineItems: Array.isArray(item.lineItems) ? item.lineItems.map((entry) => ({
      feeType: normalizeText(entry?.feeType),
      label: normalizeText(entry?.label),
      sourcePlanId: normalizeNullableId(entry?.sourcePlanId?._id || entry?.sourcePlanId),
      periodKey: normalizeText(entry?.periodKey),
      grossAmount: roundMoney(entry?.grossAmount),
      netAmount: roundMoney(entry?.netAmount),
      reductionAmount: roundMoney(entry?.reductionAmount),
      balanceAmount: roundMoney(entry?.balanceAmount)
    })) : [],
    feeScopes: Array.isArray(item.feeScopes) ? item.feeScopes.map((entry) => normalizeText(entry)).filter(Boolean) : [],
    feeBreakdown: item.feeBreakdown || {},
    status: normalizeText(item.status),
    currency: normalizeText(item.currency) || 'AFN',
    amountDue: roundMoney(item.amountDue),
    amountPaid: roundMoney(item.amountPaid),
    outstandingAmount: roundMoney(item.outstandingAmount),
    dueDate: item.dueDate || null,
    paidAt: item.paidAt || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    student: {
      userId: normalizeNullableId(item.student?._id || item.student),
      studentCoreId: normalizeNullableId(item.studentId?._id || item.studentId),
      fullName: normalizeText(item.studentId?.fullName),
      name: normalizeText(item.student?.name),
      email: normalizeText(item.student?.email)
    },
    schoolClass: item.classId ? {
      id: normalizeNullableId(item.classId?._id || item.classId),
      title: normalizeText(item.classId?.title)
    } : null,
    academicYear: item.academicYearId ? {
      id: normalizeNullableId(item.academicYearId?._id || item.academicYearId),
      title: normalizeText(item.academicYearId?.title)
    } : null
  };
}

function formatBillLite(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  const amountDue = roundMoney(item.amountDue);
  const amountPaid = roundMoney(item.amountPaid);
  return {
    id: normalizeNullableId(item._id || item.id),
    documentKind: 'bill',
    billNumber: formatFinanceCode(normalizeText(item.billNumber)),
    title: normalizeText(item.periodLabel || item.billNumber),
    orderType: '',
    periodType: normalizeText(item.periodType),
    periodLabel: normalizeText(item.periodLabel),
    note: normalizeText(item.note),
    lineItems: Array.isArray(item.lineItems) ? item.lineItems.map((entry) => ({
      feeType: normalizeText(entry?.feeType),
      label: normalizeText(entry?.label),
      sourcePlanId: normalizeNullableId(entry?.sourcePlanId?._id || entry?.sourcePlanId),
      periodKey: normalizeText(entry?.periodKey),
      grossAmount: roundMoney(entry?.grossAmount),
      netAmount: roundMoney(entry?.netAmount),
      reductionAmount: roundMoney(entry?.reductionAmount),
      balanceAmount: roundMoney(entry?.balanceAmount)
    })) : [],
    feeScopes: Array.isArray(item.feeScopes) ? item.feeScopes.map((entry) => normalizeText(entry)).filter(Boolean) : [],
    feeBreakdown: item.feeBreakdown || {},
    status: normalizeText(item.status),
    currency: normalizeText(item.currency) || 'AFN',
    amountDue,
    amountPaid,
    outstandingAmount: roundMoney(amountDue - amountPaid),
    dueDate: item.dueDate || null,
    paidAt: item.paidAt || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    student: {
      userId: normalizeNullableId(item.student?._id || item.student),
      studentCoreId: normalizeNullableId(item.studentId?._id || item.studentId),
      fullName: normalizeText(item.studentId?.fullName),
      name: normalizeText(item.student?.name),
      email: normalizeText(item.student?.email)
    },
    schoolClass: item.classId ? {
      id: normalizeNullableId(item.classId?._id || item.classId),
      title: normalizeText(item.classId?.title)
    } : null,
    academicYear: item.academicYearId ? {
      id: normalizeNullableId(item.academicYearId?._id || item.academicYearId),
      title: normalizeText(item.academicYearId?.title)
    } : null
  };
}

function formatPaymentLite(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: normalizeNullableId(item._id || item.id),
    paymentNumber: formatFinanceCode(normalizeText(item.paymentNumber)),
    amount: roundMoney(item.amount),
    currency: normalizeText(item.currency) || 'AFN',
    status: normalizeText(item.status),
    approvalStage: normalizeText(item.approvalStage),
    paidAt: item.paidAt || null,
    createdAt: item.createdAt || null,
    student: {
      userId: normalizeNullableId(item.student?._id || item.student),
      fullName: normalizeText(item.studentId?.fullName),
      name: normalizeText(item.student?.name),
      email: normalizeText(item.student?.email)
    },
    schoolClass: item.classId ? {
      id: normalizeNullableId(item.classId?._id || item.classId),
      title: normalizeText(item.classId?.title)
    } : null,
    academicYear: item.academicYearId ? {
      id: normalizeNullableId(item.academicYearId?._id || item.academicYearId),
      title: normalizeText(item.academicYearId?.title)
    } : null
  };
}

function splitPaymentByAllocatedMembership(doc = {}) {
  const item = toPlain(doc) || {};
  const orderById = new Map();
  [
    item?.feeOrderId,
    ...(Array.isArray(item?.allocations) ? item.allocations.map((allocation) => allocation?.feeOrderId) : [])
  ].forEach((order) => {
    const orderId = normalizeNullableId(order?._id || order);
    if (orderId && order && typeof order === 'object') orderById.set(orderId, order);
  });
  const allocationScope = buildPaymentClassScope(item, orderById);
  const groupedByMembership = allocationScope.allocations.reduce((map, allocation) => {
    const order = allocation.order;
    if (!order || normalizeText(order.status) === 'void') return map;
    const membershipId = normalizeNullableId(order.studentMembershipId);
    if (!membershipId) return map;
    const current = map.get(membershipId) || { amount: 0, order };
    current.amount = roundMoney(current.amount + Number(allocation.amount || 0));
    map.set(membershipId, current);
    return map;
  }, new Map());

  return Array.from(groupedByMembership.entries()).map(([membershipId, { amount, order }]) => ({
    membershipId,
    payment: formatPaymentLite({
      ...item,
      amount,
      classId: order.classId || null,
      academicYearId: order.academicYearId || null
    })
  }));
}

function formatReliefLite(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: normalizeNullableId(item._id || item.id),
    sourceKey: normalizeText(item.sourceKey),
    reliefType: normalizeText(item.reliefType),
    scope: normalizeText(item.scope),
    coverageMode: normalizeText(item.coverageMode),
    amount: roundMoney(item.amount),
    percentage: roundMoney(item.percentage),
    status: normalizeText(item.status),
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    createdAt: item.createdAt || null,
    student: {
      userId: normalizeNullableId(item.student?._id || item.student),
      fullName: normalizeText(item.studentId?.fullName),
      name: normalizeText(item.student?.name),
      email: normalizeText(item.student?.email)
    },
    schoolClass: item.classId ? {
      id: normalizeNullableId(item.classId?._id || item.classId),
      title: normalizeText(item.classId?.title)
    } : null,
    academicYear: item.academicYearId ? {
      id: normalizeNullableId(item.academicYearId?._id || item.academicYearId),
      title: normalizeText(item.academicYearId?.title)
    } : null
  };
}

async function buildFinanceAnomalyReport({
  schoolId = '',
  classId = '',
  academicYearId = '',
  studentMembershipId = '',
  asOf = new Date(),
  limit = 120
} = {}) {
  const sourceLimit = Math.min(5000, Math.max(500, Number(limit || 120) * 20));
  const membershipFilter = {};
  const orderFilter = { status: { $ne: 'void' } };
  const billFilter = { status: { $ne: 'void' } };
  const paymentFilter = { status: { $in: ['pending', 'approved'] } };
  const reliefFilter = { status: 'active', feeOrderId: null };
  const refundFilter = { status: { $in: ['pending_review', 'approved'] } };
  const feePlanFilter = { isActive: true, lifecycleStatus: 'active' };

  if (normalizeNullableId(schoolId)) {
    membershipFilter.schoolId = schoolId;
    orderFilter.schoolId = schoolId;
    billFilter.schoolId = schoolId;
    paymentFilter.schoolId = schoolId;
    reliefFilter.schoolId = schoolId;
    refundFilter.schoolId = schoolId;
    feePlanFilter.schoolId = schoolId;
  }

  if (normalizeNullableId(studentMembershipId)) {
    membershipFilter._id = studentMembershipId;
    orderFilter.studentMembershipId = studentMembershipId;
    billFilter.studentMembershipId = studentMembershipId;
    reliefFilter.studentMembershipId = studentMembershipId;
    refundFilter.studentMembershipId = studentMembershipId;
  }
  if (normalizeNullableId(classId)) {
    membershipFilter.classId = classId;
    orderFilter.classId = classId;
    billFilter.classId = classId;
    reliefFilter.classId = classId;
    refundFilter.classId = classId;
    feePlanFilter.classId = classId;
  }
  if (normalizeNullableId(academicYearId)) {
    membershipFilter.academicYearId = academicYearId;
    orderFilter.academicYearId = academicYearId;
    billFilter.academicYearId = academicYearId;
    reliefFilter.academicYearId = academicYearId;
    refundFilter.academicYearId = academicYearId;
    feePlanFilter.academicYearId = academicYearId;
  }

  const paymentOrderScopeFilter = { status: { $ne: 'void' } };
  if (normalizeNullableId(schoolId)) paymentOrderScopeFilter.schoolId = schoolId;
  if (normalizeNullableId(studentMembershipId)) paymentOrderScopeFilter.studentMembershipId = studentMembershipId;
  if (normalizeNullableId(classId)) paymentOrderScopeFilter.classId = classId;
  if (normalizeNullableId(academicYearId)) paymentOrderScopeFilter.academicYearId = academicYearId;
  if (normalizeNullableId(studentMembershipId) || normalizeNullableId(classId) || normalizeNullableId(academicYearId)) {
    const scopedPaymentOrders = await FeeOrder.find(paymentOrderScopeFilter).select('_id').lean();
    Object.assign(paymentFilter, buildPaymentOrderLinkFilter(scopedPaymentOrders.map((item) => item?._id).filter(Boolean)));
  }

  const [memberships, orders, bills, payments, reliefs, refunds, feePlans] = await Promise.all([
    StudentMembership.find(membershipFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('afghanStudentId', 'asasNumber')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ createdAt: -1 })
      .limit(sourceLimit)
      .lean(),
    FeeOrder.find(orderFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ dueDate: -1, createdAt: -1 })
      .limit(sourceLimit)
      .lean(),
    FinanceBill.find(billFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ dueDate: -1, createdAt: -1 })
      .limit(sourceLimit)
      .lean(),
    FeePayment.find(paymentFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .populate({
        path: 'feeOrderId',
        select: 'studentMembershipId classId academicYearId schoolId status',
        populate: [
          { path: 'classId', select: 'title code gradeLevel section' },
          { path: 'academicYearId', select: 'title code' }
        ]
      })
      .populate({
        path: 'allocations.feeOrderId',
        select: 'studentMembershipId classId academicYearId schoolId status',
        populate: [
          { path: 'classId', select: 'title code gradeLevel section' },
          { path: 'academicYearId', select: 'title code' }
        ]
      })
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(sourceLimit)
      .lean(),
    FinanceRelief.find(reliefFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ endDate: 1, createdAt: -1 })
      .limit(sourceLimit)
      .lean(),
    FinanceRefund.find(refundFilter)
      .select('studentMembershipId bill feeOrder status')
      .limit(sourceLimit)
      .lean(),
    FinanceFeePlan.find(feePlanFilter)
      .select('title tuitionFee admissionFee examFee documentFee transportDefaultFee otherFee amount classId academicYearId effectiveFrom effectiveTo isDefault priority isActive lifecycleStatus currency')
      .sort({ isDefault: -1, priority: 1, createdAt: -1 })
      .limit(sourceLimit)
      .lean()
  ]);

  const studentUserIds = [...new Set(memberships
    .map((item) => normalizeNullableId(item?.student?._id || item?.student))
    .filter(Boolean))];
  const studentCoreIds = [...new Set(memberships
    .map((item) => normalizeNullableId(item?.studentId?._id || item?.studentId))
    .filter(Boolean))];
  const studentAdmissionFilter = {
    status: { $ne: 'void' },
    ...(normalizeNullableId(schoolId) ? { schoolId } : {})
  };
  const studentAdmissionOr = [];
  if (studentUserIds.length) studentAdmissionOr.push({ student: { $in: studentUserIds } });
  if (studentCoreIds.length) studentAdmissionOr.push({ studentId: { $in: studentCoreIds } });
  if (studentAdmissionOr.length) studentAdmissionFilter.$or = studentAdmissionOr;
  const [studentAdmissionOrders, studentAdmissionBills] = studentAdmissionOr.length ? await Promise.all([
    FeeOrder.find(studentAdmissionFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ dueDate: -1, createdAt: -1 })
      .limit(sourceLimit)
      .lean(),
    FinanceBill.find(studentAdmissionFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ dueDate: -1, createdAt: -1 })
      .limit(sourceLimit)
      .lean()
  ]) : [[], []];

  const membershipMap = new Map(
    memberships.map((item) => [normalizeNullableId(item?._id), formatMembershipLite(item)])
  );

  const orderMap = new Map();
  const fallbackOrderMap = new Map();
  orders.forEach((item) => {
    const membershipId = normalizeNullableId(item?.studentMembershipId);
    const formatted = formatOrderLite(item);
    if (membershipId) {
      const current = orderMap.get(membershipId) || [];
      current.push(formatted);
      orderMap.set(membershipId, current);
      return;
    }
    const contextKey = makeFinanceContextKey({
      studentId: item?.studentId?._id || item?.studentId,
      studentUserId: item?.student?._id || item?.student,
      classId: item?.classId?._id || item?.classId,
      academicYearId: item?.academicYearId?._id || item?.academicYearId
    });
    if (!contextKey) return;
    const current = fallbackOrderMap.get(contextKey) || [];
    current.push(formatted);
    fallbackOrderMap.set(contextKey, current);
  });

  const billMap = new Map();
  const fallbackBillMap = new Map();
  bills.forEach((item) => {
    const membershipId = normalizeNullableId(item?.studentMembershipId);
    const formatted = formatBillLite(item);
    if (membershipId) {
      const current = billMap.get(membershipId) || [];
      current.push(formatted);
      billMap.set(membershipId, current);
      return;
    }
    const contextKey = makeFinanceContextKey({
      studentId: item?.studentId?._id || item?.studentId,
      studentUserId: item?.student?._id || item?.student,
      classId: item?.classId?._id || item?.classId,
      academicYearId: item?.academicYearId?._id || item?.academicYearId
    });
    if (!contextKey) return;
    const current = fallbackBillMap.get(contextKey) || [];
    current.push(formatted);
    fallbackBillMap.set(contextKey, current);
  });

  const paymentMap = new Map();
  payments.forEach((item) => {
    splitPaymentByAllocatedMembership(item).forEach(({ membershipId, payment }) => {
      const current = paymentMap.get(membershipId) || [];
      current.push(payment);
      paymentMap.set(membershipId, current);
    });
  });

  const reliefMap = new Map();
  reliefs.forEach((item) => {
    const membershipId = normalizeNullableId(item?.studentMembershipId);
    if (!membershipId) return;
    const current = reliefMap.get(membershipId) || [];
    current.push(formatReliefLite(item));
    reliefMap.set(membershipId, current);
  });

  const refundMap = new Map();
  refunds.forEach((item) => {
    const membershipId = normalizeNullableId(item?.studentMembershipId);
    if (!membershipId) return;
    const current = refundMap.get(membershipId) || [];
    current.push({
      bill: normalizeNullableId(item?.bill),
      feeOrder: normalizeNullableId(item?.feeOrder),
      status: normalizeText(item?.status)
    });
    refundMap.set(membershipId, current);
  });

  const studentAdmissionDocumentMap = new Map();
  const pushStudentAdmissionDocument = (item = null) => {
    if (!item) return;
    const studentKeys = [
      item?.student?.userId,
      item?.student?.studentCoreId
    ].map(normalizeNullableId).filter(Boolean);
    studentKeys.forEach((studentKey) => {
      const current = studentAdmissionDocumentMap.get(studentKey) || [];
      current.push(item);
      studentAdmissionDocumentMap.set(studentKey, current);
    });
  };
  studentAdmissionOrders.map(formatOrderLite).forEach(pushStudentAdmissionDocument);
  studentAdmissionBills.map(formatBillLite).forEach(pushStudentAdmissionDocument);

  const allItems = [];
  membershipMap.forEach((membership, membershipId) => {
    const contextKey = makeFinanceContextKey({
      studentId: membership?.student?.studentCoreId,
      studentUserId: membership?.student?.userId,
      classId: membership?.schoolClass?.id,
      academicYearId: membership?.academicYear?.id
    });
    const membershipOrders = mergeUniqueById(orderMap.get(membershipId) || [], fallbackOrderMap.get(contextKey) || []);
    const membershipBills = mergeUniqueById(billMap.get(membershipId) || [], fallbackBillMap.get(contextKey) || []);
    const admissionDocuments = mergeUniqueById(
      studentAdmissionDocumentMap.get(normalizeNullableId(membership?.student?.userId)) || [],
      studentAdmissionDocumentMap.get(normalizeNullableId(membership?.student?.studentCoreId)) || []
    );
    const report = buildMembershipFinanceAnomalies({
      membership,
      orders: membershipOrders,
      bills: membershipBills,
      admissionDocuments,
      payments: paymentMap.get(membershipId) || [],
      reliefs: reliefMap.get(membershipId) || [],
      refunds: refundMap.get(membershipId) || [],
      feePlans,
      asOf,
      limit: Math.max(Number(limit) || 120, 50)
    });
    allItems.push(...report.items.map((item) => ({
      ...item,
      schoolId: normalizeNullableId(schoolId || membership?.schoolId)
    })));
  });

  const ordered = sortAnomalies(allItems).slice(0, Math.max(1, Number(limit) || 120));
  return {
    items: ordered,
    summary: buildAnomalySummary(allItems),
    generatedAt: new Date().toISOString(),
    appliedFilters: {
      schoolId: normalizeNullableId(schoolId),
      classId: normalizeNullableId(classId),
      academicYearId: normalizeNullableId(academicYearId),
      studentMembershipId: normalizeNullableId(studentMembershipId)
    }
  };
}

module.exports = {
  buildFinanceAnomalyReport,
  buildMembershipFinanceAnomalies,
  buildAnomalySummary,
  formatAmountLabel,
  __paymentClassScopeTestUtils: Object.freeze({
    splitPaymentByAllocatedMembership
  })
};
