import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { terrainHeight } from './terrain.js';
import { rockGeometry } from '../props/foliage.js';
import { rockMaps } from './surfaces.js';

const POSITION = new THREE.Vector3();

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);

function merge(parts) {
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

/**
 * Landmarks — the rare thing on the horizon that makes a drive memorable.
 *
 * Each one is built once as a small number of merged meshes and parked at a
 * scheduled distance down the road. Only one is ever live, and it is placed
 * through the same path transform as everything else, so it sits correctly on a
 * curve and recedes properly.
 *
 * They are deliberately not tied to terrain sets. Coming over a rise in a
 * rainstorm and finding the Great Wall there is the point.
 */

// --- builders. Each returns { parts: [{geometry, material}], offset, scale }
// --- where `offset` is how far to the side of the road it sits.

/** A crenellated wall with towers, running away across the hills. */
function greatWall() {
  const wall = [];
  const merlons = [];
  const SEGMENTS = 26;

  for (let i = 0; i < SEGMENTS; i++) {
    // Snakes laterally and rides up and down as it goes.
    const t = i / (SEGMENTS - 1);
    const x = (t - 0.5) * 520;
    const z = Math.sin(t * 5.2) * 90 - t * 120;
    const y = Math.sin(t * 3.7 + 0.6) * 11 + Math.cos(t * 8.1) * 4;
    const yaw = Math.cos(t * 5.2) * 0.6;

    const run = box(24, 9, 7).translate(0, 4.5, 0);
    run.rotateY(yaw);
    wall.push(run.translate(x, y, z));

    // Battlements along the top.
    for (let m = 0; m < 4; m++) {
      const merlon = box(3.2, 2.2, 7.6).translate((m - 1.5) * 5.6, 10.1, 0);
      merlon.rotateY(yaw);
      merlons.push(merlon.translate(x, y, z));
    }

    // A watchtower every fifth segment.
    if (i % 5 === 2) {
      const tower = merge([
        box(15, 17, 15).translate(0, 8.5, 0),
        box(18, 2.4, 18).translate(0, 18, 0),
      ]);
      tower.rotateY(yaw);
      wall.push(tower.translate(x, y, z));
    }
  }

  return {
    label: 'the Great Wall',
    region: 'terracedValley',
    parts: [
      { geometry: merge(wall), material: 'stone' },
      { geometry: merge(merlons), material: 'stoneDark' },
    ],
    offset: 210,
    // Slightly sunk, so the dips read as the wall running behind ground rather
    // than hovering above it.
    height: -7,
  };
}

/** Trilithons in a ring, on the flat. */
function stonehenge() {
  const uprights = [];
  const lintels = [];
  const RADIUS = 26;

  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * Math.PI * 2;
    const next = ((i + 1) / 11) * Math.PI * 2;
    const x = Math.cos(angle) * RADIUS;
    const z = Math.sin(angle) * RADIUS;

    const stone = box(4.4, 13, 2.6).translate(0, 6.5, 0);
    stone.rotateY(-angle);
    uprights.push(stone.translate(x, 0, z));

    // Lintel bridging this stone and the next.
    const mid = (angle + next) / 2;
    const lintel = box(9.5, 2.2, 2.6).translate(0, 14.1, 0);
    lintel.rotateY(-mid);
    lintels.push(lintel.translate(Math.cos(mid) * RADIUS, 0, Math.sin(mid) * RADIUS));
  }

  // The inner horseshoe, taller.
  for (let i = 0; i < 5; i++) {
    const angle = -0.9 + (i / 4) * 1.8;
    const stone = box(5, 18, 3).translate(0, 9, 0);
    stone.rotateY(-angle);
    uprights.push(stone.translate(Math.cos(angle) * 13, 0, Math.sin(angle) * 13));
  }

  return {
    label: 'the standing stones',
    region: 'highlandMoor',
    parts: [
      { geometry: merge(uprights), material: 'stone' },
      { geometry: merge(lintels), material: 'stoneDark' },
    ],
    offset: 62,
    height: 0,
  };
}

/** A row of heads, facing the road. */
function moai() {
  const bodies = [];
  const heads = [];

  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 17;
    const z = Math.sin(i * 1.7) * 9;
    const lean = Math.sin(i * 2.3) * 0.06;

    const plinth = box(11, 2.4, 8).translate(0, 1.2, 0);
    bodies.push(plinth.translate(x, 0, z));

    // Torso, then the long head with its heavy brow.
    const torso = box(7.4, 11, 5).translate(0, 7.9, 0);
    torso.rotateZ(lean);
    bodies.push(torso.translate(x, 0, z));

    const head = merge([
      box(6.2, 9, 5.2).translate(0, 17.5, 0),
      box(6.8, 1.6, 5.8).translate(0, 20.6, -0.3), // brow
      box(5.4, 2.6, 1.2).translate(0, 14.4, -2.4), // jaw
    ]);
    head.rotateZ(lean);
    heads.push(head.translate(x, 0, z));
  }

  return {
    label: 'the stone heads',
    region: 'cliffCoast',
    parts: [
      { geometry: merge(bodies), material: 'stoneDark' },
      { geometry: merge(heads), material: 'stone' },
    ],
    offset: 58,
    height: 0,
  };
}

/** Three stepped pyramids. */
function pyramids() {
  const steps = [];
  const caps = [];

  for (const [cx, cz, size, tiers] of [
    [0, 0, 62, 9],
    [-78, -46, 46, 7],
    [64, -70, 34, 6],
  ]) {
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const width = size * (1 - t);
      const height = (size * 0.62) / tiers;
      steps.push(box(width, height, width).translate(cx, height * (i + 0.5), cz));
    }
    caps.push(box(size * 0.12, size * 0.08, size * 0.12).translate(cx, size * 0.63, cz));
  }

  return {
    label: 'the pyramids',
    region: 'desertBloom',
    parts: [
      { geometry: merge(steps), material: 'stone' },
      { geometry: merge(caps), material: 'stoneDark' },
    ],
    offset: 150,
    height: 0,
  };
}

/** A run of vermilion gates the road passes straight through. */
function torii() {
  const posts = [];
  const beams = [];

  for (let i = 0; i < 24; i++) {
    const z = -i * 11;
    for (const side of [-1, 1]) {
      posts.push(cyl(0.75, 0.95, 12, 7).translate(side * 8.6, 6, z));
    }
    // Upper lintel with its upward sweep, and the straight tie-beam below.
    beams.push(box(23, 1.5, 2.2).translate(0, 12.4, z));
    beams.push(box(25.5, 0.9, 1.6).translate(0, 13.4, z));
    beams.push(box(17, 1.1, 1.5).translate(0, 9.6, z));
  }

  return {
    label: 'the torii gates',
    region: 'blossomAvenue',
    parts: [
      { geometry: merge(posts), material: 'accent' },
      { geometry: merge(beams), material: 'accentDark' },
    ],
    offset: 0, // the road runs through it
    height: 0,
    straddles: true,
  };
}

/** Suspension towers either side, with a cable sweep between them. */
function suspensionBridge() {
  const towers = [];
  const cables = [];

  for (const side of [-1, 1]) {
    towers.push(
      merge([
        box(5, 62, 5).translate(side * 15, 31, 0),
        box(5, 62, 5).translate(side * 15, 31, -34),
        box(5, 3.4, 39).translate(side * 15, 46, -17),
        box(5, 3.4, 39).translate(side * 15, 57, -17),
      ])
    );

    // Main cable as a chain of short segments following a catenary.
    const SPAN = 22;
    for (let i = 0; i < SPAN; i++) {
      const t = i / (SPAN - 1);
      const z = 8 - t * 190;
      const sag = Math.cos((t - 0.5) * Math.PI) ;
      const y = 58 - sag * 44;
      cables.push(box(1.1, 1.1, 10).translate(side * 15, y, z));
      // Hangers down to the deck.
      if (i % 2 === 0) cables.push(box(0.5, y - 6, 0.5).translate(side * 15, (y + 6) / 2, z));
    }
  }

  return {
    label: 'the great bridge',
    region: 'riverCrossing',
    parts: [
      { geometry: merge(towers), material: 'accent' },
      { geometry: merge(cables), material: 'accentDark' },
    ],
    offset: 0,
    height: 0,
    straddles: true,
  };
}

/**
 * Zuma Rock: the granite monolith beside the Abuja–Kaduna expressway, a
 * kilometre long and three hundred metres high, dark-streaked down its faces
 * where the rain runs off.
 */
function zumaRock() {
  const rock = rockGeometry(1, 31, 1.0);
  // Elongate, lift so the base sits half-buried, and scale up to size.
  rock.scale(190, 150, 120).translate(0, 55, 0);
  const shoulder = rockGeometry(1, 33, 0.8).scale(90, 70, 70).translate(-150, 18, 40);
  return {
    name: 'zumaRock',
    label: 'Zuma Rock',
    parts: [{ geometry: merge([rock, shoulder]), material: 'granite' }],
    offset: 330,
    height: 0,
  };
}

/** A square-section beam between two points, for lattice work. */
function beam(a, b, thickness) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const geometry = box(thickness, length, thickness).translate(0, length / 2, 0);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  return geometry.translate(a.x, a.y, a.z);
}

/**
 * The Eiffel Tower, at its real size (about 125 m across the base, 300 m to
 * the top of the mast). Four lattice legs curving in to a single shaft, the
 * arches between the legs at the bottom, the two platforms, and cross-bracing
 * on every face — which is what makes it read as iron lace rather than as a
 * solid spike from a few kilometres off.
 */
function eiffelTower() {
  const iron = [];
  // Half-width of the leg centres at each height, from base to summit.
  const profile = [
    [0, 62], [57, 38], [115, 21], [160, 13], [210, 8.5], [276, 4],
  ];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (level, [sx, sz]) => {
    const [y, w] = profile[level];
    return new THREE.Vector3(sx * w, y, sz * w);
  };

  for (let level = 0; level < profile.length - 1; level++) {
    const thickness = 7 - level * 1.15;
    for (let c = 0; c < 4; c++) {
      const a = at(level, corners[c]);
      const b = at(level + 1, corners[c]);
      iron.push(beam(a, b, thickness));
      // Bracing: an X on each face, more of them as the shaft narrows.
      if (level === 0) continue;
      const next = corners[(c + 1) % 4];
      const a2 = at(level, next);
      const b2 = at(level + 1, next);
      const steps = level >= 3 ? 3 : 2;
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps;
        const t1 = (k + 1) / steps;
        const p0 = a.clone().lerp(b, t0);
        const p1 = a.clone().lerp(b, t1);
        const q0 = a2.clone().lerp(b2, t0);
        const q1 = a2.clone().lerp(b2, t1);
        iron.push(beam(p0, q1, 1.1), beam(q0, p1, 1.1));
      }
    }
  }

  // The great arches between the legs, up to the first platform.
  for (let c = 0; c < 4; c++) {
    const a = at(0, corners[c]);
    const b = at(0, corners[(c + 1) % 4]);
    const SEGMENTS = 10;
    let previous = null;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const p = a.clone().lerp(b, t);
      // Pull the arch in with the legs as it rises.
      const rise = Math.sin(t * Math.PI);
      p.multiplyScalar(1 - rise * 0.32);
      p.y = 8 + rise * 31;
      if (previous) iron.push(beam(previous, p, 2.2));
      previous = p;
    }
  }

  const decks = [
    box(84, 5, 84).translate(0, 57, 0),
    box(46, 4, 46).translate(0, 115, 0),
    box(14, 7, 14).translate(0, 279, 0),
    cyl(1.4, 0.4, 22, 8).translate(0, 293, 0),
  ];

  return {
    name: 'eiffelTower',
    label: 'the Eiffel Tower',
    parts: [
      { geometry: merge(iron), material: 'iron' },
      { geometry: merge(decks), material: 'iron' },
    ],
    // Well back from the road, so it stands over the rooftops for the whole
    // approach rather than looming as a single leg.
    offset: 300,
    height: 0,
    approach: 1150,
  };
}

const BUILDERS = [greatWall, stonehenge, moai, pyramids, torii, suspensionBridge, zumaRock, eiffelTower];

export class Landmarks {
  constructor(scene, config) {
    this.config = config;
    this.groups = [];

    // Landmarks read as *old stone* or *painted structure*; two material pairs
    // cover all six, and both take a light tint from the current mood so they
    // sit in whatever weather they are found in.
    this.materials = {
      stone: flat(0xb8ae9c),
      stoneDark: flat(0x8e8677),
      accent: flat(0xc4402e),
      accentDark: flat(0x8e2e21),
      // Smooth-shaded and textured: a monolith is one rounded mass, not facets.
      granite: new THREE.MeshStandardMaterial({ color: 0x8c8278, roughness: 0.9, ...repeated(rockMaps(), 6, 3) }),
      // Puddle-iron paint, the tower's own bronze-brown, lit gold at night.
      // Out of the scene fog: at 300 m tall the tower is meant to be seen over
      // the city long before you reach it, so it is hazed by hand below.
      iron: new THREE.MeshStandardMaterial({ color: 0x6e5644, roughness: 0.6, metalness: 0.35, fog: false }),
    };
    this.schedule = null;

    for (const build of BUILDERS) {
      const spec = build();
      const group = new THREE.Group();
      for (const part of spec.parts) {
        group.add(new THREE.Mesh(part.geometry, this.materials[part.material]));
      }
      group.visible = false;
      group.userData = spec;
      scene.add(group);
      this.groups.push(group);
    }

    this.activeIndex = -1;
    this.nextAt = config.landmarkFirstAt;
    this.label = null;
    this.regionHeld = false;
  }

  /**
   * Hand the timetable to a route: an ordered list of { name, at } with
   * absolute distances. While a schedule is set nothing random turns up, and
   * no landmark holds its own region — the route already owns the country.
   * `null` returns to the random schedule.
   */
  useSchedule(schedule) {
    this._hideAll();
    this.activeIndex = -1;
    this.label = null;
    this.regionHeld = false;
    this.schedule = schedule ? [...schedule] : null;
    this.nextAt = schedule ? Infinity : this.config.landmarkFirstAt;
  }

  /** Debug/manual: put a specific landmark just up the road. */
  force(index, travelled) {
    // Hide whatever is up: only the retire path used to do this, so switching
    // landmarks directly left the old one standing in the same field.
    this._hideAll();
    this.activeIndex = ((index % this.groups.length) + this.groups.length) % this.groups.length;
    this.nextAt = travelled + 260;
    this.regionHeld = false;
  }

  _hideAll() {
    for (const group of this.groups) group.visible = false;
  }

  update(state, frame, environment) {
    const travelled = state.travelled;

    // Pick the next one much earlier than it is needed, because the country it
    // belongs to has to arrive first — see the region hold below.
    if (this.schedule) {
      if (this.activeIndex < 0 && this.schedule.length) {
        const next = this.schedule.shift();
        this.activeIndex = this.groups.findIndex((group) => group.userData.name === next.name);
        this.nextAt = next.at;
      }
    } else if (this.activeIndex < 0 && travelled > this.nextAt - this.config.landmarkRegionLead) {
      this._hideAll();
      // Route-only landmarks never turn up at random: Zuma Rock belongs on
      // the way to Abuja, not in a Scottish moor.
      const pool = this.groups.filter((group) => group.userData.region);
      this.activeIndex = this.groups.indexOf(pool[Math.floor(Math.random() * pool.length)]);
    }

    if (this.activeIndex < 0) {
      this.label = null;
      return;
    }

    const group = this.groups[this.activeIndex];
    const spec = group.userData;
    const gap = this.nextAt - travelled;

    // Hold this landmark's country for the whole approach, so you drive
    // through Egypt for the best part of a minute before the pyramids are on
    // the horizon rather than meeting them in whatever field came up next.
    if (!this.schedule && !this.regionHeld && spec.region && environment) {
      environment.enterRegion(spec.region, travelled);
      this.regionHeld = true;
    }

    // Retire it once it is comfortably behind, and book the next.
    if (gap < -this.config.landmarkExit) {
      group.visible = false;
      this.activeIndex = -1;
      this.label = null;
      if (this.regionHeld) {
        environment?.leaveRegion(travelled);
        this.regionHeld = false;
      }
      this.nextAt = this.schedule
        ? Infinity
        : travelled + this.config.landmarkSpacing * (0.65 + Math.random() * 0.7);
      return;
    }

    // The structure itself only builds once it is close enough to be seen. A
    // landmark can ask for a longer approach — the Eiffel Tower is the point
    // of the whole trip and should be on the skyline from a kilometre out.
    const approach = spec.approach ?? this.config.landmarkApproach;
    group.visible = gap < approach;
    // Announce it only once it is genuinely in sight.
    this.label = gap < approach * 0.6 && gap > -40 ? spec.label : null;

    // Sample the ground under the landmark rather than trusting a fixed
    // height — a wall pinned to road level floats over a plain and buries
    // itself in a mountain pass.
    const ground = terrainHeight(spec.offset, this.nextAt, state.live);
    frame.point(this.nextAt, spec.offset, ground + spec.height, POSITION);
    group.position.copy(POSITION);
    group.rotation.y = spec.straddles ? 0 : Math.sign(spec.offset || 1) * -0.35;

    const live = state.live;
    this.materials.stone.color.set(0xb8ae9c).lerp(live.groundColor, 0.25);
    this.materials.stoneDark.color.set(0x8e8677).lerp(live.groundColor, 0.3);
    // Aerial perspective for the fog-exempt iron: thinner than the scene fog,
    // so the tower reads as far away rather than vanishing.
    const distance = Math.hypot(spec.offset, gap);
    const haze = 1 - Math.exp(-((distance * live.fogDensity * 0.4) ** 2));
    this.materials.iron.color.set(0x6e5644).lerp(live.fogColor, haze);
    // The tower's sodium floodlighting comes on with the street lamps.
    this.materials.iron.emissive.setRGB(1, 0.62, 0.28).multiplyScalar(live.lampIntensity * 0.55 * (1 - haze * 0.6));
  }
}

function flat(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
}

/** Copies of a set of maps with their own repeat, for very large surfaces. */
function repeated(maps, u, v) {
  const out = {};
  for (const [key, texture] of Object.entries(maps)) {
    const copy = texture.clone();
    copy.repeat.set(u, v);
    copy.needsUpdate = true;
    out[key] = copy;
  }
  return out;
}
