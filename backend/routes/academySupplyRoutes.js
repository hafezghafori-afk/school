const express = require('express');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const AcademyCounter = require('../models/AcademyCounter');
const AcademySupplyClassPrice = require('../models/AcademySupplyClassPrice');
const AcademySupplySale = require('../models/AcademySupplySale');
const AcademySupplyStudent = require('../models/AcademySupplyStudent');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();

router.use(requireAuth, requireRole(['admin']), requirePermission('manage_finance'));
attachWriteActivityAudit(router, { targetType: 'AcademySupply', actionPrefix: 'academy_supply', audit: (payload) => logActivity(payload) });

const userId = (req) => req.user?.id || null;
const todayKey = () => new Date().toISOString().slice(0, 10);
const toNumber = (value) => Math.max(0, Number(value || 0));

async function nextSequence(key, prefix) {
  const counter = await AcademyCounter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}-${String(counter.seq).padStart(6, '0')}`;
}

function buildReport(students = [], sales = [], prices = []) {
  const saleByStudent = new Map(sales.map((item) => [String(item.studentId?._id || item.studentId), item]));
  const rows = students.map((student) => {
    const sale = saleByStudent.get(String(student._id)) || null;
    const classPrice = prices.find((price) => price.className === student.className) || {};
    return {
      student,
      sale,
      className: student.className,
      bookTaken: !!sale?.bookTaken,
      uniformTaken: !!sale?.uniformTaken,
      bookPrice: sale?.bookPrice || classPrice.bookPrice || 0,
      uniformPrice: sale?.uniformPrice || classPrice.uniformPrice || 0,
      bookDiscount: sale?.bookDiscount || 0,
      uniformDiscount: sale?.uniformDiscount || 0,
      totalAmount: sale?.totalAmount || 0
    };
  });
  const byClassMap = new Map();
  rows.forEach((row) => {
    const key = row.className || 'بدون صنف';
    const current = byClassMap.get(key) || {
      className: key,
      students: 0,
      bookTaken: 0,
      bookMissing: 0,
      uniformTaken: 0,
      uniformMissing: 0,
      bookTotal: 0,
      uniformTotal: 0,
      totalDiscount: 0,
      totalAmount: 0
    };
    current.students += 1;
    current.bookTaken += row.bookTaken ? 1 : 0;
    current.bookMissing += row.bookTaken ? 0 : 1;
    current.uniformTaken += row.uniformTaken ? 1 : 0;
    current.uniformMissing += row.uniformTaken ? 0 : 1;
    current.bookTotal += row.bookTaken ? toNumber(row.bookPrice) : 0;
    current.uniformTotal += row.uniformTaken ? toNumber(row.uniformPrice) : 0;
    current.totalDiscount += toNumber(row.bookDiscount) + toNumber(row.uniformDiscount);
    current.totalAmount += toNumber(row.totalAmount);
    byClassMap.set(key, current);
  });
  return {
    totals: {
      students: rows.length,
      bookTaken: rows.filter((row) => row.bookTaken).length,
      bookMissing: rows.filter((row) => !row.bookTaken).length,
      uniformTaken: rows.filter((row) => row.uniformTaken).length,
      uniformMissing: rows.filter((row) => !row.uniformTaken).length,
      bookTotal: rows.reduce((sum, row) => sum + (row.bookTaken ? toNumber(row.bookPrice) : 0), 0),
      uniformTotal: rows.reduce((sum, row) => sum + (row.uniformTaken ? toNumber(row.uniformPrice) : 0), 0),
      totalDiscount: rows.reduce((sum, row) => sum + toNumber(row.bookDiscount) + toNumber(row.uniformDiscount), 0),
      totalAmount: rows.reduce((sum, row) => sum + toNumber(row.totalAmount), 0)
    },
    byClass: Array.from(byClassMap.values()).sort((a, b) => a.className.localeCompare(b.className)),
    rows
  };
}

async function payload() {
  const [students, prices, sales] = await Promise.all([
    AcademySupplyStudent.find().sort({ className: 1, fullName: 1 }).lean(),
    AcademySupplyClassPrice.find().sort({ className: 1 }).lean(),
    AcademySupplySale.find().sort({ updatedAt: -1 }).populate('studentId', 'studentCode fullName fatherName className').lean()
  ]);
  return { students, prices, sales, report: buildReport(students, sales, prices) };
}

router.get('/bootstrap', async (_req, res) => {
  try {
    res.json({ success: true, ...(await payload()) });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت اطلاعات کتاب و یونیفرم ناموفق بود.' });
  }
});

router.post('/students', async (req, res) => {
  try {
    const studentCode = String(req.body.studentCode || '').trim().toUpperCase()
      || await nextSequence('academy_supply_student', 'SUP');
    const item = await AcademySupplyStudent.create({
      ...req.body,
      studentCode,
      createdBy: userId(req),
      updatedBy: userId(req)
    });
    res.status(201).json({ success: true, item, message: 'شاگرد در بخش کتاب و یونیفرم ثبت شد.' });
  } catch (error) {
    const message = error?.code === 11000 ? 'آی‌دی شاگرد تکراری است.' : 'ثبت شاگرد ناموفق بود.';
    res.status(400).json({ success: false, message });
  }
});

router.put('/students/:id', async (req, res) => {
  try {
    const item = await AcademySupplyStudent.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: userId(req) },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'شاگرد پیدا نشد.' });
    res.json({ success: true, item, message: 'اطلاعات شاگرد به‌روز شد.' });
  } catch (error) {
    const message = error?.code === 11000 ? 'آی‌دی شاگرد تکراری است.' : 'ویرایش شاگرد ناموفق بود.';
    res.status(400).json({ success: false, message });
  }
});

router.post('/prices', async (req, res) => {
  try {
    const className = String(req.body.className || '').trim();
    if (!className) return res.status(400).json({ success: false, message: 'صنف الزامی است.' });
    const item = await AcademySupplyClassPrice.findOneAndUpdate(
      { className },
      {
        $set: {
          className,
          bookPrice: req.body.bookPrice,
          uniformPrice: req.body.uniformPrice,
          currency: req.body.currency || 'AFN',
          note: req.body.note || '',
          updatedBy: userId(req)
        },
        $setOnInsert: { createdBy: userId(req) }
      },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json({ success: true, item, message: 'قیمت صنف ذخیره شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ذخیره قیمت صنف ناموفق بود.' });
  }
});

router.post('/sales', async (req, res) => {
  try {
    const student = await AcademySupplyStudent.findById(req.body.studentId).lean();
    if (!student) return res.status(404).json({ success: false, message: 'شاگرد انتخاب‌شده پیدا نشد.' });

    const classPrice = await AcademySupplyClassPrice.findOne({ className: student.className }).lean();
    const bookTaken = !!req.body.bookTaken;
    const uniformTaken = !!req.body.uniformTaken;
    const item = await AcademySupplySale.findOneAndUpdate(
      { studentId: student._id },
      {
        $set: {
          studentId: student._id,
          studentCode: student.studentCode,
          studentName: student.fullName,
          fatherName: student.fatherName,
          className: student.className,
          bookTaken,
          uniformTaken,
          bookPrice: bookTaken ? toNumber(req.body.bookPrice || classPrice?.bookPrice) : 0,
          uniformPrice: uniformTaken ? toNumber(req.body.uniformPrice || classPrice?.uniformPrice) : 0,
          bookDiscount: bookTaken ? toNumber(req.body.bookDiscount) : 0,
          uniformDiscount: uniformTaken ? toNumber(req.body.uniformDiscount) : 0,
          bookDate: bookTaken ? String(req.body.bookDate || todayKey()).trim() : '',
          uniformDate: uniformTaken ? String(req.body.uniformDate || todayKey()).trim() : '',
          uniformSize: uniformTaken ? String(req.body.uniformSize || '').trim() : '',
          currency: req.body.currency || classPrice?.currency || 'AFN',
          note: req.body.note || '',
          updatedBy: userId(req)
        },
        $setOnInsert: { createdBy: userId(req) }
      },
      { new: true, upsert: true, runValidators: true }
    ).populate('studentId', 'studentCode fullName fatherName className');

    res.status(201).json({ success: true, item, message: 'وضعیت کتاب و یونیفرم شاگرد ذخیره شد.' });
  } catch {
    res.status(400).json({ success: false, message: 'ثبت فروش/تحویل ناموفق بود.' });
  }
});

router.get('/reports/summary', async (_req, res) => {
  try {
    const data = await payload();
    res.json({ success: true, report: data.report });
  } catch {
    res.status(500).json({ success: false, message: 'گزارش کتاب و یونیفرم ناموفق بود.' });
  }
});

module.exports = router;
