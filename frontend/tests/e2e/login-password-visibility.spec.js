import { test, expect } from '@playwright/test';

const loginPages = [
  { path: '/login', rootSelector: '.login-modern-container' }
];

test.describe('login password visibility', () => {
  for (const loginPage of loginPages) {
    test(`toggles password visibility on ${loginPage.path}`, async ({ page }) => {
      await page.goto(loginPage.path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(loginPage.rootSelector).first()).toBeVisible();

      const passwordInput = page.locator('.password-input-wrapper input').first();
      const toggleButton = page.locator('.password-toggle').first();

      await expect(passwordInput).toHaveAttribute('type', 'password');
      await expect(toggleButton).toBeVisible();

      await passwordInput.fill('Secret123!');
      await expect(passwordInput).toHaveValue('Secret123!');

      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute('type', 'text');
      await expect(passwordInput).toHaveValue('Secret123!');

      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute('type', 'password');
      await expect(passwordInput).toHaveValue('Secret123!');
    });
  }

  test('keeps the password toggle separated from the input on mobile login', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const wrapper = page.locator('.password-input-wrapper').first();
    const passwordInput = page.locator('.password-input-wrapper input').first();
    const toggleButton = page.locator('.password-toggle').first();

    await expect(wrapper).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(toggleButton).toBeVisible();

    const wrapperBox = await wrapper.boundingBox();
    const inputBox = await passwordInput.boundingBox();
    const toggleBox = await toggleButton.boundingBox();

    expect(wrapperBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    expect(toggleBox).not.toBeNull();

    const horizontalOverlap = Math.min(
      inputBox.x + inputBox.width,
      toggleBox.x + toggleBox.width
    ) - Math.max(inputBox.x, toggleBox.x);

    expect(horizontalOverlap).toBeLessThanOrEqual(1);

    await passwordInput.fill('Secret123!');
    await expect(passwordInput).toHaveValue('Secret123!');
  });

  for (const legacyPath of ['/admin-login', '/instructor-login', '/login-modern', '/login-demo', '/login-enhanced', '/login-showcase']) {
    test(`redirects ${legacyPath} to the public login page`, async ({ page }) => {
      await page.goto(legacyPath, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.locator('.login-modern-container').first()).toBeVisible();
    });
  }
});
