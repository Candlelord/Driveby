import { CHUNK, NORTH_EDGE, chunkKey, fbm, noise2, hash1, smoothstep, clamp, lerp } from './geo.js';

/**
 * The north: everything past Lagos's northern edge, made up rather than mapped.
 *
 * Nigeria squeezed into thirty kilometres the way an open-world game squeezes
 * a state: bush and oil palms first, then Guinea savanna with granite domes
 * (Zuma Rock among them), the dry Sahel with its mud-walled villages, the old
 * walled city of Kano, and the dunes beyond. One expressway runs up the middle;
 * red dirt roads go off to the villages, and between them you can drive
 * anywhere.
 *
 * It produces chunks in exactly the shape the Lagos data comes in (see
 * world.js), so the same code builds a Kano mud house and a Yaba bungalow.
 */

// Bands, measured north from the Lagos edge.
const BANDS = [
  ['forest', 0],
  ['savanna', 7500],
  ['sahel', 15500],
  ['desert', 25500],
];

/** How far north of Lagos a point is (negative inside Lagos). */
export const northOf = (z) => NORTH_EDGE - z;

/** The biome at a point, with the band edges wobbled so they are not ruler lines. */
export function biomeAt(x, z) {
  const d = northOf(z) + (fbm(x * 0.0004, z * 0.0004, 3) - 0.5) * 2400;
  if (northOf(z) < 0) return 'lagos';
  let biome = 'forest';
  for (const [name, from] of BANDS) if (d >= from) biome = name;
  return biome;
}

/** 0..1 blend weights across the bands, for ground colour. */
export function biomeWeights(x, z) {
  const d = northOf(z) + (fbm(x * 0.0004, z * 0.0004, 3) - 0.5) * 2400;
  const w = { forest: 0, savanna: 0, sahel: 0, desert: 0 };
  const edges = [7500, 15500, 25500];
  const s1 = smoothstep(edges[0] - 900, edges[0] + 900, d);
  const s2 = smoothstep(edges[1] - 900, edges[1] + 900, d);
  const s3 = smoothstep(edges[2] - 1200, edges[2] + 1200, d);
  w.forest = 1 - s1;
  w.savanna = s1 * (1 - s2);
  w.sahel = s2 * (1 - s3);
  w.desert = s3;
  return w;
}

// --- terrain -----------------------------------------------------------------

const ZUMA = { x: -3200, z: -31600, r: 260, h: 300 };

/** Height of the land north of Lagos. Roads and towns flatten it locally (see world.js). */
export function northHeight(x, z) {
  const d = northOf(z);
  if (d <= 0) return 0;
  const rise = smoothstep(0, 1500, d);
  const w = biomeWeights(x, z);
  const rolling = (fbm(x * 0.0011, z * 0.0011, 4) - 0.5) * 22;
  const hills = Math.pow(fbm(x * 0.0006 + 7, z * 0.0006, 4), 2.2) * 70;
  // Granite inselbergs dot the savanna: steep domes on otherwise gentle land.
  const dome = Math.pow(Math.max(0, fbm(x * 0.0009 + 31, z * 0.0009 + 5, 3) - 0.62) / 0.38, 2) * 90;
  // Dunes: long ridges, roughly east-west, sharper on one face.
  const ridge = 1 - Math.abs(Math.sin(z * 0.0042 + fbm(x * 0.0007, z * 0.0007, 3) * 6) );
  const dunes = Math.pow(ridge, 1.6) * 16 * fbm(x * 0.0008 + 3, z * 0.0005, 3) * 1.6 + fbm(x * 0.004, z * 0.004, 2) * 2;
  let h = w.forest * (rolling * 0.45 + 2) + w.savanna * (rolling * 0.6 + hills * 0.5 + dome) + w.sahel * (rolling * 0.25 + 1.5) + w.desert * (dunes + 2);
  // Zuma Rock: a great granite monolith, steep-sided and flat on top.
  const zr = Math.hypot(x - ZUMA.x, z - ZUMA.z);
  if (zr < ZUMA.r * 1.7) {
    const t = clamp(1 - (zr - ZUMA.r * 0.45) / (ZUMA.r * 1.1), 0, 1);
    h = Math.max(h, Math.pow(t, 0.55) * ZUMA.h * (0.92 + 0.08 * noise2(x * 0.02, z * 0.02)));
  }
  return h * rise;
}

// --- roads --------------------------------------------------------------------

// Road classes match the Lagos data: 0 motorway … 6 residential, 7 track.
const MOTORWAY = 0;
const PRIMARY = 2;
const TRACK = 7;

const KANO = { x: 2600, z: -40000, r: 1050 };
export const KANO_CENTRE = KANO;

/** Smooth a list of control points into a polyline sampled about every `step` metres. */
function spline(points, step = 16) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, z]);
    }
  }
  out.push(points[points.length - 1].slice());
  return out;
}

/** Wander a straight line into a believable country road: deterministic bends. */
function meander(from, to, amount, seed, every = 700) {
  const pts = [from];
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const n = Math.max(1, Math.round(len / every));
  const nx = -(to[1] - from[1]) / len;
  const nz = (to[0] - from[0]) / len;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const off = (hash1(seed * 31 + i * 7.3) - 0.5) * 2 * amount * Math.sin(t * Math.PI);
    pts.push([lerp(from[0], to[0], t) + nx * off, lerp(from[1], to[1], t) + nz * off]);
  }
  pts.push(to);
  return pts;
}

let NORTH = null;

/**
 * Lay out the north. `exit` is where the Lagos data's expressway leaves the
 * real map northwards (found by the world builder), so the two join up.
 */
export function buildNorth(exit = { x: -2400, z: NORTH_EDGE + 200 }) {
  const roads = []; // { cls, width, flags, pts: [[x,z],...] }
  const add = (cls, width, pts, flags = 0) => roads.push({ cls, width, flags, pts });

  // The expressway: from Lagos up past Zuma Rock to Kano's southern gate.
  const highway = [
    [exit.x, exit.z],
    [exit.x + 200, exit.z - 2500],
    [-1600, -22000],
    [800, -27000],
    [-600, -31200],
    [1200, -35000],
    [KANO.x, KANO.z + KANO.r + 600],
    [KANO.x, KANO.z + KANO.r - 20],
  ];
  add(MOTORWAY, 15, spline(highway, 20));

  // Villages, each off the highway on a red dirt road.
  const villages = [
    { id: 'ogere', name: 'Ogere', biome: 'forest', x: -5600, z: -19800, from: [exit.x + 150, -19400] },
    { id: 'olokemeji', name: 'Olokemeji', biome: 'forest', x: 4200, z: -21500, from: [-1500, -21500] },
    { id: 'kishi', name: 'Kishi', biome: 'savanna', x: 5600, z: -26200, from: [500, -26400] },
    { id: 'madalla', name: 'Madalla', biome: 'savanna', x: -6200, z: -30000, from: [-700, -30500] },
    { id: 'dawaki', name: 'Dawaki', biome: 'sahel', x: 7000, z: -34600, from: [1100, -34600] },
    { id: 'gezawa', name: 'Gezawa', biome: 'sahel', x: -5200, z: -37500, from: [800, -36600] },
  ];
  villages.forEach((v, i) => add(TRACK, 7, spline(meander(v.from, [v.x, v.z], 380, i + 3), 14), 2));
  // Tracks between neighbouring villages, for the long way round.
  add(TRACK, 6, spline(meander([-5600, -19800], [-6200, -30000], 900, 41), 14), 2);
  add(TRACK, 6, spline(meander([4200, -21500], [5600, -26200], 700, 42), 14), 2);
  add(TRACK, 6, spline(meander([5600, -26200], [7000, -34600], 900, 43), 14), 2);
  add(TRACK, 6, spline(meander([-6200, -30000], [-5200, -37500], 800, 44), 14), 2);
  // To the foot of Zuma Rock.
  add(TRACK, 6, spline(meander([-600, -31200], [ZUMA.x + 380, ZUMA.z + 120], 300, 45), 14), 2);

  // Kano: a ring road inside the walls, roads in from the four gates, and a
  // web of sandy lanes between them.
  const gates = [
    { id: 'kofar-nassarawa', name: 'Kofar Nassarawa', a: Math.PI / 2 },
    { id: 'kofar-mata', name: 'Kofar Mata', a: Math.PI * 1.02 },
    { id: 'kofar-mazugal', name: 'Kofar Mazugal', a: -Math.PI / 2 },
    { id: 'kofar-dawanau', name: 'Kofar Dawanau', a: 0.05 },
  ];
  for (const g of gates) {
    const outer = [KANO.x + Math.cos(g.a) * (KANO.r + 900), KANO.z + Math.sin(g.a) * (KANO.r + 900)];
    const inner = [KANO.x + Math.cos(g.a) * 60, KANO.z + Math.sin(g.a) * 60];
    if (g.a !== Math.PI / 2) add(PRIMARY, 10, spline([outer, [KANO.x + Math.cos(g.a) * KANO.r, KANO.z + Math.sin(g.a) * KANO.r], inner], 16));
    else add(PRIMARY, 10, spline([[KANO.x, KANO.z + KANO.r - 20], inner], 16));
  }
  const ring = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ring.push([KANO.x + Math.cos(a) * 560, KANO.z + Math.sin(a) * 560]);
  }
  add(PRIMARY - 1 + 2, 9, spline(ring, 16));
  // Lanes: a jittered grid inside the walls.
  const lanes = [];
  for (let gx = -KANO.r; gx <= KANO.r; gx += 110) {
    for (let gz = -KANO.r; gz <= KANO.r; gz += 110) {
      const jx = (hash1(gx * 3.1 + gz) - 0.5) * 30;
      const jz = (hash1(gz * 2.7 - gx) - 0.5) * 30;
      const a = [KANO.x + gx + jx, KANO.z + gz + jz];
      if (Math.hypot(a[0] - KANO.x, a[1] - KANO.z) > KANO.r - 80) continue;
      for (const [dx, dz] of [[110, 0], [0, 110]]) {
        const b = [a[0] + dx + (hash1(gx + gz * 9 + dx) - 0.5) * 30, a[1] + dz + (hash1(gz - gx * 5 + dz) - 0.5) * 30];
        if (Math.hypot(b[0] - KANO.x, b[1] - KANO.z) > KANO.r - 80) continue;
        if (hash1(gx * 0.7 + gz * 1.3 + dx) < 0.18) continue;
        lanes.push([a, b]);
        add(TRACK + 1, 5.5, spline([a, b], 12), 2);
      }
    }
  }
  // The desert beyond: a track north to an oasis, and loops through the dunes.
  const oasis = { x: 4600, z: -46200 };
  add(TRACK, 6, spline(meander([KANO.x + Math.cos(-Math.PI / 2) * (KANO.r + 900), KANO.z - KANO.r - 900], [oasis.x, oasis.z], 900, 51), 14), 2);
  add(TRACK, 6, spline(meander([oasis.x, oasis.z], [-5000, -44000], 1400, 52), 14), 2);
  add(TRACK, 6, spline(meander([-5000, -44000], [KANO.x - KANO.r - 900, KANO.z], 1200, 53), 14), 2);

  // --- buildings: villages, Kano, roadside stops --------------------------
  const buildings = []; // { kind, h, ring: [[x,z]...] }
  const occupied = new Set();
  const cellOf = (x, z) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
  const nearRoad = buildRoadIndex(roads);
  const box = (cx, cz, w, d, angle, kind, h) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const ring = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([px, pz]) => [cx + px * c - pz * s, cz + px * s + pz * c]);
    const cells = ring.map(([x, z]) => cellOf(x, z)).concat([cellOf(cx, cz)]);
    if (cells.some((k) => occupied.has(k))) return false;
    if (nearRoad(cx, cz, Math.max(w, d) / 2 + 2)) return false;
    for (const k of cells) occupied.add(k);
    buildings.push({ kind, h, ring });
    return true;
  };
  const roundHut = (cx, cz, r, h) => {
    const ring = [];
    for (let k = 0; k < 8; k++) ring.push([cx + Math.cos((k / 8) * Math.PI * 2) * r, cz + Math.sin((k / 8) * Math.PI * 2) * r]);
    if (occupied.has(cellOf(cx, cz)) || nearRoad(cx, cz, r + 2)) return false;
    occupied.add(cellOf(cx, cz));
    buildings.push({ kind: 5, h, ring });
    return true;
  };

  const places = []; // named spots: villages, Kano, sights — for the map, the journal and the markets
  const markets = []; // { x, z, angle } stall clusters

  for (const [vi, v] of villages.entries()) {
    places.push({ id: v.id, name: v.name, kind: 'village', x: v.x, z: v.z, biome: v.biome });
    // A cross of lanes, houses around it.
    const lanesHere = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + hash1(vi * 9 + k) * 0.6;
      const end = [v.x + Math.cos(a) * 240, v.z + Math.sin(a) * 240];
      lanesHere.push(end);
      add(TRACK + 1, 5, spline(meander([v.x, v.z], end, 40, vi * 10 + k, 80), 10), 2);
    }
    markets.push({ x: v.x + 28, z: v.z + 22, angle: hash1(vi) * Math.PI });
    const kind = v.biome === 'forest' ? 0 : 4;
    for (let n = 0; n < 160; n++) {
      const a = hash1(vi * 100 + n) * Math.PI * 2;
      const r = 30 + Math.sqrt(hash1(vi * 200 + n)) * 230;
      const x = v.x + Math.cos(a) * r;
      const z = v.z + Math.sin(a) * r;
      if (v.biome === 'savanna' && hash1(n * 3.7 + vi) < 0.45) roundHut(x, z, 2.6 + hash1(n) * 1.2, 2.6);
      else box(x, z, 7 + hash1(n * 1.3) * 6, 6 + hash1(n * 2.1) * 4, a + Math.PI / 2, kind, kind === 4 ? 3.2 + hash1(n) * 1.5 : 3 + hash1(n) * 2.5);
    }
  }

  // Kano.
  places.push({ id: 'kano', name: 'Kano', kind: 'city', x: KANO.x, z: KANO.z, biome: 'sahel' });
  // The city wall: segments of rammed earth with gaps where the gates are.
  for (let i = 0; i < 220; i++) {
    const a = (i / 220) * Math.PI * 2;
    if (gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g.a), Math.cos(a - g.a))) < 0.028)) continue;
    const x = KANO.x + Math.cos(a) * KANO.r;
    const z = KANO.z + Math.sin(a) * KANO.r;
    const len = ((Math.PI * 2 * KANO.r) / 220) * 1.04;
    const c = Math.cos(a + Math.PI / 2);
    const s = Math.sin(a + Math.PI / 2);
    const ring = [[-len / 2, -1.6], [len / 2, -1.6], [len / 2, 1.6], [-len / 2, 1.6]].map(([px, pz]) => [x + px * c - pz * Math.sin(a), z + px * s + pz * Math.cos(a)]);
    buildings.push({ kind: 6, h: 7, ring });
  }
  // Houses along every lane, dense.
  for (const [a, b] of lanes) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const nx = -Math.sin(ang);
    const nz = Math.cos(ang);
    for (let t = 8; t < len - 8; t += 11) {
      for (const side of [-1, 1]) {
        const seed = a[0] * 0.13 + a[1] * 0.07 + t * 1.7 + side;
        if (hash1(seed) < 0.12) continue;
        const off = 9.5 + hash1(seed * 3) * 3;
        const x = a[0] + Math.cos(ang) * t + nx * off * side;
        const z = a[1] + Math.sin(ang) * t + nz * off * side;
        box(x, z, 9 + hash1(seed * 5) * 2, 9 + hash1(seed * 7) * 4, ang, 4, 3.4 + hash1(seed * 11) * 3.6);
      }
    }
  }
  // Kurmi market, the old palace, the dye pits, the central mosque.
  const kurmi = { x: KANO.x + 260, z: KANO.z + 180 };
  for (let k = 0; k < 6; k++) markets.push({ x: kurmi.x + (k % 3) * 22, z: kurmi.z + Math.floor(k / 3) * 20, angle: 0 });
  places.push({ id: 'kurmi', name: 'Kurmi Market', kind: 'market', x: kurmi.x + 20, z: kurmi.z + 10 });
  places.push({ id: 'gidan-makama', name: 'Gidan Makama', kind: 'sight', x: KANO.x - 150, z: KANO.z - 120 });
  box(KANO.x - 150, KANO.z - 120, 46, 34, 0, 4, 7.5);
  places.push({ id: 'kano-mosque', name: 'Kano Central Mosque', kind: 'sight', x: KANO.x + 40, z: KANO.z - 60, landmark: 'mosque' });
  places.push({ id: 'dye-pits', name: 'Kofar Mata Dye Pits', kind: 'sight', x: KANO.x - KANO.r + 140, z: KANO.z + 30, landmark: 'dyepits' });
  for (const g of gates) {
    places.push({ id: g.id, name: g.name, kind: 'gate', x: KANO.x + Math.cos(g.a) * KANO.r, z: KANO.z + Math.sin(g.a) * KANO.r, angle: g.a, landmark: 'gate' });
  }
  places.push({ id: 'zuma-rock', name: 'Zuma Rock', kind: 'sight', x: ZUMA.x, z: ZUMA.z, radius: 650 });
  places.push({ id: 'oasis', name: 'The Oasis', kind: 'sight', x: oasis.x, z: oasis.z, landmark: 'oasis' });
  places.push({ id: 'dunes', name: 'The Big Dunes', kind: 'sight', x: -2200, z: -45200, radius: 700 });
  places.push({ id: 'savanna-dome', name: 'Granite Dome Lookout', kind: 'sight', x: 3900, z: -28600, radius: 400 });

  // Fuel along the expressway and in Kano.
  const fuel = [
    { x: exit.x + 60, z: -18600, name: 'Expressway Fuel' },
    { x: -1100, z: -25500, name: 'Savanna Fuel' },
    { x: 400, z: -32900, name: 'Zuma Fuel' },
    { x: KANO.x + 40, z: KANO.z + KANO.r + 300, name: 'Kano South Fuel' },
    { x: oasis.x - 120, z: oasis.z + 160, name: 'Last Pump Before Nothing' },
  ];

  NORTH = { roads, buildings, places, markets, fuel, exit, chunks: bucket(roads, buildings) };
  return NORTH;
}

export function north() {
  return NORTH ?? buildNorth();
}

/** A quick "is this point within `r` of any road" test, on a coarse grid. */
function buildRoadIndex(roads) {
  const grid = new Map();
  const G = 40;
  for (const road of roads) {
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [x0, z0] = road.pts[i];
      const [x1, z1] = road.pts[i + 1];
      const key = `${Math.floor((x0 + x1) / 2 / G)},${Math.floor((z0 + z1) / 2 / G)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push([x0, z0, x1, z1, road.width / 2]);
    }
  }
  return (x, z, r) => {
    const gx = Math.floor(x / G);
    const gz = Math.floor(z / G);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const [x0, z0, x1, z1, hw] of grid.get(`${gx + i},${gz + j}`) ?? []) {
          if (segDist(x, z, x0, z0, x1, z1) < r + hw) return true;
        }
      }
    }
    return false;
  };
}

export function segDist(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - x0) * dx + (pz - z0) * dz) / len2, 0, 1);
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
}

/** Sort roads and buildings into chunks, in the Lagos chunk format. */
function bucket(roads, buildings) {
  const chunks = new Map();
  const get = (cx, cz) => {
    const key = chunkKey(cx, cz);
    if (!chunks.has(key)) chunks.set(key, { b: [], r: [] });
    return chunks.get(key);
  };
  for (const road of roads) {
    let run = null;
    let runKey = null;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [x0, z0] = road.pts[i];
      const [x1, z1] = road.pts[i + 1];
      const cx = Math.floor((x0 + x1) / 2 / CHUNK);
      const cz = Math.floor((z0 + z1) / 2 / CHUNK);
      const key = chunkKey(cx, cz);
      if (key !== runKey) {
        run = { cls: road.cls, width: road.width, flags: road.flags, pts: [[x0, z0, 0]] };
        get(cx, cz).r.push(run);
        runKey = key;
      }
      run.pts.push([x1, z1, 0]);
    }
  }
  for (const b of buildings) {
    let cx = 0;
    let cz = 0;
    for (const [x, z] of b.ring) {
      cx += x;
      cz += z;
    }
    get(Math.floor(cx / b.ring.length / CHUNK), Math.floor(cz / b.ring.length / CHUNK)).b.push(b);
  }
  return chunks;
}
