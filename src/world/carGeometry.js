import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const WHEEL_RADIUS = 0.44;

/**
 * A late-70s wedge coupe in boxes. Forward is -Z.
 *
 * Returned as merged geometries grouped by material so a car is a handful of
 * draw calls, and so traffic can instance the exact same model the player
 * drives. `staticWheels` folds the wheels into the dark group for traffic,
 * which does not need them to turn.
 */
export function buildCarParts({ staticWheels = false } = {}) {
  const body = [];
  const dark = [];
  const glass = [];

  // --- main volumes
  body.push(box(2.02, 0.46, 4.6, 0, 0.66, 0)); // sill-to-waist slab
  body.push(box(1.9, 0.3, 1.85, 0, 0.99, -1.32)); // bonnet
  body.push(box(1.88, 0.34, 1.25, 0, 1.01, 1.63)); // boot deck
  body.push(wedge(1.96, 0.26, 1.5, 0.62, 0, 0.86, -2.0)); // nose taper

  // Greenhouse: a dark glass band with a body-coloured roof over it reads as a
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

  // --- lamps
  const heads = [];
  const tails = [];
  for (const x of [-0.66, 0.66]) {
    heads.push(box(0.46, 0.16, 0.08, x, 0.92, -2.32));
    tails.push(box(0.42, 0.15, 0.08, x, 0.92, 2.33));
  }
  tails.push(box(1.14, 0.06, 0.06, 0, 0.92, 2.34)); // connecting light bar

  const wheel = buildWheel();

  if (staticWheels) {
    for (const [x, z] of [
      [-1.0, -1.45],
      [1.0, -1.45],
      [-1.0, 1.5],
      [1.0, 1.5],
    ]) {
      dark.push(wheel.clone().translate(x, WHEEL_RADIUS, z));
    }
  }

  return {
    body: mergeGeometries(body),
    dark: mergeGeometries(dark),
    glass: mergeGeometries(glass),
    heads: mergeGeometries(heads),
    tails: mergeGeometries(tails),
    wheel,
  };
}

function buildWheel() {
  const tyre = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.32, 14);
  tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(WHEEL_RADIUS * 0.5, WHEEL_RADIUS * 0.5, 0.34, 8);
  hub.rotateZ(Math.PI / 2);
  hub.translate(0.01, 0, 0);
  return mergeGeometries([tyre, hub]);
}

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
