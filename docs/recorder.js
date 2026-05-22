import {
  timeUniform,
  cameraPosUniform,
} from './material.js';

// Shared state so the panel can show whether a recording is in progress
// and so animate() can skip its own render while we drive it.
export const recordingState = {
  active: false,
  progress: 0,  // 0..1 during recording, for the panel indicator
};

const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

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

// Record a seamlessly-looping WebM video by:
//
//   1. Snapshotting each attractor's (x, y, z) state at the start.
//   2. Running the simulation for `durationFrames` frames in lock-step with
//      requestAnimationFrame so MediaRecorder samples the canvas exactly once
//      per produced frame.
//   3. In the last `morphFrames` of the recording, smoothly blending each
//      attractor's xyz back to its snapshot (via a smoothstep curve). At the
//      end of recording the simulation state matches the start, so when the
//      video file loops, the join is continuous in xyz space.
//
// The trail buffer also returns to a near-matching state automatically because
// each step pushes ~37 points and the buffer holds 10000 (~270 frames worth);
// the morph smooths the difference. For a still-more-seamless loop, we'd
// stagger per-attractor morph windows around the video timeline so no single
// moment shows all morphing at once (TODO).
export async function recordLoop({
  renderer,
  scene,
  camera,
  attractors,
  durationFrames = 600,
  morphFrames = 90,
  fps = 60,
} = {}) {
  if (recordingState.active) return;
  recordingState.active = true;
  recordingState.progress = 0;

  try {
    const snapshots = attractors.map(a => ({ x: a.x, y: a.y, z: a.z }));

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

    const morphStart = durationFrames - morphFrames;
    for (let frame = 0; frame < durationFrames; frame++) {
      for (const a of attractors) a.step();

      if (frame >= morphStart) {
        const t = (frame - morphStart) / morphFrames;
        const k = smoothstep(t);
        for (let i = 0; i < attractors.length; i++) {
          const a = attractors[i];
          const s = snapshots[i];
          a.x = lerp(a.x, s.x, k);
          a.y = lerp(a.y, s.y, k);
          a.z = lerp(a.z, s.z, k);
        }
      }

      for (const a of attractors) a.flushGeometry();
      timeUniform.value = performance.now() / 1000;
      cameraPosUniform.value.copy(camera.position);
      renderer.render(scene, camera);

      recordingState.progress = (frame + 1) / durationFrames;
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
