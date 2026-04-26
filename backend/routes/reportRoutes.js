const express = require('express');
const ExcelJS = require('exceljs');

const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const {
  getReportDefinition,
  listReportCatalog,
  listReportReferenceData,
  reportToCsv,
  runReport
} = require('../services/reportEngineService');
const { applyTemplateToReport } = require('../services/sheetTemplateService');
const { buildReportPdfBuffer } = require('../services/sheetTemplatePdfService');
const { renderReportPrintHtml } = require('../services/sheetTemplatePrintService');
const { resolvePermissions } = require('../utils/permissions');
const { logActivity } = require('../utils/activity');

const router = express.Router();

async function getAccessContext(req) {
  if (Array.isArray(req.user?.permissions) && req.user.permissions.length) {
    return {
      role: req.user.role || '',
      orgRole: req.user.orgRole || '',
      permissions: resolvePermissions({
        role: req.user.role || '',
        orgRole: req.user.orgRole || '',
        permissions: req.user.permissions || [],
        adminLevel: req.user.adminLevel || ''
      })
    };
  }

  const user = await User.findById(req.user?.id).select('role orgRole permissions adminLevel');
  if (!user) throw new Error('report_user_not_found');
  return {
    role: user.role || '',
    orgRole: user.orgRole || '',
    permissions: resolvePermissions({
      role: user.role || '',
      orgRole: user.orgRole || '',
      permissions: user.permissions || [],
      adminLevel: user.adminLevel || ''
    })
  };
}

function canAccessReport(definition, permissions = []) {
  const permissionSet = new Set(Array.isArray(permissions) ? permissions : []);
  return Array.isArray(definition?.requiredPermissions) && definition.requiredPermissions.some((item) => permissionSet.has(item));
}

function getReportErrorStatus(code = '') {
  if (code === 'report_user_not_found') return 401;
  if (code === 'report_forbidden') return 403;
  if (code.startsWith('report_')) return 400;
  return 500;
}

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

function sanitizeFilters(filters = {}) {
  return Object.entries(filters && typeof filters === 'object' ? filters : {}).reduce((result, [key, value]) => {
    if (value == null) return result;
    const normalized = String(value).trim();
    if (!normalized) return result;
    result[key] = normalized;
    return result;
  }, {});
}

async function reportToXlsxBuffer(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'School Project';
  workbook.created = new Date();
  workbook.modified = new Date();

  const columns = Array.isArray(report?.columns) ? report.columns : [];
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const summaryEntries = Object.entries(report?.summary || {});
  const filterEntries = Object.entries(report?.filters || {}).filter(([, value]) => value != null && String(value).trim() !== '');

  const sheet = workbook.addWorksheet('Report');
  sheet.columns = columns.map((column) => ({
    header: getColumnLabel(column),
    key: column.key,
    width: Math.max(14, Math.min(36, getColumnLabel(column).length + 4))
  }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F3F1' }
  };

  rows.forEach((row) => {
    const nextRow = {};
    columns.forEach((column) => {
      nextRow[column.key] = row?.[column.key] ?? '';
    });
    sheet.addRow(nextRow);
  });

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Value', key: 'value', width: 28 }
  ];
  summarySheet.getRow(1).font = { bold: true };
  summarySheet.addRow({ field: 'Report', value: report?.report?.title || report?.report?.key || 'Report' });
  summarySheet.addRow({ field: 'Generated At', value: report?.generatedAt || '' });
  summarySheet.addRow({ field: 'Rows', value: rows.length });
  summaryEntries.forEach(([key, value]) => {
    summarySheet.addRow({ field: humanizeKey(key), value: value == null ? '' : String(value) });
  });
  if (filterEntries.length) {
    summarySheet.addRow({ field: '', value: '' });
    filterEntries.forEach(([key, value]) => {
      summarySheet.addRow({ field: `Filter: ${humanizeKey(key)}`, value: String(value) });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

function reportToPrintHtml(report) {
  const title = report?.report?.title || report?.report?.key || 'Report';
  const description = report?.report?.description || '';
  const generatedAt = report?.generatedAt || '';
  const columns = Array.isArray(report?.columns) ? report.columns : [];
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const summaryEntries = Object.entries(report?.summary || {});
  const filterEntries = Object.entries(report?.filters || {}).filter(([, value]) => value != null && String(value).trim() !== '');

  const headerCells = columns.map((column) => `<th>${escapeHtml(getColumnLabel(column))}</th>`).join('');
  const bodyRows = rows.length
    ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row?.[column.key] ?? '')}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${Math.max(columns.length, 1)}">No rows found.</td></tr>`;
  const summaryHtml = summaryEntries.length
    ? summaryEntries.map(([key, value]) => `<div class="summary-item"><strong>${escapeHtml(humanizeKey(key))}</strong><span>${escapeHtml(value == null ? '' : value)}</span></div>`).join('')
    : '<div class="summary-item"><strong>Rows</strong><span>0</span></div>';
  const filtersHtml = filterEntries.length
    ? `<div class="filters">${filterEntries.map(([key, value]) => `<span>${escapeHtml(humanizeKey(key))}: ${escapeHtml(value)}</span>`).join('')}</div>`
    : '';

  return `<!doctype html>
<html lang="en" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #14302e; background: #f7fbfa; }
      .hero { margin-bottom: 20px; padding: 20px; border-radius: 18px; background: linear-gradient(135deg, #0f766e, #d97706); color: #fff; }
      .hero h1 { margin: 0 0 8px; font-size: 28px; }
      .hero p { margin: 0; opacity: 0.92; }
      .meta { margin-top: 12px; font-size: 13px; opacity: 0.9; }
      .filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
      .filters span { background: #fff7ed; color: #9a3412; padding: 6px 10px; border-radius: 999px; font-size: 12px; }
      .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 18px 0 22px; }
      .summary-item { background: #ffffff; border: 1px solid #dbe8e6; border-radius: 16px; padding: 12px 14px; }
      .summary-item strong { display: block; font-size: 12px; color: #5b746f; margin-bottom: 6px; }
      .summary-item span { font-size: 20px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 18px; overflow: hidden; }
      th, td { padding: 12px 14px; border-bottom: 1px solid #e7efee; text-align: right; font-size: 13px; }
      th { background: #e8f3f1; color: #0f403b; }
      tr:nth-child(even) td { background: #fbfdfd; }
      @media print { body { margin: 0; background: #fff; } .hero { break-inside: avoid; } }
    </style>
  </head>
  <body>
    <section class="hero">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <div class="meta">Generated at: ${escapeHtml(generatedAt)}</div>
    </section>
    ${filtersHtml}
    <section class="summary">${summaryHtml}</section>
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </body>
</html>`;
}

async function resolveAuthorizedReportRequest(req) {
  const reportKey = String(req.body?.reportKey || '').trim();
  const definition = getReportDefinition(reportKey);
  if (!definition) {
    throw new Error('report_invalid_key');
  }

  const access = await getAccessContext(req);
  if (!canAccessReport(definition, access.permissions)) {
    throw new Error('report_forbidden');
  }

  const baseReport = await runReport(reportKey, req.body?.filters || {});
  const { report, template } = await applyTemplateToReport(req.body?.templateId || '', baseReport);
  return { definition, report, template };
}

router.get('/reference-data', requireAuth, async (req, res) => {
  try {
    const access = await getAccessContext(req);
    const catalog = listReportCatalog({ permissions: access.permissions });
    if (!catalog.length) {
      return res.status(403).json({ success: false, message: 'You do not have access to the report engine.' });
    }
    const referenceData = await listReportReferenceData();
    return res.json({ success: true, catalog, ...referenceData });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getReportErrorStatus(code)).json({ success: false, message: code || 'Failed to load report reference data.' });
  }
});

router.get('/catalog', requireAuth, async (req, res) => {
  try {
    const access = await getAccessContext(req);
    const items = listReportCatalog({ permissions: access.permissions });
    if (!items.length) {
      return res.status(403).json({ success: false, message: 'You do not have access to the report engine.' });
    }
    return res.json({ success: true, items });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getReportErrorStatus(code)).json({ success: false, message: code || 'Failed to load report catalog.' });
  }
});

router.post('/run', requireAuth, async (req, res) => {
  try {
    const { definition, report, template } = await resolveAuthorizedReportRequest(req);
    await logActivity({
      req,
      action: 'report_run',
      targetType: 'report',
      targetId: definition.key,
      meta: {
        reportKey: definition.key,
        templateId: template?.id || '',
        reportTitle: definition.title || definition.key,
        filters: sanitizeFilters(req.body?.filters || {}),
        rowCount: Array.isArray(report?.rows) ? report.rows.length : 0
      }
    });
    return res.json({ success: true, report, template });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getReportErrorStatus(code)).json({ success: false, message: code || 'Failed to run report.' });
  }
});

router.post('/export.csv', requireAuth, async (req, res) => {
  try {
    const { definition, report, template } = await resolveAuthorizedReportRequest(req);
    const csv = reportToCsv(report);
    const filename = `${definition.key}.csv`;
    await logActivity({
      req,
      action: 'report_export_csv',
      targetType: 'report',
      targetId: definition.key,
      meta: {
        reportKey: definition.key,
        templateId: template?.id || '',
        exportFormat: 'csv',
        filters: sanitizeFilters(req.body?.filters || {}),
        rowCount: Array.isArray(report?.rows) ? report.rows.length : 0,
        filename
      }
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getReportErrorStatus(code)).json({ success: false, message: code || 'Failed to export report CSV.' });
  }
});

router.post('/export.xlsx', requireAuth, async (req, res) => {
  try {
    const { definition, report, template } = await resolveAuthorizedReportRequest(req);
    const buffer = await reportToXlsxBuffer(report);
    const filename = `${definition.key}.xlsx`;
    await logActivity({
      req,
      action: 'report_export_xlsx',
      targetType: 'report',
      targetId: definition.key,
      meta: {
        reportKey: definition.key,
        templateId: template?.id || '',
        exportFormat: 'xlsx',
        filters: sanitizeFilters(req.body?.filters || {}),
        rowCount: Array.isArray(report?.rows) ? report.rows.length : 0,
        filename
      }
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getReportErrorStatus(code)).json({ success: false, message: code || 'Failed to export report Excel.' });
  }
});

router.post('/export.pdf', requireAuth, async (req, res) => {
  try {
    const { definition, report, template } = await resolveAuthorizedReportRequest(req);
    const buffer = await buildReportPdfBuffer({ report, template });
    const filename = `${definition.key}.pdf`;
    await logActivity({
      req,
      action: 'report_export_pdf',
      targetType: 'report',
      targetId: definition.key,
      meta: {
        reportKey: definition.key,
        templateId: template?.id || '',
        exportFormat: 'pdf',
        filters: sanitizeFilters(req.body?.filters || {}),
        rowCount: Array.isArray(report?.rows) ? report.rows.length : 0,
        filename
      }
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getReportErrorStatus(code)).json({ success: false, message: code || 'Failed to export report PDF.' });
  }
});

router.post('/export.print', requireAuth, async (req, res) => {
  try {
    const { definition, report, template } = await resolveAuthorizedReportRequest(req);
    const html = template
      ? await renderReportPrintHtml({ report, template })
      : reportToPrintHtml(report);
    const filename = `${definition.key}.html`;
    await logActivity({
      req,
      action: 'report_export_print',
      targetType: 'report',
      targetId: definition.key,
      meta: {
        reportKey: definition.key,
        templateId: template?.id || '',
        exportFormat: 'print',
        filters: sanitizeFilters(req.body?.filters || {}),
        rowCount: Array.isArray(report?.rows) ? report.rows.length : 0,
        filename
      }
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.status(200).send(html);
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getReportErrorStatus(code)).json({ success: false, message: code || 'Failed to export printable report.' });
  }
});

module.exports = router;
