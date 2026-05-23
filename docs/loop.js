// Seamless loop configuration + phase-shifted playback helpers.
//
// To loop a chaotic system seamlessly we have to hide the V-frame wrap
// in the displayed trajectory. We do that by:
//
//   1. Pre-recording each attractor's own V-frame trajectory.
//   2. Displaying each attractor with its own phase offset O_i, so the
//      wrap point falls at a *different* recording frame per attractor
//      (its own "loop point" — frame V - O_i in the recording).
//   3. At each frame, the recorded buffer is sliced into the attractor's
//      trail buffer; when the slice spans the V-frame wrap, a few slots
//      at the discontinuity are dimmed to 0 in the shader. The kink
//      enters the trail's head and slides through to the tail as the
//      loop progresses, so the fade "rides along" with the wrap and the
//      rest of the trail keeps playing out at full brightness — see
//      Attractor.lookupTrajectoryFrame + the uKinkCenter handling in
//      makeAttractorMaterial.
//
// Phase offsets are assigned *within* visual groups (same linewidth)
// rather than across all 122 attractors, so as one bright attractor's
// wrap moves through its trail another bright attractor's wrap is on
// the other side of the loop — never two simultaneously.
//
// `staggered = false` is a debug mode: all attractors keep their offset
// O_i = 0, so every wrap stacks on frame 0 (the recording seam) and the
// raw chaos jump is plainly visible.

export const SIZES = [
  { label: 'window',         w: 0,    h: 0    },
  { label: '1:1 1080',       w: 1080, h: 1080 },
  { label: '4:5 1080×1350',  w: 1080, h: 1350 },
  { label: '9:16 1080×1920', w: 1080, h: 1920 },
  { label: '16:9 1920×1080', w: 1920, h: 1080 },
  { label: '16:9 1280×720',  w: 1280, h: 720  },
];

export const loopConfig = {
  preview: false,           // play the loop live in animate()
  staggered: true,          // false = debug (every attractor at offset 0)
  duration: 6,              // seconds, 1..20
  // Half-width (fraction of maxPoints) of the per-vertex kink fade. 0.08
  // dims ~8 % of each trail around the wrap point — small enough that
  // the rest of the trail keeps playing out, large enough to hide the
  // chaotic discontinuity.
  fadeFraction: 0.08,
  // Loop-tied camera motion. Both complete an integer number of cycles
  // over V frames so they return to identity at the seam.
  spin: 0,                  // integer turns around Y over one loop (0..5)
  wobble: 0,                // degrees of X-tilt amplitude (0..45)
  wobbleCycles: 1,          // integer cycles of the wobble sine per loop
  fps: 60,
  sizeIndex: 1,
  // Set to true any time something invalidates the pre-recorded buffers
  // (duration change, panel toggle, etc). main.js's preview tick will
  // re-record before its next frame.
  needsRecord: false,
};

export function durationFrames(cfg = loopConfig) { return Math.round(cfg.duration * cfg.fps); }

// Per-attractor mode. Phase-shifted playback only works cleanly when the
// kink can fully exit the trail within one loop, i.e. when the trail is
// shorter than the V*steps recording. Otherwise the trail would wrap the
// recording every frame and the per-vertex fade would be permanently in
// view — so we record an extra maxPoints of pre-loop history and use a
// whole-attractor fade at the seam instead.
export function loopMode(attractor, V) {
  return attractor.maxPoints <= V * attractor.steps ? 'phaseShift' : 'natural';
}

export function loopStats(attractors, V) {
  let phase = 0, natural = 0;
  for (const a of attractors) {
    if (loopMode(a, V) === 'phaseShift') phase++;
    else natural++;
  }
  return { phase, natural, total: attractors.length };
}

// Assign phase offsets _loopPhase ∈ [0, 1) per attractor, evenly spaced
// within each visual group. Group is keyed by linewidth, which separates
// the bright (4 px) from the grey (1.5 px) attractors in the default
// scene. Same scheme works if the scene later grows more groups.
export function assignLoopPhases(attractors) {
  const groups = new Map();
  for (let i = 0; i < attractors.length; i++) {
    const key = `${attractors[i].material.linewidth}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  for (const indices of groups.values()) {
    const n = indices.length;
    for (let j = 0; j < n; j++) {
      attractors[indices[j]]._loopPhase = n === 1 ? 0 : j / n;
    }
  }
}

// Pre-record V frames of trajectory for every attractor. Each attractor
// picks its mode (phase-shifted vs natural-sim) based on whether its
// trail length fits in V*steps. Restores cleanly to the simulation's
// natural state because recordTrajectory captures by stepping a local
// (x, y, z) and never touches the attractor's own state.
export function recordAll(attractors, V) {
  for (const a of attractors) {
    const mode = loopMode(a, V);
    a._loopMode = mode;
    a.recordTrajectory(V, mode === 'natural' ? a.maxPoints : 0);
    // Kink fade radius is per-attractor (scales with each trail length).
    a.material.userData.kinkRadiusUniform.value =
      Math.max(a.maxPoints * loopConfig.fadeFraction, 5);
  }
}

// Whole-attractor fade for natural-sim attractors. Smoothstep dip
// centred on the seam (frame 0 / V), with half-width naturalFadeFrames.
function naturalFade(f, V) {
  const halfWidth = Math.max(Math.round(V * 0.08), 6);
  const d = f <= V / 2 ? f : V - f;       // distance to the nearest seam
  if (d >= halfWidth) return 1;
  const t = d / halfWidth;
  return t * t * (3 - 2 * t);
}

// Display every attractor's trail at recording frame `f`. Each attractor
// picks the path determined by its loopMode:
//   - phaseShift: trail wraps the V*steps buffer, per-vertex kink fade.
//   - natural:    no phase shift, whole-attractor opacity fade at seam.
// Caller is responsible for having called recordAll() first. After this
// each attractor's flushGeometry() needs to be called before rendering.
export function lookupAll(attractors, f, V, staggered = true) {
  for (const a of attractors) {
    const mode = a._loopMode ?? 'phaseShift';
    if (mode === 'natural') {
      const T = a._recorded?.T ?? V * a.steps;
      const headSub = (f + 1) * a.steps - 1;
      const h = ((headSub % T) + T) % T;
      a.lookupTrajectoryFrame(h);
      a.material.userData.opacityUniform.value = naturalFade(f, V);
    } else {
      const phase = staggered ? (a._loopPhase ?? 0) : 0;
      const T = a._recorded?.T ?? V * a.steps;
      const headSub = Math.round((phase * V + f + 1) * a.steps) - 1;
      const h = ((headSub % T) + T) % T;
      a.lookupTrajectoryFrame(h);
      a.material.userData.opacityUniform.value = 1;
    }
  }
}

export function clearRecordings(attractors) {
  for (const a of attractors) a.clearRecording?.();
}

// Apply loop-tied camera motion to a Three.js group containing the scene
// contents. phase01 is the fraction through the loop [0, 1). With integer
// `spin` and `wobbleCycles`, the rotation returns to identity at the seam.
export function applyLoopRotation(group, phase01) {
  const twoPi = Math.PI * 2;
  group.rotation.y = phase01 * twoPi * Math.round(loopConfig.spin);
  const cycles = Math.max(1, Math.round(loopConfig.wobbleCycles));
  const amp = loopConfig.wobble * Math.PI / 180;
  group.rotation.x = Math.sin(phase01 * twoPi * cycles) * amp;
}

export function resetLoopRotation(group) {
  group.rotation.set(0, 0, 0);
}

// Restore every attractor's per-material opacity to 1. Used when leaving
// preview/recording mode so the live view is unmodulated.
export function resetOpacities(attractors) {
  for (const a of attractors) a.material.userData.opacityUniform.value = 1;
}
