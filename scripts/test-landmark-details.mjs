import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { nationalTheatre } = await server.ssrLoadModule('/src/open/landmarks3d.js');
  const theatre = nationalTheatre();
  const { World } = await server.ssrLoadModule('/src/open/world.js');
  const { THEATRE } = await server.ssrLoadModule('/src/open/landmarkSites.js');
  const { toWorld } = await server.ssrLoadModule('/src/open/geo.js');
  const centre = toWorld(THEATRE.lat, THEATRE.lon);
  const cx=Math.floor(centre.x/400), cz=Math.floor(centre.z/400), key=`${cx}_${cz}`;
  const originalFetch=globalThis.fetch;
  try {
    const raw=JSON.parse(await readFile(`public/world/c/${key}.json`,'utf8'));
    globalThis.fetch=async()=>({ok:true,json:async()=>raw});
    const world=new World(); world.north={chunks:new Map()}; world.available.add(key);
    const chunk=await world.fetchChunk(cx,cz);
    const matched=chunk.buildings.filter(b=>b.landmark==='national-theatre');
    assert.equal(matched.length,1,'the exact baked theatre footprint must be identified');
    assert.ok(matched[0].h>=12 && chunk.index.buildingsNear(centre.x,centre.z).has(matched[0]),'landmark must retain building collision');
  } finally {globalThis.fetch=originalFetch;}
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
