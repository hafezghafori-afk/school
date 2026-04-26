import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

const studentSession = {
  token: 'mock.header.signature',
  role: 'student',
  userId: 'student-1',
  userName: 'Student Alpha'
};

const instructorSession = {
  token: 'mock.header.signature',
  role: 'instructor',
  userId: 'ins-1',
  userName: 'Teacher One',
  permissions: ['manage_content']
};

function json(body, status = 200, headers = {}) {
  return {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  };
}

async function setupShellMocks(page, session) {
  await page.addInitScript((value) => {
    localStorage.setItem('token', value.token);
    localStorage.setItem('role', value.role);
    localStorage.setItem('userId', value.userId);
    localStorage.setItem('userName', value.userName);
    if (Array.isArray(value.permissions)) {
      localStorage.setItem('effectivePermissions', JSON.stringify(value.permissions));
    }
    if (value.lastLoginAt) {
      localStorage.setItem('lastLoginAt', value.lastLoginAt);
    }
  }, session);

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
}

function buildTimetableState() {
  const referenceData = {
    success: true,
    activeYear: { id: 'year-1', title: '1406' },
    academicYears: [{ id: 'year-1', title: '1406', code: '1406' }],
    academicTerms: [{ id: 'term-1', title: 'ترم اول', code: 'T1' }],
    classes: [
      {
        id: 'class-1',
        title: 'صنف دهم الف',
        code: '10A',
        academicYear: { id: 'year-1', title: '1406' }
      }
    ],
    subjects: [
      {
        id: 'subject-1',
        name: 'ریاضی',
        grade: '10'
      }
    ],
    teacherAssignments: [
      {
        id: 'assignment-1',
        teacher: { id: 'teacher-1', name: 'استاد احمد' },
        subject: { id: 'subject-1', name: 'ریاضی' },
        schoolClass: { id: 'class-1', title: 'صنف دهم الف' },
        academicYear: { id: 'year-1', title: '1406' },
        term: { id: 'term-1', title: 'ترم اول' }
      }
    ],
    holidays: [{ id: 'holiday-1', title: 'جمعه رسمی' }]
  };

  return {
    referenceData,
    configs: [
      {
        id: 'config-1',
        name: 'Config Early',
        schoolClass: { id: 'class-1', title: 'صنف دهم الف' }
      }
    ],
    entries: [
      {
        id: 'entry-1',
        academicYear: { id: 'year-1', title: '1406' },
        term: { id: 'term-1', title: 'ترم اول' },
        schoolClass: { id: 'class-1', title: 'صنف دهم الف' },
        subject: { id: 'subject-1', name: 'ریاضی' },
        teacherAssignment: {
          id: 'assignment-1',
          teacher: { id: 'teacher-1', name: 'استاد احمد' }
        },
        config: { id: 'config-1', name: 'Config Early' },
        dayOfWeek: 'saturday',
        occurrenceDate: '2026-03-15',
        startTime: '08:00',
        endTime: '08:45',
        room: 'A-1',
        status: 'active'
      }
    ],
    annualPlans: [],
    weeklyPlans: [],
    configPosts: 0,
    entryPosts: 0,
    entryUpdates: 0,
    annualPosts: 0,
    weeklyPosts: 0
  };
}

async function registerTimetableRoutes(page, state, { conflictOnEntry = false } = {}) {
  const getClass = (id) => state.referenceData.classes.find((item) => String(item.id) === String(id));
  const getSubject = (id) => state.referenceData.subjects.find((item) => String(item.id) === String(id));
  const getAssignment = (id) => state.referenceData.teacherAssignments.find((item) => String(item.id) === String(id));
  const getTerm = (id) => state.referenceData.academicTerms.find((item) => String(item.id) === String(id));
  const getYear = (id) => state.referenceData.academicYears.find((item) => String(item.id) === String(id));
  const getConfig = (id) => state.configs.find((item) => String(item.id) === String(id));
  const getAnnualPlan = (id) => state.annualPlans.find((item) => String(item.id) === String(id));

  await page.route('**/api/timetables/reference-data', async (route) => {
    await route.fulfill(json(state.referenceData));
  });

  await page.route('**/api/timetables/configs*', async (route) => {
    if (route.request().method() === 'POST') {
      state.configPosts += 1;
      const body = route.request().postDataJSON();
      const item = {
        id: `config-${state.configs.length + 1}`,
        academicYear: getYear(body.academicYearId),
        term: getTerm(body.termId),
        schoolClass: getClass(body.classId),
        name: body.name,
        dayStartTime: body.dayStartTime,
        dayEndTime: body.dayEndTime,
        slotDurationMinutes: body.slotDurationMinutes,
        daysOfWeek: body.daysOfWeek || []
      };
      state.configs.push(item);
      await route.fulfill(json({ success: true, item }, 201));
      return;
    }

    await route.fulfill(json({ success: true, items: state.configs }));
  });

  await page.route('**/api/timetables/entries/*', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }

    state.entryUpdates += 1;
    const entryId = route.request().url().split('/').pop();
    const body = route.request().postDataJSON();
    state.entries = state.entries.map((item) => {
      if (String(item.id) !== String(entryId)) return item;
      return {
        ...item,
        academicYear: getYear(body.academicYearId) || item.academicYear,
        term: getTerm(body.termId) || item.term,
        schoolClass: getClass(body.classId) || item.schoolClass,
        subject: getSubject(body.subjectId) || item.subject,
        teacherAssignment: getAssignment(body.teacherAssignmentId) || item.teacherAssignment,
        config: getConfig(body.configId) || item.config,
        dayOfWeek: body.dayOfWeek || item.dayOfWeek,
        occurrenceDate: body.occurrenceDate || item.occurrenceDate,
        startTime: body.startTime || item.startTime,
        endTime: body.endTime || item.endTime,
        room: body.room || item.room,
        status: body.status || item.status
      };
    });

    const item = state.entries.find((entry) => String(entry.id) === String(entryId));
    await route.fulfill(json({ success: true, item }));
  });

  await page.route('**/api/timetables/entries/conflict-preview*', async (route) => {
    if (conflictOnEntry) {
      await route.fulfill(json({
        success: true,
        result: {
          hasConflict: true,
          conflicts: [
            {
              type: 'class',
              startTime: '08:00',
              endTime: '08:45',
              dayOfWeek: 'saturday'
            }
          ],
          suggestions: [
            {
              dayOfWeek: 'saturday',
              startTime: '09:00',
              endTime: '09:45'
            }
          ]
        }
      }));
      return;
    }

    await route.fulfill(json({
      success: true,
      result: {
        hasConflict: false,
        conflicts: [],
        suggestions: []
      }
    }));
  });

  await page.route('**/api/timetables/entries*', async (route) => {
    if (route.request().method() === 'POST') {
      state.entryPosts += 1;
      if (conflictOnEntry) {
        await route.fulfill(json({ success: false, message: 'تداخل زمانی برای این assignment ثبت شده است.' }, 409));
        return;
      }

      const body = route.request().postDataJSON();
      const item = {
        id: `entry-${state.entries.length + 1}`,
        academicYear: getYear(body.academicYearId),
        term: getTerm(body.termId),
        schoolClass: getClass(body.classId),
        subject: getSubject(body.subjectId),
        teacherAssignment: getAssignment(body.teacherAssignmentId),
        config: getConfig(body.configId),
        dayOfWeek: body.dayOfWeek,
        occurrenceDate: body.occurrenceDate,
        startTime: body.startTime,
        endTime: body.endTime,
        room: body.room,
        status: body.status
      };
      state.entries.push(item);
      await route.fulfill(json({ success: true, item }, 201));
      return;
    }

    await route.fulfill(json({ success: true, items: state.entries }));
  });

  await page.route('**/api/timetables/annual-plans*', async (route) => {
    if (route.request().method() === 'POST') {
      state.annualPosts += 1;
      const body = route.request().postDataJSON();
      const item = {
        id: `annual-${state.annualPlans.length + 1}`,
        academicYear: getYear(body.academicYearId),
        term: getTerm(body.termId),
        schoolClass: getClass(body.classId),
        subject: getSubject(body.subjectId),
        teacherAssignment: getAssignment(body.teacherAssignmentId),
        title: body.title,
        annualTargetPeriods: body.annualTargetPeriods,
        weeklyTargetPeriods: body.weeklyTargetPeriods,
        status: 'active'
      };
      state.annualPlans.unshift(item);
      await route.fulfill(json({ success: true, item }, 201));
      return;
    }

    await route.fulfill(json({ success: true, items: state.annualPlans }));
  });

  await page.route('**/api/timetables/weekly-plans*', async (route) => {
    if (route.request().method() === 'POST') {
      state.weeklyPosts += 1;
      const body = route.request().postDataJSON();
      const annualPlan = getAnnualPlan(body.annualPlanId);
      const item = {
        id: `weekly-${state.weeklyPlans.length + 1}`,
        annualPlan,
        weekStartDate: body.weekStartDate,
        weekEndDate: body.weekEndDate,
        lessonTitle: body.lessonTitle,
        lessonNumber: body.lessonNumber,
        homework: body.homework,
        status: 'active'
      };
      state.weeklyPlans.unshift(item);
      await route.fulfill(json({ success: true, item }, 201));
      return;
    }

    await route.fulfill(json({ success: true, items: state.weeklyPlans }));
  });
}

test.describe('schedule workflow', () => {
  test('admin schedule manages canonical configs, entries, and plans', async ({ page }) => {
    const state = buildTimetableState();

    await setupAdminWorkspace(page, {
      permissions: ['manage_schedule', 'manage_content']
    });
    await registerTimetableRoutes(page, state);

    await page.goto('/admin-schedule', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'مرکز تقسیم اوقات و پلان تعلیمی' })).toBeVisible();

    const configCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'تنظیم تقسیم اوقات' }) }).first();
    await configCard.locator('input').first().fill('Config Main');
    await configCard.getByRole('button', { name: 'ذخیره تنظیم' }).click();

    await expect.poll(() => state.configPosts).toBe(1);

    const createEntryCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'ثبت خانه تقسیم اوقات' }) }).first();
    await createEntryCard.locator('select').nth(0).selectOption('assignment-1');
    await createEntryCard.locator('select').nth(3).selectOption('config-2');
    await createEntryCard.locator('input[type="date"]').fill('2026-03-16');
    await createEntryCard.locator('input[placeholder="اتاق ۱۲-ب"]').fill('B-12');
    await createEntryCard.getByRole('button', { name: 'ثبت خانه' }).click();

    await expect.poll(() => state.entryPosts).toBe(1);
    const entriesCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'خانه‌های تقسیم اوقات' }) }).first();
    await expect(entriesCard.locator('table')).toContainText('صنف دهم الف');
    await expect(entriesCard.locator('table')).toContainText('ریاضی');
    await expect(entriesCard.locator('table')).toContainText('استاد احمد');

    const annualCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'پلان تعلیمی سالانه' }) }).first();
    await annualCard.locator('select').first().selectOption('assignment-1');
    await annualCard.locator('input').first().fill('برنامه سالانه ریاضی');
    await annualCard.getByRole('button', { name: 'ذخیره پلان سالانه' }).click();

    await expect.poll(() => state.annualPosts).toBe(1);
    const annualPlansCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'پلان‌های سالانه' }) }).first();
    await expect(annualPlansCard.locator('table')).toContainText('برنامه سالانه ریاضی');

    const weeklyCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'پلان تعلیمی هفته‌وار' }) }).first();
    await weeklyCard.locator('select').first().selectOption('annual-1');
    await weeklyCard.locator('input[type="date"]').nth(0).fill('2026-03-16');
    await weeklyCard.locator('input[type="date"]').nth(1).fill('2026-03-21');
    await weeklyCard.locator('input:not([type="date"])').fill('فصل اعداد صحیح');
    await weeklyCard.locator('textarea').nth(2).fill('تمرین صفحه 12');
    await weeklyCard.getByRole('button', { name: 'ذخیره پلان هفته‌وار' }).click();

    await expect.poll(() => state.weeklyPosts).toBe(1);
    const weeklyPlansCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'پلان‌های هفته‌وار' }) }).first();
    await expect(weeklyPlansCard.locator('table')).toContainText('فصل اعداد صحیح');

    await entriesCard.getByRole('button', { name: 'ویرایش' }).last().click();
    const editingEntryCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'ویرایش خانه تقسیم اوقات' }) }).first();
    await expect(editingEntryCard.getByRole('heading', { name: 'ویرایش خانه تقسیم اوقات' })).toBeVisible();
    await editingEntryCard.locator('select').last().selectOption('archived');
    await editingEntryCard.getByRole('button', { name: 'ذخیره تغییرات' }).click();

    await expect.poll(() => state.entryUpdates).toBe(1);
    await expect(entriesCard.locator('table')).toContainText('آرشیف‌شده');
  });

  test('admin schedule surfaces canonical conflict messages for timetable entries', async ({ page }) => {
    const state = buildTimetableState();

    await setupAdminWorkspace(page, {
      permissions: ['manage_schedule', 'manage_content']
    });
    await registerTimetableRoutes(page, state, { conflictOnEntry: true });

    await page.goto('/admin-schedule', { waitUntil: 'domcontentloaded' });

    const createEntryCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'ثبت خانه تقسیم اوقات' }) }).first();
    await createEntryCard.locator('select').nth(0).selectOption('assignment-1');
    await createEntryCard.locator('input[type="date"]').fill('2026-03-17');
    await createEntryCard.locator('input[placeholder="اتاق ۱۲-ب"]').fill('B-13');
    await createEntryCard.getByRole('button', { name: 'ثبت خانه' }).click();

    await expect.poll(() => state.entryPosts).toBe(0);
    await expect(page.locator('.admin-workspace-message.error').first()).toContainText('تداخل');
  });

  test('student dashboard shows today schedule automatically from the published feed', async ({ page }) => {
    await setupShellMocks(page, {
      ...studentSession,
      lastLoginAt: '2026-03-06 08:00'
    });

    await page.route('**/api/users/me', async (route) => {
      await route.fulfill(json({ success: true, user: { _id: 'student-1', name: 'Student Alpha', grade: '10' } }));
    });

    await page.route('**/api/schedules/today', async (route) => {
      await route.fulfill(json({
        success: true,
        items: [
          {
            _id: 'sch-published',
            subject: 'Math',
            startTime: '08:00',
            endTime: '09:00',
            instructor: { _id: 'ins-1', name: 'Teacher Ahmad' }
          }
        ]
      }));
    });

    await page.route('**/api/users/me/profile-update-request', async (route) => {
      await route.fulfill(json({ success: true, item: null }));
    });

    await page.route('**/api/orders/user/student-1', async (route) => {
      await route.fulfill(json({
        success: true,
        items: [
          {
            _id: 'ord-1',
            status: 'approved',
            course: { _id: 'course-1', title: 'Class 10 A Core', category: 'Morning' }
          }
        ]
      }));
    });

    await page.route('**/api/education/my-courses', async (route) => {
      await route.fulfill(json({
        success: true,
        items: [
          {
            _id: 'course-1',
            title: 'Legacy Class 10 A',
            classId: 'class-1',
            schoolClass: { _id: 'class-1', title: 'Class 10 A Core' }
          }
        ]
      }));
    });

    await page.route('**/api/homeworks/my/submissions', async (route) => {
      await route.fulfill(json({ success: true, items: [] }));
    });

    await page.route('**/api/homeworks/class/class-1', async (route) => {
      await route.fulfill(json({ success: true, items: [] }));
    });

    await page.route('**/api/users/me/activity', async (route) => {
      await route.fulfill(json({ success: true, items: [] }));
    });

    await page.route('**/api/student-finance/me/overviews', async (route) => {
      await route.fulfill(json({ success: true, items: [{ summary: { totalOutstanding: 0, pendingPayments: 0 } }] }));
    });

    await page.route('**/api/attendance/my/weekly', async (route) => {
      await route.fulfill(json({ success: true, week: { start: '2026-02-29', end: '2026-03-06' }, summary: { totalRecords: 0 } }));
    });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const todayRow = page.locator('.dash-panel-row').filter({ hasText: '08:00 - 09:00' }).first();
    await expect(todayRow).toContainText('Math - Teacher Ahmad');
    await expect(todayRow).toContainText('08:00 - 09:00');
    await expect(page.locator('.dash-stats > div').nth(2).locator('strong')).not.toHaveText('0');
  });

  test('instructor dashboard shows today schedule automatically for the instructor audience', async ({ page }) => {
    await setupShellMocks(page, instructorSession);

    await page.route('**/api/users/me', async (route) => {
      await route.fulfill(json({ success: true, user: { _id: 'ins-1', name: 'Teacher One', subject: 'Math' } }));
    });

    await page.route('**/api/schedules/today', async (route) => {
      await route.fulfill(json({
        success: true,
        items: [
          {
            _id: 'sch-teacher-1',
            subject: 'Math',
            startTime: '08:00',
            endTime: '09:00',
            schoolClass: { _id: 'class-1', title: 'Class 10 A Core' },
            classId: 'class-1',
            course: { _id: 'course-1', title: 'Legacy Class 10 A' }
          }
        ]
      }));
    });

    await page.route('**/api/education/instructor/courses', async (route) => {
      await route.fulfill(json({
        success: true,
        items: [
          {
            _id: 'course-1',
            title: 'Legacy Class 10 A',
            classId: 'class-1',
            schoolClass: { _id: 'class-1', title: 'Class 10 A Core' }
          }
        ]
      }));
    });

    await page.route('**/api/education/instructor/join-requests', async (route) => {
      await route.fulfill(json({ success: true, items: [] }));
    });

    await page.route('**/api/users', async (route) => {
      await route.fulfill(json({ success: true, items: [{ _id: 'student-1', role: 'student', name: 'Student Alpha' }] }));
    });

    await page.route('**/api/education/instructor/course-students?classId=class-1', async (route) => {
      await route.fulfill(json({
        success: true,
        items: [
          { _id: 'ord-1', user: { _id: 'student-1', name: 'Student Alpha', email: 'alpha@example.com' } }
        ]
      }));
    });

    await page.route('**/api/attendance/class/class-1/weekly', async (route) => {
      await route.fulfill(json({ success: true, week: { start: '2026-02-29', end: '2026-03-06' }, summary: { totalRecords: 0 } }));
    });

    await page.goto('/instructor-dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'داشبورد استاد' })).toBeVisible();
    await expect(page.getByText('دسترسی محدود')).toHaveCount(0);

    const todayRow = page.locator('.dash-panel-row').filter({ hasText: '08:00 - 09:00' }).first();
    await expect(todayRow).toContainText('Math - Class 10 A Core');
    await expect(todayRow).toContainText('08:00 - 09:00');
    await expect(page.locator('.dash-stats > div').nth(2).locator('strong')).not.toHaveText('0');
  });
});
