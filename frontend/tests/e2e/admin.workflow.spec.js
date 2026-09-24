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

  // بدون این موک، درخواست به بک‌اند واقعی می‌رود، ECONNREFUSED می‌خورد و با retryهای
  // apiFetch سایر درخواست‌ها (از جمله /api/admin/alerts) را پشت سرِ خود معطل می‌کند —
  // همین باعث می‌شد هشدارها در بعضی اجراها خالی بمانند و تست flaky شود.
  await page.route('**/api/dashboard/admin*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  // همهٔ این مسیرها روی mount داشبورد صدا می‌شوند. بی‌موک بودنِ آنها فقط خطای
  // پراکسی نیست: با retryهای apiFetch و مهلتِ مشترک، درخواستِ /api/admin/alerts را عقب
  // می‌اندازند و گاهی از پنجرهٔ ۷ ثانیه‌ای expect بیرون می‌زنند — همان چیزی که این تست را flaky می‌کرد.
  await page.route('**/api/afghan-schools/active*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, schoolId: '', school: null, schools: [] })
    });
  });

  await page.route('**/api/afghan-schools/ownership-audit*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { rows: [] } })
    });
  });

  await page.route('**/api/afghan-schools', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { schools: [] } })
    });
  });

  await page.route('**/api/admin/users/directory-orphans*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {} })
    });
  });

  await page.route('**/api/admin/recent-activity*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] })
    });
  });

  // socket.io از apiFetch نمی‌گذرد، ولی long-pollِ ردشده هم اتصال مرورگر می‌گیرد.
  await page.route('**/socket.io/**', async (route) => {
    await route.abort();
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

    // داشبورد ادمین به چیدمان «modern» منتقل شده است. مارکآپ قدیمی (.admin-hero،
    // .admin-alerts، .admin-columns و همراهانش) هنوز در DOM هست ولی AdminPanel.css آن را با
    // `display: none !important` پنهان می‌کند؛ پس همان پنل‌هایی را می‌سنجیم که کاربر واقعاً می‌بیند.
    const urgentPanel = page.locator('.admin-modern-panel').filter({ hasText: 'کارهای فوری مدیریتی' });
    const keyAlertsPanel = page.locator('.admin-modern-panel').filter({ hasText: 'هشدارهای کلیدی' });

    // هشدارهای level: high در «کارهای فوری مدیریتی» می‌نشینند.
    const pendingReceiptsAlert = urgentPanel.locator('a.admin-modern-list-item').filter({ hasText: /رسیدهای مالی.*تایید/ });
    const overdueBillsAlert = urgentPanel.locator('a.admin-modern-list-item').filter({ hasText: /بل‌های مالی معوق/ });

    await expect(pendingReceiptsAlert).toHaveCount(1);
    await expect(pendingReceiptsAlert).toHaveAttribute('href', /\/admin-finance#pending-receipts$/);
    await expect(overdueBillsAlert).toHaveCount(1);
    await expect(overdueBillsAlert).toHaveAttribute('href', /\/admin-finance$/);

    // هشدارهای غیرفوری در «هشدارهای کلیدی».
    const scheduleDraftsAlert = keyAlertsPanel.locator('a.admin-modern-list-item').filter({ hasText: /برنامه.*(پیش‌نویس|draft)/ });
    const unreadContactsAlert = keyAlertsPanel.locator('a.admin-modern-list-item').filter({ hasText: /پیام‌های خوانده‌نشده پشتیبانی/ });

    await expect(scheduleDraftsAlert).toHaveCount(1);
    // «/admin-schedule» خودش فقط یک ریدایرکت به ویرایشگر تقسیم اوقات است.
    await expect(scheduleDraftsAlert).toHaveAttribute('href', /\/timetable\/editor$/);
    await expect(unreadContactsAlert).toHaveCount(1);
    // پیام‌های پشتیبانی به هاب یکپارچهٔ ارتباطات منتقل شده‌اند.
    await expect(unreadContactsAlert).toHaveAttribute('href', /\/admin-communications$/);

    // جستجوی سراسری در نوار بالای داشبورد مدرن.
    await page.getByRole('button', { name: 'جستجو در سامانه…' }).click();
    await expect(page.locator('.admin-modern-search-row input')).toBeVisible();
    await page.locator('.admin-modern-search-row input').fill('Alpha');
    await page.locator('.admin-modern-search-row button').click();

    const searchResults = page.locator('.admin-modern-search-results');
    await expect.poll(async () => page.locator('.admin-modern-search-group').count()).toBeGreaterThan(10);
    await expect(searchResults.locator('a[href$="/admin-finance"]').filter({ hasText: 'BL-ALPHA-0001' })).toHaveCount(1);
    await expect(searchResults.locator('a[href$="/admin-finance#pending-receipts"]').filter({ hasText: 'BL-ALPHA-0001' })).toHaveCount(1);
    await expect(searchResults.locator('a[href$="/courses/course-1"]').filter({ hasText: 'Alpha Class' })).toHaveCount(1);
    await expect(searchResults.locator('a[href$="/admin-settings"]').filter({ hasText: 'Alpha Academy' })).toHaveCount(1);
    await expect(searchResults.locator('a[href$="/admin-logs"]').filter({ hasText: 'alpha_review' })).toHaveCount(1);
  });

  // The finance notification centre this file used to drive (AdminNotifications,
  // with its status/event filters and read toggles) is no longer reachable:
  // the communications hub took over /admin-notifications and the page it
  // replaced has no equivalent screen. All that is left to guard is that the
  // old URL still lands somewhere sensible instead of a dead route.
  test('legacy notification centre url lands on the communications hub', async ({ page }) => {
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

    await page.route('**/api/admin-messages*', async (route) => {
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

    await page.route('**/api/education/school-classes*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.goto('/admin-notifications', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/admin-communications\?tab=announce$/, { timeout: 20_000 });
    await expect(page.locator('.route-loading')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'مرکز ارتباطات', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'اعلانِ همگانی', level: 2 })).toBeVisible();
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

  test('admin workflow saves settings tabs and exports admin logs csv', async ({ page }) => {
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

    await page.route('**/api/school-websites/admin/primary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, profile: null })
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

    // صفحهٔ تنظیمات به تب تقسیم شده و tablist فقط ۴ تب را نشان می‌دهد؛ تبِ
    // «هیدر و منو» که ویرایشگر mainMenu را داشت دیگر از رابط کاربری قابل دسترس نیست،
    // پس دو تبی را می‌سنجیم که واقعاً باز می‌شوند. هر دو ویرایش روی همان شیء
    // settings می‌نشیند، پس یک بار «ذخیره همه تنظیمات» باید هر دو را در یک PUT بفرستد.
    await page.goto('/admin-settings#student-ids', { waitUntil: 'domcontentloaded' });

    await page.locator('.settings-grid input').first().fill('ALPHA-{YYYY}-{SEQ}');

    await page.getByRole('button', { name: 'میانبرهای ادمین' }).click();
    await page.locator('.quick-link-row input').first().fill('گزارش Alpha');

    await page.getByRole('button', { name: 'ذخیره همه تنظیمات' }).click();

    await expect.poll(() => savedPayload?.studentIdFormats?.registrationIdFormat || '').toBe('ALPHA-{YYYY}-{SEQ}');
    await expect.poll(() => savedPayload?.adminQuickLinks?.[0]?.title || '').toBe('گزارش Alpha');
    await expect(page.locator('.settings-message')).toContainText('ذخیره شد');

    await page.goto('/admin-logs', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'دانلود CSV' }).click();

    await expect.poll(() => exportCalls).toBe(1);
  });
});
