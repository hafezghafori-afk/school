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
const AcademyExpense = require('../models/AcademyExpense');
const AcademyExpenseCategory = require('../models/AcademyExpenseCategory');
const AcademyAttendance = require('../models/AcademyAttendance');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');
const { buildShamsiMonthlyReport, currentShamsiMonthRange } = require('../utils/shamsiMonthlyReport');

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
  const [settings, students, courses, teachers, classes, registrations, payments, invoices, expenses, expenseCategories, attendance, summary] = await Promise.all([
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
    AcademyExpense.find().sort({ expenseDate: -1, createdAt: -1 }).limit(200).lean(),
    AcademyExpenseCategory.find().sort({ name: 1 }).lean(),
    AcademyAttendance.find().sort({ attendanceDate: -1, createdAt: -1 }).limit(120)
      .populate('classId', 'name')
      .populate('students.studentId', 'fullName studentCode')
      .lean(),
    buildSummary()
  ]);

  return { settings, students, courses, teachers, classes, registrations, payments, invoices, expenses, expenseCategories, attendance, summary };
}

router.get('/bootstrap', async (_req, res) => {
  try {
    res.json({ success: true, ...(await listPayload()) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت اطلاعات آموزشگاه ناموفق بود.' });
  }
});

router.get('/settings', async (_req, res) => {
  try {
    res.json({ success: true, settings: await getSettings() });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت تنظیمات آموزشگاه ناموفق بود.' });
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
    res.status(400).json({ success: false, message: 'ذخیره تنظیمات آموزشگاه ناموفق بود.' });
  }
});

router.get('/students', async (req, res) => {
  try {
    const items = await AcademyStudent.find(mapListQuery(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت شاگردان آموزشگاه ناموفق بود.' });
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
  } catch {
    res.status(400).json({ success: false, message: 'ویرایش شاگرد آموزشگاه ناموفق بود.' });
  }
});

router.get('/courses', async (req, res) => {
  try {
    const items = await AcademyCourse.find(mapListQuery(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت کورس‌ها ناموفق بود.' });
  }
});

router.post('/courses', async (req, res) => {
  try {
    const item = await AcademyCourse.create({ ...req.body, createdBy: userId(req), updatedBy: userId(req) });
    res.status(201).json({ success: true, item, message: 'کورس آموزشگاه ثبت شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ثبت کورس آموزشگاه ناموفق بود.' });
  }
});

router.put('/courses/:id', async (req, res) => {
  try {
    const item = await AcademyCourse.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: userId(req) }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: 'کورس پیدا نشد.' });
    res.json({ success: true, item, message: 'کورس آموزشگاه به‌روزرسانی شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ویرایش کورس آموزشگاه ناموفق بود.' });
  }
});

router.get('/teachers', async (req, res) => {
  try {
    const items = await AcademyTeacher.find(mapListQuery(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت استادان ناموفق بود.' });
  }
});

router.post('/teachers', async (req, res) => {
  try {
    const item = await AcademyTeacher.create({ ...req.body, createdBy: userId(req), updatedBy: userId(req) });
    res.status(201).json({ success: true, item, message: 'استاد آموزشگاه ثبت شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ثبت استاد آموزشگاه ناموفق بود.' });
  }
});

router.get('/classes', async (req, res) => {
  try {
    const items = await AcademyClass.find(mapListQuery(req.query)).sort({ createdAt: -1 })
      .populate('courseId', 'name defaultFee level')
      .populate('teacherId', 'fullName')
      .lean();
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت پلان صنف ناموفق بود.' });
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
  } catch {
    res.status(400).json({ success: false, message: 'ثبت پلان صنف ناموفق بود.' });
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
  } catch {
    res.status(500).json({ success: false, message: 'دریافت ثبت‌نام‌ها ناموفق بود.' });
  }
});

router.post('/registrations', async (req, res) => {
  try {
    const item = await AcademyRegistration.create({ ...req.body, createdBy: userId(req), updatedBy: userId(req) });
    const populated = await AcademyRegistration.findById(item._id)
      .populate('studentId', 'fullName studentCode phone')
      .populate('courseId', 'name defaultFee level')
      .populate('classId', 'name');
    res.status(201).json({ success: true, item: populated, message: 'ثبت‌نام آموزشگاه انجام شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ثبت‌نام آموزشگاه ناموفق بود.' });
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
    const previousBalance = toNumber(registration.balance);
    const remainingBalance = Math.max(0, previousBalance - amount);
    const paymentNumber = await nextSequence('academy_payment', 'APY');
    const invoiceNumber = await nextSequence('academy_invoice', settings.invoicePrefix || 'ACD');

    const payment = await AcademyPayment.create({
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

    const invoice = await AcademyInvoice.create({
      invoiceNumber,
      studentId: registration.studentId._id,
      registrationId: registration._id,
      paymentId: payment._id,
      courseName: registration.courseId?.name || '',
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
    res.status(400).json({ success: false, message: 'ثبت پرداخت فیس آموزشگاه ناموفق بود.' });
  }
});

router.get('/invoices/:id', async (req, res) => {
  try {
    const item = await AcademyInvoice.findById(req.params.id).populate('studentId', 'fullName studentCode phone fatherName').lean();
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
    const item = await AcademyExpense.create({ ...req.body, currency: req.body.currency || settings.currency || 'AFN', createdBy: userId(req) });
    res.status(201).json({ success: true, item, message: 'مصرف آموزشگاه ثبت شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ثبت مصرف آموزشگاه ناموفق بود.' });
  }
});

router.get('/expense-categories', async (_req, res) => {
  try {
    const items = await AcademyExpenseCategory.find().sort({ name: 1 }).lean();
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت دسته‌بندی‌های مصرف ناموفق بود.' });
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
  } catch {
    res.status(500).json({ success: false, message: 'دریافت حاضری آموزشگاه ناموفق بود.' });
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
  } catch {
    res.status(400).json({ success: false, message: 'ثبت حاضری آموزشگاه ناموفق بود.' });
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
    res.json({
      success: true,
      summary,
      debtors,
      byCourse: byCourse.map((item) => ({ ...item, courseName: courseMap.get(String(item._id)) || 'کورس' })),
      attendanceSummary: byTeacherAttendance
    });
  } catch {
    res.status(500).json({ success: false, message: 'گزارش آموزشگاه ناموفق بود.' });
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
  } catch {
    res.status(500).json({ success: false, message: 'گزارش ماهانه آموزشگاه ناموفق بود.' });
  }
});

module.exports = router;
