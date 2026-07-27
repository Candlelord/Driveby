import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { hash } from '../path.js';
import { terrainHeight } from './terrain.js';
import { PROP_KIT, PROP_NAMES } from '../props/kit.js';
import { TERRAIN_SETS } from '../terrainSets.js';

// Distance at which ~15% of an object still shows through clear-weather fog.
const REFERENCE_REACH = 180;

const DUMMY = new THREE.Object3D();
const POSITION = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Roadside scenery.
 *
 * Each slot along the road belongs to whichever terrain set was current when
 * that stretch of road first came into existence — which is well outside the
 * fog, so scenery swaps are never seen happening. That is much cheaper than
 * cross-fading every shape against every other, and the spec recommends it.
 *
 * One InstancedMesh per kit part, hidden entirely when a set does not use it,
 * so unused shapes cost nothing.
 */
export class Props {
  constructor(scene, tier) {
    this.slots = tier.propSlots;
    this.lampSlots = tier.lampSlots;

    this.materialA = flat(0x4d7a48);
    this.materialB = flat(0x46403a);
    this.materialE = new THREE.MeshBasicMaterial({ color: 0x000000, fog: true });
    this.lampPoleMaterial = flat(0x2a2f36);
    this.lampHeadMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, fog: true });

    const materials = { a: this.materialA, b: this.materialB, e: this.materialE };

    // One entry per prop type, each holding its parts' instanced meshes.
    this.types = {};
    for (const name of PROP_NAMES) {
      const def = PROP_KIT[name];
      const meshes = def.parts.map((part) => {
        const mesh = instanced(part.geometry(), materials[part.material], this.slots);
        mesh.visible = false;
        scene.add(mesh);
        return mesh;
      });
      this.types[name] = { def, meshes, used: 0 };
    }

    this.lampPole = instanced(cylinder(0.12, 6.4, 3.2), this.lampPoleMaterial, this.lampSlots);
    this.lampHead = instanced(
      box(1.5, 0.24, 0.5, 6.35, -0.85),
      this.lampHeadMaterial,
      this.lampSlots
    );
    scene.add(this.lampPole, this.lampHead);
  }

  update(state, frame, environment) {
    this._updateProps(state, frame, environment);
    this._updateLamps(state, frame);

    const live = state.live;
    this.materialA.color.copy(live.propA);
    this.materialB.color.copy(live.propB);
    // Basic materials have no lighting to dim, so "off" is just a black colour.
    this.materialE.color.copy(live.propE).multiplyScalar(live.propEmissive);
    this.lampHeadMaterial.color.copy(live.lampColor).multiplyScalar(live.lampIntensity);
    this.lampPoleMaterial.color.copy(live.propB);
  }

  _updateProps(state, frame, environment) {
    const { propSpacing, segmentLength, segmentsBehind } = CONFIG;
    const live = state.live;
    const behind = segmentsBehind * segmentLength;
    const firstSlot = Math.floor((state.travelled - behind) / propSpacing);

    // Thick air hides most of the scatter: a misty forest can place forty trees
    // and show three. Scale density by how far you can actually see, so a set
    // reads as equally populated whatever weather it is found in — measured
    // against a clear-day reach rather than guessed at per set.
    const fogBoost = clamp(REFERENCE_REACH * live.fogDensity, 1, 3.6);

    for (const type of Object.values(this.types)) type.used = 0;

    for (let i = 0; i < this.slots; i++) {
      const slot = firstSlot + i;
      const s = slot * propSpacing;

      const setId = environment.setAt(s);
      const set = TERRAIN_SETS[setId];

      // Density is the set's, not the blended value — a slot belongs wholly to
      // one set, so it should be as sparse or dense as that set wants.
      //
      // Clumping matters as much as the average: a uniform scatter at high
      // density reads as a hedge, so two slow waves push it into thickets and
      // clearings while leaving the mean roughly where the set asked for it.
      const clump = 0.55 + 0.9 * (0.5 + 0.5 * Math.sin(s * 0.0082) * Math.cos(s * 0.0031 + 1.3));
      if (hash(slot * 5.9) >= set.propDensity * clump * fogBoost) continue;

      const typeName = pickType(set.propMix, hash(slot * 2.3));
      const type = this.types[typeName];
      if (!type || type.used >= this.slots) continue;

      const def = type.def;
      const side = hash(slot * 1.7) < 0.5 ? -1 : 1;
      const distance = def.spread + hash(slot * 3.3) * def.jitter;
      const offset = side * distance;

      frame.point(s, offset, terrainHeight(offset, s, live), POSITION);

      DUMMY.position.copy(POSITION);
      // Poles and guardrails face the road; everything else is scattered.
      const aligned = typeName === 'pole' || typeName === 'guardrail';
      DUMMY.rotation.set(0, aligned ? (side > 0 ? 0 : Math.PI) : hash(slot * 9.3) * Math.PI * 2, 0);

      // Wind bends things over during a tornado.
      DUMMY.rotation.z = live.propLean * 0.35 * (aligned ? 0.3 : 1);

      const size = (0.75 + hash(slot * 7.1) * 0.8) * set.propScale;
      if (def.stretch) {
        const [fMin, fMax] = def.stretch.footprint;
        const [hMin, hMax] = def.stretch.height;
        DUMMY.scale.set(
          fMin + hash(slot * 11.7) * (fMax - fMin),
          hMin + hash(slot * 13.1) * (hMax - hMin),
          fMin + hash(slot * 17.3) * (fMax - fMin)
        );
      } else {
        DUMMY.scale.setScalar(size);
      }
      DUMMY.updateMatrix();

      for (const mesh of type.meshes) mesh.setMatrixAt(type.used, DUMMY.matrix);
      type.used++;
    }

    for (const type of Object.values(this.types)) {
      const visible = type.used > 0;
      for (const mesh of type.meshes) {
        mesh.visible = visible;
        if (!visible) continue;
        mesh.count = type.used;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  _updateLamps(state, frame) {
    const { lampSpacing, segmentLength, segmentsBehind } = CONFIG;
    const behind = segmentsBehind * segmentLength;
    const firstSlot = Math.floor((state.travelled - behind) / lampSpacing);
    // Scale rather than toggle, so lamps shrink away over a crossfade instead
    // of vanishing the instant the mood's lamp intensity hits zero.
    const on = clamp01(state.live.lampIntensity / 0.14);
    this.lampPole.visible = on > 0;
    this.lampHead.visible = on > 0;
    if (on <= 0) return;

    for (let i = 0; i < this.lampSlots; i++) {
      const slot = firstSlot + i;
      const side = slot % 2 === 0 ? 1 : -1;
      frame.point(slot * lampSpacing, side * (CONFIG.roadHalfWidth + 3.4), 0, POSITION);

      DUMMY.position.copy(POSITION);
      DUMMY.rotation.set(0, side > 0 ? 0 : Math.PI, 0);
      DUMMY.scale.setScalar(on);
      DUMMY.updateMatrix();
      this.lampPole.setMatrixAt(i, DUMMY.matrix);
      this.lampHead.setMatrixAt(i, DUMMY.matrix);
    }

    this.lampPole.instanceMatrix.needsUpdate = true;
    this.lampHead.instanceMatrix.needsUpdate = true;
  }
}

/** Roll one type out of a set's weighted mix, deterministically per slot. */
function pickType(mix, roll) {
  let total = 0;
  for (const entry of mix) total += entry[1];
  let target = roll * total;
  for (const [name, weight] of mix) {
    target -= weight;
    if (target <= 0) return name;
  }
  return mix[mix.length - 1][0];
}

function cylinder(radius, height, y) {
  return new THREE.CylinderGeometry(radius, radius * 1.15, height, 6).translate(0, y, 0);
}

function box(w, h, d, y, x = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, 0);
}

function instanced(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
  return mesh;
}

function flat(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function clamp(x, min, max) {
  return x < min ? min : x > max ? max : x;
}
