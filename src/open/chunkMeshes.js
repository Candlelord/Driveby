import * as THREE from 'three';
import { CHUNK, NORTH_EDGE, fbm, hash1, hash2, smoothstep, clamp, lerp } from './geo.js';
import { GROUND, distToSeg } from './world.js';
import { biomeWeights } from './north.js';
import { worldMaterials } from './materials.js';

/**
 * Geometry for one chunk: the ground, the roads on it, the buildings on it.
 * Everything is built relative to the chunk's corner, and the meshes are
 * placed there, so precision holds anywhere in the world.
 */

const TERRAIN_STEP = 10;
const TERRAIN_N = CHUNK / TERRAIN_STEP;

// Ground colours by what the ground is (Lagos) and by biome (the north).
const GROUND_COLOURS = {
  [GROUND.WATER]: 0x4a5a4e,
  [GROUND.LAND]: 0x86705a,
  [GROUND.RESIDENTIAL]: 0x84776a, // swept compound dirt and broken concrete
  [GROUND.COMMERCIAL]: 0x8a857c,
  [GROUND.INDUSTRIAL]: 0x7c7870,
  [GROUND.PARK]: 0x5f7c3a,
  [GROUND.WOOD]: 0x46602f,
  [GROUND.WETLAND]: 0x56633e,
  [GROUND.SAND]: 0xd6bf92,
};
const BIOME_COLOURS = { forest: new THREE.Color(0x4f6a32), savanna: new THREE.Color(0xa08e52), sahel: new THREE.Color(0xb89a68), desert: new THREE.Color(0xdcb87e) };
const SHORE = new THREE.Color(0xc8b48a);
const C = new THREE.Color();
const D = new THREE.Color();

/** The ground: a grid that follows the terrain, coloured by land use or biome. */
export function terrainMesh(world, chunk) {
  const { ox, oz } = chunk;
  const n = TERRAIN_N + 1;
  const position = new Float32Array(n * n * 3);
  const color = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  const segs = chunk.index.segments;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const lx = i * TERRAIN_STEP;
      const lz = j * TERRAIN_STEP;
      const x = ox + lx;
      const z = oz + lz;
      let y = world.terrainHeight(x, z);
      // Level the ground under and beside the roads, so they sit on it rather
      // than slicing through hills.
      if (z < NORTH_EDGE + 400 && segs.length) {
        let best = Infinity;
        let bestSeg = null;
        let bestT = 0;
        for (const seg of chunk.index.roadsNear(x, z)) {
          const d = distToSeg(x, z, seg);
          if (d.dist < best) {
            best = d.dist;
            bestSeg = seg;
            bestT = d.t;
          }
        }
        if (bestSeg && bestSeg.y0 === 0 && bestSeg.y1 === 0) {
          const roadY = world.terrainHeight(lerp(bestSeg.x0, bestSeg.x1, bestT), lerp(bestSeg.z0, bestSeg.z1, bestT)) - 0.08;
          y = lerp(y, roadY, smoothstep(bestSeg.hw + 9, bestSeg.hw + 0.5, best));
        }
      }
      const k = (j * n + i) * 3;
      position[k] = lx;
      position[k + 1] = y;
      position[k + 2] = lz;
      groundColour(world, x, z, y, C);
      color[k] = C.r;
      color[k + 1] = C.g;
      color[k + 2] = C.b;
      uv[(j * n + i) * 2] = x / 7;
      uv[(j * n + i) * 2 + 1] = z / 7;
    }
  }
  const index = [];
  for (let j = 0; j < TERRAIN_N; j++) {
    for (let i = 0; i < TERRAIN_N; i++) {
      const a = j * n + i;
      index.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, worldMaterials().ground);
  mesh.position.set(ox, 0, oz);
  mesh.receiveShadow = true;
  return mesh;
}

export function groundColour(world, x, z, y, out) {
  const noise = fbm(x * 0.02, z * 0.02, 3);
  if (z > NORTH_EDGE || y > -50) {
    if (z > NORTH_EDGE && world.inLagos(x, z)) {
      out.setHex(GROUND_COLOURS[world.groundAt(x, z)] ?? GROUND_COLOURS[1]);
    } else if (z > NORTH_EDGE) {
      out.setHex(world.groundAt(x, z) === GROUND.WATER ? GROUND_COLOURS[0] : GROUND_COLOURS[GROUND.WOOD]);
    } else {
      const w = biomeWeights(x, z);
      out.setRGB(0, 0, 0);
      for (const [name, weight] of Object.entries(w)) if (weight > 0) out.r += BIOME_COLOURS[name].r * weight, out.g += BIOME_COLOURS[name].g * weight, out.b += BIOME_COLOURS[name].b * weight;
      // Dry grass patches and bare earth break up the savanna.
      D.setHex(0x7a5a3a);
      out.lerp(D, Math.max(0, fbm(x * 0.006 + 9, z * 0.006, 3) - 0.55) * 1.2);
    }
  }
  // Wet sand along the shore.
  if (y < 0.15 && y > -1.6) out.lerp(SHORE, 0.65);
  out.multiplyScalar(0.86 + noise * 0.28);
}

// --- roads ---------------------------------------------------------------------------

const ROAD_LIFT = [0.2, 0.19, 0.18, 0.17, 0.16, 0.15, 0.14, 0.13, 0.12];
const DIRT_COLOURS = { lagos: new THREE.Color(0xa06a46), forest: new THREE.Color(0xa25e3a), savanna: new THREE.Color(0xb27a4a), sahel: new THREE.Color(0xc29a6a), desert: new THREE.Color(0xd6b47e) };

/** Road surfaces, markings, and bridge decks with railings and piers. */
export function roadMeshes(world, chunk) {
  const { ox, oz } = chunk;
  const asphalt = new Builder();
  const dirt = new Builder();
  const dashes = new Builder();
  const lines = new Builder();
  const decks = new Builder();
  const piers = [];

  chunk.roads.forEach((road, ri) => {
    const pts = road.pts;
    if (pts.length < 2) return;
    const unpaved = road.flags & 2 || road.cls >= 7;
    const bridge = road.flags & 1;
    const hw = road.width / 2;
    const lift = (ROAD_LIFT[road.cls] ?? 0.06) + (ri % 5) * 0.002;
    // Per-point frame.
    const left = [];
    const right = [];
    const ys = [];
    let along = 0;
    const vs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x, z, deck] = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let tx = next[0] - prev[0];
      let tz = next[1] - prev[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      // Miter, limited so hairpins do not spike.
      let nx = -tz;
      let nz = tx;
      let scale = 1;
      if (i > 0 && i < pts.length - 1) {
        const ax = pts[i][0] - prev[0];
        const az = pts[i][1] - prev[1];
        const al = Math.hypot(ax, az) || 1;
        const cos = (ax / al) * tx + (az / al) * tz;
        scale = 1 / Math.max(0.55, cos);
      }
      if (i > 0) along += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      const y = deck > 0 ? deck : world.terrainHeight(x, z) + lift;
      ys.push(y);
      vs.push(along);
      left.push([x - nx * hw * scale - ox, z - nz * hw * scale - oz]);
      right.push([x + nx * hw * scale - ox, z + nz * hw * scale - oz]);
    }
    const target = unpaved ? dirt : asphalt;
    const shade = unpaved ? dirtColour(pts[0][0], pts[0][1]) : C.setScalar(road.cls <= 1 ? 0.82 : road.cls >= 6 ? 1.06 : 0.95);
    target.strip(left, right, ys, vs, 0.25, shade);

    // Markings on paved two-way roads: dashes down the middle; motorways get edge lines.
    if (!unpaved && road.cls <= 5 && pts.length > 1) {
      const mid = pts.map((p, i) => [(left[i][0] + right[i][0]) / 2, (left[i][1] + right[i][1]) / 2]);
      const yellow = C.setHex(road.cls <= 2 ? 0xe8c547 : 0xf2f0e8);
      if (!(road.flags & 4)) dashes.ribbon(mid, ys.map((y) => y + 0.015), vs, 0.12, 1 / 6, yellow);
      if (road.cls <= 1) {
        const inset = (side, k) => pts.map((p, i) => {
          const [lx, lz] = side[i];
          return [lx + (mid[i][0] - lx) * k, lz + (mid[i][1] - lz) * k];
        });
        const k = 0.6 / hw;
        lines.ribbon(inset(left, k), ys.map((y) => y + 0.015), vs, 0.1, 0, C.setHex(0xf2f0e8));
        lines.ribbon(inset(right, k), ys.map((y) => y + 0.015), vs, 0.1, 0, C.setHex(0xf2f0e8));
      }
    }

    // Bridge decks: an underside, a parapet each side, and piers down to the ground.
    if (bridge) {
      const down = ys.map((y) => y - 1.1);
      decks.strip(right, left, down, vs, 0.1, C.setScalar(0.8)); // underside, facing down
      for (const side of [left, right]) {
        decks.wall(side, ys.map((y) => y + 0.95), ys.map((y) => y - 1.1), vs, C.setScalar(0.92));
      }
      let lastPier = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i][2] < 2.5 || vs[i] - lastPier < 36) continue;
        lastPier = vs[i];
        const ground = world.terrainHeight(pts[i][0], pts[i][1]);
        piers.push([pts[i][0] - ox, pts[i][1] - oz, ground - 3, ys[i] - 1.1, Math.max(3, road.width * 0.5)]);
      }
    }
  });

  const m = worldMaterials();
  const meshes = [];
  const add = (builder, material, shadows = true) => {
    const geometry = builder.build();
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(ox, 0, oz);
    mesh.receiveShadow = shadows;
    meshes.push(mesh);
  };
  add(asphalt, m.road);
  add(dirt, m.dirt);
  add(dashes, m.marking, false);
  add(lines, m.markingSolid, false);
  add(decks, m.concrete);
  if (piers.length) {
    const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geometry, m.concrete, piers.length);
    const dummy = new THREE.Object3D();
    piers.forEach(([x, z, y0, y1, w], i) => {
      dummy.position.set(x, y0, z);
      dummy.scale.set(w, Math.max(0.5, y1 - y0), 1.4);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.position.set(ox, 0, oz);
    mesh.castShadow = true;
    meshes.push(mesh);
  }
  return meshes;
}

function dirtColour(x, z) {
  if (z > NORTH_EDGE) return C.copy(DIRT_COLOURS.lagos);
  const w = biomeWeights(x, z);
  C.setRGB(0, 0, 0);
  for (const [name, weight] of Object.entries(w)) {
    C.r += DIRT_COLOURS[name].r * weight;
    C.g += DIRT_COLOURS[name].g * weight;
    C.b += DIRT_COLOURS[name].b * weight;
  }
  return C;
}

/** Accumulates strips into one indexed geometry. */
class Builder {
  constructor() {
    this.position = [];
    this.normal = [];
    this.uv = [];
    this.color = [];
    this.index = [];
  }

  vertex(x, y, z, u, v, c, nx = 0, ny = 1, nz = 0) {
    this.position.push(x, y, z);
    this.normal.push(nx, ny, nz);
    this.uv.push(u, v);
    this.color.push(c.r, c.g, c.b);
    return this.position.length / 3 - 1;
  }

  /** A strip between two edges (already offset), with v along in metres × vScale. */
  strip(left, right, ys, vs, vScale, c) {
    let prevL = -1;
    let prevR = -1;
    for (let i = 0; i < left.length; i++) {
      const l = this.vertex(left[i][0], ys[i], left[i][1], 0, vs[i] * vScale, c);
      const r = this.vertex(right[i][0], ys[i], right[i][1], 1, vs[i] * vScale, c);
      // Counter-clockwise seen from above, so the surface faces up.
      if (prevL >= 0) this.index.push(prevL, prevR, l, prevR, r, l);
      prevL = l;
      prevR = r;
    }
  }

  /** A thin flat ribbon around a centreline. */
  ribbon(mid, ys, vs, halfWidth, vScale, c) {
    const left = [];
    const right = [];
    for (let i = 0; i < mid.length; i++) {
      const p = mid[Math.max(0, i - 1)];
      const q = mid[Math.min(mid.length - 1, i + 1)];
      let tx = q[0] - p[0];
      let tz = q[1] - p[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      left.push([mid[i][0] + tz * halfWidth, mid[i][1] - tx * halfWidth]);
      right.push([mid[i][0] - tz * halfWidth, mid[i][1] + tx * halfWidth]);
    }
    this.strip(left, right, ys, vs, vScale, c);
  }

  /** A vertical wall along a line, from `bottoms` up to `tops` (double-sided by winding both ways). */
  wall(line, tops, bottoms, vs, c) {
    let prevT = -1;
    let prevB = -1;
    for (let i = 0; i < line.length; i++) {
      const t = this.vertex(line[i][0], tops[i], line[i][1], vs[i] * 0.25, 1, c, 0, 0, 1);
      const b = this.vertex(line[i][0], bottoms[i], line[i][1], vs[i] * 0.25, 0, c, 0, 0, 1);
      if (prevT >= 0) this.index.push(prevT, t, prevB, prevB, t, b, prevT, prevB, t, t, prevB, b);
      prevT = t;
      prevB = b;
    }
  }

  build({ computeNormals = false } = {}) {
    if (!this.index.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    geometry.setIndex(this.index);
    if (computeNormals) geometry.computeVertexNormals();
    return geometry;
  }
}

// --- buildings -----------------------------------------------------------------------

// Wall colours: Lagos's painted render, offices, sheds, churches and mosques,
// mud brick, round huts, city walls.
const PAINT = {
  // Lagos houses: painted render in creams and pastels, and plenty of bare grey block.
  0: [0xe6d9bf, 0xd8c09c, 0xc7d4da, 0xdfb69c, 0xefede6, 0xb8a385, 0xc9d6b6, 0xd4a576, 0xe8c8b0, 0xa9b8c4, 0xa7a299, 0x9b968d, 0xb3aea4, 0xe0a07a, 0x8fb4a8],
  1: [0x8ea2b2, 0xbdb8ae, 0x9fb0b8, 0xd2cdc2, 0x6f8494],
  2: [0xa8a9a5, 0x9a958c, 0xb4ae9e],
  3: [0xf2f0e8, 0xe8e0d0],
  4: [0xb8774a, 0xc4865a, 0xae6c44, 0xc99a6a],
  5: [0xb07a4e, 0xa66e44],
  6: [0xb06a42],
  7: [0xcfcac0],
};
const ROOF = { 0: [0x8a8680, 0x7a4f3a, 0x9a9890, 0x6d6a66], 1: [0x7c7a76], 2: [0x8e9296, 0x7a8086], 3: [0xd8d2c4], 4: [0xa8683e], 5: [0xb59a5c], 6: [0xa0603a], 7: [0xd0ccc4] };
const STYLE = { 0: 0, 1: 1, 2: 2, 3: 0, 4: 3, 5: 3, 6: 4, 7: 4 };

export function buildingMeshes(world, chunk) {
  const { ox, oz } = chunk;
  const position = [];
  const normal = [];
  const uv = [];
  const color = [];
  const style = [];
  const seed = [];
  const index = [];
  const cones = []; // round huts' thatch
  const tanks = []; // rooftop water tanks (Lagos)
  const wall = new THREE.Color();
  const roof = new THREE.Color();

  for (const b of chunk.buildings) {
    const ring = b.ring;
    if (ring.length < 3) continue;
    const s = hash2(ring[0][0], ring[0][1]);
    const palette = PAINT[b.kind] ?? PAINT[0];
    wall.setHex(palette[Math.floor(s * palette.length)]);
    const roofs = ROOF[b.kind] ?? ROOF[0];
    roof.setHex(roofs[Math.floor(hash1(s * 91) * roofs.length)]);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, z] of ring) {
      const g = world.terrainHeight(x, z);
      minY = Math.min(minY, g);
      maxY = Math.max(maxY, g);
    }
    const base = minY - 1.2;
    const top = maxY + b.h;
    // Wind the ring counter-clockwise (seen from above) so walls face out.
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i];
      const [x1, z1] = ring[(i + 1) % ring.length];
      area += x0 * z1 - x1 * z0;
    }
    const pts = area > 0 ? ring.slice().reverse() : ring;
    const st = STYLE[b.kind] ?? 0;
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[(i + 1) % pts.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      const nx = (z1 - z0) / len;
      const nz = -(x1 - x0) / len;
      const v0 = position.length / 3;
      const lx0 = x0 - ox;
      const lz0 = z0 - oz;
      const lx1 = x1 - ox;
      const lz1 = z1 - oz;
      for (const [px, pz, pu] of [[lx0, lz0, u], [lx1, lz1, u + len]]) {
        for (const [py, pv] of [[base, base - minY], [top, top - minY]]) {
          position.push(px, py, pz);
          normal.push(nx, 0, nz);
          uv.push(pu, pv);
          color.push(wall.r, wall.g, wall.b);
          style.push(st);
          seed.push(s);
        }
      }
      index.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3);
      u += len;
    }
    if (b.kind === 5) {
      // Round hut: a thatch cone instead of a flat roof.
      let cx = 0;
      let cz = 0;
      for (const [x, z] of ring) {
        cx += x;
        cz += z;
      }
      cx /= ring.length;
      cz /= ring.length;
      cones.push([cx - ox, top, cz - oz, Math.hypot(ring[0][0] - cx, ring[0][1] - cz) * 1.3]);
      continue;
    }
    // Flat roof.
    const contour = pts.map(([x, z]) => new THREE.Vector2(x - ox, z - oz));
    let tris;
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, []);
    } catch {
      tris = [];
    }
    const r0 = position.length / 3;
    for (const p of contour) {
      position.push(p.x, top, p.y);
      normal.push(0, 1, 0);
      uv.push(p.x, p.y);
      color.push(roof.r, roof.g, roof.b);
      style.push(9);
      seed.push(s);
    }
    for (const [a, c, d] of tris) index.push(r0 + a, r0 + d, r0 + c);
    // Lagos: black plastic water tanks on a lot of the roofs.
    if (b.kind === 0 && world.inLagos(ring[0][0], ring[0][1]) && hash1(s * 13) < 0.45 && b.h < 20) {
      let cx = 0;
      let cz = 0;
      for (const [x, z] of ring) {
        cx += x;
        cz += z;
      }
      tanks.push([cx / ring.length - ox + (hash1(s * 7) - 0.5) * 2, top, cz / ring.length - oz + (hash1(s * 5) - 0.5) * 2]);
    }
  }

  const meshes = [];
  if (index.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    geometry.setAttribute('aStyle', new THREE.Float32BufferAttribute(style, 1));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, worldMaterials().buildings);
    mesh.position.set(ox, 0, oz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  if (cones.length) {
    const geometry = new THREE.ConeGeometry(1, 1, 10).translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geometry, worldMaterials().thatch, cones.length);
    const dummy = new THREE.Object3D();
    cones.forEach(([x, y, z, r], i) => {
      dummy.position.set(x, y - 0.2, z);
      dummy.scale.set(r, r * 0.95, r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.position.set(ox, 0, oz);
    mesh.castShadow = true;
    meshes.push(mesh);
  }
  if (tanks.length) {
    const geometry = new THREE.CylinderGeometry(0.75, 0.8, 1.7, 10).translate(0, 0.85, 0);
    const mesh = new THREE.InstancedMesh(geometry, tankMaterial(), tanks.length);
    const dummy = new THREE.Object3D();
    tanks.forEach(([x, y, z], i) => {
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.position.set(ox, 0, oz);
    meshes.push(mesh);
  }
  return meshes;
}

let tank = null;
function tankMaterial() {
  tank ??= new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.55 });
  return tank;
}

export { clamp };
