import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seg } from '../props/detail.js';

export const WHEEL_RADIUS = 0.44;

/**
 * The car, matched to the concept frame: a smooth modern coupe rather than a
 * stack of boxes.
 *
 * The body is an extruded side profile with bevelled edges — the bevel is what
 * makes it read as sheet metal instead of carpentry, because every edge catches
 * a highlight. The greenhouse is a second, narrower extrusion in dark glass
 * that wraps windshield, roof and rear window as one band, which is exactly how
 * the reference car reads.
 *
 * Still shared by the player and traffic; still merged to a handful of
 * geometries per material.
 */
export function buildCarParts({ staticWheels = false } = {}) {
  const width = 2.0;
  const curveSegments = seg(7, 3);

  // Side profile, authored nose-first. Shape X here becomes -Z in car space
  // (forward is -Z), so the nose is drawn at +2.3.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(2.3, 0.32); // nose, low
  bodyShape.lineTo(2.28, 0.58); // bumper face
  bodyShape.quadraticCurveTo(2.24, 0.72, 2.0, 0.78); // nose rounds over
  bodyShape.quadraticCurveTo(1.2, 0.9, 0.55, 0.97); // bonnet rises gently
  bodyShape.lineTo(-1.55, 1.02); // beltline across the cabin
  bodyShape.quadraticCurveTo(-2.05, 1.0, -2.24, 0.9); // boot lip
  bodyShape.lineTo(-2.3, 0.62); // tail face
  bodyShape.lineTo(-2.18, 0.3); // under-tail
  bodyShape.lineTo(2.1, 0.3); // floor
  bodyShape.closePath();

  const body = extrudeProfile(bodyShape, width, 0.1, curveSegments);

  // Greenhouse: one dark band from beltline over the roof, narrower than the
  // body so the shoulder line stays visible.
  const glassShape = new THREE.Shape();
  glassShape.moveTo(0.62, 0.98); // windshield base
  glassShape.quadraticCurveTo(0.2, 1.36, -0.18, 1.42); // windshield sweep
  glassShape.lineTo(-0.95, 1.4); // roof
  glassShape.quadraticCurveTo(-1.42, 1.32, -1.62, 1.02); // rear window
  glassShape.lineTo(-1.4, 0.98);
  glassShape.closePath();

  const glass = extrudeProfile(glassShape, width * 0.82, 0.06, curveSegments);

  // --- trim, lights, detail
  const dark = [];
  dark.push(box(width * 0.96, 0.16, 4.5, 0, 0.24, 0)); // rocker shadow line
  dark.push(box(width * 1.0, 0.18, 0.32, 0, 0.42, -2.2)); // front splitter
  dark.push(box(width * 1.0, 0.2, 0.3, 0, 0.44, 2.2)); // rear diffuser
  dark.push(box(0.42, 0.1, 0.24, 0, 0.6, 2.32)); // exhaust housing
  for (const x of [-0.24, 0.24]) {
    dark.push(
      new THREE.CylinderGeometry(0.07, 0.07, 0.14, seg(8, 6))
        .rotateX(Math.PI / 2)
        .translate(x, 0.48, 2.32)
    );
  }
  for (const x of [-1.02, 1.02]) {
    dark.push(box(0.1, 0.13, 0.3, x * 0.96, 1.06, 0.52)); // mirrors
  }

  const heads = [];
  const tails = [];
  // Slim full-width bars, like the concept: lights as a graphic line, not lamps.
  heads.push(box(1.5, 0.09, 0.08, 0, 0.68, -2.31));
  tails.push(box(1.64, 0.12, 0.08, 0, 0.82, 2.31));
  for (const x of [-0.62, 0.62]) {
    tails.push(box(0.34, 0.2, 0.08, x, 0.72, 2.3)); // tail blocks under the bar
  }

  const wheel = buildWheel();
  const darkParts = [...dark];
  if (staticWheels) {
    for (const [x, z] of [
      [-1.0, -1.42],
      [1.0, -1.42],
      [-1.0, 1.46],
      [1.0, 1.46],
    ]) {
      darkParts.push(wheel.clone().translate(x, WHEEL_RADIUS, z));
    }
  }

  return {
    body,
    dark: merge(darkParts),
    glass,
    heads: merge(heads),
    tails: merge(tails),
    wheel,
  };
}

/**
 * Extrude a side profile across the car's width with bevelled edges, then
 * orient it into car space. The bevel rounds every shoulder, which is the
 * whole difference between boxy and smooth at this scale.
 */
function extrudeProfile(shape, width, bevel, curveSegments) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  geometry.rotateY(Math.PI / 2);
  // Flat shading needs faceted normals, and the extrude's smooth bevel normals
  // fight the toon read — recompute from the triangles.
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

function buildWheel() {
  const tyre = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.34, seg(16, 10));
  tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(WHEEL_RADIUS * 0.55, WHEEL_RADIUS * 0.55, 0.36, seg(10, 6));
  hub.rotateZ(Math.PI / 2);
  hub.translate(0.01, 0, 0);
  return merge([tyre, hub]);
}

function box(width, height, depth, x, y, z) {
  return new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
}

function merge(parts) {
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}
