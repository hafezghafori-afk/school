// دفترِ ماهانهٔ مرکزِ موقت — یک قلمِ فیس per (شاگرد، ماهِ شمسی)، رول‌شونده از
// ماهِ عضویتِ شاگرد تا ماهِ جاری، تخصیصِ پرداخت‌ها (ماهِ مشخص یا FIFO)، و
// رول‌آپِ ثبت‌نام. فیسِ ماهانه ثابت است (روی ثبت‌نامِ کانونیِ شاگرد).
const ShortTermCharge = require('../models/ShortTermCharge');
const ShortTermRegistration = require('../models/ShortTermRegistration');
const ShortTermPayment = require('../models/ShortTermPayment');
const ShortTermExpense = require('../models/ShortTermExpense');
const { gregorianToAfghanSolar, afghanSolarToGregorianInput, AFGHAN_SOLAR_MONTHS } = require('../utils/afghanDate');

const num = (v) => Math.max(0, Number(v || 0));
const round = (v) => Math.round(num(v) * 100) / 100;
const todayKey = () => new Date().toISOString().slice(0, 10);

// سقفِ سختِ تعدادِ قلم‌های ماهانهٔ یک ثبت‌نام — جلوی انفجارِ ردیف را می‌گیرد
// وقتی startDate خراب باشد (مثلاً تاریخِ شمسی در فیلدِ میلادی → سالِ ۷۸۰).
const MAX_LEDGER_MONTHS = 60;

/** کلیدِ ماهِ شمسیِ جاری، مثلِ «1405-06». */
const currentShamsiMonthKey = () => shamsiMonthKey(new Date());

/** «1405-06» → «سنبله ۱۴۰۵» (نامِ ماه + سالِ فارسی). */
function shamsiMonthLabel(periodKey) {
  const [jy, jm] = String(periodKey || '').split('-').map(Number);
  if (!jy || !jm || jm < 1 || jm > 12) return String(periodKey || '');
  const name = AFGHAN_SOLAR_MONTHS[jm - 1] || String(jm);
  let year = String(jy);
  try { year = Number(jy).toLocaleString('fa-AF', { useGrouping: false }); } catch { /* keep latin */ }
  return `${name} ${year}`;
}

/** شمارهٔ ترتیبیِ یک ماهِ شمسی (jy*12+jm) — برای مقایسه و فاصله. */
function monthOrdinal(key) {
  const [jy, jm] = String(key || '').split('-').map(Number);
  return (jy && jm) ? (jy * 12) + jm : 0;
}

/** تعدادِ ماه‌های شاملِ fromKey تا toKey (هر دو شامل)؛ حداقل ۱. */
function monthSpan(fromKey, toKey) {
  const a = monthOrdinal(fromKey);
  const b = monthOrdinal(toKey);
  if (!a) return 1;
  if (!b || b < a) return 1;
  return (b - a) + 1;
}

/** «آخرِ سالِ شمسی» برای دفتر: حوت (ماه ۱۲) از بزرگ‌ترینِ سالِ لنگر و سالِ جاری. */
function ledgerHorizonKey(anchorKey, curKey = currentShamsiMonthKey()) {
  const ay = Number(String(anchorKey || '').split('-')[0]) || 0;
  const cy = Number(String(curKey || '').split('-')[0]) || 0;
  const y = Math.max(ay, cy) || cy || ay;
  return `${y}-12`;
}

/** بازهٔ میلادیِ [شروع، پایانِ انحصاری) یک ماهِ شمسی، به‌شکلِ 'YYYY-MM-DD'. */
function monthGregorianRange(periodKey) {
  const [jy, jm] = String(periodKey || '').split('-').map(Number);
  if (!jy || !jm) return null;
  const nextJy = jm >= 12 ? jy + 1 : jy;
  const nextJm = jm >= 12 ? 1 : jm + 1;
  const startISO = afghanSolarToGregorianInput(jy, jm, 1);
  const endISO = afghanSolarToGregorianInput(nextJy, nextJm, 1);
  if (typeof startISO !== 'string' || typeof endISO !== 'string') return null;
  return { startISO: startISO.slice(0, 10), endExclusiveISO: endISO.slice(0, 10) };
}

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
 * قلم‌های ماهانهٔ یک ثبت‌نام را می‌سازد/به‌روز می‌کند: یک قلم per ماهِ شمسی،
 * از ماهِ عضویتِ شاگرد (startDate) تا `untilKey` (پیش‌فرض: ماهِ جاری). ماهِ
 * نیامده ساخته نمی‌شود. فیس/تخفیفِ هر ماه = فیسِ ماهانهٔ ثابتِ ثبت‌نام.
 *  - ماهِ بدونِ قلم → قلمِ تازه.
 *  - ماهِ با قلمِ زندهٔ پرداخت‌نشده → مبلغ/تخفیف/سررسید به مقدارِ تازه به‌روز می‌شود.
 *  - ماهِ با قلمِ ابطالی (از ویرایشِ مالیِ قبلی) → قلم دوباره زنده و به‌روز می‌شود.
 *  - ماهِ با قلمی که پرداخت خورده → دست‌نخورده.
 * (ایندکسِ یکتا اجازهٔ دو قلم برای یک (ثبت‌نام، ماه) را نمی‌دهد، پس همیشه
 * همان یک ردیف به‌روز می‌شود نه ساختِ ردیفِ تازه.)
 * @returns {Promise<{ created:number, revived:number, updated:number, months:string[], anchorInvalid:boolean }>}
 */
async function generateChargesForRegistration(reg, { dueDay = 20, untilKey = '' } = {}) {
  if (!reg) return { created: 0, months: [], anchorInvalid: false };
  // لنگرِ شروع = بزرگ‌ترینِ (ماهِ «تاریخ شروع»، ماهِ «تاریخ ثبت») — ماهِ پیش از
  // ثبت‌نام هیچ‌وقت قلم نمی‌گیرد.
  const startMonthKey = shamsiMonthKey(String(reg.startDate || '').slice(0, 10) || todayKey());
  const regMonthKey = shamsiMonthKey(String(reg.registrationDate || '').slice(0, 10) || todayKey());
  const cur = currentShamsiMonthKey();
  const curOrd = monthOrdinal(cur);
  const startOrd = monthOrdinal(startMonthKey);
  const regOrd = monthOrdinal(regMonthKey);
  // اگر یکی خراب بود، از سالمِ دیگر استفاده کن؛ اگر هر دو خراب، ماهِ جاری.
  const validStart = startOrd && startOrd >= curOrd - MAX_LEDGER_MONTHS && startOrd <= curOrd + 1 ? startOrd : 0;
  const validReg = regOrd && regOrd >= curOrd - MAX_LEDGER_MONTHS && regOrd <= curOrd + 1 ? regOrd : 0;
  const anchorInvalid = !validStart && !validReg;
  const anchorKey = validStart >= validReg && validStart
    ? startMonthKey
    : (validReg ? regMonthKey : cur);
  const startKey = anchorInvalid ? cur : anchorKey;
  // افقِ دفتر = ماهِ صریح اگر داده شده، وگرنه آخرِ سالِ شمسی (حوت) — «تا آخرِ
  // سال از هر ماه باقی نشان بده».
  const until = String(untilKey || '').trim() || ledgerHorizonKey(startKey, cur);
  const span = Math.max(1, Math.min(MAX_LEDGER_MONTHS, monthSpan(startKey, until)));
  const months = monthKeysFrom(startKey, span);
  const monthlyFee = round(num(reg.feeAmount));
  const monthlyDiscount = Math.min(monthlyFee, round(num(reg.discountAmount)));
  let created = 0;
  let revived = 0;
  let updated = 0;
  for (const periodKey of months) {
    const existing = await ShortTermCharge.findOne({ registrationId: reg._id, periodKey });
    if (!existing) {
      try {
        await ShortTermCharge.create({
          registrationId: reg._id,
          studentId: reg.studentId,
          kind: 'monthly',
          title: `فیسِ ماهِ ${shamsiMonthLabel(periodKey)}`,
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
      continue;
    }
    // قلمی که پرداخت خورده دست‌نخورده می‌ماند
    if (num(existing.paidAmount) > 0) continue;
    const wasVoid = existing.status === 'void';
    existing.status = 'pending';
    existing.voidedAt = null;
    existing.voidReason = '';
    existing.amount = monthlyFee;
    existing.discountAmount = monthlyDiscount;
    existing.title = `فیسِ ماهِ ${shamsiMonthLabel(periodKey)}`;
    if (!existing.dueDate) existing.dueDate = monthlyDueDateISO(periodKey, dueDay);
    await existing.save();
    if (wasVoid) revived += 1; else updated += 1;
  }
  // قلم‌های بیرونِ بازه (پیش از ماهِ لنگر یا بعد از افقِ سال) که پرداخت نخورده‌اند
  // باطل می‌شوند — «بلِ ماهِ پیش از ثبت‌نام باید لغو شود».
  let voided = 0;
  if (months.length) {
    const stale = await ShortTermCharge.find({
      registrationId: reg._id,
      status: { $ne: 'void' },
      paidAmount: { $lte: 0 },
      periodKey: { $nin: months }
    });
    for (const c of stale) {
      c.status = 'void';
      c.voidedAt = new Date();
      c.voidReason = 'خارج از بازهٔ دفترِ ماهانه (پیش از ثبت‌نام یا بعد از پایانِ سال)';
      await c.save();
      voided += 1;
    }
  }
  return { created, revived, updated, voided, months, anchorInvalid };
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

/**
 * مثلِ fifoAllocate ولی اگر `targetChargeId` داده شود، آن قلم اول پر می‌شود و
 * باقی‌ماندهٔ مبلغ به‌روشِ FIFO روی بقیهٔ ماه‌های باز می‌رود.
 */
function allocatePayment(amount, openCharges = [], targetChargeId = '') {
  const target = String(targetChargeId || '');
  if (!target) return fifoAllocate(amount, openCharges);
  const ordered = [
    ...openCharges.filter((c) => String(c._id) === target),
    ...openCharges.filter((c) => String(c._id) !== target)
  ];
  return fifoAllocate(amount, ordered);
}

/** برای هر ثبت‌نامِ فعالِ دفتری، قلمِ هر ماه تا ماهِ جاری را می‌سازد و رول‌آپ می‌کند. */
async function topUpAll({ dueDay = 20 } = {}) {
  const cur = currentShamsiMonthKey();
  const horizon = ledgerHorizonKey(cur, cur);
  const regs = await ShortTermRegistration.find({ status: 'active' })
    .select('_id studentId startDate registrationDate feeAmount discountAmount durationMonths createdBy')
    .lean();
  let createdTotal = 0;
  let touched = 0;
  for (const reg of regs) {
    // untilKey را نمی‌فرستیم تا هر ثبت‌نام تا آخرِ سالِ خودش برود
    const { created, revived, updated, voided } = await generateChargesForRegistration(reg, { dueDay });
    if (created > 0 || revived > 0 || updated > 0 || voided > 0) {
      createdTotal += created;
      touched += 1;
      await recomputeRegistration(reg._id);
    }
  }
  return { untilKey: horizon, currentMonth: cur, registrations: regs.length, touched, chargesCreated: createdTotal };
}

/**
 * عاید، مصرف و مفادِ یک ماهِ شمسی — تعریفِ واحد برای داشبورد و گزارش‌ها.
 * عاید = مجموعِ پرداخت‌های «ابطال‌نشده و دارای بلِ صادرشده» با paidAt در همان
 * ماه. مصرف = مصارفِ همان ماه. مفاد = عاید − مصرف. همراهِ تفکیکِ «عاید بابتِ
 * فیسِ کدام ماه‌ها».
 */
async function monthlyPnl(periodKey) {
  const range = monthGregorianRange(periodKey);
  if (!range) return { periodKey, income: 0, expenses: 0, net: 0, paymentCount: 0, expenseCount: 0, byFeeMonth: [] };
  const start = new Date(`${range.startISO}T00:00:00.000Z`);
  const endEx = new Date(`${range.endExclusiveISO}T00:00:00.000Z`);

  // «ابطال‌نشده و دارای بل»: status != 'void' (پرداختِ قدیمی فیلدِ status ندارد،
  // پس $ne:'void' درست است نه status:'active') و invoiceId پر.
  const payments = await ShortTermPayment.find({
    status: { $ne: 'void' },
    invoiceId: { $ne: null },
    paidAt: { $gte: start, $lt: endEx }
  }).select('amount allocations').lean();

  const income = round(payments.reduce((s, p) => s + num(p.amount), 0));

  const expenseAgg = await ShortTermExpense.aggregate([
    { $match: { expenseDate: { $gte: range.startISO, $lt: range.endExclusiveISO } } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);
  const expenses = round(expenseAgg?.[0]?.total || 0);

  // «عاید بابتِ فیسِ کدام ماه‌ها» — از allocationهای همین پرداخت‌ها
  const allocChargeIds = [...new Set(payments.flatMap((p) => (p.allocations || []).map((a) => String(a.chargeId))))];
  const chargeRows = allocChargeIds.length
    ? await ShortTermCharge.find({ _id: { $in: allocChargeIds } }).select('periodKey').lean()
    : [];
  const keyByCharge = new Map(chargeRows.map((c) => [String(c._id), c.periodKey]));
  const byFeeMonthMap = new Map();
  for (const p of payments) {
    for (const a of p.allocations || []) {
      const k = keyByCharge.get(String(a.chargeId));
      if (!k) continue;
      byFeeMonthMap.set(k, round((byFeeMonthMap.get(k) || 0) + num(a.amount)));
    }
  }
  const byFeeMonth = [...byFeeMonthMap.entries()]
    .sort((a, b) => monthOrdinal(a[0]) - monthOrdinal(b[0]))
    .map(([k, amount]) => ({ periodKey: k, label: shamsiMonthLabel(k), amount }));

  return {
    periodKey,
    income,
    expenses,
    net: round(income - expenses),
    paymentCount: payments.length,
    expenseCount: expenseAgg?.[0]?.count || 0,
    byFeeMonth
  };
}

module.exports = {
  num,
  round,
  todayKey,
  shamsiMonthKey,
  currentShamsiMonthKey,
  shamsiMonthLabel,
  monthOrdinal,
  monthSpan,
  ledgerHorizonKey,
  monthGregorianRange,
  bumpShamsiMonth,
  monthlyDueDateISO,
  monthKeysFrom,
  chargeNet,
  chargeOpen,
  isOverdue,
  generateChargesForRegistration,
  recomputeRegistration,
  fifoAllocate,
  allocatePayment,
  topUpAll,
  monthlyPnl
};
