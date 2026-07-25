// Mood profiles + mock playback data.
//
// Every mood is a *flat* bag of colours and numbers so the crossfade engine can
// blend two of them generically (see blend.js). The one non-blendable field is
// `propType`, which the director turns into per-type blend weights instead.
//
// Colours are authored as sRGB hex; three.js converts them to the linear
// working space on assignment.

export const COLOR_KEYS = [
  'skyTop',
  'skyBottom',
  'fogColor',
  'ambientColor',
  'sunColor',
  'discColor',
  'roadColor',
  'lineColor',
  'shoulderColor',
  'groundColor',
  'propA',
  'propB',
  'lampColor',
  'rainColor',
  'dustColor',
  'accent',
];

export const NUMBER_KEYS = [
  'fogDensity',
  'ambientIntensity',
  'sunIntensity',
  'sunAzimuth',
  'sunElevation',
  'discSize',
  'discOpacity',
  'hillHeight',
  'propDensity',
  'propScale',
  'lampIntensity',
  'rain',
  'dust',
  'dustSize',
];

export const PROP_TYPES = ['pine', 'round', 'rock', 'building'];

/**
 * Starting-point values straight off the spec table. Tuned by eye, not sacred.
 */
export const MOOD_PROFILES = {
  // Cool desaturated blue-grey, flat low light, light rain and thick fog.
  sad: {
    label: 'sad',
    propType: 'pine',
    skyTop: 0x3d4a5a,
    skyBottom: 0x717d8a,
    fogColor: 0x717d8a,
    fogDensity: 0.0132,
    ambientColor: 0x8e9aa8,
    ambientIntensity: 1.45,
    sunColor: 0xa8b4c2,
    sunIntensity: 0.75,
    sunAzimuth: -0.7,
    sunElevation: 0.55,
    discColor: 0xb9c3ce,
    discSize: 30,
    discOpacity: 0.1,
    roadColor: 0x3a4048,
    lineColor: 0x9aa3ad,
    shoulderColor: 0x4a5058,
    groundColor: 0x525f63,
    propA: 0x2f4045,
    propB: 0x353a3c,
    lampColor: 0xaebccc,
    lampIntensity: 0.16,
    rainColor: 0xc3ccd6,
    rain: 0.6,
    dustColor: 0x9aa6b2,
    dust: 0.12,
    dustSize: 2.4,
    hillHeight: 5.5,
    propDensity: 0.55,
    propScale: 1.0,
    accent: 0x8fa3bb,
  },

  // Soft purple dusk, warm low-angle light, light mist and no rain.
  chill: {
    label: 'chill',
    propType: 'rock',
    skyTop: 0x3b3160,
    skyBottom: 0xc08a7e,
    fogColor: 0xa4808c,
    fogDensity: 0.0102,
    ambientColor: 0xa08cb4,
    ambientIntensity: 1.15,
    sunColor: 0xffb37a,
    sunIntensity: 1.5,
    sunAzimuth: 0.42,
    sunElevation: 0.11,
    discColor: 0xffc98e,
    discSize: 52,
    discOpacity: 0.85,
    roadColor: 0x4a3f4c,
    lineColor: 0xd8b8a8,
    shoulderColor: 0x6b5257,
    groundColor: 0x7c5f66,
    propA: 0x6c5563,
    propB: 0x53414e,
    lampColor: 0xffcf9a,
    lampIntensity: 0.35,
    rainColor: 0xd8c4cc,
    rain: 0.0,
    dustColor: 0xd8b6bd,
    dust: 0.42,
    dustSize: 3.4,
    hillHeight: 8.0,
    propDensity: 0.32,
    propScale: 1.25,
    accent: 0xd08fa8,
  },

  // Bright clear sky, warm palette, high sun-like intensity, no particles.
  happy: {
    label: 'happy',
    propType: 'round',
    skyTop: 0x2f86d8,
    skyBottom: 0xbfe4f2,
    fogColor: 0xc4e6f0,
    fogDensity: 0.0056,
    ambientColor: 0xdcefff,
    ambientIntensity: 1.6,
    sunColor: 0xfff2d0,
    sunIntensity: 2.6,
    sunAzimuth: -0.42,
    sunElevation: 0.5,
    discColor: 0xfff6dc,
    discSize: 26,
    discOpacity: 0.95,
    roadColor: 0x50565e,
    lineColor: 0xf4f0e2,
    shoulderColor: 0x8f8f70,
    groundColor: 0x7fae52,
    propA: 0x5fa346,
    propB: 0x7a5a3c,
    lampColor: 0xfff0c8,
    lampIntensity: 0.0,
    rainColor: 0xffffff,
    rain: 0.0,
    dustColor: 0xfff0c0,
    dust: 0.0,
    dustSize: 1.4,
    hillHeight: 3.2,
    propDensity: 0.6,
    propScale: 1.05,
    accent: 0x64c86e,
  },

  // Deep night, neon rim light, high contrast, occasional light dust.
  hiphop: {
    label: 'hip-hop',
    propType: 'building',
    skyTop: 0x080a16,
    skyBottom: 0x2a1c3a,
    fogColor: 0x1a1426,
    fogDensity: 0.0094,
    ambientColor: 0x3c2c5a,
    ambientIntensity: 0.85,
    sunColor: 0xff3fa4,
    sunIntensity: 1.55,
    sunAzimuth: 0.62,
    sunElevation: 0.38,
    discColor: 0xdcdcf0,
    discSize: 18,
    discOpacity: 0.9,
    roadColor: 0x1c1c24,
    lineColor: 0x8f8fb2,
    shoulderColor: 0x232330,
    groundColor: 0x191a24,
    propA: 0x20213a,
    propB: 0x14151f,
    lampColor: 0x46e8ff,
    lampIntensity: 1.0,
    rainColor: 0x8ea8ff,
    rain: 0.0,
    dustColor: 0xff8ad4,
    dust: 0.4,
    dustSize: 0.9,
    hillHeight: 1.2,
    propDensity: 0.75,
    propScale: 1.0,
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
  {
    mood: 'sad',
    songCount: 4,
    terrainProfile: 'rolling-pines',
    weatherProfile: 'light-rain',
  },
  {
    mood: 'chill',
    songCount: 3,
    terrainProfile: 'dusk-dunes',
    weatherProfile: 'mist',
  },
  {
    mood: 'happy',
    songCount: 4,
    terrainProfile: 'open-meadow',
    weatherProfile: 'clear',
  },
  {
    mood: 'hiphop',
    songCount: 3,
    terrainProfile: 'night-city',
    weatherProfile: 'dust',
  },
];
