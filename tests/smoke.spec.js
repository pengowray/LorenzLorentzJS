import { test, expect } from '@playwright/test';

// All tests rely on window._app being set by main.js at startup.
// _app exposes { renderer, scene, attractors, getState() } for inspection.

test('loads without console or page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });
  await page.waitForTimeout(1500);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('canvas has non-black pixels', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });
  // Let a few hundred frames accumulate so the trail is visible
  await page.waitForTimeout(1500);

  // Sample pixels straight from the WebGL canvas via the app's renderer.
  const stats = await page.evaluate(() => {
    const r = window._app.renderer;
    const gl = r.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    // Re-render so the back buffer is fresh, then read pixels before swap.
    r.render(window._app.scene, window._app.camera);
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] + pixels[i+1] + pixels[i+2] > 10) bright++;
    }
    return { totalPixels: w * h, brightPixels: bright };
  });

  // Should be at least a few hundred lit pixels from the attractor lines.
  expect(stats.brightPixels).toBeGreaterThan(200);
});

test('render loop advances and attractors evolve', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });

  const before = await page.evaluate(() => window._app.getState());
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => window._app.getState());

  // Render loop ticked
  expect(after.frame).toBeGreaterThan(before.frame + 10);
  // First attractor's drawCount grew (or hit the cap)
  expect(after.attractor0DrawCount).toBeGreaterThan(before.attractor0DrawCount);
  // Position has moved (chaos)
  expect(after.attractor0Position).not.toEqual(before.attractor0Position);
});

test('keyboard toggles flip app flags', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });
  const canvas = page.locator('canvas');
  await canvas.click(); // ensure window has focus

  for (const [key, flag] of [['v', 'velColor'], ['n', 'speedup'], ['f', 'fadeOn'], ['.', 'lorentz']]) {
    const before = await page.evaluate(f => window._app.flags[f], flag);
    await page.keyboard.press(key);
    const after = await page.evaluate(f => window._app.flags[f], flag);
    expect(after, `pressing ${key} should toggle ${flag}`).toBe(!before);
  }
});

test('lorentz warp shader compiles and changes the rendered output', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });
  await page.waitForTimeout(1500); // build up a trail

  // Sample N random pixel locations off the WebGL backbuffer with and without
  // the warp. Compare; if the warp shader runs they should differ noticeably.
  const samplePixels = () => page.evaluate(() => {
    const r = window._app.renderer;
    const gl = r.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    r.render(window._app.scene, window._app.camera);
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    // Pixel signature: just sum, cheap and good enough to detect change.
    let sum = 0;
    for (let i = 0; i < buf.length; i += 4) sum += buf[i] + buf[i+1] + buf[i+2];
    return sum;
  });

  const before = await samplePixels();
  await page.locator('canvas').click();
  await page.keyboard.press('.');
  await page.waitForTimeout(100); // let one frame render with warp on
  const after = await samplePixels();

  expect(errors, errors.join('\n')).toEqual([]);
  expect(after).not.toBe(before);
});

test('speedup adjusts timescale away from 1', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });
  await page.waitForTimeout(500); // accumulate some velocity history

  expect(await page.evaluate(() => window._app.attractors[0].timescale)).toBe(1);
  await page.locator('canvas').click();
  await page.keyboard.press('n');
  await page.waitForTimeout(300);
  const ts = await page.evaluate(() => window._app.attractors[0].timescale);
  expect(ts).not.toBe(1);
});
