/* eslint-disable no-console */
/**
 * «یک ثبت‌نامِ ماندگار per شاگرد» برای آموزشگاه. برای هر شاگرد که بیش از یک
 * ثبت‌نامِ فعال/تکمیل‌شده در یک کورس دارد:
 *  ۱) ثبت‌نامِ کانونی = قدیمی‌ترین (registrationDate، بعد createdAt).
 *  ۲) monthlyFee = فیسِ جدیدترین ثبت‌نام.
 *  ۳) AcademyPayment + AcademyInvoice + قلم‌های غیرِ‌ماهانه → کانونی؛ بقیه merged.
 *  ۴) قلم‌های ماهانه از نو صادر (کانونی، از ماهِ عضویت تا ماهِ جاری)، پرداخت‌ها FIFO.
 *
 *  node backend/scripts/consolidateAcademyRegistrations.js            # DRY-RUN
 *  node backend/scripts/consolidateAcademyRegistrations.js --apply
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
const AcademyInvoice = require('../models/AcademyInvoice');
require('../models/AcademyStudent');
require('../models/AcademyCourse');
require('../models/AcademyClass');

function anchorKeyOf(reg) {
  const regISO = String(reg.registrationDate || '').slice(0, 10);
  const sISO = String(reg.startDate || '').slice(0, 10);
  const startISO = (sISO && regISO && sISO > regISO) ? sISO : (regISO || sISO || L.todayKey());
  return L.shamsiMonthKey(startISO);
}

(async () => {
  await mongoose.connect(MONGO_URI);
  const cur = L.currentShamsiMonthKey();
  console.log(`connected  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}  |  ماهِ جاری: ${cur}\n`);

  const regs = await AcademyRegistration.find({ status: { $in: ['active', 'completed'] } })
    .sort({ registrationDate: 1, createdAt: 1 })
    .populate('studentId', 'fullName studentCode')
    .populate('courseId', 'name').lean();

  const byKey = new Map();
  for (const r of regs) {
    const k = `${String(r.studentId?._id || r.studentId)}::${String(r.courseId?._id || r.courseId)}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  }

  const summary = { groups: byKey.size, consolidated: 0, merged: 0, rows: [] };
  for (const [, list] of byKey) {
    if (list.length < 2) continue;
    const canonical = list[0];
    const extras = list.slice(1);
    const newest = list[list.length - 1];
    const monthlyFee = N(newest.monthlyFee) || N(newest.feeAmount);
    const who = `${canonical.studentId?.fullName || canonical._id} / ${canonical.courseId?.name || '-'}`;
    const allRegIds = list.map((r) => r._id);
    const pays = await AcademyPayment.find({ registrationId: { $in: allRegIds }, status: { $ne: 'void' } }).sort({ paidAt: 1, createdAt: 1 }).lean();
    summary.rows.push({
      who, canonical: String(canonical._id), anchor: anchorKeyOf(canonical),
      merged: extras.map((r) => String(r._id)), proposedMonthlyFee: monthlyFee,
      pooledPayments: round(pays.reduce((s, p) => s + N(p.amount), 0))
    });
    summary.merged += extras.length;
    if (!APPLY) continue;

    const canDoc = await AcademyRegistration.findById(canonical._id);
    canDoc.paymentPlan = 'monthly';
    canDoc.monthlyFee = monthlyFee;
    canDoc.ledgerManaged = true;
    await canDoc.save();

    await AcademyPayment.updateMany({ registrationId: { $in: extras.map((r) => r._id) } }, { $set: { registrationId: canonical._id } });
    await AcademyInvoice.updateMany({ registrationId: { $in: extras.map((r) => r._id) } }, { $set: { registrationId: canonical._id } });
    // قلم‌های غیرماهانهٔ اضافه → کانونی؛ قلم‌های ماهانه پاک (از نو صادر می‌شوند)
    await AcademyCharge.deleteMany({ registrationId: { $in: allRegIds }, kind: 'monthly' });
    await AcademyCharge.updateMany({ registrationId: { $in: extras.map((r) => r._id) } }, { $set: { registrationId: canonical._id } });

    // صدورِ بلِ ماهانه از ماهِ عضویت تا ماهِ جاری
    let k = anchorKeyOf(canonical);
    let guard = 0;
    while (L.monthOrdinal(k) <= L.monthOrdinal(cur) && guard < 60) {
      await L.issueBillForMonth(canDoc, k, { dueDay: 20, issuedBy: null });
      k = L.bumpShamsiMonth(k); guard += 1;
    }
    // FIFO پرداخت‌های ادغام‌شده
    for (const pLean of pays) {
      const p = await AcademyPayment.findById(pLean._id);
      const open = await AcademyCharge.find({ registrationId: canonical._id, status: { $ne: 'void' } }).sort({ dueDate: 1, periodKey: 1, createdAt: 1 });
      const { allocations } = L.fifoAllocate(p.amount, open);
      p.allocations = allocations;
      p.coveredMonths = allocations.map((a) => (open.find((c) => String(c._id) === String(a.chargeId)) || {}).periodKey).filter(Boolean);
      await p.save();
      await L.recomputeRegistration(canonical._id);
    }
    await L.recomputeRegistration(canonical._id);
    for (const ex of extras) {
      await AcademyRegistration.updateOne({ _id: ex._id }, { $set: { status: 'merged', ledgerManaged: true, totalPayable: 0, paidAmount: 0, balance: 0 } });
    }
    summary.consolidated += 1;
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY) console.log('\nDRY-RUN. برای اعمال: --apply');
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
