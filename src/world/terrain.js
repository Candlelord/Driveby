import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Ribbon } from './ribbon.js';

const INNER_EDGE = CONFIG.roadHalfWidth + CONFIG.shoulderWidth;

// Hills flatten out to nothing where they meet the shoulder, so the road never
// gets swallowed by a ridge.
const RAMP_START = INNER_EDGE;
const RAMP_END = 46;

/**
 * Ground height at a point, relative to the road surface at the same distance.
 * Shared with the scenery so props sit *on* the hills rather than at road level.
 *
 * The three terrain shape parameters do all the work of telling five landforms
 * apart: `hillHeight` is amplitude, `hillScale` is how big the forms are, and
 * `hillSharpness` bends the noise — above 1 it pushes peaks up and flattens
 * valleys into mountains, below 1 it rounds everything into dunes.
 */
export function terrainHeight(w, s, live) {
  const ramp = smoothstep(RAMP_START, RAMP_END, Math.abs(w));
  if (ramp <= 0) return -0.35;

  const f = live.hillScale;
  const raw =
    (Math.sin(s * 0.0135 * f + w * 0.021 * f) +
      Math.sin(s * 0.037 * f - w * 0.013 * f + 1.9) * 0.45 +
      Math.sin(w * 0.031 * f + 0.7) * 0.6) /
    2.05;

  const shaped = Math.sign(raw) * Math.pow(Math.abs(raw), live.hillSharpness);
  return -0.35 + shaped * live.hillHeight * 2.05 * ramp;
}

/**
 * The ground either side of the road: a low-poly ribbon whose shape is driven
 * by the current terrain profile and whose colour is tinted by the current
 * climate, so snow whitens whatever landform happens to be underneath.
 */
export class Terrain {
  constructor(scene, tier) {
    this.rowStride = tier.terrainRowStride;
    this.rows =
      Math.ceil((CONFIG.segmentsBehind + CONFIG.segmentsAhead) / this.rowStride) + 1;

    this.material = new THREE.MeshStandardMaterial({
      color: 0x525f63,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });

    const columns = buildColumns(tier.terrainColumns);
    this.ribbon = new Ribbon({
      columns,
      rows: this.rows,
      material: this.material,
      skipQuads: [columns.length / 2 - 1], // the road covers this span
    });

    scene.add(this.ribbon.mesh);
    this.live = null;
  }

  update(state, frame) {
    this.live = state.live;

    const step = CONFIG.segmentLength * this.rowStride;
    const firstIndex =
      Math.floor(state.travelled / step) - Math.ceil(CONFIG.segmentsBehind / this.rowStride);

    this.ribbon.update(
      frame,
      (r) => (firstIndex + r) * step,
      (w, s) => terrainHeight(w, s, this.live)
    );

    this.material.color.copy(state.live.groundColor);
  }
}

/**
 * Lateral sample positions, symmetric about the road and packed more tightly
 * near it. Density matters: too few columns and each quad's two triangles read
 * as a diagonal seam rather than as low-poly faceting.
 */
function buildColumns(count) {
  const half = Math.max(4, Math.round(count / 2));
  const outer = 300;
  const columns = [];
  for (let i = half - 1; i >= 0; i--) columns.push(-sample(i, half, outer));
  for (let i = 0; i < half; i++) columns.push(sample(i, half, outer));
  return columns;
}

function sample(i, half, outer) {
  if (i === 0) return INNER_EDGE;
  const t = i / (half - 1);
  return INNER_EDGE + (outer - INNER_EDGE) * Math.pow(t, 2.4);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
