import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { hash, curvature } from '../path.js';
import { Ribbon } from '../world/ribbon.js';
import { scanCorners } from './corners.js';
import { placeAt } from './place.js';

const ROAD_EDGE = CONFIG.roadHalfWidth; // 6.2
const TAPE_W = ROAD_EDGE + 2.0;
const TAPE_LOW = 0.5;
const TAPE_HIGH = 1.0;
const STACK_LATERAL = 5.0; // inside the road edge, so a wide line hits them
const BOARD_LATERAL = TAPE_W + 0.8;
const CROWD_LATERAL = TAPE_W + 1.6;
const ZONE = 240; // spectator zones are laid out per this many units of road

const MAX_STACKS = 40;
const MAX_BOARDS = 20;
const MAX_FANS = 64;
const MAX_POSTS = 180;

const DUMMY = new THREE.Object3D();
const COLOUR = new THREE.Color();
const TYRE_COLOURS = [0xf2efe6, 0x1b1b1d, 0xd8261c, 0xf2efe6, 0x1b1b1d];
const SHIRTS = [0xff3d8b, 0xc6f000, 0xf5f2e8, 0x2f7cd8, 0xe8a317, 0x16161a, 0xd8261c, 0x37a84a];
const SKINS = [0x8a5a3b, 0x6b4128, 0xc68a62, 0xe3b48f, 0x4d2f1e, 0xa5714c];

/**
 * What lines a closed stage: red-and-white tape on the outside of the bends
 * and around the start and finish, tyre stacks at the tightest corners,
 * chevron boards pointing the way round them, and spectators standing in the
 * places they would.
 *
 * Everything is a pure function of distance along the road — which corner, which
 * zone, which person — so it is the same on every pass and nothing is stored.
 * The tyre stacks are solid, and can be knocked over.
 */
export class Dressing {
  constructor(scene) {
    this.rows = CONFIG.segmentsBehind + CONFIG.segmentsAhead + 1;
    this.mode = new Int8Array(this.rows); // per row: 0 none, -1 left, 1 right, 2 both
    this.solids = []; // tyre stacks near the car, for collisions
    this.knocked = new Map(); // stack key -> { ds, dl, spin, age }
    this._cornerClock = 0;
    this.corners = [];
    this.region = null;

    // --- tape: a band either side, hidden by sinking it out of sight
    this.tapeMaterial = new THREE.MeshStandardMaterial({ map: tapeTexture(), roughness: 0.7, side: THREE.DoubleSide });
    this.tape = [-1, 1].map((side) => {
      const ribbon = new Ribbon({
        columns: [side * TAPE_W, side * TAPE_W + side * 0.001],
        rows: this.rows,
        material: this.tapeMaterial,
        uv: { u: (w) => (Math.abs(w) > TAPE_W + 0.0005 ? 1 : 0), length: 3 },
      });
      ribbon.mesh.visible = false;
      scene.add(ribbon.mesh);
      return { side, ribbon };
    });

    // Stakes under the tape.
    this.posts = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1.15, 5).translate(0, 0.575, 0),
      new THREE.MeshStandardMaterial({ color: 0xdedbd0, roughness: 0.8 }),
      MAX_POSTS
    );
    this.posts.frustumCulled = false;
    this.posts.count = 0;
    scene.add(this.posts);

    // Tyre stacks.
    this.stacks = new THREE.InstancedMesh(
      stackGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
      MAX_STACKS
    );
    this.stacks.frustumCulled = false;
    this.stacks.castShadow = true;
    this.stacks.count = 0;
    scene.add(this.stacks);

    // Chevron boards: one mesh facing each way, plus a post.
    const board = new THREE.PlaneGeometry(1.7, 1.15).translate(0, 1.5, 0);
    this.boards = {
      left: this._boardMesh(scene, board, chevronTexture('left')),
      right: this._boardMesh(scene, board, chevronTexture('right')),
    };
    this.boardPosts = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.5, 5).translate(0, 0.75, 0),
      new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.8 }),
      MAX_BOARDS * 2
    );
    this.boardPosts.frustumCulled = false;
    this.boardPosts.count = 0;
    scene.add(this.boardPosts);

    // Spectators: bodies take a shirt colour, heads a skin tone.
    const { bodies, heads } = fanGeometry();
    this.fanBodies = new THREE.InstancedMesh(bodies, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), MAX_FANS);
    this.fanHeads = new THREE.InstancedMesh(heads, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), MAX_FANS);
    for (const mesh of [this.fanBodies, this.fanHeads]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
    }
  }

  _boardMesh(scene, geometry, texture) {
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.08 }),
      MAX_BOARDS
    );
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  }

  /** A stack has been hit: it falls over, away from the car. */
  knock(key, ds, dl) {
    if (!this.knocked.has(key)) this.knocked.set(key, { ds, dl, spin: (hash(key * 3.1) - 0.5) * 3, age: 0 });
  }

  /**
   * @param {{start:number,end:number}|null} region the stage in play or next up
   */
  update(state, frame, region) {
    this.region = region;
    const visible = Boolean(region);
    for (const { ribbon } of this.tape) ribbon.mesh.visible = visible;
    for (const mesh of [this.posts, this.stacks, this.boardPosts, this.fanBodies, this.fanHeads, this.boards.left, this.boards.right]) {
      mesh.visible = visible;
    }
    this.solids.length = 0;
    if (!visible) return;

    const s0 = state.travelled;
    const range = CONFIG.segmentsAhead * CONFIG.segmentLength;
    const inside = (s) => s > region.start - 70 && s < region.end + 45;

    this._cornerClock -= state.dt;
    if (this._cornerClock <= 0) {
      this._cornerClock = 0.25;
      this.corners = scanCorners(s0 - 30, range + 40, { keepPartial: true, maxSeverity: 3 });
    }

    this._tape(state, frame, inside);
    this._stacksAndBoards(state, frame, inside);
    this._crowd(state, frame, region, inside);
    for (const [key, k] of this.knocked) {
      k.age += state.dt;
      if (k.age > 60) this.knocked.delete(key);
    }
  }

  // --- tape ---------------------------------------------------------------

  _tape(state, frame, inside) {
    const { segmentLength, segmentsBehind } = CONFIG;
    const first = Math.floor(state.travelled / segmentLength) - segmentsBehind;
    const region = this.region;
    for (let r = 0; r < this.rows; r++) {
      const s = (first + r) * segmentLength;
      let mode = 0;
      if (inside(s)) {
        // Round the gates, in the crowd zones, and wherever the road bends the
        // car toward its outside.
        const nearGate = Math.abs(s - region.start) < 70 || Math.abs(s - region.end) < 70;
        const zone = Math.floor(s / ZONE);
        const along = s - zone * ZONE;
        const crowd = hash(zone * 5.3 + 1.7) > 0.5 && along > 50 && along < 190;
        if (nearGate || crowd) mode = 2;
        else {
          const k = (curvature(s - 16) + curvature(s) + curvature(s + 16)) / 3;
          if (Math.abs(k) > 0.0045) mode = k > 0 ? -1 : 1;
        }
      }
      this.mode[r] = mode;
    }

    for (const { side, ribbon } of this.tape) {
      ribbon.update(frame, (r) => (first + r) * segmentLength, (w, s, row) => {
        const m = this.mode[row];
        const on = m === 2 || m === side;
        if (!on) return -2.5;
        return Math.abs(w) > TAPE_W + 0.0005 ? TAPE_HIGH : TAPE_LOW;
      });
    }

    // Stakes: every third row where the tape is up, either side.
    let n = 0;
    for (let r = 0; r < this.rows && n < MAX_POSTS; r += 3) {
      const s = (first + r) * segmentLength;
      const m = this.mode[r];
      for (const side of [-1, 1]) {
        if (!(m === 2 || m === side) || n >= MAX_POSTS) continue;
        placeAt(DUMMY, frame, s, side * TAPE_W, { live: state.live });
        DUMMY.scale.setScalar(1);
        DUMMY.updateMatrix();
        this.posts.setMatrixAt(n++, DUMMY.matrix);
      }
    }
    this.posts.count = n;
    this.posts.instanceMatrix.needsUpdate = true;
  }

  // --- tyre stacks and chevrons --------------------------------------------

  _stacksAndBoards(state, frame, inside) {
    let stacks = 0;
    let left = 0;
    let right = 0;
    let posts = 0;
    for (const corner of this.corners) {
      const apex = corner.peakAt;
      if (!inside(apex)) continue;
      const outside = -corner.sign; // a right-hander (sign +1) is run wide to the left
      const key = corner.key;

      // Tyre stacks on the very tightest corners.
      if (corner.severity <= 2) {
        const offsets = corner.severity === 0 ? [-6, -2, 2, 6] : [-4, 0, 4];
        offsets.forEach((offset, i) => {
          if (stacks >= MAX_STACKS) return;
          const id = key * 10 + i;
          const s = apex + offset;
          let lateral = outside * STACK_LATERAL;
          let ds = 0;
          let lean = 0;
          let spin = 0;
          const fallen = this.knocked.get(id);
          if (fallen) {
            // Thrown out and over, and left lying there.
            const t = 1 - Math.exp(-fallen.age * 4);
            ds = fallen.ds * 2.4 * t;
            lateral += outside * 1.7 * t;
            lean = 1.45 * t;
            spin = fallen.spin * t;
          } else {
            this.solids.push({ id, s, lateral });
          }
          placeAt(DUMMY, frame, s + ds, lateral, { live: state.live });
          DUMMY.rotation.z = lean;
          DUMMY.rotation.y += spin;
          DUMMY.scale.setScalar(1);
          DUMMY.updateMatrix();
          this.stacks.setMatrixAt(stacks, DUMMY.matrix);
          COLOUR.setHex(TYRE_COLOURS[(key + i) % TYRE_COLOURS.length]);
          this.stacks.setColorAt(stacks, COLOUR);
          stacks++;
        });
      }

      // Chevron boards round the next-tightest as well.
      if (corner.severity <= 3) {
        const boards = corner.severity <= 1 ? [-7, 0, 7] : [-4, 4];
        const mesh = corner.sign > 0 ? this.boards.right : this.boards.left;
        const count = corner.sign > 0 ? right : left;
        boards.forEach((offset, i) => {
          if (count + i >= MAX_BOARDS || posts >= MAX_BOARDS * 2) return;
          // Boards face the road: a quarter turn from the outside edge.
          placeAt(DUMMY, frame, apex + offset, outside * BOARD_LATERAL, { live: state.live, yaw: outside > 0 ? -Math.PI / 2 : Math.PI / 2 });
          DUMMY.scale.setScalar(1);
          DUMMY.updateMatrix();
          mesh.setMatrixAt(count + i, DUMMY.matrix);
          this.boardPosts.setMatrixAt(posts++, DUMMY.matrix);
        });
        if (corner.sign > 0) right += boards.length;
        else left += boards.length;
      }
    }
    this.stacks.count = stacks;
    this.stacks.instanceMatrix.needsUpdate = true;
    if (this.stacks.instanceColor) this.stacks.instanceColor.needsUpdate = true;
    this.boards.left.count = left;
    this.boards.right.count = right;
    this.boards.left.instanceMatrix.needsUpdate = true;
    this.boards.right.instanceMatrix.needsUpdate = true;
    this.boardPosts.count = posts;
    this.boardPosts.instanceMatrix.needsUpdate = true;
  }

  // --- spectators -----------------------------------------------------------

  _crowd(state, frame, region, inside) {
    const range = CONFIG.segmentsAhead * CONFIG.segmentLength;
    const first = Math.floor((state.travelled - 40) / ZONE);
    const last = Math.floor((state.travelled + range) / ZONE);
    const t = state.time;
    let n = 0;

    const add = (s, side, lateral, seed) => {
      if (n >= MAX_FANS || !inside(s)) return;
      const cheer = Math.sin(t * (5 + hash(seed) * 3) + seed) * 0.5 + 0.5;
      placeAt(DUMMY, frame, s, side * lateral, { live: state.live, y: cheer * 0.08, yaw: -side * Math.PI / 2 + (hash(seed * 1.9) - 0.5) * 0.7, ground: true });
      DUMMY.scale.setScalar(0.92 + hash(seed * 4.1) * 0.2);
      DUMMY.updateMatrix();
      this.fanBodies.setMatrixAt(n, DUMMY.matrix);
      this.fanHeads.setMatrixAt(n, DUMMY.matrix);
      COLOUR.setHex(SHIRTS[Math.floor(hash(seed * 2.3) * SHIRTS.length)]);
      this.fanBodies.setColorAt(n, COLOUR);
      COLOUR.setHex(SKINS[Math.floor(hash(seed * 6.7) * SKINS.length)]);
      this.fanHeads.setColorAt(n, COLOUR);
      n++;
    };

    for (let zone = first; zone <= last; zone++) {
      if (hash(zone * 5.3 + 1.7) <= 0.5) continue;
      const centre = zone * ZONE + 120;
      const side = hash(zone * 9.1) < 0.5 ? -1 : 1;
      const count = 6 + Math.floor(hash(zone * 2.9) * 8);
      for (let i = 0; i < count; i++) {
        const seed = zone * 100 + i;
        add(centre + (hash(seed * 1.3) - 0.5) * 70, side, CROWD_LATERAL + hash(seed * 7.7) * 4, seed);
      }
    }
    // A crowd round each gate, both sides.
    for (const [index, gate] of [[1, region.start], [2, region.end]]) {
      if (gate - state.travelled > range || gate - state.travelled < -60) continue;
      for (let i = 0; i < 12; i++) {
        const seed = index * 7919 + Math.floor(gate) + i;
        add(gate + (hash(seed) - 0.5) * 36, i % 2 ? 1 : -1, CROWD_LATERAL + hash(seed * 3.3) * 4, seed);
      }
    }
    this.fanBodies.count = this.fanHeads.count = n;
    for (const mesh of [this.fanBodies, this.fanHeads]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

// --- geometry and textures -------------------------------------------------

function stackGeometry() {
  // Three tyres, each a squashed torus lying flat, stacked.
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const tyre = new THREE.TorusGeometry(0.3, 0.14, 8, 16);
    tyre.rotateX(Math.PI / 2);
    tyre.scale(1, 1, 1);
    tyre.translate(0, 0.14 + i * 0.27, 0);
    parts.push(tyre);
  }
  return mergeFlat(parts);
}

function fanGeometry() {
  const bodyParts = [];
  const headParts = [];
  const legs = new THREE.BoxGeometry(0.38, 0.82, 0.24).translate(0, 0.41, 0);
  const torso = new THREE.BoxGeometry(0.5, 0.62, 0.28).translate(0, 1.12, 0);
  const armL = new THREE.BoxGeometry(0.12, 0.55, 0.12).translate(-0.31, 1.1, 0);
  const armR = new THREE.BoxGeometry(0.12, 0.55, 0.12).translate(0.31, 1.1, 0);
  armL.rotateZ(0.5);
  armR.rotateZ(-0.5);
  bodyParts.push(legs, torso, armL, armR);
  headParts.push(new THREE.SphereGeometry(0.16, 8, 6).translate(0, 1.58, 0));
  return { bodies: mergeFlat(bodyParts), heads: mergeFlat(headParts) };
}

/** Merge geometries, whatever mixture of indexed and not. */
function mergeFlat(parts) {
  let vertices = 0;
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  for (const p of flat) vertices += p.attributes.position.count;
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  let offset = 0;
  for (const p of flat) {
    position.set(p.attributes.position.array, offset * 3);
    normal.set(p.attributes.normal.array, offset * 3);
    offset += p.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  return merged;
}

let tapeMap = null;
function tapeTexture() {
  if (tapeMap) return tapeMap;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f2efe6';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#d8261c';
  for (let i = -2; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 32, 0);
    ctx.lineTo(i * 32 + 16, 0);
    ctx.lineTo(i * 32 + 16 + 128, 128);
    ctx.lineTo(i * 32 + 128, 128);
    ctx.fill();
  }
  tapeMap = new THREE.CanvasTexture(canvas);
  tapeMap.colorSpace = THREE.SRGBColorSpace;
  tapeMap.wrapS = tapeMap.wrapT = THREE.RepeatWrapping;
  tapeMap.anisotropy = 4;
  return tapeMap;
}

function chevronTexture(direction) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 172;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, 256, 172);
  ctx.fillStyle = '#f5f2e8';
  ctx.fillRect(8, 8, 240, 156);
  ctx.fillStyle = '#0b0b0c';
  const sign = direction === 'right' ? 1 : -1;
  for (const x of [58, 128, 198]) {
    ctx.beginPath();
    ctx.moveTo(x - sign * 30, 28);
    ctx.lineTo(x + sign * 12, 86);
    ctx.lineTo(x - sign * 30, 144);
    ctx.lineTo(x - sign * 8, 144);
    ctx.lineTo(x + sign * 34, 86);
    ctx.lineTo(x - sign * 8, 28);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
