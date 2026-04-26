import { test, expect } from '@playwright/test';

const instructorSession = {
  token: 'mock.header.signature',
  role: 'instructor',
  userId: 'ins-1',
  userName: 'Teacher One',
  permissions: ['manage_content']
};

const studentSession = {
  token: 'mock.header.signature',
  role: 'student',
  userId: 'student-1',
  userName: 'Student Alpha'
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

test.describe('chat workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupShellMocks(page);
  });

  test('instructor manages the online-class lifecycle from the chat hub', async ({ page }) => {
    let sessions = [
      {
        _id: 'session-1',
        title: 'جلسه ریاضی',
        description: 'مرور تمرین‌های هفته',
        provider: 'google_meet',
        meetingUrl: 'https://meet.google.com/math-class',
        accessCode: 'MATH-01',
        scheduledAt: '2026-03-08T08:00:00.000Z',
        status: 'scheduled',
        course: { _id: 'course-1', title: 'صنف دهم الف', category: 'Morning' },
        createdBy: { _id: 'ins-1', name: 'Teacher One', role: 'instructor' }
      }
    ];

    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
      localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
    }, instructorSession);

    await page.route('**/api/education/instructor/courses', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [{ _id: 'course-1', title: 'صنف دهم الف', category: 'Morning' }]
        })
      });
    });

    await page.route('**/api/chats/threads/direct', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, items: [] }) });
    });

    await page.route('**/api/chats/threads/group', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, items: [] }) });
    });

    await page.route('**/api/users', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, items: [] }) });
    });

    const virtualRouteHandler = async (route) => {
      const method = route.request().method();
      const url = route.request().url();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            items: sessions,
            summary: {
              total: sessions.length,
              live: sessions.filter((item) => item.status === 'live').length,
              scheduled: sessions.filter((item) => item.status === 'scheduled').length,
              ended: sessions.filter((item) => item.status === 'ended').length,
              today: 1
            }
          })
        });
        return;
      }

      if (method === 'POST' && url.endsWith('/api/virtual-classes')) {
        const payload = JSON.parse(route.request().postData() || '{}');
        const item = {
          _id: 'session-2',
          title: payload.title,
          description: payload.description || '',
          provider: payload.provider,
          meetingUrl: payload.meetingUrl,
          accessCode: payload.accessCode || '',
          scheduledAt: `${payload.scheduledAt}:00.000Z`,
          status: 'scheduled',
          course: { _id: payload.courseId, title: 'صنف دهم الف', category: 'Morning' },
          createdBy: { _id: 'ins-1', name: 'Teacher One', role: 'instructor' }
        };
        sessions = [item, ...sessions];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item })
        });
        return;
      }

      if (method === 'POST' && url.endsWith('/start')) {
        sessions = sessions.map((item) => (
          item._id === 'session-1' ? { ...item, status: 'live' } : item
        ));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item: sessions.find((item) => item._id === 'session-1') })
        });
        return;
      }

      if (method === 'POST' && url.endsWith('/end')) {
        sessions = sessions.map((item) => (
          item._id === 'session-1' ? { ...item, status: 'ended' } : item
        ));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item: sessions.find((item) => item._id === 'session-1') })
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    };

    await page.route('**/api/virtual-classes', virtualRouteHandler);
    await page.route('**/api/virtual-classes/**', virtualRouteHandler);

    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'سیستم مجازی و چت' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'کلاس آنلاین' })).toHaveClass(/active/);
    await expect(page.locator('.virtual-session-card')).toContainText('جلسه ریاضی');

    await page.locator('.chat-session-form select').first().selectOption('course-1');
    await page.locator('.chat-session-form input[placeholder="مثال: جلسه چهارم ریاضی"]').fill('جلسه فزیک');
    await page.locator('.chat-session-form input[type="datetime-local"]').fill('2026-03-09T09:30');
    await page.locator('.chat-session-form input[type="url"]').fill('https://meet.google.com/physics-class');
    await page.locator('.chat-session-actions button').click();

    await expect(page.locator('.virtual-session-list')).toContainText('جلسه فزیک');

    const mathCard = page.locator('.virtual-session-card').filter({ hasText: 'جلسه ریاضی' });
    await mathCard.getByRole('button', { name: 'شروع' }).click();
    await expect(mathCard.locator('.status-badge')).toContainText('در حال برگزاری');

    await mathCard.getByRole('button', { name: 'ختم' }).click();
    await expect(mathCard.locator('.status-badge')).toContainText('پایان‌یافته');
  });

  test('student direct and group chat flows support file delivery from the chat hub', async ({ page }) => {
    let activeDirectMessages = [];
    let groupMessages = [
      {
        _id: 'group-1',
        sender: { _id: 'ins-1', name: 'Teacher One', role: 'instructor' },
        text: 'تکلیف امروز را دیدید؟',
        file: '',
        createdAt: '2026-03-06T09:00:00.000Z'
      }
    ];

    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
    }, studentSession);

    const virtualRouteHandler = async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [], summary: { total: 0, live: 0, scheduled: 0, ended: 0, today: 0 } })
      });
    };

    await page.route('**/api/virtual-classes', virtualRouteHandler);
    await page.route('**/api/virtual-classes/**', virtualRouteHandler);

    await page.route('**/api/chats/threads/direct', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, items: [] }) });
    });

    await page.route('**/api/chats/threads/group', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [{ _id: 'thread-group-1', type: 'group', course: { _id: 'course-1', title: 'صنف دهم الف', category: 'Morning' } }]
        })
      });
    });

    await page.route('**/api/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [{ _id: 'ins-1', name: 'Teacher One', role: 'instructor' }]
        })
      });
    });

    await page.route('**/api/chats/direct', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, threadId: 'thread-direct-1' })
      });
    });

    await page.route('**/api/chats/messages/thread-direct-1', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, items: activeDirectMessages })
        });
        return;
      }

      activeDirectMessages = [
        {
          _id: 'direct-1',
          sender: { _id: 'student-1', name: 'Student Alpha', role: 'student' },
          text: 'سلام استاد',
          file: 'uploads/chats/direct-1.pdf',
          createdAt: '2026-03-06T09:05:00.000Z'
        }
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: activeDirectMessages[0] })
      });
    });

    await page.route('**/api/chats/messages/thread-group-1', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, items: groupMessages })
        });
        return;
      }

      groupMessages = [
        ...groupMessages,
        {
          _id: 'group-2',
          sender: { _id: 'student-1', name: 'Student Alpha', role: 'student' },
          text: '',
          file: 'uploads/chats/group-2.pdf',
          createdAt: '2026-03-06T09:10:00.000Z'
        }
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: groupMessages[groupMessages.length - 1] })
      });
    });

    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'چت مستقیم' }).click();
    await page.getByRole('button', { name: /Teacher One/ }).click();

    await page.locator('.chat-input textarea').fill('سلام استاد');
    await page.locator('.chat-actions input[type="file"]').setInputFiles({
      name: 'reply.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('direct chat file')
    });
    await page.getByRole('button', { name: 'ارسال' }).click();

    await expect(page.locator('.chat-messages')).toContainText('سلام استاد');
    await expect(page.locator('.chat-file')).toContainText('دانلود فایل');

    await page.getByRole('button', { name: 'گروه صنف' }).click();
    await page.locator('.chat-list button').filter({ hasText: 'صنف دهم الف' }).click();
    await expect(page.locator('.chat-messages')).toContainText('تکلیف امروز را دیدید؟');

    await page.locator('.chat-actions input[type="file"]').setInputFiles({
      name: 'group.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('group chat file')
    });
    await page.getByRole('button', { name: 'ارسال' }).click();

    await expect(page.locator('.chat-messages')).toContainText('دانلود فایل');
  });
});
