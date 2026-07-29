import * as THREE from 'three';
import { softDotTexture } from './textures.js';

const RAIN_BOX = { x: 42, yMin: -2, yMax: 28, zNear: 22, zFar: -150 };
const SNOW_BOX = { x: 40, yMin: -1, yMax: 24, zNear: 14, zFar: -130 };
// zNear keeps motes ahead of the camera; drifting past the lens at mist sizes
// reads as a dirty lens rather than atmosphere.
const HAZE_BOX = { x: 38, yMin: 0, yMax: 16, zNear: -4, zFar: -130 };

const RAIN_FALL_SPEED = 62;

/**
 * Precipitation and haze, all living in car-local space (the car never actually
 * moves, so a fixed box around the origin is all the volume that's needed).
 *
 * Rain, snow and haze are three separate systems rather than one with a mode
 * switch, because they want genuinely different motion: rain falls hard and
 * straight, snow drifts and sways, haze barely moves at all. Amounts come from
 * the blended climate profile, so a change of weather ramps rather than cuts.
 */
export class Weather {
  constructor(scene, tier) {
    this._buildRain(scene, tier.rainStreaks);
    this._buildSnow(scene, tier.snowFlakes);
    this._buildHaze(scene, tier.hazeMotes);
  }

  _buildRain(scene, count) {
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

  _buildSnow(scene, count) {
    this.snowCount = count;
    this.snowPositions = new Float32Array(count * 3);
    this.snowPhase = new Float32Array(count * 2); // sway phase and rate

    for (let i = 0; i < count; i++) {
      this.snowPositions[i * 3] = randomRange(-SNOW_BOX.x, SNOW_BOX.x);
      this.snowPositions[i * 3 + 1] = randomRange(SNOW_BOX.yMin, SNOW_BOX.yMax);
      this.snowPositions[i * 3 + 2] = randomRange(SNOW_BOX.zFar, SNOW_BOX.zNear);
      this.snowPhase[i * 2] = Math.random() * Math.PI * 2;
      this.snowPhase[i * 2 + 1] = 0.6 + Math.random() * 1.4;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

    this.snowMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      map: softDotTexture(),
      size: 0.55,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });

    this.snowGeometry = geometry;
    this.snow = new THREE.Points(geometry, this.snowMaterial);
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    scene.add(this.snow);
  }

  _buildHaze(scene, count) {
    this.hazeCount = count;
    this.hazePositions = new Float32Array(count * 3);
    this.hazeDrift = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.hazePositions[i * 3] = randomRange(-HAZE_BOX.x, HAZE_BOX.x);
      this.hazePositions[i * 3 + 1] = randomRange(HAZE_BOX.yMin, HAZE_BOX.yMax);
      this.hazePositions[i * 3 + 2] = randomRange(HAZE_BOX.zFar, HAZE_BOX.zNear);
      this.hazeDrift[i * 3] = randomRange(-1.2, 1.2);
      this.hazeDrift[i * 3 + 1] = randomRange(-0.5, 0.9);
      this.hazeDrift[i * 3 + 2] = randomRange(-0.8, 0.8);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.hazePositions, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

    this.hazeMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      map: softDotTexture(),
      size: 1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });

    this.hazeGeometry = geometry;
    this.haze = new THREE.Points(geometry, this.hazeMaterial);
    this.haze.frustumCulled = false;
    this.haze.visible = false;
    scene.add(this.haze);
  }

  update(state) {
    const live = state.live;
    this._updateRain(state, live);
    this._updateSnow(state, live);
    this._updateHaze(state, live);
  }

  _updateRain(state, live) {
    const amount = live.rain;
    this.rain.visible = amount > 0.01;
    if (!this.rain.visible) return;

    const active = Math.max(1, Math.round(this.rainCount * Math.min(1, amount)));
    const drop = RAIN_FALL_SPEED * state.dt;

    // Forward travel and crosswind together set the streak angle, so a storm's
    // rain visibly leans while steady rain falls nearly straight.
    const length = 1.6 + state.speed * 0.045;
    const wind = live.wind;
    const dirX = wind * 0.75;
    const dirY = -1;
    const dirZ = 0.42;
    const scale = length / Math.hypot(dirX, dirY, dirZ);

    const drift = state.speed * state.dt * 0.55;
    const sideDrift = wind * 26 * state.dt;
    const height = RAIN_BOX.yMax - RAIN_BOX.yMin;
    const depth = RAIN_BOX.zNear - RAIN_BOX.zFar;
    const width = RAIN_BOX.x * 2;

    for (let i = 0; i < active; i++) {
      const si = i * 3;
      let x = this.rainSeeds[si] + sideDrift;
      let y = this.rainSeeds[si + 1] - drop;
      let z = this.rainSeeds[si + 2] + drift;
      if (x > RAIN_BOX.x) x -= width;
      if (x < -RAIN_BOX.x) x += width;
      if (y < RAIN_BOX.yMin) y += height;
      if (z > RAIN_BOX.zNear) z -= depth;
      this.rainSeeds[si] = x;
      this.rainSeeds[si + 1] = y;
      this.rainSeeds[si + 2] = z;

      const pi = i * 6;
      this.rainPositions[pi] = x;
      this.rainPositions[pi + 1] = y;
      this.rainPositions[pi + 2] = z;
      this.rainPositions[pi + 3] = x + dirX * scale;
      this.rainPositions[pi + 4] = y + dirY * scale;
      this.rainPositions[pi + 5] = z + dirZ * scale;
    }

    this.rainGeometry.setDrawRange(0, active * 2);
    this.rainGeometry.attributes.position.needsUpdate = true;
    this.rainMaterial.color.copy(live.precipColor);
    this.rainMaterial.opacity = Math.min(1, amount) * 0.5;
  }

  /**
   * Snow, ash, autumn leaves and blossom, all on one system.
   *
   * They differ only in colour, size, how fast they fall and how far they
   * wander sideways on the way down — so the climate and season layers set
   * those four and nothing here knows which of them is falling.
   */
  _updateSnow(state, live) {
    const amount = live.drift;
    this.snow.visible = amount > 0.01;
    if (!this.snow.visible) return;

    const active = Math.max(1, Math.round(this.snowCount * Math.min(1, amount)));
    const fall = live.driftFall * state.dt;
    const drift = state.speed * state.dt * 0.9;
    const wind = live.wind;
    // A leaf sways several times as far as a snowflake, which is most of what
    // tells the two apart once they are in the air.
    const swayScale = live.driftSway;
    const height = SNOW_BOX.yMax - SNOW_BOX.yMin;
    const depth = SNOW_BOX.zNear - SNOW_BOX.zFar;
    const width = SNOW_BOX.x * 2;

    for (let i = 0; i < active; i++) {
      const pi = i * 3;
      const phase = this.snowPhase[i * 2];
      const rate = this.snowPhase[i * 2 + 1];

      // Flakes sway rather than fall straight; that alone is most of what
      // separates snow from white rain.
      const sway = Math.sin(state.time * rate + phase) * 0.9 * swayScale + wind * 9;
      let x = this.snowPositions[pi] + sway * state.dt;
      let y = this.snowPositions[pi + 1] - fall;
      let z =
        this.snowPositions[pi + 2] +
        drift +
        Math.cos(state.time * rate * 0.7 + phase) * 0.4 * state.dt;

      if (x > SNOW_BOX.x) x -= width;
      if (x < -SNOW_BOX.x) x += width;
      if (y < SNOW_BOX.yMin) y += height;
      if (z > SNOW_BOX.zNear) z -= depth;

      this.snowPositions[pi] = x;
      this.snowPositions[pi + 1] = y;
      this.snowPositions[pi + 2] = z;
    }

    this.snowGeometry.setDrawRange(0, active);
    this.snowGeometry.attributes.position.needsUpdate = true;
    this.snowMaterial.color.copy(live.driftColor);
    this.snowMaterial.size = live.driftSize;
    this.snowMaterial.opacity = Math.min(1, amount) * 0.85;
  }

  _updateHaze(state, live) {
    const amount = live.haze;
    this.haze.visible = amount > 0.01;
    if (!this.haze.visible) return;

    const active = Math.max(1, Math.round(this.hazeCount * Math.min(1, amount)));
    const drift = state.speed * state.dt * 0.35;
    const wind = live.wind * 4;
    const height = HAZE_BOX.yMax - HAZE_BOX.yMin;
    const depth = HAZE_BOX.zNear - HAZE_BOX.zFar;
    const width = HAZE_BOX.x * 2;

    for (let i = 0; i < active; i++) {
      const pi = i * 3;
      let x = this.hazePositions[pi] + (this.hazeDrift[pi] + wind) * state.dt;
      let y = this.hazePositions[pi + 1] + this.hazeDrift[pi + 1] * state.dt;
      let z = this.hazePositions[pi + 2] + this.hazeDrift[pi + 2] * state.dt + drift;

      if (x > HAZE_BOX.x) x -= width;
      if (x < -HAZE_BOX.x) x += width;
      if (y > HAZE_BOX.yMax) y -= height;
      if (y < HAZE_BOX.yMin) y += height;
      if (z > HAZE_BOX.zNear) z -= depth;

      this.hazePositions[pi] = x;
      this.hazePositions[pi + 1] = y;
      this.hazePositions[pi + 2] = z;
    }

    this.hazeGeometry.setDrawRange(0, active);
    this.hazeGeometry.attributes.position.needsUpdate = true;
    this.hazeMaterial.color.copy(live.hazeColor);
    this.hazeMaterial.size = live.hazeSize;
    this.hazeMaterial.opacity = Math.min(1, amount) * 0.4;
  }
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}
