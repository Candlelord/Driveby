import * as THREE from 'three';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seg } from '../props/detail.js';

export const WHEEL_RADIUS = 0.36;

// Axle positions in car space (forward is -Z).
export const FRONT_AXLE = -1.42;
export const REAR_AXLE = 1.46;
export const TRACK = 0.88; // wheel centre, either side of the centreline

const ARCH_RADIUS = 0.45;
const FLOOR = 0.24;

/**
 * A modern sports-saloon, built to be looked at from behind and above for
 * hours.
 *
 * The body is still an extruded side profile — the cheapest way to get a
 * convincing silhouette — but the profile now has wheel arches cut out of it,
 * so the tyres sit *in* the body rather than being bolted underneath, and the
 * extrusion is then bent: the plan view tapers at nose and tail and the
 * shoulders tuck in toward the roof (tumblehome), which takes it from a
 * slab with rounded edges to something that reads as pressed sheet metal.
 * Normals are creased rather than faceted, so the paint flows over curves and
 * still holds a crisp edge at the bumper and sill lines.
 *
 * The greenhouse is glass with a body-coloured roof panel over it, as on a real
 * car; pillars, trim, lamps, plate and exhausts are separate small parts merged
 * per material.
 *
 * Shared by the player and traffic.
 */
export function buildCarParts({ staticWheels = false } = {}) {
  const width = 2.0;
  const curveSegments = seg(10, 4);

  // Side profile, nose-first: shape X becomes -Z in car space.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(2.3, 0.3); // nose, low
  bodyShape.lineTo(2.34, 0.56); // bumper face
  bodyShape.quadraticCurveTo(2.33, 0.75, 2.08, 0.8); // nose rounds over
  bodyShape.quadraticCurveTo(1.3, 0.93, 0.62, 0.99); // bonnet rises to the screen
  bodyShape.lineTo(-1.5, 1.05); // beltline under the glass
  bodyShape.quadraticCurveTo(-2.12, 1.05, -2.28, 0.93); // boot lid and lip
  bodyShape.lineTo(-2.34, 0.62); // tail face
  bodyShape.quadraticCurveTo(-2.35, 0.34, -2.18, 0.28); // rear bumper tucks under
  bodyShape.lineTo(-2.0, FLOOR);
  arch(bodyShape, -REAR_AXLE);
  arch(bodyShape, -FRONT_AXLE);
  bodyShape.lineTo(2.16, FLOOR);
  bodyShape.closePath();

  const body = extrudeProfile(bodyShape, width, 0.13, curveSegments, (v) => {
    // Plan view: round the corners off at both ends.
    const nose = smoothstep(1.55, 2.35, -v.z);
    const tail = smoothstep(1.7, 2.35, v.z);
    // Tumblehome: the upper body tucks in toward the glass.
    const shoulder = smoothstep(0.72, 1.06, v.y);
    v.x *= 1 - nose * 0.1 - tail * 0.06 - shoulder * 0.05;
    // A little crown across the bonnet and boot, so they are not dead flat.
    v.y += (1 - (v.x / (width / 2)) ** 2) * 0.025 * smoothstep(0.75, 1.0, v.y);
  });

  // The greenhouse: glass all round, pulled in hard toward the roof.
  const glassShape = new THREE.Shape();
  glassShape.moveTo(0.66, 0.98);
  glassShape.quadraticCurveTo(0.18, 1.36, -0.24, 1.43); // windscreen rake
  glassShape.lineTo(-1.02, 1.42); // roofline
  glassShape.quadraticCurveTo(-1.5, 1.33, -1.72, 1.04); // fastback rear screen
  glassShape.lineTo(-1.4, 0.98);
  glassShape.closePath();
  const greenhouseTaper = (v) => {
    v.x *= 1 - smoothstep(0.98, 1.45, v.y) * 0.2;
  };
  const glass = extrudeProfile(glassShape, width * 0.86, 0.07, curveSegments, greenhouseTaper);

  // Body-coloured roof panel, lying over the top of the glass. Slightly wider
  // and taller than the glass, so it caps it cleanly.
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.05, 1.395);
  roofShape.quadraticCurveTo(-0.22, 1.448, -0.42, 1.452);
  roofShape.lineTo(-0.98, 1.448);
  roofShape.quadraticCurveTo(-1.22, 1.43, -1.36, 1.375);
  roofShape.lineTo(-1.3, 1.35);
  roofShape.lineTo(-0.1, 1.37);
  roofShape.closePath();
  const roof = extrudeProfile(roofShape, width * 0.87, 0.04, curveSegments, (v) => {
    greenhouseTaper(v);
    v.x *= 1.012;
  });

  // --- trim, lamps, detail
  const dark = [];
  // Wheel-well liners, so you see black inside the arch instead of daylight.
  for (const z of [FRONT_AXLE, REAR_AXLE]) {
    dark.push(
      // Upper half-tube only (theta 0..PI lands on +Y once the axis is on X).
      new THREE.CylinderGeometry(ARCH_RADIUS - 0.02, ARCH_RADIUS - 0.02, width * 0.9, seg(18, 8), 1, true, 0, Math.PI)
        .rotateZ(Math.PI / 2)
        .translate(0, WHEEL_RADIUS, z)
    );
  }
  // Sills between the arches.
  for (const side of [-1, 1]) {
    dark.push(box(0.06, 0.1, 1.95, side * 0.985, FLOOR + 0.07, 0.02));
  }
  dark.push(box(width * 0.84, 0.12, 0.2, 0, 0.3, 2.26)); // rear diffuser
  dark.push(box(width * 0.8, 0.1, 0.18, 0, 0.3, -2.24)); // front splitter
  dark.push(box(1.0, 0.18, 0.06, 0, 0.47, -2.33)); // grille
  // B-pillars, gloss black like most modern cars.
  for (const side of [-1, 1]) dark.push(box(0.04, 0.4, 0.12, side * 0.79, 1.2, -0.42));
  // Door mirrors, at the foot of the A-pillar on short stalks.
  for (const side of [-1, 1]) {
    dark.push(box(0.16, 0.04, 0.07, side * 0.9, 1.0, -0.52));
    dark.push(box(0.09, 0.12, 0.22, side * 1.0, 1.03, -0.5).rotateY(side * 0.12));
  }

  const chrome = [];
  for (const x of [-0.58, 0.58]) {
    chrome.push(
      new THREE.CylinderGeometry(0.055, 0.06, 0.16, seg(12, 6), 1, true).rotateX(Math.PI / 2).translate(x, 0.32, 2.3)
    );
  }

  const plate = [box(0.52, 0.12, 0.02, 0, 0.56, 2.345)];

  const heads = [];
  const tails = [];
  // Slim swept headlamps either side, and a full-width tail light bar with
  // deeper clusters at the corners — the modern signature from behind.
  // Positions sit just proud of the bodywork at their height.
  for (const side of [-1, 1]) {
    heads.push(box(0.44, 0.08, 0.1, side * 0.6, 0.7, -2.31));
    tails.push(box(0.42, 0.12, 0.06, side * 0.6, 0.84, 2.3));
  }
  tails.push(box(0.76, 0.035, 0.05, 0, 0.87, 2.31));
  // A gloss-black panel the tail lamps sit in, across the full tail.
  dark.push(box(1.62, 0.2, 0.04, 0, 0.84, 2.29));

  const wheel = buildWheel();
  const darkParts = [...dark];
  const chromeParts = [...chrome];
  if (staticWheels) {
    for (const [x, z] of [
      [-TRACK - 0.02, FRONT_AXLE],
      [TRACK + 0.02, FRONT_AXLE],
      [-TRACK - 0.02, REAR_AXLE],
      [TRACK + 0.02, REAR_AXLE],
    ]) {
      const mirror = x < 0 ? -1 : 1;
      darkParts.push(wheel.tyre.clone().scale(mirror, 1, 1).translate(x, WHEEL_RADIUS, z));
      chromeParts.push(wheel.rim.clone().scale(mirror, 1, 1).translate(x, WHEEL_RADIUS, z));
    }
  }

  return {
    body: merge([body, roof]),
    dark: merge(darkParts),
    glass,
    chrome: merge(chromeParts),
    plate: merge(plate),
    heads: merge(heads),
    tails: merge(tails),
    wheel,
  };
}

/**
 * A danfo: the yellow minibus that carries Lagos. A tall slab-sided van with
 * a short bonnet, a band of side windows, and the two black stripes down each
 * flank that every danfo wears. Wheels are merged in, as for traffic cars.
 */
export function buildVanParts() {
  const width = 1.9;
  const curveSegments = seg(6, 3);
  const front = 1.62; // axle positions in profile X (nose is +X)
  const rear = -1.5;

  const shape = new THREE.Shape();
  shape.moveTo(2.32, 0.3);
  shape.lineTo(2.36, 0.92); // bumper and grille face
  shape.quadraticCurveTo(2.34, 1.08, 2.16, 1.12); // short nose
  shape.lineTo(1.78, 1.98); // raked screen
  shape.quadraticCurveTo(1.6, 2.06, 1.3, 2.06);
  shape.lineTo(-2.2, 2.06); // roof
  shape.quadraticCurveTo(-2.36, 2.04, -2.36, 1.88);
  shape.lineTo(-2.36, 0.32); // tail
  shape.lineTo(-2.1, FLOOR);
  arch(shape, rear);
  arch(shape, front);
  shape.lineTo(2.2, FLOOR);
  shape.closePath();
  const body = extrudeProfile(shape, width, 0.08, curveSegments);

  // Glass: windscreen plus a band of side windows, a hair proud of the body.
  const glassShape = new THREE.Shape();
  glassShape.moveTo(2.12, 1.18);
  glassShape.lineTo(1.76, 1.94);
  glassShape.lineTo(-2.22, 1.94);
  glassShape.lineTo(-2.22, 1.36);
  glassShape.lineTo(1.6, 1.36);
  glassShape.closePath();
  const glass = extrudeProfile(glassShape, width + 0.03, 0.02, curveSegments);

  const dark = [];
  // The stripes: one broad, one thin, down both flanks and across the back.
  dark.push(box(width + 0.04, 0.13, 4.5, 0, 1.02, -0.05));
  dark.push(box(width + 0.04, 0.06, 4.5, 0, 1.2, -0.05));
  dark.push(box(width * 1.02, 0.22, 0.2, 0, 0.4, -2.34)); // bumpers
  dark.push(box(width * 1.02, 0.22, 0.2, 0, 0.4, 2.34));
  for (const z of [-front, -rear]) {
    dark.push(
      new THREE.CylinderGeometry(ARCH_RADIUS - 0.02, ARCH_RADIUS - 0.02, width * 0.9, seg(14, 8), 1, true, 0, Math.PI)
        .rotateZ(Math.PI / 2)
        .translate(0, WHEEL_RADIUS, z)
    );
  }
  const wheel = buildWheel();
  const chrome = [];
  for (const z of [-front, -rear]) {
    for (const x of [-0.84, 0.84]) {
      const mirror = x < 0 ? -1 : 1;
      dark.push(wheel.tyre.clone().scale(mirror, 1, 1).translate(x, WHEEL_RADIUS, z));
      chrome.push(wheel.rim.clone().scale(mirror, 1, 1).translate(x, WHEEL_RADIUS, z));
    }
  }

  const heads = [];
  const tails = [];
  for (const side of [-1, 1]) {
    heads.push(box(0.34, 0.2, 0.08, side * 0.66, 0.86, -2.37));
    tails.push(box(0.16, 0.42, 0.06, side * 0.86, 0.95, 2.37));
  }

  return {
    body,
    dark: merge(dark),
    glass,
    chrome: merge(chrome),
    plate: merge([box(0.52, 0.12, 0.02, 0, 0.62, 2.37)]),
    heads: merge(heads),
    tails: merge(tails),
  };
}

/**
 * Cut a wheel arch into the bottom edge of the side profile while drawing it
 * from tail to nose: down to the floor, over the top of the wheel, back down.
 */
function arch(shape, centre) {
  const dy = FLOOR - WHEEL_RADIUS;
  const dx = Math.sqrt(ARCH_RADIUS * ARCH_RADIUS - dy * dy);
  const start = Math.atan2(dy, -dx);
  const end = Math.atan2(dy, dx);
  shape.lineTo(centre - dx, FLOOR);
  shape.absarc(centre, WHEEL_RADIUS, ARCH_RADIUS, start < 0 ? start + Math.PI * 2 : start, end, true);
}

/**
 * Extrude a side profile across the car's width with rounded edges, orient it
 * into car space, run a per-vertex shaping function over it, and give it
 * creased normals: smooth across curves, sharp across real edges.
 */
function extrudeProfile(shape, width, bevel, curveSegments, shapeVertex) {
  let geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    // Keep the rounded edge *inside* the authored outline. Without this the
    // bevel grows the shape outward by its own size, shrinking the wheel
    // arches below the tyres and burying the lamps in the bodywork.
    bevelOffset: -bevel,
    bevelSegments: 4,
    curveSegments,
  });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  geometry.rotateY(Math.PI / 2);

  if (shapeVertex) {
    const position = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      shapeVertex(v);
      position.setXYZ(i, v.x, v.y, v.z);
    }
  }

  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry, 1e-4);
  return toCreasedNormals(geometry, THREE.MathUtils.degToRad(38));
}

/**
 * A tyre with a rounded shoulder and sidewall, and a five-spoke alloy inside
 * it. Built with the outer face toward +X; left-side wheels mirror it.
 */
function buildWheel() {
  const r = WHEEL_RADIUS;
  const half = 0.13;
  const profile = [
    [r * 0.66, -half * 0.9],
    [r * 0.9, -half],
    [r * 0.97, -half * 0.88],
    [r, -half * 0.55],
    [r, half * 0.55],
    [r * 0.97, half * 0.88],
    [r * 0.9, half],
    [r * 0.66, half * 0.9],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const tyre = new THREE.LatheGeometry(profile, seg(28, 12)).rotateZ(-Math.PI / 2);

  const rimRadius = r * 0.66;
  const rimParts = [];
  // Barrel and a recessed dish behind the spokes.
  rimParts.push(
    new THREE.CylinderGeometry(rimRadius, rimRadius, half * 1.7, seg(24, 10), 1, true).rotateZ(Math.PI / 2)
  );
  rimParts.push(new THREE.CircleGeometry(rimRadius * 0.98, seg(24, 10)).rotateY(Math.PI / 2).translate(-0.03, 0, 0));
  // Lip.
  rimParts.push(
    new THREE.TorusGeometry(rimRadius, 0.014, 6, seg(28, 12)).rotateY(Math.PI / 2).translate(half * 0.82, 0, 0)
  );
  // Spokes, each a tapered bar from hub to lip.
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.BoxGeometry(0.035, rimRadius * 0.9, 0.06).translate(0, rimRadius * 0.48, 0);
    spoke.rotateX((i / 5) * Math.PI * 2);
    rimParts.push(spoke.translate(half * 0.6, 0, 0));
  }
  rimParts.push(new THREE.CylinderGeometry(0.06, 0.07, 0.06, seg(12, 6)).rotateZ(Math.PI / 2).translate(half * 0.62, 0, 0));

  return { tyre, rim: merge(rimParts) };
}

function box(width, height, depth, x, y, z) {
  return new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
}

function merge(parts) {
  return mergeGeometries(
    parts.map((p) => {
      const g = p.index ? p.toNonIndexed() : p;
      // Every part must carry the same attributes to merge.
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }
      return g;
    })
  );
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
