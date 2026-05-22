import * as THREE from 'three';
import { SIGMA, RHO, BETA } from './lorenz.js';
import { makeAttractorMaterial } from './material.js';

const TAIL = 100;          // length of the fade-out segment at the oldest end
const SEED_VEL_MAX = 60;   // initial guess for maxDVel; grows from observation

// A single Lorenz attractor with a trailing line ribbon.
//
// Buffer layout: three Float32Arrays (positions, colors, velocities) sized to
// maxPoints, used as a sliding window. evolve() runs `steps` Lorenz substeps,
// shifts the buffers left by `steps` slots (copyWithin), and writes the new
// points at the tail. Slot N-1 is always the most-recent point.
//
// Colors come in two modes:
//   - static: precomputed from a fade-tail ramp (slot index -> brightness).
//     Used when velocity coloring is off; no per-frame work.
//   - dynamic: rebuilt every frame as fade * velFactor, using per-vertex
//     velocities that shift with the buffer. Used when velColor is on.
export class Attractor {
  constructor({
    maxPoints = 10000,
    steps = 37,
    dt = 0.0003,
    color = { r: 1, g: 1, b: 1 },
    seedJitter = 0.01,
  } = {}) {
    this.maxPoints = maxPoints;
    this.steps = steps;
    this.dt = dt;
    this.color = color;

    // Lorenz state, seeded near an on-attractor point (same as the original).
    this.x = -12.561073 + (Math.random() * 2 - 1) * seedJitter;
    this.y = -17.21439  + (Math.random() * 2 - 1) * seedJitter;
    this.z =  26.546    + (Math.random() * 2 - 1) * seedJitter;

    this.timescale = 1;
    this.lastDVel = 0;
    this.maxDVel = SEED_VEL_MAX;

    this.fadeOn = true;
    this.velColor = false;
    this.speedup = false;

    this.positions = new Float32Array(maxPoints * 3);
    this.colors = new Float32Array(maxPoints * 3);
    this.velocities = new Float32Array(maxPoints);

    this.drawCount = 0;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color',
      new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(maxPoints, 0);

    const material = makeAttractorMaterial(maxPoints);

    this.geometry = geometry;
    this.material = material;
    this.line = new THREE.Line(geometry, material);
    this.line.frustumCulled = false;

    this._rebuildStaticColors();
  }

  _rebuildStaticColors() {
    const n = this.maxPoints;
    const c = this.colors;
    const { r, g, b } = this.color;
    for (let i = 0; i < n; i++) {
      const fade = this._fadeAtSlot(i);
      c[i * 3 + 0] = r * fade;
      c[i * 3 + 1] = g * fade;
      c[i * 3 + 2] = b * fade;
    }
    this.geometry.getAttribute('color').needsUpdate = true;
  }

  _updateDynamicColors() {
    const n = this.maxPoints;
    const c = this.colors;
    const v = this.velocities;
    const maxV = this.maxDVel;
    const { r, g, b } = this.color;
    for (let i = 0; i < n; i++) {
      const fade = this._fadeAtSlot(i);
      const vNorm = Math.min(1, v[i] / maxV);
      const velFactor = 0.2 + 0.8 * vNorm;
      const f = fade * velFactor;
      c[i * 3 + 0] = r * f;
      c[i * 3 + 1] = g * f;
      c[i * 3 + 2] = b * f;
    }
    this.geometry.getAttribute('color').needsUpdate = true;
  }

  _fadeAtSlot(i) {
    // Slot 0 is the oldest point (tail end of the trail). Fade ramps from 0
    // there to 1 over the first TAIL slots; the rest of the trail is full
    // brightness. Newest end (slot N-1) is the head, always bright.
    if (!this.fadeOn) return 1;
    return i < TAIL ? i / TAIL : 1;
  }

  setFade(on)     { this.fadeOn = on;   if (!this.velColor) this._rebuildStaticColors(); }
  setVelColor(on) { this.velColor = on; if (!on) this._rebuildStaticColors(); }
  setSpeedup(on)  { this.speedup = on;  if (!on) this.timescale = 1; }

  evolve() {
    const n = this.steps;
    const stride = n * 3;
    const pos = this.positions;
    const vel = this.velocities;

    if (this.drawCount > 0) {
      pos.copyWithin(0, stride);
      vel.copyWithin(0, n);
    }

    // Per-attractor timescale based on current velocity (port of EvolveSpeedup).
    if (this.speedup) {
      const vN = (this.lastDVel / this.maxDVel) * 0.99 + 1e-9;
      this.timescale = Math.min(400, Math.max(0.05, 0.5 / vN));
    }
    const dtt = this.dt * this.timescale;

    const writePos = (this.maxPoints - n) * 3;
    const writeVel = this.maxPoints - n;
    let { x, y, z } = this;

    for (let i = 0; i < n; i++) {
      const dx = SIGMA * (y - x);
      const dy = x * (RHO - z) - y;
      const dz = x * y - BETA * z;

      // dvel: cube root of squared velocity magnitude, per the original sketch
      // (compresses the dynamic range visually).
      const dvel = Math.cbrt(dx * dx + dy * dy + dz * dz);
      if (dvel > this.maxDVel) this.maxDVel = dvel;
      this.lastDVel = dvel;

      x += dx * dtt;
      y += dy * dtt;
      z += dz * dtt;

      const off = writePos + i * 3;
      pos[off + 0] = x;
      pos[off + 1] = y;
      pos[off + 2] = z;
      vel[writeVel + i] = dvel;
    }

    this.x = x; this.y = y; this.z = z;

    this.drawCount = Math.min(this.drawCount + n, this.maxPoints);
    this.geometry.setDrawRange(this.maxPoints - this.drawCount, this.drawCount);
    this.geometry.getAttribute('position').needsUpdate = true;

    if (this.velColor) this._updateDynamicColors();
  }

  reset(seedJitter = 0.01) {
    this.x = -12.561073 + (Math.random() * 2 - 1) * seedJitter;
    this.y = -17.21439  + (Math.random() * 2 - 1) * seedJitter;
    this.z =  26.546    + (Math.random() * 2 - 1) * seedJitter;
    this.drawCount = 0;
    this.positions.fill(0);
    this.velocities.fill(0);
    this.timescale = 1;
    this.lastDVel = 0;
    this.geometry.setDrawRange(this.maxPoints, 0);
    this.geometry.getAttribute('position').needsUpdate = true;
    if (!this.velColor) this._rebuildStaticColors();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
