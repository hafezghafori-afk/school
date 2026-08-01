const ExcelJS = require('exceljs');
const { chromium } = require('playwright');

const { renderResultTablePrintHtml } = require('./resultTablePrintService');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function scalar(value) {
  if (value === null || value === undefined || value === '') return '';
  return Number.isFinite(Number(value)) ? Number(value) : String(value);
}

function percentageScalar(value) {
  const normalized = scalar(value);
  return normalized === '' ? '' : `${normalized}٪`;
}

function stagePercentage(summary = {}) {
  if (summary.percentage !== null && summary.percentage !== undefined && summary.percentage !== '') {
    return Number(summary.percentage);
  }
  const obtained = Number(summary.obtained);
  const possible = Number(summary.possible);
  return Number.isFinite(obtained) && Number.isFinite(possible) && possible > 0
    ? Number(((obtained / possible) * 100).toFixed(2))
    : null;
}

const STATUS_LABELS = {
  passed: 'کامیاب',
  failed: 'ناکام',
  conditional: 'مشروط',
  pending: 'ناتکمیل',
  absent: 'غایب',
  excused: 'معذرتی',
  not_applicable: 'شامل نیست'
};

function resultLabel(value) {
  return STATUS_LABELS[text(value)] || text(value);
}

function stageValue(subject = {}, stage = 'general') {
  const statusKey = stage === 'fourHalf' ? 'fourHalfStatus' : stage === 'annual' ? 'annualStatus' : '';
  const scoreKey = stage === 'fourHalf' ? 'fourHalf' : stage === 'annual' ? 'annual' : 'total';
  const status = statusKey ? text(subject[statusKey]) : '';
  if (status === 'absent') return 'غ';
  if (status === 'excused') return 'مع';
  if (status === 'not_applicable' || subject.applicable === false) return '';
  return scalar(subject[scoreKey]);
}

function displayedResult(row = {}) {
  return text(row.membershipStatus) === 'suspended' ? 'محروم' : resultLabel(row.resultStatus);
}

function remarks(row = {}) {
  if (!['active', 'transferred_in'].includes(text(row.membershipStatus))) {
    return text(row.membershipStatusLabel) || text(row.note);
  }
  return text(row.note) === 'فعال' ? '' : text(row.note);
}

function buildExportMatrix(table = {}) {
  const subjects = table.metadata?.subjects
    || table.rows?.[0]?.cells?.subjects?.map((item) => ({ id: item.subjectId, code: item.subjectCode, name: item.subjectName }))
    || [];
  const headers = [
    'شماره', 'اسم', 'Name', 'تخلص', 'L/Name', 'نام پدر', 'F/Name', 'نام پدرکلان', 'نمر اساس', 'نمر تذکره',
    'سال تولد شمسی', 'سال تولد میلادی', 'سکونت اصلی', 'امتحان/مرحله',
    ...subjects.map((subject) => subject.name || subject.code || '-'),
    'مجموعه نمرات', 'فیصدی نمرات', 'نتیجه', 'درجه', 'ایام سال تعلیمی', 'حاضر', 'غیرحاضر', 'مریض', 'رخصت', 'ملاحظات', 'عکس'
  ];
  const rows = (table.rows || []).filter((row) => row.rowType === 'student').flatMap((row) => {
    const identity = row.cells?.identity || {};
    const attendance = row.cells?.attendance || {};
    const totals = row.cells?.stageTotals || {};
    const subjectMap = new Map((row.cells?.subjects || []).map((item) => [String(item.subjectId || item.subjectCode || ''), item]));
    const stages = [
      { key: 'fourHalf', label: 'چهارنیم ماهه', totals: totals.fourHalf || {} },
      { key: 'annual', label: 'سالانه', totals: totals.annual || {} },
      { key: 'general', label: 'نتیجه نهایی', totals: totals.general || {} }
    ];
    return stages.map((stage, index) => [
      index === 0 ? scalar(row.serialNo) : '',
      index === 0 ? identity.givenName || identity.fullName || row.displayName || '' : '',
      index === 0 ? identity.givenNameEnglish || text(identity.fullNameEnglish).split(/\s+/)[0] || '' : '',
      index === 0 ? identity.familyName || '' : '',
      index === 0 ? identity.familyNameEnglish || text(identity.fullNameEnglish).split(/\s+/).slice(1).join(' ') || '' : '',
      index === 0 ? identity.fatherName || '' : '',
      index === 0 ? identity.fatherNameEnglish || '' : '',
      index === 0 ? identity.grandfatherName || '' : '',
      index === 0 ? identity.asasNumber || '' : '',
      index === 0 ? identity.tazkiraNumber || '' : '',
      index === 0 ? identity.dateOfBirthSolar || '' : '',
      index === 0 ? identity.dateOfBirthGregorian || identity.dateOfBirth || '' : '',
      index === 0 ? identity.domicile || identity.birthPlace || '' : '',
      stage.label,
      ...subjects.map((subject) => stageValue(subjectMap.get(String(subject.id || subject.code || '')) || {}, stage.key)),
      scalar(stage.totals.obtained), percentageScalar(stagePercentage(stage.totals)),
      index === 0 ? displayedResult(row) : '', index === 0 ? scalar(row.rank) : '',
      index === 0 ? scalar(attendance.totalDays) : '', index === 0 ? scalar(attendance.present) : '',
      index === 0 ? scalar(attendance.absent) : '', index === 0 ? scalar(attendance.sick) : '',
      index === 0 ? scalar(attendance.leave) : '', index === 0 ? remarks(row) : '',
      index === 0 ? identity.photoUrl || '' : ''
    ]);
  });
  return { headers, rows, subjectCount: subjects.length, studentBlockSize: 3 };
}

function csvCell(value) {
  const raw = String(value == null ? '' : value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function buildResultTableCsv(table = {}) {
  const matrix = buildExportMatrix(table);
  return `\uFEFF${[matrix.headers, ...matrix.rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

async function buildResultTableXlsxBuffer(table = {}) {
  const matrix = buildExportMatrix(table);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'School Management System';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('نتایج عمومی', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]
  });
  sheet.addRow(matrix.headers);
  matrix.rows.forEach((row) => sheet.addRow(row));
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  headerRow.height = 34;
  sheet.columns.forEach((column, columnIndex) => {
    const index = columnIndex + 1;
    column.width = index === 2 ? 24 : Math.min(22, Math.max(10, ...column.values.slice(1).map((value) => String(value ?? '').length + 2)));
    column.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  const mergeColumns = [
    ...Array.from({ length: 13 }, (_, index) => index + 1),
    ...Array.from({ length: 9 }, (_, index) => matrix.subjectCount + 17 + index)
  ];
  for (let startRow = 2; startRow <= matrix.rows.length + 1; startRow += matrix.studentBlockSize) {
    const endRow = Math.min(startRow + matrix.studentBlockSize - 1, matrix.rows.length + 1);
    mergeColumns.forEach((column) => sheet.mergeCells(startRow, column, endRow, column));
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) sheet.getRow(rowIndex).height = 26;
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: matrix.headers.length } };
  return workbook.xlsx.writeBuffer();
}

async function buildResultTablePdfBuffer(table = {}) {
  const html = renderResultTablePrintHtml(table);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'fa-AF' });
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
    return await page.pdf({
      format: 'A4',
      landscape: table.orientation !== 'portrait',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = {
  buildExportMatrix,
  buildResultTableCsv,
  buildResultTablePdfBuffer,
  buildResultTableXlsxBuffer
};
