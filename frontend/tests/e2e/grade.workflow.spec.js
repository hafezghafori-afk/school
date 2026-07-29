import { test, expect } from '@playwright/test';

const instructorSession = {
  token: 'mock.header.signature',
  role: 'instructor',
  userId: 'teacher-1',
  userName: 'استاد احمد',
  permissions: ['manage_content']
};

const studentSession = {
  token: 'mock.header.signature',
  role: 'student',
  userId: 'student-1',
  userName: 'شاگرد آزمایشی',
  permissions: ['grades.my.view']
};

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  };
}

async function setupShell(page, session) {
  await page.addInitScript((value) => {
    localStorage.setItem('token', value.token);
    localStorage.setItem('role', value.role);
    localStorage.setItem('userId', value.userId);
    localStorage.setItem('userName', value.userName);
    localStorage.setItem('effectivePermissions', JSON.stringify(value.permissions || []));
  }, session);

  await page.route('**/api/settings/public', async (route) => route.fulfill(json({ success: true, settings: {} })));
  await page.route('**/api/health', async (route) => route.fulfill(json({ success: true })));
  await page.route('**/api/users/me/notifications', async (route) => route.fulfill(json({ success: true, items: [] })));
  await page.route('**/api/users/me/notifications/read-all', async (route) => route.fulfill(json({ success: true })));
  await page.route('**/api/users/me/notifications/*/read', async (route) => route.fulfill(json({ success: true })));
  await page.route('**/api/users/me', async (route) => route.fulfill(json({
    success: true,
    user: {
      _id: session.userId,
      id: session.userId,
      name: session.userName,
      role: session.role,
      permissions: session.permissions || [],
      effectivePermissions: session.permissions || []
    }
  })));
}

const referenceData = {
  success: true,
  academicYears: [{ id: 'year-1', title: '۱۴۰۵', isActive: true }],
  assessmentPeriods: [{ id: 'period-1', title: 'چهارنیم‌ماهه', academicYear: { id: 'year-1' }, isActive: true }],
  classes: [{ id: 'class-1', title: 'صنف دهم الف', academicYear: { id: 'year-1' } }],
  subjects: [{ id: 'subject-1', name: 'ریاضی' }],
  examTypes: [{ id: 'exam-type-1', code: 'FOUR_HALF_MONTH', title: 'امتحان چهارنیم‌ماهه' }],
  teacherAssignments: [{
    id: 'assignment-1',
    academicYear: { id: 'year-1' },
    assessmentPeriod: { id: 'period-1' },
    teacher: { id: 'teacher-1', name: 'استاد احمد' },
    schoolClass: { id: 'class-1', title: 'صنف دهم الف' },
    subject: { id: 'subject-1', name: 'ریاضی' }
  }],
  reviewers: [{ id: 'reviewer-1', name: 'استاد ممیز' }]
};

function buildSession(status = 'draft') {
  return {
    id: 'session-1',
    code: 'MATH-1405',
    title: 'شقه ریاضی چهارنیم‌ماهه',
    status,
    version: 1,
    heldAt: '2026-07-06',
    monthLabel: 'سرطان',
    subject: { id: 'subject-1', name: 'ریاضی' },
    schoolClass: { id: 'class-1', title: 'صنف دهم الف' },
    assessmentPeriod: { id: 'period-1', title: 'چهارنیم‌ماهه' },
    examType: { id: 'exam-type-1', title: 'امتحان چهارنیم‌ماهه' },
    defaultMark: { totalMark: 40, passMark: 16 },
    teacherAssignment: { id: 'assignment-1', teacher: { id: 'teacher-1', name: 'استاد احمد' } }
  };
}

function buildMarksResponse(status = 'draft', overrides = {}) {
  return {
    success: true,
    session: buildSession(status),
    scoreComponents: {
      attendanceMax: 5,
      writtenMax: 20,
      oralMax: 10,
      classActivityMax: 0,
      homeworkMax: 5
    },
    isEditable: ['draft', 'active'].includes(status),
    summary: { eligibleMemberships: 2, recordedMarks: overrides.recorded ? 1 : 0, pendingMarks: overrides.recorded ? 0 : 1 },
    items: [{
      membership: { id: 'membership-1', status: 'active', statusLabel: 'فعال' },
      row: {
        rowNumber: 1,
        admissionNo: 'A-001',
        studentName: 'علی احمدی',
        fatherName: 'محمد',
        membershipStatus: 'active',
        membershipStatusLabel: 'فعال',
        attendanceScore: 5,
        writtenScore: overrides.recorded ? 16 : null,
        oralScore: overrides.recorded ? 8 : null,
        classActivityScore: overrides.recorded ? 0 : null,
        homeworkScore: overrides.recorded ? 5 : null,
        markStatus: overrides.recorded ? 'recorded' : 'pending',
        note: ''
      }
    }]
  };
}

test.describe('grade workflow', () => {
  test('teacher completes an assigned sheet, sees totals, and submits it for approval', async ({ page }) => {
    await setupShell(page, instructorSession);
    let status = 'draft';
    let recorded = false;
    let savedPayload = null;
    let statusPayload = null;

    await page.route('**/api/exams/reference-data', async (route) => route.fulfill(json(referenceData)));
    await page.route('**/api/exams/sessions?*', async (route) => route.fulfill(json({ success: true, items: [buildSession(status)] })));
    await page.route('**/api/exams/sessions/session-1/marks', async (route) => route.fulfill(json(buildMarksResponse(status, { recorded }))));
    await page.route('**/api/exams/sessions/session-1/marks/batch', async (route) => {
      savedPayload = route.request().postDataJSON();
      recorded = true;
      await route.fulfill(json(buildMarksResponse(status, { recorded })));
    });
    await page.route('**/api/exams/sessions/session-1/status', async (route) => {
      statusPayload = route.request().postDataJSON();
      status = statusPayload.status;
      await route.fulfill(json({ success: true, item: buildSession(status) }));
    });

    await page.goto('/grade-manager', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'شقه مضمون و مدیریت نمرات' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('شقه‌های تخصیص‌شده به من')).toBeVisible();
    await expect(page.getByRole('button', { name: 'مرکز مدیریت و تخصیص شقه‌ها' })).toHaveCount(0);

    const row = page.locator('.grade-sheet-table tbody tr').filter({ hasText: 'علی احمدی' });
    await expect(row).toBeVisible();
    const inputs = row.locator('input.score-input');
    await expect(inputs.nth(0)).toBeDisabled();
    await inputs.nth(1).fill('16');
    await inputs.nth(2).fill('8');
    await inputs.nth(4).fill('5');
    await expect(row.locator('.total-cell').first()).toContainText(/34|۳۴/);
    await expect(row).toContainText(/85٪|۸۵٪/);

    await page.getByRole('button', { name: /ذخیره تغییرات/ }).click();
    await expect.poll(() => savedPayload).toBeTruthy();
    expect(savedPayload.items[0]).toMatchObject({
      studentMembershipId: 'membership-1',
      markStatus: 'recorded',
      scoreBreakdown: {
        attendanceScore: '5',
        writtenScore: '16',
        oralScore: '8',
        classActivityScore: '',
        homeworkScore: '5'
      }
    });
    await expect(page.getByText('تغییرات شقه ذخیره شد.')).toBeVisible();

    await page.getByRole('button', { name: 'ارسال برای تأیید' }).click();
    await expect.poll(() => statusPayload).toEqual({ status: 'submitted', monthLabel: 'سرطان' });
    await expect(page.getByText('شقه برای بررسی و تأیید ارسال شد.')).toBeVisible();
  });

  test('student sees an approved result with every component and the automatic percentage', async ({ page }) => {
    await setupShell(page, studentSession);
    await page.route('**/api/exams/my/results', async (route) => route.fulfill(json({
      success: true,
      student: { id: 'student-1', fullName: 'علی احمدی', admissionNo: 'A-001' },
      items: [{
        id: 'result-1',
        obtainedMark: 34,
        totalMark: 40,
        percentage: 85,
        resultStatus: 'passed',
        computedAt: '2026-07-07T08:00:00.000Z',
        scoreBreakdown: {
          attendanceScore: 5,
          writtenScore: 16,
          oralScore: 8,
          classActivityScore: 0,
          homeworkScore: 5
        },
        subject: { name: 'ریاضی' },
        schoolClass: { title: 'صنف دهم الف' },
        examType: { title: 'امتحان چهارنیم‌ماهه' },
        assessmentPeriod: { title: 'چهارنیم‌ماهه' },
        session: {
          status: 'approved',
          approvedAt: '2026-07-07T08:00:00.000Z',
          monthLabel: 'سرطان'
        }
      }]
    })));

    await page.goto('/my-grades', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'نتایج امتحانات من' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.mygrades-breakdown > div')).toHaveCount(5);
    await expect(page.locator('.mygrades-item')).toContainText('حاضری');
    await expect(page.locator('.mygrades-item')).toContainText(/نمره:.*۳۴/);
    await expect(page.locator('.mygrades-item')).toContainText(/فیصدی:.*۸۵%/);
    await expect(page.locator('.mygrades-item')).toContainText('حالت: کامیاب');
    await expect(page.locator('.mygrades-total-row')).toContainText(/۳۴.*۴۰/);
    await expect(page.locator('.mygrades-total-row')).toContainText('تاریخ نتیجه');
  });
});
