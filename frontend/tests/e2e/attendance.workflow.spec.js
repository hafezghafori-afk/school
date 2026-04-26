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

test.describe('attendance workflow', () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test('instructor attendance manager supports register, reports, and CSV exports', async ({ page }) => {
    let upsertCalls = 0;
    let classExportCalls = 0;
    let studentExportCalls = 0;

    const classReport = {
      success: true,
      course: { _id: 'course-1', title: 'Class One', category: 'Morning' },
      range: { from: '2026-02-29', to: '2026-03-06' },
      summary: {
        attendanceRate: 75,
        totalStudents: 2,
        recordedStudents: 2,
        totalDays: 2,
        present: 3,
        absent: 1,
        late: 0,
        excused: 0
      },
      students: [
        {
          student: { _id: 'student-1', name: 'Student Alpha', grade: '10' },
          present: 2,
          absent: 0,
          late: 0,
          excused: 0,
          attendanceRate: 100,
          lastStatus: 'present',
          lastDate: '2026-03-06'
        },
        {
          student: { _id: 'student-2', name: 'Student Beta', grade: '10' },
          present: 1,
          absent: 1,
          late: 0,
          excused: 0,
          attendanceRate: 50,
          lastStatus: 'absent',
          lastDate: '2026-03-06'
        }
      ],
      byDate: [
        { date: '2026-03-05', present: 2, absent: 0, late: 0, excused: 0, attendanceRate: 100 },
        { date: '2026-03-06', present: 1, absent: 1, late: 0, excused: 0, attendanceRate: 50 }
      ]
    };

    const studentReport = {
      success: true,
      student: { _id: 'student-1', name: 'Student Alpha', grade: '10' },
      course: { _id: 'course-1', title: 'Class One', category: 'Morning' },
      range: { from: '2026-02-29', to: '2026-03-06' },
      summary: {
        attendanceRate: 100,
        totalRecords: 2,
        currentAbsentStreak: 0,
        present: 2,
        absent: 0,
        late: 0,
        excused: 0,
        lastStatus: 'present',
        lastDate: '2026-03-06'
      },
      recent: [
        {
          _id: 'att-2',
          date: '2026-03-06',
          status: 'present',
          note: '',
          course: { _id: 'course-1', title: 'Class One' }
        },
        {
          _id: 'att-1',
          date: '2026-03-05',
          status: 'present',
          note: 'On time',
          course: { _id: 'course-1', title: 'Class One' }
        }
      ],
      byDate: [
        { date: '2026-03-05', present: 1, absent: 0, late: 0, excused: 0, attendanceRate: 100 },
        { date: '2026-03-06', present: 1, absent: 0, late: 0, excused: 0, attendanceRate: 100 }
      ],
      byCourse: [
        {
          course: { _id: 'course-1', title: 'Class One' },
          present: 2,
          absent: 0,
          late: 0,
          excused: 0,
          attendanceRate: 100
        }
      ]
    };

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
              title: 'Legacy Class One',
              courseId: 'course-1',
              classId: 'class-1',
              schoolClass: { _id: 'class-1', title: 'Class One' }
            }
          ]
        })
      });
    });

    await page.route('**/api/attendance/class/class-1?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              student: { _id: 'student-1', name: 'Student Alpha', grade: '10' },
              attendance: { _id: 'att-1', status: 'present', note: '' }
            },
            {
              student: { _id: 'student-2', name: 'Student Beta', grade: '10' },
              attendance: { _id: 'att-2', status: 'absent', note: '' }
            }
          ]
        })
      });
    });

    await page.route('**/api/attendance/upsert', async (route) => {
      upsertCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          attendance: { _id: `saved-${upsertCalls}` }
        })
      });
    });

    await page.route('**/api/attendance/class/class-1/summary?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classReport)
      });
    });

    await page.route('**/api/attendance/student/student-1/summary?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(studentReport)
      });
    });

    await page.route('**/api/attendance/class/class-1/export.csv?*', async (route) => {
      classExportCalls += 1;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="attendance-course-test.csv"'
        },
        body: 'ReportType,Course\nSummary,Class One'
      });
    });

    await page.route('**/api/attendance/student/student-1/export.csv?*', async (route) => {
      studentExportCalls += 1;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="attendance-student-test.csv"'
        },
        body: 'ReportType,Student\nSummary,Student Alpha'
      });
    });

    await page.goto('/attendance-manager', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'حضور و غیاب' })).toBeVisible();
    await expect(page.locator('.attendance-row').filter({ hasText: 'Student Alpha' })).toBeVisible();

    await page.locator('.attendance-row').filter({ hasText: 'Student Beta' }).locator('select').selectOption('late');
    await page.getByRole('button', { name: /ذخیره همه تغییرات/ }).click();
    await expect.poll(() => upsertCalls).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'گزارش صنف' }).click();
    await page.getByRole('button', { name: 'نمایش گزارش صنف' }).click();
    await expect(page.locator('.attendance-report-row').filter({ hasText: 'Student Alpha' })).toBeVisible();

    await page.getByRole('button', { name: 'خروجی CSV' }).click();
    await expect.poll(() => classExportCalls).toBeGreaterThan(0);

    await page.locator('.attendance-tabs').getByRole('button', { name: 'گزارش فردی' }).click();
    await expect(page.locator('.attendance-tabs button.active')).toHaveText('گزارش فردی');
    await page.locator('.attendance-filter-group label:has-text("شاگرد") select').selectOption('student-1');
    await page.getByRole('button', { name: 'نمایش گزارش فردی' }).click();
    await expect(page.locator('.attendance-section').filter({ hasText: 'Student Alpha' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'خروجی CSV' }).click();
    await expect.poll(() => studentExportCalls).toBeGreaterThan(0);
  });

  test('student attendance workflow shows dashboard summary and self-view filters', async ({ page }) => {
    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
      localStorage.setItem('lastLoginAt', '2026-03-06 08:00');
    }, studentSession);

    await page.route('**/api/users/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, user: { _id: 'student-1', name: 'Student Alpha', grade: '10' } })
      });
    });

    await page.route('**/api/schedules/today', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/users/me/profile-update-request', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: null })
      });
    });

    await page.route('**/api/orders/user/student-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'ord-1',
              status: 'approved',
              course: { _id: 'course-1', title: 'Class One', category: 'Morning' }
            }
          ]
        })
      });
    });

    await page.route('**/api/education/my-courses', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'course-1',
              title: 'Legacy Class One',
              classId: 'class-1',
              schoolClass: { _id: 'class-1', title: 'Class One' }
            }
          ]
        })
      });
    });

    await page.route('**/api/homeworks/my/submissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/homeworks/class/class-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/users/me/activity', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/student-finance/me/overviews', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [{ summary: { totalOutstanding: 0, pendingPayments: 0 } }] })
      });
    });

    await page.route('**/api/attendance/my/weekly', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          week: { start: '2026-02-29', end: '2026-03-06' },
          summary: {
            totalRecords: 4,
            attendanceRate: 75,
            present: 3,
            absent: 1,
            late: 0,
            excused: 0,
            currentAbsentStreak: 1
          }
        })
      });
    });

    await page.route('**/api/attendance/my', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'att-1',
              date: '2026-03-06',
              createdAt: '2026-03-06T08:00:00.000Z',
              status: 'absent',
              note: 'Medical leave',
              course: { _id: 'course-1', title: 'Class One', category: 'Morning' }
            },
            {
              _id: 'att-2',
              date: '2026-03-05',
              createdAt: '2026-03-05T08:00:00.000Z',
              status: 'present',
              note: '',
              course: { _id: 'course-1', title: 'Class One', category: 'Morning' }
            }
          ]
        })
      });
    });

    await page.route('**/api/attendance/my?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'att-1',
              date: '2026-03-06',
              createdAt: '2026-03-06T08:00:00.000Z',
              status: 'absent',
              note: 'Medical leave',
              course: { _id: 'course-1', title: 'Class One', category: 'Morning' }
            },
            {
              _id: 'att-2',
              date: '2026-03-05',
              createdAt: '2026-03-05T08:00:00.000Z',
              status: 'present',
              note: '',
              course: { _id: 'course-1', title: 'Class One', category: 'Morning' }
            }
          ]
        })
      });
    });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.dash-summary-grid').first()).toBeVisible();
    await expect(page.locator('.dash-inline-meta').first()).toBeVisible();

    await page.goto('/my-attendance', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'حضور و غیاب من' })).toBeVisible();
    await expect(page.locator('.myattendance-summary-grid')).toBeVisible();
    await page.locator('.myattendance-filters select').nth(1).selectOption('absent');
    await expect(page.locator('.myattendance-item')).toHaveCount(1);
    await expect(page.locator('.myattendance-pill.absent')).toBeVisible();
  });

  test('instructor dashboard shows weekly class summary for the selected course', async ({ page }) => {
    await page.addInitScript((session) => {
      localStorage.setItem('token', session.token);
      localStorage.setItem('role', session.role);
      localStorage.setItem('userId', session.userId);
      localStorage.setItem('userName', session.userName);
      localStorage.setItem('effectivePermissions', JSON.stringify(session.permissions));
    }, instructorSession);

    await page.route('**/api/users/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, user: { _id: 'ins-1', name: 'Teacher One', subject: 'Math' } })
      });
    });

    await page.route('**/api/schedules/today', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/education/instructor/courses', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'course-1',
              title: 'Legacy Class One',
              classId: 'class-1',
              schoolClass: { _id: 'class-1', title: 'Class One' }
            }
          ]
        })
      });
    });

    await page.route('**/api/education/instructor/join-requests', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            { _id: 'student-1', role: 'student', name: 'Student Alpha' }
          ]
        })
      });
    });

    await page.route('**/api/education/instructor/course-students?classId=class-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            { _id: 'ord-1', user: { _id: 'student-1', name: 'Student Alpha', email: 'alpha@example.com' } }
          ]
        })
      });
    });

    await page.route('**/api/attendance/class/class-1/weekly', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          week: { start: '2026-02-29', end: '2026-03-06' },
          summary: {
            totalRecords: 4,
            totalStudents: 2,
            recordedStudents: 2,
            totalDays: 2,
            attendanceRate: 75,
            present: 3,
            absent: 1,
            late: 0,
            excused: 0
          }
        })
      });
    });

    await page.goto('/instructor-dashboard', { waitUntil: 'domcontentloaded' });
    const summaryGrid = page.locator('.dash-summary-grid').first();
    await expect(summaryGrid).toBeVisible();
    await expect(summaryGrid.locator('.dash-summary-card')).toHaveCount(4);
    await expect(page.locator('.dash-inline-meta').first()).toContainText('Class One');
  });
});
