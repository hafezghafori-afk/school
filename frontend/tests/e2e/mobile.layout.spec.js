import { test, expect } from '@playwright/test';
import { setupAdminDashboard, setupAdminWorkspace } from './adminWorkspace.helpers.js';

// Two invariants a phone user feels immediately, neither of which the existing
// responsive matrix can catch.
//
// 1. Nothing is silently cut off. `.content` carries `overflow-x: clip`, so a
//    child wider than the viewport does not scroll and does not widen the
//    document — it just disappears past the edge, and a document-level overflow
//    check still reads zero. That is how the whole admin dashboard header
//    (brand, search, profile card, hero, action buttons) sat half off-screen
//    without any test noticing.
// 2. Anything you tap is at least 44px tall. Both platforms' guidelines land on
//    roughly that number, and the measured reality before this was a row of
//    27px buttons on the government finance page and 36px tabs on the users
//    page.

const PHONE = { width: 375, height: 900 };

const ROUTES = [
  '/dashboard',
  '/admin-users',
  '/student-management',
  '/attendance-manager',
  '/admin-finance',
  '/admin-government-finance',
  '/admin-reports'
];

const seed = async (page) => {
  await setupAdminWorkspace(page);
  await setupAdminDashboard(page);
};

// An element hanging past the viewport is only a bug when nothing can scroll to
// it. A wide timetable or table inside its own `overflow-x: auto` wrapper is
// deliberate and stays reachable.
const findClipped = (page) => page.evaluate(() => {
  const viewportWidth = document.documentElement.clientWidth;
  const out = [];

  document.querySelectorAll('.dashboard-content *').forEach((el) => {
    const box = el.getBoundingClientRect();
    if (box.width <= 0) return;
    if (box.left >= -2 && box.right <= viewportWidth + 2) return;

    let parent = el.parentElement;
    let clipped = false;
    while (parent && parent !== document.body) {
      const overflowX = getComputedStyle(parent).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return;
      if (overflowX === 'clip' || overflowX === 'hidden') { clipped = true; break; }
      parent = parent.parentElement;
    }
    if (!clipped) return;

    // Decorative background shapes are positioned past the edge on purpose.
    const name = String(el.className || '');
    if (/blob|glow|aurora|decor/i.test(name)) return;

    out.push(`${el.tagName.toLowerCase()}.${name.split(' ')[0]} (${Math.round(box.width)}px)`);
  });

  return [...new Set(out)];
});

const findSmallTargets = (page) => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button, select, summary, [role="tab"], [role="button"]').forEach((el) => {
    const box = el.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    if (box.height >= 40) return;
    // Cells of a table keep their dense sizing on purpose until the row becomes
    // a card; so does anything a page opted out with .mobile-compact-field.
    if (el.closest('table, [data-print-sheet], .mobile-compact-field')) return;
    out.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]} (${Math.round(box.height)}px)`);
  });
  return [...new Set(out)];
});

test.describe('mobile layout', () => {
  for (const route of ROUTES) {
    test(`mobile layout keeps ${route} inside the screen and tappable`, async ({ page }) => {
      await seed(page);
      await page.setViewportSize(PHONE);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.mobile-shell__tabbar')).toBeVisible({ timeout: 25_000 });

      // Waiting for the shell is not enough and quietly defeats the whole file:
      // the shell renders outside <Suspense>, so it is on screen while the
      // route's lazy chunk is still compiling and `.dashboard-content` still
      // holds RouteLoading. Measured then, every page is empty and every
      // assertion passes. Wait for the real page, then let its data settle.
      await expect(page.locator('.route-loading')).toHaveCount(0, { timeout: 40_000 });
      await expect.poll(
        async () => (await page.locator('.dashboard-content').innerText()).trim().length,
        { timeout: 20_000 }
      ).toBeGreaterThan(200);
      await page.waitForTimeout(1500);

      expect(await findClipped(page)).toEqual([]);
      expect(await findSmallTargets(page)).toEqual([]);
    });
  }
});
