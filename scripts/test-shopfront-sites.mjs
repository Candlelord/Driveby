import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
try {
  const {indexChunk}=await server.ssrLoadModule('/src/open/world.js');
  const {shopfrontRoad}=await server.ssrLoadModule('/src/open/shopfrontSite.js');
  const road={cls:5,flags:0,width:6,pts:[[0,18,0],[80,18,0]]};
  const index=indexChunk([road],[]);
  assert.equal(index.roadsNear(40,30).length,0,'fixture must cross an index-cell boundary');
  assert.ok(shopfrontRoad(index,40,30,0,-1),'shopfront query must find a street in the adjacent cell');
  assert.equal(shopfrontRoad(index,40,30,0,1),null,'back-facing wall must not receive shops');
  assert.equal(shopfrontRoad(index,40,22,0,-1),null,'awnings must not project into the roadway');
  assert.equal(shopfrontRoad(index,40,50,0,-1),null,'distant buildings must not become street shops');
  road.flags=1;
  assert.equal(shopfrontRoad(index,40,30,0,-1),null,'shops must not face elevated bridge decks');
  console.log('Shopfront site checks passed: adjacent cells, road-facing walls, awning clearance, setback and bridges.');
} finally {await server.close();}
