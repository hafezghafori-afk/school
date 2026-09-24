import { test, expect } from '@playwright/test';

import { setupAdminWorkspace, setupAdminDashboard, gotoAdminDashboard, modernPanel } from './adminWorkspace.helpers';

// Two of these four are urgent by the page's own rule — level 'high', overSla,
// or requiresImmediateAction — and two are not. The split is the thing worth
// guarding: an operator's «کارهای فوری مدیریتی» panel must not quietly fill up
// with alerts that can wait until tomorrow.
const mockAlerts = async (page) => {
  await page.route('**/api/admin/alerts*', async (route) => {
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
    await setupAdminDashboard(page);
    await mockAlerts(page);
  });

  test('splits urgent alerts from the rest across the two dashboard panels', async ({ page }) => {
    await gotoAdminDashboard(page);

    // general_president has no alert-domain filter (ADMIN_LEVEL_ALERT_DOMAINS
    // maps it to null), so all four alerts reach the dashboard and the only
    // thing sorting them is urgency.
    const urgentPanel = modernPanel(page, 'کارهای فوری مدیریتی');
    await expect(urgentPanel).toBeVisible();
    await expect(urgentPanel).toContainText('رسیدهای مالی در انتظار تایید');
    await expect(urgentPanel).toContainText('درخواست‌های تغییر مشخصات');
    await expect(urgentPanel).not.toContainText('درخواست‌های دسترسی');
    await expect(urgentPanel).not.toContainText('پیام‌های خوانده‌نشده پشتیبانی');

    const keyAlertsPanel = modernPanel(page, 'هشدارهای کلیدی');
    await expect(keyAlertsPanel).toBeVisible();
    await expect(keyAlertsPanel).toContainText('درخواست‌های دسترسی');
    await expect(keyAlertsPanel).toContainText('پیام‌های خوانده‌نشده پشتیبانی');
    await expect(keyAlertsPanel).not.toContainText('رسیدهای مالی در انتظار تایید');
    await expect(keyAlertsPanel).not.toContainText('درخواست‌های تغییر مشخصات');
  });

  test('each alert carries its count and a link to the queue it belongs to', async ({ page }) => {
    await gotoAdminDashboard(page);

    // The counts are what make an alert actionable — a row that says only
    // «رسیدهای مالی در انتظار تایید» does not tell anyone whether to drop what
    // they are doing. Urgent rows render the count as «۱۴ مورد»; the key-alert
    // panel renders it as a bare tag.
    const urgentReceipts = modernPanel(page, 'کارهای فوری مدیریتی')
      .locator('a.admin-modern-list-item', { hasText: 'رسیدهای مالی در انتظار تایید' });
    await expect(urgentReceipts).toHaveAttribute('href', '/admin-finance#pending-receipts');
    await expect(urgentReceipts).toContainText('۱۴');

    const keyAccess = modernPanel(page, 'هشدارهای کلیدی')
      .locator('a.admin-modern-list-item', { hasText: 'درخواست‌های دسترسی' });
    await expect(keyAccess).toHaveAttribute('href', '/admin-users#access-requests');
    await expect(keyAccess).toContainText('۵');
    await expect(keyAccess).toContainText('تیم کاربران');
  });

  // DELETED: 'filters alerts by domain and supports snooze persistence'.
  //
  // That spec drove `.admin-alert-domain-filter`, `.admin-alert-snooze` and
  // `.admin-alert-unsnooze-all`. All three exist only inside the legacy
  // `.admin-alerts` block (AdminPanel.jsx ~5932-6040), which AdminPanel.css
  // hides unconditionally — so no operator can reach the domain filter or
  // snooze an alert. The state behind them (alertDomainFilter, snoozedAlerts)
  // is still wired into visibleAlerts, but with no control rendered it never
  // moves off its default, and a test that drove it would be asserting on a
  // feature the product no longer offers.
});
