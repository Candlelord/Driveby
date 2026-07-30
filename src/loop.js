/**
 * The frame clock.
 *
 * Everything in the sim already integrates against `dt`, and the easings are
 * all `1 - exp(-rate * dt)`, so the maths is framerate-independent. What that
 * does *not* buy you is smoothness, because framerate-independent is not the
 * same as jitter-independent: if the browser hands you 14ms, 19ms, 15ms, 21ms
 * at a nominal 60Hz — which is exactly what Safari does on iOS, where the
 * compositor and the rAF callback do not share a clock — then the car advances
 * by a different amount each frame and the whole image shimmers, even though
 * every equation is correct.
 *
 * So the raw delta is treated as a noisy measurement of something that is
 * really quite steady, and filtered accordingly:
 *
 *   1. Spikes are rejected outright rather than averaged in, because one 200ms
 *      hitch smeared across the next eight frames is worse than one hitch.
 *   2. What is left is snapped to the nearest whole refresh interval, which is
 *      what removes the shimmer — a 60Hz display really is handing out 16.67ms
 *      steps, and the variation around it is measurement noise, not motion.
 *   3. The snapped value is averaged over a short window so that a genuine
 *      change of rate — a ProMotion iPad dropping from 120 to 60 under load —
 *      still comes through, just without a step.
 *
 * The cost is that sim time drifts from wall-clock time by a fraction of a
 * percent. For an endless drive with no fail state and nothing to synchronise
 * against, that is not a cost at all.
 */

// Refresh rates worth snapping to. Anything else falls through to the raw
// value, so an unusual display is filtered but not forced onto a grid.
const REFRESH_STEPS = [1 / 120, 1 / 90, 1 / 60, 1 / 50, 1 / 30];

// How far off a step can be and still be counted as that step. 18% of 16.67ms
// is about 3ms, comfortably wider than Safari's jitter and comfortably narrower
// than the gap between 60Hz and 50Hz.
const SNAP_TOLERANCE = 0.18;

const WINDOW = 8;
const MIN_DT = 1 / 240;
const MAX_DT = 1 / 20; // a slow frame must not teleport the car

export class FrameClock {
  constructor() {
    this.samples = [];
    this.smoothed = 1 / 60;
    this._last = 0;
  }

  /** Drop the accumulated time — after a tab comes back, or on first start. */
  reset() {
    this._last = 0;
    this.samples.length = 0;
  }

  /**
   * @param {number} now high-resolution timestamp, as handed to a rAF callback
   * @returns {number} the delta the sim should advance by
   */
  tick(now) {
    if (!this._last) {
      this._last = now;
      return this.smoothed;
    }

    const raw = (now - this._last) / 1000;
    this._last = now;

    // A hitch is an event, not a measurement. Let it through at its clamped
    // value and clear the window, so the average that follows describes the
    // new steady state rather than the interruption.
    if (raw > MAX_DT) {
      this.samples.length = 0;
      this.smoothed = MAX_DT;
      return MAX_DT;
    }
    if (raw < MIN_DT) return this.smoothed;

    this.samples.push(snapToRefresh(raw));
    if (this.samples.length > WINDOW) this.samples.shift();

    let total = 0;
    for (const sample of this.samples) total += sample;
    this.smoothed = total / this.samples.length;
    return this.smoothed;
  }
}

/**
 * Pull a delta onto the nearest plausible refresh interval, if it is close
 * enough to one to be that interval measured badly.
 */
function snapToRefresh(dt) {
  for (const step of REFRESH_STEPS) {
    if (Math.abs(dt - step) <= step * SNAP_TOLERANCE) return step;
  }
  return dt;
}
