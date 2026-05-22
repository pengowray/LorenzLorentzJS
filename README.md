# Loren(t)z JS

A Three.js port of the original Processing sketch in `../LorenzLorentz/`.

A tribute to Hendrik Lorentz (1853–1928) and Edward Lorenz (1917–2008): 122 Lorenz attractors evolve in parallel, drawn as glowing line ribbons.

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

| Key | Action |
| --- | --- |
| Drag / scroll | Orbit / zoom (OrbitControls) |
| Space | Pause / resume |
| `r` | Reset all attractors to seed |
| `f` | Toggle tail fade |
| `v` | Toggle velocity-based coloring |
| `n` | Toggle per-attractor speedup (timescale ∝ 1/velocity) |
| `.` | Toggle bedhair warp (the original's Lorentz-flavoured mess, vertex shader) |
| `;` | Toggle beam (relativistic Doppler beaming: brighter toward camera, dimmer away) |
| `x` | Toggle squiggle (animated jitter on the head, vertex shader) |
| `m` | Toggle doodle (monotonic z-offset along the trail, vertex shader) |
| `,` | Toggle stripes (per-attractor dashed pattern, vertex shader) |
| `q` | Toggle follow-one (camera target chases attractor 0) |
| `g` | Save current frame as PNG |
| `b` | Toggle bounds box |
| `1`–`9` | Camera presets (ported from PeasyCam states) |
| `0` | Default camera |

## Status

All meaningful features from the original sketch are now ported. The three position-warping effects (bedhair, squiggle, doodle) and the per-attractor stripe modulation all stack into the same vertex shader via `LineBasicMaterial.onBeforeCompile` + shared uniforms — see [docs/material.js](docs/material.js).

The `bedhair` effect was originally called "Lorentz warp" in the source sketch — an attempt at a Lorentz-transform-flavoured visual that ended up looking more like messy hair than physics.

The `beam` mode is a first physics-defensible Lorentz transform: each segment's tangent direction (`instanceEnd - instanceStart`) is dotted with the line-to-camera direction to produce a Doppler-style intensity boost. Particles whose velocity points toward the observer brighten; those moving away dim. Still on the to-do list: a Lorentz-transform mode that actually *warps* the geometry (length contraction / Terrell rotation), not just modulates brightness.

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

Camera presets are ported from PeasyCam JSON but may need tuning — Processing is Y-down, Three.js is Y-up, and OrbitControls preserves a fixed up axis, so orientations may not match exactly.
