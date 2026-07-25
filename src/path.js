// The road centreline.
//
// Rather than accumulating segments (which drifts and needs bookkeeping for an
// endless drive), the centreline is a closed-form function of distance `s`:
// layered sines give a smooth, deterministic, infinitely-long curve that can be
// sampled at any point with no state.
//
// Everything is drawn in *car-local* space: the car sits at the origin facing
// -Z, and the world is transformed around it. That keeps float precision
// constant no matter how many miles have been driven.

const X_TERMS = [
  [55, 0.0042, 0],
  [14, 0.0111, 1.7],
  [3, 0.0273, 4.1],
];

const Y_TERMS = [
  [5.5, 0.0031, 0.6],
  [1.8, 0.0087, 2.3],
];

/** Lateral position of the centreline at distance `s`. */
export function roadX(s) {
  let x = 0;
  for (let i = 0; i < X_TERMS.length; i++) {
    const [a, f, p] = X_TERMS[i];
    x += a * Math.sin(s * f + p);
  }
  return x;
}

/** Elevation of the centreline at distance `s`. */
export function roadY(s) {
  let y = 0;
  for (let i = 0; i < Y_TERMS.length; i++) {
    const [a, f, p] = Y_TERMS[i];
    y += a * Math.sin(s * f + p);
  }
  return y;
}

/** dX/ds — used for the tangent direction. */
export function roadDX(s) {
  let d = 0;
  for (let i = 0; i < X_TERMS.length; i++) {
    const [a, f, p] = X_TERMS[i];
    d += a * f * Math.cos(s * f + p);
  }
  return d;
}

/**
 * Heading of the road at `s`, as an angle about Y.
 * The tangent is (sin0, 0, -cos0), i.e. 0 = travelling straight down -Z.
 */
export function heading(s) {
  return Math.atan(roadDX(s));
}

/**
 * Per-sample frame, reused across the columns of a road/terrain row so the
 * trig only runs once per distance value.
 */
export class PathFrame {
  constructor() {
    this.s0 = 0;
    this.x0 = 0;
    this.y0 = 0;
    this.cos0 = 1;
    this.sin0 = 0;
    // Per-row scratch
    this.s = 0;
    this.rx = 0;
    this.ry = 0;
    this.nx = 1;
    this.nz = 0;
  }

  /** Anchor the frame at the car's current distance along the road. */
  setOrigin(s0) {
    const theta0 = heading(s0);
    this.s0 = s0;
    this.x0 = roadX(s0);
    this.y0 = roadY(s0);
    this.cos0 = Math.cos(theta0);
    this.sin0 = Math.sin(theta0);
    return this;
  }

  /** Move to a distance along the road; call once per row, before columns. */
  setRow(s) {
    const theta = heading(s);
    this.s = s;
    this.rx = roadX(s);
    this.ry = roadY(s);
    // Road-normal (points to the car's right) in track space.
    this.nx = Math.cos(theta);
    this.nz = Math.sin(theta);
    return this;
  }

  /**
   * Project a point `w` units to the side of the current row into car-local
   * space. `heightOffset` is added on top of the centreline elevation.
   */
  column(w, heightOffset, out) {
    const dx = this.rx + w * this.nx - this.x0;
    const dy = this.ry - this.y0 + heightOffset;
    const dz = -(this.s - this.s0) + w * this.nz;
    out.x = dx * this.cos0 + dz * this.sin0;
    out.y = dy;
    out.z = -dx * this.sin0 + dz * this.cos0;
    return out;
  }

  /** Convenience for one-off samples (look-ahead points, prop placement). */
  point(s, w, heightOffset, out) {
    this.setRow(s);
    return this.column(w, heightOffset, out);
  }
}

/** Cheap deterministic hash in [0,1) — used for scenery scatter. */
export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
