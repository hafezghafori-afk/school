// Renders finance reports (single or bundled) to a real, downloadable PDF.
//
// Why Playwright/Chromium instead of the PDFKit-based utils/financePdfDocuments.js:
// PDFKit's Arabic/Persian text shaping goes through fontkit, and the Dari font used
// elsewhere in this project (B Nazanin) crashes fontkit's contextual-substitution
// handling outright ("TypeError: set is not iterable"). With the Dari font disabled
// (today's default), PDFKit falls back to Helvetica, which has no Arabic glyph
// coverage at all - Dari text renders as garbled mojibake, not just "plain".
// Chromium's text engine (used here, and already proven for the short-term-center's
// printed receipt) shapes Arabic/Persian script correctly and handles RTL layout
// natively, so reports built this way render Dari the way a real document should.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const FONTS_DIR = path.join(PROJECT_ROOT, 'Fonts');
// Same font pair already used for other printed documents in this project
// (services/sheetTemplatePrintService.js) - keeps every printed/exported
// document in the app visually consistent.
const EMBEDDED_FONT_FILES = [
  { family: 'B Zar', file: 'B Zar_p30download.com.ttf' },
  { family: 'B Mitra', file: 'B Mitra_p30download.com.ttf' }
];

let cachedFontFaceCss = null;

const faNumber = new Intl.NumberFormat('fa-AF-u-ca-persian');
const faDateTime = new Intl.DateTimeFormat('fa-AF-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' });

function formatNumber(value) {
  return faNumber.format(Number(value) || 0);
}

function formatMoney(value, currency = 'AFN') {
  return `${formatNumber(value)} ${currency || 'AFN'}`;
}

function formatDateLabel(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  try {
    return faDateTime.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function escapeHtml(value = '') {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildFontFaceCss() {
  if (cachedFontFaceCss !== null) return cachedFontFaceCss;
  cachedFontFaceCss = EMBEDDED_FONT_FILES
    .map(({ family, file }) => {
      const fontPath = path.join(FONTS_DIR, file);
      if (!fs.existsSync(fontPath)) return '';
      const data = fs.readFileSync(fontPath).toString('base64');
      return `
        @font-face {
          font-family: '${family}';
          src: url(data:font/truetype;charset=utf-8;base64,${data}) format('truetype');
          font-weight: 400;
          font-style: normal;
          font-display: swap;
        }
      `;
    })
    .filter(Boolean)
    .join('\n');
  return cachedFontFaceCss;
}

function isMissingPlaywrightBrowserError(error) {
  const message = String(error?.message || error || '');
  return message.includes('Executable doesn') || message.includes('playwright install') || message.includes('chrome-headless-shell');
}

function installPlaywrightChromium() {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    execFile(command, ['playwright', 'install', 'chromium'], {
      cwd: path.join(__dirname, '..'),
      windowsHide: true,
      timeout: 180000
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${error.message}\n${stderr || stdout || ''}`.trim();
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function launchChromium(chromium) {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!isMissingPlaywrightBrowserError(error)) throw error;
    console.warn('Playwright Chromium browser is missing; attempting runtime install.');
    await installPlaywrightChromium();
    return chromium.launch({ headless: true });
  }
}

function formatCellValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function renderSummarySection(summary = []) {
  const items = Array.isArray(summary) ? summary.filter((item) => item && item.label) : [];
  if (!items.length) return '';
  return `
    <div class="report-summary">
      ${items.map((item) => `
        <div class="report-summary-item">
          <span class="report-summary-label">${escapeHtml(item.label)}</span>
          <strong class="report-summary-value">${escapeHtml(item.value)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTableSection(columns = [], rows = [], emptyText = 'رکوردی برای نمایش پیدا نشد.') {
  const safeColumns = Array.isArray(columns) ? columns.filter((column) => column && column.key) : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeColumns.length || !safeRows.length) {
    return `<p class="report-empty">${escapeHtml(emptyText)}</p>`;
  }
  return `
    <table class="report-table">
      <thead>
        <tr>${safeColumns.map((column) => `<th>${escapeHtml(column.label || column.key)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${safeRows.map((row) => `
          <tr>${safeColumns.map((column) => `<td>${escapeHtml(formatCellValue(row?.[column.key]))}</td>`).join('')}</tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderReportSection(report = {}, { pageBreakBefore = false } = {}) {
  const metaLine = [report.subtitle, report.filtersLabel, report.generatedAtLabel]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' &middot; ');
  return `
    <section class="report-section"${pageBreakBefore ? ' style="page-break-before: always;"' : ''}>
      <h1>${escapeHtml(report.title || 'گزارش مالی')}</h1>
      ${metaLine ? `<p class="report-meta">${metaLine}</p>` : ''}
      ${renderSummarySection(report.summary)}
      ${renderTableSection(report.columns, report.rows, report.emptyText)}
    </section>
  `;
}

function buildHtmlDocument(reports = []) {
  const sections = reports
    .map((report, index) => renderReportSection(report, { pageBreakBefore: index > 0 }))
    .join('\n');
  return `<!doctype html>
<html lang="fa-AF" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  ${buildFontFaceCss()}
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 28px;
    font-family: 'B Zar', 'B Mitra', Tahoma, Arial, sans-serif;
    color: #0f172a;
    direction: rtl;
    font-size: 13px;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .report-meta { margin: 0 0 14px; color: #475569; font-size: 11px; }
  .report-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 16px;
  }
  .report-summary-item {
    flex: 1 1 160px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 8px 12px;
    background: #f8fafc;
  }
  .report-summary-label { display: block; color: #64748b; font-size: 10.5px; margin-bottom: 3px; }
  .report-summary-value { display: block; font-size: 14px; color: #0f172a; }
  table.report-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  table.report-table th, table.report-table td {
    border: 1px solid #cbd5e1;
    padding: 6px 8px;
    text-align: right;
  }
  table.report-table thead th { background: #0f172a; color: #ffffff; }
  table.report-table tbody tr:nth-child(even) { background: #f1f5f9; }
  .report-empty { color: #64748b; font-size: 12px; }
</style>
</head>
<body>
  ${sections}
</body>
</html>`;
}

async function renderReportsToPdfBuffer(reports = []) {
  const list = Array.isArray(reports) ? reports.filter(Boolean) : [reports].filter(Boolean);
  if (!list.length) throw new Error('finance_report_pdf_no_reports');
  const html = buildHtmlDocument(list);

  let browser = null;
  try {
    const { chromium } = require('playwright');
    browser = await launchChromium(chromium);
    const page = await browser.newPage({ locale: 'fa-AF' });
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    // eslint-disable-next-line no-undef -- runs inside the Playwright page (browser context)
    await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '14mm', bottom: '16mm', left: '14mm' }
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function renderSingleReportToPdfBuffer(report = {}) {
  return renderReportsToPdfBuffer([report]);
}

module.exports = {
  renderReportsToPdfBuffer,
  renderSingleReportToPdfBuffer,
  formatNumber,
  formatMoney,
  formatDateLabel
};
