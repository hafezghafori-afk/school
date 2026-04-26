import path from 'node:path';
import { test, expect } from '@playwright/test';

const axeScriptPath = path.resolve(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

test.describe('login accessibility', () => {
  test('keeps the public login page free of serious axe violations', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.login-modern-container').first()).toBeVisible();

    await page.addScriptTag({ path: axeScriptPath });

    const axeResults = await page.evaluate(async () => {
      return window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa']
        },
        rules: {
          'color-contrast': { enabled: false }
        }
      });
    });

    const blockingViolations = axeResults.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact || '')
    );

    expect(blockingViolations, JSON.stringify(
      blockingViolations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          failureSummary: node.failureSummary
        }))
      })),
      null,
      2
    )).toEqual([]);
  });
});
