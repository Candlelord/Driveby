import * as THREE from 'three';
import { buildCarParts, WHEEL_RADIUS } from './carGeometry.js';
import { beamTexture } from './textures.js';

const AHEAD = new THREE.Vector3();
const HERE = new THREE.Vector3();

/**
 * The player's car, and its lights.
 *
 * The purchased low-poly model swaps in for the geometry later; nothing outside
 * this file touches the meshes, only `group.position` / `group.rotation`.
 */
export class Car {
  constructor(scene, { realShadow = false, headlamps = 2 } = {}) {
    this.group = new THREE.Group();
    this.realShadow = realShadow;
    this.headlampCount = headlamps;
    scene.add(this.group);

    const parts = buildCarParts();

    this.bodyMaterial = flat(0xc4503c, 0.55, 0.15);
    this.darkMaterial = flat(0x181b20, 0.7, 0.1);
    this.glassMaterial = flat(0x1e2630, 0.25, 0.4);
    this.tyreMaterial = flat(0x141619, 0.95, 0);

    for (const [geometry, material] of [
      [parts.body, this.bodyMaterial],
      [parts.dark, this.darkMaterial],
      [parts.glass, this.glassMaterial],
    ]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = realShadow;
      this.group.add(mesh);
    }

    // Unlit materials, driven above 1.0 at night so bloom has something to grab.
    this.headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3d4 });
    this.taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a18 });
    this.group.add(new THREE.Mesh(parts.heads, this.headlightMaterial));
    this.group.add(new THREE.Mesh(parts.tails, this.taillightMaterial));

    this._buildWheels(parts.wheel);
    this._buildShadow();
    this._buildLights();

    this.spin = 0;
  }

  _buildWheels(geometry) {
    this.wheels = [];
    for (const [x, z, steers] of [
      [-0.92, -1.42, true],
      [0.92, -1.42, true],
      [-0.92, 1.46, false],
      [0.92, 1.46, false],
    ]) {
      const wheel = new THREE.Mesh(geometry, this.tyreMaterial);
      wheel.castShadow = this.realShadow;
      wheel.position.set(x, WHEEL_RADIUS, z);
      wheel.rotation.order = 'YXZ';
      wheel.userData.steers = steers;
      this.group.add(wheel);
      this.wheels.push(wheel);
    }
  }

  _buildShadow() {
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.75, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
      })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.scale.z = 1.5;
    this.group.add(this.shadow);
  }

  /**
   * Real lights, plus one cheat for the air.
   *
   * The lamps are actual SpotLights, so the road, the verge and anything
   * standing in the beam are genuinely lit by the car — drive past a fence at
   * night and it brightens as it enters the cone and falls away behind. An
   * additive quad could never do that, which is exactly why the old one read
   * as a decal painted on the tarmac.
   *
   * Falloff is art-directed rather than physical: real 1/d² dies inside ten
   * metres and leaves the road ahead black, so `DECAY` is well under 2 and the
   * cone carries far enough to actually show you where you are going.
   *
   * The beams are flat wedges at lamp height that only come up when there is
   * something in the air to scatter off, so clear nights stay clean and fog
   * gets shafts. That one stays a cheat — volumetrics are not worth a phone.
   */
  _buildLights() {
    this.lamps = [];
    // One lamp sits on the centreline; two straddle it as a real car does.
    const xs = this.headlampCount >= 2 ? [-LAMP_X, LAMP_X] : [0];
    for (const x of xs) {
      const light = new THREE.SpotLight(0xfff0d0, 0, LAMP_RANGE, LAMP_ANGLE, 0.75, DECAY);
      light.position.set(x, LAMP_Y, -2.15);
      // A spot aims at its target's world position, so the target has to be a
      // child of the car too or the beam swings loose as the car moves.
      light.target.position.set(x * 0.35, 0.1, -LAMP_REACH);
      this.group.add(light, light.target);
      this.lamps.push(light);
    }

    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff0d0,
      map: beamTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });

    const beamGeometry = buildBeamQuad();
    this.beams = [];
    for (const x of [-0.66, 0.66]) {
      const beam = new THREE.Mesh(beamGeometry, this.beamMaterial);
      beam.position.set(x, 0.88, -2.4);
      beam.scale.set(7, 1, 16);
      beam.renderOrder = 2;
      this.group.add(beam);
      this.beams.push(beam);
    }
  }

  update(state, frame) {
    // Pitch to match the slope of the road just ahead of the bumper.
    frame.point(state.travelled + 6, state.lateral, 0, AHEAD);
    frame.point(state.travelled, state.lateral, 0, HERE);
    const pitch = Math.atan2(AHEAD.y - HERE.y, 6);

    // Suspension bob and body roll both come from the physics model now.
    this.group.position.set(state.lateral, HERE.y + state.bob, 0);
    this.group.rotation.set(pitch, -state.steer * 0.1, state.roll);

    this.spin -= (state.speed / WHEEL_RADIUS) * state.dt;
    for (const wheel of this.wheels) {
      wheel.rotation.x = this.spin;
      if (wheel.userData.steers) wheel.rotation.y = state.steer * 0.35;
    }

    const live = state.live;
    const on = live.headlights;

    this.headlightMaterial.color.setRGB(1, 0.94, 0.8).multiplyScalar(0.35 + on * 1.5);
    this.taillightMaterial.color.setRGB(1, 0.28, 0.12).multiplyScalar(1.05 + on * 0.7);
    // With a real shadow map the blob is just a faint contact patch under the
    // sills; without one it carries the whole grounding job as before.
    const blob = this.realShadow ? 0.35 : 1;
    this.shadow.material.opacity = (0.08 + 0.22 * (1 - live.lampIntensity)) * blob;

    // The lamps take the mood's colour so a neon night reads cooler than a
    // country one, but stay mostly tungsten — headlights are not mood lighting.
    BEAM.copy(live.lampColor).lerp(WARM, 0.6);
    // Two lamps each carry half the light, so the road looks the same however
    // many the device can afford. Note this rides `beamThrow`, not `headlights`
    // — the lenses glow whenever the lamps are on, but the beam only lands on
    // the road once the road is darker than the beam.
    const paints = live.beamThrow;
    const each = (LAMP_POWER / this.lamps.length) * paints;
    for (const lamp of this.lamps) {
      lamp.color.copy(BEAM);
      lamp.intensity = each;
      lamp.visible = paints > 0.02;
      // Aim where the wheels are pointed. A headlight that does not sweep
      // through a corner is the giveaway that it is painted on.
      lamp.target.position.x = lamp.position.x * 0.35 - state.steer * LAMP_SWEEP;
    }

    this.beamMaterial.color.copy(BEAM);
    this.beamMaterial.opacity = live.beamStrength * 0.3;
    for (const beam of this.beams) beam.visible = live.beamStrength > 0.02;

    // Beams swing with the front wheels.
    const swing = state.steer * 0.12;
    for (const beam of this.beams) beam.rotation.y = swing;
  }
}

const WARM = new THREE.Color(0xfff0d0);
const BEAM = new THREE.Color();

// Headlamp geometry and falloff. `LAMP_POWER` is in three's candela-ish units
// and was measured against rendered road brightness rather than guessed —
// standard materials divide diffuse irradiance by π, so the number that looks
// right is several times larger than it reads.
const LAMP_X = 0.62;
const LAMP_Y = 0.72;
const LAMP_ANGLE = 0.44; // radians, half-angle of the cone
const LAMP_RANGE = 78; // hard cutoff, so distant geometry costs nothing
const LAMP_REACH = 34; // how far up the road the cone is aimed
const LAMP_SWEEP = 9; // lateral travel of the aim point at full lock
// Flatter than physical (2.0) on purpose: at true inverse-square the pool dies
// about fifteen metres out and the road beyond it is black, which is neither
// useful to drive by nor what a headlight looks like from behind the car.
const DECAY = 0.85;
const LAMP_POWER = 380;

/**
 * A unit quad lying flat, running from the lamp at z = 0 to z = -1 ahead, with
 * UVs written by hand: v = 0 at the lamp end so it lines up with the beam
 * texture's narrow end. Built explicitly rather than by rotating a
 * PlaneGeometry, so the one rotation the mesh does carry (steering swing) is
 * unambiguous.
 */
function buildBeamQuad() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 0, -1, -0.5, 0, -1], 3)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

function flat(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  });
}
