// کلیدهای کانونیک مضامین «سوانح تعلیمی» (فرم نتیجه امتحانات متعلم وزارت معارف)
// این فهرست ردیف‌های جدول فرم B را تعریف می‌کند و مبنای نگاشت Subject → subjectKey است.
// ترتیب نمایش نهایی از Subject.resultOrder گرفته می‌شود؛ order این‌جا فقط fallback است.

const RELIGIOUS = 'religious';
const GENERAL = 'general';

// gradesApplicable = پیش‌فرضِ صنوفی که مضمون معمولاً در آن‌ها تدریس می‌شود.
// منبع نهاییِ ردیف‌های هر صنف، Subjectهای واقعیِ همان صنف است؛ این‌جا فقط برای
// فرمِ خالی (blank) و زمانی که مضمونی در سیستم ثبت نشده استفاده می‌شود.
const ALL_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const gradesFrom = (start) => ALL_GRADES.filter((grade) => grade >= start);

const SAWANEH_SUBJECTS = Object.freeze([
  // --- مضامین دینی / مدرسه‌ای ---
  { key: 'tafsir', labelDari: 'تفسیر شریف / قرآن‌کریم', labelPashto: 'تفسیر شریف / قرآن‌کریم', category: RELIGIOUS, order: 10, gradesApplicable: gradesFrom(7) },
  { key: 'hifz', labelDari: 'حفظ', labelPashto: 'حفظ', category: RELIGIOUS, order: 20, gradesApplicable: ALL_GRADES },
  { key: 'tajweed', labelDari: 'تجوید', labelPashto: 'تجوید', category: RELIGIOUS, order: 30, gradesApplicable: ALL_GRADES },
  { key: 'hadith', labelDari: 'حدیث شریف', labelPashto: 'حدیث شریف', category: RELIGIOUS, order: 40, gradesApplicable: gradesFrom(7) },
  { key: 'usul_hadith', labelDari: 'اصول حدیث', labelPashto: 'اصول حدیث', category: RELIGIOUS, order: 50, gradesApplicable: gradesFrom(9) },
  { key: 'fiqh', labelDari: 'فقه', labelPashto: 'فقه', category: RELIGIOUS, order: 60, gradesApplicable: gradesFrom(4) },
  { key: 'usul_fiqh', labelDari: 'اصول فقه', labelPashto: 'اصول فقه', category: RELIGIOUS, order: 70, gradesApplicable: gradesFrom(9) },
  { key: 'aqaid', labelDari: 'عقاید', labelPashto: 'عقايد', category: RELIGIOUS, order: 80, gradesApplicable: ALL_GRADES },
  { key: 'sirat', labelDari: 'سیرت‌النبی', labelPashto: 'د نبي سيرت', category: RELIGIOUS, order: 90, gradesApplicable: ALL_GRADES },
  { key: 'akhlaq', labelDari: 'اخلاق و آداب اسلامی', labelPashto: 'اخلاق او اسلامي آداب', category: RELIGIOUS, order: 100, gradesApplicable: ALL_GRADES },
  { key: 'sarf', labelDari: 'صرف', labelPashto: 'صرف', category: RELIGIOUS, order: 110, gradesApplicable: gradesFrom(4) },
  { key: 'nahw', labelDari: 'نحو', labelPashto: 'نحو', category: RELIGIOUS, order: 120, gradesApplicable: gradesFrom(4) },
  { key: 'arabic', labelDari: 'عربی', labelPashto: 'عربي', category: RELIGIOUS, order: 130, gradesApplicable: ALL_GRADES },
  { key: 'balaghat', labelDari: 'بلاغت', labelPashto: 'بلاغت', category: RELIGIOUS, order: 140, gradesApplicable: gradesFrom(10) },
  { key: 'mantiq', labelDari: 'منطق', labelPashto: 'منطق', category: RELIGIOUS, order: 150, gradesApplicable: gradesFrom(10) },
  { key: 'tahzib', labelDari: 'تهذیب', labelPashto: 'تهذيب', category: RELIGIOUS, order: 160, gradesApplicable: ALL_GRADES },

  // --- مضامین عمومی ---
  { key: 'dari', labelDari: 'دری', labelPashto: 'دري', category: GENERAL, order: 200, gradesApplicable: ALL_GRADES },
  { key: 'pashto', labelDari: 'پشتو', labelPashto: 'پښتو', category: GENERAL, order: 210, gradesApplicable: ALL_GRADES },
  { key: 'english', labelDari: 'انگلیسی', labelPashto: 'انګليسي', category: GENERAL, order: 220, gradesApplicable: ALL_GRADES },
  { key: 'math', labelDari: 'ریاضی', labelPashto: 'رياضي', category: GENERAL, order: 230, gradesApplicable: ALL_GRADES },
  { key: 'science', labelDari: 'ساینس', labelPashto: 'ساينس', category: GENERAL, order: 240, gradesApplicable: ALL_GRADES },
  { key: 'social', labelDari: 'اجتماعیات', labelPashto: 'ټولنيز علوم', category: GENERAL, order: 250, gradesApplicable: gradesFrom(4) },
  { key: 'handasa', labelDari: 'هندسه / رسم', labelPashto: 'هندسه / رسم', category: GENERAL, order: 260, gradesApplicable: gradesFrom(7) },
  { key: 'computer', labelDari: 'کمپیوتر', labelPashto: 'کمپيوټر', category: GENERAL, order: 270, gradesApplicable: gradesFrom(7) },
  { key: 'physical_ed', labelDari: 'تربیت بدنی / تدبیر منزل', labelPashto: 'بدني روزنه / کورنۍ تدبير', category: GENERAL, order: 280, gradesApplicable: ALL_GRADES }
]);

const SAWANEH_SUBJECT_KEYS = Object.freeze(SAWANEH_SUBJECTS.map((item) => item.key));

const SAWANEH_SUBJECT_MAP = Object.freeze(
  SAWANEH_SUBJECTS.reduce((acc, item) => {
    acc[item.key] = item;
    return acc;
  }, {})
);

// نرمال‌سازی متن دری برای تطبیق نام مضمون: حذف کشیده/علائم، یکسان‌سازی ی/ک، حذف واژه‌های زائد.
const normalizeDari = (value = '') => String(value || '')
  .replace(/[‌‏‎]/g, ' ')       // نیم‌فاصله و نشانه‌های جهت
  .replace(/[ً-ْٰ]/g, '')       // اعراب
  .replace(/[يیۍ]/g, 'ی')
  .replace(/[كک]/g, 'ک')
  .replace(/[أإآا]/g, 'ا')
  .replace(/ه\b/g, 'ه')
  .replace(/\s+/g, ' ')
  .replace(/\b(شریف|النبی|اسلامی|کریم|مقدس)\b/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// نام‌های محتملِ هر مضمون (پس از normalizeDari) → کلید کانونیک
const DARI_SYNONYMS = Object.freeze({
  'تفسیر': 'tafsir',
  'قران': 'tafsir',
  'قران کریم': 'tafsir',
  'تفسیر قران': 'tafsir',
  'حفظ': 'hifz',
  'حفظ قران': 'hifz',
  'تجوید': 'tajweed',
  'حدیث': 'hadith',
  'اصول حدیث': 'usul_hadith',
  'مصطلح الحدیث': 'usul_hadith',
  'فقه': 'fiqh',
  'اصول فقه': 'usul_fiqh',
  'عقاید': 'aqaid',
  'عقیده': 'aqaid',
  'توحید': 'aqaid',
  'سیرت': 'sirat',
  'سیره': 'sirat',
  'اخلاق': 'akhlaq',
  'اخلاق و اداب': 'akhlaq',
  'اداب': 'akhlaq',
  'صرف': 'sarf',
  'نحو': 'nahw',
  'عربی': 'arabic',
  'لغت عربی': 'arabic',
  'بلاغت': 'balaghat',
  'معانی': 'balaghat',
  'منطق': 'mantiq',
  'تهذیب': 'tahzib',
  'دری': 'dari',
  'زبان دری': 'dari',
  'ادبیات دری': 'dari',
  'پشتو': 'pashto',
  'زبان پشتو': 'pashto',
  'انگلیسی': 'english',
  'زبان انگلیسی': 'english',
  'ریاضی': 'math',
  'ریاضیات': 'math',
  'حساب': 'math',
  'الجبر': 'math',
  'ساینس': 'science',
  'علوم': 'science',
  'علوم طبیعی': 'science',
  'فزیک': 'science',
  'کیمیا': 'science',
  'بیولوژی': 'science',
  'اجتماعیات': 'social',
  'علوم اجتماعی': 'social',
  'مطالعات اجتماعی': 'social',
  'تاریخ': 'social',
  'جغرافیه': 'social',
  'جغرافیا': 'social',
  'هندسه': 'handasa',
  'رسم': 'handasa',
  'کمپیوتر': 'computer',
  'کامپیوتر': 'computer',
  'تربیت بدنی': 'physical_ed',
  'ورزش': 'physical_ed',
  'تدبیر منزل': 'physical_ed',
  // ترانویسیِ لاتینِ رایج در دادهٔ ثبت‌شده
  'reyazi': 'math',
  'riazi': 'math',
  'dari': 'dari',
  'pashto': 'pashto',
  'englisi': 'english',
  'english': 'english',
  'sayns': 'science',
  'science': 'science',
  'ijtimaiyat': 'social',
  'tafsir': 'tafsir',
  'hifz': 'hifz',
  'tajweed': 'tajweed',
  'tajwid': 'tajweed',
  'hadis': 'hadith',
  'hadith': 'hadith',
  'fiqh': 'fiqh',
  'aqaid': 'aqaid',
  'sirat': 'sirat',
  'akhlaq': 'akhlaq',
  'sarf': 'sarf',
  'nahw': 'nahw',
  'arabi': 'arabic',
  'mantiq': 'mantiq',
  'balaghat': 'balaghat',
  'computer': 'computer',
  'kampyutar': 'computer'
});

// نرمال‌سازیِ لاتین: حروف کوچک، حذف رقم/علائم، فشرده‌سازی فاصله
const normalizeLatin = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^a-z\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isValidSawanehKey = (value = '') => SAWANEH_SUBJECT_KEYS.includes(String(value || '').trim());

/**
 * نگاشت یک سند Subject به کلید کانونیک سوانح.
 * ترتیب اولویت: sawanehKey صریح → ministryCode → تطبیق نام دری → 'other'
 * @param {object} subject سند/شیء Subject (نیازمند sawanehKey|ministryCode|nameDari|name)
 * @returns {string} یکی از SAWANEH_SUBJECT_KEYS یا 'other'
 */
const resolveSubjectKey = (subject = {}) => {
  if (!subject) return 'other';

  const explicit = String(subject.sawanehKey || '').trim();
  if (isValidSawanehKey(explicit)) return explicit;

  const ministry = String(subject.ministryCode || '').trim().toLowerCase();
  if (isValidSawanehKey(ministry)) return ministry;

  const candidates = [subject.nameDari, subject.name, subject.namePashto]
    .map((label) => normalizeDari(label))
    .filter(Boolean);

  // ۱) تطبیق دقیقِ کل نام
  for (const candidate of candidates) {
    if (DARI_SYNONYMS[candidate]) return DARI_SYNONYMS[candidate];
  }

  const synonymEntries = Object.keys(DARI_SYNONYMS);
  const multiWordSynonyms = synonymEntries.filter((syn) => syn.includes(' '));
  const singleWordSynonyms = synonymEntries.filter((syn) => !syn.includes(' '));

  // ۲) مترادفِ چندکلمه‌ای به‌صورت زیررشته (مثلاً «تفسیر قران» در «درس تفسیر قران»)
  for (const candidate of candidates) {
    const hit = multiWordSynonyms.find((syn) => candidate.includes(syn));
    if (hit) return DARI_SYNONYMS[hit];
  }

  // ۳) مترادفِ تک‌کلمه‌ای فقط با تطبیقِ کاملِ یک واژه (تا «نامعلوم» با «علوم» یکی نشود)
  for (const candidate of candidates) {
    const tokens = candidate.split(' ').filter(Boolean);
    const hit = singleWordSynonyms.find((syn) => tokens.includes(syn));
    if (hit) return DARI_SYNONYMS[hit];
  }

  // ۴) ترانویسیِ لاتین (مثلاً "reyazi 5"، "Dari 7")
  const latinTokens = [subject.name, subject.nameDari]
    .map((label) => normalizeLatin(label))
    .filter(Boolean)
    .flatMap((text) => text.split(' '));
  for (const token of latinTokens) {
    if (DARI_SYNONYMS[token]) return DARI_SYNONYMS[token];
  }

  return 'other';
};

/**
 * فهرست مضامین سوانح برای یک صنف، مرتب‌شده (fallback وقتی Subject واقعی نداریم).
 * @param {number} grade صنف ۱ تا ۱۲
 * @returns {Array<{key,labelDari,labelPashto,category,order}>}
 */
const sawanehSubjectsForGrade = (grade) => {
  const numeric = Number(grade);
  return SAWANEH_SUBJECTS
    .filter((item) => item.gradesApplicable.includes(numeric))
    .map(({ key, labelDari, labelPashto, category, order }) => ({ key, labelDari, labelPashto, category, order }));
};

module.exports = {
  RELIGIOUS_CATEGORY: RELIGIOUS,
  GENERAL_CATEGORY: GENERAL,
  SAWANEH_SUBJECTS,
  SAWANEH_SUBJECT_KEYS,
  SAWANEH_SUBJECT_MAP,
  DARI_SYNONYMS,
  normalizeDari,
  isValidSawanehKey,
  resolveSubjectKey,
  sawanehSubjectsForGrade
};
