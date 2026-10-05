import { curvature, heading } from '../path.js';

export const STEP = 4;
export const CORNER_AT = 0.0075; // curvature above this is a corner (a radius under ~130)

// Pace-note scale. 1 is the tightest corner you can take without stopping, 6
// is a gentle sweep; a hairpin is its own call (0). The numbers are the
// corner's radius in game units, which are metres for all practical purposes.
const SCALE = [
  [14, 0],
  [21, 1],
  [31, 2],
  [46, 3],
  [70, 4],
  [110, 5],
  [Infinity, 6],
];

/**
 * Corners on the road between `from` and `from + length`, nearest first.
 *
 * Read straight off the road function, on a fixed grid of absolute distances,
 * so a corner keeps the same `key` (and the same start and end) however the
 * scan is framed. A corner the scan begins inside is dropped (`partial`), since
 * it cannot be measured whole — unless `keepPartial` is set.
 *
 * Each corner: { start, end, length, sign, dir, peak, peakAt, radius, angle,
 * severity (0 hairpin … 6 sweep), tightens, opens, key, into }.
 */
export function scanCorners(from, length, { keepPartial = false, maxSeverity = 5 } = {}) {
  const corners = [];
  const first = Math.ceil(from / STEP);
  const last = first + Math.floor(length / STEP);
  let cur = null;
  let insideAtStart = Math.abs(curvature(first * STEP)) > CORNER_AT;

  const close = () => {
    if (!cur) return;
    cur.angle = Math.abs(heading(cur.end) - heading(cur.start));
    cur.length = cur.end - cur.start + STEP;
    cur.radius = 1 / cur.peak;
    cur.severity = SCALE.find(([r]) => cur.radius < r)[1];
    const mid = (cur.start + cur.end) / 2;
    cur.tightens = cur.peakAt > mid + cur.length * 0.18;
    cur.opens = cur.peakAt < mid - cur.length * 0.18;
    cur.dir = cur.sign > 0 ? 'right' : 'left';
    cur.key = Math.round(cur.start / STEP);
    if ((keepPartial || !cur.partial) && cur.severity <= maxSeverity) corners.push(cur);
    cur = null;
  };

  for (let k = first; k <= last; k++) {
    const s = k * STEP;
    const kappa = curvature(s);
    const mag = Math.abs(kappa);
    if (mag > CORNER_AT) {
      const sign = Math.sign(kappa);
      if (cur && sign !== cur.sign) close();
      if (!cur) cur = { start: s, end: s, sign, peak: mag, peakAt: s, partial: insideAtStart && k === first };
      cur.end = s;
      if (mag > cur.peak) {
        cur.peak = mag;
        cur.peakAt = s;
      }
    } else {
      insideAtStart = false;
      close();
    }
  }
  close();

  // Link corners that follow each other closely.
  for (let i = 0; i < corners.length - 1; i++) {
    if (corners[i + 1].start - corners[i].end < 28) corners[i].into = corners[i + 1];
  }
  return corners;
}
