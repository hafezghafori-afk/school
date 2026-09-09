/**
 * مهاجرتِ مصارفِ مکتبِ اصلی به «چارتِ واحدِ مصارف» (config/expenseChart.js).
 *
 * چه می‌کند:
 *   ۱. رجیستریِ ExpenseCategoryDefinition را با ۸ سرفصلِ جدید + `unclassified`
 *      همگام می‌کند؛ کلیدهای سیستمیِ قدیمی (salary/admin/...) غیرفعال می‌شوند
 *      (حذف نمی‌شوند). دسته‌های دلخواهِ ادمین دست‌نخورده می‌مانند.
 *   ۲. هر ExpenseEntry: کلیدِ category/subCategory را طبق جدولِ نگاشت و aliasهای
 *      رجیستری به کلیدِ جدید بازنویسی می‌کند. رشته‌های ناشناخته → `unclassified`
 *      با پرچمِ needsCategoryReview=true و legacyCategory=<رشتهٔ خام>.
 *   ۳. سال‌های مالیِ بسته: category دست‌نخورده می‌ماند؛ فقط یک alias روی سرفصلِ
 *      هدف ثبت می‌شود تا در گزارش‌ها زیرِ سرفصلِ جدید تا بخورد. (--include-closed
 *      این رفتار را لغو می‌کند و بازنویسیِ درجا انجام می‌دهد.)
 *   ۴. FinancialYear.budgetTargets.categoryBudgets و FinanceProcurementCommitment
 *      هم برای سال‌های باز نگاشت می‌شوند.
 *
 * چه چیزی هرگز لمس نمی‌شود: status / approvalStage / approvedBy / approvedAt /
 *   approvalTrail / amount / treasuryAccountId / procurementCommitmentId.
 *   هیچ رکوردِ تاییدشده‌ای دوباره وارد صفِ تایید نمی‌شود.
 *
 * پیش‌فرض DRY-RUN است. برای نوشتن: --apply
 *
 *   node backend/scripts/migrateExpenseChart.js                       # گزارش، بدون تغییر
 *   node backend/scripts/migrateExpenseChart.js --apply               # اعمال
 *   node backend/scripts/migrateExpenseChart.js --school=<id>         # فقط یک مکتب
 *   node backend/scripts/migrateExpenseChart.js --apply --include-closed
 *   node backend/scripts/migrateExpenseChart.js --uri="..." --dns=8.8.8.8   # Atlas
 */
const fs = require('fs');
const path = require('path');
// Load backend/.env regardless of the cwd the script is launched from
// (running it from the repo root otherwise silently misses MONGO_URI).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const ExpenseEntry = require('../models/ExpenseEntry');
const ExpenseCategoryDefinition = require('../models/ExpenseCategoryDefinition');
const FinancialYear = require('../models/FinancialYear');
const FinanceProcurementCommitment = require('../models/FinanceProcurementCommitment');
const {
  EXPENSE_CHART_KEYS,
  UNCLASSIFIED_KEY,
  UNCLASSIFIED_SUBCATEGORY,
  normalizeKeyPart,
  resolveLegacyExpenseCategory
} = require('../config/expenseChart');
const { syncExpenseChartDefinitions } = require('../services/expenseGovernanceService');

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

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** جدولِ نگاشت + aliasهای رجیستری را با هم بررسی می‌کند. */
function buildResolver(registryDocs) {
  const aliasMap = new Map();
  registryDocs.forEach((doc) => {
    (doc.aliases || []).forEach((alias) => {
      const value = String(alias?.value || '').trim().toLowerCase();
      if (value && !aliasMap.has(value)) {
        aliasMap.set(value, { category: doc.key, subCategory: String(alias?.subCategory || '') });
      }
    });
  });

  return (rawCategory = '', rawSubCategory = '') => {
    const catPart = normalizeKeyPart(rawCategory);
    const aliasHit = aliasMap.get(catPart);
    if (aliasHit && EXPENSE_CHART_KEYS.has(aliasHit.category) && aliasHit.category !== UNCLASSIFIED_KEY) {
      return { category: aliasHit.category, subCategory: aliasHit.subCategory || '', matched: true, confident: true, via: 'alias' };
    }
    const mapped = resolveLegacyExpenseCategory(rawCategory, rawSubCategory);
    return { ...mapped, via: mapped.matched ? 'map' : 'none' };
  };
}

async function backupCollections(dir, filters) {
  fs.mkdirSync(dir, { recursive: true });
  const dump = async (name, Model, filter) => {
    const rows = await Model.find(filter).lean();
    fs.writeFileSync(
      path.join(dir, `${name}.jsonl`),
      rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''),
      'utf8'
    );
    return rows.length;
  };
  return {
    expenseentries: await dump('expenseentries', ExpenseEntry, filters.expense),
    expensecategorydefinitions: await dump('expensecategorydefinitions', ExpenseCategoryDefinition, {}),
    financialyears: await dump('financialyears', FinancialYear, filters.year),
    financeprocurementcommitments: await dump('financeprocurementcommitments', FinanceProcurementCommitment, filters.expense)
  };
}

async function run() {
  const APPLY = hasFlag('apply');
  const includeClosed = hasFlag('include-closed');
  const schoolFilter = readArg('school');
  const uri = readArg('uri')
    || process.env.PROD_MONGO_URI
    || process.env.MONGO_URI
    || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = readArg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`DNS: ${dns.getServers().join(', ')}`);
  }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${includeClosed ? ' +include-closed' : ''}\n`);

  const expenseFilter = schoolFilter ? { schoolId: schoolFilter } : {};
  const yearFilter = schoolFilter ? { schoolId: schoolFilter } : {};

  // ---- بکاپ (پیش از هر نوشتنی) ----
  if (APPLY) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'backups', `${stamp}-pre-expense-chart`);
    const counts = await backupCollections(backupDir, { expense: expenseFilter, year: yearFilter });
    console.log(`backup: ${backupDir}`);
    console.log(`backup rows: ${JSON.stringify(counts)}\n`);
  }

  // ---- ۱. رجیستری ----
  let syncSummary = null;
  if (APPLY) {
    syncSummary = await syncExpenseChartDefinitions();
    console.log('registry sync:', JSON.stringify(syncSummary));
  } else {
    const existing = await ExpenseCategoryDefinition.find({}).select('key isSystem isActive').lean();
    const keys = new Set(existing.map((item) => item.key));
    syncSummary = {
      wouldInsert: [...EXPENSE_CHART_KEYS].filter((key) => !keys.has(key)),
      wouldDeactivateLegacy: existing
        .filter((item) => item.isSystem && item.isActive && !EXPENSE_CHART_KEYS.has(item.key))
        .map((item) => item.key)
    };
    console.log('registry sync (dry):', JSON.stringify(syncSummary));
  }

  const registryDocs = await ExpenseCategoryDefinition.find({}).lean();
  const resolve = buildResolver(registryDocs);
  // نگاشتِ کلیدِ سرفصل → _id رجیستری برای درجِ alias.
  const registryIdByKey = new Map(registryDocs.map((doc) => [doc.key, doc._id]));
  const aliasQueue = new Map(); // targetKey -> Map(value -> subCategory)
  const queueAlias = (targetKey, value, subCategory) => {
    const v = String(value || '').trim().toLowerCase();
    if (!v || !EXPENSE_CHART_KEYS.has(targetKey)) return;
    const already = (registryDocs.find((d) => d.key === targetKey)?.aliases || []).some((a) => a.value === v);
    if (already) return;
    if (!aliasQueue.has(targetKey)) aliasQueue.set(targetKey, new Map());
    if (!aliasQueue.get(targetKey).has(v)) aliasQueue.get(targetKey).set(v, subCategory || '');
  };

  // ---- سال‌های مالی: باز یا بسته ----
  const years = await FinancialYear.find(yearFilter).select('_id isClosed status budgetTargets').lean();
  const yearClosed = new Map(years.map((y) => [String(y._id), Boolean(y.isClosed) || y.status === 'closed']));

  // ---- ۲. ExpenseEntry ----
  const entries = await ExpenseEntry.find(expenseFilter)
    .select('_id schoolId financialYearId category subCategory legacyCategory needsCategoryReview status amount')
    .lean();

  const report = {
    mode: APPLY ? 'APPLY' : 'DRY-RUN',
    includeClosed,
    expense: {
      scanned: entries.length,
      alreadyOnChart: 0,
      remapped: 0,
      remappedLowConfidence: 0,
      closedYearAliasedOnly: 0,
      unclassified: 0
    },
    unresolvedGroups: {}, // legacyValue -> { count, amount, samples:Set }
    lowConfidenceGroups: {}, // "old -> new" -> count
    budgetYearsUpdated: 0,
    budgetBucketsRemapped: 0,
    procurementScanned: 0,
    procurementRemapped: 0,
    deactivatedOrphanCategories: []
  };

  // کلیدهایی که پس از مهاجرت هنوز از سوی یک ExpenseEntry ارجاع می‌شوند.
  const postMigrationCategoryKeys = new Set();
  const bulk = [];
  for (const row of entries) {
    const rawCat = String(row.category || '');
    const rawSub = String(row.subCategory || '');
    const catPart = normalizeKeyPart(rawCat);
    const res = resolve(rawCat, rawSub);
    const isClosed = yearClosed.get(String(row.financialYearId || '')) === true;

    // از قبل روی چارتِ جدید و سالم؟
    const alreadyClean = EXPENSE_CHART_KEYS.has(catPart)
      && catPart !== UNCLASSIFIED_KEY
      && row.needsCategoryReview !== true
      && catPart === res.category;
    if (alreadyClean) {
      report.expense.alreadyOnChart += 1;
      postMigrationCategoryKeys.add(catPart);
      continue;
    }

    if (!res.matched) {
      report.expense.unclassified += 1;
      postMigrationCategoryKeys.add(UNCLASSIFIED_KEY);
      const g = report.unresolvedGroups[catPart] || { count: 0, amount: 0, samples: new Set() };
      g.count += 1;
      g.amount = round2(g.amount + Number(row.amount || 0));
      if (rawSub && g.samples.size < 5) g.samples.add(rawSub);
      report.unresolvedGroups[catPart] = g;
      if (APPLY) {
        bulk.push({
          updateOne: {
            filter: { _id: row._id },
            update: {
              $set: {
                category: UNCLASSIFIED_KEY,
                subCategory: UNCLASSIFIED_SUBCATEGORY,
                legacyCategory: catPart,
                needsCategoryReview: true
              }
            }
          }
        });
      }
      continue;
    }

    if (!res.confident) {
      const label = `${catPart || '—'} → ${res.category}${res.subCategory ? `/${res.subCategory}` : ''}`;
      report.lowConfidenceGroups[label] = (report.lowConfidenceGroups[label] || 0) + 1;
      report.expense.remappedLowConfidence += 1;
    }

    if (isClosed && !includeClosed) {
      // بازنویسی نکن؛ فقط alias بساز تا گزارش‌ها تا بزنند.
      queueAlias(res.category, catPart, res.subCategory);
      report.expense.closedYearAliasedOnly += 1;
      postMigrationCategoryKeys.add(catPart);
      continue;
    }

    report.expense.remapped += 1;
    postMigrationCategoryKeys.add(res.category);
    if (APPLY) {
      bulk.push({
        updateOne: {
          filter: { _id: row._id },
          update: {
            $set: {
              category: res.category,
              subCategory: res.subCategory || '',
              legacyCategory: catPart,
              needsCategoryReview: false
            }
          }
        }
      });
    }
  }

  if (APPLY && bulk.length) {
    for (let i = 0; i < bulk.length; i += 500) {
      await ExpenseEntry.bulkWrite(bulk.slice(i, i + 500), { ordered: false });
    }
  }

  // ---- ۳. درجِ aliasها روی رجیستری ----
  if (APPLY && aliasQueue.size) {
    for (const [targetKey, valueMap] of aliasQueue.entries()) {
      const id = registryIdByKey.get(targetKey);
      if (!id) continue;
      const additions = [...valueMap.entries()].map(([value, subCategory]) => ({ value, subCategory }));
      await ExpenseCategoryDefinition.updateOne(
        { _id: id },
        { $push: { aliases: { $each: additions } } }
      );
    }
  }
  report.aliasesQueued = [...aliasQueue.entries()].map(([key, m]) => ({ target: key, values: [...m.keys()] }));

  // ---- ۴. بودجهٔ سرفصلی (فقط سال‌های باز) ----
  for (const year of years) {
    if (yearClosed.get(String(year._id)) === true) continue;
    const buckets = Array.isArray(year.budgetTargets?.categoryBudgets) ? year.budgetTargets.categoryBudgets : [];
    if (!buckets.length) continue;
    const merged = new Map();
    let changed = false;
    for (const bucket of buckets) {
      const oldKey = normalizeKeyPart(bucket.categoryKey);
      const res = resolve(oldKey, '');
      const newKey = res.matched ? res.category : oldKey;
      if (newKey !== oldKey) changed = true;
      const prev = merged.get(newKey) || { categoryKey: newKey, label: bucket.label || newKey, annualBudget: 0, monthlyBudget: 0, alertThresholdPercent: 85 };
      prev.annualBudget = round2(prev.annualBudget + Number(bucket.annualBudget || 0));
      prev.monthlyBudget = round2(prev.monthlyBudget + Number(bucket.monthlyBudget || 0));
      prev.alertThresholdPercent = Math.max(prev.alertThresholdPercent, Number(bucket.alertThresholdPercent || 85));
      if (merged.has(newKey)) changed = true; // دو باکت در یکی ادغام شد
      merged.set(newKey, prev);
    }
    if (!changed) continue;
    report.budgetYearsUpdated += 1;
    report.budgetBucketsRemapped += buckets.length;
    if (APPLY) {
      await FinancialYear.updateOne(
        { _id: year._id },
        { $set: { 'budgetTargets.categoryBudgets': [...merged.values()] } }
      );
    }
  }

  // ---- ۵. تعهدهای خرید (فقط سال‌های باز، وضعیتِ غیرِنهایی) ----
  const commitments = await FinanceProcurementCommitment.find(expenseFilter)
    .select('_id financialYearId category subCategory status')
    .lean();
  const commitmentBulk = [];
  for (const c of commitments) {
    report.procurementScanned += 1;
    if (['rejected', 'cancelled'].includes(String(c.status || ''))) continue;
    if (yearClosed.get(String(c.financialYearId || '')) === true && !includeClosed) continue;
    const catPart = normalizeKeyPart(c.category);
    if (EXPENSE_CHART_KEYS.has(catPart) && catPart !== UNCLASSIFIED_KEY) continue;
    const res = resolve(String(c.category || ''), String(c.subCategory || ''));
    if (!res.matched) continue; // تعهدِ نامشخص را دست نمی‌زنیم؛ در گزارش می‌آید
    report.procurementRemapped += 1;
    if (APPLY) {
      commitmentBulk.push({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { category: res.category, subCategory: res.subCategory || '' } }
        }
      });
    }
  }
  if (APPLY && commitmentBulk.length) {
    await FinanceProcurementCommitment.bulkWrite(commitmentBulk, { ordered: false });
  }

  // ---- ۶. غیرفعال‌سازیِ دسته‌های دلخواهِ قدیمی که پس از مهاجرت هیچ رکوردی ندارند ----
  // فقط isSystem:false (دسته‌های ساختهٔ کاربر مثل rent/stationary/modermaktab).
  // حذف نمی‌شوند تا در پنلِ رجیستری قابلِ مشاهده/بازفعال‌سازی بمانند.
  const orphanCustomKeys = registryDocs
    .filter((doc) => doc.isSystem === false
      && doc.isActive !== false
      && doc.key !== UNCLASSIFIED_KEY
      && !EXPENSE_CHART_KEYS.has(doc.key)
      && !postMigrationCategoryKeys.has(doc.key))
    .map((doc) => doc.key);
  report.deactivatedOrphanCategories = orphanCustomKeys;
  if (APPLY && orphanCustomKeys.length) {
    await ExpenseCategoryDefinition.updateMany(
      { key: { $in: orphanCustomKeys }, isSystem: false },
      { $set: { isActive: false } }
    );
  }

  // ---- خروجی ----
  const unresolved = Object.entries(report.unresolvedGroups)
    .map(([value, g]) => ({ value, count: g.count, amount: g.amount, samples: [...g.samples] }))
    .sort((a, b) => b.amount - a.amount);

  console.log('\n=== خلاصهٔ مصارف ===');
  console.log(JSON.stringify(report.expense, null, 2));
  console.log('\n=== نگاشتِ حدسی (بازبینی توصیه می‌شود) ===');
  console.log(JSON.stringify(report.lowConfidenceGroups, null, 2));
  console.log('\n=== رشته‌های نامشخص → unclassified (در صفِ «دسته‌بندیِ معلق» تعیین تکلیف کنید) ===');
  console.table(unresolved);
  console.log('\n=== بودجه / تعهدها / پاک‌سازی ===');
  console.log(JSON.stringify({
    budgetYearsUpdated: report.budgetYearsUpdated,
    budgetBucketsRemapped: report.budgetBucketsRemapped,
    procurementScanned: report.procurementScanned,
    procurementRemapped: report.procurementRemapped,
    aliasesQueued: report.aliasesQueued,
    deactivatedOrphanCategories: report.deactivatedOrphanCategories
  }, null, 2));

  if (!APPLY) {
    console.log('\nاین اجرا فقط گزارش بود. برای اعمال: ابتدا بکاپ بگیرید، سپس --apply.');
  } else {
    console.log(`\nاعمال شد. مصارفِ به‌روزشده: ${bulk.length} | تعهدهای به‌روزشده: ${commitmentBulk.length}`);
    console.log('اکنون: صفحهٔ «مرکز مالی دولت» → پنلِ «دسته‌بندیِ معلق» را باز کنید و گروه‌ها را تعیین تکلیف کنید،');
    console.log('سپس این اسکریپت را دوباره با --apply اجرا کنید تا stragglerها هم بسته شوند.');
  }

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
