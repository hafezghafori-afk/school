/**
 * مهاجرتِ یک‌بارهٔ دفترِ ماهانهٔ مرکزِ موقت.
 *
 * برای هر ShortTermRegistration که status != 'cancelled':
 *   ۱) durationMonths قلمِ «فیس ماه» از ماهِ شمسیِ registrationDate ساخته می‌شود
 *      (idempotent — ماهی که قلم دارد رد می‌شود).
 *   ۲) پرداخت‌های زندهٔ آن به‌ترتیبِ paidAt با FIFO روی قلم‌ها (قدیمی‌ترین ماه اول)
 *      از نو allocation می‌گیرند.
 *   ۳) recomputeRegistration — totalPayable/paidAmount/balance رول‌آپ.
 *
 *   node backend/scripts/backfillShortTermCharges.js --uri="..." --dns=8.8.8.8            # DRY-RUN
 *   node backend/scripts/backfillShortTermCharges.js --uri="..." --dns=8.8.8.8 --apply
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const argv = process.argv.slice(2);
const arg = (n, fb = '') => { for (let i = 0; i < argv.length; i += 1) { const t = String(argv[i] || ''); if (t === `--${n}`) return String(argv[i + 1] ?? '').trim(); if (t.startsWith(`--${n}=`)) return t.slice(n.length + 3).trim(); } return fb; };
const hasFlag = (n) => argv.includes(`--${n}`);
const N = (v) => Math.max(0, Number(v || 0));
const round = (v) => Math.round(N(v) * 100) / 100;

const ShortTermRegistration = require('../models/ShortTermRegistration');
const ShortTermPayment = require('../models/ShortTermPayment');
const ShortTermCharge = require('../models/ShortTermCharge');
const ShortTermSetting = require('../models/ShortTermSetting');
const ledger = require('../services/shortTermLedger');
require('../models/ShortTermStudent');
require('../models/ShortTermClass');

// یک اصلاحِ نقطه‌ای: لائبه نیازی — پیش از مدلِ چندماهه، فیسِ ۲ ماه در feeAmount
// جمع شده بود (۴۰۰۰/۸۰۰). مدلِ چندماهه feeAmount را «فیسِ یک ماه» می‌خواهد.
const NORMALIZE_FEE = {
  '6a8921c9526463669dc14a61': { feeAmount: 2000, discountAmount: 400 }
};

async function run() {
  const APPLY = hasFlag('apply');
  const LIMIT = Math.max(0, Number(arg('limit', '0')) || 0);
  const uri = arg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school';
  const d = arg('dns'); if (d) { dns.setServers(d.split(',').map((s) => s.trim())); console.log(`DNS: ${dns.getServers().join(', ')}`); }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const settings = await ShortTermSetting.findOne().lean();
  const dueDay = settings?.monthlyChargeDueDay || 20;

  const q = ShortTermRegistration.find({ status: { $ne: 'cancelled' } }).sort({ createdAt: 1 });
  if (LIMIT) q.limit(LIMIT);
  const regs = await q.populate('studentId', 'fullName studentCode').populate('classId', 'name');

  const R = { scanned: 0, chargesCreated: 0, chargesExisting: 0, paymentsReallocated: 0, changed: 0, surplus: [], rows: [] };

  for (const reg of regs) {
    R.scanned += 1;
    const who = `${reg.studentId?.fullName || reg.studentId?.studentCode || reg._id} / ${reg.classId?.name || '-'}`;

    const fix = NORMALIZE_FEE[String(reg._id)];
    if (fix && (N(reg.feeAmount) !== fix.feeAmount || N(reg.discountAmount) !== fix.discountAmount)) {
      console.log(`   ↳ اصلاحِ فیسِ ${who}: feeAmount ${reg.feeAmount}→${fix.feeAmount}, discountAmount ${reg.discountAmount}→${fix.discountAmount}`);
      if (APPLY) { reg.feeAmount = fix.feeAmount; reg.discountAmount = fix.discountAmount; await reg.save(); }
      else { reg.feeAmount = fix.feeAmount; reg.discountAmount = fix.discountAmount; }
    }

    const anchorKey = ledger.shamsiMonthKey(String(reg.registrationDate || reg.startDate || '').slice(0, 10) || ledger.todayKey());
    const months = ledger.monthKeysFrom(anchorKey, Math.max(1, Number(reg.durationMonths) || 1));
    const existing = await ShortTermCharge.find({ registrationId: reg._id, status: { $ne: 'void' } }).lean();
    const haveKeys = new Set(existing.map((c) => c.periodKey));
    const toCreate = months.filter((m) => !haveKeys.has(m));
    const pays = await ShortTermPayment.find({ registrationId: reg._id, status: { $ne: 'void' } }).sort({ paidAt: 1, createdAt: 1 });
    const sumPay = round(pays.reduce((s, p) => s + N(p.amount), 0));
    const monthlyNet = Math.max(0, N(reg.feeAmount) - N(reg.discountAmount));
    const billed = round(months.length * monthlyNet);
    const projSurplus = round(Math.max(0, sumPay - billed));

    R.chargesExisting += existing.length;
    const row = { who, anchorKey, months: months.length, existing: existing.length, toCreate: toCreate.length, monthlyNet, billed, paid: sumPay, projBalance: round(Math.max(0, billed - sumPay)), projSurplus };
    R.rows.push(row);
    if (projSurplus > 0.01) R.surplus.push({ who, projSurplus, sumPay, billed });

    if (!APPLY) continue;

    // ---- APPLY ----
    if (monthlyNet <= 0) { row.note = 'فیسِ ماه صفر — قلمی ساخته نشد'; continue; }
    const gen = await ledger.generateChargesForRegistration(reg, { dueDay });
    R.chargesCreated += gen.created;

    // allocationها را از نو FIFO بساز
    const fresh = await ShortTermCharge.find({ registrationId: reg._id, status: { $ne: 'void' } }).sort({ dueDate: 1, periodKey: 1, createdAt: 1 });
    const state = fresh.map((c) => ({ _id: c._id, net: round(N(c.amount) - N(c.discountAmount)), paid: 0 }));
    for (const p of pays) {
      let left = round(N(p.amount));
      const allocs = [];
      for (const cs of state) {
        if (left <= 0) break;
        const open = round(cs.net - cs.paid);
        if (open <= 0) continue;
        const take = round(Math.min(open, left));
        allocs.push({ chargeId: cs._id, amount: take });
        cs.paid = round(cs.paid + take);
        left = round(left - take);
      }
      p.allocations = allocs;
      await p.save();
      R.paymentsReallocated += 1;
    }
    await ledger.recomputeRegistration(reg._id);
    R.changed += 1;
  }

  console.log('==== نتیجه ====');
  console.log(JSON.stringify({ ...R, rows: R.rows.slice(0, 80), surplus: R.surplus.slice(0, 40) }, null, 2));
  if (!APPLY) console.log('\nحالتِ DRY-RUN بود. برای اعمال: --apply');
  if (R.surplus.length) console.log(`\n⚠️ ${R.surplus.length} موردِ اضافه‌پرداخت (پرداخت > مجموعِ فیسِ ماه‌ها) — به‌عنوان اعتبار در paidAmount می‌ماند.`);

  await mongoose.disconnect();
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
