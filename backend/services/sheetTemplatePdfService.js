const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');

const SiteSettings = require('../models/SiteSettings');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const FONTS_DIR = path.join(PROJECT_ROOT, 'Fonts');
const DEFAULT_FONT_PATH = path.join(FONTS_DIR, 'B Zar_p30download.com.ttf');
const PERSIAN_FONT_PRIORITY = [
  'B Zar',
  'B Mitra',
  'B Nazanin',
  'B Lotus',
  'B Roya',
  'B Yekan',
  'Tahoma',
  'Arial Unicode MS',
  'Arial',
  'Calibri',
  'Segoe UI'
];
const SYSTEM_FONT_CANDIDATES = [
  path.join(process.env.SystemRoot || 'C:\\Windows', 'Fonts', 'tahoma.ttf'),
  path.join(process.env.SystemRoot || 'C:\\Windows', 'Fonts', 'tahomabd.ttf'),
  path.join(process.env.SystemRoot || 'C:\\Windows', 'Fonts', 'ARIALUNI.TTF'),
  path.join(process.env.SystemRoot || 'C:\\Windows', 'Fonts', 'arial.ttf'),
  path.join(process.env.SystemRoot || 'C:\\Windows', 'Fonts', 'calibri.ttf'),
  path.join(process.env.SystemRoot || 'C:\\Windows', 'Fonts', 'segoeui.ttf'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
  '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf'
];
const FONT_DISPLAY_ALIASES = new Map([
  ['bzar', ['bzar', 'bzarp30downloadcom', 'zar']],
  ['bmitra', ['bmitra', 'bmitrap30downloadcom', 'mitra']],
  ['bnazanin', ['bnazanin', 'bnazaninp30downloadcom', 'nazanin']],
  ['blotus', ['blotus', 'blotusp30downloadcom', 'lotus']],
  ['broya', ['broya', 'broyap30downloadcom', 'roya']],
  ['byekan', ['byekan', 'byekanp30downloadcom', 'yekan']],
  ['tahoma', ['tahoma', 'tahomabd']],
  ['arialunicodems', ['arialuni', 'arialunicodems']],
  ['arial', ['arial']],
  ['calibri', ['calibri']],
  ['segoeui', ['segoeui']]
]);

const faNumber = new Intl.NumberFormat('fa-AF-u-ca-persian', {
  maximumFractionDigits: 2
});

const faDate = new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

const ARABIC_SHAPING = {
  '\u0622': { isolated: '\uFE81', final: '\uFE82', joinsPrevious: true, joinsNext: false },
  '\u0623': { isolated: '\uFE83', final: '\uFE84', joinsPrevious: true, joinsNext: false },
  '\u0625': { isolated: '\uFE87', final: '\uFE88', joinsPrevious: true, joinsNext: false },
  '\u0627': { isolated: '\uFE8D', final: '\uFE8E', joinsPrevious: true, joinsNext: false },
  '\u0628': { isolated: '\uFE8F', final: '\uFE90', initial: '\uFE91', medial: '\uFE92', joinsPrevious: true, joinsNext: true },
  '\u0629': { isolated: '\uFE93', final: '\uFE94', joinsPrevious: true, joinsNext: false },
  '\u062A': { isolated: '\uFE95', final: '\uFE96', initial: '\uFE97', medial: '\uFE98', joinsPrevious: true, joinsNext: true },
  '\u062B': { isolated: '\uFE99', final: '\uFE9A', initial: '\uFE9B', medial: '\uFE9C', joinsPrevious: true, joinsNext: true },
  '\u062C': { isolated: '\uFE9D', final: '\uFE9E', initial: '\uFE9F', medial: '\uFEA0', joinsPrevious: true, joinsNext: true },
  '\u062D': { isolated: '\uFEA1', final: '\uFEA2', initial: '\uFEA3', medial: '\uFEA4', joinsPrevious: true, joinsNext: true },
  '\u062E': { isolated: '\uFEA5', final: '\uFEA6', initial: '\uFEA7', medial: '\uFEA8', joinsPrevious: true, joinsNext: true },
  '\u062F': { isolated: '\uFEA9', final: '\uFEAA', joinsPrevious: true, joinsNext: false },
  '\u0630': { isolated: '\uFEAB', final: '\uFEAC', joinsPrevious: true, joinsNext: false },
  '\u0631': { isolated: '\uFEAD', final: '\uFEAE', joinsPrevious: true, joinsNext: false },
  '\u0632': { isolated: '\uFEAF', final: '\uFEB0', joinsPrevious: true, joinsNext: false },
  '\u0698': { isolated: '\uFB8A', final: '\uFB8B', joinsPrevious: true, joinsNext: false },
  '\u0633': { isolated: '\uFEB1', final: '\uFEB2', initial: '\uFEB3', medial: '\uFEB4', joinsPrevious: true, joinsNext: true },
  '\u0634': { isolated: '\uFEB5', final: '\uFEB6', initial: '\uFEB7', medial: '\uFEB8', joinsPrevious: true, joinsNext: true },
  '\u0635': { isolated: '\uFEB9', final: '\uFEBA', initial: '\uFEBB', medial: '\uFEBC', joinsPrevious: true, joinsNext: true },
  '\u0636': { isolated: '\uFEBD', final: '\uFEBE', initial: '\uFEBF', medial: '\uFEC0', joinsPrevious: true, joinsNext: true },
  '\u0637': { isolated: '\uFEC1', final: '\uFEC2', initial: '\uFEC3', medial: '\uFEC4', joinsPrevious: true, joinsNext: true },
  '\u0638': { isolated: '\uFEC5', final: '\uFEC6', initial: '\uFEC7', medial: '\uFEC8', joinsPrevious: true, joinsNext: true },
  '\u0639': { isolated: '\uFEC9', final: '\uFECA', initial: '\uFECB', medial: '\uFECC', joinsPrevious: true, joinsNext: true },
  '\u063A': { isolated: '\uFECD', final: '\uFECE', initial: '\uFECF', medial: '\uFED0', joinsPrevious: true, joinsNext: true },
  '\u0641': { isolated: '\uFED1', final: '\uFED2', initial: '\uFED3', medial: '\uFED4', joinsPrevious: true, joinsNext: true },
  '\u0642': { isolated: '\uFED5', final: '\uFED6', initial: '\uFED7', medial: '\uFED8', joinsPrevious: true, joinsNext: true },
  '\u0643': { isolated: '\uFED9', final: '\uFEDA', initial: '\uFEDB', medial: '\uFEDC', joinsPrevious: true, joinsNext: true },
  '\u0644': { isolated: '\uFEDD', final: '\uFEDE', initial: '\uFEDF', medial: '\uFEE0', joinsPrevious: true, joinsNext: true },
  '\u0645': { isolated: '\uFEE1', final: '\uFEE2', initial: '\uFEE3', medial: '\uFEE4', joinsPrevious: true, joinsNext: true },
  '\u0646': { isolated: '\uFEE5', final: '\uFEE6', initial: '\uFEE7', medial: '\uFEE8', joinsPrevious: true, joinsNext: true },
  '\u0647': { isolated: '\uFEE9', final: '\uFEEA', initial: '\uFEEB', medial: '\uFEEC', joinsPrevious: true, joinsNext: true },
  '\u0648': { isolated: '\uFEED', final: '\uFEEE', joinsPrevious: true, joinsNext: false },
  '\u0649': { isolated: '\uFEEF', final: '\uFEF0', joinsPrevious: true, joinsNext: false },
  '\u064A': { isolated: '\uFEF1', final: '\uFEF2', initial: '\uFEF3', medial: '\uFEF4', joinsPrevious: true, joinsNext: true },
  '\u067E': { isolated: '\uFB56', final: '\uFB57', initial: '\uFB58', medial: '\uFB59', joinsPrevious: true, joinsNext: true },
  '\u0686': { isolated: '\uFB7A', final: '\uFB7B', initial: '\uFB7C', medial: '\uFB7D', joinsPrevious: true, joinsNext: true },
  '\u06A9': { isolated: '\uFB8E', final: '\uFB8F', initial: '\uFB90', medial: '\uFB91', joinsPrevious: true, joinsNext: true },
  '\u06AF': { isolated: '\uFB92', final: '\uFB93', initial: '\uFB94', medial: '\uFB95', joinsPrevious: true, joinsNext: true },
  '\u06CC': { isolated: '\uFBFC', final: '\uFBFD', initial: '\uFBFE', medial: '\uFBFF', joinsPrevious: true, joinsNext: true }
};

let cachedFontFiles = null;
const safeFontCache = new Map();

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeFontKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '');
}

function containsArabic(value = '') {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u.test(String(value || ''));
}

function isPunctuation(char = '') {
  return /[.,:;!?%()[\]{}<>"'`\\/\-_=+~\u060C\u061B\u061F]/u.test(char);
}

function splitAffixes(token = '') {
  const chars = [...String(token || '')];
  let start = 0;
  let end = chars.length;
  while (start < end && isPunctuation(chars[start])) start += 1;
  while (end > start && isPunctuation(chars[end - 1])) end -= 1;
  return {
    prefix: chars.slice(0, start).join(''),
    core: chars.slice(start, end).join(''),
    suffix: chars.slice(end).join('')
  };
}

function shapeArabicWord(word = '') {
  const chars = [...String(word || '')];
  const shaped = chars.map((char, index) => {
    const spec = ARABIC_SHAPING[char];
    if (!spec) return char;

    const previousSpec = ARABIC_SHAPING[chars[index - 1]];
    const nextSpec = ARABIC_SHAPING[chars[index + 1]];
    const joinsPrevious = Boolean(previousSpec?.joinsNext && spec.joinsPrevious);
    const joinsNext = Boolean(spec.joinsNext && nextSpec?.joinsPrevious);

    if (joinsPrevious && joinsNext && spec.medial) return spec.medial;
    if (joinsPrevious && spec.final) return spec.final;
    if (joinsNext && spec.initial) return spec.initial;
    return spec.isolated || char;
  });

  return shaped.reverse().join('');
}

function shapeRtlToken(token = '') {
  if (!containsArabic(token)) return token;
  const { prefix, core, suffix } = splitAffixes(token);
  if (!core) return token;
  return `${suffix}${shapeArabicWord(core)}${prefix}`;
}

function prepareRtlText(value) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n');
}

function humanizeKey(value = '') {
  const text = normalizeText(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getColumnLabel(column = {}) {
  return normalizeText(column.label) || humanizeKey(column.key || 'value') || 'Value';
}

function looksLikeDateString(value = '') {
  return /^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/u.test(String(value || '').trim());
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value == null ? '' : value);
  return faNumber.format(numeric);
}

function formatDateValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeText(value);
  try {
    return faDate.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function formatCellValue(value) {
  if (value == null) return '';
  if (typeof value === 'number') return formatNumber(value);
  if (value instanceof Date) return formatDateValue(value);
  if (typeof value === 'boolean') return value ? '\u0628\u0644\u06CC' : '\u062E\u06CC\u0631';
  const text = String(value).trim();
  if (!text) return '';
  return looksLikeDateString(text) ? formatDateValue(text) : text;
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
    fontSize: Math.max(8, Math.min(18, Number(layout.fontSize || 11))),
    orientation: normalizeText(layout.orientation) === 'portrait' ? 'portrait' : 'landscape',
    showHeader: layout.showHeader !== false,
    showFooter: layout.showFooter !== false,
    showLogo: layout.showLogo !== false,
    headerText: normalizeText(layout.headerText),
    footerText: normalizeText(layout.footerText),
    margins: {
      top: Math.max(20, Number(margins.top || 28)),
      right: Math.max(20, Number(margins.right || 28)),
      bottom: Math.max(20, Number(margins.bottom || 28)),
      left: Math.max(20, Number(margins.left || 28))
    }
  };
}

function getDefaultTitleByType(type = '') {
  if (type === 'subjects') return '\u0634\u0642\u0647 \u0645\u0636\u0627\u0645\u06CC\u0646';
  if (type === 'exam') return '\u0634\u0642\u0647 \u0627\u0645\u062A\u062D\u0627\u0646';
  if (type === 'attendance') return '\u0634\u0642\u0647 \u062D\u0627\u0636\u0631\u06CC';
  if (type === 'attendance_summary') return '\u0634\u0642\u0647 \u062E\u0644\u0627\u0635\u0647 \u062D\u0627\u0636\u0631\u06CC';
  if (type === 'finance') return '\u0634\u0642\u0647 \u0645\u0627\u0644\u06CC';
  return '\u0634\u0642\u0647';
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
    ['\u0639\u0646\u0648\u0627\u0646', title],
    ['\u0635\u0646\u0641', normalizeText(firstRow.classTitle || '')],
    ['\u0633\u0627\u0644 \u062A\u0639\u0644\u06CC\u0645\u06CC', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
    ['\u062A\u0631\u0645', normalizeText(firstRow.term || '') || normalizeText(filters.termId)],
    ['\u0645\u0627\u0647', normalizeText(filters.month || template?.filters?.month)],
    ['\u0627\u0632 \u062A\u0627\u0631\u06CC\u062E', formatDateValue(filters.dateFrom)],
    ['\u062A\u0627 \u062A\u0627\u0631\u06CC\u062E', formatDateValue(filters.dateTo)]
  ];

  if (type === 'exam') {
    return [
      ['\u0645\u0636\u0645\u0648\u0646', normalizeText(firstRow.subject || '')],
      ['\u0645\u0645\u062A\u062D\u0646', normalizeText(firstRow.teacherName || '')],
      ['\u0635\u0646\u0641', normalizeText(firstRow.classTitle || '')],
      ['\u062C\u0644\u0633\u0647 \u0627\u0645\u062A\u062D\u0627\u0646', normalizeText(firstRow.sessionTitle || '')],
      ['\u062A\u0627\u0631\u06CC\u062E', formatDateValue(firstRow.heldAt || filters.dateFrom)],
      ['\u0645\u0627\u0647', normalizeText(filters.month || template?.filters?.month)],
      ['\u062A\u0631\u0645', normalizeText(firstRow.term || '') || normalizeText(filters.termId)]
    ];
  }

  if (type === 'subjects') {
    const subjectNames = collectUniqueTextValues(report?.rows, 'subjectName');
    const teacherNames = collectUniqueTextValues(report?.rows, 'teacherName');
    const subjectLabel = subjectNames.length === 1
      ? subjectNames[0]
      : `${formatNumber(report?.summary?.uniqueSubjects || subjectNames.length || 0)} \u0645\u0636\u0645\u0648\u0646`;
    const teacherLabel = teacherNames.length === 1
      ? teacherNames[0]
      : `${formatNumber(report?.summary?.uniqueTeachers || teacherNames.length || 0)} \u0627\u0633\u062A\u0627\u062F`;
    return [
      ['\u0645\u0636\u0645\u0648\u0646', subjectLabel],
      ['\u0627\u0633\u062A\u0627\u062F', teacherLabel],
      ['\u0635\u0646\u0641', normalizeText(firstRow.classTitle || '')],
      ['\u0645\u0645\u06CC\u0632', normalizeText(siteSettings?.signatureName) || '\u0645\u062F\u06CC\u0631 \u0645\u06A9\u062A\u0628'],
      ['\u062A\u0627\u0631\u06CC\u062E', formatDateValue(report?.generatedAt || filters.dateTo || filters.dateFrom)],
      ['\u0645\u0627\u0647', normalizeText(filters.month || template?.filters?.month)],
      ['\u062A\u0631\u0645', normalizeText(firstRow.term || '') || normalizeText(filters.termId)],
      ['\u0633\u0627\u0644 \u062A\u0639\u0644\u06CC\u0645\u06CC', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['\u0645\u062C\u0645\u0648\u0639 \u0633\u0627\u0639\u0627\u062A', formatNumber(report?.summary?.totalWeeklyPeriods || 0)]
    ];
  }

  if (type === 'attendance_summary') {
    return [
      ['\u0635\u0646\u0641', normalizeText(firstRow.classTitle || '')],
      ['\u0633\u0627\u0644 \u062A\u0639\u0644\u06CC\u0645\u06CC', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['\u0645\u0627\u0647', normalizeText(filters.month || template?.filters?.month)],
      ['\u062A\u0639\u062F\u0627\u062F \u0645\u062A\u0639\u0644\u0645\u06CC\u0646', formatNumber(report?.summary?.totalStudents || 0)],
      ['\u0645\u062C\u0645\u0648\u0639 \u062B\u0628\u062A\u200C\u0647\u0627', formatNumber(report?.summary?.totalRecords || 0)],
      ['\u0627\u0648\u0633\u0637 \u0641\u06CC\u0635\u062F\u06CC \u062D\u0636\u0648\u0631', formatNumber(report?.summary?.averageAttendanceRate || 0)]
    ];
  }

  if (type === 'attendance') {
    return [
      ['\u0635\u0646\u0641', normalizeText(firstRow.classTitle || '')],
      ['\u0633\u0627\u0644 \u062A\u0639\u0644\u06CC\u0645\u06CC', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['\u0645\u0627\u0647', normalizeText(filters.month || template?.filters?.month)],
      ['\u0627\u0632 \u062A\u0627\u0631\u06CC\u062E', formatDateValue(filters.dateFrom)],
      ['\u062A\u0627 \u062A\u0627\u0631\u06CC\u062E', formatDateValue(filters.dateTo)],
      ['\u062A\u0639\u062F\u0627\u062F \u062B\u0628\u062A\u200C\u0647\u0627', formatNumber(report?.summary?.totalRecords || 0)]
    ];
  }

  if (type === 'finance') {
    return [
      ['\u0635\u0646\u0641', normalizeText(firstRow.classTitle || '')],
      ['\u0633\u0627\u0644 \u062A\u0639\u0644\u06CC\u0645\u06CC', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['\u062A\u0631\u0645', normalizeText(firstRow.term || '') || normalizeText(filters.termId)],
      ['\u0645\u0628\u0644\u063A \u06A9\u0644', formatNumber(report?.summary?.totalDue || 0)],
      ['\u067E\u0631\u062F\u0627\u062E\u062A\u200C\u0634\u062F\u0647', formatNumber(report?.summary?.totalPaidOnOrders || 0)],
      ['\u0628\u0627\u0642\u06CC\u200C\u0645\u0627\u0646\u062F\u0647', formatNumber(report?.summary?.totalOutstanding || 0)]
    ];
  }

  return base.filter(([, value]) => normalizeText(value));
}

function buildSummaryEntries(report = {}) {
  return Object.entries(report?.summary || {})
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .slice(0, 6)
    .map(([key, value]) => ({
      label: humanizeKey(key),
      value: formatCellValue(value)
    }));
}

function buildSignatureBlocks(type, siteSettings = null, report = {}) {
  const firstRow = Array.isArray(report?.rows) && report.rows.length ? report.rows[0] : {};
  const schoolSignature = normalizeText(siteSettings?.signatureName) || '\u0645\u062F\u06CC\u0631 \u0645\u06A9\u062A\u0628';

  if (type === 'exam') {
    return [
      { role: '\u0645\u0645\u062A\u062D\u0646', name: normalizeText(firstRow.teacherName || '\u0627\u0633\u062A\u0627\u062F \u0645\u0636\u0645\u0648\u0646') },
      { role: '\u0645\u0645\u06CC\u0632', name: schoolSignature }
    ];
  }

  if (type === 'finance') {
    return [
      { role: '\u0645\u0633\u0626\u0648\u0644 \u0645\u0627\u0644\u06CC', name: '\u0648\u0627\u062D\u062F \u0645\u0627\u0644\u06CC' },
      { role: '\u0645\u062F\u06CC\u0631', name: schoolSignature }
    ];
  }

  if (type === 'attendance' || type === 'attendance_summary') {
    return [
      { role: '\u0645\u0633\u0626\u0648\u0644 \u062D\u0627\u0636\u0631\u06CC', name: '\u0645\u062F\u06CC\u0631\u06CC\u062A \u062D\u0627\u0636\u0631\u06CC' },
      { role: '\u0645\u062F\u06CC\u0631', name: schoolSignature }
    ];
  }

  if (type === 'subjects') {
    const teacherNames = collectUniqueTextValues(report?.rows, 'teacherName');
    return [
      { role: '\u062A\u0631\u062A\u06CC\u0628\u200C\u06A9\u0646\u0646\u062F\u0647', name: teacherNames.length === 1 ? teacherNames[0] : '\u0628\u062E\u0634 \u0622\u0645\u0648\u0632\u0634\u06CC' },
      { role: '\u0645\u0645\u06CC\u0632', name: schoolSignature }
    ];
  }

  return [
    { role: '\u062A\u0631\u062A\u06CC\u0628\u200C\u06A9\u0646\u0646\u062F\u0647', name: normalizeText(firstRow.teacherName || '') || '\u0628\u062E\u0634 \u0622\u0645\u0648\u0632\u0634\u06CC' },
    { role: '\u062A\u0627\u06CC\u06CC\u062F\u06A9\u0646\u0646\u062F\u0647', name: schoolSignature }
  ];
}

function shouldRenderSummary(type = '') {
  return type !== 'subjects';
}

function buildFormalNote(type = '') {
  if (type === 'subjects') {
    return '\u0627\u06CC\u0646 \u0634\u0642\u0647 \u0645\u0636\u0627\u0645\u06CC\u0646 \u0628\u0647 \u0627\u0633\u0627\u0633 \u0645\u0636\u0627\u0645\u06CC\u0646 \u0648 \u062A\u0639\u06CC\u06CC\u0646\u0627\u062A \u062B\u0628\u062A\u200C\u0634\u062F\u0647 \u0628\u0631\u0627\u06CC \u0635\u0646\u0641 \u062A\u0631\u062A\u06CC\u0628 \u0648 \u062C\u0647\u062A \u062A\u0627\u06CC\u06CC\u062F \u0627\u0631\u0627\u06CC\u0647 \u06AF\u0631\u062F\u06CC\u062F.';
  }
  return '';
}

function listFontFiles() {
  if (cachedFontFiles) return cachedFontFiles;
  try {
    cachedFontFiles = fs.readdirSync(FONTS_DIR)
      .filter((name) => /\.ttf$/i.test(name))
      .map((name) => ({
        name,
        path: path.join(FONTS_DIR, name),
        key: normalizeFontKey(path.parse(name).name)
      }));
  } catch {
    cachedFontFiles = [];
  }
  return cachedFontFiles;
}

function listSystemFontFiles() {
  return SYSTEM_FONT_CANDIDATES
    .filter((fontPath, index, list) => fontPath && list.indexOf(fontPath) === index && fs.existsSync(fontPath))
    .map((fontPath) => ({
      name: path.basename(fontPath),
      path: fontPath,
      key: normalizeFontKey(path.parse(fontPath).name)
    }));
}

function getFontAliases(value = '') {
  const key = normalizeFontKey(value);
  const direct = FONT_DISPLAY_ALIASES.get(key) || [];
  const inferred = [];
  if (key.includes('zar')) inferred.push('bzar', 'zar');
  if (key.includes('mitra')) inferred.push('bmitra', 'mitra');
  if (key.includes('nazanin')) inferred.push('bnazanin', 'nazanin');
  if (key.includes('lotus')) inferred.push('blotus', 'lotus');
  if (key.includes('roya')) inferred.push('broya', 'roya');
  if (key.includes('yekan')) inferred.push('byekan', 'yekan');
  return [key, ...direct, ...inferred].filter(Boolean);
}

function findMatchingFont(fonts = [], aliases = []) {
  for (const alias of aliases.filter(Boolean)) {
    const exact = fonts.find((item) => item.key === alias);
    if (exact) return exact;

    const partial = fonts.find((item) => item.key.includes(alias) || alias.includes(item.key));
    if (partial) return partial;
  }
  return null;
}

function canRenderPersianWithFont(fontPath = '') {
  if (!fontPath || !fs.existsSync(fontPath)) return false;
  if (safeFontCache.has(fontPath)) return safeFontCache.get(fontPath);
  try {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    doc.registerFont('font-check', fontPath);
    doc.font('font-check').fontSize(12);
    doc.heightOfString('شقه رسمی مکتب', { width: 240 });
    doc.end();
    safeFontCache.set(fontPath, true);
    return true;
  } catch {
    safeFontCache.set(fontPath, false);
    return false;
  }
}

function pickSafeFont(fonts = [], aliases = []) {
  const tried = new Set();
  const candidates = [];
  const matched = findMatchingFont(fonts, aliases);
  if (matched) candidates.push(matched);
  candidates.push(...fonts);

  for (const font of candidates) {
    if (!font?.path || tried.has(font.path)) continue;
    tried.add(font.path);
    if (canRenderPersianWithFont(font.path)) return font.path;
  }
  return '';
}

function resolveFontPath(fontFamily = '') {
  const requested = normalizeFontKey(fontFamily);
  const systemFonts = listSystemFontFiles();
  const fonts = listFontFiles();
  const allFonts = [...fonts, ...systemFonts];
  const requestedAliases = getFontAliases(fontFamily);
  const requestedSafe = pickSafeFont(allFonts, requestedAliases);
  if (requestedSafe) return requestedSafe;

  const preferredAliases = PERSIAN_FONT_PRIORITY.flatMap(getFontAliases);
  const preferredSafe = pickSafeFont(allFonts, preferredAliases);
  if (preferredSafe) return preferredSafe;

  return fs.existsSync(DEFAULT_FONT_PATH) ? DEFAULT_FONT_PATH : allFonts[0]?.path || '';
}

function resolveLocalAssetPath(value = '') {
  const source = normalizeText(value);
  if (!source) return '';
  const clean = source.split(/[?#]/u)[0];
  if (/^https?:\/\//i.test(clean)) return '';
  if (path.isAbsolute(clean) && fs.existsSync(clean)) return clean;

  const relative = clean.replace(/^[/\\]+/u, '');
  const candidates = [
    path.join(PROJECT_ROOT, 'backend', relative),
    path.join(PROJECT_ROOT, relative),
    path.join(PROJECT_ROOT, 'frontend', 'public', relative)
  ];

  return candidates.find((item) => fs.existsSync(item)) || '';
}

function pageMetrics(doc, layout) {
  return {
    left: layout.margins.left,
    right: doc.page.width - layout.margins.right,
    top: layout.margins.top,
    bottom: doc.page.height - layout.margins.bottom,
    width: doc.page.width - layout.margins.left - layout.margins.right,
    height: doc.page.height - layout.margins.top - layout.margins.bottom
  };
}

function setFont(doc, size, fontPath = '') {
  if (fontPath) {
    doc.font('sheet-base');
  } else {
    doc.font('Helvetica');
  }
  doc.fontSize(size);
}

function textHeight(doc, text, width, options = {}) {
  return doc.heightOfString(prepareRtlText(formatCellValue(text) || ' '), {
    width,
    align: options.align || 'right',
    lineGap: options.lineGap || 0
  });
}

function writeText(doc, text, x, y, options = {}) {
  return doc.text(prepareRtlText(formatCellValue(text) || ' '), x, y, {
    width: options.width,
    height: options.height,
    align: options.align || 'right',
    lineGap: options.lineGap || 0,
    ellipsis: options.ellipsis || false
  });
}

function drawHeader(doc, context, continuation = false) {
  const { layout, title, subtitle, siteSettings, logoPath, fontPath } = context;
  const box = pageMetrics(doc, layout);
  let y = box.top;

  if (layout.showHeader) {
    doc.save();
    doc.roundedRect(box.left, y, box.width, 82, 14).lineWidth(1.2).stroke('#173933');
    doc.restore();

    const logoSize = logoPath ? 52 : 0;
    if (logoPath) {
      try {
        doc.image(logoPath, box.left + 10, y + 14, { fit: [logoSize, logoSize], align: 'center', valign: 'center' });
        doc.image(logoPath, box.right - logoSize - 10, y + 14, { fit: [logoSize, logoSize], align: 'center', valign: 'center' });
      } catch {
        // Ignore image errors to keep PDF generation resilient.
      }
    }

    setFont(doc, 9, fontPath);
    doc.fillColor('#6B5B2D');
    writeText(doc, continuation ? '\u0627\u062F\u0627\u0645\u0647 \u0634\u0642\u0647 \u0686\u0627\u067E\u06CC' : '\u0641\u0648\u0631\u0645 \u0631\u0633\u0645\u06CC \u0686\u0627\u067E', box.left + 80, y + 8, {
      width: box.width - 160,
      align: 'center'
    });

    setFont(doc, 17, fontPath);
    doc.fillColor('#10231F');
    writeText(doc, subtitle || siteSettings?.brandName || '\u0633\u06CC\u0633\u062A\u0645 \u0645\u062F\u06CC\u0631\u06CC\u062A \u0645\u06A9\u062A\u0628', box.left + 80, y + 24, {
      width: box.width - 160,
      align: 'center'
    });

    setFont(doc, 9.5, fontPath);
    doc.fillColor('#475B57');
    writeText(doc, siteSettings?.brandSubtitle || context.report?.report?.description || 'School Management Platform', box.left + 80, y + 50, {
      width: box.width - 160,
      align: 'center'
    });

    y += 98;
  }

  doc.save();
  doc.roundedRect(box.left, y, box.width, 38, 12).fill('#173C35');
  doc.restore();

  setFont(doc, 15, fontPath);
  doc.fillColor('#FFFFFF');
  writeText(doc, title, box.left + 14, y + 9, {
    width: box.width - 28,
    align: 'center'
  });

  return y + 52;
}

function drawMetadataGrid(doc, context, startY) {
  const { layout, metadata, fontPath } = context;
  if (!metadata.length) return startY;

  const box = pageMetrics(doc, layout);
  const columns = Math.min(3, metadata.length);
  const gap = 10;
  const itemWidth = (box.width - ((columns - 1) * gap)) / columns;
  let y = startY;

  for (let index = 0; index < metadata.length; index += columns) {
    const row = metadata.slice(index, index + columns);
    const heights = row.map(([label, value]) => {
      setFont(doc, 8.5, fontPath);
      const labelHeight = textHeight(doc, label, itemWidth - 18, { align: 'right' });
      setFont(doc, 10.5, fontPath);
      const valueHeight = textHeight(doc, value, itemWidth - 18, { align: 'right' });
      return Math.max(44, 18 + labelHeight + valueHeight);
    });
    const rowHeight = Math.max(...heights);

    row.forEach(([label, value], offset) => {
      const x = box.left + (offset * (itemWidth + gap));
      doc.save();
      doc.roundedRect(x, y, itemWidth, rowHeight, 10).fillAndStroke('#FFFFFF', '#D7E0DC');
      doc.restore();

      setFont(doc, 8.5, fontPath);
      doc.fillColor('#5A6C67');
      writeText(doc, label, x + 9, y + 8, { width: itemWidth - 18, align: 'right' });

      setFont(doc, 10.5, fontPath);
      doc.fillColor('#10231F');
      writeText(doc, value, x + 9, y + 22, { width: itemWidth - 18, align: 'right' });
    });

    y += rowHeight + gap;
  }

  return y;
}

function drawSummaryGrid(doc, context, startY) {
  const { layout, summaryItems, fontPath } = context;
  if (!summaryItems.length) return startY;

  const box = pageMetrics(doc, layout);
  const columns = Math.min(4, summaryItems.length);
  const gap = 10;
  const itemWidth = (box.width - ((columns - 1) * gap)) / columns;
  let y = startY;

  for (let index = 0; index < summaryItems.length; index += columns) {
    const row = summaryItems.slice(index, index + columns);
    const rowHeight = 54;
    row.forEach((item, offset) => {
      const x = box.left + (offset * (itemWidth + gap));
      doc.save();
      doc.roundedRect(x, y, itemWidth, rowHeight, 10).fillAndStroke('#FBFCFB', '#D7E0DC');
      doc.restore();

      setFont(doc, 8.5, fontPath);
      doc.fillColor('#5A6C67');
      writeText(doc, item.label, x + 9, y + 8, { width: itemWidth - 18, align: 'center' });

      setFont(doc, 12, fontPath);
      doc.fillColor('#173933');
      writeText(doc, item.value, x + 9, y + 24, { width: itemWidth - 18, align: 'center' });
    });
    y += rowHeight + gap;
  }

  return y;
}

function buildTableLayout(columns = [], width = 0) {
  const totalWidth = columns.reduce((sum, column) => sum + Math.max(6, Number(column?.width || 16)), 0) || columns.length || 1;
  let cursor = 0;
  const measuredColumns = columns.map((column, index) => {
    const unitWidth = Math.max(6, Number(column?.width || 16));
    const nextWidth = index === columns.length - 1
      ? Math.max(32, width - cursor)
      : Math.max(32, (unitWidth / totalWidth) * width);
    const item = {
      key: column.key,
      label: getColumnLabel(column),
      group: normalizeText(column.group),
      x: cursor,
      width: nextWidth
    };
    cursor += nextWidth;
    return item;
  });

  let rtlCursor = width;
  return measuredColumns.map((column) => {
    rtlCursor -= column.width;
    return {
      ...column,
      x: Math.max(0, rtlCursor)
    };
  });
}

function drawTableHeader(doc, context, columns, y) {
  const { layout, fontPath } = context;
  const box = pageMetrics(doc, layout);
  const tableLayout = buildTableLayout(columns, box.width);
  const hasGroupedColumns = tableLayout.some((column) => column.group);

  setFont(doc, Math.max(8, layout.fontSize - 1), fontPath);
  if (hasGroupedColumns) {
    const topHeight = 24;
    const bottomHeight = tableLayout.reduce((maxHeight, column) => {
      if (!column.group) return maxHeight;
      const height = textHeight(doc, column.label, column.width - 8, { align: 'center' });
      return Math.max(maxHeight, height + 10);
    }, 26);
    const headerHeight = topHeight + bottomHeight;
    const groups = [];

    tableLayout.forEach((column) => {
      const previous = groups[groups.length - 1];
      if (column.group && previous?.group === column.group) {
        previous.columns.push(column);
      } else {
        groups.push({ group: column.group, columns: [column] });
      }
    });

    groups.forEach((group) => {
      const x = box.left + Math.min(...group.columns.map((column) => column.x));
      const width = group.columns.reduce((sum, column) => sum + column.width, 0);

      if (group.group) {
        doc.save();
        doc.rect(x, y, width, topHeight).fillAndStroke('#E6EFEB', '#183933');
        doc.restore();
        doc.fillColor('#173933');
        writeText(doc, group.group, x + 4, y + 5, {
          width: width - 8,
          align: 'center'
        });

        group.columns.forEach((column) => {
          const columnX = box.left + column.x;
          doc.save();
          doc.rect(columnX, y + topHeight, column.width, bottomHeight).fillAndStroke('#F7FAF8', '#183933');
          doc.restore();
          doc.fillColor('#173933');
          writeText(doc, column.label, columnX + 4, y + topHeight + 5, {
            width: column.width - 8,
            align: 'center'
          });
        });
        return;
      }

      const column = group.columns[0];
      doc.save();
      doc.rect(x, y, width, headerHeight).fillAndStroke('#E6EFEB', '#183933');
      doc.restore();
      doc.fillColor('#173933');
      writeText(doc, column.label, x + 4, y + Math.max(5, (headerHeight / 2) - 8), {
        width: width - 8,
        align: 'center'
      });
    });

    return { tableLayout, headerHeight };
  }

  const headerHeight = tableLayout.reduce((maxHeight, column) => {
    const height = textHeight(doc, column.label, column.width - 8, { align: 'center' });
    return Math.max(maxHeight, height + 10);
  }, 28);

  tableLayout.forEach((column) => {
    const x = box.left + column.x;
    doc.save();
    doc.rect(x, y, column.width, headerHeight).fillAndStroke('#E6EFEB', '#183933');
    doc.restore();
    doc.fillColor('#173933');
    writeText(doc, column.label, x + 4, y + 5, {
      width: column.width - 8,
      align: 'center'
    });
  });

  return { tableLayout, headerHeight };
}

function drawTableRow(doc, context, columns, row, y) {
  const { layout, fontPath } = context;
  const box = pageMetrics(doc, layout);
  const tableLayout = buildTableLayout(columns, box.width);

  setFont(doc, Math.max(8, layout.fontSize - 1), fontPath);
  const rowHeight = tableLayout.reduce((maxHeight, column) => {
    const height = textHeight(doc, row?.[column.key] ?? '', column.width - 10, { align: 'center' });
    return Math.max(maxHeight, height + 10);
  }, 26);

  tableLayout.forEach((column) => {
    const x = box.left + column.x;
    doc.save();
    doc.rect(x, y, column.width, rowHeight).stroke('#183933');
    doc.restore();
    doc.fillColor('#10231F');
    writeText(doc, row?.[column.key] ?? '', x + 5, y + 5, {
      width: column.width - 10,
      align: 'center'
    });
  });

  return rowHeight;
}

async function loadSiteSettings() {
  if (mongoose.connection.readyState !== 1) return null;
  try {
    return await SiteSettings.findOne({}).sort({ updatedAt: -1 }).lean();
  } catch {
    return null;
  }
}

function drawSignatures(doc, context, startY) {
  const { layout, signatures, fontPath, siteSettings } = context;
  const box = pageMetrics(doc, layout);
  const gap = 18;
  const itemWidth = (box.width - gap) / 2;
  const signatureImage = resolveLocalAssetPath(siteSettings?.signatureUrl);
  const stampImage = resolveLocalAssetPath(siteSettings?.stampUrl);

  signatures.forEach((item, index) => {
    const x = box.left + (index * (itemWidth + gap));
    doc.save();
    doc.moveTo(x, startY).lineTo(x + itemWidth, startY).dash(4, { space: 3 }).stroke('#183933');
    doc.undash();
    doc.restore();

    if (signatureImage && index === 0) {
      try {
        doc.image(signatureImage, x + 10, startY + 8, { fit: [72, 34] });
      } catch {
        // Ignore signature image failures.
      }
    }

    if (stampImage && index === signatures.length - 1) {
      try {
        doc.image(stampImage, x + itemWidth - 62, startY + 4, { fit: [52, 52] });
      } catch {
        // Ignore stamp image failures.
      }
    }

    setFont(doc, 10, fontPath);
    doc.fillColor('#173933');
    writeText(doc, item.role, x + 6, startY + 18, { width: itemWidth - 12, align: 'center' });

    setFont(doc, 10.5, fontPath);
    doc.fillColor('#10231F');
    writeText(doc, item.name, x + 6, startY + 38, { width: itemWidth - 12, align: 'center' });
  });

  return startY + 68;
}

function drawFooter(doc, context, startY) {
  const { layout, footerText, fontPath, report } = context;
  if (!layout.showFooter) return startY;

  const box = pageMetrics(doc, layout);
  doc.save();
  doc.moveTo(box.left, startY).lineTo(box.right, startY).stroke('#D2DAD6');
  doc.restore();

  setFont(doc, 8.5, fontPath);
  doc.fillColor('#596C66');
  writeText(doc, footerText || `Generated at ${formatDateValue(report?.generatedAt)}`, box.left + 6, startY + 8, {
    width: box.width - 12,
    align: 'center'
  });

  return startY + 28;
}

function drawFormalNote(doc, context, startY) {
  const { layout, formalNote, fontPath } = context;
  if (!formalNote) return startY;

  const box = pageMetrics(doc, layout);
  setFont(doc, 10, fontPath);
  const noteHeight = Math.max(38, textHeight(doc, formalNote, box.width - 24, { align: 'right' }) + 18);

  doc.save();
  doc.roundedRect(box.left, startY, box.width, noteHeight, 10).fillAndStroke('#FCFBF7', '#D7E0DC');
  doc.restore();

  doc.fillColor('#33413E');
  writeText(doc, formalNote, box.left + 12, startY + 9, {
    width: box.width - 24,
    align: 'right'
  });

  return startY + noteHeight;
}

function addPage(doc, context, continuation = false) {
  doc.addPage({
    size: 'A4',
    layout: context.layout.orientation,
    margin: 0
  });
  return drawHeader(doc, context, continuation);
}

async function buildReportPdfBuffer({ report = {}, template = null } = {}) {
  const layout = getLayout(template);
  const type = inferSheetType(template, report);
  const siteSettings = await loadSiteSettings();
  const metadata = buildMetadata(type, template, report, siteSettings).filter(([, value]) => normalizeText(String(value || '')));
  const summaryItems = shouldRenderSummary(type) ? buildSummaryEntries(report) : [];
  const title = normalizeText(template?.title) || getDefaultTitleByType(type);
  const subtitle = normalizeText(template?.layout?.headerText) || normalizeText(siteSettings?.brandName) || '\u0633\u06CC\u0633\u062A\u0645 \u0645\u062F\u06CC\u0631\u06CC\u062A \u0645\u06A9\u062A\u0628';
  const footerText = normalizeText(template?.layout?.footerText) || normalizeText(siteSettings?.footerNote);
  const signatures = buildSignatureBlocks(type, siteSettings, report);
  const formalNote = buildFormalNote(type);
  const logoPath = layout.showLogo ? resolveLocalAssetPath(siteSettings?.logoUrl) : '';
  const fontPath = resolveFontPath(layout.fontFamily);
  const columns = Array.isArray(report?.columns) ? report.columns : [];
  const rows = Array.isArray(report?.rows) ? report.rows : [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: layout.orientation,
      margin: 0,
      info: {
        Title: title,
        Subject: report?.report?.description || 'Sheet export',
        Author: 'School Project',
        Creator: 'School Project Sheet Templates'
      }
    });

    if (fontPath && fs.existsSync(fontPath)) {
      doc.registerFont('sheet-base', fontPath);
    }

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const context = {
      layout,
      type,
      metadata,
      summaryItems,
      siteSettings,
      title,
      subtitle,
      footerText,
      signatures,
      formalNote,
      logoPath,
      fontPath,
      report
    };

    let y = drawHeader(doc, context, false);
    y = drawMetadataGrid(doc, context, y);
    y = drawSummaryGrid(doc, context, y);

    const metrics = pageMetrics(doc, layout);
    const footerReserve = layout.showFooter ? 42 : 20;
    const signatureReserve = 86;

    if (!columns.length) {
      setFont(doc, 11, fontPath);
      doc.fillColor('#64706B');
      writeText(doc, '\u062F\u0627\u062F\u0647\u200C\u0627\u06CC \u0628\u0631\u0627\u06CC \u0646\u0645\u0627\u06CC\u0634 \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A.', metrics.left + 8, y + 10, {
        width: metrics.width - 16,
        align: 'center'
      });
      y += 40;
    } else {
      let headerState = drawTableHeader(doc, context, columns, y);
      y += headerState.headerHeight;

      rows.forEach((row) => {
        const rowHeightPreview = buildTableLayout(columns, metrics.width).reduce((maxHeight, column) => {
          setFont(doc, Math.max(8, layout.fontSize - 1), fontPath);
          const height = textHeight(doc, row?.[column.key] ?? '', column.width - 10, { align: 'center' });
          return Math.max(maxHeight, height + 10);
        }, 26);

        if (y + rowHeightPreview + signatureReserve + footerReserve > metrics.bottom) {
          y = addPage(doc, context, true);
          headerState = drawTableHeader(doc, context, columns, y);
          y += headerState.headerHeight;
        }

        y += drawTableRow(doc, context, columns, row, y);
      });
    }

    if (y + signatureReserve + footerReserve > metrics.bottom) {
      y = addPage(doc, context, true);
    }

    y = drawFormalNote(doc, context, y + 18);
    y = drawSignatures(doc, context, y + 18);
    drawFooter(doc, context, Math.min(y + 8, metrics.bottom - 24));

    doc.end();
  });
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

  return base.filter(([, value]) => normalizeText(value));
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

async function buildReportPdfBuffer({ report = {}, template = null } = {}) {
  const layout = getLayout(template);
  const type = inferSheetType(template, report);
  const siteSettings = await loadSiteSettings();
  const metadata = buildMetadata(type, template, report, siteSettings).filter(([, value]) => normalizeText(String(value || '')));
  const summaryItems = shouldRenderSummary(type) ? buildSummaryEntries(report) : [];
  const title = normalizeText(template?.title) || getDefaultTitleByType(type);
  const subtitle = normalizeText(template?.layout?.headerText) || normalizeText(siteSettings?.brandName) || 'لیسه خصوصی مدیر';
  const footerText = normalizeText(template?.layout?.footerText) || normalizeText(siteSettings?.footerNote);
  const signatures = buildSignatureBlocks(type, siteSettings, report);
  const formalNote = buildFormalNote(type, report);
  const logoPath = layout.showLogo ? resolveLocalAssetPath(siteSettings?.logoUrl) : '';
  const fontPath = resolveFontPath(layout.fontFamily);
  const columns = Array.isArray(report?.columns) ? report.columns : [];
  const rows = Array.isArray(report?.rows) ? report.rows : [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: layout.orientation,
      margin: 0,
      info: {
        Title: title,
        Subject: report?.report?.description || 'Sheet export',
        Author: 'School Project',
        Creator: 'School Project Sheet Templates'
      }
    });

    if (fontPath && fs.existsSync(fontPath)) {
      doc.registerFont('sheet-base', fontPath);
    }

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const context = {
      layout,
      type,
      metadata,
      summaryItems,
      siteSettings,
      title,
      subtitle,
      footerText,
      signatures,
      formalNote,
      logoPath,
      fontPath,
      report
    };

    let y = drawHeader(doc, context, false);
    y = drawMetadataGrid(doc, context, y);
    y = drawSummaryGrid(doc, context, y);

    const metrics = pageMetrics(doc, layout);
    const footerReserve = layout.showFooter ? 42 : 20;
    const signatureReserve = 86;

    if (!columns.length) {
      setFont(doc, 11, fontPath);
      doc.fillColor('#64706B');
      writeText(doc, 'داده‌ای برای نمایش موجود نیست.', metrics.left + 8, y + 10, {
        width: metrics.width - 16,
        align: 'center'
      });
      y += 40;
    } else {
      let headerState = drawTableHeader(doc, context, columns, y);
      y += headerState.headerHeight;

      rows.forEach((row) => {
        const rowHeightPreview = buildTableLayout(columns, metrics.width).reduce((maxHeight, column) => {
          setFont(doc, Math.max(8, layout.fontSize - 1), fontPath);
          const height = textHeight(doc, row?.[column.key] ?? '', column.width - 10, { align: 'center' });
          return Math.max(maxHeight, height + 10);
        }, 26);

        if (y + rowHeightPreview + signatureReserve + footerReserve > metrics.bottom) {
          y = addPage(doc, context, true);
          headerState = drawTableHeader(doc, context, columns, y);
          y += headerState.headerHeight;
        }

        y += drawTableRow(doc, context, columns, row, y);
      });
    }

    if (y + signatureReserve + footerReserve > metrics.bottom) {
      y = addPage(doc, context, true);
    }

    y = drawFormalNote(doc, context, y + 18);
    y = drawSignatures(doc, context, y + 18);
    drawFooter(doc, context, Math.min(y + 8, metrics.bottom - 24));

    doc.end();
  });
}

// Keep the runtime PDF path clean; older duplicated definitions above may contain
// mojibake text, so the exported renderer below uses these safe helpers.
function buildPdfMetadata(type, template = null, report = {}, siteSettings = null) {
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
    const subjectLabel = subjectNames.length === 1
      ? subjectNames[0]
      : `${formatNumber(report?.summary?.uniqueSubjects || subjectNames.length || 0)} مضمون`;
    const teacherLabel = teacherNames.length === 1
      ? teacherNames[0]
      : `${formatNumber(report?.summary?.uniqueTeachers || teacherNames.length || 0)} استاد`;
    return [
      ['مضمون', subjectLabel],
      ['استاد', teacherLabel],
      ['صنف', normalizeText(firstRow.classTitle || '')],
      ['ممیز', normalizeText(siteSettings?.signatureName) || 'مدیر مکتب'],
      ['تاریخ', formatDateValue(report?.generatedAt || filters.dateTo || filters.dateFrom)],
      ['ماه', normalizeText(filters.month || template?.filters?.month)],
      ['ترم', normalizeText(firstRow.term || '') || normalizeText(filters.termId)],
      ['سال تعلیمی', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['مجموع ساعات', formatNumber(report?.summary?.totalWeeklyPeriods || 0)]
    ];
  }

  if (type === 'attendance_summary') {
    return [
      ['صنف', normalizeText(firstRow.classTitle || '')],
      ['سال تعلیمی', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['ماه', normalizeText(filters.month || template?.filters?.month)],
      ['تعداد متعلمین', formatNumber(report?.summary?.totalStudents || 0)],
      ['مجموع ثبت‌ها', formatNumber(report?.summary?.totalRecords || 0)],
      ['اوسط فیصدی حضور', formatNumber(report?.summary?.averageAttendanceRate || 0)]
    ];
  }

  if (type === 'attendance') {
    return [
      ['صنف', normalizeText(firstRow.classTitle || '')],
      ['سال تعلیمی', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['ماه', normalizeText(filters.month || template?.filters?.month)],
      ['از تاریخ', formatDateValue(filters.dateFrom)],
      ['تا تاریخ', formatDateValue(filters.dateTo)],
      ['تعداد ثبت‌ها', formatNumber(report?.summary?.totalRecords || 0)]
    ];
  }

  if (type === 'finance') {
    return [
      ['صنف', normalizeText(firstRow.classTitle || '')],
      ['سال تعلیمی', normalizeText(firstRow.academicYear || '') || normalizeText(filters.academicYearId)],
      ['ترم', normalizeText(firstRow.term || '') || normalizeText(filters.termId)],
      ['مبلغ کل', formatNumber(report?.summary?.totalDue || 0)],
      ['پرداخت‌شده', formatNumber(report?.summary?.totalPaidOnOrders || 0)],
      ['باقی‌مانده', formatNumber(report?.summary?.totalOutstanding || 0)]
    ];
  }

  return base;
}

function buildPdfSignatureBlocks(type, siteSettings = null, report = {}) {
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

function shouldRenderPdfSummary(type = '') {
  return type !== 'subjects' && type !== 'exam';
}

function buildPdfFormalNote(type = '', report = {}) {
  if (type === 'exam') {
    if (!Array.isArray(report?.rows) || !report.rows.length) {
      return 'این شقه امتحان بر اساس فیلترهای انتخاب‌شده تولید شد، اما هنوز نتیجه‌ای برای نمایش ثبت نشده است.';
    }
    const firstRow = report.rows[0] || {};
    const summary = report?.summary || {};
    return `قرار شرح فوق نمرات امتحان ${normalizeText(report?.report?.title || '') || 'ماهوار'} مضمون (${normalizeText(firstRow.subject || '')}) از صنف (${normalizeText(firstRow.classTitle || '')}) به تعداد دانه (${String(summary.totalStudents || 0)}) شاگرد ثبت گردیده است که شامل کامیاب (${String(summary.passedMarks || 0)})، مشروط (${String(summary.conditionalMarks || 0)})، معذور (${String(summary.excusedMarks || 0)}) و غایب (${String(summary.absentMarks || 0)}) می‌باشد. درج این شقه بدون قلم‌خوردگی و تراشیدگی صحیح است.`;
  }
  if (type === 'subjects') {
    return 'این شقه مضامین به اساس مضامین و تعیینات ثبت‌شده برای صنف ترتیب و جهت تایید ارایه گردید.';
  }
  return '';
}

function getNoRowsMessage(type = '') {
  if (type === 'exam') {
    return 'برای این شقه امتحان هنوز نتیجه‌ای با فیلترهای انتخاب‌شده ثبت نشده است. لطفاً جلسه امتحان، صنف یا نتایج ثبت‌شده را بررسی کنید.';
  }
  if (type === 'subjects') {
    return 'برای این صنف هنوز مضمون یا استاد ثبت‌شده برای نمایش در شقه موجود نیست.';
  }
  if (type === 'attendance' || type === 'attendance_summary') {
    return 'برای این فیلترها هنوز حاضری ثبت نشده است.';
  }
  return 'برای این فیلترها هنوز دیتایی ثبت نشده است.';
}

function drawNoRowsTableMessage(doc, context, y, message) {
  const { layout, fontPath } = context;
  const box = pageMetrics(doc, layout);
  const rowHeight = 48;

  doc.save();
  doc.rect(box.left, y, box.width, rowHeight).fillAndStroke('#FFFFFF', '#D4DDD7');
  doc.restore();

  setFont(doc, Math.max(9, layout.fontSize), fontPath);
  doc.fillColor('#5B6B63');
  writeText(doc, message, box.left + 12, y + 13, {
    width: box.width - 24,
    align: 'center'
  });

  return rowHeight;
}

async function buildReportPdfBuffer({ report = {}, template = null } = {}) {
  const layout = getLayout(template);
  const type = inferSheetType(template, report);
  const siteSettings = await loadSiteSettings();
  const metadata = buildPdfMetadata(type, template, report, siteSettings)
    .filter(([, value]) => normalizeText(String(value || '')));
  const summaryItems = shouldRenderPdfSummary(type) ? buildSummaryEntries(report) : [];
  const title = normalizeText(template?.title) || getDefaultTitleByType(type);
  const subtitle = normalizeText(template?.layout?.headerText) || normalizeText(siteSettings?.brandName) || 'لیسه خصوصی مدیر';
  const footerText = normalizeText(template?.layout?.footerText) || normalizeText(siteSettings?.footerNote);
  const signatures = buildPdfSignatureBlocks(type, siteSettings, report);
  const formalNote = buildPdfFormalNote(type, report);
  const logoPath = layout.showLogo ? resolveLocalAssetPath(siteSettings?.logoUrl) : '';
  const fontPath = resolveFontPath(layout.fontFamily);
  const columns = Array.isArray(report?.columns) ? report.columns : [];
  const rows = Array.isArray(report?.rows) ? report.rows : [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: layout.orientation,
      margin: 0,
      info: {
        Title: title,
        Subject: report?.report?.description || 'Sheet export',
        Author: 'School Project',
        Creator: 'School Project Sheet Templates'
      }
    });

    if (fontPath && fs.existsSync(fontPath)) {
      doc.registerFont('sheet-base', fontPath);
    }

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const context = {
      layout,
      type,
      metadata,
      summaryItems,
      siteSettings,
      title,
      subtitle,
      footerText,
      signatures,
      formalNote,
      logoPath,
      fontPath,
      report
    };

    let y = drawHeader(doc, context, false);
    y = drawMetadataGrid(doc, context, y);
    y = drawSummaryGrid(doc, context, y);

    const metrics = pageMetrics(doc, layout);
    const footerReserve = layout.showFooter ? 42 : 20;
    const signatureReserve = 86;

    if (!columns.length) {
      setFont(doc, 11, fontPath);
      doc.fillColor('#64706B');
      writeText(doc, getNoRowsMessage(type), metrics.left + 8, y + 10, {
        width: metrics.width - 16,
        align: 'center'
      });
      y += 42;
    } else {
      let headerState = drawTableHeader(doc, context, columns, y);
      y += headerState.headerHeight;

      if (!rows.length) {
        const messageHeight = 48;
        if (y + messageHeight + signatureReserve + footerReserve > metrics.bottom) {
          y = addPage(doc, context, true);
          headerState = drawTableHeader(doc, context, columns, y);
          y += headerState.headerHeight;
        }
        y += drawNoRowsTableMessage(doc, context, y, getNoRowsMessage(type));
      } else {
        rows.forEach((row) => {
          const rowHeightPreview = buildTableLayout(columns, metrics.width).reduce((maxHeight, column) => {
            setFont(doc, Math.max(8, layout.fontSize - 1), fontPath);
            const height = textHeight(doc, row?.[column.key] ?? '', column.width - 10, { align: 'center' });
            return Math.max(maxHeight, height + 10);
          }, 26);

          if (y + rowHeightPreview + signatureReserve + footerReserve > metrics.bottom) {
            y = addPage(doc, context, true);
            headerState = drawTableHeader(doc, context, columns, y);
            y += headerState.headerHeight;
          }

          y += drawTableRow(doc, context, columns, row, y);
        });
      }
    }

    if (y + signatureReserve + footerReserve > metrics.bottom) {
      y = addPage(doc, context, true);
    }

    y = drawFormalNote(doc, context, y + 18);
    y = drawSignatures(doc, context, y + 18);
    drawFooter(doc, context, Math.min(y + 8, metrics.bottom - 24));

    doc.end();
  });
}

async function buildBrowserReportPdfBuffer({ report = {}, template = null } = {}) {
  let browser = null;
  try {
    const { chromium } = require('playwright');
    const { renderReportPrintHtml } = require('./sheetTemplatePrintService');
    const layout = getLayout(template);
    const html = await renderReportPrintHtml({ report, template });

    browser = await chromium.launch({
      headless: true
    });
    const page = await browser.newPage({
      locale: 'fa-AF'
    });

    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));

    return await page.pdf({
      format: 'A4',
      landscape: layout.orientation === 'landscape',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0'
      }
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = {
  buildReportPdfBuffer: buildBrowserReportPdfBuffer
};
