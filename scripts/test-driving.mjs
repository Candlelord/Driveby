import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { bridgeDecks } from './bridge-decks.mjs';

const way = (id, nodes, xs) => ({ id, nodes, tags: { bridge: 'yes' }, geometry: xs.map((lon) => ({ lon, lat: 0 })) });
const heights = bridgeDecks([way(1, [1, 2], [0, 100]), way(2, [3, 2], [200, 100]), way(3, [3, 4], [200, 300])], (x) => x, (z) => z);
assert.equal(heights.get(1)[1], heights.get(2)[1], 'reversed bridge way must join at the same elevation');
assert.equal(heights.get(2)[0], heights.get(3)[0]);
assert.equal(heights.get(1)[0], 0.5);
assert.equal(heights.get(3)[1], 0.5);
assert.ok(heights.get(2)[0] > 5);

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { World } = await server.ssrLoadModule('/src/open/world.js');
  const { Vehicle } = await server.ssrLoadModule('/src/open/vehicle.js');
  const { Traffic } = await server.ssrLoadModule('/src/open/traffic.js');
  const world = new World();
  world.terrainHeight = () => -2.6; world.groundAt = () => 0;
  const road = { flags: 1, cls: 2, width: 8, pts: [[380, 50, 6], [440, 50, 6]] };
  const seg = { x0: 380, z0: 50, x1: 440, z1: 50, y0: 6, y1: 6, hw: 4, road };
  // Reproduce a visible span extending out of its stored midpoint chunk.
  world.data.set('1_0', { index: { roadsNear: () => [seg], segments: [seg], buildingsNear: () => [] } });
  assert.equal(world.surfaceAt(390, 50, 6).y, 6, 'bridge must support the car across a chunk seam');
  assert.equal(world.surfaceAt(410, 50, -2.6).surface, 'water', 'a car below a flyover must not teleport on top');
  const vehicle = new Vehicle(world); vehicle.place(382, 50, Math.PI / 2);
  for (let i = 0; i < 100; i++) vehicle.update(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: false });
  assert.ok(vehicle.x > 392 && vehicle.y === 6 && vehicle.grounded, 'crossing must not drop to the lagoon');
  vehicle.x = 400; vehicle.z = 54; vehicle.vz = 10; vehicle._bridgeEdge(road);
  assert.ok(vehicle.z <= 52.81 && Math.abs(vehicle.vz) < 1e-6, 'parapet must stop an outward slide');
  for (const x of [380, 440, 441]) {
    vehicle.x = x; vehicle.z = 54; vehicle.vz = 10;
    vehicle._bridgeEdge(road);
    assert.ok(vehicle.z <= 52.81 && vehicle.x === x, 'endpoint rails must stop lateral falls without blocking forward exits');
  }
  const rampWorld = {
    surfaceAt: (x) => ({ y: 6 - x * 0.1, road, surface: 'asphalt' }),
    terrainHeight: () => -2.6, buildingsNear: () => [],
  };
  const rampCar = new Vehicle(rampWorld); rampCar.place(0, 50, Math.PI / 2);
  rampCar.vx = 30;
  for (let i = 0; i < 60; i++) {
    rampCar.update(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: false });
    assert.ok(rampCar.grounded && Math.abs(rampCar.y - rampWorld.surfaceAt(rampCar.x).y) < 1e-8, 'descending bridge must retain tyre contact');
  }
  vehicle.grounded = false; vehicle.pitch = 1; vehicle.place(400, 50);
  assert.ok(vehicle.grounded && vehicle.pitch === 0, 'recovery must reset the falling pose');

  const traffic = Object.create(Traffic.prototype);
  const edge = { from: 0, to: 1, len: 1000, cls: 5, oneway: false, geom: [[0, 0], [0, -1000]] };
  traffic.graph = { x: [0, 0], z: [0, -1000], adj: [[edge], [edge]], nearest: () => 0 };
  traffic.world = { surfaceAt: () => ({ y: 6, road: { width: 5 } }) };
  traffic.count = 1; traffic.kinds = [{ spec: { id: 'sedan', weight: 1 }, meshes: [] }];
  const car = { active: true, kind: 'sedan', edge, d: 100, speed: 5, hit: 0, spin: 0, spinYaw: Math.PI / 2, paint: 0 };
  traffic.cars = [car];
  const player = { x: 200, z: -100, yaw: 0 };
  for (let i = 0; i < 180; i++) traffic.update(1 / 60, player);
  assert.ok(Math.abs(car.pose.yaw) < 0.002, 'traffic must realign after a crash instead of driving sideways');
  assert.ok(Math.abs(car.pose.x) <= 1.3, 'traffic must fit the actual road width');
  car.spinYaw = 2; traffic._spawn(car, 0, 0, 0);
  assert.equal(car.spinYaw, 0, 'respawn must remove the crash rotation');
  car.hit = 3; car.spin = 1.4; car.spinYaw = Math.PI / 2;
  traffic.update(1 / 60, player);
  assert.ok(Math.abs(car.pose.yaw) <= 0.3, 'moving traffic must face the road during the crash cooldown');
  console.log('Driving checks passed: continuous reversed bridge ways, chunk crossing, underpass separation, parapets, recovery and traffic realignment.');
} finally { await server.close(); }
