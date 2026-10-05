import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadGltf, tuneModel } from '../world/models.js';

/**
 * Roadside props built from real models, swapped in for their procedural
 * stand-ins once they have loaded (high and medium tiers).
 *
 * `items` are placed in the prop's own frame — front toward +Z, a linear prop
 * running along X — each one a model, an offset, a turn and an optional size
 * (the longest horizontal dimension in metres). Several items make a composite:
 * the market is five stalls.
 *
 * `faceRoad` turns the whole prop to look at the road rather than at the
 * traffic, which is what a stall or a shop ought to do.
 */
export const MODEL_PROPS = {
  market: {
    faceRoad: true,
    items: [
      { model: 'prop-stall', x: -7.2, z: 0, yaw: Math.PI, size: 6 },
      { model: 'prop-stall', x: 0, z: 0.4, yaw: Math.PI, size: 6 },
      { model: 'prop-stall', x: 7.2, z: -0.2, yaw: Math.PI, size: 6 },
      { model: 'prop-stall', x: -3.6, z: -5.6, yaw: Math.PI, size: 6 },
      { model: 'prop-stall', x: 3.6, z: -5.4, yaw: Math.PI, size: 6 },
    ],
  },
  stall: { faceRoad: true, items: [{ model: 'prop-stall', x: 0, z: 0, yaw: Math.PI, size: 6 }] },
  lagosShops: { faceRoad: true, items: [{ model: 'prop-shop', x: 0, z: 0, yaw: Math.PI, size: 6.5 }] },
  // Crash barriers run along X; the model is longer along Z, so it is turned.
  barrier: { items: [{ model: 'prop-barrier', x: 0, z: 0, yaw: Math.PI / 2, size: 3.6 }] },
};

/**
 * Bake one model item into geometry: floats (models are stored quantised),
 * centred on its footprint, standing on y = 0, scaled so its longest
 * horizontal side is `size`, then moved to the item's place. Grouped by
 * material so each needs one instanced mesh.
 */
function bakeItem(gltf, item, byMaterial) {
  const root = tuneModel(gltf.scene.clone(true), { shadows: false });
  const holder = new THREE.Group();
  holder.add(root);
  holder.rotation.y = item.yaw;
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = item.size ? item.size / Math.max(size.x, size.z) : 1;

  holder.traverse((mesh) => {
    if (!mesh.isMesh) return;
    let geometry = mesh.geometry.clone();
    if (geometry.index) geometry = geometry.toNonIndexed();
    for (const name of Object.keys(geometry.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) {
        geometry.deleteAttribute(name);
        continue;
      }
      const a = geometry.attributes[name];
      const floats = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) floats[i * a.itemSize + k] = a.getComponent(i, k);
      geometry.setAttribute(name, new THREE.BufferAttribute(floats, a.itemSize));
    }
    if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.translate(-centre.x, -box.min.y, -centre.z);
    geometry.scale(scale, scale, scale);
    geometry.translate(item.x, 0, item.z);
    const material = [].concat(mesh.material)[0];
    if (!byMaterial.has(material)) byMaterial.set(material, []);
    byMaterial.get(material).push(geometry);
  });
}

/** Load a prop's models and return its baked parts, or null if any is missing. */
export async function loadModelProp(spec) {
  const byMaterial = new Map();
  const models = new Map();
  try {
    for (const item of spec.items) {
      if (!models.has(item.model)) models.set(item.model, await loadGltf(item.model));
      bakeItem(models.get(item.model), item, byMaterial);
    }
  } catch {
    return null;
  }
  const parts = [...byMaterial].map(([material, list]) => ({
    material,
    geometry: list.length > 1 ? mergeGeometries(list) : list[0],
  }));
  let footprint = 0;
  for (const { geometry } of parts) {
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    footprint = Math.max(footprint, Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.z), Math.abs(b.max.z));
  }
  return { parts, footprint };
}
