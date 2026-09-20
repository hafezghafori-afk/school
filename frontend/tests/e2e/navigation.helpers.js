import { expect } from '@playwright/test';

// Every page in the app is a lazy import, and under `npm run dev` Vite compiles
// each one the first time it is asked for. The finance screens are the biggest
// source files in the repo — AdminFinance.jsx alone is ~800KB and Babel reports
// it as too large to optimise — so that first compile can hold the route
// spinner for well past the 7s default expect timeout, especially when a second
// worker is compiling another page at the same time. A test that asserts on a
// heading right after goto() then fails with "element not found" while the app
// is in fact still starting up.
//
// Waiting the spinner out here absorbs that one-off compile, and leaves every
// assertion after it on the normal timeout, where a slow render really is a
// regression worth failing on.
// The default has to stay under the 30s test timeout in playwright.config.mjs,
// or a slow page reports as "test timeout exceeded" somewhere further down
// instead of naming the spinner it actually got stuck on.
export async function gotoAppPage(page, url, { timeout = 20_000 } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.route-loading')).toHaveCount(0, { timeout });
}

// Playwright matches routes in reverse registration order, so this has to go in
// before any specific mock: everything a spec declares afterwards still wins,
// and only the requests nobody claimed land here.
//
// Without it those unclaimed requests are proxied to localhost:5000, which is
// not running during a test run, and apiFetch reads the proxy's failure as a
// server error worth two retries with backoff. A page that calls a few
// endpoints its spec has never heard of — /api/finance/admin/staff-advances*
// alone accounts for 150+ requests in one government-finance run — then spends
// those retries holding slots in the six-deep request queue, and the reload the
// test is waiting on lands seconds late. That is the difference between a test
// that asserts on fresh data and one that types into a form the page is about
// to overwrite.
export async function stubUnmockedApi(page) {
  await page.route('**/api/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] })
    });
  });
}
