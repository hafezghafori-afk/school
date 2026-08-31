/**
 * مهاجرتِ فاز ۱ مالیِ آموزشگاه — ساختِ اقلامِ بدهی (AcademyCharge) برای ثبت‌نام‌های موجود.
 *
 * برای هر AcademyRegistration که هنوز هیچ AcademyCharge ندارد:
 *   • full / installment  → یک قلمِ enrollment: amount=feeAmount، discount=discountAmount،
 *                            dueDate=startDate یا registrationDate.
 *   • monthly             → یک قلمِ enrollment برای همان مبلغِ کلِ فعلی (تا اعداد بخواند)
 *                            + lastMonthlyChargeKey=ماهِ جاری (ضدِ شارژِ عقب‌افتاده).
 *                            monthlyFee خالی می‌ماند تا مدیر تعیین کند.
 * سپس پرداخت‌های غیرِ ابطالیِ آن ثبت‌نام به‌روشِ FIFO به قلم(ها) allocate می‌شوند و
 * رول‌آپِ ثبت‌نام (totalPayable/paidAmount/balance) با recomputeRegistration بازمحاسبه می‌گردد.
 *
 * تستِ صحت: بعد از مهاجرت باید balanceِ جدید == balanceِ قدیم باشد (± ۰٫۰۱).
 * در حالتِ --apply هر ثبت‌نامی که مغایرت داشته باشد رد می‌شود و در گزارش می‌آید.
 *
 * اضافه‌پرداخت (sumPayments > فیس): پیش‌فرض رد می‌شود؛ با --absorb-overpay یک قلمِ
 * manual «اضافه‌پرداختِ پیشین» به‌اندازهٔ مازاد ساخته می‌شود تا کاملاً allocate شود.
 *
 * اجرا:
 *   node backend/scripts/migrateAcademyChargesBackfill.js               # dry-run
 *   node backend/scripts/migrateAcademyChargesBackfill.js --apply
 *   node backend/scripts/migrateAcademyChargesBackfill.js --apply --uri='mongodb+srv://...' --dns=8.8.8.8
 *   PROD_MONGO_URI="mongodb+srv://..." node backend/scripts/migrateAcademyChargesBackfill.js --apply
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const AcademyRegistration = require('../models/AcademyRegistration');
const AcademyPayment = require('../models/AcademyPayment');
const AcademyCharge = require('../models/AcademyCharge');
const academyLedger = require('../services/academyLedger');
const { gregorianToAfghanSolar } = require('../utils/afghanDate');

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

const num = (v) => Math.max(0, Number(v || 0));
const round = (v) => Math.round(num(v) * 100) / 100;
const near = (a, b) => Math.abs(round(a) - round(b)) <= 0.01;
const nowMonthKey = () => {
  const s = gregorianToAfghanSolar(new Date());
  return s ? `${s.jy}-${String(s.jm).padStart(2, '0')}` : '';
};

async function run() {
  const APPLY = hasFlag('apply');
  const ABSORB_OVERPAY = hasFlag('absorb-overpay');
  const LIMIT = Math.max(0, Number(readArg('limit', '0')) || 0);
  const uri = readArg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = readArg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`DNS: ${dns.getServers().join(', ')}`);
  }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const report = {
    scanned: 0, alreadyMigrated: 0, wouldMigrate: 0, migrated: 0,
    skippedMismatch: 0, skippedOverpaid: 0, byPlan: { full: 0, installment: 0, monthly: 0 },
    mismatches: [], overpaid: []
  };

  const q = AcademyRegistration.find({}).sort({ createdAt: 1 });
  if (LIMIT) q.limit(LIMIT);
  const regs = await q;
  const monthKey = nowMonthKey();

  for (const reg of regs) {
    report.scanned += 1;
    const existing = await AcademyCharge.countDocuments({ registrationId: reg._id });
    if (existing > 0) { report.alreadyMigrated += 1; continue; }

    const oldBalance = num(reg.balance);
    const oldPaid = num(reg.paidAmount);
    const fee = num(reg.feeAmount);
    const discount = Math.min(fee, num(reg.discountAmount));
    const net = round(fee - discount);
    const plan = ['full', 'installment', 'monthly'].includes(reg.paymentPlan) ? reg.paymentPlan : 'full';
    report.byPlan[plan] += 1;

    const payments = await AcademyPayment.find({ registrationId: reg._id, status: { $ne: 'void' } }).sort({ paidAt: 1, createdAt: 1 });
    const sumPayments = round(payments.reduce((s, p) => s + num(p.amount), 0));

    const overpay = round(sumPayments - net);
    if (overpay > 0.01 && fee > 0) {
      report.overpaid.push({ id: String(reg._id), net, sumPayments, oldPaid, oldBalance });
      if (!ABSORB_OVERPAY) {
        report.skippedOverpaid += 1;
        continue; // بدونِ --absorb-overpay رد می‌شود (نیازِ تصمیمِ دستی)
      }
    }

    if (!APPLY) {
      report.wouldMigrate += 1;
      continue;
    }

    // --- APPLY ---
    const dueDate = String(reg.startDate || reg.registrationDate || '').slice(0, 10);
    if (fee > 0) {
      await AcademyCharge.create({
        registrationId: reg._id, studentId: reg.studentId, kind: 'enrollment',
        title: 'فیس / شمولیت', amount: fee, discountAmount: discount,
        dueDate, currency: reg.currency || 'AFN', createdBy: null,
        note: 'مهاجرت — قلمِ اولیه از فیسِ ثبت‌نام'
      });
    }
    if (overpay > 0.01 && fee > 0 && ABSORB_OVERPAY) {
      await AcademyCharge.create({
        registrationId: reg._id, studentId: reg.studentId, kind: 'manual',
        title: 'اضافه‌پرداختِ پیشین', amount: overpay,
        dueDate, currency: reg.currency || 'AFN', createdBy: null,
        note: 'مهاجرت — جذبِ پرداختِ مازاد بر فیس'
      });
    }
    if (plan === 'monthly' && String(reg.lastMonthlyChargeKey || '') !== monthKey) {
      reg.lastMonthlyChargeKey = monthKey;
      await reg.save();
    }

    // FIFO allocate existing payments to the (single) charge
    const charges = await AcademyCharge.find({ registrationId: reg._id, status: { $ne: 'void' } }).sort({ dueDate: 1, createdAt: 1 });
    for (const p of payments) {
      const fresh = await AcademyCharge.find({ registrationId: reg._id, status: { $ne: 'void' } }).sort({ dueDate: 1, createdAt: 1 });
      const { allocations } = academyLedger.fifoAllocate(num(p.amount), fresh);
      p.allocations = allocations;
      p.status = p.status === 'void' ? 'void' : 'active';
      await p.save();
      // reflect paid onto the charge doc so the next payment's fifo sees it
      for (const a of allocations) {
        const c = fresh.find((x) => String(x._id) === String(a.chargeId));
        if (c) { c.paidAmount = round(num(c.paidAmount) + num(a.amount)); await c.save(); }
      }
    }
    void charges;

    const updated = await academyLedger.recomputeRegistration(reg._id);
    const newBalance = num(updated?.balance);
    const newPaid = num(updated?.paidAmount);

    if (!near(newBalance, oldBalance) || !near(newPaid, oldPaid)) {
      report.skippedMismatch += 1;
      report.mismatches.push({ id: String(reg._id), oldBalance, newBalance, oldPaid, newPaid });
    } else {
      report.migrated += 1;
    }
  }

  console.log('\n==== نتیجه ====');
  console.log(JSON.stringify({
    ...report,
    mismatches: report.mismatches.slice(0, 20),
    overpaid: report.overpaid.slice(0, 20)
  }, null, 2));
  if (!APPLY) console.log('\nحالتِ DRY-RUN بود؛ برای اعمال: --apply (اول روی کپیِ دیتابیس).');
  if (report.mismatches.length) console.log(`\n⚠️ ${report.mismatches.length} مغایرت — این ثبت‌نام‌ها اقلام گرفتند ولی رول‌آپ با مقدارِ قبلی نخواند؛ بررسیِ دستی.`);

  await mongoose.disconnect();
  process.exit(report.mismatches.length ? 2 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
