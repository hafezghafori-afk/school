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

const json = (body, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

const setupShellMocks = async (page) => {
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
};

test.describe('content canonical workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupShellMocks(page);
  });

  test('quiz builder uses canonical class list but keeps compat courseId on save', async ({ page }) => {
    let quizPayload = null;

    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
      localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
    }, instructorSession);

    await page.route('**/api/education/instructor/courses', async (route) => {
      await route.fulfill(json({
        success: true,
        items: [
          {
            _id: 'course-1',
            courseId: 'course-1',
            classId: 'class-1',
            title: 'Legacy Course Ten A',
            schoolClass: { _id: 'class-1', title: 'Class Ten A' }
          }
        ]
      }));
    });

    await page.route('**/api/quizzes/create', async (route) => {
      quizPayload = route.request().postDataJSON();
      await route.fulfill(json({ success: true, quiz: { _id: 'quiz-1' } }, 201));
    });

    await page.goto('/quiz-builder', { waitUntil: 'domcontentloaded' });

    const classSelect = page.locator('.quizbuilder-card select').first();
    await expect(classSelect).toContainText('Class Ten A');
    await expect(classSelect).not.toContainText('Legacy Course Ten A');

    await page.locator('.quizbuilder-card > input').first().fill('Mathematics');
    await page.locator('.qb-question input').nth(0).fill('2 + 2 = ?');
    await page.locator('.qb-question input').nth(1).fill('3');
    await page.locator('.qb-question input').nth(2).fill('4');
    await page.locator('.qb-question select').selectOption('1');
    await page.locator('.qb-question button').click();
    await page.locator('.quizbuilder-card > button[type="button"]').click();

    await expect.poll(() => quizPayload).not.toBeNull();
    expect(quizPayload).toMatchObject({
      classId: 'class-1',
      courseId: 'course-1',
      subject: 'Mathematics'
    });
    expect(quizPayload.questions).toEqual([
      {
        text: '2 + 2 = ?',
        options: ['3', '4'],
        correctIndex: 1
      }
    ]);
  });

  test('recordings page uses canonical class sources for instructor and student filters', async ({ page }) => {
    const requestedCourseIds = [];
    const requestedClassIds = [];
    let recordingPostData = '';

    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
      localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
    }, instructorSession);

    await page.route('**/api/education/instructor/courses', async (route) => {
      await route.fulfill(json({
        success: true,
        items: [
          {
            _id: 'course-1',
            courseId: 'course-1',
            classId: 'class-1',
            title: 'Legacy Course Ten A',
            schoolClass: { _id: 'class-1', title: 'Class Ten A' }
          }
        ]
      }));
    });

    await page.route('**/api/recordings*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() === 'POST') {
        recordingPostData = request.postData() || '';
        await route.fulfill(json({
          success: true,
          item: { _id: 'rec-1', title: 'Weekly Recording' }
        }, 201));
        return;
      }

      requestedCourseIds.push(url.searchParams.get('courseId') || '');
      requestedClassIds.push(url.searchParams.get('classId') || '');
      await route.fulfill(json({ success: true, items: [] }));
    });

    await page.goto('/recordings', { waitUntil: 'domcontentloaded' });

    const filterSelect = page.locator('#recordings-filter-course');
    await expect(filterSelect).toContainText('Class Ten A');
    await expect(filterSelect).not.toContainText('Legacy Course Ten A');

    await filterSelect.selectOption('course-1');
    await expect.poll(() => requestedCourseIds.includes('course-1')).toBe(true);
    await expect.poll(() => requestedClassIds.includes('class-1')).toBe(true);

    const formSelect = page.locator('.recordings-form select').first();
    await expect(formSelect).toHaveValue('course-1');
    await page.locator('.recordings-form input[placeholder]').fill('Weekly Recording');
    await page.locator('.recordings-form input[type="file"]').setInputFiles({
      name: 'recording.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('recording file')
    });
    await page.locator('.recordings-form button[type="submit"]').click();

    await expect.poll(() => recordingPostData.includes('name="courseId"')).toBe(true);
    await expect.poll(() => recordingPostData.includes('course-1')).toBe(true);
    await expect.poll(() => recordingPostData.includes('name="classId"')).toBe(true);
    await expect.poll(() => recordingPostData.includes('class-1')).toBe(true);
  });

  test('recordings page exposes canonical my-courses filter to students', async ({ page }) => {
    const requestedCourseIds = [];
    const requestedClassIds = [];

    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
    }, studentSession);

    await page.route('**/api/education/my-courses', async (route) => {
      await route.fulfill(json({
        success: true,
        items: [
          {
            _id: 'course-1',
            courseId: 'course-1',
            classId: 'class-1',
            title: 'Legacy Student Course',
            schoolClass: { _id: 'class-1', title: 'Student Class A' }
          }
        ]
      }));
    });

    await page.route('**/api/recordings*', async (route) => {
      const url = new URL(route.request().url());
      requestedCourseIds.push(url.searchParams.get('courseId') || '');
      requestedClassIds.push(url.searchParams.get('classId') || '');
      await route.fulfill(json({
        success: true,
        items: [
          {
            _id: 'rec-1',
            title: 'Recorded Lesson',
            description: 'Session archive',
            sessionDate: '2026-03-10T08:00:00.000Z',
            fileUrl: 'uploads/recordings/lesson.pdf',
            course: { _id: 'course-1', title: 'Legacy Student Course' },
            createdBy: { _id: 'ins-1', name: 'Teacher One' }
          }
        ]
      }));
    });

    await page.goto('/recordings', { waitUntil: 'domcontentloaded' });

    const filterSelect = page.locator('#recordings-filter-course');
    await expect(filterSelect).toContainText('Student Class A');
    await expect(filterSelect).not.toContainText('Legacy Student Course');

    await filterSelect.selectOption('course-1');
    await expect.poll(() => requestedCourseIds.includes('course-1')).toBe(true);
    await expect.poll(() => requestedClassIds.includes('class-1')).toBe(true);
    await expect(page.locator('.recordings-item')).toContainText('Recorded Lesson');
  });

  test('course list reads the public canonical catalog instead of legacy courses/all', async ({ page }) => {
    let publicCatalogCalls = 0;
    let legacyCatalogCalls = 0;

    await page.route('**/api/education/public-school-classes*', async (route) => {
      publicCatalogCalls += 1;
      await route.fulfill(json({
        success: true,
        items: [
          {
            _id: 'course-1',
            id: 'class-1',
            classId: 'class-1',
            courseId: 'course-1',
            title: 'Class Ten A',
            description: 'Canonical public catalog item',
            category: '10',
            level: 'morning',
            tags: ['C10', 'A']
          }
        ]
      }));
    });

    await page.route('**/api/courses/all*', async (route) => {
      legacyCatalogCalls += 1;
      await route.fulfill(json({ success: true, items: [] }));
    });

    await page.route('**/api/education/public-school-classes/class-1', async (route) => {
      await route.fulfill(json({
        success: true,
        item: {
          _id: 'course-1',
          id: 'class-1',
          classId: 'class-1',
          courseId: 'course-1',
          title: 'Class Ten A',
          description: 'Canonical public catalog item',
          category: '10',
          price: 0,
          tags: ['math'],
          schoolClassRef: 'class-1',
          schoolClass: {
            _id: 'class-1',
            id: 'class-1',
            title: 'Class Ten A'
          }
        }
      }));
    });

    await page.goto('/courses', { waitUntil: 'domcontentloaded' });

    await expect.poll(() => publicCatalogCalls).toBeGreaterThan(0);
    await expect.poll(() => legacyCatalogCalls).toBe(0);
    await expect(page.locator('.grades-grid')).toContainText('Class Ten A');

    await page.locator('.grade-card.clickable').first().click();
    await expect(page).toHaveURL(/\/courses\/class-1$/);
    await expect(page.getByRole('heading', { name: 'Class Ten A' })).toBeVisible();
  });
});
