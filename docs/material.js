import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MIN_LORENZ, MAX_LORENZ } from './lorenz.js';

// Patched LineMaterial (from three/addons/lines) with the same set of effects
// that the old LineBasicMaterial port had, all toggleable via shared uniforms:
//
//   uBedhair          messy decorative warp that pulls the trail apart at its
//                      head and tail (the original sketch's Lorentz-flavoured
//                      attempt; looks more like bedhead than physics)
//   uSquiggleStrength time-animated random jitter on the head of the trail
//   uDoodleStrength   monotonic z-offset growing toward the trail tail
//   uStripeStrength   per-attractor dashed pattern (varies by uStripePeriod)
//   uBeam             relativistic-style brightness modulation: vertices whose
//                      tangent points toward the camera brighten, others dim.
//                      Velocity direction is read from segment endpoints
//                      (instanceEnd - instanceStart), so no separate velocity
//                      attribute is needed.
//
// All toggles are shared singletons so flipping one is one assignment regardless
// of how many attractors are in the scene. `uMaxPoints` and `uStripePeriod`
// are per-material (set at compile time) since each attractor sizes/dashes its
// buffer differently.

export const bedhairUniform          = { value: 0.0 };
export const squiggleStrengthUniform = { value: 0.0 };
export const squiggleCountUniform    = { value: 500.0 };
export const doodleUniform           = { value: 0.0 };
export const stripeStrengthUniform   = { value: 0.0 };
export const beamUniform             = { value: 0.0 };
export const cameraPosUniform        = { value: new THREE.Vector3() };
// uMaxSegLen calibrates beta = segLen / uMaxSegLen for the beam Doppler
// formula. With dt=0.0003 and max Lorenz velocity ~500, max segment length
// is ~0.15 in attractor coords.
export const maxSegLenUniform        = { value: 0.15 };
export const timeUniform             = { value: 0.0 };

const minLorenzUniform = { value: new THREE.Vector3(MIN_LORENZ.x, MIN_LORENZ.y, MIN_LORENZ.z) };
const maxLorenzUniform = { value: new THREE.Vector3(MAX_LORENZ.x, MAX_LORENZ.y, MAX_LORENZ.z) };

const HEADER_GLSL = /* glsl */ `
uniform float uBedhair;
uniform vec3 uMinLorenz;
uniform vec3 uMaxLorenz;
uniform float uMaxPoints;
uniform float uSquiggleStrength;
uniform float uSquiggleCount;
uniform float uDoodleStrength;
uniform float uStripeStrength;
uniform float uStripePeriod;
uniform float uBeam;
uniform vec3 uCameraPos;
uniform float uMaxSegLen;
uniform float uTime;

vec3 bedhairWarp(vec3 p, float amount) {
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

// Apply all position-warping effects to a single endpoint of a segment.
vec3 applyWarps(vec3 p, float slot) {
  vec3 warped = p;
  float fromHead = uMaxPoints - 1.0 - slot;

  if (uBedhair > 0.0) {
    float amount = slot / uMaxPoints;
    vec3 w = bedhairWarp(warped, amount);
    warped = mix(warped, w, uBedhair);
  }
  if (uDoodleStrength > 0.0) {
    warped.z += 0.01 * fromHead * uDoodleStrength;
  }
  if (uSquiggleStrength > 0.0 && fromHead < uSquiggleCount) {
    float intensity = (uSquiggleCount - fromHead) / uSquiggleCount;
    vec3 jitter = vec3(
      hashf(slot * 1.1 + uTime * 13.0) - 0.5,
      hashf(slot * 2.3 + uTime * 17.0) - 0.5,
      hashf(slot * 3.7 + uTime * 23.0) - 0.5
    );
    warped += jitter * intensity * uSquiggleStrength * 0.5;
  }
  return warped;
}
`;

export function makeAttractorMaterial(maxPoints, stripePeriod = 4, linewidth = 1) {
  const material = new LineMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    linewidth, // in screen pixels
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBedhair = bedhairUniform;
    shader.uniforms.uMinLorenz = minLorenzUniform;
    shader.uniforms.uMaxLorenz = maxLorenzUniform;
    shader.uniforms.uMaxPoints = { value: maxPoints };
    shader.uniforms.uSquiggleStrength = squiggleStrengthUniform;
    shader.uniforms.uSquiggleCount = squiggleCountUniform;
    shader.uniforms.uDoodleStrength = doodleUniform;
    shader.uniforms.uStripeStrength = stripeStrengthUniform;
    shader.uniforms.uStripePeriod = { value: stripePeriod };
    shader.uniforms.uBeam = beamUniform;
    shader.uniforms.uCameraPos = cameraPosUniform;
    shader.uniforms.uMaxSegLen = maxSegLenUniform;
    shader.uniforms.uTime = timeUniform;

    shader.vertexShader = HEADER_GLSL + '\n' + shader.vertexShader
      // Warp segment endpoints before they're projected into screen space.
      .replace(
        'vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );',
        `vec3 _warpedStart = applyWarps(instanceStart, float(gl_InstanceID));
         vec4 start = modelViewMatrix * vec4(_warpedStart, 1.0);`,
      )
      .replace(
        'vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );',
        `vec3 _warpedEnd = applyWarps(instanceEnd, float(gl_InstanceID + 1));
         vec4 end = modelViewMatrix * vec4(_warpedEnd, 1.0);`,
      )
      // Modulate vertex colour with stripes and beam after the standard
      // start/end colour pick.
      .replace(
        'vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;',
        /* glsl */ `
        vColor.xyz = (position.y < 0.5) ? instanceColorStart : instanceColorEnd;
        float _slot = (position.y < 0.5) ? float(gl_InstanceID) : float(gl_InstanceID + 1);

        if (uStripeStrength > 0.0) {
          float keep = mod(_slot, uStripePeriod) < 0.5 ? 1.0 : 0.0;
          vColor *= mix(1.0, keep, uStripeStrength);
        }

        if (uBeam > 0.0) {
          // Doppler-style brightness modulation. Velocity direction is the
          // segment tangent; segment length is a proxy for speed.
          vec3 worldStart = (modelMatrix * vec4(instanceStart, 1.0)).xyz;
          vec3 worldEnd = (modelMatrix * vec4(instanceEnd, 1.0)).xyz;
          vec3 worldPos = (position.y < 0.5) ? worldStart : worldEnd;
          vec3 segDir = worldEnd - worldStart;
          float segLen = length(segDir);
          vec3 vDir = segLen > 0.001 ? segDir / segLen : vec3(0.0);
          vec3 viewDir = normalize(uCameraPos - worldPos);
          float beta = clamp(segLen / uMaxSegLen, 0.0, 0.99);
          float cosTheta = dot(vDir, viewDir);
          float D = 1.0 / (1.0 - 0.85 * beta * cosTheta);
          float factor = mix(1.0, clamp(D, 0.0, 6.0), uBeam);
          vColor *= factor;
        }
        `,
      );
  };

  material.customProgramCacheKey = () => 'lorenz-attractor-thick-line';
  return material;
}
