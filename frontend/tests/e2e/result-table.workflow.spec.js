import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

test.describe('result table workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, { permissions: ['manage_content', 'view_reports'] });
  });

  test('کنترل آمادگی، تولید نسخه و نشر نتیجه عمومی کار می‌کند', async ({ page }) => {
    let configCalls = 0;
    let readinessCalls = 0;
    let generateCalls = 0;
    let publishCalls = 0;

    const templates = [{ id: 'tpl-official', title: 'جدول رسمی نتایج عمومی صنف', code: 'RESULTS_CLASS_OFFICIAL' }];
    let configs = [{ id: 'cfg-1', name: 'تنظیم رسمی جدول نتایج', code: 'DEFAULT-RESULT-TABLE', isDefault: true }];
    let tables = [];

    const buildTable = (overrides = {}) => ({
      id: 'table-1',
      title: 'جدول رسمی نتایج عمومی صنف - صنف دهم - ۱۴۰۵',
      code: 'RESULTS-CLASS-OFFICIAL-1405',
      scopeType: 'class_aggregate',
      templateType: 'results',
      version: 1,
      rowCount: 2,
      status: 'generated',
      generatedAt: '2026-07-30T09:00:00.000Z',
      publishedAt: '',
      schoolClass: { id: 'class-1', title: 'صنف دهم' },
      academicYear: { id: 'year-1', title: '۱۴۰۵' },
      metadata: { subjects: [{ id: 'subject-1', name: 'دری' }] },
      rows: [
        { id: 'row-1', serialNo: 1, displayName: 'احمد حامد', resultStatus: 'passed', percentage: 93, rank: 1, membershipStatusLabel: 'فعال', cells: { identity: { fatherName: 'محمد' }, subjects: [{ subjectId: 'subject-1', fourHalf: 36, annual: 57, total: 93 }] } },
        { id: 'row-2', serialNo: 2, displayName: 'فاطمه رحیمی', resultStatus: 'passed', percentage: 88, rank: 2, membershipStatusLabel: 'فعال', cells: { identity: { fatherName: 'عبدالله' }, subjects: [{ subjectId: 'subject-1', fourHalf: 34, annual: 54, total: 88 }] } }
      ],
      ...overrides
    });

    await page.route('**/api/result-tables/reference-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          templates,
          configs,
          sessions: [],
          academicYears: [{ id: 'year-1', title: '۱۴۰۵', isActive: true }],
          classes: [{ id: 'class-1', title: 'صنف دهم', academicYearId: 'year-1' }]
        })
      });
    });

    await page.route('**/api/result-tables', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, items: tables }) });
    });

    await page.route('**/api/result-tables/*', async (route) => {
      const lastSegment = new URL(route.request().url()).pathname.split('/').pop();
      if (route.request().method() !== 'GET' || ['reference-data', 'readiness'].includes(lastSegment)) return route.fallback();
      const item = tables.find((entry) => entry.id === lastSegment) || null;
      await route.fulfill({ status: item ? 200 : 404, contentType: 'application/json', body: JSON.stringify(item ? { success: true, item } : { success: false, message: 'not_found' }) });
    });

    await page.route('**/api/result-tables/readiness?*', async (route) => {
      readinessCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          ready: true,
          progress: { approvedSessionCount: 2, requiredSessionCount: 2, percentage: 100 },
          issues: [],
          subjects: [{
            id: 'subject-1', name: 'دری', code: 'DR', ready: true,
            teacherAssignments: [{ id: 'ta-1', teacherName: 'استاد صدیقی' }],
            fourHalfSessions: [{ id: 'four-1', status: 'approved' }], fourHalfCandidates: [{ id: 'four-1', status: 'approved', statusLabel: 'تأییدشده' }],
            annualSessions: [{ id: 'annual-1', status: 'approved' }], annualCandidates: [{ id: 'annual-1', status: 'approved', statusLabel: 'تأییدشده' }]
          }]
        })
      });
    });

    await page.route('**/api/result-tables/configs', async (route) => {
      configCalls += 1;
      const payload = route.request().postDataJSON();
      const item = { id: 'cfg-2', name: payload.name, code: payload.code, studentsPerPage: payload.studentsPerPage };
      configs = [...configs, item];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, item }) });
    });

    await page.route('**/api/result-tables/generate', async (route) => {
      generateCalls += 1;
      const payload = route.request().postDataJSON();
      expect(payload.scopeType).toBe('class_aggregate');
      expect(payload.classId).toBe('class-1');
      tables = [buildTable()];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, item: tables[0] }) });
    });

    await page.route('**/api/result-tables/*/publish', async (route) => {
      publishCalls += 1;
      const item = buildTable({ status: 'published', publishedAt: '2026-07-30T10:00:00.000Z' });
      tables = [item];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, item }) });
    });

    await page.goto('/admin-result-tables', { waitUntil: 'domcontentloaded' });
    await page.locator('#result-class').selectOption('class-1');
    await page.getByRole('button', { name: 'کنترل آمادگی شقه‌ها' }).click();
    await expect.poll(() => readinessCalls).toBe(1);
    await expect(page.getByText('۲ از ۲ شقه تأیید')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'استاد صدیقی' })).toBeVisible();

    await page.getByRole('button', { name: 'تولید نسخهٔ نتیجه' }).click();
    await expect.poll(() => generateCalls).toBe(1);
    await expect(page.getByRole('heading', { name: '۳. جزئیات نسخه' }).locator('..')).toContainText('تولیدشده');
    await expect(page.getByText('احمد حامد')).toBeVisible();

    await page.getByText('۲. تنظیم ظاهر چاپ رسمی').click();
    await page.locator('#config-name').fill('جدول رسمی ۱۴۰۵');
    await page.locator('#config-code').fill('OFFICIAL-1405');
    await page.getByRole('button', { name: 'ذخیرهٔ تنظیم' }).click();
    await expect.poll(() => configCalls).toBe(1);
    await expect(page.locator('#result-config option[value="cfg-2"]')).toHaveCount(1);

    await page.getByRole('button', { name: 'تأیید و نشر' }).click();
    await expect.poll(() => publishCalls).toBe(1);
    await expect(page.getByText('نشرشده').first()).toBeVisible();
    await expect(page.getByText('این نسخه قفل است.')).toBeVisible();
  });
});
