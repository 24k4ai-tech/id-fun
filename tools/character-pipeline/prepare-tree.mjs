import {NodeIO} from '@gltf-transform/core';import {weld,simplify,prune,textureCompress} from '@gltf-transform/functions';import {MeshoptSimplifier} from 'meshoptimizer';import sharp from 'sharp';
const io=new NodeIO(),doc=await io.read('output/piapi/jacaranda-source.glb');const primitives=doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives());
for(const p of primitives){const count=p.getIndices().getCount()/3;console.log(p.getMaterial().getName(),count);}
await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.025,error:.02}),prune(),textureCompress({encoder:sharp,targetFormat:'jpeg',resize:[1024,1024],quality:90}));
await io.write('public/models/jacaranda-tree-v1.glb',doc);console.log('optimized',doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((s,p)=>s+p.getIndices().getCount()/3,0));
