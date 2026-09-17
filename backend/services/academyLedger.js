// دفترِ مالیِ آموزشگاه — منطقِ اقلامِ بدهی، تخصیصِ پرداخت و رول‌آپِ ثبت‌نام.
// همهٔ مسیرهایی که charge/payment می‌سازند یا ابطال می‌کنند باید بعدش
// recomputeRegistration را صدا بزنند تا اعدادِ ثبت‌نام یک‌دست بمانند.

const AcademyCharge = require('../models/AcademyCharge');
const AcademyRegistration = require('../models/AcademyRegistration');
const AcademyPayment = require('../models/AcademyPayment');
const AcademyExpense = require('../models/AcademyExpense');
const { gregorianToAfghanSolar, afghanSolarToGregorianInput, AFGHAN_SOLAR_MONTHS } = require('../utils/afghanDate');

const num = (value) => Math.max(0, Number(value || 0));
const round = (value) => Math.round(num(value) * 100) / 100;
const todayKey = () => new Date().toISOString().slice(0, 10);

const DISCOUNT_TYPES = ['sibling', 'scholarship', 'staff', 'hardship', 'other'];
const normalizeDiscountType = (value) => (DISCOUNT_TYPES.includes(value) ? value : '');

// سقفِ محافظ — جلوِ صدورِ بلِ چند-سالِ اشتباه را می‌گیرد.
const MAX_BILL_MONTHS = 60;

/** شمارهٔ ترتیبیِ یک ماهِ شمسی (jy*12+jm). */
const monthOrdinal = (key) => {
  const [jy, jm] = String(key || '').split('-').map(Number);
  return (jy && jm) ? (jy * 12) + jm : 0;
};

/** کلیدِ ماهِ شمسیِ جاری، مثلِ «1405-06». */
const currentShamsiMonthKey = () => shamsiMonthKey(new Date());

/** «1405-06» → «سنبله ۱۴۰۵». */
function shamsiMonthLabel(periodKey) {
  const [jy, jm] = String(periodKey || '').split('-').map(Number);
  if (!jy || !jm || jm < 1 || jm > 12) return String(periodKey || '');
  const name = AFGHAN_SOLAR_MONTHS[jm - 1] || String(jm);
  let year = String(jy);
  try { year = Number(jy).toLocaleString('fa-AF', { useGrouping: false }); } catch { /* keep latin */ }
  return `${name} ${year}`;
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
 * هستهٔ خالصِ تخصیص (بدونِ دیتابیس) — recomputeRegistration و پیش‌نمایشِ پنجرهٔ
 * «تخفیف» در فرانت همین الگوریتم را اجرا می‌کنند. `charges` به ترتیبِ FIFO
 * (سررسید، ایجاد) و `payments` به ترتیبِ پرداخت.
 *
 * ۱) تخصیص‌های ثبت‌شدهٔ هر پرداخت به ترتیبِ خودشان — کلَمپ به ظرفیتِ قلم *و* به
 *    باقیِ مبلغِ همان پرداخت. بدونِ سقفِ دوم، پرداختی که پس از تخفیف روی ماهِ
 *    پرداخت‌شده بخشی‌اش به ماهِ دیگر رفته بود، با برداشتنِ تخفیف دو بار شمرده می‌شد.
 * ۲) خوددرمانی: باقیِ تخصیص‌نیافتهٔ هر پرداخت FIFO روی قلم‌های باز. این افزوده‌ها
 *    به تهِ فهرستِ تخصیص می‌روند، پس با برگشتِ ظرفیت (برداشتنِ تخفیف) قلمِ اصلیِ
 *    پرداخت دوباره اول پر می‌شود. اضافه‌پرداختی که قلمِ بازی نمی‌یابد اعتبار می‌ماند.
 *
 * @returns {{ paidByCharge: Map<string, number>, healed: Map<string, Array<{chargeId, amount}>>,
 *   effective: Map<string, Map<string, number>>, totalPaid: number, unallocated: number }}
 */
function allocateLedger(charges = [], payments = []) {
  const netById = new Map(charges.map((c) => [String(c._id), chargeNet(c)]));
  const paidByCharge = new Map();
  const effective = new Map();
  const roomOn = (id) => Math.max(0, round((netById.get(id) || 0) - (paidByCharge.get(id) || 0)));
  const claim = (paymentId, chargeId, amt) => {
    paidByCharge.set(chargeId, round((paidByCharge.get(chargeId) || 0) + amt));
    if (!effective.has(paymentId)) effective.set(paymentId, new Map());
    const byCharge = effective.get(paymentId);
    byCharge.set(chargeId, round((byCharge.get(chargeId) || 0) + amt));
  };

  const usedByPayment = new Map();
  for (const payment of payments) {
    const pid = String(payment._id);
    const cap = num(payment.amount);
    let used = 0;
    for (const alloc of payment.allocations || []) {
      const key = String(alloc.chargeId);
      if (!netById.has(key)) continue; // تخصیص به قلمِ ابطال‌شده/حذف‌شده
      const take = round(Math.min(num(alloc.amount), roomOn(key), cap - used));
      if (take <= 0) continue;
      claim(pid, key, take);
      used = round(used + take);
    }
    usedByPayment.set(pid, used);
  }

  const healed = new Map();
  for (const payment of payments) {
    const pid = String(payment._id);
    let shortfall = round(num(payment.amount) - (usedByPayment.get(pid) || 0));
    if (shortfall <= 0) continue;
    const next = (payment.allocations || []).map((a) => ({ chargeId: a.chargeId, amount: num(a.amount) }));
    let touched = false;
    for (const charge of charges) {
      if (shortfall <= 0) break;
      const key = String(charge._id);
      const take = round(Math.min(roomOn(key), shortfall));
      if (take <= 0) continue;
      claim(pid, key, take);
      const hit = next.find((a) => String(a.chargeId) === key);
      if (hit) hit.amount = round(hit.amount + take);
      else next.push({ chargeId: charge._id, amount: take });
      shortfall = round(shortfall - take);
      touched = true;
    }
    if (touched) healed.set(pid, next);
  }

  const totalPaid = round([...paidByCharge.values()].reduce((s, v) => s + v, 0));
  const allPaid = round(payments.reduce((s, p) => s + num(p.amount), 0));
  return { paidByCharge, healed, effective, totalPaid, unallocated: round(allPaid - totalPaid) };
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
    AcademyPayment.find({ registrationId, status: { $ne: 'void' } }).sort({ paidAt: 1, createdAt: 1 })
  ]);

  const { paidByCharge, healed, effective, totalPaid } = allocateLedger(charges, payments);

  // پرداختِ سرگردانِ مسیرِ قدیمی یا میزِ مهاجرت، یا مازادِ پس از تخفیف، به بلش
  // چسبانده و روی خودِ پرداخت ذخیره می‌شود — recompute را idempotent می‌کند.
  const periodKeyById = new Map(charges.map((c) => [String(c._id), c.periodKey || '']));
  for (const payment of payments) {
    const next = healed.get(String(payment._id));
    if (!next) continue;
    payment.allocations = next;
    payment.coveredMonths = [...(effective.get(String(payment._id)) || new Map()).entries()]
      .filter(([chargeId, amount]) => amount > 0 && periodKeyById.get(chargeId))
      .map(([chargeId]) => periodKeyById.get(chargeId));
    await payment.save();
  }

  let totalNet = 0;
  for (const charge of charges) {
    const net = chargeNet(charge);
    const paid = Math.min(net, paidByCharge.get(String(charge._id)) || 0);
    charge.paidAmount = round(paid);
    charge.balance = round(net - paid);
    charge.status = charge.balance <= 0 && (net > 0 || num(charge.discountAmount) > 0) ? 'paid' : paid > 0 ? 'partial' : 'pending';
    await charge.save();
    totalNet += net;
  }

  // پرداختِ مازاد بر مجموعِ قلم‌ها (اعتبار) هم در paidAmount شمرده می‌شود.
  const allPaid = round(payments.reduce((s, p) => s + num(p.amount), 0));

  reg.ledgerManaged = true;
  reg.totalPayable = round(totalNet);
  reg.paidAmount = round(Math.max(totalPaid, allPaid));
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

/** مثلِ fifoAllocate ولی `targetChargeId` اول پر می‌شود، بعد FIFO روی بقیه. */
function allocatePayment(amount, openCharges = [], targetChargeId = '') {
  const target = String(targetChargeId || '');
  if (!target) return fifoAllocate(amount, openCharges);
  const ordered = [
    ...openCharges.filter((c) => String(c._id) === target),
    ...openCharges.filter((c) => String(c._id) !== target)
  ];
  return fifoAllocate(amount, ordered);
}

/** ماهِ شمسیِ بعد از «jy-jm». */
function bumpShamsiMonth(key) {
  const [jy, jm] = String(key).split('-').map(Number);
  if (!jy || !jm) return key;
  return jm >= 12 ? `${jy + 1}-01` : `${jy}-${String(jm + 1).padStart(2, '0')}`;
}

/** ماهِ لنگرِ صدورِ بل برای یک ثبت‌نام = ماهِ شمسیِ registrationDate؛ startDate فقط
 *  اگر *بعد* از registrationDate باشد (شاگردی که دیرتر صنف را شروع کرده). */
function anchorMonthKey(reg) {
  const regISO = String(reg.registrationDate || '').slice(0, 10);
  const rawStartISO = String(reg.startDate || '').slice(0, 10);
  const startISO = (rawStartISO && regISO && rawStartISO > regISO) ? rawStartISO : (regISO || rawStartISO || todayKey());
  return shamsiMonthKey(startISO);
}

/**
 * علتِ ناممکن‌بودنِ صدورِ بلِ این ماه — یا '' اگر مجاز است.
 *  'invalid' | 'before-enrolment' | 'too-old' | 'too-future'
 * (تاریخِ ختم محدودیت ندارد — از ماهِ عضویت به بعد آزاد است.)
 */
function billMonthDisallowReason(reg, periodKey) {
  const ord = monthOrdinal(periodKey);
  if (!ord) return 'invalid';
  const curOrd = monthOrdinal(currentShamsiMonthKey());
  if (ord > curOrd + MAX_BILL_MONTHS) return 'too-future';
  if (ord < curOrd - MAX_BILL_MONTHS) return 'too-old';
  const anchorOrd = monthOrdinal(anchorMonthKey(reg));
  if (anchorOrd && ord < anchorOrd) return 'before-enrolment';
  return '';
}

function billMonthAllowed(reg, periodKey) {
  return billMonthDisallowReason(reg, periodKey) === '';
}

/**
 * فیسِ مؤثرِ ماهانهٔ یک ثبت‌نام. برای پلانِ ماهانه، feeAmount همان فیسِ یک ماه
 * است (هم‌راستا با buildInitialCharges و با مرکزِ موقت) — پس اگر monthlyFee
 * خالی مانده باشد، feeAmount جای آن را می‌گیرد. بدونِ این fallback، ثبت‌نامی که
 * monthlyFee‌اش صفر مانده (مثلاً مهاجرت که مبلغ را فقط در حافظه حساب کرد و روی
 * ثبت‌نام ننوشت) هنگامِ «صدور بل» بی‌صدا رد می‌شود.
 */
function effectiveMonthlyFee(reg) {
  return round(num(reg?.monthlyFee) || num(reg?.feeAmount));
}

/** تخفیفِ خودکارِ ماهانهٔ ثبت‌نام برای ماهِ periodKey — یا null اگر قاعده‌ای نیست. */
function monthlyDiscountFor(reg, periodKey) {
  const rule = reg?.monthlyDiscount;
  const amount = round(num(rule?.amount));
  if (!(amount > 0)) return null;
  const until = String(rule?.untilMonth || '');
  if (until && monthOrdinal(periodKey) > monthOrdinal(until)) return null;
  return {
    amount,
    discountType: normalizeDiscountType(rule.discountType),
    discountReason: String(rule.discountReason || '').trim(),
    approvedBy: rule.setBy || null
  };
}

/**
 * تخفیفِ یک قلم را تنظیم و در discountHistory ثبت می‌کند (بدونِ save). مبلغ به
 * فیسِ قلم کلَمپ می‌شود؛ قلمِ پرداخت‌شده هم مجاز است — مازاد را recompute اعتبار می‌کند.
 * @returns {boolean} آیا مبلغ یا دستهٔ تخفیف عوض شد
 */
function setChargeDiscount(charge, { amount = 0, discountType = '', discountReason = '', by = null, approvedBy = by, source = '' } = {}) {
  const from = round(num(charge.discountAmount));
  const to = round(Math.min(num(charge.amount), num(amount)));
  const type = to > 0 ? normalizeDiscountType(discountType) : '';
  const reason = String(discountReason || '').trim();
  if (from === to && (to === 0 || (charge.discountType || '') === type)) return false;
  charge.discountAmount = to;
  charge.discountType = type;
  charge.discountReason = to > 0 ? reason : '';
  charge.discountApprovedBy = to > 0 ? (approvedBy || null) : null;
  charge.discountHistory = [
    ...(charge.discountHistory || []),
    { at: new Date(), by: by || null, from, to, discountType: type, discountReason: reason, source }
  ];
  return true;
}

/**
 * قاعدهٔ تخفیفِ خودکارِ ماهانه را روی ثبت‌نام تنظیم و در تاریخچه ثبت می‌کند (بدونِ save).
 * @returns {boolean} آیا مبلغ، ماهِ پایان یا دسته عوض شد
 */
function setMonthlyDiscountRule(reg, { amount = 0, untilMonth = '', discountType = '', discountReason = '', by = null } = {}) {
  const prev = reg.monthlyDiscount || {};
  const from = round(num(prev.amount));
  const to = round(num(amount));
  const until = to > 0 && /^\d{3,4}-(0[1-9]|1[0-2])$/.test(String(untilMonth || '')) ? String(untilMonth) : '';
  const type = to > 0 ? normalizeDiscountType(discountType) : '';
  const reason = String(discountReason || '').trim();
  if (from === to && String(prev.untilMonth || '') === until && (to === 0 || (prev.discountType || '') === type)) return false;
  reg.monthlyDiscount = { amount: to, untilMonth: until, discountType: type, discountReason: to > 0 ? reason : '', setBy: by || null, setAt: new Date() };
  reg.monthlyDiscountHistory = [
    ...(reg.monthlyDiscountHistory || []),
    { at: new Date(), by: by || null, from, to, untilMonth: until, discountType: type, discountReason: reason }
  ];
  return true;
}

/**
 * صدورِ صریحِ «بلِ یک ماه» برای یک ثبت‌نام. idempotent — بلِ زندهٔ موجود با صدورِ
 * دوباره بازنویسی نمی‌شود (مبلغ یا تخفیفش ممکن است عمداً ویرایش شده باشد)، مگر
 * مبلغ/تخفیفِ صریح داده شود و بل پرداخت نخورده باشد؛ بلِ ابطالی دوباره زنده می‌شود.
 * تخفیفِ بلِ تازه = تخفیفِ صریح، وگرنه تخفیفِ خودکارِ ماهانهٔ ثبت‌نام.
 * @returns {Promise<{ status:'created'|'updated'|'exists'|'rejected', reason?:string, chargeId?:string }>}
 */
async function issueBillForMonth(reg, periodKey, { dueDay = 20, amount = null, discountAmount = null, issuedBy = null } = {}) {
  if (!reg || !/^\d{3,4}-(0[1-9]|1[0-2])$/.test(String(periodKey || ''))) return { status: 'rejected', reason: 'ماهِ نامعتبر' };
  const bad = billMonthDisallowReason(reg, periodKey);
  if (bad) return { status: 'rejected', reason: bad };
  const fee = amount != null ? round(num(amount)) : effectiveMonthlyFee(reg);
  if (fee <= 0) return { status: 'rejected', reason: 'مبلغِ بل صفر است' };
  // خوددرمانی: اگر مبلغ از feeAmount آمد، همان را روی ثبت‌نام هم بنویس تا دفعهٔ
  // بعد لازم نباشد حدس بزنیم و «فیسِ ماهانه» در UI درست نشان داده شود.
  if (amount == null && !(num(reg.monthlyFee) > 0)) {
    await AcademyRegistration.updateOne({ _id: reg._id }, { $set: { monthlyFee: fee } });
  }
  const rule = discountAmount == null ? monthlyDiscountFor(reg, periodKey) : null;
  const discount = {
    amount: discountAmount != null ? round(num(discountAmount)) : (rule ? rule.amount : 0),
    discountType: rule ? rule.discountType : '',
    discountReason: rule ? rule.discountReason : '',
    by: issuedBy || null,
    approvedBy: (rule && rule.approvedBy) || issuedBy || null,
    source: rule ? 'monthly-rule' : 'bill-issue'
  };

  const existing = await AcademyCharge.findOne({ registrationId: reg._id, kind: 'monthly', periodKey });
  if (existing && existing.status !== 'void') {
    const explicit = amount != null || discountAmount != null;
    if (!explicit || num(existing.paidAmount) > 0) return { status: 'exists', chargeId: String(existing._id) };
    let changed = false;
    if (amount != null && num(existing.amount) !== fee) {
      existing.amount = fee;
      changed = true;
    }
    if (discountAmount != null) changed = setChargeDiscount(existing, discount) || changed;
    if (!changed) return { status: 'exists', chargeId: String(existing._id) };
    existing.updatedBy = issuedBy || existing.updatedBy || null;
    await existing.save();
    return { status: 'updated', chargeId: String(existing._id) };
  }
  if (existing) {
    existing.status = 'pending';
    existing.voidedAt = null;
    existing.voidedBy = null;
    existing.voidReason = '';
    existing.amount = fee;
    setChargeDiscount(existing, discount);
    existing.title = `فیسِ ماهِ ${shamsiMonthLabel(periodKey)}`;
    if (!existing.dueDate) existing.dueDate = monthlyDueDateISO(periodKey, dueDay);
    existing.issuedBy = issuedBy || existing.issuedBy || null;
    existing.issuedAt = existing.issuedAt || new Date();
    await existing.save();
    return { status: 'updated', chargeId: String(existing._id) };
  }
  try {
    const c = new AcademyCharge({
      registrationId: reg._id,
      studentId: reg.studentId,
      kind: 'monthly',
      title: `فیسِ ماهِ ${shamsiMonthLabel(periodKey)}`,
      amount: fee,
      dueDate: monthlyDueDateISO(periodKey, dueDay),
      periodKey,
      currency: reg.currency || 'AFN',
      issuedBy: issuedBy || null,
      issuedAt: new Date(),
      createdBy: issuedBy || null
    });
    setChargeDiscount(c, discount);
    await c.save();
    return { status: 'created', chargeId: String(c._id) };
  } catch (error) {
    if (error && error.code === 11000) {
      const again = await AcademyCharge.findOne({ registrationId: reg._id, kind: 'monthly', periodKey }).lean();
      return { status: 'exists', chargeId: again ? String(again._id) : undefined };
    }
    throw error;
  }
}

/**
 * صدورِ گروهیِ بلِ یک ماه برای ثبت‌نام‌های فعالِ ماهانه.
 * `ids` = فهرستِ registrationId (یا studentId).
 */
async function issueBillsForMonth({ month, dueDay = 20, courseId = '', classId = '', ids = null, issuedBy = null } = {}) {
  const filter = { paymentPlan: 'monthly', status: 'active' };
  if (courseId) filter.courseId = courseId;
  if (classId) filter.classId = classId;
  const regs = await AcademyRegistration.find(filter)
    .select('_id studentId courseId classId registrationDate startDate monthlyFee feeAmount monthlyDiscount paymentPlan currency').lean();
  const wanted = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  // بلی که *نشد* صادر شود با دلیلش — تا در پیام «از قبل داشتند» جا نزند.
  const rejected = [];
  const touched = new Set();
  for (const reg of regs) {
    if (wanted && !wanted.has(String(reg._id)) && !wanted.has(String(reg.studentId))) continue;
    const r = await issueBillForMonth(reg, month, { dueDay, issuedBy });
    if (r.status === 'created') { created += 1; touched.add(String(reg._id)); }
    else if (r.status === 'updated') { updated += 1; touched.add(String(reg._id)); }
    else if (r.status === 'rejected') rejected.push({ registrationId: String(reg._id), reason: r.reason || '' });
    else skipped += 1;
  }
  for (const id of touched) await recomputeRegistration(id);
  return {
    month, label: shamsiMonthLabel(month),
    created, updated, skipped,
    rejected: rejected.length, rejectedRows: rejected,
    registrations: regs.length
  };
}

/**
 * دادهٔ پنجرهٔ «تخفیف» یک ثبت‌نام: اقلامِ غیرِ ابطالی به همان ترتیبِ FIFOِ
 * recompute، پرداخت‌ها با تخصیص‌هایشان (تا فرانت اثرِ تخفیف را دقیقاً با
 * allocateLedger پیش‌نمایش کند)، قاعدهٔ خودکارِ ماهانه و تاریخچهٔ تغییرها.
 */
async function discountSheet(registrationId) {
  const User = require('../models/User');
  const reg = await AcademyRegistration.findById(registrationId)
    .populate('studentId', 'fullName studentCode')
    .populate('courseId', 'name')
    .populate('classId', 'name')
    .lean();
  if (!reg) return null;
  const [charges, payments] = await Promise.all([
    AcademyCharge.find({ registrationId: reg._id, status: { $ne: 'void' } }).sort({ dueDate: 1, createdAt: 1 }).lean(),
    AcademyPayment.find({ registrationId: reg._id, status: { $ne: 'void' } }).sort({ paidAt: 1, createdAt: 1 })
      .select('amount paidAt allocations').lean()
  ]);

  const rule = reg.monthlyDiscount || {};
  const userIds = [...new Set([
    ...charges.flatMap((c) => (c.discountHistory || []).map((h) => h.by)),
    ...(reg.monthlyDiscountHistory || []).map((h) => h.by),
    rule.setBy
  ].filter(Boolean).map(String))];
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select('name').lean() : [];
  const nameById = new Map(users.map((u) => [String(u._id), u.name || '']));
  const nameOf = (id) => (id ? nameById.get(String(id)) || '' : '');

  const today = todayKey();
  const curKey = currentShamsiMonthKey();
  const curOrd = monthOrdinal(curKey);
  const labelOf = (c) => (c.periodKey ? shamsiMonthLabel(c.periodKey) : (c.title || ''));

  const rows = charges.map((c) => ({
    chargeId: String(c._id),
    kind: c.kind,
    periodKey: c.periodKey || '',
    label: labelOf(c),
    title: c.title || '',
    dueDate: c.dueDate || '',
    amount: num(c.amount),
    discountAmount: num(c.discountAmount),
    discountType: c.discountType || '',
    discountReason: c.discountReason || '',
    net: chargeNet(c),
    paidAmount: num(c.paidAmount),
    balance: num(c.balance),
    status: c.status,
    isOverdue: isOverdue(c, today),
    isCurrentMonth: Boolean(c.periodKey) && c.periodKey === curKey,
    isFutureMonth: Boolean(c.periodKey) && monthOrdinal(c.periodKey) > curOrd
  }));

  const history = [
    ...charges.flatMap((c) => (c.discountHistory || []).map((h) => ({
      at: h.at,
      byName: nameOf(h.by),
      target: labelOf(c),
      kind: c.kind,
      from: num(h.from),
      to: num(h.to),
      discountType: h.discountType || '',
      discountReason: h.discountReason || '',
      source: h.source || ''
    }))),
    ...(reg.monthlyDiscountHistory || []).map((h) => ({
      at: h.at,
      byName: nameOf(h.by),
      target: '',
      kind: 'rule',
      from: num(h.from),
      to: num(h.to),
      untilMonthLabel: h.untilMonth ? shamsiMonthLabel(h.untilMonth) : '',
      discountType: h.discountType || '',
      discountReason: h.discountReason || '',
      source: 'rule'
    }))
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 100);

  const sum = (key) => round(rows.reduce((s, r) => s + r[key], 0));
  const totals = { fee: sum('amount'), discount: sum('discountAmount'), net: sum('net'), paid: sum('paidAmount'), balance: sum('balance') };
  totals.credit = round(payments.reduce((s, p) => s + num(p.amount), 0) - totals.paid);

  const isMonthly = reg.paymentPlan === 'monthly';
  const anchorKey = anchorMonthKey(reg);
  return {
    registration: {
      _id: String(reg._id),
      student: reg.studentId,
      course: reg.courseId,
      classItem: reg.classId,
      paymentPlan: reg.paymentPlan,
      status: reg.status,
      currency: reg.currency || 'AFN',
      monthlyFee: isMonthly ? effectiveMonthlyFee(reg) : 0,
      startMonthLabel: shamsiMonthLabel(anchorKey),
      // تخفیفی که پیش از قاعدهٔ خودکار در فرمِ ثبت‌نامِ ماهانه وارد شده و روی هیچ بلی ننشسته
      legacyDiscount: isMonthly && !rule.setAt ? num(reg.discountAmount) : 0
    },
    rule: isMonthly
      ? {
        amount: num(rule.amount),
        untilMonth: rule.untilMonth || '',
        untilMonthLabel: rule.untilMonth ? shamsiMonthLabel(rule.untilMonth) : '',
        discountType: rule.discountType || '',
        discountReason: rule.discountReason || '',
        setAt: rule.setAt || null,
        setByName: nameOf(rule.setBy)
      }
      : null,
    rows,
    payments: payments.map((p) => ({
      _id: String(p._id),
      amount: num(p.amount),
      allocations: (p.allocations || []).map((a) => ({ chargeId: String(a.chargeId), amount: num(a.amount) }))
    })),
    history,
    totals,
    currentMonth: { periodKey: curKey, label: shamsiMonthLabel(curKey) }
  };
}

/**
 * عاید، مصرف و مفادِ یک ماهِ شمسی — تعریفِ واحد.
 * عاید = پرداخت‌های ابطال‌نشدهٔ دارای بل (invoiceId) با paidAt در آن ماه.
 * مصرف = مصارفِ همان ماهِ شمسی. مفاد = عاید − مصرف.
 */
async function monthlyPnl(periodKey) {
  const range = monthGregorianRange(periodKey);
  if (!range) return { periodKey, income: 0, expenses: 0, net: 0, paymentCount: 0, expenseCount: 0, byFeeMonth: [] };
  const start = new Date(`${range.startISO}T00:00:00.000Z`);
  const endEx = new Date(`${range.endExclusiveISO}T00:00:00.000Z`);

  const payments = await AcademyPayment.find({
    status: { $ne: 'void' },
    invoiceId: { $ne: null },
    paidAt: { $gte: start, $lt: endEx }
  }).select('amount allocations').lean();
  const income = round(payments.reduce((s, p) => s + num(p.amount), 0));

  const expenseAgg = await AcademyExpense.aggregate([
    { $match: { expenseDate: { $gte: range.startISO, $lt: range.endExclusiveISO } } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);
  const expenses = round(expenseAgg?.[0]?.total || 0);

  const allocChargeIds = [...new Set(payments.flatMap((p) => (p.allocations || []).map((a) => String(a.chargeId))))];
  const chargeRows = allocChargeIds.length
    ? await AcademyCharge.find({ _id: { $in: allocChargeIds } }).select('periodKey kind').lean()
    : [];
  const keyByCharge = new Map(chargeRows.map((c) => [String(c._id), c.periodKey || c.kind]));
  const byMonthMap = new Map();
  for (const p of payments) {
    for (const a of p.allocations || []) {
      const k = keyByCharge.get(String(a.chargeId));
      if (!k) continue;
      byMonthMap.set(k, round((byMonthMap.get(k) || 0) + num(a.amount)));
    }
  }
  const byFeeMonth = [...byMonthMap.entries()]
    .sort((a, b) => monthOrdinal(a[0]) - monthOrdinal(b[0]))
    .map(([k, amount]) => ({ periodKey: k, label: /^\d{3,4}-\d{2}$/.test(k) ? shamsiMonthLabel(k) : k, amount }));

  return { periodKey, income, expenses, net: round(income - expenses), paymentCount: payments.length, expenseCount: expenseAgg?.[0]?.count || 0, byFeeMonth };
}

module.exports = {
  num,
  round,
  todayKey,
  DISCOUNT_TYPES,
  normalizeDiscountType,
  chargeNet,
  chargeOpen,
  isOverdue,
  shamsiMonthKey,
  currentShamsiMonthKey,
  shamsiMonthLabel,
  monthOrdinal,
  monthGregorianRange,
  monthlyDueDateISO,
  bumpShamsiMonth,
  anchorMonthKey,
  billMonthAllowed,
  billMonthDisallowReason,
  effectiveMonthlyFee,
  monthlyDiscountFor,
  setChargeDiscount,
  setMonthlyDiscountRule,
  allocateLedger,
  recomputeRegistration,
  fifoAllocate,
  allocatePayment,
  issueBillForMonth,
  issueBillsForMonth,
  discountSheet,
  monthlyPnl
};
