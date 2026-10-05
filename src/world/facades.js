import * as THREE from 'three';
import manifest from './facade-manifest.json';

/**
 * Baked building facades (see scripts/bake-facades.mjs): a real model's colour,
 * relief and windows, drawn as one textured quad. Materials appear at once and
 * pick their textures up when they arrive, so a street is never invisible
 * while it loads.
 */

const loader = new THREE.TextureLoader();
const materials = new Map();

export function facadeSize(name) {
  const [width, height] = manifest[name].size;
  return { width, height };
}

export function facadeMaterial(name) {
  if (materials.has(name)) return materials.get(name);
  const entry = manifest[name];
  const base = `${import.meta.env.BASE_URL}models/facades/`;
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    alphaTest: 0.5,
    emissive: 0xffd9a0,
    emissiveIntensity: 0,
  });
  const load = (file, srgb) => {
    const texture = loader.load(base + file, () => (material.needsUpdate = true));
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 8;
    return texture;
  };
  material.map = load(entry.files.albedo, true);
  material.normalMap = load(entry.files.normal, false);
  material.emissiveMap = load(entry.files.windows, true);
  materials.set(name, material);
  return material;
}

/** Per frame: windows light up with the lamps, and the stone takes the weather's grey. */
export function updateFacades(live) {
  const glow = Math.min(1, live.lampIntensity * 1.1) * (0.35 + 0.65 * (live.propEmissive ?? 0.6));
  for (const material of materials.values()) {
    material.emissiveIntensity = glow * 0.9;
    material.normalScale.set(1, 1);
  }
}

/**
 * Quads for a run of facades along a street, both sides, as one geometry per
 * baked building. `layout` is [[name, x, side, widthScale, heightScale, mirror]].
 * The building line is `front` from the centreline; a side's buildings face
 * the road. Returns { name: BufferGeometry }.
 */
export function facadeRow(layout, front) {
  const groups = new Map();
  for (const [name, x, side, ws = 1, hs = 1, mirror = false] of layout) {
    const { width, height } = facadeSize(name);
    const plane = new THREE.PlaneGeometry(width * ws, height * hs).translate(0, (height * hs) / 2, 0);
    if (mirror) {
      const uv = plane.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    }
    if (side > 0) plane.rotateY(Math.PI);
    plane.translate(side > 0 ? -x : x, 0, side * front);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(plane);
  }
  const out = {};
  for (const [name, list] of groups) out[name] = merge(list);
  return out;
}

function merge(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const index = [];
  let v = 0;
  for (const g of list) {
    position.set(g.attributes.position.array, v * 3);
    normal.set(g.attributes.normal.array, v * 3);
    uv.set(g.attributes.uv.array, v * 2);
    for (const i of g.index.array) index.push(i + v);
    v += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setIndex(index);
  return merged;
}
