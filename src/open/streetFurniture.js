import * as THREE from 'three';
import { hash1, NORTH_EDGE } from './geo.js';
import { GROUND } from './world.js';

/** Deterministic pavement sites, kept clear of buildings, junctions and water. */
export function furnitureSites(world, chunk) {
  if (chunk.oz + 400 < NORTH_EDGE || !world.inLagos(chunk.ox + 200, chunk.oz + 200)) return [];
  const sites = [];
  for (const road of chunk.roads) {
    if (road.flags & 3 || road.cls < 2 || road.cls > 5 || road.width < 7) continue;
    let along = 0;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const a = road.pts[i], b = road.pts[i + 1];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const tx = (b[0] - a[0]) / length, tz = (b[1] - a[1]) / length;
      if (length < 1) continue;
      for (let d = Math.ceil((along + 12) / 100) * 100; d < along + length - 12; d += 100) {
        if (sites.length >= 10) return sites;
        const t = (d - along) / length;
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        const seed = hash1(Math.round(x) * 0.13 + Math.round(z) * 0.37);
        const side = seed < 0.5 ? 1 : -1;
        const offset = road.width / 2 + 2.0;
        const px = x - tz * side * offset, pz = z + tx * side * offset;
        if (world.groundAt(px, pz) === GROUND.WATER) continue;
        let blocked = false;
        for (const building of chunk.index.buildingsNear(px, pz)) {
          const [x0, z0, x1, z1] = building.box;
          if (px > x0 - 2.5 && px < x1 + 2.5 && pz > z0 - 2.5 && pz < z1 + 2.5) { blocked = true; break; }
        }
        if (blocked) continue;
        const near = chunk.index.roadsNear(px, pz);
        if (near.some((seg) => seg.road !== road && Math.abs((seg.x1 - seg.x0) * tz - (seg.z1 - seg.z0) * tx) > 0.3 * Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0))) continue;
        const shelter = road.cls <= 4 && seed > 0.45 && sites.filter((s) => s.shelter).length < 3;
        sites.push({ x: px, z: pz, y: world.terrainHeight(px, pz), yaw: Math.atan2(tz * side, -tx * side), shelter, seed });
      }
      along += length;
    }
  }
  return sites;
}

let shared;
function assets() {
  if (shared) return shared;
  const cube = new THREE.BoxGeometry(1, 1, 1); cube.userData.shared = true;
  const sign = document.createElement('canvas'); sign.width = 128; sign.height = 256;
  const ctx = sign.getContext('2d');
  ctx.fillStyle = '#d9ad24'; ctx.fillRect(0, 0, 128, 256);
  ctx.strokeStyle = '#283d38'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 118, 246);
  ctx.fillStyle = '#283d38'; ctx.fillRect(30, 25, 68, 65); ctx.fillRect(21, 87, 86, 38);
  ctx.fillStyle = '#e5ddc5'; ctx.fillRect(37, 33, 54, 34);
  ctx.fillStyle = '#283d38'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
  ctx.fillText('EKO', 64, 174); ctx.fillText('BUS', 64, 207);
  const texture = new THREE.CanvasTexture(sign); texture.colorSpace = THREE.SRGBColorSpace;
  shared = { cube, materials: {
    frame: new THREE.MeshStandardMaterial({ color: 0x3f6258, roughness: 0.7, metalness: 0.25 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xc9b381, roughness: 0.75 }),
    bench: new THREE.MeshStandardMaterial({ color: 0x966747, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x7da6a0, roughness: 0.3, transparent: true, opacity: 0.35, depthWrite: false }),
    sign: new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }),
  } };
  return shared;
}

export function streetFurnitureMeshes(world, chunk) {
  const sites = furnitureSites(world, chunk);
  if (!sites.length) return [];
  const { cube, materials } = assets();
  const groups = Object.fromEntries(Object.keys(materials).map((key) => [key, []]));
  const dummy = new THREE.Object3D();
  for (const site of sites) {
    const cos = Math.cos(site.yaw), sin = Math.sin(site.yaw);
    const part = (type, x, y, z, w, h, depth) => {
      dummy.position.set(site.x - chunk.ox + x * cos + z * sin, site.y + y, site.z - chunk.oz - x * sin + z * cos);
      dummy.rotation.set(0, site.yaw, 0); dummy.scale.set(w, h, depth); dummy.updateMatrix();
      groups[type].push(dummy.matrix.clone());
    };
    // A bin and timber bench make the pavement feel used even without a shelter.
    part('frame', 2.25, 0.48, 0, 0.48, 0.96, 0.48);
    part('roof', 2.25, 0.95, 0, 0.55, 0.08, 0.55);
    for (const x of [-0.7, 0.7]) part('frame', x, 0.28, 0, 0.12, 0.56, 0.52);
    for (const z of [-0.18, 0, 0.18]) part('bench', 0, 0.57, z, 1.9, 0.09, 0.14);
    for (const y of [0.83, 1.04]) part('bench', 0, y, -0.23, 1.9, 0.14, 0.06);
    if (!site.shelter) continue;
    // Open road-facing side, glazed back, shallow overhanging canopy.
    for (const x of [-1.5, 1.5]) for (const z of [-0.55, 0.55]) part('frame', x, 1.3, z, 0.07, 2.6, 0.07);
    part('roof', 0, 2.68, 0, 3.5, 0.16, 1.6);
    part('glass', 0, 1.5, -0.55, 2.9, 2.0, 0.03);
    part('frame', -2.0, 1.65, 0, 0.055, 3.3, 0.055);
    part('sign', -2.0, 2.75, 0, 0.5, 0.9, 0.075);
  }
  return Object.entries(groups).filter(([, list]) => list.length).map(([type, list]) => {
    const mesh = new THREE.InstancedMesh(cube, materials[type], list.length);
    list.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.position.set(chunk.ox, 0, chunk.oz); mesh.castShadow = type !== 'glass'; mesh.receiveShadow = true;
    mesh.name = `pavement ${type}`; mesh.computeBoundingSphere(); return mesh;
  });
}
