import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { hash } from '../path.js';
import { TERRAIN_SETS } from '../terrainSets.js';
import { terrainHeight } from './terrain.js';
import { grassCard, keepCardNormals } from './surfaces.js';

const INNER_EDGE = CONFIG.roadHalfWidth + CONFIG.shoulderWidth;
const ROW = 1.4; // along-road spacing between rows of tufts
const BEHIND = 18;
const WIDTH = 44; // how far out from the verge the grass carries

const DUMMY = new THREE.Object3D();
const POSITION = new THREE.Vector3();
const COLOR = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Verge grass: thousands of small crossed-card tufts laid along the road.
 *
 * Bare ground under a chase camera is the loudest "this is a game" cue there
 * is — real verges are never a smooth sheet. The tufts are cheap (three quads
 * each, one instanced draw), take their colour from the land under them so
 * they are green in a meadow, straw in a desert and frosted in winter, sway on
 * a vertex shader, and are placed from a hash of absolute distance so they hold
 * still in the world as it scrolls past.
 *
 * Normals all point straight up, so a tuft is lit exactly like the ground it
 * grows from instead of flickering as each card turns toward or away from the
 * sun — the standard foliage-card trick.
 */
export class Grass {
  constructor(scene, tier) {
    this.count = tier.grass;
    this.reach = tier.name === 'high' ? 150 : tier.name === 'medium' ? 110 : 70;
    this.rows = Math.ceil((this.reach + BEHIND) / ROW);
    this.perRow = Math.max(2, Math.ceil(this.count / this.rows));

    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: grassCard(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0,
    });
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0 } };
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uWind = this.uniforms.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 root = instanceMatrix[3].xyz;
          #else
            vec3 root = vec3(0.0);
          #endif
          float gust = sin(uTime * 1.9 + root.x * 0.21 + root.z * 0.13) * 0.6
                     + sin(uTime * 3.7 + root.z * 0.5) * 0.25;
          float bend = uv.y * uv.y * (0.06 + uWind * 0.32);
          transformed.x += gust * bend;
          transformed.z += gust * bend * 0.4;`
        );
    };
    keepCardNormals(this.material);

    this.mesh = new THREE.InstancedMesh(tuftGeometry(), this.material, this.rows * this.perRow);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    for (let i = 0; i < this.mesh.count; i++) {
      this.mesh.setMatrixAt(i, HIDDEN);
      this.mesh.setColorAt(i, COLOR.setScalar(1));
    }
    scene.add(this.mesh);
  }

  update(state, frame, environment) {
    const live = state.live;
    this.uniforms.uTime.value = state.time;
    this.uniforms.uWind.value = live.wind ?? 0;

    // The same colour the land is painted, a touch deeper (grass is never as
    // pale as the soil between it), with snow settling on it as on the ground.
    BASE.copy(live.groundColor).lerp(live.groundAccent, 0.35).multiplyScalar(0.92);
    if (live.groundTintStrength > 0) BASE.lerp(live.groundTint, live.groundTintStrength * 0.7);

    const firstRow = Math.floor((state.travelled - BEHIND) / ROW);
    const water = live.water > 0.3;
    let used = 0;

    for (let r = 0; r < this.rows; r++) {
      const row = firstRow + r;
      const s = row * ROW;
      const density = TERRAIN_SETS[environment.setAt(s)]?.grass ?? 1;
      if (density <= 0) continue;
      const ahead = s - state.travelled;
      const fade = Math.min(1, (this.reach - ahead) / 30);

      for (let i = 0; i < this.perRow; i++) {
        const key = row * 13.17 + i * 3.31;
        const h1 = hash(key);
        const h2 = hash(key + 0.71);
        const h3 = hash(key + 1.93);
        const side = i % 2 === 0 ? -1 : 1;
        const w = side * (INNER_EDGE + 0.15 + Math.pow(h1, 1.7) * WIDTH);

        // Patches and clearings rather than an even lawn.
        const patch =
          0.6 + 0.4 * Math.sin(s * 0.043 + w * 0.09) * Math.sin(s * 0.017 - w * 0.061 + 1.7);
        // Thickest right at the verge, where mowing stops and runoff waters it.
        const verge = 1.25 - Math.min(1, Math.abs(w) / (INNER_EDGE + WIDTH)) * 0.5;
        if (h2 > patch * verge * Math.min(1, density)) continue;

        const height = terrainHeight(w, s, live);
        frame.point(s, w, height, POSITION);
        if (water && POSITION.y < live.waterLevel + 0.25) continue;

        const size = (0.55 + h3 * 0.75) * Math.max(0.05, fade) * (density > 1 ? density : 1);
        DUMMY.position.copy(POSITION);
        DUMMY.rotation.set(0, h1 * 40, 0);
        DUMMY.scale.set(size * (0.8 + h2 * 0.5), size * (0.75 + h3 * 0.6), size);
        DUMMY.updateMatrix();
        this.mesh.setMatrixAt(used, DUMMY.matrix);
        COLOR.copy(BASE).multiplyScalar(0.78 + hash(key + 2.7) * 0.4);
        this.mesh.setColorAt(used, COLOR);
        used++;
      }
    }

    this.mesh.count = used;
    this.mesh.visible = used > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const BASE = new THREE.Color();

/** Three crossed quads, rooted at y = 0, with v = 0 at the ground. */
function tuftGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const width = 1.1;
  const height = 0.8;
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI;
    const dx = (Math.cos(angle) * width) / 2;
    const dz = (Math.sin(angle) * width) / 2;
    const base = positions.length / 3;
    positions.push(-dx, 0, -dz, dx, 0, dz, dx, height, dz, -dx, height, -dz);
    for (let v = 0; v < 4; v++) normals.push(0, 1, 0);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
