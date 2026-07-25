import * as THREE from 'three';

/**
 * A "live" profile: one flat bag holding the blended value of every key across
 * every axis, with persistent THREE.Color instances so blending each frame
 * allocates nothing.
 *
 * @param {Array<{colors: string[], numbers: string[]}>} keySets
 * @param {string[]} derivedColors extra colour slots written by compose()
 */
export function createLiveProfile(keySets, derivedColors = []) {
  const live = {};
  for (const set of keySets) {
    for (const key of set.colors) live[key] = new THREE.Color();
    for (const key of set.numbers) live[key] = 0;
  }
  for (const key of derivedColors) live[key] = new THREE.Color();
  return live;
}

/** Cache of profile hexes -> Color, so we never re-parse hex per frame. */
const colorCache = new WeakMap();

function colorFor(profile, key) {
  let byKey = colorCache.get(profile);
  if (!byKey) {
    byKey = new Map();
    colorCache.set(profile, byKey);
  }
  let color = byKey.get(key);
  if (!color) {
    color = new THREE.Color(profile[key]);
    byKey.set(key, color);
  }
  return color;
}

/** Smooth, ease-in-out ramp — keeps transitions from starting/stopping abruptly. */
export function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Lerp `live`'s current values toward a profile, in place.
 *
 * Needed for layers that sit on top of an already-blended result — an event's
 * climate has to pull whatever the terrain set's climate had reached, not
 * replace one of its endpoints.
 */
export function blendLiveToward(live, profile, t, keys) {
  if (t <= 0) return live;
  for (const key of keys.colors) {
    live[key].lerp(colorFor(profile, key), t);
  }
  for (const key of keys.numbers) {
    live[key] += (profile[key] - live[key]) * t;
  }
  return live;
}

/**
 * Blend two profiles from the same axis into `live`. `t` of 0 is all `from`,
 * 1 is all `to`. Colours blend in three's linear working space, which keeps
 * midpoints from going muddy the way naive sRGB lerps do.
 */
export function blendProfiles(live, from, to, t, keys) {
  for (const key of keys.colors) {
    live[key].lerpColors(colorFor(from, key), colorFor(to, key), t);
  }
  for (const key of keys.numbers) {
    live[key] = from[key] + (to[key] - from[key]) * t;
  }
  return live;
}
