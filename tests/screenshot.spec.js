import { test } from '@playwright/test';

// Visual sanity check — captures screenshots of each mode for eyeballing.
// Each shot is taken from a freshly-loaded, pre-warmed page so the trail
// length is identical between modes (no "earlier shots look thinner"
// confound). Not a real assertion test; run with:
//   npx playwright test tests/screenshot.spec.js

const MODES = [
  { name: 'default',  keys: '' },
  { name: 'vel-color', keys: 'v' },
  { name: 'bedhair',   keys: '.' },
  { name: 'doodle',    keys: 'm' },
  { name: 'squiggle',  keys: 'x' },
  { name: 'stripes',   keys: ',' },
  { name: 'beam',      keys: ';' },
  { name: 'delay',     keys: "'" },
];

for (const { name, keys } of MODES) {
  test(`capture ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.waitForFunction(() => window._app?.renderer != null);
    await page.waitForTimeout(800); // a couple of render frames after pre-warm

    if (keys) {
      await page.locator('canvas').click();
      for (const k of keys) await page.keyboard.press(k);
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: `test-results/shot-${name}.png` });
  });
}
