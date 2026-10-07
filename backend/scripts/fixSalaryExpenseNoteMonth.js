/**
 * ماهِ میلادیِ یادداشتِ مصارفِ معاش را به ماهِ شمسی برمی‌گرداند.
 *
 * مشکل: «پرداختِ معاش» هنگامِ تاییدِ نهایی مصرفی می‌سازد که یادداشتش با
 *   StaffSalaryPayment.period شروع می‌شد — یک ماهِ میلادی («معاشِ 2026-09 — …»).
 *   همه‌جای سیستم (و گزارشِ مالیِ یکپارچه) ماهِ شمسی نشان می‌دهد؛ مصارفِ تازه از این
 *   به بعد «معاشِ سنبله ۱۴۰۵ — …» می‌نویسند و این اسکریپت ردیف‌های قدیمی را هم‌شکل می‌کند.
 *
 * چه می‌کند: هر ExpenseEntry با referenceNo = staff_salary:<paymentId> که یادداشتش با
 *   «معاشِ YYYY-MM» شروع می‌شود؛ ماهِ شمسی از paymentDateِ همان پرداخت (و اگر پرداخت
 *   پیدا نشد از expenseDate) ساخته می‌شود — همان قاعدهٔ کدِ اصلی. فقط اگر ماهِ میلادیِ
 *   یادداشت با همان تاریخ جور باشد عوض می‌شود؛ بقیهٔ یادداشت دست نمی‌خورد. برای هر
 *   ردیفِ تغییریافته یک revision از نوعِ system_fix ثبت می‌شود.
 *
 * چه چیزی هرگز لمس نمی‌شود: هر فیلدی جز note. ردیفِ دارای «درخواستِ اصلاحِ» باز رد
 *   می‌شود؛ سال‌های مالیِ بسته فقط گزارش می‌شوند (با --include-closed اصلاح می‌شوند).
 *
 * پیش‌فرض DRY-RUN است. برای نوشتن: --apply (پیش از نوشتن از ردیف‌ها بکاپ می‌گیرد).
 * فقط با --uri صریح به دیتابیسِ غیرِ .env وصل می‌شود.
 *
 *   node backend/scripts/fixSalaryExpenseNoteMonth.js                     # گزارش، بدون تغییر
 *   node backend/scripts/fixSalaryExpenseNoteMonth.js --apply             # اعمال
 *   node backend/scripts/fixSalaryExpenseNoteMonth.js --school=<id>       # فقط یک مکتب
 *   node backend/scripts/fixSalaryExpenseNoteMonth.js --uri="..." --dns=8.8.8.8   # Atlas
 */
const fs = require('fs');
const path = require('path');
// Load backend/.env regardless of the cwd the script is launched from.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const ExpenseEntry = require('../models/ExpenseEntry');
const FinancialYear = require('../models/FinancialYear');
const StaffSalaryPayment = require('../models/StaffSalaryPayment');
const { SALARY_EXPENSE_REFERENCE_PREFIX } = require('../services/expenseCorrectionService');
const { formatAfghanMonthKeyLabel, toAfghanMonthKey } = require('../utils/afghanDate');

const argv = process.argv.slice(2);
const readArg = (name, fallback = '') => {
  for (let i = 0; i < argv.length; i += 1) {
    const t = String(argv[i] || '');
    if (t === `--${name}`) return String(argv[i + 1] ?? '').trim();
    if (t.startsWith(`--${name}=`)) return t.slice(name.length + 3).trim();
  }
  return fallback;
};
const hasFlag = (name) => argv.includes(`--${name}`);

const escapeRegex = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const dayOf = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
// The generator's period: Gregorian YYYY-MM of the payment date (financeRoutes monthKeyOf).
const gregorianMonthOf = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const NOTE_PREFIX_RE = /^معاشِ (\d{4})-(\d{2})(?=\s|$)/;
const REVISION_REASON = 'fixSalaryExpenseNoteMonth: یادداشتِ مصرفِ معاش ماهِ میلادی داشت؛ به ماهِ شمسیِ تاریخِ پرداخت برگردانده شد.';

async function run() {
  const APPLY = hasFlag('apply');
  const includeClosed = hasFlag('include-closed');
  const schoolFilter = readArg('school');
  const uri = readArg('uri') || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = readArg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`DNS: ${dns.getServers().join(', ')}`);
  }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${includeClosed ? ' +include-closed' : ''}  |  zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n`);

  const filter = {
    referenceNo: { $regex: `^${escapeRegex(SALARY_EXPENSE_REFERENCE_PREFIX)}` },
    note: { $regex: '^معاشِ \\d{4}-\\d{2}' }
  };
  if (schoolFilter) filter.schoolId = schoolFilter;
  const entries = await ExpenseEntry.find(filter)
    .select('_id schoolId financialYearId amount expenseDate status referenceNo vendorName note correction')
    .sort({ expenseDate: 1 })
    .lean();

  const paymentIdOf = (entry) => String(entry.referenceNo || '').slice(SALARY_EXPENSE_REFERENCE_PREFIX.length).trim();
  const paymentIds = entries.map(paymentIdOf).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const payments = entries.length
    ? await StaffSalaryPayment.find({
        $or: [
          { _id: { $in: paymentIds } },
          { salaryExpenseId: { $in: entries.map((entry) => entry._id) } }
        ]
      }).select('_id salaryExpenseId paymentDate period').lean()
    : [];
  const paymentById = new Map(payments.map((payment) => [String(payment._id), payment]));
  const paymentByExpenseId = new Map(
    payments.filter((payment) => payment.salaryExpenseId).map((payment) => [String(payment.salaryExpenseId), payment])
  );

  const yearIds = [...new Set(entries.map((entry) => String(entry.financialYearId || '')).filter(Boolean))];
  const years = yearIds.length
    ? await FinancialYear.find({ _id: { $in: yearIds } }).select('_id title isClosed status').lean()
    : [];
  const yearById = new Map(years.map((year) => [String(year._id), year]));

  const report = {
    mode: APPLY ? 'APPLY' : 'DRY-RUN',
    scanned: entries.length,
    toFix: 0,
    fixed: 0,
    skippedMonthMismatch: 0,
    skippedClosedYear: 0,
    skippedOpenCorrection: 0,
    withoutSalaryPayment: 0
  };
  const rows = [];
  const plans = [];

  for (const entry of entries) {
    const payment = paymentByExpenseId.get(String(entry._id)) || paymentById.get(paymentIdOf(entry)) || null;
    if (!payment) report.withoutSalaryPayment += 1;
    const sourceDate = payment?.paymentDate || entry.expenseDate;
    const match = NOTE_PREFIX_RE.exec(String(entry.note || ''));
    const noteMonth = match ? `${match[1]}-${match[2]}` : '';
    const solarLabel = formatAfghanMonthKeyLabel(toAfghanMonthKey(sourceDate));
    const nextNote = solarLabel ? String(entry.note).replace(NOTE_PREFIX_RE, `معاشِ ${solarLabel}`) : '';

    const year = yearById.get(String(entry.financialYearId || ''));
    const closedYear = Boolean(year?.isClosed) || String(year?.status || '') === 'closed';
    const row = {
      id: String(entry._id),
      paymentDate: dayOf(sourceDate),
      amount: round2(entry.amount),
      staff: entry.vendorName || '—',
      from: noteMonth,
      to: solarLabel || '—',
      financialYear: year?.title || String(entry.financialYearId || ''),
      action: 'fix'
    };

    // The note's Gregorian month must be the payment date's own month - anything
    // else means the row was hand-edited and is left for a person to read.
    if (!solarLabel || noteMonth !== gregorianMonthOf(sourceDate)) {
      report.skippedMonthMismatch += 1;
      rows.push({ ...row, action: `skip: note month ${noteMonth} ≠ payment month ${gregorianMonthOf(sourceDate) || '—'}` });
      continue;
    }
    if (entry.correction) {
      report.skippedOpenCorrection += 1;
      rows.push({ ...row, action: 'skip: open correction' });
      continue;
    }
    if (closedYear && !includeClosed) {
      report.skippedClosedYear += 1;
      rows.push({ ...row, action: 'skip: closed financial year' });
      continue;
    }

    report.toFix += 1;
    rows.push(row);
    plans.push({ entry, nextNote });
  }

  if (APPLY && plans.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'backups', `${stamp}-pre-salary-expense-note-month`);
    fs.mkdirSync(backupDir, { recursive: true });
    const originals = await ExpenseEntry.find({ _id: { $in: plans.map((plan) => plan.entry._id) } }).lean();
    fs.writeFileSync(
      path.join(backupDir, 'expenseentries.jsonl'),
      `${originals.map((doc) => JSON.stringify(doc)).join('\n')}\n`,
      'utf8'
    );
    console.log(`backup: ${backupDir} (${originals.length} rows)\n`);

    const now = new Date();
    const operations = plans.map(({ entry, nextNote }) => ({
      updateOne: {
        // Only rewrite the note that was inspected above.
        filter: { _id: entry._id, note: entry.note },
        update: {
          $set: { note: nextNote },
          $push: {
            revisions: {
              kind: 'system_fix',
              at: now,
              by: null,
              requestedBy: null,
              reason: REVISION_REASON,
              statusBefore: String(entry.status || ''),
              changes: [{ field: 'note', from: entry.note, to: nextNote }]
            }
          }
        }
      }
    }));
    const result = await ExpenseEntry.bulkWrite(operations, { ordered: false });
    report.fixed = Number(result.modifiedCount || 0);
  }

  rows.forEach((row) => console.log(JSON.stringify(row)));
  if (rows.length) console.log('');
  console.log(JSON.stringify(report, null, 2));
  if (!APPLY && report.toFix) console.log('\nبرای اعمالِ تغییرات: --apply');
}

run()
  .catch((error) => {
    console.error(`fixSalaryExpenseNoteMonth failed: ${error?.userMessage || error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
