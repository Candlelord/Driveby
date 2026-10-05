#!/usr/bin/env node
/**
 * Turn the OpenStreetMap download (osm-cache/, see fetch-osm.mjs) into the
 * files the game streams Lagos from:
 *
 *   public/world/meta.json      bounds, raster size, the list of chunks, where the expressway leaves north
 *   public/world/ground.png     one byte per 8 m cell: what the ground is (water, park, residential…)
 *   public/world/c/<x>_<z>.json one chunk of roads and buildings, coordinates in decimetres from the chunk corner
 *   public/world/graph.json     the drivable road network, for GPS routes and traffic
 *   public/world/pois.json      fuel stations, landmarks, markets, neighbourhood names
 *   public/world/map.webp       a drawn map of Lagos, for the minimap and the big map
 *
 * Data © OpenStreetMap contributors, available under the ODbL.
 */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import sharp from 'sharp';

const ORIGIN = { lat: 6.455, lon: 3.39 };
const BBOX = { south: 6.41, west: 3.34, north: 6.6, east: 3.5 };
const CHUNK = 400;
const CELL = 8; // raster metres per pixel
const MAP_SCALE = 4; // map image metres per pixel
const M_LAT = 110540;
const M_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const toX = (lon) => (lon - ORIGIN.lon) * M_LON;
const toZ = (lat) => -(lat - ORIGIN.lat) * M_LAT;

const cache = new URL('../osm-cache/', import.meta.url);
const out = new URL('../public/world/', import.meta.url);
await rm(new URL('c/', out), { recursive: true, force: true });
await mkdir(new URL('c/', out), { recursive: true });

const files = await readdir(cache);
const load = async (name) => JSON.parse(await readFile(new URL(name, cache), 'utf8')).elements ?? [];

const minX = Math.floor(toX(BBOX.west));
const maxX = Math.ceil(toX(BBOX.east));
const minZ = Math.floor(toZ(BBOX.north));
const maxZ = Math.ceil(toZ(BBOX.south));
const W = Math.ceil((maxX - minX) / CELL);
const H = Math.ceil((maxZ - minZ) / CELL);
console.log(`area ${((maxX - minX) / 1000).toFixed(1)} × ${((maxZ - minZ) / 1000).toFixed(1)} km, raster ${W}×${H}`);

// --- geometry helpers ------------------------------------------------------------
const ringOf = (geometry) => geometry.map((p) => [toX(p.lon), toZ(p.lat)]);

/** Join a relation's member ways into closed rings. */
function assembleRings(members, role) {
  const parts = members.filter((m) => m.type === 'way' && (m.role === role || (!m.role && role === 'outer')) && m.geometry).map((m) => ringOf(m.geometry));
  const rings = [];
  const key = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  while (parts.length) {
    let ring = parts.shift();
    let grew = true;
    while (grew && key(ring[0]) !== key(ring[ring.length - 1])) {
      grew = false;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const end = key(ring[ring.length - 1]);
        if (key(p[0]) === end) ring = ring.concat(p.slice(1));
        else if (key(p[p.length - 1]) === end) ring = ring.concat(p.slice().reverse().slice(1));
        else if (key(p[p.length - 1]) === key(ring[0])) ring = p.concat(ring.slice(1));
        else if (key(p[0]) === key(ring[0])) ring = p.slice().reverse().concat(ring.slice(1));
        else continue;
        parts.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Scanline-fill polygon rings (even-odd) into a raster with a value. */
function fillRings(raster, rings, value, scale = CELL, width = W, height = H, ox = minX, oz = minZ) {
  if (!rings.length) return;
  let top = Infinity;
  let bottom = -Infinity;
  const edges = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const x0 = (ring[i][0] - ox) / scale;
      const y0 = (ring[i][1] - oz) / scale;
      const x1 = (ring[i + 1][0] - ox) / scale;
      const y1 = (ring[i + 1][1] - oz) / scale;
      if (y0 === y1) continue;
      edges.push([x0, y0, x1, y1]);
      top = Math.min(top, y0, y1);
      bottom = Math.max(bottom, y0, y1);
    }
  }
  const y0 = Math.max(0, Math.floor(top));
  const y1 = Math.min(height - 1, Math.ceil(bottom));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (const [ax, ay, bx, by] of edges) {
      if ((cy >= ay && cy < by) || (cy >= by && cy < ay)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = from; x <= to; x++) raster[y * width + x] = value;
    }
  }
}

function drawLine(raster, x0, z0, x1, z1, value, scale = CELL, width = W, height = H, ox = minX, oz = minZ, thick = 1) {
  const ax = (x0 - ox) / scale;
  const ay = (z0 - oz) / scale;
  const bx = (x1 - ox) / scale;
  const by = (z1 - oz) / scale;
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
  for (let i = 0; i <= n; i++) {
    const x = Math.floor(ax + ((bx - ax) * i) / n);
    const y = Math.floor(ay + ((by - ay) * i) / n);
    for (let dx = -thick + 1; dx < thick; dx++) {
      for (let dy = -thick + 1; dy < thick; dy++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && py >= 0 && px < width && py < height) raster[py * width + px] = value;
      }
    }
  }
}

// --- ground raster ------------------------------------------------------------------
// Codes: 0 water, 1 land, 2 residential, 3 commercial, 4 industrial, 5 park/grass,
// 6 woodland, 7 wetland, 8 sand/beach.
const ground = new Uint8Array(W * H).fill(1);
const LANDUSE = {
  residential: 2, commercial: 3, retail: 3, industrial: 4, port: 4, railway: 4, construction: 1, military: 4,
  grass: 5, recreation_ground: 5, cemetery: 5, village_green: 5, meadow: 5, farmland: 5, orchard: 5, allotments: 5,
  forest: 6, wood: 6, scrub: 6, wetland: 7, beach: 8, sand: 8,
};
const PRIORITY = [2, 3, 4, 1, 5, 6, 7, 8];
const landPolys = PRIORITY.map(() => []);
for (const name of files.filter((f) => f.startsWith('land_'))) {
  for (const el of await load(name)) {
    const tags = el.tags ?? {};
    const type = tags.landuse ?? tags.natural ?? (tags.leisure ? 'grass' : null);
    const code = LANDUSE[type] ?? (tags.leisure ? 5 : null);
    if (code === null || code === undefined) continue;
    const rings = el.type === 'way' && el.geometry ? [ringOf(el.geometry)] : el.type === 'relation' ? [...assembleRings(el.members ?? [], 'outer'), ...assembleRings(el.members ?? [], 'inner')] : [];
    landPolys[PRIORITY.indexOf(code)]?.push({ code, rings });
  }
}
for (const group of landPolys) for (const p of group) fillRings(ground, p.rings, p.code);

// Water: lakes, the lagoon, rivers, canals; then the sea, found from the coastline.
const water = await load('water.json');
const coast = new Uint8Array(W * H);
for (const el of water) {
  const tags = el.tags ?? {};
  if (tags.natural === 'coastline' && el.geometry) {
    const ring = ringOf(el.geometry);
    for (let i = 0; i < ring.length - 1; i++) drawLine(coast, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], 1, CELL, W, H, minX, minZ, 2);
  } else if (el.type === 'way' && el.geometry && (tags.waterway === 'river' || tags.waterway === 'canal') && !el.geometry.length < 2) {
    const ring = ringOf(el.geometry);
    const thick = tags.waterway === 'river' ? 3 : 2;
    for (let i = 0; i < ring.length - 1; i++) drawLine(ground, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], 0, CELL, W, H, minX, minZ, thick);
  } else if (el.type === 'way' && el.geometry) {
    const ring = ringOf(el.geometry);
    if (ring.length > 3 && Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1) fillRings(ground, [ring], 0);
  } else if (el.type === 'relation') {
    fillRings(ground, [...assembleRings(el.members ?? [], 'outer'), ...assembleRings(el.members ?? [], 'inner')], 0);
  }
}
// The sea: coastline ways have the land on their left, so seed the sea a few
// metres to the right of each and flood outward, stopped by the coast.
{
  const sea = new Uint8Array(W * H);
  const stack = [];
  for (const el of water) {
    if (el.tags?.natural !== 'coastline' || !el.geometry) continue;
    const ring = ringOf(el.geometry);
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, z0] = ring[i];
      const [x1, z1] = ring[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0) || 1;
      // Right of travel. With +z pointing south the right-hand normal of
      // (dx, dz) is (-dz, dx).
      const rx = -(z1 - z0) / len;
      const rz = (x1 - x0) / len;
      const mx = (x0 + x1) / 2 + rx * CELL * 4;
      const mz = (z0 + z1) / 2 + rz * CELL * 4;
      const px = Math.floor((mx - minX) / CELL);
      const py = Math.floor((mz - minZ) / CELL);
      if (px >= 0 && py >= 0 && px < W && py < H && !coast[py * W + px]) stack.push(py * W + px);
    }
  }
  while (stack.length) {
    const i = stack.pop();
    if (sea[i] || coast[i]) continue;
    sea[i] = 1;
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - W);
    if (y < H - 1) stack.push(i + W);
  }
  let seaCells = 0;
  for (let i = 0; i < sea.length; i++) if (sea[i]) seaCells++;
  // If the flood leaked across the whole map the coastline had a gap; ignore it then.
  if (seaCells < sea.length * 0.6) for (let i = 0; i < sea.length; i++) if (sea[i]) ground[i] = 0;
  console.log(`sea: ${((seaCells / sea.length) * 100).toFixed(1)}% of the raster${seaCells >= sea.length * 0.6 ? ' (leaked; ignored)' : ''}`);
}

await sharp(Buffer.from(ground), { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 9 }).toFile(new URL('ground.png', out).pathname.replace(/^\/([A-Z]:)/, '$1'));

// --- roads ---------------------------------------------------------------------------
const CLASS = {
  motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, unclassified: 5, residential: 6, living_street: 6, road: 6, service: 8, track: 7,
  motorway_link: 1, trunk_link: 2, primary_link: 3, secondary_link: 4, tertiary_link: 5,
};
const WIDTH = [15, 13, 11, 9.5, 8.5, 7, 6.5, 5, 4.6];
const roadWays = new Map();
for (const name of files.filter((f) => f.startsWith('roads_'))) {
  for (const el of await load(name)) {
    if (el.type !== 'way' || !el.geometry || roadWays.has(el.id)) continue;
    const t = el.tags ?? {};
    if (t.highway === 'service' && /parking_aisle|drive-through|driveway/.test(t.service ?? '')) continue;
    if (t.area === 'yes' || t.access === 'private' && t.highway === 'service') continue;
    roadWays.set(el.id, el);
  }
}
console.log(`roads: ${roadWays.size}`);

// Bridges: chains of connected bridge ways get a deck that ramps up and down.
const bridgeWays = [...roadWays.values()].filter((w) => w.tags.bridge && w.tags.bridge !== 'no');
const byEnd = new Map();
for (const w of bridgeWays) {
  for (const n of [w.nodes[0], w.nodes[w.nodes.length - 1]]) {
    if (!byEnd.has(n)) byEnd.set(n, []);
    byEnd.get(n).push(w);
  }
}
const deck = new Map(); // way id -> per-node elevations (m)
const seen = new Set();
for (const start of bridgeWays) {
  if (seen.has(start.id)) continue;
  // Walk the chain in both directions.
  const chain = [start];
  seen.add(start.id);
  for (const dir of [0, 1]) {
    let cur = start;
    let node = dir === 0 ? cur.nodes[cur.nodes.length - 1] : cur.nodes[0];
    for (;;) {
      const next = (byEnd.get(node) ?? []).find((w) => !seen.has(w.id));
      if (!next) break;
      seen.add(next.id);
      if (dir === 0) chain.push(next);
      else chain.unshift(next);
      node = next.nodes[0] === node ? next.nodes[next.nodes.length - 1] : next.nodes[0];
      cur = next;
    }
  }
  // Order points along the chain and measure.
  let total = 0;
  const lengths = chain.map((w) => {
    let l = 0;
    for (let i = 0; i < w.geometry.length - 1; i++) l += Math.hypot(toX(w.geometry[i + 1].lon) - toX(w.geometry[i].lon), toZ(w.geometry[i + 1].lat) - toZ(w.geometry[i].lat));
    total += l;
    return l;
  });
  const layer = Math.max(...chain.map((w) => Number(w.tags.layer) || 1));
  const H_DECK = Math.min(12, 5.5 + Math.max(0, layer - 1) * 4 + (total > 1500 ? 3 : 0));
  const ramp = Math.min(160, total / 3);
  let along = 0;
  chain.forEach((w, k) => {
    const el = [];
    let l = 0;
    for (let i = 0; i < w.geometry.length; i++) {
      if (i > 0) l += Math.hypot(toX(w.geometry[i].lon) - toX(w.geometry[i - 1].lon), toZ(w.geometry[i].lat) - toZ(w.geometry[i - 1].lat));
      const d = along + l;
      const t = Math.min(1, Math.min(d, total - d) / ramp);
      el.push(H_DECK * (t * t * (3 - 2 * t)));
    }
    // Chains may run against a way's own direction; heights are symmetric, so it does not matter.
    deck.set(w.id, el);
    along += lengths[k];
  });
}

// Chunks.
const chunks = new Map();
const chunk = (cx, cz) => {
  const key = `${cx}_${cz}`;
  if (!chunks.has(key)) chunks.set(key, { b: [], r: [] });
  return chunks.get(key);
};
const dm = (v) => Math.round(v * 10);

for (const w of roadWays.values()) {
  const t = w.tags;
  const cls = CLASS[t.highway] ?? 6;
  let width = WIDTH[cls];
  if (t.lanes) width = Math.min(26, Math.max(width * 0.7, Number(t.lanes) * 3.3 + (cls <= 1 ? 3 : 1)));
  const unpaved = /unpaved|dirt|ground|gravel|earth|sand|mud|compacted|fine_gravel/.test(t.surface ?? '') || t.highway === 'track';
  const flags = (deck.has(w.id) ? 1 : 0) | (unpaved ? 2 : 0) | (t.oneway === 'yes' || t.junction === 'roundabout' ? 4 : 0);
  const heights = deck.get(w.id);
  const pts = w.geometry.map((p, i) => [toX(p.lon), toZ(p.lat), heights ? heights[i] : 0]);
  // Split into runs, one per chunk, by segment midpoint.
  let run = null;
  let runKey = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const cx = Math.floor((pts[i][0] + pts[i + 1][0]) / 2 / CHUNK);
    const cz = Math.floor((pts[i][1] + pts[i + 1][1]) / 2 / CHUNK);
    const key = `${cx}_${cz}`;
    if (key !== runKey) {
      run = [cls, dm(width), flags, cx, cz, pts[i]];
      chunk(cx, cz).r.push(run);
      runKey = key;
    }
    run.push(pts[i + 1]);
  }
}

// --- buildings ---------------------------------------------------------------------
const KIND = (t) => {
  const b = t.building;
  if (/church|mosque|cathedral|temple|chapel|religious/.test(b) || t.amenity === 'place_of_worship') return 3;
  if (/industrial|warehouse|factory|hangar|manufacture|shed|storage_tank/.test(b)) return 2;
  if (/commercial|office|retail|hotel|bank|government|civic|public|hospital|school|university|college|train_station|transportation|supermarket/.test(b)) return 1;
  if (b === 'roof') return 7;
  return 0;
};
let buildingCount = 0;
const seenB = new Set();
for (const name of files.filter((f) => f.startsWith('buildings_'))) {
  for (const el of await load(name)) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 4 || seenB.has(el.id)) continue;
    seenB.add(el.id);
    const t = el.tags ?? {};
    let ring = ringOf(el.geometry);
    if (Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 0.5) ring = ring.slice(0, -1);
    // Drop slivers and absurdities.
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i];
      const [x1, z1] = ring[(i + 1) % ring.length];
      area += x0 * z1 - x1 * z0;
    }
    area = Math.abs(area) / 2;
    if (area < 12 || area > 120000) continue;
    // Simplify: drop points closer than half a metre to the previous.
    ring = ring.filter((p, i) => i === 0 || Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1]) > 0.5);
    if (ring.length < 3) continue;
    const kind = KIND(t);
    const seed = (el.id % 997) / 997;
    let h = Number.parseFloat(t.height);
    const levels = Number.parseFloat(t['building:levels']);
    if (!(h > 0)) h = levels > 0 ? levels * 3.2 + 1 : null;
    if (!h) {
      // Lagos defaults: low houses, mid-rise commerce, the odd taller block.
      const big = area > 600;
      h = kind === 1 ? 10 + seed * (big ? 30 : 12) : kind === 2 ? 7 + seed * 5 : kind === 3 ? 12 + seed * 8 : kind === 7 ? 5 : 3.4 + Math.floor(seed * 3.2) * 3.2 + (big ? 3.2 : 0);
    }
    h = Math.min(h, 250);
    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      cx += x;
      cz += z;
    }
    const kx = Math.floor(cx / ring.length / CHUNK);
    const kz = Math.floor(cz / ring.length / CHUNK);
    const ox = kx * CHUNK;
    const oz = kz * CHUNK;
    chunk(kx, kz).b.push([dm(h), kind, ...ring.flatMap(([x, z]) => [dm(x - ox), dm(z - oz)])]);
    buildingCount++;
  }
}
console.log(`buildings: ${buildingCount}`);

// Write chunks; roads rebased onto the chunk corner.
const list = [];
for (const [key, c] of chunks) {
  const [cx, cz] = key.split('_').map(Number);
  const ox = cx * CHUNK;
  const oz = cz * CHUNK;
  const r = c.r.map(([cls, width, flags, , , ...pts]) => [cls, width, flags, ...pts.flatMap(([x, z, y]) => [dm(x - ox), dm(z - oz), dm(y)])]);
  await writeFile(new URL(`c/${key}.json`, out), JSON.stringify({ b: c.b, r }));
  list.push(key);
}
console.log(`chunks: ${list.length}`);

// --- road graph -----------------------------------------------------------------------
// Nodes where ways meet (or end); edges carry their geometry for drawing routes.
const useCount = new Map();
for (const w of roadWays.values()) {
  if (CLASS[w.tags.highway] === 8 && w.tags.highway === 'service') continue;
  w.nodes.forEach((n, i) => useCount.set(n, (useCount.get(n) ?? 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1)));
}
const nodeIndex = new Map();
const nodes = [];
const edges = [];
const nodeOf = (id, p) => {
  if (!nodeIndex.has(id)) {
    nodeIndex.set(id, nodes.length / 2);
    nodes.push(Math.round(toX(p.lon)), Math.round(toZ(p.lat)));
  }
  return nodeIndex.get(id);
};
for (const w of roadWays.values()) {
  if (w.tags.highway === 'service') continue;
  const cls = CLASS[w.tags.highway] ?? 6;
  const oneway = w.tags.oneway === 'yes' || w.tags.junction === 'roundabout' ? 1 : 0;
  let from = 0;
  for (let i = 1; i < w.nodes.length; i++) {
    if (i < w.nodes.length - 1 && (useCount.get(w.nodes[i]) ?? 0) < 2) continue;
    const a = nodeOf(w.nodes[from], w.geometry[from]);
    const b = nodeOf(w.nodes[i], w.geometry[i]);
    const geom = [];
    let len = 0;
    for (let k = from; k <= i; k++) {
      geom.push(Math.round(toX(w.geometry[k].lon)), Math.round(toZ(w.geometry[k].lat)));
      if (k > from) len += Math.hypot(toX(w.geometry[k].lon) - toX(w.geometry[k - 1].lon), toZ(w.geometry[k].lat) - toZ(w.geometry[k - 1].lat));
    }
    edges.push([a, b, Math.round(len), cls, oneway, geom]);
    from = i;
  }
}
await writeFile(new URL('graph.json', out), JSON.stringify({ nodes, edges }));
console.log(`graph: ${nodes.length / 2} nodes, ${edges.length} edges`);

// The expressway north: the motorway/trunk node nearest the northern edge.
let exit = { x: -2400, z: minZ + 200 };
{
  let best = Infinity;
  for (const w of roadWays.values()) {
    if (!['motorway', 'trunk'].includes(w.tags.highway)) continue;
    for (const p of w.geometry) {
      const z = toZ(p.lat);
      if (z < best) {
        best = z;
        exit = { x: Math.round(toX(p.lon)), z: Math.round(z) };
      }
    }
  }
}

// --- points of interest ----------------------------------------------------------------
const poi = await load('pois.json');
const pois = { fuel: [], places: [], sights: [] };
for (const el of poi) {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined) continue;
  const x = Math.round(toX(lon));
  const z = Math.round(toZ(lat));
  if (t.amenity === 'fuel') pois.fuel.push({ x, z, name: t.name ?? 'Filling station' });
  else if (t.place && t.name) pois.places.push({ x, z, name: t.name, kind: t.place });
  else if (t.name) {
    const kind = t.tourism ?? t.historic ?? t.amenity ?? (t.shop === 'mall' ? 'mall' : null) ?? (t.leisure === 'stadium' ? 'stadium' : null) ?? t.man_made ?? 'sight';
    pois.sights.push({ x, z, name: t.name, kind, osm: `${el.type}/${el.id}` });
  }
}
await writeFile(new URL('pois.json', out), JSON.stringify(pois));
console.log(`pois: ${pois.fuel.length} fuel, ${pois.places.length} places, ${pois.sights.length} sights`);

await writeFile(new URL('meta.json', out), JSON.stringify({ minX, minZ, maxX, maxZ, cell: CELL, width: W, height: H, chunk: CHUNK, chunks: list, exit, mapScale: MAP_SCALE }));

// --- the drawn map ----------------------------------------------------------------------
{
  const MW = Math.ceil((maxX - minX) / MAP_SCALE);
  const MH = Math.ceil((maxZ - minZ) / MAP_SCALE);
  const rgb = Buffer.alloc(MW * MH * 3);
  const COLOURS = [[44, 92, 128], [214, 206, 186], [222, 210, 192], [206, 202, 196], [196, 192, 186], [168, 196, 140], [130, 168, 110], [150, 170, 130], [236, 220, 170]];
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const gx = Math.min(W - 1, Math.floor((x * MAP_SCALE) / CELL));
      const gy = Math.min(H - 1, Math.floor((y * MAP_SCALE) / CELL));
      const c = COLOURS[ground[gy * W + gx]] ?? COLOURS[1];
      const i = (y * MW + x) * 3;
      rgb[i] = c[0];
      rgb[i + 1] = c[1];
      rgb[i + 2] = c[2];
    }
  }
  // Buildings, then roads (minor first), drawn into the image.
  const paintPoly = (ring, colour) => {
    const mask = new Uint8Array(0);
    void mask;
    // A small scanline fill straight into rgb.
    const edges = [];
    let top = Infinity;
    let bottom = -Infinity;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      const y0 = (az - minZ) / MAP_SCALE;
      const y1 = (bz - minZ) / MAP_SCALE;
      if (y0 === y1) continue;
      edges.push([(ax - minX) / MAP_SCALE, y0, (bx - minX) / MAP_SCALE, y1]);
      top = Math.min(top, y0, y1);
      bottom = Math.max(bottom, y0, y1);
    }
    for (let y = Math.max(0, Math.floor(top)); y <= Math.min(MH - 1, Math.ceil(bottom)); y++) {
      const cy = y + 0.5;
      const xs = [];
      for (const [ax, ay, bx, by] of edges) if ((cy >= ay && cy < by) || (cy >= by && cy < ay)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.round(xs[k])); x <= Math.min(MW - 1, Math.round(xs[k + 1])); x++) {
          const i = (y * MW + x) * 3;
          rgb[i] = colour[0];
          rgb[i + 1] = colour[1];
          rgb[i + 2] = colour[2];
        }
      }
    }
  };
  for (const [key, c] of chunks) {
    const [cx, cz] = key.split('_').map(Number);
    for (const b of c.b) {
      const ring = [];
      for (let i = 2; i < b.length; i += 2) ring.push([b[i] / 10 + cx * CHUNK, b[i + 1] / 10 + cz * CHUNK]);
      paintPoly(ring, [186, 178, 166]);
    }
  }
  const strokeColour = (cls) => (cls <= 1 ? [244, 180, 70] : cls <= 3 ? [252, 236, 160] : [255, 255, 255]);
  const plot = (x, y, colour, r) => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (dx * dx + dy * dy > r * r + 0.5) continue;
        const px = Math.round(x + dx);
        const py = Math.round(y + dy);
        if (px < 0 || py < 0 || px >= MW || py >= MH) continue;
        const i = (py * MW + px) * 3;
        rgb[i] = colour[0];
        rgb[i + 1] = colour[1];
        rgb[i + 2] = colour[2];
      }
    }
  };
  const sorted = [...roadWays.values()].sort((a, b) => (CLASS[b.tags.highway] ?? 6) - (CLASS[a.tags.highway] ?? 6));
  for (const w of sorted) {
    const cls = CLASS[w.tags.highway] ?? 6;
    const r = Math.max(1, Math.round(WIDTH[cls] / MAP_SCALE / 2));
    const colour = strokeColour(cls);
    for (let i = 0; i < w.geometry.length - 1; i++) {
      const x0 = (toX(w.geometry[i].lon) - minX) / MAP_SCALE;
      const y0 = (toZ(w.geometry[i].lat) - minZ) / MAP_SCALE;
      const x1 = (toX(w.geometry[i + 1].lon) - minX) / MAP_SCALE;
      const y1 = (toZ(w.geometry[i + 1].lat) - minZ) / MAP_SCALE;
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1;
      for (let k = 0; k <= n; k++) plot(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, colour, r);
    }
  }
  await sharp(rgb, { raw: { width: MW, height: MH, channels: 3 } }).webp({ quality: 82 }).toFile(new URL('map.webp', out).pathname.replace(/^\/([A-Z]:)/, '$1'));
  console.log(`map: ${MW}×${MH}`);
}
console.log('world built');
