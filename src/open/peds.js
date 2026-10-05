import * as THREE from 'three';

/**
 * People on foot along the roadsides: walking, carrying things on their
 * heads, and getting out of the way when a car comes at them. Only on the
 * smaller streets, where people actually walk.
 */

const WIDTH = [15, 13, 11, 9.5, 8.5, 7, 6.5, 5, 4.6, 4.6];
const SHIRTS = [0xff3d8b, 0xc6f000, 0xf5f2e8, 0x2f7cd8, 0xe8a317, 0x16161a, 0xd8261c, 0x37a84a, 0x7a4a86, 0xe86a2a];
const SKINS = [0x8a5a3b, 0x6b4128, 0x5a3622, 0x7a4a30, 0x4d2f1e, 0x9a6a48];
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const DUMMY = new THREE.Object3D();
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
    new THREE.BoxGeometry(0.36, 0.84, 0.24).translate(0, 0.42, 0),
    new THREE.BoxGeometry(0.48, 0.64, 0.28).translate(0, 1.16, 0),
    new THREE.BoxGeometry(0.12, 0.58, 0.12).translate(-0.3, 1.12, 0),
    new THREE.BoxGeometry(0.12, 0.58, 0.12).translate(0.3, 1.12, 0),
  ]);
  const head = merge([new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.62, 0)]);
  const load = merge([new THREE.BoxGeometry(0.5, 0.22, 0.45).translate(0, 1.88, 0)]);
  return { body, head, load };
}

export class Pedestrians {
  constructor(scene, { world, graph, count = 44 }) {
    this.world = world;
    this.graph = graph;
    this.count = count;
    const { body, head, load } = figure();
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
    this.heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
    this.loads = new THREE.InstancedMesh(load, new THREE.MeshStandardMaterial({ color: 0xc8a26a, roughness: 0.95 }), count);
    for (const m of [this.bodies, this.heads, this.loads]) {
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
      Object.assign(p, { active: true, edge, d: Math.random() * edge.len, side, offset: (WIDTH[edge.cls] ?? 6) / 2 + 1.2 + Math.random() * 1.5, speed: 1.1 + Math.random() * 0.6, phase: Math.random() * 10, dodge: 0, carry: Math.random() < 0.3, shirt: Math.floor(Math.random() * SHIRTS.length), skin: Math.floor(Math.random() * SKINS.length) });
      return;
    }
  }

  update(dt, time, vehicle) {
    if (!this.graph?.x.length) return;
    let i = 0;
    for (const p of this.people) {
      if (!p.active) this._spawn(p, vehicle.x, vehicle.z);
      if (!p.active) {
        for (const m of [this.bodies, this.heads, this.loads]) m.setMatrixAt(i, HIDDEN);
        i++;
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
      const ox = Math.cos(yaw) * (p.offset + p.dodge) * p.side;
      const oz = Math.sin(yaw) * (p.offset + p.dodge) * p.side;
      const px = x + ox;
      const pz = z + oz;
      const near = Math.hypot(vehicle.x - px, vehicle.z - pz);
      p.dodge += ((near < 7 ? 3.5 : 0) - p.dodge) * (1 - Math.exp(-6 * dt));
      if (near > 300) p.active = false;
      const y = this.world.surfaceAt(px, pz).y;
      const step = Math.abs(Math.sin(time * 6 * p.speed + p.phase)) * 0.06;
      DUMMY.position.set(px, y + step, pz);
      DUMMY.rotation.set(0, -yaw, 0);
      DUMMY.scale.setScalar(1);
      DUMMY.updateMatrix();
      this.bodies.setMatrixAt(i, DUMMY.matrix);
      this.heads.setMatrixAt(i, DUMMY.matrix);
      this.loads.setMatrixAt(i, p.carry ? DUMMY.matrix : HIDDEN);
      this.bodies.setColorAt(i, COLOR.setHex(SHIRTS[p.shirt]));
      this.heads.setColorAt(i, COLOR.setHex(SKINS[p.skin]));
      i++;
    }
    for (const m of [this.bodies, this.heads, this.loads]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
