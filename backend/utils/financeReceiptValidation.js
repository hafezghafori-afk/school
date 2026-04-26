const FinanceReceipt = require('../models/FinanceReceipt');

const roundMoney = (value = 0) => Math.round((Math.max(0, Number(value) || 0) + Number.EPSILON) * 100) / 100;

const getBillRemainingAmount = (bill = {}) => roundMoney((Number(bill?.amountDue) || 0) - (Number(bill?.amountPaid) || 0));

const getReservedPendingReceiptAmount = async (billId = '', { excludeReceiptId = '' } = {}) => {
  if (!billId) return 0;

  const match = {
    bill: billId,
    status: 'pending'
  };

  if (excludeReceiptId) {
    match._id = { $ne: excludeReceiptId };
  }

  const rows = await FinanceReceipt.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' }
      }
    }
  ]);

  return roundMoney(rows[0]?.total || 0);
};

const getReceiptSubmissionAvailability = async (bill = {}, { excludeReceiptId = '' } = {}) => {
  const approvedRemaining = getBillRemainingAmount(bill);
  const reservedPending = bill?._id
    ? await getReservedPendingReceiptAmount(bill._id, { excludeReceiptId })
    : 0;

  return {
    approvedRemaining,
    reservedPending,
    availableToSubmit: roundMoney(approvedRemaining - reservedPending)
  };
};

const findPendingReceiptForBill = async (billId = '', { excludeReceiptId = '' } = {}) => {
  if (!billId) return null;

  const filter = {
    bill: billId,
    status: 'pending'
  };

  if (excludeReceiptId) {
    filter._id = { $ne: excludeReceiptId };
  }

  return FinanceReceipt.findOne(filter)
    .sort({ createdAt: -1 })
    .select('_id amount paidAt status approvalStage paymentMethod referenceNo');
};

const findDuplicateReceiptSubmission = async ({
  billId = '',
  amount = 0,
  paymentMethod = 'manual',
  paidAt = null,
  referenceNo = '',
  excludeReceiptId = ''
} = {}) => {
  if (!billId) return null;

  const normalizedAmount = roundMoney(amount);
  const paidDate = paidAt ? new Date(paidAt) : null;
  if (!normalizedAmount || !paidDate || Number.isNaN(paidDate.getTime())) return null;

  const dayStart = new Date(paidDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const filter = {
    bill: billId,
    status: { $in: ['pending', 'approved'] }
  };

  if (excludeReceiptId) {
    filter._id = { $ne: excludeReceiptId };
  }

  const normalizedReference = String(referenceNo || '').trim();
  if (normalizedReference) {
    filter.referenceNo = normalizedReference;
  } else {
    filter.amount = normalizedAmount;
    filter.paidAt = { $gte: dayStart, $lt: dayEnd };
    filter.paymentMethod = String(paymentMethod || 'manual').trim() || 'manual';
  }

  return FinanceReceipt.findOne(filter)
    .sort({ createdAt: -1 })
    .select('_id amount paidAt status approvalStage paymentMethod referenceNo');
};

module.exports = {
  roundMoney,
  getBillRemainingAmount,
  getReservedPendingReceiptAmount,
  getReceiptSubmissionAvailability,
  findPendingReceiptForBill,
  findDuplicateReceiptSubmission
};
