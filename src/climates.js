// Climate — the air you are driving through.
//
// A terrain set names the climate it wants, so the mood's "shared" weather
// (Sad is rainy, Chill is misty, Happy is clear, Hip-Hop is dry but wet-roaded)
// falls out of its pool rather than being stated twice. Extreme weather is not
// here — that is the event layer, which overrides on top (see events.js).
//
// Falling particles are one parameterised system rather than several: `drift`
// covers snow and ash, which differ only in colour, fall speed and how much
// they sway.

export const CLIMATE_COLOR_KEYS = [
  'veilColor', // sky and fog get pulled toward this
  'precipColor',
  'driftColor',
  'hazeColor',
  'groundTint',
];

export const CLIMATE_NUMBER_KEYS = [
  'fogDensityBase',
  'veilStrength',
  'lightDamp', // multiplies the mood's key light
  'ambientScale', // multiplies the mood's fill
  'rain',
  'drift', // snow, ash — anything that falls slowly
  'driftSize',
  'driftFall',
  'driftSway',
  'haze',
  'hazeSize',
  'wind', // lateral push, and how far the rain leans
  'roadRoughness', // low = wet and reflective
  'groundTintStrength',
];

const BASE = {
  veilColor: 0xc8dcea,
  veilStrength: 0,
  fogDensityBase: 0.0055,
  lightDamp: 1,
  ambientScale: 1,
  precipColor: 0xffffff,
  rain: 0,
  driftColor: 0xffffff,
  drift: 0,
  driftSize: 0.55,
  driftFall: 5.5,
  driftSway: 1,
  hazeColor: 0xfff0c0,
  haze: 0.05,
  hazeSize: 1.6,
  wind: 0.1,
  roadRoughness: 1,
  groundTint: 0xffffff,
  groundTintStrength: 0,
};

const climate = (values) => ({ ...BASE, ...values });

export const CLIMATE_PROFILES = {
  clear: climate({ label: 'clear' }),

  // Dry, but the road holds a sheen — the hip-hop look without rain.
  clearNight: climate({
    label: 'clear',
    fogDensityBase: 0.0085,
    roadRoughness: 0.62,
    haze: 0.18,
    hazeSize: 1.2,
  }),

  wetNight: climate({
    label: 'wet',
    fogDensityBase: 0.0094,
    roadRoughness: 0.3,
    haze: 0.3,
    hazeSize: 1.4,
    hazeColor: 0xff8ad4,
    groundTint: 0x2a2c3a,
    groundTintStrength: 0.15,
  }),

  // Visibility collapses. The most claustrophobic climate.
  mist: climate({
    label: 'mist',
    veilColor: 0xb9c2c8,
    veilStrength: 0.55,
    fogDensityBase: 0.024,
    lightDamp: 0.3,
    ambientScale: 1.25,
    hazeColor: 0xd2dade,
    haze: 0.6,
    hazeSize: 2.6,
    wind: 0.05,
    roadRoughness: 0.62,
    groundTint: 0xb9c2c8,
    groundTintStrength: 0.35,
  }),

  rain: climate({
    label: 'rain',
    veilColor: 0x9aa6b0,
    veilStrength: 0.38,
    fogDensityBase: 0.0135,
    lightDamp: 0.4,
    ambientScale: 1.05,
    precipColor: 0xc3ccd6,
    rain: 0.62,
    hazeColor: 0xaab6c0,
    haze: 0.28,
    hazeSize: 2.2,
    wind: 0.28,
    roadRoughness: 0.34,
    groundTint: 0x8a9298,
    groundTintStrength: 0.18,
  }),

  // Burned-forest air: grey-orange flakes falling slower than snow, barely
  // swaying, with the sky pushed warm.
  ash: climate({
    label: 'ash',
    veilColor: 0xa08068,
    veilStrength: 0.35,
    fogDensityBase: 0.0155,
    lightDamp: 0.45,
    ambientScale: 1.1,
    driftColor: 0xd8b89a,
    drift: 0.55,
    driftSize: 0.42,
    driftFall: 3.4,
    driftSway: 0.45,
    hazeColor: 0xc0a084,
    haze: 0.4,
    hazeSize: 2.8,
    wind: 0.2,
    roadRoughness: 0.9,
    groundTint: 0x8a7460,
    groundTintStrength: 0.22,
  }),

  snow: climate({
    label: 'snow',
    veilColor: 0xdfe6ec,
    veilStrength: 0.5,
    fogDensityBase: 0.016,
    lightDamp: 0.5,
    ambientScale: 1.35,
    driftColor: 0xffffff,
    drift: 0.85,
    driftSize: 0.55,
    driftFall: 5.5,
    driftSway: 1,
    hazeColor: 0xe8eef2,
    haze: 0.4,
    hazeSize: 2.4,
    wind: 0.4,
    roadRoughness: 0.72,
    groundTint: 0xeef3f7,
    groundTintStrength: 0.82,
  }),

  // Autumn: gold leaves, drifting far more sideways than they fall.
  leaffall: climate({
    label: 'leaf fall',
    veilColor: 0xd0a468,
    veilStrength: 0.2,
    fogDensityBase: 0.0105,
    lightDamp: 0.75,
    ambientScale: 1.05,
    driftColor: 0xd8913c,
    drift: 0.6,
    driftSize: 0.5,
    driftFall: 4.2,
    driftSway: 2.4,
    hazeColor: 0xd8b884,
    haze: 0.16,
    hazeSize: 1.8,
    wind: 0.45,
    roadRoughness: 0.86,
    groundTint: 0xb08a52,
    groundTintStrength: 0.15,
  }),

  // Blossom: the same system, slowed right down and paled out.
  petals: climate({
    label: 'petals',
    veilColor: 0xf0d0dc,
    veilStrength: 0.22,
    fogDensityBase: 0.0082,
    lightDamp: 0.9,
    ambientScale: 1.1,
    driftColor: 0xffd8e4,
    drift: 0.7,
    driftSize: 0.4,
    driftFall: 2.4,
    driftSway: 3.0,
    hazeColor: 0xffe0ea,
    haze: 0.2,
    hazeSize: 2.0,
    wind: 0.3,
    roadRoughness: 0.95,
    groundTint: 0xf0d4dc,
    groundTintStrength: 0.12,
  }),

  // Hard cold and no precipitation. What sells it is the road: black ice is
  // the most reflective surface in the game.
  frozen: climate({
    label: 'frozen',
    veilColor: 0xc4d4e0,
    veilStrength: 0.3,
    fogDensityBase: 0.011,
    lightDamp: 0.65,
    ambientScale: 1.25,
    hazeColor: 0xd8e6f0,
    haze: 0.22,
    hazeSize: 2.0,
    wind: 0.35,
    roadRoughness: 0.16,
    groundTint: 0xdfeaf2,
    groundTintStrength: 0.7,
  }),

  // Only ever reached through the storm event.
  storm: climate({
    label: 'storm',
    veilColor: 0x4a525c,
    veilStrength: 0.6,
    fogDensityBase: 0.019,
    lightDamp: 0.18,
    ambientScale: 0.75,
    precipColor: 0xb4c0cc,
    rain: 1,
    hazeColor: 0x7d868f,
    haze: 0.45,
    hazeSize: 2.4,
    wind: 0.95,
    roadRoughness: 0.26,
    groundTint: 0x5c646c,
    groundTintStrength: 0.3,
  }),
};

export const CLIMATE_NAMES = Object.keys(CLIMATE_PROFILES);
