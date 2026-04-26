import { test, expect } from '@playwright/test';

const criticalPages = [
  { path: '/', rootSelector: '.home-page' },
  { path: '/login', rootSelector: '.login-modern-container' },
  { path: '/dashboard', rootSelector: '.login-modern-container, .auth-page' },
  { path: '/admin', rootSelector: '.login-modern-container, .auth-page' },
  { path: '/chat', rootSelector: '.login-modern-container, .auth-page' },
  { path: '/profile', rootSelector: '.profile-page' }
];

test.describe('critical routes smoke', () => {
  for (const pageConfig of criticalPages) {
    test(`loads ${pageConfig.path}`, async ({ page }) => {
      await page.goto(pageConfig.path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#root')).toBeVisible();
      await expect(page.locator(pageConfig.rootSelector).first()).toBeVisible();
    });
  }
});
