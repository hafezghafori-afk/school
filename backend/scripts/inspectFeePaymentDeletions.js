/**
 * READ-ONLY. Hunt for why some admission FeeOrders are marked paid while no
 * FeePayment / FinanceReceipt exists behind them.
 *
 * Prints:
 *   1. Every ledger-reset / payment-scope-repair / admission-correction log
 *      entry in the DB (these are the operations that can strip payments).
 *   2. For each target student: their admission orders, ALL FeePayments that
 *      still reference those orders (any status), and every ActivityLog /
 *      AdminLog row that touches the student or their membership.
 *   3. A window dump of finance log activity around a given date.
 *
 * Usage (from backend/):
 *   node scripts/inspectFeePaymentDeletions.js --uri='mongodb+srv://...' --dns=8.8.8.8,1.1.1.1
 *   node scripts/inspectFeePaymentDeletions.js --uri='...' --users=<id>,<id> --around=2026-07-20 --window=10
 *
 * Default target users are the 4 PAID_MISMATCH students found by
 * auditAdmissionIssues.js. Override with --users= or --asas=.
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const User = require('../models/User');
const AfghanStudent = require('../models/AfghanStudent');
const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceReceipt = require('../models/FinanceReceipt');
const ActivityLog = require('../models/ActivityLog');
const AdminLog = require('../models/AdminLog');

const id = (v) => String(v && v._id ? v._id : v || '').trim();
const d = (v) => {
  if (!v) return '-';
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? String(v) : t.toISOString().slice(0, 19).replace('T', ' ');
};
const money = (v) => Math.round((Number(v) || 0) * 100) / 100;
function arg(name) {
  for (const t of process.argv.slice(2)) {
    if (t.startsWith(`--${name}=`)) return t.slice(name.length + 3).trim();
  }
  return '';
}

const DEFAULT_USERS = [
  '6a33eb477eea1d272ddc69fa', // نبیلا امیری  IGS-05-0138
  '6a33ec417eea1d272ddc6b5d', // فروه افشار   IGS-05-0142
  '6a58a4e3bcf7c2ba827bc7f0', // عاطفه نورستانی IGS-05-0255
  '6a58c226aee859350d62d06e'  // فاطمه سخی     IGS-05-0261
];

const LEDGER_ACTIONS = [
  'finance_ledger_reset',
  'finance_payment_scope_repair_batch',
  'finance_admission_receipt_correction_batch',
  'finance_anomaly_admission_settle_batch',
  'finance_anomaly_admission_settle',
  'fee_payment_reject',
  'fee_payment_approve',
  'fee_order_void'
];

function metaHasAny(meta, needles) {
  const blob = JSON.stringify(meta || {}).toLowerCase();
  return needles.some((n) => n && blob.includes(String(n).toLowerCase()));
}

async function run() {
  const uri = arg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = arg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`using DNS servers: ${dns.getServers().join(', ')}`);
  }
  console.log(`\nconnecting to: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`DB: ${mongoose.connection.name}\n`);

  // --- resolve target users ---
  let userIds = arg('users') ? arg('users').split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (arg('asas')) {
    const asasList = arg('asas').split(',').map((s) => s.trim()).filter(Boolean);
    const rows = await AfghanStudent.find({ asasNumber: { $in: asasList } }).select('linkedUserId asasNumber fullName').lean();
    rows.forEach((r) => { if (id(r.linkedUserId)) userIds.push(id(r.linkedUserId)); });
  }
  if (!userIds.length) userIds = DEFAULT_USERS.slice();
  userIds = [...new Set(userIds)];

  const [users, afg, memberships] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select('_id name').lean(),
    AfghanStudent.find({ linkedUserId: { $in: userIds } }).select('linkedUserId asasNumber fullName').lean(),
    StudentMembership.find({ student: { $in: userIds } }).select('_id student').lean()
  ]);
  const nameByUser = new Map();
  users.forEach((u) => nameByUser.set(id(u), u.name || ''));
  afg.forEach((a) => { if (a.fullName) nameByUser.set(id(a.linkedUserId), a.fullName); });
  const asasByUser = new Map();
  afg.forEach((a) => asasByUser.set(id(a.linkedUserId), String(a.asasNumber || '').trim()));
  const membershipIdsByUser = new Map();
  memberships.forEach((m) => {
    const k = id(m.student);
    if (!membershipIdsByUser.has(k)) membershipIdsByUser.set(k, []);
    membershipIdsByUser.get(k).push(id(m));
  });

  // ============================================================
  console.log('================ GLOBAL: ledger-reset / scope-repair / admission-correction log entries ================\n');
  const [actGlobal, admGlobal] = await Promise.all([
    ActivityLog.find({ action: { $in: LEDGER_ACTIONS.filter((a) => !['fee_payment_reject', 'fee_payment_approve', 'fee_order_void'].includes(a)) } }).sort({ createdAt: 1 }).lean(),
    AdminLog.find({ action: { $in: LEDGER_ACTIONS } }).sort({ createdAt: 1 }).lean()
  ]);
  if (!actGlobal.length && !admGlobal.length) console.log('  (none found)\n');
  actGlobal.forEach((l) => console.log(`  [ActivityLog] ${d(l.createdAt)}  ${l.action}  actor=${id(l.actor)}  target=${l.targetType}:${l.targetId}\n     meta=${JSON.stringify(l.meta || {})}\n`));
  admGlobal.forEach((l) => console.log(`  [AdminLog]    ${d(l.createdAt)}  ${l.action}  admin=${id(l.adminId)}\n     meta=${JSON.stringify(l.meta || {})}\n`));

  // ============================================================
  for (const uid of userIds) {
    const label = `${nameByUser.get(uid) || '-'}  (asas ${asasByUser.get(uid) || '-'})  user=${uid}`;
    console.log(`\n\n================ STUDENT: ${label} ================`);
    const memIds = membershipIdsByUser.get(uid) || [];
    console.log(`  memberships: ${memIds.join(', ') || '-'}`);

    const orders = await FeeOrder.find({ student: uid }).lean();
    const admissionOrders = orders.filter((o) => String(o.orderType || '') === 'admission'
      || (Array.isArray(o.lineItems) ? o.lineItems : []).some((li) => String(li.feeType || '') === 'admission'));
    console.log(`\n  -- admission orders --`);
    admissionOrders.forEach((o) => console.log(`     ${o.orderNumber} [${o.status}] paid=${money(o.amountPaid)} due=${money(o.amountDue)} paidAt=${d(o.paidAt)} created=${d(o.createdAt)} updated=${d(o.updatedAt)} _id=${id(o)}`));

    const admOrderIds = admissionOrders.map((o) => id(o));
    const linkedPayments = admOrderIds.length
      ? await FeePayment.find({ $or: [{ feeOrderId: { $in: admOrderIds } }, { 'allocations.feeOrderId': { $in: admOrderIds } }] }).lean()
      : [];
    console.log(`\n  -- FeePayments still referencing those admission orders: ${linkedPayments.length} --`);
    linkedPayments.forEach((p) => console.log(`     ${p.paymentNumber} [${p.status}] amount=${money(p.amount)} source=${p.source} created=${d(p.createdAt)} reviewedAt=${d(p.reviewedAt)} note=${JSON.stringify(p.note || '')}`));

    const anyPayments = await FeePayment.find({ student: uid }).select('paymentNumber status amount source note createdAt').lean();
    console.log(`\n  -- ALL FeePayments for student: ${anyPayments.length} --`);
    anyPayments.forEach((p) => console.log(`     ${p.paymentNumber} [${p.status}] ${money(p.amount)} ${p.source} ${d(p.createdAt)} ${JSON.stringify(p.note || '')}`));

    const anyReceipts = await FinanceReceipt.find({ student: uid }).select('status amount feeType bill paidAt createdAt note').lean();
    console.log(`\n  -- ALL FinanceReceipts for student: ${anyReceipts.length} --`);
    anyReceipts.forEach((r) => console.log(`     [${r.status}] ${money(r.amount)} feeType=${r.feeType || '-'} bill=${id(r.bill)} ${d(r.paidAt)} ${JSON.stringify(r.note || '')}`));

    // logs that mention this student or any of their memberships or admission orders
    const needles = [uid, ...memIds, ...admOrderIds, ...admissionOrders.map((o) => o.orderNumber).filter(Boolean)];
    const [acts, adms] = await Promise.all([
      ActivityLog.find({ $or: [{ targetUser: uid }, { targetId: { $in: [...admOrderIds, ...admissionOrders.map((o) => o.orderNumber)] } }] }).sort({ createdAt: 1 }).lean(),
      AdminLog.find({}).sort({ createdAt: 1 }).lean()
    ]);
    const admsHit = adms.filter((l) => metaHasAny(l.meta, needles));
    console.log(`\n  -- ActivityLog rows touching this student: ${acts.length} --`);
    acts.forEach((l) => console.log(`     ${d(l.createdAt)}  ${l.action}  target=${l.targetType}:${l.targetId}  reason=${l.reason || '-'}  meta=${JSON.stringify(l.meta || {})}`));
    console.log(`\n  -- AdminLog rows whose meta mentions this student/membership/order: ${admsHit.length} --`);
    admsHit.forEach((l) => console.log(`     ${d(l.createdAt)}  ${l.action}  admin=${id(l.adminId)}  meta=${JSON.stringify(l.meta || {})}`));
  }

  // ============================================================
  const around = arg('around');
  if (around) {
    const win = Math.max(1, Number(arg('window') || 7));
    const start = new Date(`${around}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - win);
    const end = new Date(`${around}T23:59:59Z`);
    end.setUTCDate(end.getUTCDate() + win);
    console.log(`\n\n================ WINDOW: finance log activity ${d(start)} .. ${d(end)} ================\n`);
    const rows = await ActivityLog.find({
      createdAt: { $gte: start, $lte: end },
      action: /payment|receipt|ledger|anomaly|fee_order|void|reset|repair/i
    }).sort({ createdAt: 1 }).lean();
    if (!rows.length) console.log('  (none)');
    rows.forEach((l) => console.log(`  ${d(l.createdAt)}  ${l.action}  actor=${id(l.actor)}  target=${l.targetType}:${l.targetId}  meta=${JSON.stringify(l.meta || {})}`));
  }

  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
