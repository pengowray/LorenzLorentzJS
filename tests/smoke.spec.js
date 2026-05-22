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
  const maxPoints = await page.evaluate(() => window._app.attractors[0].maxPoints);

  // Render loop ticked
  expect(after.frame).toBeGreaterThan(before.frame + 10);
  // drawCount is saturated at maxPoints after pre-warm and stays there.
  expect(before.attractor0DrawCount).toBe(maxPoints);
  expect(after.attractor0DrawCount).toBe(maxPoints);
  // Position has moved (chaos)
  expect(after.attractor0Position).not.toEqual(before.attractor0Position);
});

test('keyboard toggles flip app flags', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });
  const canvas = page.locator('canvas');
  await canvas.click(); // ensure window has focus

  for (const [key, flag] of [
    ['v', 'velColor'], ['n', 'speedup'], ['f', 'fadeOn'], ['.', 'bedhair'],
    [';', 'beam'], ['x', 'squiggle'], ['m', 'doodle'], [',', 'stripes'], ['q', 'followOne'],
  ]) {
    const before = await page.evaluate(f => window._app.flags[f], flag);
    await page.keyboard.press(key);
    const after = await page.evaluate(f => window._app.flags[f], flag);
    expect(after, `pressing ${key} should toggle ${flag}`).toBe(!before);
  }
});

test('bedhair warp shader compiles and changes the rendered output', async ({ page }) => {
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

test('beam mode redistributes brightness across the trail', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });
  await page.waitForTimeout(2000); // let velocity vectors fill the buffer

  // Pause so trail growth doesn't confound the measurement.
  await page.locator('canvas').click();
  await page.keyboard.press(' ');
  await page.waitForTimeout(80);

  // Beam brightens some pixels and dims others (one wing of the attractor vs
  // the other), so net brightness barely shifts. Measure per-pixel diff
  // between off/on snapshots — that's the test of "did anything change."
  const measureDiff = () => page.evaluate(() => {
    const r = window._app.renderer;
    const gl = r.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;

    const snap = () => {
      r.render(window._app.scene, window._app.camera);
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf;
    };

    const before = snap();
    window._app.flags.beam = true;
    window._app.beamUniform.value = 1.0;
    const after = snap();
    window._app.flags.beam = false;
    window._app.beamUniform.value = 0.0;

    let diff = 0;
    for (let i = 0; i < before.length; i += 4) {
      diff += Math.abs(before[i] - after[i])
            + Math.abs(before[i+1] - after[i+1])
            + Math.abs(before[i+2] - after[i+2]);
    }
    return diff;
  });

  const diff = await measureDiff();
  expect(errors, errors.join('\n')).toEqual([]);
  // Diff is in RGB units summed across all pixels; for a 1280x720 canvas
  // with even a few hundred bright trail pixels shifting, this should be
  // in the tens of thousands.
  expect(diff).toBeGreaterThan(1000);
});

test('follow-one mode targets attractor[0]', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('canvas').click();
  await page.keyboard.press('q');
  await page.waitForTimeout(200);

  const { tx, ty, tz, ax, ay, az } = await page.evaluate(() => {
    const t = window._app.controls.target;
    const a = window._app.attractors[0];
    return { tx: t.x, ty: t.y, tz: t.z, ax: a.x, ay: a.y, az: a.z };
  });
  // Target should be at (or chasing) the attractor's current point.
  expect(Math.abs(tx - ax) + Math.abs(ty - ay) + Math.abs(tz - az)).toBeLessThan(1.0);
});

test('squiggle and doodle change the rendered output', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });
  await page.waitForTimeout(1500);

  const pixelSum = () => page.evaluate(() => {
    const r = window._app.renderer;
    const gl = r.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    r.render(window._app.scene, window._app.camera);
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let s = 0; for (let i = 0; i < buf.length; i += 4) s += buf[i] + buf[i+1] + buf[i+2];
    return s;
  });

  const base = await pixelSum();
  await page.locator('canvas').click();

  await page.keyboard.press('m'); // doodle
  await page.waitForTimeout(100);
  const doodled = await pixelSum();
  await page.keyboard.press('m'); // off

  await page.keyboard.press('x'); // squiggle
  await page.waitForTimeout(100);
  const squiggled = await pixelSum();

  expect(errors, errors.join('\n')).toEqual([]);
  expect(doodled).not.toBe(base);
  expect(squiggled).not.toBe(base);
});

test('stripes toggle reduces total brightness', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });
  await page.waitForTimeout(1500);

  // Pause first so the trail doesn't keep growing between samples — the
  // stripe dim is small and pure-frame-growth would mask it otherwise.
  await page.locator('canvas').click();
  await page.keyboard.press(' ');
  await page.waitForTimeout(80);

  const sum = () => page.evaluate(() => {
    const r = window._app.renderer;
    const gl = r.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    r.render(window._app.scene, window._app.camera);
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let s = 0; for (let i = 0; i < buf.length; i += 4) s += buf[i] + buf[i+1] + buf[i+2];
    return s;
  });

  const off = await sum();
  await page.keyboard.press(',');
  await page.waitForTimeout(80);
  const on = await sum();

  expect(on).toBeLessThan(off);
});

test('PNG export produces a downloadable image', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window._app?.renderer != null, null, { timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.locator('canvas').click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('g'),
  ]);
  expect(download.suggestedFilename()).toMatch(/^lorenz-\d+\.png$/);
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
