// Central tuning knobs.
//
// Anything that varies by device lives in quality.js instead; `applyTier()`
// copies the budget values from the chosen tier into here at startup so the
// rest of the code has one place to read from.

export const CONFIG = {
  // --- road geometry ---
  segmentLength: 4, // world units per road segment
  segmentsAhead: 90, // set from the quality tier
  segmentsBehind: 8, // enough to fill in behind the chase cam
  roadHalfWidth: 6.2, // asphalt edge (centre line to outer lane marking)
  laneMarkWidth: 0.5,
  shoulderWidth: 2.8,

  // --- driving ---
  speed: 34, // constant forward speed, world units/sec
  maxLateral: 4.6, // how far off centre the car may drift before clamping
  steerResponse: 3.4, // how fast raw input is smoothed into steering
  steerRate: 7.2, // lateral units/sec at full lock

  // --- chase camera ---
  camHeight: 4.6,
  camDistance: 10.5,
  camLag: 6, // exponential smoothing rate
  camLookAhead: 45, // how far up the road the camera aims
  camRoll: 0.35, // how far the camera banks into a corner
  camSway: 0.055, // handheld drift, in world units

  // --- environment clocks ---
  // The three axes deliberately do not share a schedule.
  songSeconds: 14, // stand-in for "a song finished"; real audio replaces this
  crossfadeSeconds: 4, // mood: spec asks for 3-5s
  terrainRunLength: 2600, // world units of one landform before it changes
  terrainCrossfadeSeconds: 9, // land should morph slowly
  climateRunSeconds: 70,
  climateCrossfadeSeconds: 11, // weather rolls in slower still
  lightningInterval: 7,

  // --- scenery ---
  propSpacing: 11,
  lampSpacing: 34,

  // --- rendering ---
  bloomDropFrameMs: 26,
};

/** Copy a quality tier's budgets into CONFIG. Called once, before anything reads them. */
export function applyTier(tier) {
  CONFIG.segmentsAhead = tier.segmentsAhead;
  CONFIG.tier = tier.name;
  return CONFIG;
}
