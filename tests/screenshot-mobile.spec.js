import { test } from '@playwright/test';

// Mobile (touch viewport) screenshots. Panel should start collapsed and
// have larger touch targets when expanded.
test('mobile collapsed default', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 414, height: 736 },  // iPhone-ish
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/shot-mobile-collapsed.png' });

  // Tap the header to expand.
  await page.locator('#panel .head').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/shot-mobile-expanded.png' });
});
