import * as THREE from 'three';
import { MIN_LORENZ, MAX_LORENZ } from './lorenz.js';

// LineBasicMaterial patched at compile time with three position-warping
// effects, all toggleable via shared uniforms:
//
//   uLorentz          relativistic warp along the trail (the namesake effect)
//   uSquiggleStrength time-animated random jitter on the head of the trail
//   uDoodleStrength   monotonic z-offset growing toward the trail tail
//
// All uniforms are shared singletons so flipping a toggle is one assignment
// regardless of how many attractors are in the scene. `uMaxPoints` is per-
// material (set at compile time) since each attractor sizes its buffer
// differently.

export const lorentzUniform          = { value: 0.0 };
export const squiggleStrengthUniform = { value: 0.0 };
export const squiggleCountUniform    = { value: 500.0 };
export const doodleUniform           = { value: 0.0 };
export const stripeStrengthUniform   = { value: 0.0 };
export const timeUniform             = { value: 0.0 };

const minLorenzUniform = { value: new THREE.Vector3(MIN_LORENZ.x, MIN_LORENZ.y, MIN_LORENZ.z) };
const maxLorenzUniform = { value: new THREE.Vector3(MAX_LORENZ.x, MAX_LORENZ.y, MAX_LORENZ.z) };

const HEADER_GLSL = /* glsl */ `
uniform float uLorentz;
uniform vec3 uMinLorenz;
uniform vec3 uMaxLorenz;
uniform float uMaxPoints;
uniform float uSquiggleStrength;
uniform float uSquiggleCount;
uniform float uDoodleStrength;
uniform float uStripeStrength;
uniform float uStripePeriod;
uniform float uTime;

vec3 lorentzWarp(vec3 p, float amount) {
  vec3 range = uMaxLorenz - uMinLorenz;
  vec3 n = clamp((p - uMinLorenz) / range, 0.001, 0.999);
  vec3 d = n - vec3(0.5);
  float bonus = (amount - 0.5) * 1.8;
  float g = 1.0 / sqrt(1.0 - bonus * bonus);
  vec3 w = vec3(
    d.x + g * (d.x - d.y) + 0.5,
    d.y + g * (d.y - d.x) + 0.5,
    d.z + 0.5
  );
  return uMinLorenz + w * range;
}

float hashf(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
`;

const TRANSFORM_GLSL = /* glsl */ `
  #include <begin_vertex>
  // fromHead: 0 at the newest point (head of the trail), grows toward the tail.
  float fromHead = uMaxPoints - 1.0 - float(gl_VertexID);

  if (uLorentz > 0.0) {
    float amount = float(gl_VertexID) / uMaxPoints;
    vec3 warped = lorentzWarp(transformed, amount);
    transformed = mix(transformed, warped, uLorentz);
  }

  if (uDoodleStrength > 0.0) {
    // Each older point pushed further in +z; matches the original ".01 * vcount".
    transformed.z += 0.01 * fromHead * uDoodleStrength;
  }

  if (uSquiggleStrength > 0.0 && fromHead < uSquiggleCount) {
    float intensity = (uSquiggleCount - fromHead) / uSquiggleCount;
    float s = float(gl_VertexID);
    vec3 jitter = vec3(
      hashf(s * 1.1 + uTime * 13.0) - 0.5,
      hashf(s * 2.3 + uTime * 17.0) - 0.5,
      hashf(s * 3.7 + uTime * 23.0) - 0.5
    );
    transformed += jitter * intensity * uSquiggleStrength * 0.5;
  }
`;

export function makeAttractorMaterial(maxPoints, stripePeriod = 4) {
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLorentz = lorentzUniform;
    shader.uniforms.uMinLorenz = minLorenzUniform;
    shader.uniforms.uMaxLorenz = maxLorenzUniform;
    shader.uniforms.uMaxPoints = { value: maxPoints };
    shader.uniforms.uSquiggleStrength = squiggleStrengthUniform;
    shader.uniforms.uSquiggleCount = squiggleCountUniform;
    shader.uniforms.uDoodleStrength = doodleUniform;
    shader.uniforms.uStripeStrength = stripeStrengthUniform;
    shader.uniforms.uStripePeriod = { value: stripePeriod };
    shader.uniforms.uTime = timeUniform;

    shader.vertexShader = HEADER_GLSL + '\n' + shader.vertexShader
      .replace('#include <begin_vertex>', TRANSFORM_GLSL)
      .replace(
        '#include <color_vertex>',
        /* glsl */ `
        #include <color_vertex>
        if (uStripeStrength > 0.0) {
          float keep = mod(float(gl_VertexID), uStripePeriod) < 0.5 ? 1.0 : 0.0;
          vColor.rgb *= mix(1.0, keep, uStripeStrength);
        }
        `,
      );
  };

  material.customProgramCacheKey = () => 'lorenz-attractor-line';
  return material;
}
