import { test, expect } from '@playwright/test';

// Pins the two things the finance centre got wrong: bill forms never said
// which month a bill was for, and figures did not follow the Afghan month
// picked at the top of the page. "Today" is 2 Mizan 1405 in Kabul.
test.use({ timezoneId: 'Asia/Kabul' });

const adminSession = {
  token: 'mock.header.signature',
  role: 'admin',
  userId: 'admin-1',
  userName: 'Finance Manager',
  adminLevel: 'finance_manager',
  permissions: ['manage_finance']
};

const memberships = [
  {
    _id: 'mem-1',
    studentId: 'student-1',
    studentCoreId: 'student-core-1',
    studentName: 'Student Alpha',
    classId: 'class-1',
    classTitle: 'Class One Core',
    academicYearId: 'year-1',
    academicYearTitle: '1405',
    status: 'active',
    isCurrent: true
  }
];

async function openFinance(page, requests) {
  await page.clock.setFixedTime(new Date('2026-09-24T09:00:00+04:30'));
  await page.addInitScript((session) => {
    localStorage.setItem('token', session.token);
    localStorage.setItem('role', session.role);
    localStorage.setItem('userId', session.userId);
    localStorage.setItem('userName', session.userName);
    localStorage.setItem('adminLevel', session.adminLevel);
    localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
  }, adminSession);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname, searchParams } = url;
    let body = { success: true, items: [] };

    if (pathname === '/api/settings/public') {
      body = { success: true, settings: {} };
    } else if (pathname === '/api/finance/admin/reference-data') {
      body = {
        success: true,
        students: [],
        classes: [{ classId: 'class-1', title: 'Class One Core', uiLabel: 'Class One Core' }],
        academicYears: [{ _id: 'year-1', title: '1405', isCurrent: true, isActive: true }],
        currentAcademicYearId: 'year-1'
      };
    } else if (pathname === '/api/finance/admin/student-memberships') {
      body = { success: true, items: memberships };
    } else if (pathname === '/api/finance/admin/summary') {
      body = { success: true, summary: {}, topDebtors: [] };
    } else if (pathname === '/api/finance/admin/dashboard/overview') {
      requests.overview.push(Object.fromEntries(searchParams));
      body = {
        success: true,
        overview: {
          kpis: { approvedRevenue: { amount: 4200, count: 3 } },
          distributions: {},
          recent: { bills: [], payments: [], expenses: [] },
          series: { daily: [] },
          byClass: [],
          topDebtors: [],
          departedDebtors: []
        }
      };
    } else if (pathname === '/api/finance/admin/dashboard/monthly-trend') {
      requests.trend.push(Object.fromEntries(searchParams));
      body = {
        success: true,
        months: [
          { monthKey: '1405-05', monthLabel: 'اسد ۱۴۰۵', income: 100, refunds: 0, expense: 0, netCash: 100, billsIssuedAmount: 0, billsIssuedCount: 0, arrearsAmount: 0, arrearsCount: 0 },
          { monthKey: '1405-06', monthLabel: 'سنبله ۱۴۰۵', income: 200, refunds: 0, expense: 0, netCash: 200, billsIssuedAmount: 0, billsIssuedCount: 0, arrearsAmount: 0, arrearsCount: 0 },
          { monthKey: '1405-07', monthLabel: 'میزان ۱۴۰۵', income: 300, refunds: 0, expense: 0, netCash: 300, billsIssuedAmount: 0, billsIssuedCount: 0, arrearsAmount: 0, arrearsCount: 0 }
        ]
      };
    } else if (pathname === '/api/finance/admin/reports/monthly-summary') {
      requests.monthlySummary.push(searchParams.get('month'));
      body = { success: true, summary: { monthKey: searchParams.get('month'), totalOrders: 0 } };
    } else if (pathname === '/api/finance/admin/bills' && request.method() === 'POST') {
      requests.manualBill.push(request.postDataJSON());
      body = { success: true, item: { _id: 'bill-new' }, message: 'بل برای ماه میزان ۱۴۰۵ با موفقیت ایجاد شد.' };
    } else if (pathname === '/api/finance/admin/bills/preview') {
      const payload = request.postDataJSON();
      requests.bulkPreview.push(payload);
      body = {
        success: true,
        periodType: 'monthly',
        billingMonth: '1405-06',
        billingMonthLabel: 'سنبله ۱۴۰۵',
        items: [{
          studentId: 'student-1',
          studentMembershipId: 'mem-1',
          amountDue: 700,
          feeScopes: ['tuition'],
          lineItems: [],
          dueDate: payload.dueDate,
          billingMonth: '1405-06',
          billingMonthLabel: 'سنبله ۱۴۰۵'
        }],
        excluded: [],
        summary: { candidateCount: 1, billCount: 1, studentCount: 1, membershipCount: 1, duplicateCount: 0, totalAmountDue: 700 }
      };
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/admin-finance', { waitUntil: 'domcontentloaded' });
}

const newRequests = () => ({ overview: [], trend: [], monthlySummary: [], manualBill: [], bulkPreview: [] });

test('bill forms show which month a bill is for and send that month', async ({ page }) => {
  test.setTimeout(60_000);
  const requests = newRequests();
  await openFinance(page, requests);
  await page.getByTestId('finance-section-orders').click();

  const manualForm = page.getByTestId('manual-bill-form');
  const manualNote = page.getByTestId('manual-bill-month-note');
  await expect(manualNote).toContainText('میزان ۱۴۰۵');

  // Picking a due date files the bill under that date's month.
  await manualForm.getByLabel('سال هجری شمسی', { exact: true }).fill('1405');
  await manualForm.getByLabel('ماه هجری شمسی', { exact: true }).selectOption('6');
  await manualForm.getByLabel('روز هجری شمسی', { exact: true }).fill('10');
  await expect(manualNote).toContainText('سنبله ۱۴۰۵');
  await expect(manualForm.getByLabel('ماه بل دستی - ماه هجری شمسی')).toHaveValue('6');

  // Picking another month moves the due date into it (same day).
  await manualForm.getByLabel('ماه بل دستی - ماه هجری شمسی').selectOption('7');
  await expect(manualNote).toContainText('میزان ۱۴۰۵');
  await expect(manualForm.getByLabel('ماه هجری شمسی', { exact: true })).toHaveValue('7');
  await expect(manualForm.getByLabel('روز هجری شمسی', { exact: true })).toHaveValue('10');

  await manualForm.locator('select:has(option[value="student-1"])').selectOption('student-1');
  await manualForm.getByLabel('منبع مبلغ بل دستی').selectOption('manual');
  await manualForm.getByLabel('مبلغ دستی بل').fill('500');
  await manualForm.getByRole('button', { name: 'ایجاد بل' }).click();
  await expect.poll(() => requests.manualBill.length).toBe(1);
  expect(requests.manualBill[0].billingMonth).toBe('1405-07');
  expect(requests.manualBill[0].dueDate).toBe('2026-10-02');

  // Bulk: choosing the month fills a due date inside it, and the preview names the month.
  await manualForm.getByRole('button', { name: 'صدور گروهی' }).click();
  const bulkForm = page.getByTestId('bulk-billing-form');
  await expect(page.getByTestId('bulk-bill-month-note')).toContainText('میزان ۱۴۰۵');
  await bulkForm.getByLabel('ماه بل گروهی - ماه هجری شمسی').selectOption('6');
  await expect(page.getByTestId('bulk-bill-month-note')).toContainText('سنبله ۱۴۰۵');
  await expect(bulkForm.getByLabel('روز هجری شمسی', { exact: true })).toHaveValue('10');
  await bulkForm.locator('select:has(option[value="class-1"])').first().selectOption('class-1');
  await bulkForm.getByRole('button', { name: 'پیش‌نمایش بل‌ها' }).click();
  await expect.poll(() => requests.bulkPreview.length).toBe(1);
  expect(requests.bulkPreview[0].billingMonth).toBe('1405-06');
  expect(requests.bulkPreview[0].dueDate).toBe('2026-09-01');
  await expect(page.getByTestId('bulk-billing-preview-month')).toContainText('سنبله ۱۴۰۵');
  await expect(page.getByTestId('bulk-billing-preview')).toContainText('ماه بل: سنبله ۱۴۰۵');
});

test('the Afghan month picked at the top drives the dashboard, trend, monthly report and expenses', async ({ page }) => {
  test.setTimeout(60_000);
  const requests = newRequests();
  await openFinance(page, requests);

  const monthSelect = page.getByTestId('finance-range-month-select');
  await expect(monthSelect).toHaveValue('1405-07');
  await expect.poll(() => requests.overview.at(-1)?.from).toBe('2026-09-23');
  expect(requests.overview.at(-1)?.to).toBe('2026-10-22');

  await monthSelect.selectOption('1405-06');
  await expect.poll(() => requests.overview.at(-1)?.from).toBe('2026-08-23');
  expect(requests.overview.at(-1)?.to).toBe('2026-09-22');
  await expect(page.getByTestId('finance-range-summary')).toContainText('سنبله');
  await expect.poll(() => requests.trend.at(-1)?.to).toBe('2026-09-22');
  const inRangeRows = page.locator('.monthly-trend-table .row.is-in-range');
  await expect(inRangeRows).toHaveCount(1);
  await expect(inRangeRows).toContainText('سنبله ۱۴۰۵');
  await expect(page.getByTestId('finance-head-range-revenue')).toContainText('عواید بازه');

  await page.getByTestId('finance-section-reports').click();
  await expect.poll(() => requests.monthlySummary.at(-1)).toBe('1405-06');
  await expect(page.getByTestId('monthly-summary-month-select')).toHaveValue('1405-06');

  // Picking a month in the monthly report moves the whole page to it.
  await page.getByTestId('monthly-summary-month-select').selectOption('1405-05');
  await expect(monthSelect).toHaveValue('1405-05');
  await expect.poll(() => requests.overview.at(-1)?.from).toBe('2026-07-23');
  await expect.poll(() => requests.monthlySummary.at(-1)).toBe('1405-05');

  await page.getByTestId('finance-section-expenses').click();
  await expect(page.getByTestId('expense-month-filter')).toHaveValue('1405-05');
});
