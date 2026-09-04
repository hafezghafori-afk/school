const ExcelJS = require('exceljs');

// ---------------------------------------------------------------------------
// Enum ↔ Persian-label maps. The importer accepts either the raw enum value or
// the Persian label used elsewhere in the app, case/space-insensitively.
// ---------------------------------------------------------------------------
const PROVINCES = [
  ['kabul', 'کابل'], ['herat', 'هرات'], ['kandahar', 'کندهار'], ['balkh', 'بلخ'],
  ['nangarhar', 'ننگرهار'], ['badakhshan', 'بدخشان'], ['takhar', 'تخار'], ['samangan', 'سمنگان'],
  ['kunduz', 'قندوز'], ['baghlan', 'بغلان'], ['farah', 'فراه'], ['nimroz', 'نیمروز'],
  ['helmand', 'هلمند'], ['ghor', 'غور'], ['daykundi', 'دایکندی'], ['uruzgan', 'ارزگان'],
  ['zabul', 'زابل'], ['paktika', 'پکتیکا'], ['khost', 'خوست'], ['paktia', 'پکتیا'],
  ['logar', 'لوگر'], ['parwan', 'پروان'], ['kapisa', 'کاپیسا'], ['panjshir', 'پنجشیر'],
  ['badghis', 'بادغیس'], ['faryab', 'فاریاب'], ['jowzjan', 'جوزجان'], ['saripul', 'سرپل'],
  ['bamyan', 'بامیان'], ['ghazni', 'غزنی'], ['wardak', 'میدان وردک'], ['laghman', 'لغمان'],
  ['kunar', 'کنر'], ['nuristan', 'نورستان']
];
const GENDERS = [['male', 'مرد'], ['female', 'زن']];
const POSITIONS = [
  ['teacher', 'استاد'], ['principal', 'مدیر مکتب'], ['vice_principal', 'معاون مکتب'],
  ['admin_staff', 'کارمند اداری'], ['support_staff', 'کارمند خدماتی']
];
const EMPLOYMENT_TYPES = [
  ['permanent', 'دایمی'], ['contract', 'قراردادی'], ['temporary', 'موقت'], ['volunteer', 'رضاکار']
];
const HIGHEST_EDUCATION = [
  ['high_school', 'لیسه'], ['bachelor', 'لیسانس'], ['master', 'ماستری'], ['phd', 'دوکتورا'], ['other', 'سایر']
];
const WORK_SCHEDULES = [
  ['full_time', 'وقت کامل'], ['part_time', 'نیمه‌وقت'], ['flexible', 'انعطاف‌پذیر']
];
const TEACHING_POSITIONS = new Set(['teacher', 'principal', 'vice_principal']);

const normalize = (value) => String(value == null ? '' : value)
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const buildEnumResolver = (pairs, extraAliases = {}) => {
  const lookup = new Map();
  pairs.forEach(([value, label]) => {
    lookup.set(normalize(value), value);
    lookup.set(normalize(label), value);
  });
  Object.entries(extraAliases).forEach(([alias, value]) => lookup.set(normalize(alias), value));
  return (raw) => {
    const key = normalize(raw);
    if (!key) return '';
    return lookup.get(key) || '';
  };
};

const resolveProvince = buildEnumResolver(PROVINCES);
const resolveGender = buildEnumResolver(GENDERS, { 'پسر': 'male', 'دختر': 'female', m: 'male', f: 'female' });
const resolvePosition = buildEnumResolver(POSITIONS, { 'سرمعلم': 'vice_principal', 'مدیر': 'principal' });
const resolveEmploymentType = buildEnumResolver(EMPLOYMENT_TYPES);
const resolveHighestEducation = buildEnumResolver(HIGHEST_EDUCATION, { 'دیپلوم': 'high_school' });
const resolveWorkSchedule = buildEnumResolver(WORK_SCHEDULES);

const parseBoolean = (raw) => {
  const key = normalize(raw);
  if (!key) return false;
  return ['1', 'true', 'yes', 'y', 'بله', 'بلی', 'آری', 'اره', 'دارد'].includes(key);
};

const toNumber = (raw) => {
  if (raw == null || raw === '') return undefined;
  const cleaned = String(raw).replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
};

// Accepts an Excel date cell (JS Date), or an ISO / YYYY-MM-DD / YYYY/MM/DD
// string. Returns an ISO string or '' when unparseable.
const toDate = (raw) => {
  if (!raw) return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
  const text = String(raw).trim().replace(/\//g, '-');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) {
    const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

// ---------------------------------------------------------------------------
// Column definitions — order = template column order. `header` is what the
// template writes; `aliases` are other accepted header spellings.
// ---------------------------------------------------------------------------
const COLUMNS = [
  { key: 'firstName', header: 'نام', example: 'احمد', required: true, aliases: ['first name', 'firstname'] },
  { key: 'lastName', header: 'تخلص', example: 'رحیمی', required: true, aliases: ['last name', 'lastname', 'نام خانوادگی'] },
  { key: 'firstNameDari', header: 'نام (دری)', example: 'احمد', aliases: ['first name dari'] },
  { key: 'lastNameDari', header: 'تخلص (دری)', example: 'رحیمی', aliases: ['last name dari'] },
  { key: 'fatherName', header: 'نام پدر', example: 'محمد', required: true, aliases: ['father name'] },
  { key: 'gender', header: 'جنسیت', example: 'مرد', required: true, aliases: ['gender'] },
  { key: 'birthDate', header: 'تاریخ تولد', example: '1990-05-01', required: true, aliases: ['birth date', 'dob'] },
  { key: 'birthPlace', header: 'محل تولد', example: 'کابل', required: true, aliases: ['birth place'] },
  { key: 'tazkiraNumber', header: 'شماره تذکره', example: '1401-1234-56789', required: true, aliases: ['tazkira', 'tazkira number'] },
  { key: 'mobile', header: 'موبایل', example: '0700000000', required: true, aliases: ['mobile', 'phone'] },
  { key: 'email', header: 'ایمیل', example: '', aliases: ['email'] },
  { key: 'province', header: 'ولایت', example: 'کابل', required: true, aliases: ['province'] },
  { key: 'district', header: 'ولسوالی/ناحیه', example: 'ناحیه ۳', required: true, aliases: ['district'] },
  { key: 'village', header: 'قریه/محل', example: '', aliases: ['village'] },
  { key: 'address', header: 'آدرس', example: 'کابل، ناحیه ۳', required: true, aliases: ['address'] },
  { key: 'position', header: 'سمت', example: 'استاد', required: true, aliases: ['position', 'role'] },
  { key: 'jobTitle', header: 'عنوان وظیفه', example: '', aliases: ['job title'] },
  { key: 'department', header: 'بخش/دیپارتمنت', example: '', aliases: ['department'] },
  { key: 'isOwner', header: 'صاحب امتیاز؟', example: 'خیر', aliases: ['owner', 'is owner'] },
  { key: 'employeeId', header: 'کد کارمندی', example: 'EMP-001', required: true, aliases: ['employee id', 'staff id'] },
  { key: 'employmentType', header: 'نوع استخدام', example: 'دایمی', required: true, aliases: ['employment type'] },
  { key: 'hireDate', header: 'تاریخ آغاز به کار', example: '2020-03-21', required: true, aliases: ['hire date'] },
  { key: 'workSchedule', header: 'اوقات کاری', example: 'وقت کامل', aliases: ['work schedule'] },
  { key: 'highestEducation', header: 'سطح تحصیلات', example: 'لیسانس', aliases: ['highest education', 'education'] },
  { key: 'fieldOfStudy', header: 'رشتهٔ تحصیلی', example: 'ریاضی', aliases: ['field of study'] },
  { key: 'university', header: 'دانشگاه/موسسه', example: 'دانشگاه کابل', aliases: ['university'] },
  { key: 'graduationYear', header: 'سال فراغت', example: '2014', aliases: ['graduation year'] },
  { key: 'salaryBase', header: 'معاش اساسی', example: '12000', required: true, aliases: ['salary base', 'base salary', 'معاش'] },
  { key: 'salaryHousing', header: 'بدل کرایه', example: '0', aliases: ['salary housing'] },
  { key: 'salaryTransport', header: 'بدل ترانسپورت', example: '0', aliases: ['salary transport'] },
  { key: 'salaryOther', header: 'سایر امتیازات', example: '0', aliases: ['salary other'] }
];

const HEADER_TO_KEY = (() => {
  const map = new Map();
  COLUMNS.forEach((col) => {
    map.set(normalize(col.header), col.key);
    (col.aliases || []).forEach((alias) => map.set(normalize(alias), col.key));
  });
  return map;
})();

// ---------------------------------------------------------------------------
// Template workbook
// ---------------------------------------------------------------------------
function buildTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'School Management';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('کارکنان');
  sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
  sheet.columns = COLUMNS.map((col) => ({ header: col.header, key: col.key, width: 18 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3F8' } };
  // No example data row — every non-empty row below the header is imported.
  // Column formats and allowed values are on the «راهنما» sheet.

  const guide = workbook.addWorksheet('راهنما');
  guide.views = [{ rightToLeft: true }];
  guide.columns = [
    { header: 'ستون', key: 'header', width: 22 },
    { header: 'الزامی', key: 'required', width: 10 },
    { header: 'نمونه', key: 'example', width: 18 },
    { header: 'مقادیر مجاز / قالب', key: 'values', width: 60 }
  ];
  guide.getRow(1).font = { bold: true };
  const enumText = (pairs) => pairs.map(([v, l]) => `${l} (${v})`).join(' · ');
  const valueHint = {
    gender: enumText(GENDERS),
    province: PROVINCES.map(([, l]) => l).join('، '),
    position: enumText(POSITIONS),
    employmentType: enumText(EMPLOYMENT_TYPES),
    workSchedule: enumText(WORK_SCHEDULES),
    highestEducation: enumText(HIGHEST_EDUCATION),
    isOwner: 'بله / خیر — فقط برای مدیر مکتب که صاحب امتیاز است',
    birthDate: 'تاریخ میلادی: YYYY-MM-DD یا سلول تاریخِ اکسل',
    hireDate: 'تاریخ میلادی: YYYY-MM-DD یا سلول تاریخِ اکسل',
    highestEducationNote: ''
  };
  COLUMNS.forEach((col) => {
    let values = valueHint[col.key] || '';
    if (!values && ['fieldOfStudy', 'university', 'graduationYear', 'highestEducation'].includes(col.key)) {
      values = 'برای کارمند اداری/خدماتی اختیاری است';
    }
    guide.addRow({ header: col.header, required: col.required ? 'بله' : '—', example: col.example, values });
  });

  return workbook;
}

// ---------------------------------------------------------------------------
// Parse an uploaded workbook into teacher payloads.
// Returns { headerErrors: [], rows: [{ rowNumber, payload, errors: [] }] }
// rowNumber is the 1-based spreadsheet row (header = row 1).
// ---------------------------------------------------------------------------
async function parseStaffWorkbook(buffer, { schoolId }) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const result = { headerErrors: [], rows: [] };
  if (!sheet) {
    result.headerErrors.push('فایل اکسل هیچ برگه‌ای ندارد.');
    return result;
  }

  const headerRow = sheet.getRow(1);
  const colKeyByIndex = new Map();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = HEADER_TO_KEY.get(normalize(cell.value));
    if (key) colKeyByIndex.set(colNumber, key);
  });
  if (colKeyByIndex.size === 0) {
    result.headerErrors.push('سطر اول باید عنوانِ ستون‌ها باشد (از قالبِ نمونه استفاده کنید).');
    return result;
  }
  const missingRequired = COLUMNS.filter((c) => c.required && ![...colKeyByIndex.values()].includes(c.key));
  if (missingRequired.length) {
    result.headerErrors.push(`ستون‌های الزامی موجود نیست: ${missingRequired.map((c) => c.header).join('، ')}`);
    return result;
  }

  const lastRow = sheet.actualRowCount || sheet.rowCount;
  for (let r = 2; r <= lastRow; r += 1) {
    const row = sheet.getRow(r);
    const raw = {};
    colKeyByIndex.forEach((key, colNumber) => {
      const cell = row.getCell(colNumber);
      let value = cell.value;
      if (value && typeof value === 'object') {
        if (value.text) value = value.text;
        else if (value.result != null) value = value.result;
        else if (value.richText) value = value.richText.map((p) => p.text).join('');
      }
      raw[key] = value;
    });

    const hasAnything = Object.values(raw).some((v) => String(v == null ? '' : v).trim() !== '');
    if (!hasAnything) continue;

    const errors = [];
    const str = (key) => String(raw[key] == null ? '' : raw[key]).trim();

    const position = resolvePosition(raw.position);
    if (!position) errors.push(`سمت نامعتبر: «${str('position')}»`);
    const gender = resolveGender(raw.gender);
    if (!gender) errors.push(`جنسیت نامعتبر: «${str('gender')}»`);
    const province = resolveProvince(raw.province);
    if (!province) errors.push(`ولایت نامعتبر: «${str('province')}»`);
    const employmentType = resolveEmploymentType(raw.employmentType);
    if (!employmentType) errors.push(`نوع استخدام نامعتبر: «${str('employmentType')}»`);

    const birthDate = toDate(raw.birthDate);
    if (!birthDate) errors.push(`تاریخ تولد نامعتبر: «${str('birthDate')}»`);
    const hireDate = toDate(raw.hireDate);
    if (!hireDate) errors.push(`تاریخ آغاز به کار نامعتبر: «${str('hireDate')}»`);

    const salaryBase = toNumber(raw.salaryBase);
    if (salaryBase == null) errors.push(`معاش اساسی نامعتبر: «${str('salaryBase')}»`);

    ['firstName', 'lastName', 'fatherName', 'birthPlace', 'tazkiraNumber', 'mobile', 'district', 'address', 'employeeId']
      .forEach((key) => { if (!str(key)) errors.push(`«${COLUMNS.find((c) => c.key === key).header}» خالی است`); });

    const isTeaching = TEACHING_POSITIONS.has(position);
    const highestEducation = resolveHighestEducation(raw.highestEducation);
    if (isTeaching) {
      if (str('highestEducation') && !highestEducation) errors.push(`سطح تحصیلات نامعتبر: «${str('highestEducation')}»`);
      if (!highestEducation) errors.push('سطح تحصیلات برای سمت تدریسی الزامی است');
      ['fieldOfStudy', 'university', 'graduationYear'].forEach((key) => {
        if (!str(key)) errors.push(`«${COLUMNS.find((c) => c.key === key).header}» برای سمت تدریسی الزامی است`);
      });
    }

    const nonTeaching = position === 'admin_staff' || position === 'support_staff';
    const payload = {
      personalInfo: {
        firstName: str('firstName'),
        lastName: str('lastName'),
        firstNameDari: str('firstNameDari') || str('firstName'),
        lastNameDari: str('lastNameDari') || str('lastName'),
        fatherName: str('fatherName'),
        gender,
        birthDate,
        birthPlace: str('birthPlace'),
        nationality: 'Afghan'
      },
      identification: { tazkiraNumber: str('tazkiraNumber') },
      contactInfo: {
        mobile: str('mobile'),
        email: str('email'),
        province,
        district: str('district'),
        village: str('village'),
        address: str('address')
      },
      educationInfo: {
        highestEducation: highestEducation || undefined,
        fieldOfStudy: str('fieldOfStudy') || undefined,
        university: str('university') || undefined,
        graduationYear: toNumber(raw.graduationYear)
      },
      employmentInfo: {
        currentSchool: schoolId,
        employeeId: str('employeeId'),
        position,
        employmentType,
        hireDate,
        workSchedule: resolveWorkSchedule(raw.workSchedule) || 'full_time',
        jobTitle: nonTeaching ? str('jobTitle') : '',
        department: nonTeaching ? str('department') : ''
      },
      isOwner: position === 'principal' ? parseBoolean(raw.isOwner) : false,
      financialInfo: {
        salary: {
          base: salaryBase || 0,
          housing: toNumber(raw.salaryHousing) || 0,
          transport: toNumber(raw.salaryTransport) || 0,
          other: toNumber(raw.salaryOther) || 0
        }
      }
    };

    result.rows.push({ rowNumber: r, payload, errors, label: `${payload.personalInfo.firstNameDari} ${payload.personalInfo.lastNameDari}`.trim() });
  }

  return result;
}

module.exports = {
  COLUMNS,
  buildTemplateWorkbook,
  parseStaffWorkbook
};
