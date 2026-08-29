/**
 * READ-ONLY diagnostic for a single student's fee balance.
 *
 * Investigates the case where an APPROVED payment does not reduce the
 * student's outstanding ("باقیات"): it lists every FeeOrder / FeePayment /
 * FinanceBill / FinanceReceipt / relief for the student and reconciles
 * "money approved" vs "money actually sitting on a live (non-void) order".
 *
 * Usage (run from backend/):
 *   node scripts/diagnoseStudentBalance.js --asas=IGS-05-0088
 *   node scripts/diagnoseStudentBalance.js --name="مقدس نجیب"
 *   node scripts/diagnoseStudentBalance.js --user=<userId>
 *
 * Which database it inspects (first one wins):
 *   1. --uri="mongodb+srv://..."   (pass the production connection string inline)
 *   2. PROD_MONGO_URI env var
 *   3. MONGO_URI env var / .env
 *
 * Nothing is written - this is a read-only report.
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
const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const FinanceRelief = require('../models/FinanceRelief');
const Discount = require('../models/Discount');
const FeeExemption = require('../models/FeeExemption');

const money = (v) => Math.round((Number(v) || 0) * 100) / 100;
const id = (v) => String(v && v._id ? v._id : v || '').trim();

function arg(name) {
  for (const token of process.argv.slice(2)) {
    if (token.startsWith(`--${name}=`)) return token.slice(name.length + 3).trim();
  }
  return '';
}

async function resolveStudentUserIds() {
  const asas = arg('asas');
  const name = arg('name');
  const user = arg('user');

  if (user) return [user];

  if (asas) {
    const rows = await AfghanStudent.find({
      asasNumber: new RegExp(`^${asas.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    }).select('linkedUserId asasNumber fullName').lean();
    if (!rows.length) throw new Error(`no AfghanStudent with asasNumber ~ ${asas}`);
    rows.forEach((r) => console.log(`  matched AfghanStudent: ${r.fullName || ''} (asas ${r.asasNumber}) -> user ${id(r.linkedUserId)}`));
    return rows.map((r) => id(r.linkedUserId)).filter(Boolean);
  }

  if (name) {
    const rx = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [students, users] = await Promise.all([
      AfghanStudent.find({ fullName: rx }).select('linkedUserId asasNumber fullName').lean(),
      User.find({ name: rx, role: 'student' }).select('_id name').lean()
    ]);
    const ids = new Set();
    students.forEach((r) => { if (id(r.linkedUserId)) ids.add(id(r.linkedUserId)); console.log(`  AfghanStudent: ${r.fullName} (asas ${r.asasNumber}) -> user ${id(r.linkedUserId)}`); });
    users.forEach((u) => { ids.add(id(u)); console.log(`  User: ${u.name} -> ${id(u)}`); });
    if (!ids.size) throw new Error(`no student matched name ~ ${name}`);
    return [...ids];
  }

  throw new Error('pass one of --asas=, --name=, --user=');
}

function fmtOrder(o) {
  return [
    `    [${o.status}] ${o.orderNumber}`,
    `${o.periodLabel || o.periodType || ''}`.trim(),
    `orig=${money(o.amountOriginal)} due=${money(o.amountDue)} paid=${money(o.amountPaid)} out=${money(o.outstandingAmount)}`,
    o.sourceBillId ? `bill=${id(o.sourceBillId)}` : 'no-bill',
    o.issuanceKey ? `key=${o.issuanceKey}` : '',
    `_id=${id(o)}`
  ].filter(Boolean).join('  |  ');
}

function resolveMongoUri() {
  const fromArg = arg('uri');
  if (fromArg) return fromArg;
  if (process.env.PROD_MONGO_URI) return process.env.PROD_MONGO_URI;
  return process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
}

async function run() {
  const uri = resolveMongoUri();
  const safeHost = uri.replace(/\/\/[^@]*@/, '//***@');

  // Work around local resolvers (VPN / router / Pi-hole) that refuse the SRV
  // lookup that "mongodb+srv://" needs: --dns=8.8.8.8,1.1.1.1
  const dnsServers = arg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`using DNS servers: ${dns.getServers().join(', ')}`);
  }

  console.log(`\nconnecting to: ${safeHost}`);
  await mongoose.connect(uri, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 20000
  });
  console.log(`DB: ${mongoose.connection.name}\n`);

  const userIds = await resolveStudentUserIds();
  console.log(`\nstudent user id(s): ${userIds.join(', ')}\n`);

  const memberships = await StudentMembership.find({ student: { $in: userIds } })
    .select('_id classId academicYearId status').lean();
  console.log(`memberships: ${memberships.length}`);
  memberships.forEach((m) => console.log(`  ${id(m)}  status=${m.status}  class=${id(m.classId)}  year=${id(m.academicYearId)}`));

  const [orders, payments, bills, receipts, reliefs, discounts, exemptions] = await Promise.all([
    FeeOrder.find({ student: { $in: userIds } }).sort({ dueDate: 1, createdAt: 1 }).lean(),
    FeePayment.find({ student: { $in: userIds } }).sort({ paidAt: 1, createdAt: 1 }).lean(),
    FinanceBill.find({ student: { $in: userIds } }).sort({ dueDate: 1, createdAt: 1 }).lean(),
    FinanceReceipt.find({ student: { $in: userIds } }).sort({ paidAt: 1, createdAt: 1 }).lean(),
    FinanceRelief.find({ student: { $in: userIds } }).lean(),
    Discount.find({ student: { $in: userIds } }).lean(),
    FeeExemption.find({ student: { $in: userIds } }).lean()
  ]);

  const orderById = new Map(orders.map((o) => [id(o), o]));

  console.log(`\n================ FEE ORDERS (canonical) : ${orders.length} ================`);
  orders.forEach((o) => console.log(fmtOrder(o)));

  const liveOrders = orders.filter((o) => o.status !== 'void');
  const cardPaid = money(liveOrders.reduce((s, o) => s + Number(o.amountPaid || 0), 0));
  const cardOut = money(liveOrders.reduce((s, o) => s + Number(o.outstandingAmount || 0), 0));
  console.log(`\n  live (non-void) orders: paid total = ${cardPaid}   outstanding total = ${cardOut}`);
  console.log('  ^ this is what the "کارت مالی متعلم" card shows.');

  console.log(`\n================ FEE PAYMENTS (canonical) : ${payments.length} ================`);
  let approvedTotal = 0;
  let approvedNotOnLiveOrder = 0;
  payments.forEach((p) => {
    const allocs = Array.isArray(p.allocations) && p.allocations.length
      ? p.allocations
      : (p.feeOrderId ? [{ feeOrderId: p.feeOrderId, amount: p.amount, feeType: '(implicit)' }] : []);
    console.log(`\n  [${p.status}] ${p.paymentNumber}  amount=${money(p.amount)}  source=${p.source}  method=${p.paymentMethod}  mode=${p.allocationMode}`);
    console.log(`      paidAt=${p.paidAt && new Date(p.paidAt).toISOString().slice(0, 10)}  note=${JSON.stringify(p.note || '')}  sourceReceiptId=${id(p.sourceReceiptId) || '-'}  _id=${id(p)}`);
    if (!allocs.length) {
      console.log('      !! NO ALLOCATIONS AND NO feeOrderId - this money is attached to no order');
    }
    allocs.forEach((a) => {
      const o = orderById.get(id(a.feeOrderId));
      const state = !o ? 'ORDER MISSING / not this student' : (o.status === 'void' ? 'ORDER IS VOID' : `order ok [${o.status}] ${o.orderNumber}`);
      console.log(`      alloc ${money(a.amount)}  feeType=${a.feeType || '-'}  -> ${state}  (${id(a.feeOrderId) || 'null'})`);
    });

    if (p.status === 'approved') {
      approvedTotal += Number(p.amount || 0);
      const landed = allocs.some((a) => {
        const o = orderById.get(id(a.feeOrderId));
        return o && o.status !== 'void';
      });
      if (!landed) approvedNotOnLiveOrder += Number(p.amount || 0);
    }
  });

  console.log(`\n================ FINANCE BILLS (legacy) : ${bills.length} ================`);
  bills.forEach((b) => console.log(`    [${b.status}] ${b.billNumber}  ${b.periodLabel || ''}  orig=${money(b.amountOriginal)} due=${money(b.amountDue)} paid=${money(b.amountPaid)}  _id=${id(b)}`));

  console.log(`\n================ FINANCE RECEIPTS (legacy) : ${receipts.length} ================`);
  receipts.forEach((r) => console.log(`    [${r.status}] amount=${money(r.amount)}  feeType=${r.feeType || '-'}  bill=${id(r.bill)}  method=${r.paymentMethod}  paidAt=${r.paidAt && new Date(r.paidAt).toISOString().slice(0, 10)}  _id=${id(r)}`));

  console.log(`\n================ RELIEF / DISCOUNT / EXEMPTION ================`);
  reliefs.forEach((r) => console.log(`    relief   [${r.status}] type=${r.reliefType} mode=${r.coverageMode} amount=${money(r.amount)} pct=${r.percentage || 0} feeOrderId=${id(r.feeOrderId) || '-'} source=${r.source}`));
  discounts.forEach((d) => console.log(`    discount [${d.status}] type=${d.discountType} mode=${d.coverageMode} amount=${money(d.amount)} pct=${d.percentage || 0} source=${d.source}`));
  exemptions.forEach((e) => console.log(`    exempt   [${e.status}] type=${e.exemptionType} scope=${e.scope}`));

  console.log(`\n================ RECONCILIATION ================`);
  console.log(`  approved payments total ......................... ${money(approvedTotal)}`);
  console.log(`  approved money NOT on any live order ............ ${money(approvedNotOnLiveOrder)}   <-- the leak`);
  console.log(`  sum(live order.amountPaid) ..................... ${cardPaid}`);
  console.log(`  sum(approved receipts, legacy) ................. ${money(receipts.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.amount || 0), 0))}`);
  console.log(`\n  If "approved money NOT on any live order" > 0, that is why the card`);
  console.log(`  under-counts the payment: the FeePayment is approved but its target`);
  console.log(`  FeeOrder is void / missing / was never credited, so the card (which`);
  console.log(`  sums FeeOrder.amountPaid over non-void orders) never sees it.\n`);

  if (process.argv.slice(2).includes('--deep')) {
    const d10 = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '-');
    console.log(`\n================ DEEP: ORDERS (dates / adjustments / line items) ================`);
    orders.forEach((o) => {
      console.log(`\n  ${o.orderNumber} [${o.status}] ${o.periodLabel || ''}`);
      console.log(`    issuedAt=${d10(o.issuedAt)}  dueDate=${d10(o.dueDate)}  createdAt=${d10(o.createdAt)}  paidAt=${d10(o.paidAt)}`);
      console.log(`    amountOriginal=${money(o.amountOriginal)}  amountDue=${money(o.amountDue)}  amountPaid=${money(o.amountPaid)}  outstanding=${money(o.outstandingAmount)}`);
      if (o.status === 'void') console.log(`    voidReason=${JSON.stringify(o.voidReason || '')}  voidedAt=${d10(o.voidedAt)}`);
      console.log(`    adjustments=${JSON.stringify((o.adjustments || []).map((a) => ({ type: a.type, scope: a.scope, amount: a.amount, reason: a.reason })))}`);
      console.log(`    lineItems=${JSON.stringify((o.lineItems || []).map((li) => ({ feeType: li.feeType, gross: li.grossAmount, reduction: li.reductionAmount, net: li.netAmount, paid: li.paidAmount, balance: li.balanceAmount, status: li.status })))}`);
    });

    console.log(`\n================ DEEP: DISCOUNTS (full) ================`);
    discounts.forEach((x) => console.log(`  ${JSON.stringify({
      status: x.status, type: x.discountType, mode: x.coverageMode, amount: x.amount, pct: x.percentage,
      source: x.source, durationMode: x.durationMode, start: d10(x.startDate), end: d10(x.endDate),
      createdAt: d10(x.createdAt), reason: x.reason, feeOrderId: id(x.feeOrderId) || '-', membershipId: id(x.studentMembershipId) || '-'
    })}`));

    console.log(`\n================ DEEP: RELIEFS (full) ================`);
    reliefs.forEach((x) => console.log(`  ${JSON.stringify({
      status: x.status, type: x.reliefType, mode: x.coverageMode, amount: x.amount, scope: x.scope,
      durationMode: x.durationMode, start: d10(x.startDate), end: d10(x.endDate), source: x.source,
      sourceKey: x.sourceKey, createdAt: d10(x.createdAt), feeOrderId: id(x.feeOrderId) || '-', membershipId: id(x.studentMembershipId) || '-'
    })}`));

    console.log(`\n================ DEEP: PAYMENTS (dates / allocations) ================`);
    payments.forEach((p) => console.log(`  ${JSON.stringify({
      num: p.paymentNumber, amount: p.amount, status: p.status, mode: p.allocationMode, feeType: p.feeType,
      note: p.note, paidAt: d10(p.paidAt), createdAt: d10(p.createdAt), reviewedAt: d10(p.reviewedAt),
      allocations: (p.allocations || []).map((a) => ({ order: a.orderNumber || id(a.feeOrderId), amount: a.amount, feeType: a.feeType }))
    })}`));
    console.log('');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
