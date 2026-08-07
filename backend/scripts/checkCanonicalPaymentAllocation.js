const assert = require('assert');
const {
  __paymentAllocationTestUtils: {
    buildCanonicalPaymentOrderSnapshot,
    buildDailyCashierAnalytics,
    buildOrderQuery,
    buildPaymentQuery,
    buildStudentSchoolOpenOrderQuery,
    resolvePaymentAllocations,
    sortOpenOrdersForAllocation
  }
} = require('../services/studentFinanceService');
const {
  __financeSchoolScopeTestUtils: {
    assertCanonicalPaymentReviewScope,
    assertDocumentInActiveSchool,
    resolveActiveFinanceSchoolId
  }
} = require('../services/financeAdminActionService');
const FeeOrder = require('../models/FeeOrder');
const FinanceReceipt = require('../models/FinanceReceipt');
const FinanceBill = require('../models/FinanceBill');

const IDS = {
  school: '507f191e810c19729de86101',
  otherSchool: '507f191e810c19729de86102',
  student: '507f191e810c19729de86201',
  studentCore: '507f191e810c19729de86202',
  oldMembership: '507f191e810c19729de86301',
  currentMembership: '507f191e810c19729de86302',
  oldOrder: '507f191e810c19729de86401',
  currentOrder: '507f191e810c19729de86402',
  foreignOrder: '507f191e810c19729de86403'
};

function buildOrder(overrides = {}) {
  return {
    _id: IDS.currentOrder,
    schoolId: IDS.school,
    student: IDS.student,
    studentId: IDS.studentCore,
    studentMembershipId: IDS.currentMembership,
    orderNumber: 'BL-TEST-1',
    title: 'Monthly tuition',
    orderType: 'tuition',
    status: 'new',
    amountOriginal: 400,
    amountDue: 400,
    amountPaid: 0,
    outstandingAmount: 400,
    paymentBreakdown: {},
    lineItems: [{
      feeType: 'tuition',
      label: 'Tuition',
      grossAmount: 400,
      netAmount: 400,
      paidAmount: 0,
      // Deliberately stale; canonical normalization must ignore this value.
      balanceAmount: 0,
      status: 'paid'
    }],
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    dueDate: null,
    ...overrides
  };
}

async function run() {
  const dailyCashierAnalytics = buildDailyCashierAnalytics(Array.from({ length: 125 }, (_, index) => ({
    payment: {
      _id: `payment-${index + 1}`,
      status: index < 110 ? 'approved' : 'pending',
      paymentMethod: 'cash',
      receivedBy: { _id: 'cashier-1', name: 'Cashier One' }
    },
    recognizedAmount: 10,
    excludedVoidAmount: 0,
    excludedMissingOrderAmount: 0
  })));
  assert.strictEqual(dailyCashierAnalytics.summary.totalPayments, 125,
    'Daily cashier totals must include payments beyond the 100 visible rows.');
  assert.strictEqual(dailyCashierAnalytics.summary.approvedAmount, 1100);
  assert.strictEqual(dailyCashierAnalytics.summary.pendingAmount, 150);
  assert.deepStrictEqual(dailyCashierAnalytics.methodTotals, [{ method: 'cash', amount: 1100, count: 110 }]);

  const openOrderQuery = buildOrderQuery({
    schoolId: IDS.school,
    view: 'open',
    status: 'void'
  });
  assert.deepStrictEqual(openOrderQuery.status, { $in: ['new', 'partial', 'overdue'] },
    'The open-order view must exclude paid, waived, and void orders at database-query time.');

  const inboxPaymentQuery = await buildPaymentQuery({
    schoolId: IDS.school,
    view: 'inbox',
    status: 'approved'
  });
  assert.strictEqual(inboxPaymentQuery.status, 'pending',
    'The payment inbox must enforce pending review records even when a conflicting status is supplied.');

  const requestScope = resolveActiveFinanceSchoolId({
    headers: { 'x-school-id': IDS.school },
    query: { schoolId: IDS.otherSchool },
    body: { schoolId: IDS.otherSchool },
    user: { schoolId: IDS.otherSchool, activeSchoolId: IDS.otherSchool }
  });
  assert.strictEqual(requestScope, IDS.school,
    'The active-school header must override query/body schoolId for finance review.');
  const demoScope = resolveActiveFinanceSchoolId({
    headers: { 'x-school-id': IDS.otherSchool },
    user: { isDemo: true, schoolId: IDS.school }
  });
  assert.strictEqual(demoScope, IDS.school,
    'A demo user must remain locked to the authenticated demo school.');
  assert.doesNotThrow(() => assertDocumentInActiveSchool({ schoolId: IDS.school }, IDS.school, 'Payment'));
  // The thrown message is user-facing and localized (Dari), like the rest of
  // financeAdminActionService's errors, so assert on the stable parts of the
  // contract (a 404 "not found" rejection naming the document) rather than
  // pinning an English string.
  assert.throws(
    () => assertDocumentInActiveSchool({ schoolId: IDS.otherSchool }, IDS.school, 'Payment'),
    (error) => error?.status === 404 && String(error.message || '').includes('Payment'),
    'A cross-school payment or linked order must be rejected before review.'
  );

  const stalePaidOrder = buildCanonicalPaymentOrderSnapshot(buildOrder({
    _id: IDS.oldOrder,
    studentMembershipId: IDS.oldMembership,
    status: 'paid',
    amountOriginal: 500,
    amountDue: 500,
    amountPaid: 100,
    outstandingAmount: 0,
    paymentBreakdown: { tuition: 100 },
    lineItems: [{
      feeType: 'tuition',
      label: 'Old tuition',
      grossAmount: 500,
      netAmount: 500,
      paidAmount: 500,
      balanceAmount: 0,
      status: 'paid'
    }],
    dueDate: new Date('2026-01-15T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z')
  }));
  const undatedCurrentOrder = buildCanonicalPaymentOrderSnapshot(buildOrder());

  assert.strictEqual(stalePaidOrder.outstandingAmount, 400,
    'A stale paid status/balance must not hide the real outstanding amount.');
  assert.strictEqual(stalePaidOrder.status, 'overdue',
    'Status must be derived from the real balance and due date.');
  assert.strictEqual(undatedCurrentOrder.outstandingAmount, 400,
    'Stored line balance must be rebuilt from gross, reductions, and paid totals.');

  const ordered = sortOpenOrdersForAllocation([undatedCurrentOrder, stalePaidOrder]);
  assert.deepStrictEqual(ordered.map((item) => String(item._id)), [IDS.oldOrder, IDS.currentOrder],
    'Known oldest due date must come before an order with no due date.');

  const allocation = resolvePaymentAllocations({
    openOrders: ordered,
    payload: { amount: 650, feeType: 'tuition', allocationMode: 'auto_oldest_due' }
  });
  assert.deepStrictEqual(allocation.allocations.map((item) => ({
    feeOrderId: item.feeOrderId,
    amount: item.amount
  })), [
    { feeOrderId: IDS.oldOrder, amount: 400 },
    { feeOrderId: IDS.currentOrder, amount: 250 }
  ], 'One payment must settle the oldest debt across prior and current memberships first.');

  const scopedQuery = buildStudentSchoolOpenOrderQuery({
    schoolId: IDS.school,
    membership: { student: IDS.student, studentId: IDS.studentCore }
  });
  assert.strictEqual(scopedQuery.schoolId, IDS.school, 'The order query must require the active school.');
  assert.deepStrictEqual(scopedQuery.status, { $ne: 'void' }, 'Void orders must be excluded explicitly.');
  assert(scopedQuery.$or.some((item) => item.student === IDS.student),
    'The scope must follow the stable student user across memberships.');
  assert(scopedQuery.$or.some((item) => item.studentId === IDS.studentCore),
    'The scope must also follow the canonical student id across memberships.');
  assert(!Object.prototype.hasOwnProperty.call(scopedQuery, 'studentMembershipId'),
    'The payment query must not be limited to only the selected membership.');

  assert.throws(() => resolvePaymentAllocations({
    openOrders: ordered,
    payload: {
      amount: 100,
      feeType: 'tuition',
      allocationMode: 'auto_selected',
      selectedFeeOrderIds: [IDS.oldOrder, IDS.foreignOrder]
    }
  }), /student_finance_payment_order_not_found/,
  'A selected order outside the student/school-scoped result must be rejected as not found.');

  assert.throws(() => buildStudentSchoolOpenOrderQuery({
    schoolId: '',
    membership: { student: IDS.student }
  }), /student_finance_school_scope_required/,
  'Payment allocation must be blocked when no active school is supplied.');

  const settled = buildCanonicalPaymentOrderSnapshot(buildOrder({
    status: 'new',
    amountPaid: 400,
    paymentBreakdown: { tuition: 400 }
  }));
  assert.strictEqual(settled.outstandingAmount, 0,
    'A stale open status must not keep a fully settled order in the payment queue.');

  const originalFeeOrderFind = FeeOrder.find;
  const originalReceiptFindById = FinanceReceipt.findById;
  const originalBillFindById = FinanceBill.findById;
  const payment = {
    _id: '507f191e810c19729de86501',
    schoolId: IDS.school,
    student: IDS.student,
    studentId: IDS.studentCore,
    studentMembershipId: IDS.currentMembership,
    amount: 100,
    allocations: [{ feeOrderId: IDS.currentOrder, feeType: 'tuition', amount: 100 }]
  };
  const request = {
    headers: { 'x-school-id': IDS.school },
    user: { id: '507f191e810c19729de86502', role: 'admin', schoolId: IDS.otherSchool }
  };

  try {
    FeeOrder.find = async () => [buildOrder({
      _id: IDS.currentOrder,
      schoolId: IDS.otherSchool,
      amountOriginal: 100,
      amountDue: 100
    })];
    await assert.rejects(
      () => assertCanonicalPaymentReviewScope({ req: request, payment }),
      (error) => error?.status === 404,
      'Every linked fee order must be rejected when it belongs to another school.'
    );

    FeeOrder.find = async () => [buildOrder({
      _id: IDS.currentOrder,
      schoolId: IDS.school,
      amountOriginal: 100,
      amountDue: 100
    })];
    await assert.doesNotReject(
      () => assertCanonicalPaymentReviewScope({ req: request, payment }),
      'A payment and all linked orders in the active school should pass review scope validation.'
    );

    FinanceReceipt.findById = async () => ({
      _id: '507f191e810c19729de86503',
      schoolId: IDS.otherSchool,
      bill: '507f191e810c19729de86504',
      student: IDS.student,
      studentId: IDS.studentCore,
      studentMembershipId: IDS.currentMembership
    });
    FinanceBill.findById = async () => ({
      _id: '507f191e810c19729de86504',
      schoolId: IDS.school,
      student: IDS.student,
      studentId: IDS.studentCore,
      studentMembershipId: IDS.currentMembership
    });
    await assert.rejects(
      () => assertCanonicalPaymentReviewScope({
        req: request,
        payment: { ...payment, sourceReceiptId: '507f191e810c19729de86503' }
      }),
      (error) => error?.status === 404,
      'A canonical payment linked to a receipt in another school must be rejected before any review mutation.'
    );
  } finally {
    FeeOrder.find = originalFeeOrderFind;
    FinanceReceipt.findById = originalReceiptFindById;
    FinanceBill.findById = originalBillFindById;
  }

  console.log('PASS canonical payment allocation is student-wide, school-scoped, balance-derived, and oldest-first.');
}

run().catch((error) => {
  console.error('FAIL canonical payment allocation school-scope checks.');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
