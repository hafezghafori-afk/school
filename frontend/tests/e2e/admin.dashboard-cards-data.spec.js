import { test, expect } from '@playwright/test';

import { setupAdminWorkspace, setupAdminDashboard, gotoAdminDashboard } from './adminWorkspace.helpers';

// /api/admin/stats answers some of the same questions as /api/dashboard/admin,
// and executiveSummary prefers one over the other field by field. Giving the
// two endpoints deliberately different numbers is what makes this spec able to
// say which one reached the card.
const setupDashboardBaseMocks = async (page, { dashboardPayload }) => {
  await page.route('**/api/admin/stats*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        users: 120,
        courses: 16,
        todayPayments: 4,
        pendingOrders: 7
      })
    });
  });

  await page.route('**/api/dashboard/admin*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        ...dashboardPayload
      })
    });
  });
};

const kpiValue = (page, label) => page
  .locator('.admin-modern-kpis .dashboard-kpi-card', { hasText: label })
  .locator('h3');

test.describe('admin dashboard cards data wiring', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports']
    });
    await setupAdminDashboard(page);
  });

  test('kpi cards render values coming from /api/dashboard/admin', async ({ page }) => {
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
        revenueTrend: [],
        studentGrowth: []
      }
    });

    await gotoAdminDashboard(page);

    // 250 rather than the 120 users /api/admin/stats reports: this card reads
    // dashboardSummary.totalStudents and only falls back to stats.users when
    // the dashboard summary has nothing to say.
    await expect(kpiValue(page, 'کل شاگردان')).toHaveText('۲۵۰');
    await expect(kpiValue(page, 'کل اساتید')).toHaveText('۲۰');
    await expect(kpiValue(page, 'حضور عمومی')).toHaveText('۸۷٪');

    // The money figures carry a locale thousands separator whose exact
    // codepoint is ICU's business, not this spec's — match the digits and let
    // the separator be whatever Chromium renders.
    await expect(kpiValue(page, 'عواید کل این ماه')).toHaveText(/^۴۵.?۰۰۰$/);
    await expect(kpiValue(page, 'بدهی باز کل')).toHaveText(/^۳۰.?۰۰۰$/);
  });

  // DELETED: 'shows zero-signal warning when key queues are simultaneously zero'.
  //
  // `.admin-executive-strip__warning` and its text «چند شاخص کلیدی به‌صورت
  // همزمان صفر است» appear nowhere in frontend/src — the executive strip was
  // removed along with the rest of the classic layout's summary row, and no
  // equivalent warning was built into the modern dashboard. There is nothing
  // left to point this test at.
  //
  // The same removal took the strip's task and alert lists with it: the `tasks`
  // and `alerts` arrays on /api/dashboard/admin are no longer read anywhere in
  // AdminPanel.jsx. The dashboard's urgent and key-alert panels are fed by
  // /api/admin/alerts instead, and admin.alerts-enhancements.spec.js covers
  // those.
});
