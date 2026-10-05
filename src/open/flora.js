import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PROP_KIT } from '../props/kit.js';
import { leafCard, frondCard, grassCard, needleCard, barkMaps, rockMaps, keepCardNormals } from '../world/surfaces.js';
import { CHUNK, NORTH_EDGE, hash2, fbm } from './geo.js';
import { GROUND, distToSeg } from './world.js';
import { biomeAt } from './north.js';
import { applyFoliageWind, FOLIAGE_TIME } from './foliageWind.js';

/**
 * Trees, shrubs, termite mounds and grass, scattered over a chunk by what the
 * ground is: oil palms and broadleaf trees round Lagos and through the bush,
 * acacias and termite mounds on the savanna, baobabs in the Sahel, almost
 * nothing on the dunes. Never on a road, in a building or in the water.
 *
 * One instanced mesh per kit part per chunk, built from the same kit the old
 * roadside used.
 */

const FOLIAGE = new Set(['leaf', 'needle', 'frond', 'core', 'grass']);
const CARDS = new Set(['leaf', 'needle', 'frond', 'grass']);
const COLOURS = {
  lagos: { a: 0x4f7a34, b: 0x5a4632 },
  forest: { a: 0x42682c, b: 0x4e3c2a },
  savanna: { a: 0x7a8a3c, b: 0x5e4a36 },
  sahel: { a: 0x8a8a48, b: 0x6a5440 },
  desert: { a: 0x8e8a52, b: 0x6e5844 },
};

// What grows where: [kit type, weight]. Densities are per 14 m cell.
const MIX = {
  park: { density: 0.55, types: [['round', 0.6], ['palm', 0.3], ['shrub', 0.1]] },
  residential: { density: 0.09, types: [['palm', 0.5], ['round', 0.4], ['shrub', 0.1]] },
  commercial: { density: 0.03, types: [['palm', 0.7], ['round', 0.3]] },
  wood: { density: 0.7, types: [['round', 0.45], ['palm', 0.35], ['shrub', 0.2]] },
  wetland: { density: 0.35, types: [['palm', 0.4], ['shrub', 0.4], ['grass', 0.2]] },
  land: { density: 0.12, types: [['shrub', 0.4], ['palm', 0.3], ['grass', 0.3]] },
  forest: { density: 0.6, types: [['palm', 0.4], ['round', 0.45], ['shrub', 0.15]] },
  savanna: { density: 0.22, types: [['grass', 0.45], ['acacia', 0.25], ['shrub', 0.14], ['termiteMound', 0.08], ['round', 0.08]] },
  sahel: { density: 0.1, types: [['grass', 0.35], ['acacia', 0.2], ['shrub', 0.25], ['baobab', 0.1], ['rock', 0.1]] },
  desert: { density: 0.012, types: [['shrub', 0.6], ['rock', 0.4]] },
};

let kit = null;
function kitParts(type) {
  kit ??= new Map();
  if (kit.has(type)) return kit.get(type);
  const def = PROP_KIT[type];
  const parts = def.parts.map((part) => {
    let geometry = part.geometry();
    if (!CARDS.has(part.surface)) {
      const source = geometry.index ? geometry.toNonIndexed() : geometry;
      geometry = toCreasedNormals(source, THREE.MathUtils.degToRad(42));
    }
    geometry.userData.shared = true;
    return { geometry, surface: part.surface ?? 'plain', slot: part.material, fixed: part.color };
  });
  kit.set(type, parts);
  return parts;
}

const materials = new Map();
const depthMaterials = new WeakMap();
function material(surface, colour) {
  const key = `${surface}:${colour}`;
  if (materials.has(key)) return materials.get(key);
  const card = (map) => ({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
  const spec =
    { leaf: card(leafCard()), needle: card(needleCard()), frond: card(frondCard()), grass: { ...card(grassCard()), alphaTest: 0.5 }, bark: { ...barkMaps(), roughness: 0.95 }, rock: { ...rockMaps(), roughness: 0.92 }, core: { roughness: 0.95 } }[surface] ?? { roughness: 0.85 };
  const m = new THREE.MeshStandardMaterial({ color: colour, metalness: 0, ...spec });
  if (surface === 'core') m.color.multiplyScalar(0.34);
  if (CARDS.has(surface)) {
    keepCardNormals(m);
    const original = m.onBeforeCompile;
    applyFoliageWind(m, surface === 'frond' ? 0.18 : 0.11);
    const wind = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => { original(shader, renderer); wind(shader, renderer); };
    depthMaterials.set(m, applyFoliageWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: m.map, alphaTest: m.alphaTest, side: THREE.DoubleSide }), surface === 'frond' ? 0.18 : 0.11));
  }
  materials.set(key, m);
  return m;
}

const CELL = 14;
const DUMMY = new THREE.Object3D();
const TINT = new THREE.Color();
export function updateFlora(time) { FOLIAGE_TIME.value = time; }

/** Instanced vegetation for one chunk. */
export function floraMeshes(world, chunk, density = 1) {
  const { ox, oz } = chunk;
  const placed = new Map(); // type -> [{x,y,z,s,r}]
  const region = chunk.oz + CHUNK / 2 > NORTH_EDGE ? 'lagos' : biomeAt(ox + CHUNK / 2, oz + CHUNK / 2);
  for (let gz = 0; gz < CHUNK; gz += CELL) {
    for (let gx = 0; gx < CHUNK; gx += CELL) {
      const x = ox + gx + hash2(ox + gx, oz + gz) * CELL;
      const z = oz + gz + hash2(oz + gz + 7, ox + gx) * CELL;
      const code = world.groundAt(x, z);
      if (code === GROUND.WATER) continue;
      let mixName;
      if (z > NORTH_EDGE) {
        mixName = { [GROUND.PARK]: 'park', [GROUND.RESIDENTIAL]: 'residential', [GROUND.COMMERCIAL]: 'commercial', [GROUND.INDUSTRIAL]: 'commercial', [GROUND.WOOD]: 'wood', [GROUND.WETLAND]: 'wetland', [GROUND.SAND]: 'desert' }[code] ?? 'land';
      } else mixName = biomeAt(x, z);
      const mix = MIX[mixName];
      // Clumps and clearings.
      const clump = 0.4 + 1.2 * fbm(x * 0.008, z * 0.008, 2);
      if (hash2(x * 1.7, z * 2.3) > mix.density * clump * density) continue;
      // Pick a type.
      let roll = hash2(x * 3.1, z * 0.7);
      let type = mix.types[0][0];
      for (const [t, w] of mix.types) {
        roll -= w;
        if (roll <= 0) {
          type = t;
          break;
        }
      }
      if (blocked(world, chunk, x, z, type === 'grass' ? 1 : 2.5)) continue;
      const y = world.terrainHeight(x, z);
      if (y < -0.4) continue;
      if (!placed.has(type)) placed.set(type, []);
      placed.get(type).push({ x: x - ox, y, z: z - oz, s: 0.75 + hash2(x, z * 3) * 0.7, r: hash2(z, x) * Math.PI * 2 });
    }
  }

  const colours = COLOURS[region] ?? COLOURS.forest;
  const meshes = [];
  for (const [type, list] of placed) {
    for (const part of kitParts(type)) {
      const colour = part.fixed ?? (part.slot === 'b' ? colours.b : colours.a);
      const mesh = new THREE.InstancedMesh(part.geometry, material(part.surface, colour), list.length);
      if (depthMaterials.has(mesh.material)) mesh.customDepthMaterial = depthMaterials.get(mesh.material);
      list.forEach((p, i) => {
        DUMMY.position.set(p.x, p.y, p.z);
        DUMMY.rotation.set(0, p.r, 0);
        DUMMY.scale.setScalar(p.s * (type === 'baobab' ? 1.4 : 1));
        DUMMY.updateMatrix();
        mesh.setMatrixAt(i, DUMMY.matrix);
        const variation = hash2(p.x + ox, p.z + oz);
        TINT.setRGB(0.88 + variation * 0.16, 0.91 + variation * 0.09, 0.83 + variation * 0.15);
        mesh.setColorAt(i, TINT);
      });
      mesh.position.set(ox, 0, oz);
      mesh.castShadow = type !== 'grass';
      mesh.receiveShadow = true;
      meshes.push(mesh);
    }
  }
  return meshes;
}

/** True if a point is on a road or inside a building in this chunk. */
function blocked(world, chunk, x, z, margin) {
  for (const seg of chunk.index.roadsNear(x, z)) if (distToSeg(x, z, seg).dist < seg.hw + margin) return true;
  for (const b of chunk.index.buildingsNear(x, z)) {
    const [minX, minZ, maxX, maxZ] = b.box;
    if (x < minX - margin || x > maxX + margin || z < minZ - margin || z > maxZ + margin) continue;
    return true;
  }
  return false;
}

export { FOLIAGE };

/**
 * Instanced kit props at given local positions ([{ x, y, z, s, r }]), for
 * hand-placed groves (the oasis). Returns meshes positioned in the caller's frame.
 */
export function kitInstances(type, list, colours = COLOURS.forest) {
  const meshes = [];
  for (const part of kitParts(type)) {
    const colour = part.fixed ?? (part.slot === 'b' ? colours.b : colours.a);
    const mesh = new THREE.InstancedMesh(part.geometry, material(part.surface, colour), list.length);
    if (depthMaterials.has(mesh.material)) mesh.customDepthMaterial = depthMaterials.get(mesh.material);
    list.forEach((p, i) => {
      DUMMY.position.set(p.x, p.y, p.z);
      DUMMY.rotation.set(0, p.r ?? 0, 0);
      DUMMY.scale.setScalar(p.s ?? 1);
      DUMMY.updateMatrix();
      mesh.setMatrixAt(i, DUMMY.matrix);
    });
    mesh.castShadow = true;
    meshes.push(mesh);
  }
  return meshes;
}
