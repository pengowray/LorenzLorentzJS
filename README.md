# Loren(t)z JS

A Three.js port of the original Processing sketch in `../LorenzLorentz/`.

A tribute to Hendrik Lorentz (1853–1928) and Edward Lorenz (1917–2008): 122 Lorenz attractors evolve in parallel, drawn as glowing line ribbons.

## Running

The page uses native ES modules + an importmap, so no build step is needed — but it must be served over `http://`, not opened as `file://`. Source lives in [docs/](docs/) so GitHub Pages can host it directly.

```sh
cd docs
python -m http.server 8000
# or:  npx serve .
```

Then open `http://localhost:8000`.

To host on GitHub Pages: repo Settings → Pages → Source: *Deploy from a branch* → Branch: `master` /docs.

## Controls

| Key | Action |
| --- | --- |
| Drag / scroll | Orbit / zoom (OrbitControls) |
| Space | Pause / resume |
| `r` | Reset all attractors to seed |
| `f` | Toggle tail fade |
| `v` | Toggle velocity-based coloring |
| `n` | Toggle per-attractor speedup (timescale ∝ 1/velocity) |
| `.` | Toggle Lorentz warp (relativistic transform in vertex shader) |
| `b` | Toggle bounds box |
| `1`–`9` | Camera presets (ported from PeasyCam states) |
| `0` | Default camera |

## Status

Working: core attractor evolution, multi-attractor rendering, additive blending, tail fade, velocity coloring, per-attractor speedup, Lorentz warp (vertex shader via `material.onBeforeCompile`), OrbitControls, bounds box, camera presets.

Not yet ported from the original: squiggle head (`x`), stripes (`,`), doodle z-offset (`m`), follow-one-attractor (`q`), SVG export. Squiggle and doodle would slot into the same `onBeforeCompile` shader as the Lorentz warp.

## Tests

```sh
npm install
npx playwright install chromium
npm test
```

Smoke tests live in [tests/smoke.spec.js](tests/smoke.spec.js) and run against a tiny static server in [scripts/serve.js](scripts/serve.js).

Camera presets are ported from PeasyCam JSON but may need tuning — Processing is Y-down, Three.js is Y-up, and OrbitControls preserves a fixed up axis, so orientations may not match exactly.
