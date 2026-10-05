import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { heading } from '../path.js';
import { buildCarParts, buildVanParts } from './carGeometry.js';
import { carMaterials } from './car.js';
import { softDotTexture } from './textures.js';

const DUMMY = new THREE.Object3D();
const POSITION = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const COLOR = new THREE.Color();

// Two lanes: same-direction traffic keeps right, oncoming keeps left. The
// player is free to roam across both, because there is nothing to crash into.
const LANE = 2.9;

// Footprint overlap that counts as contact: centre-to-centre along the road,
// and across it. Both bodies are about 4.6 long and 2 wide.
const CAR_LENGTH = 4.5;
const CAR_WIDTH = 1.9;

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
 * Traffic is solid: drive into it and you crash (see _collide). There is still
 * no fail state — the hit costs you speed and a shove, and the other car spins
 * off and stops — but you have to drive around it.
 */
const FAR = 4000; // units beyond the camera where closed-road traffic waits

export class Traffic {
  constructor(scene, tier) {
    this.count = tier.trafficSlots;
    this.cars = [];

    const parts = buildCarParts({ staticWheels: true });

    const materials = carMaterials(0xffffff);
    this.bodyMaterial = materials.body;
    this.darkMaterial = materials.dark;
    this.glassMaterial = materials.glass;
    this.chromeMaterial = materials.chrome;
    this.plateMaterial = materials.plate;
    this.headMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3d4 });
    this.tailMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a18 });

    // Per-instance colour so the traffic is not a convoy of identical cars.
    this.body = instanced(parts.body, this.bodyMaterial, this.count);
    this.dark = instanced(parts.dark, this.darkMaterial, this.count);
    this.glass = instanced(parts.glass, this.glassMaterial, this.count);
    this.chrome = instanced(parts.chrome, this.chromeMaterial, this.count);
    this.plate = instanced(parts.plate, this.plateMaterial, this.count);
    this.heads = instanced(parts.heads, this.headMaterial, this.count);
    this.tails = instanced(parts.tails, this.tailMaterial, this.count);

    this.meshes = [this.body, this.dark, this.glass, this.chrome, this.plate, this.heads, this.tails];
    // Traffic near the player sits inside the car's shadow frustum and casts too.
    this.body.castShadow = true;
    this.dark.castShadow = true;

    // Danfos: the yellow Lagos minibus, its own set of instanced parts sharing
    // every material but the paint. Each slot is either a car or a van; the
    // other kind's instance is parked at zero scale.
    const van = buildVanParts();
    this.vanBodyMaterial = carMaterials(0xf0b000).body;
    this.vanMeshes = [
      instanced(van.body, this.vanBodyMaterial, this.count),
      instanced(van.dark, this.darkMaterial, this.count),
      instanced(van.glass, this.glassMaterial, this.count),
      instanced(van.chrome, this.chromeMaterial, this.count),
      instanced(van.plate, this.plateMaterial, this.count),
      instanced(van.heads, this.headMaterial, this.count),
      instanced(van.tails, this.tailMaterial, this.count),
    ];
    this.vanMeshes[0].castShadow = this.vanMeshes[1].castShadow = true;
    for (const mesh of this.vanMeshes) scene.add(mesh);

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

  _spawn(car, travelled, initial = false, danfo = 0) {
    // What kind of vehicle this slot is, from the place it turns up in.
    car.kind = Math.random() < danfo ? 'van' : 'car';
    // Roughly a third of traffic comes the other way.
    car.oncoming = Math.random() < 0.38;
    car.lane = car.oncoming ? -LANE : LANE;
    car.laneOffset = 0;
    // Collision state: a hit car spins, slides off its line and rolls to a stop.
    car.hit = 0;
    car.spin = 0;
    car.spinRate = 0;
    car.slide = 0;
    car.cooldown = 0;
    // A few drivers are not watching the road, which is how pile-ups happen.
    car.distracted = Math.random() < 0.18;

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

  /** True while the road is closed to everyone but the player. */
  closed = false;

  update(state, frame, physics, sfx) {
    const live = state.live;
    const travelled = state.travelled;
    const behind = -55;
    const ahead = CONFIG.segmentsAhead * CONFIG.segmentLength + 40;

    for (let i = 0; i < this.count; i++) {
      const car = this.cars[i];
      car.s += (car.oncoming ? -car.speed : car.speed) * state.dt;

      const gap = car.s - travelled;
      if (this.closed) {
        // A closed road (a rally stage): no one else is on it. Cars are parked
        // far over the horizon, out of view, until it opens again.
        if (gap < FAR / 2) {
          car.s = travelled + FAR;
          car.speed = 0;
          car.hit = 0;
        }
        car.wasClosed = true;
      } else if (gap < behind || gap > ahead || car.wasClosed) {
        car.wasClosed = false;
        this._spawn(car, travelled, false, live.danfo);
      }
      this._updateWreck(car, state.dt);
    }

    this._interact(state, sfx);

    for (let i = 0; i < this.count; i++) {
      const car = this.cars[i];
      if (physics) this._collide(car, car.s - travelled, state, physics, sfx);
      this._place(car, frame, travelled, i);
    }

    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of this.vanMeshes) mesh.instanceMatrix.needsUpdate = true;
    this.headGlow.instanceMatrix.needsUpdate = true;
    this.tailGlow.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;

    const on = live.headlights;
    this.headMaterial.color.setRGB(1, 0.94, 0.8).multiplyScalar(0.35 + on * 1.8);
    this.tailMaterial.color.setRGB(1, 0.05, 0.025).multiplyScalar(0.5 + on * 2.4);
    this.headGlowMaterial.opacity = on * 0.55;
    this.tailGlowMaterial.opacity = on * 0.4;
    this.shadowMaterial.opacity = 0.06 + 0.2 * (1 - live.lampIntensity);
  }

  /**
   * Traffic and traffic. A car closing on a slower or wrecked one in its lane
   * brakes to follow it — unless its driver is not paying attention — and any
   * two that do touch both become wrecks, so a crash can turn into a pile-up.
   */
  _interact(state, sfx) {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      for (let j = 0; j < cars.length; j++) {
        if (i === j) continue;
        const b = cars[j];
        const latA = a.lane + a.laneOffset;
        const latB = b.lane + b.laneOffset;
        if (Math.abs(latA - latB) > CAR_WIDTH) continue;

        // Following: b is ahead of a in a's direction of travel.
        const dirA = a.oncoming ? -1 : 1;
        const lead = (b.s - a.s) * dirA;
        const velA = dirA * a.speed;
        const velB = b.oncoming ? -b.speed : b.speed;
        if (lead > 0 && lead < 26 && a.hit <= 0 && !a.distracted) {
          // Ease down to the speed of whatever is in front (along a's heading).
          const target = Math.max(0, velB * dirA);
          if (a.speed > target) a.speed += (target - a.speed) * (1 - Math.exp(-2.2 * state.dt));
        }

        if (j < i || Math.abs(b.s - a.s) > CAR_LENGTH || a.cooldown > 0 || b.cooldown > 0) continue;
        const closing = Math.abs(velA - velB);
        const strength = Math.min(1, 0.2 + closing / 40);
        const side = Math.sign(latB - latA) || 1;
        for (const [car, away] of [[a, -side], [b, side]]) {
          car.hit = 4;
          car.cooldown = 1.2;
          car.spinRate = away * (1 + strength * 3) * (Math.random() < 0.5 ? 1 : -1);
          car.slide = away * (1.5 + strength * 4);
          car.speed *= 0.35;
        }
        // Heard if it is near enough.
        const distance = Math.abs(a.s - state.travelled);
        if (distance < 140) sfx?.crash(strength * (1 - distance / 160));
      }
    }
  }

  /** A car that has been hit: spinning down, sliding off its line, stopping. */
  _updateWreck(car, dt) {
    car.cooldown = Math.max(0, car.cooldown - dt);
    if (car.hit <= 0) return;
    car.hit -= dt;
    car.speed *= Math.exp(-1.4 * dt);
    car.spin += car.spinRate * dt;
    car.spinRate *= Math.exp(-1.8 * dt);
    car.laneOffset += car.slide * dt;
    car.slide *= Math.exp(-2.2 * dt);
    // It can end up on the verge, but not out in the fields.
    const edge = CONFIG.roadHalfWidth + 2;
    car.laneOffset = Math.max(-edge - car.lane, Math.min(edge - car.lane, car.laneOffset));
  }

  /**
   * Cars are solid. Overlap the player's footprint and both vehicles take the
   * hit: the player loses most of their speed and is shoved off the line, the
   * other car is shunted, spins and comes to rest. How violent it is follows
   * from the closing speed, so a nudge while overtaking is a scrape and a
   * head-on is a proper smash.
   */
  _collide(car, gap, state, physics, sfx) {
    if (car.cooldown > 0) return;
    const dx = car.lane + car.laneOffset - state.lateral;
    if (Math.abs(gap) > CAR_LENGTH || Math.abs(dx) > CAR_WIDTH) return;

    const theirs = car.oncoming ? -car.speed : car.speed; // along the road
    // Positive when the two are converging along the road.
    const closing = gap >= 0 ? state.speed - theirs : theirs - state.speed;
    const glancing = Math.abs(dx) > CAR_WIDTH * 0.6;
    const strength = Math.min(1, Math.max(0.15, Math.max(0, closing) / 45 + (glancing ? 0.1 : 0.2)));
    const away = Math.sign(dx) || 1; // which side the other car is on

    // The player: rear-ending something drops you below its speed; a head-on
    // stops you almost dead; a scrape from the side mostly just shoves.
    let speedAfter = state.speed;
    if (gap >= 0 && closing > 0) speedAfter = glancing ? state.speed * 0.7 : Math.max(0, theirs) * 0.6;
    physics.collide(speedAfter, -away * (3 + strength * 9), strength);

    // The other car.
    car.hit = 4;
    car.cooldown = 1.2;
    car.spinRate = away * (1.2 + strength * 4) * (Math.random() < 0.5 ? 1 : -1);
    car.slide = away * (2 + strength * 6);
    if (car.oncoming) car.speed *= 0.1;
    else if (gap >= 0) car.speed += Math.max(0, closing) * 0.45; // shunted forward
    else car.speed *= 0.5;

    sfx?.crash(strength);
  }

  _place(car, frame, travelled, index) {
    const lateral = car.lane + car.laneOffset;
    frame.point(car.s, lateral, 0, POSITION);

    // Align with the road where the car actually is, not where the player is.
    const relative = heading(car.s) - heading(travelled);
    const yaw = -relative + (car.oncoming ? Math.PI : 0) + car.spin;

    DUMMY.position.copy(POSITION);
    DUMMY.rotation.set(0, yaw, 0);
    DUMMY.scale.setScalar(1);
    DUMMY.updateMatrix();

    const isVan = car.kind === 'van';
    for (const mesh of this.meshes) mesh.setMatrixAt(index, isVan ? HIDDEN : DUMMY.matrix);
    for (const mesh of this.vanMeshes) mesh.setMatrixAt(index, isVan ? DUMMY.matrix : HIDDEN);

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

