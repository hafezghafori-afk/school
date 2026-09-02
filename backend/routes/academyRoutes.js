const express = require('express');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const AcademyCounter = require('../models/AcademyCounter');
const AcademySetting = require('../models/AcademySetting');
const AcademyStudent = require('../models/AcademyStudent');
const AcademyCourse = require('../models/AcademyCourse');
const AcademyTeacher = require('../models/AcademyTeacher');
const AcademyClass = require('../models/AcademyClass');
const AcademyRegistration = require('../models/AcademyRegistration');
const AcademyPayment = require('../models/AcademyPayment');
const AcademyInvoice = require('../models/AcademyInvoice');
const AcademyCharge = require('../models/AcademyCharge');
const academyLedger = require('../services/academyLedger');
const AcademyExpense = require('../models/AcademyExpense');
const AcademyExpenseCategory = require('../models/AcademyExpenseCategory');
const AcademyAttendance = require('../models/AcademyAttendance');
const AcademyPayrollRun = require('../models/AcademyPayrollRun');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');
const { buildShamsiMonthlyReport, currentShamsiMonthRange, lastShamsiMonthKeys } = require('../utils/shamsiMonthlyReport');

const router = express.Router();

router.use(requireAuth, requireRole(['admin']), requirePermission('manage_finance'));
attachWriteActivityAudit(router, { targetType: 'Academy', actionPrefix: 'academy', audit: (payload) => logActivity(payload) });

const todayKey = () => new Date().toISOString().slice(0, 10);
const toNumber = (value) => Math.max(0, Number(value || 0));
const userId = (req) => req.user?.id || null;

async function nextSequence(key, prefix) {
  const counter = await AcademyCounter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}-${String(counter.seq).padStart(6, '0')}`;
}

async function getSettings() {
  let settings = await AcademySetting.findOne().lean();
  if (!settings) {
    settings = (await AcademySetting.create({})).toObject();
  }
  return settings;
}

function mapListQuery(query = {}) {
  const filter = {};
  const status = String(query.status || '').trim();
  if (status && status !== 'all') filter.status = status;
  return filter;
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
    AcademyStudent.countDocuments({ status: 'active' }),
    AcademyClass.countDocuments({ status: 'active' }),
    AcademyRegistration.find().select('totalPayable paidAmount balance status paymentStatus createdAt').lean(),
    AcademyPayment.find().sort({ paidAt: -1 }).limit(8).populate('studentId', 'fullName studentCode').lean(),
    AcademyExpense.find().sort({ expenseDate: -1, createdAt: -1 }).limit(8).lean(),
    AcademyInvoice.find().sort({ issuedAt: -1 }).limit(8).populate('studentId', 'fullName studentCode').lean()
  ]);

  const paidTotal = registrations.reduce((sum, item) => sum + toNumber(item.paidAmount), 0);
  const outstandingTotal = registrations.reduce((sum, item) => sum + toNumber(item.balance), 0);
  const dueTotal = registrations.reduce((sum, item) => sum + toNumber(item.totalPayable), 0);
  const { start: shamsiMonthStart, endExclusive: shamsiMonthEnd } = currentShamsiMonthRange();
  const monthIncome = await AcademyPayment.aggregate([
    {
      $match: {
        status: { $ne: 'void' },
        paidAt: {
          $gte: new Date(`${shamsiMonthStart}T00:00:00.000Z`),
          $lt: new Date(`${shamsiMonthEnd}T00:00:00.000Z`)
        }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const monthExpenses = await AcademyExpense.aggregate([
    { $match: { expenseDate: { $gte: shamsiMonthStart, $lt: shamsiMonthEnd } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  return {
    activeStudents,
    activeClasses,
    registrations: registrations.length,
    invoices: await AcademyInvoice.countDocuments(),
    dueTotal,
    paidTotal,
    outstandingTotal,
    monthIncome: toNumber(monthIncome?.[0]?.total),
    monthExpenses: toNumber(monthExpenses?.[0]?.total),
    recentPayments: payments,
    recentExpenses: expenses,
    recentInvoices: invoices
  };
}

async function listPayload() {
  // شارژِ ماهانهٔ ماه‌های سررسیدشده را بی‌سروصدا بساز (idempotent)
  try {
    const s = await getSettings();
    await academyLedger.generateMonthlyCharges({ dueDay: s.monthlyChargeDueDay || 20 });
    if (s.lateFeeMode && s.lateFeeMode !== 'none') {
      await academyLedger.generateLateFees({ mode: s.lateFeeMode, amount: s.lateFeeAmount, graceDays: s.lateFeeGraceDays });
    }
  } catch (error) {
    console.error('academy lazy charge generation failed:', error?.message || error);
  }

  const [settings, students, courses, teachers, classes, registrations, payments, invoices, charges, expenses, expenseCategories, attendance, summary] = await Promise.all([
    getSettings(),
    AcademyStudent.find().sort({ createdAt: -1 }).limit(250).lean(),
    AcademyCourse.find().sort({ createdAt: -1 }).limit(250).lean(),
    AcademyTeacher.find().sort({ createdAt: -1 }).limit(250).lean(),
    AcademyClass.find().sort({ createdAt: -1 }).limit(250).populate('courseId', 'name defaultFee level').populate('teacherId', 'fullName').lean(),
    AcademyRegistration.find().sort({ createdAt: -1 }).limit(300)
      .populate('studentId', 'fullName studentCode phone')
      .populate('courseId', 'name defaultFee level')
      .populate('classId', 'name')
      .lean(),
    AcademyPayment.find().sort({ paidAt: -1 }).limit(200)
      .populate('studentId', 'fullName studentCode')
      .populate('registrationId', 'totalPayable balance')
      .lean(),
    AcademyInvoice.find().sort({ issuedAt: -1 }).limit(200)
      .populate('studentId', 'fullName studentCode')
      .lean(),
    AcademyCharge.find({ status: { $ne: 'void' } }).sort({ dueDate: 1, createdAt: 1 }).limit(2000).lean(),
    AcademyExpense.find().sort({ expenseDate: -1, createdAt: -1 }).limit(200).lean(),
    AcademyExpenseCategory.find().sort({ name: 1 }).lean(),
    AcademyAttendance.find().sort({ attendanceDate: -1, createdAt: -1 }).limit(120)
      .populate('classId', 'name')
      .populate('students.studentId', 'fullName studentCode')
      .lean(),
    buildSummary()
  ]);

  // اقلامِ بدهی را با پرچمِ isOverdue محاسبه‌ای بفرست
  const today = academyLedger.todayKey();
  const chargesOut = charges.map((c) => ({ ...c, isOverdue: academyLedger.isOverdue(c, today) }));

  return { settings, students, courses, teachers, classes, registrations, payments, invoices, charges: chargesOut, expenses, expenseCategories, attendance, summary };
}

router.get('/bootstrap', async (_req, res) => {
  try {
    res.json({ success: true, ...(await listPayload()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'دریافت اطلاعات آموزشگاه ناموفق بود.' });
  }
});

router.get('/settings', async (_req, res) => {
  try {
    res.json({ success: true, settings: await getSettings() });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'دریافت تنظیمات آموزشگاه ناموفق بود.' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const existing = await AcademySetting.findOne();
    const payload = { ...req.body, updatedBy: userId(req) };
    const settings = existing
      ? await AcademySetting.findByIdAndUpdate(existing._id, payload, { new: true, runValidators: true })
      : await AcademySetting.create(payload);
    res.json({ success: true, settings, message: 'تنظیمات آموزشگاه ذخیره شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ذخیره تنظیمات آموزشگاه ناموفق بود.' });
  }
});

router.get('/students', async (req, res) => {
  try {
    const items = await AcademyStudent.find(mapListQuery(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'دریافت شاگردان آموزشگاه ناموفق بود.' });
  }
});

router.post('/students', async (req, res) => {
  try {
    const settings = await getSettings();
    const studentCode = String(req.body.studentCode || '').trim().toUpperCase()
      || await nextSequence('academy_student', settings.studentCodePrefix || 'AST');
    const item = await AcademyStudent.create({ ...req.body, studentCode, createdBy: userId(req), updatedBy: userId(req) });
    res.status(201).json({ success: true, item, message: 'شاگرد آموزشگاه ثبت شد.' });
  } catch (error) {
    const message = error?.code === 11000 ? 'کد شاگرد آموزشگاه تکراری است.' : 'ثبت شاگرد آموزشگاه ناموفق بود.';
    res.status(400).json({ success: false, message });
  }
});

router.put('/students/:id', async (req, res) => {
  try {
    const item = await AcademyStudent.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: userId(req) }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: 'شاگرد پیدا نشد.' });
    res.json({ success: true, item, message: 'شاگرد آموزشگاه به‌روزرسانی شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ویرایش شاگرد آموزشگاه ناموفق بود.' });
  }
});

router.get('/courses', async (req, res) => {
  try {
    const items = await AcademyCourse.find(mapListQuery(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'دریافت کورس‌ها ناموفق بود.' });
  }
});

router.post('/courses', async (req, res) => {
  try {
    const item = await AcademyCourse.create({ ...req.body, createdBy: userId(req), updatedBy: userId(req) });
    res.status(201).json({ success: true, item, message: 'کورس آموزشگاه ثبت شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ثبت کورس آموزشگاه ناموفق بود.' });
  }
});

router.put('/courses/:id', async (req, res) => {
  try {
    const item = await AcademyCourse.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: userId(req) }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: 'کورس پیدا نشد.' });
    res.json({ success: true, item, message: 'کورس آموزشگاه به‌روزرسانی شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ویرایش کورس آموزشگاه ناموفق بود.' });
  }
});

router.get('/teachers', async (req, res) => {
  try {
    const items = await AcademyTeacher.find(mapListQuery(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'دریافت استادان ناموفق بود.' });
  }
});

router.post('/teachers', async (req, res) => {
  try {
    const item = await AcademyTeacher.create({ ...req.body, createdBy: userId(req), updatedBy: userId(req) });
    res.status(201).json({ success: true, item, message: 'استاد آموزشگاه ثبت شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ثبت استاد آموزشگاه ناموفق بود.' });
  }
});

router.get('/classes', async (req, res) => {
  try {
    const items = await AcademyClass.find(mapListQuery(req.query)).sort({ createdAt: -1 })
      .populate('courseId', 'name defaultFee level')
      .populate('teacherId', 'fullName')
      .lean();
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'دریافت پلان صنف ناموفق بود.' });
  }
});

router.post('/classes', async (req, res) => {
  try {
    const days = Array.isArray(req.body.days)
      ? req.body.days
      : String(req.body.days || '').split(',').map((item) => item.trim()).filter(Boolean);
    const item = await AcademyClass.create({
      ...req.body,
      teacherId: req.body.teacherId || null,
      days,
      createdBy: userId(req),
      updatedBy: userId(req)
    });
    res.status(201).json({ success: true, item, message: 'پلان صنف آموزشگاه ثبت شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ثبت پلان صنف ناموفق بود.' });
  }
});

router.get('/registrations', async (req, res) => {
  try {
    const items = await AcademyRegistration.find(mapListQuery(req.query)).sort({ createdAt: -1 })
      .populate('studentId', 'fullName studentCode phone')
      .populate('courseId', 'name defaultFee level')
      .populate('classId', 'name')
      .lean();
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'دریافت ثبت‌نام‌ها ناموفق بود.' });
  }
});

router.post('/registrations', async (req, res) => {
  try {
    const settings = await getSettings();
    const currency = req.body.currency || settings.currency || 'AFN';
    const reg = await AcademyRegistration.create({
      ...req.body,
      currency,
      ledgerManaged: true,
      createdBy: userId(req),
      updatedBy: userId(req)
    });

    // اقلامِ بدهیِ اولیه بر اساسِ نوعِ پرداخت
    const fee = toNumber(reg.feeAmount);
    const discount = Math.min(fee, toNumber(reg.discountAmount));
    const installments = Array.isArray(req.body.installments) ? req.body.installments : [];

    if (reg.paymentPlan === 'installment' && installments.length) {
      let idx = 0;
      for (const row of installments) {
        idx += 1;
        const amount = toNumber(row.amount);
        if (amount <= 0) continue;
        await AcademyCharge.create({
          registrationId: reg._id, studentId: reg.studentId, kind: 'installment',
          title: String(row.title || `قسط ${idx}`).trim(),
          amount, dueDate: String(row.dueDate || '').slice(0, 10), currency, createdBy: userId(req)
        });
      }
    } else if (reg.paymentPlan === 'monthly') {
      // شارژِ ماهانه با lazy generate ساخته می‌شود — اگر feeAmount داده شده و monthlyFee خالی است، همان را بگذار
      if (!toNumber(reg.monthlyFee) && fee > 0) { reg.monthlyFee = fee; await reg.save(); }
    } else if (fee > 0) {
      await AcademyCharge.create({
        registrationId: reg._id, studentId: reg.studentId, kind: 'enrollment',
        title: 'فیس / شمولیت', amount: fee, discountAmount: discount,
        discountReason: String(req.body.discountReason || '').trim(),
        discountType: ['sibling', 'scholarship', 'staff', 'hardship', 'other'].includes(req.body.discountType) ? req.body.discountType : '',
        discountApprovedBy: discount > 0 ? userId(req) : null,
        dueDate: String(reg.startDate || reg.registrationDate || '').slice(0, 10),
        currency, createdBy: userId(req)
      });
    }

    if (reg.paymentPlan === 'monthly') {
      try { await academyLedger.generateMonthlyCharges({ dueDay: settings.monthlyChargeDueDay || 20, registrationId: reg._id }); } catch (e) { console.error(e?.message); }
    }
    await academyLedger.recomputeRegistration(reg._id);

    const populated = await AcademyRegistration.findById(reg._id)
      .populate('studentId', 'fullName studentCode phone')
      .populate('courseId', 'name defaultFee level')
      .populate('classId', 'name');
    res.status(201).json({ success: true, item: populated, message: 'ثبت‌نام آموزشگاه انجام شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ثبت‌نام آموزشگاه ناموفق بود.' });
  }
});

router.post('/payments', async (req, res) => {
  try {
    const amount = toNumber(req.body.amount);
    if (amount <= 0) return res.status(400).json({ success: false, message: 'مبلغ پرداخت باید بزرگ‌تر از صفر باشد.' });

    const registration = await AcademyRegistration.findById(req.body.registrationId)
      .populate('studentId', 'fullName studentCode')
      .populate('courseId', 'name')
      .populate('classId', 'name');
    if (!registration) return res.status(404).json({ success: false, message: 'ثبت‌نام انتخاب‌شده پیدا نشد.' });

    const settings = await getSettings();

    // اطمینان از این‌که ثبت‌نامِ قدیمی حداقل یک قلمِ بدهی دارد (دادهٔ پیش از مهاجرت)
    await academyLedger.recomputeRegistration(registration._id);
    let openCharges = await AcademyCharge.find({ registrationId: registration._id, status: { $ne: 'void' } })
      .sort({ dueDate: 1, createdAt: 1 });
    if (!openCharges.length) {
      const fee = toNumber(registration.feeAmount);
      if (fee > 0) {
        await AcademyCharge.create({
          registrationId: registration._id, studentId: registration.studentId._id, kind: 'enrollment',
          title: 'فیس / شمولیت', amount: fee, discountAmount: Math.min(fee, toNumber(registration.discountAmount)),
          dueDate: String(registration.registrationDate || '').slice(0, 10),
          currency: settings.currency || 'AFN', createdBy: userId(req)
        });
        await academyLedger.recomputeRegistration(registration._id);
        openCharges = await AcademyCharge.find({ registrationId: registration._id, status: { $ne: 'void' } }).sort({ dueDate: 1, createdAt: 1 });
      }
    }

    const previousBalance = toNumber(registration.balance);
    if (amount > previousBalance + 0.001) {
      return res.status(400).json({ success: false, message: `مبلغ از باقیِ این ثبت‌نام (${previousBalance}) بیشتر است.` });
    }

    const { allocations, unallocated } = academyLedger.fifoAllocate(amount, openCharges);
    if (unallocated > 0.001) {
      return res.status(400).json({ success: false, message: 'قلمِ بدهیِ بازی برای تخصیصِ این مبلغ نیست.' });
    }
    const remainingBalance = Math.max(0, previousBalance - amount);
    const paymentNumber = await nextSequence('academy_payment', 'APY');
    const invoiceNumber = await nextSequence('academy_invoice', settings.invoicePrefix || 'ACD');

    const payment = await AcademyPayment.create({
      studentId: registration.studentId._id,
      registrationId: registration._id,
      paymentNumber,
      amount,
      allocations,
      previousBalance,
      remainingBalance,
      currency: settings.currency || 'AFN',
      paymentMethod: req.body.paymentMethod || 'cash',
      paidAt: req.body.paidAt || new Date(),
      receivedBy: userId(req),
      referenceNo: req.body.referenceNo || '',
      note: req.body.note || ''
    });

    await academyLedger.recomputeRegistration(registration._id);
    const freshReg = await AcademyRegistration.findById(registration._id).lean();

    const invoice = await AcademyInvoice.create({
      invoiceNumber,
      studentId: registration.studentId._id,
      registrationId: registration._id,
      paymentId: payment._id,
      courseName: registration.courseId?.name || '',
      className: registration.classId?.name || '',
      feeAmount: academyLedger.num(freshReg?.totalPayable ?? registration.feeAmount),
      discountAmount: registration.discountAmount,
      paidAmount: amount,
      previousBalance,
      remainingBalance: academyLedger.num(freshReg?.balance ?? remainingBalance),
      currency: settings.currency || 'AFN',
      paymentMethod: payment.paymentMethod,
      referenceNo: payment.referenceNo,
      issuedAt: payment.paidAt,
      receivedBy: userId(req),
      note: req.body.note || ''
    });

    payment.invoiceId = invoice._id;
    await payment.save();

    const populatedPayment = await AcademyPayment.findById(payment._id)
      .populate('studentId', 'fullName studentCode')
      .populate('registrationId', 'totalPayable balance')
      .lean();
    const populatedInvoice = await AcademyInvoice.findById(invoice._id).populate('studentId', 'fullName studentCode').lean();

    res.status(201).json({
      success: true,
      item: populatedPayment,
      invoice: populatedInvoice,
      message: 'پرداخت فیس ثبت و بل آموزشگاه صادر شد.'
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ثبت پرداخت فیس آموزشگاه ناموفق بود.' });
  }
});

router.get('/invoices/:id', async (req, res) => {
  try {
    const item = await AcademyInvoice.findById(req.params.id).populate('studentId', 'fullName studentCode phone fatherName').lean();
    if (!item) return res.status(404).json({ success: false, message: 'بل پیدا نشد.' });
    const settings = await getSettings();
    res.json({ success: true, item, settings });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'دریافت بل ناموفق بود.' });
  }
});

// ثبتِ این‌که یک بل چاپ شد — شمارنده و زمانِ آخرین چاپ (فاز ۳)
router.post('/invoices/:id/mark-printed', async (req, res) => {
  try {
    const item = await AcademyInvoice.findByIdAndUpdate(
      req.params.id,
      { $inc: { printCount: 1 }, $set: { lastPrintedAt: new Date() } },
      { new: true }
    ).lean();
    if (!item) return res.status(404).json({ success: false, message: 'بل پیدا نشد.' });
    res.json({ success: true, item, printCount: item.printCount, lastPrintedAt: item.lastPrintedAt });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ثبتِ چاپِ بل ناموفق بود.' });
  }
});

// ---- اقلامِ بدهی و ابطال (فاز ۱) ----

// ابطالِ یک پرداخت: پرداخت void، بلش void، بلِ ابطالی صادر، ثبت‌نام بازمحاسبه
router.post('/payments/:id/void', async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'برای ابطالِ پرداخت، دلیل الزامی است.' });

    const payment = await AcademyPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'پرداخت پیدا نشد.' });
    if (payment.status === 'void') return res.status(400).json({ success: false, message: 'این پرداخت قبلاً ابطال شده است.' });

    payment.status = 'void';
    payment.voidedAt = new Date();
    payment.voidedBy = userId(req);
    payment.voidReason = reason;
    await payment.save();

    const origInvoice = payment.invoiceId ? await AcademyInvoice.findById(payment.invoiceId) : null;
    if (origInvoice && origInvoice.status !== 'void') {
      origInvoice.status = 'void';
      await origInvoice.save();
    }

    const settings = await getSettings();
    const creditNumber = await nextSequence('academy_invoice', settings.invoicePrefix || 'ACD');
    const creditNote = await AcademyInvoice.create({
      invoiceNumber: creditNumber,
      studentId: payment.studentId,
      registrationId: payment.registrationId,
      paymentId: payment._id,
      kind: 'credit_note',
      status: 'issued',
      voidOfId: origInvoice?._id || null,
      courseName: origInvoice?.courseName || '',
      className: origInvoice?.className || '',
      paidAmount: academyLedger.num(payment.amount),
      currency: payment.currency || settings.currency || 'AFN',
      paymentMethod: payment.paymentMethod,
      issuedAt: new Date(),
      receivedBy: userId(req),
      note: `ابطالِ پرداخت ${payment.paymentNumber} — ${reason}`
    });

    const reg = await academyLedger.recomputeRegistration(payment.registrationId);
    res.json({ success: true, item: payment.toObject(), creditNote: creditNote.toObject(), registration: reg?.toObject() || null, message: 'پرداخت ابطال شد و بلِ ابطالی صادر گردید.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ابطالِ پرداخت ناموفق بود.' });
  }
});

// افزودنِ قلم(های) بدهی به یک ثبت‌نام
router.post('/registrations/:id/charges', async (req, res) => {
  try {
    const reg = await AcademyRegistration.findById(req.params.id);
    if (!reg) return res.status(404).json({ success: false, message: 'ثبت‌نام پیدا نشد.' });
    const settings = await getSettings();
    const currency = reg.currency || settings.currency || 'AFN';
    const rows = Array.isArray(req.body.installments) && req.body.installments.length
      ? req.body.installments
      : [req.body];

    const created = [];
    let idx = 0;
    for (const row of rows) {
      idx += 1;
      const amount = toNumber(row.amount);
      if (amount <= 0) continue;
      const kind = ['installment', 'manual', 'late_fee'].includes(row.kind) ? row.kind : 'manual';
      const c = await AcademyCharge.create({
        registrationId: reg._id, studentId: reg.studentId, kind,
        title: String(row.title || (kind === 'installment' ? `قسط ${idx}` : kind === 'late_fee' ? 'جریمهٔ دیرکرد' : 'قلمِ دستی')).trim(),
        amount,
        discountAmount: Math.min(amount, toNumber(row.discountAmount)),
        discountReason: String(row.discountReason || '').trim(),
        discountType: ['sibling', 'scholarship', 'staff', 'hardship', 'other'].includes(row.discountType) ? row.discountType : '',
        discountApprovedBy: row.discountApprovedBy || (toNumber(row.discountAmount) > 0 ? userId(req) : null),
        dueDate: String(row.dueDate || '').slice(0, 10),
        currency, note: String(row.note || '').trim(), createdBy: userId(req)
      });
      created.push(c._id);
    }
    if (!created.length) return res.status(400).json({ success: false, message: 'قلمی برای افزودن نبود.' });

    const updated = await academyLedger.recomputeRegistration(reg._id);
    res.status(201).json({ success: true, registration: updated?.toObject() || null, message: `${created.length} قلمِ بدهی افزوده شد.` });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'افزودنِ قلمِ بدهی ناموفق بود.' });
  }
});

// ویرایشِ قلمِ بدهیِ پرداخت‌نشده
router.put('/charges/:id', async (req, res) => {
  try {
    const charge = await AcademyCharge.findById(req.params.id);
    if (!charge) return res.status(404).json({ success: false, message: 'قلمِ بدهی پیدا نشد.' });
    if (charge.status === 'void') return res.status(400).json({ success: false, message: 'این قلم ابطال شده است.' });
    if (academyLedger.num(charge.paidAmount) > 0) return res.status(400).json({ success: false, message: 'قلمی که پرداخت دارد قابلِ ویرایش نیست؛ آن را ابطال و از نو بسازید.' });

    if (req.body.title !== undefined) charge.title = String(req.body.title || '').trim();
    if (req.body.amount !== undefined) charge.amount = toNumber(req.body.amount);
    if (req.body.discountAmount !== undefined) charge.discountAmount = Math.min(charge.amount, toNumber(req.body.discountAmount));
    if (req.body.discountReason !== undefined) charge.discountReason = String(req.body.discountReason || '').trim();
    if (req.body.discountType !== undefined) {
      charge.discountType = ['sibling', 'scholarship', 'staff', 'hardship', 'other'].includes(req.body.discountType) ? req.body.discountType : '';
    }
    if (req.body.discountApprovedBy !== undefined) charge.discountApprovedBy = req.body.discountApprovedBy || null;
    if (academyLedger.num(charge.discountAmount) > 0 && !charge.discountApprovedBy) charge.discountApprovedBy = userId(req);
    if (req.body.dueDate !== undefined) charge.dueDate = String(req.body.dueDate || '').slice(0, 10);
    if (req.body.note !== undefined) charge.note = String(req.body.note || '').trim();
    charge.updatedBy = userId(req);
    await charge.save();

    const updated = await academyLedger.recomputeRegistration(charge.registrationId);
    res.json({ success: true, registration: updated?.toObject() || null, message: 'قلمِ بدهی به‌روزرسانی شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ویرایشِ قلمِ بدهی ناموفق بود.' });
  }
});

// ابطالِ قلمِ بدهی
router.post('/charges/:id/void', async (req, res) => {
  try {
    const charge = await AcademyCharge.findById(req.params.id);
    if (!charge) return res.status(404).json({ success: false, message: 'قلمِ بدهی پیدا نشد.' });
    if (charge.status === 'void') return res.status(400).json({ success: false, message: 'این قلم قبلاً ابطال شده است.' });
    if (academyLedger.num(charge.paidAmount) > 0) return res.status(400).json({ success: false, message: 'قلمی که پرداخت دارد قابلِ ابطال نیست؛ اول پرداختش را ابطال کنید.' });

    charge.status = 'void';
    charge.voidedAt = new Date();
    charge.voidedBy = userId(req);
    charge.voidReason = String(req.body.reason || '').trim();
    await charge.save();

    const updated = await academyLedger.recomputeRegistration(charge.registrationId);
    res.json({ success: true, registration: updated?.toObject() || null, message: 'قلمِ بدهی ابطال شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ابطالِ قلمِ بدهی ناموفق بود.' });
  }
});

// ساختِ شارژِ ماهانهٔ ماه‌های سررسیدشده (دستی — علاوه بر اجرای lazy)
router.post('/generate-monthly', async (req, res) => {
  try {
    const settings = await getSettings();
    const result = await academyLedger.generateMonthlyCharges({
      dueDay: settings.monthlyChargeDueDay || 20,
      registrationId: req.body.registrationId || null
    });
    res.json({ success: true, ...result, message: `${result.created} شارژِ ماهانه ساخته شد.` });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ساختِ شارژِ ماهانه ناموفق بود.' });
  }
});

// ساختِ جریمهٔ دیرکردِ خودکار برای اقلامِ معوق (فاز ۳)
router.post('/generate-late-fees', async (_req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.lateFeeMode || settings.lateFeeMode === 'none') {
      return res.status(400).json({ success: false, message: 'حالتِ جریمهٔ دیرکرد در تنظیمات غیرفعال است.' });
    }
    const result = await academyLedger.generateLateFees({
      mode: settings.lateFeeMode,
      amount: settings.lateFeeAmount,
      graceDays: settings.lateFeeGraceDays
    });
    res.json({ success: true, ...result, message: `${result.created} جریمهٔ دیرکرد ساخته شد.` });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ساختِ جریمهٔ دیرکرد ناموفق بود.' });
  }
});

// کشف‌حسابِ کاملِ یک شاگرد
router.get('/students/:id/statement', async (req, res) => {
  try {
    const studentId = req.params.id;
    const student = await AcademyStudent.findById(studentId).lean();
    if (!student) return res.status(404).json({ success: false, message: 'شاگرد پیدا نشد.' });

    const [registrations, charges, payments, invoices, settings] = await Promise.all([
      AcademyRegistration.find({ studentId }).sort({ createdAt: 1 })
        .populate('courseId', 'name').populate('classId', 'name').lean(),
      AcademyCharge.find({ studentId }).sort({ dueDate: 1, createdAt: 1 }).lean(),
      AcademyPayment.find({ studentId }).sort({ paidAt: 1, createdAt: 1 }).lean(),
      AcademyInvoice.find({ studentId }).sort({ issuedAt: 1 }).lean(),
      getSettings()
    ]);

    const today = academyLedger.todayKey();
    const chargesOut = charges.map((c) => ({ ...c, isOverdue: academyLedger.isOverdue(c, today) }));
    const totals = {
      billed: registrations.reduce((s, r) => s + academyLedger.num(r.totalPayable), 0),
      paid: registrations.reduce((s, r) => s + academyLedger.num(r.paidAmount), 0),
      balance: registrations.reduce((s, r) => s + academyLedger.num(r.balance), 0),
      overdue: chargesOut.filter((c) => c.isOverdue).reduce((s, c) => s + academyLedger.num(c.balance), 0)
    };

    res.json({ success: true, student, registrations, charges: chargesOut, payments, invoices, totals, settings });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'دریافتِ کشف‌حساب ناموفق بود.' });
  }
});

const EXPENSE_EDITABLE = ['title', 'category', 'amount', 'currency', 'expenseDate', 'paymentMethod', 'paidTo', 'vendor', 'attachmentUrl', 'recurring', 'recurrenceKey', 'approvedBy', 'note'];

router.post('/expenses', async (req, res) => {
  try {
    const settings = await getSettings();
    const item = await AcademyExpense.create({ ...req.body, currency: req.body.currency || settings.currency || 'AFN', createdBy: userId(req) });
    res.status(201).json({ success: true, item, message: 'مصرف آموزشگاه ثبت شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ثبت مصرف آموزشگاه ناموفق بود.' });
  }
});

router.put('/expenses/:id', async (req, res) => {
  try {
    const update = {};
    for (const key of EXPENSE_EDITABLE) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const item = await AcademyExpense.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: 'مصرف پیدا نشد.' });
    res.json({ success: true, item, message: 'مصرف آموزشگاه به‌روزرسانی شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ویرایش مصرف آموزشگاه ناموفق بود.' });
  }
});

router.get('/expense-categories', async (_req, res) => {
  try {
    const items = await AcademyExpenseCategory.find().sort({ name: 1 }).lean();
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'دریافت دسته‌بندی‌های مصرف ناموفق بود.' });
  }
});

router.post('/expense-categories', async (req, res) => {
  try {
    const item = await AcademyExpenseCategory.create({ name: req.body.name });
    res.status(201).json({ success: true, item, message: 'دسته‌بندی مصرف ثبت شد.' });
  } catch (error) {
    // Unique-index violation (duplicate name) surfaces as error.code 11000 -
    // worth its own message since "ثبت ناموفق بود" would hide the actual
    // reason (this name already exists) from the person filling the form.
    const message = error?.code === 11000 ? 'این دسته‌بندی قبلاً تعریف شده است.' : 'ثبت دسته‌بندی مصرف ناموفق بود.';
    res.status(400).json({ success: false, message });
  }
});

router.put('/expense-categories/:id', async (req, res) => {
  try {
    const update = {};
    if (req.body.name !== undefined) update.name = req.body.name;
    if (req.body.status !== undefined) update.status = req.body.status;
    const item = await AcademyExpenseCategory.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: 'دسته‌بندی مصرف پیدا نشد.' });
    res.json({ success: true, item, message: 'دسته‌بندی مصرف به‌روزرسانی شد.' });
  } catch (error) {
    const message = error?.code === 11000 ? 'این دسته‌بندی قبلاً تعریف شده است.' : 'به‌روزرسانی دسته‌بندی مصرف ناموفق بود.';
    res.status(400).json({ success: false, message });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const filter = {};
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.date) filter.attendanceDate = String(req.query.date || '').trim();
    const items = await AcademyAttendance.find(filter).sort({ attendanceDate: -1, createdAt: -1 })
      .populate('classId', 'name')
      .populate('students.studentId', 'fullName studentCode')
      .lean();
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'دریافت حاضری آموزشگاه ناموفق بود.' });
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

    const item = await AcademyAttendance.findOneAndUpdate(
      { classId, attendanceDate },
      {
        $set: { classId, attendanceDate, students, updatedBy: userId(req) },
        $setOnInsert: { createdBy: userId(req) }
      },
      { new: true, upsert: true, runValidators: true }
    )
      .populate('classId', 'name')
      .populate('students.studentId', 'fullName studentCode');

    res.status(201).json({ success: true, item, message: 'حاضری آموزشگاه ذخیره شد.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error?.message || 'ثبت حاضری آموزشگاه ناموفق بود.' });
  }
});

router.get('/reports/overview', async (_req, res) => {
  try {
    const [summary, debtors, byCourse, byTeacherAttendance] = await Promise.all([
      buildSummary(),
      AcademyRegistration.find({ balance: { $gt: 0 }, status: 'active' })
        .sort({ balance: -1 })
        .limit(25)
        .populate('studentId', 'fullName studentCode phone')
        .populate('courseId', 'name')
        .populate('classId', 'name')
        .lean(),
      AcademyRegistration.aggregate([
        { $group: { _id: '$courseId', registrations: { $sum: 1 }, payable: { $sum: '$totalPayable' }, paid: { $sum: '$paidAmount' }, balance: { $sum: '$balance' } } },
        { $sort: { paid: -1 } },
        { $limit: 20 }
      ]),
      AcademyAttendance.aggregate([
        { $unwind: '$students' },
        { $group: { _id: '$students.status', count: { $sum: 1 } } }
      ])
    ]);
    const courseIds = byCourse.map((item) => item._id).filter(Boolean);
    const courses = await AcademyCourse.find({ _id: { $in: courseIds } }).select('name').lean();
    const courseMap = new Map(courses.map((item) => [String(item._id), item.name]));

    // "یادآوری فیس ماه جاری": every active registration that still carries a
    // balance AND has taken no payment inside the current Shamsi month - i.e.
    // the students to chase this month. paidAt is stored Gregorian, so match
    // against the current Shamsi month's Gregorian [start, end) window.
    const currentMonthKey = lastShamsiMonthKeys(1)[0];
    const { start: monthStart, endExclusive: monthEnd } = currentShamsiMonthRange();
    const monthStartDate = new Date(`${monthStart}T00:00:00.000Z`);
    const monthEndDate = new Date(`${monthEnd}T00:00:00.000Z`);
    const [outstandingRegs, paidThisMonthAgg, lastPaymentAgg] = await Promise.all([
      AcademyRegistration.find({ balance: { $gt: 0 }, status: 'active' })
        .sort({ balance: -1 })
        .limit(500)
        .populate('studentId', 'fullName studentCode phone guardianPhone')
        .populate('courseId', 'name')
        .populate('classId', 'name')
        .lean(),
      AcademyPayment.aggregate([
        { $match: { status: { $ne: 'void' }, paidAt: { $gte: monthStartDate, $lt: monthEndDate } } },
        { $group: { _id: '$registrationId', paidThisMonth: { $sum: '$amount' } } }
      ]),
      AcademyPayment.aggregate([
        { $match: { status: { $ne: 'void' } } },
        { $group: { _id: '$registrationId', lastPaymentAt: { $max: '$paidAt' } } }
      ])
    ]);
    const paidThisMonthSet = new Set(paidThisMonthAgg.map((item) => String(item._id)));
    const lastPaymentMap = new Map(lastPaymentAgg.map((item) => [String(item._id), item.lastPaymentAt]));
    const feeReminders = outstandingRegs
      .filter((reg) => !paidThisMonthSet.has(String(reg._id)))
      .map((reg) => ({
        _id: reg._id,
        studentId: reg.studentId,
        courseId: reg.courseId,
        classId: reg.classId,
        paymentPlan: reg.paymentPlan,
        totalPayable: reg.totalPayable,
        paidAmount: reg.paidAmount,
        balance: reg.balance,
        lastPaymentAt: lastPaymentMap.get(String(reg._id)) || null
      }));

    res.json({
      success: true,
      summary,
      debtors,
      byCourse: byCourse.map((item) => ({ ...item, courseName: courseMap.get(String(item._id)) || 'کورس' })),
      attendanceSummary: byTeacherAttendance,
      feeReminderMonth: currentMonthKey,
      feeReminderCount: feeReminders.length,
      feeReminders
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'گزارش آموزشگاه ناموفق بود.' });
  }
});

router.get('/reports/monthly', async (req, res) => {
  try {
    const result = await buildShamsiMonthlyReport({
      paymentModel: AcademyPayment,
      expenseModel: AcademyExpense,
      year: Number(req.query.year),
      months: req.query.months
    });

    res.json({ success: true, months: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'گزارش ماهانه آموزشگاه ناموفق بود.' });
  }
});

// ---- گزارش‌های فاز ۲ ----

const dayStart = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`);
const dayEndExclusive = (iso) => { const d = dayStart(iso); d.setUTCDate(d.getUTCDate() + 1); return d; };
const METHOD_KEYS = ['cash', 'card', 'bank_transfer', 'hawala', 'other'];

// بازهٔ میلادیِ یک ماهِ شمسی «1405-07»
function academyMonthRange(periodKey) {
  const [jy, jm] = String(periodKey).split('-').map(Number);
  const { afghanSolarToGregorianInput } = require('../utils/afghanDate');
  const startIso = afghanSolarToGregorianInput(jy || 1400, jm || 1, 1) || new Date().toISOString().slice(0, 10);
  const nextY = jm >= 12 ? jy + 1 : jy;
  const nextM = jm >= 12 ? 1 : (jm || 1) + 1;
  const endIso = afghanSolarToGregorianInput(nextY || 1400, nextM, 1) || startIso;
  return { start: dayStart(startIso), endExclusive: dayStart(endIso) };
}

// بستنِ صندوقِ روزانه — دریافتی و پرداختیِ یک روز به تفکیکِ روش
router.get('/reports/cash-daily', async (req, res) => {
  try {
    const date = String(req.query.date || todayKey()).slice(0, 10);
    const [incomeAgg, expenseAgg] = await Promise.all([
      AcademyPayment.aggregate([
        { $match: { status: { $ne: 'void' }, paidAt: { $gte: dayStart(date), $lt: dayEndExclusive(date) } } },
        { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$amount' } } }
      ]),
      AcademyExpense.aggregate([
        { $match: { expenseDate: date } },
        { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$amount' } } }
      ])
    ]);
    const shape = (agg) => {
      const map = new Map(agg.map((r) => [r._id || 'other', r]));
      const rows = METHOD_KEYS.map((k) => ({ method: k, count: toNumber(map.get(k)?.count), total: toNumber(map.get(k)?.total) }));
      return { rows, total: rows.reduce((s, r) => s + r.total, 0) };
    };
    const income = shape(incomeAgg);
    const expense = shape(expenseAgg);
    res.json({ success: true, date, income, expense, net: income.total - expense.total });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'گزارشِ صندوقِ روزانه ناموفق بود.' });
  }
});

// رده‌بندی سنیِ باقی‌داری — از اقلامِ بدهیِ بازِ غیرِ ابطالی
router.get('/reports/aging', async (_req, res) => {
  try {
    const today = academyLedger.todayKey();
    const charges = await AcademyCharge.find({ status: { $ne: 'void' }, balance: { $gt: 0 } })
      .populate('studentId', 'fullName studentCode phone')
      .lean();
    const buckets = { notdue: { label: 'سررسید نشده', total: 0, count: 0 }, d0_30: { label: '۰–۳۰ روز', total: 0, count: 0 }, d31_60: { label: '۳۱–۶۰ روز', total: 0, count: 0 }, d61_90: { label: '۶۱–۹۰ روز', total: 0, count: 0 }, d90: { label: 'بیش از ۹۰ روز', total: 0, count: 0 } };
    const byStudent = new Map();
    for (const c of charges) {
      const bal = toNumber(c.balance);
      let key = 'notdue';
      if (c.dueDate && String(c.dueDate) < today) {
        const days = Math.floor((dayStart(today) - dayStart(c.dueDate)) / 86400000);
        key = days <= 30 ? 'd0_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90';
      }
      buckets[key].total += bal;
      buckets[key].count += 1;
      const sid = String(c.studentId?._id || c.studentId);
      const s = byStudent.get(sid) || { student: c.studentId, balance: 0, oldestDue: null, overdue: 0 };
      s.balance += bal;
      if (key !== 'notdue') s.overdue += bal;
      if (c.dueDate && (!s.oldestDue || c.dueDate < s.oldestDue)) s.oldestDue = c.dueDate;
      byStudent.set(sid, s);
    }
    const students = [...byStudent.values()].sort((a, b) => b.overdue - a.overdue || b.balance - a.balance).slice(0, 100);
    res.json({ success: true, buckets, students, totalOutstanding: Object.values(buckets).reduce((s, b) => s + b.total, 0) });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'گزارشِ رده‌بندیِ سنی ناموفق بود.' });
  }
});

// تفکیکِ روشِ پرداخت در یک بازه
router.get('/reports/payment-methods', async (req, res) => {
  try {
    const from = req.query.from ? dayStart(req.query.from) : new Date(0);
    const to = req.query.to ? dayEndExclusive(req.query.to) : new Date();
    const agg = await AcademyPayment.aggregate([
      { $match: { status: { $ne: 'void' }, paidAt: { $gte: from, $lt: to } } },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$amount' } } }
    ]);
    const map = new Map(agg.map((r) => [r._id || 'other', r]));
    const rows = METHOD_KEYS.map((k) => ({ method: k, count: toNumber(map.get(k)?.count), total: toNumber(map.get(k)?.total) }));
    const grand = rows.reduce((s, r) => s + r.total, 0);
    res.json({ success: true, rows: rows.map((r) => ({ ...r, share: grand ? Math.round((r.total / grand) * 1000) / 10 : 0 })), total: grand });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'گزارشِ روشِ پرداخت ناموفق بود.' });
  }
});

// معاش/کمیسیونِ استادان برای یک ماهِ شمسی — draftها را در‌جا محاسبه و برمی‌گرداند
router.get('/payroll', async (req, res) => {
  try {
    const periodKey = String(req.query.periodKey || academyLedger.shamsiMonthKey(new Date()));
    const settings = await getSettings();
    const [teachers, runs, classes] = await Promise.all([
      AcademyTeacher.find({ status: 'active' }).sort({ fullName: 1 }).lean(),
      AcademyPayrollRun.find({ periodKey }).lean(),
      AcademyClass.find().select('_id courseId teacherId').lean()
    ]);
    const runByTeacher = new Map(runs.map((r) => [String(r.teacherId), r]));

    // پرداختیِ وصول‌شده و فیسِ ثبت‌نام‌شدهٔ کورس‌های هر استاد را از classId → courseId → registration پیدا کن
    const courseIdsByTeacher = new Map();
    for (const c of classes) {
      if (!c.teacherId) continue;
      const t = String(c.teacherId);
      if (!courseIdsByTeacher.has(t)) courseIdsByTeacher.set(t, new Set());
      if (c.courseId) courseIdsByTeacher.get(t).add(String(c.courseId));
    }

    // پرداخت‌های این ماه به تفکیکِ courseId (از registration)
    const { start, endExclusive } = academyMonthRange(periodKey);
    const paidAgg = await AcademyPayment.aggregate([
      { $match: { status: { $ne: 'void' }, paidAt: { $gte: start, $lt: endExclusive } } },
      { $lookup: { from: 'academyregistrations', localField: 'registrationId', foreignField: '_id', as: 'reg' } },
      { $unwind: '$reg' },
      { $group: { _id: '$reg.courseId', total: { $sum: '$amount' } } }
    ]);
    const paidByCourse = new Map(paidAgg.map((r) => [String(r._id), toNumber(r.total)]));
    const billedAgg = await AcademyRegistration.aggregate([
      { $match: { registrationDate: { $gte: start.toISOString().slice(0, 10), $lt: endExclusive.toISOString().slice(0, 10) } } },
      { $group: { _id: '$courseId', total: { $sum: '$totalPayable' } } }
    ]);
    const billedByCourse = new Map(billedAgg.map((r) => [String(r._id), toNumber(r.total)]));

    const items = teachers.map((t) => {
      const existing = runByTeacher.get(String(t._id));
      if (existing) return { ...existing, teacher: t, computed: false };
      const courseIds = [...(courseIdsByTeacher.get(String(t._id)) || [])];
      const base = ['collected', 'billed'].includes(settings.teacherCommissionBase) ? settings.teacherCommissionBase : 'collected';
      const pct = t.commissionPercent != null ? t.commissionPercent : toNumber(settings.teacherCommissionPercent);
      const commissionOn = courseIds.reduce((s, cid) => s + (base === 'billed' ? (billedByCourse.get(cid) || 0) : (paidByCourse.get(cid) || 0)), 0);
      const baseAmount = t.paymentType === 'salary' || t.paymentType === 'contract' ? toNumber(t.paymentAmount) : 0;
      const commissionPercent = t.paymentType === 'percent' ? (t.paymentAmount || pct) : pct;
      const commissionAmount = Math.round((commissionOn * commissionPercent) / 100 * 100) / 100;
      return {
        teacher: t, teacherId: t._id, periodKey, status: 'draft', computed: true,
        baseAmount, commissionBase: base, commissionPercent, commissionOn, commissionAmount,
        deductions: 0, netAmount: Math.max(0, baseAmount + commissionAmount),
        currency: settings.currency || 'AFN'
      };
    });
    res.json({ success: true, periodKey, items, settings: { teacherCommissionBase: settings.teacherCommissionBase, teacherCommissionPercent: settings.teacherCommissionPercent } });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'محاسبهٔ معاش ناموفق بود.' });
  }
});

// ثبت/پرداختِ یک ردیفِ معاش — رانِ draft را می‌سازد/به‌روز و مصرف صادر می‌کند
router.post('/payroll/pay', async (req, res) => {
  try {
    const { teacherId, periodKey } = req.body;
    if (!teacherId || !periodKey) return res.status(400).json({ success: false, message: 'استاد و دوره لازم است.' });
    const settings = await getSettings();
    const teacher = await AcademyTeacher.findById(teacherId).lean();
    if (!teacher) return res.status(404).json({ success: false, message: 'استاد پیدا نشد.' });

    const baseAmount = toNumber(req.body.baseAmount);
    const commissionAmount = toNumber(req.body.commissionAmount);
    const deductions = toNumber(req.body.deductions);
    const netAmount = Math.max(0, baseAmount + commissionAmount - deductions);
    if (netAmount <= 0) return res.status(400).json({ success: false, message: 'مبلغِ خالصِ معاش باید بزرگ‌تر از صفر باشد.' });

    let run = await AcademyPayrollRun.findOne({ teacherId, periodKey });
    if (run && run.status === 'paid') return res.status(400).json({ success: false, message: 'معاشِ این استاد در این دوره قبلاً پرداخت شده است.' });

    const expense = await AcademyExpense.create({
      title: `معاش ${teacher.fullName} — ${periodKey}`,
      category: 'teacher_salary',
      amount: netAmount,
      currency: settings.currency || 'AFN',
      expenseDate: todayKey(),
      paymentMethod: req.body.paymentMethod || 'cash',
      paidTo: teacher.fullName,
      note: `پایه ${baseAmount} + کمیسیون ${commissionAmount} − کسر ${deductions}`,
      createdBy: userId(req)
    });

    const payload = {
      teacherId, periodKey,
      baseAmount, commissionBase: req.body.commissionBase || settings.teacherCommissionBase || 'collected',
      commissionPercent: toNumber(req.body.commissionPercent),
      commissionOn: toNumber(req.body.commissionOn),
      commissionAmount, deductions, netAmount,
      currency: settings.currency || 'AFN',
      status: 'paid', paidExpenseId: expense._id, paidAt: new Date(),
      updatedBy: userId(req)
    };
    run = run
      ? await AcademyPayrollRun.findByIdAndUpdate(run._id, payload, { new: true, runValidators: true })
      : await AcademyPayrollRun.create({ ...payload, createdBy: userId(req) });

    res.status(201).json({ success: true, item: run.toObject ? run.toObject() : run, expense: expense.toObject(), message: 'معاش ثبت و مصرف صادر شد.' });
  } catch (error) {
    const message = error?.code === 11000 ? 'برای این استاد و دوره یک رانِ معاش موجود است.' : (error?.message || 'ثبتِ معاش ناموفق بود.');
    res.status(400).json({ success: false, message });
  }
});

module.exports = router;
