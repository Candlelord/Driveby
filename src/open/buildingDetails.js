import * as THREE from 'three';
import { hash1, hash2 } from './geo.js';
import { distToSeg } from './world.js';
import { detailLevel } from '../props/detail.js';
import { NIGHT } from './materials.js';
import { pitchedRoof } from './roofProfile.js';

// Street-facing architecture, batched by material instead of one mesh per window.
// The footprint remains authoritative: decorations never move the building.
let shared;
function resources() {
  if (shared) return shared;
  const cube = new THREE.BoxGeometry(1, 1, 1);
  cube.userData.shared = true;
  shared = { cube, materials: {
    render: new THREE.MeshStandardMaterial({ roughness: 0.92 }),
    trim: new THREE.MeshStandardMaterial({ roughness: 0.78 }),
    metal: new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.25 }),
  } };
  shared.materials.glass.onBeforeCompile = (shader) => {
    shader.uniforms.uInteriorNight = NIGHT;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aInteriorLight;\nvarying float vInteriorLight;\nvarying vec2 vInteriorUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInteriorLight = aInteriorLight;\nvInteriorUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uInteriorNight;\nvarying float vInteriorLight;\nvarying vec2 vInteriorUv;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float curtain = 0.72 + 0.14 * sin(vInteriorUv.x * 60.0);
        float recess = smoothstep(0.0, 0.12, vInteriorUv.y) * (1.0 - smoothstep(0.88, 1.0, vInteriorUv.y));
        totalEmissiveRadiance += vec3(1.0, 0.68, 0.35) * vInteriorLight * uInteriorNight * curtain * recess * 1.2;`);
  };
  shared.materials.glass.customProgramCacheKey = () => 'facade-interiors-v1';
  return shared;
}

export function buildingDetailMeshes(world, chunk) {
  const { ox, oz } = chunk;
  const batches = { render: [], trim: [], metal: [], glass: [] };
  const matrix = new THREE.Matrix4();
  const tangent = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const outward = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const colour = new THREE.Color();
  const limit = Math.round(2200 * detailLevel());
  let count = 0;
  const box = (type, x, y, z, w, h, d, tx, tz, nx, nz, paint, light = 0) => {
    if (count >= limit || w <= 0 || h <= 0) return;
    tangent.set(tx, 0, tz); outward.set(nx, 0, nz);
    matrix.makeBasis(tangent, up, outward);
    matrix.scale(scale.set(w, h, d));
    matrix.setPosition(x - ox, y, z - oz);
    batches[type].push({ matrix: matrix.clone(), paint, light });
    count++;
  };

  // Stable order keeps the same architecture when chunks stream back in.
  const candidates = chunk.buildings.filter((b) => b.kind <= 3 && b.h >= 3 && b.ring.length >= 3)
    .sort((a, b) => hash2(a.ring[0][0], a.ring[0][1]) - hash2(b.ring[0][0], b.ring[0][1]));
  let decorated = 0;
  for (const b of candidates) {
    if (count >= limit || decorated >= 100 * detailLevel()) break;
    const s = hash2(b.ring[0][0], b.ring[0][1]);
    let area = 0;
    for (let i = 0; i < b.ring.length; i++) {
      const p = b.ring[i], q = b.ring[(i + 1) % b.ring.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    const ring = area > 0 ? b.ring.slice().reverse() : b.ring;
    const roof = pitchedRoof(b, ring);
    const heights = ring.map(([x, z]) => world.terrainHeight(x, z));
    const base = Math.min(...heights), top = Math.max(...heights) + b.h;
    const office = b.kind === 1;
    const bay = office ? 2.2 : b.kind === 2 ? 7 : b.kind === 3 ? 4.5 : 3.6;
    const storey = office ? 3.6 : b.kind === 2 ? 9 : b.kind === 3 ? 3 : 3.2;
    const trim = s < 0.5 ? 0xd8d0bc : 0xe5e0d2;
    const accent = [0x566f69, 0x754b3e, 0x4d6577, 0x9a8762][Math.floor(s * 4)];
    let selected = false;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 4 || len > 100) continue;
      const tx = (q[0] - p[0]) / len, tz = (q[1] - p[1]) / len;
      const nx = -tz, nz = tx, mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      // Only road-facing walls receive costly close-up details.
      let near = null, distance = 45;
      for (const seg of chunk.index.roadsNear(mx, mz, distance)) {
        const hit = distToSeg(mx, mz, seg);
        if (hit.dist < distance) {
          const rx = seg.x0 + (seg.x1 - seg.x0) * hit.t;
          const rz = seg.z0 + (seg.z1 - seg.z0) * hit.t;
          if ((rx - mx) * nx + (rz - mz) * nz > 0) { near = seg; distance = hit.dist; }
        }
      }
      if (!near) continue;
      selected = true;
      const part = (type, along, y, offset, w, h, depth, paint = trim, light = 0) =>
        box(type, p[0] + tx * along + nx * offset, y, p[1] + tz * along + nz * offset,
          w, h, depth, tx, tz, nx, nz, paint, light);
      // Plinth, projecting cornice and a solid parapet give the shell a silhouette.
      part('render', len / 2, base + 0.3, 0.09, len, 0.6, 0.18, accent);
      part('trim', len / 2, top - 0.12, 0.17, len + 0.2, 0.24, 0.38);
      if (!roof) {
        part('render', len / 2, top + 0.32, -0.05, len, 0.64, 0.24, trim);
        part('trim', len / 2, top + 0.66, 0, len + 0.12, 0.12, 0.38);
      }
      const eave = !roof || Math.abs(tx * roof.tx + tz * roof.tz) > 0.9;
      if (eave) {
        part('metal', len / 2, top - 0.04, 0.27, len, 0.12, 0.14, 0x6f7770);
        part('metal', 0.5, base + b.h / 2, 0.2, 0.1, b.h - 0.3, 0.1, 0x707970);
        for (let height = base + 0.7; height < top - 0.3; height += 2.2)
          part('metal', 0.5, height, 0.18, 0.2, 0.045, 0.19, 0x424a44);
      }
      for (let y = base + storey; y < top - 0.5; y += storey)
        part('trim', len / 2, y, 0.07, len, office ? 0.16 : 0.1, 0.18);
      if (b.kind === 2) continue;
      const windowTop = office ? 0.92 : b.kind === 3 ? 0.65 : 0.82;
      for (let floor = 1; (floor + windowTop) * storey + 0.28 < b.h; floor++) {
        const y = base + floor * storey;
        for (let col = 0; (col + 0.76) * bay < len; col++) {
          const x = (col + 0.5) * bay;
          const w = bay * (office ? 0.9 : b.kind === 3 ? 0.16 : 0.52), h = storey * (office ? 0.78 : b.kind === 3 ? 0.2 : 0.48);
          const cy = y + storey * (office ? 0.53 : b.kind === 3 ? 0.55 : 0.58);
          part('metal', x, cy, 0.028, w + 0.17, h + 0.17, 0.07, 0x42463f);
          const occupancy = hash1(s * 811 + col * 17 + floor * 31 + i * 13);
          const light = occupancy < (office ? 0.32 : 0.46) ? 0.65 + hash1(s * 719 + col + floor) * 0.35 : 0;
          part('glass', x, cy, 0.07, w, h, 0.035, office ? 0x526f80 : 0x283b42, light);
          for (const side of [-1, 1])
            part('trim', x + side * (w / 2 + 0.065), cy, 0.14, 0.13, h + 0.28, 0.23);
          part('trim', x, cy + h / 2 + 0.07, 0.14, w + 0.26, 0.14, 0.23);
          part('trim', x, cy - h / 2 - 0.07, 0.23, w + 0.35, 0.15, 0.43);
          part('metal', x, cy, 0.105, 0.055, h, 0.055, 0xb4b3a6);
          const feature = hash1(s * 271 + col * 13 + floor * 7);
          if (!office && floor <= 4 && feature < 0.2 && distance > near.hw + 2) {
            // Balcony slab and railings; sufficient setback from the road.
            const by = y + 0.16;
            part('render', x, by, 0.52, w + 0.7, 0.18, 1.08, trim);
            part('metal', x, by + 0.98, 1.02, w + 0.65, 0.06, 0.06, accent);
            for (let k = 0; k <= 6; k++)
              part('metal', x - (w + 0.6) / 2 + k * (w + 0.6) / 6, by + 0.5, 1.02, 0.035, 0.98, 0.035, accent);
            for (const side of [-1, 1]) part('metal', x + side * (w + 0.6) / 2, by + 0.98, 0.54, 0.06, 0.06, 1.02, accent);
          } else if (feature > 0.78 && !office && x + w / 2 + 0.85 < len) {
            part('render', x + w / 2 + 0.5, cy - 0.2, 0.32, 0.68, 0.48, 0.5, 0xb8b6a7);
            for (let k = 0; k < 3; k++) part('metal', x + w / 2 + 0.5, cy - 0.36 + k * 0.12, 0.58, 0.5, 0.025, 0.02, 0x666b63);
          }
        }
      }
      // An unmistakable entrance, threshold and rain hood at pedestrian height.
      part('metal', len / 2, base + 1.25, 0.04, 1.35, 2.5, 0.09, accent);
      part('glass', len / 2, base + 1.55, 0.095, 1.1, 1.45, 0.04, 0x263d41);
      part('trim', len / 2, base + 0.12, 0.32, 1.8, 0.2, 0.7);
      part('render', len / 2, base + 2.8, 0.4, 2.1, 0.16, 0.9, trim);
    }
    if (selected) decorated++;
  }
  const { cube, materials } = resources();
  return Object.entries(batches).filter(([, list]) => list.length).map(([type, list]) => {
    // Occupancy belongs to this chunk's instances, never to shared geometry.
    const geometry = type === 'glass' ? cube.clone() : cube;
    if (type === 'glass') {
      delete geometry.userData.shared;
      geometry.setAttribute('aInteriorLight', new THREE.InstancedBufferAttribute(new Float32Array(list.map(item => item.light)), 1));
    }
    const mesh = new THREE.InstancedMesh(geometry, materials[type], list.length);
    list.forEach((item, i) => { mesh.setMatrixAt(i, item.matrix); mesh.setColorAt(i, colour.setHex(item.paint)); });
    mesh.position.set(ox, 0, oz);
    mesh.castShadow = type !== 'glass'; mesh.receiveShadow = true;
    mesh.userData.nearArchitecture = true;
    mesh.name = `facade ${type}`;
    mesh.computeBoundingSphere();
    return mesh;
  });
}
