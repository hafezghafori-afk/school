/**
 * Clean up the leftover VOID admission "anomaly" FeeOrders with a wrong amount
 * (494/496/497) that the 2026-07-20 finance_admission_receipt_correction_batch
 * replaced with a clean 500 order. They are already void (excluded from every
 * balance), so this is cosmetic / report hygiene only.
 *
 * A candidate order must satisfy ALL of:
 *   - status === 'void'
 *   - admission order (orderType 'admission' or an admission line item)
 *   - issuanceKey starts with "admission-anomaly:"
 *   - amountPaid <= 0 and no line item paidAmount > 0
 *   - net amount > 0 and < 500  (the wrong-amount signature)
 *   - NO FeePayment references it (feeOrderId or allocations.feeOrderId)
 *   - NO sourceBillId (would orphan a FinanceBill)
 *   - the same student has another NON-void, PAID admission order (the replacement)
 *
 * Modes:
 *   --mode=neutralize (default)  set outstandingAmount + every line balanceAmount
 *                                to 0 and stamp a clear voidReason. Non-destructive,
 *                                keeps the audit trail. Kills the phantom ~495 in
 *                                any report that counts void orders.
 *   --mode=delete                hard-delete the order documents. Irreversible.
 *
 * Nothing is written without --apply.
 *
 * Usage (from backend/):
 *   node scripts/cleanupVoidAdmissionAnomalyOrders.js --uri='mongodb+srv://...' --dns=8.8.8.8,1.1.1.1
 *   node scripts/cleanupVoidAdmissionAnomalyOrders.js --uri='...' --dns=... --apply
 *   node scripts/cleanupVoidAdmissionAnomalyOrders.js --uri='...' --dns=... --mode=delete --apply
 */
require('dotenv').config();
const dns = require('node:dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');

const id = (v) => String(v && v._id ? v._id : v || '').trim();
const money = (v) => Math.round((Number(v) || 0) * 100) / 100;
const APPLY = process.argv.includes('--apply');
function arg(name) {
  for (const t of process.argv.slice(2)) {
    if (t.startsWith(`--${name}=`)) return t.slice(name.length + 3).trim();
  }
  return '';
}
const MODE = (arg('mode') || 'neutralize').toLowerCase();
const ANOMALY_PREFIX = 'admission-anomaly:';
const MARKER = '[admission-amount-correction] جایگزین با بل داخلهٔ ۵۰۰؛ این بل مبلغ اشتباه (زیر ۵۰۰) داشت.';

const admissionLines = (o) => (Array.isArray(o.lineItems) ? o.lineItems : []).filter((li) => String(li.feeType || '').trim() === 'admission');
const isAdmission = (o) => String(o.orderType || '').trim() === 'admission' || admissionLines(o).length > 0;
const netOf = (o) => {
  const lines = admissionLines(o);
  return lines.length ? money(lines.reduce((s, li) => s + Number(li.netAmount || 0), 0)) : money(o.amountDue);
};
const paidOf = (o) => money(Math.max(
  Number(o.amountPaid || 0),
  ...admissionLines(o).map((li) => Number(li.paidAmount || 0)),
  0
));

async function run() {
  if (!['neutralize', 'delete'].includes(MODE)) throw new Error(`--mode must be neutralize or delete (got "${MODE}")`);
  const dnsServers = arg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`DNS servers: ${dns.getServers().join(', ')}`);
  }
  const uri = arg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  console.log(`connecting to: ${uri.replace(/\/\/[^@]*@/, '//***@')}   mode=${MODE}   ${APPLY ? 'APPLY' : 'dry-run'}`);
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`DB: ${mongoose.connection.name}\n`);

  const voidOrders = await FeeOrder.find({
    status: 'void',
    issuanceKey: new RegExp(`^${ANOMALY_PREFIX}`),
    $or: [{ orderType: 'admission' }, { 'lineItems.feeType': 'admission' }]
  }).lean();

  // live paid admission orders, grouped by student, for the "replacement exists" check
  const livePaid = await FeeOrder.find({
    status: { $ne: 'void' },
    $or: [{ orderType: 'admission' }, { 'lineItems.feeType': 'admission' }]
  }).select('_id student status amountPaid lineItems orderType').lean();
  const paidByStudent = new Map();
  for (const o of livePaid) {
    if (o.status === 'paid' || paidOf(o) > 0) {
      const k = id(o.student);
      if (!paidByStudent.has(k)) paidByStudent.set(k, []);
      paidByStudent.get(k).push(o.orderNumber || id(o));
    }
  }

  const summary = { scannedVoid: voidOrders.length, eligible: 0, changed: 0, skipped: {} };
  const skip = (reason) => { summary.skipped[reason] = (summary.skipped[reason] || 0) + 1; };
  const targets = [];

  for (const o of voidOrders) {
    if (!isAdmission(o)) { skip('not_admission'); continue; }
    if (o.sourceBillId) { skip('has_sourceBillId'); continue; }
    if (paidOf(o) > 0) { skip('has_paid_amount'); continue; }
    const net = netOf(o);
    if (!(net > 0 && net < 500)) { skip('amount_not_below_500'); continue; }
    // A pending/approved payment is a hard blocker. A *rejected* payment (the
    // old receipt the correction batch rejected) is dead already - it does not
    // block, but we record it so it can be cleaned alongside a --mode=delete.
    // eslint-disable-next-line no-await-in-loop
    const linkedPayments = await FeePayment.find({
      $or: [{ feeOrderId: o._id }, { 'allocations.feeOrderId': o._id }]
    }).select('paymentNumber status feeOrderId allocations').lean();
    if (linkedPayments.some((p) => ['pending', 'approved'].includes(String(p.status)))) {
      skip('referenced_by_active_payment');
      continue;
    }
    if (!(paidByStudent.get(id(o.student)) || []).length) { skip('no_replacement_paid_order'); continue; }
    o.__rejectedPayments = linkedPayments.filter((p) => String(p.status) === 'rejected');
    summary.eligible += 1;
    targets.push(o);
  }

  const rejTotal = targets.reduce((s, o) => s + (o.__rejectedPayments || []).length, 0);
  console.log(`eligible void orders: ${summary.eligible} / ${summary.scannedVoid} scanned`);
  console.log(`rejected payments attached to them: ${rejTotal}${MODE === 'delete' ? ' (will also be deleted)' : ' (left as-is)'}\n`);
  for (const o of targets.slice(0, APPLY ? targets.length : 40)) {
    const rej = (o.__rejectedPayments || []).map((p) => p.paymentNumber).join(', ') || '-';
    console.log(`  ${o.orderNumber}  student=${id(o.student)}  net=${netOf(o)}  rejectedPay=[${rej}]  replacement=[${(paidByStudent.get(id(o.student)) || []).join(', ')}]`);
  }
  if (!APPLY && targets.length > 40) console.log(`  … and ${targets.length - 40} more`);

  if (APPLY) {
    for (const o of targets) {
      if (MODE === 'delete') {
        for (const p of o.__rejectedPayments || []) {
          const onlyRef = !(Array.isArray(p.allocations) && p.allocations.some((a) => id(a.feeOrderId) && id(a.feeOrderId) !== id(o)))
            && (!p.feeOrderId || id(p.feeOrderId) === id(o));
          if (onlyRef) {
            // eslint-disable-next-line no-await-in-loop
            await FeePayment.deleteOne({ _id: p._id, status: 'rejected' });
            summary.rejectedPaymentsDeleted = (summary.rejectedPaymentsDeleted || 0) + 1;
          }
        }
        // eslint-disable-next-line no-await-in-loop
        await FeeOrder.deleteOne({ _id: o._id, status: 'void' });
      } else {
        const lineItems = (Array.isArray(o.lineItems) ? o.lineItems : []).map((li) => ({
          ...li,
          balanceAmount: 0,
          status: 'waived'
        }));
        // eslint-disable-next-line no-await-in-loop
        await FeeOrder.updateOne(
          { _id: o._id, status: 'void' },
          { $set: { outstandingAmount: 0, lineItems, voidReason: `${String(o.voidReason || '').trim()} ${MARKER}`.trim() } }
        );
      }
      summary.changed += 1;
    }
  }

  console.log(`\n${JSON.stringify(summary)}`);
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
