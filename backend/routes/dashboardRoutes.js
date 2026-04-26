const express = require('express');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { buildParentStatementPackHtml } = require('../utils/financeStatementPack');
const { buildStatementPackPdfBuffer } = require('../utils/financePdfDocuments');
const {
  buildFinanceDocumentDescriptor,
  createFinanceDocumentArchive
} = require('../utils/financeDocumentArchive');
const {
  getTeacherDashboard,
  getAdminDashboard,
  getExamsDashboard
} = require('../services/dashboardService');
const { getParentDashboard } = require('../services/parentDashboardService');

const router = express.Router();

router.get('/teacher', requireAuth, requireRole(['instructor']), async (req, res) => {
  try {
    const data = await getTeacherDashboard(req.user?.id || '');
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت داشبورد استاد ناموفق بود.' });
  }
});

router.get('/admin', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const data = await getAdminDashboard();
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت داشبورد مدیریتی ناموفق بود.' });
  }
});

router.get('/exams', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const data = await getExamsDashboard();
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت داشبورد امتحانات ناموفق بود.' });
  }
});

router.get('/parent', requireAuth, requireRole(['parent', 'admin', 'student']), async (req, res) => {
  try {
    const data = await getParentDashboard(req.user || {}, { studentId: req.query?.studentId || '' });
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت داشبورد ولی/سرپرست ناموفق بود.' });
  }
});

router.get('/parent/statement-pack', requireAuth, requireRole(['parent', 'admin', 'student']), async (req, res) => {
  try {
    const data = await getParentDashboard(req.user || {}, { studentId: req.query?.studentId || '' });
    if (!data?.linkedStudent || !data?.financeStatement) {
      return res.status(404).json({ success: false, message: 'Ø¨Ø³ØªÙ‡ Ø§Ø³ØªÛŒØªÙ…Ù†Øª Ù…Ø§Ù„ÛŒ Ø¨Ø±Ø§ÛŒ Ø§ÛŒÙ† Ù…ØªØ¹Ù„Ù… Ø¯Ø± Ø¯Ø³ØªØ±Ø³ Ù†ÛŒØ³Øª.' });
    }

    const filename = `parent-finance-statement-${String(data.linkedStudent?.membershipId || data.linkedStudent?.id || 'student')}.html`;
    const html = buildParentStatementPackHtml({
      linkedStudent: data.linkedStudent,
      financeStatement: data.financeStatement,
      financeOrders: data.financeOrders,
      financePayments: data.financePayments,
      financeReliefs: data.financeReliefs
    });

    await logActivity({
      req,
      action: 'export_parent_finance_statement_pack',
      targetType: 'StudentMembership',
      targetId: String(data.linkedStudent?.membershipId || ''),
      meta: {
        studentId: String(data.linkedStudent?.id || ''),
        membershipId: String(data.linkedStudent?.membershipId || ''),
        filename
      }
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Ø¯Ø±ÛŒØ§ÙØª Ø¨Ø³ØªÙ‡ Ø§Ø³ØªÛŒØªÙ…Ù†Øª Ù…Ø§Ù„ÛŒ ÙˆÙ„ÛŒ/Ø³Ø±Ù¾Ø±Ø³Øª Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯.' });
  }
});

router.get('/parent/statement-pack.pdf', requireAuth, requireRole(['parent', 'admin', 'student']), async (req, res) => {
  try {
    const data = await getParentDashboard(req.user || {}, { studentId: req.query?.studentId || '' });
    if (!data?.linkedStudent || !data?.financeStatement) {
      return res.status(404).json({ success: false, message: 'بسته استیتمنت مالی برای این متعلم در دسترس نیست.' });
    }

    const membershipId = String(data.linkedStudent?.membershipId || data.linkedStudent?.id || 'student');
    const filename = `parent-finance-statement-${membershipId}.pdf`;
    const statement = data.financeStatement || {};
    const descriptor = await buildFinanceDocumentDescriptor({
      req,
      documentType: 'parent_statement'
    });
    const pdfBuffer = await buildStatementPackPdfBuffer({
      title: 'بسته رسمی استیتمنت مالی ولی/سرپرست',
      subtitle: 'Official parent finance statement pack',
      subjectName: data.linkedStudent?.name || 'متعلم',
      classTitle: data.linkedStudent?.classTitle || '-',
      academicYearTitle: data.linkedStudent?.academicYearTitle || '-',
      membershipId,
      generatedAt: statement.generatedAt || data.generatedAt || new Date().toISOString(),
      currency: statement.currency || 'AFN',
      totals: statement.totals || {},
      pack: statement.pack || null,
      latestApprovedPayment: statement.latestApprovedPayment || null,
      latestPendingPayment: statement.latestPendingPayment || null,
      orders: Array.isArray(data.financeOrders) ? data.financeOrders : [],
      payments: Array.isArray(data.financePayments) ? data.financePayments : [],
      reliefs: Array.isArray(data.financeReliefs) ? data.financeReliefs : [],
      documentNo: descriptor.documentNo,
      generatedByName: req.user?.name || req.user?.email || req.user?.role || 'system',
      verificationCode: descriptor.verificationCode,
      verificationUrl: descriptor.verificationUrl,
      verificationQrBuffer: descriptor.verificationQrBuffer
    });

    const archivedDocument = await createFinanceDocumentArchive({
      req,
      descriptor,
      documentType: 'parent_statement',
      filename,
      buffer: pdfBuffer,
      title: 'Parent finance statement pack',
      subjectName: data.linkedStudent?.name || 'Student',
      membershipLabel: membershipId,
      studentMembershipId: data.linkedStudent?.membershipId || null,
      studentId: data.linkedStudent?.studentCoreId || data.linkedStudent?.id || null,
      meta: {
        studentUserId: data.linkedStudent?.studentUserId || '',
        currency: statement.currency || 'AFN',
        totalOrders: Number(statement?.totals?.totalOrders || 0),
        totalOutstanding: Number(statement?.totals?.totalOutstanding || 0)
      }
    });

    await logActivity({
      req,
      action: 'export_parent_finance_statement_pdf',
      targetType: 'StudentMembership',
      targetId: membershipId,
      meta: {
        studentId: String(data.linkedStudent?.id || ''),
        membershipId,
        filename
      }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Finance-Document-No', String(archivedDocument?.documentNo || descriptor.documentNo || ''));
    res.setHeader('X-Finance-Verification-Code', String(archivedDocument?.verification?.code || descriptor.verificationCode || ''));
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت نسخه PDF استیتمنت مالی ولی/سرپرست ناموفق بود.' });
  }
});

module.exports = router;
