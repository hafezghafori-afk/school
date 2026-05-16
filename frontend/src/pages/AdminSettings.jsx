import React, { useEffect, useMemo, useState } from 'react';
import './AdminSettings.css';
import { API_BASE } from '../config/api';
import LoginSettingsManager from '../components/LoginSettingsManager';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const ADMIN_QUICK_LINK_PERMISSION_OPTIONS = [
  { value: '', label: 'عمومی' },
  { value: 'manage_users', label: 'مدیریت کاربران' },
  { value: 'manage_enrollments', label: 'مدیریت ثبت‌نام‌ها' },
  { value: 'manage_memberships', label: 'مدیریت ممبرشیپ آموزشی' },
  { value: 'manage_finance', label: 'مدیریت مالی' },
  { value: 'manage_content', label: 'مدیریت محتوا' },
  { value: 'manage_platform_requests', label: 'مرکز ارتباطات سیما' },
  { value: 'view_reports', label: 'مشاهده گزارشات' },
  { value: 'view_schedule', label: 'مشاهده تقسیم اوقات' },
  { value: 'manage_schedule', label: 'مدیریت تقسیم اوقات' }
];

const ADMIN_QUICK_LINK_PERMISSION_SET = new Set(
  ADMIN_QUICK_LINK_PERMISSION_OPTIONS.map((item) => item.value)
);

const ADMIN_QUICK_LINK_DEFAULTS = [
  { title: 'کاربران', href: '/admin-users', permission: 'manage_users', enabled: true },
  { title: 'مرکز مالی', href: '/admin-finance', permission: 'manage_finance', enabled: true },
  { title: 'عضویت‌های مالی', href: '/admin-financial-memberships', permission: 'manage_finance', enabled: true },
  { title: 'گزارشات', href: '/admin-stats', permission: 'view_reports', enabled: true },
  { title: 'لاگ‌ها', href: '/admin-logs', permission: 'view_reports', enabled: true },
  { title: 'مرکز ارتباطات سیما', href: '/admin-communications', permission: 'manage_platform_requests', enabled: true },
  { title: 'ثبت‌نام‌ها', href: '/admin-enrollments', permission: 'manage_enrollments', enabled: true },
  { title: 'تنظیم شماره اساس و ریجیستر نمبر', href: '/admin-settings#student-ids', permission: 'manage_content', enabled: true },
  { title: 'تقسیم اوقات', href: '/timetable/viewer', permission: 'view_schedule', enabled: true },
  { title: 'مدیریت تقسیم اوقات', href: '/timetable/editor', permission: 'manage_schedule', enabled: true }
];

const DEFAULT_STUDENT_ID_FORMATS = {
  registrationIdFormat: 'REG-{YYYY}-{SEQ}',
  asasNumberFormat: '{YYYY}-{SEQ}'
};

const SETTINGS_TABS = [
  { key: 'brand', title: 'برند و تماس', icon: 'fa-id-card' },
  { key: 'home', title: 'صفحه فروش', icon: 'fa-store' },
  { key: 'header', title: 'هیدر و منو', icon: 'fa-bars-staggered' },
  { key: 'footer', title: 'فوتر', icon: 'fa-window-maximize' },
  { key: 'studentIds', title: 'شماره‌های شاگردان', icon: 'fa-id-badge' },
  { key: 'login', title: 'صفحه ورود', icon: 'fa-user-lock' },
  { key: 'shortcuts', title: 'میانبرهای ادمین', icon: 'fa-gauge-high' }
];

const SETTINGS_HASH_TAB_MAP = {
  '#student-ids': 'studentIds',
  '#shortcuts': 'shortcuts',
  '#login': 'login'
};

const getInitialSettingsTab = () => {
  if (typeof window === 'undefined') return 'brand';
  return SETTINGS_HASH_TAB_MAP[window.location.hash] || 'brand';
};

const PUBLIC_MENU_ITEMS = [
  { title: 'خانه', href: '/' },
  { title: 'امکانات سیستم', href: '/#modules' },
  { title: 'برای مکاتب', href: '/#schools' },
  { title: 'درباره سیستم', href: '/about' },
  { title: 'تماس و دمو', href: '/demo-request' }
];

const PRODUCT_MODULES = [
  'مدیریت شاگردان',
  'مدیریت استادان و کارمندان',
  'حاضری شاگردان و کارمندان',
  'مدیریت فیس و رسید پرداخت',
  'امتحانات و کارنامه',
  'تقسیم اوقات درسی'
];

const parseLines = (value = '') => String(value || '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const toLines = (items = []) => (Array.isArray(items) ? items.filter(Boolean).join('\n') : '');

const parseDelimitedRows = (value = '', fields = ['title', 'href']) => parseLines(value).map((line) => {
  const parts = line.split('|').map((part) => part.trim());
  return fields.reduce((acc, field, index) => {
    acc[field] = parts[index] || '';
    return acc;
  }, {});
}).filter((row) => Object.values(row).some(Boolean));

const rowsToDelimited = (rows = [], fields = ['title', 'href']) => {
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
      const rawTitle = String(item?.title || item?.label || '').trim();
      const rawHref = String(item?.href || item?.to || '').trim();
      const isLegacyStudentIdLink = rawHref === '/student-registration' && rawTitle.includes('ریجیستر');
      const title = isLegacyStudentIdLink ? 'تنظیم شماره اساس و ریجیستر نمبر' : rawTitle;
      const href = isLegacyStudentIdLink ? '/admin-settings#student-ids' : rawHref;
      const permission = isLegacyStudentIdLink ? 'manage_content' : String(item?.permission || '').trim();
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
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState(getInitialSettingsTab);
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
        if (res.status === 403) setAccessDenied(true);
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
        nextSettings.studentIdFormats = {
          ...DEFAULT_STUDENT_ID_FORMATS,
          ...(nextSettings.studentIdFormats || {})
        };
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
    const syncHashTab = () => {
      const nextTab = SETTINGS_HASH_TAB_MAP[window.location.hash];
      if (nextTab) setActiveTab(nextTab);
    };
    syncHashTab();
    window.addEventListener('hashchange', syncHashTab);
    return () => window.removeEventListener('hashchange', syncHashTab);
  }, []);

  const patchRoot = (patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const patchStudentIdFormats = (patch) => {
    setSettings((prev) => ({
      ...prev,
      studentIdFormats: {
        ...DEFAULT_STUDENT_ID_FORMATS,
        ...(prev?.studentIdFormats || {}),
        ...patch
      }
    }));
  };

  const saveAll = async (successText = 'تنظیمات سیما ذخیره شد.') => {
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
      const normalized = data.settings || settings;
      normalized.adminQuickLinks = normalizeAdminQuickLinks(normalized.adminQuickLinks);
      normalized.studentIdFormats = {
        ...DEFAULT_STUDENT_ID_FORMATS,
        ...(normalized.studentIdFormats || {})
      };
      setSettings(normalized);
      setMessage(successText);
    } catch {
      setMessage('خطا در ذخیره تنظیمات');
    } finally {
      setSaving(false);
    }
  };

  const adminQuickLinks = useMemo(() => {
    const normalized = normalizeAdminQuickLinks(settings?.adminQuickLinks || []);
    return normalized.length ? normalized : ADMIN_QUICK_LINK_DEFAULTS.map((item) => ({ ...item }));
  }, [settings?.adminQuickLinks]);

  const patchAdminQuickLinks = (updater) => {
    setSettings((prev) => {
      const current = normalizeAdminQuickLinks(prev?.adminQuickLinks || []);
      const base = current.length ? current : ADMIN_QUICK_LINK_DEFAULTS.map((item) => ({ ...item }));
      return { ...prev, adminQuickLinks: normalizeAdminQuickLinks(updater(base)) };
    });
  };

  const renderBrandTab = () => (
    <>
      <section className="settings-card">
        <h3>هویت محصول</h3>
        <p className="settings-muted">این معلومات در هیدر، فوتر، صفحه چاپ و بخش‌های عمومی سیستم استفاده می‌شود.</p>
        <div className="settings-grid">
          <div>
            <label>نام کوتاه سیستم</label>
            <input value={settings.brandName || ''} onChange={(e) => patchRoot({ brandName: e.target.value })} />
          </div>
          <div>
            <label>نام رسمی سیستم</label>
            <input value={settings.brandSubtitle || ''} onChange={(e) => patchRoot({ brandSubtitle: e.target.value })} />
          </div>
          <div>
            <label>عنوان خدمات</label>
            <input value={settings.hoursLabel || ''} onChange={(e) => patchRoot({ hoursLabel: e.target.value })} />
          </div>
          <div>
            <label>توضیح خدمات</label>
            <input value={settings.hoursText || ''} onChange={(e) => patchRoot({ hoursText: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h3>تماس برای فروش و راه‌اندازی</h3>
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
            <label>آدرس</label>
            <input value={settings.contactAddress || ''} onChange={(e) => patchRoot({ contactAddress: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h3>ایمیل‌های مرکز ارتباطات سیما</h3>
        <p className="settings-muted">درخواست‌های دمو، تماس‌ها، پیشنهادات و انتقادات در دیتابیس ذخیره می‌شوند؛ این ایمیل‌ها فقط برای اطلاع‌رسانی فوری استفاده می‌شوند.</p>
        <div className="settings-grid">
          <div>
            <label>ایمیل رسمی دریافت‌کننده</label>
            <input
              value={settings.platformInboxEmails?.official || ''}
              onChange={(e) => patchRoot({ platformInboxEmails: { ...(settings.platformInboxEmails || {}), official: e.target.value } })}
            />
          </div>
          <div>
            <label>ایمیل شخصی دریافت‌کننده</label>
            <input
              value={settings.platformInboxEmails?.personal || ''}
              onChange={(e) => patchRoot({ platformInboxEmails: { ...(settings.platformInboxEmails || {}), personal: e.target.value } })}
            />
          </div>
        </div>
        <div className="settings-grid">
          {[
            ['sendDemo', 'ارسال ایمیل برای دمو'],
            ['sendContact', 'ارسال ایمیل برای تماس'],
            ['sendSuggestion', 'ارسال ایمیل برای پیشنهادات'],
            ['sendComplaint', 'ارسال ایمیل برای انتقادات']
          ].map(([key, label]) => (
            <label className="settings-check" key={key}>
              <input
                type="checkbox"
                checked={settings.platformInboxEmails?.[key] !== false}
                onChange={(e) => patchRoot({ platformInboxEmails: { ...(settings.platformInboxEmails || {}), [key]: e.target.checked } })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>
    </>
  );

  const renderHomeTab = () => (
    <>
      <section className="settings-card">
        <h3>Hero صفحه فروش</h3>
        <p className="settings-muted">این بخش باید در چند ثانیه اول بگوید سیما چیست و چرا برای مکتب ارزش دارد.</p>
        <div className="settings-grid">
          <div>
            <label>نشانک بالای عنوان</label>
            <input value={settings.homeHeroBadge || ''} onChange={(e) => patchRoot({ homeHeroBadge: e.target.value })} />
          </div>
          <div>
            <label>عنوان اصلی</label>
            <input value={settings.homeHeroTitle || ''} onChange={(e) => patchRoot({ homeHeroTitle: e.target.value })} />
          </div>
          <div>
            <label>هایلایت فروش</label>
            <input value={settings.homeHeroHighlight || ''} onChange={(e) => patchRoot({ homeHeroHighlight: e.target.value })} />
          </div>
        </div>
        <label>متن معرفی</label>
        <textarea rows="4" value={settings.homeHeroText || ''} onChange={(e) => patchRoot({ homeHeroText: e.target.value })} />
        <div className="settings-grid">
          <div>
            <label>دکمه اول</label>
            <input value={settings.homeHeroPrimaryLabel || ''} onChange={(e) => patchRoot({ homeHeroPrimaryLabel: e.target.value })} />
          </div>
          <div>
            <label>لینک دکمه اول</label>
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
        <label>برچسب‌های کوتاه Hero، هر خط یک مورد</label>
        <textarea rows="3" value={toLines(settings.homeHeroTags || [])} onChange={(e) => patchRoot({ homeHeroTags: parseLines(e.target.value) })} />
      </section>

      <section className="settings-card">
        <h3>سه کارت سریع بالای صفحه</h3>
        <p className="settings-muted">هر خط: عنوان|متن|آیکن FontAwesome. نمونه آیکن: fa-school</p>
        <textarea
          rows="5"
          value={rowsToDelimited(settings.salesQuickCards || [], ['title', 'text', 'value'])}
          onChange={(e) => patchRoot({ salesQuickCards: parseDelimitedRows(e.target.value, ['title', 'text', 'value']) })}
        />
      </section>

      <section className="settings-card">
        <h3>ماژول‌های اصلی محصول</h3>
        <p className="settings-muted">هر خط: عنوان|توضیح|آیکن FontAwesome. این بخش دقیقاً در قسمت «ماژول‌های اصلی سیستم» صفحه خانه نمایش داده می‌شود.</p>
        <textarea
          rows="8"
          value={rowsToDelimited(settings.salesModules || [], ['title', 'text', 'value'])}
          onChange={(e) => patchRoot({ salesModules: parseDelimitedRows(e.target.value, ['title', 'text', 'value']) })}
        />
      </section>

      <section className="settings-card">
        <h3>برای کی ساخته شده؟</h3>
        <p className="settings-muted">هر خط یک مورد. این لیست در بخش مناسب برای مکاتب و مراکز آموزشی نمایش داده می‌شود.</p>
        <textarea
          rows="6"
          value={toLines(settings.salesAudience || [])}
          onChange={(e) => patchRoot({ salesAudience: parseLines(e.target.value) })}
        />
      </section>

      <section className="settings-card">
        <h3>بخش اعتماد</h3>
        <div className="settings-grid">
          <div>
            <label>عنوان بخش اعتماد</label>
            <input value={settings.salesTrustTitle || ''} onChange={(e) => patchRoot({ salesTrustTitle: e.target.value })} />
          </div>
        </div>
        <label>متن بخش اعتماد</label>
        <textarea rows="4" value={settings.salesTrustText || ''} onChange={(e) => patchRoot({ salesTrustText: e.target.value })} />
        <label>نکات اعتماد، هر خط یک مورد</label>
        <textarea rows="4" value={toLines(settings.salesTrustPoints || [])} onChange={(e) => patchRoot({ salesTrustPoints: parseLines(e.target.value) })} />
      </section>

      <section className="settings-card">
        <h3>نمونه داشبوردها</h3>
        <p className="settings-muted">هر خط: عنوان|مورد اول / مورد دوم / مورد سوم</p>
        <textarea
          rows="6"
          value={rowsToDelimited(settings.salesDashboardCards || [], ['title', 'text'])}
          onChange={(e) => patchRoot({ salesDashboardCards: parseDelimitedRows(e.target.value, ['title', 'text']) })}
        />
      </section>

      <section className="settings-card">
        <h3>سوالات متداول صفحه خانه</h3>
        <p className="settings-muted">هر خط: سوال|جواب</p>
        <textarea
          rows="7"
          value={rowsToDelimited(settings.salesFaqs || [], ['title', 'text'])}
          onChange={(e) => patchRoot({ salesFaqs: parseDelimitedRows(e.target.value, ['title', 'text']) })}
        />
      </section>

      <section className="settings-card">
        <h3>فراخوان آخر صفحه</h3>
        <div className="settings-grid">
          <div>
            <label>عنوان CTA</label>
            <input value={settings.homeCtaTitle || ''} onChange={(e) => patchRoot({ homeCtaTitle: e.target.value })} />
          </div>
          <div>
            <label>متن CTA</label>
            <input value={settings.homeCtaText || ''} onChange={(e) => patchRoot({ homeCtaText: e.target.value })} />
          </div>
          <div>
            <label>متن دکمه CTA</label>
            <input value={settings.homeCtaLabel || ''} onChange={(e) => patchRoot({ homeCtaLabel: e.target.value })} />
          </div>
          <div>
            <label>لینک دکمه CTA</label>
            <input value={settings.homeCtaHref || ''} onChange={(e) => patchRoot({ homeCtaHref: e.target.value })} />
          </div>
        </div>
      </section>
    </>
  );

  const renderHeaderTab = () => (
    <>
      <section className="settings-card">
        <h3>منوی عمومی صفحه فروش</h3>
        <p className="settings-muted">برای جلوگیری از خرابی منو، منوی عمومی فروش ثابت و یکدست شده است. این منو در صفحه خانه و صفحات عمومی نمایش داده می‌شود.</p>
        <div className="settings-preview-links">
          <ul>
            {PUBLIC_MENU_ITEMS.map((item) => (
              <li key={item.href}>
                <i className="fa fa-link" aria-hidden="true" />
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.href}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="settings-card">
        <h3>جستجو و زبان‌ها</h3>
        <p className="settings-muted">جستجو برای کاربران داخل سیستم فعال است؛ در صفحه فروش به جای آن پیام فروش و دکمه‌های دمو/ورود نمایش داده می‌شود.</p>
        <div className="settings-grid">
          <div>
            <label>متن داخل جستجو</label>
            <input value={settings.topSearchPlaceholder || ''} onChange={(e) => patchRoot({ topSearchPlaceholder: e.target.value })} />
          </div>
          <div>
            <label>زبان‌ها، هر خط یک مورد</label>
            <textarea rows="3" value={toLines(settings.languages || [])} onChange={(e) => patchRoot({ languages: parseLines(e.target.value) })} />
          </div>
        </div>
      </section>
    </>
  );

  const renderFooterTab = () => (
    <>
      <section className="settings-card">
        <h3>فوتر محصول</h3>
        <p className="settings-muted">فوتر روی معرفی سیما، لینک‌های مهم و تماس برای دمو تمرکز دارد.</p>
        <div className="settings-grid">
          <div>
            <label>عنوان لینک‌های محصول</label>
            <input value={settings.footerLinksTitle || ''} onChange={(e) => patchRoot({ footerLinksTitle: e.target.value })} />
          </div>
          <div>
            <label>عنوان تماس فوتر</label>
            <input value={settings.footerContactTitle || ''} onChange={(e) => patchRoot({ footerContactTitle: e.target.value })} />
          </div>
        </div>
        <label>متن کوتاه فوتر</label>
        <textarea rows="3" value={settings.footerContactText || ''} onChange={(e) => patchRoot({ footerContactText: e.target.value })} />
        <label>لینک‌های فوتر، هر خط: عنوان|لینک</label>
        <textarea
          rows="6"
          value={rowsToDelimited(settings.footerLinks || [], ['title', 'href'])}
          onChange={(e) => patchRoot({ footerLinks: parseDelimitedRows(e.target.value, ['title', 'href']) })}
        />
        <label>متن پایانی فوتر</label>
        <input value={settings.footerNote || ''} onChange={(e) => patchRoot({ footerNote: e.target.value })} />
        <label>کپی‌رایت اختصاصی</label>
        <input value={settings.footerCopyright || ''} onChange={(e) => patchRoot({ footerCopyright: e.target.value })} />
      </section>
    </>
  );

  const renderStudentIdsTab = () => (
    <section className="settings-card" id="student-ids">
      <h3>روش تولید ریجیستر نمبر و شماره اساس</h3>
      <p className="settings-muted">
        این فرمت‌ها هنگام ثبت درخواست جدید و هنگام تایید شاگرد برای تولید شماره‌ها استفاده می‌شوند. از
        {' '}<code>{'{YYYY}'}</code> برای سال جاری و <code>{'{SEQ}'}</code> برای شماره مسلسل استفاده کنید.
      </p>
      <div className="settings-grid">
        <div>
          <label>فرمت ریجیستر نمبر / کد پیگیری</label>
          <input
            dir="ltr"
            value={settings.studentIdFormats?.registrationIdFormat || DEFAULT_STUDENT_ID_FORMATS.registrationIdFormat}
            onChange={(e) => patchStudentIdFormats({ registrationIdFormat: e.target.value })}
            placeholder="REG-{YYYY}-{SEQ}"
          />
        </div>
        <div>
          <label>فرمت شماره اساس</label>
          <input
            dir="ltr"
            value={settings.studentIdFormats?.asasNumberFormat || DEFAULT_STUDENT_ID_FORMATS.asasNumberFormat}
            onChange={(e) => patchStudentIdFormats({ asasNumberFormat: e.target.value })}
            placeholder="{YYYY}-{SEQ}"
          />
        </div>
      </div>
      <div className="settings-preview-links">
        <ul>
          <li>
            <i className="fa fa-hashtag" aria-hidden="true" />
            <div>
              <strong>نمونه ریجیستر نمبر</strong>
              <small>{String(settings.studentIdFormats?.registrationIdFormat || DEFAULT_STUDENT_ID_FORMATS.registrationIdFormat).replace('{YYYY}', new Date().getFullYear()).replace('{SEQ}', '0001')}</small>
            </div>
          </li>
          <li>
            <i className="fa fa-id-card" aria-hidden="true" />
            <div>
              <strong>نمونه شماره اساس</strong>
              <small>{String(settings.studentIdFormats?.asasNumberFormat || DEFAULT_STUDENT_ID_FORMATS.asasNumberFormat).replace('{YYYY}', new Date().getFullYear()).replace('{SEQ}', '0001')}</small>
            </div>
          </li>
        </ul>
      </div>
      <p className="settings-muted">
        نمونه‌ها: <code>REG-{'{YYYY}'}-{'{SEQ}'}</code>، <code>ASAS-{'{YYYY}'}-{'{SEQ}'}</code>، <code>{'{YYYY}'}-{'{SEQ}'}</code>.
      </p>
    </section>
  );

  const renderShortcutsTab = () => (
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
      <p className="settings-muted">این بخش مربوط صفحه عمومی فروش نیست؛ برای کارت دسترسی سریع داخل داشبورد ادمین استفاده می‌شود.</p>

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
              placeholder="عنوان"
            />
            <input
              value={item.href || ''}
              onChange={(e) => patchAdminQuickLinks((list) => {
                const next = [...list];
                next[idx] = { ...next[idx], href: e.target.value };
                return next;
              })}
              placeholder="مسیر"
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
              <button type="button" className="ghost icon-btn" onClick={() => patchAdminQuickLinks((list) => moveItem(list, idx, -1))} disabled={idx === 0}>↑</button>
              <button type="button" className="ghost icon-btn" onClick={() => patchAdminQuickLinks((list) => moveItem(list, idx, 1))} disabled={idx === adminQuickLinks.length - 1}>↓</button>
              <button type="button" className="danger" onClick={() => patchAdminQuickLinks((list) => list.filter((_, i) => i !== idx))}>حذف</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const renderActiveTab = () => {
    if (activeTab === 'brand') return renderBrandTab();
    if (activeTab === 'home') return renderHomeTab();
    if (activeTab === 'header') return renderHeaderTab();
    if (activeTab === 'footer') return renderFooterTab();
    if (activeTab === 'studentIds') return renderStudentIdsTab();
    if (activeTab === 'login') return <LoginSettingsManager />;
    if (activeTab === 'shortcuts') return renderShortcutsTab();
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
          <p className="settings-muted">برای ویرایش تنظیمات باید مجوز <code>manage_content</code> داشته باشید.</p>
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
    <div className="admin-settings" dir="rtl">
      <div className="card-back">
        <button type="button" onClick={() => window.history.back()}>بازگشت</button>
      </div>

      <div className="admin-settings-hero">
        <h2>تنظیمات محصول سیما</h2>
        <p>تنظیمات اصلی برند، صفحه فروش، هیدر، فوتر، صفحه ورود و میانبرهای داخلی را از این‌جا مدیریت کنید.</p>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="بخش‌های تنظیمات سیما">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? 'active' : ''}
            onClick={() => setActiveTab(tab.key)}
          >
            <i className={`fa ${tab.icon}`} aria-hidden="true" />
            <span>{tab.title}</span>
          </button>
        ))}
      </div>

      {renderActiveTab()}

      <div className="settings-actions">
        <button type="button" disabled={saving} onClick={() => saveAll()}>
          {saving ? 'در حال ذخیره...' : 'ذخیره همه تنظیمات'}
        </button>
        <button type="button" className="ghost" disabled={saving} onClick={loadSettings}>
          بارگذاری دوباره
        </button>
        {message && <div className="settings-message">{message}</div>}
      </div>
    </div>
  );
}
