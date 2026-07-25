import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { hash } from '../path.js';
import { terrainHeight } from './terrain.js';

const DUMMY = new THREE.Object3D();
const POSITION = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// How sharply a prop scales in as the terrain's density crosses its slot threshold.
const DENSITY_FEATHER = 0.12;

/**
 * Roadside scenery, one InstancedMesh per shape.
 *
 * Every slot along the road has a single position/rotation/size drawn from a
 * hash, and all five prop shapes are drawn at that same spot — scaled by how
 * much of their terrain is currently mixed in. A terrain transition therefore
 * reads as pines shrinking away while boulders grow in their place, rather than
 * as a cut.
 */
export class Props {
  constructor(scene, tier) {
    this.slots = tier.propSlots;
    this.lampSlots = tier.lampSlots;

    this.foliageMaterial = flat(0x2f4045);
    this.trunkMaterial = flat(0x353a3c);
    this.rockMaterial = flat(0x6c5563);
    this.cactusMaterial = flat(0x6f8f52);
    this.buildingMaterial = flat(0x20213a);
    this.neonMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, fog: true });
    this.lampPoleMaterial = flat(0x2a2f36);
    this.lampHeadMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, fog: true });

    this.pine = instanced(cone(1.15, 3.8, 2.9), this.foliageMaterial, this.slots);
    this.round = instanced(blob(1.55, 2.7), this.foliageMaterial, this.slots);
    this.trunk = instanced(cylinder(0.17, 1.35, 0.68), this.trunkMaterial, this.slots);
    this.rock = instanced(rock(1.3, 0.45), this.rockMaterial, this.slots);
    this.cactus = instanced(cactusGeometry(), this.cactusMaterial, this.slots);
    this.building = instanced(box(1, 1, 1, 0.5), this.buildingMaterial, this.slots);
    this.neon = instanced(box(1.03, 0.03, 1.03, 0.62), this.neonMaterial, this.slots);

    this.lampPole = instanced(cylinder(0.12, 6.4, 3.2), this.lampPoleMaterial, this.lampSlots);
    this.lampHead = instanced(
      box(1.5, 0.24, 0.5, 6.35, -0.85),
      this.lampHeadMaterial,
      this.lampSlots
    );

    this.shapes = [this.pine, this.round, this.trunk, this.rock, this.cactus];
    this.meshes = [...this.shapes, this.building, this.neon, this.lampPole, this.lampHead];
    for (const mesh of this.meshes) scene.add(mesh);
  }

  update(state, frame) {
    this._updateProps(state, frame);
    this._updateLamps(state, frame);

    const live = state.live;
    this.foliageMaterial.color.copy(live.propA);
    this.cactusMaterial.color.copy(live.propA);
    this.buildingMaterial.color.copy(live.propA);
    this.trunkMaterial.color.copy(live.propB);
    this.rockMaterial.color.copy(live.propB);
    // Basic materials have no lighting to dim, so "off" is just a black colour.
    this.neonMaterial.color.copy(live.lampColor).multiplyScalar(live.lampIntensity);
    this.lampHeadMaterial.color.copy(live.lampColor).multiplyScalar(live.lampIntensity);
    this.lampPoleMaterial.color.copy(live.propB);
  }

  _updateProps(state, frame) {
    const { propSpacing, segmentLength, segmentsBehind } = CONFIG;
    const weights = state.propWeights;
    const live = state.live;
    const behind = segmentsBehind * segmentLength;
    const firstSlot = Math.floor((state.travelled - behind) / propSpacing);

    // Pines and round trees share a trunk; the mix of both drives its scale.
    const trunkWeight = (weights.pine || 0) + (weights.round || 0);

    for (let i = 0; i < this.slots; i++) {
      const slot = firstSlot + i;
      const s = slot * propSpacing;

      const side = hash(slot * 1.7) < 0.5 ? -1 : 1;
      const distance = 13 + hash(slot * 3.3) * 27;
      const spread = hash(slot * 5.9);
      const visibility = clamp01((live.propDensity - spread) / DENSITY_FEATHER);

      if (visibility <= 0) {
        for (const mesh of this.shapes) mesh.setMatrixAt(i, HIDDEN);
        this.building.setMatrixAt(i, HIDDEN);
        this.neon.setMatrixAt(i, HIDDEN);
        continue;
      }

      // Sit on the ground, not at road level — the hills move under them as the
      // terrain profile changes.
      const offset = side * distance;
      frame.point(s, offset, terrainHeight(offset, s, live), POSITION);
      const rotation = hash(slot * 9.3) * Math.PI * 2;
      const size = (0.75 + hash(slot * 7.1) * 0.8) * live.propScale * visibility;

      DUMMY.position.copy(POSITION);
      DUMMY.rotation.set(0, rotation, 0);

      this._setUniform(this.pine, i, size * (weights.pine || 0));
      this._setUniform(this.round, i, size * (weights.round || 0));
      this._setUniform(this.trunk, i, size * trunkWeight);
      this._setUniform(this.rock, i, size * (weights.rock || 0) * 0.9);
      this._setUniform(this.cactus, i, size * (weights.cactus || 0) * 0.85);

      // Buildings need their own proportions, not a scaled-up tree.
      const buildingWeight = weights.building || 0;
      const footprint = (3.2 + hash(slot * 11.7) * 3.4) * visibility * buildingWeight;
      const height = (7 + hash(slot * 13.1) * 16) * visibility * buildingWeight;
      DUMMY.scale.set(footprint, height, footprint);
      DUMMY.updateMatrix();
      this.building.setMatrixAt(i, DUMMY.matrix);
      this.neon.setMatrixAt(i, DUMMY.matrix);
    }

    for (const mesh of this.shapes) mesh.instanceMatrix.needsUpdate = true;
    this.building.instanceMatrix.needsUpdate = true;
    this.neon.instanceMatrix.needsUpdate = true;
  }

  _setUniform(mesh, index, scale) {
    DUMMY.scale.setScalar(scale);
    DUMMY.updateMatrix();
    mesh.setMatrixAt(index, DUMMY.matrix);
  }

  _updateLamps(state, frame) {
    const { lampSpacing, segmentLength, segmentsBehind } = CONFIG;
    const behind = segmentsBehind * segmentLength;
    const firstSlot = Math.floor((state.travelled - behind) / lampSpacing);
    // Scale rather than toggle, so lamps shrink away over a crossfade instead
    // of vanishing the instant the mood's lamp intensity hits zero.
    const on = clamp01(state.live.lampIntensity / 0.14);

    for (let i = 0; i < this.lampSlots; i++) {
      if (on <= 0) {
        this.lampPole.setMatrixAt(i, HIDDEN);
        this.lampHead.setMatrixAt(i, HIDDEN);
        continue;
      }
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

// --- geometry helpers: everything is pre-translated so a single instance
// --- matrix (ground position + yaw + scale) places the whole shape.

function cone(radius, height, y) {
  return new THREE.ConeGeometry(radius, height, 6).translate(0, y, 0);
}

function blob(radius, y) {
  return new THREE.IcosahedronGeometry(radius, 0).translate(0, y, 0);
}

function cylinder(radius, height, y) {
  return new THREE.CylinderGeometry(radius, radius * 1.15, height, 6).translate(0, y, 0);
}

function rock(radius, y) {
  return new THREE.DodecahedronGeometry(radius, 0).translate(0, y, 0);
}

function box(w, h, d, y, x = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, 0);
}

/** Saguaro: a trunk and two arms, merged so it instances as one shape. */
function cactusGeometry() {
  const parts = [new THREE.CylinderGeometry(0.42, 0.5, 4.2, 7).translate(0, 2.1, 0)];
  for (const [x, y, height] of [
    [-0.95, 2.5, 1.5],
    [0.95, 3.1, 1.2],
  ]) {
    parts.push(new THREE.CylinderGeometry(0.26, 0.26, 1.5, 6).rotateZ(Math.PI / 2).translate(x * 0.55, y, 0));
    parts.push(new THREE.CylinderGeometry(0.26, 0.3, height, 6).translate(x, y + height / 2, 0));
  }
  return mergeGeometries(parts);
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
