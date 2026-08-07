import { test, expect } from '@playwright/test';

const breakpoints = [
  { name: 'mobile-320', width: 320, height: 900, navMode: 'mobile' },
  { name: 'mobile-375', width: 375, height: 900, navMode: 'mobile' },
  { name: 'tablet-768', width: 768, height: 1024, navMode: 'mobile' },
  { name: 'tablet-1024', width: 1024, height: 900, navMode: 'mobile' },
  { name: 'desktop-1440', width: 1440, height: 900, navMode: 'desktop' }
];

const criticalRoutes = ['/', '/login', '/register', '/contact', '/dashboard', '/admin', '/chat'];

// Routes that render the redesigned public site chrome (PublicLayout /
// PublicHeader, see components/public/index.jsx): a single `.public-nav`
// that reflows via CSS instead of branching into separate mobile/desktop
// nav elements. This must mirror `usesPublicRedesign` in App.jsx.
const publicRedesignRoutes = new Set(['/', '/login', '/contact']);

// Routes that still render the legacy app-shell header (App.jsx, `header
// className="site-header"`), which does have distinct mobile
// (`.mobile-nav-toggle` / `.mobile-nav-drawer`) and desktop (`.desktop-nav`)
// chrome. `/register` hasn't been migrated to the public redesign yet.
const legacyHeaderRoutes = new Set(['/register']);

const readLayoutMetrics = async (page) => page.evaluate(() => {
  const doc = document.documentElement;
  const body = document.body;
  return {
    docScrollWidth: doc.scrollWidth,
    docClientWidth: doc.clientWidth,
    bodyScrollWidth: body ? body.scrollWidth : 0,
    bodyClientWidth: body ? body.clientWidth : 0,
    textLength: (body?.innerText || '').trim().length
  };
});

test.describe('responsive layout', () => {
  test('responsive layout matrix has no horizontal overflow on critical routes', async ({ page }) => {
    test.setTimeout(180_000);

    for (const bp of breakpoints) {
      await page.setViewportSize({ width: bp.width, height: bp.height });

      for (const route of criticalRoutes) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#root')).toBeVisible();
        await page.waitForTimeout(250);

        const metrics = await readLayoutMetrics(page);
        expect(metrics.textLength).toBeGreaterThan(20);
        expect(metrics.docScrollWidth - metrics.docClientWidth).toBeLessThanOrEqual(2);
        expect(metrics.bodyScrollWidth - metrics.bodyClientWidth).toBeLessThanOrEqual(2);

        if (publicRedesignRoutes.has(route)) {
          await expect(page.locator('.public-nav').first()).toBeVisible();
        } else if (legacyHeaderRoutes.has(route)) {
          if (bp.navMode === 'mobile') {
            await expect(page.locator('.mobile-nav-toggle').first()).toBeVisible();
          } else {
            await expect(page.locator('.desktop-nav').first()).toBeVisible();
          }
        }
      }
    }
  });

  test('responsive layout mobile drawer opens and closes on link click', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    // /register still renders the legacy app-shell header with the
    // hamburger/drawer; / now uses the redesigned PublicLayout header
    // (see publicRedesignRoutes above), which has no drawer to open.
    await page.goto('/register', { waitUntil: 'domcontentloaded' });

    const toggle = page.locator('.mobile-nav-toggle').first();
    await expect(toggle).toBeVisible();
    await toggle.click();

    const openDrawer = page.locator('.mobile-nav-drawer.open');
    await expect(openDrawer).toBeVisible();

    const firstShortcutLink = page.locator('.mobile-drawer-shortcuts-grid a').first();
    await expect(firstShortcutLink).toBeVisible();
    await firstShortcutLink.click();

    await expect(page.locator('.mobile-nav-drawer.open')).toHaveCount(0);
  });

  test('responsive layout desktop shows desktop nav', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Same reasoning as above: /register is the anonymous-reachable route
    // still on the legacy header. Its anonymous nav menu has no dropdown
    // items (those are only populated for authenticated users), so this
    // only asserts the layout split itself rather than mega-dropdown
    // content that isn't reachable without logging in.
    await page.goto('/register', { waitUntil: 'domcontentloaded' });

    const desktopNav = page.locator('.desktop-nav').first();
    await expect(desktopNav).toBeVisible();
    await expect(page.locator('.mobile-nav-bar').first()).toBeHidden();
  });
});
