/**
 * موردِ خاص — لائبه نیازی (STD-05-000012)، صنف هشتم.
 *
 * پس از ادغامِ ثبت‌نام‌های تکراری، ثبت‌نامِ نگه‌داشته `6a8921c9526463669dc14a61`
 * دو پرداختِ ۱۶۰۰ دارد («فیس ماه اسد» + «فیس ماه سنبله») ولی totalPayable آن
 * یک‌ماهه (۱۶۰۰) مانده، پس ۱۶۰۰ به‌اشتباه «مازاد» نشان داده می‌شود.
 *
 * حقیقت: پول درست جمع شده — او برای ۲ ماه فیس داده. بازپرداخت/لغو لازم نیست.
 * اصلاح: قابل‌پرداخت را ۲ ماهه کن تا تراز صفر شود.
 *   feeAmount 2000→4000 ، discountAmount 400→800 ⇒ totalPayable 3200 ، balance 0
 *   durationMonths 1→2
 *
 *   node backend/scripts/fixLaibaShortTermTwoMonthFee.js --uri="..." --dns=8.8.8.8          # DRY-RUN
 *   node backend/scripts/fixLaibaShortTermTwoMonthFee.js --uri="..." --dns=8.8.8.8 --apply
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const argv = process.argv.slice(2);
const arg = (n) => { for (let i = 0; i < argv.length; i += 1) { const t = String(argv[i] || ''); if (t === `--${n}`) return String(argv[i + 1] ?? '').trim(); if (t.startsWith(`--${n}=`)) return t.slice(n.length + 3).trim(); } return ''; };
const hasFlag = (n) => argv.includes(`--${n}`);

const REG_ID = '6a8921c9526463669dc14a61';
const TARGET = { feeAmount: 4000, discountAmount: 800, durationMonths: 2, note: '۲ ماه: اسد + سنبله (اصلاح پس از ادغام تکراری‌ها ۱۴۰۵/۰۶/۱۵)' };

async function run() {
  const APPLY = hasFlag('apply');
  const uri = arg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school';
  const d = arg('dns'); if (d) { dns.setServers(d.split(',').map((s) => s.trim())); console.log(`DNS: ${dns.getServers().join(', ')}`); }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
  const db = mongoose.connection.useDb(String(process.env.SHORT_TERM_DB_NAME || 'short_term_center_db'));
  const R = db.collection('shorttermregistrations');
  const P = db.collection('shorttermpayments');
  const _id = new mongoose.Types.ObjectId(REG_ID);

  const reg = await R.findOne({ _id });
  if (!reg) { console.error('ثبت‌نام پیدا نشد.'); process.exit(1); }
  const pays = await P.find({ registrationId: _id }).sort({ paidAt: 1 }).toArray();
  const paid = pays.reduce((s, p) => s + Number(p.amount || 0), 0);

  console.log('قبل:', JSON.stringify({ status: reg.status, feeAmount: reg.feeAmount, discountAmount: reg.discountAmount, totalPayable: reg.totalPayable, paidAmount: reg.paidAmount, balance: reg.balance, durationMonths: reg.durationMonths }));
  console.log('پرداخت‌ها:', pays.map((p) => `${p.paymentNumber} ${p.amount} «${p.note || ''}»`).join('  |  '), `  جمع=${paid}`);

  const newPayable = TARGET.feeAmount - TARGET.discountAmount;
  const newBalance = Math.max(0, newPayable - paid);
  const newStatus = newBalance <= 0 && newPayable > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  console.log('\nبعد (پیش‌بینی):', JSON.stringify({ feeAmount: TARGET.feeAmount, discountAmount: TARGET.discountAmount, totalPayable: newPayable, paidAmount: paid, balance: newBalance, paymentStatus: newStatus, durationMonths: TARGET.durationMonths }));
  console.log(newBalance === 0 ? '✅ تراز صفر — مازاد از بین می‌رود.' : `⚠️ مانده ${newBalance}`);

  if (APPLY) {
    await R.updateOne({ _id }, { $set: {
      feeAmount: TARGET.feeAmount, discountAmount: TARGET.discountAmount,
      totalPayable: newPayable, paidAmount: paid, balance: newBalance,
      paymentStatus: newStatus, durationMonths: TARGET.durationMonths,
      note: `${String(reg.note || '').trim()} | ${TARGET.note}`.replace(/^\s*\|\s*/, '')
    } });
    console.log('\n✅ اعمال شد.');
  } else {
    console.log('\nDRY-RUN. برای اعمال: --apply');
  }
  await mongoose.disconnect();
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
