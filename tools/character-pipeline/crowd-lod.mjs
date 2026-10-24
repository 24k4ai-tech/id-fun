// Derive smaller animated gameplay meshes; never overwrite accepted close-up assets.
import {NodeIO} from '@gltf-transform/core';
import {EXTMeshoptCompression} from '@gltf-transform/extensions';
import {weld,simplify,prune,compactPrimitive} from '@gltf-transform/functions';
import {MeshoptSimplifier,MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
await Promise.all([MeshoptSimplifier.ready,MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const report=[];
for(const id of ['cz','heyi','jensen','vitalik','musk','afeng','maker','trader']){
 const input=resolve('public/models/'+id+'-v2.glb'),output=resolve('public/models/'+id+'-v2-lod.glb');
 const doc=await io.read(input),root=doc.getRoot();
 const count=()=>root.listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((s,p)=>s+p.getAttribute('POSITION').getCount(),0),0);
 const before=count(),animations=root.listAnimations().map(a=>a.getName());
 await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.3,error:.0015}),prune({keepLeaves:true}));
 // UV seams in generated meshes stall conservative simplification. Preserve
 // normal, UV and skin attributes explicitly when deriving the distant LOD.
 const triangles=root.listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0);
 for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){
  const pos=p.getAttribute('POSITION').getArray(),normal=p.getAttribute('NORMAL').getArray(),uv=p.getAttribute('TEXCOORD_0').getArray(),weights=p.getAttribute('WEIGHTS_0').getArray(),joints=p.getAttribute('JOINTS_0').getArray();
  const attributes=new Float32Array(pos.length/3*13);
  for(let i=0;i<pos.length/3;i++)attributes.set([normal[i*3],normal[i*3+1],normal[i*3+2],uv[i*2],uv[i*2+1],...weights.slice(i*4,i*4+4),...joints.slice(i*4,i*4+4)],i*13);
  const target=Math.max(3000,Math.floor(p.getIndices().getCount()*Math.min(1,45000/triangles)/3)*3);
  const [indices]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(p.getIndices().getArray()),pos,3,attributes,13,[.5,.5,.5,6,6,2,2,2,2,.2,.2,.2,.2],null,target,.006,['Permissive']);
  p.getIndices().setArray(indices);compactPrimitive(p);
 }
 await doc.transform(prune({keepLeaves:true}));
 for(const socket of ['weapon_hand_r','weapon_hand_l'])if(!root.listNodes().some(n=>n.getName()===socket))throw new Error('Lost '+socket);
 if(root.listAnimations().length!==animations.length)throw new Error('Lost animations');
 for(const m of root.listMeshes())for(const p of m.listPrimitives()){
  const weights=p.getAttribute('WEIGHTS_0')?.getArray();if(!weights)throw new Error('Lost skin weights');
  for(let i=0;i<weights.length;i+=4){const sum=weights[i]+weights[i+1]+weights[i+2]+weights[i+3];if(Math.abs(sum-1)>.02)throw new Error('Invalid skin weights');}
 }
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
 await io.write(output,doc);const record={id,verticesBefore:before,verticesAfter:count(),bytesBefore:(await stat(input)).size,bytesAfter:(await stat(output)).size,animations:animations.length};
 report.push(record);console.log(JSON.stringify(record));
}
await writeFile('output/v14-character-lod.json',JSON.stringify(report,null,2));
