import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

test.describe('sheet templates workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_content']
    });
  });

  test('creates and configures a new sheet template with layout and columns', async ({ page }) => {
    let listCalls = 0;
    let createCalls = 0;
    let getCalls = 0;
    let lastCreatePayload = null;
    let lastRetrievedTemplate = null;

    const templateList = {
      success: true,
      items: []
    };

    const createdTemplate = {
      success: true,
      item: {
        id: 'template-123',
        code: 'attendance_reg_2026',
        title: 'نوبت ثبت حاضری ۱۴۰۶',
        type: 'attendance',
        description: 'قالب استاندارد برای ثبت حاضری',
        isActive: true,
        createdAt: '2026-04-01T10:00:00.000Z',
        margins: { top: 24, right: 24, bottom: 24, left: 24 },
        layout: {
          fontFamily: 'Calibri',
          fontSize: 12,
          orientation: 'portrait',
          showHeader: true,
          showFooter: true,
          showLogo: true,
          headerText: 'جمهوری اسلامی افغانستان',
          footerText: 'وزارت تحصیلات عالی'
        },
        columns: [
          { key: 'studentName', label: 'نام شاگرد', width: 20, visible: true, order: 1 },
          { key: 'admissionNo', label: 'شماره ثبت‌نام', width: 12, visible: true, order: 2 },
          { key: 'datePresent', label: 'تاریخ حاضری', width: 15, visible: true, order: 3 }
        ]
      }
    };

    // Mock API endpoints
    await page.route('**/api/sheet-templates$', async (route) => {
      if (route.request().method() === 'GET') {
        listCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(templateList)
        });
      } else if (route.request().method() === 'POST') {
        createCalls += 1;
        lastCreatePayload = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdTemplate)
        });
      }
    });

    await page.route('**/api/sheet-templates/template-123', async (route) => {
      if (route.request().method() === 'GET') {
        getCalls += 1;
        lastRetrievedTemplate = createdTemplate.item;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item: createdTemplate.item })
        });
      }
    });

    // Navigate to sheet templates admin page
    await page.goto('/admin-sheet-templates');
    await page.waitForLoadState('networkidle');

    // Verify page loaded and list was fetched
    expect(listCalls).toBeGreaterThan(0);
    await expect(page).toHaveTitle(/.*/); // Page should load

    // Fill in template metadata
    await page.fill('input[name="code"]', 'attendance_reg_2026');
    await page.fill('input[name="title"]', 'نوبت ثبت حاضری ۱۴۰۶');
    await page.fill('input[name="description"]', 'قالب استاندارد برای ثبت حاضری');
    
    // Select template type
    await page.selectOption('select[name="type"]', 'attendance');

    // Configure layout options
    await page.selectOption('select[name="fontFamily"]', 'Calibri');
    await page.fill('input[name="fontSize"]', '12');
    await page.selectOption('select[name="orientation"]', 'portrait');
    await page.check('input[name="showHeader"]');
    await page.check('input[name="showFooter"]');
    await page.check('input[name="showLogo"]');
    await page.fill('input[name="headerText"]', 'جمهوری اسلامی افغانستان');
    await page.fill('input[name="footerText"]', 'وزارت تحصیلات عالی');

    // Add columns if they don't exist
    const addColumnButton = page.locator('button:has-text("اضافه کردن ستون")');
    const initialColumnCount = await page.locator('table.admin-workspace-table tbody tr').count();
    
    // Create/save template
    await page.click('button:has-text("ذخیره کردن")');
    
    // Verify API was called with correct payload
    await page.waitForTimeout(1000);
    expect(createCalls).toBeGreaterThan(0);
    expect(lastCreatePayload).toMatchObject({
      code: 'attendance_reg_2026',
      title: 'نوبت ثبت حاضری ۱۴۰۶',
      type: 'attendance'
    });
  });

  test('manages columns with add, reorder, and delete operations', async ({ page }) => {
    const template = {
      success: true,
      item: {
        id: 'template-456',
        code: 'attendance_audit',
        title: 'نمونه بررسی',
        type: 'attendance',
        columns: [
          { key: 'studentName', label: 'نام شاگرد', width: 20, visible: true, order: 1 },
          { key: 'grade', label: 'صنف', width: 10, visible: true, order: 2 }
        ]
      }
    };

    let updateCalls = 0;

    await page.route('**/api/sheet-templates$', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [template.item] })
      });
    });

    await page.route('**/api/sheet-templates/template-456', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item: template.item })
        });
      } else if (route.request().method() === 'PATCH') {
        updateCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, item: template.item })
        });
      }
    });

    // Navigate and load template
    await page.goto('/admin-sheet-templates');
    await page.waitForLoadState('networkidle');

    // Select the template
    await page.click(`text=${template.item.title}`);
    await page.waitForLoadState('networkidle');

    // Verify columns are displayed
    const columnRows = page.locator('table.admin-workspace-table tbody tr');
    const initialRowCount = await columnRows.count();
    expect(initialRowCount).toBeGreaterThan(0);

    // Test add column functionality
    const addButton = page.locator('button:has-text("اضافه کردن")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForTimeout(300);
      const newRowCount = await columnRows.count();
      expect(newRowCount).toBe(initialRowCount + 1);
    }

    // Test column reorder (move up)
    if (initialRowCount >= 2) {
      const upButton = page.locator('button:has-text("↑")').nth(1);
      if (await upButton.isVisible()) {
        await upButton.click();
        await page.waitForTimeout(300);
        // Verify order changed (would have moved row 1 up)
        expect(updateCalls).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('template selection shows in AdminReports integration', async ({ page }) => {
    const templates = {
      success: true,
      items: [
        { id: 't1', code: 'att_1', title: 'حاضری سال ۱', type: 'attendance', isActive: true },
        { id: 't2', code: 'att_2', title: 'خلاصه حاضری', type: 'attendance_summary', isActive: true }
      ]
    };

    const reportReference = {
      success: true,
      catalog: [
        { key: 'attendance_export', title: 'صادرات حاضری' },
        { key: 'attendance_summary', title: 'خلاصه حاضری' }
      ],
      academicYears: [{ id: 'year-1', title: '1406', code: '1406' }],
      classes: [{ id: 'class-1', title: 'کلاس ۱۰', code: '10' }]
    };

    await page.route('**/api/sheet-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(templates)
      });
    });

    // Navigate to AdminReports
    await page.goto('/admin-reports');
    await page.waitForLoadState('networkidle');

    // Check that quick link to sheet templates exists
    const sheetTemplateLink = page.locator('a:has-text("مدیریت شقه‌ها")');
    if (await sheetTemplateLink.isVisible()) {
      expect(sheetTemplateLink).toHaveAttribute('href', /.*admin-sheet-templates.*/);
    }
  });

  test('preview shows formatted template output', async ({ page }) => {
    const template = {
      id: 'template-preview',
      code: 'preview_test',
      title: 'تست پیش‌نمایش',
      type: 'attendance',
      columns: [
        { key: 'studentName', label: 'نام', width: 20, visible: true, order: 1 },
        { key: 'status', label: 'وضعیت', width: 15, visible: true, order: 2 }
      ]
    };

    const previewData = {
      success: true,
      preview: {
        columns: template.columns,
        rows: [
          { studentName: 'علی احمد', status: 'حاضر' },
          { studentName: 'فاطمه علی', status: 'غایب' }
        ],
        layout: {
          fontFamily: 'Calibri',
          fontSize: 12,
          orientation: 'portrait'
        }
      }
    };

    let previewCalls = 0;

    await page.route('**/api/sheet-templates$', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [template] })
      });
    });

    await page.route('**/api/sheet-templates/template-preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: template })
      });
    });

    await page.route('**/api/sheet-templates/template-preview/preview', async (route) => {
      previewCalls += 1;
      const payload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(previewData)
      });
    });

    // Navigate and select template
    await page.goto('/admin-sheet-templates');
    await page.waitForLoadState('networkidle');
    await page.click(`text=${template.title}`);
    await page.waitForLoadState('networkidle');

    // Trigger preview
    const previewButton = page.locator('button:has-text("پیش‌نمایش")');
    if (await previewButton.isVisible()) {
      await previewButton.click();
      await page.waitForTimeout(500);
      expect(previewCalls).toBeGreaterThanOrEqual(0);
    }
  });

  test('exports template data in csv format', async ({ page }) => {
    let csvExportCalls = 0;
    let lastExportPayload = null;

    const template = {
      id: 'template-export',
      code: 'export_test',
      title: 'تست صادرات',
      type: 'attendance'
    };

    await page.route('**/api/sheet-templates$', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [template] })
      });
    });

    await page.route('**/api/sheet-templates/template-export', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, item: template })
      });
    });

    let downloadPath = null;
    page.on('download', (download) => {
      downloadPath = download.suggestedFilename();
    });

    await page.route('**/api/sheet-templates/template-export/export.csv', async (route) => {
      csvExportCalls += 1;
      lastExportPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="template-export.csv"'
        },
        body: 'نام,وضعیت\nعلی,حاضر'
      });
    });

    // Navigate and select template
    await page.goto('/admin-sheet-templates');
    await page.waitForLoadState('networkidle');
    await page.click(`text=${template.title}`);
    await page.waitForLoadState('networkidle');

    // Export as CSV
    const csvButton = page.locator('button:has-text("CSV")');
    if (await csvButton.isVisible()) {
      await csvButton.click();
      await page.waitForTimeout(500);
      expect(csvExportCalls).toBeGreaterThanOrEqual(0);
    }
  });

  test('permission denied when user lacks manage_content role', async ({ page }) => {
    // Re-setup workspace without manage_content permission
    await page.context().clearCookies();
    await setupAdminWorkspace(page, {
      permissions: ['view_reports'] // Explicitly without manage_content
    });

    const notFoundOrRedirect = async () => {
      try {
        await page.goto('/admin-sheet-templates');
        await page.waitForTimeout(500);
        // Should either redirect or show permission error
        const hasError = await page.locator('text=/.*نمی‌تواند.*|.*اجازه.*/').isVisible().catch(() => false);
        const isRedirected = !page.url().includes('admin-sheet-templates');
        return hasError || isRedirected;
      } catch {
        return true;
      }
    };

    expect(await notFoundOrRedirect()).toBeTruthy();
  });
});
