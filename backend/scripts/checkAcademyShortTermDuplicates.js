/**
 * فقط‌خواندنی — کشف دادهٔ نامنظم در آموزشگاه و شاگردان موقت:
 *   ۱) ثبت‌نام‌های فعالِ تکراری (یک شاگرد، یک صنف، بیش از یک ثبت‌نامِ active)
 *   ۲) فیس ماهانهٔ تکراری برای یک شاگرد در یک ماه (از چند ثبت‌نام)
 *   ۳) ثبت‌نام‌های ماهانه با monthlyFee=0 (فیس ماهانه برایشان ساخته نمی‌شود)
 *
 *   node backend/scripts/checkAcademyShortTermDuplicates.js
 *   node backend/scripts/checkAcademyShortTermDuplicates.js --uri="mongodb+srv://..." --dns=8.8.8.8
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const argv = process.argv.slice(2);
const readArg = (n, fb = '') => {
  for (let i = 0; i < argv.length; i += 1) {
    const t = String(argv[i] || '');
    if (t === `--${n}`) return String(argv[i + 1] ?? '').trim();
    if (t.startsWith(`--${n}=`)) return t.slice(n.length + 3).trim();
  }
  return fb;
};

async function scan(db, label, regColl, chargeColl) {
  const regs = db.collection(regColl);

  const dupRegs = await regs.aggregate([
    { $match: { status: 'active' } },
    { $group: {
      _id: { s: '$studentId', c: '$classId' },
      n: { $sum: 1 }, ids: { $push: '$_id' },
      bal: { $sum: '$balance' }, paid: { $sum: '$paidAmount' }, payable: { $sum: '$totalPayable' }
    } },
    { $match: { n: { $gt: 1 } } },
    { $sort: { n: -1 } }
  ]).toArray();

  console.log(`\n===== ${label} — ثبت‌نام‌های فعالِ تکراری (شاگرد × صنف) =====`);
  console.log(`جفت‌های تکراری: ${dupRegs.length}`);
  let extraReg = 0;
  let extraBal = 0;
  for (const d of dupRegs) {
    extraReg += d.n - 1;
    extraBal += d.bal - (d.n ? d.bal / d.n : 0); // تقریب: سهم ثبت‌نام‌های اضافی
  }
  for (const d of dupRegs.slice(0, 50)) {
    console.log(`  student=${d._id.s}  class=${d._id.c}  ×${d.n}  مجموع‌قابل‌پرداخت=${Math.round(d.payable)}  مجموع‌مانده=${Math.round(d.bal)}  مجموع‌پرداخت=${Math.round(d.paid)}`);
    console.log(`     regIds: ${d.ids.join(', ')}`);
  }
  console.log(`  → ثبت‌نام‌های اضافی (کاندید ابطال): ${extraReg}`);

  if (chargeColl) {
    const charges = db.collection(chargeColl);
    const byKind = await charges.aggregate([
      { $match: { status: { $ne: 'void' } } },
      { $group: { _id: '$kind', n: { $sum: 1 }, sum: { $sum: '$amount' }, bal: { $sum: '$balance' } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    console.log(`\n  اقلامِ بدهیِ زنده به تفکیک نوع:`);
    for (const r of byKind) console.log(`     ${String(r._id).padEnd(12)} ×${String(r.n).padStart(5)}  مبلغ=${Math.round(r.sum)}  مانده=${Math.round(r.bal)}`);

    const dupMonthly = await charges.aggregate([
      { $match: { kind: 'monthly', status: { $ne: 'void' }, periodKey: { $gt: '' } } },
      { $group: { _id: { s: '$studentId', p: '$periodKey' }, n: { $sum: 1 }, regs: { $addToSet: '$registrationId' }, amt: { $sum: '$amount' }, bal: { $sum: '$balance' } } },
      { $match: { n: { $gt: 1 } } },
      { $sort: { n: -1 } }
    ]).toArray();
    console.log(`\n===== ${label} — فیس ماهانهٔ تکراری برای یک شاگرد در یک ماه =====`);
    console.log(`موارد: ${dupMonthly.length}`);
    let extraCharge = 0;
    let extraChargeBal = 0;
    for (const d of dupMonthly) { extraCharge += d.n - 1; extraChargeBal += d.bal * (d.n - 1) / d.n; }
    for (const d of dupMonthly.slice(0, 50)) {
      console.log(`  student=${d._id.s}  ماه=${d._id.p}  ×${d.n}  از ${d.regs.length} ثبت‌نام  مبلغ‌کل=${Math.round(d.amt)}  مانده‌کل=${Math.round(d.bal)}`);
    }
    console.log(`  → قلم‌های ماهانهٔ اضافی (کاندید ابطال): ${extraCharge}   مانده‌ی قابل‌حذف ≈ ${Math.round(extraChargeBal)}`);

    const monthlyByMonth = await charges.aggregate([
      { $match: { kind: 'monthly', status: { $ne: 'void' } } },
      { $group: { _id: '$periodKey', n: { $sum: 1 }, amt: { $sum: '$amount' } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    console.log(`\n  فیس ماهانه به تفکیک ماه:`);
    for (const r of monthlyByMonth) console.log(`     ${r._id || '(بدون ماه)'}  ×${r.n}  مبلغ=${Math.round(r.amt)}`);
  }

  const monthlyRegs = await regs.countDocuments({ paymentPlan: 'monthly' });
  const monthlyNoFee = await regs.countDocuments({ paymentPlan: 'monthly', $or: [{ monthlyFee: { $lte: 0 } }, { monthlyFee: { $exists: false } }] });
  const monthlyActive = await regs.countDocuments({ paymentPlan: 'monthly', status: 'active' });
  const withBal = await regs.countDocuments({ balance: { $gt: 0 } });
  const balSum = await regs.aggregate([{ $group: { _id: null, s: { $sum: '$balance' } } }]).toArray();
  console.log(`\n  ثبت‌نام ماهانه: ${monthlyRegs}  (فعال: ${monthlyActive})  |  با monthlyFee=0: ${monthlyNoFee}`);
  console.log(`  ثبت‌نام دارای مانده > 0: ${withBal}  |  مجموع مانده: ${Math.round(balSum[0]?.s || 0)}`);
}

async function run() {
  const uri = readArg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school';
  const d = readArg('dns');
  if (d) { dns.setServers(d.split(',').map((s) => s.trim()).filter(Boolean)); console.log(`DNS: ${dns.getServers().join(', ')}`); }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);

  const academyDb = mongoose.connection.useDb(String(process.env.ACADEMY_DB_NAME || 'academy_db'));
  const shortDb = mongoose.connection.useDb(String(process.env.SHORT_TERM_DB_NAME || 'short_term_center_db'));

  await scan(academyDb, 'آموزشگاه', 'academyregistrations', 'academycharges');
  await scan(shortDb, 'شاگردان موقت', 'shorttermregistrations', null);

  await mongoose.disconnect();
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
