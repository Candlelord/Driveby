import * as THREE from 'three';
import { buildCarParts, WHEEL_RADIUS } from './carGeometry.js';
import { softDotTexture, beamTexture } from './textures.js';

const AHEAD = new THREE.Vector3();
const HERE = new THREE.Vector3();

/**
 * The player's car, and its lights.
 *
 * The purchased low-poly model swaps in for the geometry later; nothing outside
 * this file touches the meshes, only `group.position` / `group.rotation`.
 */
export class Car {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const parts = buildCarParts();

    this.bodyMaterial = flat(0xc4503c, 0.55, 0.15);
    this.darkMaterial = flat(0x181b20, 0.7, 0.1);
    this.glassMaterial = flat(0x1e2630, 0.25, 0.4);
    this.tyreMaterial = flat(0x141619, 0.95, 0);

    this.group.add(new THREE.Mesh(parts.body, this.bodyMaterial));
    this.group.add(new THREE.Mesh(parts.dark, this.darkMaterial));
    this.group.add(new THREE.Mesh(parts.glass, this.glassMaterial));

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
      [-1.0, -1.45, true],
      [1.0, -1.45, true],
      [-1.0, 1.5, false],
      [1.0, 1.5, false],
    ]) {
      const wheel = new THREE.Mesh(geometry, this.tyreMaterial);
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
   * Two effects, no real light sources.
   *
   * The pool is a lit patch of road ahead of the car — the part you actually
   * read as "headlights are on". The beams are flat wedges at lamp height that
   * only come up when there is something in the air to scatter off, so clear
   * nights stay clean and fog gets shafts.
   */
  _buildLights() {
    this.poolMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff0d0,
      map: softDotTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });

    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.poolMaterial);
    this.pool.rotation.x = -Math.PI / 2;
    // Starts clear of the front bumper (z = -2.3) and reaches up the road.
    this.pool.position.set(0, 0.05, -17);
    this.pool.scale.set(7, 32, 1);
    this.pool.renderOrder = 2;
    this.group.add(this.pool);

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

    const bob = Math.sin(state.time * 6.1) * 0.012 + Math.sin(state.time * 11.3) * 0.006;

    this.group.position.set(state.lateral, HERE.y + bob, 0);
    this.group.rotation.set(pitch, -state.steer * 0.1, -state.steer * 0.055);

    this.spin -= (state.speed / WHEEL_RADIUS) * state.dt;
    for (const wheel of this.wheels) {
      wheel.rotation.x = this.spin;
      if (wheel.userData.steers) wheel.rotation.y = state.steer * 0.35;
    }

    const live = state.live;
    const on = live.headlights;

    this.headlightMaterial.color.setRGB(1, 0.94, 0.8).multiplyScalar(0.35 + on * 1.5);
    this.taillightMaterial.color.setRGB(1, 0.16, 0.1).multiplyScalar(0.55 + on * 0.8);
    this.shadow.material.opacity = 0.08 + 0.22 * (1 - live.lampIntensity);

    this.poolMaterial.color.copy(live.lampColor).lerp(WARM, 0.6);
    this.poolMaterial.opacity = on * 0.26;
    this.pool.visible = on > 0.02;

    this.beamMaterial.color.copy(this.poolMaterial.color);
    this.beamMaterial.opacity = live.beamStrength * 0.3;
    for (const beam of this.beams) beam.visible = live.beamStrength > 0.02;

    // Beams swing with the front wheels.
    const swing = state.steer * 0.12;
    for (const beam of this.beams) beam.rotation.y = swing;
  }
}

const WARM = new THREE.Color(0xfff0d0);

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
