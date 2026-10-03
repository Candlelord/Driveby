import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { detailLevel } from './detail.js';

/**
 * Foliage and rock geometry for the prop kit.
 *
 * A tree crown built from solid polyhedra is the single loudest "low-poly"
 * tell there is. Real canopies have a ragged, see-through edge made of
 * thousands of leaves, and the standard way to get that on a budget is cards:
 * small alpha-tested quads carrying a painted spray of leaves, scattered over
 * the crown's volume. A dark solid core inside fills the gaps so the crown has
 * body from a distance.
 *
 * Card normals are not the quad's own: they point outward from the centre of
 * the lobe they belong to, so the whole crown shades as one rounded mass
 * (lit on the sun side, shadowed underneath) instead of each card flickering
 * as it turns toward or away from the light.
 */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Accumulates quads into one geometry. Each quad is given by its centre, two
 * half-axis vectors and a shading normal shared by all four corners.
 */
class CardBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
  }

  quad(centre, axisU, axisV, normal) {
    const base = this.positions.length / 3;
    const corners = [
      [-1, -1, 0, 0],
      [1, -1, 1, 0],
      [1, 1, 1, 1],
      [-1, 1, 0, 1],
    ];
    for (const [a, b, u, v] of corners) {
      this.positions.push(
        centre.x + axisU.x * a + axisV.x * b,
        centre.y + axisU.y * a + axisV.y * b,
        centre.z + axisU.z * a + axisV.z * b
      );
      this.normals.push(normal.x, normal.y, normal.z);
      this.uvs.push(u, v);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    return geometry.toNonIndexed();
  }
}

function cardCount(base) {
  return Math.max(4, Math.round(base * Math.min(1.3, detailLevel())));
}

/**
 * Leaf cards scattered through a set of spherical lobes, each given as
 * [radius, x, y, z].
 */
export function leafCards(lobes, { perLobe = 16, size = 1.15, seed = 1 } = {}) {
  const random = rng(seed);
  const cards = new CardBuilder();
  const centre = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const point = new THREE.Vector3();

  for (const [r, x, y, z] of lobes) {
    centre.set(x, y, z);
    const count = cardCount(perLobe * Math.min(1.6, Math.max(0.6, r)));
    for (let i = 0; i < count; i++) {
      // Biased toward the surface, where leaves get light.
      dir.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
      const depth = 0.45 + Math.sqrt(random()) * 0.5;
      point.copy(dir).multiplyScalar(r * depth).add(centre);

      // Random orientation, but never edge-on to the sky.
      u.set(random() * 2 - 1, (random() * 2 - 1) * 0.4, random() * 2 - 1).normalize();
      v.crossVectors(dir, u).normalize();
      if (Math.abs(v.y) < 0.2) v.lerp(UP, 0.4).normalize();
      const half = (r * size * (0.7 + random() * 0.5)) / 2;
      u.multiplyScalar(half);
      v.multiplyScalar(half);

      normal.copy(dir).lerp(UP, 0.25).normalize();
      cards.quad(point, u, v, normal);
    }
  }
  return cards.build();
}

/**
 * Solid inner lobes, shrunk so they sit inside the cards and only show
 * through the gaps — the shaded interior of the crown.
 */
export function crownCore(lobes, shrink = 0.62) {
  return mergeGeometries(
    lobes.map(([r, x, y, z]) => {
      const g = new THREE.IcosahedronGeometry(r * shrink, 1).translate(x, y, z);
      g.deleteAttribute('uv');
      return g;
    })
  );
}

/**
 * Drooping needle boughs around a conifer: each tier is [radius, height, y]
 * (the y of the tier's centre, as the old stacked cones were authored).
 */
export function needleCards(tiers, { seed = 3, density = 1 } = {}) {
  const random = rng(seed);
  const cards = new CardBuilder();
  const point = new THREE.Vector3();
  const out = new THREE.Vector3();
  const down = new THREE.Vector3();
  const side = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (const [radius, height, y] of tiers) {
    const count = cardCount((12 + radius * 10) * density);
    const bottom = y - height / 2;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + random() * 0.6;
      const t = Math.pow(random(), 0.8); // more boughs low on the tier
      const reach = radius * (1 - t) * (0.75 + random() * 0.35);
      out.set(Math.cos(angle), 0, Math.sin(angle));
      // The bough hangs from near the trunk out to the cone's surface.
      const top = bottom + height * (0.35 + t * 0.65);
      point.copy(out).multiplyScalar(reach * 0.5);
      point.y = top - height * 0.18;
      // Axis along the bough (outward and down), and across it.
      down.copy(out).multiplyScalar(reach * 0.55);
      down.y = -height * 0.22;
      side.set(-out.z, 0, out.x).multiplyScalar(Math.max(0.45, reach * 0.6));
      normal.copy(out).lerp(UP, 0.45).normalize();
      cards.quad(point, side, down, normal);
    }
  }
  return cards.build();
}

/** The dark inner cone that gives a conifer its mass. */
export function coniferCore(tiers) {
  return mergeGeometries(
    tiers.map(([radius, height, y]) => {
      const g = new THREE.ConeGeometry(radius * 0.45, height * 0.9, 8).translate(0, y, 0);
      g.deleteAttribute('uv');
      return g.toNonIndexed();
    })
  );
}

/** Long fronds arching off the top of a palm: two cards each, up then down. */
export function palmFrondCards(count = 9, top = 5.4, length = 2.8, seed = 5) {
  const random = rng(seed);
  const cards = new CardBuilder();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const along = new THREE.Vector3();
  const across = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + random() * 0.4;
    const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const droop = 0.2 + random() * 0.5;
    start.set(0, top, 0);
    // Rising inner half, falling outer half.
    for (const pitch of [0.35 - droop * 0.4, -0.45 - droop]) {
      end.copy(out).multiplyScalar(Math.cos(pitch) * length * 0.5).add(start);
      end.y += Math.sin(pitch) * length * 0.5;
      centre.addVectors(start, end).multiplyScalar(0.5);
      along.subVectors(end, start).multiplyScalar(0.5);
      across.set(-out.z, 0, out.x).multiplyScalar(0.6);
      normal.copy(out).lerp(UP, 0.6).normalize();
      cards.quad(centre, across, along, normal);
      start.copy(end);
    }
  }
  return cards.build();
}

/**
 * A rock: a subdivided icosahedron pushed around by a few octaves of 3D
 * noise, flattened a little so it sits like a stone rather than a ball, with
 * smooth normals so the lumps shade as weathered faces.
 */
export function rockGeometry(radius, seed = 1, squash = 0.7) {
  const random = rng(seed);
  const detail = detailLevel() >= 0.9 ? 3 : 2;
  let geometry = new THREE.IcosahedronGeometry(radius, detail);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);

  const offsets = Array.from({ length: 6 }, () => [random() * 10, random() * 10, random() * 10]);
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const n = v.clone().normalize();
    let bump = 0;
    let amp = 0.22;
    let freq = 1.3 / radius;
    for (let o = 0; o < 4; o++) {
      const [a, b, c] = offsets[o];
      bump += Math.sin(n.x * freq * radius * 2 + a) * Math.sin(n.y * freq * radius * 2.3 + b) * Math.sin(n.z * freq * radius * 1.9 + c) * amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    // A couple of flat fracture planes, which is what makes it read as stone.
    const cut = Math.max(0, n.dot(new THREE.Vector3(offsets[4][0] - 5, 3, offsets[4][2] - 5).normalize()) - 0.55);
    v.multiplyScalar(1 + bump - cut * 0.6);
    v.y *= squash;
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  // Spherical UVs for the rock detail map.
  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize();
    uvs[i * 2] = Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5;
    uvs[i * 2 + 1] = v.y * 0.5 + 0.5;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry.toNonIndexed();
}

/** Crossed grass cards, rooted at y = 0, normals up like the ground. */
export function grassCards(count = 3, width = 1.0, height = 0.9, seed = 9) {
  const random = rng(seed);
  const cards = new CardBuilder();
  const centre = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3(0, height / 2, 0);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI + random() * 0.3;
    centre.set((random() - 0.5) * 0.3, height / 2, (random() - 0.5) * 0.3);
    u.set(Math.cos(angle) * width / 2, 0, Math.sin(angle) * width / 2);
    cards.quad(centre, u, v, UP);
  }
  return cards.build();
}
