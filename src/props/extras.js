import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The second half of the prop kit: the small stuff that makes a roadside look
 * lived-in rather than landscaped. Same contract as kit.js — parts tagged
 * 'a' (primary), 'b' (secondary) or 'e' (emissive), pre-translated so one
 * instance matrix places the whole thing.
 */

const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function merge(parts) {
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}
const at = (g, x, y, z) => g.translate(x, y, z);

// --- roadside furniture -----------------------------------------------------

const signpost = () =>
  merge([cyl(0.09, 0.11, 3.4, 5).translate(0, 1.7, 0), cyl(0.09, 0.11, 3.4, 5).translate(0.8, 1.7, 0)]);
const signFace = () => box(2.6, 1.7, 0.12).translate(0.4, 3.0, 0);

const mileMarker = () =>
  merge([box(0.34, 1.4, 0.16).translate(0, 0.7, 0), box(0.44, 0.34, 0.2).translate(0, 1.22, 0)]);

const billboardFrame = () =>
  merge([
    cyl(0.16, 0.2, 7, 5).translate(-2.6, 3.5, 0),
    cyl(0.16, 0.2, 7, 5).translate(2.6, 3.5, 0),
    box(11, 0.3, 0.4).translate(0, 6.9, 0),
  ]);
const billboardFace = () => box(10.4, 4.6, 0.22).translate(0, 8.6, 0);

function railFence() {
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(box(0.16, 1.3, 0.16).translate((i - 1.5) * 2.6, 0.65, 0));
  parts.push(box(8, 0.16, 0.1).translate(0, 1.05, 0));
  parts.push(box(8, 0.16, 0.1).translate(0, 0.6, 0));
  return merge(parts);
}

function hedgeRun() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    parts.push(new THREE.IcosahedronGeometry(1.05, 0).translate((i - 1.5) * 1.7, 0.85, 0));
  }
  return merge(parts);
}

const shrub = () =>
  merge([
    new THREE.IcosahedronGeometry(0.78, 0).translate(0, 0.62, 0),
    new THREE.IcosahedronGeometry(0.54, 0).translate(0.55, 0.44, 0.24),
  ]);

function reeds() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const blade = box(0.05, 1.7, 0.05).translate(0, 0.85, 0);
    blade.rotateZ((i - 3) * 0.09);
    parts.push(blade.translate((i - 3) * 0.16, 0, (i % 3) * 0.14));
  }
  return merge(parts);
}

// --- agriculture ------------------------------------------------------------

const hayBale = () => cyl(0.95, 0.95, 2.2, 9).rotateZ(Math.PI / 2).translate(0, 0.95, 0);

const waterTowerLegs = () => {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    parts.push(cyl(0.13, 0.16, 9, 4).translate(Math.cos(angle) * 1.9, 4.5, Math.sin(angle) * 1.9));
  }
  parts.push(box(4.4, 0.2, 0.2).translate(0, 5, 0));
  parts.push(box(0.2, 0.2, 4.4).translate(0, 5, 0));
  return merge(parts);
};
const waterTowerTank = () =>
  merge([cyl(2.7, 2.7, 3.4, 10).translate(0, 10.7, 0), new THREE.ConeGeometry(2.9, 1.5, 10).translate(0, 13.1, 0)]);

const windTurbineTower = () => cyl(0.4, 0.8, 26, 8).translate(0, 13, 0);
function windTurbineBlades() {
  const parts = [box(0.5, 0.3, 1.2).translate(0, 0, -0.6)];
  for (let i = 0; i < 3; i++) {
    const blade = box(0.5, 11, 0.16).translate(0, 5.5, 0);
    blade.rotateZ((i / 3) * Math.PI * 2);
    parts.push(blade);
  }
  return merge(parts).translate(0, 26, -0.9);
}

function scarecrow() {
  return merge([
    cyl(0.09, 0.11, 2.6, 5).translate(0, 1.3, 0),
    box(1.9, 0.14, 0.14).translate(0, 2.0, 0),
    box(0.62, 0.7, 0.4).translate(0, 2.55, 0),
    new THREE.ConeGeometry(0.55, 0.4, 7).translate(0, 3.05, 0),
  ]);
}

function cattle() {
  return merge([
    box(2.3, 1.15, 0.95).translate(0, 1.25, 0),
    box(0.75, 0.62, 0.62).translate(1.35, 1.5, 0),
    ...[-0.8, 0.8].flatMap((x) =>
      [-0.35, 0.35].map((z) => box(0.2, 0.75, 0.2).translate(x, 0.38, z))
    ),
  ]);
}

// --- industry and coast -----------------------------------------------------

const barrel = () => cyl(0.5, 0.5, 1.3, 8).translate(0, 0.65, 0);
const crateStack = () =>
  merge([
    box(1.3, 1.3, 1.3).translate(0, 0.65, 0),
    box(1.1, 1.1, 1.1).translate(0.25, 1.85, -0.15),
  ]);

const satelliteDishBase = () => merge([cyl(0.16, 0.22, 2.2, 5).translate(0, 1.1, 0)]);
const satelliteDishFace = () => {
  const dish = new THREE.SphereGeometry(1.5, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
  return dish.rotateX(Math.PI * 0.72).translate(0, 2.9, 0);
};

function antennaMast() {
  const parts = [cyl(0.14, 0.3, 22, 4).translate(0, 11, 0)];
  for (let i = 0; i < 5; i++) {
    parts.push(box(2.2 - i * 0.32, 0.12, 0.12).translate(0, 3 + i * 4, 0));
  }
  return merge(parts);
}
const antennaLight = () => new THREE.IcosahedronGeometry(0.35, 0).translate(0, 22.4, 0);

const pierPost = () =>
  merge([cyl(0.28, 0.34, 4.6, 6).translate(0, 2.3, 0), box(1.1, 0.24, 1.1).translate(0, 4.5, 0)]);

const buoy = () =>
  merge([cyl(0.55, 0.75, 1.5, 7).translate(0, 0.75, 0), new THREE.ConeGeometry(0.4, 0.8, 6).translate(0, 1.85, 0)]);

// --- rest and camp ----------------------------------------------------------

function picnicTable() {
  return merge([
    box(2.6, 0.14, 1.1).translate(0, 0.85, 0),
    box(2.6, 0.12, 0.4).translate(0, 0.48, 0.85),
    box(2.6, 0.12, 0.4).translate(0, 0.48, -0.85),
    box(0.14, 0.85, 1.9).translate(-1.1, 0.42, 0),
    box(0.14, 0.85, 1.9).translate(1.1, 0.42, 0),
  ]);
}

const tent = () => {
  const body = new THREE.CylinderGeometry(0.02, 1.9, 3.2, 3).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
  return body.translate(0, 1.15, 0);
};

const campStones = () => {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    parts.push(new THREE.DodecahedronGeometry(0.28, 0).translate(Math.cos(angle) * 0.85, 0.18, Math.sin(angle) * 0.85));
  }
  return merge(parts);
};
const campFlame = () => new THREE.ConeGeometry(0.42, 1.1, 5).translate(0, 0.6, 0);

const roadCone = () =>
  merge([box(0.52, 0.08, 0.52).translate(0, 0.04, 0), new THREE.ConeGeometry(0.24, 0.85, 6).translate(0, 0.48, 0)]);

const barrier = () =>
  merge([box(2.4, 0.75, 0.5).translate(0, 0.38, 0), box(2.4, 0.16, 0.62).translate(0, 0.8, 0)]);

const mailbox = () =>
  merge([cyl(0.06, 0.08, 1.2, 4).translate(0, 0.6, 0), box(0.3, 0.34, 0.55).translate(0, 1.35, 0)]);

const busShelterFrame = () =>
  merge([
    cyl(0.09, 0.09, 2.5, 4).translate(-1.4, 1.25, 0),
    cyl(0.09, 0.09, 2.5, 4).translate(1.4, 1.25, 0),
    box(3.2, 0.16, 1.6).translate(0, 2.55, 0),
    box(3.0, 1.4, 0.1).translate(0, 1.3, -0.75),
  ]);
const busShelterPanel = () => box(0.9, 0.6, 0.06).translate(1.0, 1.7, 0.02);

export const EXTRA_KIT = {
  sign: { parts: [{ geometry: signpost, material: 'b' }, { geometry: signFace, material: 'e' }], spread: 11, jitter: 4 },
  mileMarker: { parts: [{ geometry: mileMarker, material: 'e' }], spread: 10.5, jitter: 1.5 },
  billboard: {
    scale: 0.75,
    parts: [{ geometry: billboardFrame, material: 'b' }, { geometry: billboardFace, material: 'e' }],
    spread: 17,
    jitter: 8,
  },
  fence: { parts: [{ geometry: railFence, material: 'b' }], spread: 12, jitter: 3 },
  hedge: { parts: [{ geometry: hedgeRun, material: 'a' }], spread: 12, jitter: 6 },
  shrub: { parts: [{ geometry: shrub, material: 'a' }], spread: 11, jitter: 28 },
  reeds: { parts: [{ geometry: reeds, material: 'a' }], spread: 11, jitter: 18 },
  hayBale: { parts: [{ geometry: hayBale, material: 'a' }], spread: 16, jitter: 26 },
  waterTower: {
    scale: 0.62,
    parts: [{ geometry: waterTowerLegs, material: 'b' }, { geometry: waterTowerTank, material: 'a' }],
    spread: 26,
    jitter: 30,
  },
  windTurbine: {
    scale: 0.5,
    parts: [{ geometry: windTurbineTower, material: 'a' }, { geometry: windTurbineBlades, material: 'a' }],
    spread: 46,
    jitter: 70,
  },
  scarecrow: { parts: [{ geometry: scarecrow, material: 'b' }], spread: 18, jitter: 26 },
  cattle: { parts: [{ geometry: cattle, material: 'b' }], spread: 22, jitter: 30 },
  barrel: { parts: [{ geometry: barrel, material: 'b' }], spread: 13, jitter: 12 },
  crates: { parts: [{ geometry: crateStack, material: 'b' }], spread: 14, jitter: 14 },
  dish: {
    scale: 0.8,
    parts: [{ geometry: satelliteDishBase, material: 'b' }, { geometry: satelliteDishFace, material: 'a' }],
    spread: 20,
    jitter: 22,
  },
  antenna: {
    scale: 0.6,
    parts: [{ geometry: antennaMast, material: 'b' }, { geometry: antennaLight, material: 'e' }],
    spread: 34,
    jitter: 48,
  },
  pierPost: { parts: [{ geometry: pierPost, material: 'b' }], spread: 15, jitter: 18 },
  buoy: { parts: [{ geometry: buoy, material: 'e' }], spread: 26, jitter: 30 },
  picnicTable: { parts: [{ geometry: picnicTable, material: 'b' }], spread: 13, jitter: 10 },
  tent: { parts: [{ geometry: tent, material: 'a' }], spread: 16, jitter: 18 },
  campfire: {
    parts: [{ geometry: campStones, material: 'b' }, { geometry: campFlame, material: 'e' }],
    spread: 15,
    jitter: 16,
  },
  cone: { parts: [{ geometry: roadCone, material: 'e' }], spread: 9.5, jitter: 1.2 },
  barrier: { parts: [{ geometry: barrier, material: 'e' }], spread: 10, jitter: 1.5 },
  mailbox: { parts: [{ geometry: mailbox, material: 'b' }], spread: 10.5, jitter: 3 },
  busShelter: {
    scale: 0.85,
    parts: [{ geometry: busShelterFrame, material: 'b' }, { geometry: busShelterPanel, material: 'e' }],
    spread: 11.5,
    jitter: 2,
  },
};
