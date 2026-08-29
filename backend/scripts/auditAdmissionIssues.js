/**
 * READ-ONLY school-wide audit of admission-fee ("داخله") problems.
 *
 * Flags, per student:
 *   ANOMALY_ORDER    admission order auto-created from a finance alert
 *                    (issuanceKey starts with "admission-anomaly:")
 *   UNPAID           live admission order still has an outstanding balance
 *   LEAK             an APPROVED payment's admission allocation points at a
 *                    void / missing order, so no live order was credited
 *   DUP_LIVE         more than one non-void admission order for the student
 *   VOID_AND_LIVE    student has both a void and a live admission order
 *   PAID_MISMATCH    admission order.amountPaid != sum of approved payment
 *                    admission allocations that target it
 *   NO_FEETYPE       approved payment allocation with no feeType on an order
 *                    that also carries non-admission line items (ambiguous)
 *   WRONG_SCOPE      approved payment whose note mentions داخله/admission but
 *                    whose money landed only on non-admission line items
 *
 * Usage (run from backend/):
 *   node scripts/auditAdmissionIssues.js --uri='mongodb+srv://...' --dns=8.8.8.8,1.1.1.1
 *   node scripts/auditAdmissionIssues.js --uri='...' --school=<schoolId> --year=<academicYearId>
 *   node scripts/auditAdmissionIssues.js --uri='...' --full        (print every student, not just flagged)
 *
 * Nothing is written.
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const User = require('../models/User');
const AfghanStudent = require('../models/AfghanStudent');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceReceipt = require('../models/FinanceReceipt');

const money = (v) => Math.round((Number(v) || 0) * 100) / 100;
const id = (v) => String(v && v._id ? v._id : v || '').trim();
const has = (name) => process.argv.slice(2).includes(`--${name}`);
function arg(name) {
  for (const t of process.argv.slice(2)) {
    if (t.startsWith(`--${name}=`)) return t.slice(name.length + 3).trim();
  }
  return '';
}

function resolveMongoUri() {
  return arg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
}

const ADMISSION_ANOMALY_PREFIX = 'admission-anomaly:';

function admissionLine(order) {
  return (Array.isArray(order.lineItems) ? order.lineItems : []).filter((li) => String(li.feeType || '').trim() === 'admission');
}
function isAdmissionOrder(order) {
  return String(order.orderType || '').trim() === 'admission' || admissionLine(order).length > 0;
}
function isAdmissionOnlyOrder(order) {
  if (!isAdmissionOrder(order)) return false;
  const lines = Array.isArray(order.lineItems) ? order.lineItems : [];
  return lines.length === 0 || lines.every((li) => String(li.feeType || '').trim() === 'admission');
}
// an allocation counts as admission money if it says so, or if the order it
// hits is admission-only (feeType is often left blank on admission-only orders)
function allocIsAdmission(a, order) {
  return String(a.feeType || '').trim() === 'admission' || (order && isAdmissionOnlyOrder(order));
}
function admissionNet(order) {
  const lines = admissionLine(order);
  if (lines.length) return money(lines.reduce((s, li) => s + Number(li.netAmount || 0), 0));
  return String(order.orderType || '') === 'admission' ? money(order.amountDue) : 0;
}
function admissionPaid(order) {
  const lines = admissionLine(order);
  if (lines.length) return money(lines.reduce((s, li) => s + Number(li.paidAmount || 0), 0));
  return String(order.orderType || '') === 'admission' ? money(order.amountPaid) : 0;
}
function admissionBalance(order) {
  const lines = admissionLine(order);
  if (lines.length) return money(lines.reduce((s, li) => s + Number(li.balanceAmount || 0), 0));
  return String(order.orderType || '') === 'admission' ? money(order.outstandingAmount) : 0;
}
function paymentAllocs(p) {
  if (Array.isArray(p.allocations) && p.allocations.length) return p.allocations;
  if (p.feeOrderId) return [{ feeOrderId: p.feeOrderId, amount: p.amount, feeType: '' }];
  return [];
}
function noteMentionsAdmission(p) {
  const n = String(p.note || '').toLowerCase();
  return n.includes('داخله') || n.includes('admission');
}

async function run() {
  const uri = resolveMongoUri();
  const dnsServers = arg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`using DNS servers: ${dns.getServers().join(', ')}`);
  }
  console.log(`\nconnecting to: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`DB: ${mongoose.connection.name}\n`);

  const schoolId = arg('school');
  const yearId = arg('year');
  const orderScope = {
    ...(schoolId ? { schoolId } : {}),
    ...(yearId ? { academicYearId: yearId } : {})
  };

  // All admission-relevant orders + every payment that could touch them.
  const allOrders = await FeeOrder.find({
    ...orderScope,
    $or: [
      { orderType: 'admission' },
      { 'lineItems.feeType': 'admission' }
    ]
  }).lean();

  // We also need any OTHER order referenced by a payment that also hit an
  // admission order, to classify WRONG_SCOPE - fetch orders per student lazily.
  const orderById = new Map(allOrders.map((o) => [id(o), o]));

  const studentIds = [...new Set(allOrders.map((o) => id(o.student)).filter(Boolean))];
  console.log(`admission-bearing orders: ${allOrders.length}   students: ${studentIds.length}`);

  const payments = studentIds.length
    ? await FeePayment.find({ student: { $in: studentIds } }).lean()
    : [];

  // Legacy receipts: match to a canonical order via order.sourceBillId === receipt.bill
  const legacyReceipts = studentIds.length
    ? await FinanceReceipt.find({ student: { $in: studentIds }, status: 'approved' }).lean()
    : [];
  const receiptsByStudent = new Map();
  legacyReceipts.forEach((r) => {
    const k = id(r.student);
    if (!receiptsByStudent.has(k)) receiptsByStudent.set(k, []);
    receiptsByStudent.get(k).push(r);
  });

  // hydrate any non-admission orders these payments reference
  const referencedOrderIds = new Set();
  payments.forEach((p) => paymentAllocs(p).forEach((a) => referencedOrderIds.add(id(a.feeOrderId))));
  const missingIds = [...referencedOrderIds].filter((x) => x && !orderById.has(x));
  if (missingIds.length) {
    const extra = await FeeOrder.find({ _id: { $in: missingIds } }).lean();
    extra.forEach((o) => orderById.set(id(o), o));
  }

  // identity lookup
  const asasMap = new Map();
  const nameMap = new Map();
  if (studentIds.length) {
    const [afg, users] = await Promise.all([
      AfghanStudent.find({ linkedUserId: { $in: studentIds } }).select('linkedUserId asasNumber fullName').lean(),
      User.find({ _id: { $in: studentIds } }).select('_id name').lean()
    ]);
    afg.forEach((a) => { if (id(a.linkedUserId)) { asasMap.set(id(a.linkedUserId), String(a.asasNumber || '').trim()); if (a.fullName) nameMap.set(id(a.linkedUserId), a.fullName); } });
    users.forEach((u) => { if (!nameMap.get(id(u))) nameMap.set(id(u), u.name || ''); });
  }

  const paymentsByStudent = new Map();
  payments.forEach((p) => {
    const k = id(p.student);
    if (!paymentsByStudent.has(k)) paymentsByStudent.set(k, []);
    paymentsByStudent.get(k).push(p);
  });

  const tally = {};
  const bump = (k) => { tally[k] = (tally[k] || 0) + 1; };
  const rows = [];

  for (const sid of studentIds) {
    const orders = allOrders.filter((o) => id(o.student) === sid);
    const admissionOrders = orders.filter(isAdmissionOrder);
    const liveAdm = admissionOrders.filter((o) => o.status !== 'void');
    const voidAdm = admissionOrders.filter((o) => o.status === 'void');
    const pays = (paymentsByStudent.get(sid) || []).filter((p) => p.status === 'approved');

    const flags = [];

    for (const o of admissionOrders) {
      if (String(o.issuanceKey || '').startsWith(ADMISSION_ANOMALY_PREFIX)) {
        // With --actionable, a fully-paid anomaly order that has no void sibling
        // is not worth listing (it is just "admission booked via the alert path").
        const cleanPaid = o.status === 'paid' && admissionBalance(o) <= 0 && !voidAdm.length;
        if (has('actionable') && cleanPaid) continue;
        flags.push(`ANOMALY_ORDER ${o.orderNumber} [${o.status}] net=${admissionNet(o)} paid=${admissionPaid(o)} bal=${admissionBalance(o)}`);
      }
    }
    for (const o of liveAdm) {
      if (['new', 'partial', 'overdue'].includes(String(o.status)) && admissionBalance(o) > 0) {
        flags.push(`UNPAID ${o.orderNumber} [${o.status}] bal=${admissionBalance(o)} due=${admissionNet(o)}`);
      }
    }
    if (liveAdm.length > 1) flags.push(`DUP_LIVE ${liveAdm.map((o) => o.orderNumber).join(', ')}`);
    if (voidAdm.length && liveAdm.length) flags.push(`VOID_AND_LIVE void=[${voidAdm.map((o) => o.orderNumber).join(',')}] live=[${liveAdm.map((o) => o.orderNumber).join(',')}]`);

    // approved admission money that landed on void/missing orders
    for (const p of pays) {
      for (const a of paymentAllocs(p)) {
        const o = orderById.get(id(a.feeOrderId));
        const ft = String(a.feeType || '').trim();
        const looksAdmission = ft === 'admission'
          || (!ft && noteMentionsAdmission(p))
          || (o && isAdmissionOnlyOrder(o));
        if (!looksAdmission) continue;
        if (!o) flags.push(`LEAK ${p.paymentNumber} alloc ${money(a.amount)} -> order MISSING (${id(a.feeOrderId)})`);
        else if (o.status === 'void') flags.push(`LEAK ${p.paymentNumber} alloc ${money(a.amount)} -> order VOID ${o.orderNumber}`);
        else if (!ft && admissionLine(o).length && o.lineItems.length > admissionLine(o).length) {
          flags.push(`NO_FEETYPE ${p.paymentNumber} alloc ${money(a.amount)} on multi-scope order ${o.orderNumber}`);
        }
      }
      // note says admission but no admission-scoped allocation at all
      if (noteMentionsAdmission(p)) {
        const anyAdm = paymentAllocs(p).some((a) => {
          const o = orderById.get(id(a.feeOrderId));
          return String(a.feeType || '') === 'admission' || (o && isAdmissionOrder(o));
        });
        if (!anyAdm) flags.push(`WRONG_SCOPE ${p.paymentNumber} note~داخله but allocated to non-admission`);
      }
    }

    // amountPaid on a live admission order vs approved inflow that targets it
    // (canonical FeePayment allocations + legacy FinanceReceipts on its sourceBill)
    const stuReceipts = receiptsByStudent.get(sid) || [];
    for (const o of liveAdm) {
      const allocPaid = money(pays.reduce((s, p) => s + paymentAllocs(p)
        .filter((a) => id(a.feeOrderId) === id(o) && allocIsAdmission(a, o))
        .reduce((ss, a) => ss + Number(a.amount || 0), 0), 0));
      const receiptPaid = money(stuReceipts
        .filter((r) => id(r.bill) && id(r.bill) === id(o.sourceBillId)
          && ['admission', ''].includes(String(r.feeType || '').trim()))
        .reduce((s, r) => s + Number(r.amount || 0), 0));
      const inflow = money(allocPaid + receiptPaid);
      if (Math.abs(inflow - admissionPaid(o)) > 0.5) {
        flags.push(`PAID_MISMATCH ${o.orderNumber} order.paid=${admissionPaid(o)} vs approvedInflow=${inflow} (canon ${allocPaid} + legacy ${receiptPaid})`);
      }
    }

    if (!flags.length && !has('full')) continue;

    flags.forEach((f) => bump(f.split(' ')[0]));
    rows.push({ sid, asas: asasMap.get(sid) || '-', name: nameMap.get(sid) || '-', flags });
  }

  rows.sort((a, b) => String(a.asas).localeCompare(String(b.asas)));
  console.log(`\n================ FLAGGED STUDENTS: ${rows.filter((r) => r.flags.length).length} ================\n`);
  for (const r of rows) {
    console.log(`● ${r.name}  (asas ${r.asas})  user=${r.sid}`);
    if (!r.flags.length) { console.log('   (no admission issue)'); continue; }
    r.flags.forEach((f) => console.log(`   - ${f}`));
    console.log('');
  }

  console.log(`================ SUMMARY ================`);
  Object.keys(tally).sort().forEach((k) => console.log(`  ${k.padEnd(16)} ${tally[k]}`));
  if (!Object.keys(tally).length) console.log('  no admission issues found');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
