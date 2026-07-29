// Mood profiles + mock playback data.
//
// Mood is one of three independent environment axes. It owns *light and look*:
// sky, sun, lamps, lens and colour grade. It does not own landform (see
// terrains.js) or weather (see climates.js) — those cycle on their own clocks,
// so any mood can happen in any terrain in any weather.
//
// Keys ending in `Base` are composed with a climate value before use; see
// `compose()` in environment.js.
//
// Colours are authored as sRGB hex; three.js converts them to the linear
// working space on assignment.

export const MOOD_COLOR_KEYS = [
  // sky
  'skyTopBase',
  'skyHorizonBase',
  'skyBottomBase',
  'fogColorBase',
  'sunGlowColor',
  'starColor',
  'cloudColor',
  'cloudLitColor',
  // light
  'ambientColor',
  'sunColor',
  'discColor',
  // road surface
  'roadColor',
  'lineColor',
  'dashColor',
  'shoulderColor',
  'lampColor',
  // grade
  'shadowTint',
  'highlightTint',
  'accent',
];

export const MOOD_NUMBER_KEYS = [
  // sky
  'horizonStrength',
  'horizonWidth',
  'sunGlowStrength',
  'sunGlowPower',
  'starOpacity',
  'cloudAmount',
  'cloudSharpness',
  'fogScale', // multiplies the climate's fog density
  // light
  'ambientIntensityBase',
  'sunIntensityBase',
  'sunAzimuth',
  'sunElevation',
  'discSize',
  'discOpacity',
  'discIntensity',
  'lampIntensity',
  'headlightBias', // how much the car wants its lights on, beyond the street lamps
  // camera + lens
  'fov',
  'bloomStrength',
  'bloomThreshold',
  'bloomRadius',
  'exposure',
  'contrast',
  'saturation',
  'tintStrength',
  'vignette',
  'grain',
  'aberration',
];

export const MOOD_PROFILES = {
  // Overcast and cold. Flat light, no shadows to speak of, the frame closing
  // in around the car.
  sad: {
    label: 'sad',

    skyTopBase: 0x36434f,
    skyHorizonBase: 0x8f9aa4,
    skyBottomBase: 0x717d8a,
    fogColorBase: 0x717d8a,
    fogScale: 1.35,
    horizonStrength: 0.55,
    horizonWidth: 0.18,
    sunGlowColor: 0xb4c0cc,
    sunGlowStrength: 0.16,
    sunGlowPower: 12,
    starColor: 0xffffff,
    cloudColor: 0x9aa4ae,
    cloudLitColor: 0xc4ccd4,
    cloudAmount: 0.95,
    cloudSharpness: 0.5,
    starOpacity: 0,

    ambientColor: 0x8e9aa8,
    ambientIntensityBase: 6.4,
    sunColor: 0xa8b4c2,
    sunIntensityBase: 2.2,
    sunAzimuth: -0.7,
    sunElevation: 0.55,
    discColor: 0xb9c3ce,
    discSize: 30,
    discOpacity: 0.1,
    discIntensity: 1.0,

    roadColor: 0x3f444b,
    lineColor: 0x9aa3ad,
    dashColor: 0xb8c0c8,
    shoulderColor: 0x4a5058,
    lampColor: 0xaebccc,
    lampIntensity: 0.16,
    headlightBias: 0.3,

    fov: 60,
    bloomStrength: 0.15,
    bloomThreshold: 0.9,
    bloomRadius: 0.6,
    exposure: 1.12,
    contrast: 1.05,
    saturation: 0.75,
    shadowTint: 0x9fb4cc,
    highlightTint: 0xe0e2e4,
    tintStrength: 0.28,
    vignette: 0.18,
    grain: 0,
    aberration: 0.08,
    accent: 0x8fa3bb,
  },

  // Golden hour. Long warm light raking across the land, purple sky above.
  chill: {
    label: 'chill',

    skyTopBase: 0x352b5c,
    skyHorizonBase: 0xe8a07e,
    skyBottomBase: 0xb8828a,
    fogColorBase: 0xa4808c,
    fogScale: 1.0,
    horizonStrength: 0.72,
    horizonWidth: 0.3,
    sunGlowColor: 0xffb072,
    sunGlowStrength: 0.85,
    sunGlowPower: 5,
    starColor: 0xcfd6ff,
    cloudColor: 0x8a6a86,
    cloudLitColor: 0xffc79a,
    cloudAmount: 0.55,
    cloudSharpness: 0.16,
    starOpacity: 0.18,

    ambientColor: 0xa08cb4,
    ambientIntensityBase: 2.5,
    sunColor: 0xffb37a,
    sunIntensityBase: 4.5,
    sunAzimuth: 0.42,
    sunElevation: 0.11,
    discColor: 0xffc98e,
    discSize: 52,
    discOpacity: 0.9,
    discIntensity: 1.6,

    roadColor: 0x4a3f4c,
    lineColor: 0xd8b8a8,
    dashColor: 0xf0b070,
    shoulderColor: 0x6b5257,
    lampColor: 0xffcf9a,
    lampIntensity: 0.35,
    headlightBias: 0.45,

    fov: 63,
    bloomStrength: 0.35,
    bloomThreshold: 0.75,
    bloomRadius: 0.8,
    exposure: 1.1,
    contrast: 1.04,
    saturation: 1.04,
    shadowTint: 0x8f83c0,
    highlightTint: 0xffd0a8,
    tintStrength: 0.3,
    vignette: 0.2,
    grain: 0,
    aberration: 0.12,
    accent: 0xd08fa8,
  },

  // Clear midday. The widest, brightest, cleanest frame.
  happy: {
    label: 'happy',

    skyTopBase: 0x2f86d8,
    skyHorizonBase: 0xdff2f8,
    skyBottomBase: 0xbfe4f2,
    fogColorBase: 0xc4e6f0,
    fogScale: 0.8,
    horizonStrength: 0.5,
    horizonWidth: 0.16,
    sunGlowColor: 0xfff0c4,
    sunGlowStrength: 0.35,
    sunGlowPower: 8,
    starColor: 0xffffff,
    cloudColor: 0xf4fbff,
    cloudLitColor: 0xffffff,
    cloudAmount: 0.42,
    cloudSharpness: 0.1,
    starOpacity: 0,

    ambientColor: 0xdcefff,
    ambientIntensityBase: 2.6,
    sunColor: 0xfff2d0,
    sunIntensityBase: 6.0,
    sunAzimuth: -0.42,
    sunElevation: 0.5,
    discColor: 0xfff6dc,
    discSize: 26,
    discOpacity: 0.95,
    discIntensity: 2.0,

    roadColor: 0x50565e,
    lineColor: 0xf4f0e2,
    dashColor: 0xf2c052,
    shoulderColor: 0x8f8f70,
    lampColor: 0xfff0c8,
    lampIntensity: 0.0,
    headlightBias: 0.0,

    fov: 66,
    bloomStrength: 0.22,
    bloomThreshold: 0.85,
    bloomRadius: 0.5,
    exposure: 1.05,
    contrast: 1.03,
    saturation: 1.1,
    shadowTint: 0xb4c8e4,
    highlightTint: 0xfff2da,
    tintStrength: 0.16,
    vignette: 0.14,
    grain: 0,
    aberration: 0.06,
    accent: 0x64c86e,
  },

  // Deep night. Hardest contrast, heaviest bloom, everything that emits light
  // gets to bleed.
  hiphop: {
    label: 'hip-hop',

    skyTopBase: 0x06070f,
    skyHorizonBase: 0x4a2354,
    skyBottomBase: 0x2a1c3a,
    fogColorBase: 0x1a1426,
    fogScale: 1.05,
    horizonStrength: 0.62,
    horizonWidth: 0.13,
    sunGlowColor: 0x8a4ad0,
    sunGlowStrength: 0.22,
    sunGlowPower: 9,
    starColor: 0xdce4ff,
    cloudColor: 0x1a1830,
    cloudLitColor: 0x4a3a68,
    cloudAmount: 0.5,
    cloudSharpness: 0.2,
    starOpacity: 0.95,

    ambientColor: 0x4a4272,
    ambientIntensityBase: 2.8,
    sunColor: 0xb87ad0,
    sunIntensityBase: 0.85,
    sunAzimuth: 0.62,
    sunElevation: 0.38,
    discColor: 0xdcdcf0,
    discSize: 18,
    discOpacity: 0.9,
    discIntensity: 1.3,

    roadColor: 0x1c1c24,
    lineColor: 0x8f8fb2,
    dashColor: 0xc8a0ff,
    shoulderColor: 0x232330,
    lampColor: 0x46e8ff,
    lampIntensity: 1.0,
    headlightBias: 1.0,

    fov: 61,
    bloomStrength: 0.6,
    bloomThreshold: 0.62,
    bloomRadius: 0.85,
    exposure: 1.18,
    contrast: 1.1,
    saturation: 1.04,
    shadowTint: 0x7a6ad8,
    highlightTint: 0xffaadd,
    tintStrength: 0.28,
    vignette: 0.24,
    grain: 0,
    aberration: 0.16,
    accent: 0xff4fb0,
  },
};

/**
 * Fixed loop order for v0.1: sad -> chill -> happy -> hiphop -> repeat.
 */
export const BLOCK_ORDER = ['sad', 'chill', 'happy', 'hiphop'];

/**
 * Mock "blocks of songs". Stands in for the Spotify-sourced mood buckets that
 * arrive in the next build phase — songCount is the only thing playback needs
 * to know, since block length is song-count driven rather than timer driven.
 */
export const MOCK_BLOCKS = [
  { mood: 'sad', songCount: 4 },
  { mood: 'chill', songCount: 3 },
  { mood: 'happy', songCount: 4 },
  { mood: 'hiphop', songCount: 3 },
];
