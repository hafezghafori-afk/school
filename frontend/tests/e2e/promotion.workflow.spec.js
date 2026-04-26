import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

test.describe('promotion workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_users']
    });
  });

  test('promotion workflow previews, applies, and rolls back a transaction', async ({ page }) => {
    let previewCalls = 0;
    let applyCalls = 0;
    let rollbackCalls = 0;

    const referenceData = {
      success: true,
      academicYears: [
        { id: 'year-1', title: '1406', code: '1406' },
        { id: 'year-2', title: '1407', code: '1407' }
      ],
      classes: [{ id: 'class-1', title: 'Class 10 A', code: '10A' }],
      sessions: [{ id: 'session-1', title: 'Annual - Class 10 A', code: 'ANNUAL-1406-10A' }],
      rules: [{ id: 'rule-1', name: 'Default Promotion Rule', code: 'DEFAULT-PROMOTION' }],
      activeYear: { id: 'year-1', title: '1406' }
    };

    const previewPayload = {
      success: true,
      session: { id: 'session-1', title: 'Annual - Class 10 A' },
      rule: { id: 'rule-1', name: 'Default Promotion Rule' },
      targetAcademicYear: { id: 'year-2', title: '1407' },
      summary: { total: 1, promoted: 1, repeated: 0, conditional: 0, graduated: 0, blocked: 0, applied: 0, rolledBack: 0 },
      items: [
        {
          examResultId: 'result-1',
          sourceMembership: {
            student: { fullName: 'Alpha Student' },
            schoolClass: { title: 'Class 10 A' },
            academicYear: { title: '1406' }
          },
          sourceResultStatus: 'passed',
          computedOutcome: 'promoted',
          targetClass: { title: 'Class 11 A' },
          targetAcademicYear: { title: '1407' },
          canApply: true,
          issueCode: ''
        }
      ]
    };

    const buildTransaction = (overrides = {}) => ({
      id: 'tx-1',
      promotionOutcome: 'promoted',
      transactionStatus: 'applied',
      appliedAt: '2026-03-13T10:00:00.000Z',
      rolledBackAt: '',
      rollbackReason: '',
      sourceMembershipStatusBefore: 'active',
      sourceMembership: {
        student: { fullName: 'Alpha Student' },
        schoolClass: { title: 'Class 10 A' },
        academicYear: { title: '1406' }
      },
      targetMembership: {
        schoolClass: { title: 'Class 11 A' },
        academicYear: { title: '1407' },
        student: { fullName: 'Alpha Student' }
      },
      ...overrides
    });

    let transactions = [];

    await page.route('**/api/promotions/reference-data', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(referenceData) });
    });

    await page.route('**/api/promotions/transactions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: transactions })
      });
    });

    await page.route('**/api/promotions/transactions/*', async (route) => {
      const transactionId = route.request().url().split('/').pop();
      const item = transactions.find((entry) => entry.id === transactionId) || null;
      await route.fulfill({
        status: item ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(item ? { success: true, item } : { success: false, message: 'not_found' })
      });
    });

    await page.route('**/api/promotions/preview', async (route) => {
      previewCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(previewPayload)
      });
    });

    await page.route('**/api/promotions/apply', async (route) => {
      applyCalls += 1;
      const requestBody = route.request().postDataJSON();
      transactions = [
        buildTransaction({
          id: 'tx-1',
          appliedAt: requestBody.effectiveAt ? `${requestBody.effectiveAt}T08:00:00.000Z` : '2026-03-13T10:00:00.000Z'
        })
      ];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          session: previewPayload.session,
          rule: previewPayload.rule,
          targetAcademicYear: previewPayload.targetAcademicYear,
          summary: { total: 1, promoted: 1, repeated: 0, conditional: 0, graduated: 0, blocked: 0, applied: 1, rolledBack: 0 },
          items: transactions
        })
      });
    });

    await page.route('**/api/promotions/rollback/*', async (route) => {
      rollbackCalls += 1;
      const reason = route.request().postDataJSON().reason;
      const transactionId = route.request().url().split('/').pop();
      const nextItem = buildTransaction({
        id: transactionId,
        transactionStatus: 'rolled_back',
        rolledBackAt: '2026-03-13T12:00:00.000Z',
        rollbackReason: reason
      });
      transactions = [nextItem];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: nextItem })
      });
    });

    await page.goto('/admin-promotions', { waitUntil: 'domcontentloaded' });

    const formCard = page.locator('article.admin-workspace-card').filter({ has: page.locator('#promotion-session') });
    await expect(page.locator('#promotion-session')).toHaveValue('session-1');
    await page.locator('#promotion-effective-at').fill('2026-03-14');

    await formCard.locator('button').nth(1).click();
    await expect.poll(() => previewCalls).toBe(1);
    await expect(page.locator('article.admin-workspace-card').nth(2)).toContainText('Alpha Student');

    await formCard.locator('button').nth(2).click();
    await expect.poll(() => applyCalls).toBe(1);
    await expect(page.locator('article.admin-workspace-card').nth(4)).toContainText('applied');

    await page.locator('article.admin-workspace-card').nth(4).locator('button.admin-workspace-button-ghost').first().click();
    await expect(page.locator('article.admin-workspace-card').nth(3)).toContainText('active');

    page.once('dialog', async (dialog) => {
      await dialog.accept('operator review');
    });
    await page.locator('article.admin-workspace-card').nth(3).getByRole('button', { name: 'rollback' }).click();

    await expect.poll(() => rollbackCalls).toBe(1);
    await expect(page.locator('article.admin-workspace-card').nth(3)).toContainText('rolled_back');
    await expect(page.locator('article.admin-workspace-card').nth(3)).toContainText('operator review');
  });
});