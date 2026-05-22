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

// Search a recorded xyz trajectory for the best candidate loops: pairs
// (t, L) where the position at frame t+L is close to the position at
// frame t (so the trajectory naturally returns to near where it was
// after L frames, starting from t). Returns the top `topN` candidates
// sorted by closure error.
function findLoopCandidates(traj, divisors, totalFrames, minStart, topN) {
  const candidates = [];
  for (const L of divisors) {
    const maxT = totalFrames - L;
    for (let t = minStart; t < maxT; t++) {
      const i0 = t * 3;
      const i1 = (t + L) * 3;
      const dx = traj[i1] - traj[i0];
      const dy = traj[i1 + 1] - traj[i0 + 1];
      const dz = traj[i1 + 2] - traj[i0 + 2];
      const err = dx * dx + dy * dy + dz * dz;
      candidates.push({ t, L, err });
    }
  }
  candidates.sort((a, b) => a.err - b.err);
  return candidates.slice(0, Math.min(topN, candidates.length));
}

// Record a seamlessly-looping WebM.
//
// In `staggered` mode (default) we use a statistical search:
//
//   Pass 0: simulate ~2V frames naturally with no rendering and record
//   each attractor's full xyz trajectory.
//
//   For each attractor: enumerate (start_t, length_L) candidates where L
//   is one of the divisors of V in [minCycleFrames, maxCycleFrames] and
//   start_t >= 300 (to leave buffer history). Each candidate is scored by
//   |trajectory(t+L) - trajectory(t)|^2 — how close the trajectory is to
//   its starting point after L frames. Keep the top ~80 best candidates
//   and pick one uniformly at random. This naturally spreads anchor
//   positions around the butterfly (the top candidates for one attractor
//   are at very different parts of phase space than another's) while
//   keeping the closure error tiny.
//
//   Per-attractor advance: restore each attractor to its pre-recording
//   state, then advance just that attractor by its chosen start_t frames
//   independently so its Pass 1 starting state IS its chosen anchor. No
//   lockstep here — each attractor walks its own number of steps.
//
//   Pass 1: lockstep simulation + recording. Each attractor cycles with
//   its own L_i; at the end of every cycle the simulation's velocity is
//   blended smoothly toward a drift velocity that lands exactly on the
//   anchor (the same chosen-during-Pass-0 xyz). Because the chosen
//   (t, L) puts the natural end VERY close to the anchor, the morph is
//   a tiny correction, not a teleport. Because different attractors
//   chose different t and L, their morph moments are scattered across
//   the video timeline.
//
// In `staggered: false` mode we skip Pass 0 entirely: every attractor
// anchors at its current live xyz, cycle length = V for all, and they
// all morph in the last K frames together. Useful for debugging the
// morph algorithm itself.
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
  topCandidates = 80,
} = {}) {
  if (recordingState.active) return;
  recordingState.active = true;
  recordingState.progress = 0;

  try {
    const V = durationFrames;
    const K = morphFrames;
    const num = attractors.length;
    const divisors = divisorsInRange(V, minCycleFrames, Math.min(maxCycleFrames, V));
    if (!divisors.length) divisors.push(V);

    const initialStates = attractors.map(a => a.saveState());

    let targets = attractors.map(a => ({ x: a.x, y: a.y, z: a.z }));
    let cycleLengths = attractors.map(() => V);

    if (staggered) {
      // Pass 0: simulate forward ~2V frames and capture full trajectories.
      const PASS0 = Math.min(Math.max(2 * V, 1200), 2400);
      const MIN_START = 300; // ensures buffer history is populated at the chosen anchor

      const trajectories = attractors.map(() => new Float32Array(PASS0 * 3));
      for (let i = 0; i < num; i++) {
        trajectories[i][0] = attractors[i].x;
        trajectories[i][1] = attractors[i].y;
        trajectories[i][2] = attractors[i].z;
      }
      for (let frame = 1; frame < PASS0; frame++) {
        for (let i = 0; i < num; i++) {
          attractors[i].step();
          const t = trajectories[i];
          t[frame * 3 + 0] = attractors[i].x;
          t[frame * 3 + 1] = attractors[i].y;
          t[frame * 3 + 2] = attractors[i].z;
        }
      }

      // Per attractor: find the top candidate (t, L) pairs and pick one at
      // random from the top set. Random sampling within the top-N keeps
      // anchor positions distributed across the butterfly.
      const picks = trajectories.map(traj => {
        const top = findLoopCandidates(traj, divisors, PASS0, MIN_START, topCandidates);
        if (!top.length) return { t: 0, L: V, err: 0 };
        return top[Math.floor(Math.random() * top.length)];
      });

      // Rewind everything, then advance each attractor independently to
      // its chosen anchor. They're independent simulations so this is
      // legal — they don't interact through the integrator.
      for (let i = 0; i < num; i++) attractors[i].restoreState(initialStates[i]);
      for (let i = 0; i < num; i++) {
        for (let f = 0; f < picks[i].t; f++) attractors[i].step();
      }

      targets = attractors.map(a => ({ x: a.x, y: a.y, z: a.z }));
      cycleLengths = picks.map(p => p.L);
    }

    // Pass 1: lockstep simulation + capture.
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
      for (let i = 0; i < num; i++) {
        const a = attractors[i];
        const L = cycleLengths[i];
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

      recordingState.progress = (frame + 1) / V;
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
