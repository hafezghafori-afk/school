import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

test.describe('report workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__openedPrintReports = [];
      window.open = () => ({
        document: {
          open() {},
          write(html) {
            window.__openedPrintReports.push(html);
          },
          close() {}
        },
        focus() {}
      });
    });

    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_content', 'manage_finance']
    });
  });

  test('report workflow runs canonical report and exports csv, excel, and print output', async ({ page }) => {
    let runCalls = 0;
    let csvCalls = 0;
    let xlsxCalls = 0;
    let printCalls = 0;
    let lastRunPayload = null;

    const referenceData = {
      success: true,
      catalog: [
        { key: 'exam_outcomes', title: 'نتایج امتحان شاگردان' },
        { key: 'finance_overview', title: 'نمای کلی مالی' },
        { key: 'fee_debtors_overview', title: 'شاگردان مقروض فیس' },
        { key: 'fee_discount_exemption_overview', title: 'معافیت و تخفیف فیس' },
        { key: 'fee_collection_by_class', title: 'جمع‌آوری فیس به اساس صنف' }
      ],
      academicYears: [{ id: 'year-1', title: '1406', code: '1406' }],
      academicTerms: [{ id: 'term-1', title: 'Term 1', code: 'T1' }],
      classes: [{ id: 'class-1', title: 'Class 10 A', code: '10A' }],
      students: [{ id: 'student-1', fullName: 'Alpha Student', admissionNo: 'A-1' }],
      teachers: [{ id: 'teacher-1', name: 'Teacher One', email: 'teacher@example.test' }]
    };

    const reportPayload = {
      success: true,
      report: {
        report: {
          key: 'exam_outcomes',
          title: 'نتایج امتحان شاگردان',
          description: 'گزارش رسمی نتایج امتحان'
        },
        filters: {
          academicYearId: 'year-1',
          classId: 'class-1'
        },
        generatedAt: '2026-03-13T09:00:00.000Z',
        summary: {
          totalRows: 1,
          passed: 1
        },
        columns: [
          { key: 'studentName', label: 'نام شاگرد' },
          { key: 'score', label: 'نمره' }
        ],
        rows: [
          { studentName: 'Alpha Student', score: 93 }
        ]
      }
    };

    await page.route('**/api/reports/reference-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(referenceData)
      });
    });

    await page.route('**/api/reports/run', async (route) => {
      runCalls += 1;
      lastRunPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(reportPayload)
      });
    });

    await page.route('**/api/reports/export.csv', async (route) => {
      csvCalls += 1;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="exam_outcomes.csv"'
        },
        body: 'Student,Score\nAlpha Student,93'
      });
    });

    await page.route('**/api/reports/export.xlsx', async (route) => {
      xlsxCalls += 1;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': 'attachment; filename="exam_outcomes.xlsx"'
        },
        body: 'xlsx-binary'
      });
    });

    await page.route('**/api/reports/export.print', async (route) => {
      printCalls += 1;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-disposition': 'inline; filename="exam_outcomes.html"'
        },
        body: '<html><body><h1>Exam Outcomes</h1><p>Alpha Student</p></body></html>'
      });
    });

    await page.goto('/admin-reports', { waitUntil: 'domcontentloaded' });

    await page.locator('#report-key').selectOption('exam_outcomes');
    await page.locator('#report-year').selectOption('year-1');
    await page.locator('#report-class').selectOption('class-1');

    const filterCard = page.locator('article.admin-workspace-card').filter({ has: page.locator('#report-key') });
    await filterCard.locator('button').nth(1).click();

    await expect.poll(() => runCalls).toBe(1);
    await expect.poll(() => lastRunPayload?.filters?.classId || '').toBe('class-1');
    await expect(page.locator('select#report-key')).toContainText('گزارش نتایج امتحانات');
    await expect(page.locator('.admin-workspace-summary')).toContainText('گزارش نتایج امتحانات');
    await expect(page.locator('.admin-workspace-table thead')).toContainText('متعلم');
    await expect(page.locator('article.admin-workspace-card').nth(2)).toContainText('Alpha Student');

    const exportCard = page.locator('article.admin-workspace-card').nth(1);
    await exportCard.getByRole('button', { name: 'CSV' }).click();
    await exportCard.getByRole('button', { name: 'Excel' }).click();
    await exportCard.locator('button').nth(2).click();

    await expect.poll(() => csvCalls).toBe(1);
    await expect.poll(() => xlsxCalls).toBe(1);
    await expect.poll(() => printCalls).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__openedPrintReports.length)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__openedPrintReports[0] || '')).toContain('Alpha Student');
  });

  test('fee debtors report uses canonical fallback labels for summary and table output', async ({ page }) => {
    await page.route('**/api/reports/reference-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          catalog: [
            { key: 'fee_debtors_overview', title: 'گزارش بدهکاران فیس' }
          ],
          academicYears: [{ id: 'year-1', title: '1406', code: '1406' }],
          academicTerms: [],
          classes: [{ id: 'class-1', title: 'Class 10 A', code: '10A' }],
          students: [{ id: 'student-1', fullName: 'Alpha Student', admissionNo: 'A-1' }],
          teachers: []
        })
      });
    });

    await page.route('**/api/reports/run', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          report: {
            report: {
              key: 'fee_debtors_overview',
              title: 'شاگردان مقروض فیس',
              description: 'گزارش مقروضین فیس'
            },
            filters: {
              academicYearId: 'year-1',
              classId: 'class-1'
            },
            generatedAt: '2026-03-20T09:00:00.000Z',
            summary: {
              totalDebtors: 1,
              totalOutstanding: 2400,
              overdueDebtors: 1
            },
            columns: [
              { key: 'studentName', label: 'نام شاگرد' },
              { key: 'totalOutstanding', label: 'مجموع قرضداری' },
              { key: 'debtorStatus', label: 'وضعیت قرضداری' }
            ],
            rows: [
              { studentName: 'Alpha Student', totalOutstanding: 2400, debtorStatus: 'overdue' }
            ]
          }
        })
      });
    });

    await page.goto('/admin-reports', { waitUntil: 'domcontentloaded' });

    await page.locator('#report-key').selectOption('fee_debtors_overview');
    await page.locator('#report-year').selectOption('year-1');
    await page.locator('#report-class').selectOption('class-1');

    const filterCard = page.locator('article.admin-workspace-card').filter({ has: page.locator('#report-key') });
    await filterCard.locator('button').nth(1).click();

    const summaryCard = page.locator('article.admin-workspace-card').nth(1);
    await expect(page.locator('.admin-workspace-summary')).toContainText('گزارش بدهکاران فیس');
    await expect(summaryCard.locator('.admin-workspace-badges')).toContainText('تعداد بدهکاران');
    await expect(summaryCard.locator('.admin-workspace-badges')).toContainText('باقی');
    await expect(page.locator('.admin-workspace-table thead')).toContainText('متعلم');
    await expect(page.locator('.admin-workspace-table thead')).toContainText('باقی‌مانده');
    await expect(page.locator('.admin-workspace-table thead')).toContainText('وضعیت بدهکاری');
    await expect(page.locator('.admin-workspace-table tbody')).toContainText('Alpha Student');
    await expect(page.locator('.admin-workspace-table tbody')).toContainText('overdue');
  });
});
