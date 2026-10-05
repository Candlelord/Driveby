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
    price: 2400,
    paints: [0xa3201a, 0xe9e6dc, 0x1f4d8f, 0x20252b, 0xd9d1bf],
  },
};

export const DEFAULT_CAR = 'carrera';
