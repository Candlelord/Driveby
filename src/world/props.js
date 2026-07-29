import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { hash } from '../path.js';
import { terrainHeight } from './terrain.js';
import { PROP_KIT, PROP_NAMES } from '../props/kit.js';
import { TERRAIN_SETS } from '../terrainSets.js';
import { softDotTexture } from './textures.js';

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
  'sign', 'mileMarker', 'billboard', 'cone', 'mailbox', 'busShelter', 'pierPost',
]);
const ALONG = new Set(['fence', 'wall', 'guardrail', 'hedge', 'barrier']);

// Types with a dedicated placement pass, and therefore barred from the scatter
// roll — otherwise a set would get both an orderly power line *and* a field of
// stray poles, which is exactly the look the pass exists to replace.
const PLACED = new Set([...ALONG, 'pole']);

// --- linear runs -----------------------------------------------------------
//
// A fence bounds a field, so it wants to be long, unbroken, and on one side of
// the road for all of it. Rolling the type per block of slots gave runs about a
// hundred metres long, and — the real culprit — the *side* was rolled per slot,
// so what was meant to be one fence came out as two interleaved dashed lines,
// one on each verge. It never read as connected because it never was.
//
// Runs now get their own pass rather than competing with the scatter for slots,
// which also means trees can grow behind a fence instead of the fence
// displacing them.
const RUN_SLOTS = 128; // ≈ 576 units, about 17 seconds at the base cruise
// Side changes far less often than type, so two adjacent runs that both land on
// fence join into one length rather than crossing the road between them.
const RUN_SIDE_SLOTS = RUN_SLOTS * 3;
// A set's appetite for fencing, scaled up from its mix weight: the weight was
// competing against every tree and rock in the mix, which made a bounded field
// much rarer than a bounded field ought to be.
const RUN_APPETITE = 2.2;
const RUN_MAX_CHANCE = 0.72;

// --- power line ------------------------------------------------------------
//
// Poles used to be scatter, which put them at random offsets, random spacings
// and random heights — a field of telegraph poles rather than a line of them.
// A power line is infrastructure: evenly spaced, one side, one height, and
// carrying wires, which is the part that actually makes it read.
const POLE_SPACING = 46;
const POWER_OFFSET = 17; // well clear of the lamp line at roadHalfWidth + 3.4
const POWER_SIDE = -1;
const POLE_SCALE = 1.15;
// Where the wires hang off the crossarms, matching the pole geometry in the kit.
const WIRE_ANCHORS = [
  [-1.05, 7.35], [1.05, 7.35],
  [-0.78, 6.75], [0.78, 6.75],
];
const WIRE_SEGMENTS = 6;
const WIRE_SAG = 0.9;

// --- street lamps ----------------------------------------------------------
const LAMP_LIGHT_RANGE = 46;
// Candela-ish, like the headlamps: standard materials divide diffuse irradiance
// by π, so the number that looks right is several times what it reads as.
const LAMP_LIGHT_POWER = 210;

const SWAYS = new Set([
  'grass', 'reeds', 'lavender', 'flowers', 'shrub', 'glowPlant', 'birch',
  'round', 'palm', 'hedge',
]);

// Placement memory for the separation pass. Slots are 4.5 units apart, which is
// less than the footprint of most structures, so without this a barn and a
// water tower two slots apart end up standing inside each other.
const RECENT_SLOTS = 24;
// Multiple of the two footprints that must be clear between centres. Above 1
// because touching is not the bar: a barn and an oak four metres apart do not
// intersect, but from a car they read as one lump. The clumping waves still
// give thickets and clearings; this only stops things piling into each other.
const CLEARANCE = 1.35;
// Props smaller than this cluster freely: grass and flowers are meant to grow
// in patches, and holding them apart would read as a lawn.
const MIN_FOOTPRINT = 0.9;

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
      // Measured rather than authored: every part's horizontal extent at unit
      // scale, so a new prop gets sensible spacing without anyone remembering
      // to give it a number.
      let footprint = 0;
      const meshes = def.parts.map((part) => {
        const geometry = part.geometry();
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        footprint = Math.max(
          footprint,
          Math.abs(box.min.x), Math.abs(box.max.x),
          Math.abs(box.min.z), Math.abs(box.max.z)
        );
        // A part may carry a fixed colour instead of a palette slot — a
        // lighthouse is red and white whatever set it stands in.
        const material = part.color ? flat(part.color) : materials[part.material];
        const mesh = instanced(geometry, material, this.slots);
        mesh.visible = false;
        // Per-instance colour: identical props in a row is the single biggest
        // tell that a scene is instanced. A small deterministic jitter around
        // the set's colour breaks it up for one attribute.
        mesh.userData.tint = part.color ? 'fixed' : part.material;
        scene.add(mesh);
        return mesh;
      });
      this.types[name] = { def, meshes, used: 0, footprint };
    }

    // Ring buffer of what has just been placed, for the separation check.
    this.recent = [];
    for (let i = 0; i < RECENT_SLOTS; i++) this.recent.push({ s: 0, x: 0, r: 0 });
    this.recentHead = 0;

    // Lateral lanes claimed by infrastructure this frame; see _noteCorridor.
    this.corridors = [];
    for (let i = 0; i < 6; i++) this.corridors.push({ x: 0, half: 0 });
    this.corridorCount = 0;

    this._buildWires(scene);
    this._buildLamps(scene, tier);
  }

  _buildWires(scene) {
    const spans = Math.ceil(
      (CONFIG.segmentsAhead * CONFIG.segmentLength) / POLE_SPACING
    ) + 3;
    const vertices = spans * WIRE_ANCHORS.length * WIRE_SEGMENTS * 2;
    this.wirePositions = new Float32Array(vertices * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.wirePositions, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2000);
    this.wireGeometry = geometry;

    this.wireMaterial = new THREE.LineBasicMaterial({
      color: 0x2a2f36,
      transparent: true,
      opacity: 0.8,
      fog: true,
    });
    this.wires = new THREE.LineSegments(geometry, this.wireMaterial);
    this.wires.frustumCulled = false;
    this.wires.visible = false;
    scene.add(this.wires);
  }

  _buildLamps(scene, tier) {
    this.lampPole = instanced(cylinder(0.12, 6.4, 3.2), this.lampPoleMaterial, this.lampSlots);
    this.lampHead = instanced(
      box(1.5, 0.24, 0.5, 6.35, -0.85),
      this.lampHeadMaterial,
      this.lampSlots
    );
    scene.add(this.lampPole, this.lampHead);

    // A street lamp that is up but dark is the tell that it is only geometry.
    // The glow at the head is what says the lamp is *on*; the pool underneath
    // is what says it is doing something.
    this.lampGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      map: softDotTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    this.lampGlow = instanced(new THREE.PlaneGeometry(1, 1), this.lampGlowMaterial, this.lampSlots);
    this.lampGlow.renderOrder = 2;

    this.lampPoolMaterial = this.lampGlowMaterial.clone();
    this.lampPool = instanced(
      new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
      this.lampPoolMaterial,
      this.lampSlots
    );
    this.lampPool.renderOrder = 2;
    scene.add(this.lampGlow, this.lampPool);

    // A handful of real lights, walked along the lamps nearest the car, so the
    // road and whatever is standing beside it genuinely brighten under each one
    // rather than the lamp being a sticker with a halo.
    this.lampLights = [];
    for (let i = 0; i < (tier.lampLights ?? 0); i++) {
      const light = new THREE.PointLight(0xffd9a0, 0, LAMP_LIGHT_RANGE, 1.1);
      light.visible = false;
      scene.add(light);
      this.lampLights.push(light);
    }
  }

  update(state, frame, environment) {
    // Order matters: infrastructure claims its ground first, and the scatter
    // then fills in around it. That is the whole difference between a fence
    // with trees behind it and a fence with trees growing through it.
    for (const type of Object.values(this.types)) type.used = 0;
    for (const entry of this.recent) entry.r = 0;
    this.corridorCount = 0;

    this._updateRuns(state, frame, environment);
    this._updatePower(state, frame, environment);
    this._updateScatter(state, frame, environment);
    this._flush();
    this._updateLamps(state, frame);

    const live = state.live;
    this.materialA.color.copy(live.propA);
    this.materialB.color.copy(live.propB);
    // Basic materials have no lighting to dim, so "off" is just a black colour.
    this.materialE.color.copy(live.propE).multiplyScalar(live.propEmissive);
    this.lampPoleMaterial.color.copy(live.propB);
  }

  /**
   * Fences, walls, hedges and crash barriers: one continuous line at a time.
   *
   * Everything here is decided per *run* rather than per slot — the type, the
   * side, the offset and the size — which is what makes the sections join up.
   * Within a run every stride lands, with no density roll to punch holes in it:
   * a gap in a fence should be a gate, not neglect.
   */
  _updateRuns(state, frame, environment) {
    const { propSpacing, segmentLength, segmentsBehind } = CONFIG;
    const live = state.live;
    const behind = segmentsBehind * segmentLength;
    const firstSlot = Math.floor((state.travelled - behind) / propSpacing);
    const farEdge = CONFIG.segmentsAhead * CONFIG.segmentLength;

    for (let i = 0; i < this.slots; i++) {
      const slot = firstSlot + i;
      const s = slot * propSpacing;
      const set = TERRAIN_SETS[environment.setAt(s)];

      const run = this._runAt(slot, set);
      if (!run) continue;

      const type = this.types[run.name];
      if (!type || type.used >= this.slots) continue;
      const def = type.def;

      // Stride is measured, not authored. A section is `2 × footprint` long
      // once the set's scale is applied, so the number of slots between
      // sections has to follow from that — an authored stride that suited a
      // rail fence left a hedge as a line of separate bushes. The 0.92 makes
      // neighbours overlap slightly rather than meet on a hairline.
      const full = set.propScale * (def.scale ?? 1);
      const stride = Math.max(
        1,
        Math.round((2 * type.footprint * full * 0.92) / propSpacing)
      );
      if (slot % stride !== 0) continue;

      const offset = run.side * def.spread;
      const ahead = s - state.travelled;
      const fade = clamp((farEdge - ahead) / 55, 0, 1);
      if (fade <= 0.01) continue;

      // No fade-in scaling: a fence panel that grows as you approach breaks the
      // line far more visibly than one that arrives at full size.
      const size = full;
      this._noteCorridor(offset, type.footprint * size);

      frame.point(s, offset, terrainHeight(offset, s, live), POSITION);
      DUMMY.position.copy(POSITION);
      // A quarter turn maps the section's local +X onto the road's forward axis.
      DUMMY.rotation.set(0, Math.PI / 2, 0);
      DUMMY.rotation.z = live.propLean * 0.105;
      DUMMY.scale.setScalar(size);
      DUMMY.updateMatrix();
      this._write(type, DUMMY.matrix, 1);
    }
  }

  /**
   * Which linear run, if any, covers this slot.
   *
   * Side comes off a much coarser index than type, so two neighbouring runs
   * that both land on fence continue each other instead of swapping verges
   * halfway along.
   */
  _runAt(slot, set) {
    let appetite = 0;
    let pick = null;
    for (const [name, weight] of set.propMix) {
      if (ALONG.has(name)) appetite += weight;
    }
    if (appetite <= 0) return null;

    const runIndex = Math.floor(slot / RUN_SLOTS);
    if (hash(runIndex * 13.3) >= Math.min(RUN_MAX_CHANCE, appetite * RUN_APPETITE)) return null;

    // Choose among this set's linear types by their relative weights.
    let target = hash(runIndex * 31.1) * appetite;
    for (const [name, weight] of set.propMix) {
      if (!ALONG.has(name)) continue;
      target -= weight;
      if (target <= 0) {
        pick = name;
        break;
      }
    }
    if (!pick) return null;

    const side = hash(Math.floor(slot / RUN_SIDE_SLOTS) * 7.7) < 0.5 ? -1 : 1;
    return { name: pick, side };
  }

  /**
   * The power line: evenly spaced poles of one height on one side, with wires.
   *
   * The wires are the point. Poles alone are just tall posts; it is the spans
   * sagging between them that say "this follows the road because it is going
   * the same place you are". A span is only drawn when both its poles exist,
   * so the line ends cleanly at a terrain-set boundary rather than reaching off
   * into a set that has no power.
   */
  _updatePower(state, frame, environment) {
    const { segmentLength, segmentsBehind } = CONFIG;
    const live = state.live;
    const behind = segmentsBehind * segmentLength;
    const farEdge = CONFIG.segmentsAhead * CONFIG.segmentLength;
    const first = Math.floor((state.travelled - behind) / POLE_SPACING);
    const last = Math.ceil((state.travelled + farEdge) / POLE_SPACING);

    const type = this.types.pole;
    const offset = POWER_SIDE * POWER_OFFSET;
    let wire = 0;
    let previous = null;

    for (let index = first; index <= last; index++) {
      const s = index * POLE_SPACING;
      const set = TERRAIN_SETS[environment.setAt(s)];
      const carries = set.propMix.some(([name]) => name === 'pole');

      if (!carries || !type || type.used >= this.slots) {
        previous = null;
        continue;
      }

      const ground = terrainHeight(offset, s, live);
      frame.point(s, offset, ground, POSITION);

      DUMMY.position.copy(POSITION);
      DUMMY.rotation.set(0, POWER_SIDE > 0 ? 0 : Math.PI, 0);
      DUMMY.rotation.z = live.propLean * 0.12;
      // One height for every pole on the line — no fade-in scaling either,
      // since a pole that grows as you approach it is worse than one that
      // appears at the fog line.
      DUMMY.scale.setScalar(POLE_SCALE);
      DUMMY.updateMatrix();
      this._write(type, DUMMY.matrix, 1);

      const current = { s, ground };
      if (previous) wire = this._writeSpan(frame, previous, current, offset, wire);
      previous = current;
    }

    this._noteCorridor(offset, 2.2);

    this.wireGeometry.setDrawRange(0, wire / 3);
    this.wireGeometry.attributes.position.needsUpdate = true;
    this.wires.visible = wire > 0;
    this.wireMaterial.color.copy(live.propB).multiplyScalar(0.75);
  }

  /** One sagging span of wires between two poles. */
  _writeSpan(frame, from, to, offset, cursor) {
    const array = this.wirePositions;

    for (const [lateral, height] of WIRE_ANCHORS) {
      for (let seg = 0; seg < WIRE_SEGMENTS; seg++) {
        for (const t of [seg / WIRE_SEGMENTS, (seg + 1) / WIRE_SEGMENTS]) {
          if (cursor + 3 > array.length) return cursor;
          const s = from.s + (to.s - from.s) * t;
          const ground = from.ground + (to.ground - from.ground) * t;
          // A catenary is close enough to a sine bulge at this span and scale.
          const sag = Math.sin(t * Math.PI) * WIRE_SAG;
          frame.point(s, offset + lateral * POLE_SCALE, ground + height * POLE_SCALE - sag, POSITION);
          array[cursor++] = POSITION.x;
          array[cursor++] = POSITION.y;
          array[cursor++] = POSITION.z;
        }
      }
    }
    return cursor;
  }

  _updateScatter(state, frame, environment) {
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

      const typeName = pickScatterType(set.propMix, hash(slot * 2.3));
      if (!typeName) continue;

      const type = this.types[typeName];
      if (!type || type.used >= this.slots) continue;

      const def = type.def;

      const density = set.propDensity * clump * fogBoost;
      if (hash(slot * 5.9) >= density) continue;

      const side = hash(slot * 1.7) < 0.5 ? -1 : 1;
      const distance = def.spread + hash(slot * 3.3) * def.jitter;
      const offset = side * distance;

      // Fade in with distance rather than popping at the spawn boundary: the
      // furthest slots scale up over their last stretch of approach.
      const ahead = s - state.travelled;
      const fade = clamp((farEdge - ahead) / 55, 0, 1);
      if (fade <= 0.01) continue;

      // Big structures take a fixed damper as well as the set's scale, so a
      // water tower thirty units away does not end up the size of a hill.
      const jitterScale = 0.75 + hash(slot * 7.1) * 0.8;
      const size = jitterScale * set.propScale * (def.scale ?? 1) * fade;
      let spanX = size;
      let spanY = size;
      let spanZ = size;
      if (def.stretch) {
        const [fMin, fMax] = def.stretch.footprint;
        const [hMin, hMax] = def.stretch.height;
        spanX = (fMin + hash(slot * 11.7) * (fMax - fMin)) * fade;
        spanY = (hMin + hash(slot * 13.1) * (hMax - hMin)) * fade;
        spanZ = (fMin + hash(slot * 17.3) * (fMax - fMin)) * fade;
      } else {
        // Slight non-uniform scale, so even one shape does not read as cloned.
        spanX = size * (0.94 + hash(slot * 19.1) * 0.12);
        spanZ = size * (0.94 + hash(slot * 23.3) * 0.12);
      }

      // Keep objects out of each other, and out of the lane the infrastructure
      // has already claimed — nothing should be growing through the fence line
      // or standing in the power line.
      const radius = type.footprint * Math.max(spanX, spanZ);
      if (radius > MIN_FOOTPRINT) {
        if (!this._isClear(s, offset, radius)) continue;
        this._remember(s, offset, radius);
      }
      if (!this._clearsCorridors(offset, radius)) continue;

      frame.point(s, offset, terrainHeight(offset, s, live), POSITION);

      DUMMY.position.copy(POSITION);
      const yaw = FACING.has(typeName)
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
      DUMMY.rotation.z = live.propLean * 0.35 * (FACING.has(typeName) ? 0.3 : 1) + sway;

      DUMMY.scale.set(spanX, spanY, spanZ);
      DUMMY.updateMatrix();

      this._write(type, DUMMY.matrix, 0.82 + hash(slot * 29.7) * 0.36);
    }
  }

  /** Add one instance of a type, with a per-instance brightness jitter. */
  _write(type, matrix, jitter) {
    for (const mesh of type.meshes) {
      mesh.setMatrixAt(type.used, matrix);
      // Emissive props keep their exact colour — a flickering neon sign that
      // is a different orange every instance reads as a bug, not variety.
      if (mesh.userData.tint !== 'e' && mesh.userData.tint !== 'fixed') {
        TINT.setScalar(jitter);
        mesh.setColorAt(type.used, TINT);
      }
    }
    type.used++;
  }

  _flush() {
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

  /**
   * Is there room at (s, x) for something of this radius?
   *
   * Distance is measured in road space rather than world space — along-road
   * against lateral — which is exact enough at these radii and costs nothing,
   * since the placement already works in those coordinates.
   */
  _isClear(s, x, radius) {
    for (const other of this.recent) {
      if (other.r <= 0) continue;
      const need = (radius + other.r) * CLEARANCE;
      const ds = s - other.s;
      if (ds > need) continue;
      const dx = x - other.x;
      if (ds * ds + dx * dx < need * need) return false;
    }
    return true;
  }

  /**
   * Reserve a lateral lane for a piece of infrastructure.
   *
   * Runs and power lines hold the same offset for hundreds of units, so they
   * are checked as bands rather than through the ring buffer — a fence long
   * enough to fill that ring would evict every tree it was meant to stand in
   * front of.
   */
  _noteCorridor(x, halfWidth) {
    for (let i = 0; i < this.corridorCount; i++) {
      // Same lane, seen already: keep whichever is wider.
      if (Math.abs(this.corridors[i].x - x) < 0.5) {
        this.corridors[i].half = Math.max(this.corridors[i].half, halfWidth);
        return;
      }
    }
    if (this.corridorCount >= this.corridors.length) return;
    const lane = this.corridors[this.corridorCount++];
    lane.x = x;
    lane.half = halfWidth;
  }

  _clearsCorridors(x, radius) {
    for (let i = 0; i < this.corridorCount; i++) {
      const lane = this.corridors[i];
      if (Math.abs(x - lane.x) < radius + lane.half) return false;
    }
    return true;
  }

  _remember(s, x, radius) {
    const entry = this.recent[this.recentHead];
    entry.s = s;
    entry.x = x;
    entry.r = radius;
    this.recentHead = (this.recentHead + 1) % this.recent.length;
  }

  _updateLamps(state, frame) {
    const { lampSpacing, segmentLength, segmentsBehind } = CONFIG;
    const live = state.live;
    const behind = segmentsBehind * segmentLength;
    const firstSlot = Math.floor((state.travelled - behind) / lampSpacing);
    // Scale rather than toggle, so lamps shrink away over a crossfade instead
    // of vanishing the instant the mood's lamp intensity hits zero.
    const on = clamp01(live.lampIntensity / 0.14);
    // Whether the lamp is *lit* is a separate question from whether it is
    // there: a lamp standing over a bright afternoon is off, and should read as
    // a grey housing rather than as a black one that failed to light.
    const glow = live.lampGlow;

    for (const mesh of [this.lampPole, this.lampHead, this.lampGlow, this.lampPool]) {
      mesh.visible = on > 0;
    }
    this.lampGlow.visible = on > 0 && glow > 0.02;
    this.lampPool.visible = this.lampGlow.visible;

    if (on <= 0) {
      for (const light of this.lampLights) light.visible = false;
      return;
    }

    const lateral = CONFIG.roadHalfWidth + 3.4;
    this._noteCorridor(lateral, 1.5);
    this._noteCorridor(-lateral, 1.5);

    let lit = 0;
    for (let i = 0; i < this.lampSlots; i++) {
      const slot = firstSlot + i;
      const side = slot % 2 === 0 ? 1 : -1;
      const s = slot * lampSpacing;
      // The head hangs inboard of the pole; the light belongs under the head,
      // not under the post.
      const armX = side * (lateral - 0.85 * on);
      frame.point(s, side * lateral, 0, POSITION);

      DUMMY.position.copy(POSITION);
      DUMMY.rotation.set(0, side > 0 ? 0 : Math.PI, 0);
      DUMMY.scale.setScalar(on);
      DUMMY.updateMatrix();
      this.lampPole.setMatrixAt(i, DUMMY.matrix);
      this.lampHead.setMatrixAt(i, DUMMY.matrix);

      frame.point(s, armX, 6.35 * on, POSITION);
      DUMMY.position.copy(POSITION);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.setScalar(2.6 + glow * 1.6);
      DUMMY.updateMatrix();
      this.lampGlow.setMatrixAt(i, DUMMY.matrix);

      frame.point(s, armX, 0.06, POSITION);
      DUMMY.position.copy(POSITION);
      DUMMY.scale.set(7.5, 1, 7.5);
      DUMMY.updateMatrix();
      this.lampPool.setMatrixAt(i, DUMMY.matrix);

      // Hand the nearest few lamps ahead a real light. They recycle once the
      // lamp is behind the camera, so the handover is never on screen, and the
      // last stretch fades rather than cutting.
      const ahead = s - state.travelled;
      if (lit < this.lampLights.length && ahead > -22 && ahead < LAMP_LIGHT_RANGE) {
        const light = this.lampLights[lit++];
        frame.point(s, armX, 6.1 * on, POSITION);
        light.position.copy(POSITION);
        light.color.copy(live.lampColor);
        light.intensity = LAMP_LIGHT_POWER * glow * clamp01((ahead + 22) / 16);
        light.visible = light.intensity > 0.5;
      }
    }
    for (let i = lit; i < this.lampLights.length; i++) this.lampLights[i].visible = false;

    this.lampPole.instanceMatrix.needsUpdate = true;
    this.lampHead.instanceMatrix.needsUpdate = true;
    this.lampGlow.instanceMatrix.needsUpdate = true;
    this.lampPool.instanceMatrix.needsUpdate = true;

    // Unlit in daylight is correct, but "unlit" has to look like a housing, not
    // a hole. The head crossfades from a pale fitting to a lamp driven well
    // above 1 so bloom picks it up.
    this.lampHeadMaterial.color
      .copy(FITTING)
      .lerp(TINT.copy(live.lampColor).multiplyScalar(2.6), glow);
    this.lampGlowMaterial.color.copy(live.lampColor);
    this.lampGlowMaterial.opacity = glow * 0.55;
    this.lampPoolMaterial.color.copy(live.lampColor);
    this.lampPoolMaterial.opacity = glow * 0.12;
  }
}

const FITTING = new THREE.Color(0x9aa0a8);

/**
 * Roll a type from the mix, skipping anything with its own pass — letting the
 * per-slot roll produce them would scatter lone fence panels through the fields
 * and stand telegraph poles at random in them.
 */
function pickScatterType(mix, roll) {
  let total = 0;
  for (const [name, weight] of mix) if (!PLACED.has(name)) total += weight;
  if (total <= 0) return null;
  let target = roll * total;
  for (const [name, weight] of mix) {
    if (PLACED.has(name)) continue;
    target -= weight;
    if (target <= 0) return name;
  }
  return null;
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
