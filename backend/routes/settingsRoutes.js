const express = require('express');
const SiteSettings = require('../models/SiteSettings');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'SiteSettings', actionPrefix: 'site_settings', audit: auditWrite });

const logoDir = path.join(__dirname, '..', 'uploads', 'site');
if (!fs.existsSync(logoDir)) {
  fs.mkdirSync(logoDir, { recursive: true });
}

const safeName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => cb(null, `logo-${Date.now()}-${safeName(file.originalname)}`)
});

const assetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => cb(null, `asset-${Date.now()}-${safeName(file.originalname)}`)
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(ext);
    if (!ok) return cb(new Error('فرمت لوگو معتبر نیست'), false);
    cb(null, true);
  }
});

const assetUpload = multer({
  storage: assetStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    if (!ok) return cb(new Error('فرمت فایل معتبر نیست'), false);
    cb(null, true);
  }
});

const defaultMenuBlueprints = {
  home: {
    tone: 'home',
    watermark: 'HOME',
    label: 'راهنمای سریع',
    summary: 'به مهم‌ترین مسیرهای سایت دسترسی سریع داشته باشید.',
    points: ['شروع سریع ثبت‌نام', 'ورود به صنف‌های آموزشی', 'دسترسی مستقیم به اخبار و گالری'],
    actions: [
      { title: 'صفحه خانه', href: '/' },
      { title: 'ثبت‌نام آنلاین', href: '/register' }
    ],
    sectionOrder: ['خدمات', 'آموزش', 'محتوا', 'راهنما', 'بیشتر']
  },
  education: {
    tone: 'education',
    watermark: 'EDU',
    label: 'مسیر آموزشی',
    summary: 'صنف‌ها، تقسیم اوقات، کارخانگی، آزمون و کارنامه را یکجا مدیریت کنید.',
    points: ['مرتب‌سازی بر اساس مضمون', 'دسترسی سریع به تقسیم اوقات', 'پیگیری نمرات و کارخانگی'],
    actions: [
      { title: 'مشاهده صنف‌ها', href: '/courses' },
      { title: 'تقسیم اوقات', href: '/schedule' }
    ],
    sectionOrder: ['آموزش', 'خدمات', 'راهنما', 'بیشتر']
  },
  virtual: {
    tone: 'virtual',
    watermark: 'LIVE',
    label: 'کلاس مجازی',
    summary: 'ورود سریع به کلاس آنلاین، جلسات زمان‌بندی‌شده، آرشیف ضبط و راهنمای استفاده.',
    points: ['کلاس‌های آنلاین', 'جلسات با زمان‌بندی', 'آرشیف ضبط جلسات'],
    actions: [
      { title: 'کلاس آنلاین', href: '/chat' },
      { title: 'آرشیف ضبط جلسات', href: '/recordings' }
    ],
    sectionOrder: ['آموزش', 'خدمات', 'راهنما', 'بیشتر']
  },
  news: {
    tone: 'content',
    watermark: 'NEWS',
    label: 'بخش محتوا',
    summary: 'آخرین اخبار، اعلانات و رویدادهای مدرسه را از همین منو دنبال کنید.',
    points: ['اخبار تازه', 'اعلانات رسمی', 'آرشیو رویدادها'],
    actions: [
      { title: 'همه اخبار', href: '/news' },
      { title: 'گالری تصاویر', href: '/gallery' }
    ],
    sectionOrder: ['محتوا', 'راهنما', 'بیشتر']
  },
  gallery: {
    tone: 'content',
    watermark: 'MEDIA',
    label: 'گالری',
    summary: 'تصاویر رویدادها، فعالیت‌های آموزشی و فضای مدرسه را ببینید.',
    points: ['گالری رویدادها', 'دسته‌بندی منظم تصاویر', 'دسترسی ساده از موبایل'],
    actions: [
      { title: 'نمایش گالری', href: '/gallery' },
      { title: 'اخبار مرتبط', href: '/news' }
    ],
    sectionOrder: ['محتوا', 'راهنما', 'بیشتر']
  },
  about: {
    tone: 'about',
    watermark: 'ABOUT',
    label: 'آشنایی با مدرسه',
    summary: 'معرفی مدرسه، تیم آموزشی و قوانین کلیدی را در یک نمای منظم ببینید.',
    points: ['معرفی مدرسه', 'تیم آموزشی', 'قوانین و مقررات'],
    actions: [
      { title: 'درباره ما', href: '/about' },
      { title: 'قوانین', href: '/terms' }
    ],
    sectionOrder: ['راهنما', 'خدمات', 'بیشتر']
  },
  contact: {
    tone: 'contact',
    watermark: 'HELP',
    label: 'ارتباط و پشتیبانی',
    summary: 'راه‌های ارتباط با مدرسه و کانال‌های پشتیبانی سریع در دسترس شماست.',
    points: ['شماره تماس و آدرس', 'ارسال پیام پشتیبانی', 'راهنمای خدمات'],
    actions: [
      { title: 'تماس با ما', href: '/contact' },
      { title: 'سوالات متداول', href: '/faq' }
    ],
    sectionOrder: ['راهنما', 'خدمات', 'بیشتر']
  },
  auth: {
    tone: 'services',
    watermark: 'ACCESS',
    label: 'ورود و خدمات',
    summary: 'ورود شاگرد، استاد و ادمین به صورت یکپارچه از همین بخش انجام می‌شود.',
    points: ['ورود شاگرد', 'ورود استاد', 'ورود ادمین'],
    actions: [
      { title: 'ورود شاگرد', href: '/login' },
      { title: 'ثبت‌نام آنلاین', href: '/register' }
    ],
    sectionOrder: ['خدمات', 'راهنما', 'بیشتر']
  },
  generic: {
    tone: 'default',
    watermark: 'IMAN',
    label: 'میانبر سریع',
    summary: 'دسترسی سریع و منظم به زیرمنوهای این بخش.',
    points: ['نمایش مسیرهای مهم', 'دسترسی سریع با یک کلیک', 'طراحی یکسان در همه منوها'],
    actions: [
      { title: 'مشاهده بخش', href: '/' },
      { title: 'پشتیبانی', href: '/contact' }
    ],
    sectionOrder: ['خدمات', 'آموزش', 'محتوا', 'راهنما', 'بیشتر']
  }
};

const normalizeVirtualMenuItems = (settings) => {
  const list = Array.isArray(settings?.mainMenu) ? settings.mainMenu : [];
  if (!list.length) return false;

  const virtualMenu = list.find((item) => String(item?.title || '').includes('مجازی'));
  if (!virtualMenu) return false;

  const desiredChildren = [
    { title: 'کلاس‌های آنلاین (چت/جلسه)', href: '/chat', icon: 'fa-headset' },
    { title: 'جلسات زمان‌بندی', href: '/schedule', icon: 'fa-clock' },
    { title: 'ضبط جلسات', href: '/recordings', icon: 'fa-record-vinyl' },
    { title: 'کارخانگی آنلاین', href: '/my-homework', icon: 'fa-file-pen' },
    { title: 'آزمون آنلاین', href: '/courses', icon: 'fa-clipboard-list' },
    { title: 'راهنمای استفاده', href: '/faq', icon: 'fa-circle-info' }
  ];

  if (!Array.isArray(virtualMenu.children)) virtualMenu.children = [];
  let changed = false;

  virtualMenu.children = virtualMenu.children.map((child) => {
    const title = String(child?.title || '');
    if (title.includes('کلاس') && title.includes('آنلاین')) {
      const next = { ...child, href: '/chat', icon: child?.icon || 'fa-headset' };
      if (next.href !== child.href || next.icon !== child.icon) changed = true;
      return next;
    }
    if (title.includes('جلسات') && title.includes('زمان')) {
      const next = { ...child, href: '/schedule', icon: child?.icon || 'fa-clock' };
      if (next.href !== child.href || next.icon !== child.icon) changed = true;
      return next;
    }
    if (title.includes('ضبط')) {
      const next = { ...child, href: '/recordings', icon: child?.icon || 'fa-record-vinyl' };
      if (next.href !== child.href || next.icon !== child.icon) changed = true;
      return next;
    }
    return child;
  });

  desiredChildren.forEach((desired) => {
    const exists = virtualMenu.children.some((child) => String(child?.title || '').trim() === desired.title);
    if (!exists) {
      virtualMenu.children.push(desired);
      changed = true;
    }
  });

  return changed;
};

const defaultSettings = () => ({
  brandName: 'سیما',
  brandSubtitle: 'سیستم مدیریت هوشمند مکاتیب افغانستان',
  logoUrl: '',
  hoursLabel: 'راه‌اندازی سیستم',
  hoursText: 'دمو، تنظیم، آموزش و پشتیبانی',
  contactLabel: 'مشوره فروش',
  contactPhone: '0702855557',
  contactEmail: 'imanschool.official@gmail.com',
  contactAddress: 'ناحیه 5 کابل افغانستان',
  topSearchPlaceholder: 'جستجو در صنف‌ها، مضامین و دوره‌ها...',
  languages: ['فارسی', 'English'],

  footerShowHours: true,
  footerShowSocial: true,
  footerShowLinks: true,
  footerShowContact: true,
  footerShowCopyright: true,
  footerHoursTitle: 'خدمات راه‌اندازی',
  footerSocialTitle: 'شبکه‌های ارتباطی',
  footerLinksTitle: 'لینک‌های محصول',
  footerContactTitle: 'تماس برای خرید و دمو',
  footerContactText: '',
  footerNote: '',
  footerCopyright: '',
  platformInboxEmails: {
    official: '',
    personal: '',
    sendDemo: true,
    sendContact: true,
    sendSuggestion: true,
    sendComplaint: true
  },

  homeHeroBadge: 'سیما | سیستم مدیریت هوشمند مکاتیب افغانستان',
  homeHeroTitle: 'سیما؛ سیستم مدیریت هوشمند مکاتیب افغانستان',
  homeHeroHighlight: 'مدیریت کامل مکتب در یک سیستم',
  homeHeroText: 'مدیریت شاگردان، استادان، حاضری، فیس، امتحانات، تقسیم اوقات و گزارش‌ها در یک سیستم ساده و منظم.',
  homeHeroPrimaryLabel: 'درخواست دمو',
  homeHeroPrimaryHref: '/demo-request',
  homeHeroSecondaryLabel: 'ورود به سیستم',
  homeHeroSecondaryHref: '/login',
  homeHeroTags: ['مدیریت شاگردان', 'فیس و حاضری', 'امتحانات و گزارش‌ها'],
  salesQuickCards: [
    { title: 'برای مدیریت مکتب', text: 'کنترول صنف‌ها، استادان، شاگردان، گزارش‌ها و تنظیمات عمومی.', value: 'fa-school' },
    { title: 'برای بخش مالی', text: 'ثبت فیس، رسید پرداخت، تخفیف، باقیات و گزارش مالی.', value: 'fa-receipt' },
    { title: 'برای آموزش', text: 'حاضری، امتحانات، نمرات، کارخانگی و تقسیم اوقات.', value: 'fa-graduation-cap' }
  ],
  salesModules: [
    { title: 'مدیریت شاگردان', text: 'ثبت معلومات شخصی، صنف، سال تعلیمی، اسناد و وضعیت شاگرد.', value: 'fa-user-graduate' },
    { title: 'مدیریت مالی', text: 'فیس ماهانه، داخله، تخفیف، پرداخت، رسید و باقیات.', value: 'fa-wallet' },
    { title: 'مدیریت امتحانات', text: 'ثبت نمرات، جدول نتایج، کارنامه PDF و گزارش صنفی.', value: 'fa-clipboard-check' },
    { title: 'حاضری', text: 'حاضری روزانه شاگردان، استادان و کارمندان.', value: 'fa-calendar-check' },
    { title: 'تقسیم اوقات', text: 'تنظیم روز، ساعت، مضمون، صنف و استاد در یک برنامه منظم.', value: 'fa-calendar-days' },
    { title: 'گزارش‌ها', text: 'گزارش مالی، آموزشی، حاضری و وضعیت عمومی مکتب.', value: 'fa-chart-line' }
  ],
  salesAudience: [
    'مکاتب خصوصی',
    'مکاتب دخترانه و پسرانه',
    'آموزشگاه‌ها',
    'مراکز کورس‌های آموزشی',
    'اداره‌هایی که ثبت شاگرد، فیس و گزارشات را دیجیتال می‌کنند'
  ],
  salesTrustTitle: 'ساخته‌شده برای نیازهای واقعی مکاتب افغانستان',
  salesTrustText: 'ساختار صنف‌ها، سال تعلیمی، فیس، حاضری، امتحانات و گزارش‌ها مطابق کار روزانه مکتب تنظیم می‌شود و برای هر مکتب قابل تغییر است.',
  salesTrustPoints: ['راه‌اندازی مرحله‌به‌مرحله', 'دسترسی جداگانه برای نقش‌ها', 'گزارش‌های قابل پیگیری'],
  salesDashboardCards: [
    { title: 'پنل مدیریت', text: 'شاگردان و استادان | صنف‌ها و سال تعلیمی | گزارش عمومی' },
    { title: 'پنل مالی', text: 'فیس و پرداخت‌ها | رسید و تخفیف | باقیات و گزارش مالی' },
    { title: 'پنل استاد', text: 'حاضری روزانه | نمره‌دهی | کارخانگی و مضمون' },
    { title: 'پنل شاگرد و والدین', text: 'نمرات و کارنامه | حاضری | برنامه درسی و اطلاعیه‌ها' }
  ],
  salesFaqs: [
    { title: 'آیا این سیستم برای هر مکتب قابل تنظیم است؟', text: 'بلی، ساختار صنف‌ها، سال تعلیمی، فیس، امتحانات، نقش‌ها و گزارش‌ها مطابق نیاز هر مکتب تنظیم می‌شود.' },
    { title: 'برای شروع استفاده از سیستم چه نیاز است؟', text: 'ابتدا معلومات پایه مکتب، صنف‌ها، استادان، شاگردان و تنظیمات مالی وارد می‌شود؛ بعد سیستم برای کاربران فعال می‌گردد.' },
    { title: 'آیا بخش مالی و رسید پرداخت دارد؟', text: 'بلی، ثبت فیس، تخفیف، پرداخت، باقیات، رسید و گزارش مالی در ساختار سیستم پیش‌بینی شده است.' },
    { title: 'آیا شاگردان و استادان پنل جداگانه دارند؟', text: 'بلی، هر نقش با دسترسی مناسب خود وارد سیستم می‌شود و فقط بخش‌های مربوط به خودش را می‌بیند.' }
  ],
  homeSlides: [
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
  ],
  homeStats: [
    { value: '6+', text: 'ماژول اصلی مدیریتی' },
    { value: '100%', text: 'قابل تنظیم برای هر مکتب' },
    { value: '24/7', text: 'دسترسی به گزارش‌ها' },
    { value: '4', text: 'پنل مدیریت، مالی، استاد و شاگرد' }
  ],
  homeFeatures: [
    { title: 'مدیریت شاگردان', text: 'ثبت معلومات، صنف، اسناد و وضعیت شاگردان.' },
    { title: 'مدیریت مالی و فیس', text: 'رسید پرداخت، تخفیف، باقیات و گزارش مالی.' },
    { title: 'حاضری و امتحانات', text: 'حاضری روزانه، نمرات، کارنامه و گزارش صنفی.' }
  ],
  homeNews: [
    { title: 'برنامه آزمون‌های میان‌دوره', text: 'تقویم آزمون‌ها به تفکیک صنف‌ها در پنل دانش‌آموزان منتشر شد.', href: '/news' },
    { title: 'کارگاه مهارت‌های مطالعه', text: 'ثبت‌نام کارگاه ویژه تقویت مهارت‌های مطالعه و برنامه‌ریزی آغاز شد.', href: '/news' },
    { title: 'ارزیابی رضایت والدین', text: 'فرم بازخورد والدین برای ارتقاء کیفیت آموزش فعال شد.', href: '/news' }
  ],
  homeSteps: [
    { text: 'صنف و مضمون خود را انتخاب کنید' },
    { text: 'ثبت نام و پرداخت را انجام دهید' },
    { text: 'یادگیری و آزمون را آغاز کنید' }
  ],
  homeCtaTitle: 'می‌خواهید سیستم را برای مکتب خود فعال کنید؟',
  homeCtaText: 'برای دریافت دمو، قیمت و راه‌اندازی با ما تماس بگیرید.',
  homeCtaLabel: 'درخواست دمو',
  homeCtaHref: '/demo-request',

  signatureUrl: '',
  signatureName: 'مدیر مکتب',
  stampUrl: '',

  menuBlueprints: JSON.parse(JSON.stringify(defaultMenuBlueprints)),
  mainMenu: [
    {
      title: 'خانه',
      href: '/',
      enabled: true,
      icon: 'fa-house',
      children: []
    },
    {
      title: 'آموزش',
      href: '',
      enabled: true,
      icon: 'fa-graduation-cap',
      children: [
        { title: 'صنف‌ها', href: '/courses', icon: 'fa-chalkboard-teacher' },
        { title: 'تقسیم اوقات', href: '/schedule', icon: 'fa-calendar-days' },
        { title: 'کارخانگی', href: '/my-homework', icon: 'fa-file-pen' },
        { title: 'آزمون آنلاین', href: '/courses', icon: 'fa-clipboard-list' },
        { title: 'کارنامه و نمرات', href: '/my-grades', icon: 'fa-chart-line' }
      ]
    },
    {
      title: 'سیستم مجازی',
      href: '',
      enabled: true,
      icon: 'fa-video',
      children: [
        { title: 'کلاس‌های آنلاین (چت/جلسه)', href: '/chat', icon: 'fa-headset' },
        { title: 'جلسات زمان‌بندی', href: '/schedule', icon: 'fa-clock' },
        { title: 'ضبط جلسات', href: '/recordings', icon: 'fa-record-vinyl' },
        { title: 'کارخانگی آنلاین', href: '/my-homework', icon: 'fa-file-pen' },
        { title: 'آزمون آنلاین', href: '/courses', icon: 'fa-clipboard-list' },
        { title: 'راهنمای استفاده', href: '/faq', icon: 'fa-circle-info' }
      ]
    },
    {
      title: 'اخبار و اعلانات',
      href: '/news',
      enabled: true,
      icon: 'fa-bullhorn',
      children: [
        { title: 'اخبار', href: '/news', icon: 'fa-newspaper' },
        { title: 'اعلانات', href: '/news#announcements', icon: 'fa-bell' },
        { title: 'رویدادها', href: '/news#events', icon: 'fa-calendar-check' }
      ]
    },
    {
      title: 'گالری',
      href: '/gallery',
      enabled: true,
      icon: 'fa-images',
      children: []
    },
    {
      title: 'درباره ما',
      href: '/about',
      enabled: true,
      icon: 'fa-circle-nodes',
      children: [
        { title: 'معرفی مدرسه', href: '/about', icon: 'fa-school' },
        { title: 'تیم آموزشی', href: '/about#team', icon: 'fa-people-group' },
        { title: 'قوانین و مقررات', href: '/terms', icon: 'fa-scale-balanced' }
      ]
    },
    {
      title: 'تماس با ما',
      href: '/contact',
      enabled: true,
      icon: 'fa-phone',
      children: [
        { title: 'اطلاعات تماس', href: '/contact', icon: 'fa-location-dot' },
        { title: 'پشتیبانی', href: '/contact#support', icon: 'fa-life-ring' }
      ]
    },
    {
      title: 'ورود',
      href: '/login',
      enabled: true,
      icon: 'fa-right-to-bracket',
      children: []
    }
  ],
  adminQuickLinks: [
    { title: 'کاربران', href: '/admin-users', permission: 'manage_users', enabled: true },
    { title: 'مرکز مالی', href: '/admin-finance', permission: 'manage_finance', enabled: true },
    { title: 'گزارشات', href: '/admin-stats', permission: 'view_reports', enabled: true },
    { title: 'لاگ‌ها', href: '/admin-logs', permission: 'view_reports', enabled: true },
    { title: 'اخبار', href: '/admin-news', permission: 'manage_content', enabled: true },
    { title: 'گالری', href: '/admin-gallery', permission: 'manage_content', enabled: true },
    { title: 'مرکز ارتباطات سیما', href: '/admin-communications', permission: 'manage_platform_requests', enabled: true },
    { title: 'داده‌های آموزشی', href: '/admin-education', permission: 'manage_content', enabled: true },
    { title: 'ثبت‌نام‌ها', href: '/admin-enrollments', permission: 'manage_enrollments', enabled: true },
    { title: 'ممبرشیپ آموزشی', href: '/admin-education?section=enrollments', permission: 'manage_memberships', enabled: true },
    { title: 'تقسیم اوقات', href: '/timetable/viewer', permission: 'view_schedule', enabled: true },
    { title: 'مدیریت تقسیم اوقات', href: '/admin-schedule', permission: 'manage_schedule', enabled: true }
  ],
  footerLinks: [
    { title: 'درباره ما', href: '/about' },
    { title: 'آموزش', href: '/courses' },
    { title: 'شمولیت', href: '/register' },
    { title: 'تماس با ما', href: '/contact' }
  ],
  socialLinks: [
    { title: 'Facebook', href: '' },
    { title: 'Instagram', href: '' },
    { title: 'WhatsApp', href: '' },
    { title: 'TikTok', href: '' }
  ],
  footerHours: [
    { title: 'شنبه', href: '08:00 - 17:00' },
    { title: 'یکشنبه', href: '08:00 - 17:00' },
    { title: 'دوشنبه', href: '08:00 - 17:00' },
    { title: 'سه‌شنبه', href: '08:00 - 17:00' },
    { title: 'چهارشنبه', href: '08:00 - 17:00' },
    { title: 'پنج‌شنبه', href: '08:00 - 17:00' }
  ]
});

const ensureSettings = async () => {
  let settings = await SiteSettings.findOne();
  if (!settings) {
    settings = await SiteSettings.create(defaultSettings());
  } else {
    const defaults = defaultSettings();
    let shouldSave = false;
    const brandName = String(settings.brandName || '').trim();
    const brandSubtitle = String(settings.brandSubtitle || '').trim();
    const heroBadge = String(settings.homeHeroBadge || '').trim();
    const legacyBrandNames = ['مدرسه ایمان', 'سیستم مدیریت هوشمند مکتب'];
    const legacyBrandSubtitles = ['Academy Pro', 'نرم‌افزار مدیریت مکاتب افغانستان'];

    if (!brandName || legacyBrandNames.includes(brandName)) {
      settings.brandName = defaults.brandName;
      shouldSave = true;
    }

    if (!brandSubtitle || legacyBrandSubtitles.includes(brandSubtitle)) {
      settings.brandSubtitle = defaults.brandSubtitle;
      shouldSave = true;
    }

    if (!heroBadge || heroBadge.includes('مدرسه ایمان') || heroBadge.includes('Academy Pro')) {
      settings.homeHeroBadge = defaults.homeHeroBadge;
      shouldSave = true;
    }

    if (['ساعات کاری', ''].includes(String(settings.hoursLabel || '').trim())) {
      settings.hoursLabel = defaults.hoursLabel;
      shouldSave = true;
    }

    if (['شنبه تا پنج‌شنبه 08:00 - 17:00', ''].includes(String(settings.hoursText || '').trim())) {
      settings.hoursText = defaults.hoursText;
      shouldSave = true;
    }

    if (['تماس با ما', ''].includes(String(settings.contactLabel || '').trim())) {
      settings.contactLabel = defaults.contactLabel;
      shouldSave = true;
    }

    if (['مسیر یادگیری حرفه‌ای را بسازید', ''].includes(String(settings.homeHeroTitle || '').trim())) {
      settings.homeHeroTitle = defaults.homeHeroTitle;
      shouldSave = true;
    }

    if (['نظم، نظم، نتیجه', ''].includes(String(settings.homeHeroHighlight || '').trim())) {
      settings.homeHeroHighlight = defaults.homeHeroHighlight;
      shouldSave = true;
    }

    if (String(settings.homeHeroText || '').includes('دوره‌های ساختارمند')) {
      settings.homeHeroText = defaults.homeHeroText;
      shouldSave = true;
    }

    if (['مشاهده صنف‌ها', ''].includes(String(settings.homeHeroPrimaryLabel || '').trim())) {
      settings.homeHeroPrimaryLabel = defaults.homeHeroPrimaryLabel;
      settings.homeHeroPrimaryHref = defaults.homeHeroPrimaryHref;
      shouldSave = true;
    }

    if (String(settings.homeHeroPrimaryHref || '').trim() === '/contact') {
      settings.homeHeroPrimaryHref = defaults.homeHeroPrimaryHref;
      shouldSave = true;
    }

    if (['ثبت نام رایگان', ''].includes(String(settings.homeHeroSecondaryLabel || '').trim())) {
      settings.homeHeroSecondaryLabel = defaults.homeHeroSecondaryLabel;
      settings.homeHeroSecondaryHref = defaults.homeHeroSecondaryHref;
      shouldSave = true;
    }

    if (['/register', '/contact', ''].includes(String(settings.homeCtaHref || '').trim())) {
      settings.homeCtaTitle = defaults.homeCtaTitle;
      settings.homeCtaText = defaults.homeCtaText;
      settings.homeCtaLabel = defaults.homeCtaLabel;
      settings.homeCtaHref = defaults.homeCtaHref;
      shouldSave = true;
    }

    if (typeof settings.footerShowHours !== 'boolean') {
      settings.footerShowHours = defaults.footerShowHours;
      shouldSave = true;
    }

    if (typeof settings.footerShowSocial !== 'boolean') {
      settings.footerShowSocial = defaults.footerShowSocial;
      shouldSave = true;
    }

    if (typeof settings.footerShowLinks !== 'boolean') {
      settings.footerShowLinks = defaults.footerShowLinks;
      shouldSave = true;
    }

    if (typeof settings.footerShowContact !== 'boolean') {
      settings.footerShowContact = defaults.footerShowContact;
      shouldSave = true;
    }

    if (typeof settings.footerShowCopyright !== 'boolean') {
      settings.footerShowCopyright = true;
      shouldSave = true;
    }

    if (typeof settings.footerHoursTitle !== 'string') {
      settings.footerHoursTitle = defaults.footerHoursTitle;
      shouldSave = true;
    }

    if (typeof settings.footerSocialTitle !== 'string') {
      settings.footerSocialTitle = defaults.footerSocialTitle;
      shouldSave = true;
    }

    if (typeof settings.footerLinksTitle !== 'string') {
      settings.footerLinksTitle = defaults.footerLinksTitle;
      shouldSave = true;
    }

    if (typeof settings.footerContactTitle !== 'string') {
      settings.footerContactTitle = defaults.footerContactTitle;
      shouldSave = true;
    }

    if (typeof settings.footerContactText !== 'string') {
      settings.footerContactText = defaults.footerContactText;
      shouldSave = true;
    }

    if (typeof settings.footerNote !== 'string') {
      settings.footerNote = defaults.footerNote;
      shouldSave = true;
    }

    if (typeof settings.footerCopyright !== 'string') {
      settings.footerCopyright = defaults.footerCopyright;
      shouldSave = true;
    }

    if (!settings.platformInboxEmails || typeof settings.platformInboxEmails !== 'object') {
      settings.platformInboxEmails = defaults.platformInboxEmails;
      shouldSave = true;
    } else {
      const currentInbox = settings.platformInboxEmails;
      ['official', 'personal'].forEach((key) => {
        if (typeof currentInbox[key] !== 'string') {
          currentInbox[key] = defaults.platformInboxEmails[key];
          shouldSave = true;
        }
      });
      ['sendDemo', 'sendContact', 'sendSuggestion', 'sendComplaint'].forEach((key) => {
        if (typeof currentInbox[key] !== 'boolean') {
          currentInbox[key] = defaults.platformInboxEmails[key];
          shouldSave = true;
        }
      });
    }

    if (!Array.isArray(settings.homeSlides) || !settings.homeSlides.length) {
      settings.homeSlides = defaults.homeSlides;
      shouldSave = true;
    }

    [
      'salesQuickCards',
      'salesModules',
      'salesAudience',
      'salesTrustPoints',
      'salesDashboardCards',
      'salesFaqs'
    ].forEach((key) => {
      if (!Array.isArray(settings[key]) || !settings[key].length) {
        settings[key] = defaults[key];
        shouldSave = true;
      }
    });

    if (typeof settings.salesTrustTitle !== 'string' || !settings.salesTrustTitle.trim()) {
      settings.salesTrustTitle = defaults.salesTrustTitle;
      shouldSave = true;
    }

    if (typeof settings.salesTrustText !== 'string' || !settings.salesTrustText.trim()) {
      settings.salesTrustText = defaults.salesTrustText;
      shouldSave = true;
    }

    if (!settings.menuBlueprints || typeof settings.menuBlueprints !== 'object' || Array.isArray(settings.menuBlueprints)) {
      settings.menuBlueprints = JSON.parse(JSON.stringify(defaultMenuBlueprints));
      shouldSave = true;
    }

    if (!Array.isArray(settings.adminQuickLinks) || !settings.adminQuickLinks.length) {
      settings.adminQuickLinks = defaults.adminQuickLinks;
      shouldSave = true;
    }

    if (!Array.isArray(settings.footerLinks) || !settings.footerLinks.length) {
      settings.footerLinks = defaults.footerLinks;
      shouldSave = true;
    }

    if (!Array.isArray(settings.socialLinks) || !settings.socialLinks.length) {
      settings.socialLinks = defaults.socialLinks;
      shouldSave = true;
    }

    if (!Array.isArray(settings.footerHours) || !settings.footerHours.length) {
      settings.footerHours = defaults.footerHours;
      shouldSave = true;
    }

    if (normalizeVirtualMenuItems(settings)) {
      shouldSave = true;
    }

    if (shouldSave) {
      await settings.save();
    }
  }
  return settings;
};

router.get('/login-page', async (req, res) => {
  try {
    const settings = await ensureSettings();
    
    // Return only login page specific settings
    const loginSettings = {
      brandName: settings.brandName || 'سیما',
      brandSubtitle: settings.brandSubtitle || 'سیستم مدیریت هوشمند مکاتیب افغانستان',
      logoUrl: settings.logoUrl || '',
      loginPageTitle: settings.homeHeroTitle || 'سیما؛ سیستم مدیریت هوشمند مکاتیب افغانستان',
      loginPageSubtitle: settings.homeHeroHighlight || 'مدیریت کامل مکتب در یک سیستم',
      loginPageText: settings.homeHeroText || 'مدیریت شاگردان، استادان، حاضری، فیس، امتحانات، تقسیم اوقات و گزارش‌ها در یک سیستم ساده و منظم.',
      primaryLabel: settings.homeHeroPrimaryLabel || 'درخواست دمو',
      primaryHref: settings.homeHeroPrimaryHref || '/demo-request',
      secondaryLabel: settings.homeHeroSecondaryLabel || 'ورود به سیستم',
      secondaryHref: settings.homeHeroSecondaryHref || '/login',
      languages: settings.languages || ['فارسی', 'English'],
      footerShowCopyright: settings.footerShowCopyright,
      footerCopyright: settings.footerCopyright,
      footerNote: settings.footerNote,
      socialLinks: settings.socialLinks || []
    };
    
    res.json({ success: true, settings: loginSettings });
  } catch (error) {
    console.error('Error fetching login page settings:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات صفحه ورود' });
  }
});

router.get('/public', async (req, res) => {
  try {
    const settings = await ensureSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات' });
  }
});

router.get('/', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const settings = await ensureSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات' });
  }
});

router.put('/', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const update = req.body || {};
    const settings = await ensureSettings();
    Object.assign(settings, update);
    await settings.save();
    res.json({ success: true, settings, message: 'تنظیمات ذخیره شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ذخیره تنظیمات' });
  }
});

router.put('/logo', requireAuth, requireRole(['admin']), requirePermission('manage_content'), (req, res, next) => {
  logoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'لوگو الزامی است' });
    }
    const settings = await ensureSettings();
    settings.logoUrl = `uploads/site/${req.file.filename}`;
    await settings.save();
    res.json({ success: true, settings, message: 'لوگو بروزرسانی شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در آپلود لوگو' });
  }
});

router.put('/assets', requireAuth, requireRole(['admin']), requirePermission('manage_content'), (req, res, next) => {
  assetUpload.fields([
    { name: 'signature', maxCount: 1 },
    { name: 'stamp', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const settings = await ensureSettings();
    if (req.files?.signature?.[0]?.filename) {
      settings.signatureUrl = `uploads/site/${req.files.signature[0].filename}`;
    }
    if (req.files?.stamp?.[0]?.filename) {
      settings.stampUrl = `uploads/site/${req.files.stamp[0].filename}`;
    }
    if (req.body?.signatureName) {
      settings.signatureName = String(req.body.signatureName);
    }
    await settings.save();
    res.json({ success: true, settings, message: 'دارایی‌ها بروزرسانی شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در بروزرسانی دارایی‌ها' });
  }
});

module.exports = router;
