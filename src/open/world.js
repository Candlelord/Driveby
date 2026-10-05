import { CHUNK, NORTH_EDGE, WORLD, chunkKey, fbm, smoothstep, clamp, lerp } from './geo.js';
import { north, northHeight, biomeAt } from './north.js';

/**
 * Everything the game knows about the ground: what it is, how high it is, and
 * where the roads and buildings are.
 *
 * Lagos comes from files baked out of OpenStreetMap (scripts/build-world.mjs):
 * a byte-per-cell raster of land use and water, and chunk files of roads and
 * building footprints. The north is generated (north.js) into the same chunk
 * shape. Chunks are loaded around the car and dropped behind it; while a chunk
 * is loaded its roads and buildings are indexed for collisions and heights.
 */

export const GROUND = { WATER: 0, LAND: 1, RESIDENTIAL: 2, COMMERCIAL: 3, INDUSTRIAL: 4, PARK: 5, WOOD: 6, WETLAND: 7, SAND: 8 };

const BASE = `${import.meta.env.BASE_URL}world/`;
const WATER_DEPTH = -2.6;
const LAND_HEIGHT = 0.3;
const fetchWorld = (url) => fetch(url, { cache: 'no-cache' }).then((response) => {
  if (!response.ok) throw new Error(`World download failed: ${response.status}`);
  return response;
});

export class World {
  constructor() {
    this.meta = null;
    this.raster = null;
    this.available = new Set(); // Lagos chunk keys that exist on disk
    this.data = new Map(); // key -> { roads, buildings, ox, oz } (absolute coordinates)
    this.pending = new Map();
    this.pois = { fuel: [], places: [], sights: [] };
    this.graph = null;
    this.ready = false;
  }

  async load() {
    try {
      const [meta, pois] = await Promise.all([fetchWorld(BASE + 'meta.json').then((r) => r.json()), fetchWorld(BASE + 'pois.json').then((r) => r.json())]);
      this.meta = meta;
      this.pois = pois;
      for (const key of meta.chunks) this.available.add(key);
      this.raster = await loadRaster(BASE + 'ground.png', meta.width, meta.height);
    } catch (error) {
      // No baked Lagos (a fresh checkout before build-world has run): the
      // north still works, and Lagos is open land.
      console.warn('No Lagos data; driving on the north alone.', error);
      this.meta = null;
    }
    this.north = north();
    if (this.meta?.exit) {
      // Rebuild the north so its expressway starts where Lagos's leaves.
      const { buildNorth } = await import('./north.js');
      this.north = buildNorth(this.meta.exit);
    }
    this.ready = true;
  }

  /** The road graph (for GPS and traffic), loaded on first use. */
  async loadGraph() {
    if (this.graph) return this.graph;
    try {
      this.graph = await fetchWorld(BASE + 'graph.json').then((r) => r.json());
    } catch {
      this.graph = { nodes: [], edges: [] };
    }
    return this.graph;
  }

  // --- ground ----------------------------------------------------------------------

  inLagos(x, z) {
    const m = this.meta;
    return Boolean(m) && z > NORTH_EDGE && x >= m.minX && x < m.maxX && z >= m.minZ && z < m.maxZ;
  }

  /** What the ground is at a point (GROUND codes), from the raster in Lagos. */
  groundAt(x, z) {
    if (this.inLagos(x, z)) {
      const m = this.meta;
      const gx = Math.floor((x - m.minX) / m.cell);
      const gy = Math.floor((z - m.minZ) / m.cell);
      return this.raster[gy * m.width + gx];
    }
    if (z > NORTH_EDGE) {
      // Beside Lagos: the sea to the south, bush elsewhere.
      if (z > 1800 + fbm(x * 0.0006, 3, 2) * 600) return GROUND.WATER;
      return GROUND.WOOD;
    }
    const biome = biomeAt(x, z);
    return biome === 'desert' ? GROUND.SAND : biome === 'forest' ? GROUND.WOOD : GROUND.LAND;
  }

  /**
   * Water depth blend 0..1 at a point, bilinear over the raster so shores are
   * smooth rather than staircased.
   */
  wetness(x, z) {
    if (!this.inLagos(x, z)) return this.groundAt(x, z) === GROUND.WATER ? 1 : 0;
    const m = this.meta;
    const fx = (x - m.minX) / m.cell - 0.5;
    const fy = (z - m.minZ) / m.cell - 0.5;
    const x0 = clamp(Math.floor(fx), 0, m.width - 1);
    const y0 = clamp(Math.floor(fy), 0, m.height - 1);
    const x1 = Math.min(m.width - 1, x0 + 1);
    const y1 = Math.min(m.height - 1, y0 + 1);
    const tx = clamp(fx - x0, 0, 1);
    const ty = clamp(fy - y0, 0, 1);
    const w = (gx, gy) => (this.raster[gy * m.width + gx] === 0 ? 1 : 0);
    return lerp(lerp(w(x0, y0), w(x1, y0), tx), lerp(w(x0, y1), w(x1, y1), tx), ty);
  }

  /** Height of the bare ground (no roads) at a point. */
  terrainHeight(x, z) {
    let h;
    if (z > NORTH_EDGE) {
      const wet = this.wetness(x, z);
      h = lerp(LAND_HEIGHT + (fbm(x * 0.01, z * 0.01, 2) - 0.5) * 0.04, WATER_DEPTH, smoothstep(0.25, 0.85, wet));
      // Ease into the north's hills at the edge.
      const toNorth = smoothstep(NORTH_EDGE + 400, NORTH_EDGE, z);
      if (toNorth > 0) h = lerp(h, northHeight(x, z), toNorth);
    } else {
      h = northHeight(x, z);
    }
    return h;
  }

  isWater(x, z) {
    return this.terrainHeight(x, z) < -0.9;
  }

  // --- chunks ----------------------------------------------------------------------

  hasChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    return this.available.has(key) || this.north.chunks.has(key) || this.inBounds(cx, cz);
  }

  inBounds(cx, cz) {
    return cx * CHUNK >= WORLD.minX && (cx + 1) * CHUNK <= WORLD.maxX && cz * CHUNK >= WORLD.minZ && (cz + 1) * CHUNK <= WORLD.maxZ;
  }

  /** Fetch (or generate) one chunk's roads and buildings, in absolute coordinates. */
  async fetchChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (this.data.has(key)) return this.data.get(key);
    if (this.pending.has(key)) return this.pending.get(key);
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;
    const job = (async () => {
      const roads = [];
      const buildings = [];
      if (this.available.has(key)) {
        try {
          const raw = await fetchWorld(`${BASE}c/${key}.json`).then((r) => r.json());
          for (const [cls, width, flags, ...flat] of raw.r) {
            const pts = [];
            for (let i = 0; i < flat.length; i += 3) pts.push([flat[i] / 10 + ox, flat[i + 1] / 10 + oz, flat[i + 2] / 10]);
            roads.push({ cls, width: width / 10, flags, pts });
          }
          for (const [h, kind, ...flat] of raw.b) {
            const ring = [];
            for (let i = 0; i < flat.length; i += 2) ring.push([flat[i] / 10 + ox, flat[i + 1] / 10 + oz]);
            buildings.push({ h: h / 10, kind, ring });
          }
        } catch {
          // A missing chunk is an empty one.
        }
      }
      const generated = this.north.chunks.get(key);
      if (generated) {
        for (const r of generated.r) roads.push(r);
        for (const b of generated.b) buildings.push(b);
      }
      const chunk = { key, cx, cz, ox, oz, roads, buildings, index: indexChunk(roads, buildings) };
      this.data.set(key, chunk);
      this.pending.delete(key);
      return chunk;
    })();
    this.pending.set(key, job);
    return job;
  }

  dropChunk(key) {
    this.data.delete(key);
  }

  // --- queries for the car -----------------------------------------------------------

  /**
   * The surface under a point: the highest road deck within reach of `nearY`
   * (so a car under a flyover stays under it), or the ground.
   * Returns { y, road (the road object or null), surface: 'asphalt'|'dirt'|'sand'|'grass'|'water' }.
   */
  surfaceAt(x, z, nearY = null) {
    const ground = this.terrainHeight(x, z);
    let best = null;
    let bestY = -Infinity;
    // A segment is stored by its midpoint; its deck can cross chunk boundaries.
    const candidates = [];
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const chunk = this.data.get(chunkKey(cx + dx, cz + dz));
      if (chunk) candidates.push(...chunk.index.roadsNear(x, z));
    }
    for (const seg of candidates) {
      const d = distToSeg(x, z, seg);
      if (d.dist > seg.hw) continue;
      const deck = seg.road.flags & 1 || seg.y0 > 0 || seg.y1 > 0 ? lerp(seg.y0, seg.y1, d.t) : null;
      const lift = [0.2, 0.19, 0.18, 0.17, 0.16, 0.15, 0.14, 0.13, 0.12][seg.road.cls] ?? 0.06;
      const y = deck !== null ? deck : ground + lift;
      if (nearY !== null && deck !== null && Math.abs(deck - nearY) > 3.2 && nearY < deck) continue;
      if (y > bestY) {
        bestY = y;
        best = seg;
      }
    }
    if (best) {
      return { y: bestY, road: best.road, surface: best.road.flags & 2 || best.road.cls >= 7 ? 'dirt' : 'asphalt' };
    }
    const code = this.groundAt(x, z);
    const surface = ground < -0.9 ? 'water' : code === GROUND.SAND ? 'sand' : code === GROUND.PARK || code === GROUND.WOOD || code === GROUND.WETLAND ? 'grass' : 'dirt';
    return { y: ground, road: null, surface };
  }

  /** Building footprints near a point (for collisions). */
  buildingsNear(x, z) {
    const out = [];
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const chunk = this.data.get(chunkKey(cx + i, cz + j));
        if (chunk) for (const b of chunk.index.buildingsNear(x, z)) out.push(b);
      }
    }
    return out;
  }

  /** The nearest road centreline point within `radius` (for respawning, traffic and markers). */
  nearestRoad(x, z, radius = 120) {
    let best = null;
    let bestD = radius;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const chunk = this.data.get(chunkKey(cx + i, cz + j));
        if (!chunk) continue;
        for (const seg of chunk.index.segments) {
          const d = distToSeg(x, z, seg);
          if (d.dist < bestD) {
            bestD = d.dist;
            best = { x: seg.x0 + (seg.x1 - seg.x0) * d.t, z: seg.z0 + (seg.z1 - seg.z0) * d.t, angle: Math.atan2(seg.x1 - seg.x0, -(seg.z1 - seg.z0)), seg };
          }
        }
      }
    }
    return best;
  }
}

/** Decode the ground raster PNG to one byte per cell. */
async function loadRaster(url, width, height) {
  const image = new Image();
  const imageUrl = URL.createObjectURL(await (await fetchWorld(url)).blob());
  try {
    image.src = imageUrl;
    await image.decode();
  } finally { URL.revokeObjectURL(imageUrl); }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
  return out;
}

const G = 24; // index grid size, metres

/** Spatial index of one chunk's road segments and building footprints. */
export function indexChunk(roads, buildings) {
  const segGrid = new Map();
  const segments = [];
  for (const road of roads) {
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [x0, z0, y0] = road.pts[i];
      const [x1, z1, y1] = road.pts[i + 1];
      const seg = { x0, z0, x1, z1, y0, y1, hw: road.width / 2, road };
      segments.push(seg);
      const pad = seg.hw + 1;
      const gx0 = Math.floor((Math.min(x0, x1) - pad) / G);
      const gx1 = Math.floor((Math.max(x0, x1) + pad) / G);
      const gz0 = Math.floor((Math.min(z0, z1) - pad) / G);
      const gz1 = Math.floor((Math.max(z0, z1) + pad) / G);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const key = gx * 100003 + gz;
          if (!segGrid.has(key)) segGrid.set(key, []);
          segGrid.get(key).push(seg);
        }
      }
    }
  }
  const bGrid = new Map();
  for (const b of buildings) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of b.ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    b.box = [minX, minZ, maxX, maxZ];
    for (let gx = Math.floor(minX / G); gx <= Math.floor(maxX / G); gx++) {
      for (let gz = Math.floor(minZ / G); gz <= Math.floor(maxZ / G); gz++) {
        const key = gx * 100003 + gz;
        if (!bGrid.has(key)) bGrid.set(key, []);
        bGrid.get(key).push(b);
      }
    }
  }
  return {
    segments,
    roadsNear: (x, z, radius = 0) => {
      if (!radius) return segGrid.get(Math.floor(x / G) * 100003 + Math.floor(z / G)) ?? [];
      const found = new Set();
      for (let gx = Math.floor((x - radius) / G); gx <= Math.floor((x + radius) / G); gx++)
        for (let gz = Math.floor((z - radius) / G); gz <= Math.floor((z + radius) / G); gz++)
          for (const segment of segGrid.get(gx * 100003 + gz) ?? []) found.add(segment);
      return [...found];
    },
    buildingsNear: (x, z) => {
      const out = new Set();
      const gx = Math.floor(x / G);
      const gz = Math.floor(z / G);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const b of bGrid.get((gx + i) * 100003 + gz + j) ?? []) out.add(b);
      return out;
    },
  };
}

export function distToSeg(px, pz, s) {
  const dx = s.x1 - s.x0;
  const dz = s.z1 - s.z0;
  const len2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - s.x0) * dx + (pz - s.z0) * dz) / len2, 0, 1);
  return { dist: Math.hypot(px - (s.x0 + dx * t), pz - (s.z0 + dz * t)), t };
}
