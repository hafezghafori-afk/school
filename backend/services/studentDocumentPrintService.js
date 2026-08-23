const fs = require('fs');
const path = require('path');

const StudentMembership = require('../models/StudentMembership');
const ResultTable = require('../models/ResultTable');
const ResultTableRow = require('../models/ResultTableRow');
const SiteSettings = require('../models/SiteSettings');
const School = require('../models/School');
const { getStudentProfile } = require('./studentProfileService');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const FONT_FILES = [
  { family: 'B Zar', file: 'B Zar_p30download.com.ttf' },
  { family: 'B Mitra', file: 'B Mitra_p30download.com.ttf' }
];

const RESULT_LABELS = {
  passed: 'کامیاب',
  failed: 'ناکام',
  conditional: 'مشروط',
  distinction: 'ممتاز',
  temporary: 'موقت',
  placement: 'تعیین صنف',
  pending: 'ناتکمیل',
  absent: 'غایب',
  excused: 'معذرتی',
  not_applicable: 'شامل نیست'
};

const GRADE_LABELS = Object.freeze({
  1: 'اول', 2: 'دوم', 3: 'سوم', 4: 'چهارم', 5: 'پنجم', 6: 'ششم',
  7: 'هفتم', 8: 'هشتم', 9: 'نهم', 10: 'دهم', 11: 'یازدهم', 12: 'دوازدهم'
});

const faNumber = new Intl.NumberFormat('fa-AF-u-ca-persian');
const faDate = new Intl.DateTimeFormat('fa-AF-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' });

function text(value) {
  return typeof value === 'string' ? value.trim() : (value == null ? '' : String(value).trim());
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function number(value, emptyValue = '-') {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return emptyValue;
  return faNumber.format(Number(value));
}

function percentage(value, emptyValue = '-') {
  const formatted = number(value, emptyValue);
  return formatted === emptyValue ? emptyValue : `${formatted}٪`;
}

function formatDate(value, emptyValue = '-') {
  if (!value) return emptyValue;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyValue;
  try {
    return faDate.format(date);
  } catch {
    return emptyValue;
  }
}

function resultLabel(value) {
  return RESULT_LABELS[text(value)] || text(value) || '-';
}

function classDisplayValue(schoolClass = {}) {
  const grade = GRADE_LABELS[Number(schoolClass?.gradeLevel || 0)] || '';
  const section = text(schoolClass?.section);
  if (grade) return [`صنف ${grade}`, section].filter(Boolean).join(' ');
  return text(schoolClass?.title) || '-';
}

let fontCache = '';
function embeddedFonts() {
  if (fontCache) return fontCache;
  fontCache = FONT_FILES.map(({ family, file }) => {
    const filePath = path.join(PROJECT_ROOT, 'Fonts', file);
    if (!fs.existsSync(filePath)) return '';
    return `@font-face{font-family:'${family}';src:url(data:font/truetype;base64,${fs.readFileSync(filePath).toString('base64')}) format('truetype');font-weight:400;}`;
  }).filter(Boolean).join('\n');
  return fontCache;
}

function documentNumber(prefix, studentId) {
  const tail = text(studentId).replace(/[^a-zA-Z0-9]+/g, '').slice(-8).toUpperCase() || 'DOC';
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${tail}-${datePart}`;
}

// ---- Branding -------------------------------------------------------------

async function loadBranding(schoolId) {
  const [settings, school] = await Promise.all([
    SiteSettings.findOne({}).select('logoUrl schoolLogoUrl brandName').lean(),
    schoolId ? School.findById(schoolId).select('name nameDari district principal').lean() : null
  ]);

  return {
    schoolTitle: text(school?.nameDari) || text(school?.name) || text(settings?.brandName) || 'مکتب',
    schoolLogoUrl: text(settings?.schoolLogoUrl) || text(settings?.logoUrl),
    principalName: text(school?.principal?.name),
    district: text(school?.district)
  };
}

async function loadMembershipSchoolId(membershipId) {
  if (!membershipId) return null;
  const membership = await StudentMembership.findById(membershipId).select('schoolId').lean();
  return membership?.schoolId || null;
}

// ---- Official result lookup ------------------------------------------------

async function loadOfficialYearRow({ academicYearId, classId, membershipId, studentCoreId }) {
  if (!academicYearId || !classId) return null;
  const table = await ResultTable.findOne({
    scopeType: 'class_aggregate',
    academicYearId,
    classId,
    status: { $in: ['generated', 'published'] }
  }).sort({ version: -1, generatedAt: -1 }).lean();
  if (!table) return null;

  const row = await ResultTableRow.findOne({
    tableId: table._id,
    rowType: 'student',
    ...(membershipId ? { studentMembershipId: membershipId } : { studentId: studentCoreId })
  }).lean();
  if (!row) return null;

  return { table, row };
}

// ---- Shared layout ----------------------------------------------------------

function documentShell({ title, bodyHtml, autoPrint = true }) {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title><style>
    ${embeddedFonts()}
    @page{size:A4 portrait;margin:0}*{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#e5e7eb;color:#111;font-family:'B Zar','B Mitra',Tahoma,Arial,sans-serif}
    .doc-page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:14mm 16mm;position:relative;page-break-after:always}
    .doc-page:last-child{page-break-after:auto}
    .doc-frame{position:absolute;inset:7mm;border:1.4mm double #0f172a;pointer-events:none}
    .doc-body{position:relative;z-index:1;height:100%;display:flex;flex-direction:column}
    .doc-header{display:flex;align-items:center;justify-content:space-between;gap:6mm;padding-bottom:4mm;border-bottom:.4mm solid #0f172a}
    .doc-header img{width:20mm;height:20mm;object-fit:contain}
    .doc-header .doc-logo-placeholder{width:20mm;height:20mm}
    .doc-header-titles{flex:1;text-align:center}
    .doc-header-titles .school-title{font-size:16pt;font-weight:700;display:block}
    .doc-header-titles .doc-title{font-size:13pt;font-weight:700;color:#334155;display:block;margin-top:1.5mm}
    .doc-meta-line{display:flex;justify-content:space-between;font-size:9.5pt;color:#475569;margin-top:2mm}
    .doc-content{flex:1;padding:8mm 0}
    .doc-footer{border-top:.3mm solid #cbd5e1;padding-top:4mm;font-size:9pt;color:#64748b;display:flex;justify-content:space-between}
    .signature-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm;margin-top:14mm;text-align:center}
    .signature-row .signature-line{border-top:.3mm solid #334155;padding-top:2mm;font-size:10pt}
    table.doc-table{width:100%;border-collapse:collapse;margin-top:4mm;font-size:9.5pt}
    table.doc-table th,table.doc-table td{border:.3mm solid #94a3b8;padding:1.6mm 2mm;text-align:center}
    table.doc-table thead th{background:#0f172a;color:#fff;font-weight:700}
    .year-block{margin-top:8mm}
    .year-block h3{font-size:11.5pt;margin:0 0 2mm;color:#0f172a;border-right:1.2mm solid #0f172a;padding-right:2mm}
    .year-summary{display:flex;gap:6mm;font-size:9.5pt;color:#334155;margin-top:2mm;flex-wrap:wrap}
    .empty-note{font-size:9.5pt;color:#94a3b8;padding:3mm 0}
    .cert-statement{font-size:12pt;line-height:2.1;text-align:center;margin:10mm 6mm 0}
    .cert-statement strong{font-size:13.5pt}
    .cert-badge{text-align:center;font-size:10.5pt;color:#334155;margin-top:4mm}
    .diploma-page .doc-frame{inset:9mm;border-width:1.8mm}
    .diploma-title{text-align:center;font-size:20pt;font-weight:700;margin-top:6mm;letter-spacing:1mm}
    @media print{html,body{background:#fff}.doc-page{margin:0}}
  </style></head><body>${bodyHtml}${autoPrint ? '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));</script>' : ''}</body></html>`;
}

function headerHtml(branding, docTitle, documentNo) {
  return `<header class="doc-header">
    ${branding.schoolLogoUrl ? `<img src="${escapeHtml(branding.schoolLogoUrl)}" alt="نشان مکتب" />` : '<div class="doc-logo-placeholder"></div>'}
    <div class="doc-header-titles">
      <span class="school-title">${escapeHtml(branding.schoolTitle)}</span>
      <span class="doc-title">${escapeHtml(docTitle)}</span>
    </div>
    <div class="doc-logo-placeholder"></div>
  </header>
  <div class="doc-meta-line"><span>شماره سند: ${escapeHtml(documentNo)}</span><span>تاریخ صدور: ${formatDate(new Date())}</span></div>`;
}

function footerHtml(branding) {
  return `<footer class="doc-footer"><span>${escapeHtml(branding.district ? `${branding.district} - ${branding.schoolTitle}` : branding.schoolTitle)}</span><span>این سند به‌صورت رایانه‌ای صادر شده است.</span></footer>`;
}

function signatureRowHtml(branding) {
  return `<div class="signature-row">
    <div class="signature-line">امضاء و مهر مدیر مکتب${branding.principalName ? `<br/>${escapeHtml(branding.principalName)}` : ''}</div>
    <div class="signature-line">امضاء نگران تعلیمی</div>
    <div class="signature-line">مهر رسمی مکتب</div>
  </div>`;
}

// ---- Membership selection helpers -------------------------------------------

function pickMembership(memberships = [], membershipId = '') {
  if (membershipId) {
    const exact = memberships.find((item) => item.id === String(membershipId));
    if (exact) return exact;
  }
  const current = memberships.find((item) => item.isCurrent);
  if (current) return current;
  return [...memberships].sort((a, b) => new Date(b.enrolledAt || 0) - new Date(a.enrolledAt || 0))[0] || null;
}

function pickHighestGradeMembership(memberships = [], membershipId = '') {
  if (membershipId) {
    const exact = memberships.find((item) => item.id === String(membershipId));
    if (exact) return exact;
  }
  const ranked = [...memberships].sort((a, b) => {
    const gradeDiff = Number(b.schoolClass?.gradeLevel || 0) - Number(a.schoolClass?.gradeLevel || 0);
    if (gradeDiff !== 0) return gradeDiff;
    return new Date(b.enrolledAt || 0) - new Date(a.enrolledAt || 0);
  });
  return ranked[0] || null;
}

function recentAcademicYears(memberships = [], count = 3) {
  const byYear = new Map();
  memberships.forEach((membership) => {
    const year = membership.academicYear;
    if (!year?.id) return;
    const existing = byYear.get(year.id);
    const enrolledAt = new Date(membership.enrolledAt || 0).getTime();
    if (!existing || enrolledAt > existing.rank) {
      byYear.set(year.id, { year, membership, rank: enrolledAt });
    }
  });
  return [...byYear.values()]
    .sort((a, b) => {
      const startDiff = new Date(b.year.startsAt || b.rank || 0) - new Date(a.year.startsAt || a.rank || 0);
      return startDiff;
    })
    .slice(0, count);
}

// ---- Document builders --------------------------------------------------

async function buildCertificateHtml(studentRef, { membershipId = '' } = {}) {
  const profile = await getStudentProfile(studentRef);
  if (!profile) return null;

  const membership = pickMembership(profile.memberships, membershipId);
  const schoolId = await loadMembershipSchoolId(membership?.id);
  const branding = await loadBranding(schoolId);
  const yearRow = membership
    ? await loadOfficialYearRow({
      academicYearId: membership.academicYear?.id,
      classId: membership.schoolClass?.id,
      membershipId: membership.id,
      studentCoreId: profile.identity.id
    })
    : null;

  const docNo = documentNumber('CERT', profile.identity.id);
  const resultText = yearRow?.row?.resultStatus ? resultLabel(yearRow.row.resultStatus) : '';

  const statement = membership
    ? `این است که تصدیق می‌گردد شاگرد <strong>${escapeHtml(profile.identity.fullName)}</strong>${profile.profile?.family?.fatherName ? ` فرزند ${escapeHtml(profile.profile.family.fatherName)}` : ''}${profile.identity.admissionNo ? `، دارای نمبر اساس ${escapeHtml(profile.identity.admissionNo)}` : ''}، در ${escapeHtml(classDisplayValue(membership.schoolClass))} سال تعلیمی <strong>${escapeHtml(membership.academicYear?.label || '-')}</strong> این مکتب مصروف تحصیل بوده${resultText ? ` و با نتیجه <strong>${escapeHtml(resultText)}</strong> این مرحله را تکمیل نموده است` : ''}.`
    : `این است که تصدیق می‌گردد شاگرد <strong>${escapeHtml(profile.identity.fullName)}</strong> در این مکتب راجستر بوده است.`;

  const body = `<section class="doc-page"><div class="doc-frame"></div><div class="doc-body">
    ${headerHtml(branding, 'سرتیفیکیت تحصیلی', docNo)}
    <div class="doc-content">
      <p class="cert-badge">به نام خداوند یکتا</p>
      <p class="cert-statement">${statement}</p>
      <p class="cert-badge">این سرتیفیکیت جهت مقاصد رسمی صادر گردیده است.</p>
      ${signatureRowHtml(branding)}
    </div>
    ${footerHtml(branding)}
  </div></section>`;

  return { html: documentShell({ title: `سرتیفیکیت - ${profile.identity.fullName}`, bodyHtml: body }), documentNo: docNo };
}

async function buildDiplomaHtml(studentRef, { membershipId = '' } = {}) {
  const profile = await getStudentProfile(studentRef);
  if (!profile) return null;

  const membership = pickHighestGradeMembership(profile.memberships, membershipId);
  const schoolId = await loadMembershipSchoolId(membership?.id);
  const branding = await loadBranding(schoolId);
  const yearRow = membership
    ? await loadOfficialYearRow({
      academicYearId: membership.academicYear?.id,
      classId: membership.schoolClass?.id,
      membershipId: membership.id,
      studentCoreId: profile.identity.id
    })
    : null;

  const docNo = documentNumber('DIP', profile.identity.id);
  const resultText = yearRow?.row?.resultStatus ? resultLabel(yearRow.row.resultStatus) : '';

  const statement = membership
    ? `این شهادتنامه به شاگرد <strong>${escapeHtml(profile.identity.fullName)}</strong>${profile.profile?.family?.fatherName ? ` فرزند ${escapeHtml(profile.profile.family.fatherName)}` : ''}${profile.identity.dateOfBirth ? `، متولد ${escapeHtml(formatDate(profile.identity.dateOfBirth))}` : ''}${profile.identity.admissionNo ? `، دارای نمبر اساس ${escapeHtml(profile.identity.admissionNo)}` : ''} اعطا می‌گردد که ${escapeHtml(classDisplayValue(membership.schoolClass))} را در سال تعلیمی <strong>${escapeHtml(membership.academicYear?.label || '-')}</strong>${resultText ? ` با نتیجه <strong>${escapeHtml(resultText)}</strong>` : ''} با موفقیت به پایان رسانیده است.`
    : `این شهادتنامه به شاگرد <strong>${escapeHtml(profile.identity.fullName)}</strong> اعطا می‌گردد.`;

  const body = `<section class="doc-page diploma-page"><div class="doc-frame"></div><div class="doc-body">
    ${headerHtml(branding, '', docNo)}
    <h1 class="diploma-title">شهادتنامه</h1>
    <div class="doc-content">
      <p class="cert-badge">به نام خداوند یکتا</p>
      <p class="cert-statement">${statement}</p>
      ${signatureRowHtml(branding)}
    </div>
    ${footerHtml(branding)}
  </div></section>`;

  return { html: documentShell({ title: `شهادتنامه - ${profile.identity.fullName}`, bodyHtml: body }), documentNo: docNo };
}

async function buildTranscriptHtml(studentRef, { years = 3 } = {}) {
  const profile = await getStudentProfile(studentRef);
  if (!profile) return null;

  const yearCount = Math.max(1, Math.min(10, Number(years) || 3));
  const targetYears = recentAcademicYears(profile.memberships, yearCount);
  const schoolId = targetYears.length ? await loadMembershipSchoolId(targetYears[0].membership.id) : null;
  const branding = await loadBranding(schoolId);
  const docNo = documentNumber('TRX', profile.identity.id);

  const yearRows = await Promise.all(targetYears.map(async ({ year, membership }) => {
    const result = await loadOfficialYearRow({
      academicYearId: year.id,
      classId: membership.schoolClass?.id,
      membershipId: membership.id,
      studentCoreId: profile.identity.id
    });
    return { year, membership, result };
  }));

  const yearBlocksHtml = yearRows.map(({ year, membership, result }) => {
    const subjects = result?.table?.metadata?.subjects || [];
    const subjectCells = result?.row?.cells?.subjects || [];
    const subjectMap = new Map(subjectCells.map((item) => [String(item.subjectId || item.subjectCode || ''), item]));
    const general = result?.row?.cells?.stageTotals?.general || {};

    const rowsHtml = subjects.length
      ? subjects.map((subject) => {
        const cell = subjectMap.get(String(subject.id || subject.code || '')) || {};
        return `<tr><td>${escapeHtml(subject.name || subject.code || '-')}</td><td>${number(cell.annual ?? cell.total)}</td></tr>`;
      }).join('')
      : '';

    const tableHtml = subjects.length
      ? `<table class="doc-table"><thead><tr><th>مضمون</th><th>نمره سالانه</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
      : `<p class="empty-note">نتیجه رسمی این سال هنوز در سیستم ثبت نشده است.</p>`;

    return `<div class="year-block">
      <h3>${escapeHtml(classDisplayValue(membership.schoolClass))} - سال تعلیمی ${escapeHtml(year.label || '-')}</h3>
      ${tableHtml}
      ${result ? `<div class="year-summary">
        <span>مجموع نمرات: ${number(general.obtained)}</span>
        <span>فیصدی: ${percentage(general.percentage)}</span>
        <span>نتیجه: ${escapeHtml(resultLabel(result.row.resultStatus))}</span>
        ${result.row.rank ? `<span>رتبه: ${number(result.row.rank)}</span>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');

  const body = `<section class="doc-page"><div class="doc-frame"></div><div class="doc-body">
    ${headerHtml(branding, `کارنامهٔ تحصیلی ${yearCount} سال اخیر`, docNo)}
    <div class="doc-content">
      <div class="doc-meta-line"><span>نام شاگرد: ${escapeHtml(profile.identity.fullName)}</span><span>نمبر اساس: ${escapeHtml(profile.identity.admissionNo || '-')}</span></div>
      ${yearBlocksHtml || '<p class="empty-note">برای این شاگرد سابقهٔ صنفی ثبت نشده است.</p>'}
      ${signatureRowHtml(branding)}
    </div>
    ${footerHtml(branding)}
  </div></section>`;

  return { html: documentShell({ title: `کارنامهٔ سه‌ساله - ${profile.identity.fullName}`, bodyHtml: body }), documentNo: docNo };
}

module.exports = {
  buildCertificateHtml,
  buildDiplomaHtml,
  buildTranscriptHtml
};
