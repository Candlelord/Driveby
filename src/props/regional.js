import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seg } from './detail.js';
import { leafCards, crownCore, needleCards, coniferCore, rockGeometry } from './foliage.js';
import { buildCarParts, buildVanParts } from '../world/carGeometry.js';

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

// --- streets ------------------------------------------------------------------
//
// A city is not buildings scattered over grass; it is a continuous frontage
// both sides of the road with a pavement in front and cars parked along it.
// These props are laid by the run system on the road's centreline (spread 0),
// 48 m at a time. Each module is authored with its front on +Z; modules on the
// right are turned round to face the road.

const STREET_LENGTH = 48;

/**
 * Assemble one part of a street: `modules` is a list of [builders, x, side,
 * depth], where builders maps part names to geometry functions, and `front`
 * is how far the building line is set back from the centreline.
 */
function streetPart(name, modules, front) {
  return () => {
    const pieces = [];
    for (const [builders, x, side, depth] of modules) {
      const build = builders[name];
      if (!build) continue;
      const g = build();
      if (side > 0) g.rotateY(Math.PI);
      pieces.push(g.translate(x, 0, side * (front + depth / 2)));
    }
    return pieces.length ? merge(pieces) : box(0.001, 0.001, 0.001).translate(0, -50, 0);
  };
}

// Parked along the kerb, nose to tail, on both sides.
const PARKED = [[-18, 1], [-6.5, 1], [10, 1], [-12, -1], [3.5, -1], [16.5, -1]];
export const PARKED_LATERAL = 7.9;
const parkedLateral = PARKED_LATERAL;
let carParts = null;
let vanParts = null;
const parkedPart = (name, slots, van = false) => () => {
  carParts ??= buildCarParts({ staticWheels: true });
  vanParts ??= buildVanParts();
  const parts = van ? vanParts : carParts;
  return merge(
    slots.map(([x, side]) => parts[name].clone().rotateY(Math.PI / 2).translate(x, 0.16, side * parkedLateral))
  );
};
/** Parked-car parts for a street: two paint colours, glass and running gear. */
function parkedCars(slotsA, slotsB, paintA, paintB) {
  return [
    { geometry: parkedPart('body', slotsA), color: paintA, surface: 'paint' },
    { geometry: parkedPart('body', slotsB), color: paintB, surface: 'paint' },
    { geometry: parkedPart('glass', [...slotsA, ...slotsB]), color: 0x0a0d10, surface: 'glass' },
    { geometry: parkedPart('dark', [...slotsA, ...slotsB]), color: 0x101113 },
  ];
}

const LAGOS_BLOCK = { walls: lagosWalls, slabs: lagosSlabs, trim: lagosTrim, shutters: lagosShutters };
const LAGOS_BLUE = { blue: lagosWalls, slabs: lagosSlabs, trim: lagosTrim, shutters: lagosShutters };
const LAGOS_SHOPS = { walls: shopWalls, awning: shopAwning, signs: shopSigns, trim: shopTank, shutters: shopShutters };
// Each side fills the 48 m segment: shops are 14 m wide, blocks 10 m.
const LAGOS_MODULES = [
  [LAGOS_SHOPS, -17, 1, 7], [LAGOS_BLOCK, -5, 1, 8], [LAGOS_BLUE, 5, 1, 8], [LAGOS_BLOCK, 15, 1, 8],
  [LAGOS_BLOCK, -19, -1, 8], [LAGOS_SHOPS, -7, -1, 7], [LAGOS_BLUE, 5, -1, 8], [LAGOS_SHOPS, 17, -1, 7],
];
const LAGOS_FRONT = 13.5;

const KANO_HOUSE = { walls: mudHouseWalls, door: mudHouseDoor, stall: () => merge([stallKiosk(), stallPole()]) };
const KANO_PLAIN = { walls: mudHouseWalls, door: mudHouseDoor };
const KANO_MODULES = [-19, -9.5, 0, 9.5, 19].flatMap((x, i) => [
  [i % 2 ? KANO_HOUSE : KANO_PLAIN, x, 1, 4.4],
  [i % 2 ? KANO_PLAIN : KANO_HOUSE, x + 4, -1, 4.4],
]);
const KANO_FRONT = 12;

/**
 * Algiers, la Blanche: five-storey white blocks, each floor's balcony railed in
 * the blue that goes with the white everywhere on that coast.
 */
const algiersWalls = () => merge([box(11.6, 16, 10).translate(0, 8, 0), box(11.9, 0.6, 10.3).translate(0, 16.3, 0)]);
const algiersRails = () =>
  merge([3.4, 6.6, 9.8, 13].map((y) => box(9.8, 0.95, 0.08).translate(0, y + 0.5, 5.75)));
const algiersSlabs = () => merge([3.4, 6.6, 9.8, 13].map((y) => box(9.8, 0.18, 1.3).translate(0, y, 5.3)));
const ALGIERS_BLOCK = { walls: algiersWalls, rails: algiersRails, slabs: algiersSlabs };
const ALGIERS_MODULES = [-18, -6, 6, 18].flatMap((x) => [
  [ALGIERS_BLOCK, x, 1, 10],
  [ALGIERS_BLOCK, x + 3, -1, 10],
]);
const ALGIERS_FRONT = 13;

/**
 * A Saharan medina street (Tamanrasset, In Salah, Ghardaïa): two-storey
 * cubic houses of rendered mud brick with small deep windows, flat roofs
 * behind a crenellated parapet, alternating between the set's colour and a
 * paler lime wash.
 */
function medinaWalls() {
  const parts = [box(10.6, 6.6, 8).translate(0, 3.3, 0)];
  for (let i = 0; i < 7; i++) parts.push(box(0.7, 0.8, 0.5).translate(-4.6 + i * 1.53, 7.0, 3.75));
  return merge(parts);
}
function medinaOpenings() {
  return merge([
    box(1.4, 2.4, 0.12).translate(-2.2, 1.2, 4.02), // door
    box(0.8, 0.9, 0.12).translate(1.6, 2.0, 4.02),
    box(0.8, 0.9, 0.12).translate(-3.6, 4.6, 4.02),
    box(0.8, 0.9, 0.12).translate(0.4, 4.6, 4.02),
    box(0.8, 0.9, 0.12).translate(3.6, 4.6, 4.02),
  ]);
}
const MEDINA_A = { walls: medinaWalls, openings: medinaOpenings };
const MEDINA_B = { pale: medinaWalls, openings: medinaOpenings };
const MEDINA_MODULES = [-18, -6, 6, 18].flatMap((x, i) => [
  [i % 2 ? MEDINA_B : MEDINA_A, x, 1, 8],
  [i % 2 ? MEDINA_A : MEDINA_B, x + 2, -1, 8],
]);
const MEDINA_FRONT = 12.5;

/**
 * Amsterdam: tall narrow brick canal houses shoulder to shoulder, each with
 * its own height and a stepped or bell gable, white cornices and a hoist beam.
 */
function canalHouse(height, gable) {
  return () => {
    const parts = [box(4.2, height, 7).translate(0, height / 2, 0)];
    for (let i = 0; i < gable; i++) {
      const w = 3.4 - i * 0.95;
      parts.push(box(w, 1.0, 0.6).translate(0, height + 0.5 + i, 3.2));
    }
    return merge(parts);
  };
}
const canalTrim = (height) => () =>
  merge([box(4.3, 0.25, 0.2).translate(0, height, 3.6), box(0.2, 0.2, 1.1).translate(0, height + 2.2, 3.8)]);
const CANAL_HEIGHTS = [9.2, 10.6, 8.6, 11.2, 9.8, 10.2, 8.9, 11.6, 9.4, 10.8, 9.0];
const AMSTERDAM_MODULES = [];
for (const side of [-1, 1]) {
  CANAL_HEIGHTS.forEach((h, i) => {
    const height = side > 0 ? h : CANAL_HEIGHTS[(i + 5) % CANAL_HEIGHTS.length];
    AMSTERDAM_MODULES.push([
      { walls: canalHouse(height, 2 + (i % 2)), trim: canalTrim(height) },
      -21.8 + i * 4.36,
      side,
      7,
    ]);
  });
}
const AMSTERDAM_FRONT = 12.5;

export const REGIONAL_KIT = {
  medinaStreet: {
    parts: [
      { geometry: streetPart('walls', MEDINA_MODULES, MEDINA_FRONT), material: 'a' },
      { geometry: streetPart('pale', MEDINA_MODULES, MEDINA_FRONT), color: 0xe2d6be },
      { geometry: streetPart('openings', MEDINA_MODULES, MEDINA_FRONT), color: 0x2a2018 },
      ...parkedCars([PARKED[1]], [PARKED[4]], 0xd8d4cc, 0x8a7a5a),
    ],
    // For collisions: the building line, and where cars are parked.
    front: MEDINA_FRONT,
    parked: [1, 4].map((k) => PARKED[k]),
    length: STREET_LENGTH,
    spread: 0,
    jitter: 0,
  },
  amsterdamStreet: {
    parts: [
      { geometry: streetPart('walls', AMSTERDAM_MODULES, AMSTERDAM_FRONT), material: 'a', surface: 'facade' },
      { geometry: streetPart('trim', AMSTERDAM_MODULES, AMSTERDAM_FRONT), color: 0xf2efe8 },
      ...parkedCars(PARKED.slice(0, 2), PARKED.slice(3, 5), 0x2a2e36, 0x6a7078),
    ],
    // For collisions: the building line, and where cars are parked.
    front: AMSTERDAM_FRONT,
    parked: [0, 1, 3, 4].map((k) => PARKED[k]),
    length: STREET_LENGTH,
    spread: 0,
    jitter: 0,
  },
  lagosStreet: {
    parts: [
      { geometry: streetPart('walls', LAGOS_MODULES, LAGOS_FRONT), material: 'a', surface: 'facade' },
      { geometry: streetPart('blue', LAGOS_MODULES, LAGOS_FRONT), color: 0x9cbccc, surface: 'facade' },
      { geometry: streetPart('slabs', LAGOS_MODULES, LAGOS_FRONT), color: 0xb4aea2 },
      { geometry: streetPart('trim', LAGOS_MODULES, LAGOS_FRONT), color: 0x1b1c1f },
      { geometry: streetPart('shutters', LAGOS_MODULES, LAGOS_FRONT), color: 0x6a6e72, surface: 'metal' },
      { geometry: streetPart('awning', LAGOS_MODULES, LAGOS_FRONT), color: 0x7e5d4a, surface: 'metal' },
      { geometry: streetPart('signs', LAGOS_MODULES, LAGOS_FRONT), material: 'e', surface: 'screen' },
      ...parkedCars(PARKED.slice(0, 2), [PARKED[3]], 0xb8bcc0, 0x7a1e1a),
      { geometry: parkedPart('body', [PARKED[2], PARKED[5]], true), color: 0xf0b000, surface: 'paint' },
      { geometry: parkedPart('glass', [PARKED[2], PARKED[5]], true), color: 0x0a0d10, surface: 'glass' },
      { geometry: parkedPart('dark', [PARKED[2], PARKED[5]], true), color: 0x101113 },
    ],
    // For collisions: the building line, and where cars are parked.
    front: LAGOS_FRONT,
    parked: [0, 1, 2, 3, 5].map((k) => PARKED[k]),
    length: STREET_LENGTH,
    spread: 0,
    jitter: 0,
  },
  kanoStreet: {
    parts: [
      { geometry: streetPart('walls', KANO_MODULES, KANO_FRONT), color: 0xb8865a },
      { geometry: streetPart('door', KANO_MODULES, KANO_FRONT), color: 0x3a2a20 },
      { geometry: streetPart('stall', KANO_MODULES, KANO_FRONT - 3), color: 0x8a6a4a },
      ...parkedCars([PARKED[0], PARKED[4]], [PARKED[2]], 0xd8d4cc, 0x2f3a4a),
    ],
    // For collisions: the building line, and where cars are parked.
    front: KANO_FRONT,
    parked: [0, 2, 4].map((k) => PARKED[k]),
    length: STREET_LENGTH,
    spread: 0,
    jitter: 0,
  },
  algiersStreet: {
    parts: [
      { geometry: streetPart('walls', ALGIERS_MODULES, ALGIERS_FRONT), material: 'a', surface: 'facade' },
      { geometry: streetPart('rails', ALGIERS_MODULES, ALGIERS_FRONT), color: 0x2f6aa8 },
      { geometry: streetPart('slabs', ALGIERS_MODULES, ALGIERS_FRONT), color: 0xe8e4da },
      ...parkedCars(PARKED.slice(0, 3), PARKED.slice(3), 0xe6e6e2, 0x5a6470),
    ],
    // For collisions: the building line, and where cars are parked.
    front: ALGIERS_FRONT,
    parked: [0, 1, 2, 3, 4, 5].map((k) => PARKED[k]),
    length: STREET_LENGTH,
    spread: 0,
    jitter: 0,
  },
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
      ...parkedCars(PARKED.slice(0, 3), PARKED.slice(3), 0x2a2e36, 0x8a8e94),
    ],
    // For collisions: the building line, and where cars are parked.
    front: STREET_SETBACK - 6.5,
    parked: [0, 1, 2, 3, 4, 5].map((k) => PARKED[k]),
    length: STREET_LENGTH,
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
  // A roadside market: a row of stalls under sun umbrellas. On the higher
  // tiers it is swapped for stalls built from a real model (props/modelProps.js).
  market: {
    parts: [
      { geometry: () => merge([-6, 0, 6].map((x) => stallKiosk().translate(x, 0, 0))), color: 0x8a6a4a },
      { geometry: () => merge([-6, 0, 6].map((x) => stallPole().translate(x, 0, 0))), color: 0x3a3a3a },
      { geometry: () => merge([-6, 0, 6].map((x) => stallUmbrella().translate(x, 0, 0))), material: 'a' },
    ],
    spread: 15,
    jitter: 8,
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
