import * as THREE from 'three';
import { NIGHT } from './materials.js';

// Soft pavement illumination and small lens halos, in two batches per chunk.
// Shared night uniform follows the same dawn/dusk transition as windows.
export function streetGlowMeshes(lamps, world, ox, oz) {
  if (!lamps.length) return [];
  const fragment = `
    uniform float uNight;
    uniform vec3 uColour;
    uniform float uStrength;
    varying vec2 vGlow;
    void main() {
      float radius = length(vGlow);
      float glow = pow(max(0.0, 1.0 - radius), 2.0);
      if (glow * uNight < 0.002) discard;
      gl_FragColor = vec4(uColour, glow * uNight * uStrength);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  const makeMaterial = (halo) => new THREE.ShaderMaterial({
    uniforms: { uNight: NIGHT, uColour: { value: new THREE.Color(halo ? 0xffdba0 : 0xffbd70) }, uStrength: { value: halo ? 0.7 : 0.25 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: halo ? `
      varying vec2 vGlow;
      void main() {
        vGlow = uv * 2.0 - 1.0;
        vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        centre.xy += position.xy * 1.1;
        gl_Position = projectionMatrix * centre;
      }` : `
      varying vec2 vGlow;
      void main() {
        vGlow = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: fragment,
  });
  const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(10, 15).rotateX(-Math.PI / 2), makeMaterial(false), lamps.length);
  const halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), makeMaterial(true), lamps.length);
  const pose = new THREE.Object3D();
  let pools = 0;
  lamps.forEach(([x, y, z, yaw], i) => {
    const hx = x + Math.sin(yaw) * 2, hz = z + Math.cos(yaw) * 2;
    pose.position.set(hx, y + 7.75, hz);
    pose.rotation.set(0, 0, 0); pose.updateMatrix();
    halo.setMatrixAt(i, pose.matrix);
    // A pool sits on the road surface under the lamp, never over the lagoon.
    const surface = world.surfaceAt(hx + ox, hz + oz);
    if (surface.surface === 'water' || surface.road?.flags & 1) return;
    pose.position.set(hx, Math.max(surface.y, y + 0.22) + 0.025, hz);
    pose.rotation.set(0, yaw, 0); pose.updateMatrix();
    pool.setMatrixAt(pools++, pose.matrix);
  });
  pool.count = pools;
  for (const mesh of [pool, halo]) {
    mesh.userData.streetGlow = true;
    mesh.castShadow = false; mesh.receiveShadow = false;
  }
  return [pool, halo];
}
