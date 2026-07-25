import * as THREE from 'three';
import { COLOR_KEYS, NUMBER_KEYS } from './moods.js';

/**
 * A "live" profile: the same shape as a mood profile, but with persistent
 * THREE.Color instances so blending each frame allocates nothing.
 */
export function createLiveProfile() {
  const live = {};
  for (const key of COLOR_KEYS) live[key] = new THREE.Color();
  for (const key of NUMBER_KEYS) live[key] = 0;
  return live;
}

/** Cache of profile hexes -> Color, so we never re-parse hex per frame. */
const colorCache = new Map();

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

/**
 * Blend two mood profiles into `live`. `t` of 0 is all `from`, 1 is all `to`.
 * Colours blend in three's linear working space, which keeps midpoints from
 * going muddy the way naive sRGB lerps do.
 */
export function blendProfiles(live, from, to, t) {
  for (const key of COLOR_KEYS) {
    live[key].lerpColors(colorFor(from, key), colorFor(to, key), t);
  }
  for (const key of NUMBER_KEYS) {
    live[key] = from[key] + (to[key] - from[key]) * t;
  }
  return live;
}
