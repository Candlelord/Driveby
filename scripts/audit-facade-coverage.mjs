import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'vite';
const server = await createServer({ configFile:false, optimizeDeps:{ noDiscovery:true, include:[] }, server:{ middlewareMode:true }, appType:'custom' });
try {
  const { indexChunk } = await server.ssrLoadModule('/src/open/world.js');
  const { buildingDetailMeshes } = await server.ssrLoadModule('/src/open/buildingDetails.js');
  const { setDetail } = await server.ssrLoadModule('/src/props/detail.js'); setDetail(1);
  const files = (await readdir('public/world/c')).filter(f=>f.endsWith('.json')).sort();
  const sample = files.filter((_,i)=>i%20===0);
  const results = [{ chunks:0, parts:0 }, { chunks:0, parts:0 }];
  for (const file of sample) {
    const [cx,cz] = file.replace('.json','').split('_').map(Number), ox=cx*400, oz=cz*400;
    const data = JSON.parse(await readFile('public/world/c/'+file,'utf8'));
    const roads=data.r.map(([cls,width,flags,...flat])=>({cls,width:width/10,flags,pts:Array.from({length:flat.length/3},(_,i)=>[flat[i*3]/10+ox,flat[i*3+1]/10+oz,flat[i*3+2]/10])}));
    const buildings=data.b.map(([h,kind,...flat])=>({h:h/10,kind,ring:Array.from({length:flat.length/2},(_,i)=>[flat[i*2]/10+ox,flat[i*2+1]/10+oz])}));
    const index=indexChunk(roads,buildings), query=index.roadsNear;
    for(let pass=0;pass<2;pass++) {
      index.roadsNear=pass===0 ? (x,z)=>query(x,z) : query;
      const meshes=buildingDetailMeshes({terrainHeight:()=>0.3},{ox,oz,buildings,index});
      if(meshes.length)results[pass].chunks++;
      for(const mesh of meshes) { results[pass].parts+=mesh.count; if(!mesh.geometry.userData.shared)mesh.geometry.dispose(); mesh.dispose(); }
    }
  }
  console.log(JSON.stringify({sampleChunks:sample.length,oldGridQuery:results[0],radiusQuery:results[1]}));
} finally {await server.close();}
