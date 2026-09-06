// دفترِ ماهانهٔ مرکزِ موقت — قلمِ فیس per ماهِ شمسی، تخصیصِ FIFOِ پرداخت‌ها،
// و رول‌آپِ ثبت‌نام. الگو: services/academyLedger.js — نسخهٔ ساده‌شده برای
// ثبت‌نامِ «مدت‌دار» (durationMonths ماه از تاریخِ ثبت).
const ShortTermCharge = require('../models/ShortTermCharge');
const ShortTermRegistration = require('../models/ShortTermRegistration');
const ShortTermPayment = require('../models/ShortTermPayment');
const { gregorianToAfghanSolar, afghanSolarToGregorianInput } = require('../utils/afghanDate');

const num = (v) => Math.max(0, Number(v || 0));
const round = (v) => Math.round(num(v) * 100) / 100;
const todayKey = () => new Date().toISOString().slice(0, 10);

const chargeNet = (c) => round(num(c.amount) - num(c.discountAmount));
const chargeOpen = (c) => round(chargeNet(c) - num(c.paidAmount));

/** آیا این قلم معوق است؟ (balance>0 و سررسید گذشته) — حالتِ محاسبه‌ای. */
const isOverdue = (c, today = todayKey()) => (
  c.status !== 'void'
  && chargeNet(c) - num(c.paidAmount) > 0.001
  && Boolean(c.dueDate)
  && String(c.dueDate) < String(today)
);

/** کلیدِ ماهِ شمسیِ یک تاریخِ میلادی: «1405-06» */
function shamsiMonthKey(dateLike = new Date()) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const solar = gregorianToAfghanSolar(Number.isNaN(d.getTime()) ? new Date() : d);
  if (!solar) return '';
  return `${solar.jy}-${String(solar.jm).padStart(2, '0')}`;
}

/** ماهِ شمسیِ بعد از «jy-jm». */
function bumpShamsiMonth(key) {
  const [jy, jm] = String(key).split('-').map(Number);
  if (!jy || !jm) return key;
  return jm >= 12 ? `${jy + 1}-01` : `${jy}-${String(jm + 1).padStart(2, '0')}`;
}

/** سررسیدِ میلادی برای «روزِ dueDay از ماهِ شمسیِ periodKey». */
function monthlyDueDateISO(periodKey, dueDay = 20) {
  const [jy, jm] = String(periodKey).split('-').map(Number);
  if (!jy || !jm) return '';
  let day = Math.min(31, Math.max(1, Math.round(Number(dueDay) || 20)));
  for (; day >= 1; day -= 1) {
    const iso = afghanSolarToGregorianInput(jy, jm, day);
    if (typeof iso === 'string' && iso) return iso.slice(0, 10);
  }
  return '';
}

/** آرایهٔ N کلیدِ ماهِ شمسیِ پیاپی از fromKey (شامل). */
function monthKeysFrom(fromKey, count) {
  const out = [];
  let k = fromKey;
  for (let i = 0; i < Math.max(0, count) && k; i += 1) {
    out.push(k);
    k = bumpShamsiMonth(k);
  }
  return out;
}

/**
 * قلم‌های ماهانهٔ یک ثبت‌نام را می‌سازد: durationMonths ماهِ پیاپی از ماهِ شمسیِ
 * registrationDate. idempotent — ماهی که قلم دارد رد می‌شود.
 * @returns {Promise<{ created:number }>}
 */
async function generateChargesForRegistration(reg, { dueDay = 20 } = {}) {
  if (!reg) return { created: 0 };
  const anchorISO = String(reg.registrationDate || reg.startDate || '').slice(0, 10) || todayKey();
  const anchorKey = shamsiMonthKey(anchorISO);
  const months = monthKeysFrom(anchorKey, Math.max(1, Number(reg.durationMonths) || 1));
  const monthlyFee = round(num(reg.feeAmount));
  const monthlyDiscount = Math.min(monthlyFee, round(num(reg.discountAmount)));
  let created = 0;
  for (const periodKey of months) {
    const exists = await ShortTermCharge.findOne({ registrationId: reg._id, periodKey }).lean();
    if (exists) continue;
    try {
      await ShortTermCharge.create({
        registrationId: reg._id,
        studentId: reg.studentId,
        kind: 'monthly',
        title: `فیس ماه ${periodKey}`,
        periodKey,
        amount: monthlyFee,
        discountAmount: monthlyDiscount,
        dueDate: monthlyDueDateISO(periodKey, dueDay),
        currency: 'AFN',
        createdBy: reg.createdBy || null
      });
      created += 1;
    } catch (error) {
      if (!(error && error.code === 11000)) throw error;
    }
  }
  return { created };
}

/**
 * paidAmount/balance/status هر قلمِ غیرِ ابطالیِ یک ثبت‌نام را از allocationهای
 * پرداخت‌های فعال بازمی‌سازد، سپس totalPayable/paidAmount/balance را روی ثبت‌نام رول‌آپ می‌کند.
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function recomputeRegistration(registrationId) {
  const reg = await ShortTermRegistration.findById(registrationId);
  if (!reg) return null;

  const [charges, payments] = await Promise.all([
    ShortTermCharge.find({ registrationId, status: { $ne: 'void' } }).sort({ dueDate: 1, periodKey: 1, createdAt: 1 }),
    ShortTermPayment.find({ registrationId, status: { $ne: 'void' } })
  ]);

  const paidByCharge = new Map();
  for (const p of payments) {
    for (const alloc of p.allocations || []) {
      const key = String(alloc.chargeId);
      paidByCharge.set(key, round((paidByCharge.get(key) || 0) + num(alloc.amount)));
    }
  }

  let totalNet = 0;
  let totalPaid = 0;
  for (const c of charges) {
    const net = chargeNet(c);
    const paid = Math.min(net, paidByCharge.get(String(c._id)) || 0);
    c.paidAmount = round(paid);
    c.balance = round(net - paid);
    c.status = c.balance <= 0 && net > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
    await c.save();
    totalNet += net;
    totalPaid += paid;
  }
  // پرداختِ مازاد بر مجموعِ قلم‌ها (اعتبار) هم در paidAmount شمرده می‌شود
  const allPaid = round(payments.reduce((s, p) => s + num(p.amount), 0));

  reg.ledgerManaged = true;
  reg.totalPayable = round(totalNet);
  reg.paidAmount = round(Math.max(totalPaid, allPaid));
  reg.balance = round(Math.max(0, totalNet - totalPaid));
  reg.paymentStatus = reg.balance <= 0 && reg.totalPayable > 0 ? 'paid' : reg.paidAmount > 0 ? 'partial' : 'unpaid';
  await reg.save();
  return reg;
}

/**
 * یک مبلغ را به‌روشِ FIFO (قدیمی‌ترین سررسیدِ باز اول) روی قلم‌های یک ثبت‌نام تخصیص می‌دهد.
 * @param {number} amount
 * @param {Array} openCharges قلم‌های غیرِ ابطالی با paidAmountِ به‌روز
 * @returns {{ allocations: Array<{chargeId, amount}>, unallocated: number }}
 */
function fifoAllocate(amount, openCharges = []) {
  let left = round(amount);
  const allocations = [];
  for (const c of openCharges) {
    if (left <= 0) break;
    const open = chargeOpen(c);
    if (open <= 0) continue;
    const take = round(Math.min(open, left));
    allocations.push({ chargeId: c._id, amount: take });
    left = round(left - take);
  }
  return { allocations, unallocated: round(left) };
}

module.exports = {
  num,
  round,
  todayKey,
  shamsiMonthKey,
  bumpShamsiMonth,
  monthlyDueDateISO,
  monthKeysFrom,
  chargeNet,
  chargeOpen,
  isOverdue,
  generateChargesForRegistration,
  recomputeRegistration,
  fifoAllocate
};
