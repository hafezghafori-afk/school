import { test, expect } from '@playwright/test';

const adminSession = {
  token: 'mock.header.signature',
  role: 'admin',
  userId: 'admin-1',
  userName: 'Admin Alpha',
  adminLevel: 'general_president',
  permissions: ['view_reports', 'manage_content', 'manage_finance', 'manage_users', 'manage_schedule']
};

const publicSettings = {
  brandName: 'Alpha Academy',
  brandSubtitle: 'Home CMS',
  contactLabel: 'تماس',
  contactPhone: '0700123456',
  contactEmail: 'alpha@academy.test',
  contactAddress: 'Alpha Street',
  hoursLabel: 'ساعات کاری',
  hoursText: '08:00 - 16:00',
  topSearchPlaceholder: 'جستجو در محتوا...',
  languages: ['فارسی', 'English'],
  homeHeroBadge: 'خانه و CMS',
  homeHeroTitle: 'صفحه خانه از داخل ادمین مدیریت می‌شود',
  homeHeroHighlight: 'سریع و واکنش‌گرا',
  homeHeroText: 'محتوای اصلی، اسلایدر، خبرهای کوتاه و فوتر به‌صورت یکپارچه از تنظیمات خوانده می‌شود.',
  homeHeroPrimaryLabel: 'مشاهده صنف‌ها',
  homeHeroPrimaryHref: '/courses',
  homeHeroSecondaryLabel: 'ثبت نام',
  homeHeroSecondaryHref: '/register',
  homeHeroTags: ['اسلایدر CMS', 'CTA داینامیک', 'فوتر داینامیک'],
  homeSlides: [
    {
      badge: 'اسلاید اول',
      title: 'اسلاید مدیریتی Alpha',
      text: 'این اسلاید مستقیماً از تنظیمات عمومی صفحه خانه آمده است.',
      primaryLabel: 'ثبت نام',
      primaryHref: '/register',
      secondaryLabel: 'تماس',
      secondaryHref: '/contact',
      imageUrl: ''
    },
    {
      badge: 'اسلاید دوم',
      title: 'خبر و CTA نیز از CMS می‌آیند',
      text: 'بدون وابستگی به fallbackهای hardcoded، محتوا از تنظیمات بارگذاری می‌شود.',
      primaryLabel: 'خبرها',
      primaryHref: '/news',
      secondaryLabel: 'گالری',
      secondaryHref: '/gallery',
      imageUrl: ''
    }
  ],
  homeStats: [
    { value: '12', text: 'صنف فعال' },
    { value: '48', text: 'مضمون' },
    { value: '24/7', text: 'دسترسی' }
  ],
  homeFeatures: [
    { title: 'کارت Alpha', text: 'کارت‌های صفحه خانه از CMS مدیریت می‌شوند.' },
    { title: 'CTA پویا', text: 'فراخوان اقدام روی صفحه خانه hardcoded نیست.' },
    { title: 'فوتر کامل', text: 'لینک‌ها، ساعات و شبکه‌های اجتماعی از ادمین تنظیم می‌شوند.' }
  ],
  homeNews: [
    { title: 'خبر CMS اول', text: 'این خبر از تنظیمات صفحه خانه آمده است.', href: '/news' },
    { title: 'خبر CMS دوم', text: 'فهرست خبرهای کوتاه نیز از ادمین ویرایش می‌شود.', href: '/news' }
  ],
  homeSteps: [
    { text: 'انتخاب صنف' },
    { text: 'ثبت نام' },
    { text: 'شروع یادگیری' }
  ],
  homeCtaTitle: 'همین امروز شروع کنید',
  homeCtaText: 'CTA صفحه خانه از CMS بارگذاری شده است.',
  homeCtaLabel: 'ورود به ثبت نام',
  homeCtaHref: '/register',
  footerShowHours: true,
  footerShowSocial: true,
  footerShowLinks: true,
  footerShowContact: true,
  footerShowCopyright: true,
  footerHoursTitle: 'ساعات Alpha',
  footerSocialTitle: 'شبکه‌های Alpha',
  footerLinksTitle: 'لینک‌های سریع Alpha',
  footerContactTitle: 'ارتباط با Alpha',
  footerContactText: 'پشتیبانی محتوای خانه',
  footerNote: 'یادداشت اختصاصی فوتر',
  footerCopyright: '© Alpha Academy',
  footerLinks: [
    { title: 'درباره ما', href: '/about' },
    { title: 'تماس', href: '/contact' }
  ],
  socialLinks: [
    { title: 'Facebook', href: 'https://example.com/facebook' },
    { title: 'Instagram', href: 'https://example.com/instagram' }
  ],
  footerHours: [
    { title: 'شنبه', href: '08:00 - 16:00' },
    { title: 'یکشنبه', href: '08:00 - 16:00' }
  ],
  mainMenu: [
    {
      key: 'home',
      title: 'خانه',
      href: '/',
      icon: 'fa-house',
      enabled: true,
      children: []
    }
  ],
  menuBlueprints: {
    home: {
      label: 'خانه',
      summary: 'Alpha home summary',
      points: ['ورود سریع'],
      actions: [{ title: 'خانه', href: '/' }],
      sectionOrder: ['خدمات', 'محتوا']
    }
  },
  adminQuickLinks: [
    { title: 'اخبار', href: '/admin-news', permission: 'manage_content', enabled: true }
  ]
};

const setupShellMocks = async (page, settings = publicSettings) => {
  await page.route('**/api/settings/public', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        settings
      })
    });
  });

  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  await page.route('**/api/users/me/notifications', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] })
    });
  });

  await page.route('**/api/users/me/notifications/read-all', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  await page.route('**/api/users/me/notifications/*/read', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  await page.route('**/api/news', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] })
    });
  });

  await page.route('**/api/gallery', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] })
    });
  });
};

const setupAdminSession = async (page) => {
  await page.addInitScript((session) => {
    localStorage.setItem('token', session.token);
    localStorage.setItem('role', session.role);
    localStorage.setItem('userId', session.userId);
    localStorage.setItem('userName', session.userName);
    localStorage.setItem('adminLevel', session.adminLevel);
    localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
  }, adminSession);
};

test.describe('home workflow', () => {
  test('home workflow renders CMS slider, CTA, news, and footer content', async ({ page }) => {
    await setupShellMocks(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.slider-copy h2')).toContainText('اسلاید مدیریتی Alpha');
    await expect(page.locator('.news-card').first()).toContainText('خبر CMS اول');
    await expect(page.locator('.home-cta')).toContainText('همین امروز شروع کنید');
    await expect(page.locator('.home-cta')).toContainText('CTA صفحه خانه از CMS بارگذاری شده است.');
    await expect(page.locator('.footer-links')).toContainText('لینک‌های سریع Alpha');
    await expect(page.locator('.footer-links')).toContainText('درباره ما');
    await expect(page.locator('.footer-hours')).toContainText('ساعات Alpha');
    await expect(page.locator('.footer-note')).toContainText('یادداشت اختصاصی فوتر');

    await page.locator('.slider-tabs button').nth(1).click();
    await expect(page.locator('.slider-copy h2')).toContainText('خبر و CTA نیز از CMS می‌آیند');
  });

  test('home workflow saves slider and footer CMS settings from admin', async ({ page }) => {
    let savedSettings = null;
    const editableSettings = {
      ...publicSettings,
      adminQuickLinks: [
        { title: 'اخبار', href: '/admin-news', permission: 'manage_content', enabled: true }
      ]
    };

    await setupShellMocks(page, editableSettings);
    await setupAdminSession(page);

    await page.route('**/api/settings', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, settings: savedSettings || editableSettings })
        });
        return;
      }

      savedSettings = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, settings: savedSettings })
      });
    });

    await page.goto('/admin-settings?menu=home', { waitUntil: 'domcontentloaded' });

    await page.getByLabel('اسلایدر صفحه خانه').fill(
      'اسلاید تست|خانه جدید Alpha|این اسلاید از تست Playwright ذخیره می‌شود.|ثبت نام|/register|تماس|/contact|'
    );
    await page.getByRole('button', { name: 'ذخیره همه تنظیمات' }).click();

    await expect.poll(() => savedSettings?.homeSlides?.[0]?.title || '').toBe('خانه جدید Alpha');
    await expect(page.locator('.settings-message')).toContainText('ذخیره شد');

    await page.goto('/admin-settings?menu=contact', { waitUntil: 'domcontentloaded' });

    await page.getByLabel('نمایش شبکه‌های اجتماعی').uncheck();
    await page.getByLabel('لینک‌های مفید فوتر').fill('راهنما|/faq\nتماس|/contact');
    await page.getByLabel('ساعات کاری فوتر').fill('شنبه|08:00 - 16:00\nیکشنبه|09:00 - 15:00');
    await page.getByRole('button', { name: 'ذخیره همه تنظیمات' }).click();

    await expect.poll(() => savedSettings?.footerShowSocial).toBe(false);
    await expect.poll(() => savedSettings?.footerLinks?.[0]?.title || '').toBe('راهنما');
    await expect.poll(() => savedSettings?.footerHours?.[1]?.href || '').toBe('09:00 - 15:00');
    await expect.poll(() => savedSettings?.homeSlides?.[0]?.title || '').toBe('خانه جدید Alpha');
  });
});
