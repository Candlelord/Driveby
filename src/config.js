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
  speed: 34, // base cruise, world units/sec; terrain sets scale it
  accelRate: 0.85, // how hard the car pulls toward its target speed
  brakeRate: 2.2, // easing off is quicker than getting up to speed
  maxLateral: 4.6, // road edge
  edgeSoftness: 0.9, // how far past the edge the car can stray
  edgeReturn: 5.5, // how firmly the verge pushes back
  steerResponse: 3.4, // wheel follows the finger
  steerFollow: 6.5, // car follows the wheel
  steerRate: 7.2, // lateral units/sec at full lock
  bodyRoll: 0.075, // radians of lean at full lock
  rollFollow: 4.5,

  // --- chase camera ---
  camHeight: 4.6,
  camDistance: 10.5,
  camLag: 6, // exponential smoothing rate
  camLookAhead: 45, // how far up the road the camera aims
  camRoll: 0.35, // how far the camera banks into a corner
  camSway: 0.055, // handheld drift, in world units

  // --- environment clocks ---
  songSeconds: 14, // stand-in for "a song finished"; real audio replaces this
  crossfadeSeconds: 4, // mood: spec asks for 3-5s
  setCrossfadeSeconds: 5, // terrain set colours and landform
  propSwapDistance: 330, // scenery swaps this far ahead, i.e. outside the fog
  lightningInterval: 7,

  // --- season wheel ---
  // World units per season, so a full year is four times this. At the base
  // cruise that puts a season at roughly a minute and a half and a year at
  // about six minutes — long enough that the change is something you notice
  // having happened rather than something you watch happen.
  seasonLength: 3100,

  // --- extreme weather events ---
  eventFirstDelay: 150, // seconds before the first one can fire
  eventCooldown: 190, // average gap between attempts
  eventChance: 0.55, // chance an attempt actually starts something

  // --- landmarks ---
  landmarkFirstAt: 1800, // world units before the first one
  landmarkSpacing: 5200, // average gap between them
  landmarkApproach: 520, // built and visible this far out
  // How far ahead of a landmark its country takes over. At the base cruise
  // this is close to a minute of driving, and the scenery swap lands about
  // forty seconds out — long enough that the place registers as somewhere you
  // are travelling through rather than as dressing around the monument.
  landmarkRegionLead: 1750,
  landmarkExit: 220, // retired once this far behind

  // --- scenery ---
  propSpacing: 4.5, // candidate slot every 4.5 units, alternating sides
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
