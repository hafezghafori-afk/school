/* eslint-disable no-console */
/**
 * مهاجرتِ آموزشگاه به مدلِ «بلِ صریح».
 *
 *  ۱) ثبت‌نامِ فعالِ full/installment → monthly (monthlyFee = feeAmount/durationMonths).
 *  ۲) بلِ ماهانهٔ خودکارِ ماه‌های *بعد از ماهِ جاری* که پرداخت نخورده → void.
 *  ۳) برای هر ثبت‌نامِ monthlyِ فعال، بلِ هر ماه از ماهِ ثبت‌نام تا ماهِ جاری
 *     «صادرشده» علامت می‌خورد (آموزشگاه آن ماه‌ها فعال بوده).
 *  ۴) پرداخت‌های موجودِ هر ثبت‌نام به‌ترتیبِ تاریخ FIFO روی بل‌ها.
 *  ۵) recompute.
 *
 *  node backend/scripts/migrateAcademyToExplicitBills.js            # DRY-RUN
 *  node backend/scripts/migrateAcademyToExplicitBills.js --apply
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
const APPLY = process.argv.includes('--apply');
const N = (v) => Math.max(0, Number(v || 0));
const round = (v) => Math.round(N(v) * 100) / 100;

const L = require('../services/academyLedger');
const AcademyRegistration = require('../models/AcademyRegistration');
const AcademyCharge = require('../models/AcademyCharge');
const AcademyPayment = require('../models/AcademyPayment');
require('../models/AcademyStudent');
require('../models/AcademyCourse');
require('../models/AcademyClass');

function anchorKeyOf(reg) {
  const regISO = String(reg.registrationDate || '').slice(0, 10);
  const sISO = String(reg.startDate || '').slice(0, 10);
  const startISO = (sISO && regISO && sISO > regISO) ? sISO : (regISO || sISO || L.todayKey());
  return L.shamsiMonthKey(startISO);
}
function monthsFromTo(fromKey, toKey) {
  const out = [];
  let k = fromKey;
  let guard = 0;
  while (L.monthOrdinal(k) <= L.monthOrdinal(toKey) && guard < 60) { out.push(k); k = L.bumpShamsiMonth(k); guard += 1; }
  return out;
}

(async () => {
  await mongoose.connect(MONGO_URI);
  const cur = L.currentShamsiMonthKey();
  const curOrd = L.monthOrdinal(cur);
  console.log(`connected  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}  |  ماهِ جاری: ${cur} (${L.shamsiMonthLabel(cur)})\n`);

  // ---- 1) plan conversion ----
  const nonMonthly = await AcademyRegistration.find({ status: 'active', paymentPlan: { $ne: 'monthly' } })
    .populate('studentId', 'fullName').lean();
  console.log(`[1] ثبت‌نامِ فعالِ غیرماهانه: ${nonMonthly.length}`);
  for (const r of nonMonthly) {
    const dur = Math.max(1, Number(r.durationMonths) || 1);
    const proposed = round(N(r.feeAmount) / dur) || N(r.monthlyFee) || N(r.feeAmount);
    console.log(`    ${r.studentId?.fullName || r._id}  ${r.paymentPlan}  feeAmount ${r.feeAmount} / ${dur} ماه → monthlyFee ${proposed}`);
    if (APPLY) {
      await AcademyRegistration.updateOne({ _id: r._id }, { $set: { paymentPlan: 'monthly', monthlyFee: proposed } });
    }
  }

  // ---- 2) void future auto-bills ----
  const allMonthly = await AcademyCharge.find({ kind: 'monthly', status: { $ne: 'void' } }).lean();
  const futureUnpaid = allMonthly.filter((c) => L.monthOrdinal(c.periodKey) > curOrd && N(c.paidAmount) <= 0);
  console.log(`\n[2] بلِ ماهانهٔ فعال: ${allMonthly.length} → ${futureUnpaid.length} ماهِ آیندهٔ پرداخت‌نشده void`);
  if (APPLY && futureUnpaid.length) {
    await AcademyCharge.updateMany(
      { _id: { $in: futureUnpaid.map((c) => c._id) } },
      { $set: { status: 'void', voidedAt: new Date(), voidReason: 'مهاجرت به مدلِ بلِ صریح' } }
    );
  }

  // ---- 3) issue past bills for monthly regs ----
  const monthlyRegs = await AcademyRegistration.find({ status: 'active' }).lean(); // بعد از تبدیل، همه monthly
  let created = 0;
  const rows = [];
  for (const reg of monthlyRegs) {
    if (reg.paymentPlan !== 'monthly' && !APPLY) continue; // در dry-run هنوز تبدیل نشده
    const monthlyFee = N(reg.monthlyFee) || round(N(reg.feeAmount) / Math.max(1, Number(reg.durationMonths) || 1));
    if (monthlyFee <= 0) { rows.push({ reg: String(reg._id), skip: 'monthlyFee=0' }); continue; }
    const anchor = anchorKeyOf(reg);
    if (L.monthOrdinal(anchor) > curOrd) { rows.push({ reg: String(reg._id), skip: `anchor ${anchor} > جاری` }); continue; }
    const months = monthsFromTo(anchor, cur);
    rows.push({ reg: String(reg._id), anchor, months: months.length });
    if (!APPLY) continue;
    for (const mk of months) {
      const r = await L.issueBillForMonth({ ...reg, monthlyFee }, mk, { dueDay: 20, issuedBy: null });
      if (r.status === 'created') created += 1;
    }
  }
  console.log(`\n[3] ثبت‌نامِ monthly: ${rows.length}  |  بلِ تازه: ${created}`);
  rows.slice(0, 12).forEach((x) => console.log(`    ${x.reg}  ${x.skip ? 'SKIP ' + x.skip : `${x.anchor} → ${cur} = ${x.months} ماه`}`));

  if (!APPLY) { console.log('\nDRY-RUN. برای اعمال: --apply'); await mongoose.disconnect(); process.exit(0); }

  // ---- 4) re-FIFO payments + 5) recompute ----
  let reAlloc = 0;
  for (const reg of await AcademyRegistration.find({ status: { $in: ['active', 'completed'] } })) {
    const pays = await AcademyPayment.find({ registrationId: reg._id, status: { $ne: 'void' } }).sort({ paidAt: 1, createdAt: 1 });
    for (const p of pays) {
      const open = await AcademyCharge.find({ registrationId: reg._id, status: { $ne: 'void' } }).sort({ dueDate: 1, periodKey: 1, createdAt: 1 });
      const { allocations } = L.fifoAllocate(p.amount, open);
      p.allocations = allocations;
      p.coveredMonths = allocations.map((a) => (open.find((c) => String(c._id) === String(a.chargeId)) || {}).periodKey).filter(Boolean);
      await p.save();
      await L.recomputeRegistration(reg._id);
    }
    await L.recomputeRegistration(reg._id);
    if (pays.length) reAlloc += 1;
  }
  console.log(`[4/5] پرداخت‌های ${reAlloc} ثبت‌نام از نو تخصیص و رول‌آپ شد`);
  console.log(`\nAFTER: ${await AcademyCharge.countDocuments({ kind: 'monthly', status: { $ne: 'void' } })} بلِ ماهانهٔ فعال`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
