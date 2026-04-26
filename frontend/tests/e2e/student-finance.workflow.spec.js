import { test, expect } from '@playwright/test';

const studentSession = {
  token: 'mock.header.signature',
  role: 'student',
  userId: 'student-1',
  userName: 'متعلم الف'
};

function json(body, status = 200, headers = {}) {
  return {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  };
}

async function setupStudentWorkspace(page) {
  await page.addInitScript((session) => {
    localStorage.setItem('token', session.token);
    localStorage.setItem('role', session.role);
    localStorage.setItem('userId', session.userId);
    localStorage.setItem('userName', session.userName);
  }, studentSession);

  await page.route('**/api/settings/public', async (route) => {
    await route.fulfill(json({ success: true, settings: { brandName: 'Alpha Academy' } }));
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

  await page.route('**/api/users/me', async (route) => {
    await route.fulfill(json({
      success: true,
      user: {
        _id: studentSession.userId,
        name: studentSession.userName,
        role: studentSession.role
      }
    }));
  });
}

test.describe('student finance canonical workflow', () => {
  test('student finance canonical workflow switches memberships and refreshes overview data', async ({ page }) => {
    let overviewCalls = 0;
    let statementPackCalls = 0;

    const items = [
      {
        membership: {
          id: 'membership-1',
          status: 'active',
          enrolledAt: '2026-03-01T08:00:00.000Z',
          student: { fullName: 'متعلم الف' },
          schoolClass: { title: 'صنف دهم الف' },
          academicYear: { title: '1406' }
        },
        summary: {
          totalOrders: 2,
          totalPayments: 1,
          totalDue: 1200,
          totalPaid: 1200,
          totalOutstanding: 0,
          pendingPayments: 0,
          overdueOrders: 0
        },
        eligibilitySummary: {
          eligible: true,
          feeStatus: 'clear',
          overdueOrders: 0,
          pendingPayments: 0,
          totalOutstanding: 0
        },
        orders: [
          {
            id: 'order-1',
            title: 'شهریه سالانه',
            orderNumber: 'FO-1001',
            periodLabel: 'سال تعلیمی 1406',
            orderType: 'tuition',
            linkScope: 'membership',
            status: 'paid',
            dueDate: '2026-03-15T00:00:00.000Z',
            amountDue: 1200,
            outstandingAmount: 0,
            currency: 'AFN'
          }
        ],
        payments: [
          {
            id: 'payment-1',
            paymentNumber: 'FP-1001',
            amount: 1200,
            currency: 'AFN',
            status: 'completed',
            approvalStage: 'completed',
            paidAt: '2026-03-05T08:30:00.000Z',
            paymentMethod: 'bank_transfer',
            linkScope: 'membership',
            note: 'پرداخت کامل شهریه'
          }
        ],
        discounts: [
          {
            id: 'discount-1',
            amount: 100,
            discountType: 'merit',
            reason: 'تخفیف ممتاز'
          }
        ],
        transportFees: []
      },
      {
        membership: {
          id: 'membership-2',
          status: 'active',
          enrolledAt: '2026-03-10T08:00:00.000Z',
          student: { fullName: 'متعلم الف' },
          schoolClass: { title: 'صنف یازدهم ب' },
          academicYear: { title: '1406' }
        },
        summary: {
          totalOrders: 1,
          totalPayments: 1,
          totalDue: 500,
          totalPaid: 200,
          totalOutstanding: 300,
          pendingPayments: 1,
          overdueOrders: 1
        },
        eligibilitySummary: {
          eligible: false,
          feeStatus: 'overdue',
          overdueOrders: 1,
          pendingPayments: 1,
          totalOutstanding: 300
        },
        orders: [
          {
            id: 'order-2',
            title: 'فیس امتحان',
            orderNumber: 'FO-2001',
            periodLabel: 'امتحان سالانه',
            orderType: 'exam',
            linkScope: 'membership',
            status: 'overdue',
            dueDate: '2026-04-01T00:00:00.000Z',
            amountDue: 500,
            outstandingAmount: 300,
            currency: 'AFN'
          }
        ],
        payments: [
          {
            id: 'payment-2',
            paymentNumber: 'FP-2001',
            amount: 200,
            currency: 'AFN',
            status: 'pending',
            approvalStage: 'finance_manager_review',
            paidAt: '2026-03-12T10:00:00.000Z',
            paymentMethod: 'cash',
            linkScope: 'membership',
            note: 'رسید در انتظار تایید'
          }
        ],
        discounts: [],
        transportFees: [
          {
            id: 'transport-1',
            amount: 150,
            currency: 'AFN',
            title: 'ترانسپورت مسیر جنوب',
            status: 'active',
            frequency: 'monthly'
          }
        ]
      }
    ];

    await setupStudentWorkspace(page);

    await page.route('**/api/student-finance/me/overviews', async (route) => {
      overviewCalls += 1;
      await route.fulfill(json({ success: true, items }));
    });

    await page.route('**/api/student-finance/memberships/*/statement-pack.pdf', async (route) => {
      statementPackCalls += 1;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="student-finance-statement-membership-2.pdf"'
        },
        body: '%PDF-1.4 student statement'
      });
    });

    await page.goto('/my-finance', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'نمای مالی متعلم' })).toBeVisible();
    await expect(page.locator('.student-finance-summary-card').first()).toContainText(/2|۲/);
    await expect(page.locator('.student-finance-membership-card')).toContainText('صنف دهم الف');
    await expect(page.locator('.student-finance-eligibility')).toContainText('مجاز');
    await expect(page.locator('.student-finance-table-wrap').first()).toContainText('شهریه سالانه');
    await expect(page.locator('.student-finance-timeline')).toContainText('FP-1001');

    await page.locator('.student-finance-field select').first().selectOption('membership-2');

    await expect(page.locator('.student-finance-membership-card')).toContainText('صنف یازدهم ب');
    await expect(page.locator('.student-finance-eligibility')).toContainText('متوقف');
    await expect(page.locator('.student-finance-eligibility')).toContainText('معوق');
    await expect(page.locator('.student-finance-table-wrap').first()).toContainText('فیس امتحان');
    await expect(page.locator('.student-finance-stack')).toContainText('ترانسپورت مسیر جنوب');
    await expect(page.locator('.student-finance-timeline')).toContainText('رسید در انتظار تایید');

    await page.getByTestId('download-membership-statement').click();
    await expect.poll(() => statementPackCalls).toBe(1);

    const callsBeforeReload = overviewCalls;
    await page.getByRole('button', { name: 'بازخوانی' }).click();

    await expect.poll(() => overviewCalls).toBe(callsBeforeReload + 1);
  });
});
