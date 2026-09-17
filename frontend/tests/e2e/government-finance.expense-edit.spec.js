import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

// Edit / correction flow for recorded expenses in «دفتر ثبت مصارف» and
// «صف تایید مصارف». The finance API is a small stateful mock.

const TEXT_ONLY_FIELDS = new Set(['vendorName', 'referenceNo', 'note']);
const EDITABLE_FIELDS = ['category', 'subCategory', 'amount', 'expenseDate', 'paymentMethod', 'treasuryAccountId', 'procurementCommitmentId', 'vendorName', 'referenceNo', 'note'];

const CATEGORIES = [
  {
    _id: 'cat-admin',
    key: 'admin_misc',
    label: 'اداری و متفرقه',
    isActive: true,
    isSystem: true,
    subCategories: [
      { key: 'stationery', label: 'قرطاسیه', isActive: true },
      { key: 'printing', label: 'چاپ و کاپی', isActive: true }
    ]
  },
  {
    _id: 'cat-payroll',
    key: 'payroll',
    label: 'معاشات',
    isActive: true,
    isSystem: true,
    subCategories: [{ key: 'teacher_salary', label: 'معاش استادان', isActive: true }]
  }
];

const FINANCIAL_YEAR = {
  _id: 'fy-1',
  id: 'fy-1',
  title: 'سال مالی ۱۴۰۵',
  code: 'FY1405',
  academicYearId: 'year-1',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-12-31T00:00:00.000Z',
  status: 'active',
  isActive: true,
  isClosed: false
};

function json(body, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

function baseExpense(overrides = {}) {
  return {
    category: 'admin_misc',
    subCategory: 'stationery',
    paymentMethod: 'cash',
    treasuryAccountId: 'acc-1',
    procurementCommitmentId: null,
    vendorName: '',
    referenceNo: '',
    note: '',
    approvalTrail: [],
    revisions: [],
    correction: null,
    financialYear: { _id: 'fy-1', isClosed: false },
    ...overrides
  };
}

function buildState() {
  return {
    expenses: [
      baseExpense({
        _id: 'exp-draft',
        amount: 400,
        expenseDate: '2026-05-10T00:00:00.000Z',
        createdAt: '2026-05-10T09:00:00.000Z',
        status: 'draft',
        approvalStage: 'draft',
        vendorName: 'کتاب‌فروشی کابل',
        note: 'کاغذِ امتحان'
      }),
      baseExpense({
        _id: 'exp-approved',
        subCategory: 'printing',
        amount: 600,
        expenseDate: '2026-06-15T00:00:00.000Z',
        // Entered into the system months after the expense was made.
        createdAt: '2026-09-10T08:00:00.000Z',
        status: 'approved',
        approvalStage: 'completed',
        vendorName: 'چاپخانهٔ نور',
        note: 'چاپِ کارنامه‌ها',
        approvalTrail: [{ action: 'submit' }, { action: 'approve', by: { _id: 'admin-2' } }]
      }),
      baseExpense({
        _id: 'exp-salary',
        category: 'payroll',
        subCategory: 'teacher_salary',
        amount: 9000,
        expenseDate: '2026-06-01T00:00:00.000Z',
        status: 'approved',
        approvalStage: 'completed',
        referenceNo: 'staff_salary:pay-1',
        isSalaryLinked: true,
        note: 'معاشِ ۱۴۰۵-۰۳ — احمد'
      })
    ]
  };
}

function buildAnalytics(state) {
  const statusCounts = { draft: 0, pendingReview: 0, approved: 0, rejected: 0, void: 0 };
  let approvedAmount = 0;
  state.expenses.forEach((item) => {
    if (item.status === 'approved') {
      statusCounts.approved += 1;
      approvedAmount += Number(item.amount || 0);
    } else if (item.status === 'pending_review') statusCounts.pendingReview += 1;
    else if (item.status === 'draft') statusCounts.draft += 1;
  });
  return {
    summary: {
      totalCount: state.expenses.length,
      approvedAmount,
      queueCount: statusCounts.draft + statusCounts.pendingReview,
      statusCounts,
      needsCategoryReviewCount: 0
    },
    categories: [],
    vendors: [],
    monthly: [],
    queue: [],
    categoryReviewQueue: [],
    closeReadiness: null,
    registry: CATEGORIES
  };
}

function diffBody(item, body) {
  return EDITABLE_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
    .map((field) => ({
      field,
      from: item[field] ?? null,
      to: field === 'amount' ? Number(body[field]) : body[field]
    }))
    .filter((change) => String(change.from ?? '') !== String(change.to ?? ''));
}

async function mockFinanceApi(page, state, calls) {
  // Anything the page loads that this test does not care about.
  await page.route('**/api/**', async (route) => {
    await route.fulfill(json({ success: false, message: 'not mocked' }, 404));
  });

  await setupAdminWorkspace(page, { permissions: ['manage_finance', 'view_reports'] });

  await page.route('**/api/reports/reference-data', async (route) => {
    await route.fulfill(json({
      success: true,
      catalog: [],
      academicYears: [{ id: 'year-1', title: '1405', code: '1405', isActive: true }],
      financialYears: [FINANCIAL_YEAR],
      classes: []
    }));
  });
  await page.route('**/api/finance/admin/financial-years', async (route) => {
    await route.fulfill(json({ success: true, items: [FINANCIAL_YEAR] }));
  });
  await page.route('**/api/finance/admin/expense-categories**', async (route) => {
    await route.fulfill(json({ success: true, items: CATEGORIES }));
  });
  await page.route('**/api/finance/admin/treasury/analytics**', async (route) => {
    await route.fulfill(json({
      success: true,
      analytics: {
        summary: {},
        accounts: [{ _id: 'acc-1', title: 'صندوقِ اصلی', code: 'CASH-01', accountType: 'cashbox', isActive: true, metrics: {} }],
        recentTransactions: [],
        alerts: []
      }
    }));
  });

  await page.route('**/api/finance/admin/expenses**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.replace(/^\/api\/finance\/admin\/expenses\/?/, '').split('/').filter(Boolean);
    const method = request.method();

    if (!parts.length) {
      await route.fulfill(json({ success: true, items: state.expenses }));
      return;
    }
    if (parts[0] === 'analytics') {
      await route.fulfill(json({ success: true, analytics: buildAnalytics(state) }));
      return;
    }

    const [id, action, sub] = parts;
    const item = state.expenses.find((entry) => entry._id === id);
    if (!item) {
      await route.fulfill(json({ success: false, message: 'رکورد مصرف پیدا نشد.' }, 404));
      return;
    }
    const body = request.postDataJSON() || {};
    const now = '2026-09-17T08:00:00.000Z';
    const actor = { _id: 'admin-1', name: 'Admin Alpha' };

    if (method === 'PATCH' && !action) {
      calls.patch.push(body);
      const changes = diffBody(item, body);
      changes.forEach(({ field, to }) => { item[field] = to; });
      if (changes.length) item.revisions.push({ kind: 'edit', at: now, by: actor, reason: body.reason || '', changes });
      if (body.submitAfterSave) {
        item.status = 'pending_review';
        item.approvalStage = 'finance_manager_review';
        item.approvalTrail.push({ action: 'submit' });
      }
      await route.fulfill(json({ success: true, item, changes, message: 'مصرف ویرایش شد.' }));
      return;
    }

    if (action === 'correction' && !sub) {
      calls.correction.push(body);
      const changes = diffBody(item, body);
      if (!changes.some((change) => !TEXT_ONLY_FIELDS.has(change.field))) {
        changes.forEach(({ field, to }) => { item[field] = to; });
        item.revisions.push({ kind: 'text_edit', at: now, by: actor, reason: body.reason || '', changes });
        await route.fulfill(json({ success: true, mode: 'text_edit', item, message: 'تغییراتِ متنیِ مصرف ذخیره شد.' }));
        return;
      }
      item.correction = { reason: body.reason, requestedAt: now, requestedBy: actor, changes };
      item.status = 'pending_review';
      item.approvalStage = 'finance_manager_review';
      item.approvalTrail.push({ action: 'correction_request', by: actor });
      await route.fulfill(json({
        success: true,
        mode: 'correction',
        item,
        message: 'درخواستِ اصلاح ثبت شد. تا تاییدِ نهاییِ ریاست عمومی، این مصرف در موجودیِ خزانه و گزارش‌ها حساب نمی‌شود.'
      }));
      return;
    }

    if (action === 'correction' && sub === 'cancel') {
      calls.cancel += 1;
      item.revisions.push({ kind: 'correction_cancelled', at: now, by: actor, reason: '', changes: item.correction?.changes || [] });
      item.correction = null;
      item.status = 'approved';
      item.approvalStage = 'completed';
      await route.fulfill(json({ success: true, item, message: 'درخواستِ اصلاح لغو شد؛ مصرف با مقادیرِ قبلیِ تاییدشده دوباره حساب می‌شود.' }));
      return;
    }

    await route.fulfill(json({ success: false, message: 'unexpected expense call' }, 500));
  });
}

test.describe('government finance expense edit', () => {
  test('edits a draft, requests and cancels a correction, and locks salary expenses', async ({ page }, testInfo) => {
    test.slow();
    const state = buildState();
    const calls = { patch: [], correction: [], cancel: 0 };
    await mockFinanceApi(page, state, calls);
    // Tall enough to show the whole edit dialog in the screenshot.
    await page.setViewportSize({ width: 1280, height: 1300 });

    await page.goto('/admin-government-finance?tab=operations', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'باز کردن همه' }).click();

    const ledger = page.locator('.gov-panel', { hasText: 'دفتر ثبت مصارف' });
    const ledgerRows = ledger.locator('[data-expense-ledger-row]');
    const draftRow = ledger.locator('[data-expense-ledger-row="exp-draft"]');
    const approvedRow = ledger.locator('[data-expense-ledger-row="exp-approved"]');
    const salaryRow = ledger.locator('[data-expense-ledger-row="exp-salary"]');

    // Nothing is listed until a filter is chosen.
    await expect(ledger.locator('[data-expense-ledger-idle="true"]')).toBeVisible();
    await expect(ledgerRows).toHaveCount(0);
    await ledger.locator('[data-expense-ledger-filters="true"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('expense-ledger-idle.png') });

    // Search alone narrows the list; clearing it hides the list again.
    await ledger.locator('input[name="ledgerSearch"]').fill('چاپخانه');
    await expect(ledgerRows).toHaveCount(1);
    await expect(approvedRow).toBeVisible();
    await ledger.locator('input[name="ledgerSearch"]').fill('');
    await expect(ledgerRows).toHaveCount(0);

    // Shamsi year + month: جوزا ۱۴۰۵ holds the printing and the salary expense.
    await ledger.locator('select[name="ledgerShamsiYear"]').selectOption('1405');
    await expect(ledgerRows).toHaveCount(3);
    await ledger.locator('select[name="ledgerShamsiMonth"]').selectOption('3');
    await expect(ledgerRows).toHaveCount(2);
    await expect(draftRow).toHaveCount(0);
    await expect(ledger.locator('[data-expense-ledger-summary="true"]')).toContainText('۲ مورد');
    await ledger.locator('[data-expense-ledger-clear="true"]').click();
    await expect(ledgerRows).toHaveCount(0);

    // Status «همه» lists everything.
    await ledger.locator('select[name="ledgerStatus"]').selectOption('all');
    await expect(ledgerRows).toHaveCount(3);
    await expect(draftRow).toContainText('۴۰۰ AFN');

    // «تاریخ ثبت‌شده» sits right after «شرح» and shows the day the expense was
    // made; a different system-entry day is shown underneath.
    await expect(ledger.locator('thead th').nth(2)).toHaveText('تاریخ ثبت‌شده');
    const queueTable = page.locator('.gov-panel', { hasText: 'صف تایید مصارف' }).locator('table');
    await expect(queueTable.locator('thead th').nth(2)).toHaveText('تاریخ ثبت‌شده');
    await expect(draftRow.locator('td').nth(2)).toContainText('ثور');
    await expect(draftRow.locator('td').nth(2)).not.toContainText('ثبت در سیستم');
    await expect(approvedRow.locator('td').nth(2)).toContainText('جوزا');
    await expect(approvedRow.locator('td').nth(2)).toContainText('ثبت در سیستم');
    await expect(approvedRow.locator('td').nth(2)).toContainText('سنبله');

    // Salary expenses are locked and point to the salary section.
    await expect(salaryRow.locator('[data-expense-edit]')).toHaveCount(0);
    await expect(salaryRow).toContainText('اصلاح از بخشِ معاش');

    // Draft: direct edit sends only the changed field.
    await draftRow.locator('[data-expense-edit="exp-draft"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('ویرایشِ مصرف');
    await dialog.locator('input[name="amount"]').fill('450');
    await expect(dialog.locator('.gov-change-summary')).toContainText('مبلغ');
    await dialog.locator('[data-expense-editor-save="edit"]').click();
    await expect(dialog).toHaveCount(0);
    expect(calls.patch).toHaveLength(1);
    expect(calls.patch[0]).toEqual({ amount: '450', submitAfterSave: false });
    await expect(draftRow).toContainText('۴۵۰ AFN');

    // Approved: a money change becomes a correction request that needs a reason.
    await approvedRow.locator('[data-expense-edit="exp-approved"]').click();
    await expect(dialog).toContainText('درخواستِ اصلاحِ مصرفِ تاییدشده');
    await dialog.locator('input[name="amount"]').fill('650');
    const sendCorrection = dialog.locator('[data-expense-editor-save="correction"]');
    await expect(dialog.locator('.gov-change-summary')).toContainText('نیازمندِ تاییدِ سه‌مرحله‌ای');
    await expect(sendCorrection).toBeDisabled();
    await dialog.locator('textarea[name="reason"]').fill('مبلغ در رسید ۶۵۰ است');
    await expect(sendCorrection).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('expense-correction-dialog.png') });
    await sendCorrection.click();
    await expect(dialog).toHaveCount(0);
    expect(calls.correction).toHaveLength(1);
    expect(calls.correction[0]).toEqual({ amount: '650', reason: 'مبلغ در رسید ۶۵۰ است' });

    await expect(approvedRow).toContainText('اصلاح در انتظارِ تایید');
    await expect(approvedRow.locator('[data-expense-edit]')).toHaveCount(0);
    const queue = page.locator('.gov-panel', { hasText: 'صف تایید مصارف' });
    const queueCorrectionRow = queue.locator('tr[data-expense-correction-row="true"]');
    await expect(queueCorrectionRow).toContainText('درخواستِ اصلاحِ مصرفِ تاییدشده');
    await expect(queueCorrectionRow).toContainText('مبلغ در رسید ۶۵۰ است');
    await expect(queueCorrectionRow.locator('[data-expense-void]')).toHaveCount(0);
    await queueCorrectionRow.screenshot({ path: testInfo.outputPath('expense-correction-queue-row.png') });

    // Cancelling restores the approved expense and leaves a history entry.
    page.once('dialog', (confirmDialog) => confirmDialog.accept());
    await approvedRow.locator('[data-expense-correction-cancel="exp-approved"]').click();
    await expect.poll(() => calls.cancel).toBe(1);
    await expect(approvedRow).not.toContainText('اصلاح در انتظارِ تایید');
    await approvedRow.getByRole('button', { name: /تاریخچه/ }).click();
    await expect(ledger.locator('.gov-expense-history')).toContainText('درخواستِ اصلاحِ لغوشده');
    await ledger.screenshot({ path: testInfo.outputPath('expense-ledger-history.png') });

    // Approved text-only change is saved directly without a reason.
    await approvedRow.locator('[data-expense-edit="exp-approved"]').click();
    await dialog.locator('input[name="note"]').fill('چاپِ کارنامه‌های صنفِ دهم');
    await expect(dialog.locator('.gov-change-summary')).toContainText('بدونِ نیاز به تایید');
    await dialog.locator('[data-expense-editor-save="correction"]').click();
    await expect(dialog).toHaveCount(0);
    expect(calls.correction[1]).toEqual({ note: 'چاپِ کارنامه‌های صنفِ دهم' });
  });

  test('expense edit dialog fits a phone screen', async ({ page }, testInfo) => {
    test.slow();
    const state = buildState();
    await mockFinanceApi(page, state, { patch: [], correction: [], cancel: 0 });
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/admin-government-finance?tab=operations', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'باز کردن همه' }).click();
    const ledger = page.locator('.gov-panel', { hasText: 'دفتر ثبت مصارف' });
    await ledger.locator('select[name="ledgerStatus"]').selectOption('approved');
    await ledger.locator('[data-expense-edit="exp-approved"]').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box.width).toBeLessThanOrEqual(375);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
    await page.screenshot({ path: testInfo.outputPath('expense-correction-dialog-mobile.png') });

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
