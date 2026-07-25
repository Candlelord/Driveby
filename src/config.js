// Central tuning knobs for the v0.1 prototype. Everything here is meant to be
// fiddled with while the dev server is running — driving feel and transition
// pacing are the two things this build exists to test.

export const CONFIG = {
  // --- road geometry ---
  segmentLength: 4, // world units per road segment
  segmentsAhead: 90, // ~360 units of road drawn in front of the car
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

  // --- rendering ---
  // 'auto' starts with bloom and drops it if frames get expensive; 'high' and
  // 'low' pin it on or off.
  quality: 'auto',
  bloomDropFrameMs: 26,
  maxPixelRatio: 2,

  // --- mood block clock ---
  // Stand-in for "a song finished playing". Real audio replaces this later.
  songSeconds: 14,
  crossfadeSeconds: 4, // spec asks for a 3–5s crossfade between blocks

  // --- scenery ---
  propSpacing: 11,
  propSlots: 44,
  lampSpacing: 34,
  lampSlots: 16,

  // --- weather ---
  maxRainStreaks: 1400,
  maxDustMotes: 600,
};
