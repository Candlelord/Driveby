import * as THREE from 'three';
import { clamp, lerp } from './geo.js';

const DESIRED = new THREE.Vector3();
const LOOK = new THREE.Vector3();

/**
 * The chase camera. It sits behind and above the car, swings round after it
 * with a little lag (more lag means more sense of the car's weight), looks a
 * little ahead of the bonnet, widens with speed, and pulls in when a wall is
 * between it and the car so it never ends up inside a building.
 */
export class ChaseCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.distance = 8.5;
    this.height = 3.3;
    this.fov = 62;
    this.look = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.first = true;
    this.shake = 0;
    this.orbit = 0; // extra yaw from dragging to look around
  }

  snap(vehicle) {
    this.yaw = vehicle.yaw;
    this.first = true;
    this.update(vehicle, 1 / 60, 0);
  }

  update(vehicle, dt, time, baseFov = 62) {
    // Follow the direction of travel when reversing slowly backwards, else the nose.
    let target = vehicle.yaw;
    if (vehicle.speed < -3) target = vehicle.yaw;
    let diff = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
    this.yaw += diff * (1 - Math.exp(-(this.first ? 60 : 4.2) * dt));
    const yaw = this.yaw + this.orbit;

    const speed = Math.abs(vehicle.speed);
    const back = this.distance + clamp(speed / 50, 0, 1) * 2.2;
    const fx = Math.sin(yaw);
    const fz = -Math.cos(yaw);
    DESIRED.set(vehicle.x - fx * back, vehicle.y + this.height + clamp(speed / 50, 0, 1) * 0.6, vehicle.z - fz * back);

    // Pull in if a building is in the way.
    let clear = 1;
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      const px = lerp(vehicle.x, DESIRED.x, t);
      const pz = lerp(vehicle.z, DESIRED.z, t);
      if (this._insideBuilding(px, pz, vehicle.y + this.height * t)) {
        clear = Math.max(0.28, (k - 1) / 6);
        break;
      }
    }
    DESIRED.set(lerp(vehicle.x, DESIRED.x, clear), DESIRED.y, lerp(vehicle.z, DESIRED.z, clear));
    // Never below the ground.
    const ground = this.world.surfaceAt(DESIRED.x, DESIRED.z, DESIRED.y).y;
    DESIRED.y = Math.max(DESIRED.y, ground + 1.2);

    // A snap (start, reset, teleport) lands the camera in place, aimed and
    // zoomed, rather than swinging in from wherever it last looked.
    const first = this.first;
    this.first = false;
    LOOK.set(vehicle.x + fx * 6, vehicle.y + 1.3, vehicle.z + fz * 6);
    if (first) {
      this.position.copy(DESIRED);
      this.look.copy(LOOK);
    } else {
      this.position.lerp(DESIRED, 1 - Math.exp(-9 * dt));
      this.look.lerp(LOOK, 1 - Math.exp(-12 * dt));
    }

    this.camera.position.copy(this.position);
    const shake = vehicle.impact * 0.5 + this.shake;
    if (shake > 0.01) {
      this.camera.position.x += Math.sin(time * 37) * shake * 0.25;
      this.camera.position.y += Math.sin(time * 29 + 1.3) * shake * 0.2;
    }
    this.camera.lookAt(this.look);
    // Lean a touch into a slide.
    this.camera.rotateZ(clamp(-vehicle.lateral * 0.008, -0.06, 0.06));

    const fov = baseFov + clamp(speed / 55, 0, 1) * 12;
    if (first || Math.abs(fov - this.fov) > 0.05) {
      this.fov = first ? fov : this.fov + (fov - this.fov) * (1 - Math.exp(-3 * dt));
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  _insideBuilding(x, z, y) {
    for (const b of this.world.buildingsNear(x, z)) {
      const [minX, minZ, maxX, maxZ] = b.box;
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      if (y > b.h + 1) continue;
      let inside = false;
      const ring = b.ring;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, zi] = ring[i];
        const [xj, zj] = ring[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }
}
