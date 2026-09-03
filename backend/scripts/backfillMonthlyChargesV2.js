/**
 * V2 — ساختِ قلم‌های فیسِ ماهانهٔ آموزشگاه از ماهِ ثبت‌نام تا ماهِ جاری.
 *
 * فقط ثبت‌نام‌های paymentPlan='monthly' و status='active'.
 * - مبنا: ماهِ شمسیِ reg.registrationDate  (اگر نبود: startDate).
 *   startDate / endDate در محاسبهٔ بازه هیچ نقشی ندارند.
 * - بازه با حسابِ خالصِ jy/jm ساخته می‌شود؛ اگر < ۱ یا > ۱۲ ماه شد → رد + هشدار.
 * - قلم‌های ماهانه‌ای که ماه‌شان < ماهِ ثبت‌نام است باطل می‌شوند (میراثِ غلط).
 * - ثبت‌نامی که همهٔ ماه‌هایش از قبل قلم دارد و چیزی برای ابطال ندارد، دست‌نخورده می‌ماند.
 * - قلمِ enrollment ساخته نمی‌شود.
 * - پرداخت‌ها یک‌جا در حافظه FIFO می‌شوند، بعد یک‌بار نوشته می‌شوند، بعد recompute.
 * - اضافه‌پرداخت: با --absorb-overpay یک قلمِ manual «اضافه‌پرداختِ پیشین»؛ وگرنه گزارش.
 *
 *   node backend/scripts/backfillMonthlyChargesV2.js --uri="$uri" --dns=8.8.8.8
 *   node backend/scripts/backfillMonthlyChargesV2.js --uri="$uri" --dns=8.8.8.8 --apply
 *   ... --apply --absorb-overpay        # اضافه‌پرداخت‌ها را جذب کن
 *   ... --limit=5                        # فقط ۵ ثبت‌نامِ اول
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const AcademyRegistration = require('../models/AcademyRegistration');
const AcademyPayment = require('../models/AcademyPayment');
const AcademyCharge = require('../models/AcademyCharge');
const AcademySetting = require('../models/AcademySetting');
const academyLedger = require('../services/academyLedger');
require('../models/AcademyStudent');
require('../models/AcademyCourse');
require('../models/AcademyClass');

const argv = process.argv.slice(2);
const readArg = (name, fb = '') => {
  for (let i = 0; i < argv.length; i += 1) {
    const t = String(argv[i] || '');
    if (t === `--${name}`) return String(argv[i + 1] ?? '').trim();
    if (t.startsWith(`--${name}=`)) return t.slice(name.length + 3).trim();
  }
  return fb;
};
const hasFlag = (n) => argv.includes(`--${n}`);
const num = (v) => Math.max(0, Number(v || 0));
const round = (v) => Math.round(num(v) * 100) / 100;
const near = (a, b) => Math.abs(round(a) - round(b)) <= 0.01;

/** آرایهٔ کلیدهای ماهِ شمسی «jy-jm» از fromKey تا toKey (هر دو شامل). */
function monthKeysInclusive(fromKey, toKey) {
  const [fy, fm] = String(fromKey).split('-').map(Number);
  const [ty, tm] = String(toKey).split('-').map(Number);
  if (!fy || !fm || !ty || !tm) return [];
  const start = fy * 12 + fm;
  const end = ty * 12 + tm;
  if (start > end) return [];
  const out = [];
  let y = fy;
  let m = fm;
  let guard = 0;
  while (y * 12 + m <= end && guard < 60) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    guard += 1;
  }
  return out;
}

async function run() {
  const APPLY = hasFlag('apply');
  const ABSORB = hasFlag('absorb-overpay');
  const LIMIT = Math.max(0, Number(readArg('limit', '0')) || 0);
  const uri = readArg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const d = readArg('dns');
  if (d) {
    dns.setServers(d.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`DNS: ${dns.getServers().join(', ')}`);
  }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const settings = await AcademySetting.findOne().lean();
  const dueDay = settings?.monthlyChargeDueDay || 20;
  const nowKey = academyLedger.shamsiMonthKey(new Date());

  const q = AcademyRegistration.find({ paymentPlan: 'monthly', status: 'active' }).sort({ createdAt: 1 });
  if (LIMIT) q.limit(LIMIT);
  const regs = await q.populate('studentId', 'fullName studentCode').populate('classId', 'name').populate('courseId', 'name');

  const R = {
    scanned: 0, changed: 0, unchanged: 0, skippedNoFee: 0, skippedNoDate: 0, skippedRange: 0,
    monthlyCreated: 0, preAnchorVoided: 0, absorbed: 0,
    totalOldBalance: 0, totalNewBalance: 0, surplus: [], rows: []
  };

  for (const reg of regs) {
    R.scanned += 1;
    const who = `${reg.studentId?.fullName || reg.studentId?.studentCode || reg._id}  (${reg.classId?.name || reg.courseId?.name || '-'})`;
    const fee = num(reg.feeAmount);
    const oldBalance = num(reg.balance);
    R.totalOldBalance += oldBalance;

    if (fee <= 0) { R.skippedNoFee += 1; R.rows.push({ who, note: 'feeAmount=0' }); R.totalNewBalance += oldBalance; continue; }

    const anchorISO = String(reg.registrationDate || reg.startDate || '').slice(0, 10);
    const anchorKey = anchorISO ? academyLedger.shamsiMonthKey(anchorISO) : '';
    if (!anchorKey) { R.skippedNoDate += 1; R.rows.push({ who, note: 'تاریخِ ثبت‌نام نامعتبر' }); R.totalNewBalance += oldBalance; continue; }

    const months = monthKeysInclusive(anchorKey, nowKey);
    if (months.length < 1 || months.length > 12) {
      R.skippedRange += 1;
      R.rows.push({ who, anchorKey, nowKey, monthsTarget: months.length, note: '⚠️ بازهٔ غیرعادی — رد شد، بررسیِ دستی' });
      R.totalNewBalance += oldBalance;
      continue;
    }

    const existing = await AcademyCharge.find({ registrationId: reg._id, status: { $ne: 'void' } });
    const existingMonthly = existing.filter((c) => c.kind === 'monthly');
    const preAnchor = existingMonthly.filter((c) => c.periodKey && String(c.periodKey) < anchorKey);
    const haveMonths = new Set(existingMonthly.filter((c) => c.periodKey && String(c.periodKey) >= anchorKey).map((c) => String(c.periodKey)));
    const toCreate = months.filter((m) => !haveMonths.has(m));

    const payments = await AcademyPayment.find({ registrationId: reg._id, status: { $ne: 'void' } }).sort({ paidAt: 1, createdAt: 1 });
    const sumPay = round(payments.reduce((s, p) => s + num(p.amount), 0));
    const billed = round(months.length * fee);
    const projBalance = round(Math.max(0, billed - sumPay));
    const projSurplus = round(Math.max(0, sumPay - billed));

    const rowBase = {
      who, anchorKey, monthsTarget: months.length, fee,
      currentMonthlyFee: num(reg.monthlyFee),
      existingMonthly: existingMonthly.length, preAnchorToVoid: preAnchor.length, toCreate: toCreate.length,
      oldBalance, oldPaid: num(reg.paidAmount), billed, projBalance, projSurplus
    };

    const willChange = preAnchor.length > 0 || toCreate.length > 0;
    if (!willChange) {
      R.unchanged += 1;
      R.rows.push({ ...rowBase, note: 'بدونِ تغییر' });
      R.totalNewBalance += oldBalance;
      continue;
    }

    if (!APPLY) {
      R.rows.push(rowBase);
      if (projSurplus > 0.01) R.surplus.push({ who, projSurplus, sumPay, billed });
      R.totalNewBalance += projBalance;
      continue;
    }

    // ---------- APPLY ----------
    for (const c of preAnchor) {
      c.status = 'void'; c.voidedAt = new Date();
      c.voidReason = 'V2 — قلمِ ماهِ قبل از ثبت‌نام';
      await c.save();
      R.preAnchorVoided += 1;
    }
    for (const m of toCreate) {
      const dueISO = academyLedger.monthlyDueDateISO(m, dueDay);
      try {
        await AcademyCharge.create({
          registrationId: reg._id, studentId: reg.studentId, kind: 'monthly',
          title: `فیس ماهانه ${m}`, amount: fee, dueDate: dueISO, periodKey: m,
          currency: reg.currency || 'AFN', createdBy: null, note: 'V2 backfill'
        });
        R.monthlyCreated += 1;
      } catch (e) {
        if (!(e && e.code === 11000)) throw e;
      }
    }

    if (num(reg.monthlyFee) <= 0) reg.monthlyFee = fee;
    reg.lastMonthlyChargeKey = nowKey;
    reg.ledgerManaged = true;
    await reg.save();

    // FIFO in memory across all non-void charges (oldest due first)
    const fresh = await AcademyCharge.find({ registrationId: reg._id, status: { $ne: 'void' } }).sort({ dueDate: 1, createdAt: 1 });
    const state = fresh.map((c) => ({ _id: c._id, net: round(num(c.amount) - num(c.discountAmount)), paid: 0 }));
    let absorbCharge = null;
    const payUpdates = [];
    for (const p of payments) {
      let left = round(num(p.amount));
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
      if (left > 0.01) {
        if (ABSORB) {
          if (!absorbCharge) {
            absorbCharge = await AcademyCharge.create({
              registrationId: reg._id, studentId: reg.studentId, kind: 'manual',
              title: 'اضافه‌پرداختِ پیشین', amount: 0,
              dueDate: anchorISO, currency: reg.currency || 'AFN', createdBy: null,
              note: 'V2 — جذبِ پرداختِ مازاد بر فیسِ ماه‌ها'
            });
            state.push({ _id: absorbCharge._id, net: 0, paid: 0 });
            R.absorbed += 1;
          }
          absorbCharge.amount = round(num(absorbCharge.amount) + left);
          await absorbCharge.save();
          const cs = state.find((x) => String(x._id) === String(absorbCharge._id));
          cs.net = round(cs.net + left);
          allocs.push({ chargeId: absorbCharge._id, amount: round(left) });
          cs.paid = round(cs.paid + left);
          left = 0;
        } else {
          R.surplus.push({ who, paymentNumber: p.paymentNumber, unallocated: round(left) });
        }
      }
      payUpdates.push({ p, allocs });
    }
    for (const { p, allocs } of payUpdates) {
      p.allocations = allocs;
      p.status = p.status === 'void' ? 'void' : 'active';
      await p.save();
    }

    const updated = await academyLedger.recomputeRegistration(reg._id);
    const newBalance = num(updated?.balance);
    const newPaid = num(updated?.paidAmount);
    R.changed += 1;
    R.totalNewBalance += newBalance;
    R.rows.push({
      ...rowBase, newBalance, newPaid,
      ok: near(newPaid, Math.min(sumPay, billed + (ABSORB ? projSurplus : 0)))
    });
  }

  console.log('==== نتیجه ====');
  console.log(JSON.stringify({
    ...R,
    totalOldBalance: round(R.totalOldBalance),
    totalNewBalance: round(R.totalNewBalance),
    rows: R.rows.slice(0, 90),
    surplus: R.surplus.slice(0, 40)
  }, null, 2));
  if (!APPLY) console.log('\nحالتِ DRY-RUN بود. برای اعمال: --apply  (اگر surplus داشت: --apply --absorb-overpay)');
  if (R.surplus.length && !ABSORB) console.log(`\n⚠️ ${R.surplus.length} موردِ اضافه‌پرداخت — یا --absorb-overpay بزنید یا دستی رسیدگی کنید.`);
  const bad = R.rows.filter((r) => r.ok === false);
  if (bad.length) console.log(`\n⚠️ ${bad.length} ردیف ok=false — بررسیِ دستی لازم است.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
