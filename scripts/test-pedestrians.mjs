import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { Pedestrians } = await server.ssrLoadModule('/src/open/peds.js');
  const edge = { geom: [[0, 0], [0, -100]], len: 100, to: 1, cls: 5 };
  const world = {
    surfaceAt: () => ({ y: 0.3, road: { width: 12, cls: 5, flags: 0 } }),
    terrainHeight: () => 0.3, isWater: () => false, buildingsNear: () => [],
  };
  const peds = new Pedestrians(new THREE.Scene(), { world, graph: { x: [0,0], adj: [[],[]], nearest: () => null }, count: 1 });
  Object.assign(peds.people[0], { active: true, edge, d: 20, speed: 1.3, side: 1, offset: 1, dodge: 0, phase: 0, shirt: 0, skin: 0, carry: true, height: 1, trousers: 0 });
  peds.update(0, 0, { x: 40, z: -20 });
  const body = new THREE.Matrix4(), leg = new THREE.Matrix4(), later = new THREE.Matrix4();
  peds.bodies.getMatrixAt(0, body);
  assert.ok(Math.abs(body.elements[12] - 7) < 1e-6, 'sidewalk position must follow actual road width');
  assert.ok(Math.abs(body.elements[13] - 0.52) < 1e-6, 'feet must stand on pavement');
  assert.equal(peds.legs.count, 2);
  assert.equal(peds.loads.count, 1);
  peds.legs.getMatrixAt(0, leg);
  peds.update(0, 0.2, { x: 40, z: -20 });
  peds.legs.getMatrixAt(0, later);
  assert.notDeepEqual(leg.elements.slice(0, 12), later.elements.slice(0, 12), 'walking must articulate legs, not just bob the body');
  world.buildingsNear = () => [{ ring: [[6,-30],[8,-30],[8,-10],[6,-10]] }];
  peds.update(0, 0.2, { x: 40, z: -20 });
  assert.ok(peds.meshes.every(mesh => mesh.count === 0), 'blocked pedestrians must disappear in the same frame');
  peds.people[0].active = true; world.buildingsNear = () => []; world.isWater = () => true;
  peds.update(0, 0.2, { x: 40, z: -20 });
  assert.equal(peds.bodies.count, 0, 'pedestrians must not walk on water');
  console.log('Pedestrian checks passed: articulated gait, road width, pavement height, building/water rejection and instance counts.');
} finally { await server.close(); }
