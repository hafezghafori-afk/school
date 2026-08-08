import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  };
}

const examTemplate = {
  id: 'template-exam',
  code: 'official_exam_sheet',
  title: 'شقه رسمی امتحان',
  type: 'exam',
  isActive: true,
  layout: {
    fontFamily: 'B Zar',
    fontSize: 12,
    orientation: 'portrait',
    showHeader: true,
    showFooter: true,
    showLogo: true,
    headerText: 'مکتب ایمان',
    footerText: 'شقه رسمی'
  },
  columns: [
    { key: 'number', label: 'شماره', width: 7, visible: true, order: 0 },
    { key: 'studentName', label: 'نام', group: 'شهرت شاگردان', width: 15, visible: true, order: 1 },
    { key: 'writtenScore', label: 'تحریری', width: 10, visible: true, order: 2 },
    { key: 'obtainedMark', label: 'مجموع', group: 'مجموع نمره', width: 10, visible: true, order: 3 },
    { key: 'note', label: 'ملاحظات', width: 16, visible: true, order: 4 }
  ]
};

const references = {
  success: true,
  academicYears: [
    { id: 'year-1', title: '۱۴۰۵', code: '1405', isActive: true },
    { id: 'year-2', title: '۱۴۰۴', code: '1404', isActive: false }
  ],
  assessmentPeriods: [
    { id: 'period-1', title: 'چهارنیم‌ماهه', academicYearId: { id: 'year-1' }, isActive: true },
    { id: 'period-old', title: 'دورهٔ سال گذشته', academicYearId: { id: 'year-2' }, isActive: true }
  ],
  classes: [{ id: 'class-1', title: 'صنف دهم الف', code: '10-A' }],
  teacherAssignments: [{
    id: 'assignment-1',
    academicYear: { id: 'year-1', title: '۱۴۰۵' },
    teacher: { id: 'teacher-1', name: 'استاد احمد' },
    schoolClass: { id: 'class-1', title: 'صنف دهم الف' },
    subject: { id: 'subject-1', name: 'ریاضی' },
    isActive: true
  }],
  examTypes: [
    { id: 'exam-type-1', code: 'FOUR_HALF_MONTH', title: 'امتحان چهارنیم‌ماهه', defaultTotalMark: 40 },
    { id: 'exam-type-annual', code: 'ANNUAL', title: 'امتحان سالانه', defaultTotalMark: 60 }
  ],
  reviewers: [{ id: 'reviewer-1', name: 'استاد ممیز' }]
};

async function mockSheetCenter(page, state = {}) {
  const sessions = state.sessions || [];
  state.previewRequests = state.previewRequests || [];
  state.exportRequests = state.exportRequests || [];

  await page.route('**/api/reports/reference-data', async (route) => {
    await route.fulfill(json({ success: true, academicYears: references.academicYears, classes: references.classes }));
  });
  await page.route('**/api/exams/reference-data', async (route) => {
    await route.fulfill(json(references));
  });
  await page.route('**/api/exams/sessions?sessionKind=subject_sheet', async (route) => {
    await route.fulfill(json({ success: true, items: sessions }));
  });
  await page.route('**/api/sheet-templates', async (route) => {
    await route.fulfill(json({ success: true, items: [examTemplate] }));
  });
  await page.route('**/api/sheet-templates/template-exam', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fulfill(json({ success: true, item: examTemplate }));
      return;
    }
    state.templatePatch = route.request().postDataJSON();
    await route.fulfill(json({
      success: true,
      item: {
        ...examTemplate,
        ...state.templatePatch,
        layout: { ...examTemplate.layout, ...(state.templatePatch?.layout || {}) }
      }
    }));
  });
  await page.route('**/api/sheet-templates/template-exam/preview', async (route) => {
    const payload = route.request().postDataJSON();
    state.previewRequests.push(payload);
    await route.fulfill(json({
      success: true,
      template: examTemplate,
      preview: {
        generatedAt: '2026-07-29T10:00:00.000Z',
        columns: examTemplate.columns,
        rows: [{ number: 1, studentName: 'احمد', writtenScore: 36, obtainedMark: 55, note: 'کامیاب' }],
        summary: { totalStudents: 1 }
      }
    }));
  });
  for (const format of ['pdf', 'xlsx', 'csv', 'print']) {
    await page.route(`**/api/sheet-templates/template-exam/export.${format}`, async (route) => {
      state.exportRequests.push({ format, payload: route.request().postDataJSON() });
      const contentTypes = {
        pdf: 'application/pdf',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv: 'text/csv; charset=utf-8',
        print: 'text/html; charset=utf-8'
      };
      const body = format === 'print'
        ? '<!doctype html><html><head><title>شقه چاپی</title></head><body>شقه چاپی</body></html>'
        : `mock-${format}-content`;
      await route.fulfill({
        status: 200,
        contentType: contentTypes[format],
        headers: { 'Content-Disposition': `${format === 'print' ? 'inline' : 'attachment'}; filename="official_exam_sheet.${format === 'print' ? 'html' : format}"` },
        body
      });
    });
  }
  await page.route('**/api/exams/default-marks/latest**', async (route) => {
    await route.fulfill(json({ success: true, item: null }));
  });
  await page.route('**/api/exams/sessions/bootstrap-preview', async (route) => {
    state.previewPayload = route.request().postDataJSON();
    await route.fulfill(json({ success: true, existingSession: null, rosterCount: 2 }));
  });
  await page.route('**/api/exams/sessions/bootstrap', async (route) => {
    state.bootstrapPayload = route.request().postDataJSON();
    const session = {
      id: 'session-1',
      title: 'شقه ریاضی چهارنیم‌ماهه',
      status: 'draft',
      subject: { id: 'subject-1', name: 'ریاضی' },
      schoolClass: { id: 'class-1', title: 'صنف دهم الف' },
      examType: { id: 'exam-type-1', title: 'امتحان چهارنیم‌ماهه' },
      teacherAssignment: { teacher: { id: 'teacher-1', name: 'استاد احمد' } },
      sheetTemplate: { id: 'template-exam', title: examTemplate.title }
    };
    sessions.splice(0, sessions.length, session);
    await route.fulfill(json({ success: true, session }, 201));
  });
  await page.route('**/api/exams/sessions/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathParts = url.pathname.split('/').filter(Boolean);
    const sessionIndex = pathParts.indexOf('sessions');
    const sessionId = pathParts[sessionIndex + 1] || '';
    const action = pathParts[sessionIndex + 2] || '';
    const session = sessions.find((item) => String(item.id) === String(sessionId));

    if (request.method() === 'GET' && action === 'management-state') {
      await route.fulfill(json({
        success: true,
        item: session,
        summary: { markCount: 2, substantiveMarkCount: 0, resultCount: 0, resultTableCount: 0 },
        permissions: {
          canEditMetadata: true,
          canEditStructure: true,
          canHardDelete: true,
          canArchive: true,
          canCreateRevision: false,
          canReturnForCorrection: false
        },
        blockers: []
      }));
      return;
    }
    if (request.method() === 'PATCH' && !action) {
      state.sessionPatch = request.postDataJSON();
      const updated = { ...session, monthLabel: state.sessionPatch.monthLabel, note: state.sessionPatch.note };
      const itemIndex = sessions.findIndex((item) => String(item.id) === String(sessionId));
      if (itemIndex >= 0) sessions[itemIndex] = updated;
      await route.fulfill(json({ success: true, item: updated }));
      return;
    }
    if (request.method() === 'DELETE' && !action) {
      state.deletedSessionId = sessionId;
      const itemIndex = sessions.findIndex((item) => String(item.id) === String(sessionId));
      if (itemIndex >= 0) sessions.splice(itemIndex, 1);
      await route.fulfill(json({ success: true, deletedId: sessionId, summary: { deletedMarks: 2, deletedResults: 0 } }));
      return;
    }
    if (request.method() === 'POST' && action === 'status') {
      state.sessionStatusPayload = request.postDataJSON();
      await route.fulfill(json({ success: true, item: { ...session, status: state.sessionStatusPayload.status } }));
      return;
    }
    if (request.method() === 'POST' && action === 'revisions') {
      state.sessionRevisionPayload = request.postDataJSON();
      await route.fulfill(json({ success: true, item: { ...session, id: `${sessionId}-revision`, status: 'draft', version: 2 }, summary: { version: 2 } }));
      return;
    }
    if (request.method() === 'POST' && action === 'sync-roster') {
      state.rosterSyncSessionId = sessionId;
      await route.fulfill(json({
        success: true,
        session,
        summary: { eligibleMemberships: 12, totalMarks: 12, existingMarks: 2, createdMarks: 10 }
      }));
      return;
    }
    await route.fallback();
  });
}

test.describe('sheet templates workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_content']
    });
  });

  test('loads the horizontal center and saves real print settings', async ({ page }) => {
    const state = {};
    await mockSheetCenter(page, state);

    await page.goto('/admin-sheet-templates', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'مرکز مدیریت شقه‌ها' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /شقه رسمی امتحان/ })).toBeVisible();

    const templateStrip = page.locator('.admin-workspace-template-list');
    await expect(templateStrip).toHaveCSS('display', 'flex');
    await expect(page.locator('.admin-sheet-column-card')).toHaveCount(examTemplate.columns.length);
    await expect(page.getByText('نمایش عنوان بالای شقه')).toBeVisible();
    await expect(page.getByText('نمایش متن پایین شقه')).toBeVisible();
    await expect(page.getByText('نمایش لوگوی مکتب')).toBeVisible();

    const commandBar = page.getByRole('toolbar', { name: 'عملیات قالب و خروجی شقه' });
    await expect(commandBar).toBeVisible();
    const commandTops = await commandBar.locator('button, select').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
    expect(new Set(commandTops).size).toBe(1);
    await expect(commandBar.getByRole('button')).toHaveCount(10);

    const noteColumn = page.locator('.admin-sheet-column-card').filter({ hasText: 'ملاحظات' });
    await noteColumn.getByRole('button', { name: 'حذف' }).click();
    await expect(page.locator('.admin-sheet-column-card')).toHaveCount(examTemplate.columns.length - 1);
    await page.getByLabel('ستون حذف‌شده برای بازگرداندن').selectOption('note');
    await page.getByRole('button', { name: 'بازگرداندن ستون', exact: true }).click();
    await expect(page.locator('.admin-sheet-column-card')).toHaveCount(examTemplate.columns.length);

    await page.locator('.admin-sheet-column-card').filter({ hasText: 'ملاحظات' }).getByRole('button', { name: 'حذف' }).click();
    await page.getByRole('button', { name: 'افزودن ستون سفارشی' }).click();
    await expect(page.locator('.admin-sheet-column-card')).toHaveCount(examTemplate.columns.length);
    await expect(page.locator('.admin-sheet-column-card').filter({ hasText: 'ستون جدید' })).toBeVisible();

    await page.selectOption('#sheet-layout-font', 'B Mitra');
    await page.fill('#sheet-layout-font-size', '14');
    await page.selectOption('#sheet-layout-orientation', 'landscape');
    await page.fill('#sheet-layout-header-text', 'لیسه عالی ایمان');
    await page.getByRole('button', { name: 'ذخیره قالب' }).click();

    await expect.poll(() => state.templatePatch).toBeTruthy();
    expect(state.templatePatch.layout).toMatchObject({
      fontFamily: 'B Mitra',
      fontSize: 14,
      orientation: 'landscape',
      headerText: 'لیسه عالی ایمان'
    });
    expect(state.templatePatch.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'studentName', group: 'شهرت شاگردان' }),
      expect.objectContaining({ key: 'custom_1', label: 'ستون جدید ۱' })
    ]));
    expect(state.templatePatch.columns).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'note' })
    ]));
    await expect(page.getByText('تنظیمات قالب ذخیره شد.')).toBeVisible();
  });

  test('runs preview, reset, exports, print and filter actions from the single command bar', async ({ page }) => {
    const state = {};
    await mockSheetCenter(page, state);

    await page.goto('/admin-sheet-templates', { waitUntil: 'domcontentloaded' });
    const commandBar = page.getByRole('toolbar', { name: 'عملیات قالب و خروجی شقه' });
    await expect(commandBar).toBeVisible({ timeout: 20_000 });

    await page.fill('#sheet-layout-header-text', 'عنوان آزمایشی');
    await commandBar.getByRole('button', { name: 'برگشت تنظیمات' }).click();
    await expect(page.locator('#sheet-layout-header-text')).toHaveValue('مکتب ایمان');
    await expect(page.getByText('تنظیمات قالب به آخرین حالت ذخیره‌شده برگشت.')).toBeVisible();

    await page.selectOption('#sheet-academic-year', 'year-1');
    await page.fill('#sheet-month', 'حمل');
    await commandBar.getByTestId('sheet-preview').click();
    await expect.poll(() => state.previewRequests.length).toBe(1);
    expect(state.previewRequests[0]).toEqual({ filters: expect.objectContaining({ academicYearId: 'year-1', month: 'حمل' }) });
    await expect(page.getByText('پیش‌نمایش آماده شد.')).toBeVisible();
    await expect(page.locator('.admin-workspace-preview-summary')).toBeVisible();

    for (const format of ['pdf', 'xlsx', 'csv']) {
      const testId = format === 'xlsx' ? 'sheet-export-xlsx' : `sheet-export-${format}`;
      const downloadPromise = page.waitForEvent('download');
      await commandBar.getByTestId(testId).click();
      const download = await downloadPromise;
      await expect.poll(() => state.exportRequests.some((item) => item.format === format)).toBeTruthy();
      expect(download.suggestedFilename()).toBe(`official_exam_sheet.${format}`);
    }

    await commandBar.getByTestId('sheet-export-print').click();
    await expect.poll(() => state.exportRequests.some((item) => item.format === 'print')).toBeTruthy();
    await expect(page.getByText('خروجی شقه دریافت شد.')).toBeVisible();

    await commandBar.getByTestId('sheet-reset-filters').click();
    await expect(page.locator('#sheet-academic-year')).toHaveValue('');
    await expect(page.locator('#sheet-month')).toHaveValue('');
    await expect(page.getByText('فیلترها پاک شد.')).toBeVisible();
  });

  test('management defines score columns and assigns the sheet to a teacher', async ({ page }) => {
    const state = {};
    await mockSheetCenter(page, state);

    await page.goto('/admin-sheet-templates', { waitUntil: 'domcontentloaded' });
    const assignmentCard = page.locator('.admin-sheet-assignment-card');
    await expect(assignmentCard).toBeVisible({ timeout: 20_000 });
    await expect(assignmentCard.getByText('دوره‌ها مستقیماً از مرکز مدیریت آموزش خوانده می‌شوند.')).toHaveCount(0);
    await expect(assignmentCard.getByText('عنوان با تغییر نوع امتحان به‌صورت خودکار تنظیم می‌شود.')).toHaveCount(0);
    const assignmentFields = assignmentCard.locator('.admin-sheet-assignment-grid > .admin-workspace-field');
    await expect(assignmentFields).toHaveCount(9);
    const fieldTops = await assignmentFields.evaluateAll((fields) => fields.map((field) => Math.round(field.getBoundingClientRect().top)));
    expect(new Set(fieldTops.slice(0, 5)).size).toBe(1);
    expect(new Set(fieldTops.slice(5, 9)).size).toBe(1);
    const periodSelect = assignmentCard.locator('select[name="assessmentPeriodId"]');
    await expect(periodSelect).toHaveValue('period-1');
    await expect(periodSelect.locator('option')).toHaveCount(2);
    await expect(periodSelect).not.toContainText('دورهٔ سال گذشته');
    await expect(assignmentCard.locator('input[name="sheetTitle"]')).toHaveCount(0);
    const examTypeBox = await assignmentCard.locator('select[name="examTypeId"]').boundingBox();
    const dateBox = await assignmentCard.locator('.admin-sheet-date-field').boundingBox();
    expect(dateBox?.width || 0).toBeGreaterThan((examTypeBox?.width || 0) * 1.75);
    await expect(assignmentCard.locator('.afghan-date-year')).toBeVisible();
    await expect(assignmentCard.locator('.afghan-date-month')).toBeVisible();
    await expect(assignmentCard.locator('.afghan-date-day')).toBeVisible();
    await assignmentCard.locator('select[name="examTypeId"]').selectOption('exam-type-annual');
    await assignmentCard.locator('select[name="examTypeId"]').selectOption('exam-type-1');

    await assignmentCard.locator('select[name="teacherId"]').selectOption('teacher-1');
    await assignmentCard.locator('select[name="classId"]').selectOption('class-1');
    await assignmentCard.locator('select[name="subjectId"]').selectOption('subject-1');
    await assignmentCard.locator('select[name="reviewerUserId"]').selectOption('reviewer-1');

    await expect(assignmentCard.locator('input[name="attendanceMax"]')).toHaveCount(0);
    await assignmentCard.locator('input[name="classActivityMax"]').fill('4');
    await assignmentCard.locator('input[name="writtenMax"]').fill('21');
    await expect(assignmentCard.getByText(/مجموع نمره:.*۴۰.*از.*۴۰/)).toBeVisible();

    await assignmentCard.getByRole('button', { name: 'ایجاد و تخصیص به استاد' }).click();
    await expect(page.getByText('این موارد هنوز تکمیل نشده‌اند: تاریخ امتحان.')).toBeVisible();
    expect(state.bootstrapPayload).toBeFalsy();

    await assignmentCard.locator('.afghan-date-year').fill('1405');
    await assignmentCard.locator('.afghan-date-month').selectOption('4');
    await assignmentCard.locator('.afghan-date-day').fill('15');
    await assignmentCard.getByRole('button', { name: 'ایجاد و تخصیص به استاد' }).click();

    await expect.poll(() => state.bootstrapPayload).toBeTruthy();
    expect(state.previewPayload).toMatchObject({
      teacherAssignmentId: 'assignment-1',
      sheetTemplateId: 'template-exam'
    });
    expect(state.previewPayload).not.toHaveProperty('teacherId');
    expect(state.bootstrapPayload).toMatchObject({
      teacherAssignmentId: 'assignment-1',
      classId: 'class-1',
      subjectId: 'subject-1',
      reviewerUserId: 'reviewer-1',
      sheetTemplateId: 'template-exam',
      status: 'draft',
      initializeRoster: true,
      scoreComponents: {
        attendanceMax: 0,
        writtenMax: 21,
        oralMax: 10,
        classActivityMax: 4,
        homeworkMax: 5
      }
    });
    await expect(page.getByText('شقه به استاد تخصیص شد و در حساب استاد قابل مشاهده است.')).toBeVisible();
    await expect(page.locator('.admin-sheet-session-card')).toContainText('استاد احمد');
  });

  test('manages one hundred assigned sheets with search, status filter and pagination', async ({ page }) => {
    const sessions = Array.from({ length: 100 }, (_, index) => {
      const number = index + 1;
      return {
        id: `session-${number}`,
        title: `شقه امتحان ${number}`,
        status: number % 2 === 0 ? 'approved' : 'draft',
        subject: { id: `subject-${number}`, name: `مضمون ${number}` },
        schoolClass: { id: `class-${number}`, title: `صنف ${number}` },
        examType: { id: 'exam-type-1', title: 'امتحان چهارنیم‌ماهه' },
        teacherAssignment: { teacher: { id: `teacher-${number}`, name: `استاد ${number}` } },
        sheetTemplate: { id: 'template-exam', title: examTemplate.title }
      };
    });
    await mockSheetCenter(page, { sessions });

    await page.goto('/admin-sheet-templates', { waitUntil: 'domcontentloaded' });
    const manager = page.locator('.admin-sheet-session-manager');
    await expect(manager).toBeVisible({ timeout: 20_000 });
    await expect(manager.locator('.admin-sheet-session-card')).toHaveCount(10);
    await expect(manager.getByText('نمایش ۱ تا ۱۰ از ۱۰۰ شقه')).toBeVisible();
    await expect(manager.getByText('صفحه ۱ از ۱۰')).toBeVisible();

    await manager.getByRole('button', { name: 'صفحه بعدی' }).click();
    await expect(manager.getByText('صفحه ۲ از ۱۰')).toBeVisible();
    await expect(manager.locator('.admin-sheet-session-card').first()).toContainText('مضمون 11');

    await manager.getByLabel('جست‌وجوی شقه‌های تخصیص‌شده').fill('مضمون 100');
    await expect(manager.locator('.admin-sheet-session-card')).toHaveCount(1);
    await expect(manager.locator('.admin-sheet-session-card')).toContainText('استاد 100');
    await expect(manager.getByText('نمایش ۱ تا ۱ از ۱ شقه')).toBeVisible();

    await manager.getByLabel('جست‌وجوی شقه‌های تخصیص‌شده').fill('');
    await manager.getByLabel('فیلتر وضعیت شقه').selectOption('approved');
    await expect(manager.locator('.admin-sheet-session-card')).toHaveCount(10);
    await expect(manager.getByText('نمایش ۱ تا ۱۰ از ۵۰ شقه')).toBeVisible();
    await expect(manager.getByText('صفحه ۱ از ۵')).toBeVisible();
    await expect(manager.locator('.admin-sheet-session-card').first()).toContainText('تأییدشده');
  });

  test('edits and safely deletes a draft assigned sheet', async ({ page }) => {
    const sessions = [{
      id: 'session-edit-1',
      title: 'شقه ریاضی چهارنیم‌ماهه',
      status: 'draft',
      heldAt: '2026-07-15T00:00:00.000Z',
      monthLabel: 'سرطان',
      note: '',
      academicYear: { id: 'year-1', title: '۱۴۰۵' },
      assessmentPeriod: { id: 'period-1', title: 'چهارنیم‌ماهه' },
      subject: { id: 'subject-1', name: 'ریاضی' },
      schoolClass: { id: 'class-1', title: 'صنف دهم الف' },
      examType: { id: 'exam-type-1', title: 'امتحان چهارنیم‌ماهه' },
      teacherAssignment: { id: 'assignment-1', teacher: { id: 'teacher-1', name: 'استاد احمد' } },
      sheetTemplate: { id: 'template-exam', title: examTemplate.title },
      defaultMark: {
        totalMark: 40,
        scoreComponents: { attendanceMax: 5, writtenMax: 20, oralMax: 10, classActivityMax: 0, homeworkMax: 5 }
      }
    }];
    const state = { sessions };
    await mockSheetCenter(page, state);

    await page.goto('/admin-sheet-templates', { waitUntil: 'domcontentloaded' });
    const manager = page.locator('.admin-sheet-session-manager');
    await expect(manager.locator('.admin-sheet-session-card')).toHaveCount(1, { timeout: 20_000 });
    await expect(manager.getByRole('link', { name: 'بازکردن معرفی صنف به استاد' })).toBeVisible();

    await manager.getByRole('button', { name: 'همگام‌سازی شاگردان' }).click();
    await expect.poll(() => state.rosterSyncSessionId).toBe('session-edit-1');
    await expect(page.getByText('۱۰ شاگرد جدید به شقه اضافه شد؛ نمرات و ردیف‌های قبلی تغییر نکرد.')).toBeVisible();

    await manager.getByRole('button', { name: 'ویرایش' }).click();
    const dialog = page.getByRole('dialog', { name: 'ویرایش تخصیص شقه' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('select[name="teacherId"]')).toHaveValue('teacher-1');
    await dialog.locator('input[name="monthLabel"]').fill('اسد');
    await dialog.locator('input[name="note"]').fill('اصلاح مشخصات شقه');
    await dialog.getByRole('button', { name: 'ذخیره تغییرات' }).click();

    await expect.poll(() => state.sessionPatch).toBeTruthy();
    expect(state.sessionPatch).toMatchObject({
      teacherAssignmentId: 'assignment-1',
      classId: 'class-1',
      subjectId: 'subject-1',
      monthLabel: 'اسد',
      note: 'اصلاح مشخصات شقه'
    });
    await expect(dialog).toBeHidden();

    page.once('dialog', (confirmation) => confirmation.accept());
    await manager.getByText('بیشتر', { exact: true }).click();
    await manager.getByRole('button', { name: 'حذف پیش‌نویس' }).click();
    await expect.poll(() => state.deletedSessionId).toBe('session-edit-1');
    await expect(manager.locator('.admin-sheet-session-card')).toHaveCount(0);
  });

  test('denies access without the sheet-management permission', async ({ page }) => {
    await page.context().clearCookies();
    await setupAdminWorkspace(page, { permissions: ['view_reports'] });

    await page.goto('/admin-sheet-templates', { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => (
      !page.url().includes('/admin-sheet-templates')
      || page.locator('.access-denied').isVisible()
    ), { timeout: 20_000 }).toBeTruthy();
  });
});
