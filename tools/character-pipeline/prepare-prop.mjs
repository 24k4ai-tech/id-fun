import {NodeIO} from '@gltf-transform/core';
import {weld,simplify,prune,textureCompress} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
const [input,output,target='150000',error='0.002']=process.argv.slice(2);if(!output||input===output||!Number.isFinite(Number(target))||Number(target)<1000||!Number.isFinite(Number(error))||Number(error)<=0||Number(error)>.05)throw new Error('Distinct input/output and valid simplification settings required');
const io=new NodeIO(),doc=await io.read(input);
const total=doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0);
await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:Math.min(1,Number(target)/total),error:Number(error)}),prune(),textureCompress({encoder:sharp,targetFormat:'jpeg',resize:[2048,2048],quality:94}));
await io.write(output,doc);console.log(JSON.stringify({output,triangles:doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0)}));
