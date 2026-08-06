const FinanceRefund = require('../models/FinanceRefund');
const { nextFinanceDocumentNumber } = require('./financeNumberSequence');
const { roundMoney } = require('./financeLineItems');

const normalizeId = (value = null) => String(value?._id || value || '').trim() || null;

// A single bill/order should never end up with two open (non-rejected)
// refund cases at once - this is the idempotency guard every call site
// (lifecycle auto-void, backfill script, anomaly review, manual admin
// action) relies on before creating a new one.
async function findOpenRefundForDocument({ bill = null, feeOrder = null } = {}) {
  const billId = normalizeId(bill);
  const feeOrderId = normalizeId(feeOrder);
  if (!billId && !feeOrderId) return null;

  const or = [];
  if (billId) or.push({ bill: billId });
  if (feeOrderId) or.push({ feeOrder: feeOrderId });

  return FinanceRefund.findOne({
    $or: or,
    status: { $ne: 'rejected' }
  }).sort({ createdAt: -1 });
}

async function createFinanceRefundCase({
  student,
  studentId = null,
  studentMembershipId = null,
  bill = null,
  feeOrder = null,
  sourceReceipt = null,
  schoolId = null,
  classId = null,
  academicYearId = null,
  currency = 'AFN',
  amount = 0,
  reason = 'membership_ended',
  reasonNote = '',
  detectionSource = 'manual',
  createdBy = null,
  session = null
} = {}) {
  const roundedAmount = roundMoney(amount);
  if (!student || roundedAmount <= 0) return null;

  const existing = await findOpenRefundForDocument({ bill, feeOrder });
  if (existing) return existing;

  const refundNumber = await nextFinanceDocumentNumber({
    model: FinanceRefund,
    field: 'refundNumber',
    prefix: 'RF'
  });

  const createOptions = session ? { session } : {};
  const [item] = await FinanceRefund.create([{
    refundNumber,
    student,
    studentId,
    studentMembershipId,
    bill: normalizeId(bill),
    feeOrder: normalizeId(feeOrder),
    sourceReceipt: normalizeId(sourceReceipt),
    schoolId,
    classId,
    academicYearId,
    currency,
    amount: roundedAmount,
    reason,
    reasonNote,
    detectionSource,
    createdBy
  }], createOptions);

  return item;
}

module.exports = {
  createFinanceRefundCase,
  findOpenRefundForDocument
};
