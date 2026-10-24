// Frontal texture bake from the approved full-body reference. Geometry, UVs,
// skeleton and animations are preserved. Feathered mask affects only the face.
import {NodeIO,getBounds} from '@gltf-transform/core';
import sharp from 'sharp';
const [modelPath,referencePath,output]=process.argv.slice(2);
if(!output||modelPath===output)throw new Error('Distinct model/output required');
const io=new NodeIO(),doc=await io.read(modelPath),prim=doc.getRoot().listMeshes()[0].listPrimitives()[0];
const tex=prim.getMaterial().getBaseColorTexture();
const source=await sharp(referencePath).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const atlas=await sharp(tex.getImage()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const {width:sw,height:sh}=source.info,{width:aw,height:ah}=atlas.info;
let left=sw,right=0,top=sh,bottom=0;
for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const at=(y*sw+x)*4,r=source.data[at],g=source.data[at+1],b=source.data[at+2];if(Math.min(r,g,b)<205&&source.data[at+3]>200){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
const bounds=getBounds(doc.getRoot().listScenes()[0]),height=bounds.max[1]-bounds.min[1],scale=(bottom-top)/height;
const center=(bounds.max[0]+bounds.min[0])/2,px=(left+right)/2;
const positions=prim.getAttribute('POSITION').getArray(),uv=prim.getAttribute('TEXCOORD_0').getArray(),normal=prim.getAttribute('NORMAL')?.getArray(),indices=prim.getIndices().getArray();
let changed=0;const painted=new Uint8Array(aw*ah);
function bary(x,y,a,b,c){const denom=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(denom)<1e-6)return null;const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denom,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denom;return [u,v,1-u-v];}
for(let i=0;i<indices.length;i+=3){
 const ids=Array.from(indices.subarray(i,i+3)),ys=ids.map(v=>(positions[v*3+1]-bounds.min[1])/height);
 if(Math.max(...ys)<.805||Math.min(...ys)>.97)continue;
 const ps=ids.map(v=>[uv[v*2]*aw,uv[v*2+1]*ah]);
 const minX=Math.max(0,Math.floor(Math.min(...ps.map(p=>p[0])))),maxX=Math.min(aw-1,Math.ceil(Math.max(...ps.map(p=>p[0]))));
 const minY=Math.max(0,Math.floor(Math.min(...ps.map(p=>p[1])))),maxY=Math.min(ah-1,Math.ceil(Math.max(...ps.map(p=>p[1]))));
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
  const b=bary(x+.5,y+.5,...ps);if(!b||b.some(v=>v<-.001))continue;
  const pos=[0,1,2].map(k=>ids.reduce((s,v,j)=>s+positions[v*3+k]*b[j],0));
  const nx=(pos[0]-center)/height,ny=(pos[1]-bounds.min[1])/height;
  const front=normal?ids.reduce((s,v,j)=>s+normal[v*3+2]*b[j],0):-.8;
  // TRELLIS face normals point +Z. Exclude back-of-head and cheek-edge hair.
  const radius=Math.hypot(nx/.066,(ny-.887)/.073),mask=Math.max(0,Math.min(1,(1-radius)/.2))*(pos[2]>-.025&&front>-.4?1:0);
  if(mask<=0)continue;
  const sx=Math.max(0,Math.min(sw-1,Math.round(px+(pos[0]-center)*scale*.85))),sy=Math.max(0,Math.min(sh-1,Math.round(bottom-(pos[1]-bounds.min[1])*scale+52)));
  const src=(sy*sw+sx)*4,dst=(y*aw+x)*4;
  if(Math.min(...source.data.subarray(src,src+3))>235)continue;
  for(let k=0;k<3;k++)atlas.data[dst+k]=Math.round(atlas.data[dst+k]*(1-mask)+source.data[src+k]*mask);painted[y*aw+x]=1;changed++;
 }
}
// Extend into UV gutters to prevent dark seams from trilinear sampling.
for(let pass=0;pass<3;pass++){const additions=[];for(let y=1;y<ah-1;y++)for(let x=1;x<aw-1;x++){const at=y*aw+x;if(painted[at])continue;const from=[at-1,at+1,at-aw,at+aw].find(n=>painted[n]);if(from!==undefined)additions.push([at,from]);}for(const [to,from] of additions){for(let k=0;k<4;k++)atlas.data[to*4+k]=atlas.data[from*4+k];painted[to]=1;}}
tex.setImage(await sharp(atlas.data,{raw:atlas.info}).png().toBuffer()).setMimeType('image/png');
await io.write(output,doc);console.log(JSON.stringify({output,changed,referenceBounds:{left,right,top,bottom},meshBounds:bounds}));
