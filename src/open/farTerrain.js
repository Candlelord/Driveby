import * as THREE from 'three';
import { WORLD } from './geo.js';
import { groundColour } from './chunkMeshes.js';
import { worldMaterials } from './materials.js';

const STEP = 150;
const C = new THREE.Color();

/**
 * The land beyond the streamed chunks: one coarse mesh over the whole world,
 * a little below the detailed ground so it never shows through it, so hills,
 * dunes and Zuma Rock stand on the horizon instead of the world ending in fog.
 *
 * And the water: one sheet at sea level that follows the car, under which the
 * ground dips wherever the map says lagoon, creek or sea.
 */
export class FarTerrain {
  constructor(scene, world) {
    const nx = Math.ceil((WORLD.maxX - WORLD.minX) / STEP) + 1;
    const nz = Math.ceil((WORLD.maxZ - WORLD.minZ) / STEP) + 1;
    const position = new Float32Array(nx * nz * 3);
    const color = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = WORLD.minX + i * STEP;
        const z = WORLD.minZ + j * STEP;
        const y = world.terrainHeight(x, z);
        const k = (j * nx + i) * 3;
        position[k] = x;
        position[k + 1] = y - 0.8;
        position[k + 2] = z;
        groundColour(world, x, z, y, C);
        color[k] = C.r;
        color[k + 1] = C.g;
        color[k + 2] = C.b;
      }
    }
    const index = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        index.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    const water = worldMaterials().water;
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), water);
    this.water.position.y = -0.45;
    this.water.renderOrder = 1;
    scene.add(this.water);
  }

  update(x, z, live) {
    this.water.position.x = Math.round(x / 50) * 50;
    this.water.position.z = Math.round(z / 50) * 50;
    if (live) this.water.material.color.copy(live.waterColor ?? this.water.material.color).lerp(new THREE.Color(0x2d5566), 0.6);
  }
}
