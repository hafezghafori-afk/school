const assert = require('node:assert/strict');
const Module = require('node:module');
const {
  __financeMirrorTestUtils,
  syncFeeOrderFromFinanceBill
} = require('../utils/studentFinanceSync');
const { __financeVoidTestUtils } = require('../services/financeAdminActionService');
const {
  consumeAutomaticFinanceBillSyncSuppression,
  isFinanceVersionConflict,
  suppressAutomaticFinanceBillSync
} = require('../utils/financeSyncControl');

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

const syncControlledDocument = { $locals: {} };
suppressAutomaticFinanceBillSync(syncControlledDocument);
assert.equal(
  consumeAutomaticFinanceBillSyncSuppression(syncControlledDocument),
  true,
  'an explicit synchronous mirror update must suppress the automatic post-save update once'
);
assert.equal(
  consumeAutomaticFinanceBillSyncSuppression(syncControlledDocument),
  false,
  'automatic mirror suppression must be consumed so later saves can synchronize normally'
);
assert.equal(isFinanceVersionConflict({ name: 'VersionError' }), true);
assert.equal(isFinanceVersionConflict({ code: 112 }), true);
assert.equal(isFinanceVersionConflict({ code: 11000 }), false);
assert.equal(__financeVoidTestUtils.isVoidedFinanceDocument({ status: 'void' }), true);
assert.equal(__financeVoidTestUtils.isVoidedFinanceDocument({ status: 'paid' }), false);

async function assertFeeOrderVersionConflictRetry() {
  let findCount = 0;
  let saveCount = 0;
  const makeFeeOrder = ({ failWithVersionConflict = false } = {}) => ({
    _id: '507f1f77bcf86cd799439014',
    toObject() {
      return { ...this, save: undefined, toObject: undefined };
    },
    async save() {
      saveCount += 1;
      if (failWithVersionConflict) {
        const error = new Error('concurrent mirror update');
        error.name = 'VersionError';
        throw error;
      }
      return this;
    }
  });
  const staleOrder = makeFeeOrder({ failWithVersionConflict: true });
  const refreshedOrder = makeFeeOrder();
  const FeeOrderMock = {
    async findOne() {
      findCount += 1;
      return findCount === 1 ? staleOrder : refreshedOrder;
    },
    async create() {
      throw new Error('create must not run when a canonical fee order exists');
    }
  };
  const emptyModel = {};
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    if (parentFile.endsWith('/utils/studentFinanceSync.js')) {
      if (request === '../models/FeeOrder') return FeeOrderMock;
      if (request.startsWith('../models/')) return emptyModel;
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    const result = await syncFeeOrderFromFinanceBill({
      _id: '507f1f77bcf86cd799439013',
      billNumber: 'BL-1405-0002',
      student: '507f1f77bcf86cd799439021',
      course: '507f1f77bcf86cd799439022',
      amountOriginal: 500,
      amountDue: 500,
      amountPaid: 0,
      dueDate: new Date('2026-07-30T00:00:00.000Z'),
      lineItems: payload.lineItems,
      status: 'void',
      voidReason: 'Class changed'
    });
    assert.equal(result.updated, true, 'the refreshed canonical order must be saved after a version conflict');
    assert.equal(findCount, 2, 'the canonical order must be refetched once after a version conflict');
    assert.equal(saveCount, 2, 'the mirror update must retry only once');
  } finally {
    Module._load = originalLoad;
  }
}

assertFeeOrderVersionConflictRetry()
  .then(() => {
    console.log('PASS FinanceBill synchronization is single-run, conflict-aware, and safe for repeated void requests.');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
