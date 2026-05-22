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

// Smoothstep-shaped fade envelope. Phase 0 (and phase L) is the trough
// (alpha=0); alpha rises to 1 over the first `fadeFrames`, stays at 1 in
// the middle, and falls back to 0 over the last `fadeFrames`.
function alphaForPhase(phase, L, fadeFrames) {
  const ph = ((phase % L) + L) % L;
  let a;
  if (ph < fadeFrames) a = ph / fadeFrames;
  else if (ph >= L - fadeFrames) a = (L - ph) / fadeFrames;
  else return 1;
  return a * a * (3 - 2 * a);
}

// Record a TRULY seamless looping WebM.
//
// Geometric reality of looping a chaotic system: if an attractor is at any
// non-trivial alpha at the seam (the boundary between frame V-1 and frame 0
// on playback), its xyz at frame V-1 will be visibly different from its
// xyz at frame 0 (the chaotic divergence over V frames is much larger than
// the attractor size). To avoid that jump we have exactly one option
// without forcing closure: make sure every attractor is at alpha = 0 at
// the seam.
//
// In `staggered` mode (default):
//   - Every attractor gets phase offset O_i = 0, so its alpha trough lands
//     on frame 0 (which is the same frame as V — the loop boundary).
//   - Cycle length L_i is varied across attractors (drawn round-robin from
//     the divisors of V in [minCycleFrames, maxCycleFrames]).
//   - Within the video, secondary troughs at L_i, 2L_i, ..., (V/L_i - 1)*L_i
//     fall at different frames for attractors with different L_i. That gives
//     the "one fades, another reappears" feel through the middle of the loop.
//   - The seam itself is a brief "everything is at trough" moment. The fade
//     window is `fadeFrames` long on each side of the seam, so the fully-
//     dark moment is brief and the in/out are smooth.
//
// In `staggered: false` mode no fading happens at all — every attractor
// stays at full opacity. Useful as a debug baseline that shows the raw
// hard-cut seam.
//
// (Earlier loop-forcing morph algorithms — which tried to keep the seam
// looking "full" by warping the chaotic trajectory back to its starting
// state — are preserved in git history at fb4245d / 9abd1ba / 44c3595.)
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

    // Schedule a cycle length per attractor. All offsets are zero so all
    // alpha troughs land on frame 0 (= the loop seam).
    let cycles = attractors.map(() => null);
    if (staggered) {
      const divisors = divisorsInRange(V, minCycleFrames, Math.min(maxCycleFrames, V));
      if (!divisors.length) divisors.push(V);
      // Round-robin so attractors get a mix of cycle lengths.
      cycles = attractors.map((_, i) => ({ L: divisors[i % divisors.length] }));
    }

    // MediaRecorder setup.
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

    // Record V frames. Simulation runs lockstep; per-attractor opacity
    // follows its alpha cycle.
    for (let frame = 0; frame < V; frame++) {
      for (let i = 0; i < num; i++) attractors[i].step();

      for (let i = 0; i < num; i++) {
        const cycle = cycles[i];
        const alpha = cycle ? alphaForPhase(frame, cycle.L, K) : 1;
        attractors[i].material.userData.opacityUniform.value = alpha;
      }

      for (let i = 0; i < num; i++) attractors[i].flushGeometry();
      timeUniform.value = performance.now() / 1000;
      cameraPosUniform.value.copy(camera.position);
      renderer.render(scene, camera);

      recordingState.progress = (frame + 1) / V;
      await new Promise(r => requestAnimationFrame(r));
    }

    // Restore opacities for normal viewing after recording.
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
// Earlier loop-forcing iterations are preserved in git history:
//
//   fb4245d  per-attractor cycle length + drift-blended velocity morph
//   9abd1ba  per-attractor cycle search + drift-blended morph
//   44c3595  statistical (t, L) search across whole trajectories + morph
//   d3eb396  random-phase fade-in/fade-out (alpha cycles, no path data)
//   (previous commit) path-aware natural-closure fade schedule
//
// All of those tried to keep "everything at full alpha at the seam" by
// either forcing the chaotic trajectory closed (cuts) or by picking fade
// phases (still visibly mismatched at the seam). The current version
// accepts the geometric constraint and aligns every trough on the seam.
// =============================================================================
