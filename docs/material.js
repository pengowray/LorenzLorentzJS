import * as THREE from 'three';
import { MIN_LORENZ, MAX_LORENZ } from './lorenz.js';

// A LineBasicMaterial patched at compile time with a Lorentz-warp vertex
// transform. The shader applies the warp in-place when `uLorentz > 0`,
// otherwise raw positions pass through.
//
// `uLorentz` is a single shared uniform across all attractors so flipping
// the toggle is one assignment.

export const lorentzUniform = { value: 0.0 };

const minLorenzUniform = { value: new THREE.Vector3(MIN_LORENZ.x, MIN_LORENZ.y, MIN_LORENZ.z) };
const maxLorenzUniform = { value: new THREE.Vector3(MAX_LORENZ.x, MAX_LORENZ.y, MAX_LORENZ.z) };

const WARP_GLSL = /* glsl */ `
uniform float uLorentz;
uniform vec3 uMinLorenz;
uniform vec3 uMaxLorenz;
uniform float uMaxPoints;

vec3 lorentzWarp(vec3 p, float amount) {
  vec3 range = uMaxLorenz - uMinLorenz;
  vec3 n = clamp((p - uMinLorenz) / range, 0.001, 0.999);
  vec3 d = n - vec3(0.5);
  // bonus in (-0.9, 0.9): kept strictly inside (-1, 1) so gamma stays finite.
  float bonus = (amount - 0.5) * 1.8;
  float g = 1.0 / sqrt(1.0 - bonus * bonus);
  vec3 w = vec3(
    d.x + g * (d.x - d.y) + 0.5,
    d.y + g * (d.y - d.x) + 0.5,
    d.z + 0.5
  );
  return uMinLorenz + w * range;
}
`;

export function makeAttractorMaterial(maxPoints) {
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

    shader.vertexShader = WARP_GLSL + '\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      if (uLorentz > 0.0) {
        float amount = float(gl_VertexID) / uMaxPoints;
        vec3 warped = lorentzWarp(transformed, amount);
        transformed = mix(transformed, warped, uLorentz);
      }
      `
    );
  };

  // Ensure this material gets its own program cache key so unrelated
  // LineBasicMaterials elsewhere in the scene aren't affected.
  material.customProgramCacheKey = () => 'lorentz-line';

  return material;
}
