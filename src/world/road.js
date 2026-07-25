import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Ribbon } from './ribbon.js';

const NEAR_LEFT = new THREE.Vector3();
const NEAR_RIGHT = new THREE.Vector3();
const FAR_LEFT = new THREE.Vector3();
const FAR_RIGHT = new THREE.Vector3();

const LINE_LIFT = 0.03; // keeps markings off the asphalt without z-fighting
const DASH_LENGTH = 2.4;
const DASH_HALF_WIDTH = 0.17;

/**
 * Asphalt, edge lines, shoulders and the dashed centre line.
 *
 * Four draw calls, three of them ribbons that share the same row sampling. The
 * dashes are their own little quads so they stay pinned to absolute distances
 * along the road and scroll smoothly instead of swimming.
 */
export class Road {
  constructor(scene) {
    const { roadHalfWidth, laneMarkWidth, shoulderWidth } = CONFIG;
    const inner = roadHalfWidth - laneMarkWidth;
    const outer = roadHalfWidth + shoulderWidth;

    this.rows = CONFIG.segmentsBehind + CONFIG.segmentsAhead + 1;

    this.surfaceMaterial = flat(0x3a4048);
    this.lineMaterial = flat(0xffffff);
    this.shoulderMaterial = flat(0x4a5058);

    this.surface = new Ribbon({
      columns: [-inner, inner],
      rows: this.rows,
      material: this.surfaceMaterial,
    });

    // Two edge stripes in one ribbon; quad 1 (the gap across the road) is dropped.
    this.lines = new Ribbon({
      columns: [-roadHalfWidth, -inner, inner, roadHalfWidth],
      rows: this.rows,
      material: this.lineMaterial,
      skipQuads: [1],
    });

    this.shoulders = new Ribbon({
      columns: [-outer, -roadHalfWidth, roadHalfWidth, outer],
      rows: this.rows,
      material: this.shoulderMaterial,
      skipQuads: [1],
    });

    scene.add(this.shoulders.mesh, this.surface.mesh, this.lines.mesh);

    this.lines.mesh.renderOrder = 1;

    this._buildDashes(scene);
  }

  _buildDashes(scene) {
    // One dash every other segment; six verts each so they stay crisp.
    this.maxDashes = Math.ceil(this.rows / 2) + 2;
    this.dashPositions = new Float32Array(this.maxDashes * 6 * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.dashPositions, 3));
    const normals = new Float32Array(this.maxDashes * 6 * 3);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2000);

    this.dashGeometry = geometry;
    this.dashes = new THREE.Mesh(geometry, this.lineMaterial);
    this.dashes.frustumCulled = false;
    this.dashes.renderOrder = 1;
    scene.add(this.dashes);
  }

  update(state, frame) {
    const { segmentLength, segmentsBehind } = CONFIG;
    const firstIndex = Math.floor(state.travelled / segmentLength) - segmentsBehind;
    const distanceForRow = (r) => (firstIndex + r) * segmentLength;

    this.surface.update(frame, distanceForRow, () => 0);
    this.lines.update(frame, distanceForRow, () => LINE_LIFT);
    this.shoulders.update(frame, distanceForRow, () => -0.06);

    this._updateDashes(frame, firstIndex);

    const live = state.live;
    this.surfaceMaterial.color.copy(live.roadColor);
    this.lineMaterial.color.copy(live.lineColor);
    this.shoulderMaterial.color.copy(live.shoulderColor);
  }

  _updateDashes(frame, firstIndex) {
    const { segmentLength } = CONFIG;
    // Anchor dashes to even absolute segment indices so they hold still in world space.
    let index = firstIndex + (((firstIndex % 2) + 2) % 2);
    let p = 0;
    let drawn = 0;

    while (drawn < this.maxDashes && index < firstIndex + this.rows) {
      const s0 = index * segmentLength;
      const s1 = s0 + DASH_LENGTH;

      frame.setRow(s0);
      frame.column(-DASH_HALF_WIDTH, LINE_LIFT, NEAR_LEFT);
      frame.column(DASH_HALF_WIDTH, LINE_LIFT, NEAR_RIGHT);
      frame.setRow(s1);
      frame.column(-DASH_HALF_WIDTH, LINE_LIFT, FAR_LEFT);
      frame.column(DASH_HALF_WIDTH, LINE_LIFT, FAR_RIGHT);

      p = writeVertex(this.dashPositions, p, NEAR_LEFT);
      p = writeVertex(this.dashPositions, p, NEAR_RIGHT);
      p = writeVertex(this.dashPositions, p, FAR_RIGHT);
      p = writeVertex(this.dashPositions, p, NEAR_LEFT);
      p = writeVertex(this.dashPositions, p, FAR_RIGHT);
      p = writeVertex(this.dashPositions, p, FAR_LEFT);

      index += 2;
      drawn++;
    }

    this.dashGeometry.setDrawRange(0, drawn * 6);
    this.dashGeometry.attributes.position.needsUpdate = true;
  }
}

function writeVertex(array, offset, v) {
  array[offset] = v.x;
  array[offset + 1] = v.y;
  array[offset + 2] = v.z;
  return offset + 3;
}

function flat(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
}
