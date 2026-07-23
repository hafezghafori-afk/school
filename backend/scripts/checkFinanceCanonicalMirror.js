const assert = require('node:assert/strict');
const { __financeMirrorTestUtils } = require('../utils/studentFinanceSync');
const { __financeVoidTestUtils } = require('../services/financeAdminActionService');

const payload = {
  orderType: 'tuition',
  amountOriginal: 500,
  amountDue: 500,
  amountPaid: 0,
  outstandingAmount: 500,
  status: 'new',
  paymentBreakdown: { tuition: 0 },
  lineItems: [{
    feeType: 'tuition',
    label: 'Monthly tuition',
    grossAmount: 500,
    reductionAmount: 0,
    penaltyAmount: 0,
    netAmount: 500,
    paidAmount: 0,
    balanceAmount: 500,
    status: 'open'
  }]
};

const preserved = __financeMirrorTestUtils.preserveCanonicalFeeOrderPaymentState(payload, {
  _id: '507f1f77bcf86cd799439011',
  status: 'partial',
  amountPaid: 200,
  paymentBreakdown: { tuition: 200 },
  paidAt: new Date('2026-07-01T00:00:00.000Z')
});

assert.equal(preserved.amountPaid, 200);
assert.equal(preserved.paymentBreakdown.tuition, 200);
assert.equal(preserved.lineItems[0].paidAmount, 200);
assert.equal(preserved.lineItems[0].balanceAmount, 300);
assert.equal(preserved.outstandingAmount, 300);

const voided = __financeMirrorTestUtils.preserveCanonicalFeeOrderPaymentState(payload, {
  _id: '507f1f77bcf86cd799439012',
  status: 'void',
  voidReason: 'Manager void',
  amountPaid: 0,
  paymentBreakdown: {}
});
assert.equal(voided.status, 'void');
assert.equal(voided.voidReason, 'Manager void');

const issuanceKey = 'grouped-billing:school:class:student:1405-04:tuition';
const sourceBill = {
  _id: '507f1f77bcf86cd799439013',
  billNumber: 'BL-1405-0001',
  issuanceKey,
  amountOriginal: 500,
  amountPaid: 0,
  paymentBreakdown: { tuition: 0 },
  lineItems: payload.lineItems,
  status: 'new'
};
const activeMirror = __financeMirrorTestUtils.buildFeeOrderPayloadFromBill(sourceBill);
assert.equal(activeMirror.issuanceKey, issuanceKey, 'canonical order must mirror the active bill issuance key');

const releasedKey = __financeVoidTestUtils.releaseIssuanceKeyForVoid(sourceBill);
assert.equal(releasedKey, issuanceKey, 'void audit must receive the original issuance key');
assert.equal(sourceBill.issuanceKey, undefined, 'voiding must release the bill issuance key');

sourceBill.status = 'void';
const voidMirror = __financeMirrorTestUtils.buildFeeOrderPayloadFromBill(sourceBill);
assert.equal(voidMirror.issuanceKey, undefined, 'void mirror payload must release the canonical issuance key');
assert.equal(
  __financeMirrorTestUtils.feeOrderChanged({ ...voidMirror, issuanceKey }, voidMirror),
  true,
  'issuance-key release alone must be persisted to an existing canonical order'
);

console.log('PASS FinanceBill synchronization preserves payment state and releases voided issuance keys for reissue.');
