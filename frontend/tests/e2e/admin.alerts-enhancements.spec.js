import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

const mockDashboardDependencies = async (page) => {
  await page.route('**/api/admin/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        users: 100,
        courses: 15,
        todayPayments: 3,
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
          totalStudents: 200,
          totalInstructors: 18,
          totalRevenue: 100000,
          totalDue: 125000,
          outstandingAmount: 25000,
          attendanceRate: 86,
          todayPayments: 3,
          pendingFinanceReviews: 4,
          pendingProfileRequests: 5,
          pendingAccessRequests: 6,
          monthlyRevenue: 35000,
          previousMonthRevenue: 30000,
          monthDeltaPercent: 16.6
        },
        tasks: [],
        alerts: [],
        revenueTrend: [],
        studentGrowth: []
      })
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

const mockAlerts = async (page) => {
  await page.route('**/api/admin/alerts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        alerts: [
          {
            key: 'finance_receipts',
            title: 'رسیدهای مالی در انتظار تایید',
            domain: 'finance',
            owner: 'تیم مالی',
            level: 'high',
            count: 14,
            oldestPendingMinutes: 980,
            slaMinutes: 720,
            overSla: true,
            requiresImmediateAction: true,
            trendDirection: 'up',
            trendPercent: 22,
            trendDiff: 3
          },
          {
            key: 'access',
            title: 'درخواست‌های دسترسی',
            domain: 'users',
            owner: 'تیم کاربران',
            level: 'medium',
            count: 5,
            oldestPendingMinutes: 210,
            slaMinutes: 480,
            overSla: false,
            requiresImmediateAction: false,
            trendDirection: 'up',
            trendPercent: 10,
            trendDiff: 1
          },
          {
            key: 'profile',
            title: 'درخواست‌های تغییر مشخصات',
            domain: 'users',
            owner: 'تیم کاربران',
            level: 'medium',
            count: 7,
            oldestPendingMinutes: 620,
            slaMinutes: 480,
            overSla: true,
            requiresImmediateAction: true,
            trendDirection: 'steady',
            trendPercent: 0,
            trendDiff: 0
          },
          {
            key: 'contacts',
            title: 'پیام‌های خوانده‌نشده پشتیبانی',
            domain: 'support',
            owner: 'تیم پشتیبانی',
            level: 'low',
            count: 3,
            oldestPendingMinutes: 45,
            slaMinutes: 720,
            overSla: false,
            requiresImmediateAction: false,
            trendDirection: 'down',
            trendPercent: -20,
            trendDiff: -1
          }
        ]
      })
    });
  });
};

test.describe('admin alerts enhancements', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports']
    });
    await mockDashboardDependencies(page);
    await mockAlerts(page);
  });

  test('renders urgent alerts section with actionable items', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    const alertsPanel = page.locator('.admin-alerts').first();
    await expect(alertsPanel.getByRole('heading', { name: 'هشدارهای مدیریتی' })).toBeVisible();

    await expect(alertsPanel.locator('.admin-alert-subhead').filter({ hasText: 'نیازمند اقدام امروز' })).toBeVisible();
    await expect(alertsPanel).toContainText('رسیدهای مالی در انتظار تایید');
    await expect(alertsPanel).toContainText('درخواست‌های تغییر مشخصات');
    await expect(alertsPanel).toContainText('از SLA عبور کرده');
  });

  test('filters alerts by domain and supports snooze persistence', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    const alertsPanel = page.locator('.admin-alerts').first();

    await alertsPanel.locator('.admin-alert-domain-filter').selectOption('users');
    await expect(alertsPanel).toContainText('درخواست‌های دسترسی');
    await expect(alertsPanel).toContainText('درخواست‌های تغییر مشخصات');
    await expect(alertsPanel).not.toContainText('رسیدهای مالی در انتظار تایید');

    const accessRow = alertsPanel.locator('.admin-activity-item', { hasText: 'درخواست‌های دسترسی' });
    await accessRow.locator('.admin-alert-snooze').click();

    await expect(alertsPanel).not.toContainText('درخواست‌های دسترسی');
    await expect(alertsPanel).toContainText('بی‌صدا:');

    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloadedPanel = page.locator('.admin-alerts').first();
    await reloadedPanel.locator('.admin-alert-domain-filter').selectOption('users');
    await expect(reloadedPanel).not.toContainText('درخواست‌های دسترسی');

    await reloadedPanel.locator('.admin-alert-unsnooze-all').click();
    await expect(reloadedPanel).toContainText('درخواست‌های دسترسی');
  });
});
