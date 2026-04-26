const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');
const Enrollment = require('../models/Enrollment');
const AdminLog = require('../models/AdminLog');
const SiteSettings = require('../models/SiteSettings');
const Counter = require('../models/Counter');
const { sendMail } = require('../utils/mailer');
const { requireAuth, requireRole, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { serializeUserIdentity } = require('../utils/userRole');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const manageEnrollmentAccess = requireAnyPermission(['manage_enrollments', 'manage_users']);
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'Enrollment', actionPrefix: 'enrollment', audit: auditWrite });

const buildAdminLogPayload = (req, action = '', meta = {}) => {
  const identity = serializeUserIdentity(req?.user || {});
  return {
    adminId: req?.user?.id || null,
    adminRole: identity.role || req?.user?.role || '',
    adminOrgRole: identity.orgRole || '',
    action,
    meta
  };
};

const enrollDir = path.join(__dirname, '..', 'uploads', 'enrollments');
if (!fs.existsSync(enrollDir)) {
  fs.mkdirSync(enrollDir, { recursive: true });
}

const safeName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, enrollDir),
  filename: (req, file, cb) => cb(null, `enroll-${Date.now()}-${safeName(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.jpg', '.jpeg', '.png', '.pdf'].includes(ext);
    if (!ok) return cb(new Error('فرمت فایل معتبر نیست'), false);
    cb(null, true);
  }
});

const sendDecisionMail = async ({ to, status, reason, studentName }) => {
  if (!to) return;
  const subject = status === 'approved'
    ? 'ثبت‌نام شما تایید شد'
    : 'ثبت‌نام شما نیاز به اصلاح دارد';
  const text = status === 'approved'
    ? `سلام ${studentName || ''}\nدرخواست ثبت‌نام شما تایید شد. برای ادامه با مدرسه در تماس باشید.`
    : `سلام ${studentName || ''}\nدرخواست ثبت‌نام شما رد شد یا نیاز به اصلاح دارد.\nدلیل: ${reason || '---'}`;
  await sendMail({ to, subject, text, html: `<p>${text.replace(/\n/g, '<br/>')}</p>` });
};

const sendSms = ({ phone, message }) => new Promise((resolve) => {
  const url = process.env.SMS_WEBHOOK_URL || '';
  if (!url || !phone || !message) return resolve(false);
  try {
    const payload = JSON.stringify({ phone, message });
    const target = new URL(url);
    const mod = target.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, () => resolve(true));
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  } catch {
    resolve(false);
  }
});

const isLocalFile = (url = '') => url.startsWith('uploads/enrollments/');
const removeFile = (url = '') => {
  if (!isLocalFile(url)) return;
  const filePath = path.join(__dirname, '..', url);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const resolveFilePath = (url = '') => {
  if (!isLocalFile(url)) return '';
  return path.join(__dirname, '..', url);
};

const resolveLocalAsset = (url = '') => {
  if (!url) return '';
  if (!url.startsWith('uploads/')) return '';
  const fullPath = path.join(__dirname, '..', url);
  return fs.existsSync(fullPath) ? fullPath : '';
};

const drawTableRow = (doc, { label, value }, y) => {
  doc.fontSize(11).fillColor('#0f172a').text(label, 70, y, { align: 'right' });
  doc.fontSize(11).fillColor('#0f172a').text(value || '---', 260, y, { align: 'right' });
  doc.moveTo(60, y + 16).lineTo(530, y + 16).strokeColor('#e5e7eb').stroke();
};

const drawSectionTitle = (doc, title, y) => {
  doc.fontSize(12).fillColor('#0f172a').text(title, 60, y, { align: 'right' });
  doc.moveTo(60, y + 16).lineTo(530, y + 16).strokeColor('#cbd5f5').stroke();
  return y + 26;
};

const ensureSpace = (doc, y) => {
  if (y < 720) return y;
  doc.addPage();
  return 80;
};

router.post('/', (req, res, next) => {
  upload.fields([
    { name: 'idCard', maxCount: 1 },
    { name: 'birthCert', maxCount: 1 },
    { name: 'reportCard', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.studentName) {
      return res.status(400).json({ success: false, message: 'نام شاگرد الزامی است' });
    }
    const files = req.files || {};
    const getFile = (key) => files[key]?.[0]?.filename ? `uploads/enrollments/${files[key][0].filename}` : '';

    const gregorianYear = new Date().getFullYear();
    const afghanYearRaw = (gregorianYear - 621).toString();
    const afghanYear = afghanYearRaw.padStart(4, '0');
    const afghanYearShort = afghanYearRaw.slice(-2);

    const settings = (await SiteSettings.findOne()) || {};
    const format = (settings.studentIdFormats && settings.studentIdFormats.registrationIdFormat) ? settings.studentIdFormats.registrationIdFormat : 'REG-{YYYY}-{SEQ}';

    const counter = await Counter.findByIdAndUpdate(
      `reg_${afghanYear}`,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
      
    const registrationId = format
      .replace(/{YYYY}/g, afghanYear)
      .replace(/{YY}/g, afghanYearShort)
      .replace(/{SEQ}/g, counter.seq.toString().padStart(4, '0'));

    const enrollment = await Enrollment.create({
      studentName: body.studentName,
      fatherName: body.fatherName || '',
      motherName: body.motherName || '',
      gender: body.gender || 'male',
      birthDate: body.birthDate || '',
      grade: body.grade || '',
      phone: body.phone || '',
      email: body.email || '',
      address: body.address || '',
      previousSchool: body.previousSchool || '',
      emergencyPhone: body.emergencyPhone || '',
      notes: body.notes || '',
      registrationId,
      documents: {
        idCardUrl: getFile('idCard'),
        birthCertUrl: getFile('birthCert'),
        reportCardUrl: getFile('reportCard'),
        photoUrl: getFile('photo')
      }
    });

    try {
      const settings = await SiteSettings.findOne();
      const to = settings?.contactEmail || process.env.CONTACT_EMAIL || '';
      if (to) {
        const subject = `ثبت‌نام جدید: ${body.studentName}`;
        const text = `ثبت‌نام جدید دریافت شد.\nشاگرد: ${body.studentName}\nصنف: ${body.grade || '-'}\nشماره: ${body.phone || '-'}\nایمیل: ${body.email || '-'}`;
        await sendMail({ to, subject, text, html: `<p>${text.replace(/\n/g, '<br/>')}</p>` });
      }
    } catch {
      // ignore email errors
    }

    res.json({ success: true, enrollment, message: 'درخواست ثبت نام ارسال شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ثبت نام' });
  }
});

router.get('/admin', requireAuth, requireRole(['admin']), manageEnrollmentAccess, async (req, res) => {
  try {
    const items = await Enrollment.find().sort({ createdAt: -1 });
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت ثبت نام‌ها' });
  }
});

router.get('/export.xlsx', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const items = await Enrollment.find().sort({ createdAt: -1 });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Enrollments');

    ws.columns = [
      { header: 'نام شاگرد', key: 'studentName', width: 20 },
      { header: 'صنف', key: 'grade', width: 12 },
      { header: 'شماره تماس', key: 'phone', width: 16 },
      { header: 'ایمیل', key: 'email', width: 22 },
      { header: 'وضعیت', key: 'status', width: 14 },
      { header: 'تاریخ', key: 'createdAt', width: 18 }
    ];

    items.forEach(item => {
      ws.addRow({
        studentName: item.studentName,
        grade: item.grade || '',
        phone: item.phone || '',
        email: item.email || '',
        status: item.status,
        createdAt: item.createdAt ? new Date(item.createdAt).toLocaleDateString('fa-AF-u-ca-persian') : ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="enrollments.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch {
    res.status(500).json({ success: false, message: 'خطا در خروجی اکسل' });
  }
});

router.get('/:id', requireAuth, requireRole(['admin']), manageEnrollmentAccess, async (req, res) => {
  try {
    const item = await Enrollment.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });
    res.json({ success: true, item });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت درخواست' });
  }
});

router.get('/:id/files', requireAuth, requireRole(['admin']), manageEnrollmentAccess, async (req, res) => {
  try {
    const item = await Enrollment.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });
    res.json({
      success: true,
      files: [
        { label: 'تذکره', url: item.documents?.idCardUrl || '' },
        { label: 'سند تولد', url: item.documents?.birthCertUrl || '' },
        { label: 'کارنامه', url: item.documents?.reportCardUrl || '' },
        { label: 'عکس', url: item.documents?.photoUrl || '' }
      ].filter(f => f.url)
    });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت فایل‌ها' });
  }
});

router.get('/:id/zip', requireAuth, requireRole(['admin']), manageEnrollmentAccess, async (req, res) => {
  try {
    const item = await Enrollment.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="enrollment-${item._id}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', () => {
      res.status(500).end();
    });
    archive.pipe(res);

    const files = [
      { label: 'id-card', url: item.documents?.idCardUrl },
      { label: 'birth-cert', url: item.documents?.birthCertUrl },
      { label: 'report-card', url: item.documents?.reportCardUrl },
      { label: 'photo', url: item.documents?.photoUrl }
    ];

    files.forEach(file => {
      if (!file.url) return;
      const filePath = resolveFilePath(file.url);
      if (filePath && fs.existsSync(filePath)) {
        archive.file(filePath, { name: `${file.label}${path.extname(filePath)}` });
      }
    });

    archive.finalize();
  } catch {
    res.status(500).json({ success: false, message: 'خطا در ساخت فایل زیپ' });
  }
});

router.get('/:id/report', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const item = await Enrollment.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });
    if (item.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'فقط درخواست‌های تایید شده گزارش دارند' });
    }

    const settings = await SiteSettings.findOne();
    const logoPath = resolveLocalAsset(settings?.logoUrl || '');
    const signaturePath = resolveLocalAsset(settings?.signatureUrl || '');
    const signatureName = settings?.signatureName || 'مدیر مکتب';
    const stampPath = resolveLocalAsset(settings?.stampUrl || '');

    const qrPayload = `Enrollment:${item._id}|Student:${item.studentName}|Grade:${item.grade || ''}|Status:${item.status}`;
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 120 });
    const qrBase64 = qrDataUrl.split(',')[1] || '';
    const qrBuffer = qrBase64 ? Buffer.from(qrBase64, 'base64') : null;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="enrollment-${item._id}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    const fontPath = path.join(__dirname, '..', '..', 'Fonts', 'B Nazanin_p30download.com.ttf');
    if (fs.existsSync(fontPath)) {
      doc.font(fontPath);
    }

    if (logoPath) {
      doc.image(logoPath, 470, 40, { width: 70 });
    }

    doc.fontSize(16).fillColor('#0f172a').text(settings?.brandName || 'مدرسه ایمان', 60, 40, { align: 'right' });
    doc.fontSize(10).fillColor('#475569').text(settings?.brandSubtitle || 'Academy Pro', 60, 60, { align: 'right' });
    doc.fontSize(9).fillColor('#475569').text(
      `تماس: ${settings?.contactPhone || ''} | ایمیل: ${settings?.contactEmail || ''}`,
      60,
      78,
      { align: 'right' }
    );
    if (settings?.contactAddress) {
      doc.fontSize(9).fillColor('#475569').text(settings.contactAddress, 60, 92, { align: 'right' });
    }

    doc.moveTo(60, 110).lineTo(530, 110).strokeColor('#e5e7eb').stroke();
    doc.fontSize(18).fillColor('#0f172a').text('گزارش ثبت‌نام', 60, 122, { align: 'right' });
    doc.moveDown(1.5);

    let y = 165;

    y = drawSectionTitle(doc, 'مشخصات شاگرد', y);
    [
      { label: 'نام شاگرد', value: item.studentName },
      { label: 'صنف', value: item.grade },
      { label: 'جنسیت', value: item.gender },
      { label: 'تاریخ تولد', value: item.birthDate }
    ].forEach((row) => {
      y = ensureSpace(doc, y);
      drawTableRow(doc, row, y);
      y += 20;
    });

    y += 12;
    y = drawSectionTitle(doc, 'تماس و آدرس', y);
    [
      { label: 'شماره تماس', value: item.phone },
      { label: 'ایمیل', value: item.email },
      { label: 'شماره اضطراری', value: item.emergencyPhone },
      { label: 'آدرس', value: item.address }
    ].forEach((row) => {
      y = ensureSpace(doc, y);
      drawTableRow(doc, row, y);
      y += 20;
    });

    y += 12;
    y = drawSectionTitle(doc, 'اولیا و مکتب قبلی', y);
    [
      { label: 'نام پدر', value: item.fatherName },
      { label: 'نام مادر', value: item.motherName },
      { label: 'مکتب قبلی', value: item.previousSchool }
    ].forEach((row) => {
      y = ensureSpace(doc, y);
      drawTableRow(doc, row, y);
      y += 20;
    });

    y += 12;
    y = drawSectionTitle(doc, 'جزئیات درخواست', y);
    [
      { label: 'وضعیت', value: item.status },
      { label: 'تاریخ ثبت', value: item.createdAt ? new Date(item.createdAt).toLocaleDateString('fa-AF-u-ca-persian') : '---' }
    ].forEach((row) => {
      y = ensureSpace(doc, y);
      drawTableRow(doc, row, y);
      y += 20;
    });

    y = ensureSpace(doc, y + 10);
    doc.fontSize(11).fillColor('#0f172a').text(`یادداشت: ${item.notes || '---'}`, 60, y + 10, { align: 'right' });

    if (qrBuffer) {
      doc.image(qrBuffer, 60, 640, { width: 90 });
    }

    if (stampPath) {
      doc.image(stampPath, 240, 620, { width: 90, opacity: 0.7 });
    }

    if (signaturePath) {
      doc.image(signaturePath, 400, 620, { width: 90 });
      doc.text(signatureName, 400, 710, { align: 'right' });
    }

    doc.end();
  } catch {
    res.status(500).json({ success: false, message: 'خطا در تولید گزارش' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin']), manageEnrollmentAccess, async (req, res) => {
  try {
    const item = await Enrollment.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });
    if (item.documents) {
      removeFile(item.documents.idCardUrl || '');
      removeFile(item.documents.birthCertUrl || '');
      removeFile(item.documents.reportCardUrl || '');
      removeFile(item.documents.photoUrl || '');
    }
    await AdminLog.create(buildAdminLogPayload(req, 'enrollment_delete', { enrollmentId: item._id }));
    res.json({ success: true, message: 'درخواست حذف شد' });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در حذف درخواست' });
  }
});

router.put('/:id/approve', requireAuth, requireRole(['admin']), manageEnrollmentAccess, async (req, res) => {
  try {
    const itemToApprove = await Enrollment.findById(req.params.id);
    if (!itemToApprove) return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });

    let asasNumber = itemToApprove.asasNumber;
    if (!asasNumber) {
      const gregorianYear = new Date().getFullYear();
      const afghanYearRaw = (gregorianYear - 621).toString();
      const afghanYear = afghanYearRaw.padStart(4, '0');
      const afghanYearShort = afghanYearRaw.slice(-2);

      const settings = (await SiteSettings.findOne()) || {};
      const format = (settings.studentIdFormats && settings.studentIdFormats.asasNumberFormat) ? settings.studentIdFormats.asasNumberFormat : '{YYYY}-{SEQ}';

      const counter = await Counter.findByIdAndUpdate(
        `asas_${afghanYear}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      
      asasNumber = format
        .replace(/{YYYY}/g, afghanYear)
        .replace(/{YY}/g, afghanYearShort)
        .replace(/{SEQ}/g, counter.seq.toString().padStart(4, '0'));
    }

    const item = await Enrollment.findByIdAndUpdate(req.params.id, {
      status: 'approved',
      asasNumber,
      approvedBy: req.user?.id || null,
      approvedAt: req.body?.approvedAt || new Date(),
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: ''
    }, { new: true });
    try {
      await sendDecisionMail({ to: item.email, status: 'approved', studentName: item.studentName });
      await sendSms({ phone: item.phone, message: 'ثبت‌نام شما تایید شد. لطفاً با مدرسه تماس بگیرید.' });
    } catch {
      // ignore
    }
    await AdminLog.create(buildAdminLogPayload(req, 'enrollment_approve', { enrollmentId: item._id }));
    res.json({ success: true, item, message: 'درخواست تایید شد' });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در تایید درخواست' });
  }
});

router.put('/:id/update-ids', requireAuth, requireRole(['admin']), manageEnrollmentAccess, async (req, res) => {
  try {
    const { registrationId, asasNumber } = req.body;
    const updateData = {};
    if (typeof registrationId === 'string') updateData.registrationId = registrationId.trim();
    if (typeof asasNumber === 'string') updateData.asasNumber = asasNumber.trim();

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'هیچ مقداری برای بروزرسانی ارسال نشده است' });
    }

    const item = await Enrollment.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });
    
    await AdminLog.create(buildAdminLogPayload(req, 'enrollment_update_ids', { enrollmentId: item._id, updateData }));
    res.json({ success: true, item, message: 'شماره‌های شناسایی با موفقیت بروزرسانی شدند' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در بروزرسانی شماره‌ها' });
  }
});

router.put('/:id/reject', requireAuth, requireRole(['admin']), manageEnrollmentAccess, async (req, res) => {
  try {
    const reason = req.body?.reason || req.body?.rejectionReason || 'اطلاعات ناقص است';
    const item = await Enrollment.findByIdAndUpdate(req.params.id, {
      status: 'rejected',
      rejectedBy: req.user?.id || null,
      rejectedAt: req.body?.rejectedAt || new Date(),
      rejectionReason: reason,
      approvedBy: null,
      approvedAt: null
    }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });
    try {
      await sendDecisionMail({ to: item.email, status: 'rejected', reason, studentName: item.studentName });
      await sendSms({ phone: item.phone, message: `درخواست ثبت‌نام شما رد شد. دلیل: ${reason}` });
    } catch {
      // ignore
    }
    await AdminLog.create(buildAdminLogPayload(req, 'enrollment_reject', { enrollmentId: item._id, reason }));
    res.json({ success: true, item, message: 'درخواست رد شد' });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در رد درخواست' });
  }
});

module.exports = router;
