import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { heading } from '../path.js';
import { buildCarParts } from './carGeometry.js';
import { softDotTexture } from './textures.js';

const DUMMY = new THREE.Object3D();
const POSITION = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const COLOR = new THREE.Color();

// Two lanes: same-direction traffic keeps right, oncoming keeps left. The
// player is free to roam across both, because there is nothing to crash into.
const LANE = 2.9;

// Minimum spacing between cars sharing a lane.
const MIN_GAP = 26;

const PAINT = [0xd8d8d2, 0x2f3a4a, 0x8a2f2f, 0x30503c, 0xd8a23a, 0x5a5f68, 0x7a4a86];

/**
 * Other cars on the road.
 *
 * Same-direction traffic runs slower than the player so you steadily catch and
 * pass it; oncoming traffic closes at nearly twice the player's speed and is
 * gone in a second. At night the two read completely differently — a pair of
 * receding tail lights versus headlights growing out of the dark — which is
 * most of the reason traffic is here at all.
 *
 * Nothing collides. This game has no fail state, so instead of a crash, traffic
 * eases toward its shoulder when the player ends up on top of it.
 */
export class Traffic {
  constructor(scene, tier) {
    this.count = tier.trafficSlots;
    this.cars = [];

    const parts = buildCarParts({ staticWheels: true });

    this.bodyMaterial = flat(0xffffff, 0.55, 0.15);
    this.darkMaterial = flat(0x181b20, 0.7, 0.1);
    this.glassMaterial = flat(0x1e2630, 0.25, 0.4);
    this.headMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3d4 });
    this.tailMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a18 });

    // Per-instance colour so the traffic is not a convoy of identical cars.
    this.body = instanced(parts.body, this.bodyMaterial, this.count);
    this.dark = instanced(parts.dark, this.darkMaterial, this.count);
    this.glass = instanced(parts.glass, this.glassMaterial, this.count);
    this.heads = instanced(parts.heads, this.headMaterial, this.count);
    this.tails = instanced(parts.tails, this.tailMaterial, this.count);

    this.meshes = [this.body, this.dark, this.glass, this.heads, this.tails];
    // Traffic near the player sits inside the car's shadow frustum and casts too.
    this.body.castShadow = true;
    this.dark.castShadow = true;

    this._buildGlows();
    this._buildShadows();

    for (const mesh of this.meshes) scene.add(mesh);
    scene.add(this.headGlow, this.tailGlow, this.shadows);

    for (let i = 0; i < this.count; i++) {
      this.cars.push(this._spawn({}, 0, true));
      COLOR.set(PAINT[i % PAINT.length]);
      this.body.setColorAt(i, COLOR);
    }
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
  }

  /**
   * Lamp glows are quads facing along the car's own axis rather than the
   * camera: a headlight genuinely does point forwards, so an oncoming car
   * shows you its glow and a car ahead of you does not.
   */
  _buildGlows() {
    const glowGeometry = new THREE.PlaneGeometry(1, 1);

    this.headGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff0d0,
      map: softDotTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.tailGlowMaterial = this.headGlowMaterial.clone();
    this.tailGlowMaterial.color.set(0xff3a20);

    this.headGlow = instanced(glowGeometry, this.headGlowMaterial, this.count);
    this.tailGlow = instanced(glowGeometry, this.tailGlowMaterial, this.count);
    this.headGlow.renderOrder = 2;
    this.tailGlow.renderOrder = 2;
  }

  _buildShadows() {
    const geometry = new THREE.CircleGeometry(1.75, 16).rotateX(-Math.PI / 2);
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    this.shadows = instanced(geometry, this.shadowMaterial, this.count);
  }

  _spawn(car, travelled, initial = false) {
    // Roughly a third of traffic comes the other way.
    car.oncoming = Math.random() < 0.38;
    car.lane = car.oncoming ? -LANE : LANE;
    car.laneOffset = 0;

    // Retry a few times rather than dropping a car inside one already in the
    // same lane; a handful of attempts is plenty at these densities.
    for (let attempt = 0; attempt < 6; attempt++) {
      if (car.oncoming) {
        car.speed = CONFIG.speed * (0.75 + Math.random() * 0.35);
        car.s = travelled + (initial ? 60 + Math.random() * 320 : 300 + Math.random() * 140);
      } else {
        // Slower than the player, so you close on it rather than chase it forever.
        car.speed = CONFIG.speed * (0.5 + Math.random() * 0.32);
        car.s = travelled + (initial ? 40 + Math.random() * 260 : 210 + Math.random() * 160);
      }
      if (this._hasRoom(car)) break;
    }
    return car;
  }

  _hasRoom(car) {
    for (const other of this.cars) {
      if (other === car || other.oncoming !== car.oncoming) continue;
      if (Math.abs(other.s - car.s) < MIN_GAP) return false;
    }
    return true;
  }

  update(state, frame) {
    const live = state.live;
    const travelled = state.travelled;
    const behind = -55;
    const ahead = CONFIG.segmentsAhead * CONFIG.segmentLength + 40;

    for (let i = 0; i < this.count; i++) {
      const car = this.cars[i];
      car.s += (car.oncoming ? -car.speed : car.speed) * state.dt;

      const gap = car.s - travelled;
      if (gap < behind || gap > ahead) this._spawn(car, travelled);

      // No collisions — traffic yields instead. Only same-direction cars can
      // linger alongside the player long enough for this to matter.
      const closing = Math.abs(gap) < 9 && Math.abs(state.lateral - car.lane) < 2.6;
      const target = closing ? Math.sign(car.lane || 1) * 1.5 : 0;
      car.laneOffset += (target - car.laneOffset) * (1 - Math.exp(-2.5 * state.dt));

      this._place(car, frame, travelled, i);
    }

    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    this.headGlow.instanceMatrix.needsUpdate = true;
    this.tailGlow.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;

    const on = live.headlights;
    this.headMaterial.color.setRGB(1, 0.94, 0.8).multiplyScalar(0.35 + on * 1.8);
    this.tailMaterial.color.setRGB(1, 0.28, 0.12).multiplyScalar(0.95 + on * 0.8);
    this.headGlowMaterial.opacity = on * 0.55;
    this.tailGlowMaterial.opacity = on * 0.4;
    this.shadowMaterial.opacity = 0.06 + 0.2 * (1 - live.lampIntensity);
  }

  _place(car, frame, travelled, index) {
    const lateral = car.lane + car.laneOffset;
    frame.point(car.s, lateral, 0, POSITION);

    // Align with the road where the car actually is, not where the player is.
    const relative = heading(car.s) - heading(travelled);
    const yaw = -relative + (car.oncoming ? Math.PI : 0);

    DUMMY.position.copy(POSITION);
    DUMMY.rotation.set(0, yaw, 0);
    DUMMY.scale.setScalar(1);
    DUMMY.updateMatrix();

    for (const mesh of this.meshes) mesh.setMatrixAt(index, DUMMY.matrix);

    DUMMY.position.y += 0.02;
    DUMMY.updateMatrix();
    this.shadows.setMatrixAt(index, DUMMY.matrix);

    // Glow quads stand upright at each end of the car, facing along its axis.
    // `along` is positive toward the car's nose.
    this._placeGlow(this.headGlow, index, POSITION, yaw, 2.4, 3.2);
    this._placeGlow(this.tailGlow, index, POSITION, yaw, -2.4, 2.4);
  }

  _placeGlow(mesh, index, base, yaw, along, size) {
    // The car's forward vector after a yaw rotation is (-sin, 0, -cos).
    DUMMY.position.set(
      base.x - Math.sin(yaw) * along,
      base.y + 0.92,
      base.z - Math.cos(yaw) * along
    );
    DUMMY.rotation.set(0, yaw, 0);
    DUMMY.scale.set(size, size * 0.75, 1);
    DUMMY.updateMatrix();
    mesh.setMatrixAt(index, DUMMY.matrix);
  }
}

function instanced(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
  return mesh;
}

function flat(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  });
}
