import { test, expect } from '@playwright/test';

const instructorSession = {
  token: 'mock.header.signature',
  role: 'instructor',
  userId: 'teacher-1',
  userName: 'استاد احمد',
  permissions: ['manage_content']
};

const adminSession = {
  token: 'mock.admin.signature',
  role: 'admin',
  userId: 'admin-1',
  userName: 'مدیر مکتب',
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
    submittedAt: ['submitted', 'approved', 'published'].includes(status) ? '2026-07-20T08:00:00.000Z' : null,
    monthLabel: 'سرطان',
    reviewerUserId: 'reviewer-1',
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
      attendanceMax: 0,
      writtenMax: 20,
      oralMax: 10,
      classActivityMax: 5,
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
        writtenScore: overrides.recorded ? 16 : null,
        oralScore: overrides.recorded ? 8 : null,
        classActivityScore: overrides.recorded ? 5 : null,
        homeworkScore: overrides.recorded ? 5 : null,
        markStatus: overrides.recorded ? 'recorded' : 'pending',
        note: ''
      }
    }, {
      membership: { id: 'membership-2', status: 'transferred', statusLabel: 'تبدیل‌شده' },
      row: {
        rowNumber: 2,
        admissionNo: 'A-002',
        studentName: 'حسن رضایی',
        fatherName: 'کریم',
        membershipStatus: 'transferred',
        membershipStatusLabel: 'تبدیل‌شده',
        writtenScore: null,
        oralScore: null,
        classActivityScore: null,
        homeworkScore: null,
        markStatus: 'not_applicable',
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
    await expect(page.locator('.grade-manager-component-config')).not.toContainText('حاضری');

    const row = page.locator('.grade-sheet-table tbody tr').filter({ hasText: 'علی احمدی' });
    await expect(row).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'شماره', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'نام پدر' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /فعالیت صنفی/ })).toBeVisible();
    await expect(row).toContainText('محمد');
    const inputs = row.locator('input.score-input');
    await expect(inputs).toHaveCount(4);
    await expect(inputs.nth(0)).toBeEnabled();
    await expect(inputs.nth(1)).toBeEnabled();
    await expect(inputs.nth(2)).toBeEnabled();
    await expect(inputs.nth(3)).toBeEnabled();
    await inputs.nth(0).fill('16');
    await inputs.nth(1).fill('8');
    await inputs.nth(2).fill('5');
    await inputs.nth(3).fill('5');
    await expect(row.locator('.total-cell').first()).toContainText(/34|۳۴/);
    await expect(row).toContainText(/85٪|۸۵٪/);
    await expect(row.getByRole('option', { name: 'شامل امتحان نبوده' })).toHaveCount(0);

    const transferredRow = page.locator('.grade-sheet-table tbody tr').filter({ hasText: 'حسن رضایی' });
    await expect(transferredRow).toContainText('سیستمی: تبدیل‌شده');
    await expect(transferredRow.locator('input.score-input').first()).toBeDisabled();
    await expect(transferredRow.locator('select')).toHaveCount(0);

    await page.getByRole('button', { name: /ذخیره تغییرات/ }).click();
    await expect.poll(() => savedPayload).toBeTruthy();
    expect(savedPayload.items[0]).toMatchObject({
      studentMembershipId: 'membership-1',
      markStatus: 'recorded',
      scoreBreakdown: {
        writtenScore: '16',
        oralScore: '8',
        classActivityScore: '5',
        homeworkScore: '5'
      }
    });
    await expect(page.getByText('تغییرات شقه ذخیره شد.')).toBeVisible();

    await page.getByRole('button', { name: 'ارسال برای تأیید' }).click();
    await expect.poll(() => statusPayload).toEqual({
      status: 'submitted',
      reviewerUserId: 'reviewer-1',
      monthLabel: 'سرطان'
    });
    await expect(page.getByText('شقه برای بررسی و تأیید ارسال شد.')).toBeVisible();
  });

  test('manager sees submitted sheets in a dedicated queue and approves them', async ({ page }) => {
    await setupShell(page, adminSession);
    let status = 'submitted';
    let statusPayload = null;
    const sessionRequests = [];

    await page.route('**/api/exams/reference-data', async (route) => route.fulfill(json(referenceData)));
    await page.route('**/api/exams/sessions?*', async (route) => {
      const requestUrl = new URL(route.request().url());
      sessionRequests.push(requestUrl);
      const requestedStatus = requestUrl.searchParams.get('status');
      const matchesQueue = requestedStatus !== 'submitted' || status === 'submitted';
      const items = matchesQueue ? [buildSession(status)] : [];
      const total = matchesQueue && status === 'submitted' ? 101 : items.length;
      const limit = Number(requestUrl.searchParams.get('limit') || 20);
      await route.fulfill(json({
        success: true,
        items,
        pagination: {
          page: Number(requestUrl.searchParams.get('page') || 1),
          limit,
          total,
          pages: total ? Math.ceil(total / limit) : 0,
          hasNext: Number(requestUrl.searchParams.get('page') || 1) < Math.ceil(total / limit),
          hasPrevious: Number(requestUrl.searchParams.get('page') || 1) > 1
        },
        counts: { submitted: status === 'submitted' ? 101 : 0 }
      }));
    });
    await page.route('**/api/exams/sessions/session-1/marks', async (route) => route.fulfill(json(buildMarksResponse(status, { recorded: true }))));
    await page.route('**/api/exams/sessions/session-1/status', async (route) => {
      statusPayload = route.request().postDataJSON();
      status = statusPayload.status;
      await route.fulfill(json({ success: true, item: buildSession(status) }));
    });

    await page.goto('/grade-manager?status=submitted', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'شقه‌های ارسال‌شده برای تأیید' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /در انتظار تأیید/ })).toContainText(/۱۰۱|101/);
    await expect(page.getByRole('columnheader', { name: 'استاد', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'صنف', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'مضمون', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'در حال بررسی' })).toBeVisible();
    expect(sessionRequests[0].searchParams.get('limit')).toBe('20');

    await page.getByRole('button', { name: /۲|2/, exact: true }).click();
    await expect.poll(() => sessionRequests.at(-1)?.searchParams.get('page')).toBe('2');

    await page.getByPlaceholder('نام استاد، صنف، مضمون یا کود شقه').fill('ریاضی');
    await page.getByRole('button', { name: 'اعمال فیلترها' }).click();
    await expect.poll(() => sessionRequests.at(-1)?.searchParams.get('q')).toBe('ریاضی');
    expect(sessionRequests.at(-1)?.searchParams.get('page')).toBe('1');
    await expect(page.getByRole('button', { name: 'تأیید شقه' })).toBeVisible();

    await page.getByRole('button', { name: 'تأیید شقه' }).click();
    await expect.poll(() => statusPayload).toEqual({
      status: 'approved',
      reviewerUserId: 'reviewer-1',
      monthLabel: 'سرطان'
    });
    await expect(page.getByText(/برای ساخت جدول رسمی.*جدول نتایج/)).toBeVisible();
    await expect(page.getByText('در حال حاضر شقه‌ای منتظر تأیید نیست.')).toBeVisible();
    await expect(page.getByRole('button', { name: /در انتظار تأیید/ })).toContainText(/۰|0/);
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

    await page.route('**/api/result-tables/my/published', async (route) => route.fulfill(json({
      success: true,
      items: [{
        id: 'table-1',
        title: 'نتیجه عمومی صنف دهم',
        version: 1,
        resultStatus: 'passed',
        average: 88,
        rank: 2,
        academicYear: { title: '۱۴۰۵' },
        schoolClass: { title: 'صنف دهم الف' },
        membershipStatus: 'active',
        membershipStatusLabel: 'فعال',
        subjects: [{ subjectId: 'subject-1', subjectName: 'ریاضی', fourHalf: 34, annual: 54, total: 88 }]
      }]
    })));

    await page.goto('/my-grades', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'نتایج امتحانات من' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.mygrades-breakdown > div')).toHaveCount(4);
    await expect(page.locator('.mygrades-item')).not.toContainText('حاضری');
    await expect(page.locator('.mygrades-item')).toContainText(/نمره:.*۳۴/);
    await expect(page.locator('.mygrades-item')).toContainText(/فیصدی:.*۸۵%/);
    await expect(page.locator('.mygrades-item')).toContainText('حالت: کامیاب');
    await expect(page.locator('.mygrades-total-row')).toContainText(/۳۴.*۴۰/);
    await expect(page.locator('.mygrades-total-row')).toContainText('تاریخ نتیجه');
    await expect(page.locator('.mygrades-general-results')).toContainText('نتیجهٔ عمومی نشرشده');
    await expect(page.locator('.mygrades-general-results')).toContainText('ریاضی');
    await expect(page.locator('.mygrades-general-results')).toContainText(/34.*۴۰/);
  });
});
