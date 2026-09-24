import { test, expect } from '@playwright/test';

/**
 * The anomaly inspector's buttons are disabled while the finance centre is
 * busy. They used to be disabled for good: an action switched the busy flag on
 * and left switching it off to refreshPaymentWorkspace, which only did so while
 * it was still the newest refresh - so a refresh that was superseded or that
 * stopped answering left every button dead with nothing on screen to say why.
 *
 * These two tests drive the real page: one where the refresh after an action
 * answers normally, and one where it never answers at all.
 */

const adminSession = {
  token: 'mock.header.signature',
  role: 'admin',
  userId: 'admin-1',
  userName: 'Finance Manager',
  adminLevel: 'finance_manager',
  permissions: ['manage_finance']
};

const anomalyItem = {
  id: 'anomaly-1',
  anomalyType: 'overdue_order',
  severity: 'critical',
  title: 'Overdue tuition order',
  description: 'Tuition order is past its due date',
  studentName: 'Student Alpha',
  classId: 'class-1',
  classTitle: 'Class One Core',
  referenceNumber: 'ORD-1',
  amountLabel: '1,000',
  actionRequired: true,
  workflowStatus: 'open',
  workflowHistory: []
};

const anomaliesBody = {
  success: true,
  items: [anomalyItem],
  summary: {
    total: 1,
    critical: 1,
    warning: 0,
    info: 0,
    byWorkflow: { open: 1, assigned: 0, snoozed: 0, resolved: 0 }
  }
};

// Everything except the anomalies list and the note endpoint answers with an
// empty, successful body: this spec is about the busy flag, not the data.
const installFinanceMocks = async (page, control) => {
  await page.addInitScript((session) => {
    localStorage.setItem('token', session.token);
    localStorage.setItem('role', session.role);
    localStorage.setItem('userId', session.userId);
    localStorage.setItem('userName', session.userName);
    localStorage.setItem('adminLevel', session.adminLevel);
    localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
  }, adminSession);

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/api/finance/admin/reports/anomalies')) {
      control.anomalyListCalls += 1;
      // Leaving the route unfulfilled is the failure being reproduced: the
      // refresh that follows the saved note can never settle, so whatever is
      // holding the busy flag has to give it back by itself.
      if (control.hangAnomalyList) return;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(anomaliesBody)
      });
      return;
    }

    if (url.includes('/api/finance/admin/anomalies/') && url.endsWith('/note')) {
      control.noteCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'یادداشت ثبت شد', item: anomalyItem })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [], summary: null, months: [] })
    });
  });
};

const openAnomalyInspector = async (page) => {
  await page.goto('/admin-finance', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('finance-section-anomalies').click();
  const inspector = page.getByTestId('finance-anomaly-inspector');
  await expect(inspector).toBeVisible();
  return inspector;
};

test.describe('finance workflow anomaly busy flag', () => {
  test('hands the inspector back after an action whose refresh answers', async ({ page }) => {
    const control = { hangAnomalyList: false, anomalyListCalls: 0, noteCalls: 0 };
    await installFinanceMocks(page, control);
    await openAnomalyInspector(page);

    const noteButton = page.getByTestId('anomaly-note-button');
    await page.getByTestId('anomaly-note-input').fill('Guardian called, will pay Sunday');
    await noteButton.click();

    await expect.poll(() => control.noteCalls).toBe(1);
    await expect(noteButton).toBeEnabled();
    await expect(page.getByTestId('anomaly-assign-button')).toBeEnabled();
    await expect(page.getByTestId('anomaly-resolve-button')).toBeEnabled();
  });

  test('hands the inspector back when the refresh after an action never answers', async ({ page }) => {
    // The ticket ceiling is 45s, and apiFetch gives up on the hanging request
    // well after that, so the buttons have to come back on the ceiling alone.
    test.setTimeout(150000);
    const control = { hangAnomalyList: false, anomalyListCalls: 0, noteCalls: 0 };
    await installFinanceMocks(page, control);
    await openAnomalyInspector(page);

    const noteButton = page.getByTestId('anomaly-note-button');
    await page.getByTestId('anomaly-note-input').fill('Guardian called, will pay Sunday');
    control.hangAnomalyList = true;
    await noteButton.click();

    await expect.poll(() => control.noteCalls).toBe(1);
    await expect(noteButton).toBeDisabled();

    await expect(noteButton).toBeEnabled({ timeout: 75000 });
    await expect(page.getByTestId('anomaly-assign-button')).toBeEnabled();
    await expect(page.getByTestId('anomaly-resolve-button')).toBeEnabled();
    await expect(page.getByTestId('finance-toast')).toContainText('پاسخ سرور برای کار قبلی هنوز نرسیده است');
  });
});
