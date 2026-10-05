import { readFile, readdir } from 'node:fs/promises';
const x=(3.3647-3.39)*111320*Math.cos(6.455*Math.PI/180), z=-(6.4757-6.455)*110540;
const found=[];
for(let cx=Math.floor(x/400)-1;cx<=Math.floor(x/400)+1;cx++) for(let cz=Math.floor(z/400)-1;cz<=Math.floor(z/400)+1;cz++) {
 let data;try {data=JSON.parse(await readFile(`public/world/c/${cx}_${cz}.json`,'utf8'));} catch {continue;}
 for(const [height,kind,...flat] of data.b) {
  const ring=Array.from({length:flat.length/2},(_,i)=>[flat[i*2]/10+cx*400,flat[i*2+1]/10+cz*400]);
  const minX=Math.min(...ring.map(p=>p[0])),maxX=Math.max(...ring.map(p=>p[0]));
  const minZ=Math.min(...ring.map(p=>p[1])),maxZ=Math.max(...ring.map(p=>p[1]));
  if(x>=minX-70&&x<=maxX+70&&z>=minZ-70&&z<=maxZ+70)found.push({chunk:`${cx}_${cz}`,height:height/10,kind,width:maxX-minX,depth:maxZ-minZ,centreOffset:[(minX+maxX)/2-x,(minZ+maxZ)/2-z]});
 }
}
console.log(JSON.stringify(found,null,2));
for(const file of (await readdir('osm-cache')).filter(f=>f.startsWith('buildings_'))) {
 const data=JSON.parse(await readFile('osm-cache/'+file,'utf8'));
 for(const element of data.elements||[]) if(/national.*theat|theat.*national/i.test(element.tags?.name||'')) {
  const points=element.geometry||[];
  const bounds=points.length ? {minLat:Math.min(...points.map(p=>p.lat)),maxLat:Math.max(...points.map(p=>p.lat)),minLon:Math.min(...points.map(p=>p.lon)),maxLon:Math.max(...points.map(p=>p.lon))} : null;
  console.log('Source theatre',JSON.stringify({id:element.id,type:element.type,tags:element.tags,bounds}));
 }
}
