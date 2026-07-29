/**
 * Geometry detail level, set once from the quality tier before any prop is
 * built.
 *
 * The tiers previously only shrank buffers — draw distance, particle counts —
 * which left a phone rendering exactly the same geometry as a desktop. This is
 * the other half: segment counts on every curved surface scale with the tier,
 * so a high-end machine gets rounder cylinders and cones while a phone gets the
 * blockier version it can afford.
 */

let level = 1;

export function setDetail(value) {
  level = value;
}

export function detailLevel() {
  return level;
}

/** Scale a segment count, never below what still reads as the shape. */
export function seg(count, floor = 4) {
  return Math.max(floor, Math.round(count * level));
}

/** Polyhedra take a subdivision level rather than a segment count. */
export function subdiv() {
  return level >= 0.9 ? 1 : 0;
}
