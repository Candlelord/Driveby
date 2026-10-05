import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { streetGlowMeshes } = await server.ssrLoadModule('/src/open/streetGlow.js');
  const { NIGHT } = await server.ssrLoadModule('/src/open/materials.js');
  const queries = [];
  const world = { surfaceAt(x, z) { queries.push([x,z]); return x > 410 ? { surface: 'water' } : { y: 0.47, surface: 'asphalt', road: { flags: 0 } }; } };
  const [pool, halo] = streetGlowMeshes([[0,0.3,0,Math.PI/2],[20,0.3,0,0]], world, 400, 800);
  assert.equal(pool.count, 1, 'water-side lamp must not project a pool on the lagoon');
  assert.equal(halo.count, 2);
  assert.deepEqual(queries, [[402,800],[420,802]], 'lamp arm offset must be queried in world coordinates');
  const matrix = new THREE.Matrix4(); pool.getMatrixAt(0, matrix);
  assert.ok(matrix.elements[13] > 0.47, 'light pool must clear the road surface');
  for (const mesh of [pool, halo]) {
    assert.equal(mesh.material.uniforms.uNight, NIGHT, 'glow must share the dawn/dusk uniform');
    assert.equal(mesh.material.depthWrite, false);
    assert.equal(mesh.material.blending, THREE.AdditiveBlending);
    mesh.geometry.dispose(); mesh.material.dispose();
  }
  assert.deepEqual(streetGlowMeshes([], world, 0, 0), []);
  console.log('Street glow checks passed: lamp placement, night uniform, water rejection and transparent rendering state.');
} finally { await server.close(); }
