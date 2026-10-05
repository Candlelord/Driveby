import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { nationalTheatre } = await server.ssrLoadModule('/src/open/landmarks3d.js');
  const theatre = nationalTheatre();
  const batches = theatre.children.filter(m => m.isInstancedMesh);
  assert.equal(batches.length, 8, 'facade repetition must be batched');
  assert.equal(batches[0].count, 128, 'both glazing tiers must wrap the building');
  assert.equal(batches[1].count, 64);
  assert.equal(batches[3].count, 192, 'relief panels must wrap all sides');
  for (const child of theatre.children) {
    if (!child.geometry) continue;
    child.geometry.computeBoundingBox();
    assert.ok(Number.isFinite(child.geometry.boundingBox.min.y));
    for (const value of child.geometry.attributes.normal.array) assert.ok(Number.isFinite(value));
    if (child.isInstancedMesh) for (const value of child.instanceMatrix.array) assert.ok(Number.isFinite(value));
  }
  assert.ok(theatre.children.length < 20, 'landmark should not create one draw per facade detail');
  console.log('Landmark checks passed: glazing tiers, facade reliefs, batched details and finite geometry.');
} finally { await server.close(); }
