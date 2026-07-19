const assert = require('assert');
const { buildFinanceReliefPayloadFromDiscount } = require('../utils/financeRelief');
const { promoteDiscountReliefToFullCoverage } = require('../utils/financeReliefSync');
const { refreshFinanceBillStatus } = require('../utils/studentFinanceSync');
const { applyFinanceOrderStatus, normalizeFinanceLineItems } = require('../utils/financeLineItems');
const FinanceBill = require('../models/FinanceBill');
const FeeOrder = require('../models/FeeOrder');

function run() {
  const percentRelief = buildFinanceReliefPayloadFromDiscount({
    _id: 'discount-percent-full',
    discountType: 'discount',
    coverageMode: 'percent',
    percentage: 100,
    status: 'active'
  });
  assert.strictEqual(percentRelief.coverageMode, 'full');
  assert.strictEqual(percentRelief.reliefType, 'waiver');
  assert.strictEqual(percentRelief.percentage, 100);
  assert.strictEqual(percentRelief.scope, 'tuition');

  const mixedFeeLines = normalizeFinanceLineItems({
    amountOriginal: 15000,
    feeBreakdown: { tuition: 10000, admission: 5000 },
    feeScopes: ['tuition', 'admission'],
    adjustments: [{ type: 'discount', amount: 500 }]
  });
  const tuitionLine = mixedFeeLines.find((item) => item.feeType === 'tuition');
  const admissionLine = mixedFeeLines.find((item) => item.feeType === 'admission');
  assert.strictEqual(tuitionLine.grossAmount, 10000);
  assert.strictEqual(tuitionLine.reductionAmount, 500);
  assert.strictEqual(tuitionLine.netAmount, 9500);
  assert.strictEqual(admissionLine.grossAmount, 5000);
  assert.strictEqual(admissionLine.reductionAmount, 0);
  assert.strictEqual(admissionLine.netAmount, 5000);

  const admissionOnlyLines = normalizeFinanceLineItems({
    amountOriginal: 5000,
    feeBreakdown: { admission: 5000 },
    feeScopes: ['admission'],
    adjustments: [{ type: 'discount', amount: 500 }]
  });
  assert.strictEqual(admissionOnlyLines.length, 1);
  assert.strictEqual(admissionOnlyLines[0].feeType, 'admission');
  assert.strictEqual(admissionOnlyLines[0].reductionAmount, 0);
  assert.strictEqual(admissionOnlyLines[0].netAmount, 5000);

  const admissionWaiverLines = normalizeFinanceLineItems({
    amountOriginal: 5000,
    feeBreakdown: { admission: 5000 },
    feeScopes: ['admission'],
    adjustments: [{ type: 'waiver', scope: 'admission', amount: 500 }]
  });
  assert.strictEqual(admissionWaiverLines[0].reductionAmount, 500);
  assert.strictEqual(admissionWaiverLines[0].netAmount, 4500);

  const fixedRelief = promoteDiscountReliefToFullCoverage({
    status: 'active',
    coverageMode: 'fixed',
    reliefType: 'discount',
    amount: 1000,
    percentage: 0
  }, { amountOriginal: 1000 });
  assert.deepStrictEqual(fixedRelief, {
    status: 'active',
    coverageMode: 'full',
    reliefType: 'waiver',
    amount: 0,
    percentage: 100
  });

  const bill = {
    status: 'new',
    amountOriginal: 1000,
    amountPaid: 0,
    dueDate: new Date('2099-01-01T00:00:00.000Z'),
    adjustments: [{ type: 'waiver', amount: 1000 }]
  };
  refreshFinanceBillStatus(bill);
  assert.strictEqual(bill.amountDue, 0);
  assert.strictEqual(bill.status, 'waived');
  assert.strictEqual(bill.paidAt, null);

  const zeroValueBill = {
    status: 'new',
    amountOriginal: 0,
    amountDue: 0,
    amountPaid: 0,
    dueDate: new Date('2099-01-01T00:00:00.000Z')
  };
  applyFinanceOrderStatus(zeroValueBill);
  assert.strictEqual(zeroValueBill.status, 'new');
  assert.strictEqual(zeroValueBill.paidAt, null);

  const paidBill = {
    status: 'new',
    amountOriginal: 1000,
    amountDue: 1000,
    amountPaid: 1000,
    dueDate: new Date('2099-01-01T00:00:00.000Z')
  };
  applyFinanceOrderStatus(paidBill);
  assert.strictEqual(paidBill.status, 'paid');
  assert.ok(paidBill.paidAt instanceof Date);

  const ordinaryBill = new FinanceBill();
  const standaloneOrder = new FeeOrder();
  assert.strictEqual(ordinaryBill.issuanceKey, undefined);
  assert.strictEqual(standaloneOrder.sourceBillId, undefined);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(ordinaryBill.toObject(), 'issuanceKey'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(standaloneOrder.toObject(), 'sourceBillId'), false);

  bill.adjustments = [];
  refreshFinanceBillStatus(bill);
  assert.strictEqual(bill.amountDue, 1000);
  assert.strictEqual(bill.status, 'new');
  assert.strictEqual(bill.paidAt, null);

  console.log('check:finance-relief-logic PASS');
}

try {
  run();
} catch (error) {
  console.error('check:finance-relief-logic FAIL');
  console.error(error);
  process.exitCode = 1;
}
