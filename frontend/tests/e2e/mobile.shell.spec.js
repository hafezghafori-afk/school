import { test, expect } from '@playwright/test';
import { setupAdminDashboard, setupAdminWorkspace } from './adminWorkspace.helpers.js';

// The mobile shell is the only fixed navigation a signed-in user has on a phone:
// App.jsx's `hideMainNav` strips every header and menu the moment the route is
// inside the dashboard area, so without this shell the only way out of a page is
// the browser's back button. These assertions exist so that stays true.
//
// The existing responsive.layout.spec.js covers anonymous routes only (it runs
// with no backend and nothing to log in against); this file seeds a session the
// same way the admin specs do, so it can reach the dashboard area at all.

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

const seed = async (page) => {
  await setupAdminWorkspace(page);
  await setupAdminDashboard(page);
};

test.describe('mobile shell', () => {
  test('mobile shell gives a signed-in phone user a top bar, five tabs and a drawer', async ({ page }) => {
    await seed(page);
    await page.setViewportSize(PHONE);
    await page.goto('/admin-users', { waitUntil: 'domcontentloaded' });

    // Assert on the bars, not on `.mobile-shell` itself: all three of its parts
    // are `position: fixed`, so the wrapper has a zero-height box and Playwright
    // reads it as hidden even when the shell is plainly on screen.
    await expect(page.locator('.mobile-shell__topbar')).toBeVisible();
    await expect(page.locator('.mobile-shell__tabbar')).toBeVisible();

    // The title comes from the route map in config/mobileNav.js, not from
    // document.title — usePageMeta only writes the browser tab.
    await expect(page.locator('.mobile-shell__topbar-title')).toHaveText('کاربران و دسترسی‌ها');

    // /admin-users is not a tab root, so the way back has to be on screen.
    await expect(page.locator('.mobile-shell__topbar .fa-arrow-right')).toBeVisible();

    const tabs = page.locator('.mobile-shell__tab');
    await expect(tabs).toHaveCount(5);
    await expect(tabs.last()).toContainText('همه');

    // The drawer is the way to everything the five tabs cannot hold.
    await tabs.last().click();
    const drawer = page.locator('.mobile-shell__drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.mobile-shell__drawer-group')).not.toHaveCount(0);

    // Closing it must give the page its scroll back, or the app reads as frozen.
    await page.locator('.mobile-shell__drawer .mobile-shell__icon-btn').click();
    await expect(drawer).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('mobile shell tab navigates and marks itself active without horizontal overflow', async ({ page }) => {
    await seed(page);
    await page.setViewportSize(PHONE);
    await page.goto('/admin-users', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.mobile-shell__tabbar')).toBeVisible();

    const financeTab = page.locator('.mobile-shell__tab', { hasText: 'مالی' }).first();
    await financeTab.click();

    // /admin-finance is the biggest lazy chunk in the app; on a cold dev server
    // its first compile runs past the 7s default, which has nothing to do with
    // whether the tab works.
    await expect(page).toHaveURL(/\/admin-finance/, { timeout: 25_000 });
    await expect(page.locator('.mobile-shell__tab.is-active')).toContainText('مالی', { timeout: 25_000 });

    // A fixed bottom bar is worthless if the page scrolls sideways underneath it.
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('mobile shell leaves the desktop layout alone', async ({ page }) => {
    await seed(page);
    await page.setViewportSize(DESKTOP);
    await page.goto('/admin-users', { waitUntil: 'domcontentloaded' });

    // Rendered, but CSS-hidden above 900px — the whole point of doing the
    // breakpoint in CSS rather than with matchMedia and a re-render.
    await expect(page.locator('.mobile-shell')).toHaveCount(1);
    await expect(page.locator('.mobile-shell__tabbar')).toBeHidden();
    await expect(page.locator('.mobile-shell__topbar')).toBeHidden();

    const padding = await page.evaluate(() => {
      const content = document.querySelector('.dashboard-content');
      if (!content) return null;
      const style = getComputedStyle(content);
      return { top: style.paddingTop, bottom: style.paddingBottom };
    });
    expect(padding).toEqual({ top: '0px', bottom: '0px' });
  });

  test('mobile shell keeps form fields at 16px so iOS Safari does not zoom on focus', async ({ page }) => {
    await seed(page);
    await page.setViewportSize(PHONE);
    await page.goto('/admin-users', { waitUntil: 'domcontentloaded' });

    // A real field the page styles itself (AdminUsers.css), not a synthetic one
    // — the risk this guards against is a class-scoped rule like
    // `.some-filterbar input { font-size: 13px }` out-specifying the base rule.
    const field = page.getByPlaceholder('جستجو بر اساس نام یا ایمیل');
    await expect(field).toBeVisible();

    // Anything under 16px makes Safari zoom in on focus and never zoom back —
    // the single most annoying thing about filling a form on a phone.
    const fontSize = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });
});
