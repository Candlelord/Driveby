import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Ribbon } from './ribbon.js';

// Sampled at half the road's resolution — terrain reads as big soft forms, so
// the extra rows would only cost fill rate.
const ROW_STRIDE = 2;

const INNER_EDGE = CONFIG.roadHalfWidth + CONFIG.shoulderWidth;
const COLUMNS = [-300, -130, -56, -24, -INNER_EDGE, INNER_EDGE, 24, 56, 130, 300];

// Hills flatten out to nothing where they meet the shoulder, so the road never
// gets swallowed by a ridge.
const RAMP_START = INNER_EDGE;
const RAMP_END = 46;

/**
 * Ground height at a point, relative to the road surface at the same distance.
 * Shared with the scenery so props sit *on* the hills rather than at road level.
 */
export function terrainHeight(w, s, hillHeight) {
  const ramp = smoothstep(RAMP_START, RAMP_END, Math.abs(w));
  const hills =
    Math.sin(s * 0.0135 + w * 0.021) +
    Math.sin(s * 0.037 - w * 0.013 + 1.9) * 0.45 +
    Math.sin(w * 0.031 + 0.7) * 0.6;
  return -0.35 + hills * hillHeight * ramp;
}

/**
 * The ground either side of the road: a low-poly ribbon whose amplitude is
 * driven by the current mood's terrain profile, so hills grow and flatten
 * across a block transition instead of popping.
 */
export class Terrain {
  constructor(scene) {
    this.rows = Math.ceil((CONFIG.segmentsBehind + CONFIG.segmentsAhead) / ROW_STRIDE) + 1;

    this.material = new THREE.MeshStandardMaterial({
      color: 0x525f63,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });

    this.ribbon = new Ribbon({
      columns: COLUMNS,
      rows: this.rows,
      material: this.material,
      skipQuads: [4], // the road covers this span
    });

    scene.add(this.ribbon.mesh);

    this.hillHeight = 0;
  }

  update(state, frame) {
    this.hillHeight = state.live.hillHeight;

    const step = CONFIG.segmentLength * ROW_STRIDE;
    const firstIndex =
      Math.floor(state.travelled / step) - Math.ceil(CONFIG.segmentsBehind / ROW_STRIDE);

    this.ribbon.update(
      frame,
      (r) => (firstIndex + r) * step,
      (w, s) => terrainHeight(w, s, this.hillHeight)
    );

    this.material.color.copy(state.live.groundColor);
  }
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
