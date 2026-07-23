const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  buildPaymentClassScope,
  buildPaymentOrderLinkFilter,
  getPaymentOrderIds,
  groupPaymentAmountsByClass,
  isPaymentFullyCoveredByClasses
} = require('../utils/paymentClassScope');
const {
  __paymentClassScopeTestUtils: reportScopeTestUtils
} = require('../services/reportEngineService');
const {
  __paymentClassScopeTestUtils: governmentScopeTestUtils
} = require('../services/governmentFinanceReportService');
const {
  __paymentClassScopeTestUtils: anomalyScopeTestUtils
} = require('../services/financeAnomalyService');

const IDS = {
  stalePrimaryOrder: '507f191e810c19729de86001',
  oldOrder: '507f191e810c19729de86002',
  currentOrder: '507f191e810c19729de86003',
  missingOrder: '507f191e810c19729de86004',
  oldClass: '507f191e810c19729de86101',
  currentClass: '507f191e810c19729de86102',
  oldYear: '507f191e810c19729de86201',
  currentYear: '507f191e810c19729de86202',
  school: '507f191e810c19729de86301'
};
IDS.oldMembership = '507f191e810c19729de86401';
IDS.currentMembership = '507f191e810c19729de86402';

const orderById = new Map([
  [IDS.oldOrder, {
    _id: IDS.oldOrder,
    classId: IDS.oldClass,
    academicYearId: IDS.oldYear,
    schoolId: IDS.school
  }],
  [IDS.currentOrder, {
    _id: IDS.currentOrder,
    classId: IDS.currentClass,
    academicYearId: IDS.currentYear,
    schoolId: IDS.school
  }]
]);

const mixedPayment = {
  // A denormalized primary pointer may describe the current membership. It is
  // deliberately not authoritative when canonical allocations are present.
  feeOrderId: IDS.stalePrimaryOrder,
  classId: IDS.currentClass,
  amount: 500,
  allocations: [
    { feeOrderId: IDS.oldOrder, feeType: 'tuition', amount: 300 },
    { feeOrderId: IDS.currentOrder, feeType: 'tuition', amount: 200 }
  ]
};

assert.deepStrictEqual(
  getPaymentOrderIds(mixedPayment),
  [IDS.oldOrder, IDS.currentOrder],
  'canonical allocations must override a stale top-level feeOrderId'
);

const scope = buildPaymentClassScope(mixedPayment, orderById);
assert.strictEqual(scope.isComplete, true, 'all allocated orders should resolve');
assert.strictEqual(scope.isMixedClass, true, 'two allocated order classes must be detected');
assert.deepStrictEqual(scope.classIds, [IDS.oldClass, IDS.currentClass]);

assert.strictEqual(
  isPaymentFullyCoveredByClasses(mixedPayment, orderById, [IDS.currentClass]),
  false,
  'a one-class bulk action must not fully approve a mixed-class payment'
);
assert.strictEqual(
  isPaymentFullyCoveredByClasses(mixedPayment, orderById, [IDS.oldClass, IDS.currentClass]),
  true,
  'an operation explicitly covering every allocated class may process the payment'
);

assert.deepStrictEqual(
  groupPaymentAmountsByClass(mixedPayment, orderById).map((item) => ({
    classId: item.classId,
    amount: item.amount,
    allocationCount: item.allocationCount
  })),
  [
    { classId: IDS.oldClass, amount: 300, allocationCount: 1 },
    { classId: IDS.currentClass, amount: 200, allocationCount: 1 }
  ],
  'reports must split a payment by allocated FeeOrder class instead of assigning the full amount to payment.classId'
);

const recognizedRows = [{
  payment: mixedPayment,
  recognizedAmount: 500,
  excludedVoidAmount: 0,
  recognizedAllocations: mixedPayment.allocations
}];
const [oldClassReportRow] = reportScopeTestUtils.scopeRecognizedPaymentRows(
  recognizedRows,
  { classId: IDS.oldClass, academicYearId: IDS.oldYear },
  orderById
);
assert.strictEqual(
  oldClassReportRow.recognizedAmount,
  300,
  'the standard finance report must recognize only the allocation belonging to the selected old class/year'
);
assert.deepStrictEqual(
  oldClassReportRow.recognizedAllocations.map((item) => item.feeOrderId),
  [IDS.oldOrder]
);

const [currentGovernmentRow] = governmentScopeTestUtils.scopeGovernmentPaymentRows(
  recognizedRows,
  orderById,
  {
    schoolId: IDS.school,
    classId: IDS.currentClass,
    academicYearId: IDS.currentYear
  }
);
assert.strictEqual(
  currentGovernmentRow.recognizedAmount,
  200,
  'the government finance report must recognize only the allocation in its selected class/year/school scope'
);
assert.deepStrictEqual(
  currentGovernmentRow.recognizedAllocations.map((item) => item.feeOrderId),
  [IDS.currentOrder]
);

const anomalyPaymentParts = anomalyScopeTestUtils.splitPaymentByAllocatedMembership({
  _id: '507f191e810c19729de86501',
  paymentNumber: 'PAY-MIXED-1',
  classId: IDS.currentClass,
  amount: 500,
  status: 'pending',
  allocations: [
    {
      feeOrderId: {
        ...orderById.get(IDS.oldOrder),
        studentMembershipId: IDS.oldMembership,
        status: 'overdue'
      },
      feeType: 'tuition',
      amount: 300
    },
    {
      feeOrderId: {
        ...orderById.get(IDS.currentOrder),
        studentMembershipId: IDS.currentMembership,
        status: 'new'
      },
      feeType: 'tuition',
      amount: 200
    }
  ]
});
assert.deepStrictEqual(
  anomalyPaymentParts.map((item) => ({ membershipId: item.membershipId, amount: item.payment.amount })),
  [
    { membershipId: IDS.oldMembership, amount: 300 },
    { membershipId: IDS.currentMembership, amount: 200 }
  ],
  'stalled-payment anomalies must be allocated to each FeeOrder membership with only that membership amount'
);

const incompleteScope = buildPaymentClassScope({
  amount: 100,
  allocations: [{ feeOrderId: IDS.missingOrder, amount: 100 }]
}, orderById);
assert.strictEqual(incompleteScope.isComplete, false, 'a missing allocated order must block class-bulk approval');
assert.deepStrictEqual(incompleteScope.missingOrderIds, [IDS.missingOrder]);

assert.deepStrictEqual(buildPaymentOrderLinkFilter([IDS.oldOrder]), {
  $or: [
    { 'allocations.feeOrderId': { $in: [IDS.oldOrder] } },
    { feeOrderId: { $in: [IDS.oldOrder] } }
  ]
}, 'class filters must query linked FeeOrders, including the legacy single-order pointer');

assert.deepStrictEqual(
  buildPaymentOrderLinkFilter([]),
  { _id: { $in: [] } },
  'an empty class order scope must match no payments'
);

const readBackendSource = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const financeRoutesSource = readBackendSource('routes/financeRoutes.js');
const studentFinanceSource = readBackendSource('services/studentFinanceService.js');
const reportEngineSource = readBackendSource('services/reportEngineService.js');
const governmentReportSource = readBackendSource('services/governmentFinanceReportService.js');

assert.match(
  financeRoutesSource,
  /!isPaymentFullyCoveredByClasses\(payment, orderMap, \[scope\.classId\]\)/,
  'single-class bulk final approval must enforce complete allocated-class coverage'
);
assert.match(
  studentFinanceSource,
  /Object\.assign\(query, buildPaymentOrderLinkFilter\(scopedOrderIds\)\)/,
  'payment list class filters must resolve through allocated FeeOrders'
);
assert.match(
  reportEngineSource,
  /groupPaymentAmountsByClass\(/,
  'canonical class reports must split amounts by allocated FeeOrder class'
);
assert.match(
  governmentReportSource,
  /groupPaymentAmountsByClass\(/,
  'government finance reports must split amounts by allocated FeeOrder class'
);

console.log('Payment class scope checks passed.');
