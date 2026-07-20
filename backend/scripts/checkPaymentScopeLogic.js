const assert = require('assert');
const { normalizeFinanceLineItems } = require('../utils/financeLineItems');
const { inferAllocationFeeType } = require('../services/paymentScopeRepairService');

function findLine(lines = [], feeType = '') {
  return lines.find((item) => item.feeType === feeType) || {};
}

function run() {
  const mixedLines = [
    { feeType: 'tuition', label: 'Tuition', grossAmount: 3000 },
    { feeType: 'admission', label: 'Admission', grossAmount: 500 }
  ];

  const admissionPayment = normalizeFinanceLineItems({
    lineItems: mixedLines,
    amountOriginal: 3500,
    amountPaid: 500,
    paymentBreakdown: { admission: 500 },
    defaultType: 'tuition'
  });
  assert.strictEqual(findLine(admissionPayment, 'tuition').paidAmount, 0, 'Admission payment must not reduce tuition.');
  assert.strictEqual(findLine(admissionPayment, 'tuition').balanceAmount, 3000, 'Tuition balance must remain intact.');
  assert.strictEqual(findLine(admissionPayment, 'admission').paidAmount, 500, 'Admission payment must fully settle admission.');
  assert.strictEqual(findLine(admissionPayment, 'admission').balanceAmount, 0, 'Admission balance must be zero.');

  const tuitionPayment = normalizeFinanceLineItems({
    lineItems: mixedLines,
    amountOriginal: 3500,
    amountPaid: 600,
    paymentBreakdown: { tuition: 600 },
    defaultType: 'tuition'
  });
  assert.strictEqual(findLine(tuitionPayment, 'tuition').paidAmount, 600, 'Tuition payment must stay on tuition.');
  assert.strictEqual(findLine(tuitionPayment, 'admission').paidAmount, 0, 'Tuition payment must not settle admission.');

  const inferredAdmission = inferAllocationFeeType({
    allocation: { amount: 500 },
    payment: { note: 'دریافت قبلی داخله از ناهنجاری مالی ثبت شد.' },
    order: { orderType: 'tuition', lineItems: mixedLines }
  });
  assert.strictEqual(inferredAdmission.feeType, 'admission', 'Admission anomaly evidence must infer admission scope.');

  const legacyAdmissionOrder = inferAllocationFeeType({
    allocation: { amount: 500 },
    payment: { note: '' },
    order: { orderType: 'admission', amountOriginal: 500 }
  });
  assert.strictEqual(legacyAdmissionOrder.feeType, 'admission', 'Legacy admission-only orders must remain repairable without line items.');

  const ambiguous = inferAllocationFeeType({
    allocation: { amount: 500 },
    payment: { note: 'Payment' },
    order: { orderType: 'tuition', lineItems: mixedLines }
  });
  assert.strictEqual(ambiguous.feeType, '', 'Ambiguous mixed payments must remain blocked for manual review.');

  console.log('PASS payment scope logic keeps tuition and admission separate.');
}

run();
