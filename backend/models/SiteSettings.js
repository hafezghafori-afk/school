const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  href: { type: String, default: '' },
  icon: { type: String, default: '' },
  permission: { type: String, default: '' },
  description: { type: String, default: '' },
  content: { type: String, default: '' },
  enabled: { type: Boolean, default: true }
}, { _id: false });

const menuSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  href: { type: String, default: '' },
  icon: { type: String, default: '' },
  description: { type: String, default: '' },
  content: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  children: { type: [linkSchema], default: [] }
}, { _id: false });

const listSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  value: { type: String, default: '' },
  href: { type: String, default: '' }
}, { _id: false });

const homeSlideSchema = new mongoose.Schema({
  badge: { type: String, default: '' },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  primaryLabel: { type: String, default: '' },
  primaryHref: { type: String, default: '' },
  secondaryLabel: { type: String, default: '' },
  secondaryHref: { type: String, default: '' },
  imageUrl: { type: String, default: '' }
}, { _id: false });

const siteSettingsSchema = new mongoose.Schema({
  brandName: { type: String, default: 'سیما' },
  brandSubtitle: { type: String, default: 'سیستم مدیریت هوشمند مکاتیب افغانستان' },
  logoUrl: { type: String, default: '' },
  hoursLabel: { type: String, default: 'راه‌اندازی سیستم' },
  hoursText: { type: String, default: 'دمو، تنظیم، آموزش و پشتیبانی' },
  contactLabel: { type: String, default: 'مشوره فروش' },
  contactPhone: { type: String, default: '0702855557' },
  contactEmail: { type: String, default: 'imanschool.official@gmail.com' },
  contactAddress: { type: String, default: 'ناحیه 5 کابل افغانستان' },
  topSearchPlaceholder: { type: String, default: 'جستجو در صنف‌ها، مضامین و دوره‌ها...' },
  languages: { type: [String], default: ['فارسی', 'English'] },

  footerShowHours: { type: Boolean, default: true },
  footerShowSocial: { type: Boolean, default: true },
  footerShowLinks: { type: Boolean, default: true },
  footerShowContact: { type: Boolean, default: true },
  footerShowCopyright: { type: Boolean, default: true },
  footerHoursTitle: { type: String, default: 'خدمات راه‌اندازی' },
  footerSocialTitle: { type: String, default: 'شبکه‌های ارتباطی' },
  footerLinksTitle: { type: String, default: 'لینک‌های محصول' },
  footerContactTitle: { type: String, default: 'تماس برای خرید و دمو' },
  footerContactText: { type: String, default: '' },
  footerNote: { type: String, default: '' },
  footerCopyright: { type: String, default: '' },
  platformInboxEmails: {
    official: { type: String, default: '' },
    personal: { type: String, default: '' },
    sendDemo: { type: Boolean, default: true },
    sendContact: { type: Boolean, default: true },
    sendSuggestion: { type: Boolean, default: true },
    sendComplaint: { type: Boolean, default: true }
  },

  homeHeroBadge: { type: String, default: 'سیما | سیستم مدیریت هوشمند مکاتیب افغانستان' },
  homeHeroTitle: { type: String, default: 'سیما؛ سیستم مدیریت هوشمند مکاتیب افغانستان' },
  homeHeroHighlight: { type: String, default: 'مدیریت کامل مکتب در یک سیستم' },
  homeHeroText: { type: String, default: 'مدیریت شاگردان، استادان، حاضری، فیس، امتحانات، تقسیم اوقات و گزارش‌ها در یک سیستم ساده و منظم.' },
  homeHeroPrimaryLabel: { type: String, default: 'درخواست دمو' },
  homeHeroPrimaryHref: { type: String, default: '/demo-request' },
  homeHeroSecondaryLabel: { type: String, default: 'ورود به سیستم' },
  homeHeroSecondaryHref: { type: String, default: '/login' },
  homeHeroTags: { type: [String], default: ['مدیریت شاگردان', 'فیس و حاضری', 'امتحانات و گزارش‌ها'] },
  salesQuickCards: { type: [listSchema], default: [
    { title: 'برای مدیریت مکتب', text: 'کنترول صنف‌ها، استادان، شاگردان، گزارش‌ها و تنظیمات عمومی.', value: 'fa-school' },
    { title: 'برای بخش مالی', text: 'ثبت فیس، رسید پرداخت، تخفیف، باقیات و گزارش مالی.', value: 'fa-receipt' },
    { title: 'برای آموزش', text: 'حاضری، امتحانات، نمرات، کارخانگی و تقسیم اوقات.', value: 'fa-graduation-cap' }
  ] },
  salesModules: { type: [listSchema], default: [
    { title: 'مدیریت شاگردان', text: 'ثبت معلومات شخصی، صنف، سال تعلیمی، اسناد و وضعیت شاگرد.', value: 'fa-user-graduate' },
    { title: 'مدیریت مالی', text: 'فیس ماهانه، داخله، تخفیف، پرداخت، رسید و باقیات.', value: 'fa-wallet' },
    { title: 'مدیریت امتحانات', text: 'ثبت نمرات، جدول نتایج، کارنامه PDF و گزارش صنفی.', value: 'fa-clipboard-check' },
    { title: 'حاضری', text: 'حاضری روزانه شاگردان، استادان و کارمندان.', value: 'fa-calendar-check' },
    { title: 'تقسیم اوقات', text: 'تنظیم روز، ساعت، مضمون، صنف و استاد در یک برنامه منظم.', value: 'fa-calendar-days' },
    { title: 'گزارش‌ها', text: 'گزارش مالی، آموزشی، حاضری و وضعیت عمومی مکتب.', value: 'fa-chart-line' }
  ] },
  salesAudience: { type: [String], default: [
    'مکاتب خصوصی',
    'مکاتب دخترانه و پسرانه',
    'آموزشگاه‌ها',
    'مراکز کورس‌های آموزشی',
    'اداره‌هایی که ثبت شاگرد، فیس و گزارشات را دیجیتال می‌کنند'
  ] },
  salesTrustTitle: { type: String, default: 'ساخته‌شده برای نیازهای واقعی مکاتب افغانستان' },
  salesTrustText: { type: String, default: 'ساختار صنف‌ها، سال تعلیمی، فیس، حاضری، امتحانات و گزارش‌ها مطابق کار روزانه مکتب تنظیم می‌شود و برای هر مکتب قابل تغییر است.' },
  salesTrustPoints: { type: [String], default: ['راه‌اندازی مرحله‌به‌مرحله', 'دسترسی جداگانه برای نقش‌ها', 'گزارش‌های قابل پیگیری'] },
  salesDashboardCards: { type: [listSchema], default: [
    { title: 'پنل مدیریت', text: 'شاگردان و استادان | صنف‌ها و سال تعلیمی | گزارش عمومی' },
    { title: 'پنل مالی', text: 'فیس و پرداخت‌ها | رسید و تخفیف | باقیات و گزارش مالی' },
    { title: 'پنل استاد', text: 'حاضری روزانه | نمره‌دهی | کارخانگی و مضمون' },
    { title: 'پنل شاگرد و والدین', text: 'نمرات و کارنامه | حاضری | برنامه درسی و اطلاعیه‌ها' }
  ] },
  salesFaqs: { type: [listSchema], default: [
    { title: 'آیا این سیستم برای هر مکتب قابل تنظیم است؟', text: 'بلی، ساختار صنف‌ها، سال تعلیمی، فیس، امتحانات، نقش‌ها و گزارش‌ها مطابق نیاز هر مکتب تنظیم می‌شود.' },
    { title: 'برای شروع استفاده از سیستم چه نیاز است؟', text: 'ابتدا معلومات پایه مکتب، صنف‌ها، استادان، شاگردان و تنظیمات مالی وارد می‌شود؛ بعد سیستم برای کاربران فعال می‌گردد.' },
    { title: 'آیا بخش مالی و رسید پرداخت دارد؟', text: 'بلی، ثبت فیس، تخفیف، پرداخت، باقیات، رسید و گزارش مالی در ساختار سیستم پیش‌بینی شده است.' },
    { title: 'آیا شاگردان و استادان پنل جداگانه دارند؟', text: 'بلی، هر نقش با دسترسی مناسب خود وارد سیستم می‌شود و فقط بخش‌های مربوط به خودش را می‌بیند.' }
  ] },
  homeSlides: { type: [homeSlideSchema], default: [
    {
      badge: 'ثبت نام و شروع سریع',
      title: 'از صفحه خانه تا صنف، همه چیز در یک مسیر روشن',
      text: 'ثبت نام، مشاهده صنف‌ها و شروع یادگیری را از یک مسیر سریع و منظم مدیریت کنید.',
      primaryLabel: 'ثبت نام آنلاین',
      primaryHref: '/register',
      secondaryLabel: 'مشاهده صنف‌ها',
      secondaryHref: '/courses',
      imageUrl: ''
    },
    {
      badge: 'مدیریت آموزشی',
      title: 'حضور و غیاب، کارخانگی و نمره‌دهی در یک پنل منظم',
      text: 'برای شاگرد، استاد و ادمین یک تجربه سریع و یکپارچه فراهم شده است.',
      primaryLabel: 'ویژگی‌های کلیدی',
      primaryHref: '#home-features',
      secondaryLabel: 'داشبوردها',
      secondaryHref: '/dashboard',
      imageUrl: ''
    },
    {
      badge: 'سیستم مجازی',
      title: 'کلاس آنلاین، چت صنفی و آرشیف جلسه همیشه در دسترس است',
      text: 'تعامل آموزشی را با کلاس زنده، پیام‌رسانی و آرشیف جلسه بدون جابه‌جایی بین ماژول‌ها دنبال کنید.',
      primaryLabel: 'ورود به چت',
      primaryHref: '/chat',
      secondaryLabel: 'آرشیف جلسات',
      secondaryHref: '/recordings',
      imageUrl: ''
    }
  ] },
  homeStats: { type: [listSchema], default: [
    { value: '6+', text: 'ماژول اصلی مدیریتی' },
    { value: '100%', text: 'قابل تنظیم برای هر مکتب' },
    { value: '24/7', text: 'دسترسی به گزارش‌ها' },
    { value: '4', text: 'پنل مدیریت، مالی، استاد و شاگرد' }
  ] },
  homeFeatures: { type: [listSchema], default: [
    { title: 'مدیریت شاگردان', text: 'ثبت معلومات، صنف، اسناد و وضعیت شاگردان.' },
    { title: 'مدیریت مالی و فیس', text: 'رسید پرداخت، تخفیف، باقیات و گزارش مالی.' },
    { title: 'حاضری و امتحانات', text: 'حاضری روزانه، نمرات، کارنامه و گزارش صنفی.' }
  ] },
  homeNews: { type: [listSchema], default: [
    { title: 'برنامه آزمون‌های میان‌دوره', text: 'تقویم آزمون‌ها به تفکیک صنف‌ها در پنل دانش‌آموزان منتشر شد.', href: '/news' },
    { title: 'کارگاه مهارت‌های مطالعه', text: 'ثبت‌نام کارگاه ویژه تقویت مهارت‌های مطالعه و برنامه‌ریزی آغاز شد.', href: '/news' },
    { title: 'ارزیابی رضایت والدین', text: 'فرم بازخورد والدین برای ارتقاء کیفیت آموزش فعال شد.', href: '/news' }
  ] },
  homeSteps: { type: [listSchema], default: [
    { text: 'صنف و مضمون خود را انتخاب کنید' },
    { text: 'ثبت نام و پرداخت را انجام دهید' },
    { text: 'یادگیری و آزمون را آغاز کنید' }
  ] },
  homeCtaTitle: { type: String, default: 'برای آینده آماده اید؟' },
  homeCtaText: { type: String, default: 'امروز ثبت نام کنید و یادگیری حرفه‌ای را شروع نمایید.' },
  homeCtaLabel: { type: String, default: 'شروع رایگان' },
  homeCtaHref: { type: String, default: '/demo-request' },

  studentIdFormats: {
    registrationIdFormat: { type: String, default: 'REG-{YYYY}-{SEQ}' },
    asasNumberFormat: { type: String, default: '{YYYY}-{SEQ}' }
  },

  signatureUrl: { type: String, default: '' },
  signatureName: { type: String, default: 'مدیر مکتب' },
  stampUrl: { type: String, default: '' },

  mainMenu: { type: [menuSchema], default: [] },
  menuBlueprints: { type: mongoose.Schema.Types.Mixed, default: {} },
  adminQuickLinks: { type: [linkSchema], default: [] },
  footerLinks: { type: [linkSchema], default: [] },
  socialLinks: { type: [linkSchema], default: [] },
  footerHours: { type: [linkSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
