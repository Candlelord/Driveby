/**
 * The world's coordinate system.
 *
 * Metres, on a flat local projection centred on Lagos Island: +X is east, +Z
 * is south (so north is -Z, which is also the way a fresh camera looks), +Y
 * is up. The real-map part of the world (Lagos, from OpenStreetMap) and the
 * imagined part (the north: bush, savanna, Sahel and desert) share it.
 *
 * Big coordinates are fine here: three.js builds object matrices on the CPU in
 * double precision, so as long as each chunk's vertices are stored relative to
 * the chunk, nothing jitters forty kilometres out.
 */

export const ORIGIN = { lat: 6.455, lon: 3.39 };
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export function toWorld(lat, lon) {
  return { x: (lon - ORIGIN.lon) * M_PER_DEG_LON, z: -(lat - ORIGIN.lat) * M_PER_DEG_LAT };
}

export function toLatLon(x, z) {
  return { lat: ORIGIN.lat - z / M_PER_DEG_LAT, lon: ORIGIN.lon + x / M_PER_DEG_LON };
}

// Streaming chunks: square, this many metres on a side.
export const CHUNK = 400;

export function chunkKey(cx, cz) {
  return `${cx}_${cz}`;
}

export function chunkOf(x, z) {
  return [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];
}

// The whole world, for the map and for keeping the car on it.
export const WORLD = {
  minX: -12000,
  maxX: 16000,
  // Lagos's southern edge is the Atlantic; the north runs on to the desert.
  minZ: -48000,
  maxZ: 6000,
};

// Where the real map stops and the imagined north begins (Lagos's northern edge).
export const NORTH_EDGE = -16000;

/** Cheap deterministic hash in [0, 1). */
export function hash2(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export function hash1(n) {
  const h = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Smooth value noise in [0, 1). */
export function noise2(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
