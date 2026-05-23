// Lorenz attractor constants and shared bounds.
// Ported from the Processing version's Globals.pde / Attractor.pde.

// The classic Lorenz parameters. Kept on a mutable object so the panel
// sliders can tune them at runtime; Attractor.step / recordTrajectory
// read .sigma / .rho / .beta directly each step so changes take effect
// on the next simulation tick.
export const LORENZ_DEFAULTS = Object.freeze({ sigma: 10, rho: 28, beta: 8 / 3 });
export const lorenzParams = { ...LORENZ_DEFAULTS };

// Backwards-compatible immutable exports (matches the original constants;
// new code should read lorenzParams instead so runtime overrides apply).
export const SIGMA = LORENZ_DEFAULTS.sigma;
export const RHO = LORENZ_DEFAULTS.rho;
export const BETA = LORENZ_DEFAULTS.beta;

// Empirically-found bounds from the original sketch (used for normalize/denormalize
// and for the optional bounds box).
export const MIN_LORENZ = { x: -19.542366, y: -27.094086, z: 0.0 };
export const MAX_LORENZ = { x:  19.654312, y:  27.312574, z: 48.069458 };

export function inverseLerpMargined(a, b, value, low = 0.001, high = 0.999) {
  if (a === b) return low;
  const t = (value - a) / (b - a);
  return Math.min(high, Math.max(low, t));
}

export function lerp(a, b, t) { return a + (b - a) * t; }

export function normalizeLorenz(v, out) {
  out.x = inverseLerpMargined(MIN_LORENZ.x, MAX_LORENZ.x, v.x);
  out.y = inverseLerpMargined(MIN_LORENZ.y, MAX_LORENZ.y, v.y);
  out.z = inverseLerpMargined(MIN_LORENZ.z, MAX_LORENZ.z, v.z);
  return out;
}

export function denormalizeLorenz(v, out) {
  out.x = lerp(MIN_LORENZ.x, MAX_LORENZ.x, v.x);
  out.y = lerp(MIN_LORENZ.y, MAX_LORENZ.y, v.y);
  out.z = lerp(MIN_LORENZ.z, MAX_LORENZ.z, v.z);
  return out;
}

// Relativistic gamma factor for a (scalar) velocity in [0,1).
export function gamma(v) {
  return 1.0 / Math.sqrt(1 - v * v);
}

// Port of LorentzMagic from LinearAlg.pde.
// Treats `amount` in [0,1] as a position along the trail and warps each point's
// (normalized) coordinates by a velocity-scaled gamma factor.
const _tmpN = { x: 0, y: 0, z: 0 };
const _tmpW = { x: 0, y: 0, z: 0 };
export function lorentzMagic(px, py, pz, amount, out) {
  _tmpN.x = px; _tmpN.y = py; _tmpN.z = pz;
  normalizeLorenz(_tmpN, _tmpN);
  const nx = _tmpN.x - 0.5;
  const ny = _tmpN.y - 0.5;
  const nz = _tmpN.z - 0.5;
  const bonus = (amount - 0.5) * 1.8;
  const g = gamma(bonus);
  _tmpW.x = (nx + g * (nx - ny)) + 0.5;
  _tmpW.y = (ny + g * (ny - nx)) + 0.5;
  _tmpW.z = nz + 0.5;
  return denormalizeLorenz(_tmpW, out);
}
