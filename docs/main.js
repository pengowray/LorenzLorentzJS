import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Attractor } from './Attractor.js';
import { MIN_LORENZ, MAX_LORENZ } from './lorenz.js';
import { RAW_STATES, applyState, defaultState } from './cameraStates.js';
import {
  bedhairUniform,
  squiggleStrengthUniform,
  squiggleCountUniform,
  doodleUniform,
  stripeStrengthUniform,
  beamUniform,
  delayUniform,
  cameraPosUniform,
  cNormUniform,
  maxSegLenUniform,
  timeUniform,
} from './material.js';
import { setupPanel } from './panel.js';
import { recordLoop, recordingState } from './recorder.js';
import {
  SIZES,
  loopConfig,
  durationFrames,
  assignLoopPhases,
  recordAll,
  lookupAll,
  clearRecordings,
  resetOpacities,
  applyLoopRotation,
  resetLoopRotation,
} from './loop.js';
import { lorenzParams, LORENZ_DEFAULTS } from './lorenz.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
const DEFAULT_PIXEL_RATIO = Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(DEFAULT_PIXEL_RATIO);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// All loop-affected scene contents live in this group so spin/wobble can
// rotate them as a unit without disturbing the camera or OrbitControls.
const sceneGroup = new THREE.Group();
scene.add(sceneGroup);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
// Stop the user from scrolling so far they leave the camera frustum and
// see nothing. Bounds are loose enough for normal interaction.
controls.minDistance = 8;
controls.maxDistance = 2000;
defaultState(camera, controls);

// Bounds wireframe (toggle with 'b')
const boundsBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(
    MAX_LORENZ.x - MIN_LORENZ.x,
    MAX_LORENZ.y - MIN_LORENZ.y,
    MAX_LORENZ.z - MIN_LORENZ.z,
  )),
  new THREE.LineBasicMaterial({ color: 0x222244 })
);
boundsBox.position.set(
  (MAX_LORENZ.x + MIN_LORENZ.x) / 2,
  (MAX_LORENZ.y + MIN_LORENZ.y) / 2,
  (MAX_LORENZ.z + MIN_LORENZ.z) / 2,
);
boundsBox.visible = false;
sceneGroup.add(boundsBox);

// Build attractors. Default scene mirrors the original 1+120+1 sketch
// but everything (count, colour scheme, trail-length range) is now
// regenerable from sceneConfig via regenerateScene().
const attractors = [];
const DT = 0.0003;

const COLOR_SCHEMES = [
  { label: 'mono', getColor: (_i, _n, bright) => {
      if (bright) return { r: 1, g: 1, b: 1 };
      const s = (30 + Math.random() * 150) / 255;
      return { r: s, g: s, b: s + Math.random() * 10 / 255 };
  } },
  { label: 'rainbow', getColor: (i, n, bright) => {
      if (bright) return { r: 1, g: 1, b: 1 };
      return hsvToRgb(((i / Math.max(1, n - 1)) + Math.random() * 0.05) % 1, 0.7, 0.55);
  } },
  { label: 'ocean', getColor: (_i, _n, bright) => {
      if (bright) return { r: 0.9, g: 1, b: 1 };
      return hsvToRgb(0.5 + Math.random() * 0.15, 0.55 + Math.random() * 0.35, 0.45 + Math.random() * 0.35);
  } },
  { label: 'fire', getColor: (_i, _n, bright) => {
      if (bright) return { r: 1, g: 1, b: 0.9 };
      return hsvToRgb(0.02 + Math.random() * 0.1, 0.6 + Math.random() * 0.35, 0.5 + Math.random() * 0.4);
  } },
  { label: 'neon', getColor: (i, _n, bright) => {
      if (bright) return { r: 1, g: 1, b: 1 };
      const hues = [0.83, 0.55, 0.33];
      return hsvToRgb(hues[i % hues.length], 0.85, 0.6 + Math.random() * 0.3);
  } },
];

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return { r: v, g: t, b: p };
    case 1: return { r: q, g: v, b: p };
    case 2: return { r: p, g: v, b: t };
    case 3: return { r: p, g: q, b: v };
    case 4: return { r: t, g: p, b: v };
    default: return { r: v, g: p, b: q };
  }
}

const sceneConfig = {
  numAttractors: 122,
  trailMin: 50,
  trailMax: 1250,
  colorScheme: 0,
};
const SCENE_DEFAULTS = { ...sceneConfig };

function addAttractor(opts) {
  const a = new Attractor(opts);
  attractors.push(a);
  sceneGroup.add(a.line);
  return a;
}

// Tear down the existing attractors and rebuild them from sceneConfig.
// Called on slider commit (release) so dragging doesn't thrash.
function regenerateScene() {
  for (const a of attractors) {
    sceneGroup.remove(a.line);
    a.dispose();
  }
  attractors.length = 0;

  const N = Math.max(2, Math.round(sceneConfig.numAttractors));
  const scheme = COLOR_SCHEMES[sceneConfig.colorScheme] ?? COLOR_SCHEMES[0];
  const trailMin = Math.max(10, sceneConfig.trailMin);
  const trailMax = Math.max(trailMin, sceneConfig.trailMax);
  const trailRange = trailMax - trailMin;

  addAttractor({
    dt: DT, steps: 37, maxPoints: 10000,
    color: scheme.getColor(0, N, true),
    stripePeriod: 2, linewidth: 4,
  });
  const greyCount = N - 2;
  for (let i = 0; i < greyCount; i++) {
    addAttractor({
      dt: DT,
      steps: 35 + Math.floor(Math.random() * 5),
      maxPoints: trailMin + Math.floor(Math.random() * (trailRange + 1)),
      color: scheme.getColor(i + 1, N, false),
      stripePeriod: (i % 15) + 2,
      linewidth: 1.5,
    });
  }
  addAttractor({
    dt: DT, steps: 37, maxPoints: 10000,
    color: scheme.getColor(N - 1, N, true),
    stripePeriod: 2, linewidth: 4,
  });

  // Only pre-warm if the user has the seamless loop preview running —
  // recording from a stale post-pre-warm snapshot needs full trails on
  // frame 0. In live mode, skip the pre-warm and let the trails grow
  // organically: attractors visibly bloom out from their seed point
  // instead of the page hitching for 100 ms.
  if (loopConfig.preview) {
    for (let i = 0; i < PREWARM_ITERATIONS; i++) {
      for (const a of attractors) a.step();
    }
  }
  for (const a of attractors) a.flushGeometry();
  updateResolutions();
  assignLoopPhases(attractors);
  loopConfig.needsRecord = true;
  clearRecordings(attractors);
}

addAttractor({ dt: DT, steps: 37, maxPoints: 10000, color: { r: 1, g: 1, b: 1 }, stripePeriod: 2, linewidth: 4 });
for (let i = 0; i < 120; i++) {
  const shade = (30 + Math.random() * 150) / 255;
  addAttractor({
    dt: DT,
    steps: 35 + Math.floor(Math.random() * 5),
    maxPoints: 50 + Math.floor(Math.random() * 1200),
    color: { r: shade, g: shade, b: shade + Math.random() * 10 / 255 },
    stripePeriod: (i % 15) + 2, // matches the original's (attCount % 15) + 2
    linewidth: 1.5,
  });
}
addAttractor({ dt: DT, steps: 37, maxPoints: 10000, color: { r: 1, g: 1, b: 1 }, stripePeriod: 2, linewidth: 4 });

// LineMaterial needs the screen resolution to compute pixel-accurate line
// width. Update on init and on every resize.
function updateResolutions() {
  const sz = renderer.getSize(new THREE.Vector2());
  for (const a of attractors) a.material.resolution.set(sz.x, sz.y);
}
updateResolutions();

// When a non-window size is picked we resize the canvas to that aspect
// (and exact pixel dimensions, so captureStream produces a video at that
// resolution), then scale the canvas down via CSS to fit the window with
// a 1px outline acting as the "border just outside the recording area".
function applyLoopSize() {
  const sz = SIZES[loopConfig.sizeIndex] ?? SIZES[0];
  const canvas = renderer.domElement;
  if (!sz.w) {
    renderer.setPixelRatio(DEFAULT_PIXEL_RATIO);
    renderer.setSize(window.innerWidth, window.innerHeight);
    canvas.style.position = '';
    canvas.style.left = '';
    canvas.style.top = '';
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.style.outline = '';
    camera.aspect = window.innerWidth / window.innerHeight;
  } else {
    renderer.setPixelRatio(1);
    renderer.setSize(sz.w, sz.h, false);
    const margin = 28;
    const maxW = window.innerWidth - margin;
    const maxH = window.innerHeight - margin;
    const scale = Math.min(maxW / sz.w, maxH / sz.h, 1);
    const dispW = sz.w * scale;
    const dispH = sz.h * scale;
    canvas.style.position = 'fixed';
    canvas.style.left = `${Math.round((window.innerWidth - dispW) / 2)}px`;
    canvas.style.top = `${Math.round((window.innerHeight - dispH) / 2)}px`;
    canvas.style.width = `${dispW}px`;
    canvas.style.height = `${dispH}px`;
    canvas.style.outline = '1px solid #555';
    camera.aspect = sz.w / sz.h;
  }
  camera.updateProjectionMatrix();
  updateResolutions();
}

// Pre-warm the trails. Two purposes:
//   1. Fill the 10000-point trail buffer (~270 iterations).
//   2. Let the 120 grey attractors diverge from the bright ones. They all
//      start within seedJitter=0.01 of each other, and the Lorenz Lyapunov
//      exponent (~0.9) doubles separation every ~1 simulated second. Going
//      to ~13 simulated seconds (~1170 iterations) gives a separation of
//      ~80 units, enough that each grey traces its own visibly distinct
//      path and they form the wash that surrounds the bright butterfly.
const PREWARM_ITERATIONS = 1200;
for (let i = 0; i < PREWARM_ITERATIONS; i++) {
  for (const a of attractors) a.step();
}
for (const a of attractors) a.flushGeometry();

// Phase offsets are assigned by linewidth-group so the wrap point ripple
// stays balanced within each visual size: bright attractors cycle their
// wraps against each other, grey attractors cycle against theirs.
assignLoopPhases(attractors);

// State
const flags = {
  paused: false,
  fadeOn: true,
  velColor: false,
  speedup: false,
  bedhair: false,
  beam: false,
  delay: false,
  squiggle: false,
  doodle: false,
  stripes: false,
  followOne: false,
};

function downloadPng() {
  // Force a fresh render so the backbuffer has current content before toBlob
  // (we don't keep preserveDrawingBuffer on because it tanks WebGL perf).
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lorenz-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function setAll(method, value) { for (const a of attractors) a[method](value); }

// Centralised toggle/action table — keyboard handler and control panel both
// dispatch through here so they always agree.
const ACTIONS = {
  ' ':  () => { flags.paused = !flags.paused; },
  'r':  () => { for (const a of attractors) a.reset(); },
  'f':  () => { flags.fadeOn = !flags.fadeOn; setAll('setFade', flags.fadeOn); },
  'v':  () => { flags.velColor = !flags.velColor; setAll('setVelColor', flags.velColor); },
  'n':  () => { flags.speedup = !flags.speedup; setAll('setSpeedup', flags.speedup); },
  '.':  () => { flags.bedhair = !flags.bedhair; bedhairUniform.value = flags.bedhair ? 1.0 : 0.0; },
  ';':  () => { flags.beam = !flags.beam; beamUniform.value = flags.beam ? 1.0 : 0.0; },
  "'":  () => { flags.delay = !flags.delay; delayUniform.value = flags.delay ? 1.0 : 0.0; },
  'x':  () => {
    flags.squiggle = !flags.squiggle;
    squiggleStrengthUniform.value = flags.squiggle ? 1.0 : 0.0;
    if (flags.squiggle) squiggleCountUniform.value = 1 + Math.floor(Math.random() * 1000);
  },
  'm':  () => { flags.doodle = !flags.doodle; doodleUniform.value = flags.doodle ? 1.0 : 0.0; },
  ',':  () => { flags.stripes = !flags.stripes; stripeStrengthUniform.value = flags.stripes ? 1.0 : 0.0; },
  'q':  () => { flags.followOne = !flags.followOne; },
  'g':  () => downloadPng(),
  'R':  () => recordLoop({ renderer, scene, camera, attractors, sceneGroup }),
  'S':  () => { loopConfig.staggered = !loopConfig.staggered; },
  'L':  () => {
    loopConfig.preview = !loopConfig.preview;
    if (loopConfig.preview) {
      // Re-record on entry so the loop starts from wherever the live
      // simulation currently is, rather than a stale snapshot.
      loopConfig.needsRecord = true;
    } else {
      // Drop the kink fade and the recorded buffers so live evolution
      // looks normal again.
      for (const a of attractors) a._setKinkInactive?.();
      clearRecordings(attractors);
      resetOpacities(attractors);
    }
  },
  'b':  () => { boundsBox.visible = !boundsBox.visible; },
  '0':  () => defaultState(camera, controls),
};
// Camera presets 1..9
for (const k of '123456789') ACTIONS[k] = () => RAW_STATES[k] && applyState(camera, controls, RAW_STATES[k]);

window.addEventListener('keydown', (e) => {
  const handler = ACTIONS[e.key];
  if (!handler) return;
  if (e.key === ' ') e.preventDefault();
  handler();
});

// Wire up the control panel (uses the same ACTIONS table).
setupPanel({
  actions: ACTIONS,
  isOn: (flag) => {
    if (flag === 'boundsBox') return boundsBox.visible;
    if (flag === 'recording') return recordingState.active;
    if (flag === 'staggered') return loopConfig.staggered;
    if (flag === 'loopPreview') return loopConfig.preview;
    return flags[flag];
  },
  canvas: renderer.domElement,
  knobs: {
    delay: { label: 'c',     uniform: cNormUniform,    min: 0.05, max: 1.0, step: 0.01 },
    beam:  { label: 'v_max', uniform: maxSegLenUniform, min: 0.05, max: 0.5, step: 0.005 },
  },
  loop: {
    sizes: SIZES,
    config: loopConfig,
    attractors,
    onSizeChange: applyLoopSize,
    // The panel sliders mutate loopConfig.duration / fadeFraction
    // directly; flag the pre-record as stale so the next preview tick
    // re-records.
    onConfigChange: () => { loopConfig.needsRecord = true; },
  },
  scene: {
    config: sceneConfig,
    defaults: SCENE_DEFAULTS,
    colorSchemes: COLOR_SCHEMES,
    // Heavy: rebuilds + 1200-step pre-warm for every attractor. Only
    // called on slider release / scheme cycle so dragging is cheap.
    onRebuild: regenerateScene,
  },
});

window.addEventListener('resize', () => {
  // In framed mode the canvas resolution is locked to the chosen size;
  // a window resize just needs to recompute the CSS scale/position.
  if (SIZES[loopConfig.sizeIndex]?.w) {
    applyLoopSize();
  } else {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    updateResolutions();
  }
});

function animate() {
  requestAnimationFrame(animate);
  // While a recording is in progress, recordLoop() drives the simulation
  // and rendering itself; we just keep the camera controls live.
  if (recordingState.active) { controls.update(); return; }

  if (loopConfig.preview) {
    const V = durationFrames();
    // Pre-record (or re-record after a config change) so playback has a
    // valid V-frame buffer for every attractor.
    if (loopConfig.needsRecord || !attractors[0].hasRecording?.()
        || attractors[0]._recorded?.V !== V) {
      recordAll(attractors, V);
      loopConfig.needsRecord = false;
    }
    // Tie the preview phase to wall-clock seconds so monitors with
    // different refresh rates all play the same-speed loop.
    const phaseFrame = Math.floor(performance.now() / 1000 * loopConfig.fps) % V;
    lookupAll(attractors, phaseFrame, V, loopConfig.staggered);
    for (const a of attractors) a.flushGeometry();
    applyLoopRotation(sceneGroup, phaseFrame / V);
  } else if (!flags.paused) {
    for (const a of attractors) a.evolve();
    resetLoopRotation(sceneGroup);
  } else {
    resetLoopRotation(sceneGroup);
  }
  if (flags.followOne) {
    const a = attractors[0];
    controls.target.set(a.x, a.y, a.z);
  }
  timeUniform.value = performance.now() / 1000;
  cameraPosUniform.value.copy(camera.position);
  controls.update();
  renderer.render(scene, camera);
}

// Apply the initial loop size (defaults to "window", so this is a no-op
// but keeps the canvas styling path consistent if defaults change).
applyLoopSize();
animate();

// Exposed for smoke tests.
window._app = {
  renderer, scene, camera, controls, attractors, flags,
  beamUniform, bedhairUniform, delayUniform,
  loopConfig,
  recordingState,
  recordLoop: (opts) => recordLoop({ renderer, scene, camera, attractors, sceneGroup, ...opts }),
  applyLoopSize,
  getState() {
    const a0 = attractors[0];
    return {
      frame: renderer.info.render.frame,
      attractorCount: attractors.length,
      attractor0DrawCount: a0.drawCount,
      attractor0Position: [a0.x, a0.y, a0.z],
      attractor0Timescale: a0.timescale,
      ...flags,
      staggered: loopConfig.staggered,
      loopPreview: loopConfig.preview,
    };
  },
};
