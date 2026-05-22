import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { SIGMA, RHO, BETA } from './lorenz.js';
import { makeAttractorMaterial } from './material.js';

const TAIL = 100;          // length of the fade-out segment at the oldest end
const SEED_VEL_MAX = 60;   // initial guess for maxDVel; grows from observation

// A single Lorenz attractor with a trailing line ribbon, rendered as a Line2
// (instanced quads) so the line width is actually respected in WebGL.
//
// Buffer layout (linear, sliding window):
//   positions     Float32Array(maxPoints * 3)
//   colors        Float32Array(maxPoints * 3)
//   velocities    Float32Array(maxPoints)        — scalar dvel (for velColor)
//
// Each step() runs `steps` Lorenz substeps and copyWithin-shifts the buffers
// left by that many slots, then writes the new points at the tail. Slot N-1
// is always the most-recent point.
//
// flushGeometry() copies the linear buffers into the underlying Line2 segment
// buffer (Float32Array of size 6 * (maxPoints - 1), interleaved start/end per
// segment). Splitting this from step() lets us pre-warm cheaply by running
// many step()s and only flushing once.
//
// Colors:
//   - static: precomputed from a fade-tail ramp (slot index -> brightness).
//     Used when velocity coloring is off; no per-frame color work.
//   - dynamic: rebuilt every frame as fade * velFactor, using per-vertex
//     velocities that shift with the buffer. Used when velColor is on.
export class Attractor {
  constructor({
    maxPoints = 10000,
    steps = 37,
    dt = 0.0003,
    color = { r: 1, g: 1, b: 1 },
    seedJitter = 0.01,
    stripePeriod = 4,
    linewidth = 1,
  } = {}) {
    this.maxPoints = maxPoints;
    this.steps = steps;
    this.dt = dt;
    this.color = color;

    this.x = -12.561073 + (Math.random() * 2 - 1) * seedJitter;
    this.y = -17.21439  + (Math.random() * 2 - 1) * seedJitter;
    this.z =  26.546    + (Math.random() * 2 - 1) * seedJitter;

    this.timescale = 1;
    this.lastDVel = 0;
    this.maxDVel = SEED_VEL_MAX;

    this.fadeOn = true;
    this.velColor = false;
    this.speedup = false;

    // Linear "logical" buffers.
    this.positions = new Float32Array(maxPoints * 3);
    this.colors = new Float32Array(maxPoints * 3);
    this.velocities = new Float32Array(maxPoints);

    this.drawCount = 0;

    // LineGeometry's setPositions builds an interleaved [start.xyz, end.xyz]
    // buffer of size 6 * (maxPoints - 1). We call it once with zeros to
    // allocate, then write into that buffer directly each frame.
    const lineGeom = new LineGeometry();
    lineGeom.setPositions(new Float32Array(maxPoints * 3));
    lineGeom.setColors(new Float32Array(maxPoints * 3));
    this._segPositions = lineGeom.getAttribute('instanceStart').data;
    this._segColors = lineGeom.getAttribute('instanceColorStart').data;

    this.geometry = lineGeom;
    this.material = makeAttractorMaterial(maxPoints, stripePeriod, linewidth);
    this.line = new Line2(lineGeom, this.material);
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
  }

  _fadeAtSlot(i) {
    if (!this.fadeOn) return 1;
    return i < TAIL ? i / TAIL : 1;
  }

  setFade(on)     { this.fadeOn = on;   if (!this.velColor) this._rebuildStaticColors(); }
  setVelColor(on) { this.velColor = on; if (!on) this._rebuildStaticColors(); }
  setSpeedup(on)  { this.speedup = on;  if (!on) this.timescale = 1; }

  // Run the Lorenz integration; update linear buffers; do NOT push to GPU.
  //
  // `morph` (optional): {
  //   target: { x, y, z },             // where we want to be at progress = 1
  //   progress: float in [0, 1],       // position within the morph window
  //                                    // at the START of this step
  //   framesTotal,                     // total number of frames in the morph window
  // }
  // When morph is provided, each Lorenz substep's velocity is blended via
  // smoothstep(t) from natural toward a "drift" velocity equal to
  // (target - current) / time_remaining. At t = 0 the trajectory is purely
  // natural; at t = 1 it's purely drift and converges exactly to the target
  // by the last substep. Smooth, chaos-shaped early, target-pulled late —
  // and the buffer keeps its usual point density throughout.
  step(morph = null) {
    const n = this.steps;
    const stride = n * 3;
    const pos = this.positions;
    const vel = this.velocities;

    if (this.drawCount > 0) {
      pos.copyWithin(0, stride);
      vel.copyWithin(0, n);
    }

    if (this.speedup) {
      const vN = (this.lastDVel / this.maxDVel) * 0.99 + 1e-9;
      this.timescale = Math.min(400, Math.max(0.05, 0.5 / vN));
    }
    const dtt = this.dt * this.timescale;

    const writePos = (this.maxPoints - n) * 3;
    const writeVel = this.maxPoints - n;
    let { x, y, z } = this;

    const totalSubsteps = morph ? morph.framesTotal * n : 0;
    const elapsedAtStart = morph ? Math.round(morph.progress * totalSubsteps) : 0;
    const tx = morph?.target.x ?? 0, ty = morph?.target.y ?? 0, tz = morph?.target.z ?? 0;

    for (let i = 0; i < n; i++) {
      const dx_nat = SIGMA * (y - x);
      const dy_nat = x * (RHO - z) - y;
      const dz_nat = x * y - BETA * z;

      let dx, dy, dz;
      if (morph) {
        const elapsed = elapsedAtStart + i;
        const remaining = Math.max(1, totalSubsteps - elapsed);
        const remainingTime = remaining * dtt;
        const dx_drift = (tx - x) / remainingTime;
        const dy_drift = (ty - y) / remainingTime;
        const dz_drift = (tz - z) / remainingTime;
        const t = elapsed / totalSubsteps;
        const k = t * t * (3 - 2 * t); // smoothstep
        dx = (1 - k) * dx_nat + k * dx_drift;
        dy = (1 - k) * dy_nat + k * dy_drift;
        dz = (1 - k) * dz_nat + k * dz_drift;
      } else {
        dx = dx_nat; dy = dy_nat; dz = dz_nat;
      }

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

    if (this.velColor) this._updateDynamicColors();
  }

  // Snapshot/restore for the recorder's two-pass loop. Captures everything
  // the simulation needs to be deterministically rewound to this point.
  saveState() {
    return {
      x: this.x, y: this.y, z: this.z,
      positions: new Float32Array(this.positions),
      colors: new Float32Array(this.colors),
      velocities: new Float32Array(this.velocities),
      drawCount: this.drawCount,
      timescale: this.timescale,
      lastDVel: this.lastDVel,
      maxDVel: this.maxDVel,
    };
  }

  restoreState(s) {
    this.x = s.x; this.y = s.y; this.z = s.z;
    this.positions.set(s.positions);
    this.colors.set(s.colors);
    this.velocities.set(s.velocities);
    this.drawCount = s.drawCount;
    this.timescale = s.timescale;
    this.lastDVel = s.lastDVel;
    this.maxDVel = s.maxDVel;
  }

  // Copy the linear buffers into the interleaved segment buffer that Line2
  // actually renders from. Called once per render frame.
  flushGeometry() {
    const pos = this.positions;
    const col = this.colors;
    const sp = this._segPositions.array;
    const sc = this._segColors.array;
    const N = this.maxPoints - 1;

    for (let i = 0; i < N; i++) {
      const off6 = i * 6;
      const offA = i * 3;
      const offB = (i + 1) * 3;
      sp[off6 + 0] = pos[offA + 0];
      sp[off6 + 1] = pos[offA + 1];
      sp[off6 + 2] = pos[offA + 2];
      sp[off6 + 3] = pos[offB + 0];
      sp[off6 + 4] = pos[offB + 1];
      sp[off6 + 5] = pos[offB + 2];

      sc[off6 + 0] = col[offA + 0];
      sc[off6 + 1] = col[offA + 1];
      sc[off6 + 2] = col[offA + 2];
      sc[off6 + 3] = col[offB + 0];
      sc[off6 + 4] = col[offB + 1];
      sc[off6 + 5] = col[offB + 2];
    }

    this._segPositions.needsUpdate = true;
    this._segColors.needsUpdate = true;

    // Draw only the segments we've actually populated. After pre-warm this
    // saturates at maxPoints - 1 and stays there.
    this.geometry.instanceCount = Math.max(0, this.drawCount - 1);
  }

  // Run `iterations` Lorenz steps and then flush once. Used at startup and
  // after reset to fill the trail without spamming the GPU.
  prewarm(iterations = 280) {
    for (let i = 0; i < iterations; i++) this.step();
    this.flushGeometry();
  }

  evolve() {
    this.step();
    this.flushGeometry();
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
    if (!this.velColor) this._rebuildStaticColors();
    this.prewarm();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
