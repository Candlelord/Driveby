import * as THREE from 'three';
import { NORTH_EDGE, hash1, hash2 } from './geo.js';
import { distToSeg } from './world.js';
import { NIGHT } from './materials.js';

/**
 * What makes a Lagos street a Lagos street, beyond the buildings: painted
 * kerbs, pavements, street lamps on the main roads, wooden power poles and
 * their sagging wires on the side streets, billboards for invented brands,
 * and on the ground floors facing the road, rusted zinc awnings under
 * hand-painted shop signs.
 *
 * Built per chunk, from the chunk's roads and buildings.
 */

const SHOP_NAMES = [
  'CHIKA STORES', 'GOD’S TIME PHARMACY', 'BLESSED PROVISIONS', 'MAMA T FOODS', 'NO WAHALA PHONES', 'DIVINE FAVOUR SALON',
  'EKO SPARE PARTS', 'SUCCESS BOUTIQUE', 'GRACE BAKERY', 'ABIOLA & SONS', 'JOY CHEMIST', 'NEW DAY BUKA',
  'PRESTIGE BARBERS', 'BEST LINK CAFÉ', 'ADUKE FABRICS', 'OKON ELECTRICALS',
];
const ADS = [
  ['SUYA KING', 'hot · spicy · open late', '#c8221b', '#ffd23f'],
  ['ZOBO FRESH', 'chilled hibiscus, 100% vibes', '#7a1b4a', '#f5f2e8'],
  ['EKO MOBILE 4G', 'faster than the danfo', '#1f4d8f', '#c6f000'],
  ['GLOW SOAP', 'for the skin you’re in', '#f2c21b', '#0b0b0c'],
  ['JOLLOF EXPRESS', 'party rice, any day', '#e86a2a', '#f5f2e8'],
  ['NAIJA BANK', 'your money, your way', '#2c6b3a', '#f5f2e8'],
  ['MALT GOLD', 'drink it cold', '#3a2414', '#f2c21b'],
  ['FLY HARMATTAN AIR', 'Lagos to everywhere', '#0b0b0c', '#5bc8ff'],
];

let shared = null;
function materials() {
  if (shared) return shared;
  shared = {
    kerb: new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.8 }),
    pavement: new THREE.MeshStandardMaterial({ color: 0xc5bca9, map: pavementTexture(), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x55595e, roughness: 0.5, metalness: 0.6 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0x8a8a80 }),
    wire: new THREE.LineBasicMaterial({ color: 0x1a1a1a }),
    zinc: new THREE.MeshStandardMaterial({ map: zincTexture(), roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide, vertexColors: true }),
    signs: new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: 0.7, emissive: 0xffffff, emissiveMap: signAtlas(), emissiveIntensity: 0.0 }),
    ads: new THREE.MeshStandardMaterial({ map: adAtlas(), roughness: 0.6, emissive: 0xffffff, emissiveMap: adAtlas(), emissiveIntensity: 0.05 }),
    storefront: new THREE.MeshStandardMaterial({ map: storefrontAtlas(), roughness: 0.55, metalness: 0.08 }),
  };
  return shared;
}

/** Per frame: lamps and lit signs follow the night. */
export function updateStreets() {
  const m = materials();
  const night = NIGHT.value;
  m.lamp.color.setRGB(1, 0.85, 0.6).multiplyScalar(0.5 + night * 2.2);
  m.signs.emissiveIntensity = night * 0.35;
  m.ads.emissiveIntensity = 0.05 + night * 0.6;
}

export function streetMeshes(world, chunk) {
  const { ox, oz } = chunk;
  if (oz + 400 < NORTH_EDGE || !world.inLagos(ox + 200, oz + 200)) return [];
  const m = materials();
  const kerb = new Quads();
  const pave = new Quads();
  const awnings = new Quads();
  const signs = new Quads();
  const ads = new Quads();
  const storefronts = new Quads();
  const lamps = [];
  const poles = [];
  const wires = [];

  for (const road of chunk.roads) {
    const paved = !(road.flags & 2) && road.cls < 7;
    if (!paved || road.flags & 1) continue;
    const pts = road.pts;
    const hw = road.width / 2;
    const major = road.cls <= 3;
    const kerbed = road.cls >= 1 && road.cls <= 6;
    let along = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.5) continue;
      const tx = (x1 - x0) / len;
      const tz = (z1 - z0) / len;
      const nx = -tz;
      const nz = tx;
      const y0 = world.terrainHeight(x0, z0);
      const y1 = world.terrainHeight(x1, z1);
      for (const side of [-1, 1]) {
        const o = side * (hw + 0.2);
        if (kerbed) {
          // A kerb: a low block along the edge, painted on the main roads.
          const a = [x0 + nx * o - ox, z0 + nz * o - oz];
          const b = [x1 + nx * o - ox, z1 + nz * o - oz];
          kerb.box(a, b, y0 + 0.02, y1 + 0.02, 0.32, 0.22, along / 2, (along + len) / 2, major ? 0.5 : 0);
          if (road.cls <= 5) {
            // Pavement beyond the kerb.
            const p = side * (hw + 0.36);
            const q = side * (hw + 2.4);
            pave.flat([x0 + nx * p - ox, z0 + nz * p - oz], [x1 + nx * p - ox, z1 + nz * p - oz], [x1 + nx * q - ox, z1 + nz * q - oz], [x0 + nx * q - ox, z0 + nz * q - oz], y0 + 0.22, y1 + 0.22);
          }
        }
      }
      // Lamps on the main roads; poles and wires on the side streets.
      const spacing = major ? 34 : 42;
      for (let d = Math.ceil(along / spacing) * spacing; d < along + len; d += spacing) {
        const t = (d - along) / len;
        const px = x0 + (x1 - x0) * t;
        const pz = z0 + (z1 - z0) * t;
        const k = Math.round(d / spacing);
        if (major) {
          const side = k % 2 ? 1 : -1;
          lamps.push([px + nx * side * (hw + 1.6) - ox, world.terrainHeight(px, pz), pz + nz * side * (hw + 1.6) - oz, Math.atan2(nx * -side, nz * -side)]);
        } else if (road.cls >= 4 && road.cls <= 6) {
          const off = hw + 1.4;
          poles.push([px + nx * off - ox, world.terrainHeight(px, pz), pz + nz * off - oz]);
        }
      }
      // Billboards beside the big roads, now and then.
      if (major && hash1(Math.round(x0) * 0.13 + Math.round(z0) * 0.07) < 0.06 && len > 30) {
        const side = hash1(x0 + z0) < 0.5 ? -1 : 1;
        const px = (x0 + x1) / 2 + nx * side * (hw + 7);
        const pz = (z0 + z1) / 2 + nz * side * (hw + 7);
        if (!insideBuilding(chunk, px, pz)) ads.billboard(px - ox, world.terrainHeight(px, pz), pz - oz, tx, tz, Math.floor(hash1(px * 0.31) * ADS.length));
      }
      along += len;
    }
  }

  // Wires: between consecutive poles that are close enough.
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i];
    const b = poles[i + 1];
    const d = Math.hypot(a[0] - b[0], a[2] - b[2]);
    if (d > 60) continue;
    for (const h of [7.2, 6.6]) {
      for (let s = 0; s < 6; s++) {
        const t0 = s / 6;
        const t1 = (s + 1) / 6;
        const sag = (t) => Math.sin(t * Math.PI) * 0.7;
        wires.push(a[0] + (b[0] - a[0]) * t0, a[1] + h - sag(t0), a[2] + (b[2] - a[2]) * t0, a[0] + (b[0] - a[0]) * t1, a[1] + h - sag(t1), a[2] + (b[2] - a[2]) * t1);
      }
    }
  }

  // Shopfronts: on building walls that face a nearby road.
  let shopCount = 0;
  for (const b of chunk.buildings) {
    if (shopCount >= 100) break;
    if (b.kind !== 0 && b.kind !== 1) continue;
    if (b.h > 40) continue;
    const ring = b.ring;
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      area += ax * bz - bx * az;
    }
    const pts = area > 0 ? ring.slice().reverse() : ring;
    let ground = Infinity;
    for (const [x, z] of ring) ground = Math.min(ground, world.terrainHeight(x, z));
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[(i + 1) % pts.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 4 || len > 35) continue;
      const nx = -(z1 - z0) / len;
      const nz = (x1 - x0) / len;
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      // Is a road just in front of this wall?
      let near = Infinity;
      for (const seg of chunk.index.roadsNear(mx + nx * 6, mz + nz * 6)) near = Math.min(near, distToSeg(mx + nx * 6, mz + nz * 6, seg).dist - seg.hw);
      if (near > 6) continue;
      const seed = hash2(mx, mz);
      if (seed < 0.25) continue;
      shopCount++;
      const out = 1.7;
      const top = ground + 3.1;
      const low = ground + 2.65;
      const col = [[0.62, 0.42, 0.32], [0.45, 0.55, 0.62], [0.5, 0.58, 0.44], [0.7, 0.66, 0.6]][Math.floor(seed * 4)];
      const tx = (x1 - x0) / len, tz = (z1 - z0) / len;
      const bays = Math.max(1, Math.floor((len - 0.8) / 3.5));
      const bayWidth = (len - 0.8) / bays;
      for (let bay = 0; bay < bays; bay++) {
        const from = 0.4 + bay * bayWidth + 0.12, to = from + bayWidth - 0.24;
        const cell = Math.floor(hash1(seed * 919 + bay * 7) * 4);
        const at = (d, y) => [x0 + tx * d + nx * 0.08 - ox, y, z0 + tz * d + nz * 0.08 - oz];
        storefronts.quad(at(from, ground + 0.24), at(to, ground + 0.24),
          at(to, ground + 2.55), at(from, ground + 2.55), [cell / 4, 0, (cell + 1) / 4, 1]);
      }
      awnings.quad(
        [x0 - ox, top, z0 - oz],
        [x1 - ox, top, z1 - oz],
        [x1 + nx * out - ox, low, z1 + nz * out - oz],
        [x0 + nx * out - ox, low, z0 + nz * out - oz],
        [0, 0, len / 3, 1],
        col
      );
      if (b.h > 4.5 && len > 6) {
        const cell = Math.floor(hash1(seed * 977) * SHOP_NAMES.length);
        const w = Math.min(len - 1, 9);
        const cx = mx + nx * 0.06;
        const cz = mz + nz * 0.06;
        const tx = (x1 - x0) / len;
        const tz = (z1 - z0) / len;
        const u0 = (cell % 4) / 4;
        const v0 = 1 - Math.floor(cell / 4) / 4;
        signs.quad(
          [cx - tx * (w / 2) - ox, top + 0.15, cz - tz * (w / 2) - oz],
          [cx + tx * (w / 2) - ox, top + 0.15, cz + tz * (w / 2) - oz],
          [cx + tx * (w / 2) - ox, top + 1.15, cz + tz * (w / 2) - oz],
          [cx - tx * (w / 2) - ox, top + 1.15, cz - tz * (w / 2) - oz],
          [u0, v0 - 0.25, u0 + 0.25, v0],
          [1, 1, 1],
          true
        );
      }
    }
  }

  const meshes = [];
  const place = (mesh) => {
    mesh.position.set(ox, 0, oz);
    meshes.push(mesh);
    return mesh;
  };
  const add = (quads, material, shadows = false) => {
    const g = quads.build();
    if (!g) return;
    const mesh = place(new THREE.Mesh(g, material));
    mesh.receiveShadow = true;
    mesh.castShadow = shadows;
  };
  add(kerb, m.kerb);
  add(pave, m.pavement);
  add(awnings, m.zinc, true);
  add(signs, m.signs);
  add(ads, m.ads, true);
  add(storefronts, m.storefront);

  if (lamps.length) {
    const pole = new THREE.CylinderGeometry(0.09, 0.13, 8, 6).translate(0, 4, 0);
    const arm = new THREE.BoxGeometry(0.12, 0.12, 2.2).translate(0, 7.9, 1.0);
    const head = new THREE.BoxGeometry(0.4, 0.18, 0.8).translate(0, 7.8, 2.0);
    for (const [geometry, material] of [[pole, m.metal], [arm, m.metal], [head, m.lamp]]) {
      const mesh = new THREE.InstancedMesh(geometry, material, lamps.length);
      const dummy = new THREE.Object3D();
      lamps.forEach(([x, y, z, yaw], i) => {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      place(mesh).castShadow = material !== m.lamp;
    }
  }
  if (poles.length) {
    const pole = new THREE.CylinderGeometry(0.12, 0.16, 7.8, 6).translate(0, 3.9, 0);
    const cross = new THREE.BoxGeometry(1.6, 0.12, 0.12).translate(0, 7.3, 0);
    for (const geometry of [pole, cross]) {
      const mesh = new THREE.InstancedMesh(geometry, m.pole, poles.length);
      const dummy = new THREE.Object3D();
      poles.forEach(([x, y, z], i) => {
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      place(mesh).castShadow = true;
    }
  }
  if (wires.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    place(new THREE.LineSegments(g, m.wire));
  }
  return meshes;
}

function insideBuilding(chunk, x, z) {
  for (const b of chunk.index.buildingsNear(x, z)) {
    const [minX, minZ, maxX, maxZ] = b.box;
    if (x > minX - 3 && x < maxX + 3 && z > minZ - 3 && z < maxZ + 3) return true;
  }
  return false;
}

/** Quad soup with UVs and optional colours. */
class Quads {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
    this.i = [];
  }

  quad(a, b, c, d, [u0, v0, u1, v1] = [0, 0, 1, 1], col = [1, 1, 1], twoSided = false) {
    const base = this.p.length / 3;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const [p, u, v] of [[a, u0, v0], [b, u1, v0], [c, u1, v1], [d, u0, v1]]) {
      this.p.push(...p);
      this.n.push(nx, ny, nz);
      this.uv.push(u, v);
      this.c.push(...col);
    }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    if (twoSided) this.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  /** A horizontal strip at two heights (start, end). */
  flat(a, b, c, d, y0, y1) {
    const width = Math.hypot(d[0] - a[0], d[1] - a[1]);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    this.quad([a[0], y0, a[1]], [d[0], y0, d[1]], [c[0], y1, c[1]], [b[0], y1, b[1]], [0, 0, width / 2, length / 2]);
  }

  /** A low box between two points: top and both sides. */
  box(a, b, y0, y1, width, height, u0, u1, v) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (width / 2);
    const nz = (dx / len) * (width / 2);
    const A = [a[0] + nx, a[1] + nz];
    const B = [b[0] + nx, b[1] + nz];
    const C = [b[0] - nx, b[1] - nz];
    const D = [a[0] - nx, a[1] - nz];
    const uv = [u0, v, u1, v + 0.5];
    this.quad([D[0], y0 + height, D[1]], [C[0], y1 + height, C[1]], [B[0], y1 + height, B[1]], [A[0], y0 + height, A[1]], uv);
    this.quad([A[0], y0, A[1]], [B[0], y1, B[1]], [B[0], y1 + height, B[1]], [A[0], y0 + height, A[1]], uv);
    this.quad([C[0], y1, C[1]], [D[0], y0, D[1]], [D[0], y0 + height, D[1]], [C[0], y1 + height, C[1]], uv);
  }

  /** A billboard on two legs, facing across the road both ways. */
  billboard(x, y, z, tx, tz, cell) {
    const w = 8;
    const h = 4;
    const lift = 5;
    const ax = x - tx * (w / 2);
    const az = z - tz * (w / 2);
    const bx = x + tx * (w / 2);
    const bz = z + tz * (w / 2);
    const u0 = (cell % 4) / 4;
    const v0 = 1 - Math.floor(cell / 4) / 2;
    const uv = [u0, v0 - 0.5, u0 + 0.25, v0];
    this.quad([ax, y + lift, az], [bx, y + lift, bz], [bx, y + lift + h, bz], [ax, y + lift + h, az], uv, [1, 1, 1], true);
    for (const [lx, lz] of [[ax + tx, az + tz], [bx - tx, bz - tz]]) {
      this.quad([lx - 0.15, y, lz], [lx + 0.15, y, lz], [lx + 0.15, y + lift, lz], [lx - 0.15, y + lift, lz], [0, 0, 0.01, 0.01], [0.3, 0.3, 0.3], true);
    }
  }

  build() {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    return g;
  }
}

// --- textures ------------------------------------------------------------------------

function canvasTexture(w, h, draw, repeat = false) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'));
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function kerbTexture() {
  // Top half: yellow and black blocks (main roads). Bottom half: grey concrete.
  return canvasTexture(
    64,
    64,
    (ctx) => {
      ctx.fillStyle = '#e8b81e';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#151515';
      ctx.fillRect(32, 0, 32, 32);
      ctx.fillStyle = '#9a968e';
      ctx.fillRect(0, 32, 64, 32);
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(60,50,40,${Math.random() * 0.3})`;
        ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
      }
    },
    true
  );
}

function pavementTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#77766e'; ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
      const x = col * 64 + (row % 2) * 32, y = row * 32;
      const shade = 157 + Math.floor(hash2(col + 17, row + 31) * 32);
      ctx.fillStyle = `rgb(${shade},${shade - 3},${shade - 12})`;
      ctx.fillRect(x + 1, y + 1, 62, 30);
      ctx.strokeStyle = '#cec7b8'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 2, y + 30); ctx.lineTo(x + 2, y + 2); ctx.lineTo(x + 61, y + 2); ctx.stroke();
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(50,45,35,0.12)' : 'rgba(240,230,210,0.13)';
      ctx.fillRect(hash1(i * 13 + 4) * 256, hash1(i * 19 + 6) * 256, 1, 1);
    }
    ctx.strokeStyle = 'rgba(65,61,49,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(32, 85); ctx.lineTo(46, 96); ctx.lineTo(40, 112); ctx.lineTo(57, 126); ctx.stroke();
  }, true);
}

function storefrontAtlas() {
  return canvasTexture(512, 256, (ctx) => {
    const colours = ['#557e77', '#cfb281', '#996451', '#627992'];
    for (let cell = 0; cell < 4; cell++) {
      const x = cell * 128;
      ctx.fillStyle = colours[cell]; ctx.fillRect(x, 0, 128, 256);
      ctx.fillStyle = '#242b2a'; ctx.fillRect(x + 7, 8, 114, 230);
      if (cell === 2) {
        // Closed roller shutter: slats, grime and a lock at street level.
        ctx.fillStyle = '#7a817b'; ctx.fillRect(x + 11, 12, 106, 220);
        for (let y = 16; y < 228; y += 7) {
          ctx.fillStyle = '#555e59'; ctx.fillRect(x + 11, y, 106, 2);
          ctx.fillStyle = '#a1a69b'; ctx.fillRect(x + 11, y + 2, 106, 1);
        }
        ctx.fillStyle = '#444a43'; ctx.fillRect(x + 57, 219, 14, 8);
      } else {
        ctx.fillStyle = '#283c3f'; ctx.fillRect(x + 11, 12, 106, 220);
        // Visible shelves and boxes give shop windows an interior rhythm.
        for (let row = 0; row < 3; row++) {
          const y = 92 + row * 40;
          ctx.fillStyle = '#afa184'; ctx.fillRect(x + 13, y + 24, 69, 4);
          for (let col = 0; col < 6; col++) {
            ctx.fillStyle = ['#b19460', '#8d5c4e', '#758d72', '#c4b38d'][(col + row + cell) % 4];
            ctx.fillRect(x + 15 + col * 11, y + 5 + (col % 2) * 5, 8, 18 - (col % 2) * 5);
          }
        }
        ctx.fillStyle = 'rgba(173,211,215,0.12)';
        ctx.beginPath(); ctx.moveTo(x + 11, 12); ctx.lineTo(x + 55, 12); ctx.lineTo(x + 11, 145); ctx.fill();
        ctx.fillStyle = colours[cell]; ctx.fillRect(x + 83, 12, 4, 220);
        ctx.fillStyle = '#c5b995'; ctx.fillRect(x + 91, 119, 3, 19);
        ctx.fillStyle = '#d4c3a0'; ctx.fillRect(x + 23, 44, 46, 17);
        ctx.fillStyle = '#35443d'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.fillText('OPEN', x + 46, 56);
      }
      ctx.fillStyle = '#787264'; ctx.fillRect(x, 239, 128, 17);
    }
  });
}

function zincTexture() {
  return canvasTexture(
    64,
    64,
    (ctx) => {
      for (let x = 0; x < 64; x += 8) {
        ctx.fillStyle = '#b8b0a4';
        ctx.fillRect(x, 0, 4, 64);
        ctx.fillStyle = '#8a8276';
        ctx.fillRect(x + 4, 0, 4, 64);
      }
      for (let i = 0; i < 140; i++) {
        ctx.fillStyle = `rgba(${120 + Math.random() * 60},${50 + Math.random() * 30},20,${Math.random() * 0.5})`;
        ctx.beginPath();
        ctx.arc(Math.random() * 64, Math.random() * 64, Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    true
  );
}

let signs = null;
function signAtlas() {
  signs ??= canvasTexture(1024, 256, (ctx) => {
    const colours = ['#c8221b', '#1f4d8f', '#2c6b3a', '#f2c21b', '#7a1b4a', '#e86a2a', '#0b0b0c', '#f5f2e8'];
    SHOP_NAMES.forEach((name, i) => {
      const x = (i % 4) * 256;
      const y = Math.floor(i / 4) * 64;
      const bg = colours[i % colours.length];
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, 256, 64);
      ctx.fillStyle = bg === '#f2c21b' || bg === '#f5f2e8' ? '#0b0b0c' : '#f5f2e8';
      ctx.font = 'bold 30px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, x + 128, y + 34, 240);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 2, y + 2, 252, 60);
    });
  });
  return signs;
}

let adsTexture = null;
function adAtlas() {
  adsTexture ??= canvasTexture(2048, 1024, (ctx) => {
    ADS.forEach(([title, line, bg, ink], i) => {
      const x = (i % 4) * 512;
      const y = Math.floor(i / 4) * 512;
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, 512, 512);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(x, y + 380);
      ctx.lineTo(x + 512, y + 300);
      ctx.lineTo(x + 512, y + 512);
      ctx.lineTo(x, y + 512);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.font = 'italic 900 92px Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, x + 256, y + 170, 480);
      ctx.fillStyle = bg;
      ctx.font = '800 36px Arial, sans-serif';
      ctx.fillText(line, x + 256, y + 430, 470);
    });
  });
  return adsTexture;
}
