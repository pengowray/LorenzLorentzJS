import * as THREE from 'three';

// Camera presets ported from the original sketch's Camera.pde.
// Each entry is the raw PeasyCam state: quaternion rotation, center, and distance.
// PeasyCam's transform places the camera at `center + qInv * (0, 0, distance)`
// in world space and orients its up to `qInv * (0, 1, 0)`.
//
// Note: Processing uses Y-down, Three.js uses Y-up. The Lorenz attractor itself
// has no preferred up axis, so we ignore the orientation mismatch for now and
// just use the position+target. Camera presets may need tuning in-browser.

export const RAW_STATES = {
  '1': { rotation: [ 0.8384232913636074, 0.022391603683206876, 0.09084948483378019, -0.5369277155157269 ], center: [141.48117901831336, 32.61666224713989, 318.642463898024], distance: 4116.21 },
  '2': { rotation: [ 0.8523528208836681, -0.13261810722175846, 0.005752015720888655, -0.5058399160640811 ], center: [-188.47555036718768, 379.118407016913, 98.42272459417573], distance: 3480.03 },
  '3': { rotation: [ 0.3092880034304926, -0.44916220656303535, 0.5867905702931293, -0.5985574907596278 ], center: [-235.59509864434457, -339.9399477402891, 1347.5485771332221], distance: 2245.71 },
  '4': { rotation: [ 0.8303053819865492, -0.20785949087591857, 0.5042763691103431, -0.11442354763712252 ], center: [194.86113503238008, -194.18874712583118, 1029.1823407626166], distance: 1808.56 },
  '5': { rotation: [ 0.8756318017502827, 0.06457709142776001, -0.47374010450638987, -0.06833052325686474 ], center: [-128.84892133791323, 397.19166333352564, 1121.5933953257322], distance: 2413.90 },
  '6': { rotation: [ -0.5393565141299265, -0.6415029669498047, -0.38064033684340126, -0.39074470953289514 ], center: [205.31138808297527, 4.99799549577376, 1275.4602576637014], distance: 2199.68 },
  '7': { rotation: [ -0.359213380998923, -0.7256249730199374, -0.3030874369449802, -0.502565568863664 ], center: [-234.20208957896992, 139.30787112817677, 1389.171263030442], distance: 2370.40 },
  '8': { rotation: [ -0.6209291025683213, -0.6478387182246031, -0.2695378234683652, 0.3494301167225546 ], center: [177.4289293148501, -66.8523833127547, 1047.1873462386873], distance: 2688.40 },
  '9': { rotation: [ -0.6944198206264379, -0.17031503901799483, 0.6385109696620093, 0.2847413595295266 ], center: [3.4617374910725087, -96.23627838258321, 1221.91147130144], distance: 1491.12 },
};

// The original sketch applied `scale(50)` before rendering, so all PeasyCam
// state was in units 50x larger than attractor space. Divide to bring camera
// distances/targets back into raw attractor coordinates.
const PROCESSING_SCALE = 50;

// Convert a PeasyCam state into a Three.js camera position + target.
// Math: PeasyCam transforms a world point P as q * (P - center) + (0,0,-d).
// So the camera origin in world space is at: center + qInv * (0, 0, d).
export function applyState(camera, controls, raw) {
  const q = new THREE.Quaternion(raw.rotation[1], raw.rotation[2], raw.rotation[3], raw.rotation[0]); // (q1,q2,q3,q0) -> (x,y,z,w)
  const qInv = q.clone().invert();
  const center = new THREE.Vector3(...raw.center).divideScalar(PROCESSING_SCALE);
  const offset = new THREE.Vector3(0, 0, raw.distance / PROCESSING_SCALE).applyQuaternion(qInv);

  controls.target.copy(center);
  camera.position.copy(center).add(offset);
  camera.up.set(0, 1, 0).applyQuaternion(qInv);
  camera.lookAt(controls.target);
  controls.update();
}

export function defaultState(camera, controls) {
  controls.target.set(0, 0, 25);
  camera.position.set(0, 0, 120);
  camera.up.set(0, 1, 0);
  camera.lookAt(controls.target);
  controls.update();
}
