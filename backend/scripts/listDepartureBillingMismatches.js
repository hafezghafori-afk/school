/**
 * READ-ONLY. Lists the bills that leaving students' billing got wrong while it
 * counted Gregorian months, so the finance office can decide on each one.
 *
 * Two rules decide what happens to a student's bills when they leave:
 *   - a departure (transfer out, class transfer, dropout, expulsion) voids the
 *     unpaid bills from the Afghan month of the departure on, and sends the
 *     paid ones to refund review;
 *   - «ختم عضویت مالی» in the finance office voids the unpaid bills from the
 *     Afghan month after the stop date on.
 * Both used to count Gregorian months. For each ended membership this lists:
 *   - VOIDED TOO EARLY: bills a rule voided that belong to a month it keeps
 *     (before the departure month, or the billing-stop month itself);
 *   - LEFT OPEN: unpaid bills in the months the rule reaches, still open;
 *   - PAID, NO REFUND CASE: paid bills from the departure month on with no
 *     refund case (departures only).
 * Nothing is changed. A membership whose end date was edited after its bills
 * were voided can show up too: review each line before acting on it.
 *
 * Usage (from backend/):
 *   node scripts/listDepartureBillingMismatches.js
 *   node scripts/listDepartureBillingMismatches.js --uri='mongodb+srv://...' --dns=8.8.8.8,1.1.1.1
 *   node scripts/listDepartureBillingMismatches.js --school=<schoolId> --json
 */
require('dotenv').config({ quiet: true });
const dns = require('dns');
const mongoose = require('mongoose');

const { formatAfghanMonthKeyLabel, toAfghanMonthKey } = require('../utils/afghanDate');

// The void reasons studentLifecycleService writes on a departure, and the end
// reasons it leaves on the membership.
const DEPARTURE_VOID_REASONS = new Set(['transfer_out', 'class_transfer', 'dropout', 'expulsion']);
const DEPARTURE_END_REASONS = new Set(['transferred_out', 'class_transfer', 'dropout', 'expulsion']);
// membershipBillingReconciliationService.BILLING_STOP_VOID_REASON, kept here so
// this read-only script loads no service code.
const BILLING_STOP_VOID_REASON = 'عضویت مالی شاگرد ختم شده است.';

function arg(name) {
  for (const token of process.argv.slice(2)) {
    if (token === `--${name}`) return 'true';
    if (token.startsWith(`--${name}=`)) return token.slice(name.length + 3).trim();
  }
  return '';
}

const day = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
};
const money = (value) => Math.round(Number(value || 0)).toLocaleString('en-US');
const billMonthOf = (doc = {}) => toAfghanMonthKey(doc.dueDate || doc.issuedAt);

function describeDocument(doc = {}, kind = 'bill') {
  const amountDue = Number(doc.amountDue || 0);
  const amountPaid = Number(doc.amountPaid || 0);
  return {
    kind,
    id: String(doc._id || ''),
    number: doc.billNumber || doc.orderNumber || '',
    billMonth: billMonthOf(doc),
    dueDate: day(doc.dueDate),
    status: String(doc.status || ''),
    voidReason: String(doc.voidReason || ''),
    amountDue,
    amountPaid,
    outstanding: Number(doc.outstandingAmount ?? Math.max(0, amountDue - amountPaid))
  };
}

// Sorts one ended membership's bills into what the Afghan-month rules would
// have done differently. `documents` are { doc, kind } rows; `refundedIds`
// holds the ids of bills that already have a refund case.
function classifyMembership({ membership = {}, documents = [], refundedIds = new Set() } = {}) {
  const endMonth = toAfghanMonthKey(membership.endedAt || membership.leftAt);
  const departure = DEPARTURE_END_REASONS.has(String(membership.endedReason || ''))
    || documents.some(({ doc }) => doc.status === 'void' && DEPARTURE_VOID_REASONS.has(String(doc.voidReason || '')));
  const result = { endMonth, rule: departure ? 'departure' : 'billing_stop', voidedTooEarly: [], leftOpen: [], paidWithoutRefund: [] };
  if (!endMonth) return result;

  for (const { doc, kind } of documents) {
    const month = billMonthOf(doc);
    if (!month) continue;
    const reason = String(doc.voidReason || '');
    if (doc.status === 'void') {
      const tooEarly = (DEPARTURE_VOID_REASONS.has(reason) && month < endMonth)
        || (reason === BILLING_STOP_VOID_REASON && month <= endMonth);
      if (tooEarly) result.voidedTooEarly.push(describeDocument(doc, kind));
      continue;
    }
    // A departure reaches its own month; a billing stop keeps the stop month.
    if (departure ? month < endMonth : month <= endMonth) continue;
    const paid = Number(doc.amountPaid || 0) > 0;
    if (!paid && ['new', 'overdue'].includes(String(doc.status || ''))) {
      result.leftOpen.push(describeDocument(doc, kind));
    } else if (paid && departure && !refundedIds.has(String(doc._id))) {
      result.paidWithoutRefund.push(describeDocument(doc, kind));
    }
  }
  return result;
}

async function run() {
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  const FeeOrder = require('../models/FeeOrder');
  const FinanceBill = require('../models/FinanceBill');
  const FinanceRefund = require('../models/FinanceRefund');
  const StudentMembership = require('../models/StudentMembership');
  const User = require('../models/User');
  const { ENDED_STUDENT_MEMBERSHIP_STATUSES } = require('../utils/studentMembershipStatus');

  const uri = arg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = arg('dns');
  if (dnsServers) dns.setServers(dnsServers.split(',').map((item) => item.trim()).filter(Boolean));
  const asJson = arg('json') === 'true';
  const log = asJson ? () => {} : (...parts) => console.log(...parts);
  log(`connecting to: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });

  try {
    const membershipFilter = {
      status: { $in: ENDED_STUDENT_MEMBERSHIP_STATUSES },
      $or: [{ endedAt: { $ne: null } }, { leftAt: { $ne: null } }]
    };
    const schoolId = arg('school');
    if (schoolId) membershipFilter.schoolId = schoolId;
    const memberships = await StudentMembership.find(membershipFilter)
      .select('_id student status endedAt leftAt endedReason schoolId')
      .lean();
    const membershipIds = memberships.map((item) => item._id);

    // FeeOrders mirrored from a FinanceBill are the same bill twice: list the
    // FinanceBill and only the orders that stand on their own.
    const billFields = '_id billNumber orderNumber student studentMembershipId status dueDate issuedAt amountDue amountPaid outstandingAmount voidReason';
    const [bills, orders] = await Promise.all([
      FinanceBill.find({ studentMembershipId: { $in: membershipIds } }).select(billFields).lean(),
      FeeOrder.find({ studentMembershipId: { $in: membershipIds }, sourceBillId: null }).select(billFields).lean()
    ]);
    const documentIds = [...bills, ...orders].map((doc) => doc._id);
    const refunds = await FinanceRefund.find({ $or: [{ bill: { $in: documentIds } }, { feeOrder: { $in: documentIds } }] })
      .select('bill feeOrder')
      .lean();
    const refundedIds = new Set(refunds.flatMap((item) => [item.bill, item.feeOrder]).filter(Boolean).map(String));

    const documentsByMembership = new Map();
    const addDocument = (doc, kind) => {
      const key = String(doc.studentMembershipId || '');
      if (!documentsByMembership.has(key)) documentsByMembership.set(key, []);
      documentsByMembership.get(key).push({ doc, kind });
    };
    bills.forEach((doc) => addDocument(doc, 'bill'));
    orders.forEach((doc) => addDocument(doc, 'order'));

    const rows = memberships
      .map((membership) => ({
        membership,
        ...classifyMembership({
          membership,
          documents: documentsByMembership.get(String(membership._id)) || [],
          refundedIds
        })
      }))
      .filter((row) => row.voidedTooEarly.length || row.leftOpen.length || row.paidWithoutRefund.length);

    const users = await User.find({ _id: { $in: rows.map((row) => row.membership.student).filter(Boolean) } })
      .select('name')
      .lean();
    const nameById = new Map(users.map((user) => [String(user._id), user.name]));

    const sum = (key, field) => rows.reduce((total, row) => total + row[key].reduce((inner, item) => inner + item[field], 0), 0);
    const count = (key) => rows.reduce((total, row) => total + row[key].length, 0);
    const totals = {
      memberships: memberships.length,
      membershipsToReview: rows.length,
      voidedTooEarly: { count: count('voidedTooEarly'), amountDue: sum('voidedTooEarly', 'amountDue') },
      leftOpen: { count: count('leftOpen'), outstanding: sum('leftOpen', 'outstanding') },
      paidWithoutRefund: { count: count('paidWithoutRefund'), amountPaid: sum('paidWithoutRefund', 'amountPaid') }
    };

    if (asJson) {
      console.log(JSON.stringify({
        totals,
        memberships: rows.map((row) => ({
          membershipId: String(row.membership._id),
          studentId: String(row.membership.student || ''),
          studentName: nameById.get(String(row.membership.student || '')) || '',
          status: row.membership.status,
          endedReason: row.membership.endedReason || '',
          endedAt: day(row.membership.endedAt || row.membership.leftAt),
          endMonth: row.endMonth,
          rule: row.rule,
          voidedTooEarly: row.voidedTooEarly,
          leftOpen: row.leftOpen,
          paidWithoutRefund: row.paidWithoutRefund
        }))
      }, null, 2));
      return;
    }

    log(`${totals.memberships} ended membership(s) with an end date; ${totals.membershipsToReview} with bills to review.`);
    const line = (item) => `    ${item.kind} ${item.number || item.id} | ${formatAfghanMonthKeyLabel(item.billMonth)} | due ${item.dueDate} | ${item.status}${item.voidReason ? ` (${item.voidReason})` : ''} | due ${money(item.amountDue)} paid ${money(item.amountPaid)} open ${money(item.outstanding)}`;
    rows.forEach((row) => {
      const monthLabel = formatAfghanMonthKeyLabel(row.endMonth);
      log('');
      log(`${nameById.get(String(row.membership.student || '')) || row.membership.student} (membership ${row.membership._id}, ${row.membership.status}, left ${day(row.membership.endedAt || row.membership.leftAt)} = ${monthLabel}, rule: ${row.rule})`);
      if (row.voidedTooEarly.length) {
        log(`  VOIDED TOO EARLY: bills for months the rule keeps - review restoring them`);
        row.voidedTooEarly.forEach((item) => log(line(item)));
      }
      if (row.leftOpen.length) {
        log(`  LEFT OPEN: unpaid bills ${row.rule === 'departure' ? `from ${monthLabel} on` : `after ${monthLabel}`} - review voiding them`);
        row.leftOpen.forEach((item) => log(line(item)));
      }
      if (row.paidWithoutRefund.length) {
        log(`  PAID, NO REFUND CASE: paid bills from ${monthLabel} on - review a refund`);
        row.paidWithoutRefund.forEach((item) => log(line(item)));
      }
    });
    log('');
    log(`Voided too early: ${totals.voidedTooEarly.count} bill(s), ${money(totals.voidedTooEarly.amountDue)} AFN billed.`);
    log(`Left open: ${totals.leftOpen.count} bill(s), ${money(totals.leftOpen.outstanding)} AFN open.`);
    log(`Paid, no refund case: ${totals.paidWithoutRefund.count} bill(s), ${money(totals.paidWithoutRefund.amountPaid)} AFN paid.`);
    log('Nothing was changed.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error('[audit:departure-billing] failed:', error?.message || error);
    process.exit(1);
  });
}

module.exports = { classifyMembership };
