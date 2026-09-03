/**
 * تعیینِ «فیسِ ثابتِ ماهانه» (monthlyFee) برای ثبت‌نام‌های پلانِ ماهانهٔ آموزشگاه.
 *
 * مهاجرتِ اقلام (migrateAcademyChargesBackfill.js) عمداً monthlyFee را خالی می‌گذارد.
 * تا وقتی این مقدار ست نشود، services/academyLedger.generateMonthlyCharges (که
 * فیلترِ `monthlyFee: { $gt: 0 }` دارد) برایِ آن ثبت‌نام شارژِ ماهِ تازه نمی‌سازد.
 *
 * حالت‌ها:
 *   node backend/scripts/setAcademyMonthlyFee.js                 # فقط فهرست (بدونِ تغییر)
 *   node backend/scripts/setAcademyMonthlyFee.js --apply         # monthlyFee = feeAmount برای ردیف‌های خالی
 *   node backend/scripts/setAcademyMonthlyFee.js --apply --value=500   # همه را روی ۵۰۰ بگذار
 *   node backend/scripts/setAcademyMonthlyFee.js --apply --force  # ردیف‌های غیرِخالی را هم بازنویسی کن
 *
 * اتصال (مثلِ اسکریپتِ مهاجرت):
 *   --uri='mongodb+srv://...'   یا   PROD_MONGO_URI=...   یا   MONGO_URI در .env
 *   --dns=8.8.8.8   اگر resolveِ SRV روی شبکه‌تان مشکل داشت
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const AcademyRegistration = require('../models/AcademyRegistration');
require('../models/AcademyStudent');
require('../models/AcademyCourse');
require('../models/AcademyClass');

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
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
const padL = (s, n) => String(s ?? '').padStart(n).slice(0, n);

async function run() {
  const APPLY = hasFlag('apply');
  const FORCE = hasFlag('force');
  const fixedValue = readArg('value') ? num(readArg('value')) : null;
  const uri = readArg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = readArg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`DNS: ${dns.getServers().join(', ')}`);
  }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'LIST'}`);

  const regs = await AcademyRegistration.find({ paymentPlan: 'monthly' })
    .sort({ createdAt: 1 })
    .populate('studentId', 'fullName studentCode')
    .populate('courseId', 'name')
    .populate('classId', 'name');

  console.log(`\nثبت‌نام‌های ماهانه: ${regs.length}\n`);
  console.log(`${pad('#', 4)}${pad('شاگرد', 26)}${pad('صنف/کورس', 22)}${padL('feeAmount', 12)}${padL('monthlyFee', 12)}${padL('باقی', 10)}  وضعیت`);
  console.log('-'.repeat(92));

  let changed = 0;
  let idx = 0;
  for (const reg of regs) {
    idx += 1;
    const student = reg.studentId?.fullName || reg.studentId?.studentCode || String(reg.studentId || '');
    const where = reg.classId?.name || reg.courseId?.name || '';
    const fee = num(reg.feeAmount);
    const currentMonthly = num(reg.monthlyFee);
    const target = fixedValue != null ? fixedValue : fee;

    const willSet = APPLY && target > 0 && (FORCE || currentMonthly <= 0);
    console.log(
      `${pad(idx, 4)}${pad(student, 26)}${pad(where, 22)}${padL(fee, 12)}${padL(currentMonthly, 12)}${padL(num(reg.balance), 10)}  ${reg.status}${willSet ? `   → monthlyFee=${target}` : ''}`
    );

    if (willSet) {
      reg.monthlyFee = target;
      reg.updatedBy = reg.updatedBy || null;
      await reg.save();
      changed += 1;
    }
  }

  console.log('-'.repeat(92));
  if (APPLY) {
    console.log(`\n✅ monthlyFee برای ${changed} ثبت‌نام ست شد${fixedValue != null ? ` (مقدارِ ثابت ${fixedValue})` : ' (= feeAmount)'}.`);
    console.log('حالا از داشبورد «ساختِ شارژِ ماهانه» را بزنید (یا صبر کنید lazy اجرا شود).');
  } else {
    console.log('\nحالتِ LIST بود — چیزی تغییر نکرد.');
    console.log('برای ست‌کردنِ monthlyFee = feeAmount روی ردیف‌های خالی:  --apply');
    console.log('برای مقدارِ ثابت روی همه:  --apply --value=<مبلغ>');
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
