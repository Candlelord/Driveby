import * as THREE from 'three';

const AHEAD = new THREE.Vector3();
const HERE = new THREE.Vector3();

const WHEEL_RADIUS = 0.42;

/**
 * Placeholder vehicle: boxes and cylinders, flat-shaded, no external asset.
 * The purchased low-poly model swaps in here later — everything else keys off
 * `group.position` / `group.rotation`, not the mesh itself.
 */
export class Car {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const bodyMaterial = flat(0xc9553f);
    const cabinMaterial = flat(0x2b3138);
    const trimMaterial = flat(0x1a1d21);
    const tyreMaterial = flat(0x15171a);

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.56, 4.4), bodyMaterial);
    body.position.y = 0.72;
    this.group.add(body);

    const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.3, 4.0), trimMaterial);
    skirt.position.y = 0.46;
    this.group.add(skirt);

    const cabin = new THREE.Mesh(taperedBox(1.68, 0.62, 2.1, 0.78, 0.72), cabinMaterial);
    cabin.position.set(0, 1.28, 0.12);
    this.group.add(cabin);

    this.wheels = [];
    const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.34, 12);
    wheelGeometry.rotateZ(Math.PI / 2);
    for (const [x, z, steers] of [
      [-0.98, -1.45, true],
      [0.98, -1.45, true],
      [-0.98, 1.5, false],
      [0.98, 1.5, false],
    ]) {
      const wheel = new THREE.Mesh(wheelGeometry, tyreMaterial);
      wheel.position.set(x, WHEEL_RADIUS, z);
      wheel.rotation.order = 'YXZ';
      wheel.userData.steers = steers;
      this.group.add(wheel);
      this.wheels.push(wheel);
    }

    // Lamps are unlit basic materials so they read as "emitting" at night
    // without paying for real light sources.
    this.headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3d4 });
    this.taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xff3322 });

    for (const x of [-0.62, 0.62]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.1), this.headlightMaterial);
      head.position.set(x, 0.78, -2.2);
      this.group.add(head);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.1), this.taillightMaterial);
      tail.position.set(x, 0.82, 2.2);
      this.group.add(tail);
    }

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.scale.z = 1.45;
    this.group.add(shadow);
    this.shadow = shadow;

    this.spin = 0;
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

    // Headlights come up with the lamps, i.e. as the world gets dark.
    const glow = 0.25 + state.live.lampIntensity * 0.75;
    this.headlightMaterial.color.setRGB(1, 0.95, 0.83).multiplyScalar(glow);
    this.shadow.material.opacity = 0.1 + 0.2 * (1 - state.live.lampIntensity);
  }
}

/** A box with its top face pulled in — a cabin silhouette without a real model. */
function taperedBox(width, height, depth, topScaleX, topScaleZ) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0) {
      position.setX(i, position.getX(i) * topScaleX);
      position.setZ(i, position.getZ(i) * topScaleZ - depth * 0.06);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function flat(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  });
}
