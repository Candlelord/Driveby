import * as THREE from 'three';
import { toWorld } from './geo.js';
import { kitInstances } from './flora.js';

/**
 * Landmarks drawn by hand, for the places a footprint and a height cannot
 * capture: the National Theatre's cap, the Link Bridge's pylon, the horses on
 * the TBS gate, the Cathedral's spire, and up north Kano's gates, its mosque,
 * the dye pits and the oasis. Each is built the first time the car comes
 * within sight of it.
 */

const M = {
  white: () => new THREE.MeshStandardMaterial({ color: 0xf0eee6, roughness: 0.6 }),
  concrete: () => new THREE.MeshStandardMaterial({ color: 0xb4ae9e, roughness: 0.85 }),
  earth: () => new THREE.MeshStandardMaterial({ color: 0xb36e44, roughness: 0.95 }),
  green: () => new THREE.MeshStandardMaterial({ color: 0x2f7a52, roughness: 0.5, metalness: 0.2 }),
  stone: () => new THREE.MeshStandardMaterial({ color: 0xc9bfa8, roughness: 0.85 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.9 }),
};

const mesh = (geometry, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

export function nationalTheatre() {
  const g = new THREE.Group();
  const wall = M.concrete();
  g.add(mesh(new THREE.CylinderGeometry(58, 60, 12, 48), wall, 0, 6, 0));
  // The cap: a saddle roof, high at front and back and dipping at the sides.
  const roof = new THREE.CylinderGeometry(64, 62, 1.5, 64, 1, false);
  const pos = roof.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    pos.setY(i, pos.getY(i) + Math.cos(a * 2) * 7);
  }
  roof.computeVertexNormals();
  g.add(mesh(roof, M.white(), 0, 19, 0));
  g.add(mesh(new THREE.CylinderGeometry(20, 30, 8, 32), M.white(), 0, 22, 0));
  // Recessed glazing, structural fins and patterned panels break up the drum.
  const glass = new THREE.MeshStandardMaterial({ color: 0x263c40, roughness: 0.2, metalness: 0.35 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x986d42, roughness: 0.65, metalness: 0.25 });
  const trim = M.white();
  const add = (geometry, material, positions) => {
    const batch = new THREE.InstancedMesh(geometry, material, positions.length);
    const pose = new THREE.Object3D();
    positions.forEach(([x,y,z,yaw], i) => {
      pose.position.set(x,y,z); pose.rotation.set(0,yaw,0); pose.updateMatrix();
      batch.setMatrixAt(i, pose.matrix);
    });
    batch.castShadow = material !== glass; batch.receiveShadow = true;
    g.add(batch);
  };
  const radial = (i, count, radius, y) => {
    const a = i / count * Math.PI * 2;
    return [Math.cos(a) * radius, y, Math.sin(a) * radius, Math.PI / 2 - a];
  };
  const windows = [], fins = [], motifs = [], mullions = [];
  for (let i = 0; i < 64; i++) {
    windows.push(radial(i + 0.5, 64, 60.35, 4.0), radial(i + 0.5, 64, 59.6, 9.8));
    fins.push(radial(i, 64, 60.7, 6));
    mullions.push(radial(i + 0.5, 64, 60.58, 4.0));
    const a = (i + 0.5) / 64 * Math.PI * 2;
    // Repeated relief panels evoke the theatre's decorative facade band.
    for (const shift of [-1.3, 0, 1.3]) {
      motifs.push([Math.cos(a)*60.65 - Math.sin(a)*shift, 6.85, Math.sin(a)*60.65 + Math.cos(a)*shift, Math.PI/2-a]);
    }
  }
  add(new THREE.BoxGeometry(4.7, 3.0, 0.24), glass, windows);
  add(new THREE.BoxGeometry(0.32, 11.4, 0.7), trim, fins);
  add(new THREE.BoxGeometry(0.12, 3, 0.3), bronze, mullions);
  add(new THREE.BoxGeometry(0.75, 1.2, 0.32).rotateZ(Math.PI/4), bronze, motifs);
  for (const [radius, y, height] of [[60.9, 2.25, 0.45], [60.5, 5.9, 0.45], [59.7, 8, 0.5], [59, 11.6, 0.55]]) {
    g.add(mesh(new THREE.CylinderGeometry(radius, radius, height, 96, 1, true), trim, 0, y, 0));
  }
  const columns = [];
  for (let i = 0; i < 32; i++) columns.push(radial(i, 32, 61, 14.9 + Math.cos(i/32*Math.PI*4)*3.2));
  add(new THREE.BoxGeometry(0.8, 7.5, 0.8), wall, columns);
  // Four entrance porticoes make the monumental facade legible from the road.
  const canopies = [], doors = [], frames = [];
  for (let i = 0; i < 4; i++) {
    canopies.push(radial(i, 4, 63, 4.5));
    doors.push(radial(i, 4, 60.8, 1.7));
    for (const side of [-1,1]) {
      const p = radial(i, 4, 64, 2.2), a = i/4*Math.PI*2;
      p[0] -= Math.sin(a)*side*5.6; p[2] += Math.cos(a)*side*5.6; frames.push(p);
    }
  }
  add(new THREE.BoxGeometry(13, 0.55, 7), trim, canopies);
  add(new THREE.BoxGeometry(8, 3.3, 0.35), glass, doors);
  add(new THREE.BoxGeometry(0.5, 4.4, 0.5), wall, frames);
  return g;
}

function linkBridgePylon() {
  const g = new THREE.Group();
  const white = M.white();
  // A tall A-frame pylon, legs either side of the deck.
  for (const side of [-1, 1]) {
    const leg = mesh(new THREE.BoxGeometry(1.8, 72, 2.2), white, side * 9, 36, 0);
    leg.rotation.z = side * 0.12;
    g.add(leg);
  }
  g.add(mesh(new THREE.BoxGeometry(14, 2, 2.4), white, 0, 20, 0));
  g.add(mesh(new THREE.BoxGeometry(4, 8, 3), white, 0, 70, 0));
  // Cables fanning down to the deck both ways.
  const points = [];
  for (let k = 1; k <= 10; k++) {
    for (const dir of [-1, 1]) {
      for (const side of [-1, 1]) {
        points.push(new THREE.Vector3(side * 1.5, 66 - k * 1.6, 0), new THREE.Vector3(side * 6.5, 8.5, dir * k * 13));
      }
    }
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xffffff })));
  return g;
}

function tbsGate() {
  const g = new THREE.Group();
  const stone = M.white();
  for (const x of [-9, 9]) g.add(mesh(new THREE.BoxGeometry(5, 11, 5), stone, x, 5.5, 0));
  g.add(mesh(new THREE.BoxGeometry(24, 3, 6), stone, 0, 12.5, 0));
  // Four horses on top, rearing.
  const horse = M.dark();
  for (let i = 0; i < 4; i++) {
    const x = -7.5 + i * 5;
    const body = mesh(new THREE.BoxGeometry(1.2, 1.4, 3.4), horse, x, 15.4, 0);
    body.rotation.x = -0.35;
    g.add(body);
    g.add(mesh(new THREE.BoxGeometry(0.7, 1.6, 0.8), horse, x, 16.6, -1.8));
    for (const lz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.3, 2, 0.3), horse, x, 14.4, lz));
  }
  return g;
}

function cathedralSpire() {
  const g = new THREE.Group();
  const stone = M.stone();
  g.add(mesh(new THREE.BoxGeometry(9, 26, 9), stone, 0, 13, 0));
  g.add(mesh(new THREE.ConeGeometry(6.4, 22, 4), stone, 0, 37, 0));
  for (const [x, z] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) g.add(mesh(new THREE.ConeGeometry(0.9, 5, 6), stone, x, 28.5, z));
  return g;
}

function kanoGate() {
  // Two earthen towers either side of the road, joined high overhead, so the road stays open.
  const g = new THREE.Group();
  const earth = M.earth();
  for (const side of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(4.2, 5, 11, 12), earth, side * 10, 5.5, 0));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(0.7, 1.6, 6), earth, side * 10 + Math.cos(a) * 3.6, 11.6, Math.sin(a) * 3.6));
    }
  }
  g.add(mesh(new THREE.BoxGeometry(24, 3.2, 6), earth, 0, 10.2, 0));
  g.add(mesh(new THREE.BoxGeometry(24, 0.6, 7), M.dark(), 0, 8.4, 0));
  return g;
}

function kanoMosque() {
  const g = new THREE.Group();
  const white = M.white();
  g.add(mesh(new THREE.BoxGeometry(40, 10, 40), white, 0, 5, 0));
  g.add(mesh(new THREE.SphereGeometry(11, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.green(), 0, 10, 0));
  for (const [x, z] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) {
    g.add(mesh(new THREE.CylinderGeometry(1.4, 1.8, 34, 10), white, x, 17, z));
    g.add(mesh(new THREE.ConeGeometry(1.8, 4, 10), M.green(), x, 36, z));
  }
  return g;
}

function dyePits() {
  const g = new THREE.Group();
  const rim = M.earth();
  const blue = new THREE.MeshStandardMaterial({ color: 0x1d2f7a, roughness: 0.2 });
  for (let i = 0; i < 18; i++) {
    const x = (i % 6) * 4.2 - 10;
    const z = Math.floor(i / 6) * 4.2 - 4;
    g.add(mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.4, 16), rim, x, 0.2, z));
    const pool = mesh(new THREE.CircleGeometry(1.2, 16), blue, x, 0.42, z);
    pool.rotation.x = -Math.PI / 2;
    g.add(pool);
  }
  // Cloth drying on lines.
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2b44a8, roughness: 0.9, side: THREE.DoubleSide });
  for (let k = 0; k < 3; k++) g.add(mesh(new THREE.PlaneGeometry(6, 2), cloth, -6 + k * 7, 2.2, 10));
  return g;
}

function oasis() {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshStandardMaterial({ color: 0x2e7f8a, roughness: 0.05, metalness: 0.2 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.15;
  g.add(water);
  const palms = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = 34 + (i % 3) * 5;
    palms.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, s: 1 + (i % 4) * 0.15, r: a });
  }
  for (const m of kitInstances('palm', palms, { a: 0x4a7a34, b: 0x6a5238 })) g.add(m);
  return g;
}

export class Landmarks3D {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.sites = [];
    const at = (lat, lon) => toWorld(lat, lon);
    const lagos = [
      ['national-theatre', at(6.4757, 3.3647), nationalTheatre, 0],
      ['link-bridge', at(6.4489, 3.4329), linkBridgePylon, null],
      ['tbs', at(6.4492, 3.3992), tbsGate, 0.2],
      ['cathedral', at(6.4522, 3.3896), cathedralSpire, 0],
    ];
    for (const [id, p, build, angle] of lagos) this.sites.push({ id, x: p.x, z: p.z, build, angle, group: null });
    for (const p of world.north.places) {
      if (p.landmark === 'gate') this.sites.push({ id: p.id, x: p.x, z: p.z, build: kanoGate, angle: -p.angle + Math.PI / 2, group: null });
      if (p.landmark === 'mosque') this.sites.push({ id: p.id, x: p.x, z: p.z, build: kanoMosque, angle: 0, group: null });
      if (p.landmark === 'dyepits') this.sites.push({ id: p.id, x: p.x, z: p.z, build: dyePits, angle: 0, group: null });
      if (p.landmark === 'oasis') this.sites.push({ id: p.id, x: p.x, z: p.z, build: oasis, angle: 0, group: null });
    }
  }

  update(x, z) {
    for (const site of this.sites) {
      const near = Math.hypot(site.x - x, site.z - z) < 1500;
      if (near && !site.group) {
        site.group = site.build();
        let angle = site.angle;
        if (angle === null) {
          // Line up with the road it stands on (once that road has loaded).
          const road = this.world.nearestRoad(site.x, site.z, 60);
          angle = road ? -road.angle : 0;
          site.settled = Boolean(road);
        }
        site.group.rotation.y = angle;
        site.group.position.set(site.x, this.world.terrainHeight(site.x, site.z), site.z);
        this.scene.add(site.group);
      }
      if (site.group && site.angle === null && !site.settled) {
        const road = this.world.nearestRoad(site.x, site.z, 60);
        if (road) {
          site.group.rotation.y = -road.angle;
          site.settled = true;
        }
      }
      if (site.group) site.group.visible = near;
    }
  }
}
