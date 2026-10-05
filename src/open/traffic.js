import * as THREE from 'three';
import { loadTrafficModels } from '../world/trafficModels.js';
import { NORTH_EDGE } from './geo.js';

/**
 * Traffic on the real road network: danfos and saloons and the odd ambulance,
 * driving the graph lane by lane, picking turns at junctions, slowing behind
 * whatever is in front of them (you included). They are solid: hit one and
 * you both feel it.
 *
 * Cars live within a few hundred metres of you; one that falls far behind is
 * quietly moved to a road ahead.
 */

const SPEED = [24, 21, 16, 14, 12, 10, 8.5, 8, 7, 6];
const WIDTH = [15, 13, 11, 9.5, 8.5, 7, 6.5, 5, 4.6, 4.6];
const PAINT = [0xd8d8d2, 0x2f3a4a, 0x8a2f2f, 0x30503c, 0xd8a23a, 0x5a5f68, 0x7a4a86, 0xf2c21b];
const DUMMY = new THREE.Object3D();
const COLOR = new THREE.Color();

export class Traffic {
  constructor(scene, { world, graph, count = 26 }) {
    this.world = world;
    this.graph = graph;
    this.count = count;
    this.cars = [];
    this.kinds = [];
    this.scene = scene;
    loadTrafficModels((spec, parts) => {
      const meshes = parts.map((part) => {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, count);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.count = 0;
        mesh.userData.isPaint = part.isPaint;
        scene.add(mesh);
        return mesh;
      });
      this.kinds.push({ spec, meshes });
    });
  }

  _kind(x, z) {
    if (!this.kinds.length) return null;
    const lagos = z > NORTH_EDGE;
    if (lagos && Math.random() < 0.35 && this.kinds.some((k) => k.spec.id === 'danfo')) return 'danfo';
    let total = 0;
    for (const k of this.kinds) if (!k.spec.danfo) total += k.spec.weight;
    let roll = Math.random() * total;
    for (const k of this.kinds) {
      if (k.spec.danfo) continue;
      roll -= k.spec.weight;
      if (roll <= 0) return k.spec.id;
    }
    return this.kinds[0].spec.id;
  }

  _spawn(car, vx, vz, ahead) {
    const g = this.graph;
    // A node some way off, preferably ahead.
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = ahead + (Math.random() - 0.5) * 2.4;
      const r = 140 + Math.random() * 280;
      const node = g.nearest(vx + Math.sin(angle) * r, vz - Math.cos(angle) * r, 160);
      if (node === null) continue;
      const edges = g.adj[node].filter((e) => e.cls <= 7);
      if (!edges.length) continue;
      const edge = edges[Math.floor(Math.random() * edges.length)];
      Object.assign(car, { edge, d: Math.random() * edge.len * 0.5, speed: SPEED[edge.cls] * 0.6, kind: this._kind(g.x[node], g.z[node]), paint: Math.floor(Math.random() * PAINT.length), hit: 0, spin: 0, active: true });
      car.kind ??= null;
      return true;
    }
    car.active = false;
    return false;
  }

  /** Point and heading along an edge at distance d. */
  _locate(edge, d, out) {
    const geom = edge.geom;
    let left = d;
    for (let i = 0; i < geom.length - 1; i++) {
      const [x0, z0] = geom[i];
      const [x1, z1] = geom[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (left <= len || i === geom.length - 2) {
        const t = len ? Math.min(1, left / len) : 0;
        out.x = x0 + (x1 - x0) * t;
        out.z = z0 + (z1 - z0) * t;
        out.yaw = Math.atan2(x1 - x0, -(z1 - z0));
        return out;
      }
      left -= len;
    }
    out.x = geom[0][0];
    out.z = geom[0][1];
    out.yaw = 0;
    return out;
  }

  update(dt, vehicle, sfx) {
    if (!this.graph?.x.length) return;
    while (this.cars.length < this.count) this.cars.push({ active: false });
    const here = { x: 0, z: 0, yaw: 0 };

    this.cars.forEach((car, i) => {
      if (!car.active || !car.kind) {
        if (!this._spawn(car, vehicle.x, vehicle.z, vehicle.yaw)) return;
        if (!car.kind) car.kind = this._kind(vehicle.x, vehicle.z);
        if (!car.kind) return;
      }
      // Drive along the edge, on to the next at the end.
      if (car.hit > 0) {
        car.hit -= dt;
        car.speed *= Math.exp(-2.5 * dt);
        car.spin *= Math.exp(-2 * dt);
      } else {
        const target = SPEED[car.edge.cls] ?? 9;
        car.speed += (target - car.speed) * (1 - Math.exp(-0.8 * dt));
      }
      this._locate(car.edge, car.d, here);
      // Keep to the right of a two-way road.
      const lane = car.edge.oneway ? 0 : (WIDTH[car.edge.cls] ?? 7) * 0.25;
      const x = here.x + Math.cos(here.yaw) * lane;
      const z = here.z + Math.sin(here.yaw) * lane;

      // Slow for the player in front.
      const fx = Math.sin(here.yaw);
      const fz = -Math.cos(here.yaw);
      const dx = vehicle.x - x;
      const dz = vehicle.z - z;
      const along = dx * fx + dz * fz;
      const across = Math.abs(dx * -fz + dz * fx);
      if (along > 0 && along < 14 && across < 2.6 && car.hit <= 0) car.speed = Math.min(car.speed, Math.max(0, (along - 6) * 1.2));

      car.d += car.speed * dt;
      if (car.d >= car.edge.len) {
        car.d -= car.edge.len;
        const options = this.graph.adj[car.edge.to].filter((e) => e.to !== car.edge.from && e.cls <= 7);
        const all = this.graph.adj[car.edge.to];
        car.edge = options.length ? options[Math.floor(Math.random() * options.length)] : all[0] ?? car.edge;
      }

      // Too far away: re-place ahead.
      if (Math.hypot(dx, dz) > 560) {
        car.active = false;
        return;
      }

      // Crashes with the player.
      const dist = Math.hypot(dx, dz);
      if (dist < 2.7 && car.hit <= 0) {
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        const closing = Math.abs((vehicle.vx - fx * car.speed) * nx + (vehicle.vz - fz * car.speed) * nz);
        const strength = Math.min(1, 0.15 + closing / 30);
        vehicle.knock(nx * (2 + strength * 6), nz * (2 + strength * 6), 0.55, strength);
        car.hit = 3;
        car.spin = (Math.random() < 0.5 ? -1 : 1) * strength * 1.4;
        car.speed *= 0.3;
        sfx?.crash(strength);
      }
      car.spinYaw = (car.spinYaw ?? 0) + car.spin * dt;
      const y = this.world.surfaceAt(x, z).y;
      car.pose = { x, y, z, yaw: here.yaw + car.spinYaw };
      void i;
    });

    // Instances: each vehicle type draws only the cars that are that type.
    for (const kind of this.kinds) {
      const mine = this.cars.filter((car) => car.active && car.kind === kind.spec.id && car.pose);
      for (const mesh of kind.meshes) {
        mine.forEach((car, j) => {
          DUMMY.position.set(car.pose.x, car.pose.y, car.pose.z);
          DUMMY.rotation.set(0, -car.pose.yaw, 0);
          DUMMY.updateMatrix();
          mesh.setMatrixAt(j, DUMMY.matrix);
          if (mesh.userData.isPaint) mesh.setColorAt(j, COLOR.setHex(PAINT[car.paint % PAINT.length]));
        });
        mesh.count = mine.length;
        mesh.visible = mine.length > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }
}
