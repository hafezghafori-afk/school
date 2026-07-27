const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { formatAfghanMonthYearLabel } = require('../utils/afghanDate');
const { buildMembershipFinanceAnomalies } = require('../services/financeAnomalyService');
const { mergeFinanceAnomalyCases } = require('../utils/financeAnomalyWorkflow');

const membership = {
  id: '507f191e810c19729de87001',
  isCurrent: true,
  status: 'active',
  student: { userId: '507f191e810c19729de87002', name: 'Period Test Student' },
  schoolClass: { id: '507f191e810c19729de87003', title: 'Period Test Class' },
  academicYear: { id: '507f191e810c19729de87004', title: '1405' }
};

const feePlans = [{
  id: '507f191e810c19729de87005',
  classId: membership.schoolClass.id,
  academicYearId: membership.academicYear.id,
  tuitionFee: 100,
  admissionFee: 0,
  examFee: 0,
  isActive: true,
  lifecycleStatus: 'active'
}];

function makeOrder({
  id,
  periodType = 'monthly',
  periodLabel = '',
  dueDate = null,
  lineItems = [{ feeType: 'tuition', periodKey: '', grossAmount: 100 }]
}) {
  return {
    id,
    documentKind: 'order',
    orderNumber: id,
    status: 'new',
    periodType,
    periodLabel,
    dueDate,
    amountDue: lineItems.reduce((sum, item) => sum + Number(item.grossAmount || 0), 0),
    amountPaid: 0,
    outstandingAmount: lineItems.reduce((sum, item) => sum + Number(item.grossAmount || 0), 0),
    lineItems
  };
}

function duplicateItems(orders) {
  return buildMembershipFinanceAnomalies({ membership, orders, feePlans, limit: 50 })
    .items
    .filter((item) => item.anomalyType === 'duplicate_fee_bill');
}

const marchDate = '2026-03-22T00:00:00.000Z';
const marchLabel = formatAfghanMonthYearLabel(marchDate);
const mixedLegacyDocuments = duplicateItems([
  makeOrder({ id: 'monthly-labeled', periodLabel: marchLabel, dueDate: marchDate }),
  makeOrder({ id: 'monthly-date-only', dueDate: '2026-03-25T00:00:00.000Z' })
]);
assert.strictEqual(mixedLegacyDocuments.length, 1, 'a label and a due date for the same Afghan month must share one period');

const differentMonths = duplicateItems([
  makeOrder({ id: 'monthly-march', dueDate: marchDate }),
  makeOrder({ id: 'monthly-april', dueDate: '2026-04-22T00:00:00.000Z' })
]);
assert.strictEqual(differentMonths.length, 0, 'different monthly due-date periods must not be marked as duplicates');

const differentTuitionPeriods = duplicateItems([
  makeOrder({
    id: 'multi-a',
    periodType: 'term',
    lineItems: [
      { feeType: 'exam', periodKey: 'shared-exam', grossAmount: 10 },
      { feeType: 'tuition', periodKey: 'tuition-1', grossAmount: 100 }
    ]
  }),
  makeOrder({
    id: 'multi-b',
    periodType: 'term',
    lineItems: [
      { feeType: 'exam', periodKey: 'shared-exam', grossAmount: 10 },
      { feeType: 'tuition', periodKey: 'tuition-2', grossAmount: 100 }
    ]
  })
]);
assert.strictEqual(differentTuitionPeriods.length, 0, 'another fee type must not determine the tuition period');

const sharedTuitionPeriod = duplicateItems([
  makeOrder({
    id: 'multi-c',
    periodType: 'term',
    lineItems: [
      { feeType: 'exam', periodKey: 'exam-1', grossAmount: 10 },
      { feeType: 'tuition', periodKey: 'shared-tuition', grossAmount: 100 }
    ]
  }),
  makeOrder({
    id: 'multi-d',
    periodType: 'term',
    lineItems: [
      { feeType: 'exam', periodKey: 'exam-2', grossAmount: 10 },
      { feeType: 'tuition', periodKey: 'shared-tuition', grossAmount: 100 }
    ]
  })
]);
assert.strictEqual(sharedTuitionPeriod.length, 1, 'matching tuition line periods must be detected independently of other lines');
assert.strictEqual(sharedTuitionPeriod[0].amount, 200, 'duplicate amount must include only the matching fee-period slices');

const normalizedDigits = duplicateItems([
  makeOrder({
    id: 'digit-a',
    periodType: 'term',
    lineItems: [{ feeType: 'tuition', periodKey: 'term-\u06F1', grossAmount: 100 }]
  }),
  makeOrder({
    id: 'digit-b',
    periodType: 'term',
    lineItems: [{ feeType: 'tuition', periodKey: 'term-1', grossAmount: 100 }]
  })
]);
assert.strictEqual(normalizedDigits.length, 1, 'Persian and ASCII digits must normalize to one period identity');

const [stableIdentity] = sharedTuitionPeriod;
const [reorderedIdentity] = duplicateItems([
  makeOrder({
    id: 'multi-d',
    periodType: 'term',
    lineItems: [
      { feeType: 'exam', periodKey: 'exam-2', grossAmount: 10 },
      { feeType: 'tuition', periodKey: 'shared-tuition', grossAmount: 100 }
    ]
  }),
  makeOrder({
    id: 'multi-c',
    periodType: 'term',
    lineItems: [
      { feeType: 'exam', periodKey: 'exam-1', grossAmount: 10 },
      { feeType: 'tuition', periodKey: 'shared-tuition', grossAmount: 100 }
    ]
  })
]);
assert.strictEqual(stableIdentity.id, reorderedIdentity.id, 'duplicate anomaly identity must not depend on document ordering');
assert.match(stableIdentity.id, /^[A-Za-z0-9_-]+$/, 'duplicate anomaly identity must be URL-safe');
assert.strictEqual(decodeURIComponent(stableIdentity.id), stableIdentity.id, 'route decoding must not change the anomaly identity');

const [legacyCompatibleIdentity] = duplicateItems([
  makeOrder({ id: 'legacy-a', periodLabel: marchLabel, dueDate: marchDate }),
  makeOrder({ id: 'legacy-b', periodLabel: marchLabel, dueDate: '2026-03-25T00:00:00.000Z' })
]);
const legacyPeriodKey = `monthly:${marchLabel.trim().replace(/\s+/g, ' ').toLowerCase()}`;
const expectedLegacyId = `fee-duplicate-tuition-${membership.id}-${encodeURIComponent(legacyPeriodKey)}`;
assert.ok(
  legacyCompatibleIdentity.legacyAnomalyIds.includes(expectedLegacyId),
  'legacy identities must preserve the original Persian period representation'
);

const legacyCase = {
  _id: '507f191e810c19729de87006',
  anomalyId: expectedLegacyId,
  status: 'assigned',
  assignedLevel: 'finance_manager',
  history: []
};
const [mergedLegacyCase] = mergeFinanceAnomalyCases([legacyCompatibleIdentity], [legacyCase]);
assert.strictEqual(mergedLegacyCase.workflowStatus, 'assigned', 'legacy anomaly cases must remain attached to the stable identity');

const adminFinanceSource = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'AdminFinance.jsx'), 'utf8');
const encodedActionUrls = adminFinanceSource.match(/anomalies\/\$\{encodeURIComponent\(selectedAnomaly\.id\)\}\//g) || [];
assert.strictEqual(encodedActionUrls.length, 5, 'every anomaly action URL must encode its route parameter at the HTTP boundary');

console.log('Finance anomaly period grouping checks passed.');
