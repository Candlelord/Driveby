// Terrain sets — the specific place you are driving through.
//
// Each mood owns a pool; a set is drawn from that pool when a mood block
// starts. A set owns landform, ground colour, which props scatter, and the
// optional features (water, light shafts, skyline, overpasses) that give it its
// character. Sky, light and grade still come from the mood — a set only nudges
// them, so every set in a pool still reads as that mood.
//
// `propMix` is a weighted list; each scatter slot rolls one type from it, so a
// forest can be mostly pines with the odd boulder.

export const SET_COLOR_KEYS = [
  'groundColorBase',
  'groundAccent',
  'propA',
  'propB',
  'propE', // emissive: windows, neon, glow
  'ridgeNearColor',
  'ridgeFarColor',
  'waterColor',
  'shaftColor',
  'skyNudge', // set-specific push on the mood's sky/fog
];

export const SET_NUMBER_KEYS = [
  // landform
  'hillHeight',
  'hillSharpness',
  'hillScale',
  'causeway', // how far the ground drops away from the road
  'cliffSide', // -1 or 1: which side rises into a wall; 0 for neither
  'cliffHeight',
  // scatter
  'propDensity',
  'propScale',
  // features
  'water', // 0 = none, else the water plane's opacity
  'waterSide', // -1 left, 1 right, 0 both sides
  'waterLevel',
  'shafts',
  'skyline',
  'overpasses',
  'groundFogAmount',
  'propEmissive',
  // feel
  'skyNudgeStrength',
  'roughness', // suspension bob amplitude
  'speedScale', // soft speed cap multiplier
  'ridgeOpacity',
  'ridgeHeight',
];

/** Defaults, so a set only has to state what makes it different. */
const BASE = {
  groundColorBase: 0x6d7a63,
  groundAccent: 0x5a6553,
  propA: 0x4d7a48,
  propB: 0x46403a,
  propE: 0xffd9a0,
  ridgeNearColor: 0x5f6d70,
  ridgeFarColor: 0x8d9aa4,
  waterColor: 0x35505e,
  shaftColor: 0xffe9b8,
  skyNudge: 0x808080,
  skyNudgeStrength: 0,
  hillHeight: 4,
  hillSharpness: 1,
  hillScale: 1,
  causeway: 0,
  cliffSide: 0,
  cliffHeight: 0,
  propDensity: 0.5,
  propScale: 1,
  water: 0,
  waterSide: 0,
  waterLevel: -3,
  shafts: 0,
  skyline: 0,
  overpasses: 0,
  groundFogAmount: 0,
  propEmissive: 0,
  roughness: 1,
  speedScale: 1,
  ridgeOpacity: 0.7,
  ridgeHeight: 1,
};

const set = (values) => ({ ...BASE, ...values });

export const TERRAIN_SETS = {
  // ---------------------------------------------------------------- SAD
  floodedPlain: set({
    label: 'flooded plain',
    climate: 'rain',
    propMix: [['deadTree', 0.85], ['pole', 0.15]],
    groundColorBase: 0x5c6668,
    groundAccent: 0x4a5456,
    propA: 0x3a3f40,
    propB: 0x2f3436,
    ridgeNearColor: 0x6b7476,
    ridgeFarColor: 0x848d90,
    waterColor: 0x50606a,
    hillHeight: 0.6,
    causeway: 3.2, // the road sits on a raised bank above the flood
    water: 0.9,
    waterSide: 0,
    waterLevel: -2.6,
    propDensity: 0.35,
    propScale: 1.1,
    ridgeOpacity: 0.4,
    ridgeHeight: 0.5,
    roughness: 0.9,
  }),

  cliffCoast: set({
    label: 'cliff coast',
    climate: 'rain',
    propMix: [['boulder', 0.55], ['deadTree', 0.25], ['guardrail', 0.2]],
    groundColorBase: 0x4e565c,
    groundAccent: 0x3d444a,
    propA: 0x525a60,
    propB: 0x3a4148,
    ridgeNearColor: 0x4a5560,
    ridgeFarColor: 0x76828c,
    waterColor: 0x2f4652,
    hillHeight: 7,
    hillSharpness: 1.5,
    cliffSide: 1,
    cliffHeight: 26,
    water: 0.85,
    waterSide: -1, // sea on the left, rock wall on the right
    waterLevel: -16,
    propDensity: 0.5,
    ridgeOpacity: 0.55,
    roughness: 1.35,
    speedScale: 0.92,
  }),

  burnedForest: set({
    label: 'burned forest',
    climate: 'ash',
    propMix: [['deadTree', 0.92], ['rock', 0.08]],
    groundColorBase: 0x4a423c,
    groundAccent: 0x3a3430,
    propA: 0x2a2522,
    propB: 0x231f1d,
    propE: 0x6f9a52,
    propEmissive: 0.35, // the few green shoots at the trunk bases
    skyNudge: 0xa07050,
    skyNudgeStrength: 0.35,
    ridgeNearColor: 0x4c4239,
    ridgeFarColor: 0x7d6a58,
    hillHeight: 5,
    propDensity: 0.95,
    propScale: 1.05,
    roughness: 1.6,
    speedScale: 0.95,
  }),

  ruralCrossroads: set({
    label: 'rural crossroads',
    climate: 'rain',
    propMix: [['pole', 0.45], ['silo', 0.2], ['barn', 0.2], ['deadTree', 0.15]],
    groundColorBase: 0x59604f,
    groundAccent: 0x474d3f,
    propA: 0x5a5148,
    propB: 0x3c3630,
    propE: 0xffc98a,
    propEmissive: 0.5,
    skyNudge: 0x6a5a86,
    skyNudgeStrength: 0.4,
    ridgeNearColor: 0x565c62,
    ridgeFarColor: 0x7b7f92,
    hillHeight: 1.6,
    propDensity: 0.45,
    ridgeOpacity: 0.4,
  }),

  // -------------------------------------------------------------- CHILL
  pineForest: set({
    label: 'pine forest',
    climate: 'mist',
    propMix: [['pine', 0.88], ['rock', 0.12]],
    groundColorBase: 0x3f5a3c,
    groundAccent: 0x33492f,
    propA: 0x2c4a33,
    propB: 0x3a2f26,
    ridgeNearColor: 0x3a5040,
    ridgeFarColor: 0x6d8478,
    hillHeight: 6.5,
    hillScale: 1.15,
    propDensity: 0.98,
    propScale: 1.15,
    shafts: 0.7,
    shaftColor: 0xdfeeb4,
    groundFogAmount: 0.7,
    roughness: 1.2,
    speedScale: 0.95,
  }),

  mistyLake: set({
    label: 'misty lake',
    climate: 'mist',
    propMix: [['pine', 0.6], ['rock', 0.25], ['grass', 0.15]],
    groundColorBase: 0x4c5a55,
    groundAccent: 0x3f4d49,
    propA: 0x35503f,
    propB: 0x3a352e,
    ridgeNearColor: 0x53616a,
    ridgeFarColor: 0x93a3ae,
    waterColor: 0x53707e,
    hillHeight: 5,
    water: 0.8,
    waterSide: -1,
    waterLevel: -2.2,
    propDensity: 0.55,
    ridgeOpacity: 0.95,
    ridgeHeight: 1.9, // distant peaks across the water
    groundFogAmount: 0.85,
  }),

  redwoodCorridor: set({
    label: 'redwood corridor',
    climate: 'mist',
    propMix: [['redwood', 0.8], ['pine', 0.2]],
    groundColorBase: 0x4a4636,
    groundAccent: 0x3b382c,
    propA: 0x2f4433,
    propB: 0x6b4230,
    ridgeNearColor: 0x40402f,
    ridgeFarColor: 0x6d7060,
    hillHeight: 4,
    propDensity: 1.0,
    propScale: 1.0,
    shafts: 1.0,
    shaftColor: 0xffd98a,
    groundFogAmount: 0.5,
    speedScale: 0.9,
  }),

  terracedValley: set({
    label: 'terraced valley',
    climate: 'clear',
    propMix: [['farmhouse', 0.3], ['round', 0.45], ['grass', 0.25]],
    groundColorBase: 0x6b6a4a,
    groundAccent: 0x585840,
    propA: 0x6f6a52,
    propB: 0x4a4234,
    propE: 0xffca7a,
    propEmissive: 0.8, // lit windows on the far farmhouses
    skyNudge: 0xd8a0b0,
    skyNudgeStrength: 0.3,
    ridgeNearColor: 0x6a6558,
    ridgeFarColor: 0xa08fa0,
    hillHeight: 9,
    hillSharpness: 1.4,
    hillScale: 0.7,
    terraced: true,
    propDensity: 0.6,
    ridgeOpacity: 0.85,
    ridgeHeight: 1.5,
  }),

  // -------------------------------------------------------------- HAPPY
  wheatFields: set({
    label: 'wheat fields',
    climate: 'clear',
    propMix: [['grass', 0.6], ['windmill', 0.15], ['silo', 0.25]],
    groundColorBase: 0xd8b45c,
    groundAccent: 0xc09c48,
    propA: 0xe8c86a,
    propB: 0x8a7040,
    ridgeNearColor: 0xc9ac6a,
    ridgeFarColor: 0xa8bcd0,
    hillHeight: 2.2,
    hillScale: 0.7,
    propDensity: 0.85,
    propScale: 1.1,
    speedScale: 1.08, // straight and open
  }),

  palmHighway: set({
    label: 'palm highway',
    climate: 'clear',
    propMix: [['palm', 0.8], ['grass', 0.2]],
    groundColorBase: 0xe0d2a8,
    groundAccent: 0xcabb90,
    propA: 0x4e9a52,
    propB: 0x8a6a44,
    ridgeNearColor: 0xd8c9a0,
    ridgeFarColor: 0x9ecad8,
    waterColor: 0x2fa8b8,
    hillHeight: 1.4,
    water: 0.95,
    waterSide: 1,
    waterLevel: -1.6,
    propDensity: 0.6,
    speedScale: 1.06,
  }),

  desertBloom: set({
    label: 'desert bloom',
    climate: 'clear',
    propMix: [['cactus', 0.35], ['rock', 0.3], ['flowers', 0.35]],
    groundColorBase: 0xc4794a,
    groundAccent: 0xa8623a,
    propA: 0x7a9a52,
    propB: 0x94502f,
    propE: 0xff8ab0,
    propEmissive: 0.55,
    ridgeNearColor: 0xb06840,
    ridgeFarColor: 0xd8a074,
    hillHeight: 8,
    hillSharpness: 1.6,
    hillScale: 0.65,
    propDensity: 0.6,
    ridgeOpacity: 0.85,
    ridgeHeight: 1.7,
    roughness: 1.3,
  }),

  orchardHills: set({
    label: 'orchard hills',
    climate: 'clear',
    propMix: [['round', 0.75], ['farmhouse', 0.12], ['grass', 0.13]],
    groundColorBase: 0x8cb055,
    groundAccent: 0x749443,
    propA: 0x5a9a42,
    propB: 0x7a5a3c,
    propE: 0xffe0a8,
    propEmissive: 0.3,
    ridgeNearColor: 0x7fa06a,
    ridgeFarColor: 0xa8c4d0,
    hillHeight: 5.5,
    hillScale: 0.8,
    propDensity: 0.8,
    propScale: 0.95,
  }),

  // ------------------------------------------------------------ HIP-HOP
  skylineDrive: set({
    label: 'skyline drive',
    climate: 'wetNight',
    propMix: [['building', 0.65], ['tower', 0.35]],
    groundColorBase: 0x1d1f2a,
    groundAccent: 0x16171f,
    propA: 0x20213a,
    propB: 0x14151f,
    propE: 0x46e8ff,
    propEmissive: 1,
    ridgeNearColor: 0x191b2a,
    ridgeFarColor: 0x2c3050,
    hillHeight: 1,
    causeway: 5.5, // elevated roadway
    skyline: 1,
    propDensity: 0.85,
    speedScale: 1.05,
  }),

  neonUnderpass: set({
    label: 'neon underpass',
    climate: 'wetNight',
    propMix: [['warehouse', 0.6], ['building', 0.4]],
    groundColorBase: 0x1a1a24,
    groundAccent: 0x131319,
    propA: 0x1e1f2c,
    propB: 0x121218,
    propE: 0xff3fa4,
    propEmissive: 1,
    ridgeNearColor: 0x16161f,
    ridgeFarColor: 0x262b40,
    hillHeight: 0.8,
    overpasses: 1,
    propDensity: 0.7,
    speedScale: 1.0,
  }),

  rooftopSkybridge: set({
    label: 'rooftop skybridge',
    climate: 'wetNight',
    propMix: [['warehouse', 0.5], ['building', 0.3], ['glowPlant', 0.2]],
    groundColorBase: 0x14161f,
    groundAccent: 0x0f1016,
    propA: 0x1b1d29,
    propB: 0x101118,
    propE: 0x7affc8,
    propEmissive: 1,
    ridgeNearColor: 0x151723,
    ridgeFarColor: 0x24293e,
    hillHeight: 0.5,
    causeway: 14, // the road runs above the rooftops
    skyline: 0.7,
    propDensity: 0.8,
    speedScale: 1.02,
  }),

  warehouseDistrict: set({
    label: 'warehouse district',
    climate: 'wetNight',
    propMix: [['warehouse', 0.62], ['pole', 0.38]],
    groundColorBase: 0x232630,
    groundAccent: 0x1a1c24,
    propA: 0x2a2c36,
    propB: 0x191b22,
    propE: 0xffa23a, // sodium orange
    propEmissive: 1,
    skyNudge: 0x8a5a3a,
    skyNudgeStrength: 0.3,
    ridgeNearColor: 0x24262f,
    ridgeFarColor: 0x3c4050,
    hillHeight: 0.8,
    propDensity: 0.8,
    roughness: 1.3,
  }),

  // ------------------------------------------------ shared bonus sets
  // Both of these sit in two pools, and read differently depending on which
  // mood's light is falling on them.
  mountainPass: set({
    label: 'mountain pass',
    climate: 'mist',
    propMix: [['guardrail', 0.4], ['rock', 0.35], ['pine', 0.25]],
    groundColorBase: 0x6a6c68,
    groundAccent: 0x525550,
    propA: 0x35503f,
    propB: 0x585a58,
    ridgeNearColor: 0x5c6470,
    ridgeFarColor: 0xb8c4d0, // snow-capped
    hillHeight: 22,
    hillSharpness: 2.1,
    hillScale: 1.3,
    cliffSide: -1,
    cliffHeight: 30,
    propDensity: 0.6,
    propScale: 1.2,
    ridgeOpacity: 1,
    ridgeHeight: 2.6,
    groundFogAmount: 0.5,
    roughness: 1.7,
    speedScale: 0.85, // tight road
  }),

  bioluminescentValley: set({
    label: 'bioluminescent valley',
    climate: 'clearNight',
    propMix: [['glowPlant', 0.55], ['pine', 0.25], ['rock', 0.2]],
    groundColorBase: 0x141c22,
    groundAccent: 0x0e151a,
    propA: 0x1b3038,
    propB: 0x14202a,
    propE: 0x46ffd8,
    propEmissive: 1,
    ridgeNearColor: 0x121c24,
    ridgeFarColor: 0x22384a,
    waterColor: 0x1a4a52,
    hillHeight: 8,
    hillScale: 0.9,
    water: 0.7,
    waterSide: -1,
    waterLevel: -2.4,
    propDensity: 0.9,
    propScale: 1.0,
    fireflies: true,
    groundFogAmount: 0.4,
    speedScale: 0.9,
  }),
};

/** Which sets each mood draws from. The bonus sets appear in two pools each. */
export const TERRAIN_POOLS = {
  sad: ['floodedPlain', 'cliffCoast', 'burnedForest', 'ruralCrossroads', 'mountainPass'],
  chill: [
    'pineForest',
    'mistyLake',
    'redwoodCorridor',
    'terracedValley',
    'mountainPass',
    'bioluminescentValley',
  ],
  happy: ['wheatFields', 'palmHighway', 'desertBloom', 'orchardHills'],
  hiphop: [
    'skylineDrive',
    'neonUnderpass',
    'rooftopSkybridge',
    'warehouseDistrict',
    'bioluminescentValley',
  ],
};

export const SET_NAMES = Object.keys(TERRAIN_SETS);
