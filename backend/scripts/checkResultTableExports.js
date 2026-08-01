const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  buildExportMatrix,
  buildResultTableCsv,
  buildResultTablePdfBuffer,
  buildResultTableXlsxBuffer
} = require('../services/resultTableExportService');
const { renderResultTablePrintHtml } = require('../services/resultTablePrintService');

function subject(subjectId, subjectName, fourHalf, annual) {
  return {
    subjectId,
    subjectName,
    fourHalf,
    annual,
    total: fourHalf + annual,
    fourHalfStatus: 'recorded',
    annualStatus: 'recorded',
    fourHalfPassed: fourHalf >= 16,
    annualPassed: annual >= 40,
    passed: fourHalf >= 16 && annual >= 40 && fourHalf + annual >= 55,
    applicable: true
  };
}

function previewLogo(label, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="46" fill="${color}"/><text x="50" y="58" text-anchor="middle" font-size="24" fill="white">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function row(serialNo, name, scores, overrides = {}) {
  const fourHalfTotal = scores.reduce((sum, item) => sum + item.fourHalf, 0);
  const annualTotal = scores.reduce((sum, item) => sum + item.annual, 0);
  const total = fourHalfTotal + annualTotal;
  return {
    id: `row-${serialNo}`,
    serialNo,
    rowType: 'student',
    displayName: name,
    resultStatus: 'passed',
    membershipStatus: 'active',
    membershipStatusLabel: 'فعال',
    rank: serialNo,
    percentage: total / scores.length,
    cells: {
      identity: {
        fullName: name,
        fullNameEnglish: `Student ${serialNo}`,
        givenName: name.split(' ')[0],
        familyName: name.split(' ').slice(1).join(' '),
        givenNameEnglish: 'Student',
        familyNameEnglish: String(serialNo),
        fatherName: `محمد ${serialNo}`,
        grandfatherName: `عبدالله ${serialNo}`,
        admissionNo: `REG-1405-${serialNo}`,
        asasNumber: `1405-${serialNo}`,
        tazkiraNumber: `TK-${serialNo}`,
        dateOfBirthSolar: `۱۳۹۵/۰${serialNo}/۱۲`,
        dateOfBirthGregorian: `2016/0${serialNo}/31`,
        domicile: 'کابل، افغانستان'
      },
      attendance: { present: 142, absent: serialNo, leave: 2, sick: 1, totalDays: 146 },
      subjects: scores,
      stageTotals: {
        fourHalf: { obtained: fourHalfTotal, average: fourHalfTotal / scores.length, percentage: (fourHalfTotal / (scores.length * 40)) * 100 },
        annual: { obtained: annualTotal, average: annualTotal / scores.length, percentage: (annualTotal / (scores.length * 60)) * 100 },
        general: { obtained: total, average: total / scores.length, percentage: (total / (scores.length * 100)) * 100 }
      }
    },
    ...overrides
  };
}

function sampleTable() {
  const subjects = [
    'تفسیر شریف', 'حدیث', 'فقه', 'اصول فقه', 'اصول حدیث', 'منطق', 'نحو', 'بلاغت', 'علوم قرآنی',
    'عربی', 'پشتو', 'دری', 'انگلیسی', 'ریاضی', 'ساینس', 'اجتماعیات', 'کمپیوتر', 'تهذیب'
  ].map((name, index) => ({
    id: `s${index + 1}`,
    code: `S${index + 1}`,
    name
  }));
  const scores = (offset) => subjects.map((item, index) => subject(item.id, item.name, 25 + ((index + offset) % 8), 45 + ((index + offset) % 10)));
  const rows = [
    row(1, 'احمد حامد', scores(1)),
    row(2, 'فاطمه رحیمی', scores(2)),
    row(3, 'زهرا غزنوی', scores(3)),
    row(4, 'عبدالکریم صدیقی', scores(4), { membershipStatus: 'transferred_out', membershipStatusLabel: 'تبدیل شده', note: 'تبدیل شده' })
  ];
  return {
    id: 'table-preview',
    title: 'جدول رسمی نتایج عمومی صنف دوم',
    code: 'RESULTS-OFFICIAL-PREVIEW',
    scopeType: 'class_aggregate',
    orientation: 'landscape',
    version: 1,
    status: 'generated',
    rowCount: rows.length,
    headerText: 'جدول نتایج عمومی شاگردان',
    footerText: 'قاعدهٔ کامیابی: ۱۶/۴۰، ۴۰/۶۰ و ۵۵/۱۰۰',
    config: { fontSize: 9 },
    metadata: {
      layoutKind: 'official_class_results',
      studentsPerPage: 3,
      officialHeader: {
        countryTitle: 'امارت اسلامی افغانستان',
        ministryTitle: 'وزارت معارف',
        directorateTitle: 'ریاست معارف شهر کابل',
        districtTitle: 'حوزهٔ پنجم تعلیمی',
        schoolTitle: 'مکتب آزمایشی ایمان',
        schoolLogoUrl: previewLogo('م', '#0f766e'),
        ministryLogoUrl: previewLogo('و', '#1d4ed8')
      },
      academicYear: { title: '۱۴۰۵' },
      schoolClass: { titleDari: 'صنف دوم', gradeLevel: 2, section: 'الف' },
      observerName: 'استاد نگران آزمایشی',
      subjects,
      signatures: ['تأیید مکتب', 'تأیید آمریت حوزه/ولسوالی', 'عضو مسلکی نتایج', 'تأیید مدیریت عمومی نتایج', 'تأیید ریاست معارف'],
      stageStatistics: {
        fourHalf: { enrolled: 4, participated: 4, passed: 4, failed: 0, conditional: 0, absent: 0, excused: 0, deprived: 0 },
        annual: { enrolled: 4, participated: 4, passed: 4, failed: 0, conditional: 0, absent: 0, excused: 0, deprived: 0 },
        general: { enrolled: 4, participated: 4, passed: 4, failed: 0, conditional: 0, absent: 0, excused: 0, deprived: 0 }
      }
    },
    rows
  };
}

async function run() {
  const table = sampleTable();
  const html = renderResultTablePrintHtml(table);
  assert.ok(html.includes('چهارنیم ماهه'));
  assert.ok(html.includes('فاطمه'));
  assert.ok(html.includes('رحیمی'));
  assert.ok(html.includes('امتحانات'));
  assert.ok(html.includes('ضوابط حاضری'));
  assert.ok(html.includes('سال تولد شمسی'));
  assert.ok(html.includes('فیصدی نمرات'));
  assert.ok(html.includes('vertical-cell-text'));
  assert.ok(html.includes('٪'));
  assert.ok(html.includes('استاد نگران آزمایشی'));
  assert.ok(html.includes('font-size:10px'));
  assert.ok(html.includes('صنف:</b> دوم الف'));
  assert.ok(html.includes('صفحه: <b>1 از 2</b>'));
  assert.ok(!html.includes('۱۴۴۸'));
  assert.strictEqual((html.match(/class="print-page"/g) || []).length, 2);
  const matrix = buildExportMatrix(table);
  assert.strictEqual(matrix.rows.length, 12);
  assert.ok(matrix.headers.includes('دری'));
  assert.strictEqual(matrix.rows[0][13], 'چهارنیم ماهه');
  assert.strictEqual(matrix.rows[1][13], 'سالانه');
  assert.strictEqual(matrix.rows[2][13], 'نتیجه نهایی');
  const percentageColumn = matrix.headers.indexOf('فیصدی نمرات');
  assert.ok(percentageColumn > 0);
  assert.ok(String(matrix.rows[0][percentageColumn]).endsWith('٪'));
  assert.strictEqual(matrix.rows[0][8], '1405-1');
  const csv = buildResultTableCsv(table);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('تبدیل شده'));
  const xlsx = await buildResultTableXlsxBuffer(table);
  assert.ok(xlsx.length > 1000);

  if (process.argv.includes('--pdf')) {
    const outputDir = path.join(__dirname, '..', '..', 'tmp', 'pdfs');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'official-result-table-preview.pdf');
    fs.writeFileSync(path.join(outputDir, 'official-result-table-preview.html'), html, 'utf8');
    fs.writeFileSync(outputPath, await buildResultTablePdfBuffer(table));
    console.log(outputPath);
  }
  console.log('check:result-table-exports PASS');
}

run().catch((error) => {
  console.error('check:result-table-exports FAIL');
  console.error(error?.stack || error);
  process.exitCode = 1;
});
