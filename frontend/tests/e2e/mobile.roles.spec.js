import { test, expect } from '@playwright/test';

// Everything else in this folder signs in as an admin, which is how the parent
// bottom bar shipped pointing at `?tab=…` query strings the parent dashboard
// does not read: the page uses hash anchors (#attendance, #finance, #receipts).
// All four tabs landed in the same place and «خانه» stayed highlighted whichever
// one was tapped. These tests exist so the three non-admin roles are actually
// rendered.

const PHONE = { width: 375, height: 812 };

const ROLES = {
  instructor: {
    name: 'استاد نظری',
    home: '/dashboard',
    tabs: ['خانه', 'حاضری', 'نمرات', 'اوقات', 'همه']
  },
  student: {
    name: 'مریم احمدی',
    home: '/dashboard',
    tabs: ['خانه', 'نمرات', 'حاضری', 'اوقات', 'همه']
  },
  parent: {
    name: 'والد احمدی',
    home: '/parent-dashboard',
    tabs: ['خانه', 'حاضری', 'فیس', 'رسیدها', 'همه']
  }
};

// `dashboard.view` gates every role dashboard; `view_reports` is its legacy key.
const PERMISSIONS = ['dashboard.view', 'view_reports', 'attendance.manage', 'grades.manage', 'view_schedule'];

const signIn = async (page, role, name) => {
  await page.addInitScript((value) => {
    localStorage.setItem('token', 'mock.header.signature');
    localStorage.setItem('userId', 'u-1');
    localStorage.setItem('userName', value.name);
    localStorage.setItem('role', value.role);
    localStorage.setItem('orgRole', value.role);
    localStorage.setItem('status', 'active');
    localStorage.setItem('effectivePermissions', JSON.stringify(value.permissions));
  }, { role, name, permissions: PERMISSIONS });

  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      items: [],
      students: [{ _id: 'c2', name: 'مریم احمدی' }],
      dashboard: { summary: {} }
    })
  }));
  // The access guard re-reads permissions from here and overwrites what is in
  // localStorage, so this has to carry them too or every role lands on «دسترسی محدود».
  await page.route('**/api/users/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      user: { _id: 'u-1', name, role, orgRole: role, effectivePermissions: PERMISSIONS }
    })
  }));
};

test.describe('mobile roles', () => {
  for (const [role, config] of Object.entries(ROLES)) {
    test(`mobile roles give ${role} its own five tabs`, async ({ page }) => {
      await signIn(page, role, config.name);
      await page.setViewportSize(PHONE);
      await page.goto(config.home, { waitUntil: 'domcontentloaded' });

      await expect(page.locator('.mobile-shell__tabbar')).toBeVisible({ timeout: 25_000 });
      await expect(page.locator('.route-loading')).toHaveCount(0, { timeout: 40_000 });

      const labels = await page.locator('.mobile-shell__tab span').allTextContents();
      expect(labels).toEqual(config.tabs);

      // On its own home the first tab is the active one and there is nowhere to go back to.
      await expect(page.locator('.mobile-shell__tab.is-active')).toContainText(config.tabs[0]);
    });
  }

  test('mobile roles move the parent between sections of one page', async ({ page }) => {
    await signIn(page, 'parent', ROLES.parent.name);
    await page.setViewportSize(PHONE);
    // A parent with more than one child picks between them with ?studentId=, so a
    // tab that drops the query would silently switch which child is shown.
    await page.goto('/parent-dashboard?studentId=c2', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.mobile-shell__tabbar')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.route-loading')).toHaveCount(0, { timeout: 40_000 });
    await expect(page.locator('#finance')).toBeVisible({ timeout: 20_000 });

    for (const [label, anchor] of [['حاضری', '#attendance'], ['فیس', '#finance'], ['رسیدها', '#receipts']]) {
      await page.locator('.mobile-shell__tab', { hasText: label }).first().click();

      await expect(page).toHaveURL(new RegExp(`\\?studentId=c2${anchor}$`));
      await expect(page.locator('.mobile-shell__tab.is-active')).toContainText(label);

      // The section has to end up under the fixed top bar, not behind it.
      await expect.poll(async () => page.evaluate((id) => {
        const target = document.querySelector(id);
        const bar = document.querySelector('.mobile-shell__topbar');
        if (!target || !bar) return null;
        return Math.round(target.getBoundingClientRect().top - bar.getBoundingClientRect().height);
      }, anchor), { timeout: 10_000 }).toBeGreaterThanOrEqual(0);
    }
  });

  test('mobile roles keep the parent dashboard out of a render loop', async ({ page }) => {
    // With no bill eligible for a receipt — the normal case for a family that has
    // paid — the receipt-form effect used to set a fresh object on every render
    // while its dependency was itself rebuilt each render. React stopped the tree
    // with "Maximum update depth exceeded" and the page answered nothing after that.
    const loops = [];
    page.on('console', (message) => {
      if (/Maximum update depth/.test(message.text())) loops.push(message.text());
    });

    await signIn(page, 'parent', ROLES.parent.name);
    await page.setViewportSize(PHONE);
    await page.goto('/parent-dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.mobile-shell__tabbar')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.route-loading')).toHaveCount(0, { timeout: 40_000 });
    await page.waitForTimeout(3000);

    expect(loops).toEqual([]);
  });
});
