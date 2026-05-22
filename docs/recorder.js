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

// Divisors of N in [minL, maxL]. We constrain candidate cycle lengths to
// divisors of the video length so that, no matter which L_i an attractor
// picks, V is always a whole-number multiple of L_i — meaning the
// attractor returns to its anchor exactly at video frame V, and the WebM
// loops without a jump at its own loop boundary.
function divisorsInRange(N, minL, maxL) {
  const out = [];
  for (let L = minL; L <= maxL; L++) {
    if (N % L === 0) out.push(L);
  }
  return out;
}

// For each attractor pick the cycle length L from `candidates` whose end
// state most closely matches the start state. With Lorenz chaos this is
// usually noticeably better at some L than at others; the morph at the
// end of each cycle then only has to close a small residual gap rather
// than teleport through phase space.
function pickCycleLength(traj, candidates) {
  const x0 = traj[0], y0 = traj[1], z0 = traj[2];
  let bestL = candidates[candidates.length - 1];
  let bestErr = Infinity;
  for (const L of candidates) {
    const dx = traj[L * 3 + 0] - x0;
    const dy = traj[L * 3 + 1] - y0;
    const dz = traj[L * 3 + 2] - z0;
    const err = dx * dx + dy * dy + dz * dz;
    if (err < bestErr) { bestErr = err; bestL = L; }
  }
  return bestL;
}

// Record a seamlessly-looping WebM.
//
// Algorithm (two-pass, `staggered` mode):
//
//   Pass 0: simulate from the live state for `durationFrames` (V) frames
//   with no rendering. Capture each attractor's full (x, y, z) trajectory
//   so we can pick its individual cycle length.
//
//   For each attractor: pick a cycle length L_i from the divisors of V in
//   [minCycleFrames, maxCycleFrames]. Among those, the one that minimises
//   |trajectory(L_i) - trajectory(0)|^2 — i.e., the period that lets this
//   particular attractor's chaotic trajectory close most cleanly. Because
//   each L_i divides V, the attractor returns to its anchor exactly at
//   frame V and the video itself also loops.
//
//   Pass 1: rewind and re-simulate, this time recording. Each attractor
//   cycles with its own L_i. At the end of every cycle (last K frames)
//   the simulation's velocity is smoothly blended toward a "drift"
//   velocity that converges exactly to the anchor by the cycle's last
//   substep. Because the chaotic L_i already brings us close to the
//   anchor naturally, the morph is a tiny nudge, not a teleport — and
//   because different attractors have different L_i, their morph
//   moments are distributed across the video timeline rather than
//   bunched at the end.
//
// In `staggered: false` mode every L_i = V (a single end-of-video morph
// for everyone). Use it for debugging — it makes the morph artifact
// concentrated and easy to see.
export async function recordLoop({
  renderer,
  scene,
  camera,
  attractors,
  durationFrames = 600,
  morphFrames = 90,
  fps = 60,
  staggered = true,
  minCycleFrames = 60,
  maxCycleFrames = 300,
} = {}) {
  if (recordingState.active) return;
  recordingState.active = true;
  recordingState.progress = 0;

  try {
    const N = durationFrames;
    const K = morphFrames;
    const num = attractors.length;

    // Save state so Pass 0 can be rewound for Pass 1.
    const initialStates = attractors.map(a => a.saveState());

    // Pass 0: capture each attractor's full xyz trajectory.
    const trajectories = attractors.map(() => new Float32Array(N * 3));
    for (let i = 0; i < num; i++) {
      const a = attractors[i];
      trajectories[i][0] = a.x;
      trajectories[i][1] = a.y;
      trajectories[i][2] = a.z;
    }
    for (let frame = 1; frame < N; frame++) {
      for (let i = 0; i < num; i++) {
        attractors[i].step();
        const t = trajectories[i];
        t[frame * 3 + 0] = attractors[i].x;
        t[frame * 3 + 1] = attractors[i].y;
        t[frame * 3 + 2] = attractors[i].z;
      }
    }

    // Pick per-attractor cycle lengths and anchor targets.
    const allCandidates = divisorsInRange(N, minCycleFrames, Math.min(maxCycleFrames, N));
    const candidates = allCandidates.length ? allCandidates : [N];
    const cycleLengths = attractors.map((_, i) =>
      staggered ? pickCycleLength(trajectories[i], candidates) : N,
    );
    const targets = trajectories.map(t => ({ x: t[0], y: t[1], z: t[2] }));

    // Rewind for Pass 1.
    for (let i = 0; i < num; i++) attractors[i].restoreState(initialStates[i]);

    // Pass 1: record.
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

    for (let frame = 0; frame < N; frame++) {
      for (let i = 0; i < num; i++) {
        const a = attractors[i];
        const L = cycleLengths[i];
        // Clamp the morph window to half the cycle so very short cycles
        // (e.g., debug runs with tiny N) still leave room for natural
        // simulation before the morph.
        const K_local = Math.min(K, Math.floor(L / 2));
        const phase = frame % L;
        const morphStart = L - K_local;
        if (phase >= morphStart) {
          const j = phase - morphStart;
          a.step({ target: targets[i], progress: j / K_local, framesTotal: K_local });
        } else {
          a.step();
        }
      }

      for (let i = 0; i < num; i++) attractors[i].flushGeometry();
      timeUniform.value = performance.now() / 1000;
      cameraPosUniform.value.copy(camera.position);
      renderer.render(scene, camera);

      recordingState.progress = (frame + 1) / N;
      await new Promise(r => requestAnimationFrame(r));
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
