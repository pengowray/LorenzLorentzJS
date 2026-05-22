import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Attractor } from './Attractor.js';
import { MIN_LORENZ, MAX_LORENZ } from './lorenz.js';
import { RAW_STATES, applyState, defaultState } from './cameraStates.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
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
scene.add(boundsBox);

// Build attractors. Mirrors the original setup: 1 bright + 120 grey + 1 bright.
const attractors = [];
const DT = 0.0003;

function addAttractor(opts) {
  const a = new Attractor(opts);
  attractors.push(a);
  scene.add(a.line);
  return a;
}

addAttractor({ dt: DT, steps: 37, maxPoints: 10000, color: { r: 1, g: 1, b: 1 } });
for (let i = 0; i < 120; i++) {
  const shade = (30 + Math.random() * 150) / 255;
  addAttractor({
    dt: DT,
    steps: 35 + Math.floor(Math.random() * 5),
    maxPoints: 50 + Math.floor(Math.random() * 1200),
    color: { r: shade, g: shade, b: shade + Math.random() * 10 / 255 },
  });
}
addAttractor({ dt: DT, steps: 37, maxPoints: 10000, color: { r: 1, g: 1, b: 1 } });

// State
let paused = false;
let fadeOn = true;

function resetAll() {
  for (const a of attractors) {
    a.x = -12.561073 + (Math.random() * 2 - 1) * 0.01;
    a.y = -17.21439  + (Math.random() * 2 - 1) * 0.01;
    a.z =  26.546    + (Math.random() * 2 - 1) * 0.01;
    a.drawCount = 0;
    a.positions.fill(0);
    a.geometry.setDrawRange(a.maxPoints, 0);
    a.geometry.getAttribute('position').needsUpdate = true;
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key === ' ') { paused = !paused; e.preventDefault(); }
  else if (e.key === 'r') resetAll();
  else if (e.key === 'f') { fadeOn = !fadeOn; for (const a of attractors) a.setFade(fadeOn); }
  else if (e.key === 'b') boundsBox.visible = !boundsBox.visible;
  else if (e.key >= '1' && e.key <= '9' && RAW_STATES[e.key]) applyState(camera, controls, RAW_STATES[e.key]);
  else if (e.key === '0') defaultState(camera, controls);
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

function animate() {
  requestAnimationFrame(animate);
  if (!paused) {
    for (const a of attractors) a.evolve();
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();
