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
  return mergeGeometries(parts);
}

function palmFronds() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const frond = box(0.28, 0.07, 2.3).translate(0, 0, -1.15);
    frond.rotateX(-0.45);
    frond.rotateY(angle);
    parts.push(frond.translate(0, 5.4, 0));
  }
  return mergeGeometries(parts);
}

function windmillBlades() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const blade = box(0.24, 2.6, 0.08).translate(0, 1.3, 0);
    blade.rotateZ((i / 4) * Math.PI * 2);
    parts.push(blade);
  }
  return mergeGeometries(parts).translate(0, 6.2, -0.5);
}

function guardrailGeometry() {
  const parts = [
    box(0.14, 1.0, 0.14).translate(-1.6, 0.5, 0),
    box(0.14, 1.0, 0.14).translate(1.6, 0.5, 0),
    box(3.6, 0.24, 0.1).translate(0, 0.85, 0),
  ];
  return mergeGeometries(parts);
}

function grassTuft() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const blade = box(0.06, 0.9, 0.02).translate(0, 0.45, 0);
    blade.rotateZ((Math.random() - 0.5) * 0.5);
    blade.rotateY(i * 1.3);
    parts.push(blade.translate((i - 2) * 0.12, 0, (i % 2) * 0.1));
  }
  return mergeGeometries(parts);
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
  return mergeGeometries(parts);
}

function glowPlant() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const blade = box(0.07, 1.2, 0.03).translate(0, 0.6, 0);
    blade.rotateZ((i - 1.5) * 0.22);
    parts.push(blade.translate(0, 0, (i - 1.5) * 0.09));
  }
  return mergeGeometries(parts);
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
  return mergeGeometries(parts);
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
      { geometry: () => at(new THREE.IcosahedronGeometry(1.55, 0), 0, 2.7, 0), material: 'a' },
      { geometry: () => at(cyl(0.17, 0.2, 1.35), 0, 0.68, 0), material: 'b' },
    ],
    spread: 16,
    jitter: 24,
  },
  pine: {
    parts: [
      { geometry: () => at(new THREE.ConeGeometry(1.15, 3.8, 6), 0, 2.9, 0), material: 'a' },
      { geometry: () => at(cyl(0.17, 0.2, 1.35), 0, 0.68, 0), material: 'b' },
    ],
    spread: 13,
    jitter: 22,
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
