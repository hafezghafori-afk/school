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

test.describe('grade workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupShellMocks(page);
  });

  test('instructor grade manager stores the detailed 40+60 model with attachment-backed edits', async ({ page }) => {
    let saveCalls = 0;
    let lastPayload = '';

    let gradeItems = [
      {
        student: { _id: 'student-1', name: 'Student Alpha', grade: '10' },
        grade: {
          _id: 'grade-1',
          assessment40: {
            assessment1Score: 8,
            assessment2Score: 9,
            assessment3Score: 10,
            assessment4Score: 7,
            total: 34
          },
          finalExamScore: 52,
          totalScore: 86,
          attachment: 'uploads/grades/alpha-sheet.pdf',
          attachmentOriginalName: 'alpha-sheet.pdf',
          updatedAt: '2026-03-06T09:00:00.000Z'
        }
      },
      {
        student: { _id: 'student-2', name: 'Student Beta', grade: '10' },
        grade: null
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
              schoolClass: { _id: 'class-1', title: 'صنف دهم الف' }
            }
          ]
        })
      });
    });

    await page.route('**/api/grades/class/class-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: gradeItems })
      });
    });

    await page.route('**/api/grades/upsert', async (route) => {
      saveCalls += 1;
      lastPayload = route.request().postData() || '';

      gradeItems = [
        gradeItems[0],
        {
          student: { _id: 'student-2', name: 'Student Beta', grade: '10' },
          grade: {
            _id: 'grade-2',
            assessment40: {
              assessment1Score: 9,
              assessment2Score: 8,
              assessment3Score: 7,
              assessment4Score: 6,
              total: 30
            },
            finalExamScore: 48,
            totalScore: 78,
            attachment: 'uploads/grades/beta-sheet.pdf',
            attachmentOriginalName: 'beta-sheet.pdf',
            updatedAt: '2026-03-06T10:00:00.000Z'
          }
        }
      ];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, grade: gradeItems[1].grade })
      });
    });

    await page.goto('/grade-manager', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'مدیریت نمرات' })).toBeVisible();
    await expect(page.locator('.grade-summary-strip')).toBeVisible();

    const betaCard = page.locator('.grade-student-card').filter({ hasText: 'Student Beta' });
    await expect(betaCard).toBeVisible();

    const assessmentBoxes = betaCard.locator('.grade-assessment-grid .grade-input-box');
    await assessmentBoxes.nth(0).locator('input').fill('9');
    await assessmentBoxes.nth(1).locator('input').fill('8');
    await assessmentBoxes.nth(2).locator('input').fill('7');
    await assessmentBoxes.nth(3).locator('input').fill('6');
    await betaCard.locator('.grade-final-grid .grade-input-box input').fill('48');
    await betaCard.locator('.grade-file-box input[type="file"]').setInputFiles({
      name: 'beta-sheet.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('grade attachment')
    });
    await betaCard.getByRole('button', { name: 'ذخیره نمره' }).click();

    await expect.poll(() => saveCalls).toBeGreaterThan(0);
    await expect.poll(() => (
      lastPayload.includes('assessment1Score')
      && lastPayload.includes('assessment4Score')
      && lastPayload.includes('finalExamScore')
      && lastPayload.includes('beta-sheet.pdf')
        ? 'ok'
        : ''
    )).toBe('ok');

    await expect(betaCard).toContainText(/30|۳۰/);
    await expect(betaCard).toContainText(/48|۴۸/);
    await expect(betaCard).toContainText(/78|۷۸/);
    await expect(betaCard.locator('.grade-file-box')).toContainText('beta-sheet.pdf');
  });

  test('student grades page shows the detailed breakdown and report-card PDF link', async ({ page }) => {
    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
    }, studentSession);

    await page.route('**/api/grades/my', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'grade-1',
              classId: 'class-1',
              schoolClass: { _id: 'class-1', title: 'Class 10 A' },
              course: { _id: 'course-1', title: 'صنف دهم الف', category: 'Morning' },
              assessment40: {
                assessment1Score: 8,
                assessment2Score: 9,
                assessment3Score: 10,
                assessment4Score: 7,
                total: 34
              },
              finalExamScore: 52,
              totalScore: 86,
              attachment: 'uploads/grades/alpha-sheet.pdf',
              attachmentOriginalName: 'alpha-sheet.pdf',
              updatedAt: '2026-03-06T09:00:00.000Z'
            }
          ]
        })
      });
    });

    await page.route('**/api/grades/report/class/class-1', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="report-card.pdf"'
        },
        body: '%PDF-1.4 test pdf'
      });
    });

    await page.goto('/my-grades', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'نمرات من' })).toBeVisible();
    await expect(page.locator('.mygrades-breakdown > div')).toHaveCount(4);
    await expect(page.locator('.mygrades-total-row')).toContainText(/86|۸۶/);
    await expect(page.locator('.actions')).toContainText('alpha-sheet.pdf');

    const pdfFetch = await page.locator('a.download').evaluate(async (element) => {
      const response = await fetch(element.href);
      return {
        ok: response.ok,
        contentType: response.headers.get('content-type')
      };
    });

    expect(pdfFetch.ok).toBe(true);
    expect(pdfFetch.contentType).toContain('application/pdf');
  });
});
