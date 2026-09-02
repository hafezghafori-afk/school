// دفترِ مالیِ آموزشگاه — منطقِ اقلامِ بدهی، تخصیصِ پرداخت و رول‌آپِ ثبت‌نام.
// همهٔ مسیرهایی که charge/payment می‌سازند یا ابطال می‌کنند باید بعدش
// recomputeRegistration را صدا بزنند تا اعدادِ ثبت‌نام یک‌دست بمانند.

const AcademyCharge = require('../models/AcademyCharge');
const AcademyRegistration = require('../models/AcademyRegistration');
const AcademyPayment = require('../models/AcademyPayment');
const { gregorianToAfghanSolar } = require('../utils/afghanDate');

const num = (value) => Math.max(0, Number(value || 0));
const round = (value) => Math.round(num(value) * 100) / 100;
const todayKey = () => new Date().toISOString().slice(0, 10);

const CHARGE_TITLE_FALLBACK = 'قلم';

const chargeNet = (charge) => round(num(charge.amount) - num(charge.discountAmount));
const chargeOpen = (charge) => round(chargeNet(charge) - num(charge.paidAmount));

/** آیا این قلم معوق است؟ (balance>0 و سررسید گذشته) — حالتِ محاسبه‌ای، ذخیره نمی‌شود. */
const isOverdue = (charge, today = todayKey()) => (
  charge.status !== 'void'
  && chargeNet(charge) - num(charge.paidAmount) > 0.001
  && Boolean(charge.dueDate)
  && String(charge.dueDate) < String(today)
);

/** کلیدِ ماهِ شمسیِ یک تاریخِ میلادی: «1405-07» */
function shamsiMonthKey(dateLike = new Date()) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const solar = gregorianToAfghanSolar(Number.isNaN(d.getTime()) ? new Date() : d);
  if (!solar) return '';
  return `${solar.jy}-${String(solar.jm).padStart(2, '0')}`;
}

/** تاریخِ سررسیدِ میلادی برای «روزِ dueDay از ماهِ شمسیِ periodKey». اگر روز در آن ماه
 *  معتبر نبود (مثلاً ۳۱ در ماه‌های ۷ تا ۱۲) تا رسیدن به یک روزِ معتبر کم می‌کند. */
function monthlyDueDateISO(periodKey, dueDay = 20) {
  const [jy, jm] = String(periodKey).split('-').map(Number);
  if (!jy || !jm) return '';
  const { afghanSolarToGregorianInput } = require('../utils/afghanDate');
  let day = Math.min(31, Math.max(1, Math.round(Number(dueDay) || 20)));
  for (; day >= 1; day -= 1) {
    const iso = afghanSolarToGregorianInput(jy, jm, day);
    if (typeof iso === 'string' && iso) return iso.slice(0, 10);
  }
  return '';
}

/**
 * paidAmount/balance/status هر قلمِ غیرِ ابطالیِ یک ثبت‌نام را از allocationهای
 * پرداخت‌های فعال بازمی‌سازد، سپس totalPayable/paidAmount/balance را روی ثبت‌نام رول‌آپ می‌کند.
 * @returns {Promise<import('mongoose').Document|null>} سندِ ثبت‌نامِ به‌روزشده
 */
async function recomputeRegistration(registrationId) {
  const reg = await AcademyRegistration.findById(registrationId);
  if (!reg) return null;

  const [charges, payments] = await Promise.all([
    AcademyCharge.find({ registrationId, status: { $ne: 'void' } }).sort({ dueDate: 1, createdAt: 1 }),
    AcademyPayment.find({ registrationId, status: { $ne: 'void' } })
  ]);

  const paidByCharge = new Map();
  for (const payment of payments) {
    for (const alloc of payment.allocations || []) {
      const key = String(alloc.chargeId);
      paidByCharge.set(key, round((paidByCharge.get(key) || 0) + num(alloc.amount)));
    }
  }

  let totalNet = 0;
  let totalPaid = 0;
  for (const charge of charges) {
    const net = chargeNet(charge);
    const paid = Math.min(net, paidByCharge.get(String(charge._id)) || 0);
    charge.paidAmount = round(paid);
    charge.balance = round(net - paid);
    charge.status = charge.balance <= 0 && net > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
    await charge.save();
    totalNet += net;
    totalPaid += paid;
  }

  reg.ledgerManaged = true;
  reg.totalPayable = round(totalNet);
  reg.paidAmount = round(totalPaid);
  reg.balance = round(Math.max(0, totalNet - totalPaid));
  reg.updatedBy = reg.updatedBy || null;
  await reg.save();
  return reg;
}

/**
 * یک مبلغ را به‌روشِ FIFO (قدیمی‌ترین سررسیدِ باز اول) روی اقلامِ یک ثبت‌نام تخصیص می‌دهد.
 * @param {number} amount
 * @param {Array} openCharges اقلامِ غیرِ ابطالی (باید paidAmountِ به‌روز داشته باشند)
 * @returns {{ allocations: Array<{chargeId, amount}>, unallocated: number }}
 */
function fifoAllocate(amount, openCharges = []) {
  let left = round(amount);
  const allocations = [];
  for (const charge of openCharges) {
    if (left <= 0) break;
    const open = chargeOpen(charge);
    if (open <= 0) continue;
    const take = round(Math.min(open, left));
    allocations.push({ chargeId: charge._id, amount: take });
    left = round(left - take);
  }
  return { allocations, unallocated: round(left) };
}

/**
 * شارژِ ماهانهٔ ماه‌های سررسیدشده را برای ثبت‌نام‌های فعالِ ماهانه می‌سازد (idempotent).
 * @param {{ dueDay?: number, registrationId?: string }} [opts]
 * @returns {Promise<{ created: number, registrations: number }>}
 */
async function generateMonthlyCharges({ dueDay = 20, registrationId = null } = {}) {
  const filter = {
    paymentPlan: 'monthly',
    status: 'active',
    monthlyFee: { $gt: 0 }
  };
  if (registrationId) filter._id = registrationId;

  const regs = await AcademyRegistration.find(filter)
    .populate('courseId', 'name')
    .populate('classId', 'name');

  const nowKey = shamsiMonthKey(new Date());
  let created = 0;
  const touched = new Set();

  for (const reg of regs) {
    // از ماهِ startDate (یا ثبت‌نام) تا ماهِ جاری، هر ماهی که هنوز شارژ نشده
    const startISO = String(reg.startDate || reg.registrationDate || '').slice(0, 10) || todayKey();
    const endISO = String(reg.endDate || '').slice(0, 10);
    let cursorKey = shamsiMonthKey(startISO);
    // نگذار بیش از ۳۶ ماه عقب برود (محافظ)
    let guard = 0;
    while (cursorKey <= nowKey && guard < 36) {
      guard += 1;
      const dueISO = monthlyDueDateISO(cursorKey, dueDay);
      if (endISO && dueISO && dueISO > endISO) break;

      const exists = await AcademyCharge.findOne({ registrationId: reg._id, kind: 'monthly', periodKey: cursorKey }).lean();
      if (!exists) {
        try {
          await AcademyCharge.create({
            registrationId: reg._id,
            studentId: reg.studentId,
            kind: 'monthly',
            title: `فیس ماهانه ${cursorKey}`,
            amount: num(reg.monthlyFee),
            dueDate: dueISO,
            periodKey: cursorKey,
            currency: reg.currency || 'AFN',
            createdBy: null
          });
          created += 1;
          touched.add(String(reg._id));
        } catch (error) {
          // رقابتِ هم‌زمان روی ایندکسِ یکتا — بی‌خطر
          if (!(error && error.code === 11000)) throw error;
        }
      }
      // ماهِ بعدِ شمسی
      const [jy, jm] = cursorKey.split('-').map(Number);
      cursorKey = jm >= 12 ? `${jy + 1}-01` : `${jy}-${String(jm + 1).padStart(2, '0')}`;
    }

    if (String(reg.lastMonthlyChargeKey || '') !== nowKey) {
      reg.lastMonthlyChargeKey = nowKey;
      await reg.save();
    }
  }

  for (const id of touched) {
    await recomputeRegistration(id);
  }

  return { created, registrations: touched.size };
}

/**
 * برای هر قلمِ بازِ معوق که «graceDays» از سررسیدش گذشته و هنوز جریمهٔ دیرکرد نگرفته،
 * یک قلمِ late_fee می‌سازد. idempotent — با کلیدِ `lf:<chargeId>` در periodKey.
 * @param {{ mode:'fixed'|'percent', amount:number, graceDays:number }} policy
 * @returns {Promise<{ created:number }>}
 */
async function generateLateFees({ mode = 'none', amount = 0, graceDays = 7 } = {}) {
  if (mode !== 'fixed' && mode !== 'percent') return { created: 0 };
  const today = todayKey();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - Math.max(0, Number(graceDays) || 0));
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const overdue = await AcademyCharge.find({
    status: { $in: ['pending', 'partial'] },
    kind: { $ne: 'late_fee' },
    balance: { $gt: 0 },
    dueDate: { $gt: '', $lte: cutoffKey }
  });

  let created = 0;
  const touched = new Set();
  for (const c of overdue) {
    const marker = `lf:${c._id}`;
    const exists = await AcademyCharge.findOne({ registrationId: c.registrationId, kind: 'late_fee', periodKey: marker }).lean();
    if (exists) continue;
    const fee = mode === 'percent'
      ? round((round(num(c.amount) - num(c.discountAmount))) * num(amount) / 100)
      : round(num(amount));
    if (fee <= 0) continue;
    await AcademyCharge.create({
      registrationId: c.registrationId, studentId: c.studentId, kind: 'late_fee',
      title: `جریمهٔ دیرکرد — ${c.title || CHARGE_TITLE_FALLBACK}`,
      amount: fee, dueDate: today, periodKey: marker,
      currency: c.currency || 'AFN', createdBy: null,
      note: `خودکار — سررسیدِ ${c.dueDate} گذشته`
    });
    created += 1;
    touched.add(String(c.registrationId));
  }
  for (const id of touched) await recomputeRegistration(id);
  return { created };
}

module.exports = {
  num,
  round,
  todayKey,
  generateLateFees,
  chargeNet,
  chargeOpen,
  isOverdue,
  shamsiMonthKey,
  monthlyDueDateISO,
  recomputeRegistration,
  fifoAllocate,
  generateMonthlyCharges
};
