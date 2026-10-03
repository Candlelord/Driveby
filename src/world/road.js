import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Ribbon } from './ribbon.js';
import { asphaltMaps, gravelMaps, paintMap, withMacroVariation, withPuddles } from './surfaces.js';

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

    // Asphalt carries the most screen area in every frame, so it gets the full
    // set: aggregate albedo, a normal map for the grain, and a roughness map
    // whose polished wheel tracks are what a wet road lights up first.
    const asphalt = asphaltMaps();
    this.wetness = { value: 0 };
    this.surfaceMaterial = withPuddles(
      withMacroVariation(
        surface(0x3a4048, { ...asphalt, normalScale: new THREE.Vector2(0.3, 0.3) }),
        [1, 9],
        0.14
      ),
      this.wetness,
      ROAD_TILE / (2 * inner)
    );
    const paint = paintMap();
    this.lineMaterial = surface(0xffffff, { map: paint, roughness: 0.62 });
    // Centre dashes take their own colour — the concept frames run yellow
    // dashes against white edge lines, and that little difference is a
    // surprising amount of what makes the road read as a highway.
    this.dashMaterial = surface(0xf2c94c, { roughness: 0.6 });
    const gravel = gravelMaps();
    this.shoulderMaterial = withMacroVariation(
      surface(0x4a5058, { ...gravel, normalScale: new THREE.Vector2(0.9, 0.9) }),
      [1, 7],
      0.2
    );

    // u spans the carriageway exactly once, so the wheel tracks baked into the
    // asphalt land in the lanes; v repeats every ROAD_TILE units.
    this.surface = new Ribbon({
      columns: [-inner, inner],
      rows: this.rows,
      material: this.surfaceMaterial,
      uv: { u: (w) => (w + inner) / (2 * inner), length: ROAD_TILE },
      smoothNormals: true,
    });

    // Two edge stripes in one ribbon; quad 1 (the gap across the road) is dropped.
    this.lines = new Ribbon({
      columns: [-roadHalfWidth, -inner, inner, roadHalfWidth],
      rows: this.rows,
      material: this.lineMaterial,
      skipQuads: [1],
      uv: { u: (w) => w * 0.5, length: 5 },
      smoothNormals: true,
    });

    this.shoulders = new Ribbon({
      columns: [-outer, -roadHalfWidth, roadHalfWidth, outer],
      rows: this.rows,
      material: this.shoulderMaterial,
      skipQuads: [1],
      uv: { u: (w) => w / 3, length: 3 },
      smoothNormals: true,
    });

    this.surface.mesh.receiveShadow = true;
    this.shoulders.mesh.receiveShadow = true;
    scene.add(this.shoulders.mesh, this.surface.mesh, this.lines.mesh);

    this.lines.mesh.renderOrder = 1;

    this._buildKerbs(scene);
    this._buildDashes(scene);
  }

  /**
   * Painted kerbs: the yellow-and-black kerbstones that line roads all over
   * Nigeria. A raised strip just off each edge line, with a little vertical
   * face toward the road, shown only where the set asks for them.
   */
  _buildKerbs(scene) {
    const { roadHalfWidth } = CONFIG;
    const inner = roadHalfWidth + 0.02;
    const outer = roadHalfWidth + KERB_WIDTH;
    this.kerbMaterial = new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.8 });
    // Duplicated columns a hair apart give the kerb its face: low at the road
    // side, then up to kerb height.
    const columns = [-outer - 0.01, -outer, -inner, -inner + 0.01, inner - 0.01, inner, outer, outer + 0.01];
    this.kerbs = new Ribbon({
      columns,
      rows: this.rows,
      material: this.kerbMaterial,
      skipQuads: [3],
      uv: { u: () => 0.5, length: KERB_BLOCK * 2 },
      smoothNormals: true,
    });
    this.kerbs.mesh.receiveShadow = true;
    this.kerbs.mesh.visible = false;
    this._kerbHeight = (w) => {
      const a = Math.abs(w);
      return a < inner + 0.005 || a > outer + 0.005 ? -0.04 : KERB_HEIGHT;
    };
    scene.add(this.kerbs.mesh);
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
    this.dashes = new THREE.Mesh(geometry, this.dashMaterial);
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

    this.kerbs.mesh.visible = state.live.kerbs > 0.5;
    if (this.kerbs.mesh.visible) this.kerbs.update(frame, distanceForRow, this._kerbHeight);

    const live = state.live;
    this.surfaceMaterial.color.copy(live.roadColor);
    this.lineMaterial.color.copy(live.lineColor);
    this.dashMaterial.color.copy(live.dashColor);
    this.shoulderMaterial.color
      .copy(live.shoulderColor)
      .lerp(live.groundTint, live.groundTintStrength * 0.85);

    // Wet moods drop the roughness so the key light lays a sheen down the
    // asphalt — the cheapest "it has been raining" cue there is.
    // The roughness map multiplies this, so a wet road goes glassy in the
    // polished wheel tracks first and stays matte in the grain between.
    this.surfaceMaterial.roughness = live.roadRoughness;
    // Puddles only form once the road is properly wet.
    this.wetness.value = Math.min(1, Math.max(0, (0.72 - live.roadRoughness) / 0.38));
    // Water on asphalt is a dielectric film, not metal; the environment map
    // supplies the reflected sky, so metalness stays at zero.
    this.surfaceMaterial.metalness = 0;
    this.lineMaterial.roughness = 0.45 + live.roadRoughness * 0.25;
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

const ROAD_TILE = 12;
const KERB_WIDTH = 0.38;
const KERB_HEIGHT = 0.16;
const KERB_BLOCK = 1; // metres per painted block

let kerbMap = null;
/** Alternating yellow and black blocks, a little worn. */
function kerbTexture() {
  if (kerbMap) return kerbMap;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8b81e';
  ctx.fillRect(0, 0, 16, 64);
  ctx.fillStyle = '#151515';
  ctx.fillRect(0, 64, 16, 64);
  // Grime and chips.
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(60,50,40,${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * 16, Math.random() * 128, 2, 2);
  }
  kerbMap = new THREE.CanvasTexture(canvas);
  kerbMap.colorSpace = THREE.SRGBColorSpace;
  kerbMap.wrapS = kerbMap.wrapT = THREE.RepeatWrapping;
  return kerbMap;
}

function surface(color, maps = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    ...maps,
  });
}
