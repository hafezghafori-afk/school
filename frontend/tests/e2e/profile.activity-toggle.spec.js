import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

test.describe('profile activity toggle workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_content', 'manage_finance']
    });

    await page.route('**/api/users/me/profile-update-request', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: null })
      });
    });

    await page.route('**/api/users/me/activity', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            { _id: 'act-1', action: 'update_profile', createdAt: '2026-04-01T08:00:00.000Z' },
            { _id: 'act-2', action: 'upload_avatar', createdAt: '2026-04-01T09:00:00.000Z' },
            { _id: 'act-3', action: 'finance_create_bill', createdAt: '2026-04-01T10:00:00.000Z' },
            { _id: 'act-4', action: 'create_schedule', createdAt: '2026-04-01T11:00:00.000Z' },
            { _id: 'act-5', action: 'finance_set_installments', createdAt: '2026-04-01T12:00:00.000Z' },
            { _id: 'act-6', action: 'create_course', createdAt: '2026-04-01T13:00:00.000Z' }
          ]
        })
      });
    });
  });

  test('shows 3 activities by default and expands/collapses with persisted state', async ({ page }) => {
    await page.goto('/profile', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.activity-title')).toContainText('فعالیت‌های اخیر');
    await expect(page.locator('.profile-activity-item')).toHaveCount(3);

    const toggle = page.locator('button.profile-activity-toggle');
    await expect(toggle).toContainText('فعالیت بیشتر');

    await toggle.click();
    await expect(page.locator('.profile-activity-item')).toHaveCount(6);
    await expect(toggle).toContainText('نمایش کمتر');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.profile-activity-item')).toHaveCount(6);
    await expect(page.locator('button.profile-activity-toggle')).toContainText('نمایش کمتر');

    await page.locator('button.profile-activity-toggle').click();
    await expect(page.locator('.profile-activity-item')).toHaveCount(3);
  });

  test('does not show toggle when activity count is 3 or fewer', async ({ page }) => {
    await page.unroute('**/api/users/me/activity');
    await page.route('**/api/users/me/activity', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            { _id: 'small-act-1', action: 'update_profile', createdAt: '2026-04-01T08:00:00.000Z' },
            { _id: 'small-act-2', action: 'upload_avatar', createdAt: '2026-04-01T09:00:00.000Z' },
            { _id: 'small-act-3', action: 'create_schedule', createdAt: '2026-04-01T10:00:00.000Z' }
          ]
        })
      });
    });

    await page.goto('/profile', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.profile-activity-item')).toHaveCount(3);
    await expect(page.locator('button.profile-activity-toggle')).toHaveCount(0);
  });
});
