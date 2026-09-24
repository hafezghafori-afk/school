import { expect } from '@playwright/test';

export const defaultAdminPermissions = [
  'view_reports',
  'manage_content',
  'manage_finance',
  'manage_users',
  'manage_schedule'
];

export const adminSession = {
  token: 'mock.header.signature',
  role: 'admin',
  userId: 'admin-1',
  userName: 'Admin Alpha',
  adminLevel: 'general_president',
  orgRole: 'general_president',
  permissions: defaultAdminPermissions
};

const baseSettings = {
  brandName: 'Alpha Academy',
  brandSubtitle: 'Admin Suite',
  adminQuickLinks: []
};

function json(body) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body)
  };
}

export async function setupAdminWorkspace(page, { permissions = defaultAdminPermissions, user = {}, settings = {} } = {}) {
  const session = {
    ...adminSession,
    ...user,
    permissions: Array.isArray(permissions) ? permissions : adminSession.permissions
  };

  await page.addInitScript((value) => {
    localStorage.setItem('token', value.token);
    localStorage.setItem('role', value.role);
    localStorage.setItem('userId', value.userId);
    localStorage.setItem('userName', value.userName);
    localStorage.setItem('adminLevel', value.adminLevel);
    localStorage.setItem('orgRole', value.orgRole);
    localStorage.setItem('effectivePermissions', JSON.stringify(value.permissions));
  }, session);

  await page.route('**/api/settings/public', async (route) => {
    await route.fulfill(json({
      success: true,
      settings: {
        ...baseSettings,
        ...settings
      }
    }));
  });

  await page.route('**/api/health', async (route) => {
    await route.fulfill(json({ success: true }));
  });

  await page.route('**/api/users/me/notifications', async (route) => {
    await route.fulfill(json({ success: true, items: [] }));
  });

  await page.route('**/api/users/me/notifications/read-all', async (route) => {
    await route.fulfill(json({ success: true }));
  });

  await page.route('**/api/users/me/notifications/*/read', async (route) => {
    await route.fulfill(json({ success: true }));
  });

  await page.route('**/api/users/me', async (route) => {
    await route.fulfill(json({
      success: true,
      user: {
        _id: session.userId,
        name: session.userName,
        role: session.role,
        adminLevel: session.adminLevel,
        orgRole: session.orgRole,
        permissions: session.permissions,
        effectivePermissions: session.permissions
      }
    }));
  });
}

// Playwright matches routes in reverse registration order, so this baseline has
// to be installed before a spec's own mocks: anything the spec registers
// afterwards still wins, and only the calls nobody claimed land on the
// catch-all.
//
// Every endpoint below fires while /admin mounts. An unmocked one is proxied to
// a backend that is not running during a test run, and apiFetch reads the proxy
// failure as a server error worth retrying with backoff — those retries hold
// slots in the shared request queue long enough to starve /api/admin/alerts
// past the 7s expect timeout. That is what made the dashboard specs read as
// flaky rather than stale: the assertion was fine, the data just arrived late.
export async function setupAdminDashboard(page) {
  // NotificationBell opens a socket from the app shell on every page. Nothing
  // here depends on it, and letting it retry a dead server only adds noise.
  await page.route('**/socket.io/**', async (route) => {
    await route.abort();
  });

  await page.route('**/api/**', async (route) => {
    await route.fulfill(json({ success: true, items: [] }));
  });

  await page.route('**/api/admin/stats*', async (route) => {
    await route.fulfill(json({
      success: true,
      users: 0,
      courses: 0,
      todayPayments: 0,
      pendingOrders: 0
    }));
  });

  await page.route('**/api/dashboard/admin*', async (route) => {
    await route.fulfill(json({
      success: true,
      summary: {},
      tasks: [],
      alerts: [],
      revenueTrend: [],
      studentGrowth: []
    }));
  });

  await page.route('**/api/admin/alerts*', async (route) => {
    await route.fulfill(json({ success: true, alerts: [] }));
  });

  await page.route('**/api/schedules/today*', async (route) => {
    await route.fulfill(json({ success: true, items: [], date: '2026-04-05' }));
  });

  await page.route('**/api/afghan-schools/ownership-audit*', async (route) => {
    await route.fulfill(json({ success: true, data: null }));
  });

  await page.route('**/api/admin/users/directory-orphans*', async (route) => {
    await route.fulfill(json({
      success: true,
      counts: { instructors: 0, students: 0, parents: 0 },
      groups: []
    }));
  });

  await page.route('**/api/admin/recent-activity*', async (route) => {
    await route.fulfill(json({ success: true, items: [] }));
  });
}

// Every page in the app is a lazy import, so under `npm run dev` Vite compiles
// AdminPanel.jsx the first time a spec asks for /admin. That first compile can
// hold the route spinner well past the 7s expect timeout, and the assertion
// that follows then fails with "element not found" while the app is in fact
// still starting up. Waiting the spinner out here absorbs the one-off compile
// and leaves every later assertion on the normal timeout, where a slow render
// really is a regression worth failing on. The default stays under the 30s test
// timeout so a slow page names the spinner instead of tripping some unrelated
// assertion further down.
export async function gotoAdminDashboard(page, { timeout = 20_000 } = {}) {
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.route-loading')).toHaveCount(0, { timeout });
}

// The live dashboard has no single alerts container. Urgent signals (level
// high, over SLA, or requiresImmediateAction) go to one panel and everything
// else to another, and both are plain .admin-modern-panel articles — only the
// heading tells them apart.
export function modernPanel(page, heading) {
  return page.locator('.admin-modern-panel')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) });
}
