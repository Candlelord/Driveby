import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { softDotTexture } from './textures.js';

const RAIN_BOX = { x: 42, yMin: -2, yMax: 28, zNear: 22, zFar: -150 };
const DUST_BOX = { x: 38, yMin: 0, yMax: 16, zNear: 20, zFar: -130 };

const RAIN_FALL_SPEED = 62;
const STREAK = new THREE.Vector3(0, -1, 0.42).normalize();

/**
 * Rain and dust, both living in car-local space (the car never actually moves,
 * so a fixed box around the origin is all the volume that's needed).
 *
 * Amounts come from the blended mood profile, so weather crossfades along with
 * everything else: streak count and opacity ramp instead of switching on.
 */
export class Weather {
  constructor(scene) {
    this._buildRain(scene);
    this._buildDust(scene);
  }

  _buildRain(scene) {
    const count = CONFIG.maxRainStreaks;
    this.rainCount = count;
    this.rainSeeds = new Float32Array(count * 3);
    this.rainPositions = new Float32Array(count * 6); // two endpoints per streak

    for (let i = 0; i < count; i++) {
      this.rainSeeds[i * 3] = randomRange(-RAIN_BOX.x, RAIN_BOX.x);
      this.rainSeeds[i * 3 + 1] = randomRange(RAIN_BOX.yMin, RAIN_BOX.yMax);
      this.rainSeeds[i * 3 + 2] = randomRange(RAIN_BOX.zFar, RAIN_BOX.zNear);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });

    this.rainGeometry = geometry;
    this.rain = new THREE.LineSegments(geometry, this.rainMaterial);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
  }

  _buildDust(scene) {
    const count = CONFIG.maxDustMotes;
    this.dustCount = count;
    this.dustPositions = new Float32Array(count * 3);
    this.dustDrift = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.dustPositions[i * 3] = randomRange(-DUST_BOX.x, DUST_BOX.x);
      this.dustPositions[i * 3 + 1] = randomRange(DUST_BOX.yMin, DUST_BOX.yMax);
      this.dustPositions[i * 3 + 2] = randomRange(DUST_BOX.zFar, DUST_BOX.zNear);
      this.dustDrift[i * 3] = randomRange(-1.2, 1.2);
      this.dustDrift[i * 3 + 1] = randomRange(-0.5, 0.9);
      this.dustDrift[i * 3 + 2] = randomRange(-0.8, 0.8);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

    this.dustMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      // Untextured points render as hard squares, which reads as glitching
      // rather than mist. A generated soft dot keeps it in-style without
      // introducing an image asset.
      map: softDotTexture(),
      size: 1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });

    this.dustGeometry = geometry;
    this.dust = new THREE.Points(geometry, this.dustMaterial);
    this.dust.frustumCulled = false;
    this.dust.visible = false;
    scene.add(this.dust);
  }

  update(state) {
    const live = state.live;
    this._updateRain(state, live);
    this._updateDust(state, live);
  }

  _updateRain(state, live) {
    const amount = live.rain;
    this.rain.visible = amount > 0.01;
    if (!this.rain.visible) return;

    const active = Math.max(1, Math.round(this.rainCount * Math.min(1, amount)));
    const drop = RAIN_FALL_SPEED * state.dt;
    // Forward travel smears the streaks out behind the car.
    const length = 1.6 + state.speed * 0.045;
    const drift = state.speed * state.dt * 0.55;
    const height = RAIN_BOX.yMax - RAIN_BOX.yMin;
    const depth = RAIN_BOX.zNear - RAIN_BOX.zFar;

    for (let i = 0; i < active; i++) {
      const si = i * 3;
      let y = this.rainSeeds[si + 1] - drop;
      let z = this.rainSeeds[si + 2] + drift;
      if (y < RAIN_BOX.yMin) y += height;
      if (z > RAIN_BOX.zNear) z -= depth;
      this.rainSeeds[si + 1] = y;
      this.rainSeeds[si + 2] = z;

      const x = this.rainSeeds[si];
      const pi = i * 6;
      this.rainPositions[pi] = x;
      this.rainPositions[pi + 1] = y;
      this.rainPositions[pi + 2] = z;
      this.rainPositions[pi + 3] = x + STREAK.x * length;
      this.rainPositions[pi + 4] = y + STREAK.y * length;
      this.rainPositions[pi + 5] = z + STREAK.z * length;
    }

    this.rainGeometry.setDrawRange(0, active * 2);
    this.rainGeometry.attributes.position.needsUpdate = true;
    this.rainMaterial.color.copy(live.rainColor);
    this.rainMaterial.opacity = Math.min(1, amount) * 0.55;
  }

  _updateDust(state, live) {
    const amount = live.dust;
    this.dust.visible = amount > 0.01;
    if (!this.dust.visible) return;

    const active = Math.max(1, Math.round(this.dustCount * Math.min(1, amount)));
    const drift = state.speed * state.dt * 0.35;
    const height = DUST_BOX.yMax - DUST_BOX.yMin;
    const depth = DUST_BOX.zNear - DUST_BOX.zFar;

    for (let i = 0; i < active; i++) {
      const pi = i * 3;
      let x = this.dustPositions[pi] + this.dustDrift[pi] * state.dt;
      let y = this.dustPositions[pi + 1] + this.dustDrift[pi + 1] * state.dt;
      let z = this.dustPositions[pi + 2] + this.dustDrift[pi + 2] * state.dt + drift;

      if (x > DUST_BOX.x) x -= DUST_BOX.x * 2;
      if (x < -DUST_BOX.x) x += DUST_BOX.x * 2;
      if (y > DUST_BOX.yMax) y -= height;
      if (y < DUST_BOX.yMin) y += height;
      if (z > DUST_BOX.zNear) z -= depth;

      this.dustPositions[pi] = x;
      this.dustPositions[pi + 1] = y;
      this.dustPositions[pi + 2] = z;
    }

    this.dustGeometry.setDrawRange(0, active);
    this.dustGeometry.attributes.position.needsUpdate = true;
    this.dustMaterial.color.copy(live.dustColor);
    this.dustMaterial.size = live.dustSize;
    this.dustMaterial.opacity = Math.min(1, amount) * 0.4;
  }
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

