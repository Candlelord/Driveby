import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { hash } from '../path.js';
import { softDotTexture } from './textures.js';

const POSITION = new THREE.Vector3();
const DUMMY = new THREE.Object3D();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// Tunnels run in stretches rather than continuously — the interesting part is
// the mouth and the return to daylight, not the middle.
const TUNNEL_PERIOD = 460;
const TUNNEL_LENGTH = 250;
const TUNNEL_SPACING = 8; // segment depth; segments butt together into a tube

/**
 * How enclosed the road is at a given distance, 0..1. Shared with the lighting
 * so the lamps come up as the mouth swallows the car, rather than at some
 * unrelated moment.
 */
export function tunnelAt(distance, amount) {
  if (amount <= 0.01) return 0;
  const phase = ((distance % TUNNEL_PERIOD) + TUNNEL_PERIOD) % TUNNEL_PERIOD;
  if (phase > TUNNEL_LENGTH) return 0;
  // Ramp at both mouths so the transition is not a step.
  const inFade = Math.min(1, phase / 26);
  const outFade = Math.min(1, (TUNNEL_LENGTH - phase) / 26);
  return Math.min(inFade, outFade) * amount;
}

/**
 * The per-set extras: water, god-rays, a distant skyline, overpass arches,
 * tunnels and pooled ground fog. Each is driven by a single number on the blended profile,
 * so a set turns one on simply by having a non-zero value and it fades in and
 * out with everything else.
 */
export class Features {
  constructor(scene, tier) {
    this.tier = tier;
    this._buildWater(scene);
    this._buildShafts(scene);
    this._buildSkyline(scene, tier);
    this._buildOverpasses(scene);
    this._buildTunnel(scene);
    this._buildGroundFog(scene);
  }

  /**
   * A tube built from butted-together segments rather than a single swept mesh,
   * so it follows the road's curve for free and needs no geometry rebuild.
   */
  _buildTunnel(scene) {
    this.tunnelCount = 40;

    this.tunnelMaterial = new THREE.MeshStandardMaterial({
      color: 0x40444e,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      // FrontSide, not BackSide: the shell is three solid slabs, so the faces
      // you see from the road are their outward-facing ones. BackSide culled
      // exactly the surfaces the tunnel is made of.
      side: THREE.FrontSide,
    });
    this.tunnelLampMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, fog: true });

    const shell = mergeBoxes([
      // ceiling, then the two walls
      [24, 1.2, TUNNEL_SPACING, 0, 9.6, 0],
      [1.4, 10, TUNNEL_SPACING, -11.6, 5, 0],
      [1.4, 10, TUNNEL_SPACING, 11.6, 5, 0],
    ]);
    this.tunnel = instanced(shell, this.tunnelMaterial, this.tunnelCount);

    this.tunnelLamps = instanced(
      new THREE.BoxGeometry(3.4, 0.22, 0.5).translate(0, 8.7, 0),
      this.tunnelLampMaterial,
      this.tunnelCount
    );
    this.tunnel.visible = false;
    this.tunnelLamps.visible = false;
    scene.add(this.tunnel, this.tunnelLamps);
  }

  _updateTunnel(state, frame) {
    const live = state.live;
    const amount = live.tunnel;
    const visible = amount > 0.02;
    this.tunnel.visible = visible;
    this.tunnelLamps.visible = visible;
    if (!visible) return;

    this.tunnelLampMaterial.color.copy(live.propE).multiplyScalar(Math.max(0.6, live.propEmissive));

    const first = Math.floor((state.travelled - 40) / TUNNEL_SPACING);
    let used = 0;
    let lamps = 0;

    for (let i = 0; i < this.tunnelCount; i++) {
      const s = (first + i) * TUNNEL_SPACING;
      // Only build where the road is actually enclosed.
      if (tunnelAt(s, 1) <= 0) continue;

      frame.point(s, 0, 0, POSITION);
      DUMMY.position.copy(POSITION);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.setScalar(1);
      DUMMY.updateMatrix();
      this.tunnel.setMatrixAt(used++, DUMMY.matrix);

      // A lamp every third segment, so they strobe past rather than blur.
      if ((first + i) % 3 === 0) this.tunnelLamps.setMatrixAt(lamps++, DUMMY.matrix);
    }

    this.tunnel.count = used;
    this.tunnelLamps.count = lamps;
    this.tunnel.visible = used > 0;
    this.tunnelLamps.visible = lamps > 0;
    this.tunnel.instanceMatrix.needsUpdate = true;
    this.tunnelLamps.instanceMatrix.needsUpdate = true;
  }

  /**
   * Two large quads flanking the road, dropped to the set's water level. Flat
   * shaded and unlit, coloured from the set — a real reflection would cost a
   * second render pass and would not match the low-poly look anyway.
   */
  _buildWater(scene) {
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x35505e,
      roughness: 0.12,
      metalness: 0.5,
      transparent: true,
      opacity: 0,
      flatShading: true,
    });

    this.water = new THREE.Group();
    for (const side of [-1, 1]) {
      // Segmented now, so the surface can actually be displaced into waves.
      const [wSeg, hSeg] = this.tier.waterSegments ?? [10, 20];
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(420, 900, wSeg, hSeg), this.waterMaterial);
      plane.geometry.userData.rest = Float32Array.from(plane.geometry.attributes.position.array);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(side * 235, 0, -320);
      plane.userData.side = side;
      this.water.add(plane);
    }
    this.water.visible = false;
    scene.add(this.water);
  }

  /**
   * God-rays: a handful of long thin angled quads with additive blending,
   * drifting slowly. Cheap, and in a fogged forest they do most of the work.
   */
  _buildShafts(scene) {
    this.shaftMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe9b8,
      map: softDotTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });

    this.shafts = new THREE.Group();
    const shaftCount = this.tier.detail >= 1.2 ? 11 : this.tier.detail >= 0.9 ? 7 : 4;
    for (let i = 0; i < shaftCount; i++) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shaftMaterial);
      shaft.userData.seed = i;
      shaft.scale.set(4 + (i % 3) * 2.5, 46, 1);
      shaft.rotation.z = 0.42 + (i % 4) * 0.06;
      shaft.renderOrder = 2;
      this.shafts.add(shaft);
    }
    this.shafts.visible = false;
    scene.add(this.shafts);
  }

  /** A band of emissive boxes far away — the city on the horizon. */
  _buildSkyline(scene, tier) {
    const count = Math.round(tier.propSlots * 1.4);
    this.skylineCount = count;

    this.skylineMaterial = new THREE.MeshBasicMaterial({
      color: 0x11121c,
      transparent: true,
      opacity: 0,
      fog: false,
    });
    this.skylineLitMaterial = new THREE.MeshBasicMaterial({
      color: 0x2a3350,
      transparent: true,
      opacity: 0,
      fog: false,
      blending: THREE.AdditiveBlending,
    });

    const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.skyline = instanced(geometry, this.skylineMaterial, count);
    this.skylineLit = instanced(
      new THREE.BoxGeometry(1.02, 1, 0.4).translate(0, 0.5, 0),
      this.skylineLitMaterial,
      count
    );
    this.skyline.visible = false;
    this.skylineLit.visible = false;
    scene.add(this.skyline, this.skylineLit);
  }

  /** Arches the road passes under, for the neon underpass run. */
  _buildOverpasses(scene) {
    this.archCount = 6;
    this.archMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1b24,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    this.archNeonMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, fog: true });

    const deck = new THREE.BoxGeometry(38, 2.4, 5).translate(0, 9.4, 0);
    const legs = new THREE.BoxGeometry(2.6, 9, 4.4);
    const arch = mergeArch(deck, legs);
    this.arches = instanced(arch, this.archMaterial, this.archCount);
    this.archNeon = instanced(
      new THREE.BoxGeometry(34, 0.32, 0.3).translate(0, 8.1, -2.4),
      this.archNeonMaterial,
      this.archCount
    );
    this.arches.visible = false;
    this.archNeon.visible = false;
    scene.add(this.arches, this.archNeon);
  }

  /** A low band of haze sitting on the road, for forest and valley sets. */
  _buildGroundFog(scene) {
    this.groundFogMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8e2e8,
      map: softDotTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.groundFog = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.groundFogMaterial);
      patch.rotation.x = -Math.PI / 2;
      patch.scale.set(120, 90, 1);
      patch.position.set(0, 1.2 + i * 0.5, -40 - i * 55);
      patch.userData.seed = i;
      this.groundFog.add(patch);
    }
    this.groundFog.visible = false;
    scene.add(this.groundFog);
  }

  update(state, frame) {
    const live = state.live;
    this._updateWater(state, frame);
    this._updateShafts(state);
    this._updateSkyline(state, frame);
    this._updateOverpasses(state, frame);
    this._updateTunnel(state, frame);
    this._updateGroundFog(state, live);
  }

  _updateWater(state, frame) {
    const live = state.live;
    const amount = live.water;
    this.water.visible = amount > 0.02;
    if (!this.water.visible) return;

    this.waterMaterial.color.copy(live.waterColor);
    this.waterMaterial.opacity = Math.min(1, amount);

    const side = live.waterSide;
    for (const plane of this.water.children) {
      // waterSide of 0 means water on both sides (a flooded plain).
      plane.visible = Math.abs(side) < 0.35 || Math.sign(side) === plane.userData.side;
      plane.position.y = live.waterLevel;
      if (plane.visible) this._ripple(plane, state);
    }
  }

  /**
   * Displace the water grid with two crossed sine trains. Cheap, and against a
   * flat-shaded scene a genuinely moving surface does more than any amount of
   * shader trickery on a static plane.
   */
  _ripple(plane, state) {
    const geometry = plane.geometry;
    const rest = geometry.userData.rest;
    const position = geometry.attributes.position;
    const t = state.time;
    // Wind whips the surface up; still air leaves it near-flat.
    const amp = 0.35 + state.live.wind * 1.5;

    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3];
      const y = rest[i * 3 + 1];
      position.setZ(
        i,
        (Math.sin(x * 0.035 + t * 1.1) + Math.sin(y * 0.051 - t * 0.8) * 0.7) * amp
      );
    }
    position.needsUpdate = true;
    // Recomputing normals every frame is what makes the sun track move with the
    // swell, and it is also the most expensive line in this file. Low tiers keep
    // the motion and give up the moving highlight.
    if (this.tier.waterNormals) geometry.computeVertexNormals();
  }

  _updateShafts(state) {
    const live = state.live;
    const amount = live.shafts;
    this.shafts.visible = amount > 0.02;
    if (!this.shafts.visible) return;

    this.shaftMaterial.color.copy(live.shaftColor);
    this.shaftMaterial.opacity = amount * 0.16;

    for (const shaft of this.shafts.children) {
      const seed = shaft.userData.seed;
      // Scroll toward the camera and recycle, so they read as fixed in the world.
      const span = 170;
      const z = -((state.travelled * 0.6 + seed * 43) % span) - 12;
      shaft.position.set(Math.sin(seed * 2.3) * 22, 16, z);
    }
  }

  _updateSkyline(state, frame) {
    const live = state.live;
    const amount = live.skyline;
    const visible = amount > 0.02;
    this.skyline.visible = visible;
    this.skylineLit.visible = visible;
    if (!visible) return;

    this.skylineMaterial.opacity = Math.min(1, amount);
    this.skylineLitMaterial.opacity = Math.min(1, amount) * live.propEmissive * 0.5;
    this.skylineLitMaterial.color.copy(live.propE).multiplyScalar(0.25);

    // A static band far out to the sides, scrolling with distance.
    const spacing = 46;
    const first = Math.floor(state.travelled / spacing);
    for (let i = 0; i < this.skylineCount; i++) {
      const slot = first + i - 4;
      const s = slot * spacing;
      const side = hash(slot * 1.31) < 0.5 ? -1 : 1;
      const distance = 150 + hash(slot * 4.7) * 260;
      frame.point(s, side * distance, -live.causeway * 0.5, POSITION);

      DUMMY.position.copy(POSITION);
      DUMMY.rotation.set(0, hash(slot * 7.9) * 0.6, 0);
      const width = 14 + hash(slot * 2.9) * 24;
      DUMMY.scale.set(width, 30 + hash(slot * 5.3) * 120, width * 0.8);
      DUMMY.updateMatrix();
      this.skyline.setMatrixAt(i, DUMMY.matrix);
      this.skylineLit.setMatrixAt(i, DUMMY.matrix);
    }
    this.skyline.instanceMatrix.needsUpdate = true;
    this.skylineLit.instanceMatrix.needsUpdate = true;
  }

  _updateOverpasses(state, frame) {
    const live = state.live;
    const amount = live.overpasses;
    const visible = amount > 0.02;
    this.arches.visible = visible;
    this.archNeon.visible = visible;
    if (!visible) return;

    this.archNeonMaterial.color.copy(live.propE).multiplyScalar(live.propEmissive * 1.4);

    const spacing = 78;
    const first = Math.floor((state.travelled - 40) / spacing);
    for (let i = 0; i < this.archCount; i++) {
      const slot = first + i;
      frame.point(slot * spacing, 0, 0, POSITION);
      DUMMY.position.copy(POSITION);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.setScalar(1);
      DUMMY.updateMatrix();
      this.arches.setMatrixAt(i, DUMMY.matrix);
      this.archNeon.setMatrixAt(i, DUMMY.matrix);
    }
    this.arches.instanceMatrix.needsUpdate = true;
    this.archNeon.instanceMatrix.needsUpdate = true;
  }

  _updateGroundFog(state, live) {
    const amount = live.groundFogAmount;
    this.groundFog.visible = amount > 0.02;
    if (!this.groundFog.visible) return;

    this.groundFogMaterial.color.copy(live.fogColor);
    this.groundFogMaterial.opacity = amount * 0.3;
    for (const patch of this.groundFog.children) {
      const seed = patch.userData.seed;
      patch.position.x = Math.sin(state.time * 0.09 + seed) * 14;
    }
  }
}

/** Merge a list of [w, h, d, x, y, z] boxes into one geometry. */
function mergeBoxes(specs) {
  const positions = [];
  const normals = [];
  for (const [w, h, d, x, y, z] of specs) {
    const part = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
    positions.push(...part.attributes.position.array);
    normals.push(...part.attributes.normal.array);
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

function mergeArch(deck, legs) {
  const left = legs.clone().translate(-17, 4.5, 0);
  const right = legs.clone().translate(17, 4.5, 0);
  const merged = new THREE.BufferGeometry();
  const parts = [deck, left, right];
  // Small enough to merge by hand without pulling in the utils module.
  const positions = [];
  const normals = [];
  for (const part of parts) {
    const nonIndexed = part.index ? part.toNonIndexed() : part;
    positions.push(...nonIndexed.attributes.position.array);
    normals.push(...nonIndexed.attributes.normal.array);
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

function instanced(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
  return mesh;
}
