import * as THREE from 'three';
import { SIGMA, RHO, BETA } from './lorenz.js';

// A single Lorenz attractor with a trailing line ribbon.
// Uses a flat Float32Array as a sliding window: each Evolve() produces `steps`
// new points, the buffer is shifted left by that many slots (copyWithin), and
// the new points are written at the tail. So the tail of the buffer is always
// the most-recent point, the head is the oldest still-shown point.
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

    // Lorenz state. Seed near a point that's already on the attractor so we
    // don't have to "fall in" from origin (same seed as Attractor.pde).
    this.x = -12.561073 + (Math.random() * 2 - 1) * seedJitter;
    this.y = -17.21439  + (Math.random() * 2 - 1) * seedJitter;
    this.z =  26.546    + (Math.random() * 2 - 1) * seedJitter;

    this.positions = new Float32Array(maxPoints * 3);
    this.colors = new Float32Array(maxPoints * 3);
    this.velocities = new Float32Array(maxPoints);

    this._buildColors(/*fade*/ true, /*velColor*/ false);

    this.drawCount = 0; // grows from 0 to maxPoints

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color',
      new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(maxPoints, 0);

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.geometry = geometry;
    this.material = material;
    this.line = new THREE.Line(geometry, material);
    this.line.frustumCulled = false; // bounds shift over time
  }

  // Precompute the per-slot color ramp. Slot 0 is the oldest point (fades to
  // black if `fade`), slot maxPoints-1 is the newest (full brightness).
  _buildColors(fade, velColor) {
    const TAIL = 100; // matches original
    const n = this.maxPoints;
    const c = this.colors;
    const r = this.color.r, g = this.color.g, b = this.color.b;
    for (let i = 0; i < n; i++) {
      let intensity = 1;
      if (fade) {
        const fromEnd = n - 1 - i; // 0 = newest
        if (fromEnd < TAIL) intensity = fromEnd / TAIL;
      }
      c[i * 3 + 0] = r * intensity;
      c[i * 3 + 1] = g * intensity;
      c[i * 3 + 2] = b * intensity;
    }
    if (this.geometry) this.geometry.getAttribute('color').needsUpdate = true;
  }

  setFade(fade) { this._buildColors(fade, false); }

  evolve() {
    const n = this.steps;
    const stride = n * 3;
    const pos = this.positions;

    // Shift older points toward index 0; the last `n` slots will be overwritten.
    if (this.drawCount > 0) pos.copyWithin(0, stride);

    const writeOffset = (this.maxPoints - n) * 3;
    let { x, y, z, dt } = this;

    for (let i = 0; i < n; i++) {
      const dx = SIGMA * (y - x);
      const dy = x * (RHO - z) - y;
      const dz = x * y - BETA * z;
      x += dx * dt;
      y += dy * dt;
      z += dz * dt;

      const off = writeOffset + i * 3;
      pos[off + 0] = x;
      pos[off + 1] = y;
      pos[off + 2] = z;
    }

    this.x = x; this.y = y; this.z = z;

    this.drawCount = Math.min(this.drawCount + n, this.maxPoints);
    // Draw the most recent `drawCount` vertices (i.e. the tail of the buffer).
    this.geometry.setDrawRange(this.maxPoints - this.drawCount, this.drawCount);
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
