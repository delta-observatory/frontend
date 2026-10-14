import * as THREE from "three";

/** Uniforms that every sky layer shares. SkySync writes them from the camera state and the canvas size. */
export const skyUniforms = {
  uR: { value: new THREE.Vector3() },
  uU: { value: new THREE.Vector3() },
  uF: { value: new THREE.Vector3() },
  uK: { value: 1 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uDpr: { value: 1 },
  uZoom: { value: 1 },
  uMagLimit: { value: 6 },
};
