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