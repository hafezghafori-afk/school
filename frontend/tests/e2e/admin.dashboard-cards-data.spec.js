import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

const setupDashboardBaseMocks = async (page, { dashboardPayload, statsPayload }) => {
  await page.route('**/api/admin/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        users: 120,
        courses: 16,
        todayPayments: 4,
        pendingOrders: statsPayload.pendingOrders
      })
    });
  });

  await page.route('**/api/dashboard/admin', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        ...dashboardPayload
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
        timeouts: {
          finance_manager: 120,
          finance_lead: 240,
          general_president: 480
        }
      })
    });
  });
};

test.describe('admin dashboard cards data wiring', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports']
    });
  });

  test('task and alert cards render values coming from /api/dashboard/admin', async ({ page }) => {
    await setupDashboardBaseMocks(page, {
      dashboardPayload: {
        generatedAt: '2026-04-04T09:00:00.000Z',
        summary: {
          totalStudents: 250,
          totalInstructors: 20,
          totalRevenue: 120000,
          totalDue: 150000,
          outstandingAmount: 30000,
          attendanceRate: 87,
          todayPayments: 3,
          pendingFinanceReviews: 7,
          pendingProfileRequests: 5,
          pendingAccessRequests: 2,
          monthlyRevenue: 45000,
          previousMonthRevenue: 43000,
          monthDeltaPercent: 4.6
        },
        tasks: [
          { id: 'task-1', label: 'API_TASK_ALPHA', meta: 'API_META_TASK_ALPHA_77' },
          { id: 'task-2', label: 'API_TASK_BETA', meta: 'API_META_TASK_BETA_55' }
        ],
        alerts: [
          { id: 'alert-1', label: 'API_ALERT_ALPHA', meta: 'API_META_ALERT_ALPHA_22' },
          { id: 'alert-2', label: 'API_ALERT_BETA', meta: 'API_META_ALERT_BETA_11' }
        ],
        revenueTrend: [],
        studentGrowth: []
      },
      statsPayload: {
        pendingOrders: 7
      }
    });

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    const executiveStrip = page.locator('.admin-executive-strip');
    await expect(executiveStrip).toBeVisible();

    await expect(executiveStrip).toContainText('API_TASK_ALPHA');
    await expect(executiveStrip).toContainText('API_META_TASK_ALPHA_77');
    await expect(executiveStrip).toContainText('API_ALERT_ALPHA');
    await expect(executiveStrip).toContainText('API_META_ALERT_ALPHA_22');
  });

  test('shows zero-signal warning when key queues are simultaneously zero', async ({ page }) => {
    await setupDashboardBaseMocks(page, {
      dashboardPayload: {
        generatedAt: '2026-04-04T09:15:00.000Z',
        summary: {
          totalStudents: 140,
          totalInstructors: 12,
          totalRevenue: 10000,
          totalDue: 10000,
          outstandingAmount: 0,
          attendanceRate: 80,
          todayPayments: 0,
          pendingFinanceReviews: 0,
          pendingProfileRequests: 0,
          pendingAccessRequests: 0,
          monthlyRevenue: 5000,
          previousMonthRevenue: 5000,
          monthDeltaPercent: 0
        },
        tasks: [],
        alerts: [],
        revenueTrend: [],
        studentGrowth: []
      },
      statsPayload: {
        pendingOrders: 0
      }
    });

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.admin-executive-strip__warning')).toBeVisible();
    await expect(page.locator('.admin-executive-strip__warning')).toContainText('چند شاخص کلیدی به‌صورت همزمان صفر است');
  });
});
