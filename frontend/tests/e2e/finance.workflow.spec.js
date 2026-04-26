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
          status: 'partial',
          amountDue: 450,
          amountPaid: 150,
          outstandingAmount: 300,
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
          status: 'pending',
          approvalStage: 'finance_lead_review',
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
        }
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

    const deliveryTemplates = [
      {
        key: 'monthly_statement',
        label: 'Monthly Statement',
        description: 'Monthly delivery template for student and parent statements.',
        recommendedChannels: ['email', 'sms', 'whatsapp'],
        defaultSubject: 'Finance statement {{documentNo}}',
        defaultBody: 'Statement {{documentNo}} for {{subjectName}} is ready.'
      },
      {
        key: 'balance_followup',
        label: 'Balance Follow-up',
        description: 'Reminder template for open balances and collections.',
        recommendedChannels: ['sms', 'whatsapp', 'email'],
        defaultSubject: 'Payment follow-up {{documentNo}}',
        defaultBody: 'Please review finance document {{documentNo}}.'
      }
    ];
    const deliveryTemplateVariables = [
      { key: 'documentNo', label: 'Document No', description: 'Official finance document number.', sample: 'MCP-202603-001' },
      { key: 'subjectName', label: 'Subject Name', description: 'Student or batch subject.', sample: 'Student Alpha' },
      { key: 'verificationUrl', label: 'Verification URL', description: 'Verification link.', sample: 'https://example.test/verify/FV-MCP-1' },
      { key: 'monthKey', label: 'Month Key', description: 'Campaign month.', sample: '2026-03' },
      { key: 'classTitle', label: 'Class Title', description: 'Resolved class title.', sample: 'Class One Core' },
      { key: 'academicYearTitle', label: 'Academic Year', description: 'Resolved academic year title.', sample: '1406' },
      { key: 'note', label: 'Note', description: 'Operator note.', sample: 'Follow up this week' }
    ];
    const deliveryTemplateRegistry = [];
    const deliveryProviderConfigState = {
      items: [
        {
          channel: 'sms',
          mode: 'mock',
          provider: 'mock_sms_gateway',
          isActive: true,
          webhookUrl: '',
          statusWebhookUrl: '',
          fromHandle: '+93700111222',
          apiBaseUrl: '',
          accountSid: '',
          authToken: '',
          accessToken: '',
          phoneNumberId: '',
          webhookToken: '',
          note: 'Initial SMS gateway',
          credentialVersion: 1,
          lastRotatedAt: null,
          lastRotatedBy: null,
          auditTrail: [],
          source: 'database',
          updatedAt: '2026-03-28T09:00:00.000Z',
          updatedBy: { _id: 'admin-1', name: 'Finance Manager' }
        },
        {
          channel: 'whatsapp',
          mode: 'meta',
          provider: 'meta_whatsapp_gateway',
          isActive: true,
          webhookUrl: '',
          statusWebhookUrl: 'https://hooks.example.test/finance/meta/status',
          fromHandle: '',
          apiBaseUrl: '',
          accountSid: '',
          authToken: '',
          accessToken: '',
          phoneNumberId: '',
          webhookToken: '',
          note: 'Initial WhatsApp gateway',
          credentialVersion: 1,
          lastRotatedAt: null,
          lastRotatedBy: null,
          auditTrail: [],
          source: 'database',
          updatedAt: '2026-03-28T09:05:00.000Z',
          updatedBy: { _id: 'admin-1', name: 'Finance Manager' }
        }
      ]
    };

    const buildDeliveryProviderConfigItem = (channel = 'sms') => {
      const item = deliveryProviderConfigState.items.find((entry) => String(entry?.channel || '') === String(channel || '').trim()) || null;
      if (!item) return null;
      const mode = String(item?.mode || 'webhook').trim() || 'webhook';
      const requiredFields = mode === 'webhook'
        ? ['webhookUrl']
        : mode === 'twilio'
          ? ['accountSid', 'authToken', 'fromHandle']
          : mode === 'meta'
            ? ['accessToken', 'phoneNumberId']
            : [];
      const missingRequiredFields = requiredFields.filter((field) => !String(item?.[field] || '').trim());
      const providerKey = mode === 'twilio'
        ? 'twilio'
        : mode === 'meta'
          ? 'meta'
          : String(item?.provider || 'generic').trim() || 'generic';
      const webhookPath = `/api/finance/delivery/providers/${providerKey}/status`;
      const mask = (value = '') => {
        const normalized = String(value || '').trim();
        if (!normalized) return '';
        if (normalized.length <= 4) return '*'.repeat(normalized.length);
        return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
      };
      return {
        channel: String(item.channel || '').trim(),
        mode,
        provider: String(item.provider || '').trim(),
        isActive: item.isActive !== false,
        webhookUrl: String(item.webhookUrl || '').trim(),
        statusWebhookUrl: String(item.statusWebhookUrl || '').trim(),
        fromHandle: String(item.fromHandle || '').trim(),
        apiBaseUrl: String(item.apiBaseUrl || '').trim(),
        note: String(item.note || '').trim(),
        credentialVersion: Math.max(1, Number(item.credentialVersion || 1) || 1),
        lastRotatedAt: item.lastRotatedAt || null,
        lastRotatedBy: structuredClone(item.lastRotatedBy || null),
        source: String(item.source || 'database').trim() || 'database',
        updatedAt: item.updatedAt || null,
        updatedBy: structuredClone(item.updatedBy || null),
        auditTrail: Array.isArray(item.auditTrail) ? structuredClone(item.auditTrail) : [],
        fields: {
          accountSid: { configured: Boolean(String(item.accountSid || '').trim()), masked: mask(item.accountSid) },
          authToken: { configured: Boolean(String(item.authToken || '').trim()), masked: mask(item.authToken) },
          accessToken: { configured: Boolean(String(item.accessToken || '').trim()), masked: mask(item.accessToken) },
          phoneNumberId: { configured: Boolean(String(item.phoneNumberId || '').trim()), masked: mask(item.phoneNumberId) },
          webhookToken: { configured: Boolean(String(item.webhookToken || '').trim()), masked: mask(item.webhookToken) }
        },
        readiness: {
          configured: item.isActive !== false && missingRequiredFields.length === 0,
          missingRequiredFields,
          providerKey,
          webhookPath,
          webhookUrl: `http://127.0.0.1:3000${webhookPath}`,
          providerCallbackUrl: String(item.statusWebhookUrl || '').trim() || ((mode === 'twilio' || mode === 'meta') ? `http://127.0.0.1:3000${webhookPath}` : ''),
          inboundTokenRequired: Boolean(String(item.webhookToken || '').trim())
        }
      };
    };

    const appendDeliveryProviderAuditEntry = (item, {
      action = 'config_saved',
      note = '',
      changedFields = [],
      rotatedFields = [],
      by = { _id: 'admin-1', name: 'Finance Manager' },
      at = '2026-03-29T08:30:00.000Z'
    } = {}) => {
      if (!item) return;
      if (!Array.isArray(item.auditTrail)) item.auditTrail = [];
      item.auditTrail.unshift({
        action,
        by: structuredClone(by),
        at,
        note: String(note || '').trim(),
        changedFields: Array.isArray(changedFields) ? [...changedFields] : [],
        rotatedFields: Array.isArray(rotatedFields) ? [...rotatedFields] : [],
        credentialVersion: Math.max(1, Number(item.credentialVersion || 1) || 1)
      });
      if (item.auditTrail.length > 12) {
        item.auditTrail = item.auditTrail.slice(0, 12);
      }
    };

    const normalizeDeliveryTemplateApprovalStage = (value = '') => {
      const normalized = String(value || '').trim().toLowerCase();
      return ['draft', 'pending_review', 'approved', 'rejected'].includes(normalized) ? normalized : 'draft';
    };

    const buildDeliveryTemplateRolloutMetrics = (templateKey = '') => {
      const campaigns = deliveryCampaignState.items.filter((item) => (
        String(item?.messageTemplateKey || '').trim() === String(templateKey || '').trim()
      ));
      const byChannel = campaigns.reduce((acc, item) => {
        const key = String(item?.channel || 'email').trim() || 'email';
        acc[key] = Number(acc[key] || 0) + 1;
        return acc;
      }, {});
      const lastUsedAt = campaigns.reduce((latest, item) => {
        const candidate = item?.lastRunAt || item?.updatedAt || item?.createdAt || null;
        if (!candidate) return latest;
        if (!latest) return candidate;
        return new Date(candidate).getTime() >= new Date(latest).getTime() ? candidate : latest;
      }, null);
      return {
        totalCampaigns: campaigns.length,
        activeCampaigns: campaigns.filter((item) => String(item?.status || '') === 'active').length,
        automatedCampaigns: campaigns.filter((item) => item?.automationEnabled === true).length,
        deliveredTargets: campaigns.reduce((sum, item) => sum + Number(item?.successCount || 0), 0),
        failedTargets: campaigns.reduce((sum, item) => sum + Number(item?.failureCount || 0), 0),
        lastUsedAt,
        byChannel
      };
    };

    const buildDeliveryTemplateItem = (templateKey = '') => {
      const base = deliveryTemplates.find((item) => String(item?.key || '') === String(templateKey || '').trim()) || null;
      if (!base) return null;
      const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === String(templateKey || '').trim()) || null;
      const publishedVersionNumber = Number(registry?.currentPublishedVersion || 1) || 1;
      const draftVersionNumber = Number(registry?.currentDraftVersion || 0) || null;
      const serializeVersion = (item = {}, { isSystem = false } = {}) => {
        const versionNumber = Number(item?.versionNumber || 0) || 0;
        const status = isSystem
          ? (publishedVersionNumber === 1 ? 'published' : 'archived')
          : (versionNumber === publishedVersionNumber ? 'published' : (versionNumber === draftVersionNumber ? 'draft' : 'archived'));
        const approvalStage = isSystem
          ? 'approved'
          : normalizeDeliveryTemplateApprovalStage(
            item?.approvalStage
            || (versionNumber === publishedVersionNumber ? 'approved' : (versionNumber === draftVersionNumber ? 'draft' : 'approved'))
          );
        return {
          ...structuredClone(item),
          versionNumber,
          status,
          approvalStage,
          canRequestReview: !isSystem && status === 'draft' && approvalStage !== 'pending_review',
          canApprove: !isSystem && status === 'draft' && approvalStage === 'pending_review',
          canReject: !isSystem && status === 'draft' && approvalStage === 'pending_review',
          canPublish: !isSystem && status === 'draft' && approvalStage === 'approved'
        };
      };
      const systemVersion = serializeVersion({
        versionNumber: 1,
        subject: base.defaultSubject,
        body: base.defaultBody,
        changeNote: 'system baseline',
        source: 'system',
        isSystem: true
      }, { isSystem: true });
      const customVersions = Array.isArray(registry?.versions)
        ? registry.versions.map((item) => serializeVersion(item))
        : [];
      const versions = [systemVersion, ...customVersions]
        .sort((left, right) => Number(right?.versionNumber || 0) - Number(left?.versionNumber || 0));
      const publishedVersion = versions.find((item) => Number(item?.versionNumber || 0) === publishedVersionNumber) || systemVersion;
      const draftVersion = versions.find((item) => Number(item?.versionNumber || 0) === draftVersionNumber) || null;
      return {
        ...structuredClone(base),
        defaultSubject: publishedVersion.subject || base.defaultSubject,
        defaultBody: publishedVersion.body || base.defaultBody,
        publishedVersionNumber,
        draftVersionNumber,
        publishedVersion,
        draftVersion,
        versions,
        history: Array.isArray(registry?.history) ? structuredClone(registry.history) : [],
        hasCustomizations: customVersions.length > 0,
        approvalSummary: {
          draft: versions.filter((item) => item.approvalStage === 'draft').length,
          pendingReview: versions.filter((item) => item.approvalStage === 'pending_review').length,
          approved: versions.filter((item) => item.approvalStage === 'approved').length,
          rejected: versions.filter((item) => item.approvalStage === 'rejected').length
        },
        pendingReviewVersionNumber: versions.find((item) => item.approvalStage === 'pending_review' && item.isSystem !== true)?.versionNumber || null,
        rolloutMetrics: buildDeliveryTemplateRolloutMetrics(templateKey)
      };
    };

    const resolveDeliveryTemplateVersion = (templateItem = null, versionNumber = null) => {
      if (!templateItem) return null;
      const numericVersion = Number(versionNumber || 0) || null;
      if (numericVersion != null) {
        const explicitVersion = (templateItem.versions || []).find((item) => Number(item?.versionNumber || 0) === numericVersion);
        if (explicitVersion) return explicitVersion;
      }
      return templateItem.draftVersion || templateItem.publishedVersion || templateItem.versions?.[0] || null;
    };

    const deliveryCampaignState = {
      items: []
    };

    const buildDeliveryRetryQueue = (filters = {}) => {
      const channel = String(filters?.channel || '').trim();
      const status = String(filters?.status || '').trim();
      const provider = String(filters?.provider || '').trim();
      const failureCode = String(filters?.failureCode || '').trim();
      const retryableFilter = String(filters?.retryable || '').trim().toLowerCase();
      const retryableValue = retryableFilter === 'true' || retryableFilter === 'retryable'
        ? true
        : retryableFilter === 'false' || retryableFilter === 'non_retryable' || retryableFilter === 'not_retryable'
          ? false
          : null;
      return (
      deliveryCampaignState.items.flatMap((campaign) => (
        Array.isArray(campaign.targets) ? campaign.targets.map((target) => ({ campaign, target })) : []
      )).filter(({ target, campaign }) => (
        String(target?.status || '') === 'failed'
        && (!channel || String(target?.channel || campaign?.channel || '') === channel)
        && (!status || String(target?.status || '') === status)
        && (!provider || String(target?.provider || '') === provider)
        && (!failureCode || String(target?.lastFailureCode || '') === failureCode)
        && (retryableValue == null || Boolean(target?.retryable === true) === retryableValue)
      )).map(({ campaign, target }) => ({
        campaignId: campaign._id,
        campaignName: campaign.name,
        archiveId: target.archiveId,
        documentNo: target.documentNo,
        channel: target.channel || campaign.channel || 'email',
        status: target.status,
        recipient: target.recipient || '',
        recipientCount: target.recipientCount || 0,
        attempts: target.attempts || 0,
        lastAttemptAt: target.lastAttemptAt || null,
        lastError: target.lastError || '',
        lastFailureCode: target.lastFailureCode || '',
        retryable: target.retryable === true,
        nextRetryAt: target.nextRetryAt || null,
        provider: target.provider || '',
        providerMessageId: target.providerMessageId || '',
        providerStatus: target.providerStatus || ''
      }))
      );
    };

    const buildDeliveryRecoveryQueue = (filters = {}) => {
      const channel = String(filters?.channel || '').trim();
      const status = String(filters?.status || '').trim();
      const provider = String(filters?.provider || '').trim();
      const failureCode = String(filters?.failureCode || '').trim();
      const recoveryState = String(filters?.recoveryState || '').trim();
      const retryableFilter = String(filters?.retryable || '').trim().toLowerCase();
      const retryableValue = retryableFilter === 'true' || retryableFilter === 'retryable'
        ? true
        : retryableFilter === 'false' || retryableFilter === 'non_retryable' || retryableFilter === 'not_retryable'
          ? false
          : null;
      const groups = new Map();
      const appendGroup = ({
        providerMessageId = '',
        providerName = '',
        providerStatus = '',
        channelName = '',
        recipient = '',
        deliveryStatus = '',
        failureCodeValue = '',
        errorMessage = '',
        retryable = false,
        nextRetryAt = null,
        occurredAt = null,
        recoveryStateValue = '',
        archiveRef = null,
        campaignRef = null
      } = {}) => {
        const normalizedMessageId = String(providerMessageId || '').trim();
        if (!normalizedMessageId || !recoveryStateValue) return;
        const current = groups.get(normalizedMessageId) || {
          providerMessageId: normalizedMessageId,
          provider: '',
          providerStatus: '',
          channel: String(channelName || 'email').trim() || 'email',
          recipient: '',
          deliveryStatus: '',
          failureCode: '',
          errorMessage: '',
          retryable: false,
          nextRetryAt: null,
          recoveryState: '',
          ageMinutes: null,
          lastEventAt: null,
          archiveRefs: [],
          campaignRefs: []
        };
        const currentTime = current.lastEventAt ? new Date(current.lastEventAt).getTime() : 0;
        const nextTime = occurredAt ? new Date(occurredAt).getTime() : 0;
        if (nextTime >= currentTime) {
          current.provider = String(providerName || '').trim();
          current.providerStatus = String(providerStatus || '').trim();
          current.channel = String(channelName || 'email').trim() || 'email';
          current.recipient = String(recipient || '').trim();
          current.deliveryStatus = String(deliveryStatus || '').trim();
          current.failureCode = String(failureCodeValue || '').trim();
          current.errorMessage = String(errorMessage || '').trim();
          current.retryable = retryable === true;
          current.nextRetryAt = nextRetryAt || null;
          current.recoveryState = recoveryStateValue;
          current.lastEventAt = occurredAt || null;
          current.ageMinutes = occurredAt ? Math.max(0, Math.floor((Date.now() - new Date(occurredAt).getTime()) / 60000)) : null;
        }
        if (archiveRef?.archiveId && !current.archiveRefs.some((item) => String(item.archiveId || '') === String(archiveRef.archiveId || ''))) {
          current.archiveRefs.push(structuredClone(archiveRef));
        }
        if (campaignRef?.campaignId && !current.campaignRefs.some((item) => (
          String(item.campaignId || '') === String(campaignRef.campaignId || '')
          && String(item.archiveId || '') === String(campaignRef.archiveId || '')
        ))) {
          current.campaignRefs.push(structuredClone(campaignRef));
        }
        groups.set(normalizedMessageId, current);
      };
      const resolveRecoveryState = ({
        providerStatus = '',
        status = '',
        retryable = false,
        nextRetryAt = null,
        failureCode = '',
        errorMessage = '',
        occurredAt = null
      } = {}) => {
        const normalizedProviderStatus = String(providerStatus || '').trim().toLowerCase();
        const normalizedStatus = String(status || '').trim().toLowerCase();
        const normalizedFailureCode = String(failureCode || '').trim().toLowerCase();
        const normalizedError = String(errorMessage || '').trim().toLowerCase();
        let stage = 'unknown';
        if (['read', 'seen'].includes(normalizedProviderStatus)) stage = 'read';
        else if (['delivered', 'delivery_confirmed', 'completed', 'complete'].includes(normalizedProviderStatus)) stage = 'delivered';
        else if (['failed', 'undelivered', 'rejected', 'expired', 'cancelled', 'canceled', 'error', 'timeout', 'bounced'].includes(normalizedProviderStatus)) stage = 'failed';
        else if (['accepted', 'submitted', 'received'].includes(normalizedProviderStatus)) stage = 'accepted';
        else if (['queued', 'pending', 'scheduled'].includes(normalizedProviderStatus)) stage = 'queued';
        else if (['sent', 'resent', 'dispatched', 'dispatching', 'in_transit'].includes(normalizedProviderStatus)) stage = 'sent';
        else if (normalizedStatus === 'delivered') stage = 'delivered';
        else if (normalizedStatus === 'failed') stage = 'failed';
        else if (['sent', 'resent'].includes(normalizedStatus)) stage = 'sent';
        else if (normalizedStatus === 'skipped') stage = 'skipped';
        else if (normalizedFailureCode || normalizedError) stage = 'failed';
        const ageMinutes = occurredAt ? Math.max(0, Math.floor((Date.now() - new Date(occurredAt).getTime()) / 60000)) : null;
        if (['queued', 'accepted', 'sent'].includes(stage) && ageMinutes != null && ageMinutes >= 20) {
          return 'awaiting_callback';
        }
        if (stage === 'unknown' && ageMinutes != null && ageMinutes >= 20) {
          return 'status_unknown';
        }
        if (stage === 'failed') {
          if (retryable === true && nextRetryAt && new Date(nextRetryAt).getTime() > Date.now()) return 'retry_waiting';
          if (retryable === true) return 'retry_ready';
          return 'provider_failed';
        }
        return '';
      };

      documentArchiveState.items.forEach((archive) => {
        (Array.isArray(archive.deliveryLog) ? archive.deliveryLog : []).forEach((entry) => {
          const nextRecoveryState = resolveRecoveryState({
            providerStatus: entry?.providerStatus,
            status: entry?.status,
            retryable: entry?.retryable === true,
            nextRetryAt: entry?.nextRetryAt || null,
            failureCode: entry?.failureCode,
            errorMessage: entry?.errorMessage,
            occurredAt: entry?.sentAt || null
          });
          appendGroup({
            providerMessageId: entry?.providerMessageId,
            providerName: entry?.provider,
            providerStatus: entry?.providerStatus,
            channelName: entry?.channel || 'email',
            recipient: entry?.recipient,
            deliveryStatus: entry?.status,
            failureCodeValue: entry?.failureCode,
            errorMessage: entry?.errorMessage,
            retryable: entry?.retryable === true,
            nextRetryAt: entry?.nextRetryAt || null,
            occurredAt: entry?.sentAt || null,
            recoveryStateValue: nextRecoveryState,
            archiveRef: {
              archiveId: archive._id,
              documentNo: archive.documentNo,
              subjectName: archive.subjectName,
              status: entry?.status || archive?.lastDeliveryStatus || ''
            }
          });
        });
      });

      deliveryCampaignState.items.forEach((campaign) => {
        (Array.isArray(campaign.targets) ? campaign.targets : []).forEach((target) => {
          const nextRecoveryState = resolveRecoveryState({
            providerStatus: target?.providerStatus,
            status: target?.status,
            retryable: target?.retryable === true,
            nextRetryAt: target?.nextRetryAt || null,
            failureCode: target?.lastFailureCode,
            errorMessage: target?.lastError,
            occurredAt: target?.lastAttemptAt || target?.lastDeliveredAt || null
          });
          appendGroup({
            providerMessageId: target?.providerMessageId,
            providerName: target?.provider,
            providerStatus: target?.providerStatus,
            channelName: target?.channel || campaign?.channel || 'email',
            recipient: target?.recipient,
            deliveryStatus: target?.status,
            failureCodeValue: target?.lastFailureCode,
            errorMessage: target?.lastError,
            retryable: target?.retryable === true,
            nextRetryAt: target?.nextRetryAt || null,
            occurredAt: target?.lastAttemptAt || target?.lastDeliveredAt || null,
            recoveryStateValue: nextRecoveryState,
            campaignRef: {
              campaignId: campaign._id,
              campaignName: campaign.name,
              archiveId: target?.archiveId || '',
              documentNo: target?.documentNo || '',
              status: target?.status || ''
            }
          });
        });
      });

      return Array.from(groups.values())
        .map((item) => ({
          ...item,
          documentNos: Array.from(new Set([
            ...item.archiveRefs.map((ref) => String(ref?.documentNo || '').trim()),
            ...item.campaignRefs.map((ref) => String(ref?.documentNo || '').trim())
          ].filter(Boolean))),
          campaignNames: Array.from(new Set(
            item.campaignRefs.map((ref) => String(ref?.campaignName || '').trim()).filter(Boolean)
          )),
          archiveCount: item.archiveRefs.length,
          campaignCount: item.campaignRefs.length,
          replayRecommendedStatus: ['awaiting_callback', 'retry_ready', 'retry_waiting', 'status_unknown'].includes(String(item?.recoveryState || '').trim())
            ? 'delivered'
            : 'failed'
        }))
        .filter((item) => (
          (!channel || String(item?.channel || '').trim() === channel)
          && (!status || String(item?.deliveryStatus || '').trim() === status)
          && (!provider || String(item?.provider || '').trim() === provider)
          && (!failureCode || String(item?.failureCode || '').trim() === failureCode)
          && (!recoveryState || String(item?.recoveryState || '').trim() === recoveryState)
          && (retryableValue == null || Boolean(item?.retryable === true) === retryableValue)
        ))
        .sort((left, right) => new Date(right?.lastEventAt || 0).getTime() - new Date(left?.lastEventAt || 0).getTime());
    };

    const buildDeliveryAnalytics = (filters = {}) => {
      const channel = String(filters?.channel || '').trim();
      const status = String(filters?.status || '').trim();
      const provider = String(filters?.provider || '').trim();
      const failureCode = String(filters?.failureCode || '').trim();
      const retryableFilter = String(filters?.retryable || '').trim().toLowerCase();
      const retryableValue = retryableFilter === 'true' || retryableFilter === 'retryable'
        ? true
        : retryableFilter === 'false' || retryableFilter === 'non_retryable' || retryableFilter === 'not_retryable'
          ? false
          : null;
      const deliveryEvents = documentArchiveState.items.flatMap((archive) => (
        Array.isArray(archive.deliveryLog) ? archive.deliveryLog.map((entry) => ({ archive, entry })) : []
      )).filter(({ entry }) => (
        (!channel || String(entry?.channel || '') === channel)
        && (!status || String(entry?.status || '') === status)
        && (!provider || String(entry?.provider || '') === provider)
        && (!failureCode || String(entry?.failureCode || '') === failureCode)
        && (retryableValue == null || Boolean(entry?.retryable === true) === retryableValue)
      ));
      const retryQueue = buildDeliveryRetryQueue(filters);
      const recoveryQueue = buildDeliveryRecoveryQueue(filters);
      const readyToRetryCount = retryQueue.filter((item) => (
        item?.retryable === true && (!item?.nextRetryAt || new Date(item.nextRetryAt).getTime() <= Date.now())
      )).length;
      const waitingRetryCount = retryQueue.filter((item) => (
        item?.retryable === true && item?.nextRetryAt && new Date(item.nextRetryAt).getTime() > Date.now()
      )).length;
      const blockedRetryCount = retryQueue.filter((item) => item?.retryable !== true).length;
      const byProvider = retryQueue.length
        ? retryQueue.reduce((acc, item) => {
          const currentProvider = String(item?.provider || '').trim();
          if (currentProvider) acc[currentProvider] = Number(acc[currentProvider] || 0) + 1;
          return acc;
        }, {})
        : deliveryEvents.reduce((acc, { entry }) => {
          const currentProvider = String(entry?.provider || '').trim();
          if (currentProvider) acc[currentProvider] = Number(acc[currentProvider] || 0) + 1;
          return acc;
        }, {});
      const byFailureCode = retryQueue.length
        ? retryQueue.reduce((acc, item) => {
          const currentFailureCode = String(item?.lastFailureCode || '').trim();
          if (currentFailureCode) acc[currentFailureCode] = Number(acc[currentFailureCode] || 0) + 1;
          return acc;
        }, {})
        : deliveryEvents.reduce((acc, { entry }) => {
          const currentFailureCode = String(entry?.failureCode || '').trim();
          if (currentFailureCode) acc[currentFailureCode] = Number(acc[currentFailureCode] || 0) + 1;
          return acc;
        }, {});
      return {
        summary: {
          campaignsTotal: deliveryCampaignState.items.length,
          campaignsActive: deliveryCampaignState.items.filter((item) => item.status === 'active').length,
          campaignsPaused: deliveryCampaignState.items.filter((item) => item.status === 'paused').length,
          automatedCampaigns: deliveryCampaignState.items.filter((item) => item.automationEnabled).length,
          dueCampaigns: deliveryCampaignState.items.filter((item) => item.automationEnabled && item.status === 'active').length,
          deliveriesTotal: deliveryEvents.length,
          failedQueueCount: retryQueue.length,
          recoveryQueueCount: recoveryQueue.length,
          awaitingWebhookCount: recoveryQueue.filter((item) => String(item?.recoveryState || '') === 'awaiting_callback').length,
          recoveryRetryableCount: recoveryQueue.filter((item) => item?.retryable === true).length,
          readyToRetryCount,
          waitingRetryCount,
          blockedRetryCount,
          byChannel: {
            email: deliveryEvents.filter(({ entry }) => entry?.channel === 'email').length,
            portal: deliveryEvents.filter(({ entry }) => entry?.channel === 'portal').length,
            sms: deliveryEvents.filter(({ entry }) => entry?.channel === 'sms').length,
            whatsapp: deliveryEvents.filter(({ entry }) => entry?.channel === 'whatsapp').length
          },
          byStatus: {
            sent: deliveryEvents.filter(({ entry }) => entry?.status === 'sent').length,
            resent: deliveryEvents.filter(({ entry }) => entry?.status === 'resent').length,
            delivered: deliveryEvents.filter(({ entry }) => entry?.status === 'delivered').length,
            failed: deliveryEvents.filter(({ entry }) => entry?.status === 'failed').length
          },
          byProvider,
          byFailureCode,
          byRecoveryState: recoveryQueue.reduce((acc, item) => {
            const key = String(item?.recoveryState || '').trim();
            if (key) acc[key] = Number(acc[key] || 0) + 1;
            return acc;
          }, {})
        },
        recentFailures: retryQueue.slice(0, 8)
      };
    };

    const buildDeliveryTemplatePreview = (payload = {}) => {
      const template = buildDeliveryTemplateItem(String(payload?.messageTemplateKey || '').trim());
      const templateVersion = resolveDeliveryTemplateVersion(
        template,
        payload?.templateVersionNumber || payload?.messageTemplateVersionNumber || payload?.versionNumber || null
      );
      const allowedVariables = new Set(deliveryTemplateVariables.map((item) => item.key));
      const subjectTemplate = String(payload?.messageTemplateSubject || templateVersion?.subject || template?.defaultSubject || '').trim();
      const bodyTemplate = String(payload?.messageTemplateBody || templateVersion?.body || template?.defaultBody || '').trim();
      const extractVariables = (text = '') => Array.from(new Set(
        Array.from(String(text || '').matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g))
          .map((match) => String(match?.[1] || '').trim())
          .filter(Boolean)
      ));
      const usedVariables = Array.from(new Set([
        ...extractVariables(subjectTemplate),
        ...extractVariables(bodyTemplate)
      ]));
      const unknownVariables = usedVariables.filter((item) => !allowedVariables.has(item));
      const context = {
        documentNo: 'MCP-202603-001',
        subjectName: 'Student Alpha',
        verificationUrl: 'https://example.test/verify/FV-MCP-1',
        monthKey: String(payload?.monthKey || '2026-03'),
        classTitle: String(payload?.classId || '') === 'class-1' ? 'Class One Core' : '',
        academicYearTitle: String(payload?.academicYearId || '') === 'year-1' ? '1406' : '',
        note: String(payload?.note || '').trim()
      };
      const render = (text = '') => String(text || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => String(context[key] || ''));
      return {
        templateKey: String(payload?.messageTemplateKey || ''),
        templateLabel: template?.label || '',
        templateVersionNumber: Number(templateVersion?.versionNumber || template?.publishedVersionNumber || 0) || null,
        templateStatus: String(templateVersion?.status || template?.publishedVersion?.status || ''),
        valid: unknownVariables.length === 0,
        usedVariables,
        unknownVariables,
        emptyVariables: usedVariables.filter((item) => !String(context[item] || '').trim()),
        warnings: [],
        sampleSource: 'synthetic',
        sample: {
          documentNo: context.documentNo,
          documentType: String(payload?.documentType || 'batch_statement_pack'),
          subjectName: context.subjectName,
          classTitle: context.classTitle,
          academicYearTitle: context.academicYearTitle,
          monthKey: context.monthKey
        },
        renderedSubject: render(subjectTemplate),
        renderedBody: render(bodyTemplate),
        rolloutPreview: {
          matchedArchiveCount: documentArchiveState.items.filter((item) => (
            (!payload?.documentType || String(item?.documentType || '') === String(payload.documentType || ''))
            && (!payload?.classId || String(item?.scope?.classId || '') === String(payload.classId || ''))
            && (!payload?.academicYearId || String(item?.scope?.academicYearId || '') === String(payload.academicYearId || ''))
            && (!payload?.monthKey || String(item?.scope?.monthKey || '') === String(payload.monthKey || ''))
          )).length,
          recommendedChannels: Array.isArray(template?.recommendedChannels) ? template.recommendedChannels : [],
          scope: {
            documentType: String(payload?.documentType || 'batch_statement_pack'),
            classId: String(payload?.classId || ''),
            academicYearId: String(payload?.academicYearId || ''),
            monthKey: String(payload?.monthKey || '')
          }
        }
      };
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
        allocations: [
          {
            feeOrderId: item.bill?._id === 'bill-2' ? 'order-2' : 'order-1',
            title: item.bill?.billNumber || '',
            orderNumber: item.bill?.billNumber || '',
            amount: item.amount,
            outstandingAmount: Math.max(0, Number(item.bill?.amountDue || 0) - Number(item.bill?.amountPaid || 0))
          }
        ],
        remainingBeforePayment: Math.max(0, Number(item.bill?.amountDue || 0) - Number(item.bill?.amountPaid || 0)),
        remainingAfterPayment: Math.max(0, Number(item.bill?.amountDue || 0) - Number(item.bill?.amountPaid || 0) - Number(item.amount || 0))
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
            { _id: 'year-1', id: 'year-1', title: '1406', code: '1406', isCurrent: true, isActive: true }
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
          item,
          membership: {
            id: 'mem-1',
            student: { fullName: item?.student?.fullName || item?.student?.name || 'Student Alpha' },
            schoolClass: { title: item?.schoolClass?.title || 'Class One Core' },
            academicYear: { title: item?.receiptDetails?.academicYearTitle || '1406' }
          },
          receipt: item?.receiptDetails || {},
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

    await page.route('**/api/finance/admin/delivery-providers**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/rotate')) {
        await route.fallback();
        return;
      }
      if (route.request().method() === 'POST') {
        const channel = url.pathname.split('/').pop() || 'sms';
        const body = route.request().postDataJSON();
        let entry = deliveryProviderConfigState.items.find((item) => String(item?.channel || '') === String(channel || '').trim()) || null;
        if (!entry) {
          entry = {
            channel: String(channel || 'sms').trim() || 'sms',
            source: 'database',
            credentialVersion: 1,
            lastRotatedAt: null,
            lastRotatedBy: null,
            auditTrail: []
          };
          deliveryProviderConfigState.items.push(entry);
        }
        const changedFields = [];
        const rotatedFields = [];
        [
          'mode',
          'provider',
          'isActive',
          'webhookUrl',
          'statusWebhookUrl',
          'fromHandle',
          'apiBaseUrl',
          'note'
        ].forEach((field) => {
          const previousValue = field === 'isActive'
            ? entry[field] !== false
            : String(entry?.[field] || '').trim();
          const nextValue = field === 'isActive'
            ? body?.isActive !== false
            : String(body?.[field] || '').trim();
          if (previousValue !== nextValue) changedFields.push(field);
        });
        Object.assign(entry, {
          mode: String(body?.mode || entry.mode || 'webhook').trim() || 'webhook',
          provider: String(body?.provider || entry.provider || `generic_${channel}_gateway`).trim(),
          isActive: body?.isActive !== false,
          webhookUrl: String(body?.webhookUrl || '').trim(),
          statusWebhookUrl: String(body?.statusWebhookUrl || '').trim(),
          fromHandle: String(body?.fromHandle || '').trim(),
          apiBaseUrl: String(body?.apiBaseUrl || '').trim(),
          note: String(body?.note || '').trim(),
          updatedAt: '2026-03-29T08:30:00.000Z',
          updatedBy: { _id: 'admin-1', name: 'Finance Manager' }
        });
        ['accountSid', 'authToken', 'accessToken', 'phoneNumberId', 'webhookToken'].forEach((field) => {
          const nextValue = String(body?.[field] || '').trim();
          const previousValue = String(entry?.[field] || '').trim();
          if (nextValue && nextValue !== previousValue) {
            entry[field] = nextValue;
            rotatedFields.push(field);
          }
        });
        if (rotatedFields.length) {
          entry.credentialVersion = Math.max(1, Number(entry.credentialVersion || 1) || 1) + 1;
          entry.lastRotatedAt = '2026-03-29T08:30:00.000Z';
          entry.lastRotatedBy = { _id: 'admin-1', name: 'Finance Manager' };
        }
        appendDeliveryProviderAuditEntry(entry, {
          action: changedFields.length ? 'config_saved' : 'created',
          note: String(body?.note || '').trim(),
          changedFields,
          rotatedFields,
          at: '2026-03-29T08:30:00.000Z'
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            item: buildDeliveryProviderConfigItem(channel),
            message: 'تنظیمات provider ذخیره شد.'
          })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: deliveryProviderConfigState.items.map((item) => buildDeliveryProviderConfigItem(item.channel)).filter(Boolean)
        })
      });
    });

    await page.route('**/api/finance/admin/delivery-providers/*/rotate', async (route) => {
      const url = new URL(route.request().url());
      const channel = url.pathname.split('/').slice(-2)[0] || 'sms';
      const body = route.request().postDataJSON();
      let entry = deliveryProviderConfigState.items.find((item) => String(item?.channel || '') === String(channel || '').trim()) || null;
      if (!entry) {
        entry = {
          channel: String(channel || 'sms').trim() || 'sms',
          source: 'database',
          credentialVersion: 1,
          lastRotatedAt: null,
          lastRotatedBy: null,
          auditTrail: []
        };
        deliveryProviderConfigState.items.push(entry);
      }
      const rotatedFields = ['accountSid', 'authToken', 'accessToken', 'phoneNumberId', 'webhookToken']
        .filter((field) => {
          const nextValue = String(body?.[field] || '').trim();
          const previousValue = String(entry?.[field] || '').trim();
          if (nextValue && nextValue !== previousValue) {
            entry[field] = nextValue;
            return true;
          }
          return false;
        });
      entry.credentialVersion = Math.max(1, Number(entry.credentialVersion || 1) || 1) + 1;
      entry.lastRotatedAt = '2026-03-29T09:15:00.000Z';
      entry.lastRotatedBy = { _id: 'admin-1', name: 'Finance Manager' };
      entry.updatedAt = '2026-03-29T09:15:00.000Z';
      entry.updatedBy = { _id: 'admin-1', name: 'Finance Manager' };
      appendDeliveryProviderAuditEntry(entry, {
        action: 'credentials_rotated',
        note: String(body?.note || '').trim(),
        rotatedFields,
        at: '2026-03-29T09:15:00.000Z'
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item: buildDeliveryProviderConfigItem(channel),
          message: 'rotation credentialها ثبت شد.'
        })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: deliveryCampaignState.items })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: deliveryTemplates.map((item) => buildDeliveryTemplateItem(item.key)), variables: deliveryTemplateVariables })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/templates/*/draft', async (route) => {
      const body = route.request().postDataJSON();
      const templateKey = decodeURIComponent(route.request().url().split('/templates/')[1].split('/draft')[0] || '');
      let registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === templateKey) || null;
      if (!registry) {
        registry = { key: templateKey, currentPublishedVersion: 1, currentDraftVersion: null, versions: [], history: [] };
        deliveryTemplateRegistry.push(registry);
      }
      const nextVersionNumber = Number(registry.currentDraftVersion || 0)
        || (registry.versions.reduce((max, item) => Math.max(max, Number(item?.versionNumber || 0) || 0), 1) + 1);
      const existing = registry.versions.find((item) => Number(item?.versionNumber || 0) === nextVersionNumber) || null;
      const subject = String(body?.subject || body?.messageTemplateSubject || '').trim();
      const templateBody = String(body?.body || body?.messageTemplateBody || '').trim();
      const changeNote = String(body?.changeNote || body?.note || '').trim();
      if (existing) {
        existing.subject = subject;
        existing.body = templateBody;
        existing.changeNote = changeNote;
        existing.status = 'draft';
        existing.approvalStage = 'draft';
        existing.reviewRequestedAt = null;
        existing.reviewRequestedBy = null;
        existing.reviewNote = '';
        existing.approvedAt = null;
        existing.approvedBy = null;
        existing.approvalNote = '';
        existing.rejectedAt = null;
        existing.rejectedBy = null;
        existing.rejectionNote = '';
      } else {
        registry.versions.push({
          versionNumber: nextVersionNumber,
          status: 'draft',
          approvalStage: 'draft',
          subject,
          body: templateBody,
          changeNote,
          source: 'custom',
          createdAt: '2026-03-28T09:00:00.000Z'
        });
      }
      registry.currentDraftVersion = nextVersionNumber;
      registry.history = [{
        action: 'draft_saved',
        versionNumber: nextVersionNumber,
        at: '2026-03-28T09:00:00.000Z',
        by: { _id: 'admin-1', name: 'Finance Manager' }
      }, ...(registry.history || [])];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: buildDeliveryTemplateItem(templateKey), message: 'Draft saved.' })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/templates/*/review', async (route) => {
      const body = route.request().postDataJSON();
      const templateKey = decodeURIComponent(route.request().url().split('/templates/')[1].split('/review')[0] || '');
      const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === templateKey) || null;
      const versionNumber = Number(body?.versionNumber || registry?.currentDraftVersion || 0) || 0;
      const target = registry?.versions?.find((item) => Number(item?.versionNumber || 0) === versionNumber) || null;
      if (!target) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Template version not found.' })
        });
        return;
      }
      target.approvalStage = 'pending_review';
      target.reviewRequestedAt = '2026-03-28T09:30:00.000Z';
      target.reviewRequestedBy = { _id: 'admin-1', name: 'Finance Manager' };
      target.reviewNote = String(body?.note || '').trim();
      target.approvedAt = null;
      target.approvedBy = null;
      target.approvalNote = '';
      target.rejectedAt = null;
      target.rejectedBy = null;
      target.rejectionNote = '';
      registry.history = [{
        action: 'review_requested',
        versionNumber,
        at: '2026-03-28T09:30:00.000Z',
        by: { _id: 'admin-1', name: 'Finance Manager' }
      }, ...(registry.history || [])];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: buildDeliveryTemplateItem(templateKey), message: 'Template sent for review.' })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/templates/*/approve', async (route) => {
      const body = route.request().postDataJSON();
      const templateKey = decodeURIComponent(route.request().url().split('/templates/')[1].split('/approve')[0] || '');
      const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === templateKey) || null;
      const versionNumber = Number(body?.versionNumber || registry?.currentDraftVersion || 0) || 0;
      const target = registry?.versions?.find((item) => Number(item?.versionNumber || 0) === versionNumber) || null;
      if (!target) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Template version not found.' })
        });
        return;
      }
      target.approvalStage = 'approved';
      target.approvedAt = '2026-03-28T09:45:00.000Z';
      target.approvedBy = { _id: 'admin-2', name: 'Finance Lead' };
      target.approvalNote = String(body?.note || '').trim();
      target.rejectedAt = null;
      target.rejectedBy = null;
      target.rejectionNote = '';
      registry.history = [{
        action: 'approved',
        versionNumber,
        at: '2026-03-28T09:45:00.000Z',
        by: { _id: 'admin-2', name: 'Finance Lead' }
      }, ...(registry.history || [])];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: buildDeliveryTemplateItem(templateKey), message: 'Template approved.' })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/templates/*/reject', async (route) => {
      const body = route.request().postDataJSON();
      const templateKey = decodeURIComponent(route.request().url().split('/templates/')[1].split('/reject')[0] || '');
      const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === templateKey) || null;
      const versionNumber = Number(body?.versionNumber || registry?.currentDraftVersion || 0) || 0;
      const target = registry?.versions?.find((item) => Number(item?.versionNumber || 0) === versionNumber) || null;
      if (!target) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Template version not found.' })
        });
        return;
      }
      target.approvalStage = 'rejected';
      target.rejectedAt = '2026-03-28T09:50:00.000Z';
      target.rejectedBy = { _id: 'admin-2', name: 'Finance Lead' };
      target.rejectionNote = String(body?.note || '').trim();
      target.approvedAt = null;
      target.approvedBy = null;
      target.approvalNote = '';
      registry.history = [{
        action: 'rejected',
        versionNumber,
        at: '2026-03-28T09:50:00.000Z',
        by: { _id: 'admin-2', name: 'Finance Lead' }
      }, ...(registry.history || [])];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: buildDeliveryTemplateItem(templateKey), message: 'Template rejected.' })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/templates/*/publish', async (route) => {
      const body = route.request().postDataJSON();
      const templateKey = decodeURIComponent(route.request().url().split('/templates/')[1].split('/publish')[0] || '');
      const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === templateKey) || null;
      const versionNumber = Number(body?.versionNumber || registry?.currentDraftVersion || 0) || 0;
      const target = registry?.versions?.find((item) => Number(item?.versionNumber || 0) === versionNumber) || null;
      if (!target) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Template version not found.' })
        });
        return;
      }
      if (versionNumber > 1 && String(target?.approvalStage || '') !== 'approved') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Template must be approved before publishing.' })
        });
        return;
      }
      if (registry) {
        registry.versions.forEach((item) => {
          if (Number(item?.versionNumber || 0) === versionNumber) {
            item.status = 'published';
            item.approvalStage = 'approved';
          } else if (String(item?.status || '') === 'published') item.status = 'archived';
        });
        registry.currentPublishedVersion = versionNumber || 1;
        if (Number(registry.currentDraftVersion || 0) === versionNumber) registry.currentDraftVersion = null;
        registry.history = [{
          action: 'published',
          versionNumber,
          at: '2026-03-28T10:00:00.000Z',
          by: { _id: 'admin-1', name: 'Finance Manager' }
        }, ...(registry.history || [])];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: buildDeliveryTemplateItem(templateKey), message: 'Template published.' })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/templates/*/archive', async (route) => {
      const body = route.request().postDataJSON();
      const templateKey = decodeURIComponent(route.request().url().split('/templates/')[1].split('/archive')[0] || '');
      const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === templateKey) || null;
      const versionNumber = Number(body?.versionNumber || 0) || 0;
      const target = registry?.versions?.find((item) => Number(item?.versionNumber || 0) === versionNumber) || null;
      if (target) {
        target.status = 'archived';
        if (Number(registry.currentDraftVersion || 0) === versionNumber) registry.currentDraftVersion = null;
        registry.history = [{
          action: 'archived',
          versionNumber,
          at: '2026-03-28T11:00:00.000Z',
          by: { _id: 'admin-1', name: 'Finance Manager' }
        }, ...(registry.history || [])];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: buildDeliveryTemplateItem(templateKey), message: 'Template archived.' })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/templates/*/rollback', async (route) => {
      const body = route.request().postDataJSON();
      const templateKey = decodeURIComponent(route.request().url().split('/templates/')[1].split('/rollback')[0] || '');
      const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === templateKey) || null;
      const versionNumber = Number(body?.versionNumber || 0) || 0;
      if (registry) {
        registry.versions.forEach((item) => {
          if (String(item?.status || '') === 'published') item.status = 'archived';
          if (Number(item?.versionNumber || 0) === versionNumber) item.status = 'published';
        });
        registry.currentPublishedVersion = versionNumber || 1;
        registry.history = [{
          action: 'rolled_back',
          versionNumber,
          at: '2026-03-28T12:00:00.000Z',
          by: { _id: 'admin-1', name: 'Finance Manager' }
        }, ...(registry.history || [])];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: buildDeliveryTemplateItem(templateKey), message: 'Template rolled back.' })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/template-preview', async (route) => {
      const body = route.request().postDataJSON();
      const preview = buildDeliveryTemplatePreview(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, preview })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/analytics*', async (route) => {
      const url = new URL(route.request().url());
      const filters = {
        channel: String(url.searchParams.get('channel') || '').trim(),
        status: String(url.searchParams.get('status') || '').trim(),
        provider: String(url.searchParams.get('provider') || '').trim(),
        failureCode: String(url.searchParams.get('failureCode') || '').trim(),
        retryable: String(url.searchParams.get('retryable') || '').trim()
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, analytics: buildDeliveryAnalytics(filters) })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/retry-queue?*', async (route) => {
      const url = new URL(route.request().url());
      const filters = {
        channel: String(url.searchParams.get('channel') || '').trim(),
        status: String(url.searchParams.get('status') || '').trim(),
        provider: String(url.searchParams.get('provider') || '').trim(),
        failureCode: String(url.searchParams.get('failureCode') || '').trim(),
        retryable: String(url.searchParams.get('retryable') || '').trim()
      };
      const limit = Number(url.searchParams.get('limit') || 12);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: buildDeliveryRetryQueue(filters).slice(0, limit) })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/recovery-queue?*', async (route) => {
      const url = new URL(route.request().url());
      const filters = {
        channel: String(url.searchParams.get('channel') || '').trim(),
        status: String(url.searchParams.get('status') || '').trim(),
        provider: String(url.searchParams.get('provider') || '').trim(),
        failureCode: String(url.searchParams.get('failureCode') || '').trim(),
        retryable: String(url.searchParams.get('retryable') || '').trim(),
        recoveryState: String(url.searchParams.get('recoveryState') || '').trim()
      };
      const limit = Number(url.searchParams.get('limit') || 12);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: buildDeliveryRecoveryQueue(filters).slice(0, limit) })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns', async (route) => {
      const body = route.request().postDataJSON();
      const channel = String(body?.channel || 'email');
      const template = body?.messageTemplateKey
        ? buildDeliveryTemplateItem(String(body?.messageTemplateKey || '').trim())
        : null;
      const templateVersion = resolveDeliveryTemplateVersion(
        template,
        body?.templateVersionNumber || body?.messageTemplateVersionNumber || body?.versionNumber || null
      );
      const recipientHandles = String(body?.recipientHandles || body?.recipientEmails || '')
        .split(/[\n,;,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      const targets = channel === 'sms'
        ? [{
            archiveId: documentArchiveState.items[0]?._id || 'doc-1',
            documentNo: documentArchiveState.items[0]?.documentNo || 'MCP-202603-1',
            channel,
            status: 'failed',
            recipient: recipientHandles[0] || '+93700111222',
            recipientCount: 1,
            attempts: 1,
            lastAttemptAt: '2026-03-28T11:05:00.000Z',
            lastError: 'sms_gateway_timeout',
            provider: 'mock_sms_gateway',
            providerMessageId: '',
            providerStatus: 'timeout',
            lastFailureCode: 'provider_timeout',
            retryable: true,
            nextRetryAt: '2026-03-28T11:20:00.000Z'
          }]
        : [];
      const item = {
        _id: `campaign-${deliveryCampaignState.items.length + 1}`,
        name: String(body?.name || 'Finance campaign'),
        status: 'active',
        documentType: String(body?.documentType || 'batch_statement_pack'),
        channel,
        classId: String(body?.classId || ''),
        classTitle: String(body?.classId || '') === 'class-1' ? 'Class One Core' : '',
        academicYearId: String(body?.academicYearId || ''),
        academicYearTitle: String(body?.academicYearId || '') === 'year-1' ? '1406' : '',
        monthKey: String(body?.monthKey || ''),
        messageTemplateKey: String(body?.messageTemplateKey || ''),
        templateVersionNumber: Number(templateVersion?.versionNumber || 0) || null,
        messageTemplateSubject: String(body?.messageTemplateSubject || templateVersion?.subject || template?.defaultSubject || ''),
        messageTemplateBody: String(body?.messageTemplateBody || templateVersion?.body || template?.defaultBody || ''),
        recipientHandles,
        recipientEmails: recipientHandles,
        includeLinkedAudience: body?.includeLinkedAudience === true,
        automationEnabled: body?.automationEnabled !== false,
        retryFailed: body?.retryFailed !== false,
        intervalHours: Number(body?.intervalHours || 24),
        maxDocumentsPerRun: Number(body?.maxDocumentsPerRun || 5),
        note: String(body?.note || ''),
        nextRunAt: body?.automationEnabled !== false ? '2026-03-29T08:00:00.000Z' : null,
        lastRunAt: null,
        lastRunStatus: 'idle',
        targetSummary: {
          total: targets.length,
          successful: 0,
          failed: targets.filter((target) => target.status === 'failed').length,
          skipped: 0
        },
        targets,
        runLog: []
      };
      deliveryCampaignState.items = [item, ...deliveryCampaignState.items];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item,
          message: 'کمپاین delivery مالی ایجاد شد.'
        })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/run-due', async (route) => {
      deliveryCampaignState.items = deliveryCampaignState.items.map((item, index) => (
        index === 0
          ? {
              ...item,
              lastRunAt: '2026-03-28T11:00:00.000Z',
              lastRunStatus: 'success',
              targetSummary: { total: 1, successful: 1, failed: 0, skipped: 0 },
              runLog: [
                {
                  runAt: '2026-03-28T11:00:00.000Z',
                  mode: 'automation',
                  status: 'success',
                  actorName: 'system'
                },
                ...(item.runLog || [])
              ]
            }
          : item
      ));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          result: {
            executed: deliveryCampaignState.items.length,
            deliveredDocuments: deliveryCampaignState.items.length,
            failedDocuments: 0
          },
          message: 'صف کمپاین‌های آماده اجرا شد.'
        })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/*/run', async (route) => {
      const url = new URL(route.request().url());
      const campaignId = url.pathname.split('/').slice(-2, -1)[0];
      deliveryCampaignState.items = deliveryCampaignState.items.map((item) => (
        String(item._id || '') === String(campaignId || '')
          ? {
              ...item,
              lastRunAt: '2026-03-28T11:15:00.000Z',
              lastRunStatus: 'success',
              targetSummary: { total: 2, successful: 2, failed: 0, skipped: 0 },
              runLog: [
                {
                  runAt: '2026-03-28T11:15:00.000Z',
                  mode: 'manual',
                  status: 'success',
                  actorName: 'Finance Manager'
                },
                ...(item.runLog || [])
              ]
            }
          : item
      ));
      const item = deliveryCampaignState.items.find((entry) => String(entry._id || '') === String(campaignId || '')) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item,
          summary: {
            deliveredDocuments: 2
          },
          message: 'کمپاین delivery اجرا شد.'
        })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/*/status', async (route) => {
      const url = new URL(route.request().url());
      const campaignId = url.pathname.split('/').slice(-2, -1)[0];
      const body = route.request().postDataJSON();
      deliveryCampaignState.items = deliveryCampaignState.items.map((item) => (
        String(item._id || '') === String(campaignId || '')
          ? {
              ...item,
              status: String(body?.status || 'active'),
              nextRunAt: String(body?.status || 'active') === 'paused' ? null : '2026-03-29T08:00:00.000Z'
            }
          : item
      ));
      const item = deliveryCampaignState.items.find((entry) => String(entry._id || '') === String(campaignId || '')) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item,
          message: 'وضعیت کمپاین delivery به‌روزرسانی شد.'
        })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/*/retry-target', async (route) => {
      const url = new URL(route.request().url());
      const campaignId = url.pathname.split('/').slice(-2, -1)[0];
      const body = route.request().postDataJSON();
      deliveryCampaignState.items = deliveryCampaignState.items.map((item) => {
        if (String(item._id || '') !== String(campaignId || '')) return item;
        const targets = Array.isArray(item.targets) ? item.targets.map((target) => (
          String(target.archiveId || '') === String(body?.archiveId || '')
            ? {
                ...target,
                status: 'resent',
                attempts: Number(target.attempts || 0) + 1,
                lastAttemptAt: '2026-03-28T11:10:00.000Z',
                lastDeliveredAt: '2026-03-28T11:10:00.000Z',
                lastError: '',
                lastFailureCode: '',
                retryable: false,
                nextRetryAt: null,
                provider: target.provider || 'mock_sms_gateway',
                providerMessageId: 'mock_sms_gateway-retry-001',
                providerStatus: 'accepted'
              }
            : target
        )) : [];
        return {
          ...item,
          targets,
          targetSummary: {
            total: targets.length,
            successful: targets.filter((target) => ['sent', 'resent', 'delivered'].includes(target.status)).length,
            failed: targets.filter((target) => target.status === 'failed').length,
            skipped: targets.filter((target) => target.status === 'skipped').length
          }
        };
      });
      const item = deliveryCampaignState.items.find((entry) => String(entry._id || '') === String(campaignId || '')) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          item,
          message: 'retry موفق بود.'
        })
      });
    });

    await page.route('**/api/finance/admin/delivery-campaigns/recovery-queue/replay', async (route) => {
      const body = route.request().postDataJSON();
      const providerMessageId = String(body?.providerMessageId || '').trim();
      const providerStatus = String(body?.providerStatus || '').trim();
      documentArchiveState.items = documentArchiveState.items.map((archive) => ({
        ...archive,
        deliveryLog: Array.isArray(archive.deliveryLog) ? archive.deliveryLog.map((entry) => (
          String(entry?.providerMessageId || '').trim() === providerMessageId
            ? {
                ...entry,
                status: ['delivered', 'read', 'seen'].includes(providerStatus) ? 'delivered' : (providerStatus === 'failed' ? 'failed' : entry.status),
                providerStatus,
                errorMessage: providerStatus === 'failed' ? (String(body?.errorMessage || '').trim() || 'manual recovery replay') : '',
                failureCode: providerStatus === 'failed' ? (String(body?.failureCode || '').trim() || 'provider_rejected') : '',
                retryable: false,
                nextRetryAt: null,
                sentAt: String(body?.occurredAt || '2026-03-29T12:00:00.000Z')
              }
            : entry
        )) : []
      }));
      deliveryCampaignState.items = deliveryCampaignState.items.map((campaign) => ({
        ...campaign,
        targets: Array.isArray(campaign.targets) ? campaign.targets.map((target) => (
          String(target?.providerMessageId || '').trim() === providerMessageId
            ? {
                ...target,
                status: ['delivered', 'read', 'seen'].includes(providerStatus) ? 'delivered' : (providerStatus === 'failed' ? 'failed' : target.status),
                providerStatus,
                lastError: providerStatus === 'failed' ? (String(body?.errorMessage || '').trim() || 'manual recovery replay') : '',
                lastFailureCode: providerStatus === 'failed' ? (String(body?.failureCode || '').trim() || 'provider_rejected') : '',
                retryable: false,
                nextRetryAt: null,
                lastAttemptAt: String(body?.occurredAt || '2026-03-29T12:00:00.000Z'),
                lastDeliveredAt: ['delivered', 'read', 'seen'].includes(providerStatus) ? String(body?.occurredAt || '2026-03-29T12:00:00.000Z') : target.lastDeliveredAt
              }
            : target
        )) : []
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          result: {
            provider: String(body?.provider || '').trim(),
            providerMessageId,
            providerStatus,
            matchedArchive: documentArchiveState.items.some((archive) => (
              Array.isArray(archive.deliveryLog) && archive.deliveryLog.some((entry) => String(entry?.providerMessageId || '').trim() === providerMessageId)
            )) ? 1 : 0,
            matchedCampaigns: deliveryCampaignState.items.filter((campaign) => (
              Array.isArray(campaign.targets) && campaign.targets.some((target) => String(target?.providerMessageId || '').trim() === providerMessageId)
            )).length
          },
          message: 'replay وضعیت provider انجام شد.'
        })
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
          ? { ...item, approvalStage: 'finance_lead_review' }
          : item
      ));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'رسید به مرحله بعد ارسال شد',
          nextStage: 'finance_lead_review',
          requiresFinalApproval: true
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
    await expect(page.getByTestId('income-trend-card')).toBeVisible();
    await page.getByTestId('income-trend-card').locator('button').nth(2).click();
    await expect(page.getByTestId('paid-vs-due-card')).toBeVisible();
    await financeTabs.nth(1).click();

    await expect(page.locator('.finance-page h2')).toBeVisible();
    await expect(page.locator('.receipt-inspector')).toContainText('Student Alpha');
    await expect(page.locator('.receipt-file-link')).toContainText('نمایش فایل رسید');
    await expect(page.locator('.receipt-inspector .receipt-note-box .trail-item')).toHaveCount(1);
    await expect(page.locator('.receipt-inspector .receipt-trail .trail-item')).toHaveCount(1);
    await expect(page.getByTestId('cashier-daily-report')).toContainText('Finance Manager');
    await expect(page.getByTestId('cashier-daily-report')).toContainText('انتقال بانکی');
    await expect(page.locator('.receipt-inspector')).toContainText('Finance Manager');
    await page.getByTestId('print-selected-receipt').click();
    await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
    await expect(page.getByTestId('printable-receipt-sheet')).toContainText('رسید رسمی پرداخت فیس');

    await expect(page.locator('.receipt-inbox-summary')).toContainText(/3|۳/);
    const receiptFilters = page.locator('#pending-receipts .finance-inline-filter select');
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

    await receiptFilters.nth(0).selectOption('finance_lead_review');
    await expect(page.locator('.finance-table.receipts-table .row')).toHaveCount(1);
    await expect(page.locator('.finance-table.receipts-table .row')).toContainText('Student Beta');

    await receiptFilters.nth(0).selectOption('all');
    await page.locator('.finance-table.receipts-table .row').filter({ hasText: 'Student Alpha' }).first().getByRole('button', { name: 'ارسال به آمریت' }).click();
    await expect.poll(() => approveCalls).toBe(1);

    await financeTabs.nth(4).click();
    await expect(page.getByTestId('finance-anomalies-card')).toContainText('Student Alpha');
    await expect(page.getByTestId('finance-anomalies-card')).toContainText('Student Beta');
    await page.getByTestId('anomaly-assigned-level').selectOption('finance_lead');
    await page.getByTestId('anomaly-note-input').fill('Escalate overdue case to finance lead');
    await page.getByTestId('anomaly-assign-button').click();
    await expect(page.getByTestId('finance-anomaly-inspector')).toContainText('Escalate overdue case to finance lead');
    await expect(page.getByTestId('finance-anomaly-inspector')).toContainText(/ارجاع|assigned/i);
    await page.getByTestId('anomaly-snooze-until').fill('2026-04-15');
    await page.getByTestId('anomaly-note-input').fill('Pause follow-up until the guardian call');
    await page.getByTestId('anomaly-snooze-button').click();
    await expect(page.getByTestId('finance-anomaly-inspector')).toContainText('Pause follow-up until the guardian call');
    await page.getByTestId('anomaly-note-input').fill('Guardian paid directly at the branch');
    await page.getByTestId('anomaly-resolve-button').click();
    await expect(page.getByTestId('finance-anomaly-inspector')).toContainText('Guardian paid directly at the branch');
    await expect(page.getByTestId('by-class-report-card')).toContainText('Class Two Core');
    await page.getByTestId('report-class-filter').selectOption('class-1');
    await expect(page.getByTestId('finance-anomalies-card')).not.toContainText('Student Beta');
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
    await expect(page.getByTestId('month-close-snapshot-card')).toContainText('در انتظار آمریت مالی');
    await expect(page.getByTestId('month-close-approval-trail')).toContainText('Manager approved the package');

    await page.getByTestId('export-month-close-snapshot').click();
    await expect.poll(() => monthCloseExportCalls).toBe(1);
    await expect.poll(() => lastMonthCloseExportUrl).toContain('/api/finance/admin/month-close/');

    await page.getByTestId('export-month-close-pdf').click();
    await expect.poll(() => monthClosePdfExportCalls).toBe(1);
    await expect.poll(() => lastMonthClosePdfUrl).toContain('/api/finance/admin/month-close/');
    await expect(page.getByTestId('finance-delivery-provider-config-card')).toContainText('mock_sms_gateway');
    await page.getByTestId('finance-delivery-provider-mode').selectOption('twilio');
    await page.getByTestId('finance-delivery-provider-name').fill('twilio_sms_gateway');
    await page.getByTestId('finance-delivery-provider-from-handle').fill('+93700999000');
    await page.getByTestId('finance-delivery-provider-account-sid').fill('AC1234567890');
    await page.getByTestId('finance-delivery-provider-auth-token').fill('secret-token-12345');
    await page.getByTestId('finance-delivery-provider-webhook-token').fill('sms-hook-token');
    await page.getByTestId('finance-delivery-provider-save').click();
    await expect(page.getByTestId('finance-delivery-provider-status')).toContainText('twilio_sms_gateway');
    await expect(page.getByTestId('finance-delivery-provider-status')).toContainText('/api/finance/delivery/providers/twilio/status');
    await page.getByTestId('finance-delivery-provider-auth-token').fill('rotated-secret-67890');
    await page.getByTestId('finance-delivery-provider-rotation-note').fill('Monthly secret rotation');
    await page.getByTestId('finance-delivery-provider-rotate').click();
    await expect(page.getByTestId('finance-delivery-provider-status')).toContainText('Credential Version');
    await expect(page.getByTestId('finance-delivery-provider-audit-trail')).toContainText('Monthly secret rotation');
    await expect(page.getByTestId('finance-delivery-provider-audit-trail')).toContainText('rotation');
    await expect(page.getByTestId('finance-document-archive-card')).toContainText('MCP-202603-1');
    await page.getByTestId('finance-delivery-campaign-template').selectOption('monthly_statement');
    await expect(page.getByTestId('finance-delivery-template-variable-catalog')).toContainText('Document No');
    await expect(page.getByTestId('finance-delivery-template-variable-catalog')).toContainText('{{documentNo}}');
    await expect(page.getByTestId('finance-delivery-template-preview')).toContainText('MCP-202603-001');
    await expect(page.getByTestId('finance-delivery-template-preview')).toContainText('Finance statement MCP-202603-001');
    await page.getByTestId('finance-delivery-campaign-template-subject').fill('Custom statement {{documentNo}}');
    await page.getByTestId('finance-delivery-campaign-template-body').fill('Custom body {{documentNo}} for {{subjectName}}');
    await page.getByTestId('finance-delivery-template-change-note').fill('Version 2 draft');
    await page.getByTestId('finance-delivery-template-save-draft').click();
    await expect(page.getByTestId('finance-delivery-template-version-manager')).toContainText('draft');
    await expect(page.getByTestId('finance-delivery-template-version-select')).toContainText('v2');
    await expect(page.getByTestId('finance-delivery-template-governance-summary')).toContainText('پیش‌نویس');
    await expect(page.getByTestId('finance-delivery-template-preview-rollout')).toContainText('رکورد آرشیف');
    await page.getByTestId('finance-delivery-template-request-review').click();
    await expect(page.getByTestId('finance-delivery-template-approve')).toBeEnabled();
    await page.getByTestId('finance-delivery-template-approve').click();
    await expect(page.getByTestId('finance-delivery-template-publish-draft')).toBeEnabled();
    await page.getByTestId('finance-delivery-template-publish-draft').click();
    await expect(page.getByTestId('finance-delivery-template-version-manager')).toContainText('published');
    await expect(page.getByTestId('finance-delivery-campaign-template-subject')).toHaveValue('Custom statement {{documentNo}}');

    await page.getByTestId('finance-delivery-campaign-name').fill('Monthly statement campaign');
    await page.getByTestId('finance-delivery-campaign-document-type').selectOption('batch_statement_pack');
    await page.getByTestId('finance-delivery-campaign-channel').selectOption('email');
    await page.getByTestId('finance-delivery-campaign-save').click();
    await page.getByTestId('finance-delivery-retry-channel').selectOption('sms');
    await page.getByTestId('finance-delivery-retry-channel').selectOption('all');
    await expect(page.getByTestId('finance-delivery-campaign-list')).toContainText('Monthly statement campaign');
    await expect(page.getByTestId('finance-delivery-campaign-detail')).toContainText('۰ موفق / ۰ ناموفق');
    await expect(page.getByTestId('finance-delivery-campaign-detail')).toContainText('Monthly Statement');
    await expect(page.getByTestId('finance-delivery-campaign-detail')).toContainText('Custom statement {{documentNo}}');
    await expect(page.getByTestId('finance-delivery-analytics')).toContainText('تحویل‌ها');

    deliveryCampaignState.items = [{
      _id: 'campaign-retry-sms',
      name: 'SMS collection campaign',
      status: 'active',
      documentType: 'student_statement',
      channel: 'sms',
      classId: 'class-1',
      classTitle: 'Class One Core',
      academicYearId: 'year-1',
      academicYearTitle: '1406',
      monthKey: '2026-03',
      messageTemplateKey: 'balance_followup',
      messageTemplateSubject: 'Payment follow-up {{documentNo}}',
      messageTemplateBody: 'Please review finance document {{documentNo}}.',
      recipientHandles: ['+93700111222'],
      recipientEmails: ['+93700111222'],
      includeLinkedAudience: true,
      automationEnabled: false,
      retryFailed: true,
      intervalHours: 24,
      maxDocumentsPerRun: 5,
      note: 'Retry flow',
      nextRunAt: null,
      lastRunAt: '2026-03-28T11:05:00.000Z',
      lastRunStatus: 'failed',
      targetSummary: { total: 1, successful: 0, failed: 1, skipped: 0 },
      targets: [
        {
          archiveId: documentArchiveState.items[0]?._id || 'doc-1',
          documentNo: documentArchiveState.items[0]?.documentNo || 'MCP-202603-1',
          channel: 'sms',
          status: 'failed',
          recipient: '+93700111222',
          recipientCount: 1,
          attempts: 1,
          lastAttemptAt: '2026-03-28T11:05:00.000Z',
          lastError: 'sms_gateway_timeout',
          provider: 'mock_sms_gateway',
          providerMessageId: '',
          providerStatus: 'timeout',
          lastFailureCode: 'provider_timeout',
          retryable: true,
          nextRetryAt: '2026-03-28T11:20:00.000Z'
        }
      ],
      runLog: []
    }, ...deliveryCampaignState.items];
    await page.getByTestId('finance-delivery-retry-channel').selectOption('sms');
    await expect(page.getByTestId('finance-delivery-provider-breakdown')).toContainText('mock_sms_gateway');
    await expect(page.getByTestId('finance-delivery-failure-breakdown')).toContainText('provider_timeout');
    await page.getByTestId('finance-delivery-provider-filter').selectOption('mock_sms_gateway');
    await page.getByTestId('finance-delivery-retryability-filter').selectOption('retryable');
    await expect(page.getByTestId('finance-delivery-retry-queue')).toContainText('SMS collection campaign');
    await expect(page.getByTestId('finance-delivery-retry-queue')).toContainText('mock_sms_gateway');
    await expect(page.getByTestId('finance-delivery-retry-queue')).toContainText('provider_timeout');
    await page.getByTestId('finance-delivery-retry-button-0').click();
    await expect(page.getByTestId('finance-delivery-retry-queue')).toContainText('در حال حاضر مورد ناموفق برای retry وجود ندارد');
    await page.getByTestId('finance-delivery-provider-filter').selectOption('all');
    await page.getByTestId('finance-delivery-retryability-filter').selectOption('all');

    documentArchiveState.items = documentArchiveState.items.map((item, index) => (
      index === 0
        ? {
            ...item,
            deliveryLog: [
              ...(Array.isArray(item.deliveryLog) ? item.deliveryLog : []),
              {
                channel: 'sms',
                status: 'sent',
                recipient: '+93700111444',
                recipientCount: 1,
                linkedAudienceNotified: false,
                subject: 'Recovery queue test',
                provider: 'mock_sms_gateway',
                providerMessageId: 'mock-recovery-001',
                providerStatus: 'accepted',
                note: 'Awaiting callback',
                errorMessage: '',
                failureCode: '',
                retryable: false,
                nextRetryAt: null,
                sentAt: '2026-03-01T08:00:00.000Z'
              }
            ],
            lastDeliveryStatus: 'sent'
          }
        : item
    ));
    deliveryCampaignState.items = [{
      _id: 'campaign-recovery-ui',
      name: 'Recovery callback campaign',
      status: 'active',
      documentType: 'student_statement',
      channel: 'sms',
      classId: 'class-1',
      classTitle: 'Class One Core',
      academicYearId: 'year-1',
      academicYearTitle: '1406',
      monthKey: '2026-03',
      messageTemplateKey: 'balance_followup',
      messageTemplateSubject: 'Payment follow-up {{documentNo}}',
      messageTemplateBody: 'Please review finance document {{documentNo}}.',
      recipientHandles: ['+93700111444'],
      recipientEmails: ['+93700111444'],
      includeLinkedAudience: true,
      automationEnabled: false,
      retryFailed: true,
      intervalHours: 24,
      maxDocumentsPerRun: 5,
      note: 'Recovery flow',
      nextRunAt: null,
      lastRunAt: '2026-03-28T11:25:00.000Z',
      lastRunStatus: 'partial',
      targetSummary: { total: 1, successful: 1, failed: 0, skipped: 0 },
      targets: [
        {
          archiveId: documentArchiveState.items[0]?._id || 'doc-1',
          documentNo: documentArchiveState.items[0]?.documentNo || 'MCP-202603-1',
          channel: 'sms',
          status: 'sent',
          recipient: '+93700111444',
          recipientCount: 1,
          attempts: 1,
          lastAttemptAt: '2026-03-01T08:00:00.000Z',
          lastDeliveredAt: null,
          lastError: '',
          provider: 'mock_sms_gateway',
          providerMessageId: 'mock-recovery-001',
          providerStatus: 'accepted',
          lastFailureCode: '',
          retryable: false,
          nextRetryAt: null
        }
      ],
      runLog: []
    }, ...deliveryCampaignState.items];
    await page.getByTestId('finance-delivery-recovery-state-filter').selectOption('awaiting_callback');
    await expect(page.getByTestId('finance-delivery-recovery-queue')).toContainText('mock-recovery-001');
    await expect(page.getByTestId('finance-delivery-recovery-queue')).toContainText('Recovery callback campaign');
    await expect(page.getByTestId('finance-delivery-recovery-replay-0')).toBeVisible();
    await expect(page.getByTestId('finance-delivery-recovery-failed-0')).toBeVisible();
    await page.getByTestId('finance-delivery-recovery-state-filter').selectOption('all');

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
