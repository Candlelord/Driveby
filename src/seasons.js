// The season wheel.
//
// A fifth layer, and the only one that is a *cycle* rather than a playlist of
// discrete states: the year turns continuously with distance, so there is never
// a moment where the season changes. Spring becomes summer the way it actually
// does, over a long time, without a crossfade you could point at.
//
// It applies on top of whatever the terrain set already decided. A pine forest
// stays a pine forest through the year — its greens warm and cool, its ground
// goes from new growth to gold to bleached, and in autumn its leaves come down.
// The set keeps its identity; the season only tints it.
//
// Nothing here fights the climate layer. Precipitation combines by `max`, so an
// autumn's leaf fall never cancels a set's rain, and a snow climate is still
// snow in July — that reads as altitude, which is fine.

import { blendProfiles } from './blend.js';

export const SEASON_COLOR_KEYS = ['foliage', 'seasonGround', 'leafColor'];
export const SEASON_NUMBER_KEYS = [
  'foliageStrength', // how hard the season pulls foliage off the set's green
  'seasonGroundStrength',
  'leafFall', // falling leaves, on the climate layer's drift system
  'seasonWarmth', // pushes the whole grade warm or cold
  'seasonDry', // desaturates: high summer and deep winter both wash out
];

const SEASON_KEYS = { colors: SEASON_COLOR_KEYS, numbers: SEASON_NUMBER_KEYS };

/**
 * Four points on the wheel. Values are what the season *pulls toward*, never
 * absolutes — `foliageStrength` decides how much of the set's own colour
 * survives, and it is deliberately well under 1 everywhere so no season ever
 * paints every place the same.
 */
export const SEASONS = {
  spring: {
    label: 'spring',
    foliage: 0x7fc24a, // new growth: yellower and brighter than midsummer
    foliageStrength: 0.42,
    seasonGround: 0x7fae53,
    seasonGroundStrength: 0.42,
    leafColor: 0xffd9e8,
    leafFall: 0.12, // blossom, not leaves
    seasonWarmth: 0.15,
    seasonDry: 0,
  },
  summer: {
    label: 'summer',
    foliage: 0x3f8a34, // deep and saturated, the reference the others move off
    foliageStrength: 0.3,
    seasonGround: 0x6f8f3a,
    seasonGroundStrength: 0.26,
    leafColor: 0xe8d98a,
    leafFall: 0,
    seasonWarmth: 0.4,
    seasonDry: 0.18, // sun-bleached by August
  },
  autumn: {
    label: 'autumn',
    foliage: 0xc9762a,
    foliageStrength: 0.62, // the season that most visibly takes over
    seasonGround: 0xb08a2c,
    seasonGroundStrength: 0.55,
    leafColor: 0xd8913c,
    leafFall: 0.75,
    seasonWarmth: 0.5,
    seasonDry: 0.1,
  },
  winter: {
    label: 'winter',
    // Lighter than it looks: colours blend in linear space, so a target that
    // reads "drained grey-green" in a swatch barely shifts a saturated summer
    // green at all. Winter has to aim well past where it wants to land.
    foliage: 0x93a394, // not dead, just drained — grey-green, never grey
    foliageStrength: 0.62,
    seasonGround: 0xbcc3b6,
    seasonGroundStrength: 0.64,
    leafColor: 0xffffff,
    leafFall: 0.1, // the last few, mostly bare by now
    seasonWarmth: -0.5,
    seasonDry: 0.3,
  },
};

export const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];

/**
 * Where on the wheel a given distance falls.
 *
 * `t` runs from the *height* of `fromId` to the height of `toId`, so t = 0 is
 * fully spring rather than the first day of it. The label follows that: the
 * quarter either side of a peak is the season plain, and the middle of a
 * crossing is "late spring" going into "early summer". Naming it this way
 * means the HUD never flickers between two seasons at a boundary, because
 * there is no boundary — only a handover.
 */
export function seasonAt(distance, seasonLength) {
  const year = seasonLength * SEASON_ORDER.length;
  // Positive modulo: the road runs backwards past the start point.
  const phase = (((distance % year) + year) % year) / seasonLength;
  const index = Math.floor(phase);
  const t = phase - index;

  const fromId = SEASON_ORDER[index % SEASON_ORDER.length];
  const toId = SEASON_ORDER[(index + 1) % SEASON_ORDER.length];

  let label;
  if (t < 0.25) label = SEASONS[fromId].label;
  else if (t < 0.5) label = `late ${SEASONS[fromId].label}`;
  else if (t < 0.75) label = `early ${SEASONS[toId].label}`;
  else label = SEASONS[toId].label;

  return { fromId, toId, t, label };
}

/** Write the blended season for this distance into `live`. */
export function writeSeason(live, distance, seasonLength) {
  const { fromId, toId, t } = seasonAt(distance, seasonLength);
  blendProfiles(live, SEASONS[fromId], SEASONS[toId], t, SEASON_KEYS);
}

export { SEASON_KEYS };
