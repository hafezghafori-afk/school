const express = require('express');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const ShortTermCounter = require('../models/ShortTermCounter');
const ShortTermSetting = require('../models/ShortTermSetting');
const ShortTermStudent = require('../models/ShortTermStudent');
const ShortTermClass = require('../models/ShortTermClass');
const ShortTermRegistration = require('../models/ShortTermRegistration');
const ShortTermPayment = require('../models/ShortTermPayment');
const ShortTermCharge = require('../models/ShortTermCharge');
const ShortTermInvoice = require('../models/ShortTermInvoice');
const shortTermLedger = require('../services/shortTermLedger');
const ShortTermExpense = require('../models/ShortTermExpense');
const ShortTermExpenseCategory = require('../models/ShortTermExpenseCategory');
const ShortTermAttendance = require('../models/ShortTermAttendance');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');
const { buildShamsiMonthlyReport } = require('../utils/shamsiMonthlyReport');

const router = express.Router();

// Independent from both the school and academy permission scopes -
// 'shortterm.center.manage' is only granted by default to the finance
// manager admin level and the general-admin (general_president) level (see
// backend/utils/permissionCatalog.js), matching what was asked for.
router.use(requireAuth, requireRole(['admin']), requirePermission('shortterm.center.manage'));
attachWriteActivityAudit(router, { targetType: 'ShortTermCenter', actionPrefix: 'short_term_center', audit: (payload) => logActivity(payload) });

const todayKey = () => new Date().toISOString().slice(0, 10);
const toNumber = (value) => Math.max(0, Number(value || 0));
const userId = (req) => req.user?.id || null;

// یادداشت: سیستم دیگر خودش بل صادر نمی‌کند. بل فقط با تبِ «صدور بل» یا هنگامِ
// ثبتِ پرداخت (با تأیید) ساخته می‌شود — مثلِ FeeOrder در مالیِ مکتب.

async function nextSequence(key, prefix) {
  const counter = await ShortTermCounter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}-${String(counter.seq).padStart(6, '0')}`;
}

async function getSettings() {
  let settings = await ShortTermSetting.findOne().lean();
  if (!settings) {
    settings = (await ShortTermSetting.create({})).toObject();
  }
  return settings;
}

function mapListQuery(query = {}) {
  const filter = {};
  const status = String(query.status || '').trim();
  if (status && status !== 'all') filter.status = status;
  return filter;
}

function withOverdueFlag(registration) {
  const overdue = registration.status === 'active' && registration.endDate && registration.endDate < todayKey();
  return { ...registration, overdue };
}

async function buildSummary() {
  const [
    activeStudents,
    activeClasses,
    registrations,
    payments,
    expenses,
    invoices
  ] = await Promise.all([
    ShortTermStudent.countDocuments({ status: 'active' }),
    ShortTermClass.countDocuments({ status: 'active' }),
    ShortTermRegistration.find().select('totalPayable paidAmount balance status paymentStatus endDate createdAt').lean(),
    ShortTermPayment.find({ status: { $ne: 'void' } }).sort({ paidAt: -1 }).limit(8).populate('studentId', 'fullName studentCode').lean(),
    ShortTermExpense.find().sort({ expenseDate: -1, createdAt: -1 }).limit(8).lean(),
    ShortTermInvoice.find().sort({ issuedAt: -1 }).limit(8).populate('studentId', 'fullName studentCode').lean()
  ]);

  // ثبت‌نامِ لغوشده یا ادغام‌شده (یکی از چند ثبت‌نامِ ماهانهٔ قدیمی) نه فیسِ
  // قابل‌دریافت دارد نه پرداخت — از مجموع‌های خلاصه کنار می‌رود تا «قابل دریافت
  // − دریافت‌شده» با «باقی‌داری» جور دربیاید.
  const dormant = new Set(['cancelled', 'merged']);
  const liveRegs = registrations.filter((item) => !dormant.has(item.status));
  const paidTotal = liveRegs.reduce((sum, item) => sum + toNumber(item.paidAmount), 0);
  const dueTotal = liveRegs.reduce((sum, item) => sum + toNumber(item.totalPayable), 0);
  const outstandingTotal = registrations
    .filter((item) => item.status === 'active')
    .reduce((sum, item) => sum + toNumber(item.balance), 0);
  // اضافه‌پرداخت/اعتبار: جایی که پرداختِ ثبت‌شده از فیسِ قابل‌پرداخت بیشتر است.
  // با این، اتحادِ گزارش برقرار می‌شود: باقی‌داری = قابل‌دریافت − (دریافت‌شده − اعتبار).
  const creditTotal = liveRegs.reduce((sum, item) => sum + Math.max(0, toNumber(item.paidAmount) - toNumber(item.totalPayable)), 0);
  const today = todayKey();
  const overdueCount = registrations.filter((item) => item.status === 'active' && item.endDate && item.endDate < today).length;
  // عاید/مصرف/مفادِ ماهِ جاری — تعریفِ واحد در shortTermLedger.monthlyPnl:
  // عاید فقط از پرداختِ ابطال‌نشدهٔ دارای بلِ صادرشده، منهای مصارفِ همان ماه.
  const pnl = await shortTermLedger.monthlyPnl(shortTermLedger.currentShamsiMonthKey());

  return {
    activeStudents,
    activeClasses,
    registrations: registrations.length,
    overdueCount,
    invoices: await ShortTermInvoice.countDocuments(),
    dueTotal,
    paidTotal,
    outstandingTotal,
    creditTotal,
    monthIncome: pnl.income,
    monthExpenses: pnl.expenses,
    monthNet: pnl.net,
    monthKey: pnl.periodKey,
    monthLabel: shortTermLedger.shamsiMonthLabel(pnl.periodKey),
    monthIncomeByFeeMonth: pnl.byFeeMonth,
    recentPayments: payments,
    recentExpenses: expenses,
    recentInvoices: invoices
  };
}

async function listPayload() {
  const [settings, students, classes, registrations, payments, invoices, expenses, expenseCategories, attendance, summary] = await Promise.all([
    getSettings(),
    ShortTermStudent.find().sort({ createdAt: -1 }).limit(250).lean(),
    ShortTermClass.find().sort({ createdAt: -1 }).limit(250).lean(),
    ShortTermRegistration.find().sort({ createdAt: -1 }).limit(300)
      .populate('studentId', 'fullName studentCode phone status')
      .populate('classId', 'name subject defaultFee')
      .lean(),
    ShortTermPayment.find().sort({ paidAt: -1 }).limit(200)
      .populate('studentId', 'fullName studentCode')
      .populate('registrationId', 'totalPayable balance')
      .lean(),
    ShortTermInvoice.find().sort({ issuedAt: -1 }).limit(200)
      .populate('studentId', 'fullName studentCode')
      .populate('paymentId', 'coveredMonths')
      .lean(),
    ShortTermExpense.find().sort({ expenseDate: -1, createdAt: -1 }).limit(200).lean(),
    ShortTermExpenseCategory.find().sort({ name: 1 }).lean(),
    ShortTermAttendance.find().sort({ attendanceDate: -1, createdAt: -1 }).limit(120)
      .populate('classId', 'name')
      .populate('students.studentId', 'fullName studentCode')
      .lean(),
    buildSummary()
  ]);

  // قلم‌های ماهانهٔ ثبت‌نام‌های نمایش‌داده‌شده — برای تفکیکِ ماه‌به‌ماه در UI
  const today = todayKey();
  const regIds = registrations.map((r) => r._id);
  const charges = await ShortTermCharge.find({ registrationId: { $in: regIds }, status: { $ne: 'void' } })
    .sort({ periodKey: 1 }).lean();
  const chargesByReg = new Map();
  for (const c of charges) {
    const k = String(c.registrationId);
    if (!chargesByReg.has(k)) chargesByReg.set(k, []);
    chargesByReg.get(k).push({ ...c, isOverdue: shortTermLedger.isOverdue(c, today) });
  }

  return {
    settings,
    students,
    classes,
    registrations: registrations.map((r) => ({ ...withOverdueFlag(r), charges: chargesByReg.get(String(r._id)) || [] })),
    payments,
    // بلِ قدیمی فیلدِ coveredMonths ندارد — از پرداختِ مرتبطش پر می‌شود، بعد
    // paymentId به شکلِ ساده (فقط id) برگردانده می‌شود.
    invoices: invoices.map((inv) => ({
      ...inv,
      coveredMonths: (inv.coveredMonths && inv.coveredMonths.length)
        ? inv.coveredMonths
        : (inv.paymentId?.coveredMonths || []),
      paymentId: inv.paymentId?._id || inv.paymentId || null
    })),
    expenses,
    expenseCategories,
    attendance,
    summary
  };
}

router.get('/bootstrap', async (_req, res) => {
  try {
    res.json({ success: true, ...(await listPayload()) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت اطلاعات مرکز ناموفق بود.' });
  }
});

router.get('/settings', async (_req, res) => {
  try {
    res.json({ success: true, settings: await getSettings() });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت تنظیمات مرکز ناموفق بود.' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const existing = await ShortTermSetting.findOne();
    const payload = { ...req.body, updatedBy: userId(req) };
    const settings = existing
      ? await ShortTermSetting.findByIdAndUpdate(existing._id, payload, { new: true, runValidators: true })
      : await ShortTermSetting.create(payload);
    // Settings.name is the single source of truth: forms, invoices and the
    // printed receipt all read it live from GET /settings or /bootstrap on
    // every render, so this save is the only place the center's name ever
    // needs to change.
    res.json({ success: true, settings, message: 'تنظیمات مرکز ذخیره شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: 'ذخیره تنظیمات مرکز ناموفق بود.' });
  }
});

router.get('/students', async (req, res) => {
  try {
    const items = await ShortTermStudent.find(mapListQuery(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت شاگردان ناموفق بود.' });
  }
});

router.post('/students', async (req, res) => {
  try {
    const settings = await getSettings();
    const studentCode = String(req.body.studentCode || '').trim().toUpperCase()
      || await nextSequence('short_term_student', settings.studentCodePrefix || 'STC');
    const item = await ShortTermStudent.create({ ...req.body, studentCode, createdBy: userId(req), updatedBy: userId(req) });
    res.status(201).json({ success: true, item, message: 'شاگرد ثبت شد.' });
  } catch (error) {
    const message = error?.code === 11000 ? 'کد شاگرد تکراری است.' : 'ثبت شاگرد ناموفق بود.';
    res.status(400).json({ success: false, message });
  }
});

router.put('/students/:id', async (req, res) => {
  try {
    const item = await ShortTermStudent.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: userId(req) }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: 'شاگرد پیدا نشد.' });
    res.json({ success: true, item, message: 'شاگرد به‌روزرسانی شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ویرایش شاگرد ناموفق بود.' });
  }
});

router.get('/classes', async (req, res) => {
  try {
    const items = await ShortTermClass.find(mapListQuery(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت صنف‌ها ناموفق بود.' });
  }
});

router.post('/classes', async (req, res) => {
  try {
    const days = Array.isArray(req.body.days)
      ? req.body.days
      : String(req.body.days || '').split(',').map((item) => item.trim()).filter(Boolean);
    const item = await ShortTermClass.create({
      ...req.body,
      days,
      createdBy: userId(req),
      updatedBy: userId(req)
    });
    res.status(201).json({ success: true, item, message: 'صنف ثبت شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ثبت صنف ناموفق بود.' });
  }
});

router.put('/classes/:id', async (req, res) => {
  try {
    const update = { ...req.body, updatedBy: userId(req) };
    if (req.body.days !== undefined) {
      update.days = Array.isArray(req.body.days)
        ? req.body.days
        : String(req.body.days || '').split(',').map((item) => item.trim()).filter(Boolean);
    }
    const item = await ShortTermClass.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: 'صنف پیدا نشد.' });
    res.json({ success: true, item, message: 'صنف به‌روزرسانی شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ویرایش صنف ناموفق بود.' });
  }
});

router.get('/registrations', async (req, res) => {
  try {
    const items = await ShortTermRegistration.find(mapListQuery(req.query)).sort({ createdAt: -1 })
      .populate('studentId', 'fullName studentCode phone')
      .populate('classId', 'name subject defaultFee')
      .lean();
    res.json({ success: true, items: items.map(withOverdueFlag) });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت ثبت‌نام‌ها ناموفق بود.' });
  }
});

router.post('/registrations', async (req, res) => {
  try {
    // ضدِ ثبت‌نامِ تکراری: یک شاگردِ موقت در یک صنف فقط یک ثبت‌نامِ فعال.
    if (req.body.studentId && req.body.classId) {
      const dup = await ShortTermRegistration.findOne({
        studentId: req.body.studentId, classId: req.body.classId, status: 'active'
      }).select('_id').lean();
      if (dup) {
        return res.status(409).json({
          success: false,
          message: 'این شاگرد از قبل در همین صنف ثبت‌نامِ فعال دارد. اول ثبت‌نامِ قبلی را تکمیل یا لغو کنید.'
        });
      }
    }

    const item = await ShortTermRegistration.create({ ...req.body, createdBy: userId(req), updatedBy: userId(req) });

    // بلِ ماهانه خودکار صادر نمی‌شود — از تبِ «صدور بل» صادر می‌شود.
    await shortTermLedger.recomputeRegistration(item._id);

    const populated = await ShortTermRegistration.findById(item._id)
      .populate('studentId', 'fullName studentCode phone')
      .populate('classId', 'name subject defaultFee')
      .lean();
    res.status(201).json({ success: true, item: withOverdueFlag(populated), message: 'ثبت‌نام ثبت شد. برای صدورِ بلِ ماهانه به تبِ «صدور بل» بروید.' });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'این شاگرد از قبل در همین صنف ثبت‌نامِ فعال دارد.' });
    }
    res.status(400).json({ success: false, message: 'ثبت‌نام ناموفق بود.' });
  }
});

router.put('/registrations/:id/complete', async (req, res) => {
  try {
    const item = await ShortTermRegistration.findByIdAndUpdate(
      req.params.id,
      { status: 'completed', updatedBy: userId(req) },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'ثبت‌نام پیدا نشد.' });
    res.json({ success: true, item, message: 'مدت شاگرد تکمیل علامت‌گذاری شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'تکمیل ثبت‌نام ناموفق بود.' });
  }
});

// ویرایشِ ثبت‌نامِ موقت: مدت / فیسِ ماه / تخفیف / تاریخ‌ها / وضعیت / یادداشت.
// totalPayable و balance را pre-validate از روی این مقادیر و paidAmountِ فعلی
// بازمحاسبه می‌کند. اگر مبلغِ تازه از پرداختِ ثبت‌شده کمتر شد، balance صفر می‌ماند
// (اضافه‌پرداخت) و در پاسخ هشدار می‌آید — با ابطالِ پرداخت قابلِ اصلاح است.
router.put('/registrations/:id', async (req, res) => {
  try {
    const reg = await ShortTermRegistration.findById(req.params.id);
    if (!reg) return res.status(404).json({ success: false, message: 'ثبت‌نام پیدا نشد.' });

    if (req.body.status !== undefined && ['active', 'completed', 'cancelled'].includes(req.body.status)) {
      // فعال‌سازیِ دوباره نباید ثبت‌نامِ تکراریِ فعال بسازد
      if (req.body.status === 'active' && reg.status !== 'active') {
        const dup = await ShortTermRegistration.findOne({
          _id: { $ne: reg._id }, studentId: reg.studentId, classId: reg.classId, status: 'active'
        }).select('_id').lean();
        if (dup) return res.status(409).json({ success: false, message: 'این شاگرد ثبت‌نامِ فعالِ دیگری در همین صنف دارد.' });
      }
      reg.status = req.body.status;
    }
    const financeKeys = ['registrationDate', 'startDate', 'durationMonths', 'feeAmount', 'discountAmount'];
    const financeChanged = financeKeys.some((k) => req.body[k] !== undefined);

    if (req.body.registrationDate !== undefined) reg.registrationDate = String(req.body.registrationDate || '').slice(0, 10);
    if (req.body.startDate !== undefined) reg.startDate = String(req.body.startDate || '').slice(0, 10);
    if (req.body.durationMonths !== undefined) reg.durationMonths = Math.max(1, toNumber(req.body.durationMonths));
    if (req.body.feeAmount !== undefined) reg.feeAmount = toNumber(req.body.feeAmount);
    if (req.body.discountAmount !== undefined) reg.discountAmount = toNumber(req.body.discountAmount);
    if (req.body.paymentPlan !== undefined && ['full', 'installment', 'monthly'].includes(req.body.paymentPlan)) reg.paymentPlan = req.body.paymentPlan;
    if (req.body.note !== undefined) reg.note = String(req.body.note || '').trim();
    reg.updatedBy = userId(req);
    await reg.save();

    if (financeChanged) {
      // فیسِ ماهانه عوض شد → بل‌های صادرشدهٔ پرداخت‌نشده با مبلغ/تخفیفِ تازه
      // به‌روز می‌شوند (بلِ پرداخت‌شده دست‌نخورده). بلِ تازه صادر نمی‌شود.
      const monthlyFee = shortTermLedger.round(toNumber(reg.feeAmount));
      const monthlyDiscount = Math.min(monthlyFee, shortTermLedger.round(toNumber(reg.discountAmount)));
      await ShortTermCharge.updateMany(
        { registrationId: reg._id, kind: 'monthly', status: { $ne: 'void' }, paidAmount: { $lte: 0 } },
        { $set: { amount: monthlyFee, discountAmount: monthlyDiscount } }
      );
      await shortTermLedger.recomputeRegistration(reg._id);
    }

    const fresh = await ShortTermRegistration.findById(reg._id).lean();
    const item = await ShortTermRegistration.findById(reg._id)
      .populate('studentId', 'fullName studentCode phone')
      .populate('classId', 'name subject defaultFee')
      .lean();
    const overpaid = toNumber(fresh?.paidAmount) > toNumber(fresh?.totalPayable);
    res.json({
      success: true,
      item: withOverdueFlag(item),
      message: overpaid
        ? `ثبت‌نام به‌روزرسانی شد. توجه: پرداختِ ثبت‌شده (${toNumber(fresh?.paidAmount)}) از مبلغِ تازه بیشتر است — مازاد به‌عنوان اعتبار می‌ماند.`
        : 'ثبت‌نام به‌روزرسانی شد.'
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: 'این شاگرد از قبل در همین صنف ثبت‌نامِ فعال دارد.' });
    res.status(400).json({ success: false, message: error?.message || 'ویرایشِ ثبت‌نام ناموفق بود.' });
  }
});

router.post('/payments', async (req, res) => {
  try {
    const amount = toNumber(req.body.amount);
    if (amount <= 0) return res.status(400).json({ success: false, message: 'مبلغ پرداخت باید بزرگ‌تر از صفر باشد.' });

    const registration = await ShortTermRegistration.findById(req.body.registrationId)
      .populate('studentId', 'fullName studentCode')
      .populate('classId', 'name');
    if (!registration) return res.status(404).json({ success: false, message: 'ثبت‌نام انتخاب‌شده پیدا نشد.' });

    const settings = await getSettings();
    const dueDay = settings.monthlyChargeDueDay || 20;

    // ماهِ هدفِ این پرداخت: از قلمِ هدف، وگرنه از billMonth، وگرنه ماهِ جاری.
    let targetMonth = /^\d{3,4}-(0[1-9]|1[0-2])$/.test(String(req.body.billMonth || ''))
      ? String(req.body.billMonth) : '';
    if (req.body.targetChargeId) {
      const tc = await ShortTermCharge.findById(req.body.targetChargeId).select('periodKey registrationId').lean();
      if (tc && String(tc.registrationId) === String(registration._id) && tc.periodKey) targetMonth = tc.periodKey;
    }
    if (!targetMonth) targetMonth = shortTermLedger.currentShamsiMonthKey();

    let openCharges = await ShortTermCharge.find({ registrationId: registration._id, status: { $ne: 'void' }, balance: { $gt: 0 } })
      .sort({ dueDate: 1, periodKey: 1, createdAt: 1 });
    const hasOpenForTarget = openCharges.some((c) => c.periodKey === targetMonth);

    // بلِ ماهِ هدف صادر نشده؟ — با تأییدِ کاربر همین‌جا صادر کن، وگرنه هشدار بده.
    if (!hasOpenForTarget && !req.body.targetChargeId) {
      if (!req.body.issueBillIfMissing) {
        return res.status(409).json({
          success: false,
          code: 'NO_BILL',
          billMonth: targetMonth,
          billMonthLabel: shortTermLedger.shamsiMonthLabel(targetMonth),
          message: `برای شاگرد بلِ ماهِ ${shortTermLedger.shamsiMonthLabel(targetMonth)} صادر نشده است. با تأیید، همین‌جا صادر شود؟`
        });
      }
      const issued = await shortTermLedger.issueBillForMonth(registration, targetMonth, { dueDay, issuedBy: userId(req) });
      if (issued.status === 'rejected') {
        return res.status(400).json({ success: false, message: `صدورِ بلِ ماهِ ${shortTermLedger.shamsiMonthLabel(targetMonth)} ممکن نشد: ${issued.reason}` });
      }
      await shortTermLedger.recomputeRegistration(registration._id);
      openCharges = await ShortTermCharge.find({ registrationId: registration._id, status: { $ne: 'void' }, balance: { $gt: 0 } })
        .sort({ dueDate: 1, periodKey: 1, createdAt: 1 });
    }

    const recomputed = await shortTermLedger.recomputeRegistration(registration._id);
    const previousBalance = toNumber(recomputed?.balance ?? registration.balance);
    if (amount > previousBalance + 0.001) {
      return res.status(400).json({
        success: false,
        message: `مبلغ از مجموعِ بل‌های پرداخت‌نشدهٔ این شاگرد (${previousBalance}) بیشتر است. برای پیش‌پرداخت، اول بلِ ماهِ بعد را صادر کنید.`
      });
    }
    const remainingBalance = Math.max(0, previousBalance - amount);
    const paymentNumber = await nextSequence('short_term_payment', settings.receiptPrefix || 'STC-RCP');
    const invoiceNumber = await nextSequence('short_term_invoice', settings.invoicePrefix || 'STC-INV');

    // تخصیص: قلمِ ماهِ هدف اول، بعد FIFO روی بقیهٔ ماه‌های باز.
    const targetChargeId = req.body.targetChargeId
      || (openCharges.find((c) => c.periodKey === targetMonth) || {})._id
      || '';
    const { allocations } = shortTermLedger.allocatePayment(amount, openCharges, targetChargeId);
    const coveredMonthKeys = allocations
      .map((a) => openCharges.find((c) => String(c._id) === String(a.chargeId)))
      .filter(Boolean)
      .map((c) => c.periodKey);
    const coveredMonthLabels = coveredMonthKeys.map((k) => shortTermLedger.shamsiMonthLabel(k));

    const payment = await ShortTermPayment.create({
      studentId: registration.studentId._id,
      registrationId: registration._id,
      paymentNumber,
      amount,
      allocations,
      coveredMonths: coveredMonthKeys,
      previousBalance,
      remainingBalance,
      currency: settings.currency || 'AFN',
      paymentMethod: req.body.paymentMethod || 'cash',
      paidAt: req.body.paidAt || new Date(),
      receivedBy: userId(req),
      referenceNo: req.body.referenceNo || '',
      note: req.body.note || ''
    });

    const invoice = await ShortTermInvoice.create({
      invoiceNumber,
      studentId: registration.studentId._id,
      registrationId: registration._id,
      paymentId: payment._id,
      className: registration.classId?.name || '',
      feeAmount: registration.feeAmount,
      discountAmount: registration.discountAmount,
      paidAmount: amount,
      previousBalance,
      remainingBalance,
      currency: settings.currency || 'AFN',
      paymentMethod: payment.paymentMethod,
      referenceNo: payment.referenceNo,
      issuedAt: payment.paidAt,
      receivedBy: userId(req),
      coveredMonths: coveredMonthKeys,
      note: [req.body.note || '', coveredMonthLabels.length ? `بابتِ فیسِ ماهِ ${coveredMonthLabels.join('، ')}` : '']
        .filter(Boolean).join(' — ')
    });

    payment.invoiceId = invoice._id;
    await payment.save();

    const freshReg = await shortTermLedger.recomputeRegistration(registration._id);

    const populatedPayment = await ShortTermPayment.findById(payment._id)
      .populate('studentId', 'fullName studentCode')
      .populate('registrationId', 'totalPayable balance')
      .lean();
    const populatedInvoice = await ShortTermInvoice.findById(invoice._id).populate('studentId', 'fullName studentCode fatherName').lean();

    res.status(201).json({
      success: true,
      item: populatedPayment,
      invoice: populatedInvoice,
      coveredMonths: coveredMonthKeys,
      coveredMonthLabels,
      registration: freshReg?.toObject ? freshReg.toObject() : freshReg,
      settings,
      message: coveredMonthLabels.length
        ? `پرداخت ثبت و بل صادر شد — بابتِ فیسِ ماهِ ${coveredMonthLabels.join('، ')}.`
        : 'پرداخت ثبت و بل صادر شد.'
    });
  } catch (error) {
    res.status(400).json({ success: false, message: 'ثبت پرداخت ناموفق بود.' });
  }
});

// ابطالِ یک پرداخت (اشتباه در ثبت یا بازپرداختِ نقدی به شاگرد):
// پرداخت void، بلش void، یک بلِ ابطالی (credit_note) صادر، و مبلغ از
// paidAmount/balanceِ ثبت‌نام کم می‌شود. دلیل الزامی است.
router.post('/payments/:id/void', async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'برای ابطالِ پرداخت، دلیل الزامی است.' });

    const payment = await ShortTermPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'پرداخت پیدا نشد.' });
    if (payment.status === 'void') return res.status(400).json({ success: false, message: 'این پرداخت قبلاً ابطال شده است.' });

    payment.status = 'void';
    payment.voidedAt = new Date();
    payment.voidedBy = userId(req);
    payment.voidReason = reason;
    await payment.save();

    const origInvoice = payment.invoiceId ? await ShortTermInvoice.findById(payment.invoiceId) : null;
    if (origInvoice && origInvoice.status !== 'void') {
      origInvoice.status = 'void';
      await origInvoice.save();
    }

    const settings = await getSettings();
    const creditNumber = await nextSequence('short_term_invoice', settings.invoicePrefix || 'STC-INV');
    const creditNote = await ShortTermInvoice.create({
      invoiceNumber: creditNumber,
      studentId: payment.studentId,
      registrationId: payment.registrationId,
      paymentId: payment._id,
      kind: 'credit_note',
      status: 'issued',
      voidOfId: origInvoice?._id || null,
      className: origInvoice?.className || '',
      paidAmount: toNumber(payment.amount),
      currency: payment.currency || settings.currency || 'AFN',
      paymentMethod: payment.paymentMethod,
      issuedAt: new Date(),
      receivedBy: userId(req),
      note: `ابطالِ پرداخت ${payment.paymentNumber} — ${reason}`
    });

    // قلم‌های ماهانه از allocationهای پرداخت‌های باقی‌مانده از نو محاسبه می‌شوند
    const registration = await shortTermLedger.recomputeRegistration(payment.registrationId);

    res.json({
      success: true,
      item: payment.toObject(),
      creditNote: creditNote.toObject(),
      registration: registration ? registration.toObject() : null,
      message: 'پرداخت ابطال شد و بلِ ابطالی صادر گردید.'
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ابطالِ پرداخت ناموفق بود.' });
  }
});

router.get('/invoices/:id', async (req, res) => {
  try {
    const item = await ShortTermInvoice.findById(req.params.id).populate('studentId', 'fullName studentCode phone fatherName').lean();
    if (!item) return res.status(404).json({ success: false, message: 'بل پیدا نشد.' });
    const settings = await getSettings();
    res.json({ success: true, item, settings });
  } catch {
    res.status(400).json({ success: false, message: 'دریافت بل ناموفق بود.' });
  }
});

router.post('/expenses', async (req, res) => {
  try {
    const settings = await getSettings();
    const item = await ShortTermExpense.create({ ...req.body, currency: req.body.currency || settings.currency || 'AFN', createdBy: userId(req) });
    res.status(201).json({ success: true, item, message: 'مصرف ثبت شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ثبت مصرف ناموفق بود.' });
  }
});

router.get('/expense-categories', async (_req, res) => {
  try {
    const items = await ShortTermExpenseCategory.find().sort({ name: 1 }).lean();
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت دسته‌بندی‌های مصرف ناموفق بود.' });
  }
});

router.post('/expense-categories', async (req, res) => {
  try {
    const item = await ShortTermExpenseCategory.create({ name: req.body.name });
    res.status(201).json({ success: true, item, message: 'دسته‌بندی مصرف ثبت شد.' });
  } catch (error) {
    const message = error?.code === 11000 ? 'این دسته‌بندی قبلاً تعریف شده است.' : 'ثبت دسته‌بندی مصرف ناموفق بود.';
    res.status(400).json({ success: false, message });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const filter = {};
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.date) filter.attendanceDate = String(req.query.date || '').trim();
    const items = await ShortTermAttendance.find(filter).sort({ attendanceDate: -1, createdAt: -1 })
      .populate('classId', 'name')
      .populate('students.studentId', 'fullName studentCode')
      .lean();
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت حاضری ناموفق بود.' });
  }
});

router.post('/attendance', async (req, res) => {
  try {
    const classId = req.body.classId;
    const attendanceDate = String(req.body.attendanceDate || todayKey()).trim();
    const students = Array.isArray(req.body.students)
      ? req.body.students
          .map((item) => ({
            studentId: item.studentId,
            status: ['present', 'absent', 'late', 'leave'].includes(item.status) ? item.status : 'present',
            note: String(item.note || '').trim()
          }))
          .filter((item) => item.studentId)
      : [];

    if (!classId || !students.length) {
      return res.status(400).json({ success: false, message: 'برای ثبت حاضری، صنف و شاگردان لازم است.' });
    }

    const item = await ShortTermAttendance.findOneAndUpdate(
      { classId, attendanceDate },
      {
        $set: { classId, attendanceDate, students, updatedBy: userId(req) },
        $setOnInsert: { createdBy: userId(req) }
      },
      { new: true, upsert: true, runValidators: true }
    )
      .populate('classId', 'name')
      .populate('students.studentId', 'fullName studentCode');

    res.status(201).json({ success: true, item, message: 'حاضری ذخیره شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ثبت حاضری ناموفق بود.' });
  }
});

// یک ردیفِ گزارشِ باقی‌دار/پرداخت‌کننده — الگوی مشترک با بخشِ آموزشگاه:
// فیسِ کل از «تاریخِ ثبت» و مدت، و تفکیکِ ماه‌به‌ماه از دفترِ ماهانه.
function reportRow(r, chargeList = []) {
  const today = todayKey();
  const monthlyNet = Math.max(0, toNumber(r.feeAmount) - toNumber(r.discountAmount));
  const monthsPaid = monthlyNet > 0 ? Math.round((toNumber(r.paidAmount) / monthlyNet) * 100) / 100 : 0;
  const months = chargeList
    .slice()
    .sort((a, b) => String(a.periodKey).localeCompare(String(b.periodKey)))
    .map((c) => ({
      periodKey: c.periodKey,
      amount: toNumber(c.amount) - toNumber(c.discountAmount),
      paid: toNumber(c.paidAmount),
      balance: toNumber(c.balance),
      status: c.status,
      overdue: shortTermLedger.isOverdue(c, today)
    }));
  return {
    _id: r._id,
    studentId: r.studentId,
    classId: r.classId,
    registrationDate: r.registrationDate,
    startDate: r.startDate,
    endDate: r.endDate,
    durationMonths: r.durationMonths,
    totalPayable: toNumber(r.totalPayable),
    paidAmount: toNumber(r.paidAmount),
    balance: toNumber(r.balance),
    credit: Math.max(0, toNumber(r.paidAmount) - toNumber(r.totalPayable)),
    monthsPaid,
    monthsRemaining: Math.max(0, toNumber(r.durationMonths) - monthsPaid),
    months,
    paidMonths: months.filter((m) => m.status === 'paid').map((m) => m.periodKey),
    dueMonths: months.filter((m) => m.balance > 0).map((m) => m.periodKey),
    overdueMonths: months.filter((m) => m.overdue).map((m) => m.periodKey),
    paymentStatus: r.paymentStatus,
    overdue: r.status === 'active' && r.endDate && r.endDate < today
  };
}

router.get('/reports/overview', async (_req, res) => {
  try {
    const liveFilter = { status: { $ne: 'cancelled' } };
    const [summary, debtorRegs, payerRegs, byClass] = await Promise.all([
      buildSummary(),
      // شاگردانِ باقی‌دار — هر ثبت‌نامِ فعالی که هنوز باقیِ پرداخت‌نشده دارد
      ShortTermRegistration.find({ balance: { $gt: 0 }, status: 'active' })
        .sort({ balance: -1 }).limit(200)
        .populate('studentId', 'fullName studentCode phone status')
        .populate('classId', 'name subject')
        .lean(),
      // شاگردانِ پرداخت‌کننده — هر ثبت‌نامِ غیرِلغوی که پرداختِ ثبت‌شده دارد
      ShortTermRegistration.find({ paidAmount: { $gt: 0 }, ...liveFilter })
        .sort({ paidAmount: -1 }).limit(300)
        .populate('studentId', 'fullName studentCode phone status')
        .populate('classId', 'name subject')
        .lean(),
      ShortTermRegistration.aggregate([
        { $match: liveFilter },
        { $group: { _id: '$classId', registrations: { $sum: 1 }, payable: { $sum: '$totalPayable' }, paid: { $sum: '$paidAmount' }, balance: { $sum: '$balance' } } },
        { $sort: { paid: -1 } },
        { $limit: 20 }
      ])
    ]);
    const classIds = byClass.map((item) => item._id).filter(Boolean);
    const classes = await ShortTermClass.find({ _id: { $in: classIds } }).select('name').lean();
    const classMap = new Map(classes.map((item) => [String(item._id), item.name]));
    const notInactive = (r) => !r.studentId || r.studentId.status !== 'inactive';

    // قلم‌های ماهانهٔ همهٔ ثبت‌نام‌های این گزارش — برای تفکیکِ ماه‌به‌ماهِ هر ردیف
    const reportRegIds = [...new Set([...debtorRegs, ...payerRegs].map((r) => String(r._id)))];
    const reportCharges = await ShortTermCharge.find({ registrationId: { $in: reportRegIds }, status: { $ne: 'void' } }).lean();
    const chargeMap = new Map();
    for (const c of reportCharges) {
      const k = String(c.registrationId);
      if (!chargeMap.has(k)) chargeMap.set(k, []);
      chargeMap.get(k).push(c);
    }

    const debtors = debtorRegs.filter(notInactive).map((r) => reportRow(r, chargeMap.get(String(r._id)) || []));
    const payers = payerRegs.filter(notInactive).map((r) => reportRow(r, chargeMap.get(String(r._id)) || []));
    res.json({
      success: true,
      summary,
      debtors,
      payers,
      debtorTotal: debtors.reduce((s, r) => s + r.balance, 0),
      payerReceived: payers.reduce((s, r) => s + r.paidAmount, 0),
      byClass: byClass.map((item) => ({ ...item, className: classMap.get(String(item._id)) || 'صنف' }))
    });
  } catch {
    res.status(500).json({ success: false, message: 'گزارش مرکز ناموفق بود.' });
  }
});

router.get('/reports/monthly', async (req, res) => {
  try {
    const result = await buildShamsiMonthlyReport({
      paymentModel: ShortTermPayment,
      expenseModel: ShortTermExpense,
      // عاید فقط از پرداختِ ابطال‌نشده (status != void) و دارای بلِ صادرشده
      paymentMatch: { status: { $ne: 'void' }, invoiceId: { $ne: null } },
      year: Number(req.query.year),
      months: req.query.months
    });

    res.json({ success: true, months: result });
  } catch {
    res.status(500).json({ success: false, message: 'گزارش ماهانه ناموفق بود.' });
  }
});

// عاید، مصرف و مفادِ یک ماهِ شمسی (پیش‌فرض: ماهِ جاری) — تعریفِ واحد:
// عاید فقط از پرداختِ ابطال‌نشدهٔ دارای بلِ صادرشده، منهای مصارفِ همان ماه،
// همراهِ تفکیکِ «عاید بابتِ فیسِ کدام ماه‌ها».
router.get('/reports/monthly-pnl', async (req, res) => {
  try {
    const month = /^\d{3,4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || ''))
      ? String(req.query.month)
      : shortTermLedger.currentShamsiMonthKey();
    const pnl = await shortTermLedger.monthlyPnl(month);
    res.json({ success: true, ...pnl, label: shortTermLedger.shamsiMonthLabel(month) });
  } catch {
    res.status(500).json({ success: false, message: 'گزارشِ عاید و مصرفِ ماه ناموفق بود.' });
  }
});

// دفترِ باقیاتِ ماهانه — per شاگرد/ثبت‌نام: از ماهِ عضویت تا ماهِ جاری، هر ماه
// پرداخت‌شده/باقی، با نامِ ماهِ شمسی، و مجموع پرداخت/باقیِ هر شاگرد + جمعِ کل.
router.get('/reports/monthly-ledger', async (req, res) => {
  try {
    const L = shortTermLedger;
    const onlyDebtors = ['1', 'true', 'yes'].includes(String(req.query.onlyDebtors || '').toLowerCase());
    const classId = String(req.query.classId || '').trim();
    const regFilter = { status: { $in: ['active', 'completed'] } };
    if (classId) regFilter.classId = classId;

    const regs = await ShortTermRegistration.find(regFilter)
      .sort({ createdAt: 1 })
      .populate('studentId', 'fullName studentCode phone status')
      .populate('classId', 'name subject')
      .lean();
    const regIds = regs.map((r) => r._id);
    const charges = await ShortTermCharge.find({ registrationId: { $in: regIds }, status: { $ne: 'void' } }).lean();
    const byReg = new Map();
    for (const c of charges) {
      const k = String(c.registrationId);
      if (!byReg.has(k)) byReg.set(k, []);
      byReg.get(k).push(c);
    }
    const today = todayKey();
    const curKey = L.currentShamsiMonthKey();
    const curOrd = L.monthOrdinal(curKey);

    let rows = regs
      .filter((r) => !r.studentId || r.studentId.status !== 'inactive')
      .map((r) => {
        const list = (byReg.get(String(r._id)) || [])
          .slice()
          .sort((a, b) => L.monthOrdinal(a.periodKey) - L.monthOrdinal(b.periodKey));
        const months = list.map((c) => {
          const net = Math.max(0, L.num(c.amount) - L.num(c.discountAmount));
          const unpaid = c.status !== 'paid' && L.num(c.balance) > 0.001;
          const isFuture = L.monthOrdinal(c.periodKey) > curOrd;
          return {
            chargeId: c._id,
            periodKey: c.periodKey,
            label: L.shamsiMonthLabel(c.periodKey),
            fee: L.num(c.amount),
            discount: L.num(c.discountAmount),
            net,
            paid: L.num(c.paidAmount),
            balance: L.num(c.balance),
            status: c.status,
            // معوق = پرداخت‌نشده و ماهش رسیده/گذشته؛ dueLater = پرداخت‌نشده ولی
            // ماهش هنوز نیامده (این باقی هست ولی «معوق» نیست).
            overdue: unpaid && !isFuture,
            dueLater: unpaid && isFuture
          };
        });
        const startKey = L.shamsiMonthKey(r.startDate || r.registrationDate);
        const totalNet = L.round(months.reduce((s, m) => s + m.net, 0));
        const totalPaid = L.round(months.reduce((s, m) => s + m.paid, 0));
        const totalBalance = L.round(months.reduce((s, m) => s + m.balance, 0));
        // بلِ ماهِ جاری صادر شده؟ (شاگردِ فعال، ماهِ جاری مجاز)
        const noBillThisMonth = r.status === 'active'
          && L.billMonthAllowed(r, curKey)
          && !months.some((m) => m.periodKey === curKey);
        return {
          registrationId: r._id,
          studentId: r.studentId,
          classId: r.classId,
          status: r.status,
          startMonthKey: startKey,
          startMonthLabel: L.shamsiMonthLabel(startKey),
          monthlyFee: L.num(r.feeAmount),
          monthlyDiscount: L.num(r.discountAmount),
          monthlyNet: Math.max(0, L.num(r.feeAmount) - L.num(r.discountAmount)),
          noBillThisMonth,
          currentMonthLabel: L.shamsiMonthLabel(curKey),
          months,
          totalPayable: totalNet,
          totalPaid,
          totalBalance,
          credit: Math.max(0, L.round(L.num(r.paidAmount) - totalNet)),
          paidMonthLabels: months.filter((m) => m.status === 'paid').map((m) => m.label),
          dueMonthLabels: months.filter((m) => m.balance > 0).map((m) => m.label),
          overdueMonthLabels: months.filter((m) => m.overdue).map((m) => m.label),
          dueLaterMonthLabels: months.filter((m) => m.dueLater).map((m) => m.label),
          // «از کدام ماه باقی است» — اولین ماهِ پرداخت‌نشده
          arrearsFromLabel: (months.find((m) => m.balance > 0.001) || {}).label || '',
          // اولین ماهِ معوق (رسیده و پرداخت‌نشده)
          overdueFromLabel: (months.find((m) => m.overdue) || {}).label || ''
        };
      });

    // «فقط باقی‌داران» = دارای باقی‌داری، یا بلِ ماهِ جاری برایشان صادر نشده.
    if (onlyDebtors) rows = rows.filter((r) => r.totalBalance > 0.001 || r.noBillThisMonth);
    rows.sort((a, b) => b.totalBalance - a.totalBalance);

    res.json({
      success: true,
      currentMonth: { periodKey: L.currentShamsiMonthKey(), label: L.shamsiMonthLabel(L.currentShamsiMonthKey()) },
      rows,
      totals: {
        rows: rows.length,
        debtors: rows.filter((r) => r.totalBalance > 0.001).length,
        noBillThisMonth: rows.filter((r) => r.noBillThisMonth).length,
        totalPaid: L.round(rows.reduce((s, r) => s + r.totalPaid, 0)),
        totalBalance: L.round(rows.reduce((s, r) => s + r.totalBalance, 0))
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'گزارشِ باقیاتِ ماهانه ناموفق بود.' });
  }
});

// ===== صدور بل (بل با اقدامِ صریح، نه خودکار) =====

const validMonth = (v) => /^\d{3,4}-(0[1-9]|1[0-2])$/.test(String(v || ''));

// پیش‌نمایشِ صدورِ بلِ یک ماه: کدام شاگردِ فعال بل دارد، کدام ندارد.
router.post('/bills/preview', async (req, res) => {
  try {
    const L = shortTermLedger;
    const month = validMonth(req.body.month) ? String(req.body.month) : L.currentShamsiMonthKey();
    const classId = String(req.body.classId || '').trim();
    const regFilter = { status: 'active' };
    if (classId) regFilter.classId = classId;
    const regs = await ShortTermRegistration.find(regFilter)
      .sort({ createdAt: 1 })
      .populate('studentId', 'fullName studentCode phone status')
      .populate('classId', 'name')
      .lean();
    const regIds = regs.map((r) => r._id);
    const existing = await ShortTermCharge.find({ registrationId: { $in: regIds }, periodKey: month, status: { $ne: 'void' } })
      .select('registrationId amount discountAmount status balance').lean();
    const byReg = new Map(existing.map((c) => [String(c.registrationId), c]));
    const rows = regs
      .filter((r) => !r.studentId || r.studentId.status !== 'inactive')
      .map((r) => {
        const c = byReg.get(String(r._id));
        const monthlyNet = Math.max(0, L.num(r.feeAmount) - L.num(r.discountAmount));
        return {
          registrationId: r._id,
          studentId: r.studentId,
          classId: r.classId,
          monthlyFee: L.num(r.feeAmount),
          monthlyDiscount: L.num(r.discountAmount),
          proposedNet: monthlyNet,
          hasBill: Boolean(c),
          billStatus: c ? c.status : '',
          allowed: L.billMonthAllowed(r, month),
          disallowReason: L.billMonthDisallowReason(r, month)
        };
      });
    res.json({
      success: true,
      month,
      label: L.shamsiMonthLabel(month),
      rows,
      totals: {
        active: rows.length,
        withBill: rows.filter((x) => x.hasBill).length,
        withoutBill: rows.filter((x) => !x.hasBill && x.allowed).length
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'پیش‌نمایشِ صدورِ بل ناموفق بود.' });
  }
});

// صدورِ گروهیِ بلِ یک ماه برای شاگردانِ فعال (idempotent).
router.post('/bills/issue', async (req, res) => {
  try {
    if (!validMonth(req.body.month)) return res.status(400).json({ success: false, message: 'ماهِ انتخاب‌شده معتبر نیست.' });
    const settings = await getSettings();
    const idList = Array.isArray(req.body.ids) ? req.body.ids
      : Array.isArray(req.body.studentIds) ? req.body.studentIds
        : null;
    const result = await shortTermLedger.issueBillsForMonth({
      month: String(req.body.month),
      classId: String(req.body.classId || '').trim(),
      ids: idList,
      dueDay: settings.monthlyChargeDueDay || 20,
      issuedBy: userId(req)
    });
    const issued = result.created + result.updated;
    res.json({
      success: true,
      ...result,
      message: issued > 0
        ? `بلِ ماهِ ${result.label} برای ${issued} شاگرد صادر شد${result.skipped ? ` (${result.skipped} از قبل داشتند)` : ''}.`
        : `همهٔ شاگردانِ انتخاب‌شده از قبل بلِ ماهِ ${result.label} داشتند — تغییری لازم نبود.`
    });
  } catch {
    res.status(500).json({ success: false, message: 'صدورِ گروهیِ بل ناموفق بود.' });
  }
});

// صدورِ تک‌بل برای یک (شاگرد، ماه) با مبلغِ دلخواه.
router.post('/bills', async (req, res) => {
  try {
    if (!validMonth(req.body.month)) return res.status(400).json({ success: false, message: 'ماهِ انتخاب‌شده معتبر نیست.' });
    const reg = await ShortTermRegistration.findById(req.body.registrationId);
    if (!reg) return res.status(404).json({ success: false, message: 'ثبت‌نام پیدا نشد.' });
    const settings = await getSettings();
    const r = await shortTermLedger.issueBillForMonth(reg, String(req.body.month), {
      dueDay: settings.monthlyChargeDueDay || 20,
      amount: req.body.amount != null ? toNumber(req.body.amount) : null,
      discountAmount: req.body.discountAmount != null ? toNumber(req.body.discountAmount) : null,
      issuedBy: userId(req)
    });
    if (r.status === 'rejected') return res.status(400).json({ success: false, message: `صدورِ بل ممکن نشد: ${r.reason}` });
    const fresh = await shortTermLedger.recomputeRegistration(reg._id);
    res.status(201).json({
      success: true,
      chargeId: r.chargeId,
      status: r.status,
      registration: fresh?.toObject ? fresh.toObject() : fresh,
      message: r.status === 'created' ? 'بل صادر شد.' : r.status === 'updated' ? 'بل به‌روز شد.' : 'بلِ این ماه از قبل هست.'
    });
  } catch {
    res.status(500).json({ success: false, message: 'صدورِ بل ناموفق بود.' });
  }
});

// ویرایشِ بلِ پرداخت‌نشده.
router.put('/bills/:id', async (req, res) => {
  try {
    const c = await ShortTermCharge.findById(req.params.id);
    if (!c) return res.status(404).json({ success: false, message: 'بل پیدا نشد.' });
    if (c.status === 'void') return res.status(400).json({ success: false, message: 'بلِ ابطالی قابلِ ویرایش نیست.' });
    if (toNumber(c.paidAmount) > 0) return res.status(400).json({ success: false, message: 'بلی که پرداخت خورده قابلِ ویرایش نیست؛ آن را ابطال و از نو صادر کنید.' });
    if (req.body.amount !== undefined) c.amount = toNumber(req.body.amount);
    if (req.body.discountAmount !== undefined) c.discountAmount = toNumber(req.body.discountAmount);
    if (req.body.dueDate !== undefined) c.dueDate = String(req.body.dueDate || '').slice(0, 10);
    if (req.body.note !== undefined) c.note = String(req.body.note || '').trim();
    c.updatedBy = userId(req);
    await c.save();
    const fresh = await shortTermLedger.recomputeRegistration(c.registrationId);
    res.json({ success: true, item: c.toObject(), registration: fresh?.toObject ? fresh.toObject() : fresh, message: 'بل به‌روز شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ویرایشِ بل ناموفق بود.' });
  }
});

// ابطالِ بلِ پرداخت‌نشده (با دلیل).
router.post('/bills/:id/void', async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'برای ابطالِ بل، دلیل الزامی است.' });
    const c = await ShortTermCharge.findById(req.params.id);
    if (!c) return res.status(404).json({ success: false, message: 'بل پیدا نشد.' });
    if (c.status === 'void') return res.status(400).json({ success: false, message: 'این بل قبلاً ابطال شده است.' });
    if (toNumber(c.paidAmount) > 0) return res.status(400).json({ success: false, message: 'بلی که پرداخت خورده قابلِ ابطال نیست؛ اول پرداخت را ابطال کنید.' });
    c.status = 'void';
    c.voidedAt = new Date();
    c.voidedBy = userId(req);
    c.voidReason = reason;
    await c.save();
    const fresh = await shortTermLedger.recomputeRegistration(c.registrationId);
    res.json({ success: true, item: c.toObject(), registration: fresh?.toObject ? fresh.toObject() : fresh, message: 'بل ابطال شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ابطالِ بل ناموفق بود.' });
  }
});

// شاگردانِ فعالی که بلِ ماهِ انتخابی (پیش‌فرض: ماهِ جاری) را ندارند.
router.get('/reports/no-bill', async (req, res) => {
  try {
    const L = shortTermLedger;
    const month = validMonth(req.query.month) ? String(req.query.month) : L.currentShamsiMonthKey();
    const regs = await ShortTermRegistration.find({ status: 'active' })
      .populate('studentId', 'fullName studentCode phone status')
      .populate('classId', 'name')
      .lean();
    const active = regs.filter((r) => !r.studentId || r.studentId.status !== 'inactive');
    const withBill = new Set(
      (await ShortTermCharge.find({
        registrationId: { $in: active.map((r) => r._id) },
        periodKey: month,
        status: { $ne: 'void' }
      }).select('registrationId').lean()).map((c) => String(c.registrationId))
    );
    const rows = active
      .filter((r) => !withBill.has(String(r._id)) && L.billMonthAllowed(r, month))
      .map((r) => ({
        registrationId: r._id,
        studentId: r.studentId,
        classId: r.classId,
        monthlyFee: L.num(r.feeAmount),
        monthlyNet: Math.max(0, L.num(r.feeAmount) - L.num(r.discountAmount))
      }));
    res.json({ success: true, month, label: L.shamsiMonthLabel(month), count: rows.length, rows });
  } catch {
    res.status(500).json({ success: false, message: 'گزارشِ شاگردانِ بدونِ بل ناموفق بود.' });
  }
});

// گزارشِ ماهِ مشخص — مثلِ «گزارش مخصوص ماه»ی مالیِ مکتب.
router.get('/reports/month-specific', async (req, res) => {
  try {
    const L = shortTermLedger;
    const month = validMonth(req.query.month) ? String(req.query.month) : L.currentShamsiMonthKey();
    const bills = await ShortTermCharge.find({ periodKey: month, status: { $ne: 'void' } })
      .select('studentId amount discountAmount paidAmount balance status').lean();
    const students = new Set(bills.map((b) => String(b.studentId)));
    const billed = L.round(bills.reduce((s, b) => s + Math.max(0, L.num(b.amount) - L.num(b.discountAmount)), 0));
    const collected = L.round(bills.reduce((s, b) => s + L.num(b.paidAmount), 0));
    const outstanding = L.round(bills.reduce((s, b) => s + L.num(b.balance), 0));
    const paidBills = bills.filter((b) => b.status === 'paid').length;
    res.json({
      success: true,
      month,
      label: L.shamsiMonthLabel(month),
      totalBills: bills.length,
      totalStudents: students.size,
      paidBills,
      billedAmount: billed,
      collectedApproved: collected,
      outstanding
    });
  } catch {
    res.status(500).json({ success: false, message: 'گزارشِ ماهِ مشخص ناموفق بود.' });
  }
});

module.exports = router;
