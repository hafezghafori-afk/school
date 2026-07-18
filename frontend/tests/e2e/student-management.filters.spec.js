import { test, expect } from '@playwright/test';

const session = {
  token: 'mock.header.signature',
  role: 'admin',
  userId: 'admin-1',
  userName: 'Admin',
  adminLevel: 'general_president',
  orgRole: 'general_president',
  permissions: ['manage_users', 'students.manage', 'users.manage', 'manage_finance']
};

test.describe('student management filters workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('token', value.token);
      localStorage.setItem('role', value.role);
      localStorage.setItem('userId', value.userId);
      localStorage.setItem('userName', value.userName);
      localStorage.setItem('adminLevel', value.adminLevel);
      localStorage.setItem('orgRole', value.orgRole);
      localStorage.setItem('effectivePermissions', JSON.stringify(value.permissions));
      localStorage.setItem('schoolId', 'school-1');
    }, session);

    await page.route('**/api/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], items: [] }) });
    });
    await page.route('**/api/users/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, user: { ...session, _id: session.userId, effectivePermissions: session.permissions } })
      });
    });
    await page.route('**/api/afghan-students?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            students: [
              {
                _id: 'profile-1',
                linkedUserId: 'student-1',
                registrationId: 'REG-1001',
                asasNumber: '1405-0001',
                status: 'active',
                personalInfo: { firstName: 'علی', lastName: 'احمدی', fatherName: 'کریم', gender: 'male' },
                contactInfo: { phone: '0700123456', email: 'ali@example.test' },
                academicInfo: { currentGrade: 'grade7', currentShift: 'morning' }
              },
              {
                _id: 'profile-2',
                linkedUserId: 'student-2',
                registrationId: 'REG-2002',
                status: 'inactive',
                personalInfo: { firstName: 'مریم', lastName: 'کریمی', fatherName: 'حسن', gender: 'female' },
                contactInfo: { phone: '0799999999', email: 'maryam@example.test' },
                academicInfo: { currentGrade: 'grade8', currentShift: 'afternoon' }
              }
            ]
          }
        })
      });
    });
    await page.route('**/api/finance/admin/student-memberships', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [{
            _id: 'membership-1', studentId: 'student-1', studentName: 'علی احمدی', status: 'active',
            classId: 'class-7', classTitle: 'صنف هفتم', academicYearId: 'year-1', academicYearTitle: '۱۴۰۵',
            shiftId: 'shift-morning', shiftName: 'صبح'
          }]
        })
      });
    });
    await page.route('**/api/education/student-enrollments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [{
            _id: 'education-2', linkedUserId: 'student-2', status: 'approved',
            user: { _id: 'student-2', name: 'مریم کریمی' },
            classId: 'class-8', schoolClass: { id: 'class-8', title: 'صنف هشتم', shiftId: 'shift-afternoon', shift: 'afternoon' },
            academicYear: { id: 'year-2', title: '۱۴۰۶' }
          }]
        })
      });
    });
    await page.route('**/api/academic-years/school/school-1', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [
        { _id: 'year-1', title: '۱۴۰۵', status: 'active' },
        { _id: 'year-2', title: '۱۴۰۶', status: 'active' }
      ] }) });
    });
    await page.route('**/api/school-classes/school/school-1', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [
        { _id: 'class-7', title: 'صنف هفتم' },
        { _id: 'class-8', title: 'صنف هشتم' }
      ] }) });
    });
    await page.route('**/api/shifts/school/school-1', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [
        { _id: 'shift-morning', name: 'صبح' },
        { _id: 'shift-afternoon', name: 'بعد از ظهر' }
      ] }) });
    });
  });

  test('searches normalized text and filters merged membership scopes', async ({ page }) => {
    await page.goto('/student-management');
    const rows = page.locator('.student-table tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('شماره اساس: 1405-0001');

    await page.getByTestId('student-class-filter').selectOption('class-7');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('علی');

    await page.getByTestId('student-year-filter').selectOption('year-1');
    await page.getByTestId('student-shift-filter').selectOption('shift-morning');
    await expect(rows).toHaveCount(1);

    await page.getByRole('button', { name: /پاک/ }).click();
    await page.getByTestId('student-search-input').fill('علي احمدي');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('علی احمدی');

    await page.getByTestId('student-search-input').fill('۰۷۰۰۱۲۳۴۵۶');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('0700123456');

    await page.getByTestId('student-search-input').fill('');
    await page.getByTestId('student-class-filter').selectOption('class-8');
    await page.getByTestId('student-year-filter').selectOption('year-2');
    await page.getByTestId('student-shift-filter').selectOption('shift-afternoon');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('مریم');

    await page.getByRole('button', { name: /پاک/ }).click();
    await page.getByTestId('student-gender-filter').selectOption('female');
    await page.getByTestId('student-status-filter').selectOption('inactive');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('مریم');
  });

  test('prints the student Asas number first and loads a Persian PDF font', async ({ page }) => {
    await page.goto('/student-management');
    await expect(page.locator('.student-table tbody tr')).toHaveCount(2, { timeout: 20000 });
    await page.evaluate(() => { window.__DISABLE_STUDENT_PDF_AUTO_PRINT__ = true; });

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /PDF/ }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup.locator('thead th').first()).toHaveText('شماره اساس شاگرد');
    await expect(popup.locator('tbody tr').first().locator('td').first()).toHaveText('1405-0001');
    await expect.poll(() => popup.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('B Nazanin PDF');
    await expect.poll(() => popup.evaluate(async () => {
      const loadedFaces = await Promise.race([
        document.fonts.load('400 13px "B Nazanin PDF"', 'لیست شاگردان'),
        new Promise((resolve) => setTimeout(() => resolve([]), 5000))
      ]);
      return loadedFaces.length;
    })).toBeGreaterThan(0);
    await popup.close();
  });
});
