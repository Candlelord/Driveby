/**
 * The cars you can drive. Each entry says how to read a model: which way it
 * faces as authored, which nodes are the wheels, and which materials are the
 * paint and the lamps. The game's car faces -Z.
 *
 * `price` and `unlock` belong to the garage (src/garage.js); the first car is
 * always owned.
 */
export const CAR_MODELS = {
  carrera: {
    id: 'carrera',
    name: 'Harmattan GT',
    blurb: 'Rear-engined flat-six coupé from the 1970s. Light, loose at the back, and happiest sideways.',
    spec: ['2.7 L flat-six', '210 hp', '1,050 kg', 'RWD'],
    model: 'rally-car',
    yaw: Math.PI / 2, // authored with its nose toward +X
    wheels: /^node_brakes/,
    paint: /^CARRERA_4096$/,
    head: /^CARRERA_4096_HEADLIGHTS$/,
    tail: /^CARRERA_4096_lamps$/,
    stats: { grip: 0.96, speed: 1.0, tank: 1.0 },
    price: 0,
    paints: [0xc8221b, 0xe9e6dc, 0x1f4d8f, 0xe3a21a, 0x2c6b3a, 0x20252b],
  },
  concept: {
    id: 'concept',
    name: 'Sahel Concept',
    blurb: 'A modern concept coupé. Grippy and quick on tarmac, a handful on gravel.',
    spec: ['Electric', '380 hp', '1,420 kg', 'AWD'],
    model: 'car-concept',
    yaw: Math.PI,
    wheels: ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'],
    paint: /^Paint 1/i,
    accent: /^Paint 2/i,
    head: /^Headlight/i,
    tail: /^(Brakelight|Signallight)/i,
    stats: { grip: 1.16, speed: 1.12, tank: 1.15 },
    price: 4200,
    paints: [0xa3201a, 0xe9e6dc, 0x1f4d8f, 0x20252b, 0xd9d1bf],
  },
  cicada: {
    id: 'cicada',
    name: 'Cicada',
    blurb: 'A tiny retro runabout. Not fast, but it turns on a coin and sips fuel.',
    spec: ['0.9 L four', '48 hp', '620 kg', 'RWD'],
    model: 'car-cicada',
    yaw: -Math.PI / 2,
    wheels: /^(left|right)_(front|rear)_wheel$/,
    paint: /^CICADA_PAINT$/,
    head: /^CICADA_LAMPS$/,
    tail: [],
    stats: { grip: 1.06, speed: 0.9, tank: 1.35 },
    price: 1200,
    paints: [0xd8261c, 0xf2c21b, 0x2f7cd8, 0x37a84a, 0xf5f2e8, 0xff3d8b],
  },
  sedan: {
    id: 'sedan',
    name: 'Kestrel Saloon',
    blurb: 'A big, comfortable four-door. Quick in a straight line, a boat in the bends.',
    spec: ['3.0 L six', '190 hp', '1,520 kg', 'RWD'],
    model: 'car-sedan',
    yaw: Math.PI / 2,
    wheels: /^node_(FL|FR|RL|RR)_WHEEL_/,
    paint: /^SEDAN$/,
    head: [],
    tail: /^SEDAN_GLASS_LAMPS$/,
    stats: { grip: 0.92, speed: 1.08, tank: 1.2 },
    price: 2000,
    paints: [0xe9e6dc, 0x20252b, 0x1f4d8f, 0x7a1b1b, 0x5d6b73, 0xd9d1bf],
  },
  ambulance: {
    id: 'ambulance',
    name: 'Rapid Response',
    blurb: 'A box van with a siren and no business going this fast. It has weight, though.',
    spec: ['2.5 L diesel', '140 hp', '2,300 kg', 'RWD'],
    model: 'car-ambulance',
    yaw: Math.PI / 2,
    wheels: /^wheel_(fl|fr|rl|rr)_/,
    paint: /^Paint$/,
    head: /^Lamps$/,
    tail: [],
    stats: { grip: 0.84, speed: 1.1, tank: 1.6 },
    price: 3200,
    paints: [0xf2c21b, 0xf5f2e8, 0xd8261c, 0x2f7cd8],
  },
};

CAR_MODELS.retroGT = {
  id: 'retroGT', name: 'Atlantic GT',
  blurb: 'A classic grand tourer with a long bonnet and relaxed rear-wheel-drive handling.',
  spec: ['Classic GT', '240 hp', '1,300 kg', 'RWD'],
  model: 'car-retro-gt', yaw: Math.PI, length: 4.6,
  wheels: [], paint: /^Body$/, head: /^Headlights$/, tail: /^BrakeLights$/,
  stats: { grip: 1.02, speed: 1.14, tank: 1.1 }, price: 2800,
  paints: [0x215b70, 0xc8221b, 0xe9e6dc, 0x20252b, 0xe3a21a],
};
CAR_MODELS.retroCompact = {
  id: 'retroCompact', name: 'Palm Compact',
  blurb: 'A compact vintage saloon, light on fuel and easy to place through the city.',
  spec: ['Classic compact', '75 hp', '850 kg', 'RWD'],
  model: 'car-retro-compact', yaw: Math.PI / 2, length: 3.9,
  wheels: [], paint: /^Material\.001$/, head: /^Headlights$/, tail: [],
  stats: { grip: 1.08, speed: 0.94, tank: 1.3 }, price: 1500,
  paints: [0x69a3a8, 0xe9e6dc, 0xc8221b, 0x214a78, 0xe3a21a],
};
CAR_MODELS.carreraRace = {
  ...CAR_MODELS.carrera, id: 'carreraRace', name: 'Harmattan GT Rally',
  blurb: 'The GT with a rally tune: sharper grip, more pace and a smaller fuel reserve.',
  spec: ['Race tune', '280 hp', '980 kg', 'RWD'],
  stats: { grip: 1.14, speed: 1.2, tank: 0.9 }, price: 5000,
};
CAR_MODELS.conceptRace = {
  ...CAR_MODELS.concept, id: 'conceptRace', name: 'Sahel Circuit',
  blurb: 'A circuit tune of the Concept with a higher top speed and high tarmac grip.',
  spec: ['Race tune', '480 hp', '1,360 kg', 'AWD'],
  stats: { grip: 1.3, speed: 1.3, tank: 0.85 }, price: 6500,
};

export const DEFAULT_CAR = 'carrera';
