import {
  timeUniform,
  cameraPosUniform,
} from './material.js';

// Shared state so the panel can show whether a recording is in progress
// and so animate() can skip its own render while we drive it.
export const recordingState = {
  active: false,
  progress: 0,
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function divisorsInRange(N, minL, maxL) {
  const out = [];
  for (let L = minL; L <= maxL; L++) {
    if (N % L === 0) out.push(L);
  }
  return out;
}

// Smoothstep-shaped fade envelope. Inside the first fadeFrames of the
// cycle, alpha ramps 0 -> 1. Inside the last fadeFrames, 1 -> 0. Otherwise
// alpha = 1. `phase` and `L` are in frame units.
function alphaForPhase(phase, L, fadeFrames) {
  const ph = ((phase % L) + L) % L;
  let a;
  if (ph < fadeFrames) a = ph / fadeFrames;
  else if (ph >= L - fadeFrames) a = (L - ph) / fadeFrames;
  else return 1;
  // smoothstep
  return a * a * (3 - 2 * a);
}

// Record a looping WebM.
//
// In `staggered` mode (default):
//   - Pass 0: simulate V frames naturally with no rendering, capturing each
//     attractor's full xyz trajectory. This is the "working out the paths
//     ahead of time" the loop relies on — it lets us pick fade schedules
//     that put each attractor's invisible phase over the video seam if we
//     want, and lets us measure how far the live state has drifted by
//     frame V (so we know which attractors most need to be hidden there).
//   - Per attractor: pick a cycle length L_i from divisors of V in
//     [120, 360] and a random phase offset O_i in [0, L_i). Because L_i
//     divides V, alpha(0) === alpha(V) for every attractor — the loop
//     boundary is a no-op in alpha space. Per-attractor offsets stagger
//     the fade moments across the video so at any single frame only a
//     handful of attractors are in their fade window; "one disappears, a
//     different one reappears" rather than all fading together.
//   - Pass 1: rewind to the live state and re-simulate (this time with
//     MediaRecorder capturing). Each frame, before flush, set every
//     attractor's per-material uOpacity uniform from its alphaForPhase.
//     The Lorenz integration is unchanged — no morphing, no teleporting.
//     The xyz at frame V differs from frame 0 (chaos), but attractors
//     near a fade trough at the seam are at low alpha so their position
//     jump is invisible.
//
// In `staggered: false` mode every attractor stays at alpha = 1 throughout
// the recording. The video has a hard cut at the seam but the dynamics
// inside the loop are unmodified — useful as a debugging baseline.
//
// (The previous force-the-trajectory-into-a-closed-loop algorithm is kept
// commented at the bottom of this file for reference.)
export async function recordLoop({
  renderer,
  scene,
  camera,
  attractors,
  durationFrames = 600,
  fadeFrames = 30,
  fps = 60,
  staggered = true,
  minCycleFrames = 120,
  maxCycleFrames = 360,
} = {}) {
  if (recordingState.active) return;
  recordingState.active = true;
  recordingState.progress = 0;

  try {
    const V = durationFrames;
    const K = fadeFrames;
    const num = attractors.length;

    const initialStates = attractors.map(a => a.saveState());

    // Pass 0: simulate V frames naturally, recording xyz per attractor per
    // frame. We don't strictly need the full trajectory for the simple
    // fade-only loop, but having it on hand lets the fade scheduling be
    // path-aware (see TODOs below).
    const trajectories = staggered
      ? attractors.map(() => new Float32Array(V * 3))
      : null;
    if (staggered) {
      for (let i = 0; i < num; i++) {
        trajectories[i][0] = attractors[i].x;
        trajectories[i][1] = attractors[i].y;
        trajectories[i][2] = attractors[i].z;
      }
      for (let frame = 1; frame < V; frame++) {
        for (let i = 0; i < num; i++) {
          attractors[i].step();
          const t = trajectories[i];
          t[frame * 3 + 0] = attractors[i].x;
          t[frame * 3 + 1] = attractors[i].y;
          t[frame * 3 + 2] = attractors[i].z;
        }
      }
      // Rewind so Pass 1 runs the same deterministic simulation again,
      // this time captured to video.
      for (let i = 0; i < num; i++) attractors[i].restoreState(initialStates[i]);
    }

    // Per-attractor fade schedule.
    const divisors = divisorsInRange(V, minCycleFrames, Math.min(maxCycleFrames, V));
    if (!divisors.length) divisors.push(V);
    const cycles = attractors.map((_, i) => {
      if (!staggered) return null; // no fading
      // Spread L choices across the divisor set so we get cycle-length variety.
      const L = divisors[i % divisors.length];
      // Random phase offset so different attractors fade at different times.
      // TODO (path-aware fade scheduling): bias O_i so attractors whose
      // trajectory[i] at V differs most from trajectory[i] at 0 get O_i
      // close to 0 (their trough lands on the video seam, so their seam
      // jump is invisible). Right now O_i is purely random.
      const O = Math.floor(Math.random() * L);
      return { L, O };
    });

    // Pass 1: lockstep simulate + capture.
    const stream = renderer.domElement.captureStream(fps);
    const chunks = [];
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();

    for (let frame = 0; frame < V; frame++) {
      for (let i = 0; i < num; i++) attractors[i].step();

      // Set per-attractor alpha.
      for (let i = 0; i < num; i++) {
        const cycle = cycles[i];
        const alpha = cycle
          ? alphaForPhase(frame + cycle.O, cycle.L, K)
          : 1;
        attractors[i].material.userData.opacityUniform.value = alpha;
      }

      for (let i = 0; i < num; i++) attractors[i].flushGeometry();
      timeUniform.value = performance.now() / 1000;
      cameraPosUniform.value.copy(camera.position);
      renderer.render(scene, camera);

      recordingState.progress = (frame + 1) / V;
      await new Promise(r => requestAnimationFrame(r));
    }

    // Reset opacities for normal viewing after the recording is done.
    for (let i = 0; i < num; i++) {
      attractors[i].material.userData.opacityUniform.value = 1;
    }

    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: mimeType });
    downloadBlob(blob, `lorenz-loop-${Date.now()}.webm`);
  } finally {
    recordingState.active = false;
    recordingState.progress = 0;
  }
}

// =============================================================================
// Earlier approach: force each attractor's trajectory into a closed loop by
// picking a cycle length L_i (divisor of V) that minimises closure error and
// applying a velocity-blended drift back to the anchor at end of every cycle.
//
// The closure was always small at the anchor but on every full orbit the
// drift correction visibly bent the trail away from the natural chaos
// trajectory — a small but persistent "seam cut across" all the way through
// the recording. Replaced with the fade-based scheme above; preserved here
// in case the path data + the morph idea is useful again later.
//
// (See git history at fb4245d / 9abd1ba / 44c3595 for the full implementation
// and intermediate iterations.)
// =============================================================================
