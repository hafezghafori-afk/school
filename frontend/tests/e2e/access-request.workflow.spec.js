import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

test.describe('access request workflow', () => {
  test('requester can submit missing permission request from access denied screen', async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_content', 'manage_finance'],
      user: {
        adminLevel: 'finance_manager',
        orgRole: 'finance_manager'
      }
    });

    let accessRequestPayload = null;
    await page.route('**/api/users/me/access-request', async (route) => {
      accessRequestPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'درخواست شما برای ادمین ارسال شد'
        })
      });
    });

    await page.goto('/admin-users', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.access-denied__title')).toBeVisible();
    const requestBtn = page.locator('.access-denied__btn--warn');
    await expect(requestBtn).toBeVisible();

    await requestBtn.click();
    await expect(page.locator('.access-denied__feedback')).toBeVisible();

    expect(accessRequestPayload).toBeTruthy();
    expect(accessRequestPayload.permission).toBe('manage_users');
    expect(accessRequestPayload.route).toBe('/admin-users');
  });

  test('approver can review, filter and approve access requests', async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_content', 'manage_finance', 'manage_users'],
      user: {
        adminLevel: 'finance_manager',
        orgRole: 'finance_manager'
      }
    });

    let requestStatus = 'pending';
    let listQueryStatus = 'pending';
    let approveEndpointHit = '';

    const accessItem = {
      _id: 'access-1',
      permission: 'manage_content',
      route: '/admin-education',
      status: 'pending',
      requestNote: 'برای مدیریت محتوا نیاز دارم',
      createdAt: '2026-04-04T09:00:00.000Z',
      requester: {
        _id: 'user-2',
        name: 'User Requester',
        email: 'requester@example.com'
      }
    };

    await page.route('**/api/admin/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/admin/access-requests?**', async (route) => {
      const url = new URL(route.request().url());
      listQueryStatus = url.searchParams.get('status') || 'pending';
      const row = { ...accessItem, status: requestStatus };
      const items = listQueryStatus === 'all'
        ? [row]
        : listQueryStatus === requestStatus
          ? [row]
          : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items })
      });
    });

    await page.route('**/api/admin/access-requests/access-1/approve', async (route) => {
      approveEndpointHit = route.request().url();
      requestStatus = 'approved';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item: { ...accessItem, status: 'approved' },
          message: 'درخواست دسترسی تایید شد'
        })
      });
    });

    await page.goto('/admin-users#access-requests', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'درخواست‌های دسترسی' })).toBeVisible();
    await expect(page.locator('.access-request-row')).toHaveCount(2);

    const approveBtn = page.locator('.access-request-row').nth(1).getByRole('button', { name: 'تایید' });
    await approveBtn.click();

    await expect(page.getByRole('heading', { name: 'تایید درخواست دسترسی' })).toBeVisible();
    await page.getByRole('button', { name: 'تایید نهایی' }).click();

    expect(approveEndpointHit).toContain('/api/admin/access-requests/access-1/approve');

    await page.locator('.access-requests-tools select').selectOption('approved');
    await expect(page.locator('.access-status-pill.status-approved')).toHaveCount(1);
    expect(listQueryStatus).toBe('approved');

    await page.locator('.access-requests-tools select').selectOption('rejected');
    await expect(page.locator('.access-requests-empty')).toContainText('درخواستی برای نمایش وجود ندارد');
  });

  test('approver bulk reject requires note and then submits successfully', async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_content', 'manage_finance', 'manage_users'],
      user: {
        adminLevel: 'finance_manager',
        orgRole: 'finance_manager'
      }
    });

    let bulkPayload = null;

    const pendingItems = [
      {
        _id: 'access-b1',
        permission: 'manage_content',
        route: '/admin-education',
        status: 'pending',
        requestNote: '',
        createdAt: '2026-04-04T09:00:00.000Z',
        requester: { _id: 'user-1', name: 'User One', email: 'one@example.com' }
      },
      {
        _id: 'access-b2',
        permission: 'manage_users',
        route: '/admin-users',
        status: 'pending',
        requestNote: '',
        createdAt: '2026-04-04T09:10:00.000Z',
        requester: { _id: 'user-2', name: 'User Two', email: 'two@example.com' }
      }
    ];

    await page.route('**/api/admin/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/admin/access-requests?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: pendingItems })
      });
    });

    await page.route('**/api/admin/access-requests/bulk', async (route) => {
      bulkPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          summary: {
            approvedCount: 0,
            rejectedCount: 2,
            changedPermissionsCount: 0,
            skippedCount: 0
          }
        })
      });
    });

    await page.goto('/admin-users#access-requests', { waitUntil: 'domcontentloaded' });

    await page.locator('.access-bulk-select-all input[type="checkbox"]').check();
    await page.locator('.access-bulk-actions .access-action.reject').click();
    await expect(page.locator('.access-requests-message')).toContainText('برای رد گروهی، دلیل رد را وارد کنید');

    await page.locator('.access-bulk-panel textarea').fill('نیازمندی تایید نشد');
    await page.locator('.access-bulk-actions .access-action.reject').click();

    await expect.poll(() => !!bulkPayload).toBeTruthy();
    expect(bulkPayload).toBeTruthy();
    expect(bulkPayload.action).toBe('reject');
    expect(bulkPayload.ids).toEqual(['access-b1', 'access-b2']);
    expect(bulkPayload.note).toContain('نیازمندی');
  });
});
