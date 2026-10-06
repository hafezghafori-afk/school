import { test, expect } from '@playwright/test';
import { setupAdminDashboard, setupAdminWorkspace } from './adminWorkspace.helpers.js';

// ResponsiveTable turns a wide table into a card per row below 640px and writes
// each column's heading beside its value. Without the heading the card is just a
// stack of unlabelled values, which is worse than the scroll it replaced — so
// these assertions are mostly about the labels being there and being right.
//
// The labels are read from the live <thead> and published as `--rt-1…--rt-12`
// on the table element; CSS puts them in `td::before`. Nothing is written into
// the rows, which is what lets a 500-row table cost the same as a 5-row one.

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

const students = [
  {
    _id: 'stu-1',
    firstName: 'مریم',
    lastName: 'احمدی',
    fatherName: 'نظر محمد',
    nationalId: '1401-22',
    phone: '0700000001',
    status: 'active',
    gender: 'female',
    createdAt: '2026-03-21T00:00:00.000Z'
  },
  {
    _id: 'stu-2',
    firstName: 'زهرا',
    lastName: 'نظری',
    fatherName: 'عبدالله',
    nationalId: '1401-23',
    phone: '0700000002',
    status: 'active',
    gender: 'female',
    createdAt: '2026-03-22T00:00:00.000Z'
  }
];

const seedStudentList = async (page) => {
  await setupAdminWorkspace(page);
  await setupAdminDashboard(page);
  // Registered last so it wins over the catch-all the dashboard helper installs.
  await page.route('**/api/afghan-students**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, students })
    });
  });
};

// The first column's label, read the way the browser actually resolves it.
const labelOf = (cell) => cell.evaluate((el) => getComputedStyle(el, '::before').content);

test.describe('responsive table', () => {
  test('responsive table labels every cell with its column heading on a phone', async ({ page }) => {
    await seedStudentList(page);
    await page.setViewportSize(PHONE);
    await page.goto('/student-management', { waitUntil: 'domcontentloaded' });

    // A cold Vite dev server can take well past the 7s default to compile and
    // render this page the first time; the table itself is never slow.
    const table = page.locator('.rt .student-table');
    await expect(table).toBeVisible({ timeout: 25_000 });

    // The heading row itself is gone — its text now lives on the cells.
    await expect(page.locator('.rt .student-table thead')).toBeHidden();

    const firstRow = page.locator('.rt .student-table tbody tr').first();
    await expect(firstRow).toBeVisible();

    expect(await labelOf(firstRow.locator('td').nth(0))).toBe('"شاگرد"');
    expect(await labelOf(firstRow.locator('td').nth(1))).toBe('"صنف و نوبت"');
    expect(await labelOf(firstRow.locator('td').nth(4))).toBe('"وضعیت"');

    // Card, not table row: a row that still laid out as a table row would be
    // as wide as the widest column and scroll sideways again.
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(2);

    // The document-level check above is not enough on its own: these pages put
    // a big `min-width` on the table and an `overflow-x: auto` on its wrapper,
    // so an oversized cell scrolls inside the wrapper and the page itself still
    // measures clean. That is exactly how the first build shipped cards whose
    // labels were visible and whose values sat off-screen. Measure the cell.
    const cellWidth = await firstRow.locator('td').first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().width));
    expect(cellWidth).toBeLessThanOrEqual(375);
  });

  test('responsive table leaves the real table alone on desktop', async ({ page }) => {
    await seedStudentList(page);
    await page.setViewportSize(DESKTOP);
    await page.goto('/student-management', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.rt .student-table thead')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.rt .student-table tbody tr').first()).toBeVisible({ timeout: 25_000 });

    const display = await page.locator('.rt .student-table tbody tr').first()
      .evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('table-row');

    // No label is painted on desktop, so a wrong one can never show up there.
    const label = await labelOf(page.locator('.rt .student-table tbody td').first());
    expect(label === 'none' || label === 'normal').toBe(true);
  });

  test('responsive table publishes column headings as custom properties', async ({ page }) => {
    await seedStudentList(page);
    await page.setViewportSize(PHONE);
    await page.goto('/student-management', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.rt .student-table')).toBeVisible();

    const published = await page.locator('.rt .student-table').evaluate((el) => ({
      first: el.style.getPropertyValue('--rt-1'),
      last: el.style.getPropertyValue('--rt-7'),
      // Seven columns, so the eighth slot must stay empty — a stale value here
      // would paint a label on a column that does not exist.
      beyond: el.style.getPropertyValue('--rt-8')
    }));

    expect(published.first).toBe('"شاگرد"');
    expect(published.last).toBe('"عملیات"');
    expect(published.beyond).toBe('');
  });
});
