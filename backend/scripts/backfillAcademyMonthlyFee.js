/* eslint-disable no-console */
/**
 * پرکردنِ «فیسِ ماهانه»ی ثبت‌نام‌های آموزشگاه که خالی مانده‌اند.
 *
 * چرا لازم شد: مهاجرتِ «بلِ صریح» مبلغِ ماهانه را فقط در حافظه حساب کرد
 * (`issueBillForMonth({ ...reg, monthlyFee })`) و روی خودِ ثبت‌نام ننوشت. پس
 * بل‌های گذشته مبلغِ درست گرفتند ولی `registration.monthlyFee` صفر ماند و
 * «صدور بل»ِ ماه‌های تازه آن ثبت‌نام‌ها را بی‌صدا رد می‌کرد (بلِ صفر صادر نمی‌شود).
 *
 * منبعِ مبلغ به‌ترتیبِ اعتبار:
 *   ۱) مبلغِ آخرین بلِ ماهانهٔ غیرِ ابطالی (همان چیزی که واقعاً از شاگرد خواسته شده)
 *   ۲) feeAmount ثبت‌نام (در پلانِ ماهانه = فیسِ یک ماه)
 * اگر این دو با هم نخوانند، ردیف گزارش می‌شود تا دستی دیده شود.
 *
 *   node backend/scripts/backfillAcademyMonthlyFee.js            # DRY-RUN
 *   node backend/scripts/backfillAcademyMonthlyFee.js --apply
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
const APPLY = process.argv.includes('--apply');
const N = (v) => Math.max(0, Number(v || 0));
const round = (v) => Math.round(N(v) * 100) / 100;

const AcademyRegistration = require('../models/AcademyRegistration');
const AcademyCharge = require('../models/AcademyCharge');
require('../models/AcademyStudent');
require('../models/AcademyCourse');

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log(`connected  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const regs = await AcademyRegistration.find({ paymentPlan: 'monthly', status: { $in: ['active', 'completed'] } })
    .populate('studentId', 'fullName studentCode')
    .populate('courseId', 'name')
    .lean();

  const blank = regs.filter((r) => !(N(r.monthlyFee) > 0));
  console.log(`ثبت‌نامِ ماهانه: ${regs.length}  |  بدونِ فیسِ ماهانه: ${blank.length}\n`);

  const fixed = [];
  const mismatched = [];
  const unresolved = [];

  for (const r of blank) {
    const lastBill = await AcademyCharge.find({ registrationId: r._id, kind: 'monthly', status: { $ne: 'void' }, amount: { $gt: 0 } })
      .sort({ periodKey: -1 }).limit(1).select('amount periodKey').lean();
    const fromBill = lastBill.length ? round(lastBill[0].amount) : 0;
    const fromFee = round(N(r.feeAmount));
    const value = fromBill || fromFee;
    const who = `${r.studentId?.fullName || r._id}${r.courseId?.name ? ' / ' + r.courseId.name : ''}`;

    if (value <= 0) { unresolved.push({ who, reg: String(r._id) }); continue; }
    if (fromBill && fromFee && fromBill !== fromFee) {
      mismatched.push({ who, fromBill, fromFee, picked: fromBill, month: lastBill[0].periodKey });
    }
    fixed.push({ who, reg: String(r._id), value, source: fromBill ? `بلِ ${lastBill[0].periodKey}` : 'feeAmount' });
    if (APPLY) await AcademyRegistration.updateOne({ _id: r._id }, { $set: { monthlyFee: value } });
  }

  console.log(`قابلِ اصلاح: ${fixed.length}`);
  fixed.slice(0, 20).forEach((f) => console.log(`   ${f.who}  →  ${f.value}  (${f.source})`));
  if (fixed.length > 20) console.log(`   … و ${fixed.length - 20} ردیفِ دیگر`);

  if (mismatched.length) {
    console.log(`\n⚠ ناهم‌خوانیِ بل و feeAmount (مبلغِ بل انتخاب شد) — ${mismatched.length}:`);
    mismatched.forEach((m) => console.log(`   ${m.who}: بلِ ${m.month} = ${m.fromBill} ولی feeAmount = ${m.fromFee}`));
  }
  if (unresolved.length) {
    console.log(`\n✗ بدونِ منبعِ مبلغ (دستی تعیین کنید) — ${unresolved.length}:`);
    unresolved.forEach((u) => console.log(`   ${u.who}  (${u.reg})`));
  }

  if (!APPLY) console.log('\nDRY-RUN. برای اعمال: --apply');
  else console.log(`\n${fixed.length} ثبت‌نام به‌روز شد.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
