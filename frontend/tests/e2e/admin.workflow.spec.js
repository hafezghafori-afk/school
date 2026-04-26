import { test, expect } from '@playwright/test';

const adminSession = {
  token: 'mock.header.signature',
  role: 'admin',
  userId: 'admin-1',
  userName: 'Admin Alpha',
  adminLevel: 'general_president',
  orgRole: 'general_president',
  permissions: ['view_reports', 'manage_content', 'manage_finance', 'manage_users', 'manage_schedule']
};

const baseSettings = {
  brandName: 'Alpha Academy',
  brandSubtitle: 'Admin Suite',
  contactLabel: 'تماس',
  contactPhone: '0700123456',
  contactEmail: 'alpha@academy.test',
  contactAddress: 'Alpha Street',
  hoursText: '08:00 - 16:00',
  footerContactText: 'پشتیبانی Alpha',
  mainMenu: [
    {
      key: 'home',
      title: 'خانه',
      href: '/',
      icon: 'fa-house',
      enabled: true,
      children: []
    }
  ],
  menuBlueprints: {
    home: {
      label: 'راهنمای سریع',
      summary: 'Alpha summary',
      points: ['نکته اول'],
      actions: [{ title: 'خانه', href: '/' }],
      sectionOrder: ['خدمات', 'آموزش']
    }
  },
  adminQuickLinks: [
    { title: 'مرکز مالی', href: '/admin-finance', permission: 'manage_finance', enabled: true },
    { title: 'لاگ‌ها', href: '/admin-logs', permission: 'view_reports', enabled: true }
  ]
};

const searchPayload = {
  success: true,
  users: [
    { _id: 'user-1', name: 'Alpha Student', email: 'alpha.student@example.com', role: 'student', orgRole: 'student' }
  ],
  orders: [
    {
      _id: 'order-1',
      user: { _id: 'user-1', name: 'Alpha Student' },
      course: { _id: 'course-1', title: 'Alpha Class' },
      approvalStage: 'finance_manager_review',
      status: 'pending'
    }
  ],
  financeBills: [
    {
      _id: 'bill-1',
      billNumber: 'BL-ALPHA-0001',
      student: { _id: 'user-1', name: 'Alpha Student' },
      course: { _id: 'course-1', title: 'Alpha Class' },
      status: 'overdue'
    }
  ],
  financeReceipts: [
    {
      _id: 'receipt-1',
      bill: { _id: 'bill-1', billNumber: 'BL-ALPHA-0001' },
      student: { _id: 'user-1', name: 'Alpha Student' },
      course: { _id: 'course-1', title: 'Alpha Class' },
      approvalStage: 'finance_manager_review'
    }
  ],
  courses: [
    { _id: 'course-1', title: 'Alpha Class', category: 'Morning', level: '10' }
  ],
  schedules: [
    {
      _id: 'schedule-1',
      course: { _id: 'course-1', title: 'Alpha Class' },
      subject: 'Alpha Math',
      date: '2026-03-10',
      startTime: '08:00',
      endTime: '09:00',
      visibility: 'draft'
    }
  ],
  homework: [
    {
      _id: 'homework-1',
      title: 'Alpha Homework',
      course: { _id: 'course-1', title: 'Alpha Class' },
      dueDate: '2026-03-18T00:00:00.000Z'
    }
  ],
  grades: [
    {
      _id: 'grade-1',
      student: { _id: 'user-1', name: 'Alpha Student' },
      course: { _id: 'course-1', title: 'Alpha Class' },
      totalScore: 88
    }
  ],
  subjects: [
    { _id: 'subject-1', name: 'Alpha Math', code: 'ALP-01', grade: '10' }
  ],
  requests: [
    {
      _id: 'request-1',
      user: { _id: 'user-1', name: 'Alpha Student' },
      requestedData: { email: 'alpha.student@example.com' },
      status: 'pending'
    }
  ],
  accessRequests: [
    {
      _id: 'access-1',
      requester: { _id: 'user-2', name: 'Instructor Alpha' },
      permission: 'view_reports',
      status: 'pending'
    }
  ],
  contacts: [
    { _id: 'contact-1', name: 'Alpha Guardian', status: 'new', createdAt: '2026-03-06T00:00:00.000Z' }
  ],
  news: [
    { _id: 'news-1', title: 'Alpha Bulletin', createdAt: '2026-03-05T00:00:00.000Z' }
  ],
  logs: [
    {
      _id: 'log-1',
      action: 'alpha_review',
      actorRole: 'admin',
      actorOrgRole: 'general_president',
      route: '/admin-finance',
      createdAt: '2026-03-06T00:00:00.000Z'
    }
  ],
  enrollments: [
    { _id: 'enroll-1', studentName: 'Alpha Student', grade: '10', status: 'pending' }
  ],
  settings: [
    {
      _id: 'settings-1',
      brandName: 'Alpha Academy',
      brandSubtitle: 'Admin Suite',
      contactEmail: 'alpha@academy.test'
    }
  ]
};

const setupShellMocks = async (page) => {
  await page.route('**/api/settings/public', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        settings: {
          adminQuickLinks: baseSettings.adminQuickLinks
        }
      })
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

  await page.route('**/api/users/me/notifications/*/unread', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });
};

const setupAdminSession = async (page) => {
  await page.addInitScript((session) => {
    localStorage.setItem('token', session.token);
    localStorage.setItem('role', session.role);
    localStorage.setItem('userId', session.userId);
    localStorage.setItem('userName', session.userName);
    localStorage.setItem('adminLevel', session.adminLevel);
    localStorage.setItem('orgRole', session.orgRole);
    localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
  }, adminSession);
};

const setupAdminPanelMocks = async (page) => {
  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        user: {
          _id: adminSession.userId,
          name: adminSession.userName,
          role: adminSession.role,
          adminLevel: adminSession.adminLevel,
          orgRole: adminSession.orgRole,
          effectivePermissions: adminSession.permissions
        }
      })
    });
  });

  await page.route('**/api/orders/pending', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] })
    });
  });

  await page.route('**/api/student-finance/payments?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        items: [
          {
            id: 'payment-1',
            sourceReceiptId: 'receipt-1',
            amount: 400,
            status: 'pending',
            approvalStage: 'finance_manager_review',
            paidAt: '2026-03-06T00:00:00.000Z',
            student: {
              fullName: 'Alpha Student',
              email: 'alpha.student@example.com'
            },
            schoolClass: {
              id: 'class-1',
              title: 'Alpha Class'
            },
            feeOrder: {
              id: 'order-1',
              sourceBillId: 'bill-1',
              orderNumber: 'BL-ALPHA-0001',
              amountDue: 1000,
              amountPaid: 600,
              status: 'partial'
            },
            receipt: {
              id: 'receipt-1',
              status: 'pending',
              approvalStage: 'finance_manager_review',
              approvalTrail: []
            }
          }
        ]
      })
    });
  });

  await page.route('**/api/admin/profile-update-requests?status=pending', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] })
    });
  });

  await page.route('**/api/contact/admin', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] })
    });
  });

  await page.route('**/api/admin/alerts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        alerts: [
          { key: 'finance_receipts', level: 'high', title: 'رسیدهای مالی در انتظار تایید', count: 2 },
          { key: 'finance_overdue', level: 'high', title: 'بل‌های مالی معوق', count: 1 },
          { key: 'schedule_drafts', level: 'medium', title: 'برنامه‌های draft منتشرنشده', count: 1 },
          { key: 'contacts', level: 'low', title: 'پیام‌های خوانده‌نشده پشتیبانی', count: 3 }
        ]
      })
    });
  });

  await page.route('**/api/admin/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        users: 120,
        courses: 16,
        todayPayments: 4,
        pendingOrders: 2
      })
    });
  });

  await page.route('**/api/admin-logs?action_in=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        items: [
          {
            _id: 'log-1',
            action: 'admin_access_matrix_export_csv',
            actorRole: 'admin',
            route: '/admin',
            createdAt: '2026-03-06T00:00:00.000Z'
          }
        ]
      })
    });
  });

  await page.route('**/api/admin/workflow-report*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        levels: [],
        byType: {},
        breakdown: [],
        totals: {}
      })
    });
  });

  await page.route('**/api/admin/sla/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        timeouts: {
          finance_manager: 120,
          finance_lead: 240,
          general_president: 480
        }
      })
    });
  });

  await page.route('**/api/admin/sla/run', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        result: {
          summary: { totals: { escalated: 0, notifications: 0 } },
          runsAt: '2026-03-06T00:00:00.000Z'
        }
      })
    });
  });

  await page.route('**/api/schedules/today', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        items: [
          {
            _id: 'schedule-1',
            subject: 'Alpha Math',
            course: { _id: 'course-1', title: 'Alpha Class' },
            instructor: { _id: 'inst-1', name: 'Instructor Alpha' },
            startTime: '08:00',
            endTime: '09:00'
          }
        ]
      })
    });
  });

  await page.route('**/api/admin/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(searchPayload)
    });
  });

  await page.route('**/api/admin/client-activity', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });
};

test.describe('admin workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupShellMocks(page);
    await setupAdminSession(page);
  });

  test('admin workflow shows priority alerts and actionable global search', async ({ page }) => {
    await setupAdminPanelMocks(page);

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    const pendingReceiptsAlert = page.locator('.admin-alert').filter({ hasText: 'رسیدهای مالی در انتظار تایید' });
    const overdueBillsAlert = page.locator('.admin-alert').filter({ hasText: 'بل‌های مالی معوق' });
    const scheduleDraftsAlert = page.locator('.admin-alert').filter({ hasText: 'برنامه‌های draft منتشرنشده' });
    const unreadContactsAlert = page.locator('.admin-alert').filter({ hasText: 'پیام‌های خوانده‌نشده پشتیبانی' });

    const pendingReceiptsAlertNormalized = page.locator('.admin-alert').filter({ hasText: /رسیدهای مالی.*تایید/ });
    const overdueBillsAlertNormalized = page.locator('.admin-alert').filter({ hasText: /بل‌های مالی معوق/ });
    const scheduleDraftsAlertNormalized = page.locator('.admin-alert').filter({ hasText: /برنامه.*(پیش‌نویس|draft)/ });
    const unreadContactsAlertNormalized = page.locator('.admin-alert').filter({ hasText: /پیام‌های خوانده‌نشده پشتیبانی/ });

    await expect(pendingReceiptsAlertNormalized).toHaveCount(1);
    await expect(pendingReceiptsAlertNormalized.locator('.admin-alert-link')).toHaveAttribute('href', /\/admin-finance#pending-receipts$/);
    await expect(overdueBillsAlertNormalized).toHaveCount(1);
    await expect(overdueBillsAlertNormalized.locator('.admin-alert-link')).toHaveAttribute('href', /\/admin-finance$/);
    await expect(scheduleDraftsAlertNormalized).toHaveCount(1);
    await expect(scheduleDraftsAlertNormalized.locator('.admin-alert-link')).toHaveAttribute('href', /\/admin-schedule$/);
    await expect(unreadContactsAlertNormalized).toHaveCount(1);
    await expect(unreadContactsAlertNormalized.locator('.admin-alert-link')).toHaveAttribute('href', /\/admin-contact$/);

    await page.getByRole('button', { name: 'جستجوی سراسری' }).click();
    await expect(page.locator('.admin-search-row input')).toBeVisible();
    await page.locator('.admin-search-row input').fill('Alpha');
    await page.locator('.admin-search-row button').click();

    await expect.poll(async () => page.locator('.admin-search-group').count()).toBeGreaterThan(10);
    await expect(page.locator('a.admin-search-item[href$="/admin-finance"]').filter({ hasText: 'BL-ALPHA-0001' })).toHaveCount(1);
    await expect(page.locator('a.admin-search-item[href$="/admin-finance#pending-receipts"]').filter({ hasText: 'BL-ALPHA-0001' })).toHaveCount(1);
    await expect(page.locator('a.admin-search-item[href$="/courses/course-1"]').filter({ hasText: 'Alpha Class' })).toHaveCount(1);
    await expect(page.locator('a.admin-search-item[href$="/admin-settings"]').filter({ hasText: 'Alpha Academy' })).toHaveCount(1);
    await expect(page.locator('a.admin-search-item[href$="/admin-logs"]').filter({ hasText: 'alpha_review' })).toHaveCount(1);
  });

  test('admin notification center filters finance alerts and toggles read state', async ({ page }) => {
    let notifications = [
      {
        _id: 'finance-notify-1',
        title: 'یادآوری بدهی معوق',
        message: 'بل BL-ALPHA-0001 برای Alpha Student معوق است.',
        type: 'finance',
        category: 'finance',
        eventKey: 'reminder',
        level: 'critical',
        sourceModule: 'finance',
        actionUrl: '/admin-finance',
        needsAction: true,
        createdAt: '2026-03-07T08:00:00.000Z',
        readAt: null
      },
      {
        _id: 'finance-notify-2',
        title: 'پیگیری رسید',
        message: 'رسید Student Beta به آمریت مالی ارجاع شد.',
        type: 'finance',
        category: 'finance',
        eventKey: 'workflow',
        level: 'warning',
        sourceModule: 'workflow',
        actionUrl: '/admin-finance#pending-receipts',
        needsAction: true,
        createdAt: '2026-03-07T09:30:00.000Z',
        readAt: null
      },
      {
        _id: 'finance-notify-3',
        title: 'پایان نزدیک تسهیلات',
        message: 'بورسیه جزئی Alpha Student تا دو هفته دیگر ختم می‌شود.',
        type: 'finance',
        category: 'finance',
        eventKey: 'relief',
        level: 'info',
        sourceModule: 'finance',
        actionUrl: '/admin-finance',
        needsAction: false,
        createdAt: '2026-03-06T15:45:00.000Z',
        readAt: '2026-03-06T18:00:00.000Z'
      }
    ];

    const buildNotificationSummary = (items = []) => ({
      total: items.length,
      unread: items.filter((item) => !item.readAt).length,
      read: items.filter((item) => item.readAt).length,
      needsAction: items.filter((item) => item.needsAction).length,
      byLevel: {
        critical: items.filter((item) => item.level === 'critical').length,
        warning: items.filter((item) => item.level === 'warning').length,
        info: items.filter((item) => item.level === 'info').length
      }
    });

    const buildNotificationsPayload = () => ({
      success: true,
      items: notifications,
      unread: notifications.filter((item) => !item.readAt).length,
      summary: buildNotificationSummary(notifications)
    });

    await page.route('**/api/users/me/notifications?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildNotificationsPayload())
      });
    });

    await page.route('**/api/users/me/notifications/read-all', async (route) => {
      const count = notifications.filter((item) => !item.readAt).length;
      const now = '2026-03-07T10:45:00.000Z';
      notifications = notifications.map((item) => ({ ...item, readAt: item.readAt || now }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, count })
      });
    });

    await page.route('**/api/users/me/notifications/*/read', async (route) => {
      const id = route.request().url().split('/').slice(-2)[0];
      const now = '2026-03-07T10:15:00.000Z';
      notifications = notifications.map((item) => (
        item._id === id ? { ...item, readAt: item.readAt || now } : item
      ));
      const current = notifications.find((item) => item._id === id) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: current })
      });
    });

    await page.route('**/api/users/me/notifications/*/unread', async (route) => {
      const id = route.request().url().split('/').slice(-2)[0];
      notifications = notifications.map((item) => (
        item._id === id ? { ...item, readAt: null } : item
      ));
      const current = notifications.find((item) => item._id === id) || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: current })
      });
    });

    await page.goto('/admin-notifications', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'مرکز اعلان‌های مالی' })).toBeVisible();
    await expect(page.locator('.notify-kpi').filter({ hasText: 'کل اعلان‌ها' })).toContainText(/3|۳/);
    await expect(page.locator('.notify-kpi').filter({ hasText: 'نخوانده' })).toContainText(/2|۲/);

    await page.getByTestId('notification-filter-status').selectOption('unread');
    await expect(page.getByTestId('notification-center-list')).toContainText('یادآوری بدهی معوق');
    await page.getByTestId('notification-filter-event').selectOption('workflow');
    await expect(page.locator('.notify-item-card')).toHaveCount(1);
    await expect(page.getByTestId('notification-center-list')).toContainText('پیگیری رسید');
    await page.getByTestId('notification-item-finance-notify-2').click();
    await expect(page.getByTestId('notification-center-detail')).toContainText('ارجاع شد');
    await expect(page.getByTestId('notification-center-detail').locator('a')).toHaveAttribute('href', /\/admin-finance#pending-receipts$/);

    await page.getByTestId('notification-toggle-read').click();
    await expect(page.locator('.notify-kpi').filter({ hasText: 'نخوانده' })).toContainText(/1|۱/);
    await expect(page.getByTestId('notification-center-detail')).toContainText('خوانده شده');

    await page.getByTestId('notification-filter-status').selectOption('all');
    await page.getByTestId('notification-filter-event').selectOption('all');
    await page.getByTestId('notification-mark-all').click();
    await expect(page.locator('.notify-kpi').filter({ hasText: 'نخوانده' })).toContainText(/0|۰/);
  });

  test('admin workflow filters admin logs by org role', async ({ page }) => {
    let requestCount = 0;
    let requestedOrgRole = '';

    await page.route('**/api/admin-logs*', async (route) => {
      const requestUrl = new URL(route.request().url());
      requestedOrgRole = requestUrl.searchParams.get('orgRole') || '';
      requestCount += 1;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'log-1',
              actor: { _id: 'admin-1', name: 'Admin Alpha', role: 'admin' },
              actorRole: 'admin',
              actorOrgRole: 'general_president',
              action: 'admin_access_matrix_export_csv',
              targetType: 'report',
              route: '/admin',
              ip: '127.0.0.1',
              clientDevice: 'Desktop',
              reason: '',
              createdAt: '2026-03-06T00:00:00.000Z'
            }
          ]
        })
      });
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await page.goto('/admin-logs', { waitUntil: 'domcontentloaded' });
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await page.waitForTimeout(500);
      }
    }
    await page.locator('.form-grid select').first().selectOption('general_president');
    await page.locator('.form-actions button').first().click();

    await expect.poll(() => requestedOrgRole).toBe('general_president');
    expect(requestCount).toBeGreaterThan(1);
    await expect(page.locator('.admin-content-item').first()).toContainText('ریاست عمومی');
  });

  test('admin workflow saves menu settings and exports admin logs csv', async ({ page }) => {
    let savedPayload = null;
    let exportCalls = 0;

    await page.route('**/api/settings', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, settings: baseSettings })
        });
        return;
      }

      savedPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, settings: savedPayload })
      });
    });

    await page.route('**/api/admin-logs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'log-1',
              actor: { _id: 'admin-1', name: 'Admin Alpha', role: 'admin' },
              actorRole: 'admin',
              actorOrgRole: 'general_president',
              action: 'admin_access_matrix_export_csv',
              targetType: 'report',
              route: '/admin',
              ip: '127.0.0.1',
              clientDevice: 'Desktop',
              reason: '',
              createdAt: '2026-03-06T00:00:00.000Z'
            }
          ]
        })
      });
    });

    await page.route('**/api/admin-logs/export.csv*', async (route) => {
      exportCalls += 1;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="admin-logs.csv"'
        },
        body: 'Timestamp,Actor,Role,Action\n2026-03-06,Admin Alpha,admin,admin_access_matrix_export_csv'
      });
    });

    await page.goto('/admin-settings', { waitUntil: 'domcontentloaded' });

    await page.locator('.settings-grid input').first().fill('خانه سریع Alpha');
    await page.getByPlaceholder('عنوان میانبر').first().fill('گزارش Alpha');
    await page.getByRole('button', { name: 'ذخیره همه تنظیمات' }).click();

    await expect.poll(() => savedPayload?.mainMenu?.[0]?.title || '').toBe('خانه سریع Alpha');
    await expect.poll(() => savedPayload?.adminQuickLinks?.[0]?.title || '').toBe('گزارش Alpha');
    await expect(page.locator('.settings-message')).toContainText('ذخیره شد');

    await page.goto('/admin-logs', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'دانلود CSV' }).click();

    await expect.poll(() => exportCalls).toBe(1);
  });
});
