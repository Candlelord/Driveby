import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { hash } from '../path.js';
import { TERRAIN_SETS } from '../terrainSets.js';
import { terrainHeight } from './terrain.js';

const CELL = 4; // along-road spacing of placement cells
const BEHIND = 16;
const WANDER = 80; // how far a walker roams before looping
const KERB_HEIGHT = 0.16;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
// How far a pedestrian keeps from the car's centreline when it comes onto the pavement.
const DODGE = 2.6;

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const DUMMY = new THREE.Object3D();
const POSITION = new THREE.Vector3();
const COLOR = new THREE.Color();

// Who is on the pavement, by region: clothing and skin palettes. Clothing in
// West Africa runs to bright wax prints and white kaftans; on the Maghreb coast
// to pale robes and dark jackets; in northern Europe to greys, navies and black.
const STYLES = {
  westAfrica: {
    clothes: [0xd9442b, 0xf2a71b, 0x2a7f62, 0x1f4e9c, 0x8e2d8a, 0xe4572e, 0x16a085, 0xf2eee4, 0x6b3fa0, 0x2c3e50, 0xc0392b, 0xf4d03f],
    skin: [0x3d2416, 0x4a2c1d, 0x5c3a24, 0x6b4229, 0x7a4c30],
    loads: 0.22,
  },
  maghreb: {
    clothes: [0xece6d8, 0x6b6e70, 0x2f4f6f, 0x8a6a4a, 0x1d1d1d, 0xb04a3a, 0xd8cbb0, 0x3a4a3a],
    skin: [0xb98a62, 0xa47452, 0xc89a72, 0x8e5e3e, 0x6b4229],
    loads: 0,
  },
  europe: {
    clothes: [0x2b2f36, 0x1f3b5c, 0x6b6e70, 0x8a7a5c, 0xc8c2b4, 0x5c2a2a, 0x2f4f3f, 0x111111, 0x9a3b3b],
    skin: [0xe0b89a, 0xc89a78, 0xa87452, 0x6b4229, 0x4a2c1d, 0xd8a888],
    loads: 0,
  },
  mixed: {
    clothes: [0x2b2f36, 0x1f3b5c, 0xd9442b, 0x6b6e70, 0xf2a71b, 0x2a7f62, 0xc8c2b4, 0x8e2d8a],
    skin: [0xe0b89a, 0xa87452, 0x6b4229, 0x4a2c1d, 0xc89a78],
    loads: 0,
  },
};

/**
 * People on the pavements.
 *
 * A city with nobody in it reads as a model, however good the buildings are.
 * These are simple figures — legs, hips, torso, arms, head — but they walk:
 * each vertex knows which limb it belongs to, and the vertex shader swings
 * legs and arms about hip and shoulder on a per-person phase, with a little
 * bob, so a crowd moves like a crowd. Some stand still at the kerb instead.
 *
 * Placement is a hash of road distance, so the same people are in the same
 * places as you drive past; walkers drift along their stretch of pavement in
 * either direction. How many there are, and who, comes from the terrain set
 * that laid down that stretch of road.
 */
export class People {
  constructor(scene, tier) {
    this.max = tier.people ?? 160;
    this.reach = tier.name === 'high' ? 170 : tier.name === 'medium' ? 130 : 90;
    this.cells = Math.ceil((this.reach + BEHIND) / CELL);

    this.uniforms = { uTime: { value: 0 } };
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          attribute float aLimb;
          attribute float aSkin;
          attribute float aShade;
          attribute vec2 aGait;
          attribute vec3 aSkinTone;
          varying float vSkin;
          varying float vShade;
          varying vec3 vSkinTone;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vSkin = aSkin;
          vShade = aShade;
          vSkinTone = aSkinTone;
          float stride = sin(uTime * 6.2 + aGait.x) * aGait.y;
          float pivot = 0.0;
          float swing = 0.0;
          if (aLimb > 0.5 && aLimb < 2.5) { pivot = 0.9; swing = (aLimb < 1.5 ? 1.0 : -1.0) * stride * 0.5; }
          else if (aLimb > 2.5) { pivot = 1.44; swing = (aLimb < 3.5 ? -1.0 : 1.0) * stride * 0.4; }
          if (aLimb > 0.5) {
            float y = transformed.y - pivot;
            float z = transformed.z;
            transformed.y = pivot + y * cos(swing) - z * sin(swing);
            transformed.z = y * sin(swing) + z * cos(swing);
          }
          transformed.y += abs(stride) * 0.035;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vSkin;
          varying float vShade;
          varying vec3 vSkinTone;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Instance colour is the outfit; trousers and shoes darker; skin and
          // hair from their own channels.
          diffuseColor.rgb *= vShade;
          diffuseColor.rgb = mix(diffuseColor.rgb, vSkinTone, step(0.5, vSkin) * (1.0 - step(1.5, vSkin)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.025, 0.02), step(1.5, vSkin));`
        );
    };
    this.material.customProgramCacheKey = () => 'people';

    const geometry = personGeometry();
    this.gait = new Float32Array(this.max * 2);
    this.skin = new Float32Array(this.max * 3);
    geometry.setAttribute('aGait', new THREE.InstancedBufferAttribute(this.gait, 2));
    geometry.setAttribute('aSkinTone', new THREE.InstancedBufferAttribute(this.skin, 3));
    this.gaitAttr = geometry.attributes.aGait;
    this.skinAttr = geometry.attributes.aSkinTone;

    this.mesh = instanced(geometry, this.material, this.max);
    this.mesh.castShadow = Boolean(tier.shadows) && tier.name === 'high';
    this.mesh.receiveShadow = Boolean(tier.shadows);

    // Head loads: the basins and trays carried on the head in West African
    // markets. A second instanced mesh sharing the carrier's matrix.
    this.loadMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.3 });
    const basin = mergeGeometries([
      new THREE.CylinderGeometry(0.34, 0.24, 0.14, 14).translate(0, 1.88, 0),
      new THREE.CylinderGeometry(0.26, 0.26, 0.1, 10).translate(0, 1.97, 0),
    ]);
    this.loads = instanced(basin, this.loadMaterial, this.max);

    for (let i = 0; i < this.max; i++) {
      this.mesh.setColorAt(i, COLOR.setScalar(1));
      this.loads.setColorAt(i, COLOR.setScalar(1));
    }
    scene.add(this.mesh, this.loads);
  }

  update(state, frame, environment) {
    this.uniforms.uTime.value = state.time;
    const live = state.live;
    const firstCell = Math.floor((state.travelled - BEHIND) / CELL);
    let used = 0;
    let loads = 0;

    for (let c = 0; c < this.cells && used < this.max; c++) {
      const cell = firstCell + c;
      const set = TERRAIN_SETS[environment.setAt(cell * CELL)];
      const density = set?.people ?? 0;
      if (density <= 0) continue;
      const style = STYLES[set.peopleStyle] ?? STYLES.mixed;
      const paved = set.sidewalk > 0.5;

      for (let k = 0; k < 4 && used < this.max; k++) {
        const key = cell * 7.31 + k * 1.93;
        if (hash(key) > density * 0.85) continue;
        const side = k % 2 === 0 ? -1 : 1;
        const walking = hash(key + 0.37) < 0.72;
        const dir = hash(key + 0.71) < 0.5 ? -1 : 1;
        const pace = 1.0 + hash(key + 1.13) * 0.7;

        let s = cell * CELL + hash(key + 2.9) * CELL;
        if (walking) {
          // Roam a stretch of pavement, looping; the loop point is far enough
          // off that the jump is rarely in view.
          const roam = (dir * pace * state.time + hash(key + 3.7) * WANDER) % WANDER;
          s += (roam < 0 ? roam + WANDER : roam) - WANDER / 2;
        }
        const ahead = s - state.travelled;
        if (ahead < -BEHIND || ahead > this.reach) continue;

        // On the pavement in a city; out on the verge anywhere else.
        let lateral = paved
          ? // Behind the line of parked cars (about 7.9 out), in front of the shops.
            side * (CONFIG.roadHalfWidth + 3.3 + hash(key + 4.4) * 3.4)
          : side * (CONFIG.roadHalfWidth + CONFIG.shoulderWidth + 0.8 + hash(key + 4.4) * 5);
        // Get out of the way. If the car comes up the pavement, anyone in its
        // path steps aside — whichever way leaves more room — easing out as it
        // approaches and back once it has passed.
        if (paved && Math.abs(state.lateral) > CONFIG.roadHalfWidth) {
          const dl = lateral - state.lateral;
          const near = smoothstep(18, 5, ahead) * smoothstep(-7, -2, ahead);
          if (near > 0 && Math.abs(dl) < DODGE) {
            const inner = Math.sign(lateral) * (CONFIG.roadHalfWidth + 0.6);
            const outer = Math.sign(lateral) * 12.2;
            const options = [state.lateral + DODGE, state.lateral - DODGE].filter(
              (x) => Math.abs(x) >= Math.abs(inner) - 0.01 && Math.abs(x) <= Math.abs(outer) + 0.01 && Math.sign(x) === Math.sign(lateral)
            );
            const target = options.length
              ? options.reduce((best, x) => (Math.abs(x - lateral) < Math.abs(best - lateral) ? x : best))
              : outer;
            lateral += (target - lateral) * near;
          }
        }
        const ground = paved ? KERB_HEIGHT : terrainHeight(lateral, s, live);
        frame.point(s, lateral, ground, POSITION);

        DUMMY.position.copy(POSITION);
        // Walkers face the way they go; standers face the road.
        const yaw = walking ? (dir > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
        DUMMY.rotation.set(0, yaw + (hash(key + 5.1) - 0.5) * 0.3, 0);
        const height = 0.92 + hash(key + 5.9) * 0.16;
        DUMMY.scale.set(height, height, height);
        DUMMY.updateMatrix();
        this.mesh.setMatrixAt(used, DUMMY.matrix);

        COLOR.set(style.clothes[Math.floor(hash(key + 6.3) * style.clothes.length)]);
        this.mesh.setColorAt(used, COLOR);
        COLOR.set(style.skin[Math.floor(hash(key + 6.9) * style.skin.length)]);
        this.skin[used * 3] = COLOR.r;
        this.skin[used * 3 + 1] = COLOR.g;
        this.skin[used * 3 + 2] = COLOR.b;
        this.gait[used * 2] = hash(key + 7.7) * Math.PI * 2;
        this.gait[used * 2 + 1] = walking ? 1 : 0;

        if (hash(key + 8.3) < style.loads) {
          this.loads.setMatrixAt(loads, DUMMY.matrix);
          COLOR.set(LOAD_COLOURS[Math.floor(hash(key + 8.9) * LOAD_COLOURS.length)]);
          this.loads.setColorAt(loads, COLOR);
          loads++;
        }
        used++;
      }
    }

    this.mesh.count = used;
    this.mesh.visible = used > 0;
    this.loads.count = loads;
    this.loads.visible = loads > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.loads.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.loads.instanceColor) this.loads.instanceColor.needsUpdate = true;
    this.gaitAttr.needsUpdate = true;
    this.skinAttr.needsUpdate = true;
  }
}

// Aluminium basins and bright plastic bowls.
const LOAD_COLOURS = [0xc8ccd0, 0xb0b4b8, 0xd94b2b, 0x2b6fd9, 0xf2c12e];

/**
 * A person about 1.75 m tall, facing +Z, with per-vertex limb ids (0 body,
 * 1/2 legs, 3/4 arms), a skin flag (0 cloth, 1 skin, 2 hair) and a shade
 * (trousers darker than shirt).
 */
function personGeometry() {
  const parts = [];
  const add = (geometry, limb, skin, shade) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('aLimb', new THREE.Float32BufferAttribute(new Float32Array(n).fill(limb), 1));
    g.setAttribute('aSkin', new THREE.Float32BufferAttribute(new Float32Array(n).fill(skin), 1));
    g.setAttribute('aShade', new THREE.Float32BufferAttribute(new Float32Array(n).fill(shade), 1));
    parts.push(g);
  };
  const box = (w, h, d, x, y, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

  for (const [side, limb] of [[-1, 1], [1, 2]]) {
    add(box(0.15, 0.84, 0.17, side * 0.095, 0.48), limb, 0, 0.42); // leg
    add(box(0.15, 0.08, 0.26, side * 0.095, 0.04, 0.04), limb, 0, 0.18); // shoe
  }
  add(box(0.36, 0.2, 0.22, 0, 0.94), 0, 0, 0.42); // hips
  add(box(0.4, 0.6, 0.24, 0, 1.22), 0, 0, 1); // torso
  for (const [side, limb] of [[-1, 3], [1, 4]]) {
    add(box(0.1, 0.56, 0.12, side * 0.26, 1.2), limb, 0, 0.95); // sleeve
    add(box(0.085, 0.13, 0.1, side * 0.26, 0.86), limb, 1, 1); // hand
  }
  add(box(0.1, 0.08, 0.1, 0, 1.56), 0, 1, 1); // neck
  add(new THREE.SphereGeometry(0.115, 10, 8).scale(1, 1.15, 1).translate(0, 1.68, 0), 0, 1, 1); // head
  add(
    new THREE.SphereGeometry(0.122, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.45).scale(1, 1.15, 1).translate(0, 1.69, -0.005),
    0,
    2,
    1
  ); // hair

  const geometry = mergeGeometries(parts);
  geometry.computeVertexNormals();
  return geometry;
}

function instanced(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
  return mesh;
}
