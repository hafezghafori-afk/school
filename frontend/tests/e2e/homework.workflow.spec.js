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
  userName: 'Student Alpha',
  permissions: ['homework.my.view']
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

test.describe('homework workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupShellMocks(page);
  });

  test('instructor homework manager: create, review, grade, revise, notify, copy, export', async ({ page }) => {
    const calls = { create: [], grade: [], revision: [], notify: [], copy: [], export: 0 };

    const stats = (overrides = {}) => ({
      rosterCount: 2,
      submittedCount: 1,
      missingCount: 1,
      pendingCount: 1,
      gradedCount: 0,
      revisionCount: 0,
      lateCount: 1,
      averageScore: null,
      averagePercent: null,
      isOverdue: true,
      ...overrides
    });

    let homeworks = [
      {
        _id: 'hw-1',
        courseId: 'course-1',
        classId: 'class-1',
        title: 'Homework One',
        description: 'Solve worksheet one.',
        dueDate: '2026-03-10T00:00:00.000Z',
        maxScore: 20,
        attachment: 'uploads/homeworks/task-1.pdf',
        stats: stats()
      }
    ];

    let rosterRows = [
      {
        student: { _id: 'student-1', name: 'Student Alpha', email: 'alpha@example.com', admissionNo: 'A-101' },
        inClass: true,
        state: 'submitted',
        submission: {
          _id: 'sub-1',
          text: 'Answers attached.',
          file: 'uploads/submissions/1700000000000-answers.pdf',
          submittedAt: '2026-03-12T08:00:00.000Z',
          score: null,
          feedback: '',
          status: 'submitted',
          isLate: true,
          lateDays: 2,
          revisionCount: 0
        }
      },
      {
        student: { _id: 'student-2', name: 'Student Beta', email: '', admissionNo: 'A-102' },
        inClass: true,
        state: 'missing_overdue',
        submission: null
      }
    ];

    const json = (route, body, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });

    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
      localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
    }, instructorSession);

    await page.route('**/api/education/instructor/courses', (route) => json(route, {
      success: true,
      items: [
        { _id: 'course-1', courseId: 'course-1', classId: 'class-1', title: 'Legacy Class Ten A', schoolClass: { _id: 'class-1', title: 'Class 10 A' } },
        { _id: 'course-2', courseId: 'course-2', classId: 'class-2', title: 'Legacy Class Ten B', schoolClass: { _id: 'class-2', title: 'Class 10 B' } }
      ]
    }));

    await page.route('**/api/homeworks/class/class-1**', (route) => {
      expect(route.request().url()).toContain('withStats=1');
      return json(route, { success: true, rosterCount: 2, items: homeworks });
    });

    await page.route('**/api/homeworks/create', (route) => {
      const body = route.request().postData() || '';
      calls.create.push(body);
      const item = {
        _id: 'hw-2',
        courseId: 'course-1',
        classId: 'class-1',
        title: 'Canonical Homework',
        description: 'Weekly review',
        dueDate: '2099-03-12T00:00:00.000Z',
        maxScore: 10,
        attachment: 'uploads/homeworks/task-2.txt',
        stats: stats({ submittedCount: 0, missingCount: 2, pendingCount: 0, lateCount: 0, isOverdue: false })
      };
      homeworks = [item, ...homeworks];
      return json(route, { success: true, homework: item, notifiedCount: 2 }, 201);
    });

    await page.route('**/api/homeworks/hw-1/roster', (route) => json(route, {
      success: true,
      homework: homeworks.find((item) => item._id === 'hw-1'),
      rows: rosterRows,
      summary: { total: 2, rosterCount: 2, late: 1 },
      overdue: true
    }));

    await page.route('**/api/homeworks/hw-1/grade', (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      calls.grade.push(payload);
      const updated = { _id: payload.submissionId, score: payload.score, feedback: payload.feedback, status: 'graded', isLate: true, lateDays: 2 };
      rosterRows = rosterRows.map((row) => (
        row.submission?._id === payload.submissionId
          ? { ...row, state: 'graded', submission: { ...row.submission, ...updated } }
          : row
      ));
      return json(route, { success: true, submission: updated });
    });

    await page.route('**/api/homeworks/hw-1/request-revision', (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      calls.revision.push(payload);
      return json(route, {
        success: true,
        submission: {
          _id: payload.submissionId,
          status: 'revision_requested',
          revisionNote: payload.note,
          revisionRequestedAt: '2026-03-14T08:00:00.000Z',
          revisionCount: 1,
          score: null
        }
      });
    });

    await page.route('**/api/homeworks/hw-1/notify', (route) => {
      calls.notify.push(JSON.parse(route.request().postData() || '{}'));
      return json(route, { success: true, notifiedCount: 1 });
    });

    await page.route('**/api/homeworks/hw-1/copy', (route) => {
      calls.copy.push(JSON.parse(route.request().postData() || '{}'));
      return json(route, { success: true, created: [{ homeworkId: 'hw-9', classId: 'class-2', classTitle: 'Class 10 B' }], failed: [] }, 201);
    });

    await page.route('**/api/homeworks/hw-1/export.xlsx', (route) => {
      calls.export += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Buffer.from('PK fake xlsx')
      });
    });

    await page.goto('/homework-manager', { waitUntil: 'domcontentloaded' });

    // List: one card with its stats and a late badge.
    await expect(page.locator('.hw-card')).toHaveCount(1);
    await expect(page.locator('.hw-card').first()).toContainText('Homework One');
    await expect(page.locator('.hw-card .hw-badge--warning')).toBeVisible();

    // Create through the drawer, with a teacher-chosen scale and a notification.
    await page.getByRole('button', { name: 'کارخانگی جدید' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await drawer.locator('#hw-title').fill('Canonical Homework');
    await drawer.locator('#hw-description').fill('Weekly review');
    await drawer.getByRole('button', { name: 'یک هفته' }).click();
    await drawer.locator('#hw-max-score').fill('5000');
    await expect(drawer.getByText(/حداکثر نمره باید عددی بین/)).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'ثبت کارخانگی' })).toBeDisabled();
    await drawer.getByRole('button', { name: /از ۱۰$/ }).click();
    await drawer.locator('input[type="file"]').setInputFiles({
      name: 'task.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('homework attachment')
    });
    await drawer.getByRole('button', { name: 'ثبت کارخانگی' }).click();

    await expect.poll(() => calls.create.length).toBe(1);
    expect(calls.create[0]).toMatch(/name="maxScore"\r\n\r\n10\r\n/);
    expect(calls.create[0]).toMatch(/name="notifyStudents"\r\n\r\ntrue\r\n/);
    expect(calls.create[0]).toMatch(/name="classId"\r\n\r\nclass-1\r\n/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.hw-card')).toHaveCount(2);

    // Review desk.
    await page.locator('.hw-card', { hasText: 'Homework One' }).getByRole('button', { name: /بررسی تحویل‌ها/ }).click();
    await expect(page.locator('.hw-roster-row')).toHaveCount(2);
    await expect(page.locator('.hw-roster-row').first()).toContainText('A-101');
    await expect(page.locator('.hw-roster-row').first().locator('.hw-badge--warning')).toBeVisible();
    await expect(page.locator('.hw-detail .hw-alert--warning')).toContainText('پس از موعد');

    // A score above the teacher's maximum never reaches the server.
    await page.locator('#hw-grade-score').fill('25');
    await expect(page.locator('.hw-grade .hw-error')).toContainText('۲۰');
    await page.locator('#hw-grade-score').press('Enter');
    expect(calls.grade).toHaveLength(0);

    await page.locator('#hw-grade-score').fill('18');
    await page.getByRole('button', { name: 'خوب بود' }).click();
    await page.locator('#hw-grade-score').press('Enter');
    await expect.poll(() => calls.grade.length).toBe(1);
    expect(calls.grade[0]).toMatchObject({ submissionId: 'sub-1', score: 18, feedback: 'خوب بود' });
    await expect(page.locator('.hw-roster-row').first()).toContainText(/۱۸/);

    // Send it back for revision.
    await page.locator('.hw-roster-row').first().click();
    await page.getByRole('button', { name: 'برگرداندن برای اصلاح' }).first().click();
    await page.locator('#hw-revision-note').fill('Show your working.');
    await page.locator('.hw-revision').getByRole('button', { name: 'برگرداندن برای اصلاح' }).click();
    await expect.poll(() => calls.revision.length).toBe(1);
    expect(calls.revision[0]).toMatchObject({ submissionId: 'sub-1', note: 'Show your working.' });
    await expect(page.locator('.hw-detail .hw-alert--purple')).toContainText('Show your working.');

    // The student who never handed in.
    await page.locator('.hw-roster-row', { hasText: 'Student Beta' }).click();
    await expect(page.locator('.hw-missing')).toContainText('موعد گذشته');

    // Remind the non-submitters.
    await page.getByRole('button', { name: 'یادآوری به همهٔ تحویل‌نداده‌ها' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ارسال اعلان' }).click();
    await expect.poll(() => calls.notify.length).toBe(1);
    expect(calls.notify[0]).toMatchObject({ audience: 'missing' });

    // Copy to the other class.
    await page.locator('.hw-desk-actions').getByRole('button', { name: 'کپی به صنف دیگر' }).click();
    await page.getByRole('dialog').getByText('Class 10 B').click();
    await page.getByRole('dialog').getByRole('button', { name: /کپی به ۱ صنف/ }).click();
    await expect.poll(() => calls.copy.length).toBe(1);
    expect(calls.copy[0]).toMatchObject({ classIds: ['class-2'], notifyStudents: true });

    // Excel export.
    await page.getByRole('button', { name: 'خروجی اکسل' }).click();
    await expect.poll(() => calls.export).toBe(1);
    // Saving with Enter must send exactly one grade request.
    expect(calls.grade).toHaveLength(1);

    await page.getByRole('button', { name: 'همهٔ کارخانگی‌ها' }).click();
    await expect(page.locator('.hw-card')).toHaveCount(2);
  });

  test('student homework page uses canonical class filters for submissions', async ({ page }) => {
    let submitCalls = 0;
    let submissions = [];

    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
      localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
    }, studentSession);

    await page.route('**/api/education/my-courses', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'course-1',
              courseId: 'course-1',
              classId: 'class-1',
              title: 'Legacy Class Ten A',
              schoolClass: { _id: 'class-1', title: 'Class 10 A' }
            }
          ]
        })
      });
    });

    await page.route('**/api/homeworks/class/class-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'hw-1',
              classId: 'class-1',
              courseId: 'course-1',
              title: 'Math Homework',
              description: 'Solve exercises 1 to 5.',
              dueDate: '2026-03-12T00:00:00.000Z',
              maxScore: 20,
              attachment: 'uploads/homeworks/hw-1.pdf'
            }
          ]
        })
      });
    });

    await page.route('**/api/homeworks/my/submissions?classId=class-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: submissions })
      });
    });

    await page.route('**/api/homeworks/hw-1/submit', async (route) => {
      submitCalls += 1;
      submissions = [
        {
          _id: 'sub-1',
          classId: 'class-1',
          courseId: 'course-1',
          homework: {
            _id: 'hw-1',
            classId: 'class-1',
            courseId: 'course-1',
            title: 'Math Homework'
          },
          submittedAt: '2026-03-06T09:00:00.000Z',
          text: 'Answers completed',
          file: 'uploads/submissions/sub-1.pdf',
          score: null,
          feedback: ''
        }
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, submission: submissions[0] })
      });
    });

    await page.goto('/my-homework', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.myhomework-card')).toBeVisible();
    await page.locator('.myhomework-submit button').click();
    await expect(page.locator('.myhomework-empty')).toBeVisible();
    await expect.poll(() => submitCalls).toBe(0);

    // The due date has passed: the student is warned the hand-in will be marked late, not blocked.
    await expect(page.locator('.myhomework-submit .myhomework-late')).toBeVisible();
    await page.locator('.myhomework-submit textarea').fill('Answers completed');
    await page.locator('.myhomework-submit input[type="file"]').setInputFiles({
      name: 'answer.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('student homework file')
    });
    await page.locator('.myhomework-submit button').click();

    await expect.poll(() => submitCalls).toBeGreaterThan(0);
    await expect(page.locator('.submission-status')).toBeVisible();
    await expect(page.locator('.submission-status a')).toHaveCount(1);
  });
});
