const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const FONT_FILES = [
  { family: 'B Zar', file: 'B Zar_p30download.com.ttf' },
  { family: 'B Mitra', file: 'B Mitra_p30download.com.ttf' }
];

function text(value) {
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

function embeddedFonts() {
  return FONT_FILES.map(({ family, file }) => {
    const filePath = path.join(PROJECT_ROOT, 'Fonts', file);
    if (!fs.existsSync(filePath)) return '';
    return `@font-face{font-family:'${family}';src:url(data:font/truetype;base64,${fs.readFileSync(filePath).toString('base64')}) format('truetype');font-weight:400;}`;
  }).filter(Boolean).join('\n');
}

function imageMime(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}

function printableAsset(value) {
  const raw = text(value);
  if (!raw || raw.startsWith('data:') || /^https?:\/\//i.test(raw)) return raw;
  const relative = raw.replace(/^\/+/, '');
  if (!relative.startsWith('uploads/')) return raw;
  const uploadRoot = path.resolve(__dirname, '..', 'uploads');
  const filePath = path.resolve(__dirname, '..', relative);
  if (!filePath.startsWith(`${uploadRoot}${path.sep}`) || !fs.existsSync(filePath)) return raw;
  return `data:${imageMime(filePath)};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function number(value, emptyValue = '-') {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return emptyValue;
  return Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(2);
}

function percentage(value, emptyValue = '-') {
  const formatted = number(value, emptyValue);
  return formatted === emptyValue ? emptyValue : `${formatted}٪`;
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

const RESULT_LABELS = {
  passed: 'کامیاب',
  failed: 'ناکام',
  conditional: 'مشروط',
  pending: 'ناتکمیل',
  absent: 'غایب',
  excused: 'معذرتی',
  not_applicable: 'شامل نیست'
};

function resultLabel(value) {
  return RESULT_LABELS[text(value)] || text(value) || '-';
}

function stageMark(subject, stage) {
  const statusKey = stage === 'fourHalf' ? 'fourHalfStatus' : stage === 'annual' ? 'annualStatus' : '';
  const scoreKey = stage === 'fourHalf' ? 'fourHalf' : stage === 'annual' ? 'annual' : 'total';
  const status = statusKey ? text(subject?.[statusKey]) : '';
  if (status === 'absent') return 'غ';
  if (status === 'excused') return 'مع';
  if (status === 'not_applicable' || subject?.applicable === false) return '-';
  return number(subject?.[scoreKey]);
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result.length ? result : [[]];
}

function logoHtml(url, alt) {
  const rawSource = text(url);
  const source = printableAsset(url);
  const trimWhitespaceClass = /iman[_\s-]*logo|(?:^|[/_-])school-logo(?:[/_.-]|$)/i.test(rawSource)
    ? ' trim-wide-whitespace'
    : '';
  return source
    ? `<img class="official-logo${trimWhitespaceClass}" src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" />`
    : '<div class="official-logo placeholder"></div>';
}

function splitDateParts(value) {
  if (Array.isArray(value)) return [...value, '', ''].slice(0, 3).map((part) => text(String(part || '')));
  if (value && typeof value === 'object') {
    return [value.year, value.month, value.day].map((part) => text(String(part || '')));
  }
  const normalized = String(value || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const numeric = normalized.match(/\d+/g) || [];
  return [numeric[0] || '', numeric[1] || '', numeric[2] || ''];
}

const GRADE_LABELS = Object.freeze({
  1: 'اول', 2: 'دوم', 3: 'سوم', 4: 'چهارم', 5: 'پنجم', 6: 'ششم',
  7: 'هفتم', 8: 'هشتم', 9: 'نهم', 10: 'دهم', 11: 'یازدهم', 12: 'دوازدهم'
});

function classDisplayValue(schoolClass = {}) {
  const grade = GRADE_LABELS[Number(schoolClass.gradeLevel || 0)] || '';
  const section = text(schoolClass.section);
  if (grade) return [grade, section].filter(Boolean).join(' ');
  const title = text(schoolClass.titleDari || schoolClass.title).replace(/^صنف\s*/u, '');
  return [title, title && section && !title.includes(section) ? section : ''].filter(Boolean).join(' ') || '-';
}

function districtHeading(value) {
  const normalized = text(value);
  if (!normalized || /^آمریت\b/.test(normalized)) return normalized;
  return `آمریت ${normalized}`;
}

function summaryTable(title, rows) {
  return `<table class="summary-table"><thead><tr><th colspan="2">${escapeHtml(title)}</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${number(value, '0')}</td></tr>`).join('')}</tbody></table>`;
}

function summaryHtml(table) {
  const stats = table.metadata?.stageStatistics || {};
  const fourHalf = stats.fourHalf || {};
  const annual = stats.annual || {};
  const general = stats.general || {};
  return `<div class="summary-pair">
    ${summaryTable('خلص احصائیه چهارنیم ماهه', [
      ['تعداد داخله', fourHalf.enrolled], ['شامل امتحان', fourHalf.participated], ['موفق', fourHalf.passed],
      ['تلاش بیشتر', fourHalf.failed], ['معذرتی', fourHalf.excused], ['غایب', fourHalf.absent], ['محروم', fourHalf.deprived]
    ])}
    ${summaryTable('خلص احصائیه سالانه', [
      ['تعداد داخله', annual.enrolled], ['شامل امتحان', annual.participated], ['ارتقای صنف', general.passed],
      ['تکرار صنف', general.failed], ['مشروط', general.conditional], ['معذرتی', annual.excused], ['محروم', annual.deprived]
    ])}
  </div>`;
}

function headerHtml(table, pageNo, totalPages) {
  const metadata = table.metadata || {};
  const header = metadata.officialHeader || {};
  const schoolClass = metadata.schoolClass || table.schoolClass || {};
  const academicYear = metadata.academicYear || table.academicYear || {};
  const yearTitle = academicYear.title || academicYear.code || '-';
  return `<header class="official-header">
    <div class="header-summary">${summaryHtml(table)}</div>
    <div class="school-logo-block"><span>امضاء سرمعلم:</span>${logoHtml(header.schoolLogoUrl || table.logoUrl, 'نشان مکتب')}</div>
    <div class="header-title">
      <strong>${escapeHtml(header.ministryTitle || 'وزارت معارف')}</strong>
      <b>${escapeHtml(header.directorateTitle || 'ریاست معارف شهر کابل')}</b>
      ${header.districtTitle ? `<span>${escapeHtml(districtHeading(header.districtTitle))}</span>` : ''}
      <span>${escapeHtml(header.schoolTitle || 'مکتب')}</span>
    </div>
    <div class="ministry-logo-block"><span>امضاء نگران:</span>${logoHtml(header.ministryLogoUrl, 'نشان وزارت معارف')}</div>
    <div class="page-block"><span>صفحه: <b>${pageNo} از ${totalPages}</b></span></div>
  </header>
  <div class="academic-meta">
    <span><b>صنف:</b> ${escapeHtml(classDisplayValue(schoolClass))}</span>
    <span><b>سال تعلیمی:</b> ${escapeHtml(yearTitle)}</span>
    <span><b>نگران:</b> ${escapeHtml(metadata.observerName || '')}</span>
  </div>`;
}

function verticalHeading(label) {
  return `<span class="vertical-heading">${escapeHtml(label)}</span>`;
}

function subjectHeaderHtml(subjects) {
  return subjects.map((subject) => `<th rowspan="3" class="subject-heading">${verticalHeading(subject.name || subject.code || '-')}</th>`).join('');
}

function officialColgroup(subjects) {
  return `<colgroup>
    <col class="col-serial" />
    <col class="col-name" /><col class="col-name-en" /><col class="col-family" /><col class="col-family-en" />
    <col class="col-father" /><col class="col-father-en" /><col class="col-grandfather" /><col class="col-asas" /><col class="col-tazkira" />
    <col class="col-date" /><col class="col-date" /><col class="col-date" /><col class="col-date" /><col class="col-date" /><col class="col-date" />
    <col class="col-domicile" /><col class="col-stage" />
    ${subjects.map(() => '<col class="col-subject" />').join('')}
    <col class="col-total" /><col class="col-average" /><col class="col-result" /><col class="col-rank" />
    <col class="col-attendance" /><col class="col-attendance" /><col class="col-attendance" /><col class="col-attendance" /><col class="col-attendance" />
    <col class="col-remarks" /><col class="col-photo" />
  </colgroup>`;
}

function officialTableHead(subjects) {
  return `<thead>
    <tr>
      <th rowspan="3">${verticalHeading('شماره')}</th>
      <th colspan="16" class="group-heading">شهرت</th>
      <th rowspan="3" class="diagonal-heading"><span class="exam-label">امتحانات</span><span class="subject-label">مضامین</span></th>
      ${subjectHeaderHtml(subjects)}
      <th rowspan="3">${verticalHeading('مجموعه نمرات')}</th>
      <th rowspan="3">${verticalHeading('فیصدی نمرات')}</th>
      <th rowspan="3">${verticalHeading('نتیجه')}</th>
      <th rowspan="3">${verticalHeading('درجه')}</th>
      <th colspan="5" class="group-heading">ضوابط حاضری</th>
      <th rowspan="3">${verticalHeading('ملاحظات')}</th>
      <th rowspan="3">عکس</th>
    </tr>
    <tr>
      <th rowspan="2">${verticalHeading('اسم')}</th><th rowspan="2">${verticalHeading('Name')}</th>
      <th rowspan="2">${verticalHeading('تخلص')}</th><th rowspan="2">${verticalHeading('L/Name')}</th>
      <th rowspan="2">${verticalHeading('نام پدر')}</th><th rowspan="2">${verticalHeading('F/Name')}</th>
      <th rowspan="2">${verticalHeading('نام پدرکلان')}</th><th rowspan="2">${verticalHeading('نمر اساس')}</th>
      <th rowspan="2">${verticalHeading('نمر تذکره')}</th>
      <th colspan="3">${verticalHeading('سال تولد شمسی')}</th><th colspan="3">${verticalHeading('سال تولد میلادی')}</th>
      <th rowspan="2">${verticalHeading('سکونت اصلی')}</th>
      <th rowspan="2">${verticalHeading('ایام سال تعلیمی')}</th><th rowspan="2">${verticalHeading('حاضر')}</th>
      <th rowspan="2">${verticalHeading('غیرحاضر')}</th><th rowspan="2">${verticalHeading('مریض')}</th><th rowspan="2">${verticalHeading('رخصت')}</th>
    </tr>
    <tr class="date-parts"><th>${verticalHeading('سال')}</th><th>${verticalHeading('ماه')}</th><th>${verticalHeading('روز')}</th><th>${verticalHeading('سال')}</th><th>${verticalHeading('ماه')}</th><th>${verticalHeading('روز')}</th></tr>
  </thead>`;
}

function photoCell(identity) {
  const source = printableAsset(identity.photoUrl);
  return source ? `<img class="student-photo" src="${escapeHtml(source)}" alt="عکس شاگرد" />` : '<span class="photo-placeholder">عکس</span>';
}

function latinOnly(value) {
  return /[A-Za-z]/.test(text(value)) ? text(value) : '';
}

function nonLatinOnly(value) {
  return /[\u0600-\u06ff]/.test(text(value)) ? text(value) : '';
}

function rowspanCell(value, className = '', emptyValue = '-') {
  const displayed = value === null || value === undefined || value === '' ? emptyValue : value;
  const content = className.split(/\s+/).includes('vertical-value')
    ? `<span class="vertical-cell-text">${escapeHtml(displayed)}</span>`
    : escapeHtml(displayed);
  return `<td rowspan="3" class="${className}">${content}</td>`;
}

function remarksFor(row) {
  if (['active', 'transferred_in'].includes(text(row.membershipStatus))) return text(row.note) === 'فعال' ? '' : text(row.note);
  return text(row.membershipStatusLabel) || text(row.note);
}

function displayedResult(row) {
  return text(row.membershipStatus) === 'suspended' ? 'محروم' : resultLabel(row.resultStatus);
}

function studentRowsHtml(row, subjects) {
  const placeholder = row?._placeholder === true;
  const identity = row.cells?.identity || {};
  const attendance = row.cells?.attendance || {};
  const solar = splitDateParts(identity.dateOfBirthSolarParts || identity.dateOfBirthSolar);
  const gregorian = splitDateParts(identity.dateOfBirthGregorianParts || identity.dateOfBirthGregorian || identity.dateOfBirth);
  const fatherName = text(identity.fatherName);
  const rowSubjects = new Map((row.cells?.subjects || []).map((item) => [String(item.subjectId || item.subjectCode || ''), item]));
  const stages = [
    { key: 'fourHalf', label: 'چهارنیم ماهه', summary: 'fourHalf' },
    { key: 'annual', label: 'سالانه', summary: 'annual' },
    { key: 'general', label: 'نتیجه نهایی', summary: 'general' }
  ];
  return stages.map((stage, index) => {
    const stageSummary = row.cells?.stageTotals?.[stage.summary] || {};
    const marks = subjects.map((subject) => {
      const item = rowSubjects.get(String(subject.id || subject.code || '')) || {};
      return `<td class="mark-cell">${placeholder ? '' : escapeHtml(stageMark(item, stage.key))}</td>`;
    }).join('');
    const identityCell = (value, className = '') => rowspanCell(value, className, placeholder ? '' : '-');
    const identityCells = index === 0 ? `
      ${identityCell(number(row.serialNo, ''), 'serial-cell')}
      ${identityCell(identity.givenName || identity.fullName || row.displayName, 'vertical-value')}
      ${identityCell(identity.givenNameEnglish || (text(identity.fullNameEnglish).split(/\s+/)[0] || ''), 'vertical-value latin-cell')}
      ${identityCell(identity.familyName, 'vertical-value')}
      ${identityCell(identity.familyNameEnglish || (text(identity.fullNameEnglish).split(/\s+/).slice(1).join(' ') || ''), 'vertical-value latin-cell')}
      ${identityCell(nonLatinOnly(fatherName) || fatherName, 'vertical-value')}
      ${identityCell(identity.fatherNameEnglish || latinOnly(fatherName), 'vertical-value latin-cell')}
      ${identityCell(identity.grandfatherName, 'vertical-value')}
      ${identityCell(identity.asasNumber, 'vertical-value')}
      ${identityCell(identity.tazkiraNumber, 'vertical-value')}
      ${solar.map((part) => identityCell(part, 'vertical-value date-cell')).join('')}
      ${gregorian.map((part) => identityCell(part, 'vertical-value date-cell')).join('')}
      ${identityCell(identity.domicile || identity.birthPlace, 'vertical-value domicile-cell')}` : '';
    const summaryCells = index === 0 ? `
      ${rowspanCell(placeholder ? '' : displayedResult(row), 'result-cell', '')}
      ${rowspanCell(placeholder ? '' : number(row.rank), 'rank-cell', '')}
      ${rowspanCell(placeholder ? '' : number(attendance.totalDays || 0, '0'), 'attendance-value', '')}
      ${rowspanCell(placeholder ? '' : number(attendance.present || 0, '0'), 'attendance-value', '')}
      ${rowspanCell(placeholder ? '' : number(attendance.absent || 0, '0'), 'attendance-value', '')}
      ${rowspanCell(placeholder ? '' : number(attendance.sick || 0, '0'), 'attendance-value', '')}
      ${rowspanCell(placeholder ? '' : number(attendance.leave || 0, '0'), 'attendance-value', '')}
      ${rowspanCell(placeholder ? '' : remarksFor(row), 'remarks-cell', '')}
      <td rowspan="3" class="photo-cell">${placeholder ? '' : photoCell(identity)}</td>` : '';
    return `<tr class="student-stage ${placeholder ? 'student-placeholder' : ''} ${index === 0 ? 'student-start' : ''} ${index === 2 ? 'student-end' : ''}">
      ${identityCells}<td class="stage-cell">${escapeHtml(stage.label)}</td>${marks}
      <td class="total-cell">${placeholder ? '' : number(stageSummary.obtained)}</td><td class="average-cell">${placeholder ? '' : percentage(stagePercentage(stageSummary))}</td>
      ${summaryCells}
    </tr>`;
  }).join('');
}

function officialTableHtml(rows, subjects) {
  const columnCount = 29 + subjects.length;
  return `<table class="official-results-table subjects-${subjects.length}">
    ${officialColgroup(subjects)}${officialTableHead(subjects)}
    <tbody>${rows.length ? rows.map((row) => studentRowsHtml(row, subjects)).join('') : `<tr><td colspan="${columnCount}" class="empty">هیچ شاگردی در این نسخه موجود نیست.</td></tr>`}</tbody>
  </table>`;
}

function approvalFooterHtml(table) {
  const defaults = [
    'تأیید مکتب', 'تأیید آمریت حوزه/ولسوالی', 'عضو مسلکی نتایج',
    'تأیید مدیریت عمومی نتایج', 'تأیید ریاست معارف'
  ];
  const configured = Array.isArray(table.metadata?.signatures) ? table.metadata.signatures.filter(text) : [];
  const labels = [...configured, ...defaults].slice(0, 5);
  return `<footer class="approval-footer">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join('')}</footer>`;
}

function genericTable(table) {
  const rows = table.rows || [];
  return `<table class="generic-table"><thead><tr><th>شماره</th><th>نام شاگرد</th><th>نمره</th><th>مجموع</th><th>فیصدی</th><th>نتیجه</th><th>درجه</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${number(row.serialNo)}</td><td>${escapeHtml(row.displayName)}</td><td>${number(row.obtainedMark)}</td><td>${number(row.totalMark)}</td><td>${number(row.percentage)}</td><td>${escapeHtml(resultLabel(row.resultStatus))}</td><td>${number(row.rank)}</td></tr>`).join('')}</tbody></table>`;
}

function renderResultTablePrintHtml(table = {}, { autoPrint = false } = {}) {
  const metadata = table.metadata || {};
  const official = table.scopeType === 'class_aggregate' || metadata.layoutKind === 'official_class_results';
  const subjects = metadata.subjects || table.rows?.[0]?.cells?.subjects?.map((item) => ({ id: item.subjectId, code: item.subjectCode, name: item.subjectName })) || [];
  const perPage = Math.max(1, Number(metadata.studentsPerPage || 3));
  const pages = official ? chunks((table.rows || []).filter((row) => row.rowType === 'student'), perPage) : [table.rows || []];
  const pageHtml = pages.map((rows, index) => {
    const pageRows = [...rows];
    while (official && pageRows.length < perPage) {
      pageRows.push({ _placeholder: true, serialNo: (index * perPage) + pageRows.length + 1, cells: {} });
    }
    return `<section class="print-page">
    ${official ? headerHtml(table, index + 1, pages.length) : ''}
    <main>${official ? officialTableHtml(pageRows, subjects) : genericTable({ ...table, rows })}</main>
    ${official ? approvalFooterHtml(table) : ''}
  </section>`;
  }).join('');
  const fontSize = Math.max(10, Math.min(14, Number(table.config?.fontSize || 10)));
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/><title>${escapeHtml(table.title || 'جدول نتایج')}</title><style>
    ${embeddedFonts()}
    @page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#e5e7eb;color:#111;font-family:'B Zar','B Mitra',Tahoma,Arial,sans-serif;font-size:${fontSize}px}
    .print-page{width:297mm;min-height:210mm;margin:0 auto 7mm;background:#fff;padding:3mm 4mm 2.5mm;display:flex;flex-direction:column;page-break-after:always;break-after:page}.print-page:last-child{page-break-after:auto;break-after:auto}
    .official-header{direction:ltr;display:grid;grid-template-columns:76mm 27mm minmax(62mm,1fr) 27mm 76mm;grid-template-areas:'summary school title ministry page';align-items:stretch;gap:1mm;height:31mm;margin-bottom:.6mm}.official-header>*{direction:rtl}.header-summary{grid-area:summary}.school-logo-block{grid-area:school}.header-title{grid-area:title}.ministry-logo-block{grid-area:ministry}.page-block{grid-area:page}
    .summary-pair{display:grid;grid-template-columns:1fr 1fr;gap:.6mm;height:100%}.summary-table{width:100%;height:100%;border-collapse:collapse;table-layout:fixed;font-size:.9em}.summary-table th,.summary-table td{border:.25mm solid #111;padding:0 .5mm;text-align:center;line-height:1}.summary-table td:first-child{width:72%}.summary-table th{font-weight:700}
    .school-logo-block,.ministry-logo-block{display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;white-space:nowrap}.school-logo-block>span,.ministry-logo-block>span{font-size:1em;align-self:stretch;text-align:right}.official-logo{width:23mm;height:23mm;object-fit:contain}.school-logo-block .official-logo{transform:translateX(28mm)}.school-logo-block .official-logo.trim-wide-whitespace{clip-path:inset(20% 29% 20% 29%);transform:translateX(28mm) scale(1.62)}.ministry-logo-block{transform:translateX(8mm)}.ministry-logo-block .official-logo{transform:translateX(-20mm)}.official-logo.placeholder{display:block}.header-title{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1.08;transform:translateX(8mm)}.header-title strong{font-size:1.75em}.header-title b{font-size:1.6em}.header-title span{font-size:1.28em;font-weight:700}.page-block{display:flex;justify-content:flex-start;align-items:flex-start;padding:1mm 0;font-size:1.12em;white-space:nowrap}.page-block b{font-weight:400}
    .academic-meta{width:142mm;margin-right:0;margin-left:auto;border:.3mm solid #111;border-bottom:0;display:grid;grid-template-columns:.75fr 1.1fr 1fr;text-align:center;height:5mm;line-height:4.5mm;white-space:nowrap;font-size:1.1em}
    main{flex:0 0 auto;display:flex;align-items:flex-start}.official-results-table,.generic-table{width:100%;border-collapse:collapse;table-layout:fixed}.official-results-table th,.official-results-table td,.generic-table th,.generic-table td{border:.28mm solid #111;padding:.25mm;text-align:center;vertical-align:middle;line-height:1.02;overflow:hidden}.official-results-table thead th{font-weight:700}.official-results-table thead tr:first-child{height:4.6mm}.official-results-table thead tr:nth-child(2){height:17mm}.official-results-table thead tr:nth-child(3){height:5mm}.group-heading{font-size:1.08em}.vertical-heading,.vertical-cell-text{display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg);margin:auto;line-height:1;white-space:nowrap}.subject-heading .vertical-heading{max-height:16mm}.vertical-cell-text{max-height:37mm}.vertical-value{padding:.3mm .1mm!important}.latin-cell .vertical-cell-text{direction:ltr;unicode-bidi:isolate}.diagonal-heading{position:relative;background:linear-gradient(to top right,transparent 49.2%,#111 49.5%,#111 50.5%,transparent 50.8%);min-width:14mm}.diagonal-heading .exam-label{position:absolute;top:1.5mm;right:1mm;font-size:.82em}.diagonal-heading .subject-label{position:absolute;bottom:1.2mm;left:1mm;font-size:.86em}.date-parts th{font-size:.72em;font-weight:400}
    .col-serial{width:5mm}.col-name{width:8mm}.col-name-en{width:9mm}.col-family{width:8mm}.col-family-en{width:9mm}.col-father{width:8mm}.col-father-en{width:9mm}.col-grandfather{width:8mm}.col-asas{width:7mm}.col-tazkira{width:10mm}.col-date{width:4.4mm}.col-domicile{width:8mm}.col-stage{width:15mm}.col-total{width:7.5mm}.col-average{width:7mm}.col-result{width:8mm}.col-rank{width:6mm}.col-attendance{width:6mm}.col-remarks{width:10mm}.col-photo{width:18mm}
    .student-stage{height:13mm}.student-start td{border-top-width:.55mm}.student-end td{border-bottom-width:.55mm}.student-stage td{font-size:.91em}.stage-cell{font-weight:700;white-space:nowrap;font-size:.88em!important}.mark-cell{font-size:1.08em!important;font-weight:700}.total-cell,.average-cell{font-weight:700}.serial-cell,.result-cell,.rank-cell{font-size:1.08em!important}.latin-cell{direction:ltr;font-family:Arial,Tahoma,sans-serif;font-size:.8em!important;overflow-wrap:anywhere}.date-cell{font-size:.83em!important}.domicile-cell{overflow-wrap:anywhere}.attendance-value{font-size:.95em!important}.remarks-cell{font-weight:700;overflow-wrap:anywhere}.photo-cell{padding:.4mm!important}.student-photo{width:100%;height:37mm;object-fit:cover;display:block}.photo-placeholder{display:flex;height:37mm;align-items:center;justify-content:center}.empty{padding:10mm!important}.approval-footer{display:grid;grid-template-columns:repeat(5,1fr);gap:2mm;height:7mm;margin-top:1mm;align-items:end;text-align:center;font-size:1em}.approval-footer span{white-space:nowrap}.generic-table th,.generic-table td{padding:1.5mm}.generic-table th{background:#f3f4f6}
    .subjects-18 th,.subjects-18 td{font-size:.82em}.subjects-19 th,.subjects-19 td,.subjects-20 th,.subjects-20 td{font-size:.76em}
    @media print{html,body{background:#fff}.print-page{margin:0}}
  </style></head><body>${pageHtml}${autoPrint ? '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));</script>' : ''}</body></html>`;
}

module.exports = {
  renderResultTablePrintHtml
};
