// Offline animation retarget with topology-based anatomy validation.
import { NodeIO } from '@gltf-transform/core';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getBounds } from '@gltf-transform/core';
import { mapHumanoid } from './anatomy.mjs';
import { resolve } from 'node:path';
const [id,rigPath,originalPath,lowPath,sex='male',outputDir]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(id||'')||!rigPath||!originalPath||!lowPath||!['male','female'].includes(sex))throw new Error('Usage: id rig original low [male|female]');
const root=new URL('../../',import.meta.url),bytes=await readFile(rigPath),io=new NodeIO();
const target=await io.readBinary(bytes),source=await io.read(fileURLToPath(new URL(`public/models/fighter-${sex}.glb`,root)));
const joints=target.getRoot().listSkins()[0].listJoints();
const mapping=mapHumanoid(target.getRoot().listSkins()[0]);
const sn=new Map(source.getRoot().listNodes().map(n=>[n.getName(),n]));
const tn=new Map(joints.map(n=>[n.getName(),n]));
const bounds=getBounds(target.getRoot().listScenes()[0]);
const height=bounds.max[1]-bounds.min[1],scale=1.82/height,lift=-bounds.min[1]*scale;
if(!(height>.5&&height<3))throw new Error('Unexpected model dimensions');
const restS=new Map(source.getRoot().listNodes().map(n=>[n,{q:n.getRotation(),t:n.getTranslation(),s:n.getScale(),wq:n.getWorldRotation(),wp:n.getWorldTranslation()}]));
const restT=new Map(target.getRoot().listNodes().map(n=>[n,{q:n.getRotation(),t:n.getTranslation(),s:n.getScale(),wq:n.getWorldRotation(),wp:n.getWorldTranslation()}]));
const norm=q=>{const l=Math.hypot(...q);return q.map(x=>x/l);};
const inv=q=>[-q[0],-q[1],-q[2],q[3]];
const mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const diff=(a,b)=>a.map((x,i)=>x-b[i]);
function align(a,b){a=norm(a);b=norm(b);let d=a.reduce((s,x,i)=>s+x*b[i],0);if(d<-.9999)return [1,0,0,0];return norm([a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0],1+d]);}
function slerp(a,b,t){let dot=a.reduce((s,x,i)=>s+x*b[i],0);if(dot<0){b=b.map(x=>-x);dot=-dot;}if(dot>.9995)return norm(a.map((x,i)=>x+(b[i]-x)*t));const ang=Math.acos(Math.min(1,dot)),s=Math.sin(ang);return a.map((x,i)=>(x*Math.sin((1-t)*ang)+b[i]*Math.sin(t*ang))/s);}
function reset(rest){for(const [n,r] of rest)n.setRotation(r.q).setTranslation(r.t).setScale(r.s);}
const corrections=new Map();
for(const n of joints){const s=sn.get(n.getName());if(!s)throw new Error(`Unmapped ${n.getName()}`);let child=n.listChildren()[0];if(n.getName().startsWith('hand_'))child=tn.get(`middle_01_${n.getName().slice(-1)}`);if(n.getName()==='spine_03')child=tn.get('neck_01');
  const sc=child&&sn.get(child.getName());const correction=sc?align(diff(restT.get(child).wp,restT.get(n).wp),diff(restS.get(sc).wp,restS.get(s).wp)):[0,0,0,1];
  corrections.set(n,mul(mul(inv(restS.get(s).wq),correction),restT.get(n).wq));
}
// Restore the 4K textures from the input only when the rig kept their image data
// unchanged (it may reorder vertices, but must not silently substitute a new UV atlas).
const original=await io.read(fileURLToPath(new URL('file:///'+resolve(originalPath).replaceAll('\\','/'))));
const low=await io.read(fileURLToPath(new URL('file:///'+resolve(lowPath).replaceAll('\\','/'))));
for(let i=0;i<target.getRoot().listTextures().length;i++){
  const t=target.getRoot().listTextures()[i],l=low.getRoot().listTextures()[i],o=original.getRoot().listTextures()[i];
  if(!l||!o||!Buffer.from(t.getImage()).equals(Buffer.from(l.getImage())))throw new Error('Rig changed texture encoding; verify atlas before restoring');
  t.setImage(o.getImage()).setMimeType(o.getMimeType());
}
const buffer=target.getRoot().listBuffers()[0],outputReport=[];
function accessor(name,type,array){return target.createAccessor(name).setType(type).setArray(new Float32Array(array)).setBuffer(buffer);}
function sample(channel,time){const sp=channel.getSampler(),times=sp.getInput().getArray(),values=sp.getOutput().getArray(),size=channel.getTargetPath()==='rotation'?4:3;let i=0;while(i<times.length-2&&times[i+1]<time)i++;const last=Math.min(i+1,times.length-1);const a=Array.from(values.slice(i*size,(i+1)*size)),b=Array.from(values.slice(last*size,(last+1)*size));const f=times[last]>times[i]?Math.max(0,Math.min(1,(time-times[i])/(times[last]-times[i]))):0;if(sp.getInterpolation()==='CUBICSPLINE')throw new Error('Unsupported cubic source');return channel.getTargetPath()==='rotation'?slerp(a,b,f):a.map((v,j)=>v+(b[j]-v)*f);}
const jointOrder=[];function visit(n){if(joints.includes(n))jointOrder.push(n);for(const c of n.listChildren())visit(c);}for(const n of target.getRoot().listScenes()[0].listChildren())visit(n);
for(const clip of source.getRoot().listAnimations()){
  reset(restS);reset(restT);
  const channels=clip.listChannels();const duration=Math.max(...channels.map(c=>{const a=c.getSampler().getInput().getArray();return a[a.length-1];}));
  const count=Math.ceil(duration*30)+1,times=Array.from({length:count},(_,i)=>Math.min(duration,i/30));
  const rotations=new Map(joints.map(n=>[n,[]])),hips=[];
  for(const time of times){
    for(const c of channels){const n=c.getTargetNode(),v=sample(c,time);if(c.getTargetPath()==='rotation')n.setRotation(v);else if(c.getTargetPath()==='translation')n.setTranslation(v);else if(c.getTargetPath()==='scale')n.setScale(v);}
    for(const n of jointOrder){const desired=mul(sn.get(n.getName()).getWorldRotation(),corrections.get(n));const p=n.getParentNode();let q=norm(mul(inv(p?p.getWorldRotation():[0,0,0,1]),desired));const data=rotations.get(n);if(data.length&&q.reduce((sum,v,i)=>sum+v*data[data.length-4+i],0)<0)q=q.map(v=>-v);n.setRotation(q);data.push(...q);}
    const hip=tn.get('pelvis'),rest=restT.get(hip).t;const y=sn.get('pelvis').getWorldTranslation()[1]-restS.get(sn.get('pelvis')).wp[1];hips.push(rest[0],rest[1]+y/scale,rest[2]);
  }
  const animation=target.createAnimation(clip.getName()),inputAccessor=accessor('time','SCALAR',times);
  for(const [n,data] of rotations){const sampler=target.createAnimationSampler().setInput(inputAccessor).setOutput(accessor(n.getName(),'VEC4',data)).setInterpolation('LINEAR');animation.addSampler(sampler).addChannel(target.createAnimationChannel().setTargetNode(n).setTargetPath('rotation').setSampler(sampler));}
  const sampler=target.createAnimationSampler().setInput(inputAccessor).setOutput(accessor('hips','VEC3',hips)).setInterpolation('LINEAR');animation.addSampler(sampler).addChannel(target.createAnimationChannel().setTargetNode(tn.get('pelvis')).setTargetPath('translation').setSampler(sampler));
  outputReport.push({name:clip.getName(),duration,frames:count});
}
reset(restT);
// Weapon sockets reproduce the existing animation library's hand axes while
// keeping the new mesh's A-pose skin bind matrices untouched.
for(const side of ['r','l']){
  const hand=tn.get('hand_'+side);
  const socket=target.createNode('weapon_hand_'+side).setRotation(norm(inv(corrections.get(hand)))).setScale([1/scale,1/scale,1/scale]);
  hand.addChild(socket);
}
const destination=outputDir?resolve(outputDir):fileURLToPath(new URL('output/piapi/',root));
const output=resolve(destination,`${id}-animated-v1.glb`);
await io.write(output,target);
await writeFile(resolve(destination,`${id}-animation-report.json`),JSON.stringify({id,inputSha256:createHash('sha256').update(bytes).digest('hex'),scale,lift,mapping,clips:outputReport},null,2));
console.log(JSON.stringify({output,scale,lift,joints:joints.length,clips:outputReport.length}));
