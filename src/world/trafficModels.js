import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadGltf, tuneModel } from './models.js';

/**
 * Real vehicles for the traffic. Each entry is a model, the way it is turned
 * (its nose to -Z once `yaw` is applied), how long it should come out in metres,
 * which of its materials is paint (and so is tinted per car), and how often it
 * turns up. `danfo` marks the Lagos minibus.
 */
export const TRAFFIC_MODELS = [
  { id: 'sedan', model: 'car-sedan', yaw: Math.PI / 2, length: 4.9, paint: /^SEDAN$/, weight: 3 },
  { id: 'cicada', model: 'car-cicada', yaw: -Math.PI / 2, length: 3.5, paint: /^CICADA_PAINT$/, weight: 2 },
  { id: 'ambulance', model: 'car-ambulance', yaw: Math.PI / 2, length: 5.6, paint: null, weight: 0.4 },
  { id: 'zhiguli-red', model: 'traffic-zhiguli', pick: /zhiguli_red/i, yaw: 0, length: 4.1, paint: null, weight: 1.2 },
  { id: 'zhiguli-blue', model: 'traffic-zhiguli', pick: /zhiguli_blue/i, yaw: 0, length: 4.1, paint: null, weight: 1.2 },
  { id: 'zhiguli-green', model: 'traffic-zhiguli', pick: /zhiguli_green/i, yaw: 0, length: 4.1, paint: null, weight: 1.2 },
  { id: 'zhiguli-gray', model: 'traffic-zhiguli', pick: /zhiguli_gray/i, yaw: 0, length: 4.1, paint: null, weight: 1.2 },
  { id: 'van', model: 'traffic-van', yaw: 0, length: 4.6, paint: null, weight: 1.5 },
  // The danfo: the same van, recoloured at build time, used where Lagos traffic wants one.
  { id: 'danfo', model: 'traffic-danfo', yaw: 0, length: 4.6, paint: null, weight: 0, danfo: true },
];

/**
 * Bake a loaded model into one geometry per material, facing -Z, standing on
 * y = 0 and centred, scaled to the requested length.
 */
export function bakeVehicle(gltf, spec) {
  const root = tuneModel(gltf.scene.clone(true), { shadows: false });
  const holder = new THREE.Group();
  holder.add(root);
  holder.rotation.y = spec.yaw;
  holder.updateMatrixWorld(true);

  // Which meshes: all, or the ones whose names match `pick` (a file holding
  // several cars).
  const meshes = [];
  holder.traverse((o) => {
    if (!o.isMesh) return;
    if (spec.pick) {
      let named = false;
      for (let n = o; n && !named; n = n.parent) named = spec.pick.test(n.name);
      if (!named) return;
    }
    meshes.push(o);
  });
  const box = new THREE.Box3();
  for (const m of meshes) box.expandByObject(m);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = spec.length / size.z;

  const byMaterial = new Map();
  for (const mesh of meshes) {
    let geometry = mesh.geometry.clone();
    if (geometry.index) geometry = geometry.toNonIndexed();
    // Models are stored quantised (normalised integers); transforming those in
    // place clamps them, so work in plain floats.
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
    const materials = [].concat(mesh.material);
    const material = materials[0];
    if (!byMaterial.has(material)) byMaterial.set(material, []);
    byMaterial.get(material).push(geometry);
  }
  return [...byMaterial].map(([material, list]) => ({
    material,
    geometry: list.length > 1 ? mergeGeometries(list) : list[0],
    isPaint: Boolean(spec.paint && spec.paint.test(material.name)),
  }));
}

/** Load every traffic model; each resolves independently, and one missing file costs only itself. */
export function loadTrafficModels(onReady) {
  for (const spec of TRAFFIC_MODELS) {
    loadGltf(spec.model)
      .then((gltf) => onReady(spec, bakeVehicle(gltf, spec)))
      .catch(() => {});
  }
}
