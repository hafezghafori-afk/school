import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

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

function buildClassItem({ id, title, code, gradeLevel, section, academicYearId, academicYearTitle, legacyCourseId, legacyCourseTitle }) {
  return {
    id,
    title,
    code,
    gradeLevel,
    section,
    academicYearId,
    academicYear: { id: academicYearId, title: academicYearTitle },
    shift: 'morning',
    room: 'A-1',
    status: 'active',
    note: '',
    legacyCourseId,
    legacyCourse: {
      _id: legacyCourseId,
      title: legacyCourseTitle
    }
  };
}

test.describe('education core workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['manage_content', 'manage_users']
    });
  });

  test('education core workflow manages school classes, teacher mappings, and enrollments from class-centric data', async ({ page }) => {
    test.setTimeout(90000);

    let classCreates = 0;
    let subjectCreates = 0;
    let subjectUpdates = 0;
    let subjectDeletes = 0;
    let yearCreates = 0;
    let mappingCreates = 0;
    let enrollmentCreates = 0;

    const academicYears = [
      {
        id: 'year-1',
        title: '1406',
        startDate: '2026-03-21',
        endDate: '2027-03-20',
        isActive: true,
        note: ''
      },
      {
        id: 'year-2',
        title: '1407',
        startDate: '2027-03-21',
        endDate: '2028-03-20',
        isActive: false,
        note: ''
      },
      {
        id: 'year-3',
        title: '1408',
        startDate: '2028-03-21',
        endDate: '2029-03-20',
        isActive: false,
        note: ''
      },
      {
        id: 'year-4',
        title: '1409',
        startDate: '2029-03-21',
        endDate: '2030-03-20',
        isActive: false,
        note: ''
      },
      {
        id: 'year-5',
        title: '1410',
        startDate: '2030-03-21',
        endDate: '2031-03-20',
        isActive: false,
        note: ''
      }
    ];

    const subjects = [
      {
        id: 'subject-1',
        name: 'ریاضی',
        code: 'MATH-10',
        grade: '10',
        note: '',
        isActive: true
      },
      {
        id: 'subject-2',
        name: 'دری',
        code: 'DAR-8',
        grade: '8',
        note: '',
        isActive: true
      },
      {
        id: 'subject-3',
        name: 'کیمیا',
        code: 'CHEM-11',
        grade: '11',
        note: '',
        isActive: false
      },
      {
        id: 'subject-4',
        name: 'تاریخ',
        code: 'HIS-6',
        grade: '6',
        note: '',
        isActive: true
      }
    ];

    const instructors = [
      {
        id: 'teacher-1',
        name: 'استاد احمد',
        email: 'ahmad@example.test'
      },
      {
        id: 'teacher-2',
        name: 'استاد فرید',
        email: 'farid@example.test'
      }
    ];

    const students = [
      {
        id: 'student-1',
        name: 'متعلم الف',
        grade: '10'
      },
      {
        id: 'student-2',
        name: 'متعلم ب',
        grade: '8'
      }
    ];

    const studentCandidates = [
      {
        id: 'student-1',
        value: 'student-1',
        name: 'متعلم الف',
        grade: '10',
        sourceType: 'user',
        sourceLabel: 'ثبت‌شده در سیستم'
      },
      {
        id: 'student-2',
        value: 'student-2',
        name: 'متعلم ب',
        grade: '8',
        sourceType: 'user',
        sourceLabel: 'ثبت‌شده در سیستم'
      },
      {
        id: 'afghan-1',
        value: 'afghan:afghan-1',
        name: 'متعلم ثبت‌شده',
        grade: '9',
        sourceType: 'afghan',
        sourceLabel: 'ثبت‌نام دستی'
      },
      {
        id: 'enrollment-online-1',
        value: 'enrollment:enrollment-online-1',
        name: 'متعلم آنلاین',
        grade: '9',
        sourceType: 'enrollment',
        sourceLabel: 'ثبت‌نام آنلاین',
        status: 'pending'
      }
    ];

    const onlineRegistrationQueue = [
      {
        id: 'enrollment-online-1',
        sourceRef: 'enrollment:enrollment-online-1',
        name: 'متعلم آنلاین',
        grade: '9',
        phone: '0700000001',
        status: 'pending',
        note: 'درخواست ثبت‌نام آنلاین',
        createdAt: '2026-03-05T08:00:00.000Z'
      }
    ];

    const schoolClasses = [
      buildClassItem({
        id: 'class-1',
        title: 'صنف دهم الف',
        code: '10A',
        gradeLevel: '10',
        section: 'A',
        academicYearId: 'year-1',
        academicYearTitle: '1406',
        legacyCourseId: 'course-1',
        legacyCourseTitle: 'Legacy Course 10A'
      }),
      buildClassItem({
        id: 'class-2',
        title: 'صنف هشتم الف',
        code: '8A',
        gradeLevel: '8',
        section: 'A',
        academicYearId: 'year-1',
        academicYearTitle: '1406',
        legacyCourseId: 'course-2',
        legacyCourseTitle: 'Legacy Course 8A'
      }),
      buildClassItem({
        id: 'class-3',
        title: 'صنف یازدهم ب',
        code: '11B',
        gradeLevel: '11',
        section: 'B',
        academicYearId: 'year-2',
        academicYearTitle: '1407',
        legacyCourseId: 'course-3',
        legacyCourseTitle: 'Legacy Course 11B'
      }),
      buildClassItem({
        id: 'class-4',
        title: 'صنف ششم ج',
        code: '6C',
        gradeLevel: '6',
        section: 'C',
        academicYearId: 'year-3',
        academicYearTitle: '1408',
        legacyCourseId: 'course-4',
        legacyCourseTitle: 'Legacy Course 6C'
      })
    ];

    let mappings = [
      {
        _id: 'map-1',
        instructor: { _id: 'teacher-1', name: 'استاد احمد' },
        subject: { _id: 'subject-1', name: 'ریاضی' },
        academicYear: { _id: 'year-1', title: '1406' },
        classId: 'class-1',
        schoolClass: schoolClasses[0],
        courseId: schoolClasses[0].legacyCourseId,
        course: {
          _id: schoolClasses[0].legacyCourseId,
          title: schoolClasses[0].legacyCourse.title
        },
        note: '',
        isPrimary: true
      },
      {
        _id: 'map-2',
        instructor: { _id: 'teacher-2', name: 'استاد فرید' },
        subject: { _id: 'subject-2', name: 'دری' },
        academicYear: { _id: 'year-1', title: '1406' },
        classId: 'class-2',
        schoolClass: schoolClasses[1],
        courseId: schoolClasses[1].legacyCourseId,
        course: {
          _id: schoolClasses[1].legacyCourseId,
          title: schoolClasses[1].legacyCourse.title
        },
        note: '',
        isPrimary: false
      },
      {
        _id: 'map-3',
        instructor: { _id: 'teacher-1', name: 'استاد احمد' },
        subject: { _id: 'subject-3', name: 'کیمیا' },
        academicYear: { _id: 'year-2', title: '1407' },
        classId: 'class-3',
        schoolClass: schoolClasses[2],
        courseId: schoolClasses[2].legacyCourseId,
        course: {
          _id: schoolClasses[2].legacyCourseId,
          title: schoolClasses[2].legacyCourse.title
        },
        note: '',
        isPrimary: true
      },
      {
        _id: 'map-4',
        instructor: { _id: 'teacher-2', name: 'استاد فرید' },
        subject: { _id: 'subject-4', name: 'تاریخ' },
        academicYear: { _id: 'year-3', title: '1408' },
        classId: 'class-4',
        schoolClass: schoolClasses[3],
        courseId: schoolClasses[3].legacyCourseId,
        course: {
          _id: schoolClasses[3].legacyCourseId,
          title: schoolClasses[3].legacyCourse.title
        },
        note: '',
        isPrimary: false
      }
    ];
    let enrollments = [
      {
        _id: 'enrollment-1',
        user: { _id: 'student-1', name: 'متعلم الف' },
        classId: 'class-1',
        schoolClass: schoolClasses[0],
        courseId: schoolClasses[0].legacyCourseId,
        course: {
          _id: schoolClasses[0].legacyCourseId,
          title: schoolClasses[0].legacyCourse.title
        },
        status: 'approved',
        note: 'ثبت اولیه',
        rejectedReason: ''
      },
      {
        _id: 'enrollment-2',
        user: { _id: 'student-2', name: 'متعلم ب' },
        classId: 'class-2',
        schoolClass: schoolClasses[1],
        courseId: schoolClasses[1].legacyCourseId,
        course: {
          _id: schoolClasses[1].legacyCourseId,
          title: schoolClasses[1].legacyCourse.title
        },
        status: 'pending',
        note: 'در انتظار بررسی',
        rejectedReason: ''
      },
      {
        _id: 'enrollment-3',
        user: { _id: 'student-1', name: 'متعلم الف' },
        classId: 'class-3',
        schoolClass: schoolClasses[2],
        courseId: schoolClasses[2].legacyCourseId,
        course: {
          _id: schoolClasses[2].legacyCourseId,
          title: schoolClasses[2].legacyCourse.title
        },
        status: 'rejected',
        note: '',
        rejectedReason: 'اسناد ناقص'
      },
      {
        _id: 'enrollment-4',
        user: { _id: 'student-2', name: 'متعلم ب' },
        classId: 'class-4',
        schoolClass: schoolClasses[3],
        courseId: schoolClasses[3].legacyCourseId,
        course: {
          _id: schoolClasses[3].legacyCourseId,
          title: schoolClasses[3].legacyCourse.title
        },
        status: 'approved',
        note: 'تایید نهایی',
        rejectedReason: ''
      }
    ];

    const resolveClassByAnyId = (payload = {}) => schoolClasses.find((item) => (
      String(item.id) === String(payload.classId || '') ||
      String(item.legacyCourseId) === String(payload.courseId || '')
    ));

    await page.route('**/api/education/school-classes', async (route) => {
      if (route.request().method() === 'POST') {
        classCreates += 1;
        const body = route.request().postDataJSON();
        const nextIndex = schoolClasses.length + 1;
        const item = buildClassItem({
          id: `class-${nextIndex}`,
          title: body.title,
          code: body.code,
          gradeLevel: body.gradeLevel,
          section: body.section,
          academicYearId: body.academicYearId,
          academicYearTitle: academicYears.find((entry) => entry.id === body.academicYearId)?.title || '1406',
          legacyCourseId: `course-${nextIndex}`,
          legacyCourseTitle: `Legacy Mirror ${body.code || nextIndex}`
        });
        schoolClasses.push(item);
        await route.fulfill(json({ success: true, item }, 201));
        return;
      }

      await route.fulfill(json({ success: true, items: schoolClasses }));
    });

    await page.route('**/api/education/subjects', async (route) => {
      if (route.request().method() === 'POST') {
        subjectCreates += 1;
        const body = route.request().postDataJSON();
        const item = {
          id: `subject-${subjects.length + 1}`,
          name: body.name,
          code: body.code,
          grade: body.grade,
          note: body.note || '',
          isActive: body.isActive !== false
        };
        subjects.push(item);
        await route.fulfill(json({ success: true, item }, 201));
        return;
      }
      await route.fulfill(json({ success: true, items: subjects }));
    });

    await page.route('**/api/education/subjects/*', async (route) => {
      const method = route.request().method();
      const subjectId = route.request().url().split('/').pop();
      const index = subjects.findIndex((item) => String(item.id || item._id) === String(subjectId));

      if (method === 'PUT' && index >= 0) {
        subjectUpdates += 1;
        const body = route.request().postDataJSON();
        subjects[index] = {
          ...subjects[index],
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.code !== undefined ? { code: body.code } : {}),
          ...(body.grade !== undefined ? { grade: body.grade } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {})
        };
        await route.fulfill(json({ success: true, item: subjects[index] }));
        return;
      }

      if (method === 'DELETE' && index >= 0) {
        subjectDeletes += 1;
        subjects.splice(index, 1);
        await route.fulfill(json({ success: true }));
        return;
      }

      await route.fulfill(json({ success: false, message: 'not found' }, 404));
    });

    await page.route('**/api/education/academic-years', async (route) => {
      if (route.request().method() === 'POST') {
        yearCreates += 1;
        await route.fulfill(json({ success: false, message: 'سال تعلیمی با همین عنوان از قبل ثبت شده است.' }, 409));
        return;
      }
      await route.fulfill(json({ success: true, items: academicYears }));
    });

    await page.route('**/api/education/meta', async (route) => {
      await route.fulfill(json({ success: true, instructors, students, studentCandidates, onlineRegistrationQueue }));
    });

    await page.route('**/api/education/instructor-subjects', async (route) => {
      if (route.request().method() === 'POST') {
        mappingCreates += 1;
        const body = route.request().postDataJSON();
        const linkedClass = resolveClassByAnyId(body);
        const item = {
          _id: `map-${mappings.length + 1}`,
          instructor: { _id: 'teacher-1', name: 'استاد احمد' },
          subject: { _id: 'subject-1', name: 'ریاضی' },
          academicYear: { _id: linkedClass?.academicYearId || body.academicYearId, title: linkedClass?.academicYear?.title || '1406' },
          classId: linkedClass?.id || body.classId || '',
          schoolClass: linkedClass || null,
          courseId: linkedClass?.legacyCourseId || body.courseId || '',
          course: {
            _id: linkedClass?.legacyCourseId || body.courseId || '',
            title: linkedClass?.legacyCourse?.title || 'Legacy Mirror'
          },
          note: body.note || '',
          isPrimary: !!body.isPrimary,
          createdAt: new Date().toISOString()
        };
        mappings = [item, ...mappings];
        await route.fulfill(json({ success: true, item }, 201));
        return;
      }

      await route.fulfill(json({ success: true, items: mappings }));
    });

    await page.route('**/api/education/student-enrollments*', async (route) => {
      if (route.request().method() === 'POST') {
        enrollmentCreates += 1;
        const body = route.request().postDataJSON();
        const linkedClass = resolveClassByAnyId(body);
        const candidateName = body.studentId === 'enrollment:enrollment-online-1'
          ? 'متعلم آنلاین'
          : body.studentId === 'afghan:afghan-1'
            ? 'متعلم ثبت‌شده'
            : 'متعلم الف';
        const item = {
          _id: `enrollment-${enrollments.length + 1}`,
          user: { _id: body.studentId, name: candidateName },
          classId: linkedClass?.id || body.classId || '',
          schoolClass: linkedClass || null,
          courseId: linkedClass?.legacyCourseId || body.courseId || '',
          course: {
            _id: linkedClass?.legacyCourseId || body.courseId || '',
            title: linkedClass?.legacyCourse?.title || 'Legacy Mirror'
          },
          status: body.status || 'approved',
          note: body.note || '',
          rejectedReason: body.rejectedReason || '',
          createdAt: new Date().toISOString()
        };
        enrollments = [item, ...enrollments];
        await route.fulfill(json({ success: true, item }, 201));
        return;
      }

      await route.fulfill(json({ success: true, items: enrollments }));
    });

    await page.goto('/admin-education', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'مرکز مدیریت آموزش' })).toBeVisible();

    const sectionNav = page.locator('.admin-education-toggle-bar');

    await sectionNav.getByRole('button', { name: /سال تعلیمی/ }).click();
    const yearCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'سال‌های تعلیمی' }) }).first();
    const yearRegistryCard = page
      .locator('article.admin-workspace-card')
      .filter({ has: page.getByRole('heading', { name: 'دفتر سال‌ها' }) })
      .first();
    await yearCard.locator('input').first().fill('1406');
    await yearCard.getByRole('button', { name: 'ایجاد سال تعلیمی' }).click();

    await expect.poll(() => yearCreates).toBe(0);
    await expect(page.locator('.admin-workspace-message')).toContainText('این سال تعلیمی از قبل ثبت شده است و برای ویرایش در فرم بارگذاری شد.');
    await expect(yearCard.locator('input').first()).toHaveValue('1406');
    await expect(yearRegistryCard.getByRole('button', { name: /1406/ }).first()).toBeVisible();

    await sectionNav.getByRole('button', { name: /صنف‌ها/ }).click();
    const classCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'صنف‌ها' }) }).first();
    await classCard.locator('input').nth(0).fill('صنف نهم ب');
    await classCard.locator('input').nth(1).fill('9B');
    await classCard.locator('input').nth(2).fill('9');
    await classCard.locator('select').nth(0).selectOption({ label: 'ب' });
    await classCard.locator('select').nth(1).selectOption('year-1');
    await classCard.getByRole('button', { name: 'ایجاد صنف' }).click();

    await expect.poll(() => classCreates).toBe(1);
    const classRegistryCard = page
      .locator('article.admin-workspace-card')
      .filter({ has: page.getByRole('heading', { name: 'دفتر صنف‌ها' }) })
      .first();
    await expect(classRegistryCard).toContainText('صنف دهم الف');
    await expect(classRegistryCard).toContainText('صنف هشتم الف');
    await expect(classRegistryCard).toContainText('صنف یازدهم ب');
    await expect(classRegistryCard).toContainText('صنف ششم ج');
    await expect(classRegistryCard).not.toContainText('صنف نهم ب');
    await expect(classRegistryCard.getByRole('button', { name: /بیشتر/ })).toBeVisible();
    await classRegistryCard.getByRole('button', { name: /بیشتر/ }).click();
    await expect(classRegistryCard).toContainText('صنف نهم ب');
    await classRegistryCard.getByLabel('جستجو در دفتر صنف‌ها').fill('9B');
    await classRegistryCard.getByRole('button', { name: 'جستجو' }).click();
    await expect(classRegistryCard).toContainText('صنف نهم ب');
    await expect(classRegistryCard).not.toContainText('صنف دهم الف');
    await classRegistryCard.getByRole('button', { name: 'پاک‌کردن' }).click();
    await expect(classRegistryCard).toContainText('صنف دهم الف');

    await sectionNav.getByRole('button', { name: /مضمون‌ها/ }).click();
    const subjectCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'مضمون‌ها' }) }).first();
    await subjectCard.locator('input').nth(0).fill('فزیک');
    await subjectCard.locator('input').nth(1).fill('PHY-9');
    await subjectCard.locator('input').nth(2).fill('9');
    await subjectCard.getByRole('button', { name: 'ایجاد مضمون' }).click();

    await expect.poll(() => subjectCreates).toBe(1);
    const subjectRegistryCard = page
      .locator('article.admin-workspace-card')
      .filter({ has: page.getByRole('heading', { name: 'فهرست مضمون‌ها' }) })
      .first();
    await expect(subjectRegistryCard).toContainText('ریاضی');
    await expect(subjectRegistryCard).toContainText('دری');
    await expect(subjectRegistryCard).toContainText('کیمیا');
    await expect(subjectRegistryCard).toContainText('تاریخ');
    await expect(subjectRegistryCard).not.toContainText('فزیک');
    await expect(subjectRegistryCard.getByRole('button', { name: /بیشتر/ })).toBeVisible();
    await subjectRegistryCard.getByRole('button', { name: /بیشتر/ }).click();
    await expect(subjectRegistryCard).toContainText('فزیک');
    await subjectRegistryCard.getByLabel('جستجو در فهرست مضمون‌ها').fill('PHY-9');
    await subjectRegistryCard.getByRole('button', { name: 'جستجو' }).click();
    await expect(subjectRegistryCard).toContainText('فزیک');
    await expect(subjectRegistryCard).not.toContainText('ریاضی');
    await subjectRegistryCard.getByLabel('فیلتر پایه مضمون').selectOption('9');
    await subjectRegistryCard.getByLabel('فیلتر وضعیت مضمون').selectOption('active');
    const physicsRow = subjectRegistryCard.locator('.admin-education-list-item').filter({ hasText: 'فزیک' }).first();
    await expect(physicsRow.getByRole('button', { name: 'غیرفعال' })).toBeVisible();
    await expect(physicsRow.getByRole('button', { name: 'حذف' })).toBeVisible();
    await physicsRow.getByRole('button', { name: 'غیرفعال' }).click();
    await expect(page.locator('.admin-workspace-message')).toContainText('مضمون غیرفعال شد.');
    await subjectRegistryCard.getByLabel('فیلتر وضعیت مضمون').selectOption('inactive');
    await expect(physicsRow).toContainText('غیرفعال');
    await subjectRegistryCard.getByRole('button', { name: 'پاک‌کردن' }).click();

    await sectionNav.getByRole('button', { name: /تقسیم مضمون/ }).click();
    const mappingCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'تقسیم مضمون به استاد' }) }).first();
    await mappingCard.locator('select').nth(0).selectOption('teacher-1');
    await mappingCard.locator('select').nth(1).selectOption('subject-1');
    await mappingCard.locator('select').nth(2).selectOption('year-1');
    await mappingCard.locator('select').nth(3).selectOption('class-5');
    await mappingCard.getByRole('button', { name: 'ایجاد تقسیم' }).click();

    await expect.poll(() => mappingCreates).toBe(1);
    const mappingRegistryCard = page
      .locator('article.admin-workspace-card')
      .filter({ has: page.getByRole('heading', { name: 'فهرست تقسیم‌ها' }) })
      .first();
    const mappingRegistryList = mappingRegistryCard.locator('.admin-education-list');
    await expect(mappingRegistryList).toContainText('صنف نهم ب');
    await expect(mappingRegistryList).toContainText('استاد احمد');
    await expect(mappingRegistryList).toContainText('استاد فرید');
    await expect(mappingRegistryList).toContainText('صنف دهم الف');
    await expect(mappingRegistryList).toContainText('صنف هشتم الف');
    await expect(mappingRegistryList).toContainText('صنف یازدهم ب');
    await expect(mappingRegistryList).not.toContainText('صنف ششم ج');
    await expect(mappingRegistryCard.getByRole('button', { name: /بیشتر/ })).toBeVisible();
    await mappingRegistryCard.getByRole('button', { name: /بیشتر/ }).click();
    await expect(mappingRegistryList).toContainText('صنف ششم ج');
    await expect(mappingRegistryList).toContainText('صنف نهم ب');
    await expect(mappingRegistryList).not.toContainText('Legacy Mirror 9B');
    await mappingRegistryCard.getByLabel('جستجو در فهرست تقسیم‌ها').fill('صنف نهم ب');
    await mappingRegistryCard.getByRole('button', { name: 'جستجو' }).click();
    await mappingRegistryCard.getByLabel('فیلتر سال تقسیم').selectOption('year-1');
    await mappingRegistryCard.getByLabel('فیلتر صنف تقسیم').selectOption('class-5');
    await mappingRegistryCard.getByLabel('فیلتر نوع تقسیم').selectOption('secondary');
    await expect(mappingRegistryList).toContainText('صنف نهم ب');
    await expect(mappingRegistryList).not.toContainText('صنف دهم الف');
    await mappingRegistryCard.getByRole('button', { name: 'پاک‌کردن' }).click();

    await sectionNav.getByRole('button', { name: /ثبت.?نام متعلمین/ }).click();
    const enrollmentCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'ثبت‌نام متعلمین' }) }).first();
    const onlineQueueCard = page.locator('article.admin-workspace-card').filter({ has: page.getByRole('heading', { name: 'صندوق ثبت‌نام آنلاین' }) }).first();
    await expect(onlineQueueCard).toContainText('متعلم آنلاین');
    await onlineQueueCard.getByRole('button', { name: 'معرفی به صنف' }).click();
    await expect(enrollmentCard.locator('[data-role=\"selected-candidate-summary\"]')).toContainText('متعلم آنلاین');
    await enrollmentCard.locator('[data-role=\"enrollment-class-select\"]').selectOption('class-5');
    await enrollmentCard.locator('textarea').fill('ثبت مستقیم از پنل جدید');
    await enrollmentCard.getByRole('button', { name: 'ایجاد ثبت‌نام' }).click();

    await expect.poll(() => enrollmentCreates).toBe(1);
    const enrollmentRegistryCard = page
      .locator('article.admin-workspace-card')
      .filter({ has: page.getByRole('heading', { name: 'دفتر ثبت‌نام‌ها' }) })
      .first();
    const enrollmentRegistryTable = enrollmentRegistryCard.locator('table');
    await expect(enrollmentRegistryTable).toContainText('متعلم آنلاین');
    await expect(enrollmentRegistryTable).toContainText('صنف نهم ب');
    await expect(enrollmentRegistryTable).toContainText('متعلم ب');
    await expect(enrollmentRegistryTable).toContainText('صنف هشتم الف');
    await expect(enrollmentRegistryTable).toContainText('صنف یازدهم ب');
    await expect(enrollmentRegistryTable).toContainText('صنف دهم الف');
    await expect(enrollmentRegistryTable).not.toContainText('صنف ششم ج');
    await expect(enrollmentRegistryCard.getByRole('button', { name: /بیشتر/ })).toBeVisible();
    await enrollmentRegistryCard.getByRole('button', { name: /بیشتر/ }).click();
    await expect(enrollmentRegistryTable).toContainText('صنف ششم ج');
    await expect(enrollmentRegistryTable).toContainText('صنف نهم ب');
    await expect(enrollmentRegistryTable).not.toContainText('Legacy Mirror 9B');
    await enrollmentRegistryCard.getByLabel('جستجو در دفتر ثبت‌نام‌ها').fill('اسناد ناقص');
    await enrollmentRegistryCard.getByRole('button', { name: 'جستجو' }).click();
    await enrollmentRegistryCard.getByLabel('فیلتر وضعیت ثبت‌نام').selectOption('rejected');
    await enrollmentRegistryCard.getByLabel('فیلتر سال ثبت‌نام').selectOption('year-2');
    await expect(enrollmentRegistryTable).toContainText('متعلم الف');
    await expect(enrollmentRegistryTable).toContainText('اسناد ناقص');
    await expect(enrollmentRegistryTable).not.toContainText('متعلم ب');
    await enrollmentRegistryCard.getByRole('button', { name: 'پاک‌کردن' }).click();

    await sectionNav.getByRole('button', { name: /مضمون‌ها/ }).click();
    await subjectRegistryCard.getByLabel('جستجو در فهرست مضمون‌ها').fill('PHY-9');
    await subjectRegistryCard.getByRole('button', { name: 'جستجو' }).click();
    page.once('dialog', (dialog) => dialog.accept());
    const physicsDeleteRow = subjectRegistryCard.locator('.admin-education-list-item').filter({ hasText: 'فزیک' }).first();
    await physicsDeleteRow.getByRole('button', { name: 'حذف' }).click();
    await expect.poll(() => subjectDeletes).toBe(1);
    await expect(subjectRegistryCard).not.toContainText('فزیک');
  });
});
