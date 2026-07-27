/**
 * Device tiering.
 *
 * Two kinds of setting live here. Budgets (buffer sizes, draw distance) are
 * fixed at startup because changing them means reallocating geometry. Bloom and
 * pixel ratio are adjustable at runtime, so those are what the frame-time
 * watchdog in post.js walks back when a device can't keep up.
 */

export const TIERS = {
  high: {
    name: 'high',
    pixelRatio: 2,
    bloom: true,
    segmentsAhead: 90,
    terrainColumns: 16,
    terrainRowStride: 2,
    propSlots: 92,
    lampSlots: 16,
    trafficSlots: 7,
    rainStreaks: 1400,
    snowFlakes: 900,
    hazeMotes: 600,
    stars: 420,
    ridgeSegments: 96,
  },
  medium: {
    name: 'medium',
    pixelRatio: 1.5,
    bloom: true,
    segmentsAhead: 74,
    terrainColumns: 12,
    terrainRowStride: 2,
    propSlots: 70,
    lampSlots: 12,
    trafficSlots: 5,
    rainStreaks: 800,
    snowFlakes: 520,
    hazeMotes: 340,
    stars: 280,
    ridgeSegments: 72,
  },
  low: {
    name: 'low',
    pixelRatio: 1.25,
    bloom: false,
    segmentsAhead: 58,
    terrainColumns: 10,
    terrainRowStride: 3,
    propSlots: 50,
    lampSlots: 9,
    trafficSlots: 4,
    rainStreaks: 420,
    snowFlakes: 280,
    hazeMotes: 180,
    stars: 180,
    ridgeSegments: 56,
  },
};

export const TIER_ORDER = ['high', 'medium', 'low'];

/**
 * Pick a starting tier. Deliberately conservative on touch devices: it is far
 * better to start at medium and stay smooth than to start at high and stutter
 * for the three seconds the watchdog needs to notice.
 */
export function detectTier() {
  if (typeof window === 'undefined') return TIERS.high;

  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = navigator.deviceMemory ?? 4;

  if (!coarse) return cores <= 4 ? TIERS.medium : TIERS.high;
  if (cores <= 4 || memory <= 3) return TIERS.low;
  return TIERS.medium;
}

/** Read `?quality=low` so a tier can be forced on a real device for testing. */
export function tierFromQuery() {
  if (typeof window === 'undefined') return null;
  const requested = new URLSearchParams(window.location.search).get('quality');
  return requested && TIERS[requested] ? TIERS[requested] : null;
}
