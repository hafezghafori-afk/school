/**
 * بازرسیِ فقط‌خواندنیِ اقلامِ ماهانهٔ آموزشگاه — برای تشخیصِ این‌که آیا
 * generateMonthlyCharges (نسخهٔ قدیمی) ماه‌های گذشته را back-charge کرده یا نه.
 *
 *   node backend/scripts/checkAcademyMonthlyCharges.js --uri="$uri" --dns=8.8.8.8
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const argv = process.argv.slice(2);
const readArg = (name, fallback = '') => {
  for (let i = 0; i < argv.length; i += 1) {
    const t = String(argv[i] || '');
    if (t === `--${name}`) return String(argv[i + 1] ?? '').trim();
    if (t.startsWith(`--${name}=`)) return t.slice(name.length + 3).trim();
  }
  return fallback;
};

async function run() {
  const uri = readArg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = readArg('dns');
  if (dnsServers) dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.useDb(String(process.env.ACADEMY_DB_NAME || 'academy_db'));
  const charges = db.collection('academycharges');
  const regs = db.collection('academyregistrations');

  const live = { status: { $ne: 'void' } };
  const byKind = await charges.aggregate([
    { $match: live },
    { $group: { _id: '$kind', n: { $sum: 1 }, sumAmount: { $sum: '$amount' } } },
    { $sort: { _id: 1 } }
  ]).toArray();
  const byMonth = await charges.aggregate([
    { $match: { ...live, kind: 'monthly' } },
    { $group: { _id: '$periodKey', n: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();
  const monthlyRegs = await regs.countDocuments({ paymentPlan: 'monthly' });
  const regsWithBalance = await regs.countDocuments({ balance: { $gt: 0 } });
  const regsBalanceSum = await regs.aggregate([{ $group: { _id: null, s: { $sum: '$balance' } } }]).toArray();

  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  db: ${db.name}\n`);
  console.log('اقلام به تفکیکِ نوع:');
  for (const r of byKind) console.log(`  ${String(r._id).padEnd(12)} count=${String(r.n).padStart(5)}  sumAmount=${r.sumAmount}`);
  console.log(`\nاقلامِ kind=monthly به تفکیکِ ماه (${byMonth.length} ماهِ متمایز):`);
  for (const r of byMonth) console.log(`  ${r._id || '(بدون ماه)'}  ×${r.n}`);
  console.log(`\nثبت‌نام‌های ماهانه: ${monthlyRegs}`);
  console.log(`ثبت‌نام‌های دارای مانده > 0: ${regsWithBalance}   |   مجموعِ مانده: ${regsBalanceSum[0]?.s ?? 0}`);
  console.log('\n⚠️ اگر kind=monthly روی چند ماهِ گذشته پخش است و شمارش‌شان بالاست،');
  console.log('   یعنی back-charge رخ داده — قبل از هر کارِ دیگر بگویید تا پاک‌سازی کنیم.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
