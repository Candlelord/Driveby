import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
 */

const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

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
 * A conifer as stacked, shrinking tiers rather than one cone.
 *
 * The single-cone tree is the thing that most gives a low-poly scene away —
 * three tiers cost eight more triangles and read as an actual species.
 */
function conifer() {
  const parts = [];
  for (const [radius, height, y] of [
    [1.5, 2.1, 1.6],
    [1.16, 1.95, 2.65],
    [0.82, 1.8, 3.75],
  ]) {
    parts.push(new THREE.ConeGeometry(radius, height, 7).translate(0, y, 0));
  }
  return merge(parts);
}

/**
 * A broadleaf canopy as overlapping lobes at different heights. One sphere is
 * a lollipop; four offset lobes have a silhouette.
 */
function broadleaf(scale = 1) {
  const lobes = [
    [1.32, 0, 2.95, 0],
    [0.94, 0.98, 2.42, 0.36],
    [0.86, -0.82, 2.58, -0.48],
    [0.72, 0.18, 3.62, -0.55],
    [0.66, -0.5, 3.3, 0.62],
  ];
  return merge(
    lobes.map(([r, x, y, z]) =>
      new THREE.IcosahedronGeometry(r * scale, 0).translate(x * scale, y * scale, z * scale)
    )
  );
}

/** A trunk that forks, rather than a plain post under a ball of leaves. */
function forkedTrunk(height = 1.9, radius = 0.19) {
  const parts = [cyl(radius * 0.8, radius * 1.25, height, 6).translate(0, height / 2, 0)];
  parts.push(limb(0, height * 0.72, 0, 0.42, height * 1.5, 0.16, 0.1));
  parts.push(limb(0, height * 0.8, 0, -0.36, height * 1.55, -0.2, 0.09));
  return merge(parts);
}

function palmFronds() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    // Two segments per frond, the outer one angled down, so they arch over.
    const inner = box(0.3, 0.08, 1.3).translate(0, 0, -0.65);
    inner.rotateX(-0.3);
    const outer = box(0.22, 0.07, 1.3).translate(0, 0, -0.65);
    outer.rotateX(0.42);
    outer.translate(0, -0.38, -1.24);
    const frond = merge([inner, outer]);
    frond.rotateY(angle);
    parts.push(frond.translate(0, 5.4, 0));
  }
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

function grassTuft() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const blade = box(0.06, 0.9, 0.02).translate(0, 0.45, 0);
    blade.rotateZ((Math.random() - 0.5) * 0.5);
    blade.rotateY(i * 1.3);
    parts.push(blade.translate((i - 2) * 0.12, 0, (i % 2) * 0.1));
  }
  return merge(parts);
}

function flowerCluster() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const angle = i * 1.9;
    parts.push(
      new THREE.IcosahedronGeometry(0.13, 0).translate(
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

function lavenderClump() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const stalk = box(0.5, 0.7, 0.22).translate((i - 1.5) * 0.34, 0.35, 0);
    parts.push(stalk);
  }
  return merge(parts);
}

/** A dry stone wall: a low run with an uneven cap, so it is not a plain box. */
function stoneWall() {
  const parts = [box(5.2, 0.72, 0.5).translate(0, 0.36, 0)];
  for (let i = 0; i < 6; i++) {
    parts.push(
      new THREE.DodecahedronGeometry(0.24, 0).translate((i - 2.5) * 0.85, 0.76, (i % 2) * 0.06)
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

function barnRoof() {
  const roof = cyl(0.01, 1.6, 3.4, 3).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
  return roof.translate(0, 2.5, 0);
}

/**
 * Prop definitions. `spread` is how far off the road the type likes to sit and
 * `jitter` how much that varies, so palms can hug a beach while skyline towers
 * stay back.
 */
export const PROP_KIT = {
  round: {
    parts: [
      { geometry: () => broadleaf(1), material: 'a' },
      { geometry: () => forkedTrunk(1.9, 0.19), material: 'b' },
    ],
    spread: 15,
    jitter: 26,
  },
  pine: {
    parts: [
      { geometry: conifer, material: 'a' },
      { geometry: () => at(cyl(0.15, 0.24, 1.7, 6), 0, 0.85, 0), material: 'b' },
    ],
    spread: 12,
    jitter: 24,
  },
  deadTree: {
    parts: [{ geometry: deadTreeGeometry, material: 'b' }],
    spread: 15,
    jitter: 30,
  },
  palm: {
    parts: [
      { geometry: () => at(cyl(0.22, 0.34, 5.4), 0, 2.7, 0), material: 'b' },
      { geometry: palmFronds, material: 'a' },
    ],
    spread: 13,
    jitter: 12,
  },
  redwood: {
    parts: [
      { geometry: () => at(cyl(1.0, 1.5, 22, 8), 0, 11, 0), material: 'b' },
      { geometry: () => at(new THREE.ConeGeometry(3.0, 9, 7), 0, 24, 0), material: 'a' },
    ],
    spread: 12,
    jitter: 14,
  },
  birch: {
    parts: [
      // Slimmer and higher than the broadleaf — birches carry their crown up top.
      { geometry: () => broadleaf(0.78).translate(0, 3.1, 0), material: 'a' },
      { geometry: () => at(cyl(0.11, 0.17, 6.8, 5), 0, 3.4, 0), material: 'b' },
    ],
    spread: 12,
    jitter: 24,
  },
  lavender: {
    parts: [{ geometry: lavenderClump, material: 'a' }],
    spread: 11,
    jitter: 30,
  },
  wall: {
    parts: [{ geometry: stoneWall, material: 'b' }],
    spread: 12.5,
    jitter: 3,
  },
  flare: {
    parts: [
      { geometry: flareTower, material: 'b' },
      { geometry: () => at(new THREE.IcosahedronGeometry(0.9, 0), 0, 16.6, 0), material: 'e' },
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
  cactus: {
    parts: [{ geometry: cactusGeometry, material: 'a' }],
    spread: 15,
    jitter: 26,
  },
  rock: {
    parts: [{ geometry: () => at(new THREE.DodecahedronGeometry(1.3, 0), 0, 0.45, 0), material: 'b' }],
    spread: 15,
    jitter: 28,
  },
  boulder: {
    parts: [{ geometry: () => at(new THREE.IcosahedronGeometry(2.6, 0), 0, 0.9, 0), material: 'b' }],
    spread: 17,
    jitter: 26,
  },
  building: {
    parts: [
      { geometry: () => at(box(1, 1, 1), 0, 0.5, 0), material: 'a', stretch: true },
      { geometry: () => at(box(1.03, 0.03, 1.03), 0, 0.62, 0), material: 'e', stretch: true },
    ],
    spread: 18,
    jitter: 30,
    stretch: { footprint: [3.2, 6.6], height: [7, 23] },
  },
  tower: {
    parts: [
      { geometry: () => at(box(1, 1, 1), 0, 0.5, 0), material: 'a', stretch: true },
      { geometry: () => at(box(1.04, 0.02, 1.04), 0, 0.78, 0), material: 'e', stretch: true },
    ],
    spread: 42,
    jitter: 90,
    stretch: { footprint: [5, 11], height: [22, 62] },
  },
  warehouse: {
    parts: [
      { geometry: () => at(box(1, 1, 1), 0, 0.5, 0), material: 'a', stretch: true },
      { geometry: () => at(box(1.05, 0.04, 0.06), 0, 0.86, 0), material: 'e', stretch: true },
    ],
    spread: 20,
    jitter: 22,
    stretch: { footprint: [6, 10], height: [4, 7] },
  },
  silo: {
    parts: [
      { geometry: () => at(cyl(1.1, 1.1, 7, 9), 0, 3.5, 0), material: 'a' },
      { geometry: () => at(new THREE.ConeGeometry(1.25, 1.4, 9), 0, 7.7, 0), material: 'b' },
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
      { geometry: () => at(new THREE.ConeGeometry(2.6, 1.5, 4), 0, 3.1, 0), material: 'b' },
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
      { geometry: () => at(new THREE.ConeGeometry(1.1, 6.4, 6), 0, 3.2, 0), material: 'a' },
      { geometry: windmillBlades, material: 'b' },
    ],
    spread: 30,
    jitter: 40,
  },
  guardrail: {
    parts: [{ geometry: guardrailGeometry, material: 'b' }],
    spread: 10.5,
    jitter: 1.5,
  },
  grass: {
    parts: [{ geometry: grassTuft, material: 'a' }],
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

export const PROP_NAMES = Object.keys(PROP_KIT);
