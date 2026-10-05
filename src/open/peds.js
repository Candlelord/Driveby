import * as THREE from 'three';

/**
 * People on foot along the roadsides: walking, carrying things on their
 * heads, and getting out of the way when a car comes at them. Only on the
 * smaller streets, where people actually walk.
 */

const WIDTH = [15, 13, 11, 9.5, 8.5, 7, 6.5, 5, 4.6, 4.6];
const SHIRTS = [0xff3d8b, 0xc6f000, 0xf5f2e8, 0x2f7cd8, 0xe8a317, 0x16161a, 0xd8261c, 0x37a84a, 0x7a4a86, 0xe86a2a];
const SKINS = [0x8a5a3b, 0x6b4128, 0x5a3622, 0x7a4a30, 0x4d2f1e, 0x9a6a48];
const TROUSERS = [0x253448, 0x252326, 0x635345, 0xaaa08a, 0x394337];
const DUMMY = new THREE.Object3D();
const LIMB = new THREE.Object3D();
const MATRIX = new THREE.Matrix4();
const COLOR = new THREE.Color();

function figure() {
  const merge = (parts) => {
    let n = 0;
    const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
    for (const p of flat) n += p.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    let o = 0;
    for (const p of flat) {
      pos.set(p.attributes.position.array, o * 3);
      nor.set(p.attributes.normal.array, o * 3);
      o += p.attributes.position.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return g;
  };
  const body = merge([
    new THREE.CapsuleGeometry(0.2, 0.34, 3, 8).scale(1, 1, 0.68).translate(0, 1.15, 0),
    new THREE.SphereGeometry(0.1, 8, 6).scale(1, 1.2, 1).translate(-0.24, 1.37, 0),
    new THREE.SphereGeometry(0.1, 8, 6).scale(1, 1.2, 1).translate(0.24, 1.37, 0),
  ]);
  const head = merge([
    new THREE.SphereGeometry(0.14, 10, 8).scale(0.9, 1.15, 1).translate(0, 1.66, 0),
    new THREE.CylinderGeometry(0.055, 0.06, 0.12, 8).translate(0, 1.48, 0),
    new THREE.SphereGeometry(0.033, 6, 4).translate(0, 1.65, -0.13),
  ]);
  const hair = merge([
    new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.48).scale(0.9, 1.15, 1).translate(0, 1.67, 0),
    ...[-1, 1].map(s => new THREE.SphereGeometry(0.014, 4, 4).translate(s * 0.045, 1.69, -0.127)),
  ]);
  const leg = new THREE.CapsuleGeometry(0.079, 0.52, 3, 6).translate(0, -0.34, 0);
  const arm = new THREE.CapsuleGeometry(0.052, 0.38, 3, 6).translate(0, -0.27, 0);
  const shoe = new THREE.BoxGeometry(0.15, 0.09, 0.27).translate(0, -0.7, -0.045);
  const load = new THREE.CylinderGeometry(0.23, 0.17, 0.2, 10).translate(0, 1.94, 0);
  return { body, head, hair, leg, arm, shoe, load };
}

export class Pedestrians {
  constructor(scene, { world, graph, count = 44 }) {
    this.world = world;
    this.graph = graph;
    this.count = count;
    const { body, head, hair, leg, arm, shoe, load } = figure();
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
    this.heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
    this.loads = new THREE.InstancedMesh(load, new THREE.MeshStandardMaterial({ color: 0xc8a26a, roughness: 0.95 }), count);
    const dark = new THREE.MeshStandardMaterial({ color: 0x191719, roughness: 0.9 });
    this.hair = new THREE.InstancedMesh(hair, dark, count);
    this.legs = new THREE.InstancedMesh(leg, new THREE.MeshStandardMaterial({ roughness: 0.95 }), count * 2);
    this.arms = new THREE.InstancedMesh(arm, new THREE.MeshStandardMaterial({ roughness: 0.85 }), count * 2);
    this.shoes = new THREE.InstancedMesh(shoe, dark, count * 2);
    this.meshes = [this.bodies, this.heads, this.loads, this.hair, this.legs, this.arms, this.shoes];
    for (const m of this.meshes) {
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = true;
      scene.add(m);
    }
    this.people = Array.from({ length: count }, () => ({ active: false }));
  }

  _spawn(p, x, z) {
    const g = this.graph;
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 200;
      const node = g.nearest(x + Math.cos(a) * r, z + Math.sin(a) * r, 120);
      if (node === null) continue;
      const edges = g.adj[node].filter((e) => e.cls >= 4 && e.cls <= 8);
      if (!edges.length) continue;
      const edge = edges[Math.floor(Math.random() * edges.length)];
      const side = Math.random() < 0.5 ? -1 : 1;
      Object.assign(p, { active: true, edge, d: Math.random() * edge.len, side, offset: 0.8 + Math.random() * 0.7, speed: 1.1 + Math.random() * 0.6, phase: Math.random() * 10, dodge: 0, carry: Math.random() < 0.15, height: 0.94 + Math.random() * 0.12, trousers: Math.floor(Math.random() * TROUSERS.length), shirt: Math.floor(Math.random() * SHIRTS.length), skin: Math.floor(Math.random() * SKINS.length) });
      return;
    }
  }

  update(dt, time, vehicle) {
    if (!this.graph?.x.length) return;
    let i = 0, loads = 0;
    for (const p of this.people) {
      if (!p.active) this._spawn(p, vehicle.x, vehicle.z);
      if (!p.active) {
        continue;
      }
      p.d += p.speed * dt;
      if (p.d > p.edge.len || p.d < 0) {
        const next = this.graph.adj[p.edge.to].filter((e) => e.cls >= 4 && e.cls <= 8);
        if (next.length) {
          p.edge = next[Math.floor(Math.random() * next.length)];
          p.d = 0;
        } else p.active = false;
      }
      if (!p.active) continue;
      // Walk along the geometry.
      const geom = p.edge.geom;
      let left = Math.min(p.d, p.edge.len);
      let x = geom[0][0];
      let z = geom[0][1];
      let yaw = 0;
      for (let k = 0; k < geom.length - 1; k++) {
        const len = Math.hypot(geom[k + 1][0] - geom[k][0], geom[k + 1][1] - geom[k][1]);
        yaw = Math.atan2(geom[k + 1][0] - geom[k][0], -(geom[k + 1][1] - geom[k][1]));
        if (left <= len || k === geom.length - 2) {
          const t = len ? Math.min(1, left / len) : 0;
          x = geom[k][0] + (geom[k + 1][0] - geom[k][0]) * t;
          z = geom[k][1] + (geom[k + 1][1] - geom[k][1]) * t;
          break;
        }
        left -= len;
      }
      // Step aside if a car is coming.
      const centre = this.world.surfaceAt(x, z);
      if (!centre.road || centre.road.flags & 1) { p.active = false; continue; }
      const offset = (centre.road.width ?? WIDTH[p.edge.cls]) / 2 + p.offset + p.dodge;
      const ox = Math.cos(yaw) * offset * p.side;
      const oz = Math.sin(yaw) * offset * p.side;
      const px = x + ox;
      const pz = z + oz;
      const near = Math.hypot(vehicle.x - px, vehicle.z - pz);
      p.dodge += ((near < 7 ? 1.2 : 0) - p.dodge) * (1 - Math.exp(-6 * dt));
      if (near > 300 || this.world.isWater(px, pz) || this.world.buildingsNear(px, pz).some(b => inside(px, pz, b.ring))) { p.active = false; continue; }
      const pavement = !(centre.road.flags & 2) && centre.road.cls <= 5 && p.offset + p.dodge < 2.4;
      const y = pavement ? this.world.terrainHeight(x, z) + 0.22 : this.world.surfaceAt(px, pz).y;
      const gait = Math.sin(time * 5 * p.speed + p.phase);
      const step = Math.abs(gait) * 0.018;
      DUMMY.position.set(px, y + step, pz);
      DUMMY.rotation.set(0, -yaw, 0);
      DUMMY.scale.setScalar(p.height ?? 1);
      DUMMY.updateMatrix();
      this.bodies.setMatrixAt(i, DUMMY.matrix);
      this.heads.setMatrixAt(i, DUMMY.matrix);
      this.hair.setMatrixAt(i, DUMMY.matrix);
      if (p.carry) this.loads.setMatrixAt(loads++, DUMMY.matrix);
      for (let side = 0; side < 2; side++) {
        const sign = side ? 1 : -1;
        LIMB.position.set(sign * 0.115, 0.75, 0);
        LIMB.rotation.set(sign * gait * 0.48, 0, 0);
        LIMB.updateMatrix();
        MATRIX.multiplyMatrices(DUMMY.matrix, LIMB.matrix);
        this.legs.setMatrixAt(i * 2 + side, MATRIX);
        this.shoes.setMatrixAt(i * 2 + side, MATRIX);
        this.legs.setColorAt(i * 2 + side, COLOR.setHex(TROUSERS[p.trousers ?? 0]));
        LIMB.position.set(sign * 0.26, 1.38, 0);
        LIMB.rotation.set(p.carry && side === 1 ? -2.6 : -sign * gait * 0.34, 0, p.carry && side === 1 ? -0.35 : sign * 0.08);
        LIMB.updateMatrix();
        MATRIX.multiplyMatrices(DUMMY.matrix, LIMB.matrix);
        this.arms.setMatrixAt(i * 2 + side, MATRIX);
        this.arms.setColorAt(i * 2 + side, COLOR.setHex(SKINS[p.skin]));
      }
      this.bodies.setColorAt(i, COLOR.setHex(SHIRTS[p.shirt]));
      this.heads.setColorAt(i, COLOR.setHex(SKINS[p.skin]));
      i++;
    }
    for (const m of this.meshes) {
      m.count = m === this.loads ? loads : [this.legs, this.arms, this.shoes].includes(m) ? i * 2 : i;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

function inside(x, z, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
