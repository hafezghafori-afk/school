import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

test.describe('student report activity timeline toggles workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_content', 'manage_finance']
    });

    await page.route('**/api/student-profiles', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              studentId: 'student-1',
              fullName: 'شاگرد الف',
              email: 'student1@example.test',
              admissionNo: 'A-1001',
              currentMembership: {
                schoolClass: { title: 'صنف 10 الف' },
                academicYear: { label: '1406' }
              }
            }
          ]
        })
      });
    });

    await page.route('**/api/student-profiles/student-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item: {
            identity: {
              fullName: 'شاگرد الف',
              status: 'active',
              email: 'student1@example.test',
              admissionNo: 'A-1001',
              currentMembership: { schoolClass: { title: 'صنف 10 الف' } }
            },
            profile: {
              guardians: []
            },
            memberships: [],
            finance: {
              summary: {},
              bills: []
            },
            results: {
              summary: {},
              grades: []
            },
            timeline: [
              { id: 't-1', type: 'note', title: 'رویداد 1', meta: 'Meta 1', note: 'Note 1' },
              { id: 't-2', type: 'note', title: 'رویداد 2', meta: 'Meta 2', note: 'Note 2' },
              { id: 't-3', type: 'note', title: 'رویداد 3', meta: 'Meta 3', note: 'Note 3' },
              { id: 't-4', type: 'note', title: 'رویداد 4', meta: 'Meta 4', note: 'Note 4' },
              { id: 't-5', type: 'note', title: 'رویداد 5', meta: 'Meta 5', note: 'Note 5' }
            ],
            activity: {
              logs: [
                { id: 'a-1', action: 'update_profile', createdAt: '2026-04-01T08:00:00.000Z', route: '/profile' },
                { id: 'a-2', action: 'upload_avatar', createdAt: '2026-04-01T09:00:00.000Z', route: '/profile' },
                { id: 'a-3', action: 'create_schedule', createdAt: '2026-04-01T10:00:00.000Z', route: '/schedule' },
                { id: 'a-4', action: 'create_course', createdAt: '2026-04-01T11:00:00.000Z', route: '/courses' },
                { id: 'a-5', action: 'finance_create_bill', createdAt: '2026-04-01T12:00:00.000Z', route: '/finance' }
              ]
            }
          }
        })
      });
    });
  });

  test('limits timeline and activity to 3 and persists expanded states after reload', async ({ page }) => {
    await page.goto('/student-report', { waitUntil: 'domcontentloaded' });

    const timelineSection = page.locator('h4', { hasText: 'Timeline' }).locator('xpath=..');
    const activitySection = page.locator('h4', { hasText: 'فعالیت‌های اخیر' }).locator('xpath=..');

    await expect(timelineSection.locator('.student-report-timeline-item')).toHaveCount(3);
    await expect(activitySection.locator('.student-report-timeline-item')).toHaveCount(3);

    const timelineToggle = timelineSection.locator('button.student-report-activity-toggle');
    const activityToggle = activitySection.locator('button.student-report-activity-toggle');

    await expect(timelineToggle).toContainText('رویداد بیشتر');
    await expect(activityToggle).toContainText('فعالیت بیشتر');

    await timelineToggle.click();
    await activityToggle.click();

    await expect(timelineSection.locator('.student-report-timeline-item')).toHaveCount(5);
    await expect(activitySection.locator('.student-report-timeline-item')).toHaveCount(5);

    await page.reload({ waitUntil: 'domcontentloaded' });

    const timelineSectionAfterReload = page.locator('h4', { hasText: 'Timeline' }).locator('xpath=..');
    const activitySectionAfterReload = page.locator('h4', { hasText: 'فعالیت‌های اخیر' }).locator('xpath=..');

    await expect(timelineSectionAfterReload.locator('.student-report-timeline-item')).toHaveCount(5);
    await expect(activitySectionAfterReload.locator('.student-report-timeline-item')).toHaveCount(5);

    await expect(timelineSectionAfterReload.locator('button.student-report-activity-toggle')).toContainText('نمایش کمتر');
    await expect(activitySectionAfterReload.locator('button.student-report-activity-toggle')).toContainText('نمایش کمتر');
  });
});
