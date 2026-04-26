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

test.describe('homework workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupShellMocks(page);
  });

  test('instructor homework manager uses canonical class homework routes', async ({ page }) => {
    let createCalls = 0;
    let gradeCalls = 0;

    let homeworks = [
      {
        _id: 'hw-1',
        courseId: 'course-1',
        classId: 'class-1',
        title: 'Homework One',
        description: 'Solve worksheet one.',
        dueDate: '2026-03-10T00:00:00.000Z',
        maxScore: 20,
        attachment: 'uploads/homeworks/task-1.pdf'
      }
    ];

    let reviewSubmissions = [
      {
        _id: 'sub-1',
        student: { _id: 'student-1', name: 'Student Alpha', grade: '10' },
        text: 'Answers attached.',
        file: 'uploads/submissions/sub-1.pdf',
        submittedAt: '2026-03-06T08:00:00.000Z',
        score: null,
        feedback: ''
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
        body: JSON.stringify({ success: true, items: homeworks })
      });
    });

    await page.route('**/api/homeworks/create', async (route) => {
      createCalls += 1;
      const item = {
        _id: `hw-${homeworks.length + 1}`,
        courseId: 'course-1',
        classId: 'class-1',
        title: 'Canonical Homework',
        description: 'Weekly review',
        dueDate: '2026-03-12T00:00:00.000Z',
        maxScore: 15,
        attachment: 'uploads/homeworks/task-2.txt'
      };
      homeworks = [item, ...homeworks];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, homework: item })
      });
    });

    await page.route('**/api/homeworks/hw-1/submissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: reviewSubmissions })
      });
    });

    await page.route('**/api/homeworks/hw-2/submissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/homeworks/hw-1/grade', async (route) => {
      gradeCalls += 1;
      const payload = JSON.parse(route.request().postData() || '{}');
      reviewSubmissions = reviewSubmissions.map((item) => (
        item._id === payload.submissionId
          ? { ...item, score: Number(payload.score), feedback: payload.feedback || '' }
          : item
      ));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, submission: reviewSubmissions[0] })
      });
    });

    await page.goto('/homework-manager', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.homework-card')).toBeVisible();
    await expect(page.locator('.homework-view-tabs button')).toHaveCount(2);

    await page.locator('.homework-form input[type="text"]').fill('Canonical Homework');
    await page.locator('.homework-form textarea').fill('Weekly review');
    await page.locator('.homework-form input[type="date"]').fill('2026-03-12');
    await page.locator('.homework-form input[type="number"]').fill('15');
    await page.locator('.homework-form input[type="file"]').setInputFiles({
      name: 'task.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('homework attachment')
    });
    await page.locator('.homework-form-actions button').first().click();

    await expect.poll(() => createCalls).toBeGreaterThan(0);
    await expect(page.locator('.homework-list')).toContainText('Canonical Homework');

    await page.locator('.homework-view-tabs button').nth(1).click();
    await page.locator('#review-homework-select').selectOption('hw-1');
    await expect(page.locator('.submission-item')).toContainText('Student Alpha');

    const gradeSection = page.locator('.submission-item').first().locator('.submission-grade');
    await gradeSection.locator('input[type="number"]').fill('18');
    await gradeSection.locator('input[type="text"]').fill('Reviewed');
    await gradeSection.locator('button').click();

    await expect.poll(() => gradeCalls).toBeGreaterThan(0);
    await expect(page.locator('.submission-grade-header')).toContainText(/18|۱۸/);
    await expect(page.locator('.submission-grade-header')).toContainText('Reviewed');
  });

  test('student homework page uses canonical class filters for submissions', async ({ page }) => {
    let submitCalls = 0;
    let submissions = [];

    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
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
