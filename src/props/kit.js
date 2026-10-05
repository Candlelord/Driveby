import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seg, subdiv } from './detail.js';
import { EXTRA_KIT } from './extras.js';
import { REGIONAL_KIT, MODEL_KIT } from './regional.js';
import {
  leafCards, crownCore, needleCards, coniferCore, palmFrondCards, rockGeometry, grassCards,
} from './foliage.js';

/**
 * The roadside prop kit.
 *
 * Every entry is a list of parts, each tagged with which material slot it uses:
 *   'a' — the set's primary colour (foliage, walls, rock face)
 *   'b' — the set's secondary colour (trunks, trim, shadow)
 *   'e' — the set's emissive colour (windows, neon, glow)
 *
 * Parts are pre-translated so one instance matrix (ground position + yaw +
 * scale) places the whole prop, and each part becomes its own InstancedMesh
 * sharing that matrix.
 *
 * A part may also name a `surface` — leaf, needle, frond, grass, core, bark or
 * rock — which picks the texture set and shading it gets on top of its palette
 * colour (see SURFACES in world/props.js).
 */

const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, seg(s));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

const cone = (r, h, s) => new THREE.ConeGeometry(r, h, seg(s, 5));
const ico = (r) => new THREE.IcosahedronGeometry(r, subdiv());
const dod = (r) => new THREE.DodecahedronGeometry(r, subdiv());

function at(geometry, x, y, z) {
  return geometry.translate(x, y, z);
}

/**
 * Merge parts, normalising indexing first.
 *
 * Box and cylinder geometries are indexed; polyhedra (icosahedron,
 * dodecahedron) are not. mergeGeometries refuses a mixture, and a prop that
 * combines the two — a stone wall with rubble on top — hits that immediately.
 */
function merge(parts) {
  return mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)));
}

/** A thin limb from one point to another — the basis of bare trees. */
function limb(x0, y0, z0, x1, y1, z1, radius) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dy, dz);
  const geometry = cyl(radius * 0.6, radius, length, 5).translate(0, length / 2, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx, dy, dz).normalize()
  );
  geometry.applyQuaternion(quaternion);
  return geometry.translate(x0, y0, z0);
}

function deadTreeGeometry() {
  const parts = [cyl(0.16, 0.28, 3.2, 6).translate(0, 1.6, 0)];
  const branches = [
    [0, 2.6, 0, 1.3, 4.1, 0.4],
    [0, 2.9, 0, -1.1, 4.4, -0.5],
    [0, 3.1, 0, 0.4, 4.6, 1.2],
    [1.2, 4.0, 0.35, 1.9, 4.9, 0.8],
    [-1.0, 4.3, -0.45, -1.6, 5.1, -0.2],
  ];
  for (const [x0, y0, z0, x1, y1, z1] of branches) {
    parts.push(limb(x0, y0, z0, x1, y1, z1, 0.09));
  }
  return merge(parts);
}

/**
 * A broadleaf crown as overlapping lobes at different heights, [radius, x, y, z].
 * One sphere is a lollipop; offset lobes have a silhouette. The lobes are
 * filled with leaf cards over a dark core — see foliage.js.
 */
const BROADLEAF_LOBES = [
  [1.32, 0, 2.95, 0],
  [0.94, 0.98, 2.42, 0.36],
  [0.86, -0.82, 2.58, -0.48],
  [0.72, 0.18, 3.62, -0.55],
  [0.66, -0.5, 3.3, 0.62],
];

const scaleLobes = (lobes, k, lift = 0) => lobes.map(([r, x, y, z]) => [r * k, x * k, y * k + lift, z * k]);

/** Conifer tiers, [radius, height, centre y]: shrinking toward the top. */
const CONIFER_TIERS = [
  [1.5, 2.1, 1.6],
  [1.16, 1.95, 2.65],
  [0.82, 1.8, 3.75],
];

/** A trunk that forks, rather than a plain post under a ball of leaves. */
function forkedTrunk(height = 1.9, radius = 0.19) {
  const parts = [cyl(radius * 0.8, radius * 1.25, height, 6).translate(0, height / 2, 0)];
  parts.push(limb(0, height * 0.72, 0, 0.42, height * 1.5, 0.16, 0.1));
  parts.push(limb(0, height * 0.8, 0, -0.36, height * 1.55, -0.2, 0.09));
  return merge(parts);
}

function windmillBlades() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const blade = box(0.24, 2.6, 0.08).translate(0, 1.3, 0);
    blade.rotateZ((i / 4) * Math.PI * 2);
    parts.push(blade);
  }
  return merge(parts).translate(0, 6.2, -0.5);
}

function guardrailGeometry() {
  const parts = [
    box(0.14, 1.0, 0.14).translate(-1.6, 0.5, 0),
    box(0.14, 1.0, 0.14).translate(1.6, 0.5, 0),
    box(3.6, 0.24, 0.1).translate(0, 0.85, 0),
  ];
  return merge(parts);
}

function flowerCluster() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const angle = i * 1.9;
    parts.push(
      ico(0.13).translate(
        Math.cos(angle) * 0.35,
        0.22 + (i % 3) * 0.08,
        Math.sin(angle) * 0.35
      )
    );
  }
  return merge(parts);
}

function glowPlant() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const blade = box(0.07, 1.2, 0.03).translate(0, 0.6, 0);
    blade.rotateZ((i - 1.5) * 0.22);
    parts.push(blade.translate(0, 0, (i - 1.5) * 0.09));
  }
  return merge(parts);
}

function cactusGeometry() {
  const parts = [cyl(0.42, 0.5, 4.2, 7).translate(0, 2.1, 0)];
  for (const [x, y, height] of [
    [-0.95, 2.5, 1.5],
    [0.95, 3.1, 1.2],
  ]) {
    parts.push(cyl(0.26, 0.26, 1.5, 6).rotateZ(Math.PI / 2).translate(x * 0.55, y, 0));
    parts.push(cyl(0.26, 0.3, height, 6).translate(x, y + height / 2, 0));
  }
  return merge(parts);
}

/** A dry stone wall: a low run with an uneven cap, so it is not a plain box. */
function stoneWall() {
  const parts = [box(5.2, 0.72, 0.5).translate(0, 0.36, 0)];
  for (let i = 0; i < 6; i++) {
    parts.push(
      dod(0.24).translate((i - 2.5) * 0.85, 0.76, (i % 2) * 0.06)
    );
  }
  return merge(parts);
}

/** Refinery flare stack: a lattice tower with a burning tip. */
function flareTower() {
  const parts = [cyl(0.3, 0.5, 16, 6).translate(0, 8, 0)];
  for (let i = 0; i < 3; i++) {
    parts.push(box(1.4, 0.14, 0.14).translate(0, 3 + i * 4, 0));
    parts.push(box(0.14, 0.14, 1.4).translate(0, 3 + i * 4, 0));
  }
  return merge(parts);
}

/** Red-and-white striped tower with a gallery and lamp. */
function lighthouseTower() {
  // The white bands; the red ones are a separate part so they keep their colour.
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const y = i * 3.6;
    const r0 = 1.55 - i * 0.18;
    const r1 = 1.37 - i * 0.18;
    parts.push(cyl(r1, r0, 1.8, 10).translate(0, y + 0.9, 0));
  }
  parts.push(cyl(1.15, 1.15, 0.5, 10).translate(0, 10.9, 0)); // gallery floor
  parts.push(cone(1.15, 1.3, 9).translate(0, 12.6, 0)); // cap
  return merge(parts);
}

function lighthouseBands() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const y = i * 3.6 + 1.8;
    const r0 = 1.46 - i * 0.18;
    const r1 = 1.28 - i * 0.18;
    parts.push(cyl(r1, r0, 1.8, 10).translate(0, y + 0.9, 0));
  }
  return merge(parts);
}

const lighthouseLamp = () => cyl(0.72, 0.72, 1.0, 8).translate(0, 11.6, 0);

/** A tall stack of weathered rock, for standing in the surf. */
function seaStack() {
  return merge([
    dod(2.6).scale(1, 2.6, 1).translate(0, 5.2, 0),
    dod(1.7).scale(1, 2.2, 1).translate(0.8, 10.5, 0.4),
    dod(1.0).translate(-0.4, 13.4, -0.3),
  ]);
}

function barnRoof() {
  const roof = cyl(0.01, 1.6, 3.4, 3).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
  return roof.translate(0, 2.5, 0);
}

/**
 * Prop definitions. `spread` is how far off the road the type likes to sit and
 * `jitter` how much that varies, so palms can hug a beach while skyline towers
 * stay back.
 */
const CORE_KIT = {
  round: {
    parts: [
      { geometry: () => leafCards(BROADLEAF_LOBES, { seed: 11 }), material: 'a', surface: 'leaf' },
      { geometry: () => crownCore(BROADLEAF_LOBES), material: 'a', surface: 'core' },
      { geometry: () => forkedTrunk(1.9, 0.19), material: 'b', surface: 'bark' },
    ],
    spread: 15,
    jitter: 26,
  },
  pine: {
    parts: [
      { geometry: () => needleCards(CONIFER_TIERS, { seed: 4 }), material: 'a', surface: 'needle' },
      { geometry: () => coniferCore(CONIFER_TIERS), material: 'a', surface: 'core' },
      { geometry: () => at(cyl(0.15, 0.24, 4.4, 7), 0, 2.2, 0), material: 'b', surface: 'bark' },
    ],
    spread: 12,
    jitter: 24,
  },
  deadTree: {
    parts: [{ geometry: deadTreeGeometry, material: 'b', surface: 'bark' }],
    spread: 15,
    jitter: 30,
  },
  palm: {
    parts: [
      { geometry: () => at(cyl(0.2, 0.32, 5.4, 9), 0, 2.7, 0), material: 'b', surface: 'bark' },
      { geometry: () => palmFrondCards(10, 5.4, 3.0), material: 'a', surface: 'frond' },
    ],
    spread: 13,
    jitter: 12,
  },
  redwood: {
    parts: [
      { geometry: () => at(cyl(1.0, 1.5, 22, 12), 0, 11, 0), material: 'b', surface: 'bark' },
      {
        geometry: () => needleCards([[3.0, 5, 21], [2.6, 4.6, 24.2], [1.9, 4, 27.4]], { seed: 8, density: 1.4 }),
        material: 'a',
        surface: 'needle',
      },
      { geometry: () => coniferCore([[3.0, 5, 21], [2.6, 4.6, 24.2], [1.9, 4, 27.4]]), material: 'a', surface: 'core' },
    ],
    spread: 12,
    jitter: 14,
  },
  birch: {
    parts: [
      // Slimmer and higher than the broadleaf — birches carry their crown up top.
      { geometry: () => leafCards(scaleLobes(BROADLEAF_LOBES, 0.78, 3.1), { seed: 17, size: 1.0 }), material: 'a', surface: 'leaf' },
      { geometry: () => crownCore(scaleLobes(BROADLEAF_LOBES, 0.78, 3.1)), material: 'a', surface: 'core' },
      { geometry: () => at(cyl(0.11, 0.17, 6.8, 8), 0, 3.4, 0), material: 'b', surface: 'bark' },
    ],
    spread: 12,
    jitter: 24,
  },
  lavender: {
    parts: [{ geometry: () => grassCards(7, 1.8, 1.1, 53), material: 'a', surface: 'grass' }],
    spread: 11,
    jitter: 30,
  },
  wall: {
    // 5.2 long on a single-slot stride (4.5u), so sections overlap slightly and
    // the run reads as continuous drystone rather than as separate blocks.
    stride: 1,
    parts: [{ geometry: stoneWall, material: 'b', surface: 'rock' }],
    spread: 12.5,
    jitter: 0,
  },
  flare: {
    parts: [
      { geometry: flareTower, material: 'b' },
      { geometry: () => at(ico(0.9), 0, 16.6, 0), material: 'e' },
    ],
    spread: 34,
    jitter: 44,
  },
  tank: {
    parts: [
      { geometry: () => at(cyl(3.2, 3.2, 4.6, 12), 0, 2.3, 0), material: 'a' },
      { geometry: () => at(cyl(3.35, 3.35, 0.35, 12), 0, 4.7, 0), material: 'b' },
    ],
    spread: 26,
    jitter: 30,
  },
  lighthouse: {
    scale: 0.9,
    parts: [
      { geometry: lighthouseTower, color: 0xf2ede2 },
      { geometry: lighthouseBands, color: 0xc4402e },
      { geometry: lighthouseLamp, material: 'e' },
    ],
    spread: 55,
    jitter: 45,
  },
  seaStack: {
    parts: [{ geometry: seaStack, material: 'b', surface: 'rock' }],
    spread: 40,
    jitter: 55,
  },
  cactus: {
    parts: [{ geometry: cactusGeometry, material: 'a' }],
    spread: 15,
    jitter: 26,
  },
  rock: {
    parts: [{ geometry: () => at(rockGeometry(1.3, 3, 0.65), 0, 0.35, 0), material: 'b', surface: 'rock' }],
    spread: 15,
    jitter: 28,
  },
  boulder: {
    parts: [{ geometry: () => at(rockGeometry(2.6, 7, 0.72), 0, 0.7, 0), material: 'b', surface: 'rock' }],
    spread: 17,
    jitter: 26,
  },
  building: {
    parts: [
      { geometry: () => at(box(1, 1, 1), 0, 0.5, 0), material: 'a', surface: 'facade', stretch: true },
      { geometry: () => at(box(1.03, 0.03, 1.03), 0, 0.62, 0), material: 'e', stretch: true },
    ],
    spread: 18,
    jitter: 30,
    stretch: { footprint: [3.2, 6.6], height: [7, 23] },
  },
  tower: {
    parts: [
      { geometry: () => at(box(1, 1, 1), 0, 0.5, 0), material: 'a', surface: 'tower', stretch: true },
      { geometry: () => at(box(1.04, 0.02, 1.04), 0, 0.78, 0), material: 'e', stretch: true },
    ],
    spread: 42,
    jitter: 90,
    stretch: { footprint: [5, 11], height: [22, 62] },
  },
  warehouse: {
    parts: [
      { geometry: () => at(box(1, 1, 1), 0, 0.5, 0), material: 'a', surface: 'industrial', stretch: true },
      { geometry: () => at(box(1.05, 0.04, 0.06), 0, 0.86, 0), material: 'e', stretch: true },
    ],
    spread: 20,
    jitter: 22,
    stretch: { footprint: [6, 10], height: [4, 7] },
  },
  silo: {
    parts: [
      { geometry: () => at(cyl(1.1, 1.1, 7, 9), 0, 3.5, 0), material: 'a' },
      { geometry: () => at(cone(1.25, 1.4, 9), 0, 7.7, 0), material: 'b' },
    ],
    spread: 24,
    jitter: 34,
  },
  barn: {
    parts: [
      { geometry: () => at(box(4.4, 2.6, 3.4), 0, 1.3, 0), material: 'a' },
      { geometry: barnRoof, material: 'b' },
    ],
    spread: 26,
    jitter: 30,
  },
  farmhouse: {
    parts: [
      { geometry: () => at(box(3.2, 2.4, 2.8), 0, 1.2, 0), material: 'a' },
      { geometry: () => at(cone(2.6, 1.5, 4), 0, 3.1, 0), material: 'b' },
      { geometry: () => at(box(0.5, 0.4, 0.06), -0.8, 1.4, -1.44), material: 'e' },
      { geometry: () => at(box(0.5, 0.4, 0.06), 0.8, 1.4, -1.44), material: 'e' },
    ],
    spread: 30,
    jitter: 40,
  },
  pole: {
    parts: [
      { geometry: () => at(cyl(0.14, 0.19, 8, 5), 0, 4, 0), material: 'b' },
      { geometry: () => at(box(2.2, 0.14, 0.14), 0, 7.3, 0), material: 'b' },
      { geometry: () => at(box(1.6, 0.12, 0.12), 0, 6.7, 0), material: 'b' },
    ],
    spread: 11,
    jitter: 4,
  },
  windmill: {
    parts: [
      { geometry: () => at(cone(1.1, 6.4, 6), 0, 3.2, 0), material: 'a' },
      { geometry: windmillBlades, material: 'b' },
    ],
    spread: 30,
    jitter: 40,
  },
  guardrail: {
    stride: 1,
    parts: [{ geometry: guardrailGeometry, material: 'b' }],
    spread: 10.5,
    jitter: 0,
  },
  grass: {
    parts: [{ geometry: () => grassCards(4, 1.3, 1.1, 21), material: 'a', surface: 'grass' }],
    spread: 11,
    jitter: 30,
  },
  flowers: {
    parts: [{ geometry: flowerCluster, material: 'e' }],
    spread: 12,
    jitter: 26,
  },
  glowPlant: {
    parts: [{ geometry: glowPlant, material: 'e' }],
    spread: 11,
    jitter: 22,
  },
};

/** Trees and landforms in kit.js, everything smaller in extras.js, route regions in regional.js. */
export const PROP_KIT = { ...CORE_KIT, ...EXTRA_KIT, ...REGIONAL_KIT };

export { MODEL_KIT };
export const PROP_NAMES = Object.keys(PROP_KIT);
