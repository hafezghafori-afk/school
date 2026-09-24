import { test, expect } from '@playwright/test';

const studentSession = {
  token: 'mock.header.signature',
  role: 'student',
  userId: 'student-2',
  userName: 'Student Beta'
};

const adminSession = {
  token: 'mock.header.signature',
  role: 'admin',
  userId: 'admin-1',
  userName: 'Finance Manager',
  adminLevel: 'finance_manager',
  permissions: ['manage_finance']
};

const setupShellMocks = async (page) => {
  await page.route('**/api/settings/public', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, settings: {} })
    });
  });

  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  await page.route('**/api/users/me/notifications', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] })
    });
  });

  await page.route('**/api/users/me/notifications/read-all', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  await page.route('**/api/users/me/notifications/*/read', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });
};

test.describe('finance workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupShellMocks(page);
  });

  test('student finance workflow shows canonical membership overview and eligibility state', async ({ page }) => {
    const state = {
      items: [
        {
          membership: {
            id: 'mem-1',
            status: 'active',
            enrolledAt: '2026-03-01T08:00:00.000Z',
            student: { userId: studentSession.userId, fullName: 'Student Beta' },
            schoolClass: { id: 'class-1', title: 'Class 10 A' },
            academicYear: { id: 'year-1', title: '1405' }
          },
          summary: {
            totalOrders: 2,
            totalPayments: 1,
            totalDue: 1700,
            totalPaid: 300,
            totalOutstanding: 1400,
            totalDiscounts: 1,
            totalTransportFees: 1,
            openOrders: 2,
            overdueOrders: 1,
            pendingPayments: 1
          },
          statement: {
            generatedAt: '2026-03-20T08:30:00.000Z',
            currency: 'AFN',
            membershipLabel: 'Class 10 A - 1405',
            totals: {
              totalOrders: 2,
              totalPayments: 1,
              totalDue: 1700,
              totalPaid: 300,
              totalOutstanding: 1400
            },
            latestApprovedPayment: null,
            latestPendingPayment: {
              paymentNumber: 'PAY-001',
              amount: 300,
              paidAt: '2026-03-05T09:00:00.000Z',
              approvalStage: 'finance_manager_review'
            }
          },
          eligibilitySummary: {
            eligible: false,
            feeStatus: 'under_review',
            overdueOrders: 1,
            pendingPayments: 1,
            totalOutstanding: 1400
          },
          orders: [
            {
              id: 'order-1',
              title: 'Tuition Term 1',
              orderNumber: 'FO-001',
              orderType: 'tuition',
              linkScope: 'membership',
              status: 'overdue',
              dueDate: '2026-03-15T00:00:00.000Z',
              amountDue: 800,
              outstandingAmount: 800,
              currency: 'AFN'
            },
            {
              id: 'order-2',
              title: 'Transport Monthly',
              orderNumber: 'FO-002',
              orderType: 'transport',
              linkScope: 'membership',
              status: 'partial',
              dueDate: '2026-03-25T00:00:00.000Z',
              amountDue: 900,
              outstandingAmount: 600,
              currency: 'AFN'
            }
          ],
          payments: [
            {
              id: 'pay-1',
              amount: 300,
              currency: 'AFN',
              paymentNumber: 'PAY-001',
              status: 'pending',
              approvalStage: 'finance_manager_review',
              paidAt: '2026-03-05T09:00:00.000Z',
              paymentMethod: 'bank_transfer',
              linkScope: 'membership',
              note: 'رسید بانک'
            }
          ],
          discounts: [
            {
              id: 'dis-1',
              amount: 100,
              currency: 'AFN',
              discountType: 'discount',
              reason: 'Scholarship'
            }
          ],
          exemptions: [
            {
              id: 'ex-1',
              exemptionType: 'partial',
              scope: 'tuition',
              amount: 200,
              percentage: 25,
              reason: 'Sponsored family'
            }
          ],
          transportFees: [
            {
              id: 'tr-1',
              amount: 200,
              currency: 'AFN',
              title: 'Bus Fee',
              status: 'active',
              frequency: 'monthly'
            }
          ]
        },
        {
          membership: {
            id: 'mem-2',
            status: 'active',
            enrolledAt: '2026-03-10T08:00:00.000Z',
            student: { userId: studentSession.userId, fullName: 'Student Beta' },
            schoolClass: { id: 'class-2', title: 'Class 11 B' },
            academicYear: { id: 'year-1', title: '1405' }
          },
          summary: {
            totalOrders: 1,
            totalPayments: 1,
            totalDue: 500,
            totalPaid: 500,
            totalOutstanding: 0,
            totalDiscounts: 0,
            totalTransportFees: 0,
            openOrders: 0,
            overdueOrders: 0,
            pendingPayments: 0
          },
          statement: {
            generatedAt: '2026-03-20T08:40:00.000Z',
            currency: 'AFN',
            membershipLabel: 'Class 11 B - 1405',
            totals: {
              totalOrders: 1,
              totalPayments: 1,
              totalDue: 500,
              totalPaid: 500,
              totalOutstanding: 0
            },
            latestApprovedPayment: {
              paymentNumber: 'PAY-002',
              amount: 500,
              paidAt: '2026-03-11T09:00:00.000Z',
              orderNumber: 'FO-003'
            },
            latestPendingPayment: null
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
              id: 'order-3',
              title: 'Exam Fee',
              orderNumber: 'FO-003',
              orderType: 'exam',
              linkScope: 'membership',
              status: 'paid',
              dueDate: '2026-03-20T00:00:00.000Z',
              amountDue: 500,
              outstandingAmount: 0,
              currency: 'AFN'
            }
          ],
          payments: [
            {
              id: 'pay-2',
              amount: 500,
              currency: 'AFN',
              paymentNumber: 'PAY-002',
              status: 'approved',
              approvalStage: 'completed',
              paidAt: '2026-03-11T09:00:00.000Z',
              paymentMethod: 'cash',
              linkScope: 'membership',
              feeOrder: {
                id: 'order-3',
                orderNumber: 'FO-003',
                title: 'Exam Fee'
              },
              receiptDetails: {
                remainingBeforePayment: 500,
                remainingAfterPayment: 0,
                currency: 'AFN'
              }
            }
          ],
          discounts: [],
          exemptions: [],
          transportFees: []
        }
      ]
    };

    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
    }, studentSession);

    await page.route('**/api/student-finance/me/overviews', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: state.items
        })
      });
    });

    await page.goto('/my-finance', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'نمای مالی متعلم' })).toBeVisible();
    await expect(page.locator('.student-finance-hero-meta')).toContainText('Student Beta');
    await expect(page.locator('.student-finance-membership-card')).toContainText('Class 10 A');
    await expect(page.locator('.student-finance-summary-grid')).toContainText('۱٬۴۰۰ AFN');
    await expect(page.locator('.student-finance-table')).toContainText('Tuition Term 1');
    await expect(page.locator('.student-finance-eligibility')).toContainText('متوقف');
    await expect(page.locator('.student-finance-eligibility')).toContainText('در حال بررسی');
    await expect(page.locator('.student-finance-timeline')).toContainText('PAY-001');
    await expect(page.locator('.student-finance-timeline')).toContainText('در انتظار مدیر مالی');
    await expect(page.locator('.student-finance-stack')).toContainText('Scholarship');
    await expect(page.locator('.student-finance-stack')).toContainText('Bus Fee');

    await page.locator('.student-finance-field select').selectOption('mem-2');
    await expect(page.locator('.student-finance-membership-card')).toContainText('Class 11 B');
    await expect(page.locator('.student-finance-eligibility')).toContainText('مجاز');
    await expect(page.locator('.student-finance-table')).toContainText('Exam Fee');
  });

  test('admin finance workflow shows preview, approval trail, and operational actions', async ({ page }) => {
    test.setTimeout(420000);
    let approveCalls = 0;
    let paymentsListUrl = '';
    let reminderCalls = 0;
    let exportCalls = 0;
    let auditExportCalls = 0;
    let monthCloseExportCalls = 0;
    let monthClosePdfExportCalls = 0;
    let documentBatchExportCalls = 0;
    let lastExportUrl = '';
    let lastAuditExportUrl = '';
    let lastMonthCloseExportUrl = '';
    let lastMonthClosePdfUrl = '';
    let lastDocumentBatchUrl = '';
    let previewAllocationCalls = 0;
    let createPaymentCalls = 0;
    let followUpCalls = 0;
    let lastCreatedPaymentBody = null;
    const registryState = {
      reliefs: [
        {
          id: 'relief-1',
          reliefType: 'scholarship_partial',
          coverageMode: 'fixed',
          amount: 120,
          percentage: 0,
          sponsorName: 'Merit Fund',
          reason: 'Merit scholarship',
          status: 'active',
          student: { userId: 'student-1', fullName: 'Student Alpha' },
          schoolClass: { id: 'class-1', title: 'Class One Core' },
          academicYear: { id: 'year-1', title: '1406' }
        }
      ],
      discounts: [
        {
          id: 'dis-1',
          discountType: 'discount',
          amount: 120,
          reason: 'Merit scholarship',
          status: 'active',
          student: { userId: 'student-1', fullName: 'Student Alpha' },
          schoolClass: { id: 'class-1', title: 'Class One Core' },
          academicYear: { id: 'year-1', title: '1406' }
        }
      ],
      exemptions: [
        {
          id: 'ex-1',
          exemptionType: 'full',
          scope: 'all',
          amount: 0,
          percentage: 100,
          reason: 'Sponsored seat',
          status: 'active',
          student: { userId: 'student-2', fullName: 'Student Beta' },
          schoolClass: { id: 'class-2', title: 'Class Two Core' },
          academicYear: { id: 'year-1', title: '1406' }
        }
      ]
    };

    const financeState = {
      orders: [
        {
          id: 'order-1',
          studentMembershipId: 'mem-1',
          sourceBillId: 'bill-1',
          orderNumber: 'BL-202603-0001',
          title: 'Tuition Term 1',
          orderType: 'tuition',
          status: 'new',
          amountDue: 1000,
          amountPaid: 0,
          outstandingAmount: 1000,
          student: { userId: 'student-1', fullName: 'Student Alpha', email: 'alpha@example.com' },
          schoolClass: { id: 'class-1', title: 'Class One Core' },
          academicYear: { id: 'year-1', title: '1406' },
          course: { id: 'course-1', title: 'Class One' }
        },
        {
          id: 'order-2',
          studentMembershipId: 'mem-2',
          sourceBillId: 'bill-2',
          orderNumber: 'BL-202603-0002',
          title: 'Tuition Term 1',
          orderType: 'tuition',
          status: 'partial',
          amountDue: 800,
          amountPaid: 200,
          outstandingAmount: 600,
          student: { userId: 'student-2', fullName: 'Student Beta', email: 'beta@example.com' },
          schoolClass: { id: 'class-1', title: 'Class One Core' },
          academicYear: { id: 'year-1', title: '1406' },
          course: { id: 'course-1', title: 'Class One' }
        },
        {
          id: 'order-3',
          studentMembershipId: 'mem-1',
          sourceBillId: 'bill-3',
          orderNumber: 'BL-202603-0003',
          title: 'Transport Monthly',
          orderType: 'transport',
          status: 'partial',
          amountDue: 450,
          amountPaid: 150,
          outstandingAmount: 300,
          student: { userId: 'student-1', fullName: 'Student Alpha', email: 'alpha@example.com' },
          schoolClass: { id: 'class-1', title: 'Class One Core' },
          academicYear: { id: 'year-1', title: '1406' },
          course: { id: 'course-1', title: 'Class One' }
        },
        {
          id: 'order-void-1',
          studentMembershipId: 'mem-1',
          orderNumber: 'VOID-ADMISSION-001',
          title: 'Cancelled Admission Fee',
          orderType: 'admission',
          status: 'void',
          amountDue: 500,
          amountPaid: 0,
          outstandingAmount: 500,
          voidReason: 'Incorrect plan amount replaced by official bill',
          student: { userId: 'student-1', fullName: 'Student Alpha', email: 'alpha@example.com' },
          schoolClass: { id: 'class-1', title: 'Class One Core' },
          academicYear: { id: 'year-1', title: '1406' },
          course: { id: 'course-1', title: 'Class One' }
        }
      ],
      receipts: [
        {
          _id: 'receipt-1',
          student: { _id: 'student-1', name: 'Student Alpha', email: 'alpha@example.com' },
          course: { _id: 'course-1', title: 'Class One' },
          bill: { _id: 'bill-1', billNumber: 'BL-202603-0001', amountDue: 1000, amountPaid: 0, status: 'new' },
          amount: 400,
          paymentMethod: 'bank_transfer',
          referenceNo: 'TX-400',
          paidAt: '2026-03-06T00:00:00.000Z',
          fileUrl: 'uploads/finance-receipts/receipt-1.pdf',
          note: 'رسید بانک',
          status: 'pending',
          approvalStage: 'finance_manager_review',
          approvalTrail: [
            {
              level: 'finance_manager',
              action: 'approve',
              by: { _id: 'admin-9', name: 'Operator', adminLevel: 'finance_manager' },
              at: '2026-03-05T00:00:00.000Z',
              note: 'بررسی اولیه',
              reason: ''
            }
          ]
        },
        {
          _id: 'receipt-2',
          student: { _id: 'student-2', name: 'Student Beta', email: 'beta@example.com' },
          course: { _id: 'course-1', title: 'Class One' },
          bill: { _id: 'bill-2', billNumber: 'BL-202603-0002', amountDue: 800, amountPaid: 200, status: 'partial' },
          amount: 200,
          paymentMethod: 'cash',
          referenceNo: '',
          paidAt: '2026-03-07T00:00:00.000Z',
          fileUrl: 'uploads/finance-receipts/receipt-2.pdf',
          note: '',
          status: 'approved',
          approvalStage: 'completed',
          approvalTrail: []
        }
      ],
      canonicalPayments: [
        {
          id: 'payment-canonical-1',
          paymentNumber: 'PAY-CANON-1',
          source: 'manual',
          sourceReceiptId: '',
          amount: 350,
          currency: 'AFN',
          paymentMethod: 'bank_transfer',
          referenceNo: 'TX-CAN-1',
          status: 'pending',
          approvalStage: 'general_president_review',
          paidAt: '2026-03-08T00:00:00.000Z',
          fileUrl: 'uploads/finance-receipts/canonical-1.pdf',
          note: 'Parent transfer slip',
          receivedBy: null,
          student: {
            userId: 'student-2',
            fullName: 'Student Beta',
            email: 'beta@example.com'
          },
          schoolClass: {
            id: 'class-2',
            title: 'Class Two Core'
          },
          academicYear: {
            id: 'year-1',
            title: '1406'
          },
          feeOrder: {
            id: 'order-4',
            sourceBillId: '',
            orderNumber: 'FO-9001',
            title: 'Admission Fee',
            amountDue: 350,
            amountPaid: 0,
            status: 'new'
          },
          followUp: {
            assignedLevel: 'general_president',
            status: 'escalated',
            note: 'Awaiting branch confirmation',
            history: [
              {
                assignedLevel: 'finance_lead',
                status: 'in_progress',
                note: 'Initial bank review completed',
                updatedBy: { id: 'admin-7', name: 'Finance Lead' },
                updatedAt: '2026-03-08T08:30:00.000Z'
              }
            ]
          },
          receiptDetails: {
            title: 'Admission Fee',
            paymentNumber: 'PAY-CANON-1',
            orderNumber: 'FO-9001',
            academicYearTitle: '1406',
            currency: 'AFN',
            allocations: [
              {
                feeOrderId: 'order-4',
                title: 'Admission Fee',
                orderNumber: 'FO-9001',
                amount: 350,
                outstandingAmount: 350
              }
            ],
            remainingBeforePayment: 350,
            remainingAfterPayment: 0
          }
        },
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `payment-history-${index + 1}`,
          paymentNumber: `PAY-HISTORY-${index + 1}`,
          source: 'gateway',
          sourceReceiptId: '',
          amount: 100 + index,
          currency: 'AFN',
          paymentMethod: 'online_gateway',
          referenceNo: `GW-${index + 1}`,
          status: index % 2 === 0 ? 'approved' : 'rejected',
          approvalStage: index % 2 === 0 ? 'completed' : 'rejected',
          paidAt: `2026-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
          fileUrl: '',
          note: 'Historical payment',
          receivedBy: null,
          student: {
            userId: `history-student-${index + 1}`,
            fullName: `Historical Student ${index + 1}`,
            email: `history-${index + 1}@example.com`
          },
          schoolClass: {
            id: 'class-1',
            title: 'Class One Core'
          },
          academicYear: {
            id: 'year-2',
            title: '1405'
          },
          feeOrder: {
            id: `history-order-${index + 1}`,
            sourceBillId: '',
            orderNumber: `HISTORY-${index + 1}`,
            title: 'Historical fee',
            amountDue: 100 + index,
            amountPaid: 100 + index,
            status: 'paid'
          },
          receiptDetails: {
            title: 'Historical fee',
            paymentNumber: `PAY-HISTORY-${index + 1}`,
            orderNumber: `HISTORY-${index + 1}`,
            academicYearTitle: '1405',
            currency: 'AFN',
            allocations: []
          }
        }))
      ]
    };

    const auditTimelineItems = [
      {
        id: 'audit-order-1',
        kind: 'order',
        severity: 'critical',
        title: 'Overdue tuition order',
        description: 'Student Alpha still has an overdue tuition balance',
        at: '2026-03-09T10:00:00.000Z',
        actorName: 'Finance System',
        studentName: 'Student Alpha',
        classTitle: 'Class One Core',
        academicYearTitle: '1406',
        referenceNumber: 'BL-202603-0001',
        secondaryReference: '',
        amountLabel: '1,000 AFN',
        status: 'overdue',
        sourceLabel: 'Fee Order',
        note: 'Follow up with guardian this week',
        reason: '',
        tags: ['overdue', 'tuition'],
        actionRequired: true,
        attachment: { hasFile: false, fileUrl: '' },
        jumpSection: 'orders'
      },
      {
        id: 'audit-payment-1',
        kind: 'payment',
        severity: 'warning',
        title: 'Guardian receipt submitted',
        description: 'Parent transfer is pending final review',
        at: '2026-03-08T12:00:00.000Z',
        actorName: 'Parent Portal',
        studentName: 'Student Beta',
        classTitle: 'Class Two Core',
        academicYearTitle: '1406',
        referenceNumber: 'PAY-CANON-1',
        secondaryReference: 'FO-9001',
        amountLabel: '350 AFN',
        status: 'pending',
        sourceLabel: 'Guardian Upload',
        note: 'Awaiting branch confirmation',
        reason: '',
        tags: ['pending', 'receipt'],
        actionRequired: true,
        attachment: { hasFile: true, fileUrl: 'uploads/finance-receipts/canonical-1.pdf' },
        jumpSection: 'payments'
      },
      {
        id: 'audit-system-1',
        kind: 'system',
        severity: 'info',
        title: 'Reminder sweep completed',
        description: '3 notifications were sent to families',
        at: '2026-03-07T09:30:00.000Z',
        actorName: 'Finance Automation',
        studentName: '',
        classTitle: '',
        academicYearTitle: '',
        referenceNumber: 'REM-20260307',
        secondaryReference: '',
        amountLabel: '',
        status: 'completed',
        sourceLabel: 'Automation',
        note: '',
        reason: '',
        tags: ['reminders'],
        actionRequired: false,
        attachment: { hasFile: false, fileUrl: '' },
        jumpSection: 'settings'
      }
    ];

    const anomalyState = {
      items: [
        {
          id: 'anomaly-1',
          anomalyType: 'long_overdue_balance',
          severity: 'critical',
          actionRequired: true,
          title: 'Long overdue tuition balance',
          description: 'Student Alpha has a tuition balance overdue for more than three months.',
          studentName: 'Student Alpha',
          classTitle: 'Class One Core',
          academicYearTitle: '1406',
          referenceNumber: 'BL-202603-0001',
          amountLabel: '1,000 AFN',
          workflowStatus: 'open',
          workflowAssignedLevel: '',
          workflowLatestNote: '',
          workflowHistory: []
        },
        {
          id: 'anomaly-2',
          anomalyType: 'relief_expiring',
          severity: 'warning',
          actionRequired: true,
          title: 'Relief expiring soon',
          description: 'Student Beta has a scholarship ending soon.',
          studentName: 'Student Beta',
          classTitle: 'Class Two Core',
          academicYearTitle: '1406',
          referenceNumber: 'REL-202603',
          amountLabel: '50%',
          workflowStatus: 'open',
          workflowAssignedLevel: '',
          workflowLatestNote: '',
          workflowHistory: []
        }
      ],
      auditEntries: []
    };

    const buildMonthCloseItem = (overrides = {}) => ({
      _id: 'month-close-1',
      monthKey: '2026-03',
      status: 'pending_review',
      approvalStage: 'finance_manager_review',
      note: 'Close pack ready',
      requestNote: 'Close pack ready',
      requestedBy: { _id: 'admin-1', name: 'Finance Manager' },
      approvedBy: null,
      rejectedBy: null,
      closedBy: null,
      reopenedBy: null,
      canApprove: true,
      canReject: true,
      canReopen: false,
      approvalTrail: [
        {
          level: 'finance_manager',
          action: 'submit',
          by: { _id: 'admin-1', name: 'Finance Manager' },
          at: '2026-03-27T08:00:00.000Z',
          note: 'Close pack ready',
          reason: ''
        }
      ],
      history: [
        {
          action: 'requested',
          by: { _id: 'admin-1', name: 'Finance Manager' },
          at: '2026-03-27T08:00:00.000Z',
          note: 'Close pack ready'
        }
      ],
      snapshot: {
        generatedAt: '2026-03-27T08:00:00.000Z',
        monthKey: '2026-03',
        totals: {
          ordersIssuedCount: 3,
          approvedPaymentAmount: 950,
          standingOutstandingAmount: 1600,
          activeReliefs: 2,
          fixedReliefAmount: 120,
          pendingPaymentCount: 1,
          pendingPaymentAmount: 350
        },
        aging: { totalRemaining: 1600 },
        readiness: {
          readyToApprove: false,
          blockingIssues: [
            { code: 'pending_payments', label: 'پرداخت‌های در انتظار تایید', count: 1, amount: 350 }
          ],
          warningIssues: [
            { code: 'standing_outstanding_balance', label: 'مانده ایستای پایان ماه', amount: 1600 }
          ]
        },
        anomalies: {
          summary: {
            critical: 1,
            byWorkflow: { open: 1, resolved: 1 }
          }
        },
        classes: [
          { classId: 'class-1', title: 'Class One Core', totalOutstanding: 1600 }
        ]
      },
      ...overrides
    });

    const monthCloseState = {
      items: []
    };

    const createArchiveItem = (overrides = {}) => ({
      _id: overrides._id || `archive-${Math.random().toString(16).slice(2, 8)}`,
      documentNo: overrides.documentNo || 'MCP-202603-001',
      documentType: overrides.documentType || 'month_close_pack',
      title: overrides.title || 'Finance month close 2026-03',
      subjectName: overrides.subjectName || 'Month close 2026-03',
      membershipLabel: overrides.membershipLabel || '',
      batchLabel: overrides.batchLabel || '',
      generatedAt: overrides.generatedAt || '2026-03-27T08:10:00.000Z',
      generatedBy: overrides.generatedBy || { _id: 'admin-1', name: 'Finance Manager' },
      filename: overrides.filename || 'finance-month-close-2026-03.pdf',
      status: overrides.status || 'active',
      sizeBytes: overrides.sizeBytes || 2048,
      sha256: overrides.sha256 || 'hash-month-close-2026-03',
      classTitle: overrides.classTitle || 'Class One Core',
      academicYearTitle: overrides.academicYearTitle || '1406',
      monthKey: overrides.monthKey || '2026-03',
      childDocuments: overrides.childDocuments || [],
      downloadCount: overrides.downloadCount || 1,
      verifyCount: overrides.verifyCount || 0,
      deliveryCount: overrides.deliveryCount || 0,
      lastDeliveredAt: overrides.lastDeliveredAt || null,
      lastDeliveryStatus: overrides.lastDeliveryStatus || '',
      deliveryLog: overrides.deliveryLog || [],
      lastDownloadedAt: overrides.lastDownloadedAt || '2026-03-27T08:10:00.000Z',
      lastVerifiedAt: overrides.lastVerifiedAt || null,
      verification: overrides.verification || {
        code: 'FV-MCP-ARCHIVE01',
        url: 'http://127.0.0.1:3000/api/finance/documents/verify/FV-MCP-ARCHIVE01'
      }
    });

    const documentArchiveState = {
      items: [
        createArchiveItem()
      ]
    };

    const serializeMonthClose = (item = {}) => {
      const approvalStage = String(item.approvalStage || '').trim() || 'draft';
      const status = String(item.status || '').trim() || 'draft';
      return {
        ...item,
        approvalStage,
        status,
        canApprove: status === 'pending_review' && approvalStage === 'finance_manager_review',
        canReject: status === 'pending_review' && approvalStage === 'finance_manager_review',
        canReopen: false
      };
    };

    const buildAnomalySummary = (items = []) => ({
      total: items.length,
      critical: items.filter((item) => item.severity === 'critical').length,
      warning: items.filter((item) => item.severity === 'warning').length,
      info: items.filter((item) => item.severity === 'info').length,
      actionRequired: items.filter((item) => item.actionRequired).length,
      byWorkflow: {
        open: items.filter((item) => item.workflowStatus === 'open').length,
        assigned: items.filter((item) => item.workflowStatus === 'assigned').length,
        snoozed: items.filter((item) => item.workflowStatus === 'snoozed').length,
        resolved: items.filter((item) => item.workflowStatus === 'resolved').length
      }
    });

    const pushAnomalyAuditEntry = (item, action, note = '') => {
      anomalyState.auditEntries.unshift({
        id: `audit-anomaly-${action}-${Date.now()}`,
        kind: 'system',
        severity: action === 'resolved' ? 'info' : action === 'snoozed' ? 'warning' : 'critical',
        title: action === 'resolved'
          ? 'Anomaly resolved'
          : action === 'snoozed'
            ? 'Anomaly snoozed'
            : action === 'noted'
              ? 'Anomaly note saved'
              : 'Anomaly assigned',
        description: `${item.title} - ${item.studentName}`,
        at: '2026-03-10T10:30:00.000Z',
        actorName: 'Finance Manager',
        studentName: item.studentName,
        classTitle: item.classTitle,
        academicYearTitle: item.academicYearTitle,
        referenceNumber: item.referenceNumber,
        secondaryReference: '',
        amountLabel: item.amountLabel,
        status: item.workflowStatus,
        sourceLabel: 'Anomaly Workflow',
        note,
        reason: '',
        tags: ['anomaly', action],
        actionRequired: item.workflowStatus !== 'resolved',
        attachment: { hasFile: false, fileUrl: '' },
        jumpSection: 'reports'
      });
    };

    const buildCanonicalPayments = () => [
      ...financeState.receipts.map((item) => ({
      id: `payment-${item._id}`,
      sourceReceiptId: item._id,
      amount: item.amount,
      currency: 'AFN',
      paymentMethod: item.paymentMethod,
      referenceNo: item.referenceNo,
      status: item.status,
      approvalStage: item.approvalStage,
      paidAt: item.paidAt,
      fileUrl: item.fileUrl,
      note: item.note,
      receivedBy: { id: 'admin-1', name: 'Finance Manager' },
      student: {
        fullName: item.student?.name || '',
        email: item.student?.email || ''
      },
      schoolClass: {
        id: item.bill?._id === 'bill-2' ? 'class-1' : 'class-1',
        title: 'Class One Core'
      },
      academicYear: {
        id: 'year-1',
        title: '1406'
      },
      feeOrder: {
        id: item.bill?._id === 'bill-2' ? 'order-2' : 'order-1',
        sourceBillId: item.bill?._id || '',
        orderNumber: item.bill?.billNumber || '',
        title: item.bill?.billNumber || '',
        amountDue: item.bill?.amountDue || 0,
        amountPaid: item.bill?.amountPaid || 0,
        status: item.bill?.status || ''
      },
      receipt: {
        id: item._id,
        amount: item.amount,
        paymentMethod: item.paymentMethod,
        referenceNo: item.referenceNo,
        paidAt: item.paidAt,
        fileUrl: item.fileUrl,
        note: item.note,
        status: item.status,
        approvalStage: item.approvalStage,
        approvalTrail: item.approvalTrail || []
      },
      receiptDetails: {
        title: item.bill?.billNumber || '',
        paymentNumber: `payment-${item._id}`,
        orderNumber: item.bill?.billNumber || '',
        academicYearTitle: '1406',
        currency: 'AFN',
        grossAmount: Number(item.bill?.amountDue || 0) + 100,
        discountAmount: 100,
        netAmount: Number(item.bill?.amountDue || 0),
        allocations: [
          {
            feeOrderId: item.bill?._id === 'bill-2' ? 'order-2' : 'order-1',
            title: item.bill?.billNumber || '',
            orderNumber: item.bill?.billNumber || '',
            amount: item.amount,
            grossAmount: Number(item.bill?.amountDue || 0) + 100,
            discountAmount: 100,
            netAmount: Number(item.bill?.amountDue || 0),
            outstandingAmount: Math.max(0, Number(item.bill?.amountDue || 0) - Number(item.bill?.amountPaid || 0))
          }
        ],
        remainingBeforePayment: Math.max(0, Number(item.bill?.amountDue || 0) - Number(item.bill?.amountPaid || 0)),
        remainingAfterPayment: Math.max(0, Number(item.bill?.amountDue || 0) - Number(item.bill?.amountPaid || 0) - Number(item.amount || 0)),
        currentOutstandingAmount: Math.max(0, Number(item.bill?.amountDue || 0) - Number(item.bill?.amountPaid || 0))
      }
    })),
      ...financeState.canonicalPayments
    ];

    const buildDailyCashierReport = () => ({
      success: true,
      date: '2026-03-07',
      summary: {
        totalPayments: financeState.receipts.length,
        totalCollected: financeState.receipts.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        approvedPayments: 0,
        pendingPayments: financeState.receipts.length,
        rejectedPayments: 0,
        approvedAmount: 0,
        pendingAmount: financeState.receipts.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        rejectedAmount: 0
      },
      methodTotals: [
        {
          method: 'bank_transfer',
          amount: 400,
          count: 1
        },
        {
          method: 'cash',
          amount: 200,
          count: 1
        }
      ],
      cashiers: [
        {
          id: 'admin-1',
          name: 'Finance Manager',
          amount: 600,
          count: 2
        }
      ],
      items: buildCanonicalPayments()
    });

    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
      localStorage.setItem('adminLevel', session.adminLevel);
      localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
      window.__printCalls = 0;
      window.print = () => {
        window.__printCalls += 1;
      };
    }, adminSession);

    await page.route('**/api/finance/admin/reference-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          students: [
            { _id: 'student-1', name: 'Student Alpha' },
            { _id: 'student-2', name: 'Student Beta' }
          ],
          classes: [
            { classId: 'class-1', courseId: 'course-1', title: 'Class One Core', uiLabel: 'Class One Core (10-A)' },
            { classId: 'class-2', courseId: 'course-2', title: 'Class Two Core', uiLabel: 'Class Two Core (11-B)' }
          ],
          academicYears: [
            { _id: 'year-1', id: 'year-1', title: '1406', code: '1406', isCurrent: true, isActive: true },
            { _id: 'year-2', id: 'year-2', title: '1405', code: '1405', isCurrent: false, isActive: false }
          ],
          currentAcademicYearId: 'year-1'
        })
      });
    });

    await page.route('**/api/finance/admin/summary', async (route) => {
      const inboxItems = buildCanonicalPayments();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          summary: {
            pendingReceipts: inboxItems.filter((item) => item.status === 'pending').length,
            overdueBills: 1,
            todayCollection: 0,
            monthCollection: 1200,
            collectionRate: 68,
            receiptWorkflow: {
              financeManager: 1,
              financeLead: 1,
              generalPresident: 1
            }
          },
          topDebtors: [{ studentId: 'student-1', name: 'Student Alpha', amount: 600 }]
        })
      });
    });

    await page.route('**/api/student-finance/orders', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: financeState.orders
        })
      });
    });

    await page.route('**/api/student-finance/payments?*', async (route) => {
      paymentsListUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: buildCanonicalPayments()
        })
      });
    });

    await page.route('**/api/student-finance/payments/*/receipt', async (route) => {
      const paymentId = route.request().url().split('/').slice(-2)[0];
      const item = buildCanonicalPayments().find((entry) => entry.id === paymentId) || buildCanonicalPayments()[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          membership: {
            id: 'mem-1',
            student: {
              fullName: item?.student?.fullName || item?.student?.name || 'Student Alpha',
              fatherName: 'Mohammad Karim',
              asasNumber: 'ASAS-1406-001'
            },
            schoolClass: { title: item?.schoolClass?.title || 'Class One Core' },
            academicYear: { title: item?.receiptDetails?.academicYearTitle || '1406' }
          },
          receipt: {
            ...(item?.receiptDetails || {}),
            fatherName: 'Mohammad Karim',
            asasNumber: 'ASAS-1406-001'
          },
          item: {
            ...item,
            receiptDetails: {
              ...(item?.receiptDetails || {}),
              fatherName: 'Mohammad Karim',
              asasNumber: 'ASAS-1406-001'
            }
          },
          generatedAt: '2026-03-07T09:00:00.000Z'
        })
      });
    });

    await page.route('**/api/student-finance/reports/daily-cashier?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildDailyCashierReport())
      });
    });

    await page.route('**/api/student-finance/payments/preview-allocation', async (route) => {
      previewAllocationCalls += 1;
      const body = route.request().postDataJSON();
      const candidateOrders = financeState.orders.filter((item) => (
        item.student?.userId === body.student
        && item.schoolClass?.id === body.classId
        && item.academicYear?.id === body.academicYearId
        && Number(item.outstandingAmount || 0) > 0
      ));
      const allocations = Array.isArray(body.allocations)
        ? body.allocations
          .map((entry) => {
            const order = candidateOrders.find((item) => item.id === entry.feeOrderId);
            return order ? {
              feeOrderId: order.id,
              amount: Number(entry.amount || 0),
              title: order.title,
              orderNumber: order.orderNumber
            } : null;
          })
          .filter((item) => item && item.amount > 0)
        : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          membership: {
            id: 'mem-1',
            student: { fullName: body.student === 'student-1' ? 'Student Alpha' : 'Student Beta' },
            schoolClass: { title: 'Class One Core' },
            academicYear: { title: '1406' }
          },
          totalOutstanding: candidateOrders.reduce((sum, item) => sum + Number(item.outstandingAmount || 0), 0),
          totalAllocated: allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0),
          remainingAmount: Number(body.amount || 0) - allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0),
          openOrders: candidateOrders,
          allocations
        })
      });
    });

    await page.route('**/api/student-finance/payments', async (route) => {
      createPaymentCalls += 1;
      lastCreatedPaymentBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item: { id: 'payment-new' },
          message: 'پرداخت ثبت شد'
        })
      });
    });

    await page.route('**/api/finance/admin/bills', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            { _id: 'bill-1', billNumber: 'BL-202603-0001', student: { name: 'Student Alpha' }, classId: { _id: 'class-1', title: 'Class One Core' }, course: { title: 'Class One' }, status: 'new', amountDue: 1000, amountPaid: 0 },
            { _id: 'bill-2', billNumber: 'BL-202603-0002', student: { name: 'Student Beta' }, classId: { _id: 'class-1', title: 'Class One Core' }, course: { title: 'Class One' }, status: 'partial', amountDue: 800, amountPaid: 200 }
          ]
        })
      });
    });

    await page.route('**/api/finance/admin/receipts?status=pending', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: financeState.receipts })
      });
    });

    await page.route('**/api/finance/admin/fee-plans', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/finance/admin/document-archive?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: documentArchiveState.items })
      });
    });

    await page.route('**/api/finance/admin/document-archive/*/deliver', async (route) => {
      const url = new URL(route.request().url());
      const archiveId = url.pathname.split('/').slice(-2, -1)[0];
      const body = route.request().postDataJSON();
      const archiveItem = documentArchiveState.items.find((entry) => String(entry._id || '') === String(archiveId || '')) || null;
      if (!archiveItem) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Not found' })
        });
        return;
      }
      const nextStatus = Number(archiveItem.deliveryCount || 0) > 0 ? 'resent' : 'sent';
      const deliveryChannel = String(body?.channel || 'email');
      const provider = deliveryChannel === 'sms'
        ? 'mock_sms_gateway'
        : deliveryChannel === 'whatsapp'
          ? 'mock_whatsapp_gateway'
          : deliveryChannel === 'portal'
            ? 'portal_notification'
            : 'smtp';
      const providerMessageId = deliveryChannel === 'portal'
        ? ''
        : `${provider}-${archiveId}-001`;
      const providerStatus = deliveryChannel === 'portal'
        ? 'delivered'
        : deliveryChannel === 'email'
          ? 'sent'
          : 'accepted';
      archiveItem.deliveryCount = Number(archiveItem.deliveryCount || 0) + 1;
      archiveItem.lastDeliveredAt = '2026-03-28T10:10:00.000Z';
      archiveItem.lastDeliveryStatus = nextStatus;
      archiveItem.deliveryLog = Array.isArray(archiveItem.deliveryLog) ? archiveItem.deliveryLog : [];
      const recipientHandles = String(body?.recipientHandles || body?.emails || '')
        .split(/[\n,;,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      archiveItem.deliveryLog.push({
        channel: deliveryChannel,
        status: nextStatus,
        recipient: recipientHandles.join(', '),
        recipientCount: recipientHandles.length,
        linkedAudienceNotified: body?.includeLinkedAudience !== false,
        subject: String(body?.subject || ''),
        provider,
        providerMessageId,
        providerStatus,
        note: String(body?.note || ''),
        errorMessage: '',
        failureCode: '',
        retryable: false,
        nextRetryAt: null,
        sentAt: '2026-03-28T10:10:00.000Z',
        sentBy: { _id: 'admin-1', name: 'Finance Manager' }
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item: archiveItem,
          message: 'سند مالی برای ارسال ثبت شد.'
        })
      });
    });

    await page.route('**/api/finance/documents/verify/*', async (route) => {
      const url = new URL(route.request().url());
      const verificationCode = decodeURIComponent(url.pathname.split('/').pop() || '');
      const item = documentArchiveState.items.find((entry) => String(entry?.verification?.code || '') === verificationCode) || null;
      if (item) {
        item.verifyCount = Number(item.verifyCount || 0) + 1;
        item.lastVerifiedAt = '2026-03-28T09:45:00.000Z';
      }
      await route.fulfill({
        status: item ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(item ? { success: true, item } : { success: false, message: 'Not found' })
      });
    });

    await page.route('**/api/finance/admin/documents/batch-statements.zip', async (route) => {
      documentBatchExportCalls += 1;
      lastDocumentBatchUrl = route.request().url();
      const body = route.request().postDataJSON();
      const monthValue = String(body?.monthKey || '2026-03');
      const batchItem = createArchiveItem({
        _id: `archive-batch-${documentBatchExportCalls}`,
        documentNo: `BSP-${monthValue.replace('-', '')}-${documentBatchExportCalls}`,
        documentType: 'batch_statement_pack',
        title: 'Finance batch statement pack',
        subjectName: 'Class One Core',
        batchLabel: `Class One Core | 1406 | ${monthValue}`,
        filename: `finance-batch-statements-${monthValue}-Class-One-Core.zip`,
        verification: {
          code: `FV-BSP-${documentBatchExportCalls}`,
          url: `http://127.0.0.1:3000/api/finance/documents/verify/FV-BSP-${documentBatchExportCalls}`
        },
        childDocuments: [
          { documentNo: `SFP-${monthValue.replace('-', '')}-001`, verificationCode: 'FV-SFP-001', documentType: 'student_statement', filename: 'student-finance-statement-mem-1.pdf', studentMembershipId: 'mem-1', subjectName: 'Student Alpha' },
          { documentNo: `SFP-${monthValue.replace('-', '')}-002`, verificationCode: 'FV-SFP-002', documentType: 'student_statement', filename: 'student-finance-statement-mem-2.pdf', studentMembershipId: 'mem-2', subjectName: 'Student Beta' }
        ]
      });
      documentArchiveState.items = [batchItem, ...documentArchiveState.items];
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="${batchItem.filename}"`,
          'x-finance-document-no': batchItem.documentNo,
          'x-finance-verification-code': batchItem.verification.code
        },
        body: 'PKMOCKZIP'
      });
    });

    await page.route('**/api/finance/admin/month-close', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const monthKey = String(body?.monthKey || '2026-03');
        const note = String(body?.note || 'Close pack ready');
        const nextItem = serializeMonthClose(buildMonthCloseItem({
          _id: `month-close-${monthKey}`,
          monthKey,
          note,
          requestNote: note
        }));
        monthCloseState.items = [nextItem];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            item: nextItem,
            message: 'درخواست بستن ماه مالی ثبت شد.'
          })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: monthCloseState.items.map((item) => serializeMonthClose(item)) })
      });
    });

    await page.route('**/api/finance/admin/month-close/*/approve', async (route) => {
      const url = new URL(route.request().url());
      const monthCloseId = url.pathname.split('/').slice(-2, -1)[0];
      monthCloseState.items = monthCloseState.items.map((item) => (
        item._id === monthCloseId
          ? serializeMonthClose({
              ...item,
              approvalStage: 'finance_lead_review',
              approvalTrail: [
                ...(Array.isArray(item.approvalTrail) ? item.approvalTrail : []),
                {
                  level: 'finance_manager',
                  action: 'approve',
                  by: { _id: 'admin-1', name: 'Finance Manager' },
                  at: '2026-03-27T08:10:00.000Z',
                  note: 'Manager approved the package',
                  reason: ''
                }
              ],
              history: [
                ...(Array.isArray(item.history) ? item.history : []),
                {
                  action: 'approved',
                  by: { _id: 'admin-1', name: 'Finance Manager' },
                  at: '2026-03-27T08:10:00.000Z',
                  note: 'Manager approved the package'
                }
              ]
            })
          : item
      ));
      const updated = monthCloseState.items.find((item) => item._id === monthCloseId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item: updated,
          message: 'درخواست بستن ماه مالی برای آمریت مالی ارسال شد.'
        })
      });
    });

    await page.route('**/api/finance/admin/month-close/*/reject', async (route) => {
      const url = new URL(route.request().url());
      const monthCloseId = url.pathname.split('/').slice(-2, -1)[0];
      const body = route.request().postDataJSON();
      monthCloseState.items = monthCloseState.items.map((item) => (
        item._id === monthCloseId
          ? serializeMonthClose({
              ...item,
              status: 'rejected',
              approvalStage: 'rejected',
              rejectReason: String(body?.reason || ''),
              canApprove: false,
              canReject: false
            })
          : item
      ));
      const updated = monthCloseState.items.find((item) => item._id === monthCloseId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item: updated,
          message: 'درخواست بستن ماه مالی رد شد'
        })
      });
    });

    await page.route('**/api/finance/admin/month-close/*/export.csv', async (route) => {
      monthCloseExportCalls += 1;
      lastMonthCloseExportUrl = route.request().url();
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="finance-month-close-2026-03.csv"'
        },
        body: 'MonthKey,Status\n2026-03,pending_review'
      });
    });

    await page.route('**/api/finance/admin/month-close/*/export.pdf', async (route) => {
      monthClosePdfExportCalls += 1;
      lastMonthClosePdfUrl = route.request().url();
      const nextItem = createArchiveItem({
        _id: `archive-month-close-${monthClosePdfExportCalls}`,
        documentNo: `MCP-202603-${monthClosePdfExportCalls}`,
        documentType: 'month_close_pack',
        title: 'Finance month close 2026-03',
        subjectName: 'Month close 2026-03',
        filename: 'finance-month-close-2026-03.pdf',
        verification: {
          code: `FV-MCP-${monthClosePdfExportCalls}`,
          url: `http://127.0.0.1:3000/api/finance/documents/verify/FV-MCP-${monthClosePdfExportCalls}`
        }
      });
      documentArchiveState.items = [nextItem, ...documentArchiveState.items];
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="finance-month-close-2026-03.pdf"',
          'x-finance-document-no': nextItem.documentNo,
          'x-finance-verification-code': nextItem.verification.code
        },
        body: '%PDF-1.7 mock month close pdf'
      });
    });

    await page.route('**/api/finance/admin/month-close/*', async (route) => {
      const url = new URL(route.request().url());
      const monthCloseId = url.pathname.split('/').pop();
      const item = monthCloseState.items.find((entry) => entry._id === monthCloseId) || null;
      await route.fulfill({
        status: item ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(item ? { success: true, item } : { success: false, message: 'Not found' })
      });
    });

    await page.route('**/api/finance/admin/reports/aging*', async (route) => {
      const url = new URL(route.request().url());
      const classId = url.searchParams.get('classId') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          classId === 'class-1'
            ? {
                success: true,
                buckets: { current: 120, d1_30: 60, d31_60: 0, d61_plus: 0 },
                totalRemaining: 180,
                rows: [
                  { classId: 'class-1', remaining: 120, lateDays: 0 },
                  { classId: 'class-1', remaining: 60, lateDays: 12 }
                ]
              }
            : {
                success: true,
                buckets: { current: 200, d1_30: 100, d31_60: 0, d61_plus: 0 },
                totalRemaining: 300,
                rows: [
                  { classId: 'class-1', remaining: 120, lateDays: 0 },
                  { classId: 'class-1', remaining: 60, lateDays: 12 },
                  { classId: 'class-2', remaining: 80, lateDays: 0 },
                  { classId: 'class-2', remaining: 40, lateDays: 10 }
                ]
              }
        )
      });
    });

    await page.route('**/api/finance/admin/reports/cashflow*', async (route) => {
      const url = new URL(route.request().url());
      const classId = url.searchParams.get('classId') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: classId === 'class-1'
            ? [{ date: '2026-03-06', total: 180 }]
            : [{ date: '2026-03-06', total: 400 }, { date: '2026-03-07', total: 220 }]
        })
      });
    });

    await page.route('**/api/finance/admin/reports/by-class*', async (route) => {
      const url = new URL(route.request().url());
      const classId = url.searchParams.get('classId') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: classId === 'class-1'
            ? [{ classId: 'class-1', schoolClass: { _id: 'class-1', title: 'Class One Core' }, courseId: 'course-1', course: 'Class One', paid: 400, due: 1800 }]
            : [
                { classId: 'class-1', schoolClass: { _id: 'class-1', title: 'Class One Core' }, courseId: 'course-1', course: 'Class One', paid: 400, due: 1800 },
                { classId: 'class-2', schoolClass: { _id: 'class-2', title: 'Class Two Core' }, courseId: 'course-2', course: 'Class Two', paid: 220, due: 900 }
              ]
        })
      });
    });

    await page.route('**/api/finance/admin/reports/discounts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/finance/admin/reports/audit-timeline*', async (route) => {
      const url = new URL(route.request().url());
      const classId = url.searchParams.get('classId') || '';
      const kind = url.searchParams.get('kind') || 'all';
      const severity = url.searchParams.get('severity') || 'all';
      const search = (url.searchParams.get('q') || '').toLowerCase();
      const sourceItems = [...anomalyState.auditEntries, ...auditTimelineItems];
      const items = sourceItems.filter((item) => {
        if (classId === 'class-1' && item.classTitle && item.classTitle !== 'Class One Core') return false;
        if (kind !== 'all' && item.kind !== kind) return false;
        if (severity !== 'all' && item.severity !== severity) return false;
        if (search) {
          const haystack = [
            item.title,
            item.description,
            item.studentName,
            item.classTitle,
            item.referenceNumber,
            item.note
          ].join(' ').toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items,
          summary: {
            total: items.length,
            actionRequired: items.filter((item) => item.actionRequired).length,
            byKind: {
              order: items.filter((item) => item.kind === 'order').length,
              payment: items.filter((item) => item.kind === 'payment').length,
              relief: items.filter((item) => item.kind === 'relief').length,
              system: items.filter((item) => item.kind === 'system').length
            },
            bySeverity: {
              info: items.filter((item) => item.severity === 'info').length,
              warning: items.filter((item) => item.severity === 'warning').length,
              critical: items.filter((item) => item.severity === 'critical').length
            }
          }
        })
      });
    });

    await page.route('**/api/finance/admin/reports/anomalies*', async (route) => {
      const url = new URL(route.request().url());
      const classId = url.searchParams.get('classId') || '';
      const items = anomalyState.items.filter((item) => {
        if (classId === 'class-1') return item.classTitle === 'Class One Core';
        if (classId === 'class-2') return item.classTitle === 'Class Two Core';
        return true;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items,
          summary: buildAnomalySummary(items)
        })
      });
    });

    await page.route('**/api/finance/admin/anomalies/*/assign', async (route) => {
      const anomalyId = route.request().url().split('/').slice(-2)[0];
      const body = route.request().postDataJSON();
      anomalyState.items = anomalyState.items.map((item) => (
        item.id === anomalyId
          ? {
              ...item,
              workflowStatus: 'assigned',
              workflowAssignedLevel: body.assignedLevel || 'finance_lead',
              workflowLatestNote: body.note || '',
              workflowLastActionAt: '2026-03-10T10:30:00.000Z',
              workflowLastActionByName: 'Finance Manager',
              workflowHistory: [
                {
                  status: 'assigned',
                  note: body.note || '',
                  assignedLevel: body.assignedLevel || 'finance_lead',
                  byName: 'Finance Manager',
                  at: '2026-03-10T10:30:00.000Z'
                },
                ...(item.workflowHistory || [])
              ]
            }
          : item
      ));
      const updated = anomalyState.items.find((item) => item.id === anomalyId);
      pushAnomalyAuditEntry(updated, 'assigned', body.note || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: updated, message: 'Anomaly assigned' })
      });
    });

    await page.route('**/api/finance/admin/anomalies/*/snooze', async (route) => {
      const anomalyId = route.request().url().split('/').slice(-2)[0];
      const body = route.request().postDataJSON();
      anomalyState.items = anomalyState.items.map((item) => (
        item.id === anomalyId
          ? {
              ...item,
              workflowStatus: 'snoozed',
              workflowLatestNote: body.note || '',
              workflowSnoozedUntil: body.snoozedUntil,
              workflowLastActionAt: '2026-03-11T08:00:00.000Z',
              workflowLastActionByName: 'Finance Manager',
              actionRequired: false,
              workflowHistory: [
                {
                  status: 'snoozed',
                  note: body.note || '',
                  assignedLevel: item.workflowAssignedLevel || 'finance_lead',
                  byName: 'Finance Manager',
                  at: '2026-03-11T08:00:00.000Z'
                },
                ...(item.workflowHistory || [])
              ]
            }
          : item
      ));
      const updated = anomalyState.items.find((item) => item.id === anomalyId);
      pushAnomalyAuditEntry(updated, 'snoozed', body.note || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: updated, message: 'Anomaly snoozed' })
      });
    });

    await page.route('**/api/finance/admin/anomalies/*/resolve', async (route) => {
      const anomalyId = route.request().url().split('/').slice(-2)[0];
      const body = route.request().postDataJSON();
      anomalyState.items = anomalyState.items.map((item) => (
        item.id === anomalyId
          ? {
              ...item,
              workflowStatus: 'resolved',
              workflowLatestNote: body.note || '',
              workflowResolvedByName: 'Finance Manager',
              workflowLastActionAt: '2026-03-12T09:15:00.000Z',
              workflowLastActionByName: 'Finance Manager',
              actionRequired: false,
              workflowHistory: [
                {
                  status: 'resolved',
                  note: body.note || '',
                  assignedLevel: item.workflowAssignedLevel || 'finance_lead',
                  byName: 'Finance Manager',
                  at: '2026-03-12T09:15:00.000Z'
                },
                ...(item.workflowHistory || [])
              ]
            }
          : item
      ));
      const updated = anomalyState.items.find((item) => item.id === anomalyId);
      pushAnomalyAuditEntry(updated, 'resolved', body.note || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: updated, message: 'Anomaly resolved' })
      });
    });

    await page.route('**/api/finance/admin/anomalies/*/note', async (route) => {
      const anomalyId = route.request().url().split('/').slice(-2)[0];
      const body = route.request().postDataJSON();
      anomalyState.items = anomalyState.items.map((item) => (
        item.id === anomalyId
          ? {
              ...item,
              workflowLatestNote: body.note || '',
              workflowLastActionAt: '2026-03-10T11:45:00.000Z',
              workflowLastActionByName: 'Finance Manager',
              workflowHistory: [
                {
                  status: item.workflowStatus || 'open',
                  note: body.note || '',
                  assignedLevel: item.workflowAssignedLevel || '',
                  byName: 'Finance Manager',
                  at: '2026-03-10T11:45:00.000Z'
                },
                ...(item.workflowHistory || [])
              ]
            }
          : item
      ));
      const updated = anomalyState.items.find((item) => item.id === anomalyId);
      pushAnomalyAuditEntry(updated, 'noted', body.note || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: updated, message: 'Anomaly note saved' })
      });
    });

    await page.route('**/api/student-finance/discounts?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: registryState.discounts })
      });
    });

    await page.route('**/api/student-finance/reliefs?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: registryState.reliefs })
      });
    });

    await page.route('**/api/student-finance/discounts', async (route) => {
      const body = route.request().postDataJSON();
      registryState.discounts = [
        {
          id: 'dis-new',
          discountType: body.discountType,
          amount: Number(body.amount || 0),
          reason: body.reason || '',
          status: 'active',
          student: {
            userId: body.student,
            fullName: body.student === 'student-2' ? 'Student Beta' : 'Student Alpha'
          },
          schoolClass: {
            id: body.classId,
            title: body.classId === 'class-2' ? 'Class Two Core' : 'Class One Core'
          },
          academicYear: { id: body.academicYearId, title: '1406' }
        },
        ...registryState.discounts
      ];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: registryState.discounts[0], message: 'Discount saved' })
      });
    });

    await page.route('**/api/student-finance/discounts/*/cancel', async (route) => {
      const discountId = route.request().url().split('/').slice(-2)[0];
      registryState.discounts = registryState.discounts.filter((item) => item.id !== discountId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: { id: discountId }, message: 'Discount cancelled' })
      });
    });

    await page.route('**/api/student-finance/exemptions?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: registryState.exemptions })
      });
    });

    await page.route('**/api/student-finance/exemptions', async (route) => {
      const body = route.request().postDataJSON();
      registryState.exemptions = [
        {
          id: 'ex-new',
          exemptionType: body.exemptionType,
          scope: body.scope,
          amount: Number(body.amount || 0),
          percentage: body.exemptionType === 'partial' ? Number(body.percentage || 0) : 100,
          reason: body.reason || '',
          status: 'active',
          student: {
            userId: body.student,
            fullName: body.student === 'student-2' ? 'Student Beta' : 'Student Alpha'
          },
          schoolClass: {
            id: body.classId,
            title: body.classId === 'class-2' ? 'Class Two Core' : 'Class One Core'
          },
          academicYear: { id: body.academicYearId, title: '1406' }
        },
        ...registryState.exemptions
      ];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: registryState.exemptions[0], message: 'Exemption saved' })
      });
    });

    await page.route('**/api/student-finance/exemptions/*/cancel', async (route) => {
      const exemptionId = route.request().url().split('/').slice(-2)[0];
      registryState.exemptions = registryState.exemptions.filter((item) => item.id !== exemptionId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: { id: exemptionId }, message: 'Exemption cancelled' })
      });
    });

    await page.route('**/api/student-finance/payments/payment-receipt-1/approve', async (route) => {
      approveCalls += 1;
      financeState.receipts = financeState.receipts.map((item) => (
        item._id === 'receipt-1'
          ? { ...item, status: 'approved', approvalStage: 'completed' }
          : item
      ));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'رسید تایید نهایی شد',
          nextStage: 'completed',
          requiresFinalApproval: false
        })
      });
    });

    await page.route('**/api/student-finance/payments/*/follow-up', async (route) => {
      followUpCalls += 1;
      const paymentId = route.request().url().split('/').slice(-2)[0];
      const body = route.request().postDataJSON();
      financeState.canonicalPayments = financeState.canonicalPayments.map((item) => (
        item.id === paymentId
          ? {
              ...item,
              followUp: {
                assignedLevel: body.assignedLevel,
                status: body.status,
                note: body.note,
                history: [
                  ...(Array.isArray(item.followUp?.history) ? item.followUp.history : []),
                  {
                    assignedLevel: body.assignedLevel,
                    status: body.status,
                    note: body.note,
                    updatedBy: { id: 'admin-1', name: 'Finance Manager' },
                    updatedAt: '2026-03-08T10:00:00.000Z'
                  }
                ]
              }
            }
          : item
      ));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          followUp: financeState.canonicalPayments.find((item) => item.id === paymentId)?.followUp || null,
          message: 'پیگیری پرداخت به‌روزرسانی شد'
        })
      });
    });

    await page.route('**/api/finance/admin/reminders/run', async (route) => {
      reminderCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'یادآوری‌ها ارسال شد' })
      });
    });

    await page.route('**/api/finance/admin/reports/export.csv*', async (route) => {
      exportCalls += 1;
      lastExportUrl = route.request().url();
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="finance-report.csv"'
        },
        body: 'BillNumber,Student\nBL-202603-0001,Student Alpha'
      });
    });

    await page.route('**/api/finance/admin/reports/audit-package.csv*', async (route) => {
      auditExportCalls += 1;
      lastAuditExportUrl = route.request().url();
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="finance-audit-package.csv"'
        },
        body: 'At,Kind,Title\n2026-03-09T10:00:00.000Z,order,Overdue tuition order'
      });
    });

    await page.goto('/admin-finance', { waitUntil: 'domcontentloaded' });

    const financeTabs = page.locator('.finance-shell-tab');
    const anomalyCenter = page.getByTestId('finance-anomalies-card');
    await expect(anomalyCenter).toBeHidden();
    await expect(page.getByTestId('income-trend-card')).toBeVisible();
    await page.getByTestId('income-trend-card').locator('button').nth(2).click();
    await expect(page.getByTestId('paid-vs-due-card')).toBeVisible();

    await financeTabs.nth(2).click();
    const ordersCard = page.getByTestId('finance-orders-table-card');
    await expect(page.getByTestId('bill-record-summary')).toContainText(/3|۳/);
    await expect(page.getByTestId('bill-record-summary')).toContainText('بل رسمی');
    await expect(page.getByTestId('bill-record-summary')).toContainText(/1|۱/);
    await expect(page.getByTestId('bill-record-summary')).toContainText('بل باطل');
    await expect(ordersCard.locator('.finance-orders-table .row')).toHaveCount(3);
    await expect(ordersCard.locator('.finance-orders-table .row')).not.toContainText('VOID-ADMISSION-001');
    const alphaIssuance = page.getByTestId('bill-issuance-results').locator('.mini-row').filter({ hasText: 'Student Alpha' });
    await expect(alphaIssuance).toContainText(/2|۲/);
    await expect(alphaIssuance).toContainText('فیس/شهریه');
    await expect(alphaIssuance).toContainText('ترانسپورت');
    await page.getByTestId('bill-fee-type-filter').selectOption('admission');
    await expect(alphaIssuance).toContainText('بل رسمی صادر نشده');
    await expect(alphaIssuance).toContainText('بل باطل');
    await page.getByTestId('bill-status-filter').selectOption('void');
    await expect(ordersCard.locator('.finance-orders-table .row')).toHaveCount(1);
    await expect(ordersCard.locator('.finance-orders-table .row')).toContainText('VOID-ADMISSION-001');
    await expect(ordersCard.locator('.finance-orders-table .row')).toContainText('بدون عملیات مالی');
    await page.getByTestId('bill-fee-type-filter').selectOption('all');
    await page.getByTestId('bill-status-filter').selectOption('official');

    await financeTabs.nth(1).click();

    await expect(page.locator('.finance-page h2')).toBeVisible();
    await expect.poll(() => paymentsListUrl).toContain('view=all');
    await expect(page.locator('.receipt-inspector')).toContainText('Student Alpha');
    await expect(page.locator('.receipt-file-link')).toContainText('نمایش فایل رسید');
    await expect(page.locator('.receipt-inspector .receipt-note-box .trail-item')).toHaveCount(1);
    await expect(page.locator('.receipt-inspector .receipt-trail .trail-item')).toHaveCount(1);
    await expect(page.getByTestId('cashier-daily-report')).toContainText('Finance Manager');
    await expect(page.getByTestId('cashier-daily-report')).toContainText('انتقال بانکی');
    await expect(page.locator('.receipt-inspector')).toContainText('Finance Manager');
    await page.getByTestId('print-selected-receipt').click();
    await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
    const printableReceipt = page.getByTestId('printable-receipt-sheet');
    await expect(printableReceipt).toContainText('رسید پرداخت فیس شاگرد');
    await expect(printableReceipt.locator('.finance-receipt-print-copy')).toHaveCount(2);
    await expect(printableReceipt.locator('[data-receipt-copy="student"]')).toContainText('نسخه شاگرد');
    await expect(printableReceipt.locator('[data-receipt-copy="school"]')).toContainText('نسخه مکتب');
    await expect(printableReceipt.locator('.finance-receipt-cut-line')).toContainText('محل برش');
    await expect(printableReceipt.getByText('نام پدر:')).toHaveCount(2);
    await expect(printableReceipt.getByText('Mohammad Karim')).toHaveCount(2);
    await expect(printableReceipt.getByText('نمبر اساس:')).toHaveCount(2);
    await expect(printableReceipt.getByText('ASAS-1406-001')).toHaveCount(2);
    await expect(printableReceipt.getByText('مشخصات شاگرد')).toHaveCount(2);
    await expect(printableReceipt.getByText('مشخصات پرداخت')).toHaveCount(2);
    await expect(printableReceipt.getByText('مبلغ اصلی بل')).toHaveCount(2);
    await expect(printableReceipt.getByText('تخفیف و معافیت')).toHaveCount(2);
    await expect(printableReceipt.getByText('باقیات فعلی')).toHaveCount(2);
    await expect(printableReceipt.getByText('1406')).toHaveCount(2);
    await expect(printableReceipt.getByText('مدیر مالی')).toHaveCount(2);

    await expect(page.locator('.receipt-inbox-summary')).toContainText(/11|۱۱/);
    await expect(page.locator('.finance-table.receipts-table .row')).toHaveCount(10);
    await expect(page.getByTestId('receipt-page-summary')).toContainText(/1|۱/);
    await expect(page.getByTestId('receipt-page-summary')).toContainText(/10|۱۰/);
    await expect(page.getByTestId('receipt-page-summary')).toContainText(/11|۱۱/);
    await page.getByTestId('receipt-pagination').getByRole('button', { name: 'بعدی' }).click();
    await expect(page.locator('.finance-table.receipts-table .row')).toHaveCount(1);
    await expect(page.getByTestId('receipt-pagination')).toContainText(/2|۲/);
    await page.getByTestId('receipt-pagination').getByRole('button', { name: 'قبلی' }).click();
    await expect(page.locator('.finance-table.receipts-table .row')).toHaveCount(10);

    const receiptFilters = page.locator('#pending-receipts .finance-inline-filter select');
    await receiptFilters.nth(1).selectOption('approved');
    await expect(page.locator('.finance-table.receipts-table .row')).toHaveCount(5);
    await expect(page.locator('.finance-table.receipts-table .row').first()).toContainText('تاییدِ نهایی – ثبت در حساب');
    await receiptFilters.nth(1).selectOption('all');

    await page.getByTestId('receipt-academic-year-filter').selectOption('year-2');
    await expect(page.locator('.finance-table.receipts-table .row')).toHaveCount(8);
    await expect(page.locator('.finance-table.receipts-table .row').first()).toContainText('Historical Student');
    await page.getByTestId('receipt-class-filter').selectOption('class-2');
    await expect(page.locator('.finance-table.receipts-table .row')).toHaveCount(0);
    await page.getByTestId('receipt-academic-year-filter').selectOption('all');
    await expect(page.locator('.finance-table.receipts-table .row')).toHaveCount(1);
    await expect(page.locator('.finance-table.receipts-table .row')).toContainText('Student Beta');
    await page.getByTestId('receipt-class-filter').selectOption('all');

    await receiptFilters.nth(2).selectOption('guardian_upload');
    await expect(page.locator('.finance-table.receipts-table .row')).toHaveCount(1);
    await expect(page.locator('.finance-table.receipts-table .row')).toContainText('Student Beta');
    await expect(page.locator('.receipt-inspector')).toContainText('PAY-CANON-1');
    await expect(page.locator('.receipt-inspector')).toContainText('Awaiting branch confirmation');
    await receiptFilters.nth(3).selectOption('escalated');
    await expect(page.locator('.finance-table.receipts-table .row')).toHaveCount(1);
    await page.locator('.receipt-inspector .receipt-follow-up-form textarea').fill('Escalated to final sign-off');
    await page.getByRole('button', { name: 'ذخیره پیگیری' }).click();
    await expect.poll(() => followUpCalls).toBe(1);
    await expect(page.locator('.receipt-inspector')).toContainText('Escalated to final sign-off');
    await receiptFilters.nth(2).selectOption('all');
    await receiptFilters.nth(3).selectOption('all');

    await financeTabs.nth(3).click();
    const reliefEntryWorkspace = page.getByTestId('relief-entry-workspace');
    await expect(reliefEntryWorkspace).toBeVisible();
    await expect(reliefEntryWorkspace.locator('.finance-relief-mode-tabs button')).toHaveCount(2);
    await expect(reliefEntryWorkspace.getByTestId('discount-registry-form')).toBeVisible();
    await expect(reliefEntryWorkspace.getByTestId('relief-student-spotlight')).toBeVisible();
    await expect(page.getByTestId('discount-registry-list')).toContainText('Merit scholarship');
    await expect(page.getByTestId('exemption-registry-list')).toContainText('Sponsored seat');
    await page.getByRole('button', { name: 'فورم تخفیف' }).click();
    await page.getByTestId('discount-registry-form').locator('select').nth(0).selectOption('student-2');
    await page.getByTestId('discount-registry-form').locator('select').nth(1).selectOption('class-2');
    await page.getByTestId('discount-registry-form').locator('select').nth(2).selectOption('year-1');
    await page.getByTestId('discount-registry-form').locator('select').nth(3).selectOption('waiver');
    await page.getByTestId('discount-registry-form').locator('input[placeholder="مبلغ تخفیف / تعدیل"]').fill('250');
    await page.getByTestId('discount-registry-form').locator('textarea').fill('Sibling support');
    await page.getByTestId('save-discount-registry').click();
    await expect(page.getByTestId('discount-registry-list')).toContainText('Sibling support');
    await expect(page.getByTestId('discount-registry-list')).toContainText('Student Beta');

    page.once('dialog', (dialog) => dialog.accept('Manual cleanup'));
    await page.getByTestId('cancel-discount-dis-new').click();
    await expect(page.getByTestId('discount-registry-list')).not.toContainText('Sibling support');

    await page.getByRole('button', { name: 'فورم معافیت' }).click();
    await page.getByTestId('exemption-registry-form').locator('select').nth(0).selectOption('student-1');
    await page.getByTestId('exemption-registry-form').locator('select').nth(1).selectOption('class-1');
    await page.getByTestId('exemption-registry-form').locator('select').nth(2).selectOption('year-1');
    await page.getByTestId('exemption-registry-form').locator('select').nth(3).selectOption('partial');
    await page.getByTestId('exemption-registry-form').locator('select').nth(4).selectOption('tuition');
    await page.getByTestId('exemption-registry-form').locator('input[placeholder="مبلغ معافیت جزئی"]').fill('300');
    await page.getByTestId('exemption-registry-form').locator('input[placeholder="درصد معافیت جزئی"]').fill('50');
    await page.getByTestId('exemption-registry-form').locator('textarea').nth(0).fill('Community program');
    await page.getByTestId('exemption-registry-form').locator('textarea').nth(1).fill('Foundation review');
    await page.getByTestId('save-exemption-registry').click();
    await expect(page.getByTestId('exemption-registry-list')).toContainText('Community program');
    await expect(page.getByTestId('exemption-registry-list')).toContainText(/50|۵۰/);

    page.once('dialog', (dialog) => dialog.accept('Policy update'));
    await page.getByTestId('cancel-exemption-ex-new').click();
    await expect(page.getByTestId('exemption-registry-list')).not.toContainText('Community program');

    await financeTabs.nth(1).click();
    const paymentDesk = page.getByTestId('finance-payment-desk');
    await paymentDesk.getByTestId('desk-student-select').selectOption('student-1');
    await paymentDesk.getByTestId('desk-class-select').selectOption('class-1');
    await paymentDesk.getByTestId('desk-academic-year-select').selectOption('year-1');
    await paymentDesk.locator('input[placeholder="مبلغ پرداخت"]').fill('700');
    await paymentDesk.getByRole('button', { name: 'تخصیص پیشرفته' }).click();
    await paymentDesk.getByTestId('desk-allocation-mode-select').selectOption('manual');
    await expect(paymentDesk.getByTestId('desk-open-orders')).toContainText('Transport Monthly');
    await paymentDesk.getByTestId('desk-manual-allocation-order-1').fill('500');
    await paymentDesk.getByTestId('desk-manual-allocation-order-3').fill('200');
    await expect(paymentDesk.getByTestId('preview-desk-payment')).toBeEnabled();
    await paymentDesk.getByTestId('preview-desk-payment').scrollIntoViewIfNeeded();
    await paymentDesk.getByTestId('preview-desk-payment').click({ force: true });
    await expect.poll(() => previewAllocationCalls).toBe(1);
    await expect(paymentDesk.getByTestId('desk-payment-preview')).toContainText(/2|۲/);
    await paymentDesk.getByTestId('submit-desk-payment').scrollIntoViewIfNeeded();
    await paymentDesk.getByTestId('submit-desk-payment').click({ force: true });
    await expect.poll(() => createPaymentCalls).toBe(1);
    await expect.poll(() => lastCreatedPaymentBody?.allocationMode).toBe('manual');
    await expect.poll(() => lastCreatedPaymentBody?.allocations?.length || 0).toBe(2);
    await expect.poll(() => Number(lastCreatedPaymentBody?.allocations?.[0]?.amount || 0)).toBe(500);
    await expect.poll(() => Number(lastCreatedPaymentBody?.allocations?.[1]?.amount || 0)).toBe(200);

    await receiptFilters.nth(0).selectOption('general_president_review');
    await expect(page.locator('.finance-table.receipts-table .row')).toHaveCount(1);
    await expect(page.locator('.finance-table.receipts-table .row')).toContainText('Student Beta');

    await receiptFilters.nth(0).selectOption('all');
    await page.locator('.finance-table.receipts-table .row').filter({ hasText: 'Student Alpha' }).first().getByRole('button', { name: 'تایید نهایی' }).click();
    await expect.poll(() => approveCalls).toBe(1);

    await financeTabs.nth(5).click();
    await expect(anomalyCenter).toBeHidden();
    await financeTabs.nth(6).click();
    await expect(anomalyCenter).toBeHidden();
    await financeTabs.nth(4).click();
    await expect(anomalyCenter).toBeVisible();
    await expect(anomalyCenter).toContainText('Student Alpha');
    await expect(anomalyCenter).toContainText('Student Beta');
    await expect(anomalyCenter.locator(':scope > .mini-row')).toHaveCount(0);
    await page.getByTestId('anomaly-assigned-level').selectOption('general_president');
    await page.getByTestId('anomaly-note-input').fill('Escalate overdue case to general president');
    await page.getByTestId('anomaly-assign-button').click();
    await expect(page.getByTestId('finance-anomaly-inspector')).toContainText('Escalate overdue case to general president');
    await expect(page.getByTestId('finance-anomaly-inspector')).toContainText(/ارجاع|assigned/i);
    await page.getByTestId('anomaly-snooze-until').fill('2026-04-15');
    await page.getByTestId('anomaly-note-input').fill('Pause follow-up until the guardian call');
    await page.getByTestId('anomaly-snooze-button').click();
    await expect(page.getByTestId('finance-anomaly-inspector')).toContainText('Pause follow-up until the guardian call');
    await page.getByTestId('anomaly-note-input').fill('Guardian paid directly at the branch');
    await page.getByTestId('anomaly-resolve-button').click();
    await expect(page.getByTestId('finance-anomaly-inspector')).toContainText('Guardian paid directly at the branch');
    await expect(page.getByTestId('by-class-report-card')).toContainText('Class Two Core');
    await page.getByTestId('anomaly-class-filter').selectOption('class-1');
    await expect(anomalyCenter).not.toContainText('Student Beta');
    await expect(page.getByTestId('by-class-report-card')).not.toContainText('Class Two Core');
    await expect(page.getByTestId('finance-audit-timeline-card')).toContainText('Overdue tuition order');
    await expect(page.getByTestId('finance-audit-timeline-card')).toContainText('Anomaly resolved');
    await expect(page.getByTestId('finance-audit-timeline-card')).not.toContainText('Guardian receipt submitted');
    await page.getByTestId('audit-timeline-kind-filter').selectOption('system');
    await expect(page.getByTestId('audit-timeline-list')).toContainText('Reminder sweep completed');
    await page.getByTestId('report-class-filter').selectOption('class-1');
    await page.getByTestId('report-class-filter').selectOption('');
    await page.getByTestId('audit-timeline-kind-filter').selectOption('payment');
    await expect(page.getByTestId('audit-timeline-list')).toContainText('Guardian receipt submitted');
    await page.getByTestId('audit-timeline-search').fill('branch confirmation');
    await expect(page.getByTestId('audit-timeline-inspector')).toContainText('Awaiting branch confirmation');
    await page.getByTestId('export-audit-package').click();
    await expect.poll(() => auditExportCalls).toBe(1);
    await expect.poll(() => lastAuditExportUrl).toContain('kind=payment');
    await expect.poll(() => lastAuditExportUrl).toContain('q=branch+confirmation');
    await page.getByTestId('audit-timeline-search').fill('');
    await page.getByTestId('audit-timeline-kind-filter').selectOption('all');

    await page.getByRole('button', { name: 'اجرای یادآوری' }).click();
    await expect.poll(() => reminderCalls).toBe(1);

    await page.getByRole('button', { name: 'خروجی CSV' }).click();
    await expect.poll(() => exportCalls).toBe(1);
    await expect.poll(() => lastExportUrl).toContain('/api/finance/admin/reports/export.csv');
    page.once('dialog', (dialog) => dialog.accept('Close pack ready'));
    await page.getByRole('button', { name: 'درخواست بستن ماه مالی' }).click();
    await expect(page.getByTestId('month-close-snapshot-card')).toContainText('2026-03');
    await expect(page.getByTestId('month-close-snapshot-card')).toContainText('دارای مانع فعال');
    await expect(page.getByTestId('month-close-approval-trail')).toContainText('submit');

    page.once('dialog', (dialog) => dialog.accept('Manager approved the package'));
    await page.getByTestId('approve-month-close').click();
    await expect(page.getByTestId('month-close-snapshot-card')).toContainText('در انتظارِ آمریتِ مالی');
    await expect(page.getByTestId('month-close-approval-trail')).toContainText('Manager approved the package');

    await page.getByTestId('export-month-close-snapshot').click();
    await expect.poll(() => monthCloseExportCalls).toBe(1);
    await expect.poll(() => lastMonthCloseExportUrl).toContain('/api/finance/admin/month-close/');

    await page.getByTestId('export-month-close-pdf').click();
    await expect.poll(() => monthClosePdfExportCalls).toBe(1);
    await expect.poll(() => lastMonthClosePdfUrl).toContain('/api/finance/admin/month-close/');

    await expect(page.getByTestId('finance-document-archive-card')).toContainText('MCP-202603-1');

    await page.getByTestId('finance-document-verify-input').fill('FV-MCP-1');
    await page.getByTestId('finance-document-verify-button').click();
    await expect(page.getByTestId('finance-document-verify-result')).toContainText('MCP-202603-1');

    await page.getByTestId('finance-document-delivery-channel').selectOption('email');
    await page.getByTestId('finance-document-delivery-emails').fill('family@example.com');
    await expect(page.getByTestId('finance-document-delivery-send')).toBeEnabled();
    await page.getByTestId('finance-document-delivery-send').click();
    await expect(page.getByTestId('finance-document-delivery-history')).toContainText('family@example.com');
    await expect(page.getByTestId('finance-document-delivery-history')).toContainText('sent');
    await expect(page.getByTestId('finance-document-delivery-history')).toContainText('smtp');
    await expect(page.getByTestId('finance-document-live-status')).toContainText('در جریان');

    await page.getByTestId('finance-document-batch-class').selectOption('class-1');
    await page.getByTestId('finance-document-batch-download').click();
    await expect.poll(() => documentBatchExportCalls).toBe(1);
    await expect(page.getByTestId('finance-document-archive-list')).toContainText('بسته گروهی استیتمنت');
    await page.getByTestId('finance-document-type-filter').selectOption('batch_statement_pack');
    await expect(page.getByTestId('finance-document-archive-list')).toContainText('BSP-202603-1');
  });
});
