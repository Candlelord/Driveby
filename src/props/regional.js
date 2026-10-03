import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seg } from './detail.js';
import { leafCards, crownCore, needleCards, coniferCore, rockGeometry } from './foliage.js';

/**
 * Props for the route regions — West Africa, the Sahara, the Maghreb and
 * Europe. Same contract as kit.js: parts tagged with a palette slot (or a fixed
 * colour, for things whose colour is part of their identity), pre-translated so
 * one instance matrix places the whole prop.
 */

const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, seg(s));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function merge(parts) {
  return mergeGeometries(
    parts.map((p) => {
      const g = p.index ? p.toNonIndexed() : p;
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }
      return g;
    })
  );
}

/** A tapered limb from one point to another. */
function limb(x0, y0, z0, x1, y1, z1, radius) {
  const from = new THREE.Vector3(x0, y0, z0);
  const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
  const length = dir.length();
  const geometry = cyl(radius * 0.6, radius, length, 6).translate(0, length / 2, 0);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  return geometry.translate(from.x, from.y, from.z);
}

// --- trees ------------------------------------------------------------------

/**
 * Baobab: the bottle trunk is the whole silhouette — swollen, almost as wide
 * as it is tall, with short stubby branches and only a thin crown.
 */
const BAOBAB_TIPS = [
  [1.9, 7.6, 0.6], [-1.7, 7.9, -0.8], [0.4, 8.4, 1.8], [-0.6, 8.2, -2.0], [2.2, 7.2, -1.2], [-2.3, 7.0, 1.0],
];
function baobabTrunk() {
  const profile = [
    [0.01, 0], [2.1, 0], [2.35, 1.2], [2.25, 3.2], [1.85, 5.2], [1.25, 6.6], [0.9, 7.2], [0.01, 7.3],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const parts = [new THREE.LatheGeometry(profile, seg(14, 8))];
  for (const [x, y, z] of BAOBAB_TIPS) parts.push(limb(x * 0.25, 6.6, z * 0.25, x, y, z, 0.32));
  return merge(parts);
}
const baobabLobes = () => BAOBAB_TIPS.map(([x, y, z]) => [0.85, x, y + 0.35, z]);

/** Umbrella thorn acacia: a leaning trunk under a flat, wide crown. */
const ACACIA_LOBES = [
  [2.2, 0.3, 4.6, 0], [1.7, 2.1, 4.4, 0.6], [1.6, -1.8, 4.5, -0.4], [1.4, 0.6, 4.7, 1.8], [1.3, -0.4, 4.4, -1.9],
];
function acaciaTrunk() {
  return merge([
    limb(0, 0, 0, 0.3, 3.0, 0.1, 0.24),
    limb(0.3, 2.8, 0.1, 2.0, 4.3, 0.5, 0.14),
    limb(0.3, 2.8, 0.1, -1.7, 4.3, -0.4, 0.14),
    limb(0.3, 2.9, 0.1, 0.5, 4.5, 1.6, 0.12),
  ]);
}
// Flatten the crown into a canopy plate.
const flatCrown = (geometry) => geometry.scale(1, 0.32, 1).translate(0, 3.1, 0);

/** Italian cypress: a tall dark spire, from Provence to the Algerian coast. */
const CYPRESS_TIERS = [
  [0.95, 3.2, 2.2], [0.85, 3.0, 4.4], [0.65, 2.8, 6.5], [0.4, 2.4, 8.3],
];

// --- ground -----------------------------------------------------------------

/** Cathedral termite mound: a tall lumpy spire with a couple of buttresses. */
function termiteMound() {
  return merge([
    rockGeometry(0.9, 11, 2.6).translate(0, 1.6, 0),
    rockGeometry(0.55, 12, 2.2).translate(0.55, 1.0, 0.2),
    rockGeometry(0.45, 13, 2.8).translate(-0.3, 2.6, -0.15),
  ]);
}

// --- buildings ----------------------------------------------------------------

/**
 * Hausa mud house: smooth rendered walls, a flat roof behind a parapet, and the
 * zanko horns standing up at each corner of the roofline.
 */
function mudHouseWalls() {
  const parts = [box(5.4, 3.2, 4.4).translate(0, 1.6, 0), box(5.6, 0.5, 4.6).translate(0, 3.4, 0)];
  // A smaller room built onto the side, as compounds grow.
  parts.push(box(2.6, 2.4, 2.8).translate(3.6, 1.2, 0.5));
  for (const [x, z] of [[-2.7, -2.2], [2.7, -2.2], [-2.7, 2.2], [2.7, 2.2]]) {
    parts.push(new THREE.ConeGeometry(0.28, 1.1, 6).translate(x, 4.15, z));
  }
  return merge(parts);
}
const mudHouseDoor = () => merge([box(1.1, 2.0, 0.1).translate(-0.6, 1.0, 2.22), box(0.6, 0.6, 0.1).translate(1.4, 2.0, 2.22)]);

/** A West African bungalow: painted block walls under a hipped zinc roof. */
function bungalowWalls() {
  return merge([box(7, 3, 5.2).translate(0, 1.5, 0), box(2.4, 0.3, 1.8).translate(0, 2.7, 3.4)]);
}
function bungalowRoof() {
  // A four-sided cone is a hip roof once it is turned square to the walls.
  const roof = new THREE.ConeGeometry(5.2, 1.8, 4, 1).rotateY(Math.PI / 4).scale(1.0, 1, 0.78);
  return merge([roof.translate(0, 3.9, 0), box(2.8, 0.12, 2.0).translate(0, 2.92, 3.4)]);
}
const bungalowTrim = () =>
  merge([
    box(1.0, 2.1, 0.08).translate(0, 1.05, 2.62),
    box(1.0, 1.0, 0.08).translate(-2.2, 1.6, 2.62),
    box(1.0, 1.0, 0.08).translate(2.2, 1.6, 2.62),
    // Veranda posts.
    cyl(0.08, 0.08, 2.7, 6).translate(-1.1, 1.35, 4.2),
    cyl(0.08, 0.08, 2.7, 6).translate(1.1, 1.35, 4.2),
  ]);

/** A roadside stall: a timber kiosk with a big sun umbrella beside it. */
const stallKiosk = () =>
  merge([box(2.2, 2.0, 1.6).translate(0, 1.0, 0), box(2.5, 0.12, 2.0).translate(0, 2.06, 0.2), box(2.2, 0.9, 0.5).translate(0, 0.45, 1.1)]);
const stallPole = () => cyl(0.04, 0.05, 2.6, 6).translate(1.9, 1.3, 1.0);
const stallUmbrella = () => new THREE.ConeGeometry(1.5, 0.55, seg(10, 8)).translate(1.9, 2.75, 1.0);

/** A neighbourhood mosque: a cube hall, a dome, and one minaret. */
function mosqueHall() {
  return merge([
    box(9, 5, 9).translate(0, 2.5, 0),
    cyl(1.3, 1.3, 1.2, 10).translate(0, 5.6, 0),
    cyl(0.85, 1.0, 14, 10).translate(5.6, 7, -3.6),
    cyl(1.25, 1.25, 0.5, 10).translate(5.6, 11.6, -3.6),
  ]);
}
function mosqueDomes() {
  const dome = (r, x, y, z) => new THREE.SphereGeometry(r, seg(14, 8), seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y, z);
  return merge([
    dome(3.4, 0, 6.2, 0),
    dome(0.95, 5.6, 14, -3.6),
    new THREE.ConeGeometry(0.12, 1.4, 6).translate(0, 10.2, 0),
    new THREE.ConeGeometry(0.08, 1.0, 6).translate(5.6, 15.4, -3.6),
  ]);
}

/**
 * A Paris apartment block: cream stone on a unit footprint (stretched per
 * instance like the city buildings, so window bays stay real-sized), with the
 * grey zinc mansard set back on top.
 */
const haussmannBody = () => box(1, 0.82, 1).translate(0, 0.41, 0);
function haussmannRoof() {
  // A truncated square pyramid: the mansard slope, flat on top.
  const mansard = new THREE.CylinderGeometry(0.5, 0.72, 0.16, 4, 1).rotateY(Math.PI / 4);
  return merge([mansard.translate(0, 0.9, 0), box(0.06, 0.08, 0.5).translate(0.25, 1.0, 0)]);
}
// The wrought-iron balcony line on the second and top floors.
const haussmannBalconies = () => merge([box(1.02, 0.012, 1.02).translate(0, 0.2, 0), box(1.02, 0.012, 1.02).translate(0, 0.74, 0)]);

/** A Dutch canal house row: tall, narrow, brick, with stepped gables. */
function canalHouses() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 4.2;
    const h = 8 + (i % 2) * 1.6;
    parts.push(box(4.1, h, 7).translate(x, h / 2, 0));
    for (let s = 0; s < 3; s++) {
      const w = 3.2 - s * 0.9;
      parts.push(box(w, 0.9, 0.5).translate(x, h + 0.45 + s * 0.9, 3.3));
    }
  }
  return merge(parts);
}

// --- Lagos -----------------------------------------------------------------

/**
 * A Lagos apartment block: three storeys of rendered concrete with balconies
 * across the front, a parapet roof, and the black plastic water tanks that sit
 * on almost every roof in the city.
 */
const lagosWalls = () => merge([box(10, 9.6, 8).translate(0, 4.8, 0), box(10.3, 0.7, 8.3).translate(0, 9.95, 0)]);
function lagosSlabs() {
  const parts = [];
  for (const floor of [1, 2]) parts.push(box(8.6, 0.22, 1.4).translate(0, floor * 3.2, 4.7));
  return merge(parts);
}
function lagosTrim() {
  const parts = [];
  for (const floor of [1, 2]) parts.push(box(8.6, 0.95, 0.08).translate(0, floor * 3.2 + 0.58, 5.36));
  // Water tanks on short steel stands.
  for (const [x, z] of [[2.6, -1.2], [-1.8, -2.4]]) {
    parts.push(cyl(0.78, 0.78, 1.6, 12).translate(x, 11.6, z));
    parts.push(box(1.6, 0.5, 1.6).translate(x, 10.55, z));
  }
  return merge(parts);
}
// Roller shutters across the ground-floor shops.
const lagosShutters = () => merge([box(3.4, 2.4, 0.1).translate(-2.4, 1.2, 4.03), box(3.4, 2.4, 0.1).translate(2.4, 1.2, 4.03)]);

/** A two-storey shop row: rusted zinc awning over the pavement, signboards above. */
const shopWalls = () => merge([box(14, 6.4, 7).translate(0, 3.2, 0), box(14.3, 0.5, 7.3).translate(0, 6.65, 0)]);
const shopAwning = () => box(14, 0.12, 2.6).rotateX(0.22).translate(0, 3.25, 4.6);
const shopSigns = () =>
  merge([-4.6, 0, 4.6].map((x) => box(3.6, 1.0, 0.12).translate(x, 4.35, 3.58)));
const shopTank = () => cyl(0.7, 0.7, 1.4, 12).translate(4.2, 7.6, -1.5);
const shopShutters = () => merge([-4.6, 0, 4.6].map((x) => box(3.6, 2.5, 0.1).translate(x, 1.25, 3.53)));

/**
 * Makoko: timber houses on stilts standing in the lagoon. Rooted on the
 * lagoon bed, which on the bridge stretch is about twelve metres below the
 * deck, so the floor clears the water by a couple of metres.
 */
function stiltPoles() {
  const parts = [];
  for (const [x, z] of [[-2.2, -1.7], [2.2, -1.7], [-2.2, 1.7], [2.2, 1.7], [0, 0]]) {
    parts.push(cyl(0.12, 0.14, 11.6, 5).translate(x, 5.8, z));
  }
  parts.push(box(5.2, 0.25, 4.2).translate(0, 11.5, 0)); // platform
  return merge(parts);
}
const stiltWalls = () => box(4.4, 2.3, 3.4).translate(0, 12.8, 0);
const stiltRoof = () => box(5.2, 0.1, 4.4).rotateX(0.12).translate(0, 14.1, 0);

// --- Paris and Kano: linear street furniture -------------------------------

/**
 * A Paris street wall: three Haussmann blocks shoulder to shoulder along local
 * X (the run system turns it to follow the road), each with its zinc mansard
 * and chimney stacks. Built at true size in metres, so the facade shader's
 * window bays come out right without any per-instance stretch.
 */
const HAUSSMANN_BLOCKS = [[-15, 17.5], [0, 18.6], [15, 17.2]];
const haussmannRowWalls = () =>
  merge(HAUSSMANN_BLOCKS.map(([x, h]) => box(14.9, h, 13).translate(x, h / 2, 0)));
function haussmannRowRoofs() {
  const parts = [];
  for (const [x, h] of HAUSSMANN_BLOCKS) {
    const shape = new THREE.Shape();
    shape.moveTo(-6.5, 0);
    shape.lineTo(6.5, 0);
    shape.lineTo(4.4, 3.8);
    shape.lineTo(-4.4, 3.8);
    shape.closePath();
    const roof = new THREE.ExtrudeGeometry(shape, { depth: 14.9, bevelEnabled: false });
    roof.rotateY(Math.PI / 2).translate(x - 7.45, h, 0);
    parts.push(roof);
    for (const cx of [-4.5, 4.5]) parts.push(box(1.2, 2.4, 0.9).translate(x + cx, h + 4.2, 0));
  }
  return merge(parts);
}
// Wrought-iron balconies on the second and fifth floors, both street faces.
function haussmannRowBalconies() {
  const parts = [];
  for (const [x, h] of HAUSSMANN_BLOCKS) {
    for (const y of [h * 0.3, h * 0.82]) {
      for (const z of [-6.62, 6.62]) parts.push(box(14.4, 0.9, 0.24).translate(x, y, z));
    }
  }
  return merge(parts);
}

/**
 * Both sides of a Paris street at once: the same three-block wall either side
 * of the carriageway, so a boulevard is lined continuously left and right
 * rather than one building at a time. Laid by the run system on the road's
 * centreline (spread 0); local Z becomes the lateral offset.
 */
const STREET_SETBACK = 19.5;
const streetSides = (build) => () =>
  merge([build().translate(0, 0, STREET_SETBACK), build().translate(0, 0, -STREET_SETBACK)]);

/**
 * Kano's old city wall: rammed earth, thick at the base, with the rounded
 * merlons along the top. Built along local X for the run system.
 */
function mudWallRun() {
  const parts = [box(14, 4.6, 2.6).translate(0, 2.3, 0), box(14, 0.6, 3.2).translate(0, 0.3, 0)];
  for (let i = 0; i < 9; i++) {
    parts.push(new THREE.CylinderGeometry(0.32, 0.55, 1.1, 7).translate(-6.4 + i * 1.6, 5.15, 0));
  }
  return merge(parts);
}

export const REGIONAL_KIT = {
  lagosBlock: {
    parts: [
      { geometry: lagosWalls, material: 'a', surface: 'facade' },
      { geometry: lagosSlabs, color: 0xb4aea2 },
      { geometry: lagosTrim, color: 0x1b1c1f },
      { geometry: lagosShutters, color: 0x6a6e72, surface: 'metal' },
    ],
    spread: 17,
    jitter: 12,
  },
  lagosBlockBlue: {
    parts: [
      { geometry: lagosWalls, color: 0x9cbccc, surface: 'facade' },
      { geometry: lagosSlabs, color: 0xb4aea2 },
      { geometry: lagosTrim, color: 0x1b1c1f },
      { geometry: lagosShutters, color: 0x6a6e72, surface: 'metal' },
    ],
    spread: 17,
    jitter: 14,
  },
  lagosShops: {
    parts: [
      { geometry: shopWalls, material: 'a', surface: 'facade' },
      { geometry: shopAwning, color: 0x7e5d4a, surface: 'metal' }, // rusted zinc
      { geometry: shopSigns, material: 'e', surface: 'screen' },
      { geometry: shopTank, color: 0x1b1c1f },
      { geometry: shopShutters, color: 0x5e6266, surface: 'metal' },
    ],
    spread: 15.5,
    jitter: 6,
  },
  stiltHouse: {
    parts: [
      { geometry: stiltPoles, color: 0x5a4a3c },
      { geometry: stiltWalls, color: 0x7a6650 },
      { geometry: stiltRoof, color: 0x7a5c48, surface: 'metal' },
    ],
    spread: 40,
    jitter: 140,
  },
  haussmannRow: {
    parts: [
      { geometry: haussmannRowWalls, material: 'a', surface: 'facade' },
      { geometry: haussmannRowRoofs, color: 0x5d646c, surface: 'metal' },
      { geometry: haussmannRowBalconies, color: 0x1e2226 },
    ],
    spread: 18.5,
    jitter: 0,
  },
  haussmannStreet: {
    parts: [
      { geometry: streetSides(haussmannRowWalls), material: 'a', surface: 'facade' },
      { geometry: streetSides(haussmannRowRoofs), color: 0x5d646c, surface: 'metal' },
      { geometry: streetSides(haussmannRowBalconies), color: 0x1e2226 },
    ],
    spread: 0,
    jitter: 0,
  },
  mudWall: {
    parts: [{ geometry: mudWallRun, color: 0xa77a52 }],
    spread: 14,
    jitter: 0,
  },
  baobab: {
    parts: [
      { geometry: baobabTrunk, material: 'b', surface: 'bark' },
      { geometry: () => leafCards(baobabLobes(), { perLobe: 9, size: 1.0, seed: 41 }), material: 'a', surface: 'leaf' },
    ],
    spread: 20,
    jitter: 40,
  },
  acacia: {
    parts: [
      { geometry: acaciaTrunk, material: 'b', surface: 'bark' },
      { geometry: () => flatCrown(leafCards(ACACIA_LOBES, { perLobe: 14, size: 1.0, seed: 43 })), material: 'a', surface: 'leaf' },
      { geometry: () => flatCrown(crownCore(ACACIA_LOBES, 0.55)), material: 'a', surface: 'core' },
    ],
    spread: 15,
    jitter: 36,
  },
  cypress: {
    parts: [
      { geometry: () => needleCards(CYPRESS_TIERS, { seed: 47, density: 1.3 }), material: 'a', surface: 'needle' },
      { geometry: () => coniferCore(CYPRESS_TIERS), material: 'a', surface: 'core' },
      { geometry: () => cyl(0.12, 0.18, 1.6, 6).translate(0, 0.8, 0), material: 'b', surface: 'bark' },
    ],
    spread: 13,
    jitter: 22,
  },
  termiteMound: {
    parts: [{ geometry: termiteMound, color: 0xa4603c, surface: 'rock' }],
    spread: 13,
    jitter: 30,
  },
  mudHouse: {
    parts: [
      { geometry: mudHouseWalls, color: 0xb8865a },
      { geometry: mudHouseDoor, color: 0x3a2a20 },
    ],
    spread: 20,
    jitter: 30,
  },
  bungalow: {
    parts: [
      { geometry: bungalowWalls, material: 'a' },
      { geometry: bungalowRoof, color: 0x7e5d4a, surface: 'metal' }, // rusted zinc
      { geometry: bungalowTrim, color: 0x4a3a30 },
    ],
    spread: 19,
    jitter: 26,
  },
  stall: {
    parts: [
      { geometry: stallKiosk, color: 0x8a6a4a },
      { geometry: stallPole, color: 0x3a3a3a },
      { geometry: stallUmbrella, material: 'a' },
    ],
    spread: 11.5,
    jitter: 4,
  },
  mosque: {
    scale: 0.9,
    parts: [
      { geometry: mosqueHall, color: 0xe6dccb },
      { geometry: mosqueDomes, material: 'a' },
    ],
    spread: 30,
    jitter: 30,
  },
  haussmann: {
    parts: [
      { geometry: haussmannBody, material: 'a', surface: 'facade', stretch: true },
      { geometry: haussmannRoof, color: 0x5d646c, surface: 'metal', stretch: true },
      { geometry: haussmannBalconies, color: 0x1e2226, stretch: true },
    ],
    spread: 16,
    jitter: 10,
    stretch: { footprint: [10, 16], height: [17, 22] },
  },
  canalHouses: {
    parts: [{ geometry: canalHouses, material: 'b' }],
    spread: 22,
    jitter: 20,
  },
};
