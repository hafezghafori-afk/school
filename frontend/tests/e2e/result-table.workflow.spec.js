import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

test.describe('result table workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['manage_content', 'view_reports']
    });
  });

  test('result table workflow creates config, generates table, and publishes it', async ({ page }) => {
    let configCalls = 0;
    let generateCalls = 0;
    let publishCalls = 0;

    const templates = [{ id: 'tpl-1', title: 'Result Main', code: 'RESULTS_MAIN' }];
    const sessions = [{ id: 'session-1', title: 'Annual - Class 10 A', code: 'ANNUAL-1406-10A' }];
    let configs = [{ id: 'cfg-1', name: 'Default Result Table Config', code: 'DEFAULT-RESULT-TABLE' }];
    let tables = [];

    const buildTable = (overrides = {}) => ({
      id: 'table-1',
      title: 'Result Main - Annual',
      code: 'RESULTS_MAIN-ANNUAL',
      templateType: 'results',
      rowCount: 2,
      status: 'generated',
      generatedAt: '2026-03-13T09:00:00.000Z',
      publishedAt: '',
      rows: [
        { id: 'row-1', serialNo: 1, displayName: 'Alpha Student', resultStatus: 'passed', percentage: 93, rank: 1 },
        { id: 'row-2', serialNo: 2, displayName: 'Beta Student', resultStatus: 'passed', percentage: 88, rank: 2 }
      ],
      ...overrides
    });

    await page.route('**/api/result-tables/reference-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, templates, configs, sessions })
      });
    });

    await page.route('**/api/result-tables', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: tables })
      });
    });

    await page.route('**/api/result-tables/*', async (route) => {
      const requestUrl = new URL(route.request().url());
      const lastSegment = requestUrl.pathname.split('/').pop();
      if (route.request().method() !== 'GET' || lastSegment === 'reference-data' || lastSegment === 'configs' || lastSegment === 'generate') {
        await route.fallback();
        return;
      }

      const item = tables.find((entry) => entry.id === lastSegment) || null;
      await route.fulfill({
        status: item ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(item ? { success: true, item } : { success: false, message: 'not_found' })
      });
    });

    await page.route('**/api/result-tables/configs', async (route) => {
      configCalls += 1;
      const payload = route.request().postDataJSON();
      const item = {
        id: 'cfg-2',
        name: payload.name,
        code: payload.code,
        orientation: payload.orientation,
        headerText: payload.headerText,
        footerText: payload.footerText
      };
      configs = [...configs, item];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item })
      });
    });

    await page.route('**/api/result-tables/generate', async (route) => {
      generateCalls += 1;
      tables = [buildTable()];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: tables[0] })
      });
    });

    await page.route('**/api/result-tables/*/publish', async (route) => {
      publishCalls += 1;
      const tableId = route.request().url().split('/').slice(-2)[0];
      const item = buildTable({ id: tableId, status: 'published', publishedAt: '2026-03-13T10:00:00.000Z' });
      tables = [item];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item })
      });
    });

    await page.goto('/admin-result-tables', { waitUntil: 'domcontentloaded' });

    const configCard = page.locator('article.admin-workspace-card').filter({ has: page.locator('#config-name') });
    await page.locator('#config-name').fill('Official Landscape');
    await page.locator('#config-code').fill('OFFICIAL-LANDSCAPE');
    await page.locator('#config-header').fill('Alpha Academy');
    await page.locator('#config-footer').fill('Confidential');
    await configCard.locator('button.admin-workspace-button-secondary').click();

    await expect.poll(() => configCalls).toBe(1);
    await expect(page.locator('#result-config option[value="cfg-2"]')).toHaveCount(1);
    await page.locator('#result-config').selectOption('cfg-2');

    const generateCard = page.locator('article.admin-workspace-card').filter({ has: page.locator('#result-template') });
    await generateCard.getByRole('button', { name: 'generate' }).click();

    await expect.poll(() => generateCalls).toBe(1);
    await expect(page.locator('article.admin-workspace-card').nth(2)).toContainText('generated');
    await expect(page.locator('article.admin-workspace-card').nth(3)).toContainText('Alpha Student');

    await page.locator('article.admin-workspace-card').nth(2).getByRole('button', { name: 'publish' }).click();

    await expect.poll(() => publishCalls).toBe(1);
    await expect(page.locator('article.admin-workspace-card').nth(2)).toContainText('published');
    await expect(page.locator('article.admin-workspace-card').nth(4)).toContainText('Result Main - Annual');
  });
});