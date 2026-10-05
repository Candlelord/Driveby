import * as THREE from 'three';
import { heading } from '../path.js';
import { terrainHeight } from '../world/terrain.js';

const SCRATCH = new THREE.Vector3();

/**
 * Put an object at distance `s` along the road and `w` to the side of it,
 * turned to follow the road there.
 *
 * Everything is drawn in car-local space, where the road's direction drifts
 * away from straight as it bends — so a thing standing across the road has to
 * be turned by how far the road has turned between the car and it.
 *
 * `yaw` is extra rotation relative to the road (0 faces along it); `ground`
 * sits the object on the terrain rather than on the road surface.
 */
export function placeAt(object, frame, s, w, { y = 0, yaw = 0, live = null, ground = false } = {}) {
  const lift = ground && live ? terrainHeight(w, s, live) : 0;
  frame.point(s, w, y + lift, SCRATCH);
  object.position.copy(SCRATCH);
  object.rotation.y = -(heading(s) - heading(frame.s0)) + yaw;
  return object;
}

/** Distance (units) beyond which nothing trackside needs to exist. */
export function visibleRange(config) {
  return config.segmentsAhead * config.segmentLength;
}
