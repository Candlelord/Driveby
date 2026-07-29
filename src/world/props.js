import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { hash } from '../path.js';
import { terrainHeight } from './terrain.js';
import { PROP_KIT, PROP_NAMES } from '../props/kit.js';
import { TERRAIN_SETS } from '../terrainSets.js';

// Distance at which ~15% of an object still shows through clear-weather fog.
const REFERENCE_REACH = 180;

// Two different jobs that used to share one flag.
//
// FACING props turn to look at the road — a sign is useless side-on. Their
// geometry is built facing +Z, so a yaw of 0 or PI is right.
//
// ALONG props are linear and must run *parallel* to the road: fences, walls,
// crash barriers, hedges. Their geometry is built along local X, so they need a
// quarter turn, and they only line up into a run if their lateral offset and
// size are fixed rather than jittered per slot.
const FACING = new Set([
  'pole', 'sign', 'mileMarker', 'billboard', 'cone', 'mailbox', 'busShelter', 'pierPost',
]);
const ALONG = new Set(['fence', 'wall', 'guardrail', 'hedge', 'barrier']);

// How many slots a linear run covers before the type is rolled again.
const RUN_BLOCK = 26;
const SWAYS = new Set([
  'grass', 'reeds', 'lavender', 'flowers', 'shrub', 'glowPlant', 'birch',
  'round', 'palm', 'hedge',
]);

const TINT = new THREE.Color();
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
        // Per-instance colour: identical props in a row is the single biggest
        // tell that a scene is instanced. A small deterministic jitter around
        // the set's colour breaks it up for one attribute.
        mesh.userData.tint = part.material;
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
    const farEdge = CONFIG.segmentsAhead * CONFIG.segmentLength;

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
      // A fence is a run, not a scatter. Rolling the type per slot means
      // consecutive slots almost never both land on 'fence', so what should be
      // a hundred metres of fenced boundary came out as isolated sections.
      // Linear types are chosen once per block of road instead, and excluded
      // from the per-slot roll so they never appear alone.
      const block = Math.floor(slot / RUN_BLOCK);
      const blockType = pickType(set.propMix, hash(block * 7.7));
      const inRun = ALONG.has(blockType);

      const typeName = inRun ? blockType : pickScatterType(set.propMix, hash(slot * 2.3));
      if (!typeName) continue;

      const type = this.types[typeName];
      if (!type || type.used >= this.slots) continue;

      const def = type.def;
      const runsAlong = inRun;

      // A run keeps going unless the density roll is very unlucky; a broken
      // fence should read as a gate, not as neglect.
      const density = set.propDensity * clump * fogBoost * (runsAlong ? 2.2 : 1);
      if (hash(slot * 5.9) >= density) continue;

      // A run of fence only reads as a fence if consecutive sections abut, so
      // linear props sit on their own stride rather than wherever the scatter
      // put them, and take no lateral jitter.
      if (runsAlong && slot % (def.stride ?? 2) !== 0) continue;

      const side = hash(slot * 1.7) < 0.5 ? -1 : 1;
      const distance = runsAlong ? def.spread : def.spread + hash(slot * 3.3) * def.jitter;
      const offset = side * distance;

      frame.point(s, offset, terrainHeight(offset, s, live), POSITION);

      DUMMY.position.copy(POSITION);
      // A quarter turn maps a prop's local +X onto the road's forward axis.
      const yaw = runsAlong
        ? Math.PI / 2
        : FACING.has(typeName)
          ? side > 0
            ? 0
            : Math.PI
          : hash(slot * 9.3) * Math.PI * 2;
      DUMMY.rotation.set(0, yaw, 0);

      // Wind. A tornado bends everything hard; ordinary weather just breathes
      // through the vegetation, each prop on its own phase so it is not a
      // synchronised wave.
      const sway = SWAYS.has(typeName)
        ? Math.sin(state.time * (1.1 + hash(slot * 4.1) * 0.9) + slot) * live.wind * 0.055
        : 0;
      DUMMY.rotation.z = live.propLean * 0.35 * (runsAlong || FACING.has(typeName) ? 0.3 : 1) + sway;

      // Fade in with distance rather than popping at the spawn boundary: the
      // furthest slots scale up over their last stretch of approach.
      const ahead = s - state.travelled;
      const fade = clamp((farEdge - ahead) / 55, 0, 1);
      if (fade <= 0.01) continue;

      // Big structures take a fixed damper as well as the set's scale, so a
      // water tower thirty units away does not end up the size of a hill.
      // Linear props take no size jitter either — mismatched section heights
      // are as obvious as mismatched angles.
      const jitterScale = runsAlong ? 1 : 0.75 + hash(slot * 7.1) * 0.8;
      const size = jitterScale * set.propScale * (def.scale ?? 1) * fade;
      if (def.stretch) {
        const [fMin, fMax] = def.stretch.footprint;
        const [hMin, hMax] = def.stretch.height;
        DUMMY.scale.set(
          (fMin + hash(slot * 11.7) * (fMax - fMin)) * fade,
          (hMin + hash(slot * 13.1) * (hMax - hMin)) * fade,
          (fMin + hash(slot * 17.3) * (fMax - fMin)) * fade
        );
      } else if (runsAlong) {
        DUMMY.scale.setScalar(size);
      } else {
        // Slight non-uniform scale, so even one shape does not read as cloned.
        DUMMY.scale.set(size * (0.94 + hash(slot * 19.1) * 0.12), size, size * (0.94 + hash(slot * 23.3) * 0.12));
      }
      DUMMY.updateMatrix();

      const jitter = 0.82 + hash(slot * 29.7) * 0.36;
      for (const mesh of type.meshes) {
        mesh.setMatrixAt(type.used, DUMMY.matrix);
        // Emissive props keep their exact colour — a flickering neon sign that
        // is a different orange every instance reads as a bug, not variety.
        if (mesh.userData.tint !== 'e') {
          TINT.setScalar(jitter);
          mesh.setColorAt(type.used, TINT);
        }
      }
      type.used++;
    }

    for (const type of Object.values(this.types)) {
      const visible = type.used > 0;
      for (const mesh of type.meshes) {
        mesh.visible = visible;
        if (!visible) continue;
        mesh.count = type.used;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

/**
 * Roll a type from the mix, skipping the linear ones — those are placed by run,
 * so letting the per-slot roll produce them would scatter lone fence panels
 * through the fields.
 */
function pickScatterType(mix, roll) {
  let total = 0;
  for (const [name, weight] of mix) if (!ALONG.has(name)) total += weight;
  if (total <= 0) return null;
  let target = roll * total;
  for (const [name, weight] of mix) {
    if (ALONG.has(name)) continue;
    target -= weight;
    if (target <= 0) return name;
  }
  return null;
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
