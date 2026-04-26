const express = require('express');
const ExcelJS = require('exceljs');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const {
  createSheetTemplate,
  deleteSheetTemplate,
  getSheetTemplateById,
  listSheetTemplates,
  previewSheetTemplate,
  updateSheetTemplate
} = require('../services/sheetTemplateService');
const { reportToCsv } = require('../services/reportEngineService');
const { buildReportPdfBuffer } = require('../services/sheetTemplatePdfService');
const { renderReportPrintHtml } = require('../services/sheetTemplatePrintService');

const router = express.Router();

function getSheetTemplateErrorStatus(code = '') {
  if (code === 'sheet_template_duplicate_code') return 409;
  if (code.includes('E11000') || code.includes('duplicate key')) return 409;
  if (code.includes('validation failed') || code.includes('Cast to ObjectId failed')) return 400;
  if (code === 'sheet_template_not_found') return 404;
  if (code.startsWith('sheet_template_')) return 400;
  return 500;
}

function getSheetTemplateErrorMessage(error) {
  const message = String(error?.message || '');
  if (message.includes('E11000') || message.includes('duplicate key')) {
    return 'sheet_template_duplicate_code';
  }
  return message;
}

const readAccess = [requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content')];
const writeAccess = [requireAuth, requireRole(['admin']), requirePermission('manage_content')];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function humanizeKey(value = '') {
  const text = normalizeText(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getColumnLabel(column = {}) {
  return normalizeText(column.label) || humanizeKey(column.key || 'value') || 'Value';
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function reportToXlsxBuffer(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'School Project';
  workbook.created = new Date();
  workbook.modified = new Date();

  const columns = Array.isArray(report?.columns) ? report.columns : [];
  const rows = Array.isArray(report?.rows) ? report.rows : [];

  const sheet = workbook.addWorksheet('Report');
  sheet.columns = columns.map((column) => ({
    header: getColumnLabel(column),
    key: column.key,
    width: Math.max(14, Math.min(36, getColumnLabel(column).length + 4))
  }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };

  rows.forEach((row) => {
    const nextRow = {};
    columns.forEach((column) => {
      nextRow[column.key] = row?.[column.key] ?? '';
    });
    sheet.addRow(nextRow);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

function reportToPrintHtml(report) {
  const title = report?.report?.title || report?.report?.key || 'Report';
  const generatedAt = report?.generatedAt || '';
  const columns = Array.isArray(report?.columns) ? report.columns : [];
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const headerCells = columns.map((column) => `<th>${escapeHtml(getColumnLabel(column))}</th>`).join('');
  const bodyRows = rows.length
    ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row?.[column.key] ?? '')}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${Math.max(columns.length, 1)}">No rows found.</td></tr>`;

  return `<!doctype html>
<html lang="en" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #14302e; background: #f7fbfa; }
      .hero { margin-bottom: 20px; padding: 20px; border-radius: 18px; background: linear-gradient(135deg, #0f766e, #d97706); color: #fff; }
      .hero h1 { margin: 0 0 8px; font-size: 28px; }
      .meta { margin-top: 12px; font-size: 13px; opacity: 0.9; }
      table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 18px; overflow: hidden; }
      th, td { padding: 12px 14px; border-bottom: 1px solid #e7efee; text-align: right; font-size: 13px; }
      th { background: #e8f3f1; color: #0f403b; }
      tr:nth-child(even) td { background: #fbfdfd; }
      @media print { body { margin: 0; background: #fff; } }
    </style>
  </head>
  <body>
    <section class="hero">
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">Generated at: ${escapeHtml(generatedAt)}</div>
    </section>
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </body>
</html>`;
}

router.get('/', ...readAccess, async (req, res) => {
  try {
    const items = await listSheetTemplates(req.query || {});
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load sheet templates.' });
  }
});

router.get('/:templateId', ...readAccess, async (req, res) => {
  try {
    const item = await getSheetTemplateById(req.params.templateId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Sheet template was not found.' });
    }
    return res.json({ success: true, item });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load sheet template.' });
  }
});

router.post('/', ...writeAccess, async (req, res) => {
  try {
    if (!String(req.body?.title || '').trim()) {
      return res.status(400).json({ success: false, message: 'Template title is required.' });
    }
    if (!String(req.body?.type || '').trim()) {
      return res.status(400).json({ success: false, message: 'Template type is required.' });
    }

    const item = await createSheetTemplate(req.body || {}, req.user?.id || null);
    await logActivity({
      req,
      action: 'sheet_template_create',
      targetType: 'sheet_template',
      targetId: item?.id || '',
      meta: {
        sheetTemplateId: item?.id || '',
        sheetType: item?.type || '',
        title: item?.title || ''
      }
    });
    return res.status(201).json({ success: true, item });
  } catch (error) {
    const code = getSheetTemplateErrorMessage(error);
    return res.status(getSheetTemplateErrorStatus(code)).json({ success: false, message: code || 'Failed to create sheet template.' });
  }
});

router.patch('/:templateId', ...writeAccess, async (req, res) => {
  try {
    const item = await updateSheetTemplate(req.params.templateId, req.body || {});
    await logActivity({
      req,
      action: 'sheet_template_update',
      targetType: 'sheet_template',
      targetId: item?.id || String(req.params.templateId || ''),
      meta: {
        sheetTemplateId: item?.id || String(req.params.templateId || ''),
        sheetType: item?.type || '',
        title: item?.title || ''
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    const code = getSheetTemplateErrorMessage(error);
    return res.status(getSheetTemplateErrorStatus(code)).json({ success: false, message: code || 'Failed to update sheet template.' });
  }
});

router.delete('/:templateId', ...writeAccess, async (req, res) => {
  try {
    const result = await deleteSheetTemplate(req.params.templateId);
    await logActivity({
      req,
      action: 'sheet_template_delete',
      targetType: 'sheet_template',
      targetId: result?.deletedId || String(req.params.templateId || ''),
      meta: {
        sheetTemplateId: result?.deletedId || String(req.params.templateId || '')
      }
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getSheetTemplateErrorStatus(code)).json({ success: false, message: code || 'Failed to delete sheet template.' });
  }
});

router.post('/:templateId/preview', ...readAccess, async (req, res) => {
  try {
    const item = await previewSheetTemplate(req.params.templateId, req.body?.filters || {});
    return res.json({ success: true, ...item });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getSheetTemplateErrorStatus(code)).json({ success: false, message: code || 'Failed to preview sheet template.' });
  }
});

router.post('/:templateId/export.csv', ...readAccess, async (req, res) => {
  try {
    const item = await previewSheetTemplate(req.params.templateId, req.body?.filters || {});
    const csv = reportToCsv(item.preview || {});
    const filename = `${item.template?.code || item.template?.id || 'sheet-template'}.csv`;

    await logActivity({
      req,
      action: 'sheet_template_export_csv',
      targetType: 'sheet_template',
      targetId: item.template?.id || String(req.params.templateId || ''),
      meta: {
        sheetTemplateId: item.template?.id || String(req.params.templateId || ''),
        sheetType: item.template?.type || '',
        exportFormat: 'csv',
        rowCount: Array.isArray(item.preview?.rows) ? item.preview.rows.length : 0,
        filename
      }
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getSheetTemplateErrorStatus(code)).json({ success: false, message: code || 'Failed to export sheet template CSV.' });
  }
});

router.post('/:templateId/export.xlsx', ...readAccess, async (req, res) => {
  try {
    const item = await previewSheetTemplate(req.params.templateId, req.body?.filters || {});
    const buffer = await reportToXlsxBuffer(item.preview || {});
    const filename = `${item.template?.code || item.template?.id || 'sheet-template'}.xlsx`;

    await logActivity({
      req,
      action: 'sheet_template_export_xlsx',
      targetType: 'sheet_template',
      targetId: item.template?.id || String(req.params.templateId || ''),
      meta: {
        sheetTemplateId: item.template?.id || String(req.params.templateId || ''),
        sheetType: item.template?.type || '',
        exportFormat: 'xlsx',
        rowCount: Array.isArray(item.preview?.rows) ? item.preview.rows.length : 0,
        filename
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getSheetTemplateErrorStatus(code)).json({ success: false, message: code || 'Failed to export sheet template Excel.' });
  }
});

router.post('/:templateId/export.pdf', ...readAccess, async (req, res) => {
  try {
    const item = await previewSheetTemplate(req.params.templateId, req.body?.filters || {});
    const buffer = await buildReportPdfBuffer({ report: item.preview || {}, template: item.template || null });
    const filename = `${item.template?.code || item.template?.id || 'sheet-template'}.pdf`;

    await logActivity({
      req,
      action: 'sheet_template_export_pdf',
      targetType: 'sheet_template',
      targetId: item.template?.id || String(req.params.templateId || ''),
      meta: {
        sheetTemplateId: item.template?.id || String(req.params.templateId || ''),
        sheetType: item.template?.type || '',
        exportFormat: 'pdf',
        rowCount: Array.isArray(item.preview?.rows) ? item.preview.rows.length : 0,
        filename
      }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getSheetTemplateErrorStatus(code)).json({ success: false, message: code || 'Failed to export sheet template PDF.' });
  }
});

router.post('/:templateId/export.print', ...readAccess, async (req, res) => {
  try {
    const item = await previewSheetTemplate(req.params.templateId, req.body?.filters || {});
    const html = item.template
      ? await renderReportPrintHtml({ report: item.preview || {}, template: item.template || null })
      : reportToPrintHtml(item.preview || {});
    const filename = `${item.template?.code || item.template?.id || 'sheet-template'}.html`;

    await logActivity({
      req,
      action: 'sheet_template_export_print',
      targetType: 'sheet_template',
      targetId: item.template?.id || String(req.params.templateId || ''),
      meta: {
        sheetTemplateId: item.template?.id || String(req.params.templateId || ''),
        sheetType: item.template?.type || '',
        exportFormat: 'print',
        rowCount: Array.isArray(item.preview?.rows) ? item.preview.rows.length : 0,
        filename
      }
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.status(200).send(html);
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getSheetTemplateErrorStatus(code)).json({ success: false, message: code || 'Failed to export printable sheet template.' });
  }
});

module.exports = router;
