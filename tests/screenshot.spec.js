import { test } from '@playwright/test';

// Visual sanity check — captures screenshots of each effect for eyeballing.
// Not a real test; run explicitly with: npx playwright test tests/screenshot.spec.js

test('capture screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null);
  await page.waitForTimeout(4000);

  await page.screenshot({ path: 'test-results/shot-default.png' });

  const press = async (k) => { await page.locator('canvas').click(); await page.keyboard.press(k); };

  await press('v'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/shot-vel-color.png' });
  await press('v');

  await press('.'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/shot-lorentz.png' });
  await press('.');

  await press('m'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/shot-doodle.png' });
  await press('m');

  await press('x'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/shot-squiggle.png' });
});
