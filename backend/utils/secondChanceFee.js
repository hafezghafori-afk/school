// «فیس امتحان چانس دوم»: an optional fee the finance office may charge a
// student held (مشروط) for the second-chance exam. The bill is an ordinary
// FinanceBill of fee type 'exam'; its issuanceKey ties it to the held
// promotion transaction, so the unique issuanceKey index allows one live bill
// per student, and voiding the bill (which releases the key) allows another.

const SECOND_CHANCE_FEE_TYPE = 'exam';
const SECOND_CHANCE_FEE_LABEL = 'فیس امتحان چانس دوم';
const SECOND_CHANCE_KEY_PREFIX = 'second_chance_exam:';

function secondChanceIssuanceKey(transactionId) {
  const id = String(transactionId?._id || transactionId || '').trim();
  return id ? `${SECOND_CHANCE_KEY_PREFIX}${id}` : '';
}

function billOutstanding(bill = null) {
  if (!bill) return 0;
  return Math.max(0, Math.round((Number(bill.amountDue || 0) - Number(bill.amountPaid || 0)) * 100) / 100);
}

module.exports = {
  SECOND_CHANCE_FEE_LABEL,
  SECOND_CHANCE_FEE_TYPE,
  SECOND_CHANCE_KEY_PREFIX,
  billOutstanding,
  secondChanceIssuanceKey
};
