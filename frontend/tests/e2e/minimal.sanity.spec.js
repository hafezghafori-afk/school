import { test, expect } from '@playwright/test';

test('minimal sanity check', async ({ page }) => {
  expect(1 + 1).toBe(2);
});
