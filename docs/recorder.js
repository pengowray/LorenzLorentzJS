import {
  timeUniform,
  cameraPosUniform,
} from './material.js';
import {
  loopConfig,
  durationFrames,
  recordAll,
  lookupAll,
  resetOpacities,
  applyLoopRotation,
  resetLoopRotation,
} from './loop.js';

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

// Record a seamless looping WebM.
//
// Two phases:
//   1. Pre-record V frames of each attractor's trajectory from its
//      current state (Attractor.recordTrajectory).
//   2. For each recording frame f in [0, V), display every attractor at
//      its own phase-shifted slice of that pre-record (lookupAll). The
//      per-vertex kink fade (uKinkCenter, see material.js) hides the
//      wrap discontinuity wherever it sits in each attractor's trail.
//
// `staggered: false` is the debug path: every attractor keeps phase 0 so
// all wraps stack on the recording seam and the raw jump is visible.
//
// Per-call overrides exist for tests; defaults come from loopConfig.
export async function recordLoop({
  renderer,
  scene,
  camera,
  attractors,
  sceneGroup,
  durationFrames: durOverride,
  fps,
  staggered,
} = {}) {
  if (recordingState.active) return;
  recordingState.active = true;
  recordingState.progress = 0;
  resetOpacities(attractors);

  try {
    const V = durOverride  ?? durationFrames();
    const captureFps = fps ?? loopConfig.fps;
    const stagger = staggered ?? loopConfig.staggered;

    // Phase 1: pre-record. Live simulation state is left alone, so the
    // page returns to normal once the recording finishes.
    recordAll(attractors, V);

    const stream = renderer.domElement.captureStream(captureFps);
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

    // Phase 2: play back V frames, applying each attractor's phase shift.
    for (let frame = 0; frame < V; frame++) {
      lookupAll(attractors, frame, V, stagger);
      for (let i = 0; i < attractors.length; i++) attractors[i].flushGeometry();
      if (sceneGroup) applyLoopRotation(sceneGroup, frame / V);
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
    // Clear kink uniforms + scene rotation so the post-recording live
    // view is clean.
    for (const a of attractors) a._setKinkInactive?.();
    if (sceneGroup) resetLoopRotation(sceneGroup);
    recordingState.active = false;
    recordingState.progress = 0;
  }
}
