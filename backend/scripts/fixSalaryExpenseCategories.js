/**
 * اصلاحِ سرفصلِ مصارفی که «پرداختِ معاش» هنگامِ تاییدِ نهایی خودکار ساخته است.
 *
 * مشکل: پس از مهاجرتِ چارتِ مصارف (PR #97) کلیدهای قدیمیِ salary / other غیرفعال
 *   شدند، ولی resolveSalaryExpenseCategory هنوز همان‌ها را امتحان می‌کرد و در نهایت
 *   بی‌صدا `other` برمی‌گرداند. این مصارف از جمعِ «معاشات و مزایا» و «بودجه در برابر
 *   عملکرد» بیرون افتادند و چون مصارفِ معاش در رابط قفل‌اند، دستی اصلاح نمی‌شوند.
 *
 * چه می‌کند: هر ExpenseEntry با referenceNo = staff_salary:<paymentId> را پیدا
 *   می‌کند، «سمتِ» گیرنده را از StaffSalaryPayment.staffSnapshot.position می‌خواند و
 *   سرفصل/زیرسرفصل را با همان قاعدهٔ کدِ اصلی (resolveSalaryExpenseCategory) تعیین
 *   می‌کند. برای هر ردیفِ تغییریافته یک revision از نوعِ system_fix ثبت می‌شود.
 *
 * چه چیزی هرگز لمس نمی‌شود: amount / status / approvalStage / approvedBy /
 *   approvalTrail / treasuryAccountId / expenseDate. سال‌های مالیِ بسته فقط گزارش
 *   می‌شوند (با --include-closed اصلاح می‌شوند).
 *
 * پیش‌فرض DRY-RUN است. برای نوشتن: --apply (پیش از نوشتن از ردیف‌ها بکاپ می‌گیرد).
 * فقط با --uri صریح به دیتابیسِ غیرِ .env وصل می‌شود.
 *
 *   node backend/scripts/fixSalaryExpenseCategories.js                     # گزارش، بدون تغییر
 *   node backend/scripts/fixSalaryExpenseCategories.js --apply             # اعمال
 *   node backend/scripts/fixSalaryExpenseCategories.js --school=<id>       # فقط یک مکتب
 *   node backend/scripts/fixSalaryExpenseCategories.js --apply --include-closed
 *   node backend/scripts/fixSalaryExpenseCategories.js --uri="..." --dns=8.8.8.8   # Atlas
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
const ExpenseCategoryDefinition = require('../models/ExpenseCategoryDefinition');
const FinancialYear = require('../models/FinancialYear');
const StaffSalaryPayment = require('../models/StaffSalaryPayment');
const { SALARY_EXPENSE_REFERENCE_PREFIX } = require('../services/expenseCorrectionService');
const { resolveSalaryExpenseCategory } = require('../services/staffAdvanceService');

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

const REVISION_REASON = 'fixSalaryExpenseCategories: مصرفِ معاش زیرِ سرفصلِ غیرفعالِ قدیمی ثبت شده بود؛ طبقِ «سمتِ» کارمند به «معاشات و مزایا» منتقل شد.';

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
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${includeClosed ? ' +include-closed' : ''}\n`);

  // The resolver seeds the registry when it is empty; that would be a write, and
  // a database without a registry has nothing to repair anyway.
  if (!(await ExpenseCategoryDefinition.countDocuments({}))) {
    throw new Error('expense category registry is empty — nothing to repair on this database');
  }

  const filter = { referenceNo: { $regex: `^${escapeRegex(SALARY_EXPENSE_REFERENCE_PREFIX)}` } };
  if (schoolFilter) filter.schoolId = schoolFilter;
  const entries = await ExpenseEntry.find(filter)
    .select('_id schoolId financialYearId category subCategory amount expenseDate status referenceNo vendorName correction')
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
      }).select('_id salaryExpenseId staffSnapshot period').lean()
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

  const targetByPosition = new Map();
  const resolveTarget = async (position) => {
    if (!targetByPosition.has(position)) targetByPosition.set(position, await resolveSalaryExpenseCategory(position));
    return targetByPosition.get(position);
  };

  const report = {
    mode: APPLY ? 'APPLY' : 'DRY-RUN',
    scanned: entries.length,
    alreadyCorrect: 0,
    toFix: 0,
    toFixAmount: 0,
    fixed: 0,
    skippedClosedYear: 0,
    skippedOpenCorrection: 0,
    withoutSalaryPayment: 0
  };
  const rows = [];
  const plans = [];

  for (const entry of entries) {
    const payment = paymentByExpenseId.get(String(entry._id)) || paymentById.get(paymentIdOf(entry)) || null;
    if (!payment) report.withoutSalaryPayment += 1;
    const position = String(payment?.staffSnapshot?.position || '').trim();
    // eslint-disable-next-line no-await-in-loop
    const target = await resolveTarget(position);
    const fromCategory = String(entry.category || '');
    const fromSubCategory = String(entry.subCategory || '');
    if (fromCategory === target.category && fromSubCategory === target.subCategory) {
      report.alreadyCorrect += 1;
      continue;
    }

    const year = yearById.get(String(entry.financialYearId || ''));
    const closedYear = Boolean(year?.isClosed) || String(year?.status || '') === 'closed';
    const row = {
      id: String(entry._id),
      expenseDate: dayOf(entry.expenseDate),
      amount: round2(entry.amount),
      staff: payment?.staffSnapshot?.name || entry.vendorName || '—',
      position: position || '—',
      from: `${fromCategory || '—'}/${fromSubCategory || '—'}`,
      to: `${target.category}/${target.subCategory || '—'}`,
      financialYear: year?.title || String(entry.financialYearId || ''),
      action: 'fix'
    };

    // Salary expenses are locked from edits, so this should never happen; never
    // rewrite a row whose values are waiting on an approval chain.
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
    report.toFixAmount = round2(report.toFixAmount + Number(entry.amount || 0));
    rows.push(row);
    plans.push({ entry, target, fromCategory, fromSubCategory });
  }

  if (APPLY && plans.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'backups', `${stamp}-pre-salary-expense-category`);
    fs.mkdirSync(backupDir, { recursive: true });
    const originals = await ExpenseEntry.find({ _id: { $in: plans.map((plan) => plan.entry._id) } }).lean();
    fs.writeFileSync(
      path.join(backupDir, 'expenseentries.jsonl'),
      `${originals.map((doc) => JSON.stringify(doc)).join('\n')}\n`,
      'utf8'
    );
    console.log(`backup: ${backupDir} (${originals.length} rows)\n`);

    const now = new Date();
    const operations = plans.map(({ entry, target, fromCategory, fromSubCategory }) => {
      const changes = [];
      if (fromCategory !== target.category) changes.push({ field: 'category', from: fromCategory, to: target.category });
      if (fromSubCategory !== target.subCategory) changes.push({ field: 'subCategory', from: fromSubCategory, to: target.subCategory });
      return {
        updateOne: {
          // Only rewrite the values that were inspected above.
          filter: { _id: entry._id, category: entry.category, subCategory: entry.subCategory },
          update: {
            $set: {
              category: target.category,
              subCategory: target.subCategory,
              needsCategoryReview: false
            },
            $push: {
              revisions: {
                kind: 'system_fix',
                at: now,
                by: null,
                requestedBy: null,
                reason: REVISION_REASON,
                statusBefore: String(entry.status || ''),
                changes
              }
            }
          }
        }
      };
    });
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
    console.error(`fixSalaryExpenseCategories failed: ${error?.userMessage || error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
