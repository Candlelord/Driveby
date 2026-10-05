import * as THREE from 'three';
import { buildCarParts, WHEEL_RADIUS, FRONT_AXLE, REAR_AXLE, TRACK } from './carGeometry.js';
import { beamTexture } from './textures.js';
import { loadGltf, tuneModel, materialsNamed, nodeNamed, nodesMatching, mountWheel, cloneModel } from './models.js';
import { CAR_MODELS, DEFAULT_CAR } from './carModels.js';

const AHEAD = new THREE.Vector3();
const HERE = new THREE.Vector3();

/**
 * The player's car, and its lights.
 *
 * The purchased low-poly model swaps in for the geometry later; nothing outside
 * this file touches the meshes, only `group.position` / `group.rotation`.
 */
export class Car {
  constructor(scene, { realShadow = false, headlamps = 2, model = DEFAULT_CAR } = {}) {
    this.group = new THREE.Group();
    this.realShadow = realShadow;
    this.headlampCount = headlamps;
    scene.add(this.group);

    const parts = buildCarParts();
    // Everything the procedural car is made of, so a real model can replace it.
    this.proceduralParts = [];

    const materials = carMaterials(0xa3201a);
    this.bodyMaterial = materials.body;
    this.darkMaterial = materials.dark;
    this.glassMaterial = materials.glass;
    this.chromeMaterial = materials.chrome;
    this.tyreMaterial = materials.tyre;
    this.plateMaterial = materials.plate;

    for (const [geometry, material] of [
      [parts.body, this.bodyMaterial],
      [parts.dark, this.darkMaterial],
      [parts.glass, this.glassMaterial],
      [parts.chrome, this.chromeMaterial],
      [parts.plate, this.plateMaterial],
    ]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = realShadow;
      mesh.receiveShadow = realShadow;
      this.group.add(mesh);
      this.proceduralParts.push(mesh);
    }

    // Unlit materials, driven above 1.0 at night so bloom has something to grab.
    this.headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3d4 });
    this.taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a18 });
    for (const geometry of [parts.heads, parts.tails]) {
      const mesh = new THREE.Mesh(geometry, geometry === parts.heads ? this.headlightMaterial : this.taillightMaterial);
      this.group.add(mesh);
      this.proceduralParts.push(mesh);
    }

    this._buildWheels(parts.wheel);
    this._buildShadow();
    this._buildLights();

    this.spin = 0;
    this.model = null;
    this.paint = null;
    this.modelId = null;
    // The real car arrives when it arrives; until then (or if it never does)
    // the procedural one drives.
    this.setModel(model);
  }

  /** Switch to one of CAR_MODELS (a garage choice). Resolves once it is on the road. */
  setModel(id, paint = null) {
    const def = CAR_MODELS[id] ?? CAR_MODELS[DEFAULT_CAR];
    this.modelId = def.id;
    this.def = def;
    this.paint = paint ?? this.paint ?? def.paints[0];
    this._ticket = (this._ticket ?? 0) + 1;
    const ticket = this._ticket;
    return loadGltf(def.model)
      .then((gltf) => {
        if (ticket === this._ticket) this._useModel(gltf.scene, def);
      })
      .catch(() => {});
  }

  /** Swap the procedural car (or the previous model) for the loaded one. */
  _useModel(scene, def) {
    if (this.model) {
      this.group.remove(this.model.group);
      this.model = null;
    }
    const root = tuneModel(cloneModel(scene), { shadows: this.realShadow });
    root.rotation.y = def.yaw;
    const model = new THREE.Group();
    model.add(root);
    model.updateMatrixWorld(true);

    // Wheels: named nodes, or a pattern. Front or rear is read off where the
    // wheel sits once the model has been turned to face -Z.
    const nodes = Array.isArray(def.wheels)
      ? def.wheels.map((name) => nodeNamed(root, name)).filter(Boolean)
      : nodesMatching(root, def.wheels);
    const here = new THREE.Vector3();
    const wheels = nodes.map((node) => {
      node.getWorldPosition(here);
      const steers = here.z < 0;
      return { ...mountWheel(node, model), steers, node };
    });

    // Sit the tyres on the road: the model's lowest point is the ground.
    model.updateMatrixWorld(true);
    model.position.y = -new THREE.Box3().setFromObject(root).min.y;

    for (const part of this.proceduralParts) part.visible = false;
    for (const wheel of this.wheels) wheel.visible = false;
    this.group.add(model);

    this.model = {
      group: model,
      wheels,
      paint: materialsNamed(root, def.paint),
      accent: def.accent ? materialsNamed(root, def.accent) : [],
      head: materialsNamed(root, def.head),
      tail: materialsNamed(root, def.tail),
    };
    // Lamp textures carry the glow too, so the same map drives the emissive.
    for (const lamp of [...this.model.head, ...this.model.tail]) {
      if (lamp.map) {
        lamp.emissive.set(0xffffff);
        lamp.emissiveMap = lamp.map;
        lamp.needsUpdate = true;
      }
    }
    this.setPaint(this.paint);
  }

  /** Change the car's paint (a hex colour). */
  setPaint(hex) {
    this.paint = hex;
    this.bodyMaterial.color.set(hex);
    if (this.model) for (const m of this.model.paint) m.color.set(hex);
  }

  _buildWheels({ tyre, rim }) {
    this.wheels = [];
    for (const [x, z, steers] of [
      [-TRACK, FRONT_AXLE, true],
      [TRACK, FRONT_AXLE, true],
      [-TRACK, REAR_AXLE, false],
      [TRACK, REAR_AXLE, false],
    ]) {
      // Steering yaws the outer group; the spin happens on the inner one, so
      // the two rotations never fight over Euler order.
      const wheel = new THREE.Group();
      wheel.position.set(x, WHEEL_RADIUS, z);
      const spinner = new THREE.Group();
      // Geometry is authored with its face outward on +X; mirror the left side.
      spinner.scale.x = x < 0 ? -1 : 1;
      const tyreMesh = new THREE.Mesh(tyre, this.tyreMaterial);
      const rimMesh = new THREE.Mesh(rim, this.chromeMaterial);
      tyreMesh.castShadow = rimMesh.castShadow = this.realShadow;
      spinner.add(tyreMesh, rimMesh);
      wheel.add(spinner);
      wheel.userData.steers = steers;
      wheel.userData.spinner = spinner;
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
    this.group.rotation.set(pitch, -state.steer * 0.1 + (state.impactYaw ?? 0), state.roll);

    this.spin -= (state.speed / WHEEL_RADIUS) * state.dt;
    for (const wheel of this.wheels) {
      wheel.userData.spinner.rotation.x = this.spin;
      if (wheel.userData.steers) wheel.rotation.y = state.steer * 0.35;
    }
    if (this.model) {
      for (const wheel of this.model.wheels) {
        wheel.spin(this.spin);
        if (wheel.steers) wheel.pivot.rotation.y = state.steer * 0.35;
      }
    }

    const live = state.live;
    const on = live.headlights;

    if (this.model) {
      for (const m of this.model.head) m.emissiveIntensity = 0.5 + on * 3.2;
      for (const m of this.model.tail) m.emissiveIntensity = 0.7 + on * 2.6;
    }
    this.headlightMaterial.color.setRGB(1, 0.94, 0.8).multiplyScalar(0.35 + on * 1.5);
    this.taillightMaterial.color.setRGB(1, 0.05, 0.025).multiplyScalar(0.5 + on * 2.4);
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

/**
 * Automotive materials, shared with traffic.
 *
 * The paint is the one that sells it: a metallic base under a glossy clearcoat
 * gives the two-layer look of real car paint — a soft coloured sheen from the
 * flake, with sharp sky reflections sliding over the top. Glass is near-black
 * and almost mirror-smooth, so the windows are mostly reflection, as they are
 * on a real car seen from outside in daylight.
 */
export function carMaterials(paint) {
  return {
    body: new THREE.MeshPhysicalMaterial({
      color: paint,
      metalness: 0.45,
      roughness: 0.42,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.1,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x0c0d10,
      roughness: 0.45,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x05070a,
      roughness: 0.03,
      metalness: 0,
      ior: 1.52,
      specularIntensity: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.4,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xc6cad0,
      roughness: 0.22,
      metalness: 1,
      side: THREE.DoubleSide,
    }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.88, metalness: 0 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xe9e7df, roughness: 0.4, metalness: 0.1 }),
  };
}
