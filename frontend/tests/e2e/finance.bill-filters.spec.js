import { test, expect } from '@playwright/test';

const adminSession = {
  token: 'mock.header.signature',
  role: 'admin',
  userId: 'admin-1',
  userName: 'Finance Manager',
  adminLevel: 'finance_manager',
  permissions: ['manage_finance']
};

const orders = [
  {
    id: 'order-1',
    studentMembershipId: 'mem-1',
    orderNumber: 'BL-202603-0001',
    title: 'فیس ماه حمل',
    orderType: 'tuition',
    status: 'new',
    amountDue: 1000,
    amountPaid: 0,
    outstandingAmount: 1000,
    student: { userId: 'student-1', fullName: 'Student Alpha' },
    schoolClass: { id: 'class-1', title: 'Class One Core' },
    academicYear: { id: 'year-1', title: '1406' }
  },
  {
    id: 'order-2',
    studentMembershipId: 'mem-2',
    orderNumber: 'BL-202603-0002',
    title: 'فیس ماه حمل',
    orderType: 'tuition',
    status: 'partial',
    amountDue: 800,
    amountPaid: 200,
    outstandingAmount: 600,
    student: { userId: 'student-2', fullName: 'علی كریمی' },
    schoolClass: { id: 'class-1', title: 'Class One Core' },
    academicYear: { id: 'year-1', title: '1406' }
  },
  {
    id: 'order-3',
    studentMembershipId: 'mem-1',
    orderNumber: 'BL-202603-0003',
    title: 'ترانسپورت ماه حمل',
    orderType: 'transport',
    status: 'partial',
    amountDue: 450,
    amountPaid: 150,
    outstandingAmount: 300,
    student: { userId: 'student-1', fullName: 'Student Alpha' },
    schoolClass: { id: 'class-1', title: 'Class One Core' },
    academicYear: { id: 'year-1', title: '1406' }
  },
  {
    id: 'order-void-1',
    studentMembershipId: 'mem-1',
    orderNumber: 'VOID-ADMISSION-001',
    title: 'داخله باطل‌شده',
    orderType: 'admission',
    status: 'void',
    amountDue: 500,
    amountPaid: 0,
    outstandingAmount: 500,
    voidReason: 'بل اشتباه بود',
    student: { userId: 'student-1', fullName: 'Student Alpha' },
    schoolClass: { id: 'class-1', title: 'Class One Core' },
    academicYear: { id: 'year-1', title: '1406' }
  }
];

const memberships = [
  {
    _id: 'mem-1',
    studentId: 'student-1',
    studentCoreId: 'student-core-1',
    studentName: 'Student Alpha',
    classId: 'class-1',
    classTitle: 'Class One Core',
    academicYearId: 'year-1',
    academicYearTitle: '1406',
    status: 'active',
    isCurrent: true
  },
  {
    _id: 'mem-2',
    studentId: 'student-2',
    studentCoreId: 'student-core-2',
    studentName: 'علی كریمی',
    classId: 'class-1',
    classTitle: 'Class One Core',
    academicYearId: 'year-1',
    academicYearTitle: '1406',
    status: 'active',
    isCurrent: true
  },
  {
    _id: 'mem-3',
    studentId: 'student-3',
    studentCoreId: 'student-core-3',
    studentName: 'Student Gamma',
    classId: 'class-2',
    classTitle: 'Class Two Core',
    academicYearId: 'year-1',
    academicYearTitle: '1406',
    status: 'active',
    isCurrent: true
  }
];

test('bill search and class/type filters share one scoped result set', async ({ page }) => {
  test.setTimeout(60_000);

  await page.addInitScript((session) => {
    localStorage.setItem('token', session.token);
    localStorage.setItem('role', session.role);
    localStorage.setItem('userId', session.userId);
    localStorage.setItem('userName', session.userName);
    localStorage.setItem('adminLevel', session.adminLevel);
    localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
  }, adminSession);

  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    let body = { success: true, items: [] };

    if (pathname === '/api/settings/public') {
      body = { success: true, settings: {} };
    } else if (pathname === '/api/health') {
      body = { success: true };
    } else if (pathname === '/api/users/me/notifications') {
      body = { success: true, items: [] };
    } else if (pathname === '/api/finance/admin/reference-data') {
      body = {
        success: true,
        students: [],
        classes: [
          { classId: 'class-1', title: 'Class One Core', uiLabel: 'Class One Core' },
          { classId: 'class-2', title: 'Class Two Core', uiLabel: 'Class Two Core' }
        ],
        academicYears: [{ _id: 'year-1', title: '1406', isCurrent: true, isActive: true }],
        currentAcademicYearId: 'year-1'
      };
    } else if (pathname === '/api/finance/admin/student-memberships') {
      body = { success: true, items: memberships };
    } else if (pathname === '/api/finance/admin/summary') {
      body = { success: true, summary: {}, topDebtors: [] };
    } else if (pathname === '/api/student-finance/orders') {
      body = { success: true, items: orders };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });

  await page.goto('/admin-finance', { waitUntil: 'domcontentloaded' });
  await page.locator('.finance-shell-tab').nth(2).click();

  const ordersCard = page.getByTestId('finance-orders-table-card');
  const orderRows = ordersCard.locator('.finance-orders-table .row');
  const summary = page.getByTestId('bill-record-summary');

  await expect(orderRows).toHaveCount(3);
  await expect(summary).toContainText(/۳|3/);
  await expect(summary).toContainText('بل رسمی در محدوده انتخاب‌شده');

  await page.getByTestId('bill-search-input').fill('علي کریمی');
  await expect(orderRows).toHaveCount(1);
  await expect(orderRows).toContainText('علی كریمی');
  await expect(orderRows).toContainText('BL-202603-0002');
  await expect(orderRows.getByRole('button', { name: 'باطل' })).toBeVisible();
  await expect(summary).toContainText(/۱|1/);

  await page.getByTestId('bill-search-input').clear();
  await page.getByTestId('bill-class-filter').selectOption('class-2');
  await expect(orderRows).toHaveCount(0);
  await expect(summary).toContainText(/۰|0/);
  await expect(page.getByTestId('bill-issuance-results')).toContainText('Student Gamma');
  await expect(page.getByTestId('bill-issuance-results')).toContainText('بل رسمی صادر نشده');

  await page.getByTestId('bill-class-filter').selectOption('class-1');
  await page.getByTestId('bill-fee-type-filter').selectOption('transport');
  await expect(orderRows).toHaveCount(1);
  await expect(orderRows).toContainText('BL-202603-0003');
  await expect(page.getByTestId('bill-issuance-results').locator('.mini-row').filter({ hasText: 'Student Alpha' })).toContainText('BL-202603-0003');
});
