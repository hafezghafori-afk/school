import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

test.describe('profile executive desk workflow', () => {
  test('shows executive desk for general president and disables actions when counts are zero', async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_content', 'manage_finance', 'manage_users']
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
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/admin/alerts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          summary: {
            pendingProfile: 0,
            pendingAccessRequests: 0,
            unreadContacts: 0
          },
          alerts: []
        })
      });
    });

    await page.goto('/profile', { waitUntil: 'domcontentloaded' });

    const desk = page.locator('.profile-executive-desk');
    await expect(desk).toBeVisible();
    await expect(desk).toContainText('میز کار ریاست عمومی');

    const cards = desk.locator('.profile-executive-card');
    await expect(cards).toHaveCount(3);
    await expect(desk.locator('.profile-executive-card-head i')).toHaveCount(3);
    await expect(desk.locator('.profile-executive-card.tone-low')).toHaveCount(3);
    await expect(desk.locator('.profile-executive-priority.tone-medium')).toHaveCount(0);
    await expect(desk.locator('.profile-executive-priority.tone-high')).toHaveCount(0);

    const disabledActions = desk.locator('.profile-executive-action.is-disabled');
    await expect(disabledActions).toHaveCount(3);
    await expect(disabledActions.nth(0)).toContainText('موردی نیست');
  });

  test('marks medium and high priorities when pending items and high alerts exist', async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_content', 'manage_finance', 'manage_users']
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
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/admin/alerts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          summary: {
            pendingProfile: 2,
            pendingAccessRequests: 1,
            unreadContacts: 0
          },
          alerts: [
            { key: 'finance_receipts', level: 'high', title: 'رسیدهای مالی در انتظار تایید', count: 2 }
          ]
        })
      });
    });

    await page.goto('/profile', { waitUntil: 'domcontentloaded' });

    const desk = page.locator('.profile-executive-desk');
    await expect(desk).toBeVisible();
    await expect(desk.locator('.profile-executive-card.tone-medium')).toHaveCount(2);
    await expect(desk.locator('.profile-executive-card.tone-high')).toHaveCount(1);
    await expect(desk.locator('.profile-executive-action.is-disabled')).toHaveCount(0);
    await expect(desk.locator('.profile-executive-priority.tone-high')).toContainText('بحرانی');
    await expect(desk.locator('.profile-executive-banner')).toContainText('موارد بحرانی نیازمند اقدام فوری هستند');

    const firstCard = desk.locator('.profile-executive-card').first();
    await expect(firstCard).toHaveClass(/tone-high/);
    await expect(firstCard).toContainText('هشدارهای مدیریتی');
  });

  test('hides executive desk for non-general-president admin levels', async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_content', 'manage_finance', 'manage_users'],
      user: {
        adminLevel: 'finance_manager',
        orgRole: 'finance_manager'
      }
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
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.goto('/profile', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.profile-executive-desk')).toHaveCount(0);
  });
});
