import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './AdminSettings.css';
import { API_BASE } from '../config/api';
import LoginSettingsManager from '../components/LoginSettingsManager';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const MENUS = [
  { key: 'home', title: 'خانه', icon: 'fa-house', href: '/', hint: 'هیرو، آمار، ویژگی‌ها و فراخوان اقدام' },
  { key: 'education', title: 'آموزش', icon: 'fa-graduation-cap', href: '/courses', hint: 'صنف‌ها، تقسیم اوقات، کارخانگی و کارنامه' },
  { key: 'virtual', title: 'سیستم مجازی', icon: 'fa-video', href: '/chat?tab=live', hint: 'چت، صنف‌های آنلاین، ضبط و آرشیف جلسات' },
  { key: 'news', title: 'اخبار و اعلانات', icon: 'fa-bullhorn', href: '/news', hint: 'خبر، اعلان، رویداد و آرشیف' },
  { key: 'gallery', title: 'گالری', icon: 'fa-images', href: '/gallery', hint: 'آلبوم تصاویر و دسته‌بندی رسانه' },
  { key: 'about', title: 'درباره ما', icon: 'fa-circle-info', href: '/about', hint: 'معرفی مدرسه، تیم و قوانین' },
  { key: 'contact', title: 'تماس با ما', icon: 'fa-phone', href: '/contact', hint: 'شماره تماس، ایمیل، آدرس و پشتیبانی' },
  { key: 'auth', title: 'ورود', icon: 'fa-right-to-bracket', href: '/login', hint: 'ورود عمومی و ثبت‌نام یکپارچه' },
  { key: 'login-page', title: 'صفحه ورود', icon: 'fa-user-lock', href: '/login', hint: 'شخصی‌سازی ظاهر و تنظیمات صفحه ورود' }
];

const ADMIN_QUICK_LINK_PERMISSION_OPTIONS = [
  { value: '', label: 'عمومی (بدون مجوز خاص)' },
  { value: 'manage_users', label: 'مدیریت کاربران' },
  { value: 'manage_enrollments', label: 'مدیریت ثبت‌نام‌ها' },
  { value: 'manage_memberships', label: 'مدیریت ممبرشیپ آموزشی' },
  { value: 'manage_finance', label: 'مدیریت مالی' },
  { value: 'manage_content', label: 'مدیریت محتوا' },
  { value: 'view_reports', label: 'مشاهده گزارشات' },
  { value: 'view_schedule', label: 'مشاهده تقسیم اوقات' },
  { value: 'manage_schedule', label: 'مدیریت تقسیم اوقات' }
];

const ADMIN_QUICK_LINK_PERMISSION_SET = new Set(
  ADMIN_QUICK_LINK_PERMISSION_OPTIONS.map((item) => item.value)
);
const ADMIN_SCHEDULE_ROUTE = '/timetable/editor';
const ADMIN_SCHEDULE_VIEW_ROUTE = '/timetable/viewer';

const ADMIN_QUICK_LINK_DEFAULTS = [
  { title: 'کاربران', href: '/admin-users', permission: 'manage_users', enabled: true },
  { title: 'مرکز مالی', href: '/admin-finance', permission: 'manage_finance', enabled: true },
  { title: 'عضویت‌های مالی', href: '/admin-financial-memberships', permission: 'manage_finance', enabled: true },
  { title: 'گزارشات', href: '/admin-stats', permission: 'view_reports', enabled: true },
  { title: 'لاگ‌ها', href: '/admin-logs', permission: 'view_reports', enabled: true },
  { title: 'اخبار', href: '/admin-news', permission: 'manage_content', enabled: true },
  { title: 'گالری', href: '/admin-gallery', permission: 'manage_content', enabled: true },
  { title: 'پیام‌ها', href: '/admin-contact', permission: 'manage_content', enabled: true },
  { title: 'داده‌های آموزشی', href: '/admin-education', permission: 'manage_content', enabled: true },
  { title: 'ثبت‌نام‌ها', href: '/admin-enrollments', permission: 'manage_enrollments', enabled: true },
  { title: 'ممبرشیپ آموزشی', href: '/admin-education?section=enrollments', permission: 'manage_memberships', enabled: true },
  { title: 'تقسیم اوقات', href: ADMIN_SCHEDULE_VIEW_ROUTE, permission: 'view_schedule', enabled: true },
  { title: 'مدیریت تقسیم اوقات', href: ADMIN_SCHEDULE_ROUTE, permission: 'manage_schedule', enabled: true }
];

const MENU_CHILD_TEMPLATES = {
  home: [],
  education: [
    { title: 'صنف‌ها', href: '/courses', icon: 'fa-chalkboard-teacher', enabled: true },
    { title: 'تقسیم اوقات', href: '/schedule', icon: 'fa-calendar-days', enabled: true },
    { title: 'کارخانگی', href: '/my-homework', icon: 'fa-file-pen', enabled: true },
    { title: 'آزمون آنلاین', href: '/courses', icon: 'fa-clipboard-list', enabled: true },
    { title: 'کارنامه و نمرات', href: '/my-grades', icon: 'fa-chart-line', enabled: true }
  ],
  virtual: [
    { title: 'صنف‌های آنلاین (چت/جلسه)', href: '/chat?tab=live', icon: 'fa-headset', enabled: true },
    { title: 'جلسات زمان‌بندی', href: '/schedule', icon: 'fa-clock', enabled: true },
    { title: 'ضبط جلسات', href: '/recordings', icon: 'fa-record-vinyl', enabled: true },
    { title: 'کارخانگی آنلاین', href: '/my-homework', icon: 'fa-file-pen', enabled: true },
    { title: 'آزمون آنلاین', href: '/courses', icon: 'fa-clipboard-list', enabled: true },
    { title: 'راهنمای استفاده', href: '/faq', icon: 'fa-circle-info', enabled: true }
  ],
  news: [
    { title: 'اخبار', href: '/news', icon: 'fa-newspaper', enabled: true },
    { title: 'اعلانات', href: '/news#announcements', icon: 'fa-bell', enabled: true },
    { title: 'رویدادها', href: '/news#events', icon: 'fa-calendar-check', enabled: true }
  ],
  gallery: [],
  about: [
    { title: 'معرفی مدرسه', href: '/about', icon: 'fa-school', enabled: true },
    { title: 'تیم آموزشی', href: '/about#team', icon: 'fa-people-group', enabled: true },
    { title: 'قوانین و مقررات', href: '/terms', icon: 'fa-scale-balanced', enabled: true }
  ],
  contact: [
    { title: 'اطلاعات تماس', href: '/contact', icon: 'fa-location-dot', enabled: true },
    { title: 'پشتیبانی', href: '/contact#support', icon: 'fa-life-ring', enabled: true }
  ],
  auth: [
    { title: 'ورود عمومی', href: '/login', icon: 'fa-right-to-bracket', enabled: true },
    { title: 'ثبت‌نام آنلاین', href: '/register', icon: 'fa-user-plus', enabled: true }
  ]
};

const BLUEPRINT_PRESETS = {
  home: {
    label: 'راهنمای سریع',
    summary: 'دسترسی سریع به ثبت‌نام، صنف‌ها و اخبار از منوی خانه.',
    points: ['شروع سریع ثبت‌نام', 'ورود به صنف‌ها', 'دسترسی مستقیم به اخبار'],
    actions: [
      { title: 'صفحه خانه', href: '/' },
      { title: 'ثبت‌نام آنلاین', href: '/register' }
    ],
    sectionOrder: ['خدمات', 'آموزش', 'محتوا', 'راهنما', 'بیشتر']
  },
  education: {
    label: 'مسیر آموزشی',
    summary: 'مسیر کامل صنف، کارخانگی، آزمون و کارنامه در یک منو.',
    points: ['صنف‌ها و مضامین', 'تقسیم اوقات', 'نمرات و کارنامه'],
    actions: [
      { title: 'مشاهده صنف‌ها', href: '/courses' },
      { title: 'تقسیم اوقات', href: '/schedule' }
    ],
    sectionOrder: ['آموزش', 'خدمات', 'راهنما', 'بیشتر']
  },
  virtual: {
    label: 'کلاس مجازی',
    summary: 'چت، صنف‌های آنلاین، ضبط جلسه و آرشیف آموزشی.',
    points: ['چت مستقیم', 'جلسات زمان‌بندی', 'آرشیف ضبط'],
    actions: [
      { title: 'ورود به چت', href: '/chat' },
      { title: 'ضبط جلسات', href: '/recordings' }
    ],
    sectionOrder: ['آموزش', 'خدمات', 'راهنما', 'بیشتر']
  },
  news: {
    label: 'بخش محتوا',
    summary: 'اخبار، اعلانات و رویدادها را یکپارچه مدیریت کنید.',
    points: ['خبر تازه', 'اعلانات', 'رویدادها'],
    actions: [
      { title: 'همه اخبار', href: '/news' },
      { title: 'گالری تصاویر', href: '/gallery' }
    ],
    sectionOrder: ['محتوا', 'راهنما', 'بیشتر']
  },
  gallery: {
    label: 'گالری',
    summary: 'آلبوم تصاویر رویدادها و فعالیت‌های مدرسه.',
    points: ['تصاویر رویدادها', 'دسته‌بندی ساده', 'نمایش بهینه موبایل'],
    actions: [
      { title: 'مشاهده گالری', href: '/gallery' },
      { title: 'اخبار مرتبط', href: '/news' }
    ],
    sectionOrder: ['محتوا', 'راهنما', 'بیشتر']
  },
  about: {
    label: 'آشنایی با مدرسه',
    summary: 'معرفی مدرسه، تیم آموزشی و قوانین کلیدی.',
    points: ['معرفی مدرسه', 'تیم آموزشی', 'قوانین'],
    actions: [
      { title: 'درباره ما', href: '/about' },
      { title: 'قوانین', href: '/terms' }
    ],
    sectionOrder: ['راهنما', 'خدمات', 'بیشتر']
  },
  contact: {
    label: 'ارتباط و پشتیبانی',
    summary: 'شماره تماس، ایمیل و کانال‌های پشتیبانی در دسترس.',
    points: ['شماره تماس', 'پشتیبانی', 'سوالات متداول'],
    actions: [
      { title: 'تماس با ما', href: '/contact' },
      { title: 'سوالات متداول', href: '/faq' }
    ],
    sectionOrder: ['راهنما', 'خدمات', 'بیشتر']
  },
  auth: {
    label: 'ورود و خدمات',
    summary: 'ورود نقش‌ها و ثبت‌نام آنلاین به صورت یکپارچه.',
    points: ['ورود عمومی', 'ثبت‌نام آنلاین', 'دسترسی یکپارچه نقش‌ها'],
    actions: [
      { title: 'ورود عمومی', href: '/login' },
      { title: 'ثبت‌نام آنلاین', href: '/register' }
    ],
    sectionOrder: ['خدمات', 'راهنما', 'بیشتر']
  }
};

const MENU_ROOT_DEFAULTS = {
  home: {
    homeHeroBadge: 'مدرسه ایمان | سیستم مدیریت یادگیری هوشمند',
    homeHeroTitle: 'مسیر یادگیری حرفه‌ای را بسازید',
    homeHeroHighlight: 'نظم، نظم، نتیجه',
    homeHeroText: 'دوره‌های ساختارمند، جزوه‌های دقیق و مسیر پیشرفت روشن برای هر صنف.',
    homeHeroPrimaryLabel: 'مشاهده صنف‌ها',
    homeHeroPrimaryHref: '/courses',
    homeHeroSecondaryLabel: 'ثبت نام رایگان',
    homeHeroSecondaryHref: '/register',
    homeHeroTags: ['صنف 1 تا 12', 'ویدیو + جزوه', 'آزمون و پیشرفت'],
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
        title: 'صنف‌های آنلاین، چت صنفی و آرشیف جلسه همیشه در دسترس است',
        text: 'تعامل آموزشی را با صنف‌های آنلاین، پیام‌رسانی و آرشیف جلسه بدون جابه‌جایی بین ماژول‌ها دنبال کنید.',
        primaryLabel: 'ورود به چت',
        primaryHref: '/chat',
        secondaryLabel: 'آرشیف جلسات',
        secondaryHref: '/recordings',
        imageUrl: ''
      }
    ],
    homeStats: [
      { value: '12', text: 'صنف فعال' },
      { value: '+80', text: 'مضمون آموزشی' },
      { value: '24/7', text: 'دسترسی به محتوا' },
      { value: '+8K', text: 'دانش‌آموز' }
    ],
    homeFeatures: [
      { title: 'مسیر یادگیری واضح', text: 'هر درس هدف دارد و هر صنف مسیر مشخص.' },
      { title: 'محتوای چند رسانه‌ای', text: 'ویدیو، PDF و آزمون برای یادگیری کامل.' },
      { title: 'گزارش پیشرفت', text: 'عملکرد دانش‌آموزان به صورت دقیق قابل پیگیری است.' }
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
    homeCtaTitle: 'برای آینده آماده اید؟',
    homeCtaText: 'امروز ثبت نام کنید و یادگیری حرفه‌ای را شروع نمایید.',
    homeCtaLabel: 'شروع رایگان',
    homeCtaHref: '/register'
  },
  news: {
    homeNews: [
      { title: 'برنامه آزمون‌های میان‌دوره', text: 'تقویم آزمون‌ها به تفکیک صنف‌ها در پنل دانش‌آموزان منتشر شد.', href: '/news' },
      { title: 'کارگاه مهارت‌های مطالعه', text: 'ثبت‌نام کارگاه ویژه تقویت مهارت‌های مطالعه و برنامه‌ریزی آغاز شد.', href: '/news' },
      { title: 'ارزیابی رضایت والدین', text: 'فرم بازخورد والدین برای ارتقاء کیفیت آموزش فعال شد.', href: '/news' }
    ]
  },
  contact: {
    contactLabel: 'تماس با ما',
    contactPhone: '0702855557',
    contactEmail: 'imanschool.official@gmail.com',
    contactAddress: 'ناحیه 5 کابل افغانستان',
    hoursText: 'شنبه تا پنج‌شنبه 08:00 - 17:00',
    footerContactText: '',
    footerShowHours: true,
    footerShowSocial: true,
    footerShowLinks: true,
    footerShowContact: true,
    footerShowCopyright: true,
    footerHoursTitle: 'ساعات کاری',
    footerSocialTitle: 'شبکه‌های اجتماعی',
    footerLinksTitle: 'لینک‌های مفید',
    footerContactTitle: 'ارتباط با ما',
    footerNote: '',
    footerCopyright: '',
    footerLinks: [
      { title: 'درباره ما', href: '/about' },
      { title: 'آموزش', href: '/courses' },
      { title: 'ثبت نام', href: '/register' },
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
  },
  about: {
    brandName: 'مدرسه ایمان',
    brandSubtitle: 'Academy Pro'
  }
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const normalizeMenuKey = (item = {}) => {
  const title = String(item.title || '');
  const href = String(item.href || '');
  const bag = `${title} ${href}`.toLowerCase();

  if (href === '/' || bag.includes('خانه')) return 'home';
  if (bag.includes('آموزش') || bag.includes('/course') || bag.includes('صنف')) return 'education';
  if (bag.includes('مجازی') || bag.includes('/chat') || bag.includes('/record')) return 'virtual';
  if (bag.includes('خبر') || bag.includes('اعلان') || bag.includes('/news')) return 'news';
  if (bag.includes('گالری') || bag.includes('/gallery')) return 'gallery';
  if (bag.includes('درباره') || bag.includes('/about') || bag.includes('/terms')) return 'about';
  if (bag.includes('تماس') || bag.includes('/contact') || bag.includes('/faq')) return 'contact';
  if (bag.includes('ورود') || bag.includes('/login')) return 'auth';
  return 'home';
};

const createEmptyMenu = (key) => {
  const menuMeta = MENUS.find((item) => item.key === key) || MENUS[0];
  return {
    title: menuMeta.title,
    href: menuMeta.href,
    icon: menuMeta.icon,
    description: '',
    content: '',
    enabled: true,
    children: (MENU_CHILD_TEMPLATES[key] || []).map((item) => ({ ...item }))
  };
};

const findMenuIndex = (menus, key) => {
  if (!Array.isArray(menus)) return -1;
  return menus.findIndex((item) => normalizeMenuKey(item) === key);
};

const parseLines = (value = '') => String(value || '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const toLines = (items = []) => (Array.isArray(items) ? items.filter(Boolean).join('\n') : '');
const HOME_SLIDE_FIELDS = ['badge', 'title', 'text', 'primaryLabel', 'primaryHref', 'secondaryLabel', 'secondaryHref', 'imageUrl'];
const LINK_PAIR_FIELDS = ['title', 'href'];

const parseDelimitedRows = (value = '', fields = ['text']) => parseLines(value).map((line) => {
  const parts = line.split('|').map((part) => part.trim());
  return fields.reduce((acc, field, index) => {
    acc[field] = parts[index] || '';
    return acc;
  }, {});
}).filter((row) => Object.values(row).some(Boolean));

const rowsToDelimited = (rows = [], fields = ['text']) => {
  if (!Array.isArray(rows)) return '';
  return rows
    .map((row) => fields.map((field) => String(row?.[field] || '').trim()).join('|'))
    .filter((line) => line.replace(/\|/g, '').trim())
    .join('\n');
};

const moveItem = (list, index, direction) => {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= list.length) return list;
  const next = [...list];
  const [current] = next.splice(index, 1);
  next.splice(nextIndex, 0, current);
  return next;
};

const normalizeAdminQuickLinks = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const title = String(item?.title || item?.label || '').trim();
      const href = String(item?.href || item?.to || '').trim();
      const permission = String(item?.permission || '').trim();
      const enabled = item?.enabled !== false;
      if (!title || !href) return null;
      return {
        title,
        href,
        permission: ADMIN_QUICK_LINK_PERMISSION_SET.has(permission) ? permission : '',
        enabled
      };
    })
    .filter(Boolean);
};

export default function AdminSettings() {
  const location = useLocation();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [activeMenu, setActiveMenu] = useState('home');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!data?.success) {
        if (res.status === 403) {
          setAccessDenied(true);
        }
        setMessage(data?.message || 'دریافت تنظیمات ناموفق بود.');
        setSettings(null);
        return;
      }
      const nextSettings = data.settings || null;
      if (nextSettings) {
        const normalizedQuickLinks = normalizeAdminQuickLinks(nextSettings.adminQuickLinks);
        nextSettings.adminQuickLinks = normalizedQuickLinks.length
          ? normalizedQuickLinks
          : ADMIN_QUICK_LINK_DEFAULTS.map((item) => ({ ...item }));
      }
      setSettings(nextSettings);
      setAccessDenied(false);
      setMessage('');
    } catch {
      setMessage('خطا در اتصال به سرور');
      setSettings(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const menuKey = new URLSearchParams(location.search).get('menu');
    if (MENUS.some((item) => item.key === menuKey)) {
      setActiveMenu(menuKey);
    }
  }, [location.search]);

  useEffect(() => {
    if (!settings) return;
    const idx = findMenuIndex(settings.mainMenu, activeMenu);
    if (idx >= 0) return;
    setSettings((prev) => ({
      ...prev,
      mainMenu: [...(prev?.mainMenu || []), createEmptyMenu(activeMenu)]
    }));
  }, [settings, activeMenu]);

  const setActive = (menuKey) => {
    setActiveMenu(menuKey);
    navigate(`/admin-settings?menu=${menuKey}`);
  };

  const saveAll = async (successText = 'تنظیمات ذخیره شد.') => {
    if (!settings) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'ذخیره تنظیمات ناموفق بود.');
        return;
      }
      setSettings(data.settings);
      setMessage(successText);
    } catch {
      setMessage('خطا در ذخیره تنظیمات');
    } finally {
      setSaving(false);
    }
  };

  const patchRoot = (patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const patchMenu = (patch) => {
    setSettings((prev) => {
      const nextMenus = [...(prev?.mainMenu || [])];
      let idx = findMenuIndex(nextMenus, activeMenu);
      if (idx < 0) {
        nextMenus.push(createEmptyMenu(activeMenu));
        idx = nextMenus.length - 1;
      }
      nextMenus[idx] = { ...nextMenus[idx], ...patch };
      return { ...prev, mainMenu: nextMenus };
    });
  };

  const patchChildren = (updater) => {
    setSettings((prev) => {
      const nextMenus = [...(prev?.mainMenu || [])];
      let idx = findMenuIndex(nextMenus, activeMenu);
      if (idx < 0) {
        nextMenus.push(createEmptyMenu(activeMenu));
        idx = nextMenus.length - 1;
      }
      const current = Array.isArray(nextMenus[idx].children) ? nextMenus[idx].children : [];
      nextMenus[idx] = {
        ...nextMenus[idx],
        children: updater([...current])
      };
      return { ...prev, mainMenu: nextMenus };
    });
  };

  const patchBlueprint = (patch) => {
    setSettings((prev) => ({
      ...prev,
      menuBlueprints: {
        ...(prev?.menuBlueprints || {}),
        [activeMenu]: {
          label: '',
          summary: '',
          points: [],
          actions: [],
          sectionOrder: [],
          ...(prev?.menuBlueprints?.[activeMenu] || {}),
          ...patch
        }
      }
    }));
  };

  const resetChildrenToTemplate = () => {
    const template = MENU_CHILD_TEMPLATES[activeMenu] || [];
    patchMenu({
      children: template.map((item) => ({ ...item }))
    });
  };

  const resetBlueprintToPreset = () => {
    const preset = BLUEPRINT_PRESETS[activeMenu];
    if (!preset) return;
    patchBlueprint({
      ...preset,
      points: [...(preset.points || [])],
      actions: (preset.actions || []).map((item) => ({ ...item })),
      sectionOrder: [...(preset.sectionOrder || [])]
    });
  };

  const resetActiveMenuToDefaults = () => {
    const menuDefault = createEmptyMenu(activeMenu);
    const blueprintDefault = BLUEPRINT_PRESETS[activeMenu];
    const rootDefaults = MENU_ROOT_DEFAULTS[activeMenu];

    setSettings((prev) => {
      const nextMenus = [...(prev?.mainMenu || [])];
      const nextBlueprints = { ...(prev?.menuBlueprints || {}) };
      let idx = findMenuIndex(nextMenus, activeMenu);

      if (idx < 0) {
        nextMenus.push(menuDefault);
      } else {
        nextMenus[idx] = menuDefault;
      }

      if (blueprintDefault) {
        nextBlueprints[activeMenu] = clone(blueprintDefault);
      } else {
        delete nextBlueprints[activeMenu];
      }

      const next = {
        ...prev,
        mainMenu: nextMenus,
        menuBlueprints: nextBlueprints
      };

      if (rootDefaults && typeof rootDefaults === 'object') {
        Object.assign(next, clone(rootDefaults));
      }

      return next;
    });

    setMessage('منوی فعال به حالت پیش‌فرض برگشت. برای ثبت نهایی، روی ذخیره بزنید.');
  };

  const currentMenu = useMemo(() => {
    const idx = findMenuIndex(settings?.mainMenu, activeMenu);
    return idx >= 0 ? settings.mainMenu[idx] : createEmptyMenu(activeMenu);
  }, [settings?.mainMenu, activeMenu]);

  const adminQuickLinks = useMemo(() => {
    const normalized = normalizeAdminQuickLinks(settings?.adminQuickLinks || []);
    return normalized.length ? normalized : ADMIN_QUICK_LINK_DEFAULTS.map((item) => ({ ...item }));
  }, [settings?.adminQuickLinks]);

  const currentBlueprint = useMemo(() => ({
    label: '',
    summary: '',
    points: [],
    actions: [],
    sectionOrder: [],
    ...(settings?.menuBlueprints?.[activeMenu] || {})
  }), [settings?.menuBlueprints, activeMenu]);

  const activeMenuMeta = useMemo(
    () => MENUS.find((item) => item.key === activeMenu) || MENUS[0],
    [activeMenu]
  );

  const previewChildren = useMemo(
    () => (currentMenu.children || []).filter((item) => item && item.enabled !== false),
    [currentMenu.children]
  );

  const previewPoints = useMemo(() => {
    const fromBlueprint = (currentBlueprint.points || []).filter(Boolean);
    if (fromBlueprint.length) return fromBlueprint.slice(0, 4);
    return previewChildren.slice(0, 4).map((item) => item.title).filter(Boolean);
  }, [currentBlueprint.points, previewChildren]);

  const previewActions = useMemo(() => {
    const fromBlueprint = (currentBlueprint.actions || [])
      .filter((item) => item && item.title && item.href)
      .slice(0, 3);
    if (fromBlueprint.length) return fromBlueprint;
    return previewChildren.slice(0, 3).map((item) => ({ title: item.title, href: item.href }));
  }, [currentBlueprint.actions, previewChildren]);

  const previewSummary = currentBlueprint.summary
    || currentMenu.description
    || activeMenuMeta.hint
    || 'خلاصه این منو در این قسمت نمایش داده می‌شود.';

  const patchAdminQuickLinks = (updater) => {
    setSettings((prev) => {
      const current = normalizeAdminQuickLinks(prev?.adminQuickLinks || []);
      const base = current.length ? current : ADMIN_QUICK_LINK_DEFAULTS.map((item) => ({ ...item }));
      const nextLinks = normalizeAdminQuickLinks(updater(base));
      return {
        ...prev,
        adminQuickLinks: nextLinks
      };
    });
  };

  const renderMenuNarrativeCard = (title, hint) => (
    <section className="settings-card">
      <h3>{title}</h3>
      <p className="settings-muted">{hint}</p>
      <label>توضیح کوتاه منو</label>
      <textarea
        rows="3"
        value={currentMenu.description || ''}
        onChange={(e) => patchMenu({ description: e.target.value })}
      />
      <label>محتوای صفحه (هر خط یک مورد)</label>
      <textarea
        rows="5"
        value={currentMenu.content || ''}
        onChange={(e) => patchMenu({ content: e.target.value })}
      />
      <div className="settings-inline-actions">
        <button type="button" className="ghost" onClick={resetChildrenToTemplate}>
          بازنشانی زیرمنوهای پیش‌فرض
        </button>
      </div>
    </section>
  );

  const renderMenuSpecificSettings = () => {
    if (!settings) return null;

    if (activeMenu === 'home') {
      return (
        <>
          <section className="settings-card">
            <h3>تنظیمات اختصاصی صفحه خانه</h3>
            <div className="settings-grid">
              <div>
                <label>نشانک هیرو</label>
                <input value={settings.homeHeroBadge || ''} onChange={(e) => patchRoot({ homeHeroBadge: e.target.value })} />
              </div>
              <div>
                <label>عنوان هیرو</label>
                <input value={settings.homeHeroTitle || ''} onChange={(e) => patchRoot({ homeHeroTitle: e.target.value })} />
              </div>
              <div>
                <label>هایلایت عنوان</label>
                <input value={settings.homeHeroHighlight || ''} onChange={(e) => patchRoot({ homeHeroHighlight: e.target.value })} />
              </div>
            </div>
            <label>متن اصلی هیرو</label>
            <textarea rows="3" value={settings.homeHeroText || ''} onChange={(e) => patchRoot({ homeHeroText: e.target.value })} />
            <div className="settings-grid">
              <div>
                <label>دکمه اصلی</label>
                <input value={settings.homeHeroPrimaryLabel || ''} onChange={(e) => patchRoot({ homeHeroPrimaryLabel: e.target.value })} />
              </div>
              <div>
                <label>لینک دکمه اصلی</label>
                <input value={settings.homeHeroPrimaryHref || ''} onChange={(e) => patchRoot({ homeHeroPrimaryHref: e.target.value })} />
              </div>
              <div>
                <label>دکمه دوم</label>
                <input value={settings.homeHeroSecondaryLabel || ''} onChange={(e) => patchRoot({ homeHeroSecondaryLabel: e.target.value })} />
              </div>
              <div>
                <label>لینک دکمه دوم</label>
                <input value={settings.homeHeroSecondaryHref || ''} onChange={(e) => patchRoot({ homeHeroSecondaryHref: e.target.value })} />
              </div>
            </div>
            <label>تگ‌های هیرو (هر خط یک مورد)</label>
            <textarea
              rows="3"
              value={toLines(settings.homeHeroTags || [])}
              onChange={(e) => patchRoot({ homeHeroTags: parseLines(e.target.value) })}
            />
            <label>اسلایدر صفحه خانه (هر خط: نشانک|عنوان|متن|دکمه اصلی|لینک اصلی|دکمه دوم|لینک دوم|تصویر)</label>
            <textarea
              aria-label="اسلایدر صفحه خانه"
              rows="7"
              value={rowsToDelimited(settings.homeSlides || [], HOME_SLIDE_FIELDS)}
              onChange={(e) => patchRoot({ homeSlides: parseDelimitedRows(e.target.value, HOME_SLIDE_FIELDS) })}
            />
            <label>ویژگی‌های کلیدی (هر خط: عنوان|متن)</label>
            <textarea
              rows="5"
              value={rowsToDelimited(settings.homeFeatures || [], ['title', 'text'])}
              onChange={(e) => patchRoot({ homeFeatures: parseDelimitedRows(e.target.value, ['title', 'text']) })}
            />
            <label>آمار صفحه خانه (هر خط: مقدار|متن)</label>
            <textarea
              rows="5"
              value={rowsToDelimited(settings.homeStats || [], ['value', 'text'])}
              onChange={(e) => patchRoot({ homeStats: parseDelimitedRows(e.target.value, ['value', 'text']) })}
            />
            <label>مراحل شروع (هر خط یک مرحله)</label>
            <textarea
              rows="4"
              value={rowsToDelimited(settings.homeSteps || [], ['text'])}
              onChange={(e) => patchRoot({ homeSteps: parseDelimitedRows(e.target.value, ['text']) })}
            />
            <div className="settings-grid">
              <div>
                <label>عنوان فراخوان اقدام</label>
                <input value={settings.homeCtaTitle || ''} onChange={(e) => patchRoot({ homeCtaTitle: e.target.value })} />
              </div>
              <div>
                <label>متن فراخوان اقدام</label>
                <input value={settings.homeCtaText || ''} onChange={(e) => patchRoot({ homeCtaText: e.target.value })} />
              </div>
              <div>
                <label>متن دکمه فراخوان</label>
                <input value={settings.homeCtaLabel || ''} onChange={(e) => patchRoot({ homeCtaLabel: e.target.value })} />
              </div>
              <div>
                <label>لینک دکمه فراخوان</label>
                <input value={settings.homeCtaHref || ''} onChange={(e) => patchRoot({ homeCtaHref: e.target.value })} />
              </div>
            </div>
          </section>

          <section className="settings-card">
            <h3>خبرهای کوتاه صفحه خانه</h3>
            <p className="settings-muted">هر خط را با فرمت: عنوان|متن|لینک وارد کنید.</p>
            <textarea
              rows="6"
              value={rowsToDelimited(settings.homeNews || [], ['title', 'text', 'href'])}
              onChange={(e) => patchRoot({ homeNews: parseDelimitedRows(e.target.value, ['title', 'text', 'href']) })}
            />
          </section>
        </>
      );
    }

    if (activeMenu === 'contact') {
      return (
        <>
          <section className="settings-card">
            <h3>تنظیمات اختصاصی تماس با ما</h3>
            <div className="settings-grid">
              <div>
                <label>عنوان تماس</label>
                <input value={settings.contactLabel || ''} onChange={(e) => patchRoot({ contactLabel: e.target.value })} />
              </div>
              <div>
                <label>شماره تماس</label>
                <input value={settings.contactPhone || ''} onChange={(e) => patchRoot({ contactPhone: e.target.value })} />
              </div>
              <div>
                <label>ایمیل</label>
                <input value={settings.contactEmail || ''} onChange={(e) => patchRoot({ contactEmail: e.target.value })} />
              </div>
              <div>
                <label>متن ساعات کاری</label>
                <input value={settings.hoursText || ''} onChange={(e) => patchRoot({ hoursText: e.target.value })} />
              </div>
            </div>
            <label>آدرس</label>
            <input value={settings.contactAddress || ''} onChange={(e) => patchRoot({ contactAddress: e.target.value })} />
            <label>متن کوتاه فوتر برای تماس</label>
            <input value={settings.footerContactText || ''} onChange={(e) => patchRoot({ footerContactText: e.target.value })} />
            <div className="settings-grid">
              <div>
                <label>عنوان بخش تماس در فوتر</label>
                <input value={settings.footerContactTitle || ''} onChange={(e) => patchRoot({ footerContactTitle: e.target.value })} />
              </div>
              <div>
                <label>متن پایانی فوتر</label>
                <input value={settings.footerNote || ''} onChange={(e) => patchRoot({ footerNote: e.target.value })} />
              </div>
            </div>
            <label>متن کپی‌رایت</label>
            <input value={settings.footerCopyright || ''} onChange={(e) => patchRoot({ footerCopyright: e.target.value })} />
          </section>

          <section className="settings-card">
            <h3>نمایش بخش‌های فوتر</h3>
            <div className="settings-grid">
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.footerShowHours !== false}
                  onChange={(e) => patchRoot({ footerShowHours: e.target.checked })}
                />
                نمایش ساعات کاری
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.footerShowSocial !== false}
                  onChange={(e) => patchRoot({ footerShowSocial: e.target.checked })}
                />
                نمایش شبکه‌های اجتماعی
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.footerShowLinks !== false}
                  onChange={(e) => patchRoot({ footerShowLinks: e.target.checked })}
                />
                نمایش لینک‌های مفید
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.footerShowContact !== false}
                  onChange={(e) => patchRoot({ footerShowContact: e.target.checked })}
                />
                نمایش اطلاعات تماس
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.footerShowCopyright !== false}
                  onChange={(e) => patchRoot({ footerShowCopyright: e.target.checked })}
                />
                نمایش کپی‌رایت
              </label>
            </div>
          </section>

          <section className="settings-card">
            <h3>عناوین فوتر</h3>
            <div className="settings-grid">
              <div>
                <label>عنوان ساعات کاری</label>
                <input value={settings.footerHoursTitle || ''} onChange={(e) => patchRoot({ footerHoursTitle: e.target.value })} />
              </div>
              <div>
                <label>عنوان شبکه‌های اجتماعی</label>
                <input value={settings.footerSocialTitle || ''} onChange={(e) => patchRoot({ footerSocialTitle: e.target.value })} />
              </div>
              <div>
                <label>عنوان لینک‌های مفید</label>
                <input value={settings.footerLinksTitle || ''} onChange={(e) => patchRoot({ footerLinksTitle: e.target.value })} />
              </div>
              <div>
                <label>عنوان ارتباط با ما</label>
                <input value={settings.footerContactTitle || ''} onChange={(e) => patchRoot({ footerContactTitle: e.target.value })} />
              </div>
            </div>
          </section>

          <section className="settings-card">
            <h3>فهرست‌های فوتر</h3>
            <p className="settings-muted">برای لینک‌ها، شبکه‌های اجتماعی و ساعات کاری از فرمت `عنوان|لینک یا مقدار` استفاده کنید.</p>
            <label>لینک‌های مفید فوتر</label>
            <textarea
              aria-label="لینک‌های مفید فوتر"
              rows="5"
              value={rowsToDelimited(settings.footerLinks || [], LINK_PAIR_FIELDS)}
              onChange={(e) => patchRoot({ footerLinks: parseDelimitedRows(e.target.value, LINK_PAIR_FIELDS) })}
            />
            <label>شبکه‌های اجتماعی</label>
            <textarea
              aria-label="شبکه‌های اجتماعی فوتر"
              rows="5"
              value={rowsToDelimited(settings.socialLinks || [], LINK_PAIR_FIELDS)}
              onChange={(e) => patchRoot({ socialLinks: parseDelimitedRows(e.target.value, LINK_PAIR_FIELDS) })}
            />
            <label>ساعات کاری فوتر</label>
            <textarea
              aria-label="ساعات کاری فوتر"
              rows="6"
              value={rowsToDelimited(settings.footerHours || [], LINK_PAIR_FIELDS)}
              onChange={(e) => patchRoot({ footerHours: parseDelimitedRows(e.target.value, LINK_PAIR_FIELDS) })}
            />
          </section>
          {renderMenuNarrativeCard('محتوای تماس', 'توضیح صفحه تماس و پیام راهنما برای کاربران را اینجا تنظیم کنید.')}
        </>
      );
    }

    if (activeMenu === 'about') {
      return (
        <>
          <section className="settings-card">
            <h3>تنظیمات اختصاصی درباره ما</h3>
            <div className="settings-grid">
              <div>
                <label>نام برند</label>
                <input value={settings.brandName || ''} onChange={(e) => patchRoot({ brandName: e.target.value })} />
              </div>
              <div>
                <label>زیرعنوان برند</label>
                <input value={settings.brandSubtitle || ''} onChange={(e) => patchRoot({ brandSubtitle: e.target.value })} />
              </div>
            </div>
          </section>
          {renderMenuNarrativeCard('محتوای درباره ما', 'معرفی مکتب، ارزش‌ها، تیم آموزشی و قوانین کلیدی را مدیریت کنید.')}
        </>
      );
    }

    if (activeMenu === 'auth') {
      return (
        <>
          {renderMenuNarrativeCard('مدیریت منوی ورود و ثبت‌نام', 'لینک ورود نقش‌ها و ثبت‌نام آنلاین را از بخش زیرمنو مدیریت کنید.')}
          <section className="settings-card">
            <h3>فرمت شماره‌های شناسایی</h3>
            <p className="settings-muted">الگوهای ساخت شماره برای محصلین. متغیرهای مجاز: &#123;YYYY&#125; (سال کامل), &#123;YY&#125; (سال دو رقمی), &#123;SEQ&#125; (شمارنده).</p>
            <div className="settings-grid">
              <div>
                <label>فرمت شماره پیگیری (آنلاین)</label>
                <input
                  value={settings?.studentIdFormats?.registrationIdFormat || ''}
                  onChange={(e) => patchRoot({ studentIdFormats: { ...(settings?.studentIdFormats || {}), registrationIdFormat: e.target.value } })}
                  placeholder="مثال: REG-{YYYY}-{SEQ}"
                />
              </div>
              <div>
                <label>فرمت شماره اساس (قطعی)</label>
                <input
                  value={settings?.studentIdFormats?.asasNumberFormat || ''}
                  onChange={(e) => patchRoot({ studentIdFormats: { ...(settings?.studentIdFormats || {}), asasNumberFormat: e.target.value } })}
                  placeholder="مثال: {YYYY}-{SEQ}"
                />
              </div>
            </div>
          </section>
        </>
      );
    }

    if (activeMenu === 'login-page') {
      return <LoginSettingsManager />;
    }

    if (activeMenu === 'news') {
      return (
        <>
          {renderMenuNarrativeCard('مدیریت منوی اخبار و اعلانات', 'متن معرفی، نکات کلیدی و مسیرهای آرشیف خبر را اینجا تنظیم کنید.')}
          <section className="settings-card">
            <h3>خبرهای نمایش سریع در خانه</h3>
            <p className="settings-muted">هر خط: عنوان|متن|لینک</p>
            <textarea
              rows="6"
              value={rowsToDelimited(settings.homeNews || [], ['title', 'text', 'href'])}
              onChange={(e) => patchRoot({ homeNews: parseDelimitedRows(e.target.value, ['title', 'text', 'href']) })}
            />
          </section>
        </>
      );
    }

    if (activeMenu === 'education') {
      return renderMenuNarrativeCard('مدیریت منوی آموزش', 'زیرمنوهای آموزشی مانند صنف‌ها، تقسیم اوقات، کارخانگی و کارنامه را یکپارچه نگه دارید.');
    }

    if (activeMenu === 'virtual') {
      return renderMenuNarrativeCard('مدیریت منوی سیستم مجازی', 'زیرمنوهای چت، جلسات آنلاین، ضبط و آرشیف را مدیریت کنید.');
    }

    if (activeMenu === 'gallery') {
      return renderMenuNarrativeCard('مدیریت منوی گالری', 'مقدمه گالری، توضیح دسته‌بندی و مسیرهای مرتبط با محتوا را تنظیم کنید.');
    }

    return null;
  };

  if (loading) {
    return (
      <div className="admin-settings">
        <p>در حال دریافت تنظیمات...</p>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="admin-settings">
        <div className="settings-card">
          <h3>عدم دسترسی</h3>
          <p className="settings-muted">
            برای ویرایش منوها باید مجوز <code>manage_content</code> داشته باشید.
          </p>
          {message && <div className="settings-message">{message}</div>}
          <div className="settings-actions">
            <button type="button" onClick={() => window.history.back()}>بازگشت</button>
          </div>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="admin-settings">
        <div className="settings-card">
          <h3>تنظیمات بارگذاری نشد</h3>
          {message && <div className="settings-message">{message}</div>}
          <div className="settings-actions">
            <button type="button" onClick={loadSettings}>تلاش دوباره</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-settings">
      <div className="card-back">
        <button type="button" onClick={() => window.history.back()}>بازگشت</button>
      </div>

      <div className="admin-settings-hero">
        <h2>مدیریت حرفه‌ای منوها</h2>
        <p>برای هر منو، تنظیمات مخصوص همان کاربرد را از همین صفحه مدیریت و منتشر کنید.</p>
      </div>

      <div className="menu-manager-grid">
        {MENUS.map((menu) => (
          <article key={menu.key} className={`menu-manager-card ${activeMenu === menu.key ? 'active' : ''}`}>
            <div className="menu-manager-head">
              <i className={`fa ${menu.icon}`} aria-hidden="true" />
              <div>
                <strong>{menu.title}</strong>
                <small>{menu.hint}</small>
              </div>
            </div>
            <div className="menu-manager-actions">
              <button type="button" onClick={() => setActive(menu.key)}>تنظیم</button>
              <button type="button" className="ghost" onClick={() => window.open(menu.href, '_blank')}>پیش‌نمایش</button>
            </div>
          </article>
        ))}
      </div>

      <div className="settings-card">
        <div className="settings-menu-head">
          <h3>ساختار اصلی منوی «{currentMenu.title || activeMenuMeta.title}»</h3>
          <button type="button" className="danger" onClick={resetActiveMenuToDefaults}>
            بازگردانی کامل منوی فعال
          </button>
        </div>
        <div className="settings-grid">
          <div>
            <label>عنوان منو</label>
            <input value={currentMenu.title || ''} onChange={(e) => patchMenu({ title: e.target.value })} />
          </div>
          <div>
            <label>لینک اصلی</label>
            <input value={currentMenu.href || ''} onChange={(e) => patchMenu({ href: e.target.value })} />
          </div>
          <div>
            <label>آیکون FontAwesome</label>
            <input value={currentMenu.icon || ''} onChange={(e) => patchMenu({ icon: e.target.value })} />
          </div>
          <div>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={currentMenu.enabled !== false}
                onChange={(e) => patchMenu({ enabled: e.target.checked })}
              />
              <span>فعال</span>
            </label>
          </div>
        </div>

        <div className="settings-menu-head child-head">
          <h4>زیرمنوها</h4>
          <div className="settings-inline-actions">
            <button type="button" className="ghost" onClick={resetChildrenToTemplate}>
              بازنشانی پیش‌فرض
            </button>
            <button
              type="button"
              className="settings-menu-btn"
              onClick={() => patchChildren((list) => [...list, { title: 'زیرمنوی جدید', href: '#', icon: 'fa-link', enabled: true }])}
            >
              افزودن زیرمنو
            </button>
          </div>
        </div>

        <div className="submenu-list">
          {(currentMenu.children || []).map((child, idx) => (
            <div key={`${child.title || 'child'}-${idx}`} className="submenu-row">
              <input
                value={child.title || ''}
                onChange={(e) => patchChildren((list) => {
                  const next = [...list];
                  next[idx] = { ...next[idx], title: e.target.value };
                  return next;
                })}
                placeholder="عنوان"
              />
              <input
                value={child.href || ''}
                onChange={(e) => patchChildren((list) => {
                  const next = [...list];
                  next[idx] = { ...next[idx], href: e.target.value };
                  return next;
                })}
                placeholder="لینک"
              />
              <input
                value={child.icon || ''}
                onChange={(e) => patchChildren((list) => {
                  const next = [...list];
                  next[idx] = { ...next[idx], icon: e.target.value };
                  return next;
                })}
                placeholder="آیکون"
              />
              <label className="settings-check child-check">
                <input
                  type="checkbox"
                  checked={child.enabled !== false}
                  onChange={(e) => patchChildren((list) => {
                    const next = [...list];
                    next[idx] = { ...next[idx], enabled: e.target.checked };
                    return next;
                  })}
                />
                <span>فعال</span>
              </label>
              <div className="submenu-actions">
                <button
                  type="button"
                  className="ghost icon-btn"
                  aria-label="move up"
                  onClick={() => patchChildren((list) => moveItem(list, idx, -1))}
                  disabled={idx === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="ghost icon-btn"
                  aria-label="move down"
                  onClick={() => patchChildren((list) => moveItem(list, idx, 1))}
                  disabled={idx === (currentMenu.children || []).length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => patchChildren((list) => list.filter((_, i) => i !== idx))}
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <section className="settings-card settings-live-preview">
        <div className="settings-menu-head">
          <h3>پیش‌نمایش زنده منوی فعال</h3>
          <span className={`preview-status ${currentMenu.enabled !== false ? 'on' : 'off'}`}>
            {currentMenu.enabled !== false ? 'فعال' : 'غیرفعال'}
          </span>
        </div>
        <div className="settings-preview-shell">
          <div className="settings-preview-main">
            <div className="settings-preview-title-row">
              <i className={`fa ${currentMenu.icon || activeMenuMeta.icon || 'fa-compass'}`} aria-hidden="true" />
              <div>
                <strong>{currentMenu.title || activeMenuMeta.title}</strong>
                <small>{currentMenu.href || activeMenuMeta.href || '#'}</small>
              </div>
            </div>
            <p>{previewSummary}</p>
            {!!previewPoints.length && (
              <div className="settings-preview-points">
                {previewPoints.map((point, idx) => (
                  <span key={`${point}-${idx}`}>
                    <i className="fa fa-circle-check" aria-hidden="true" />
                    <em>{point}</em>
                  </span>
                ))}
              </div>
            )}
            {!!previewActions.length && (
              <div className="settings-preview-actions">
                {previewActions.map((action, idx) => (
                  <a key={`${action.title}-${idx}`} href={action.href || '#'} target="_blank" rel="noreferrer">
                    {action.title}
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="settings-preview-links">
            <span>زیرمنوهای فعال</span>
            {!previewChildren.length && <p>زیرمنوی فعالی ثبت نشده است.</p>}
            {!!previewChildren.length && (
              <ul>
                {previewChildren.map((child, idx) => (
                  <li key={`${child.title || 'link'}-${idx}`}>
                    <i className={`fa ${child.icon || 'fa-link'}`} aria-hidden="true" />
                    <div>
                      <strong>{child.title || 'بدون عنوان'}</strong>
                      <small>{child.href || '#'}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-menu-head">
          <h3>پنل هوشمند منوی فعال</h3>
          <button type="button" className="ghost" onClick={resetBlueprintToPreset}>
            بازنشانی پنل هوشمند
          </button>
        </div>
        <label>برچسب کارت</label>
        <input value={currentBlueprint.label || ''} onChange={(e) => patchBlueprint({ label: e.target.value })} />
        <label>خلاصه</label>
        <textarea rows="3" value={currentBlueprint.summary || ''} onChange={(e) => patchBlueprint({ summary: e.target.value })} />
        <label>نکات کلیدی (هر خط یک مورد)</label>
        <textarea
          rows="4"
          value={toLines(currentBlueprint.points || [])}
          onChange={(e) => patchBlueprint({ points: parseLines(e.target.value) })}
        />
        <label>اقدام‌ها (هر خط: عنوان|لینک)</label>
        <textarea
          rows="4"
          value={rowsToDelimited(currentBlueprint.actions || [], ['title', 'href'])}
          onChange={(e) => patchBlueprint({ actions: parseDelimitedRows(e.target.value, ['title', 'href']) })}
        />
        <label>ترتیب بخش‌ها (هر خط یک بخش)</label>
        <textarea
          rows="3"
          value={toLines(currentBlueprint.sectionOrder || [])}
          onChange={(e) => patchBlueprint({ sectionOrder: parseLines(e.target.value) })}
        />
      </section>

      <section className="settings-card">
        <div className="settings-menu-head">
          <h3>میانبرهای سریع پنل ادمین</h3>
          <div className="settings-inline-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => patchAdminQuickLinks(() => ADMIN_QUICK_LINK_DEFAULTS.map((item) => ({ ...item })))}
            >
              بازنشانی پیش‌فرض
            </button>
            <button
              type="button"
              className="settings-menu-btn"
              onClick={() => patchAdminQuickLinks((list) => [
                ...list,
                { title: 'میانبر جدید', href: '/admin-users', permission: '', enabled: true }
              ])}
            >
              افزودن میانبر
            </button>
          </div>
        </div>

        <p className="settings-muted">ترتیب، مسیر، سطح دسترسی و فعال‌بودن میانبرهای کارت «دسترسی سریع مدیریت» را از این بخش تنظیم کنید.</p>

        <div className="quick-link-list">
          {adminQuickLinks.map((item, idx) => (
            <div key={`${item.title || 'quick'}-${idx}`} className="quick-link-row">
              <input
                value={item.title || ''}
                onChange={(e) => patchAdminQuickLinks((list) => {
                  const next = [...list];
                  next[idx] = { ...next[idx], title: e.target.value };
                  return next;
                })}
                placeholder="عنوان میانبر"
              />
              <input
                value={item.href || ''}
                onChange={(e) => patchAdminQuickLinks((list) => {
                  const next = [...list];
                  next[idx] = { ...next[idx], href: e.target.value };
                  return next;
                })}
                placeholder="مسیر (مثال: /admin-users)"
              />
              <select
                value={item.permission || ''}
                onChange={(e) => patchAdminQuickLinks((list) => {
                  const next = [...list];
                  next[idx] = { ...next[idx], permission: e.target.value };
                  return next;
                })}
              >
                {ADMIN_QUICK_LINK_PERMISSION_OPTIONS.map((opt) => (
                  <option key={opt.value || 'public'} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <label className="settings-check child-check">
                <input
                  type="checkbox"
                  checked={item.enabled !== false}
                  onChange={(e) => patchAdminQuickLinks((list) => {
                    const next = [...list];
                    next[idx] = { ...next[idx], enabled: e.target.checked };
                    return next;
                  })}
                />
                <span>فعال</span>
              </label>
              <div className="submenu-actions">
                <button
                  type="button"
                  className="ghost icon-btn"
                  aria-label="move up"
                  onClick={() => patchAdminQuickLinks((list) => moveItem(list, idx, -1))}
                  disabled={idx === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="ghost icon-btn"
                  aria-label="move down"
                  onClick={() => patchAdminQuickLinks((list) => moveItem(list, idx, 1))}
                  disabled={idx === adminQuickLinks.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => patchAdminQuickLinks((list) => list.filter((_, i) => i !== idx))}
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {renderMenuSpecificSettings()}

      <div className="settings-actions">
        <button type="button" disabled={saving} onClick={() => saveAll()}>
          {saving ? 'در حال ذخیره...' : 'ذخیره همه تنظیمات'}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={saving}
          onClick={() => saveAll(`منوی «${currentMenu.title || ''}» با موفقیت منتشر شد.`)}
        >
          انتشار منوی فعال
        </button>
        {message && <div className="settings-message">{message}</div>}
      </div>
    </div>
  );
}
