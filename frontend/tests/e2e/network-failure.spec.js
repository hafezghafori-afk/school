import { test, expect } from '@playwright/test';

/**
 * The failure modes a user actually hits. Each one used to render as an empty
 * page or, worse, as a confident wrong answer ("no news", "wrong password"),
 * which is what made a stopped server look like a broken database.
 *
 * The API is faked at the route level rather than by stopping a backend, so
 * "server unreachable", "database down" and "server restarting" can each be
 * produced exactly and on purpose.
 */

const NEWS_PATH = '/news';

/** Every /api call fails at the transport layer, as with a stopped server. */
const killTheServer = async (page) => {
  await page.route('**/api/**', (route) => route.abort('failed'));
};

/** The backend answers, but requireDatabase reports Mongo is gone. */
const databaseDown = async (page) => {
  await page.route('**/api/**', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'DEGRADED',
      message: 'سرویس دیتابیس در دسترس نیست',
      database: { connected: false, readyState: 0, state: 'disconnected' }
    })
  }));
};

/** The backend is up but still finishing its boot sequence. */
const serverStarting = async (page) => {
  await page.route('**/api/**', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({
      message: 'سرور در حال آماده‌سازی نهایی است؛ چند لحظه دیگر دوباره تلاش کنید.',
      database: { connected: true },
      starting: true
    })
  }));
};

test.describe('network failure states', () => {
  test('an unreachable server shows the banner and a retry, not an empty page', async ({ page }) => {
    await killTheServer(page);
    await page.goto(NEWS_PATH);

    // The app-wide banner names the cause and offers to re-check.
    await expect(page.getByText('سرور در دسترس نیست').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'بررسی دوباره' })).toBeVisible();

    // The page itself says its own data failed, rather than claiming there is
    // simply no news to show.
    await expect(page.getByRole('button', { name: 'تلاشِ دوباره' })).toBeVisible();
  });

  test('the retry button issues a fresh request', async ({ page }) => {
    let newsRequests = 0;
    await page.route('**/api/**', (route) => {
      if (route.request().url().includes('/api/news')) newsRequests += 1;
      return route.abort('failed');
    });

    await page.goto(NEWS_PATH);
    const retry = page.getByRole('button', { name: 'تلاشِ دوباره' });
    await expect(retry).toBeVisible();

    const before = newsRequests;
    await retry.click();
    await expect.poll(() => newsRequests, { timeout: 7_000 }).toBeGreaterThan(before);
  });

  test('a reachable server with an unreachable database says so', async ({ page }) => {
    await databaseDown(page);
    await page.goto(NEWS_PATH);

    // The backend has always worded this correctly; the point is that the
    // wording now reaches the screen instead of being flattened into "offline".
    await expect(page.getByText('دیتابیس در دسترس نیست').first()).toBeVisible();
  });

  test('a restarting server is reported as restarting', async ({ page }) => {
    await serverStarting(page);
    await page.goto(NEWS_PATH);

    await expect(page.getByText('سرور در حال آماده‌سازی است').first()).toBeVisible();
  });

  /**
   * Login has to keep two answers apart that look identical in the code: the
   * backend saying "these credentials are wrong" and the backend failing to
   * answer at all. Both directions are pinned here, because a change that
   * collapsed them would tell people to reset a password that was fine.
   */
  const submitLogin = async (page) => {
    await page.goto('/login');
    await page.getByPlaceholder('name@example.com').fill('someone@example.com');
    await page.getByPlaceholder('••••••••').fill('whatever');
    await page.getByRole('button', { name: /ورود به سیستم/ }).last().click();
  };

  test('a rejected login is reported as a credentials problem', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: 'Invalid credentials' })
    }));

    await submitLogin(page);
    await expect(page.locator('.message')).toContainText('رمز عبور درست نیست');
  });

  test('a crashed login is not reported as a credentials problem', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ success: false })
    }));

    await submitLogin(page);
    await expect(page.locator('.message')).toContainText('در سرور خطایی رخ داد');
    await expect(page.locator('.message')).not.toContainText('رمز عبور درست نیست');
  });
});
