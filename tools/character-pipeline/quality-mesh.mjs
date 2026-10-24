// Transfer the accepted rig onto a seam-preserving render mesh. The service's
// 80k rig limit must not force destructive UV collapses on the displayed model.
import { NodeIO, getBounds } from '@gltf-transform/core';
import { weld, simplify, prune, copyToDocument, unpartition, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const [originalPath,rigPath,output]=process.argv.slice(2);
if(!output||originalPath===output||rigPath===output)throw new Error('Distinct original, animated rig, output paths required');
const io=new NodeIO(),original=await io.read(originalPath),rig=await io.read(rigPath);
const rnode=rig.getRoot().listNodes().find(n=>n.getMesh()&&n.getSkin());
const omesh=original.getRoot().listMeshes()[0];
if(!rnode||original.getRoot().listMeshes().length!==1||omesh.listPrimitives().length!==1||rnode.getMesh().listPrimitives().length!==1)throw new Error('Single-mesh character required');
const bounds=getBounds(original.getRoot().listScenes()[0]),rb=getBounds(rig.getRoot().listScenes()[0]);
if(Math.abs((bounds.max[1]-bounds.min[1])-(rb.max[1]-rb.min[1]))>.05)throw new Error('Rig changed mesh scale');
const before=omesh.listPrimitives()[0].getIndices().getCount()/3;
await original.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:Math.min(1,145000/before),error:.002}),prune());
const op=omesh.listPrimitives()[0],rp=rnode.getMesh().listPrimitives()[0];
const rpArray=rp.getAttribute('POSITION').getArray(),ri=rp.getAttribute('JOINTS_0').getArray(),rw=rp.getAttribute('WEIGHTS_0').getArray();
const positions=op.getAttribute('POSITION').getArray(),count=positions.length/3;
// Balanced KD tree. Query four nearby bind-pose vertices, then normalize the
// strongest four influences. UV seams do not affect spatial skinning weights.
function tree(ids,depth=0){if(!ids.length)return null;const axis=depth%3;ids.sort((a,b)=>rpArray[a*3+axis]-rpArray[b*3+axis]);const m=ids.length>>1;return {v:ids[m],axis,left:tree(ids.slice(0,m),depth+1),right:tree(ids.slice(m+1),depth+1)};}
const kd=tree(Array.from({length:rpArray.length/3},(_,i)=>i));
function nearest(point){const found=[];function search(n){if(!n)return;const at=n.v*3,d=point.reduce((s,v,i)=>s+(v-rpArray[at+i])**2,0);if(found.length<4||d<found[found.length-1].d){found.push({v:n.v,d});found.sort((a,b)=>a.d-b.d);if(found.length>4)found.pop();}const delta=point[n.axis]-rpArray[at+n.axis];search(delta<0?n.left:n.right);if(found.length<4||delta*delta<found[found.length-1].d)search(delta<0?n.right:n.left);}search(kd);return found;}
const joints=new Uint16Array(count*4),weights=new Float32Array(count*4),distances=new Float32Array(count);let worst=0,far=0;
for(let i=0;i<count;i++){
 const found=nearest(Array.from(positions.subarray(i*3,i*3+3)));distances[i]=Math.sqrt(found[0].d);worst=Math.max(worst,distances[i]);if(found[0].d>.025**2)far++;
 const influences=new Map();const samples=found[0].d<1e-12?[found[0]]:found;
 for(const f of samples){const spatial=1/Math.max(f.d,1e-12);for(let j=0;j<4;j++){const bone=ri[f.v*4+j];influences.set(bone,(influences.get(bone)||0)+rw[f.v*4+j]*spatial);}}
 const top=[...influences].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((s,a)=>s+a[1],0);
 if(!(sum>0))throw new Error('Unweighted vertex');
 for(let j=0;j<top.length;j++){joints[i*4+j]=top[j][0];weights[i*4+j]=top[j][1]/sum;}
}
if(far/count>.02)throw new Error(`Unsafe skin transfer: ${far}/${count} vertices outside tolerance`);
const buffer=original.getRoot().listBuffers()[0];
op.setAttribute('JOINTS_0',original.createAccessor().setType('VEC4').setArray(joints).setBuffer(buffer));
op.setAttribute('WEIGHTS_0',original.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer));
// Generation occasionally leaves detached specks far outside the body. They
// were already absent in the rig input; don't bind these to unrelated limbs.
const indices=op.getIndices().getArray(),kept=[];
for(let i=0;i<indices.length;i+=3)if([indices[i],indices[i+1],indices[i+2]].every(v=>distances[v]<=.035))kept.push(indices[i],indices[i+1],indices[i+2]);
const removedTriangles=(indices.length-kept.length)/3;
op.getIndices().setArray(new Uint32Array(kept));compactPrimitive(op);
const map=copyToDocument(rig,original,[omesh]);rnode.setMesh(map.get(omesh));
await rig.transform(prune({keepLeaves:true}),unpartition());await io.write(output,rig);
console.log(JSON.stringify({output,triangles:op.getIndices().getCount()/3,vertices:count,worstDistance:worst,farVertices:far,removedTriangles}));
