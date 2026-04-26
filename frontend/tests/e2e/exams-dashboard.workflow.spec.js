import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  };
}

test.describe('exams dashboard workflow', () => {
  test('exams dashboard shows kpis, trends, and quick actions', async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['manage_content', 'view_reports']
    });

    await page.route('**/api/dashboard/exams', async (route) => {
      await route.fulfill(json({
        success: true,
        generatedAt: '2026-03-26T11:20:00.000Z',
        summary: {
          activeSessions: 4,
          publishedSessions: 3,
          draftSessions: 1,
          averageMark: 81,
          passRate: 87,
          pendingResults: 2
        },
        statusTrend: [
          { id: 'published', label: 'منتشرشده', value: 3 },
          { id: 'draft', label: 'پیش‌نویس', value: 1 },
          { id: 'active', label: 'فعال', value: 4 }
        ],
        recentSessions: [
          { id: 'session-1', label: 'امتحان ریاضی', value: 82 },
          { id: 'session-2', label: 'امتحان علوم', value: 79 }
        ],
        tasks: [
          { id: 'task-1', label: 'نتیجه‌های در انتظار', meta: '2 مورد', tone: 'rose' }
        ],
        alerts: [
          { id: 'alert-1', label: 'یک جلسه هنوز در حالت پیش‌نویس است.', meta: 'نیازمند نشر', tone: 'copper' }
        ]
      }));
    });

    await page.goto('/admin-exams-dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.exams-dashboard-page .dash-hero')).toBeVisible();
    await expect(page.locator('.dashboard-summary-card__grid .dashboard-kpi-card')).toHaveCount(4);
    await expect(page.locator('.dash-card').filter({ hasText: 'روند وضعیت جلسه‌ها' })).toBeVisible();
    await expect(page.locator('.dashboard-quick-link').filter({ hasText: 'ایجاد امتحان' })).toBeVisible();
    await expect(page.locator('.dash-card').filter({ hasText: 'کارهای باز' })).toContainText('نتیجه‌های در انتظار');
  });
});
