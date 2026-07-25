import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const AHEAD = new THREE.Vector3();
const HERE = new THREE.Vector3();

const WHEEL_RADIUS = 0.44;

/**
 * Placeholder vehicle — a late-70s wedge coupe in boxes, no external asset.
 *
 * Built as a parts list and merged down to one geometry per material, so the
 * silhouette can gain detail without gaining draw calls. The purchased low-poly
 * model swaps in here later; nothing outside this file touches the meshes, only
 * `group.position` / `group.rotation`.
 */
export class Car {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.bodyMaterial = flat(0xc4503c, 0.55, 0.15);
    this.darkMaterial = flat(0x181b20, 0.7, 0.1);
    this.glassMaterial = flat(0x1e2630, 0.25, 0.4);
    this.tyreMaterial = flat(0x141619, 0.95, 0);

    const body = [];
    const dark = [];
    const glass = [];

    // --- main volumes. Forward is -Z.
    body.push(box(2.02, 0.46, 4.6, 0, 0.66, 0)); // sill-to-waist slab
    body.push(box(1.9, 0.3, 1.85, 0, 0.99, -1.32)); // bonnet
    body.push(box(1.88, 0.34, 1.25, 0, 1.01, 1.63)); // boot deck
    body.push(wedge(1.96, 0.26, 1.5, 0.62, 0, 0.86, -2.0)); // nose taper

    // Greenhouse: dark glass band with a body-coloured roof over it reads as a
    // cabin far better than one tinted box.
    glass.push(wedge(1.78, 0.52, 2.2, 0.84, 0, 1.35, 0.12));
    body.push(wedge(1.5, 0.16, 1.62, 0.94, 0, 1.68, 0.34)); // roof
    body.push(box(0.14, 0.5, 1.9, -0.88, 1.34, 0.2)); // left B-pillar run
    body.push(box(0.14, 0.5, 1.9, 0.88, 1.34, 0.2)); // right B-pillar run

    // --- trim
    dark.push(box(1.94, 0.2, 3.5, 0, 0.44, 0.05)); // side skirt shadow
    dark.push(box(2.06, 0.24, 0.26, 0, 0.62, -2.28)); // front bumper
    dark.push(box(2.06, 0.24, 0.26, 0, 0.66, 2.28)); // rear bumper
    dark.push(box(1.7, 0.12, 0.12, 0, 1.05, 2.22)); // boot lip spoiler
    for (const x of [-1.0, 1.0]) {
      dark.push(box(0.16, 0.44, 1.0, x, 0.6, -1.45)); // front arch
      dark.push(box(0.16, 0.44, 1.05, x, 0.6, 1.5)); // rear arch
      dark.push(box(0.1, 0.14, 0.34, x * 0.98, 1.24, -0.62)); // mirror
    }

    this.group.add(new THREE.Mesh(mergeGeometries(body), this.bodyMaterial));
    this.group.add(new THREE.Mesh(mergeGeometries(dark), this.darkMaterial));
    this.group.add(new THREE.Mesh(mergeGeometries(glass), this.glassMaterial));

    this._buildLights();
    this._buildWheels();
    this._buildShadow();

    this.spin = 0;
  }

  _buildLights() {
    // Unlit materials, driven above 1.0 at night so bloom has something to grab.
    this.headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3d4 });
    this.taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a18 });

    const heads = [];
    const tails = [];
    for (const x of [-0.66, 0.66]) {
      heads.push(box(0.46, 0.16, 0.08, x, 0.92, -2.32));
      tails.push(box(0.42, 0.15, 0.08, x, 0.92, 2.33));
    }
    tails.push(box(1.14, 0.06, 0.06, 0, 0.92, 2.34)); // connecting light bar

    this.group.add(new THREE.Mesh(mergeGeometries(heads), this.headlightMaterial));
    this.group.add(new THREE.Mesh(mergeGeometries(tails), this.taillightMaterial));
  }

  _buildWheels() {
    this.wheels = [];

    const tyre = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.32, 14);
    tyre.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(WHEEL_RADIUS * 0.5, WHEEL_RADIUS * 0.5, 0.34, 8);
    hub.rotateZ(Math.PI / 2);
    hub.translate(0.01, 0, 0);
    const geometry = mergeGeometries([tyre, hub]);

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

    // Lamps come up with the world's, and overdrive into bloom at night.
    const night = state.live.lampIntensity;
    this.headlightMaterial.color.setRGB(1, 0.94, 0.8).multiplyScalar(0.35 + night * 1.3);
    this.taillightMaterial.color.setRGB(1, 0.16, 0.1).multiplyScalar(0.55 + night * 0.75);
    this.shadow.material.opacity = 0.08 + 0.22 * (1 - night);
  }
}

// --- geometry helpers. Every part is positioned in geometry space so the whole
// --- car can be merged into one mesh per material.

function box(width, height, depth, x, y, z) {
  return new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
}

/**
 * A box with its top face pulled in and pushed back — the difference between a
 * cabin and a shoebox, for four lines of vertex fiddling.
 */
function wedge(width, height, depth, topScale, x, y, z) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0) {
      position.setX(i, position.getX(i) * topScale);
      position.setZ(i, position.getZ(i) * topScale + depth * 0.12);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry.translate(x, y, z);
}

function flat(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  });
}
