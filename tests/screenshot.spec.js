import { test } from '@playwright/test';

// Not a real test — just captures screenshots so we can eyeball the output.
// Run with: npx playwright test tests/screenshot.spec.js

test('capture screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null);
  await page.waitForTimeout(4000); // let trails build up

  await page.screenshot({ path: 'test-results/shot-default.png' });

  await page.locator('canvas').click();
  await page.keyboard.press('v');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/shot-vel-color.png' });

  await page.keyboard.press('v'); // turn velColor off
  await page.keyboard.press('.');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/shot-lorentz.png' });
});
