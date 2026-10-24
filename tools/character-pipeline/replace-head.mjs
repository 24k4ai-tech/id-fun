// Compose a separately generated high-detail bust with an accepted body rig.
// Only vertices above the neck seam are replaced; gameplay bounds stay fixed.
import {NodeIO,getBounds} from '@gltf-transform/core';
import {weld,simplify,prune,copyToDocument,unpartition,compactPrimitive,textureCompress} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
const [bodyPath,headPath,output,id]=process.argv.slice(2);if(!output||bodyPath===output)throw new Error('Distinct output required');
const io=new NodeIO(),body=await io.read(bodyPath),head=await io.read(headPath);
const node=body.getRoot().listNodes().find(n=>n.getMesh()&&n.getSkin()),mesh=node.getMesh(),skin=node.getSkin();
const headJoint=skin.listJoints().findIndex(n=>n.getName()==='Head'),neckJoint=skin.listJoints().findIndex(n=>n.getName()==='neck_01');
if(headJoint<0||neckJoint<0||mesh.listPrimitives().length!==1)throw new Error('Expected validated single body rig');
const bounds=getBounds(body.getRoot().listScenes()[0]),bodyTop=bounds.max[1],cut=id==='cz'?.325:.325,scale=id==='cz'?.29:.30;
const bp=mesh.listPrimitives()[0],p=bp.getAttribute('POSITION').getArray(),bi=bp.getIndices().getArray(),retained=[];
const oldHead=[];for(let i=0;i<p.length;i+=3)if(p[i+1]>cut)oldHead.push([p[i],p[i+1],p[i+2]]);
const mid=(points,axis)=>{let min=Infinity,max=-Infinity;for(const v of points){min=Math.min(min,v[axis]);max=Math.max(max,v[axis]);}return (min+max)/2;};
const oldCenterZ=mid(oldHead,2);
// Overlap the concealed collar band instead of discarding both sides of a seam.
for(let i=0;i<bi.length;i+=3)if([bi[i],bi[i+1],bi[i+2]].some(v=>p[v*3+1]<=cut+.012))retained.push(bi[i],bi[i+1],bi[i+2]);
bp.getIndices().setArray(new Uint32Array(retained));compactPrimitive(bp);
const hm=head.getRoot().listMeshes()[0],before=hm.listPrimitives().reduce((sum,p)=>sum+p.getIndices().getCount()/3,0);
await head.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:Math.min(1,95000/before),error:.001}),prune());
const hb=getBounds(head.getRoot().listScenes()[0]),ty=bodyTop-hb.max[1]*scale,headCut=(cut-ty)/scale;
const hp=hm.listPrimitives()[0],positions=hp.getAttribute('POSITION').getArray(),indices=hp.getIndices().getArray(),upper=[];
for(let i=0;i<positions.length;i+=3)if(positions[i+1]>headCut)upper.push([positions[i],positions[i+1],positions[i+2]]);
const centerZ=mid(upper,2),tz=oldCenterZ-centerZ*scale;
const centerX=mid(upper,0);
const bodyHeadX=skin.listJoints()[headJoint].getWorldTranslation()[0];
const kept=[];for(let i=0;i<indices.length;i+=3)if([indices[i],indices[i+1],indices[i+2]].some(v=>positions[v*3+1]>=headCut-.12))kept.push(indices[i],indices[i+1],indices[i+2]);
hp.getIndices().setArray(new Uint32Array(kept));
const weights=new Float32Array(positions.length/3*4),joints=new Uint16Array(weights.length);
for(let i=0;i<positions.length;i+=3){positions[i]=(positions[i]-centerX)*scale+bodyHeadX;positions[i+1]=positions[i+1]*scale+ty;positions[i+2]=positions[i+2]*scale+tz;
 const a=i/3*4,blend=Math.max(0,Math.min(1,(positions[i+1]-cut)/.018));joints[a]=headJoint;joints[a+1]=neckJoint;weights[a]=.5+blend*.5;weights[a+1]=1-weights[a];}
const buffer=head.getRoot().listBuffers()[0];hp.setAttribute('JOINTS_0',head.createAccessor().setType('VEC4').setArray(joints).setBuffer(buffer));hp.setAttribute('WEIGHTS_0',head.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer));compactPrimitive(hp);
await head.transform(textureCompress({encoder:sharp,targetFormat:'jpeg',resize:[2048,2048],quality:96}));
const copied=copyToDocument(body,head,[hp]);mesh.addPrimitive(copied.get(hp));
await body.transform(prune({keepLeaves:true}),unpartition());await io.write(output,body);
console.log(JSON.stringify({output,bodyTriangles:retained.length/3,headTriangles:kept.length/3,cut,scale,translation:[bodyHeadX-centerX*scale,ty,tz]}));
