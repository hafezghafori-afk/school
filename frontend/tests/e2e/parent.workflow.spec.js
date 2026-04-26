import { test, expect } from '@playwright/test';

const parentSession = {
  token: 'mock.header.signature',
  role: 'parent',
  userId: 'parent-1',
  userName: 'Guardian Alpha',
  orgRole: 'parent'
};

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  };
}

async function setupShell(page) {
  await page.addInitScript((session) => {
    localStorage.setItem('token', session.token);
    localStorage.setItem('role', session.role);
    localStorage.setItem('userId', session.userId);
    localStorage.setItem('userName', session.userName);
    localStorage.setItem('orgRole', session.orgRole);
  }, parentSession);

  await page.route('**/api/settings/public', async (route) => {
    await route.fulfill(json({ success: true, settings: {} }));
  });

  await page.route('**/api/health', async (route) => {
    await route.fulfill(json({ success: true }));
  });

  await page.route('**/api/users/me/notifications', async (route) => {
    await route.fulfill(json({ success: true, items: [] }));
  });

  await page.route('**/api/users/me/notifications/read-all', async (route) => {
    await route.fulfill(json({ success: true }));
  });

  await page.route('**/api/users/me/notifications/*/read', async (route) => {
    await route.fulfill(json({ success: true }));
  });
}

test.describe('parent dashboard workflow', () => {
  test('parent dashboard switches linked student and shows real dashboard cards', async ({ page }) => {
    let lastStudentId = '';
    let lastStatementStudentId = '';

    await setupShell(page);

    await page.route('**/api/dashboard/parent**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/statement-pack.pdf')) {
        lastStatementStudentId = url.searchParams.get('studentId') || '';
        await route.fulfill({
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': 'attachment; filename="parent-finance-statement-membership-2.pdf"'
          },
          body: '%PDF-1.4 parent statement'
        });
        return;
      }
      const studentId = url.searchParams.get('studentId') || '';
      lastStudentId = studentId;

      const usingSecondChild = studentId === 'student-core-2';
      await route.fulfill(json({
        success: true,
        generatedAt: '2026-03-26T12:30:00.000Z',
        previewMode: false,
        setupNeeded: false,
        linkedStudent: {
          id: usingSecondChild ? 'student-core-2' : 'student-core-1',
          studentCoreId: usingSecondChild ? 'student-core-2' : 'student-core-1',
          studentUserId: usingSecondChild ? 'student-user-2' : 'student-user-1',
          name: usingSecondChild ? 'Student Beta' : 'Student Alpha',
          classTitle: usingSecondChild ? 'صنف هشتم ب' : 'صنف هفتم الف',
          academicYearTitle: '1406',
          membershipId: usingSecondChild ? 'membership-2' : 'membership-1',
          relation: usingSecondChild ? 'مادر' : 'پدر'
        },
        linkedStudents: [
          {
            id: 'student-core-1',
            studentCoreId: 'student-core-1',
            studentUserId: 'student-user-1',
            name: 'Student Alpha',
            classTitle: 'صنف هفتم الف',
            academicYearTitle: '1406',
            relation: 'پدر',
            isPrimary: true,
            hasActiveMembership: true
          },
          {
            id: 'student-core-2',
            studentCoreId: 'student-core-2',
            studentUserId: 'student-user-2',
            name: 'Student Beta',
            classTitle: 'صنف هشتم ب',
            academicYearTitle: '1406',
            relation: 'مادر',
            isPrimary: false,
            hasActiveMembership: true
          }
        ],
        summary: {
          attendanceRate: usingSecondChild ? 91 : 84,
          averageScore: usingSecondChild ? 88 : 79,
          outstandingAmount: usingSecondChild ? 400 : 1200,
          paidAmount: usingSecondChild ? 2600 : 1800,
          pendingHomework: usingSecondChild ? 1 : 3,
          upcomingLessons: usingSecondChild ? 2 : 4,
          activeReliefs: usingSecondChild ? 1 : 2,
          pendingPayments: usingSecondChild ? 0 : 1,
          overdueOrders: usingSecondChild ? 0 : 1,
          expiringReliefs: usingSecondChild ? 0 : 1
        },
        financeSummary: {
          activeReliefs: usingSecondChild ? 1 : 2,
          fixedReliefAmount: usingSecondChild ? 300 : 700,
          percentReliefCount: usingSecondChild ? 0 : 1,
          fullReliefCount: usingSecondChild ? 1 : 0,
          pendingPayments: usingSecondChild ? 0 : 1,
          overdueOrders: usingSecondChild ? 0 : 1,
          dueSoonOrders: usingSecondChild ? 1 : 2,
          expiringReliefs: usingSecondChild ? 0 : 1,
          lastPaymentAt: '2026-03-25T10:00:00.000Z'
        },
        financeBreakdown: [
          { label: 'بدهی باز', value: usingSecondChild ? 400 : 1200, meta: '2 مورد' },
          { label: 'پرداخت‌های تاییدشده', value: usingSecondChild ? 2600 : 1800, meta: '3 رسید' },
          { label: 'رسیدهای در انتظار', value: usingSecondChild ? 0 : 1, meta: 'در انتظار بررسی' },
          { label: 'تسهیلات فعال', value: usingSecondChild ? 1 : 2, meta: usingSecondChild ? '300 AFN' : '700 AFN' }
        ],
        financeOrders: [
          {
            id: usingSecondChild ? 'order-2' : 'order-1',
            orderNumber: usingSecondChild ? 'FO-002' : 'FO-001',
            title: usingSecondChild ? 'ترانسپورت ماهوار' : 'فیس ماهوار',
            status: usingSecondChild ? 'partial' : 'overdue',
            dueDate: '2026-03-28T00:00:00.000Z',
            outstandingAmount: usingSecondChild ? 400 : 1200,
            amountDue: usingSecondChild ? 800 : 1200,
            amountPaid: usingSecondChild ? 400 : 0,
            currency: 'AFN',
            periodLabel: 'حمل 1406',
            orderType: usingSecondChild ? 'transport' : 'tuition'
          }
        ],
        financePayments: [
          {
            id: usingSecondChild ? 'payment-2' : 'payment-1',
            paymentNumber: usingSecondChild ? 'PAY-002' : 'PAY-001',
            amount: usingSecondChild ? 2600 : 700,
            currency: 'AFN',
            paymentMethod: usingSecondChild ? 'cash' : 'bank_transfer',
            status: usingSecondChild ? 'approved' : 'pending',
            approvalStage: usingSecondChild ? 'completed' : 'finance_manager_review',
            paidAt: '2026-03-25T10:00:00.000Z'
          }
        ],
        financeReliefs: [
          {
            id: usingSecondChild ? 'relief-2' : 'relief-1',
            reliefType: usingSecondChild ? 'scholarship_full' : 'charity_support',
            coverageMode: usingSecondChild ? 'full' : 'fixed',
            amount: usingSecondChild ? 0 : 700,
            percentage: usingSecondChild ? 100 : 0,
            sponsorName: usingSecondChild ? 'Merit Fund' : 'Community Fund',
            status: 'active',
            reason: 'Support package',
            endDate: usingSecondChild ? '2026-06-30T00:00:00.000Z' : '2026-04-05T00:00:00.000Z'
          }
        ],
        tasks: [
          { id: 'task-1', label: 'پیگیری کارخانگی', meta: usingSecondChild ? '1 مورد' : '3 مورد', tone: 'copper' }
        ],
        alerts: usingSecondChild
          ? []
          : [{ id: 'alert-1', label: 'برای این متعلم هنوز بدهی باز مالی وجود دارد.', meta: '1200 افغانی', tone: 'rose' }],
        schedule: [
          { id: 'schedule-1', label: 'ریاضی', meta: '08:00 تا 08:45' },
          { id: 'schedule-2', label: 'علوم', meta: '09:00 تا 09:45' }
        ],
        message: ''
      }));
    });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'داشبورد والدین و سرپرستان' })).toBeVisible();
    await expect(page.locator('.dash-meta')).toContainText('Student Alpha');
    await expect(page.locator('.dash-panel').filter({ hasText: 'فهرست متعلمین وصل‌شده' })).toContainText('Student Beta');
    await expect(page.getByTestId('parent-finance-workbench')).toContainText(/FO-001|فیس ماهوار/);
    await expect(page.getByTestId('parent-finance-reliefs')).toContainText(/Community Fund|حمایت خیریه|تسهیلات/);

    await page.locator('.dash-hero-actions select').selectOption('student-core-2');
    await expect.poll(() => lastStudentId).toBe('student-core-2');
    await expect(page.locator('.dash-meta')).toContainText('Student Beta');
    await expect(page.locator('.dash-summary-card').filter({ hasText: 'باقی‌مانده' })).toContainText(/400|۴۰۰/);
    await expect(page.getByTestId('parent-finance-reliefs')).toContainText(/Merit Fund|بورسیه کامل|تسهیلات/);
    await page.getByTestId('download-parent-statement').click();
    await expect.poll(() => lastStatementStudentId).toBe('student-core-2');
  });

  test('parent can submit a receipt from the finance workbench', async ({ page }) => {
    let receiptSubmitted = false;

    await setupShell(page);

    await page.route('**/api/dashboard/parent*', async (route) => {
      await route.fulfill(json({
        success: true,
        generatedAt: '2026-03-26T12:30:00.000Z',
        previewMode: false,
        setupNeeded: false,
        linkedStudent: {
          id: 'student-core-1',
          studentCoreId: 'student-core-1',
          studentUserId: 'student-user-1',
          name: 'Student Alpha',
          classTitle: 'ØµÙ†Ù Ù‡ÙØªÙ… Ø§Ù„Ù',
          academicYearTitle: '1406',
          membershipId: 'membership-1',
          relation: 'Ù¾Ø¯Ø±'
        },
        linkedStudents: [
          {
            id: 'student-core-1',
            studentCoreId: 'student-core-1',
            studentUserId: 'student-user-1',
            name: 'Student Alpha',
            classTitle: 'ØµÙ†Ù Ù‡ÙØªÙ… Ø§Ù„Ù',
            academicYearTitle: '1406',
            relation: 'Ù¾Ø¯Ø±',
            isPrimary: true,
            hasActiveMembership: true
          }
        ],
        summary: {
          attendanceRate: 84,
          averageScore: 79,
          outstandingAmount: 1200,
          paidAmount: 1800,
          pendingHomework: 3,
          upcomingLessons: 4,
          activeReliefs: 1,
          pendingPayments: receiptSubmitted ? 1 : 0,
          overdueOrders: 1,
          expiringReliefs: 1
        },
        financeSummary: {
          activeReliefs: 1,
          fixedReliefAmount: 700,
          percentReliefCount: 1,
          fullReliefCount: 0,
          pendingPayments: receiptSubmitted ? 1 : 0,
          overdueOrders: 1,
          dueSoonOrders: 1,
          expiringReliefs: 1,
          lastPaymentAt: '2026-03-25T10:00:00.000Z'
        },
        financeBreakdown: [
          { label: 'Ø¨Ø¯Ù‡ÛŒ Ø¨Ø§Ø²', value: 1200, meta: '1 Ù…ÙˆØ±Ø¯' },
          { label: 'Ù¾Ø±Ø¯Ø§Ø®Øªâ€ŒÙ‡Ø§ÛŒ ØªØ§ÛŒÛŒØ¯Ø´Ø¯Ù‡', value: 1800, meta: '2 Ø±Ø³ÛŒØ¯' },
          { label: 'Ø±Ø³ÛŒØ¯Ù‡Ø§ÛŒ Ø¯Ø± Ø§Ù†ØªØ¸Ø§Ø±', value: receiptSubmitted ? 1 : 0, meta: 'Ø¯Ø± Ø§Ù†ØªØ¸Ø§Ø± Ø¨Ø±Ø±Ø³ÛŒ' },
          { label: 'ØªØ³Ù‡ÛŒÙ„Ø§Øª ÙØ¹Ø§Ù„', value: 1, meta: '700 AFN' }
        ],
        financeOrders: [
          {
            id: 'order-1',
            sourceBillId: 'bill-1',
            supportsReceiptUpload: true,
            orderNumber: 'FO-001',
            title: 'ÙÛŒØ³ Ù…Ø§Ù‡ÙˆØ§Ø±',
            status: 'overdue',
            dueDate: '2026-03-28T00:00:00.000Z',
            outstandingAmount: 1200,
            amountDue: 1200,
            amountPaid: 0,
            currency: 'AFN',
            periodLabel: 'Ø­Ù…Ù„ 1406',
            orderType: 'tuition'
          }
        ],
        financePayments: receiptSubmitted
          ? [{
              id: 'payment-parent-1',
              paymentNumber: 'PAY-PARENT-1',
              amount: 1200,
              currency: 'AFN',
              paymentMethod: 'bank_transfer',
              status: 'pending',
              approvalStage: 'finance_manager_review',
              paidAt: '2026-03-26T11:00:00.000Z'
            }]
          : [],
        financeReliefs: [
          {
            id: 'relief-1',
            reliefType: 'charity_support',
            coverageMode: 'fixed',
            amount: 700,
            percentage: 0,
            sponsorName: 'Community Fund',
            status: 'active',
            reason: 'Support package',
            endDate: '2026-04-05T00:00:00.000Z'
          }
        ],
        tasks: [],
        alerts: [],
        schedule: [],
        message: ''
      }));
    });

    await page.route('**/api/finance/parent/receipts', async (route) => {
      receiptSubmitted = true;
      await route.fulfill(json({
        success: true,
        receipt: { id: 'receipt-parent-1' },
        message: 'رسید توسط ولی/سرپرست ثبت شد و در انتظار تایید مالی است'
      }, 201));
    });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('parent-receipt-form')).toBeVisible();
    await page.getByTestId('parent-receipt-form').locator('input[type=\"file\"]').setInputFiles({
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake receipt')
    });
    await page.getByTestId('parent-receipt-form').getByRole('button', { name: 'ارسال رسید' }).click();

    await expect(page.getByTestId('parent-receipt-form')).toContainText('در انتظار تایید مالی است');
    await expect(page.getByTestId('parent-finance-payments')).toContainText(/PAY-PARENT-1|در انتظار/);
  });

  test('parent can submit a canonical payment for a fee order without source bill', async ({ page }) => {
    let paymentSubmitted = false;

    await setupShell(page);

    await page.route('**/api/dashboard/parent*', async (route) => {
      await route.fulfill(json({
        success: true,
        generatedAt: '2026-03-26T12:30:00.000Z',
        previewMode: false,
        setupNeeded: false,
        linkedStudent: {
          id: 'student-core-1',
          studentCoreId: 'student-core-1',
          studentUserId: 'student-user-1',
          name: 'Student Alpha',
          classTitle: 'صنف هفتم الف',
          academicYearTitle: '1406',
          membershipId: 'membership-1',
          relation: 'پدر'
        },
        linkedStudents: [
          {
            id: 'student-core-1',
            studentCoreId: 'student-core-1',
            studentUserId: 'student-user-1',
            name: 'Student Alpha',
            classTitle: 'صنف هفتم الف',
            academicYearTitle: '1406',
            relation: 'پدر',
            isPrimary: true,
            hasActiveMembership: true
          }
        ],
        summary: {
          attendanceRate: 84,
          averageScore: 79,
          outstandingAmount: paymentSubmitted ? 0 : 900,
          paidAmount: paymentSubmitted ? 2700 : 1800,
          pendingHomework: 3,
          upcomingLessons: 4,
          activeReliefs: 0,
          pendingPayments: paymentSubmitted ? 1 : 0,
          overdueOrders: paymentSubmitted ? 0 : 1,
          expiringReliefs: 0
        },
        financeSummary: {
          activeReliefs: 0,
          fixedReliefAmount: 0,
          percentReliefCount: 0,
          fullReliefCount: 0,
          pendingPayments: paymentSubmitted ? 1 : 0,
          overdueOrders: paymentSubmitted ? 0 : 1,
          dueSoonOrders: 1,
          expiringReliefs: 0,
          lastPaymentAt: paymentSubmitted ? '2026-03-26T11:00:00.000Z' : '2026-03-25T10:00:00.000Z'
        },
        financeStatement: {
          generatedAt: '2026-03-26T12:30:00.000Z',
          totals: {
            totalOrders: 1,
            totalPayments: paymentSubmitted ? 1 : 0,
            totalDue: 900,
            totalPaid: paymentSubmitted ? 900 : 0,
            totalOutstanding: paymentSubmitted ? 0 : 900,
            totalReliefs: 0
          }
        },
        financeBreakdown: [
          { label: 'بدهی باز', value: paymentSubmitted ? 0 : 900, meta: '1 مورد' },
          { label: 'پرداخت‌های تاییدشده', value: paymentSubmitted ? 2700 : 1800, meta: '2 رسید' },
          { label: 'رسیدهای در انتظار', value: paymentSubmitted ? 1 : 0, meta: 'در انتظار بررسی' },
          { label: 'تسهیلات فعال', value: 0, meta: '0 AFN' }
        ],
        financeOrders: paymentSubmitted
          ? []
          : [{
              id: 'order-canonical-1',
              sourceBillId: '',
              supportsReceiptUpload: true,
              submissionMode: 'canonical_payment',
              orderNumber: 'FO-900',
              title: 'فیس ماهوار حمل',
              status: 'overdue',
              dueDate: '2026-03-28T00:00:00.000Z',
              outstandingAmount: 900,
              amountDue: 900,
              amountPaid: 0,
              currency: 'AFN',
              periodLabel: 'حمل 1406',
              orderType: 'tuition'
            }],
        financePayments: paymentSubmitted
          ? [{
              id: 'payment-canonical-1',
              paymentNumber: 'PAY-CANON-1',
              amount: 900,
              currency: 'AFN',
              paymentMethod: 'bank_transfer',
              status: 'pending',
              approvalStage: 'finance_manager_review',
              paidAt: '2026-03-26T11:00:00.000Z'
            }]
          : [],
        financeReliefs: [],
        tasks: [],
        alerts: [],
        schedule: [],
        message: ''
      }));
    });

    await page.route('**/api/finance/parent/receipts', async (route) => {
      await route.fulfill(json({
        success: false,
        message: 'legacy route should not be called here'
      }, 500));
    });

    await page.route('**/api/finance/parent/payments', async (route) => {
      paymentSubmitted = true;
      await route.fulfill(json({
        success: true,
        item: { id: 'payment-canonical-1' },
        message: 'پرداخت مالی ثبت شد و در انتظار تایید مالی قرار گرفت'
      }, 201));
    });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('parent-finance-statement')).toBeVisible();
    await expect(page.getByTestId('parent-receipt-form')).toBeVisible();

    await page.getByTestId('parent-receipt-form').locator('input[type="file"]').setInputFiles({
      name: 'canonical-receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake canonical receipt')
    });
    await page.getByTestId('parent-receipt-form').locator('button[type="submit"]').click();

    await expect(page.getByTestId('parent-receipt-form')).toContainText('در انتظار تایید مالی');
    await expect(page.getByTestId('parent-finance-payments')).toContainText(/PAY-CANON-1|در انتظار/);
  });
});
