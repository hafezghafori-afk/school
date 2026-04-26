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
  brandName: { type: String, default: 'مدرسه ایمان' },
  brandSubtitle: { type: String, default: 'Academy Pro' },
  logoUrl: { type: String, default: '' },
  hoursLabel: { type: String, default: 'ساعات کاری' },
  hoursText: { type: String, default: 'شنبه تا پنج‌شنبه 08:00 - 17:00' },
  contactLabel: { type: String, default: 'تماس با ما' },
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
  footerHoursTitle: { type: String, default: 'ساعات کاری' },
  footerSocialTitle: { type: String, default: 'شبکه‌های اجتماعی' },
  footerLinksTitle: { type: String, default: 'لینک‌های مفید' },
  footerContactTitle: { type: String, default: 'ارتباط با ما' },
  footerContactText: { type: String, default: '' },
  footerNote: { type: String, default: '' },
  footerCopyright: { type: String, default: '' },

  homeHeroBadge: { type: String, default: 'مدرسه ایمان | سیستم مدیریت یادگیری هوشمند' },
  homeHeroTitle: { type: String, default: 'مسیر یادگیری حرفه‌ای را بسازید' },
  homeHeroHighlight: { type: String, default: 'نظم، نظم، نتیجه' },
  homeHeroText: { type: String, default: 'دوره‌های ساختارمند، جزوه‌های دقیق و مسیر پیشرفت روشن برای هر صنف.' },
  homeHeroPrimaryLabel: { type: String, default: 'مشاهده صنف‌ها' },
  homeHeroPrimaryHref: { type: String, default: '/courses' },
  homeHeroSecondaryLabel: { type: String, default: 'ثبت نام رایگان' },
  homeHeroSecondaryHref: { type: String, default: '/register' },
  homeHeroTags: { type: [String], default: ['صنف 1 تا 12', 'ویدیو + جزوه', 'آزمون و پیشرفت'] },
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
    { value: '12', text: 'صنف فعال' },
    { value: '+80', text: 'مضمون آموزشی' },
    { value: '24/7', text: 'دسترسی به محتوا' },
    { value: '+8K', text: 'دانش‌آموز' }
  ] },
  homeFeatures: { type: [listSchema], default: [
    { title: 'مسیر یادگیری واضح', text: 'هر درس هدف دارد و هر صنف مسیر مشخص.' },
    { title: 'محتوای چند رسانه‌ای', text: 'ویدیو، PDF و آزمون برای یادگیری کامل.' },
    { title: 'گزارش پیشرفت', text: 'عملکرد دانش‌آموزان به صورت دقیق قابل پیگیری است.' }
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
  homeCtaHref: { type: String, default: '/register' },

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
