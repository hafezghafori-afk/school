/**
 * READ-ONLY. Lists every finance month close before (or after) deploying month
 * close by Afghan solar month, and says what the new rules do with each one.
 *
 * What changes on deploy:
 *   - New closes are requested for solar months ("1405-06") only, in order.
 *   - A month is locked from the moment its close is requested, not only once
 *     it is closed: requests still waiting for approval lock their month.
 *   - A reopen is time-boxed. Months reopened before the deploy have no
 *     deadline and stay open until they are closed again.
 *   - Closes stored under a Gregorian key ("2026-09") keep locking exactly the
 *     days they covered, and count toward closing the financial year.
 *
 * Usage (from backend/):
 *   node scripts/listFinanceMonthCloses.js
 *   node scripts/listFinanceMonthCloses.js --uri='mongodb+srv://...' --dns=8.8.8.8,1.1.1.1
 *   node scripts/listFinanceMonthCloses.js --school=<schoolId> --json
 */
require('dotenv').config({ quiet: true });
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const FinanceMonthClose = require('../models/FinanceMonthClose');
const FinancialYear = require('../models/FinancialYear');
const {
  formatMonthCloseLabel,
  isWindowCovered,
  listFinancialYearMonthKeys,
  readCloseWindow,
  resolveMonthCloseCalendar,
  resolveMonthCloseLock,
  resolveMonthCloseWindow
} = require('../utils/financeMonthClosePeriods');

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

// What the new rules mean for one record, in one line.
function describeRecord(record, now) {
  const calendar = resolveMonthCloseCalendar(record.monthKey);
  const status = String(record.status || '');
  const lock = resolveMonthCloseLock(record, now);
  const notes = [];
  if (calendar === 'gregorian') notes.push('Gregorian key: keeps locking the days it covers');
  if (!calendar) notes.push('UNRECOGNISED KEY: not a solar or Gregorian month');
  if (!record.closeWindow?.startAt) notes.push('no stored window: guarded by its Gregorian month');
  if (status === 'pending_review') notes.push('waiting for approval: its month is LOCKED from deploy until it is approved or rejected');
  if (status === 'reopened' && !record.reopenDeadline) notes.push('reopened with no deadline: stays open until closed again');
  if (status === 'reopened' && lock.reason === 'reopen_expired') notes.push('reopen deadline passed: locked');
  if (status === 'rejected' && calendar === 'gregorian') notes.push('rejected Gregorian request: close the solar months instead');
  if (record.needsReview) notes.push('marked for review');
  return { calendar: calendar || 'invalid', locked: lock.locked, lockReason: lock.reason, notes };
}

async function run() {
  const uri = arg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = arg('dns');
  if (dnsServers) dns.setServers(dnsServers.split(',').map((item) => item.trim()).filter(Boolean));
  const asJson = arg('json') === 'true';
  const log = asJson ? () => {} : (...parts) => console.log(...parts);
  log(`connecting to: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });

  try {
    const filter = {};
    const schoolId = arg('school');
    if (schoolId) filter.schoolId = schoolId;
    const [records, years] = await Promise.all([
      FinanceMonthClose.find(filter)
        .select('schoolId financialYearId monthKey status approvalStage closeWindow closedAt requestedAt reopenedAt reopenDeadline needsReview')
        .sort({ schoolId: 1, financialYearId: 1, 'closeWindow.startAt': 1, monthKey: 1 })
        .lean(),
      FinancialYear.find(schoolId ? { schoolId } : {})
        .select('schoolId title startDate endDate isClosed status')
        .lean()
    ]);
    const yearsById = new Map(years.map((year) => [String(year._id), year]));
    const now = new Date();
    const groups = new Map();
    records.forEach((record) => {
      const key = `${record.schoolId || '-'}|${record.financialYearId || '-'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });

    const report = [];
    const totals = { records: records.length, pendingReview: 0, reopenedWithoutDeadline: 0, gregorian: 0, invalid: 0 };
    for (const [key, rows] of groups) {
      const [groupSchoolId, financialYearId] = key.split('|');
      const year = yearsById.get(financialYearId) || null;
      const closedWindows = rows.filter((row) => row.status === 'closed').map(readCloseWindow).filter(Boolean);
      const solarMonths = year
        ? listFinancialYearMonthKeys(year).map((monthKey) => ({
            monthKey,
            closed: isWindowCovered(resolveMonthCloseWindow(monthKey, year), closedWindows),
            hasOwnClose: rows.some((row) => row.monthKey === monthKey && row.status === 'closed')
          }))
        : [];
      const items = rows.map((row) => {
        const described = describeRecord(row, now);
        if (row.status === 'pending_review') totals.pendingReview += 1;
        if (row.status === 'reopened' && !row.reopenDeadline) totals.reopenedWithoutDeadline += 1;
        if (described.calendar === 'gregorian') totals.gregorian += 1;
        if (described.calendar === 'invalid') totals.invalid += 1;
        const window = readCloseWindow(row);
        return {
          id: String(row._id),
          monthKey: row.monthKey,
          label: formatMonthCloseLabel(row),
          status: row.status,
          approvalStage: row.approvalStage,
          window: window ? { startAt: window.startAt, endAt: window.endAt } : null,
          closedAt: row.closedAt || null,
          reopenDeadline: row.reopenDeadline || null,
          ...described
        };
      });
      report.push({
        schoolId: groupSchoolId,
        financialYearId,
        financialYear: year ? { title: year.title, startDate: year.startDate, endDate: year.endDate, closed: year.isClosed === true || year.status === 'closed' } : null,
        items,
        solarMonths,
        nextSolarMonthToClose: solarMonths.find((month) => !month.closed)?.monthKey || ''
      });
    }

    if (asJson) {
      console.log(JSON.stringify({ generatedAt: now.toISOString(), totals, groups: report }, null, 2));
      return;
    }

    report.forEach((group) => {
      log(`\n=== school ${group.schoolId} | financial year ${group.financialYear?.title || group.financialYearId}`
        + `${group.financialYear ? ` (${day(group.financialYear.startDate)} .. ${day(group.financialYear.endDate)})${group.financialYear.closed ? ' CLOSED' : ''}` : ' (not found)'}`);
      group.items.forEach((item) => {
        log(`  ${item.monthKey.padEnd(8)} ${String(item.status).padEnd(15)} ${String(item.approvalStage || '').padEnd(25)}`
          + ` ${item.window ? `${day(item.window.startAt)}..${day(item.window.endAt)}` : 'no window'}`
          + `${item.locked ? `  [locked: ${item.lockReason}]` : ''}`);
        log(`           ${item.label}`);
        item.notes.forEach((note) => log(`           - ${note}`));
      });
      if (group.solarMonths.length) {
        const closed = group.solarMonths.filter((month) => month.closed);
        log(`  solar months closed: ${closed.length}/${group.solarMonths.length}`
          + `${closed.some((month) => !month.hasOwnClose) ? ' (some only through Gregorian closes)' : ''}`);
        log(`  next solar month to close: ${group.nextSolarMonthToClose || '(all closed)'}`);
      }
    });
    log(`\nrecords: ${totals.records} | waiting for approval (will lock their month): ${totals.pendingReview}`
      + ` | reopened without deadline: ${totals.reopenedWithoutDeadline} | Gregorian keys: ${totals.gregorian}`
      + `${totals.invalid ? ` | UNRECOGNISED keys: ${totals.invalid}` : ''}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[listFinanceMonthCloses] failed:', error?.message || error);
  process.exit(1);
});
