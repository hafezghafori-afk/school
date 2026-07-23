const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  buildUnifiedReliefHistory,
  buildStudentFinanceScope,
  formatOrder,
  formatPayment,
  paginate,
  summarizeOrders,
  summarizePayments
} = require('../services/studentOpenAccountService');

const now = new Date('2026-07-22T12:00:00.000Z');
const ids = {
  school: '507f191e810c19729de86001',
  membership: '507f191e810c19729de86002',
  studentCore: '507f191e810c19729de86003',
  user: '507f191e810c19729de86004',
  tuitionOrder: '507f191e810c19729de86005',
  admissionOrder: '507f191e810c19729de86006',
  voidOrder: '507f191e810c19729de86007'
};

const membership = {
  _id: ids.membership,
  schoolId: ids.school,
  studentId: { _id: ids.studentCore, fullName: 'Test Student' },
  student: { _id: ids.user, name: 'Test Student' },
  status: 'active',
  isCurrent: true
};

const tuitionOrderDoc = {
  _id: ids.tuitionOrder,
  orderNumber: 'FEE-1',
  orderType: 'tuition',
  source: 'finance_bill',
  sourceBillId: '507f191e810c19729de86011',
  studentMembershipId: ids.membership,
  amountOriginal: 500,
  amountPaid: 100,
  adjustments: [{ type: 'discount', scope: 'tuition', amount: 100 }],
  lineItems: [{ feeType: 'tuition', grossAmount: 500 }],
  status: 'new',
  issuedAt: new Date('2026-06-01T00:00:00.000Z'),
  dueDate: new Date('2026-06-10T00:00:00.000Z')
};

const admissionOrderDoc = {
  _id: ids.admissionOrder,
  orderNumber: 'ADM-1',
  orderType: 'admission',
  source: 'finance_bill',
  sourceBillId: '507f191e810c19729de86012',
  studentMembershipId: ids.membership,
  amountOriginal: 500,
  amountPaid: 500,
  lineItems: [{ feeType: 'admission', grossAmount: 500 }],
  status: 'paid',
  issuedAt: new Date('2026-05-01T00:00:00.000Z'),
  dueDate: new Date('2026-05-10T00:00:00.000Z')
};

const voidOrderDoc = {
  _id: ids.voidOrder,
  orderNumber: 'VOID-1',
  orderType: 'tuition',
  source: 'system',
  studentMembershipId: ids.membership,
  amountOriginal: 700,
  amountPaid: 0,
  lineItems: [{ feeType: 'tuition', grossAmount: 700 }],
  status: 'void',
  dueDate: new Date('2026-04-10T00:00:00.000Z')
};

const tuitionOrder = formatOrder(tuitionOrderDoc, membership, { now });
const admissionOrder = formatOrder(admissionOrderDoc, membership, { now });
const voidOrder = formatOrder(voidOrderDoc, membership, { now });
const undatedOrder = formatOrder({
  _id: '507f191e810c19729de86008',
  orderNumber: 'NO-DUE-1',
  orderType: 'tuition',
  studentMembershipId: ids.membership,
  amountOriginal: 250,
  amountPaid: 0,
  lineItems: [{ feeType: 'tuition', grossAmount: 250 }],
  status: 'new',
  issuedAt: new Date('2026-01-01T00:00:00.000Z'),
  dueDate: null
}, membership, { now });
const dueTodayOrder = formatOrder({
  _id: '507f191e810c19729de86009',
  orderNumber: 'DUE-TODAY-1',
  orderType: 'tuition',
  studentMembershipId: ids.membership,
  amountOriginal: 200,
  amountPaid: 0,
  lineItems: [{ feeType: 'tuition', grossAmount: 200 }],
  status: 'new',
  issuedAt: new Date('2026-07-01T00:00:00.000Z'),
  dueDate: new Date('2026-07-22T00:00:00.000Z')
}, membership, { now });
const dueYesterdayOrder = formatOrder({
  _id: '507f191e810c19729de86010',
  orderNumber: 'DUE-YESTERDAY-1',
  orderType: 'tuition',
  studentMembershipId: ids.membership,
  amountOriginal: 175,
  amountPaid: 0,
  lineItems: [{ feeType: 'tuition', grossAmount: 175 }],
  status: 'new',
  issuedAt: new Date('2026-07-01T00:00:00.000Z'),
  dueDate: new Date('2026-07-21T00:00:00.000Z')
}, membership, { now });

assert.strictEqual(tuitionOrder.status, 'overdue', 'stored new status must be derived as overdue');
assert.strictEqual(tuitionOrder.storedStatus, 'new');
assert.strictEqual(tuitionOrder.tuition.gross, 500);
assert.strictEqual(tuitionOrder.tuition.discount, 100);
assert.strictEqual(tuitionOrder.tuition.outstanding, 300);
assert.strictEqual(admissionOrder.status, 'paid');
assert.strictEqual(voidOrder.status, 'void');
assert.strictEqual(undatedOrder.status, 'new', 'an order without a due date must not become overdue');
assert.strictEqual(dueTodayOrder.status, 'new', 'a bill must not become overdue during its due calendar day');
assert.strictEqual(dueYesterdayOrder.status, 'overdue', 'a bill due on a prior calendar day must be overdue');

const dueDateSummary = summarizeOrders([undatedOrder, tuitionOrder], { now });
assert.strictEqual(dueDateSummary.dueNowOutstanding, 300, 'an undated order must not enter due-now totals');
assert.strictEqual(dueDateSummary.oldestOpenOrderId, ids.tuitionOrder, 'undated orders must sort after dated open orders');
const dueTodaySummary = summarizeOrders([undatedOrder, dueTodayOrder], { now });
assert.strictEqual(dueTodaySummary.dueNowOutstanding, 200, 'a bill is payable on its due day without being marked overdue');

const orderSummary = summarizeOrders([tuitionOrder, admissionOrder, voidOrder], { now });
assert.strictEqual(orderSummary.count, 3);
assert.strictEqual(orderSummary.activeCount, 2);
assert.strictEqual(orderSummary.voidOrders, 1);
assert.strictEqual(orderSummary.byCategory.tuition.gross, 500, 'void tuition must not enter active totals');
assert.strictEqual(orderSummary.byCategory.admission.gross, 500);
assert.strictEqual(orderSummary.totals.outstanding, 300);
assert.strictEqual(orderSummary.voidedTotals.gross, 700, 'void value must be reported separately');

const approvedPayment = formatPayment({
  _id: '507f191e810c19729de86021',
  paymentNumber: 'PAY-1',
  studentMembershipId: ids.membership,
  amount: 500,
  status: 'approved',
  allocations: [{ feeOrderId: admissionOrderDoc, feeType: 'admission', amount: 500 }]
}, membership, { now });
const pendingPayment = formatPayment({
  _id: '507f191e810c19729de86022',
  paymentNumber: 'PAY-2',
  studentMembershipId: ids.membership,
  amount: 300,
  status: 'pending',
  allocations: [{ feeOrderId: tuitionOrderDoc, feeType: 'tuition', amount: 300 }]
}, membership, { now });
const voidPayment = formatPayment({
  _id: '507f191e810c19729de86023',
  paymentNumber: 'PAY-3',
  studentMembershipId: ids.membership,
  amount: 700,
  status: 'approved',
  allocations: [{ feeOrderId: voidOrderDoc, feeType: 'tuition', amount: 700 }]
}, membership, { now });

const paymentSummary = summarizePayments([approvedPayment, pendingPayment, voidPayment]);
assert.strictEqual(paymentSummary.byStatus.approved.amount, 1200);
assert.strictEqual(paymentSummary.byStatus.approved.recognizedAmount, 500);
assert.strictEqual(paymentSummary.byStatus.approved.excludedVoidAmount, 700);
assert.strictEqual(paymentSummary.byStatus.pending.amount, 300);
assert.strictEqual(paymentSummary.byStatus.approved.byCategory.admission, 500);

const unifiedReliefs = buildUnifiedReliefHistory({
  discounts: [
    { id: 'discount-mirrored', discountType: 'discount', coverageMode: 'fixed', amount: 500, status: 'active' },
    { id: 'discount-legacy', discountType: 'waiver', coverageMode: 'percent', percentage: 25, status: 'active' }
  ],
  reliefs: [
    {
      id: 'relief-discount',
      recordType: 'finance_relief',
      sourceKey: 'discount:discount-mirrored',
      sourceDiscountId: 'discount-mirrored',
      reliefType: 'discount',
      scope: 'tuition',
      coverageMode: 'fixed',
      amount: 500,
      status: 'active'
    },
    {
      id: 'relief-exemption',
      recordType: 'finance_relief',
      sourceKey: 'fee_exemption:exemption-mirrored',
      sourceExemptionId: 'exemption-mirrored',
      reliefType: 'free_student',
      scope: 'all',
      coverageMode: 'full',
      percentage: 100,
      status: 'active'
    }
  ],
  exemptions: [
    { id: 'exemption-mirrored', exemptionType: 'full', scope: 'all', status: 'active' },
    { id: 'exemption-legacy', exemptionType: 'partial', scope: 'admission', amount: 125, status: 'active' }
  ]
});
assert.strictEqual(unifiedReliefs.length, 4, 'mirrored discount/exemption sources must appear only once');
assert.strictEqual(unifiedReliefs.filter((item) => item.sourceDiscountId === 'discount-mirrored').length, 1);
assert.strictEqual(unifiedReliefs.filter((item) => item.sourceExemptionId === 'exemption-mirrored').length, 1);
const legacyDiscountRelief = unifiedReliefs.find((item) => item.sourceDiscountId === 'discount-legacy');
assert.strictEqual(legacyDiscountRelief.reliefType, 'waiver');
assert.strictEqual(legacyDiscountRelief.scope, 'tuition');
assert.strictEqual(legacyDiscountRelief.coverageMode, 'percent');
const legacyExemptionRelief = unifiedReliefs.find((item) => item.sourceExemptionId === 'exemption-legacy');
assert.strictEqual(legacyExemptionRelief.reliefType, 'scholarship_partial');
assert.strictEqual(legacyExemptionRelief.scope, 'admission');
assert.strictEqual(legacyExemptionRelief.coverageMode, 'fixed');
assert.strictEqual(legacyExemptionRelief.amount, 125);

const scope = buildStudentFinanceScope({
  schoolId: ids.school,
  membershipIds: [ids.membership],
  studentCoreIds: [ids.studentCore],
  userIds: [ids.user],
  linkedIdentity: [{ feeOrderId: { $in: [ids.tuitionOrder] } }],
  legacyOwnership: [{ feeOrderId: { $in: [ids.tuitionOrder] } }]
});
const serializedScope = JSON.stringify(scope);
assert.match(serializedScope, /schoolId/);
assert.match(serializedScope, /studentMembershipId/);
assert.match(serializedScope, /feeOrderId/);
assert.match(serializedScope, new RegExp(ids.school));

const paged = paginate([1, 2, 3, 4], { page: 2, limit: 2, all: false });
assert.deepStrictEqual(paged.items, [3, 4]);
assert.strictEqual(paged.meta.total, 4);
assert.strictEqual(paged.meta.hasPreviousPage, true);
const allRows = paginate([1, 2, 3], { all: true });
assert.deepStrictEqual(allRows.items, [1, 2, 3]);
assert.strictEqual(allRows.meta.mode, 'all');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const routeSource = read('routes/studentAccountByStudentRoutes.js');
const serviceSource = read('services/studentOpenAccountService.js');
const profileSource = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'AdminFinanceProfile.jsx'), 'utf8');
assert.match(routeSource, /router\.get\(/);
assert.match(routeSource, /getStudentOpenAccount/);
assert.match(routeSource, /requirePermission\('manage_finance'\)/);
assert.match(routeSource, /Cache-Control/);
assert.doesNotMatch(routeSource, /\.(?:create|save|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|bulkWrite)\s*\(/);
assert.doesNotMatch(serviceSource, /\.(?:create|save|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|bulkWrite)\s*\(/);
assert.match(profileSource, /legacyBills[\s\S]*canonicalOrderId/);
assert.match(profileSource, /legacyReceipts[\s\S]*mirroredToCanonical[\s\S]*canonicalPaymentId/);
assert.match(profileSource, /dueTime\(left\?\.dueDate\)[\s\S]*dueTime\(right\?\.dueDate\)/);
assert.match(profileSource, /RELIEF_TYPE_LABELS/);
assert.match(profileSource, /reliefValue\(relief\)/);
assert.match(profileSource, /فیس قابل پرداخت تا ماه جاری[\s\S]*summary\.payableFee/);
assert.match(profileSource, /تمام تعهدات باز \(شامل آینده و غیر فیس\)[\s\S]*summary\.totalOutstanding/);
assert.doesNotMatch(profileSource, /summary\.totalOutstanding \?\? summary\.payableFee/);

console.log('check:student-open-account PASS');
