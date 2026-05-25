# Loren(t)z JS

A Three.js port of the original handwritten Processing sketch at [pengowray/LorenzLorentz](https://github.com/pengowray/LorenzLorentz)

A tribute to Hendrik Lorentz (1853–1928) and Edward Lorenz (1917–2008).

## Running

The page uses native ES modules + an importmap, so no build step is needed — but it must be served over `http://`, not opened as `file://`. Source lives in [docs/](docs/) so GitHub Pages can host it directly. Three.js is vendored under `docs/vendor/` so the page loads with zero CDN dependencies (which also makes tests fast).

```sh
cd docs
python -m http.server 8000
# or:  npx serve .
```

Then open `http://localhost:8000`.

To host on GitHub Pages: repo Settings → Pages → Source: *Deploy from a branch* → Branch: `master` /docs.

## Controls

There's a control panel on the right side of the page, sectioned into View / Effects / Lorentz / Sim. Each row shows the keyboard shortcut, the label, and a filled (●) or empty (○) state indicator; clicking a row is equivalent to pressing the key. Keyboard shortcuts also work directly.

| Key | Action |
| --- | --- |
| Drag / scroll | Orbit / zoom (OrbitControls) |
| Space | Pause / resume |
| `r` | Reset all attractors to seed |
| `f` | Toggle tail fade |
| `v` | Toggle velocity-based coloring |
| `n` | Toggle per-attractor speedup |
| `x` | Toggle squiggle head |
| `m` | Toggle doodle z-offset |
| `,` | Toggle stripes |
| `.` | Toggle bedhair warp (original's Lorentz-flavoured mess) |
| `;` | Toggle beam (Doppler intensity modulation) |
| `'` | Toggle delay (light-travel-time geometric warp) |
| `q` | Toggle follow-one (camera tracks attractor 0) |
| `b` | Toggle bounds box |
| `g` | Save current frame as PNG |
| `1`–`9` | Camera presets (ported from PeasyCam states) |
| `0` | Default camera |

## Status

All meaningful features from the original sketch are now ported. The three position-warping effects (bedhair, squiggle, doodle) and the per-attractor stripe modulation all stack into the same vertex shader via `LineBasicMaterial.onBeforeCompile` + shared uniforms — see [docs/material.js](docs/material.js).

The `bedhair` effect was originally called "Lorentz warp" in the source sketch — an attempt at a Lorentz-transform-flavoured visual that ended up looking more like messy hair than physics.

There are three Lorentz-flavoured modes:

- **bedhair (`.`)** — the original sketch's decorative warp, kept under its new name. Looks more like messy hair than physics.
- **beam (`;`)** — Doppler-style intensity modulation. Each segment brightens or dims based on the dot product of its tangent and the line-to-camera direction. Real physics, but subtle visually because it only affects brightness, not geometry.
- **delay (`'`)** — light-travel-time retarded position. Each trail vertex is displaced by `-segDir × dist / c`, so what you see is where the particle WAS when it emitted the light reaching the camera now. This is the basis of the Terrell-Penrose rotation: a real geometric warp of the butterfly shape, not just brightness. Tunable via the **delay c** knob in the control panel — smaller `c` = slower light = more dramatic distortion.

## Recording a looping animation

Click **record video** in the LOOP section of the control panel (expand it first — it's collapsed by default). The recorder produces a `lorenz-loop-<timestamp>.webm`.

The current algorithm (when **staggered fades** is on, the default) doesn't try to force the chaotic trajectory into a closed loop — instead, each attractor fades in and out on its own cycle, and the fades are staggered so any single moment shows only a handful in their fade window. The seam between the last frame and the first is masked by the fades: attractors near a trough at the seam are at low alpha, so their xyz mismatch at the loop boundary is invisible.

1. **Pass 0** (path planning): simulate `V` (default 600) frames naturally with no rendering, capturing each attractor's full xyz trajectory. The data is held available for path-aware fade scheduling (currently a TODO — fades are scheduled with random offsets).
2. **Schedule fades**: each attractor gets a cycle length `L_i` from divisors of `V` in `[120, 360]` and a random phase offset `O_i` in `[0, L_i)`. Because `L_i` divides `V`, the alpha at the seam matches between frame `0` and frame `V`. Per-attractor offsets distribute fade moments across the video.
3. **Pass 1** (record): rewind to the live state and re-simulate, this time with `MediaRecorder` capturing the canvas. Each frame, set every attractor's `uOpacity` from a smoothstep-shaped envelope on its current cycle phase. The Lorenz integration is otherwise untouched.

In **staggered fades: off** mode every attractor stays at full opacity throughout the recording — useful as a debug baseline that shows the hard cut you'd get without the fades.

Earlier morph-based loop-forcing iterations are preserved in a comment block at the bottom of [docs/recorder.js](docs/recorder.js) and in the git history (`fb4245d` / `9abd1ba` / `44c3595`).

Everything runs in the browser via `MediaRecorder` — no external libraries. Progress is at `window._app.recordingState.progress`.

The simulation pre-warms ~280 iterations at startup so the butterfly is fully formed in the first rendered frame (without this it took ~5 seconds for the bright trails to fill).

PNG export (`g`) replaces the original's SVG/PDF export (which was already broken in 3D for the Processing version).

Intentionally not ported: the development-only `findBoundsOn` mode (which used to log PVector min/max ranges to console), the always-`false` `wobble` block, and the alternate `EvolveSpeedup` heuristics that were commented out in the original.

## Tests

```sh
npm install
npx playwright install chromium
npm test
```

Smoke tests live in [tests/smoke.spec.js](tests/smoke.spec.js) and run against a tiny static server in [scripts/serve.js](scripts/serve.js).

Headless Chromium's WebGL is dramatically slower than a real browser at rendering 122 instanced `Line2` attractors — a full test run can take several minutes per test, even though the page itself loads in ~250ms in a real browser. The test timeouts in [playwright.config.js](playwright.config.js) are sized for that, not for the app's actual performance.

Camera presets are ported from PeasyCam JSON but may need tuning — Processing is Y-down, Three.js is Y-up, and OrbitControls preserves a fixed up axis, so orientations may not match exactly.
