const express = require('express');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const ShortTermCounter = require('../models/ShortTermCounter');
const ShortTermSetting = require('../models/ShortTermSetting');
const ShortTermStudent = require('../models/ShortTermStudent');
const ShortTermClass = require('../models/ShortTermClass');
const ShortTermRegistration = require('../models/ShortTermRegistration');
const ShortTermPayment = require('../models/ShortTermPayment');
const ShortTermInvoice = require('../models/ShortTermInvoice');
const ShortTermExpense = require('../models/ShortTermExpense');
const ShortTermExpenseCategory = require('../models/ShortTermExpenseCategory');
const ShortTermAttendance = require('../models/ShortTermAttendance');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

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
    ShortTermPayment.find().sort({ paidAt: -1 }).limit(8).populate('studentId', 'fullName studentCode').lean(),
    ShortTermExpense.find().sort({ expenseDate: -1, createdAt: -1 }).limit(8).lean(),
    ShortTermInvoice.find().sort({ issuedAt: -1 }).limit(8).populate('studentId', 'fullName studentCode').lean()
  ]);

  const paidTotal = registrations.reduce((sum, item) => sum + toNumber(item.paidAmount), 0);
  const outstandingTotal = registrations.reduce((sum, item) => sum + toNumber(item.balance), 0);
  const dueTotal = registrations.reduce((sum, item) => sum + toNumber(item.totalPayable), 0);
  const today = todayKey();
  const overdueCount = registrations.filter((item) => item.status === 'active' && item.endDate && item.endDate < today).length;
  const month = today.slice(0, 7);
  const monthIncome = await ShortTermPayment.aggregate([
    {
      $match: {
        paidAt: {
          $gte: new Date(`${month}-01T00:00:00.000Z`),
          $lt: new Date(new Date(`${month}-01T00:00:00.000Z`).setMonth(new Date(`${month}-01T00:00:00.000Z`).getMonth() + 1))
        }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const monthExpenses = await ShortTermExpense.aggregate([
    { $match: { expenseDate: { $regex: `^${month}` } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  return {
    activeStudents,
    activeClasses,
    registrations: registrations.length,
    overdueCount,
    invoices: await ShortTermInvoice.countDocuments(),
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
  const [settings, students, classes, registrations, payments, invoices, expenses, expenseCategories, attendance, summary] = await Promise.all([
    getSettings(),
    ShortTermStudent.find().sort({ createdAt: -1 }).limit(250).lean(),
    ShortTermClass.find().sort({ createdAt: -1 }).limit(250).lean(),
    ShortTermRegistration.find().sort({ createdAt: -1 }).limit(300)
      .populate('studentId', 'fullName studentCode phone')
      .populate('classId', 'name subject defaultFee')
      .lean(),
    ShortTermPayment.find().sort({ paidAt: -1 }).limit(200)
      .populate('studentId', 'fullName studentCode')
      .populate('registrationId', 'totalPayable balance')
      .lean(),
    ShortTermInvoice.find().sort({ issuedAt: -1 }).limit(200)
      .populate('studentId', 'fullName studentCode')
      .lean(),
    ShortTermExpense.find().sort({ expenseDate: -1, createdAt: -1 }).limit(200).lean(),
    ShortTermExpenseCategory.find().sort({ name: 1 }).lean(),
    ShortTermAttendance.find().sort({ attendanceDate: -1, createdAt: -1 }).limit(120)
      .populate('classId', 'name')
      .populate('students.studentId', 'fullName studentCode')
      .lean(),
    buildSummary()
  ]);

  return {
    settings,
    students,
    classes,
    registrations: registrations.map(withOverdueFlag),
    payments,
    invoices,
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
    const item = await ShortTermRegistration.create({ ...req.body, createdBy: userId(req), updatedBy: userId(req) });
    const populated = await ShortTermRegistration.findById(item._id)
      .populate('studentId', 'fullName studentCode phone')
      .populate('classId', 'name subject defaultFee')
      .lean();
    res.status(201).json({ success: true, item: withOverdueFlag(populated), message: 'ثبت‌نام و فیس شاگرد ثبت شد.' });
  } catch {
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

router.post('/payments', async (req, res) => {
  try {
    const amount = toNumber(req.body.amount);
    if (amount <= 0) return res.status(400).json({ success: false, message: 'مبلغ پرداخت باید بزرگ‌تر از صفر باشد.' });

    const registration = await ShortTermRegistration.findById(req.body.registrationId)
      .populate('studentId', 'fullName studentCode')
      .populate('classId', 'name');
    if (!registration) return res.status(404).json({ success: false, message: 'ثبت‌نام انتخاب‌شده پیدا نشد.' });

    const settings = await getSettings();
    const previousBalance = toNumber(registration.balance);
    const remainingBalance = Math.max(0, previousBalance - amount);
    const paymentNumber = await nextSequence('short_term_payment', settings.receiptPrefix || 'STC-RCP');
    const invoiceNumber = await nextSequence('short_term_invoice', settings.invoicePrefix || 'STC-INV');

    const payment = await ShortTermPayment.create({
      studentId: registration.studentId._id,
      registrationId: registration._id,
      paymentNumber,
      amount,
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
      note: req.body.note || ''
    });

    payment.invoiceId = invoice._id;
    await payment.save();

    registration.paidAmount = toNumber(registration.paidAmount) + amount;
    registration.balance = remainingBalance;
    registration.updatedBy = userId(req);
    await registration.save();

    const populatedPayment = await ShortTermPayment.findById(payment._id)
      .populate('studentId', 'fullName studentCode')
      .populate('registrationId', 'totalPayable balance')
      .lean();
    const populatedInvoice = await ShortTermInvoice.findById(invoice._id).populate('studentId', 'fullName studentCode fatherName').lean();

    res.status(201).json({
      success: true,
      item: populatedPayment,
      invoice: populatedInvoice,
      settings,
      message: 'پرداخت ثبت و بل صادر شد.'
    });
  } catch (error) {
    res.status(400).json({ success: false, message: 'ثبت پرداخت ناموفق بود.' });
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

router.get('/reports/overview', async (_req, res) => {
  try {
    const [summary, debtors, byClass] = await Promise.all([
      buildSummary(),
      ShortTermRegistration.find({ balance: { $gt: 0 }, status: 'active' })
        .sort({ balance: -1 })
        .limit(25)
        .populate('studentId', 'fullName studentCode phone')
        .populate('classId', 'name')
        .lean(),
      ShortTermRegistration.aggregate([
        { $group: { _id: '$classId', registrations: { $sum: 1 }, payable: { $sum: '$totalPayable' }, paid: { $sum: '$paidAmount' }, balance: { $sum: '$balance' } } },
        { $sort: { paid: -1 } },
        { $limit: 20 }
      ])
    ]);
    const classIds = byClass.map((item) => item._id).filter(Boolean);
    const classes = await ShortTermClass.find({ _id: { $in: classIds } }).select('name').lean();
    const classMap = new Map(classes.map((item) => [String(item._id), item.name]));
    res.json({
      success: true,
      summary,
      debtors: debtors.map(withOverdueFlag),
      byClass: byClass.map((item) => ({ ...item, className: classMap.get(String(item._id)) || 'صنف' }))
    });
  } catch {
    res.status(500).json({ success: false, message: 'گزارش مرکز ناموفق بود.' });
  }
});

function lastMonthKeys(count) {
  const keys = [];
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function yearMonthKeys(year) {
  const keys = [];
  for (let m = 1; m <= 12; m += 1) {
    keys.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return keys;
}

router.get('/reports/monthly', async (req, res) => {
  try {
    const yearParam = Number(req.query.year);
    const monthKeys = (yearParam && yearParam >= 1900 && yearParam <= 3000)
      ? yearMonthKeys(yearParam)
      : lastMonthKeys(Math.min(24, Math.max(1, Number(req.query.months) || 12)));

    const earliestStart = new Date(`${monthKeys[0]}-01T00:00:00.000Z`);
    const [lastKeyYear, lastKeyMonth] = monthKeys[monthKeys.length - 1].split('-').map(Number);
    const latestEnd = new Date(Date.UTC(lastKeyYear, lastKeyMonth, 1));
    const latestEndDateStr = latestEnd.toISOString().slice(0, 10);

    const [incomeRows, expenseRows] = await Promise.all([
      ShortTermPayment.aggregate([
        { $match: { paidAt: { $gte: earliestStart, $lt: latestEnd } } },
        {
          $group: {
            _id: { month: { $dateToString: { format: '%Y-%m', date: '$paidAt' } }, method: '$paymentMethod' },
            total: { $sum: '$amount' }
          }
        }
      ]),
      ShortTermExpense.aggregate([
        { $match: { expenseDate: { $gte: monthKeys[0], $lt: latestEndDateStr } } },
        {
          $group: {
            _id: { month: { $substrBytes: ['$expenseDate', 0, 7] }, category: '$category' },
            total: { $sum: '$amount' }
          }
        }
      ])
    ]);

    const monthMap = new Map(monthKeys.map((key) => [key, {
      month: key,
      income: 0,
      expenses: 0,
      byPaymentMethod: new Map(),
      byExpenseCategory: new Map()
    }]));

    incomeRows.forEach((row) => {
      const bucket = monthMap.get(row._id.month);
      if (!bucket) return;
      bucket.income += toNumber(row.total);
      bucket.byPaymentMethod.set(row._id.method || 'other', toNumber(row.total));
    });

    expenseRows.forEach((row) => {
      const bucket = monthMap.get(row._id.month);
      if (!bucket) return;
      bucket.expenses += toNumber(row.total);
      bucket.byExpenseCategory.set(row._id.category || 'other', toNumber(row.total));
    });

    const result = monthKeys.map((key) => {
      const bucket = monthMap.get(key);
      return {
        month: bucket.month,
        income: bucket.income,
        expenses: bucket.expenses,
        net: bucket.income - bucket.expenses,
        byPaymentMethod: Array.from(bucket.byPaymentMethod, ([method, total]) => ({ method, total })),
        byExpenseCategory: Array.from(bucket.byExpenseCategory, ([category, total]) => ({ category, total }))
      };
    });

    res.json({ success: true, months: result });
  } catch {
    res.status(500).json({ success: false, message: 'گزارش ماهانه ناموفق بود.' });
  }
});

module.exports = router;
