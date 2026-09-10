/**
 * چارتِ واحدِ مصارفِ مکتبِ اصلی (مرکز مالی دولت).
 *
 * تنها منبعِ حقیقت برای سرفصل/زیرسرفصلِ `ExpenseEntry` و `ExpenseCategoryDefinition`.
 * فقط مکتبِ اصلی را پوشش می‌دهد؛ آموزشگاه و کورس‌های کوتاه‌مدت دست‌نخورده‌اند.
 *
 *   - EXPENSE_CHART        ۸ سرفصلِ ثابت + `unclassified`، هرکدام با زیرسرفصل‌ها
 *   - LEGACY_CATEGORY_MAP  نگاشتِ کلیدهای قدیمی (salary/admin/...) → کلیدِ جدید
 *   - resolveLegacyExpenseCategory()  یک رشتهٔ خامِ قدیمی → { category, subCategory, matched, confident }
 *
 * رفتارِ مهاجرت: کلیدِ شناخته‌شده → نگاشتِ درجا؛ کلیدِ ناشناخته → `unclassified`
 * با پرچمِ `needsCategoryReview` تا ادمین در صفِ «دسته‌بندیِ معلق» تعیین تکلیف کند.
 */

'use strict';

// باید دقیقاً با enumِ COLOR_TONES در models/ExpenseCategoryDefinition.js یکی باشد.
const COLOR_TONES = ['teal', 'copper', 'slate', 'rose', 'mint', 'sand'];

const UNCLASSIFIED_KEY = 'unclassified';
const UNCLASSIFIED_SUBCATEGORY = 'pending';

/**
 * سرفصل‌های سیستمی. ترتیبِ آرایه = ترتیبِ نمایش (فیلدِ order هم بر همین اساس).
 * همهٔ کلیدها lowercase و بدونِ فاصله‌اند تا با slugifyKey مدل سازگار بمانند.
 */
const EXPENSE_CHART = [
  {
    key: 'payroll',
    label: 'معاشات و مزایا',
    description: 'معاشِ استادان و کارمندان، اضافه‌کاری، پاداش و امتیازات',
    colorTone: 'teal',
    subCategories: [
      { key: 'teacher_salary', label: 'معاش استادان' },
      { key: 'admin_staff', label: 'معاش کارمندان اداری' },
      { key: 'service_staff', label: 'معاش کارمندان خدماتی' },
      { key: 'overtime', label: 'اضافه‌کاری' },
      { key: 'bonus', label: 'پاداش و امتیازات' }
    ]
  },
  {
    key: 'occupancy',
    label: 'کرایه و محل',
    description: 'کرایهٔ عمارت، عوارضِ شاروالی، سرقفلی و گروی',
    colorTone: 'copper',
    subCategories: [
      { key: 'building_rent', label: 'کرایهٔ عمارت / تعمیر' },
      { key: 'municipal_fee', label: 'کرایه و عوارضِ شاروالی' },
      { key: 'key_money', label: 'سرقفلی / گروی' }
    ]
  },
  {
    key: 'utilities',
    label: 'مصارفِ جاریِ خدماتی',
    description: 'برق، آب، گاز، انترنت، تیلیفون و اشتراک‌های نرم‌افزاری',
    colorTone: 'sand',
    subCategories: [
      { key: 'electricity', label: 'برق' },
      { key: 'water', label: 'آب' },
      { key: 'gas', label: 'گاز و سوختِ گرمایشی' },
      { key: 'internet', label: 'انترنت' },
      { key: 'phone', label: 'تیلیفون' },
      { key: 'software', label: 'اشتراکِ نرم‌افزار / ابری' }
    ]
  },
  {
    key: 'office_supplies',
    label: 'قرطاسیه و لوازمِ اداری',
    description: 'قلم، مارکر، ورق، دوسیه، رنگِ پرینتر، موادِ پاک‌کاری، بنر',
    colorTone: 'slate',
    subCategories: [
      { key: 'writing', label: 'قلم، پنسل، مارکر' },
      { key: 'paper', label: 'ورق و کاغذ' },
      { key: 'paper_filing', label: 'دوسیه و پوشِ اسناد' },
      { key: 'print_consumables', label: 'رنگِ پرینتر / مارکر / پاک‌کن' },
      { key: 'desk_tools', label: 'ستیبلر و لوازمِ میز' },
      { key: 'janitorial', label: 'موادِ پاک‌کاری (جنیتری)' },
      { key: 'signage', label: 'بنر و لوحه' }
    ]
  },
  {
    key: 'academic_materials',
    label: 'مواد و منابعِ درسی',
    description: 'کتاب، چپتر، پارچهٔ امتحان، تصدیق‌نامه، لوازمِ صنفی',
    colorTone: 'mint',
    subCategories: [
      { key: 'textbooks', label: 'کتاب' },
      { key: 'handouts', label: 'چپتر / جزوه' },
      { key: 'exam_stationery', label: 'پارچهٔ امتحان' },
      { key: 'certificates', label: 'تصدیق‌نامه و اسنادِ فارغی' },
      { key: 'classroom_supplies', label: 'لوازمِ صنفی (تخته‌پاک و…)' }
    ]
  },
  {
    key: 'transport_logistics',
    label: 'ترانسپورت و انتقالات',
    description: 'کرایهٔ تکسی و وسایط، تیل، سرویسِ شاگردان، انتقالِ اجناس',
    colorTone: 'copper',
    subCategories: [
      { key: 'taxi', label: 'کرایهٔ تکسی' },
      { key: 'vehicle_rental', label: 'کرایهٔ وسایط' },
      { key: 'fuel', label: 'تیل و روغنیات' },
      { key: 'student_transport', label: 'سرویسِ شاگردان' },
      { key: 'delivery', label: 'انتقالِ اجناس' }
    ]
  },
  {
    key: 'repair_equipment',
    label: 'ترمیم و تجهیزات',
    description: 'ترمیمِ عمارت، فرنیچر، کمپیوتر و دیوایس، ابزار، کرایهٔ تجهیزات',
    colorTone: 'slate',
    subCategories: [
      { key: 'building_repair', label: 'ترمیمِ عمارت' },
      { key: 'furniture', label: 'فرنیچر' },
      { key: 'it_devices', label: 'کمپیوتر و تجهیزاتِ برقی' },
      { key: 'tools', label: 'ابزار' },
      { key: 'equipment_rental', label: 'کرایهٔ وسایل و تجهیزات' }
    ]
  },
  {
    key: 'admin_misc',
    label: 'مصارفِ اداری و متفرقه',
    description: 'پذیرایی مهمانان، تبلیغات، مصارفِ بانکی، رسمیاتِ دولتی، متفرقه',
    colorTone: 'rose',
    subCategories: [
      { key: 'hospitality', label: 'پذیرایی و خوراکِ مهمانان' },
      { key: 'advertising', label: 'تبلیغات' },
      { key: 'bank_charges', label: 'مصارفِ بانکی' },
      { key: 'govt_fees', label: 'رسمیات و محصولِ دولتی' },
      { key: 'owner_principal_draw', label: 'برداشتِ مدیر / صاحب امتیاز' },
      { key: 'misc', label: 'متفرقه' }
    ]
  },
  {
    key: 'kitchen_catering',
    label: 'آشپزخانه و کانتین',
    description: 'موادِ خوراکه، لوازمِ آشپزخانه و سفره، موادِ پاک‌کاریِ آشپزخانه',
    colorTone: 'sand',
    subCategories: [
      { key: 'food_staples', label: 'موادِ خوراکه (آرد، برنج، روغن، حبوبات، بوره، چای، مصاله)' },
      { key: 'kitchen_supplies', label: 'لوازمِ آشپزخانه و سفره (دسترخوان، دست‌پاک، ظروفِ یک‌بارمصرف)' },
      { key: 'cleaning', label: 'موادِ پاک‌کاری و بهداشتی (صابون، پودر، مایع ظرف‌شویی، سفیدکننده)' }
    ]
  },
  {
    key: UNCLASSIFIED_KEY,
    label: 'دستهٔ نامشخص — نیازمندِ بازبینی',
    description: 'مصارفِ مهاجرت‌شده که هنوز به سرفصلِ رسمی نگاشت نشده‌اند',
    colorTone: 'rose',
    subCategories: [
      { key: UNCLASSIFIED_SUBCATEGORY, label: 'در انتظارِ دسته‌بندی' }
    ]
  }
];

const EXPENSE_CHART_KEYS = new Set(EXPENSE_CHART.map((item) => item.key));

/**
 * نگاشتِ کلیدهای قدیمی → جدید.
 * کلید = `category` یا `category/subCategory` (هر دو lowercase).
 * value.confident=false یعنی نگاشت انجام می‌شود ولی «بازبینی توصیه می‌شود»
 * (کلیدِ قدیمیِ عام که معنایش با سرفصلِ جدید کاملاً یکی نیست).
 */
const LEGACY_CATEGORY_MAP = {
  // --- salary → payroll ---
  salary: { category: 'payroll', subCategory: '', confident: true },
  'salary/teachers': { category: 'payroll', subCategory: 'teacher_salary', confident: true },
  'salary/staff': { category: 'payroll', subCategory: 'admin_staff', confident: true },
  'salary/bonuses': { category: 'payroll', subCategory: 'bonus', confident: true },

  // --- maintenance → repair_equipment (+ cleaning → office_supplies/janitorial) ---
  maintenance: { category: 'repair_equipment', subCategory: '', confident: false },
  'maintenance/building': { category: 'repair_equipment', subCategory: 'building_repair', confident: true },
  'maintenance/repair': { category: 'repair_equipment', subCategory: 'building_repair', confident: true },
  'maintenance/cleaning': { category: 'office_supplies', subCategory: 'janitorial', confident: true },

  // --- equipment → repair_equipment (+ classroom → academic_materials) ---
  equipment: { category: 'repair_equipment', subCategory: '', confident: false },
  'equipment/it': { category: 'repair_equipment', subCategory: 'it_devices', confident: true },
  'equipment/furniture': { category: 'repair_equipment', subCategory: 'furniture', confident: true },
  'equipment/classroom': { category: 'academic_materials', subCategory: 'classroom_supplies', confident: true },

  // --- transport → transport_logistics ---
  transport: { category: 'transport_logistics', subCategory: '', confident: true },
  'transport/fuel': { category: 'transport_logistics', subCategory: 'fuel', confident: true },
  'transport/student_transport': { category: 'transport_logistics', subCategory: 'student_transport', confident: true },
  'transport/logistics': { category: 'transport_logistics', subCategory: 'delivery', confident: true },

  // --- utilities → utilities (۱:۱) ---
  utilities: { category: 'utilities', subCategory: '', confident: true },
  'utilities/electricity': { category: 'utilities', subCategory: 'electricity', confident: true },
  'utilities/water': { category: 'utilities', subCategory: 'water', confident: true },
  'utilities/internet': { category: 'utilities', subCategory: 'internet', confident: true },

  // --- admin → office_supplies (تعریفِ سیستمی: قرطاسیه/چاپ/ممیزی) ---
  admin: { category: 'office_supplies', subCategory: '', confident: false },
  'admin/stationery': { category: 'office_supplies', subCategory: 'writing', confident: true },
  'admin/printing': { category: 'office_supplies', subCategory: 'print_consumables', confident: true },
  'admin/audit': { category: 'admin_misc', subCategory: 'misc', confident: false },

  // --- other → admin_misc ---
  other: { category: 'admin_misc', subCategory: '', confident: false },
  'other/misc': { category: 'admin_misc', subCategory: 'misc', confident: true },

  // --- رشته‌های واقعیِ دیتابیسِ imangirlschool (از خروجیِ dry-run، 2026-09-09) ---
  rent: { category: 'occupancy', subCategory: 'building_rent', confident: true },
  stationary: { category: 'office_supplies', subCategory: '', confident: true },
  certificate_cover: { category: 'academic_materials', subCategory: 'certificates', confident: true },
  food: { category: 'admin_misc', subCategory: 'hospitality', confident: true },
  // «برداشتِ مدیر / صاحب امتیاز» — تصمیمِ کاربر: زیرسرفصلِ برداشت در admin_misc.
  // (رفتنِ درست برای ثبت‌های جدید همچنان زیرسیستمِ «پیشکی و برداشت» است.)
  modermaktab: { category: 'admin_misc', subCategory: 'owner_principal_draw', confident: true },
  sahebemtiaz: { category: 'admin_misc', subCategory: 'owner_principal_draw', confident: true },

  // --- رشته‌های فارسیِ رایج از دورهٔ اشکالِ slug ---
  'معاش': { category: 'payroll', subCategory: '', confident: false },
  'معاشات': { category: 'payroll', subCategory: '', confident: false },
  'معاشات_کارمندان': { category: 'payroll', subCategory: 'admin_staff', confident: false },
  'معاش_استادان': { category: 'payroll', subCategory: 'teacher_salary', confident: false },
  'کرایه': { category: 'occupancy', subCategory: 'building_rent', confident: true },
  'کرایه_تعمیر': { category: 'occupancy', subCategory: 'building_rent', confident: true },
  'قرطاسیه': { category: 'office_supplies', subCategory: '', confident: false },
  'مصرف_خوراکی_مهمانان_اداره': { category: 'admin_misc', subCategory: 'hospitality', confident: false }
};

function normalizeKeyPart(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * یک رشتهٔ خامِ قدیمی را به کلیدِ جدید نگاشت می‌کند.
 * @returns {{category:string, subCategory:string, matched:boolean, confident:boolean}}
 *   matched=false  → به `unclassified` افتاده و باید در صفِ بازبینی تعیین تکلیف شود.
 */
function resolveLegacyExpenseCategory(rawCategory = '', rawSubCategory = '') {
  const categoryPart = normalizeKeyPart(rawCategory);
  const subPart = normalizeKeyPart(rawSubCategory);

  // از قبل یک کلیدِ جدیدِ معتبر است؟ دست نزن.
  if (EXPENSE_CHART_KEYS.has(categoryPart) && categoryPart !== UNCLASSIFIED_KEY) {
    const chartItem = EXPENSE_CHART.find((item) => item.key === categoryPart);
    const subOk = subPart && (chartItem.subCategories || []).some((sub) => sub.key === subPart);
    return { category: categoryPart, subCategory: subOk ? subPart : '', matched: true, confident: true };
  }

  const compoundKey = subPart ? `${categoryPart}/${subPart}` : '';
  const hit = (compoundKey && LEGACY_CATEGORY_MAP[compoundKey]) || LEGACY_CATEGORY_MAP[categoryPart] || null;
  if (hit) {
    return {
      category: hit.category,
      subCategory: hit.subCategory || '',
      matched: true,
      confident: hit.confident !== false
    };
  }

  return {
    category: UNCLASSIFIED_KEY,
    subCategory: UNCLASSIFIED_SUBCATEGORY,
    matched: false,
    confident: false
  };
}

/** ردیف‌های سیید برای ExpenseCategoryDefinition (order/isSystem/isActive تزریق می‌شوند). */
function buildExpenseChartSeed() {
  return EXPENSE_CHART.map((item, index) => ({
    key: item.key,
    label: item.label,
    description: item.description || '',
    colorTone: COLOR_TONES.includes(item.colorTone) ? item.colorTone : 'teal',
    isActive: true,
    isSystem: true,
    order: index + 1,
    subCategories: (item.subCategories || []).map((sub, subIndex) => ({
      key: sub.key,
      label: sub.label,
      description: sub.description || '',
      isActive: true,
      order: subIndex + 1
    }))
  }));
}

module.exports = {
  COLOR_TONES,
  EXPENSE_CHART,
  EXPENSE_CHART_KEYS,
  LEGACY_CATEGORY_MAP,
  UNCLASSIFIED_KEY,
  UNCLASSIFIED_SUBCATEGORY,
  buildExpenseChartSeed,
  normalizeKeyPart,
  resolveLegacyExpenseCategory
};
