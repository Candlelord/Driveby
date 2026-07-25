// Terrain types — the landform you are driving through.
//
// Independent of mood: mood decides how the world is *lit*, terrain decides
// what shape it is and what grows on it. They cycle on separate clocks, so the
// road can carry you out of a forest and into mountains without the music
// having to change.

export const TERRAIN_COLOR_KEYS = [
  'groundColorBase',
  'groundAccent',
  'propA',
  'propB',
  'ridgeNearColor',
  'ridgeFarColor',
];

export const TERRAIN_NUMBER_KEYS = [
  'hillHeight',
  'hillSharpness', // >1 pushes peaks up and flattens valleys; <1 rounds it off
  'hillScale', // frequency multiplier — big slow forms vs. tight ripples
  'propDensity',
  'propScale',
  'ridgeOpacity',
  'ridgeHeight',
];

export const PROP_TYPES = ['round', 'pine', 'cactus', 'rock', 'building'];

export const TERRAIN_PROFILES = {
  // Wide open farmland. The default state of the road: nothing in the way.
  plains: {
    label: 'plains',
    propType: 'round',
    groundColorBase: 0x86ab5c,
    groundAccent: 0x9dbd68,
    propA: 0x5fa346,
    propB: 0x7a5a3c,
    ridgeNearColor: 0x7fa87c,
    ridgeFarColor: 0x9ec4d8,
    hillHeight: 3.4,
    hillSharpness: 1.0,
    hillScale: 0.85,
    propDensity: 0.5,
    propScale: 1.05,
    ridgeOpacity: 0.55,
    ridgeHeight: 0.9,
  },

  // Close, dark and crowded — the horizon disappears behind trees.
  forest: {
    label: 'forest',
    propType: 'pine',
    groundColorBase: 0x4c7347,
    groundAccent: 0x3d5c3a,
    propA: 0x2f5138,
    propB: 0x40352c,
    ridgeNearColor: 0x3d5a48,
    ridgeFarColor: 0x6e8a84,
    hillHeight: 6.2,
    hillSharpness: 1.15,
    hillScale: 1.1,
    propDensity: 0.92,
    propScale: 1.2,
    ridgeOpacity: 0.8,
    ridgeHeight: 1.0,
  },

  // Big smooth dunes and almost nothing on them. The emptiest terrain.
  desert: {
    label: 'desert',
    propType: 'cactus',
    groundColorBase: 0xc9a46e,
    groundAccent: 0xb08a56,
    propA: 0x6f8f52,
    propB: 0x8a6f42,
    ridgeNearColor: 0xbb9468,
    ridgeFarColor: 0xd8bc94,
    hillHeight: 9.5,
    hillSharpness: 0.7, // rounded, wind-shaped
    hillScale: 0.6,
    propDensity: 0.32,
    propScale: 1.05,
    ridgeOpacity: 0.7,
    ridgeHeight: 1.2,
  },

  // Jagged and vertical. Sharpness does most of the work here.
  mountains: {
    label: 'mountains',
    propType: 'rock',
    groundColorBase: 0x6e6a62,
    groundAccent: 0x585449,
    propA: 0x736d63,
    propB: 0x4e4a44,
    ridgeNearColor: 0x555a63,
    ridgeFarColor: 0x8d96a4,
    hillHeight: 17,
    hillSharpness: 1.9,
    hillScale: 1.25,
    propDensity: 0.42,
    propScale: 1.6,
    ridgeOpacity: 0.95,
    ridgeHeight: 2.1,
  },

  // Flat ground, vertical everything else.
  city: {
    label: 'city',
    propType: 'building',
    groundColorBase: 0x3c3e46,
    groundAccent: 0x2e3037,
    propA: 0x2a2c3c,
    propB: 0x1b1c24,
    ridgeNearColor: 0x2b2d3a,
    ridgeFarColor: 0x424658,
    hillHeight: 1.0,
    hillSharpness: 1.0,
    hillScale: 1.0,
    propDensity: 0.85,
    propScale: 1.0,
    ridgeOpacity: 0.85,
    ridgeHeight: 0.7,
  },
};

export const TERRAIN_ORDER = ['plains', 'forest', 'mountains', 'desert', 'city'];
