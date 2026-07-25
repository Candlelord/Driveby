// Climate types — the air you are driving through.
//
// The third independent axis. Climate owns precipitation, visibility and how
// much it dims and veils whatever the mood is doing, so a storm reads as a
// storm at midday or at midnight without either mood knowing about it.

export const CLIMATE_COLOR_KEYS = [
  'veilColor', // sky and fog get pulled toward this
  'precipColor',
  'hazeColor',
  'groundTint', // snow whitens whatever terrain is underneath
];

export const CLIMATE_NUMBER_KEYS = [
  'fogDensityBase',
  'veilStrength',
  'lightDamp', // multiplies the mood's key light
  'ambientScale', // multiplies the mood's fill
  'rain',
  'snow',
  'haze',
  'hazeSize',
  'wind', // lateral push on precipitation, and streak slant
  'roadRoughness',
  'groundTintStrength',
  'lightning', // 0 or 1: whether flashes happen at all
];

export const CLIMATE_PROFILES = {
  // The baseline. Long sight lines, dry road, nothing in the air.
  clear: {
    label: 'clear',
    veilColor: 0xc8dcea,
    veilStrength: 0.0,
    fogDensityBase: 0.0055,
    lightDamp: 1.0,
    ambientScale: 1.0,
    precipColor: 0xffffff,
    rain: 0,
    snow: 0,
    hazeColor: 0xfff0c0,
    haze: 0.05,
    hazeSize: 1.6,
    wind: 0.1,
    roadRoughness: 1.0,
    groundTint: 0xffffff,
    groundTintStrength: 0,
    lightning: 0,
  },

  // Visibility collapses. The most claustrophobic of the five.
  mist: {
    label: 'mist',
    veilColor: 0xb9c2c8,
    veilStrength: 0.55,
    fogDensityBase: 0.026,
    lightDamp: 0.3,
    ambientScale: 1.25,
    precipColor: 0xd8e0e6,
    rain: 0,
    snow: 0,
    hazeColor: 0xd2dade,
    haze: 0.6,
    hazeSize: 2.6,
    wind: 0.05,
    roadRoughness: 0.62,
    groundTint: 0xb9c2c8,
    groundTintStrength: 0.35,
    lightning: 0,
  },

  // Steady rain, wet road, mid visibility.
  rain: {
    label: 'rain',
    veilColor: 0x9aa6b0,
    veilStrength: 0.38,
    fogDensityBase: 0.0135,
    lightDamp: 0.4,
    ambientScale: 1.05,
    precipColor: 0xc3ccd6,
    rain: 0.62,
    snow: 0,
    hazeColor: 0xaab6c0,
    haze: 0.28,
    hazeSize: 2.2,
    wind: 0.28,
    roadRoughness: 0.34,
    groundTint: 0x8a9298,
    groundTintStrength: 0.18,
    lightning: 0,
  },

  // Hard rain thrown sideways, near-black sky, lightning.
  storm: {
    label: 'storm',
    veilColor: 0x4a525c,
    veilStrength: 0.6,
    fogDensityBase: 0.019,
    lightDamp: 0.18,
    ambientScale: 0.75,
    precipColor: 0xb4c0cc,
    rain: 1.0,
    snow: 0,
    hazeColor: 0x7d868f,
    haze: 0.45,
    hazeSize: 2.4,
    wind: 0.95,
    roadRoughness: 0.26,
    groundTint: 0x5c646c,
    groundTintStrength: 0.3,
    lightning: 1,
  },

  // Slow, quiet, and it turns every terrain white.
  snow: {
    label: 'snow',
    veilColor: 0xdfe6ec,
    veilStrength: 0.5,
    fogDensityBase: 0.016,
    lightDamp: 0.5,
    ambientScale: 1.35,
    precipColor: 0xffffff,
    rain: 0,
    snow: 0.85,
    hazeColor: 0xe8eef2,
    haze: 0.4,
    hazeSize: 2.4,
    wind: 0.4,
    roadRoughness: 0.72,
    groundTint: 0xeef3f7,
    groundTintStrength: 0.82,
    lightning: 0,
  },
};

export const CLIMATE_ORDER = ['clear', 'rain', 'mist', 'snow', 'storm'];
