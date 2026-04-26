import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

const setupCommonAdminMocks = async (page) => {
  await page.route('**/api/admin/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        users: 120,
        courses: 18,
        todayPayments: 5,
        pendingOrders: 2
      })
    });
  });

  await page.route('**/api/dashboard/admin', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        summary: {
          totalStudents: 320,
          totalInstructors: 25,
          totalRevenue: 200000,
          totalDue: 250000,
          outstandingAmount: 50000,
          attendanceRate: 88,
          todayPayments: 5,
          pendingFinanceReviews: 6,
          pendingProfileRequests: 3,
          pendingAccessRequests: 4,
          monthlyRevenue: 65000,
          previousMonthRevenue: 62000,
          monthDeltaPercent: 4.8
        },
        tasks: [],
        alerts: [],
        revenueTrend: [],
        studentGrowth: []
      })
    });
  });

  await page.route('**/api/admin/alerts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, alerts: [] })
    });
  });

  await page.route('**/api/admin/workflow-report*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, levels: [], byType: {}, breakdown: [], totals: {} })
    });
  });

  await page.route('**/api/admin/sla/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        config: {
          timeouts: {
            finance_manager: 120,
            finance_lead: 240,
            general_president: 480
          }
        }
      })
    });
  });

  await page.route('**/api/admin-logs*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] })
    });
  });
};

test.describe('admin today schedule widget', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_schedule']
    });

    await setupCommonAdminMocks(page);
  });

  test('shows summary chips, visibility badges and supports manual refresh', async ({ page }) => {
    let todayCallCount = 0;
    let useUpdatedPayload = false;

    const initialItems = [
      {
        _id: 'sch-1',
        subject: 'ریاضی',
        instructor: { name: 'استاد اول' },
        schoolClass: { title: 'صنف 10A' },
        startTime: '08:00',
        endTime: '09:00',
        visibility: 'published',
        date: '2026-04-05'
      },
      {
        _id: 'sch-2',
        subject: 'ساینس',
        instructor: { name: 'استاد دوم' },
        schoolClass: { title: 'صنف 10B' },
        startTime: '09:00',
        endTime: '10:00',
        visibility: 'draft',
        date: '2026-04-05'
      }
    ];

    const refreshedItems = [
      {
        _id: 'sch-1',
        subject: 'ریاضی',
        instructor: { name: 'استاد اول' },
        schoolClass: { title: 'صنف 10A' },
        startTime: '08:00',
        endTime: '09:00',
        visibility: 'published',
        date: '2026-04-05'
      },
      {
        _id: 'sch-2',
        subject: 'ساینس',
        instructor: { name: 'استاد دوم' },
        schoolClass: { title: 'صنف 10B' },
        startTime: '09:00',
        endTime: '10:00',
        visibility: 'published',
        date: '2026-04-05'
      },
      {
        _id: 'sch-3',
        subject: 'فزیک',
        instructor: { name: 'استاد سوم' },
        schoolClass: { title: 'صنف 11A' },
        startTime: '10:00',
        endTime: '11:00',
        visibility: 'draft',
        date: '2026-04-05'
      }
    ];

    await page.route('**/api/schedules/today', async (route) => {
      todayCallCount += 1;
      const items = useUpdatedPayload ? refreshedItems : initialItems;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items, date: '2026-04-05' })
      });
    });

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    const schedulePanel = page.locator('.admin-activity', {
      has: page.getByRole('heading', { name: 'تقسیم اوقات امروز' })
    }).first();

    await expect(schedulePanel).toContainText('کل: ۲');
    await schedulePanel.getByRole('button', { name: 'راهنما' }).click();
    await expect(schedulePanel).toContainText('این ویجت وضعیت اجرایی برنامه امروز را نشان می‌دهد');
    await schedulePanel.getByRole('button', { name: 'راهنما' }).click();
    await expect(schedulePanel).toContainText('منتشرشده: ۱');
    await expect(schedulePanel).toContainText('پیش‌نویس: ۱');
    await expect(schedulePanel).toContainText('شاخص سلامت:');
    await expect(schedulePanel).toContainText('فرمول شاخص:');
    await expect(schedulePanel).toContainText('پیش‌نویس:');
    await expect(schedulePanel).toContainText('تداخل:');
    await expect(schedulePanel).toContainText('اتاق نامشخص:');
    await expect(schedulePanel.locator('.admin-schedule-visibility.published')).toHaveCount(1);
    await expect(schedulePanel.locator('.admin-schedule-visibility.draft')).toHaveCount(1);

    await expect(schedulePanel.getByRole('link', { name: 'اقدام سریع' }).first()).toHaveAttribute('href', /\/admin-schedule\?date=2026-04-05$/);

    useUpdatedPayload = true;
    await schedulePanel.getByRole('button', { name: 'بروزرسانی' }).click();

    await expect(schedulePanel).toContainText('کل: ۳');
    await expect(schedulePanel).toContainText('منتشرشده: ۲');
    await expect(schedulePanel).toContainText('پیش‌نویس: ۱');
    await expect(todayCallCount).toBeGreaterThanOrEqual(2);
  });

  test('supports visibility filter and shows near-start/conflict flags', async ({ page }) => {
    const now = new Date();
    const nowMinutes = (now.getHours() * 60) + now.getMinutes();
    const soonStart = Math.min(nowMinutes + 10, 1430);
    const soonEnd = Math.min(soonStart + 40, 1439);
    const liveStart = Math.max(nowMinutes - 10, 0);
    const liveEnd = Math.min(nowMinutes + 20, 1439);

    const toClock = (value) => {
      const clamped = Math.max(0, Math.min(1439, Number(value || 0)));
      const hour = String(Math.floor(clamped / 60)).padStart(2, '0');
      const minute = String(clamped % 60).padStart(2, '0');
      return `${hour}:${minute}`;
    };

    await page.route('**/api/schedules/today', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'sch-c1',
              subject: 'ریاضی',
              instructor: { _id: 'teacher-1', name: 'استاد مشترک' },
              schoolClass: { title: 'صنف 10A' },
              startTime: '11:00',
              endTime: '12:00',
              visibility: 'published',
              room: 'A1',
              date: '2026-04-05'
            },
            {
              _id: 'sch-c2',
              subject: 'فزیک',
              instructor: { _id: 'teacher-1', name: 'استاد مشترک' },
              schoolClass: { title: 'صنف 10B' },
              startTime: '11:30',
              endTime: '12:30',
              visibility: 'draft',
              room: 'A2',
              date: '2026-04-05'
            },
            {
              _id: 'sch-soon',
              subject: 'ساینس',
              instructor: { _id: 'teacher-2', name: 'استاد زمان' },
              schoolClass: { title: 'صنف 11A' },
              startTime: toClock(soonStart),
              endTime: toClock(soonEnd),
              visibility: 'published',
              room: 'B1',
              date: '2026-04-05'
            },
            {
              _id: 'sch-live',
              subject: 'کیمیا',
              instructor: { _id: 'teacher-3', name: 'استاد زنده' },
              schoolClass: { title: 'صنف 11B' },
              startTime: toClock(liveStart),
              endTime: toClock(liveEnd),
              visibility: 'published',
              room: '',
              date: '2026-04-05'
            }
          ]
        })
      });
    });

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    const schedulePanel = page.locator('.admin-activity', {
      has: page.getByRole('heading', { name: 'تقسیم اوقات امروز' })
    }).first();

    await expect(schedulePanel.locator('.admin-schedule-flag.soon')).toHaveCount(1);
    await expect(schedulePanel.locator('.admin-schedule-flag.live')).toHaveCount(1);
    await expect(schedulePanel.locator('.admin-schedule-flag.room-missing')).toHaveCount(1);
    await expect(schedulePanel).toContainText('تداخل: استاد');

    const alertsPanel = page.locator('.admin-alerts').first();
    await expect(alertsPanel).toContainText('تداخل‌های شدید امروز تقسیم اوقات');

    await schedulePanel.locator('.admin-schedule-health-item', { hasText: 'تداخل:' }).click();
    await expect(schedulePanel).toContainText('نمایش: ۲');
    await expect(schedulePanel).toContainText('ریاضی');
    await expect(schedulePanel).toContainText('فزیک');
    await expect(schedulePanel).not.toContainText('ساینس');
    await expect(schedulePanel).not.toContainText('کیمیا');

    await schedulePanel.locator('.admin-schedule-health-item', { hasText: 'تداخل:' }).click();
    await expect(schedulePanel).toContainText('نمایش: ۴');

    await schedulePanel.getByRole('button', { name: 'فقط پیش‌نویس' }).click();
    await expect(schedulePanel).toContainText('نمایش: ۱');
    await expect(schedulePanel).toContainText('شاخص سلامت:');
    await expect(schedulePanel).toContainText('فرمول شاخص:');
    await expect(schedulePanel).toContainText('پیش‌نویس:');
    await expect(schedulePanel).toContainText('تداخل:');
    await expect(schedulePanel).toContainText('اتاق نامشخص:');
    await expect(schedulePanel).toContainText('فزیک');
    await expect(schedulePanel).not.toContainText('ریاضی');
    await expect(schedulePanel).not.toContainText('ساینس');

    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloadedPanel = page.locator('.admin-activity', {
      has: page.getByRole('heading', { name: 'تقسیم اوقات امروز' })
    }).first();
    await expect(reloadedPanel).toContainText('نمایش: ۱');
    await expect(reloadedPanel).toContainText('فزیک');
    await expect(reloadedPanel).not.toContainText('ریاضی');

    await reloadedPanel.getByRole('button', { name: 'بازنشانی فیلترها' }).click();
    await expect(reloadedPanel).toContainText('نمایش: ۴');
    await expect(reloadedPanel).toContainText('ریاضی');
    await expect(reloadedPanel).toContainText('ساینس');

    await reloadedPanel.getByRole('button', { name: 'فقط پیش‌نویس' }).click();
    await expect(reloadedPanel).toContainText('نمایش: ۱');

    await page.keyboard.press('Alt+Shift+R');
    await expect(reloadedPanel).toContainText('نمایش: ۴');
    await expect(reloadedPanel).toContainText('ریاضی');
    await expect(reloadedPanel).toContainText('ساینس');
  });
});
