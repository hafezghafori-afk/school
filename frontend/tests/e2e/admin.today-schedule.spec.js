import { test, expect } from '@playwright/test';

import { setupAdminWorkspace, setupAdminDashboard, gotoAdminDashboard, modernPanel } from './adminWorkspace.helpers';

const scheduleRow = (overrides = {}) => ({
  _id: 'sch-1',
  subject: 'ریاضی',
  instructor: { _id: 'teacher-1', name: 'استاد اول' },
  schoolClass: { _id: 'class-10a', title: 'صنف 10A' },
  startTime: '08:00',
  endTime: '09:00',
  visibility: 'published',
  room: 'A1',
  date: '2026-04-05',
  ...overrides
});

const mockTodaySchedule = async (page, items) => {
  await page.route('**/api/schedules/today*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items, date: '2026-04-05' })
    });
  });
};

test.describe('admin today schedule', () => {
  test('a school manager sees today lessons on the dashboard', async ({ page }) => {
    // «برنامه امروز» only renders for a non-general-president admin; the
    // general president's second column carries the management queues instead.
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_schedule'],
      user: { adminLevel: 'school_manager', orgRole: 'school_manager' }
    });
    await setupAdminDashboard(page);
    await mockTodaySchedule(page, [
      scheduleRow(),
      scheduleRow({
        _id: 'sch-2',
        subject: 'ساینس',
        instructor: { _id: 'teacher-2', name: 'استاد دوم' },
        schoolClass: { _id: 'class-10b', title: 'صنف 10B' },
        startTime: '09:00',
        endTime: '10:00',
        visibility: 'draft',
        room: 'A2'
      })
    ]);

    await gotoAdminDashboard(page);

    const schedulePanel = modernPanel(page, 'برنامه امروز');
    await expect(schedulePanel).toBeVisible();

    const rows = schedulePanel.locator('.admin-modern-list-item');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('ریاضی');
    await expect(rows.nth(0)).toContainText('08:00 - 09:00');
    await expect(rows.nth(1)).toContainText('ساینس');
    await expect(rows.nth(1)).toContainText('09:00 - 10:00');
  });

  test('an overlapping teacher raises a severe conflict as an urgent item', async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_schedule'],
      user: { adminLevel: 'school_manager', orgRole: 'school_manager' }
    });
    await setupAdminDashboard(page);

    // Same instructor, overlapping times: the dashboard derives a
    // `schedule_conflicts` alert from today's schedule itself, and a clash of
    // teacher or class counts as severe, which is what promotes it out of
    // «هشدارهای کلیدی» and into the urgent queue.
    await mockTodaySchedule(page, [
      scheduleRow({
        _id: 'sch-c1',
        subject: 'ریاضی',
        instructor: { _id: 'teacher-1', name: 'استاد مشترک' },
        startTime: '11:00',
        endTime: '12:00'
      }),
      scheduleRow({
        _id: 'sch-c2',
        subject: 'فزیک',
        instructor: { _id: 'teacher-1', name: 'استاد مشترک' },
        schoolClass: { _id: 'class-10b', title: 'صنف 10B' },
        startTime: '11:30',
        endTime: '12:30',
        room: 'A2'
      })
    ]);

    await gotoAdminDashboard(page);

    const conflictItem = modernPanel(page, 'کارهای فوری')
      .locator('a.admin-modern-list-item', { hasText: 'تداخل‌های شدید امروز تقسیم اوقات' });
    await expect(conflictItem).toHaveAttribute('href', '/timetable/editor');
    await expect(conflictItem).toContainText('۱ مورد');
  });

  test('a clash-free day raises no conflict item', async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_schedule'],
      user: { adminLevel: 'school_manager', orgRole: 'school_manager' }
    });
    await setupAdminDashboard(page);
    await mockTodaySchedule(page, [
      scheduleRow({ _id: 'sch-a', startTime: '08:00', endTime: '09:00' }),
      scheduleRow({
        _id: 'sch-b',
        subject: 'فزیک',
        instructor: { _id: 'teacher-2', name: 'استاد دوم' },
        schoolClass: { _id: 'class-10b', title: 'صنف 10B' },
        startTime: '09:00',
        endTime: '10:00',
        room: 'A2'
      })
    ]);

    await gotoAdminDashboard(page);

    await expect(modernPanel(page, 'برنامه امروز')).toContainText('فزیک');

    const urgentPanel = modernPanel(page, 'کارهای فوری');
    await expect(urgentPanel).not.toContainText('تداخل');
    await expect(urgentPanel).toContainText('مورد فوری ثبت نشده است');
  });

  // DELETED: the summary chips, health index, visibility badges, «راهنما»
  // help text, «بروزرسانی» manual refresh, visibility filter, near-start /
  // live / room-missing flags, «بازنشانی فیلترها» and the Alt+Shift+R reset.
  //
  // All of that belonged to `.admin-activity.admin-schedule-card`
  // (AdminPanel.jsx ~6084-6260), inside the legacy layout AdminPanel.css hides
  // unconditionally. The modern dashboard replaced the widget with a plain
  // read-only list of up to six lessons, so there is no chip to count, no badge
  // to read, no filter to drive and no refresh button to press. What survived
  // — the lessons themselves and the conflict detection behind them — is what
  // the three tests above cover.
});
