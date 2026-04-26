const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const SiteSettings = require('../models/SiteSettings');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const FONTS_DIR = path.join(PROJECT_ROOT, 'Fonts');
const EMBEDDED_FONT_FILES = [
  { family: 'B Zar', file: 'B Zar_p30download.com.ttf' },
  { family: 'B Mitra', file: 'B Mitra_p30download.com.ttf' }
];

let cachedPersianFontFaceCss = null;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function formatDateValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeText(value);
  return date.toISOString().slice(0, 10);
}

function formatCellValue(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value == null ? '' : value);
}

function inferSheetType(template = null, report = {}) {
  const templateType = normalizeText(template?.type);
  if (templateType) return templateType;
  const reportKey = normalizeText(report?.report?.key);
  if (reportKey === 'attendance_overview') return 'attendance';
  if (reportKey === 'attendance_summary_overview') return 'attendance_summary';
  if (reportKey === 'subjects_overview') return 'subjects';
  if (reportKey === 'exam_outcomes') return 'exam';
  if (reportKey === 'finance_overview') return 'finance';
  return 'report';
}

function getLayout(template = null) {
  const layout = template?.layout && typeof template.layout === 'object' ? template.layout : {};
  const margins = layout.margins && typeof layout.margins === 'object' ? layout.margins : {};

  return {
    fontFamily: normalizeText(layout.fontFamily) || 'B Zar',
    fontSize: Number(layout.fontSize || 12),
    orientation: normalizeText(layout.orientation) === 'portrait' ? 'portrait' : 'landscape',
    showHeader: layout.showHeader !== false,
    showFooter: layout.showFooter !== false,
    showLogo: layout.showLogo !== false,
    headerText: normalizeText(layout.headerText),
    footerText: normalizeText(layout.footerText),
    margins: {
      top: Number(margins.top || 24),
      right: Number(margins.right || 24),
      bottom: Number(margins.bottom || 24),
      left: Number(margins.left || 24)
    }
  };
}

function buildPersianFontFaceCss() {
  if (cachedPersianFontFaceCss !== null) return cachedPersianFontFaceCss;

  cachedPersianFontFaceCss = EMBEDDED_FONT_FILES
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

  return cachedPersianFontFaceCss;
}

function getDefaultTitleByType(type = '') {
  if (type === 'subjects') return 'شقه مضامین';
  if (type === 'exam') return 'شقه امتحان';
  if (type === 'attendance') return 'شقه حاضری';
  if (type === 'attendance_summary') return 'شقه خلاصه حاضری';
  if (type === 'finance') return 'شقه مالی';
  return 'شقه چاپی';
}

function collectUniqueTextValues(rows = [], key = '') {
  const values = new Set();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const text = normalizeText(row?.[key]);
    if (text) values.add(text);
  });
  return [...values];
}

function buildMetadata(type, template = null, report = {}, siteSettings = null) {
  const firstRow = Array.isArray(report?.rows) && report.rows.length ? report.rows[0] : {};
  const filters = report?.filters || {};
  const title = normalizeText(template?.title) || getDefaultTitleByType(type);

  const base = [
    ['عنوان', title],
    ['صنف', normalizeText(firstRow.classTitle || '')],
    ['سال تعلیمی', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
    ['ترم', normalizeText(firstRow.term || '') || normalizeText(filters.termId)],
    ['ماه', normalizeText(filters.month || template?.filters?.month)],
    ['از تاریخ', formatDateValue(filters.dateFrom)],
    ['تا تاریخ', formatDateValue(filters.dateTo)]
  ];

  if (type === 'exam') {
    return [
      ['مضمون', normalizeText(firstRow.subject || '')],
      ['ممتحن', normalizeText(firstRow.teacherName || '')],
      ['ممیز', normalizeText(firstRow.reviewedByName || siteSettings?.signatureName) || 'مدیر مکتب'],
      ['صنف', normalizeText(firstRow.classTitle || '')],
      ['جلسه امتحان', normalizeText(firstRow.sessionTitle || '')],
      ['تاریخ', formatDateValue(firstRow.heldAt || filters.dateFrom)],
      ['ماه', normalizeText(filters.month || template?.filters?.month)],
      ['ترم', normalizeText(firstRow.term || '') || normalizeText(filters.termId)]
    ];
  }

  if (type === 'subjects') {
    const subjectNames = collectUniqueTextValues(report?.rows, 'subjectName');
    const teacherNames = collectUniqueTextValues(report?.rows, 'teacherName');
    const subjectLabel = subjectNames.length === 1 ? subjectNames[0] : `${String(report?.summary?.uniqueSubjects || subjectNames.length || 0)} مضمون`;
    const teacherLabel = teacherNames.length === 1 ? teacherNames[0] : `${String(report?.summary?.uniqueTeachers || teacherNames.length || 0)} استاد`;
    return [
      ['مضمون', subjectLabel],
      ['استاد', teacherLabel],
      ['صنف', normalizeText(firstRow.classTitle || '')],
      ['ممیز', normalizeText(siteSettings?.signatureName) || 'مدیر مکتب'],
      ['تاریخ', formatDateValue(report?.generatedAt || filters.dateTo || filters.dateFrom)],
      ['ماه', normalizeText(filters.month || template?.filters?.month)],
      ['ترم', normalizeText(firstRow.term || '') || normalizeText(filters.termId)],
      ['سال تعلیمی', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['مجموع ساعات', String(report?.summary?.totalWeeklyPeriods || 0)]
    ];
  }

  if (type === 'attendance_summary') {
    return [
      ['صنف', normalizeText(firstRow.classTitle || '')],
      ['سال تعلیمی', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['ماه', normalizeText(filters.month || template?.filters?.month)],
      ['تعداد متعلمین', String(report?.summary?.totalStudents || 0)],
      ['مجموع ثبت‌ها', String(report?.summary?.totalRecords || 0)],
      ['اوسط فیصدی حضور', String(report?.summary?.averageAttendanceRate || 0)]
    ];
  }

  if (type === 'attendance') {
    return [
      ['صنف', normalizeText(firstRow.classTitle || '')],
      ['سال تعلیمی', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['ماه', normalizeText(filters.month || template?.filters?.month)],
      ['از تاریخ', formatDateValue(filters.dateFrom)],
      ['تا تاریخ', formatDateValue(filters.dateTo)],
      ['تعداد ثبت‌ها', String(report?.summary?.totalRecords || 0)]
    ];
  }

  if (type === 'finance') {
    return [
      ['صنف', normalizeText(firstRow.classTitle || '')],
      ['سال تعلیمی', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['ترم', normalizeText(firstRow.term || '') || normalizeText(filters.termId)],
      ['مبلغ کل', String(report?.summary?.totalDue || 0)],
      ['پرداخت‌شده', String(report?.summary?.totalPaidOnOrders || 0)],
      ['باقی‌مانده', String(report?.summary?.totalOutstanding || 0)]
    ];
  }

  return base.filter(([, value]) => normalizeText(value));
}

function buildSummaryItems(report = {}) {
  return Object.entries(report?.summary || {})
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .slice(0, 6)
    .map(([key, value]) => `
      <div class="sheet-summary-item">
        <strong>${escapeHtml(humanizeKey(key))}</strong>
        <span>${escapeHtml(formatCellValue(value))}</span>
      </div>
    `)
    .join('');
}

function buildFilterBadges(report = {}) {
  return Object.entries(report?.filters || {})
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => `<span>${escapeHtml(humanizeKey(key))}: ${escapeHtml(formatCellValue(value))}</span>`)
    .join('');
}

function buildSignatureBlocks(type, siteSettings = null, report = {}) {
  const firstRow = Array.isArray(report?.rows) && report.rows.length ? report.rows[0] : {};
  const schoolSignature = normalizeText(siteSettings?.signatureName) || 'مدیر مکتب';

  if (type === 'exam') {
    return [
      { role: 'ممتحن', name: normalizeText(firstRow.teacherName || 'استاد مضمون') },
      { role: 'ممیز', name: schoolSignature }
    ];
  }

  if (type === 'finance') {
    return [
      { role: 'مسئول مالی', name: 'واحد مالی' },
      { role: 'مدیر', name: schoolSignature }
    ];
  }

  if (type === 'attendance' || type === 'attendance_summary') {
    return [
      { role: 'مسئول حاضری', name: 'مدیریت حاضری' },
      { role: 'مدیر', name: schoolSignature }
    ];
  }

  if (type === 'subjects') {
    const teacherNames = collectUniqueTextValues(report?.rows, 'teacherName');
    return [
      { role: 'ترتیب‌کننده', name: teacherNames.length === 1 ? teacherNames[0] : 'بخش آموزشی' },
      { role: 'ممیز', name: schoolSignature }
    ];
  }

  return [
    { role: 'ترتیب‌کننده', name: normalizeText(firstRow.teacherName || '') || 'بخش آموزشی' },
    { role: 'تأییدکننده', name: schoolSignature }
  ];
}

function shouldRenderSummary(type = '') {
  return type !== 'subjects';
}

function buildFormalNote(type = '') {
  if (type === 'subjects') {
    return 'این شقه مضامین به اساس مضامین و تعیینات ثبت‌شده برای صنف ترتیب و جهت تایید ارایه گردید.';
  }
  return '';
}

function buildColumnMarkup(columns = []) {
  const totalWidth = columns.reduce((sum, column) => sum + Number(column?.width || 16), 0) || columns.length || 1;
  return columns
    .map((column) => `<col style="width:${((Number(column?.width || 16) / totalWidth) * 100).toFixed(2)}%" />`)
    .join('');
}

function buildTableHtml(report = {}) {
  const columns = Array.isArray(report?.columns) ? report.columns : [];
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const colMarkup = buildColumnMarkup(columns);
  const head = columns.map((column) => `<th>${escapeHtml(getColumnLabel(column))}</th>`).join('');
  const body = rows.length
    ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(formatCellValue(row?.[column.key])) || '&nbsp;'}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${Math.max(columns.length, 1)}">داده‌ای برای نمایش موجود نیست.</td></tr>`;

  return `
    <table class="sheet-table">
      <colgroup>${colMarkup}</colgroup>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function buildSignatureBlocks(type, siteSettings = null, report = {}) {
  const firstRow = Array.isArray(report?.rows) && report.rows.length ? report.rows[0] : {};
  const schoolSignature = normalizeText(siteSettings?.signatureName) || 'مدیر مکتب';

  if (type === 'exam') {
    return [
      { role: 'امضاء ممتحن', name: normalizeText(firstRow.teacherName || 'استاد مضمون') },
      { role: 'امضاء ممیز', name: normalizeText(firstRow.reviewedByName || '') || schoolSignature }
    ];
  }

  if (type === 'finance') {
    return [
      { role: 'مسئول مالی', name: 'واحد مالی' },
      { role: 'مدیر', name: schoolSignature }
    ];
  }

  if (type === 'attendance' || type === 'attendance_summary') {
    return [
      { role: 'مسئول حاضری', name: 'مدیریت حاضری' },
      { role: 'مدیر', name: schoolSignature }
    ];
  }

  if (type === 'subjects') {
    const teacherNames = collectUniqueTextValues(report?.rows, 'teacherName');
    return [
      { role: 'ترتیب‌کننده', name: teacherNames.length === 1 ? teacherNames[0] : 'بخش آموزشی' },
      { role: 'ممیز', name: schoolSignature }
    ];
  }

  return [
    { role: 'ترتیب‌کننده', name: normalizeText(firstRow.teacherName || '') || 'بخش آموزشی' },
    { role: 'تاییدکننده', name: schoolSignature }
  ];
}

function shouldRenderSummary(type = '') {
  return type !== 'subjects' && type !== 'exam';
}

function buildFormalNote(type = '', report = {}) {
  if (type === 'exam') {
    const firstRow = Array.isArray(report?.rows) && report.rows.length ? report.rows[0] : {};
    const summary = report?.summary || {};
    return `قرار شرح فوق نمرات امتحان ${normalizeText(report?.report?.title || '') || 'ماهوار'} مضمون (${normalizeText(firstRow.subject || '')}) از صنف (${normalizeText(firstRow.classTitle || '')}) به تعداد دانه (${String(summary.totalStudents || 0)}) شاگرد ثبت گردیده است که شامل کامیاب (${String(summary.passedMarks || 0)})، مشروط (${String(summary.conditionalMarks || 0)})، معذور (${String(summary.excusedMarks || 0)}) و غایب (${String(summary.absentMarks || 0)}) می‌باشد. درج این شقه بدون قلم‌خوردگی و تراشیدگی صحیح است.`;
  }
  if (type === 'subjects') {
    return 'این شقه مضامین به اساس مضامین و تعیینات ثبت‌شده برای صنف ترتیب و جهت تایید ارایه گردید.';
  }
  return '';
}

function renderExamSheetPrintHtml({ report = {}, title = '', subtitle = '', metadata = [], signatures = [], formalNote = '', footerText = '', logoUrl = '' } = {}) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const infoMap = new Map(metadata);
  const schoolLine = escapeHtml(subtitle || 'لیسه خصوصی مدیر');
  const logoMarkup = logoUrl ? `<img class="exam-sheet-logo" src="${escapeHtml(logoUrl)}" alt="School Logo" />` : '<div class="exam-sheet-logo exam-sheet-logo--empty"></div>';
  return `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${buildPersianFontFaceCss()}
      @page { size: A4 portrait; margin: 18mm 12mm 16mm 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: 'B Zar', 'B Mitra', Tahoma, Arial, sans-serif; color: #111827; background: #fff; direction: rtl; }
      .exam-sheet-page { width: 100%; margin: 0 auto; }
      .exam-sheet-header { display: grid; grid-template-columns: 96px 1fr 96px; align-items: start; gap: 12px; margin-bottom: 14px; }
      .exam-sheet-logo { width: 88px; height: 88px; object-fit: contain; justify-self: center; }
      .exam-sheet-logo--empty { border: 1px solid #d1d5db; }
      .exam-sheet-center { text-align: center; line-height: 1.7; }
      .exam-sheet-center h1 { margin: 4px 0 0; font-size: 19px; }
      .exam-sheet-center .line { font-size: 15px; }
      .exam-sheet-center .school { font-size: 17px; font-weight: 700; }
      .exam-sheet-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 10px; font-size: 14px; }
      .exam-sheet-meta .stack { display: grid; gap: 6px; }
      .exam-sheet-meta .item strong { font-weight: 700; }
      .exam-sheet-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .exam-sheet-table th, .exam-sheet-table td { border: 1px solid #111; padding: 6px 4px; text-align: center; vertical-align: middle; font-size: 13px; }
      .exam-sheet-table th { font-weight: 700; background: #fff; }
      .exam-sheet-table .group-heading { font-size: 13.5px; }
      .exam-sheet-table td.name-cell { text-align: right; padding-right: 8px; }
      .exam-sheet-note { margin-top: 16px; font-size: 14px; line-height: 2; text-align: right; }
      .exam-sheet-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 28px; font-size: 14px; }
      .exam-sheet-signatures .sig { text-align: center; padding-top: 22px; }
      .exam-sheet-footer { margin-top: 16px; text-align: center; font-size: 11px; color: #6b7280; }
    </style>
  </head>
  <body>
    <main class="exam-sheet-page">
      <section class="exam-sheet-header">
        ${logoMarkup}
        <div class="exam-sheet-center">
          <div class="line">امارت اسلامی افغانستان</div>
          <div class="line">وزارت معارف</div>
          <div class="line">ریاست معارف شهر کابل</div>
          <div class="line">آمریت معارف حوزه سیزدهم تعلیمی</div>
          <div class="school">${schoolLine}</div>
          <h1>${escapeHtml(title || 'شقه امتحان ماهوار')}</h1>
        </div>
        ${logoMarkup}
      </section>

      <section class="exam-sheet-meta">
        <div class="stack">
          <div class="item"><strong>ممتحن:</strong> ${escapeHtml(infoMap.get('ممتحن') || '')}</div>
          <div class="item"><strong>ممیز:</strong> ${escapeHtml(infoMap.get('ممیز') || '')}</div>
          <div class="item"><strong>ماه:</strong> ${escapeHtml(infoMap.get('ماه') || '')}</div>
        </div>
        <div class="stack">
          <div class="item"><strong>مضمون:</strong> ${escapeHtml(infoMap.get('مضمون') || '')}</div>
          <div class="item"><strong>صنف:</strong> ${escapeHtml(infoMap.get('صنف') || '')}</div>
          <div class="item"><strong>تاریخ:</strong> ${escapeHtml(infoMap.get('تاریخ') || '')}</div>
        </div>
      </section>

      <table class="exam-sheet-table">
        <colgroup>
          <col style="width:6%" />
          <col style="width:15%" />
          <col style="width:15%" />
          <col style="width:8%" />
          <col style="width:8%" />
          <col style="width:10%" />
          <col style="width:9%" />
          <col style="width:9%" />
          <col style="width:12%" />
          <col style="width:12%" />
        </colgroup>
        <thead>
          <tr>
            <th rowspan="2">شماره</th>
            <th colspan="2" class="group-heading">شهرت متعلمین</th>
            <th rowspan="2">تحریری</th>
            <th rowspan="2">تقریری</th>
            <th rowspan="2">فعالیت صنفی</th>
            <th rowspan="2">کارخانگی</th>
            <th colspan="2" class="group-heading">مجموعه نمره</th>
            <th rowspan="2">ملاحظات</th>
          </tr>
          <tr>
            <th>نام</th>
            <th>نام پدر</th>
            <th>به عدد</th>
            <th>به حروف</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr>
              <td>${escapeHtml(formatCellValue(row.number))}</td>
              <td class="name-cell">${escapeHtml(formatCellValue(row.studentName))}</td>
              <td class="name-cell">${escapeHtml(formatCellValue(row.fatherName))}</td>
              <td>${escapeHtml(formatCellValue(row.writtenScore))}</td>
              <td>${escapeHtml(formatCellValue(row.oralScore))}</td>
              <td>${escapeHtml(formatCellValue(row.classActivityScore))}</td>
              <td>${escapeHtml(formatCellValue(row.homeworkScore))}</td>
              <td>${escapeHtml(formatCellValue(row.obtainedMark))}</td>
              <td>${escapeHtml(formatCellValue(row.totalInWords))}</td>
              <td>${escapeHtml(formatCellValue(row.note))}</td>
            </tr>
          `).join('') : `
            <tr><td colspan="10">داده‌ای برای نمایش موجود نیست.</td></tr>
          `}
        </tbody>
      </table>

      ${formalNote ? `<div class="exam-sheet-note">${escapeHtml(formalNote)}</div>` : ''}

      <section class="exam-sheet-signatures">
        ${signatures.map((item) => `
          <div class="sig">
            <strong>${escapeHtml(item.role)}</strong>
            <div>${escapeHtml(item.name)}</div>
          </div>
        `).join('')}
      </section>

      ${footerText ? `<footer class="exam-sheet-footer">${escapeHtml(footerText)}</footer>` : ''}
    </main>
  </body>
</html>`;
}

async function loadSiteSettings() {
  if (mongoose.connection.readyState !== 1) return null;
  try {
    return await SiteSettings.findOne({}).sort({ updatedAt: -1 }).lean();
  } catch {
    return null;
  }
}

async function renderReportPrintHtml({ report = {}, template = null } = {}) {
  const layout = getLayout(template);
  const type = inferSheetType(template, report);
  const siteSettings = await loadSiteSettings();
  const metadata = buildMetadata(type, template, report, siteSettings).filter(([, value]) => normalizeText(value));
  const summaryItems = shouldRenderSummary(type) ? buildSummaryItems(report) : '';
  const filterBadges = shouldRenderSummary(type) ? buildFilterBadges(report) : '';
  const formalNote = buildFormalNote(type);
  const title = normalizeText(template?.title) || getDefaultTitleByType(type);
  const subtitle = normalizeText(template?.layout?.headerText) || normalizeText(siteSettings?.brandName) || 'سیستم مدیریت مکتب';
  const footerText = normalizeText(template?.layout?.footerText) || normalizeText(siteSettings?.footerNote);
  const signatures = buildSignatureBlocks(type, siteSettings, report);
  const logoUrl = layout.showLogo ? normalizeText(siteSettings?.logoUrl) : '';

  return `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${buildPersianFontFaceCss()}
      @page { size: A4 ${layout.orientation}; margin: ${layout.margins.top}px ${layout.margins.right}px ${layout.margins.bottom}px ${layout.margins.left}px; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ${escapeHtml(layout.fontFamily)}, 'B Zar', 'B Mitra', Tahoma, Arial, sans-serif;
        font-size: ${Math.max(8, Math.min(32, layout.fontSize))}px;
        color: #10231f;
        background: #f4f1e8;
        direction: rtl;
      }
      .sheet-page {
        max-width: 1120px;
        margin: 0 auto;
        padding: 18px;
        background: linear-gradient(180deg, #faf8f0 0%, #fff 100%);
      }
      .sheet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 16px 18px;
        border: 2px solid #183933;
        border-radius: 18px;
        background: #fff;
      }
      .sheet-header-copy { flex: 1; text-align: center; }
      .sheet-header-copy h1 { margin: 8px 0 6px; font-size: 22px; }
      .sheet-header-copy p { margin: 0; color: #3a504b; }
      .sheet-header-copy .eyebrow { font-size: 12px; letter-spacing: 0.08em; color: #6a5b2d; }
      .sheet-logo {
        width: 72px;
        height: 72px;
        border-radius: 18px;
        border: 1px solid #d9d0bb;
        object-fit: contain;
        background: #fffef8;
        padding: 6px;
      }
      .sheet-title {
        margin: 16px 0 12px;
        padding: 14px 18px;
        border-radius: 16px;
        background: linear-gradient(135deg, #173c35, #8f6b2f);
        color: #fff;
      }
      .sheet-title h2 { margin: 0; font-size: 20px; }
      .sheet-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 10px;
        margin: 14px 0 12px;
      }
      .sheet-meta-item {
        background: #fff;
        border: 1px solid #d8dfdc;
        border-radius: 14px;
        padding: 10px 12px;
      }
      .sheet-meta-item strong {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        color: #546864;
      }
      .sheet-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 10px 0 14px;
      }
      .sheet-filters span {
        padding: 6px 10px;
        border-radius: 999px;
        background: #eee3c9;
        color: #694d1f;
        font-size: 12px;
      }
      .sheet-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
        margin: 12px 0 16px;
      }
      .sheet-summary-item {
        background: #fff;
        border: 1px solid #d8dfdc;
        border-radius: 14px;
        padding: 10px 12px;
      }
      .sheet-summary-item strong {
        display: block;
        margin-bottom: 6px;
        color: #546864;
        font-size: 12px;
      }
      .sheet-summary-item span { font-size: 18px; font-weight: 700; }
      .sheet-table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
        border: 1px solid #163831;
        table-layout: fixed;
      }
      .sheet-table th,
      .sheet-table td {
        border: 1px solid #163831;
        padding: 8px 6px;
        text-align: center;
        vertical-align: middle;
        word-break: break-word;
      }
      .sheet-table th {
        background: #e7efe7;
        color: #173933;
        font-weight: 700;
      }
      .sheet-table tbody tr:nth-child(even) td { background: #fafcfb; }
      .sheet-signatures {
        display: grid;
        grid-template-columns: repeat(2, minmax(180px, 1fr));
        gap: 20px;
        margin-top: 20px;
      }
      .sheet-signature {
        min-height: 92px;
        border-top: 1px dashed #1d3c36;
        padding-top: 12px;
        text-align: center;
      }
      .sheet-signature strong { display: block; margin-bottom: 8px; }
      .sheet-footer {
        margin-top: 16px;
        padding-top: 10px;
        border-top: 1px solid #d2d8d6;
        text-align: center;
        color: #556b66;
        font-size: 12px;
      }
      @media print {
        body { background: #fff; }
        .sheet-page { padding: 0; background: #fff; }
      }
    </style>
  </head>
  <body>
    <main class="sheet-page">
      ${layout.showHeader ? `
        <section class="sheet-header">
          ${logoUrl ? `<img class="sheet-logo" src="${escapeHtml(logoUrl)}" alt="School Logo" />` : '<div class="sheet-logo"></div>'}
          <div class="sheet-header-copy">
            <div class="eyebrow">PRINTABLE SHEET</div>
            <h1>${escapeHtml(subtitle)}</h1>
            <p>${escapeHtml(normalizeText(siteSettings?.brandSubtitle) || normalizeText(report?.report?.description))}</p>
          </div>
          ${logoUrl ? `<img class="sheet-logo" src="${escapeHtml(logoUrl)}" alt="School Logo" />` : '<div class="sheet-logo"></div>'}
        </section>
      ` : ''}

      <section class="sheet-title">
        <h2>${escapeHtml(title)}</h2>
      </section>

      ${metadata.length ? `
        <section class="sheet-meta">
          ${metadata.map(([label, value]) => `
            <div class="sheet-meta-item">
              <strong>${escapeHtml(label)}</strong>
              <span>${escapeHtml(formatCellValue(value))}</span>
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${filterBadges ? `<section class="sheet-filters">${filterBadges}</section>` : ''}
      ${summaryItems ? `<section class="sheet-summary">${summaryItems}</section>` : ''}

      ${buildTableHtml(report)}

      ${formalNote ? `
        <section class="sheet-meta-item" style="margin-top:16px;">
          <span>${escapeHtml(formalNote)}</span>
        </section>
      ` : ''}

      <section class="sheet-signatures">
        ${signatures.map((item) => `
          <div class="sheet-signature">
            <strong>${escapeHtml(item.role)}</strong>
            <span>${escapeHtml(item.name)}</span>
          </div>
        `).join('')}
      </section>

      ${layout.showFooter ? `
        <footer class="sheet-footer">
          ${escapeHtml(footerText || `Generated at ${formatDateValue(report?.generatedAt)}`)}
        </footer>
      ` : ''}
    </main>
  </body>
</html>`;
}

async function renderReportPrintHtml({ report = {}, template = null } = {}) {
  const layout = getLayout(template);
  const type = inferSheetType(template, report);
  const siteSettings = await loadSiteSettings();
  const metadata = buildMetadata(type, template, report, siteSettings).filter(([, value]) => normalizeText(value));
  const summaryItems = shouldRenderSummary(type) ? buildSummaryItems(report) : '';
  const filterBadges = shouldRenderSummary(type) ? buildFilterBadges(report) : '';
  const formalNote = buildFormalNote(type, report);
  const title = normalizeText(template?.title) || getDefaultTitleByType(type);
  const subtitle = normalizeText(template?.layout?.headerText) || normalizeText(siteSettings?.brandName) || 'لیسه خصوصی مدیر';
  const footerText = normalizeText(template?.layout?.footerText) || normalizeText(siteSettings?.footerNote);
  const signatures = buildSignatureBlocks(type, siteSettings, report);
  const logoUrl = layout.showLogo ? normalizeText(siteSettings?.logoUrl) : '';

  if (type === 'exam') {
    return renderExamSheetPrintHtml({
      report,
      title,
      subtitle,
      metadata,
      signatures,
      formalNote,
      footerText,
      logoUrl
    });
  }

  return `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${buildPersianFontFaceCss()}
      @page { size: A4 ${layout.orientation}; margin: ${layout.margins.top}px ${layout.margins.right}px ${layout.margins.bottom}px ${layout.margins.left}px; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ${escapeHtml(layout.fontFamily)}, 'B Zar', 'B Mitra', Tahoma, Arial, sans-serif;
        font-size: ${Math.max(8, Math.min(32, layout.fontSize))}px;
        color: #10231f;
        background: #f4f1e8;
        direction: rtl;
      }
      .sheet-page {
        max-width: 1120px;
        margin: 0 auto;
        padding: 18px;
        background: linear-gradient(180deg, #faf8f0 0%, #fff 100%);
      }
      .sheet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 16px 18px;
        border: 2px solid #183933;
        border-radius: 18px;
        background: #fff;
      }
      .sheet-header-copy { flex: 1; text-align: center; }
      .sheet-header-copy h1 { margin: 8px 0 6px; font-size: 22px; }
      .sheet-header-copy p { margin: 0; color: #3a504b; }
      .sheet-header-copy .eyebrow { font-size: 12px; letter-spacing: 0.08em; color: #6a5b2d; }
      .sheet-logo {
        width: 72px;
        height: 72px;
        border-radius: 18px;
        border: 1px solid #d9d0bb;
        object-fit: contain;
        background: #fffef8;
        padding: 6px;
      }
      .sheet-title {
        margin: 16px 0 12px;
        padding: 14px 18px;
        border-radius: 16px;
        background: linear-gradient(135deg, #173c35, #8f6b2f);
        color: #fff;
      }
      .sheet-title h2 { margin: 0; font-size: 20px; }
      .sheet-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 10px;
        margin: 14px 0 12px;
      }
      .sheet-meta-item {
        background: #fff;
        border: 1px solid #d8dfdc;
        border-radius: 14px;
        padding: 10px 12px;
      }
      .sheet-meta-item strong {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        color: #546864;
      }
      .sheet-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 10px 0 14px;
      }
      .sheet-filters span {
        padding: 6px 10px;
        border-radius: 999px;
        background: #eee3c9;
        color: #694d1f;
        font-size: 12px;
      }
      .sheet-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
        margin: 12px 0 16px;
      }
      .sheet-summary-item {
        background: #fff;
        border: 1px solid #d8dfdc;
        border-radius: 14px;
        padding: 10px 12px;
      }
      .sheet-summary-item strong {
        display: block;
        margin-bottom: 6px;
        color: #546864;
        font-size: 12px;
      }
      .sheet-summary-item span { font-size: 18px; font-weight: 700; }
      .sheet-table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
        border: 1px solid #163831;
        table-layout: fixed;
      }
      .sheet-table th,
      .sheet-table td {
        border: 1px solid #163831;
        padding: 8px 6px;
        text-align: center;
        vertical-align: middle;
        word-break: break-word;
      }
      .sheet-table th {
        background: #e7efe7;
        color: #173933;
        font-weight: 700;
      }
      .sheet-table tbody tr:nth-child(even) td { background: #fafcfb; }
      .sheet-signatures {
        display: grid;
        grid-template-columns: repeat(2, minmax(180px, 1fr));
        gap: 20px;
        margin-top: 20px;
      }
      .sheet-signature {
        min-height: 92px;
        border-top: 1px dashed #1d3c36;
        padding-top: 12px;
        text-align: center;
      }
      .sheet-signature strong { display: block; margin-bottom: 8px; }
      .sheet-footer {
        margin-top: 16px;
        padding-top: 10px;
        border-top: 1px solid #d2d8d6;
        text-align: center;
        color: #556b66;
        font-size: 12px;
      }
      @media print {
        body { background: #fff; }
        .sheet-page { padding: 0; background: #fff; }
      }
    </style>
  </head>
  <body>
    <main class="sheet-page">
      ${layout.showHeader ? `
        <section class="sheet-header">
          ${logoUrl ? `<img class="sheet-logo" src="${escapeHtml(logoUrl)}" alt="School Logo" />` : '<div class="sheet-logo"></div>'}
          <div class="sheet-header-copy">
            <div class="eyebrow">PRINTABLE SHEET</div>
            <h1>${escapeHtml(subtitle)}</h1>
            <p>${escapeHtml(normalizeText(siteSettings?.brandSubtitle) || normalizeText(report?.report?.description))}</p>
          </div>
          ${logoUrl ? `<img class="sheet-logo" src="${escapeHtml(logoUrl)}" alt="School Logo" />` : '<div class="sheet-logo"></div>'}
        </section>
      ` : ''}

      <section class="sheet-title">
        <h2>${escapeHtml(title)}</h2>
      </section>

      ${metadata.length ? `
        <section class="sheet-meta">
          ${metadata.map(([label, value]) => `
            <div class="sheet-meta-item">
              <strong>${escapeHtml(label)}</strong>
              <span>${escapeHtml(formatCellValue(value))}</span>
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${filterBadges ? `<section class="sheet-filters">${filterBadges}</section>` : ''}
      ${summaryItems ? `<section class="sheet-summary">${summaryItems}</section>` : ''}

      ${buildTableHtml(report)}

      ${formalNote ? `
        <section class="sheet-meta-item" style="margin-top:16px;">
          <span>${escapeHtml(formalNote)}</span>
        </section>
      ` : ''}

      <section class="sheet-signatures">
        ${signatures.map((item) => `
          <div class="sheet-signature">
            <strong>${escapeHtml(item.role)}</strong>
            <span>${escapeHtml(item.name)}</span>
          </div>
        `).join('')}
      </section>

      ${layout.showFooter ? `
        <footer class="sheet-footer">
          ${escapeHtml(footerText || `Generated at ${formatDateValue(report?.generatedAt)}`)}
        </footer>
      ` : ''}
    </main>
  </body>
</html>`;
}

module.exports = {
  renderReportPrintHtml
};
