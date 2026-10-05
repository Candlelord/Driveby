import * as THREE from 'three';
import { CHUNK, chunkKey } from './geo.js';
import { terrainMesh, roadMeshes, buildingMeshes } from './chunkMeshes.js';
import { floraMeshes } from './flora.js';
import { streetMeshes } from './streets.js';
import { buildingDetailMeshes } from './buildingDetails.js';
import { streetFurnitureMeshes } from './streetFurniture.js';

/**
 * Keeps the world built around the car.
 *
 * Every frame it works out which chunks should exist (a disc around the car,
 * a little further ahead than behind), starts loading the nearest missing
 * ones, builds at most a few milliseconds' worth of meshes, and throws away
 * chunks that have fallen well out of range. Nearest first, always, so the
 * ground under the wheels is never the last thing to arrive.
 */
export class Streamer {
  constructor(scene, world, { radius = 1400, budgetMs = 7, floraDensity = 1 } = {}) {
    this.scene = scene;
    this.world = world;
    this.radius = radius;
    this.budgetMs = budgetMs;
    this.floraDensity = floraDensity;
    this.live = new Map(); // key -> { group, chunk }
    this.building = new Set();
    this.queue = [];
    this.frame = 0;
  }

  /** Chunks within the radius of a point, nearest first. */
  _wanted(x, z, heading = 0) {
    const r = Math.ceil(this.radius / CHUNK) + 1;
    const cx0 = Math.floor(x / CHUNK);
    const cz0 = Math.floor(z / CHUNK);
    // Bias toward where the car is pointed.
    const ax = Math.sin(heading) * this.radius * 0.25;
    const az = -Math.cos(heading) * this.radius * 0.25;
    const out = [];
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const cx = cx0 + i;
        const cz = cz0 + j;
        if (!this.world.inBounds(cx, cz)) continue;
        const mx = (cx + 0.5) * CHUNK;
        const mz = (cz + 0.5) * CHUNK;
        const d = Math.hypot(mx - x, mz - z);
        const ahead = Math.hypot(mx - (x + ax), mz - (z + az));
        if (Math.min(d, ahead) > this.radius + CHUNK * 0.7) continue;
        out.push({ cx, cz, key: chunkKey(cx, cz), d: (d + ahead) / 2 });
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /** True once the chunks right around a point exist (used before the first frame of a drive). */
  readyAround(x, z) {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (this.world.inBounds(cx + i, cz + j) && !this.live.has(chunkKey(cx + i, cz + j))) return false;
    return true;
  }

  update(x, z, heading = 0) {
    this.frame++;
    this.lastX = x;
    this.lastZ = z;
    // Detail by distance: trees and street furniture only nearby, shadows
    // only from the chunks right around the car.
    if (this.frame % 15 === 0) for (const { group, chunk } of this.live.values()) this._detail(group, chunk, x, z);
    const wanted = this._wanted(x, z, heading);
    const keep = new Set(wanted.map((w) => w.key));

    // Drop what is well out of range (with a margin, so the edge does not flicker).
    if (this.frame % 30 === 0) {
      for (const [key, entry] of this.live) {
        const mx = (entry.chunk.cx + 0.5) * CHUNK;
        const mz = (entry.chunk.cz + 0.5) * CHUNK;
        if (!keep.has(key) && Math.hypot(mx - x, mz - z) > this.radius + CHUNK * 2) this._drop(key);
      }
    }

    // Load and build the nearest missing chunks within the time budget.
    const started = performance.now();
    let starts = 0;
    for (const w of wanted) {
      if (this.live.has(w.key) || this.building.has(w.key)) continue;
      const data = this.world.data.get(w.key);
      if (!data) {
        if (starts < 4 && !this.world.pending.has(w.key)) {
          starts++;
          this.world.fetchChunk(w.cx, w.cz);
        }
        continue;
      }
      this._build(data);
      if (performance.now() - started > this.budgetMs) break;
    }
  }

  _build(chunk) {
    const group = new THREE.Group();
    group.name = `chunk ${chunk.key}`;
    const tag = (layer) => (mesh) => {
      mesh.userData.layer = layer;
      mesh.userData.shadow = mesh.castShadow;
      group.add(mesh);
    };
    tag('ground')(terrainMesh(this.world, chunk));
    roadMeshes(this.world, chunk).forEach(tag('road'));
    buildingMeshes(this.world, chunk).forEach(tag('building'));
    buildingDetailMeshes(this.world, chunk).forEach(tag('architecture'));
    streetMeshes(this.world, chunk).forEach(tag('street'));
    streetFurnitureMeshes(this.world, chunk).forEach(tag('street'));
    floraMeshes(this.world, chunk, this.floraDensity).forEach(tag('flora'));
    this._detail(group, chunk, this.lastX ?? 0, this.lastZ ?? 0);
    this.scene.add(group);
    this.live.set(chunk.key, { group, chunk });
  }

  _detail(group, chunk, x, z) {
    const d = Math.hypot((chunk.cx + 0.5) * CHUNK - x, (chunk.cz + 0.5) * CHUNK - z);
    for (const mesh of group.children) {
      const layer = mesh.userData.layer;
      if (layer === 'flora') mesh.visible = d < this.radius * 0.6;
      else if (layer === 'architecture') mesh.visible = d < Math.min(700, this.radius * 0.6);
      else if (layer === 'street') mesh.visible = d < this.radius * 0.5;
      mesh.castShadow = Boolean(mesh.userData.shadow) && d < 330;
    }
  }

  _drop(key) {
    const entry = this.live.get(key);
    if (!entry) return;
    this.scene.remove(entry.group);
    entry.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
    this.live.delete(key);
    this.world.dropChunk(key);
  }
}
