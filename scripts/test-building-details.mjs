import assert from 'node:assert/strict';
import { createServer } from 'vite';
import * as THREE from 'three';

const server = await createServer({
  configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true }, appType: 'custom',
  plugins: [{ name: 'geometry-only-materials', enforce: 'pre', load(id) {
    if (id.replaceAll('\\', '/').endsWith('/src/open/materials.js')) return `
      import * as THREE from 'three';
      const buildings = new THREE.MeshStandardMaterial();
      export const NIGHT = { value: 0 };
      export function worldMaterials() { return { buildings, thatch: buildings }; }
    `;
  } }],
});
try {
  const { buildingDetailMeshes } = await server.ssrLoadModule('/src/open/buildingDetails.js');
  const { setDetail } = await server.ssrLoadModule('/src/props/detail.js');
  const { buildingMeshes } = await server.ssrLoadModule('/src/open/chunkMeshes.js');
  setDetail(1);
  const building = { kind: 0, h: 14, ring: [[0, 0], [18, 0], [18, 12], [0, 12]] };
  const road = { x0: -20, z0: -10, x1: 40, z1: -10, hw: 3 };
  const world = { terrainHeight: () => 0.3 };
  const chunk = { ox: 0, oz: 0, buildings: [building], index: { roadsNear: () => [road] } };
  const meshes = buildingDetailMeshes(world, chunk);
  assert.equal(meshes.length, 4, 'architecture must batch into four material draws');
  const matrix = new THREE.Matrix4();
  let instances = 0;
  for (const mesh of meshes) {
    instances += mesh.count;
    assert.ok(mesh.boundingSphere.radius > 0);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      assert.ok(matrix.elements.every(Number.isFinite), 'instance transforms must be finite');
      assert.ok(matrix.determinant() > 0, 'mirrored transforms would invert face culling');
      assert.ok(matrix.elements[14] < 0.2, 'details must project outside the road-facing wall');
    }
  }
  assert.ok(instances > 50 && instances <= 2200);
  const again = buildingDetailMeshes(world, chunk);
  const glass = meshes.find(mesh => mesh.name === 'facade glass');
  const lights = [...glass.geometry.attributes.aInteriorLight.array];
  assert.equal(lights.length, glass.count, 'every pane must have its own occupancy value');
  assert.ok(lights.some(value => value > 0) && lights.some(value => value === 0), 'facade must mix occupied and dark windows');
  assert.notEqual(glass.geometry, again.find(mesh => mesh.name === 'facade glass').geometry, 'instance light data must not leak between chunks');
  assert.deepEqual(lights, [...again.find(mesh => mesh.name === 'facade glass').geometry.attributes.aInteriorLight.array], 'occupancy must survive chunk rebuilds');
  for (let i = 0; i < meshes.length; i++) {
    assert.deepEqual([...again[i].instanceMatrix.array], [...meshes[i].instanceMatrix.array]);
    assert.deepEqual([...again[i].instanceColor.array], [...meshes[i].instanceColor.array]);
  }
  const distant = buildingDetailMeshes(world, { ...chunk, index: { roadsNear: () => [] } });
  assert.equal(distant.length, 0, 'off-road walls must not consume detail geometry');
  const dense = buildingDetailMeshes(world, { ...chunk, buildings: Array(100).fill(building) });
  assert.ok(dense.reduce((sum, m) => sum + m.count, 0) <= 2200, 'dense chunks must respect the geometry budget');
  const reversed = buildingDetailMeshes(world, { ...chunk, buildings: [{ ...building, ring: building.ring.slice().reverse() }] });
  assert.ok(reversed.length > 0, 'both footprint winding directions must work');
  // Validate shell shading against the triangles, including the new gable slopes.
  const shell = buildingMeshes({ ...world, inLagos: () => false }, {
    ...chunk, buildings: [{ ...building, h: 6 }],
  })[0].geometry;
  const pos = shell.attributes.position, normals = shell.attributes.normal;
  let slopes = 0;
  for (let i = 0; i < shell.index.count; i += 3) {
    const ids = [0, 1, 2].map((k) => shell.index.getX(i + k));
    const [a, b, c] = ids.map((id) => new THREE.Vector3().fromBufferAttribute(pos, id));
    const geometric = b.sub(a).cross(c.sub(a)).normalize();
    const shading = new THREE.Vector3().fromBufferAttribute(normals, ids[0]);
    assert.ok(geometric.dot(shading) > 0.99, 'shading normals must match visible face winding');
    if (shading.y > 0.1 && shading.y < 0.99) slopes++;
  }
  assert.ok(slopes >= 4, 'suitable houses must have two pitched roof slopes');
  console.log(`Building checks passed: ${instances} parts, four draws, outward transforms, deterministic rebuilds and bounded dense chunks.`);
} finally {
  await server.close();
}
