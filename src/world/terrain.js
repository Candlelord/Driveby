import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Ribbon } from './ribbon.js';

const INNER_EDGE = CONFIG.roadHalfWidth + CONFIG.shoulderWidth;

// Hills flatten out to nothing where they meet the shoulder, so the road never
// gets swallowed by a ridge.
const RAMP_START = INNER_EDGE;
const RAMP_END = 46;
const CLIFF_START = 18;
const CLIFF_END = 90;

/**
 * Ground height at a point, relative to the road surface at the same distance.
 * Shared with the scenery so props sit *on* the land rather than at road level.
 *
 * Four shape controls, and between them they cover every set:
 *   hillHeight     amplitude
 *   hillScale      how big the forms are
 *   hillSharpness  bends the noise — above 1 for jagged peaks, below for dunes
 *   causeway       drops the whole landscape away from the road, for a raised
 *                  bank across a flood or an elevated city roadway
 *   cliffSide      one side climbs into a wall while the other falls to water
 */
export function terrainHeight(w, s, live) {
  const abs = Math.abs(w);
  const ramp = smoothstep(RAMP_START, RAMP_END, abs);
  const base = -0.35 - live.causeway * smoothstep(RAMP_START, RAMP_START + 26, abs);
  if (ramp <= 0) return base;

  const f = live.hillScale;
  const raw =
    (Math.sin(s * 0.0135 * f + w * 0.021 * f) +
      Math.sin(s * 0.037 * f - w * 0.013 * f + 1.9) * 0.45 +
      Math.sin(w * 0.031 * f + 0.7) * 0.6) /
    2.05;

  const shaped = Math.sign(raw) * Math.pow(Math.abs(raw), live.hillSharpness);
  let height = base + shaped * live.hillHeight * 2.05 * ramp;

  // A cliff wall on one side. Sign convention matches the road normal, so
  // cliffSide of 1 puts the wall on the driver's right.
  if (live.cliffHeight > 0.01) {
    const onWallSide = Math.sign(w) === Math.sign(live.cliffSide);
    const climb = smoothstep(CLIFF_START, CLIFF_END, abs) * live.cliffHeight;
    height += onWallSide ? climb : -climb * 0.85;
  }

  return height;
}

/**
 * The ground either side of the road: a low-poly ribbon whose shape comes from
 * the terrain set and whose colour is tinted by the climate, so snow whitens
 * whatever landform happens to be underneath.
 */
export class Terrain {
  constructor(scene, tier) {
    this.rowStride = tier.terrainRowStride;
    this.rows = Math.ceil((CONFIG.segmentsBehind + CONFIG.segmentsAhead) / this.rowStride) + 1;

    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      vertexColors: true,
    });

    const columns = buildColumns(tier.terrainColumns);
    this.ribbon = new Ribbon({
      columns,
      rows: this.rows,
      material: this.material,
      skipQuads: [columns.length / 2 - 1], // the road covers this span
      vertexColors: true,
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
      (w, s) => terrainHeight(w, s, this.live),
      (w, s, height) => this._shade(w, s, height, state.live)
    );
  }
}

/**
 * Per-vertex colour.
 *
 * Flat ground in one colour is the flattest-looking thing in the scene, so the
 * ribbon is tinted by height: hollows sit toward the set's accent, ridges catch
 * the sky's light, and anything genuinely high picks up a pale cap. All three
 * ride on the same blended profile, so it works in any weather.
 */
Terrain.prototype._shade = function shade(w, s, height, live) {
  const relative = height / Math.max(4, live.hillHeight * 2.4);
  const t = clamp(relative * 0.5 + 0.5, 0, 1);

  SHADE.copy(live.groundAccent).lerp(live.groundColor, smoothstep01(t * 1.25));
  // High ground catches light and, in cold weather, snow.
  const cap = clamp((relative - 0.45) * 1.7, 0, 1);
  if (cap > 0) SHADE.lerp(live.groundTint, cap * (0.25 + live.groundTintStrength * 0.6));
  return SHADE;
};

const SHADE = new THREE.Color();

function clamp(x, min, max) {
  return x < min ? min : x > max ? max : x;
}
function smoothstep01(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
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
