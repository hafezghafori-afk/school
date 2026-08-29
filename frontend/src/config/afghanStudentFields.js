// منبعِ واحدِ فیلدهای «کارت سوانح متعلم» — همان فیلدها/برچسب‌ها/ترتیب در هر سه فرم:
// فورم ثبت‌نام، صفحهٔ مدیریت شاگردان، و ادیتورِ داخلِ محل کار سوانح.
// هر فرم موارد مخصوص خودش را جدا نگه می‌دارد (بارگذاری اسناد، صنف/نوبت، اصلاح شهرت، …).

export const GENDER_OPTIONS = [
  { value: 'male', label: 'ذکور' },
  { value: 'female', label: 'اناث' }
];

export const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  .map((value) => ({ value, label: value }));

export const GUARDIAN_RELATION_OPTIONS = [
  { value: 'father', label: 'پدر' },
  { value: 'mother', label: 'مادر' },
  { value: 'uncle', label: 'کاکا / ماما' },
  { value: 'brother', label: 'برادر' },
  { value: 'sister', label: 'خواهر' },
  { value: 'grandparent', label: 'پدرکلان / مادرکلان' },
  { value: 'other', label: 'سایر' }
];

export const PREVIOUS_SCHOOL_TYPE_OPTIONS = [
  { value: 'government', label: 'دولتی' },
  { value: 'private', label: 'خصوصی' },
  { value: 'mosque', label: 'مسجد' },
  { value: 'madrasa', label: 'مدرسه' }
];

export const PROVINCE_OPTIONS = [
  ['kabul', 'کابل'], ['herat', 'هرات'], ['kandahar', 'کندهار'], ['balkh', 'بلخ'], ['nangarhar', 'ننگرهار'],
  ['badakhshan', 'بدخشان'], ['takhar', 'تخار'], ['samangan', 'سمنگان'], ['kunduz', 'کندز'], ['baghlan', 'بغلان'],
  ['farah', 'فراه'], ['nimroz', 'نیمروز'], ['helmand', 'هلمند'], ['ghor', 'غور'], ['daykundi', 'دایکندی'],
  ['uruzgan', 'ارزگان'], ['zabul', 'زابل'], ['paktika', 'پکتیکا'], ['khost', 'خوست'], ['paktia', 'پکتیا'],
  ['logar', 'لوگر'], ['parwan', 'پروان'], ['kapisa', 'کاپیسا'], ['panjshir', 'پنجشیر'], ['badghis', 'بادغیس'],
  ['faryab', 'فاریاب'], ['jowzjan', 'جوزجان'], ['saripul', 'سرپل'], ['bamyan', 'بامیان'], ['ghazni', 'غزنی'],
  ['wardak', 'وردک'], ['laghman', 'لغمان'], ['kunar', 'کنر'], ['nuristan', 'نورستان']
].map(([value, label]) => ({ value, label }));

export const PROVINCE_LABELS = PROVINCE_OPTIONS.reduce((acc, { value, label }) => {
  acc[value] = label;
  return acc;
}, {});

export const provinceLabel = (value) => PROVINCE_LABELS[value] || value || '';
export const genderLabel = (value) => (GENDER_OPTIONS.find((o) => o.value === value)?.label || value || '');

// هر فیلد: key (شناسه در state)، label، path (مسیرِ dotted روی AfghanStudent)،
// type (text|latin|select|date)، required (روی مدل الزامی — هرگز با مقدار خالی overwrite نشود)،
// nameCorrection (تغییرش «نمبر مکتوب» می‌خواهد و در «اصلاح شهرت» کارت ثبت می‌شود).
export const AFGHAN_STUDENT_SECTIONS = [
  {
    id: 'identity',
    title: 'شهرت متعلم',
    fields: [
      { key: 'firstNameDari', label: 'نام (دری)', path: 'personalInfo.firstNameDari', type: 'text', required: true, nameCorrection: true },
      { key: 'lastNameDari', label: 'تخلص (دری)', path: 'personalInfo.lastNameDari', type: 'text', required: true, nameCorrection: true },
      { key: 'firstName', label: 'نام (انگلیسی برویت تذکره)', path: 'personalInfo.firstName', type: 'latin' },
      { key: 'lastName', label: 'تخلص (انگلیسی برویت تذکره)', path: 'personalInfo.lastName', type: 'latin' },
      { key: 'fatherName', label: 'نام پدر', path: 'personalInfo.fatherName', type: 'text', required: true, nameCorrection: true },
      { key: 'fatherNameEnglish', label: 'نام پدر (انگلیسی)', path: 'personalInfo.fatherNameEnglish', type: 'latin', nameCorrection: true },
      { key: 'grandfatherName', label: 'نام پدرکلان', path: 'personalInfo.grandfatherName', type: 'text', nameCorrection: true },
      { key: 'gender', label: 'جنسیت', path: 'personalInfo.gender', type: 'select', options: GENDER_OPTIONS, required: true },
      { key: 'nationality', label: 'تابعیت', path: 'personalInfo.nationality', type: 'text' }
    ]
  },
  {
    id: 'birth',
    title: 'تولد و تذکرهٔ هویت',
    fields: [
      { key: 'birthDate', label: 'تاریخ تولد', path: 'personalInfo.birthDate', type: 'date', required: true },
      { key: 'birthPlace', label: 'محل تولد', path: 'personalInfo.birthPlace', type: 'text', required: true },
      { key: 'tazkiraNumber', label: 'نمبر تذکره', path: 'identification.tazkiraNumber', type: 'text', required: true },
      { key: 'tazkiraVolume', label: 'جلد تذکره', path: 'identification.tazkiraVolume', type: 'text' },
      { key: 'tazkiraPage', label: 'صفحهٔ تذکره', path: 'identification.tazkiraPage', type: 'text' },
      { key: 'bloodGroup', label: 'گروپ خونی', path: 'medicalInfo.bloodGroup', type: 'select', options: BLOOD_GROUP_OPTIONS }
    ]
  },
  {
    id: 'father',
    title: 'معلومات پدر / ولی',
    fields: [
      { key: 'fatherOccupation', label: 'مسلک پدر', path: 'familyInfo.fatherOccupation', type: 'text' },
      { key: 'fatherResidence', label: 'محل بودوباش پدر', path: 'familyInfo.fatherResidence', type: 'text' },
      { key: 'fatherWorkplace', label: 'محل وظیفهٔ پدر', path: 'familyInfo.fatherWorkplace', type: 'text' },
      { key: 'fatherLandline', label: 'تلفن ثابت پدر', path: 'familyInfo.fatherLandline', type: 'text' },
      { key: 'fatherPhone', label: 'موبایل پدر', path: 'familyInfo.fatherPhone', type: 'text' }
    ]
  },
  {
    id: 'mother',
    title: 'معلومات مادر',
    fields: [
      { key: 'motherName', label: 'نام مادر', path: 'familyInfo.motherName', type: 'text', required: true },
      { key: 'motherOccupation', label: 'مسلک مادر', path: 'familyInfo.motherOccupation', type: 'text' },
      { key: 'motherPhone', label: 'تلفن مادر', path: 'familyInfo.motherPhone', type: 'text' }
    ]
  },
  {
    id: 'guardian',
    title: 'سرپرست',
    fields: [
      { key: 'guardianName', label: 'نام سرپرست', path: 'familyInfo.guardianName', type: 'text' },
      { key: 'guardianRelation', label: 'نسبت سرپرست', path: 'familyInfo.guardianRelation', type: 'select', options: GUARDIAN_RELATION_OPTIONS },
      { key: 'guardianPhone', label: 'تلفن سرپرست', path: 'familyInfo.guardianPhone', type: 'text' }
    ]
  },
  {
    id: 'contact',
    title: 'تماس و سکونت',
    fields: [
      { key: 'province', label: 'ولایت', path: 'contactInfo.province', type: 'select', options: PROVINCE_OPTIONS, required: true },
      { key: 'district', label: 'ولسوالی / ناحیه', path: 'contactInfo.district', type: 'text', required: true },
      { key: 'village', label: 'قریه / گذر', path: 'contactInfo.village', type: 'text' },
      { key: 'address', label: 'آدرس کامل', path: 'contactInfo.address', type: 'text', required: true },
      { key: 'phone', label: 'تماس متعلم', path: 'contactInfo.phone', type: 'text' },
      { key: 'mobile', label: 'موبایل متعلم', path: 'contactInfo.mobile', type: 'text' },
      { key: 'email', label: 'ایمیل', path: 'contactInfo.email', type: 'latin' }
    ]
  },
  {
    id: 'emergency',
    title: 'تماس اضطراری',
    fields: [
      { key: 'emergencyName', label: 'نام', path: 'contactInfo.emergencyContact.name', type: 'text', required: true },
      { key: 'emergencyRelation', label: 'نسبت', path: 'contactInfo.emergencyContact.relation', type: 'text', required: true },
      { key: 'emergencyPhone', label: 'تلفن', path: 'contactInfo.emergencyContact.phone', type: 'text', required: true }
    ]
  },
  {
    id: 'previous',
    title: 'سابقهٔ تحصیلی',
    fields: [
      { key: 'previousSchoolName', label: 'مکتب قبلی', path: 'academicInfo.previousSchool.name', type: 'text' },
      { key: 'previousSchoolType', label: 'نوع مکتب قبلی', path: 'academicInfo.previousSchool.type', type: 'select', options: PREVIOUS_SCHOOL_TYPE_OPTIONS },
      { key: 'previousGrade', label: 'صنف قبلی', path: 'academicInfo.previousSchool.lastGrade', type: 'text' }
    ]
  }
];

export const AFGHAN_STUDENT_FIELDS = AFGHAN_STUDENT_SECTIONS.flatMap((section) => section.fields);
export const AFGHAN_STUDENT_FIELD_PATHS = AFGHAN_STUDENT_FIELDS.map((field) => field.path);
export const AFGHAN_STUDENT_NAME_PATHS = AFGHAN_STUDENT_FIELDS.filter((f) => f.nameCorrection).map((f) => f.path);

const getByPath = (source, path) => path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), source);

/** رکورد AfghanStudent (یا snapshot آن) → آبجکتِ مسطحِ { key: string } برای state فرم. */
export const afghanStudentToValues = (student = {}) => {
  const values = {};
  AFGHAN_STUDENT_FIELDS.forEach((field) => {
    let raw = getByPath(student, field.path);
    if (field.type === 'date' && raw) raw = String(raw).slice(0, 10);
    values[field.key] = raw == null ? '' : String(raw);
  });
  return values;
};

/**
 * آبجکتِ مسطحِ فرم → payload با کلیدهای dotted برای AfghanStudent.
 * @param {object} values      مقادیر فعلی فرم
 * @param {object} [opts.original] مقادیرِ اولیه (برای تشخیصِ تغییرِ نام)
 * @returns {{ payload: object, nameChanged: boolean }}
 */
export const valuesToAfghanPayload = (values = {}, { original = null } = {}) => {
  const payload = {};
  let nameChanged = false;
  AFGHAN_STUDENT_FIELDS.forEach((field) => {
    const raw = values[field.key];
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (field.nameCorrection && original) {
      const before = String(original[field.key] || '').trim();
      if (before !== String(value || '')) nameChanged = true;
    }
    // فیلدهای الزامیِ مدل و همچنین select/enumها فقط وقتی مقدار دارند فرستاده شوند —
    // چون '' برای مسیرِ enumدارِ mongoose خطای اعتبارسنجی می‌سازد و خالی‌شدنِ سهوی هم بد است.
    if ((field.required || field.type === 'select') && !value) return;
    payload[field.path] = value == null ? '' : value;
  });
  return { payload, nameChanged };
};
