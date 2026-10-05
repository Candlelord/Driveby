import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { furnitureSites } = await server.ssrLoadModule('/src/open/streetFurniture.js');
  const road = { cls: 3, flags: 0, width: 10, pts: [[0, 100, 0], [390, 100, 0]] };
  const world = { inLagos: () => true, groundAt: () => 1, terrainHeight: () => 0.3 };
  const chunk = { ox: 0, oz: 0, roads: [road], index: { buildingsNear: () => [], roadsNear: () => [] } };
  const sites = furnitureSites(world, chunk);
  assert.ok(sites.length > 0);
  for (const site of sites) {
    assert.ok(Math.abs(site.z - 100) > road.width / 2 + 1, 'furniture must leave the roadway clear');
    const toRoad = 100 - site.z;
    assert.ok(Math.cos(site.yaw) * toRoad > 0, 'open side of the shelter must face the road');
  }
  assert.deepEqual(furnitureSites(world, chunk), sites, 'streaming must preserve placement');
  assert.equal(furnitureSites({ ...world, groundAt: () => 0 }, chunk).length, 0, 'no furniture in the lagoon');
  assert.equal(furnitureSites(world, { ...chunk, roads: [{ ...road, flags: 1 }] }).length, 0, 'no shelters on bridge decks');
  assert.equal(furnitureSites(world, { ...chunk, index: { ...chunk.index, buildingsNear: () => [{ box: [-100, -100, 500, 500] }] } }).length, 0, 'building footprints must stay clear');
  const dense = furnitureSites(world, { ...chunk, roads: Array(50).fill(road) });
  assert.ok(dense.length <= 10 && dense.filter((s) => s.shelter).length <= 3);
  console.log('Pavement placement checks passed: roadway clearance, facing, deterministic rebuild, water/building/bridge exclusions and budgets.');
} finally { await server.close(); }
