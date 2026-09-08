/* eslint-disable no-console */
/**
 * مهاجرتِ یک‌بارهٔ «یک ثبت‌نامِ ماندگار per شاگرد» برای مرکزِ موقت.
 *
 * برای هر شاگرد که بیش از یک ثبت‌نامِ فعال/تکمیل‌شده دارد:
 *   ۱) ثبت‌نامِ کانونی = قدیمی‌ترین (بر اساسِ registrationDate، بعد createdAt).
 *   ۲) فیسِ ماهانهٔ کانونی = فیسِ ثبت‌نامِ *جدیدترین* (قابلِ بازبینی در خروجی).
 *   ۳) همهٔ ShortTermPayment و ShortTermInvoice از ثبت‌نام‌های دیگر به کانونی
 *      وصل می‌شوند؛ خودِ آن ثبت‌نام‌ها status='merged' و رول‌آپ صفر.
 *   ۴) قلم‌های ماهانه از نو ساخته می‌شوند (کانونی، از ماهِ عضویت تا حوت)،
 *      پرداخت‌های ادغام‌شده به‌ترتیبِ تاریخ FIFO روی ماه‌ها، بعد recompute.
 *
 *   node backend/scripts/consolidateShortTermRegistrations.js            # DRY-RUN
 *   node backend/scripts/consolidateShortTermRegistrations.js --apply
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
const APPLY = process.argv.includes('--apply');
const N = (v) => Math.max(0, Number(v || 0));
const round = (v) => Math.round(N(v) * 100) / 100;

const ledger = require('../services/shortTermLedger');
const ShortTermRegistration = require('../models/ShortTermRegistration');
const ShortTermCharge = require('../models/ShortTermCharge');
const ShortTermPayment = require('../models/ShortTermPayment');
const ShortTermInvoice = require('../models/ShortTermInvoice');
require('../models/ShortTermStudent');
require('../models/ShortTermClass');

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log(`connected: ${MONGO_URI.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const regs = await ShortTermRegistration.find({ status: { $in: ['active', 'completed'] } })
    .sort({ registrationDate: 1, createdAt: 1 })
    .populate('studentId', 'fullName studentCode')
    .populate('classId', 'name')
    .lean();

  const byStudent = new Map();
  for (const r of regs) {
    const k = String(r.studentId?._id || r.studentId);
    if (!byStudent.has(k)) byStudent.set(k, []);
    byStudent.get(k).push(r);
  }

  const summary = { students: byStudent.size, consolidated: 0, merged: 0, paymentsMoved: 0, invoicesMoved: 0, rows: [] };

  for (const [, list] of byStudent) {
    if (list.length < 2) continue;
    const canonical = list[0];
    const extras = list.slice(1);
    const newest = list[list.length - 1];
    const monthlyFee = N(newest.feeAmount);
    const monthlyDiscount = N(newest.discountAmount);
    const who = `${canonical.studentId?.fullName || canonical.studentId?.studentCode} / ${canonical.classId?.name || '-'}`;

    const allRegIds = list.map((r) => r._id);
    const pays = await ShortTermPayment.find({ registrationId: { $in: allRegIds }, status: { $ne: 'void' } })
      .sort({ paidAt: 1, createdAt: 1 }).lean();
    const invCount = await ShortTermInvoice.countDocuments({ registrationId: { $in: extras.map((r) => r._id) } });
    const pooledPaid = round(pays.reduce((s, p) => s + N(p.amount), 0));

    const startKey = ledger.shamsiMonthKey(String(canonical.startDate || canonical.registrationDate).slice(0, 10));
    const horizon = ledger.ledgerHorizonKey(startKey, ledger.currentShamsiMonthKey());
    const monthCount = ledger.monthSpan(startKey, horizon);
    const billed = round(monthCount * Math.max(0, monthlyFee - monthlyDiscount));

    const row = {
      who,
      canonicalReg: String(canonical._id),
      canonicalStart: `${startKey} (${ledger.shamsiMonthLabel(startKey)})`,
      mergedRegs: extras.map((r) => `${String(r._id)} [${r.registrationDate} fee ${r.feeAmount}-${r.discountAmount}]`),
      proposedMonthlyFee: `${monthlyFee} - ${monthlyDiscount} = ${Math.max(0, monthlyFee - monthlyDiscount)}`,
      months: monthCount,
      pooledPayments: pooledPaid,
      billedToYearEnd: billed,
      projBalance: round(Math.max(0, billed - pooledPaid)),
      projCredit: round(Math.max(0, pooledPaid - billed))
    };
    summary.rows.push(row);
    summary.merged += extras.length;

    if (!APPLY) continue;

    // ---- APPLY ----
    const canDoc = await ShortTermRegistration.findById(canonical._id);
    canDoc.feeAmount = monthlyFee;
    canDoc.discountAmount = monthlyDiscount;
    canDoc.ledgerManaged = true;
    await canDoc.save();

    // پرداخت‌ها و بل‌های ثبت‌نام‌های اضافه → کانونی
    const pm = await ShortTermPayment.updateMany({ registrationId: { $in: extras.map((r) => r._id) } }, { $set: { registrationId: canonical._id } });
    const im = await ShortTermInvoice.updateMany({ registrationId: { $in: extras.map((r) => r._id) } }, { $set: { registrationId: canonical._id } });
    summary.paymentsMoved += pm.modifiedCount || 0;
    summary.invoicesMoved += im.modifiedCount || 0;

    // قلم‌های همهٔ ثبت‌نام‌های این شاگرد پاک؛ از نو روی کانونی
    await ShortTermCharge.deleteMany({ registrationId: { $in: allRegIds } });
    await ledger.generateChargesForRegistration(canDoc, { dueDay: 20 });

    // FIFO پرداخت‌های ادغام‌شده روی ماه‌های کانونی
    const fresh = await ShortTermCharge.find({ registrationId: canonical._id, status: { $ne: 'void' } }).sort({ dueDate: 1, periodKey: 1, createdAt: 1 });
    const state = fresh.map((c) => ({ _id: c._id, net: round(N(c.amount) - N(c.discountAmount)), paid: 0, periodKey: c.periodKey }));
    for (const pLean of pays) {
      const p = await ShortTermPayment.findById(pLean._id);
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
      p.coveredMonths = allocs.map((a) => (state.find((s) => String(s._id) === String(a.chargeId)) || {}).periodKey).filter(Boolean);
      await p.save();
      await ShortTermInvoice.updateMany({ paymentId: p._id }, { $set: { coveredMonths: p.coveredMonths } });
    }
    await ledger.recomputeRegistration(canonical._id);

    // ثبت‌نام‌های اضافه → merged، رول‌آپ صفر
    for (const ex of extras) {
      await ShortTermRegistration.updateOne(
        { _id: ex._id },
        { $set: { status: 'merged', ledgerManaged: true, totalPayable: 0, paidAmount: 0, balance: 0, paymentStatus: 'unpaid' } }
      );
    }
    summary.consolidated += 1;
  }

  console.log('==== نتیجه ====');
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY) console.log('\nحالتِ DRY-RUN. برای اعمال: --apply');
  await mongoose.disconnect();
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
