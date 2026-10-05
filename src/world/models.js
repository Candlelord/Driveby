import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import manifest from './model-manifest.json';

/**
 * Real 3D models.
 *
 * The procedural meshes in this project are the fallback and the fast path:
 * they exist the moment the page does and need no download. Models are the
 * upgrade — loaded in the background, swapped in when they arrive, and never
 * required: if one fails to load (offline, a missing file) the procedural
 * version simply stays.
 *
 * Models live in public/models and are produced by `npm run models`
 * (scripts/optimize-models.mjs), which strips unseen parts, simplifies,
 * shrinks the textures and meshopt-compresses them.
 */

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

/** Load a model once; every caller gets the same promise for the shared glTF. */
export function loadGltf(name) {
  if (!cache.has(name)) {
    const file = manifest[name];
    if (!file) {
      cache.set(name, Promise.reject(new Error(`No model named "${name}" — run npm run models`)));
    } else {
      cache.set(name, loader.loadAsync(`${import.meta.env.BASE_URL}models/${file}`));
    }
  }
  return cache.get(name);
}

/**
 * Make a loaded model fit the renderer: shadows on, and the material features
 * that are expensive or look wrong here replaced with cheap equivalents.
 *
 *   transmission  -> a tinted translucent surface. Real transmission renders
 *                    the whole scene a second time behind the glass.
 *   iridescence   -> off. Costly, and invisible at driving distance.
 */
export function tuneModel(root, { shadows = true, envMapIntensity = 1.1 } = {}) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = shadows;
    object.receiveShadow = shadows;
    object.frustumCulled = true;
    for (const material of [].concat(object.material)) {
      if (material.transmission > 0) {
        material.transmission = 0;
        material.transparent = true;
        material.opacity = 0.74;
        material.color.set(0x06090d);
        material.roughness = 0.04;
        material.depthWrite = false;
      }
      if (material.iridescence) material.iridescence = 0;
      material.envMapIntensity = envMapIntensity;
    }
  });
  return root;
}

/** Every material in a model whose name matches, once each. */
export function materialsNamed(root, pattern) {
  const found = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of [].concat(object.material)) {
      if (pattern.test(material.name)) found.add(material);
    }
  });
  return [...found];
}

/** The first node whose name matches. */
export function nodeNamed(root, name) {
  let found = null;
  root.traverse((object) => {
    if (!found && object.name === name) found = object;
  });
  return found;
}

/**
 * Put a wheel node on a steering pivot so it can be yawed and spun
 * independently, whatever rotation it was authored with. Returns
 * `{ pivot, spin(angle) }`; `spin` rolls about the pivot's X axis.
 */
export function mountWheel(wheel) {
  const parent = wheel.parent;
  const pivot = new THREE.Group();
  pivot.position.copy(wheel.position);
  parent.add(pivot);
  pivot.add(wheel);
  wheel.position.set(0, 0, 0);
  const base = wheel.quaternion.clone();
  const spinQ = new THREE.Quaternion();
  const axis = new THREE.Vector3(1, 0, 0);
  return {
    pivot,
    spin(angle) {
      spinQ.setFromAxisAngle(axis, angle);
      wheel.quaternion.copy(spinQ).multiply(base);
    },
  };
}

/** World-space height of the lowest point of a node, for sitting it on the road. */
export function lowestPoint(node) {
  return new THREE.Box3().setFromObject(node).min.y;
}
