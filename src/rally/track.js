import { setWindProfile, profileFrom } from '../path.js';

// How loose each surface is, 0 (tarmac) to 1 (packed dirt). Gravel sits between:
// it still throws dust and lets the rear end go, but it is not mud.
const SURFACE_VALUE = { tarmac: 0, gravel: 0.72, dirt: 1 };

// Cities occupy the ends of a leg; a stage proper runs between them.
export const STAGE_FROM = 0.1;
export const STAGE_TO = 0.88;
const CORE_FROM = STAGE_FROM;
const CORE_TO = STAGE_TO;
const WIND_RAMP = 0.07; // fraction of the leg over which the road winds up to full
const SURFACE_RAMP = 22; // units over which one surface becomes another

let dirt = () => 0;

/** 0..1: how loose the road is at distance `s`. Tarmac everywhere outside a route. */
export function dirtAt(s) {
  return dirt(s);
}

/** Back to the endless drive: tarmac, highway curves. */
export function clearTrack() {
  dirt = () => 0;
  setWindProfile(null);
}

/**
 * Lay a route's stages onto the road: the windiness and the surface along each
 * leg, as functions of distance. `layout` is the route director's own leg
 * arithmetic, so the two can never disagree about where a leg starts.
 *
 * A leg without a `stage` (the ferry) is tarmac and as straight as ever.
 */
export function installTrack(route, { origin, legStarts, legLengths }) {
  const windPoints = [];
  const dirtPoints = [];
  const push = (list, s, value) => {
    // Breakpoints must climb; nudge a coincident one forward rather than drop it.
    const last = list[list.length - 1];
    list.push([last && s <= last[0] ? last[0] + 0.01 : s, value]);
  };

  route.legs.forEach((leg, i) => {
    const stage = leg.stage;
    const s0 = origin + legStarts[i];
    const length = legLengths[i];
    if (!stage || length <= 0) return;

    const from = s0 + length * CORE_FROM;
    const to = s0 + length * CORE_TO;
    const ramp = length * WIND_RAMP;

    push(windPoints, s0, 0);
    push(windPoints, from, 0);
    push(windPoints, from + ramp, stage.wind);
    push(windPoints, to - ramp, stage.wind);
    push(windPoints, to, 0);

    const sections = stage.surface;
    let value = SURFACE_VALUE[sections[0][0]];
    push(dirtPoints, s0, 0);
    push(dirtPoints, from - SURFACE_RAMP, 0);
    push(dirtPoints, from + SURFACE_RAMP, value);
    for (const [type, fraction] of sections.slice(1)) {
      const at = Math.max(from + SURFACE_RAMP * 2, s0 + length * fraction);
      push(dirtPoints, at - SURFACE_RAMP, value);
      value = SURFACE_VALUE[type];
      push(dirtPoints, at + SURFACE_RAMP, value);
    }
    push(dirtPoints, to - SURFACE_RAMP, value);
    push(dirtPoints, to + SURFACE_RAMP, 0);
  });

  setWindProfile(profileFrom(windPoints));
  dirt = profileFrom(dirtPoints);
}
