import * as THREE from 'three';
import { softDotTexture } from './textures.js';

const DUST_LIGHT = new THREE.Color(0xd2bc96);
const SMOKE = new THREE.Color(0xc8c8c6);

/**
 * Small moving life: birds on the wing, fireflies at night, exhaust off the
 * car and spray off the tyres.
 *
 * All four are Points systems with hand-rolled motion rather than a generic
 * particle engine — each wants genuinely different behaviour, and a shared
 * abstraction would cost more than it saved at this size.
 */
export class Atmosphere {
  constructor(scene, tier) {
    const scale = tier.hazeMotes / 600;
    this._buildBirds(scene, Math.max(9, Math.round(18 * scale)));
    this._buildFireflies(scene, Math.max(24, Math.round(90 * scale)));
    this._buildExhaust(scene, Math.max(20, Math.round(60 * scale)));
    this._buildSpray(scene, Math.max(30, Math.round(110 * scale)));
    this._buildDust(scene, Math.max(48, Math.round(170 * scale)));
  }

  _points(scene, count, { size, color, opacity = 0, blending = THREE.NormalBlending }) {
    const positions = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);

    const material = new THREE.PointsMaterial({
      color,
      map: softDotTexture(),
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity,
      depthWrite: false,
      blending,
      fog: true,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);
    return { points, geometry, material, positions, count };
  }

  /** A loose skein crossing the sky, well ahead and above. */
  _buildBirds(scene, count) {
    this.birds = this._points(scene, count, { size: 1.6, color: 0x2a2a30 });
    this.birdPhase = new Float32Array(count);
    for (let i = 0; i < count; i++) this.birdPhase[i] = Math.random() * Math.PI * 2;
  }

  _buildFireflies(scene, count) {
    this.flies = this._points(scene, count, {
      size: 0.5,
      color: 0x9dff9a,
      blending: THREE.AdditiveBlending,
    });
    this.flySeed = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) this.flySeed[i] = Math.random() * Math.PI * 2;
  }

  _buildExhaust(scene, count) {
    this.exhaust = this._points(scene, count, { size: 0.5, color: 0xb4b4b0 });
    this.exhaustAge = new Float32Array(count);
    for (let i = 0; i < count; i++) this.exhaustAge[i] = Math.random();
  }

  _buildSpray(scene, count) {
    this.spray = this._points(scene, count, { size: 0.34, color: 0xdfe6ec });
    this.sprayAge = new Float32Array(count);
    for (let i = 0; i < count; i++) this.sprayAge[i] = Math.random();
  }

  /** Dust off a gravel road, or tyre smoke off a hard one: one cloud, two colours. */
  _buildDust(scene, count) {
    this.dust = this._points(scene, count, { size: 1.6, color: 0xb59a74 });
    this.dustAge = new Float32Array(count);
    for (let i = 0; i < count; i++) this.dustAge[i] = Math.random();
  }

  update(state) {
    const live = state.live;
    this._updateBirds(state, live);
    this._updateFireflies(state, live);
    this._updateExhaust(state, live);
    this._updateSpray(state, live);
    this._updateDust(state, live);
  }

  /**
   * Birds only fly in weather birds fly in — clear-ish air, daylight, and not
   * in a gale. The condition is as much of the effect as the motion is.
   */
  _updateBirds(state, live) {
    const calm = 1 - Math.min(1, live.rain + live.drift + Math.max(0, live.wind - 0.4));
    const day = 1 - live.lampIntensity;
    const amount = calm * day;
    this.birds.points.visible = amount > 0.15;
    if (!this.birds.points.visible) return;

    const { positions, count, geometry, material } = this.birds;
    const t = state.time;
    for (let i = 0; i < count; i++) {
      const phase = this.birdPhase[i];
      // A slow V drifting across, cycling on a long loop.
      const cycle = (t * 0.045 + i * 0.017) % 1;
      const lane = Math.floor(i / 6);
      positions[i * 3] = -180 + cycle * 360 + (i % 6) * 7 - lane * 4;
      positions[i * 3 + 1] = 46 + lane * 9 + Math.sin(t * 1.6 + phase) * 1.6;
      positions[i * 3 + 2] = -190 - lane * 40 - (i % 6) * 6;
    }
    geometry.attributes.position.needsUpdate = true;
    material.opacity = amount * 0.8;
  }

  _updateFireflies(state, live) {
    // Only where the set is actually glowing, only at night, and never in a
    // city — neon is not bioluminescence.
    const amount = Math.min(1, live.propEmissive * live.lampIntensity) * (1 - Math.min(1, live.lightPollution * 1.5));
    this.flies.points.visible = amount > 0.1 && live.starOpacity > 0.3;
    if (!this.flies.points.visible) return;

    const { positions, count, geometry, material } = this.flies;
    const t = state.time;
    for (let i = 0; i < count; i++) {
      const a = this.flySeed[i * 3];
      const b = this.flySeed[i * 3 + 1];
      const c = this.flySeed[i * 3 + 2];
      positions[i * 3] = Math.sin(t * 0.3 + a) * 26 + Math.sin(t * 1.1 + b) * 1.6;
      positions[i * 3 + 1] = 1.4 + Math.abs(Math.sin(t * 0.45 + b)) * 3.4;
      positions[i * 3 + 2] = -8 - ((i * 2.7 + t * 3) % 90);
    }
    geometry.attributes.position.needsUpdate = true;
    // Individual blink is impossible without a custom shader; a collective
    // pulse still reads as insects rather than as dust.
    material.opacity = amount * (0.55 + 0.45 * Math.sin(t * 2.1)) * 0.8;
    material.color.copy(live.propE);
  }

  /** A short plume off the back, thicker when cold and when working harder. */
  _updateExhaust(state, live) {
    const cold = 0.35 + live.groundTintStrength * 0.5 + (1 - live.lightDamp) * 0.2;
    const amount = Math.min(1, cold * (0.4 + state.speed / 60));
    this.exhaust.points.visible = amount > 0.12;
    if (!this.exhaust.points.visible) return;

    const { positions, count, geometry, material } = this.exhaust;
    const rate = state.dt * 0.75;
    for (let i = 0; i < count; i++) {
      let age = this.exhaustAge[i] + rate;
      if (age > 1) age -= 1;
      this.exhaustAge[i] = age;
      // Emitted at the tailpipe, blown straight back and spreading as it goes.
      const spread = age * age * 3.4;
      positions[i * 3] = (i % 2 ? 0.55 : -0.55) + Math.sin(i * 3.1 + age * 6) * spread;
      positions[i * 3 + 1] = 0.55 + age * 2.2 + Math.cos(i * 2.3) * spread * 0.3;
      positions[i * 3 + 2] = 2.5 + age * 26;
    }
    geometry.attributes.position.needsUpdate = true;
    material.opacity = amount * 0.22;
    material.size = 0.5 + amount * 0.7;
  }

  /**
   * Thrown up by the rear wheels. It billows backwards and up, spreads wider
   * the more the car is sliding, and takes the colour of the ground it was
   * kicked off (or, on tarmac, the grey of burnt rubber).
   */
  _updateDust(state, live) {
    const amount = Math.min(1, Math.max(state.spray ?? 0, state.smoke ?? 0));
    this.dust.points.visible = amount > 0.06;
    if (!this.dust.points.visible) return;

    const { positions, count, geometry, material } = this.dust;
    const slip = state.slip ?? 0;
    const side = Math.sign(state.slide || 0);
    const rate = state.dt * (0.55 + amount * 0.5);
    for (let i = 0; i < count; i++) {
      let age = this.dustAge[i] + rate;
      if (age > 1) age -= 1;
      this.dustAge[i] = age;
      const wheel = i % 2 ? 1 : -1;
      const spread = age * (0.8 + slip * 3.2);
      positions[i * 3] = state.lateral + wheel * 0.9 + Math.sin(i * 4.7) * spread - side * age * slip * 2.5;
      positions[i * 3 + 1] = 0.25 + age * (0.9 + amount * 1.9) + Math.abs(Math.cos(i * 1.9)) * age * 0.8;
      positions[i * 3 + 2] = 1.7 + age * (7 + state.speed * 0.5);
    }
    geometry.attributes.position.needsUpdate = true;
    // Fades in, then out: a puff, not a trail of dots.
    material.opacity = amount * 0.34;
    material.size = 1.2 + amount * 2.1 + slip * 0.8;
    const hard = 1 - (state.dirt ?? 0);
    material.color.copy(live.groundColor).lerp(DUST_LIGHT, 0.42).lerp(SMOKE, hard);
  }

  /** Wheel spray — only on a wet road, and only while actually moving. */
  _updateSpray(state, live) {
    const wet = Math.max(live.rain, 1 - live.roadRoughness);
    const amount = Math.min(1, wet * (state.speed / 34));
    this.spray.points.visible = amount > 0.15;
    if (!this.spray.points.visible) return;

    const { positions, count, geometry, material } = this.spray;
    const rate = state.dt * 2.6;
    for (let i = 0; i < count; i++) {
      let age = this.sprayAge[i] + rate;
      if (age > 1) age -= 1;
      this.sprayAge[i] = age;
      const wheel = i % 4;
      const x = (wheel < 2 ? -1 : 1) * 1.0 + state.lateral;
      positions[i * 3] = x + Math.sin(i * 5.3) * age * 1.3;
      positions[i * 3 + 1] = 0.15 + age * 1.5;
      positions[i * 3 + 2] = 1.5 + age * 14;
    }
    geometry.attributes.position.needsUpdate = true;
    material.opacity = amount * 0.3;
    material.color.copy(live.precipColor);
  }
}
